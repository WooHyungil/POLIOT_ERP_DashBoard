from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Dict, List, Tuple

import pandas as pd

from .excel_parser import parse_control_sheet_rows


def _norm_text(value) -> str:
    text = "" if value is None else str(value)
    text = text.strip().lower().replace("_", " ")
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


def _split_sentences(text: str) -> List[str]:
    raw = str(text or "")
    parts = re.split(r"\n+|\r+|\t+|(?<=\.)\s+|(?<=\))\s+", raw)
    return [p.strip() for p in parts if p and p.strip()]


def _load_rules(rule_path: Path) -> List[dict]:
    if not rule_path.exists():
        return []
    try:
        content = json.loads(rule_path.read_text(encoding="utf-8"))
        if isinstance(content, list):
            return content
        return []
    except Exception:
        return []


def _extract_wait_seconds(sentence: str) -> int:
    m = re.search(r"(\d+)\s*초", sentence)
    if m:
        return int(m.group(1))
    return 2


def _infer_step(sentence: str, expected: str, rules: List[dict]) -> Dict[str, str]:
    text = _norm_text(sentence)

    for rule in rules:
        key = _norm_text(rule.get("contains", ""))
        if key and key in text:
            return {
                "action": rule.get("action", "note"),
                "target": rule.get("target", ""),
                "value": rule.get("value", ""),
                "locator": rule.get("locator", "accessibility id"),
            }

    if any(k in text for k in ["대기", "wait", "로딩", "지연"]):
        return {
            "action": "wait",
            "target": "",
            "value": str(_extract_wait_seconds(sentence)),
            "locator": "none",
        }

    if any(k in text for k in ["클릭", "탭", "선택", "누르"]):
        return {
            "action": "click",
            "target": "TODO_TARGET",
            "value": "",
            "locator": "accessibility id",
        }

    if any(k in text for k in ["입력", "기입", "검색어", "작성"]):
        return {
            "action": "input",
            "target": "TODO_TARGET",
            "value": expected[:120] if expected else "",
            "locator": "accessibility id",
        }

    return {
        "action": "note",
        "target": sentence[:180],
        "value": expected[:180] if expected else "",
        "locator": "none",
    }


def _split_control_procedure(text: str) -> List[str]:
    raw = str(text or "")
    # Keep numbered instructions and line breaks as separate candidates.
    parts = re.split(r"\n+|\r+|(?=\d+\.)|(?=\d+\))|[-•]\s+", raw)
    result = []
    for p in parts:
        t = p.strip()
        if not t:
            continue
        t = re.sub(r"^\d+[\.)]\s*", "", t)
        if t:
            result.append(t)
    return result


def _infer_control_step(sentence: str, expected: str, rules: List[dict]) -> Dict[str, str]:
    # Reuse basic rule engine first.
    step = _infer_step(sentence, expected, rules)
    text = _norm_text(sentence)

    # When app is already opened on Control tab, navigation-like sentences are treated as short waits.
    if any(k in text for k in ["실행", "진입", "이동", "접속", "탭 진입", "화면 진입"]) and step["action"] == "note":
        return {
            "action": "wait",
            "target": "",
            "value": "1",
            "locator": "none",
        }

    if any(k in text for k in ["확인", "검증", "체크", "표시", "노출"]):
        return {
            "action": "assert_contains",
            "target": "PAGE_SOURCE",
            "value": expected[:180] if expected else sentence[:120],
            "locator": "none",
        }

    return step


