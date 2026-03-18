from __future__ import annotations

import argparse
import hashlib
from pathlib import Path
import time
from typing import Dict, Any

import requests
from appium import webdriver
from appium.options.android import UiAutomator2Options
from appium.options.ios import XCUITestOptions


class UnableToReadExecutionError(Exception):
    pass


def build_driver(platform: str, appium_url: str, udid: str, device_name: str):
    if platform == "android":
        opts = UiAutomator2Options()
        opts.set_capability("platformName", "Android")
        opts.set_capability("automationName", "UiAutomator2")
        opts.set_capability("udid", udid)
        opts.set_capability("deviceName", device_name)
        opts.set_capability("noReset", True)
        opts.set_capability("dontStopAppOnReset", True)
        opts.set_capability("autoLaunch", False)
    else:
        opts = XCUITestOptions()
        opts.set_capability("platformName", "iOS")
        opts.set_capability("automationName", "XCUITest")
        opts.set_capability("udid", udid)
        opts.set_capability("deviceName", device_name)
        opts.set_capability("noReset", True)
        opts.set_capability("autoLaunch", False)
    return webdriver.Remote(appium_url, options=opts)


def _normalize_locator(locator: str) -> str:
    value = (locator or "accessibility id").strip().lower()
    mapping = {
        "accessibility id": "accessibility id",
        "accessibility_id": "accessibility id",
        "id": "id",
        "xpath": "xpath",
        "class": "class name",
        "class name": "class name",
        "none": "none",
    }
    return mapping.get(value, "accessibility id")


def _find_element_with_retry(driver, locator: str, target: str, timeout_sec: int, retry_count: int):
    if locator == "none":
        return None

    last_error = None
    for _ in range(max(1, retry_count)):
        end = time.time() + max(1, timeout_sec)
        while time.time() < end:
            try:
                return driver.find_element(locator, target)
            except Exception as e:
                last_error = e
                time.sleep(0.5)
    raise UnableToReadExecutionError(f"Element not found by {locator}: {target}")


def execute_step(driver, step: Dict[str, Any]) -> bool:
    action = step["action"].lower().strip()
    target = (step.get("target") or "").strip()
    value = step.get("value", "")
    locator = _normalize_locator(step.get("locator", "accessibility id"))
    timeout_sec = int(step.get("timeout_sec", 15) or 15)
    retry_count = int(step.get("retry_count", 1) or 1)

    if action == "click":
        el = _find_element_with_retry(driver, locator, target, timeout_sec, retry_count)
        el.click()
        return True
    elif action == "input":
        el = _find_element_with_retry(driver, locator, target, timeout_sec, retry_count)
        el.clear()
        el.send_keys(value)
        return True
    elif action == "wait":
        wait_sec = int(value or "1")
        time.sleep(wait_sec)
        return False
    elif action == "assert_contains":
        if not str(value or "").strip():
            # Empty expected text is not a meaningful validation.
            raise UnableToReadExecutionError("assert_failed expected_text_empty")
        if locator == "none" or target in ("", "PAGE_SOURCE", "TODO_ASSERT_TARGET"):
            source = (driver.page_source or "")
            if value and value not in source:
                raise UnableToReadExecutionError("assert_failed page_source_not_contains_expected_text")
            return True
        el = _find_element_with_retry(driver, locator, target, timeout_sec, retry_count)
        text = (el.text or "").strip()
        if value and value not in text:
            raise UnableToReadExecutionError(f"assert_failed expected_contains={value} actual={text}")
        return True
    elif action == "note":
        # Matrix-style cases can be imported as informational notes.
        return False
    else:
        raise UnableToReadExecutionError(f"Unsupported action: {action}")


def _save_failure_screenshot(driver, artifacts_root: Path, device_id: str, task_id: str) -> str:
    device_dir = artifacts_root / device_id
    device_dir.mkdir(parents=True, exist_ok=True)
    file_path = device_dir / f"{task_id}.png"
    driver.save_screenshot(str(file_path))
    return f"/artifacts/{device_id}/{task_id}.png"


