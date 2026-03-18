from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONFIG_DIR = ROOT / "config"
EMPLOYEES_JSON = CONFIG_DIR / "employees.json"
ASSETS_JSON = CONFIG_DIR / "assets.json"


def _load_tsv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as fp:
        reader = csv.DictReader(fp, delimiter="\t")
        return [{k.strip(): (v or "").strip() for k, v in row.items()} for row in reader]


def _write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fp:
        json.dump(data, fp, ensure_ascii=False, indent=2)


def convert_employees(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for i, row in enumerate(rows, start=1):
        name = row.get("이름", "")
        if not name:
            continue
        out.append(
            {
                "id": f"emp-{i:04d}",
                "name": name,
                "title": row.get("직급", ""),
                "birth": row.get("생년월일", ""),
                "employee_no": row.get("사번", ""),
                "account_email": row.get("계정 이메일", ""),
                "phone": row.get("연락처", ""),
                "remote_id": row.get("원격 id", row.get("원격 ID", "")),
                "remote_pw": row.get("원격 pw", row.get("원격 PW", "")),
            }
        )
    return out


def convert_assets(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for i, row in enumerate(rows, start=1):
        asset_no = row.get("관리번호", "")
        if not asset_no:
            continue
        out.append(
            {
                "id": f"asset-{i:04d}",
                "asset_no": asset_no,
                "category": row.get("분류", ""),
                "maker": row.get("제조사", ""),
                "model": row.get("모델", ""),
                "platform": row.get("플랫폼", ""),
                "os_version": row.get("OS", row.get("OS 버전", "")),
                "serial_no": row.get("시리얼", ""),
                "owner_name": row.get("담당자", ""),
                "note": row.get("비고", ""),
            }
        )
    return out


def main() -> None:
    employees_tsv = ROOT / "server" / "db" / "seed_employees.tsv"
    assets_tsv = ROOT / "server" / "db" / "seed_assets.tsv"

    if employees_tsv.exists():
        employee_rows = _load_tsv(employees_tsv)
        _write_json(EMPLOYEES_JSON, {"employees": convert_employees(employee_rows)})
        print(f"employees imported: {len(employee_rows)}")
    else:
        print(f"skip employees: missing {employees_tsv}")

    if assets_tsv.exists():
        asset_rows = _load_tsv(assets_tsv)
        _write_json(ASSETS_JSON, {"assets": convert_assets(asset_rows)})
        print(f"assets imported: {len(asset_rows)}")
    else:
        print(f"skip assets: missing {assets_tsv}")


if __name__ == "__main__":
    main()
