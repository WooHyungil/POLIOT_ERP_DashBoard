from __future__ import annotations

from collections import defaultdict
import re
from typing import Dict, List

import pandas as pd

from .models import TestStep

CONTROL_SHEET_NAME = "Control"
TC_START_ROW_1_BASED = 21
MAX_CONTROL_COLS = 23  # A~W

COLUMN_MAP = {
    "testcase_id": ["testcase_id", "tc_id", "testcase", "id", "테스트케이스"],
    "step_no": ["step_no", "step", "순번", "스텝"],
    "action": ["action", "동작", "행동"],
    "target": ["target", "locator", "대상", "요소"],
    "value": ["value", "값", "입력값"],
    "platform": ["platform", "os", "플랫폼"],
    "locator": ["locator", "by", "selector", "찾기방식"],
    "timeout_sec": ["timeout", "timeout_sec", "wait_timeout", "타임아웃"],
    "retry_count": ["retry", "retry_count", "재시도"],
    "source_sheet": ["source_sheet"],
    "source_row": ["source_row", "excel_row"],
    "category": ["category", "카테고리"],
    "major": ["major", "대분류"],
    "middle": ["middle", "중분류"],
    "minor": ["minor", "소분류"],
    "app_condition": ["app_condition", "app 동작조건"],
    "vehicle_condition": ["vehicle_condition", "차량 동작조건"],
}


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    remap = {}
    lower_cols = {str(c).strip().lower(): c for c in df.columns}
    for key, aliases in COLUMN_MAP.items():
        for alias in aliases:
            if alias in lower_cols:
                remap[lower_cols[alias]] = key
                break
    return df.rename(columns=remap)


def _to_int(value, default: int) -> int:
    try:
        if pd.isna(value):
            return default
        return int(float(str(value).strip()))
    except Exception:
        return default


