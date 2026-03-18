let activeJobId = "";

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function postForm(url, formData) {
  const res = await fetch(url, { method: "POST", body: formData });
  return await res.json();
}

function setJobProgress(status, msg, pct) {
  document.getElementById("jobStatus").innerText = status;
  document.getElementById("jobResult").innerHTML = msg || "";
  document.getElementById("jobBar").style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

async function pollJob(jobId) {
  activeJobId = jobId;
  setJobProgress("queued", "업로드 접수됨", 10);
  const t = setInterval(async () => {
    const j = await (await fetch(`/api/upload-jobs/${jobId}`)).json();
    if (j.status === "queued") setJobProgress("queued", "대기 중", 20);
    if (j.status === "converting") setJobProgress("converting", "AI 변환 중...", 65);
    if (j.status === "completed") {
      const link = j.download_link ? `<a href="${j.download_link}" target="_blank">${j.converted_file}</a>` : j.converted_file;
      const autoRun = j.auto_run || {};
      const autoRunText = autoRun.started
        ? ` | 자동실행 시작(run=${autoRun.run_id}, task=${autoRun.task_count})`
        : (autoRun.detail ? ` | 자동실행 대기(${autoRun.detail})` : "");
      setJobProgress("completed", `완료: TC ${j.testcase_count}, executable ${j.executable_count}, unresolved ${j.unresolved} | ${link}${autoRunText}`, 100);
      clearInterval(t);
      refreshPreview();
      refreshTodos();
      refreshRuleSuggestions();
    }
    if (j.status === "failed") {
      setJobProgress("failed", `실패: ${j.error}`, 100);
      clearInterval(t);
    }
  }, 1200);
}

function renderTable(headers, rows) {
  if (!headers.length) return "<tr><td>업로드된 엑셀 없음</td></tr>";
  const head = `<thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>`;
  const bodyRows = rows.map(r => `<tr>${headers.map(h => `<td title="${esc(r[h] || "")}">${esc(r[h] || "")}</td>`).join("")}</tr>`).join("");
  return `${head}<tbody>${bodyRows || `<tr><td colspan="${headers.length}">데이터 없음</td></tr>`}</tbody>`;
}

function renderTodos(rows) {
  if (!rows.length) return `<tr><td colspan="5">미해결 TODO 없음</td></tr>`;
  return rows.map(r => `<tr><td>${esc(r.testcase_id || "")}</td><td>${esc(r.step_no || "")}</td><td>${esc(r.action || "")}</td><td class="text-clip" title="${esc(r.target || "")}">${esc(r.target || "")}</td><td>${esc(r.source_row || "")}</td></tr>`).join("");
}

function renderRuleSuggestions(rows) {
  if (!rows.length) return `<tr><td colspan="4">제안 없음</td></tr>`;
  return rows.map(r => `<tr><td>${esc(r.todo_key || "")}</td><td>${esc(r.action || "")}</td><td class="text-clip" title="${esc(r.target || "")}">${esc(r.target || "")}</td><td>${esc(r.count || 0)}</td></tr>`).join("");
}

async function refreshTodos() {
  try {
    const data = await (await fetch("/api/converted/unresolved?limit=120")).json();
    document.getElementById("todoMeta").innerText = data.source ? `${data.source} | total TODO: ${data.total}` : "변환 파일 없음";
    document.getElementById("todoTable").innerHTML = renderTodos(data.rows || []);
  } catch {
    document.getElementById("todoMeta").innerText = "변환 파일 없음";
    document.getElementById("todoTable").innerHTML = `<tr><td colspan=\"5\">미해결 TODO 없음</td></tr>`;
  }
}

async function refreshRuleSuggestions() {
  try {
    const data = await (await fetch("/api/rules/suggest?top_n=30")).json();
    document.getElementById("ruleSuggestTable").innerHTML = renderRuleSuggestions(data.rules || []);
  } catch {
    document.getElementById("ruleSuggestTable").innerHTML = `<tr><td colspan=\"4\">제안 없음</td></tr>`;
  }
}

async function refreshPreview() {
  const data = await (await fetch("/api/excel/latest-preview?limit=300")).json();
  document.getElementById("previewMeta").innerText = data.source
    ? `${data.source} | rows: ${data.total_rows}`
    : "로드된 엑셀 없음";
  document.getElementById("excelTable").innerHTML = renderTable(data.headers || [], data.rows || []);
}

document.getElementById("uploadForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const result = await postForm("/api/upload-testcases", new FormData(e.target));
  if (result.ok) {
    pollJob(result.job_id);
  } else {
    setJobProgress("failed", JSON.stringify(result), 100);
  }
});

document.getElementById("loadDefaultBtn").addEventListener("click", async () => {
  const result = await postForm("/api/load-default-testcases", new FormData());
  setJobProgress("loaded", result.ok ? `${result.file} 로드됨` : JSON.stringify(result), 100);
  refreshPreview();
  refreshTodos();
  refreshRuleSuggestions();
});

document.getElementById("convertDefaultBtn").addEventListener("click", async () => {
  const result = await postForm("/api/convert-default-excel", new FormData());
  setJobProgress("converted", result.ok ? `rows ${result.rows}, executable ${result.executable_count}` : JSON.stringify(result), 100);
  refreshPreview();
  refreshTodos();
  refreshRuleSuggestions();
});

document.getElementById("suggestRuleBtn").addEventListener("click", async () => {
  refreshRuleSuggestions();
});

document.getElementById("runUploadedAndroidBtn").addEventListener("click", async () => {
  const fd = new FormData();
  fd.append("repeat_count", "1");
  fd.append("run_android", "true");
  fd.append("run_ios", "false");
  const result = await postForm("/api/runs/start", fd);
  if (result.ok) {
    setJobProgress("running", `실행 시작: run=${result.run_id}, task=${result.task_count}`, 100);
  } else {
    setJobProgress("failed", JSON.stringify(result), 100);
  }
});

refreshPreview();
refreshTodos();
refreshRuleSuggestions();
