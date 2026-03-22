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
  const res = await fetch(url, { method: "POST", body: formData, credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new Error(String(data?.detail || data?.error || "요청 처리 중 오류가 발생했습니다."));
  }
  return data;
}

async function getJson(url) {
  const res = await fetch(url, { credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String(data?.detail || res.statusText || "데이터를 불러오지 못했습니다."));
  }
  return data;
}

function setButtonBusy(button, busy, busyText, idleHtml) {
  if (!button) return;
  button.disabled = busy;
  button.innerHTML = busy ? busyText : idleHtml;
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
    try {
      const j = await getJson(`/api/upload-jobs/${jobId}`);
      if (j.status === "queued") setJobProgress("queued", "대기 중", 20);
      if (j.status === "converting") setJobProgress("converting", "AI 변환 중...", 65);
      if (j.status === "completed") {
        const link = j.download_link ? `<a href="${j.download_link}" target="_blank">${j.converted_file}</a>` : j.converted_file;
        setJobProgress("completed", `완료: TC ${j.testcase_count}, executable ${j.executable_count}, unresolved ${j.unresolved} | ${link}`, 100);
        clearInterval(t);
        refreshPreview();
        refreshTodos();
        refreshRuleSuggestions();
      }
      if (j.status === "failed") {
        setJobProgress("failed", `실패: ${j.error}`, 100);
        clearInterval(t);
      }
    } catch (error) {
      setJobProgress("warning", `상태 확인 재시도 중: ${esc(error?.message || "네트워크 오류")}`, 75);
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
    const data = await getJson("/api/converted/unresolved?limit=120");
    document.getElementById("todoMeta").innerText = data.source ? `${data.source} | total TODO: ${data.total}` : "변환 파일 없음";
    document.getElementById("todoTable").innerHTML = renderTodos(data.rows || []);
  } catch (error) {
    document.getElementById("todoMeta").innerText = error?.message || "변환 파일을 불러오지 못했습니다.";
    document.getElementById("todoTable").innerHTML = `<tr><td colspan=\"5\">미해결 TODO를 불러오지 못했습니다.</td></tr>`;
  }
}

async function refreshRuleSuggestions() {
  try {
    const data = await getJson("/api/rules/suggest?top_n=30");
    document.getElementById("ruleSuggestTable").innerHTML = renderRuleSuggestions(data.rules || []);
  } catch (error) {
    document.getElementById("ruleSuggestTable").innerHTML = `<tr><td colspan=\"4\">${esc(error?.message || "제안을 불러오지 못했습니다.")}</td></tr>`;
  }
}

async function refreshPreview() {
  try {
    const data = await getJson("/api/excel/latest-preview?limit=300");
    document.getElementById("previewMeta").innerText = data.source
      ? `${data.source} | rows: ${data.total_rows}`
      : "로드된 엑셀 없음";
    document.getElementById("excelTable").innerHTML = renderTable(data.headers || [], data.rows || []);
  } catch (error) {
    document.getElementById("previewMeta").innerText = error?.message || "로드된 엑셀 없음";
    document.getElementById("excelTable").innerHTML = `<tbody><tr><td>미리보기를 불러오지 못했습니다.</td></tr></tbody>`;
  }
}

document.getElementById("uploadForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const idleHtml = submitBtn?.innerHTML || "업로드";
  setButtonBusy(submitBtn, true, "업로드 중...", idleHtml);
  try {
    const result = await postForm("/api/upload-testcases", new FormData(e.target));
    pollJob(result.job_id);
  } catch (error) {
    setJobProgress("failed", esc(error?.message || "업로드에 실패했습니다."), 100);
  } finally {
    setButtonBusy(submitBtn, false, "업로드 중...", idleHtml);
  }
});

document.getElementById("loadDefaultBtn").addEventListener("click", async () => {
  const btn = document.getElementById("loadDefaultBtn");
  const idleHtml = btn?.innerHTML || "기본 엑셀 로드";
  setButtonBusy(btn, true, "로딩 중...", idleHtml);
  try {
    const result = await postForm("/api/load-default-testcases", new FormData());
    setJobProgress("loaded", `${result.file} 로드됨`, 100);
    refreshPreview();
    refreshTodos();
    refreshRuleSuggestions();
  } catch (error) {
    setJobProgress("failed", esc(error?.message || "기본 엑셀 로드에 실패했습니다."), 100);
  } finally {
    setButtonBusy(btn, false, "로딩 중...", idleHtml);
  }
});

document.getElementById("convertDefaultBtn").addEventListener("click", async () => {
  const btn = document.getElementById("convertDefaultBtn");
  const idleHtml = btn?.innerHTML || "기본 엑셀 AI 변환";
  setButtonBusy(btn, true, "변환 중...", idleHtml);
  try {
    const result = await postForm("/api/convert-default-excel", new FormData());
    setJobProgress("converted", `rows ${result.rows}, executable ${result.executable_count}`, 100);
    refreshPreview();
    refreshTodos();
    refreshRuleSuggestions();
  } catch (error) {
    setJobProgress("failed", esc(error?.message || "기본 엑셀 변환에 실패했습니다."), 100);
  } finally {
    setButtonBusy(btn, false, "변환 중...", idleHtml);
  }
});

document.getElementById("suggestRuleBtn").addEventListener("click", async () => {
  refreshRuleSuggestions();
});

refreshPreview();
refreshTodos();
refreshRuleSuggestions();