def _capture_state_hash(driver) -> str:
    source = (driver.page_source or "").strip()
    normalized = "".join(source.split())
    return hashlib.sha256(normalized.encode("utf-8", errors="ignore")).hexdigest()


def _save_monitor_snapshot(driver, artifacts_root: Path, device_id: str) -> str:
    device_dir = artifacts_root / device_id
    device_dir.mkdir(parents=True, exist_ok=True)
    file_path = device_dir / "monitor_latest.png"
    driver.save_screenshot(str(file_path))
    return f"/artifacts/{device_id}/monitor_latest.png"


def main():
    parser = argparse.ArgumentParser(description="CCI device agent")
    parser.add_argument("--server", required=True)
    parser.add_argument("--device-id", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--platform", choices=["android", "ios"], required=True)
    parser.add_argument("--appium-url", required=True)
    parser.add_argument("--udid", required=True)
    parser.add_argument("--poll-interval", type=int, default=3)
    parser.add_argument("--artifacts-dir", default="server/artifacts")
    parser.add_argument("--manual-monitor", action="store_true", default=True)
    args = parser.parse_args()

    artifacts_root = Path(args.artifacts_dir).resolve()
    artifacts_root.mkdir(parents=True, exist_ok=True)

    def _register_device() -> None:
        requests.post(
            f"{args.server}/api/devices/register",
            data={
                "device_id": args.device_id,
                "name": args.name,
                "platform": args.platform,
                "appium_url": args.appium_url,
                "udid": args.udid,
            },
            timeout=15,
        )

    _register_device()

    driver = None
    driver_boot_error = ""
    try:
        driver = build_driver(args.platform, args.appium_url, args.udid, args.name)
    except Exception as e:
        driver_boot_error = f"동작 불가: Appium 세션 생성 실패 ({e})"

    try:
        heartbeat_tick = 0
        while True:
            try:
                # Re-register periodically so device reappears after server reload/restart.
                if heartbeat_tick % 10 == 0:
                    _register_device()

                res = requests.get(f"{args.server}/api/agents/{args.device_id}/next-task", timeout=20).json()
            except Exception:
                time.sleep(args.poll_interval)
                heartbeat_tick += 1
                continue

            if not res.get("has_task"):
                if args.manual_monitor and driver is not None:
                    try:
                        state_hash = _capture_state_hash(driver)
                        snapshot_path = _save_monitor_snapshot(driver, artifacts_root, args.device_id)
                        requests.post(
                            f"{args.server}/api/agents/{args.device_id}/state",
                            data={"state_hash": state_hash, "snapshot_path": snapshot_path},
                            timeout=10,
                        )
                    except Exception:
                        pass
                time.sleep(args.poll_interval)
                heartbeat_tick += 1
                continue

            task = res["task"]
            issue = ""
            status = "passed"
            screenshot_path = ""
            if driver is None:
                status = "nt"
                issue = driver_boot_error or "동작 불가: Appium 세션이 없음"
            else:
                try:
                    meaningful_action_count = 0
                    for step in task["steps"]:
                        if execute_step(driver, step):
                            meaningful_action_count += 1
                    if meaningful_action_count == 0:
                        status = "nt"
                        issue = "동작 불가: 실행 가능한 조작/검증 step이 없음"
                except UnableToReadExecutionError as e:
                    status = "nt"
                    issue = str(e)
                except Exception as e:
                    status = "nt"
                    issue = str(e)
                    try:
                        screenshot_path = _save_failure_screenshot(driver, artifacts_root, args.device_id, task["task_id"])
                    except Exception as shot_error:
                        issue = f"{issue} | screenshot_error={shot_error}"

            try:
                requests.post(
                    f"{args.server}/api/agents/{args.device_id}/task-result",
                    data={
                        "task_id": task["task_id"],
                        "status": status,
                        "issue": issue,
                        "screenshot_path": screenshot_path,
                    },
                    timeout=20,
                )
            except Exception:
                pass
            heartbeat_tick += 1
    finally:
        if driver is not None:
            driver.quit()


if __name__ == "__main__":
    main()
