from __future__ import annotations

from typing import Dict, List

from .models import TestStep


def load_builtin_testcases() -> Dict[str, List[TestStep]]:
    # These smoke cases are designed to run on an already-open app session.
    return {
        "BUILTIN_SMOKE_001": [
            TestStep(
                testcase_id="BUILTIN_SMOKE_001",
                step_no=1,
                action="wait",
                target="",
                value="1",
                platform="both",
                locator="none",
                timeout_sec=5,
                retry_count=1,
                category="Builtin",
                major="Smoke",
                middle="Session",
                minor="Stability",
                app_condition="App already opened",
                vehicle_condition="N/A",
            ),
            TestStep(
                testcase_id="BUILTIN_SMOKE_001",
                step_no=2,
                action="assert_contains",
                target="PAGE_SOURCE",
                value="",
                platform="both",
                locator="none",
                timeout_sec=5,
                retry_count=1,
                category="Builtin",
                major="Smoke",
                middle="Session",
                minor="Source Check",
                app_condition="App already opened",
                vehicle_condition="N/A",
            ),
            TestStep(
                testcase_id="BUILTIN_SMOKE_001",
                step_no=3,
                action="wait",
                target="",
                value="1",
                platform="both",
                locator="none",
                timeout_sec=5,
                retry_count=1,
                category="Builtin",
                major="Smoke",
                middle="Session",
                minor="Cooldown",
                app_condition="App already opened",
                vehicle_condition="N/A",
            ),
        ],
        "BUILTIN_SMOKE_002": [
            TestStep(
                testcase_id="BUILTIN_SMOKE_002",
                step_no=1,
                action="wait",
                target="",
                value="2",
                platform="both",
                locator="none",
                timeout_sec=5,
                retry_count=1,
                category="Builtin",
                major="Smoke",
                middle="Timing",
                minor="Simple wait",
                app_condition="App already opened",
                vehicle_condition="N/A",
            )
        ],
    }