def convert_control_excel_to_structured(source_excel: str, output_excel: str, rule_file: str) -> Tuple[int, int, int, int]:
    source = Path(source_excel)
    out = Path(output_excel)
    rules = _load_rules(Path(rule_file))

    rows = []
    unresolved = 0
    note_count = 0
    executable_count = 0

    for item in parse_control_sheet_rows(str(source)):
        tc = item["tc_id"] if item["tc_id"] else f"ROW_{item['excel_row']}"
        procedure = item["procedure"]
        expected = item["expected"]

        # If procedure is blank, still keep a note row for traceability.
        segments = _split_control_procedure(procedure) if procedure else ["(procedure_empty)"]
        step_no = 0
        for seg in segments:
            step_no += 1
            step = _infer_control_step(seg, expected, rules)
            action = step["action"]

            if action in ("click", "input", "wait", "assert_contains"):
                executable_count += 1
            if action == "note":
                note_count += 1
            if (step["target"] or "").startswith("TODO_"):
                unresolved += 1

            rows.append(
                {
                    "testcase_id": tc,
                    "step_no": step_no,
                    "action": action,
                    "target": step["target"],
                    "value": step["value"],
                    "platform": "both",
                    "locator": step["locator"],
                    "timeout_sec": 15,
                    "retry_count": 2,
                    "source_sheet": "Control",
                    "source_row": item["excel_row"],
                    "category": item["category"],
                    "major": item["major"],
                    "middle": item["middle"],
                    "minor": item["minor"],
                    "app_condition": item["app_condition"],
                    "vehicle_condition": item["vehicle_condition"],
                    "expected_result": expected,
                }
            )

    out.parent.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame(rows)
    df.to_excel(out, index=False)
    return len(df), unresolved, note_count, executable_count


def convert_matrix_excel_to_structured(source_excel: str, output_excel: str, rule_file: str) -> Tuple[int, int, int]:
    source = Path(source_excel)
    out = Path(output_excel)
    rules = _load_rules(Path(rule_file))

    rows = []
    unresolved = 0
    note_count = 0

    xls = pd.ExcelFile(source)
    for sheet in xls.sheet_names:
        raw = pd.read_excel(source, sheet_name=sheet, header=None)
        header_idx, header_row = _find_matrix_header(raw)
        if header_idx is None:
            continue

        tc_col = _find_column_index(header_row, ["tc id", "tc_id"])
        proc_col = _find_column_index(header_row, ["tc procedure", "procedure"])
        expected_col = _find_column_index(header_row, ["expected result", "expected"])
        app_col = _find_column_index(header_row, ["app", "platform", "os"])
        if tc_col < 0 or proc_col < 0:
            continue

        step_no_by_tc: Dict[str, int] = {}

        for r in range(header_idx + 1, len(raw)):
            row = raw.iloc[r].tolist()
            tc = "" if tc_col >= len(row) else str(row[tc_col]).strip()
            if not tc or tc.lower() == "nan":
                continue
            if not re.match(r"^tc[_-]", tc.lower()):
                continue

            proc = "" if proc_col >= len(row) or pd.isna(row[proc_col]) else str(row[proc_col])
            exp = "" if expected_col < 0 or expected_col >= len(row) or pd.isna(row[expected_col]) else str(row[expected_col])

            platform = "both"
            if app_col >= 0 and app_col < len(row) and not pd.isna(row[app_col]):
                app_text = str(row[app_col]).lower()
                if "android" in app_text and "ios" not in app_text:
                    platform = "android"
                elif "ios" in app_text and "android" not in app_text:
                    platform = "ios"

            for sent in _split_sentences(proc):
                step = _infer_step(sent, exp, rules)
                step_no_by_tc[tc] = step_no_by_tc.get(tc, 0) + 1
                if step["target"] == "TODO_TARGET":
                    unresolved += 1
                if step["action"] == "note":
                    note_count += 1

                rows.append(
                    {
                        "testcase_id": tc,
                        "step_no": step_no_by_tc[tc],
                        "action": step["action"],
                        "target": step["target"],
                        "value": step["value"],
                        "platform": platform,
                        "locator": step["locator"],
                        "timeout_sec": 15,
                        "retry_count": 2,
                        "source_sheet": sheet,
                    }
                )

    out.parent.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame(rows)
    df.to_excel(out, index=False)
    return len(df), unresolved, note_count
