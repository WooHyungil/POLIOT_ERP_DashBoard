from __future__ import annotations

import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List

from .models import Device, Run, Store, Task, TestStep
from .reporting import build_run_report


class Orchestrator:
    def __init__(self) -> None:
        self.store = Store()
        self._lock = threading.Lock()
        self._reports_dir = Path(__file__).resolve().parent.parent / "reports"

    def register_device(self, device: Device) -> Device:
        with self._lock:
            self.store.devices[device.device_id] = device
            return device

    def unregister_device(self, device_id: str) -> bool:
        with self._lock:
            if device_id not in self.store.devices:
                return False
            del self.store.devices[device_id]
            if device_id in self.store.device_states:
                del self.store.device_states[device_id]
            return True

    def rename_device(self, device_id: str, name: str) -> bool:
        with self._lock:
            target = self.store.devices.get(device_id)
            if not target:
                return False
            target.name = name.strip() or target.name
            target.last_seen = datetime.utcnow()
            return True

    def heartbeat(self, device_id: str) -> None:
        with self._lock:
            if device_id in self.store.devices:
                self.store.devices[device_id].last_seen = datetime.utcnow()

    def _heartbeat_nolock(self, device_id: str) -> None:
        if device_id in self.store.devices:
            self.store.devices[device_id].last_seen = datetime.utcnow()

    def set_testcases(self, testcases: Dict[str, List[TestStep]]) -> int:
        with self._lock:
            self.store.testcases = testcases
            return len(testcases)

    def start_compare(self, device_ids: List[str], cross_platform: bool = True) -> dict:
        with self._lock:
            ids = [d for d in device_ids if d in self.store.devices]
            if len(ids) < 2:
                raise ValueError("At least 2 connected devices are required")
            self.store.compare_config["active"] = True
            self.store.compare_config["device_ids"] = ids
            self.store.compare_config["cross_platform"] = cross_platform
            self.store.compare_config["last_diffs"] = {}
            return {
                "active": True,
                "device_ids": ids,
                "cross_platform": cross_platform,
            }

    def stop_compare(self) -> dict:
        with self._lock:
            self.store.compare_config["active"] = False
            return {
                "active": False,
                "device_ids": self.store.compare_config.get("device_ids", []),
                "cross_platform": self.store.compare_config.get("cross_platform", True),
            }

    def update_device_state(self, device_id: str, state_hash: str, snapshot_path: str = "") -> None:
        with self._lock:
            if device_id not in self.store.devices:
                return
            self._heartbeat_nolock(device_id)
            self.store.device_states[device_id] = {
                "state_hash": state_hash,
                "snapshot_path": snapshot_path,
                "time": datetime.utcnow().isoformat(timespec="seconds"),
            }
            self._evaluate_compare_nolock()

    def _evaluate_compare_nolock(self) -> None:
        cfg = self.store.compare_config
        if not cfg.get("active"):
            return
        ids: List[str] = cfg.get("device_ids", [])
        if len(ids) < 2:
            return

        live_ids = [i for i in ids if i in self.store.device_states]
        if len(live_ids) < 2:
            return

        baseline_id = sorted(live_ids)[0]
        baseline_state = self.store.device_states[baseline_id]
        baseline_hash = baseline_state.get("state_hash", "")
        if not baseline_hash:
            return

        cross_platform = bool(cfg.get("cross_platform", True))
        last_diffs: Dict[str, str] = cfg.setdefault("last_diffs", {})

        for other_id in live_ids:
            if other_id == baseline_id:
                continue
            if not cross_platform:
                if self.store.devices[other_id].platform != self.store.devices[baseline_id].platform:
                    continue

            other_state = self.store.device_states[other_id]
            other_hash = other_state.get("state_hash", "")
            if not other_hash:
                continue

            pair_key = f"{baseline_id}->{other_id}"
            diff_sig = f"{baseline_hash}|{other_hash}"
            if baseline_hash != other_hash:
                if last_diffs.get(pair_key) != diff_sig:
                    self.store.issues.append(
                        {
                            "time": datetime.utcnow().isoformat(timespec="seconds"),
                            "run_id": "MANUAL_COMPARE",
                            "task_id": "MANUAL_COMPARE",
                            "device_id": other_id,
                            "testcase_id": "MANUAL_COMPARE",
                            "issue": (
                                f"수동비교 불일치: baseline={baseline_id}({baseline_hash[:8]}) "
                                f"vs {other_id}({other_hash[:8]})"
                            ),
                            "screenshot_path": other_state.get("snapshot_path", ""),
                        }
                    )
                last_diffs[pair_key] = diff_sig

    def create_run(self, repeat_count: int, target_platforms: List[str]) -> Run:
        with self._lock:
            if not self.store.testcases:
                raise ValueError("No testcases loaded")

            run_id = str(uuid.uuid4())
            run = Run(run_id=run_id, created_at=datetime.utcnow(), repeat_count=repeat_count, status="running")

            compatible_devices = [
                d for d in self.store.devices.values() if d.platform in target_platforms
            ]
            if not compatible_devices:
                raise ValueError("No connected devices for selected platforms")

            devices_by_platform: Dict[str, List[Device]] = {"android": [], "ios": []}
            for device in compatible_devices:
                devices_by_platform[device.platform].append(device)

            platform_rr_index = {"android": 0, "ios": 0}
            for iteration in range(1, repeat_count + 1):
                for testcase_id, steps in self.store.testcases.items():
                    testcase_platform = (steps[0].platform or "both").lower()
                    candidate_platforms = ["android", "ios"] if testcase_platform == "both" else [testcase_platform]
                    for platform in candidate_platforms:
                        if platform not in target_platforms:
                            continue
                        bucket = devices_by_platform.get(platform, [])
                        if not bucket:
                            continue
                        pick = bucket[platform_rr_index[platform] % len(bucket)]
                        platform_rr_index[platform] += 1

                        task_id = str(uuid.uuid4())
                        task = Task(
                            task_id=task_id,
                            run_id=run_id,
                            device_id=pick.device_id,
                            testcase_id=testcase_id,
                            iteration=iteration,
                            steps=steps,
                        )
                        self.store.tasks[task_id] = task
                        run.task_ids.append(task_id)

            self.store.runs[run_id] = run
            return run

    def next_task_for_device(self, device_id: str) -> Task | None:
        with self._lock:
            self._heartbeat_nolock(device_id)
            for task in self.store.tasks.values():
                if task.device_id == device_id and task.status == "pending":
                    task.status = "running"
                    task.started_at = datetime.utcnow()
                    return task
            return None

    def _complete_task_nolock(self, task_id: str, status: str, issue: str | None, screenshot_path: str | None = None) -> None:
        if task_id not in self.store.tasks:
            return
        task = self.store.tasks[task_id]
        status_value = status.lower().strip()
        if status_value == "passed":
            task.status = "passed"
        elif status_value == "nt":
            task.status = "nt"
        else:
            task.status = "failed"
        task.issue = issue
        task.screenshot_path = screenshot_path

        if task.status in ("failed", "nt"):
            self.store.issues.append(
                {
                    "time": datetime.utcnow().isoformat(timespec="seconds"),
                    "run_id": task.run_id,
                    "task_id": task.task_id,
                    "device_id": task.device_id,
                    "testcase_id": task.testcase_id,
                    "issue": issue or "동작 불가",
                    "screenshot_path": screenshot_path or "",
                }
            )

        run = self.store.runs.get(task.run_id)
        if not run:
            return
        statuses = [self.store.tasks[t_id].status for t_id in run.task_ids]
        if statuses and all(s in ("passed", "failed", "nt") for s in statuses):
            run.status = "completed"
            report_file = build_run_report(run, self.store.tasks, self._reports_dir)
            run.report_path = f"/reports/{report_file.name}"

    def complete_task(self, task_id: str, status: str, issue: str | None, screenshot_path: str | None = None) -> None:
        with self._lock:
            self._complete_task_nolock(task_id, status, issue, screenshot_path)

    def close_stale_tasks(self, pending_timeout_sec: int = 0, running_timeout_sec: int = 180) -> int:
        with self._lock:
            now = datetime.utcnow()
            closed = 0
            for task in self.store.tasks.values():
                if task.status == "pending" and pending_timeout_sec > 0:
                    if (now - task.created_at).total_seconds() >= pending_timeout_sec:
                        self._complete_task_nolock(task.task_id, "nt", "동작 불가: 단말이 작업을 수신하지 못함")
                        closed += 1
                elif task.status == "running" and task.started_at is not None:
                    if (now - task.started_at).total_seconds() >= running_timeout_sec:
                        self._complete_task_nolock(task.task_id, "nt", "동작 불가: 실행 시간 초과")
                        closed += 1
            return closed

    def get_dashboard_data(self) -> dict:
        self.close_stale_tasks()
        with self._lock:
            active_run = None
            if self.store.runs:
                latest_id = sorted(self.store.runs.keys())[-1]
                active_run = self.store.runs[latest_id]

            run_summary = {
                "run_id": active_run.run_id if active_run else None,
                "status": active_run.status if active_run else "idle",
                "repeat_count": active_run.repeat_count if active_run else 0,
                "report_path": active_run.report_path if active_run else None,
                "total_tasks": len(active_run.task_ids) if active_run else 0,
                "passed": 0,
                "failed": 0,
                "nt": 0,
                "running": 0,
                "pending": 0,
            }
            progress_tasks = []
            if active_run:
                for task_id in active_run.task_ids:
                    task = self.store.tasks[task_id]
                    run_summary[task.status] += 1
                    if len(progress_tasks) < 800:
                        excel_row = 0
                        if task.steps:
                            excel_row = int(task.steps[0].source_row or 0)
                        progress_tasks.append(
                            {
                                "task_id": task.task_id,
                                "device_id": task.device_id,
                                "testcase_id": task.testcase_id,
                                "iteration": task.iteration,
                                "status": task.status,
                                "issue": task.issue or "",
                                "excel_row": excel_row,
                            }
                        )

            return {
                "devices": list(self.store.devices.values()),
                "testcase_count": len(self.store.testcases),
                "issues": list(reversed(self.store.issues[-50:])),
                "run_summary": run_summary,
                "progress_tasks": progress_tasks,
                "device_states": dict(self.store.device_states),
                "compare": {
                    "active": bool(self.store.compare_config.get("active")),
                    "device_ids": list(self.store.compare_config.get("device_ids", [])),
                    "cross_platform": bool(self.store.compare_config.get("cross_platform", True)),
                    "state_count": len(self.store.device_states),
                },
            }

    def get_testcase_preview(self, limit: int = 200) -> list[dict]:
        with self._lock:
            rows: list[dict] = []
            for testcase_id, steps in self.store.testcases.items():
                for step in steps:
                    rows.append(
                        {
                            "testcase_id": testcase_id,
                            "step_no": step.step_no,
                            "action": step.action,
                            "target": step.target,
                            "value": step.value,
                            "platform": step.platform,
                            "locator": step.locator,
                            "category": step.category,
                            "major": step.major,
                            "middle": step.middle,
                            "minor": step.minor,
                            "app_condition": step.app_condition,
                            "vehicle_condition": step.vehicle_condition,
                            "source_row": step.source_row,
                        }
                    )
                    if len(rows) >= max(1, limit):
                        return rows
            return rows

    def latest_run_result_map(self) -> dict:
        with self._lock:
            if not self.store.runs:
                return {}

            latest_id = sorted(self.store.runs.keys())[-1]
            run = self.store.runs[latest_id]

            result_map: dict = {}
            rank = {"pending": 0, "running": 1, "passed": 2, "nt": 3, "failed": 4}

            for task_id in run.task_ids:
                task = self.store.tasks[task_id]
                device = self.store.devices.get(task.device_id)
                if not device:
                    continue

                tc_key = task.testcase_id
                platform = device.platform
                entry = result_map.setdefault(tc_key, {"android": None, "ios": None})
                prev = entry.get(platform)
                current = {"status": task.status, "issue": task.issue or ""}

                if prev is None or rank[current["status"]] >= rank[prev["status"]]:
                    entry[platform] = current

            return result_map


orchestrator = Orchestrator()
