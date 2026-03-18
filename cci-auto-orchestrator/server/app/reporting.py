from __future__ import annotations

from pathlib import Path
from typing import Dict

from .models import Run, Task


def build_run_report(run: Run, tasks: Dict[str, Task], output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    report_file = output_dir / f"run_{run.run_id}.html"

    rows = []
    for task_id in run.task_ids:
        task = tasks[task_id]
        screenshot_html = "-"
        if task.screenshot_path:
            screenshot_html = f'<a href="{task.screenshot_path}" target="_blank">screenshot</a>'

        rows.append(
            "<tr>"
            f"<td>{task.task_id}</td>"
            f"<td>{task.device_id}</td>"
            f"<td>{task.testcase_id}</td>"
            f"<td>{task.iteration}</td>"
            f"<td>{task.status}</td>"
            f"<td>{task.issue or '-'}</td>"
            f"<td>{screenshot_html}</td>"
            "</tr>"
        )

    html = f"""<!doctype html>
<html lang=\"ko\">
<head>
  <meta charset=\"UTF-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />
  <title>Run Report {run.run_id}</title>
  <style>
    body {{ font-family: Segoe UI, Arial, sans-serif; margin: 20px; }}
    table {{ width: 100%; border-collapse: collapse; }}
    th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; }}
    th {{ background: #f7f7f7; }}
    .ok {{ color: #0a7d3b; font-weight: 600; }}
    .bad {{ color: #b42318; font-weight: 600; }}
  </style>
</head>
<body>
  <h1>CCI Run Report</h1>
  <p><b>Run ID:</b> {run.run_id}</p>
  <p><b>Status:</b> {run.status}</p>
  <p><b>Repeat:</b> {run.repeat_count}</p>
  <table>
    <thead>
      <tr>
        <th>Task ID</th><th>Device</th><th>TC</th><th>Iteration</th><th>Status</th><th>Issue</th><th>Screenshot</th>
      </tr>
    </thead>
    <tbody>
      {''.join(rows)}
    </tbody>
  </table>
</body>
</html>"""

    report_file.write_text(html, encoding="utf-8")
    return report_file