def _parse_structured(df: pd.DataFrame) -> Dict[str, List[TestStep]]:
    required = ["testcase_id", "step_no", "action", "target", "value"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    if "platform" not in df.columns:
        df["platform"] = "both"
    if "locator" not in df.columns:
        df["locator"] = "accessibility id"
    if "timeout_sec" not in df.columns:
        df["timeout_sec"] = 15
    if "retry_count" not in df.columns:
        df["retry_count"] = 1

    grouped: Dict[str, List[TestStep]] = defaultdict(list)
    for _, row in df.iterrows():
        tc_id = str(row["testcase_id"]).strip()
        if not tc_id or tc_id.lower() == "nan":
            continue

        step = TestStep(
            testcase_id=tc_id,
            step_no=_to_int(row["step_no"], 1),
            action=str(row["action"]),
            target=str(row["target"]),
            value="" if pd.isna(row["value"]) else str(row["value"]),
            platform="both" if pd.isna(row["platform"]) else str(row["platform"]).lower(),
            locator="accessibility id" if pd.isna(row["locator"]) else str(row["locator"]).lower(),
            timeout_sec=_to_int(row["timeout_sec"], 15),
            retry_count=_to_int(row["retry_count"], 1),
            source_sheet="" if "source_sheet" not in df.columns or pd.isna(row["source_sheet"]) else str(row["source_sheet"]),
            source_row=0 if "source_row" not in df.columns else _to_int(row["source_row"], 0),
            category="" if "category" not in df.columns or pd.isna(row["category"]) else str(row["category"]),
            major="" if "major" not in df.columns or pd.isna(row["major"]) else str(row["major"]),
            middle="" if "middle" not in df.columns or pd.isna(row["middle"]) else str(row["middle"]),
            minor="" if "minor" not in df.columns or pd.isna(row["minor"]) else str(row["minor"]),
            app_condition="" if "app_condition" not in df.columns or pd.isna(row["app_condition"]) else str(row["app_condition"]),
            vehicle_condition="" if "vehicle_condition" not in df.columns or pd.isna(row["vehicle_condition"]) else str(row["vehicle_condition"]),
        )
        grouped[tc_id].append(step)

    for key in grouped:
        grouped[key] = sorted(grouped[key], key=lambda s: s.step_no)
    return dict(grouped)


def _norm_text(value) -> str:
    text = "" if value is None else str(value)
    text = text.strip().lower()
    text = text.replace("_", " ")
    return re.sub(r"\s+", " ", text)


def _find_matrix_header(raw: pd.DataFrame):
    for row_idx in range(min(80, len(raw))):
        row = [_norm_text(v) for v in raw.iloc[row_idx].tolist()]
        has_tc_id = any("tc id" in c or "tc_id" in c for c in row)
        has_proc = any("procedure" in c for c in row)
        if has_tc_id and has_proc:
            return row_idx, row
    return None, None


def _find_column_index(header_row: List[str], keys: List[str]) -> int:
    for idx, col in enumerate(header_row):
        if any(k in col for k in keys):
            return idx
    return -1


def _parse_matrix_style(file_path: str) -> Dict[str, List[TestStep]]:
    grouped: Dict[str, List[TestStep]] = defaultdict(list)
    xls = pd.ExcelFile(file_path)

    for sheet in xls.sheet_names:
        raw = pd.read_excel(file_path, sheet_name=sheet, header=None)
        header_idx, header_row = _find_matrix_header(raw)
        if header_idx is None:
            continue

        tc_col = _find_column_index(header_row, ["tc id", "tc_id"])
        proc_col = _find_column_index(header_row, ["tc procedure", "procedure"])
        expected_col = _find_column_index(header_row, ["expected result", "expected"])
        app_col = _find_column_index(header_row, ["app", "platform", "os"])
        if tc_col < 0 or proc_col < 0:
            continue

        for r in range(header_idx + 1, len(raw)):
            row = raw.iloc[r].tolist()
            tc_cell = "" if tc_col >= len(row) else str(row[tc_col]).strip()
            if not tc_cell or tc_cell.lower() == "nan":
                continue

            # Most rows in this format identify cases like TC_CT_0001.
            if not re.match(r"^tc[_-]", tc_cell.lower()):
                continue

            procedure = "" if proc_col >= len(row) else ("" if pd.isna(row[proc_col]) else str(row[proc_col]))
            expected = ""
            if expected_col >= 0 and expected_col < len(row) and not pd.isna(row[expected_col]):
                expected = str(row[expected_col])

            platform = "both"
            if app_col >= 0 and app_col < len(row) and not pd.isna(row[app_col]):
                app_text = str(row[app_col]).lower()
                if "android" in app_text and "ios" not in app_text:
                    platform = "android"
                elif "ios" in app_text and "android" not in app_text:
                    platform = "ios"

            grouped[tc_cell].append(
                TestStep(
                    testcase_id=tc_cell,
                    step_no=len(grouped[tc_cell]) + 1,
                    action="note",
                    target=procedure,
                    value=expected,
                    platform=platform,
                    locator="none",
                    timeout_sec=1,
                    retry_count=1,
                )
            )

    return dict(grouped)


def _safe_text(value) -> str:
    if value is None or pd.isna(value):
        return ""
    return str(value).strip()


def parse_control_sheet_rows(file_path: str) -> List[dict]:
    raw = pd.read_excel(file_path, sheet_name=CONTROL_SHEET_NAME, header=None)
    rows: List[dict] = []

    for r in range(TC_START_ROW_1_BASED - 1, len(raw)):
        row = raw.iloc[r].tolist()
        tc_id = _safe_text(row[1] if len(row) > 1 else "")  # B
        category = _safe_text(row[2] if len(row) > 2 else "")  # C
        major = _safe_text(row[3] if len(row) > 3 else "")  # D
        middle = _safe_text(row[4] if len(row) > 4 else "")  # E
        minor = _safe_text(row[5] if len(row) > 5 else "")  # F
        app_condition = _safe_text(row[9] if len(row) > 9 else "")  # J
        vehicle_condition = _safe_text(row[10] if len(row) > 10 else "")  # K
        procedure = _safe_text(row[11] if len(row) > 11 else "")  # L
        expected = _safe_text(row[12] if len(row) > 12 else "")  # M

        if not any([tc_id, category, major, middle, minor, app_condition, vehicle_condition, procedure, expected]):
            continue

        rows.append(
            {
                "excel_row": r + 1,
                "tc_id": tc_id,
                "category": category,
                "major": major,
                "middle": middle,
                "minor": minor,
                "app_condition": app_condition,
                "vehicle_condition": vehicle_condition,
                "procedure": procedure,
                "expected": expected,
            }
        )

    return rows


def parse_control_sheet_full_rows(file_path: str, limit: int = 1000) -> tuple[list[str], list[dict]]:
    raw = pd.read_excel(file_path, sheet_name=CONTROL_SHEET_NAME, header=None)

    headers = [f"COL_{chr(ord('A') + i)}" for i in range(MAX_CONTROL_COLS)]
    rows: list[dict] = []
    for r in range(TC_START_ROW_1_BASED - 1, len(raw)):
        row = raw.iloc[r].tolist()
        values = [_safe_text(row[i] if i < len(row) else "") for i in range(MAX_CONTROL_COLS)]

        if not any(values):
            continue

        item = {headers[i]: values[i] for i in range(MAX_CONTROL_COLS)}
        item["excel_row"] = r + 1
        rows.append(item)
        if len(rows) >= max(1, limit):
            break

    return headers, rows


def _parse_control_sheet(file_path: str) -> Dict[str, List[TestStep]]:
    grouped: Dict[str, List[TestStep]] = defaultdict(list)
    rows = parse_control_sheet_rows(file_path)

    for row in rows:
        tc_display = row["tc_id"]
        testcase_id = tc_display if tc_display else f"ROW_{row['excel_row']}"

        grouped[testcase_id].append(
            TestStep(
                testcase_id=testcase_id,
                step_no=len(grouped[testcase_id]) + 1,
                action="note",
                target=row["procedure"],
                value=row["expected"],
                platform="both",
                locator="none",
                timeout_sec=1,
                retry_count=1,
                source_sheet=CONTROL_SHEET_NAME,
                source_row=row["excel_row"],
                category=row["category"],
                major=row["major"],
                middle=row["middle"],
                minor=row["minor"],
                app_condition=row["app_condition"],
                vehicle_condition=row["vehicle_condition"],
            )
        )

    return dict(grouped)


def parse_excel_to_testcases(file_path: str) -> Dict[str, List[TestStep]]:
    # Mode 0: fixed Control sheet mapping requested by user.
    try:
        control = _parse_control_sheet(file_path)
        if control:
            return control
    except Exception:
        pass

    # Mode 1: structured automation format with explicit action/target/value columns.
    try:
        df = pd.read_excel(file_path)
        df = _normalize_columns(df)
        return _parse_structured(df)
    except Exception:
        pass

    # Mode 2: matrix test-case format (TC ID / TC Procedure / Expected Result).
    matrix = _parse_matrix_style(file_path)
    if matrix:
        return matrix

    raise ValueError("Unable to parse excel: supported formats are structured automation table or matrix TC sheet")
