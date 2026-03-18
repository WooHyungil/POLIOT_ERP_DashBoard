from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Literal, Optional

Platform = Literal["android", "ios"]
TaskStatus = Literal["pending", "running", "passed", "failed", "nt"]
RunStatus = Literal["idle", "running", "completed"]


@dataclass
class Device:
    device_id: str
    name: str
    platform: Platform
    appium_url: str
    udid: str
    connected_at: datetime = field(default_factory=datetime.utcnow)
    last_seen: datetime = field(default_factory=datetime.utcnow)


@dataclass
class TestStep:
    testcase_id: str
    step_no: int
    action: str
    target: str
    value: str
    platform: str
    locator: str = "accessibility id"
    timeout_sec: int = 15
    retry_count: int = 1
    source_sheet: str = ""
    source_row: int = 0
    category: str = ""
    major: str = ""
    middle: str = ""
    minor: str = ""
    app_condition: str = ""
    vehicle_condition: str = ""


@dataclass
class Task:
    task_id: str
    run_id: str
    device_id: str
    testcase_id: str
    iteration: int
    steps: List[TestStep]
    status: TaskStatus = "pending"
    issue: Optional[str] = None
    screenshot_path: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None


@dataclass
class Run:
    run_id: str
    created_at: datetime
    repeat_count: int
    status: RunStatus = "idle"
    task_ids: List[str] = field(default_factory=list)
    report_path: Optional[str] = None


@dataclass
class Store:
    devices: Dict[str, Device] = field(default_factory=dict)
    testcases: Dict[str, List[TestStep]] = field(default_factory=dict)
    runs: Dict[str, Run] = field(default_factory=dict)
    tasks: Dict[str, Task] = field(default_factory=dict)
    issues: List[dict] = field(default_factory=list)
    device_states: Dict[str, dict] = field(default_factory=dict)
    compare_config: Dict[str, object] = field(
        default_factory=lambda: {
            "active": False,
            "device_ids": [],
            "cross_platform": True,
            "last_diffs": {},
        }
    )
