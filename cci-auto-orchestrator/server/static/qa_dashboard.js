function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let lastMemberStats = [];
let memberSearchRows = [];
let currentRecentStatus = "Open";
let currentRecentGroups = [];
let currentRecentRegions = [];
let currentRecentStartDate = "";
let currentRecentEndDate = "";
let currentRegularReleaseData = null;
let currentClosingCycle = "";
let currentClosingDetailFilter = { cycle: "", phase: "", group: "", severity: "" };
let currentClosingTicketRows = [];
let currentClosingDetailMeta = { cycle: "", phase: "", group: "", severity: "" };
let currentClosingStatus = "";
let currentClosingGroups = [];
let qaIsAdmin = false;
const DEFAULT_FETCH_TIMEOUT_MS = 12000;

async function fetchJson(url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { credentials: "same-origin", ...options, signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(String(data?.detail || `${res.status} ${res.statusText || "request failed"}`).trim());
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("요청 시간이 초과되었습니다.");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

async function applyQaRoleGuard() {
  try {
    const data = await fetchJson("/api/auth/me");
    const role = String(data?.user?.role || "user").toLowerCase();
    const email = String(data?.user?.email || "").trim().toLowerCase();
    if (email) {
      try {
        localStorage.setItem("cci_auth_user_email", email);
      } catch {}
    }
    qaIsAdmin = role === "admin";
  } catch {
    qaIsAdmin = false;
  }

}

function normalizeStatusText(v) {
  return String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeGroupText(v) {
  return String(v || "").trim().toUpperCase();
}

function toast(msg, tone) {
  const stack = document.getElementById("toastStack");
  if (!stack) return;
  const item = document.createElement("div");
  item.className = `toast-item ${tone ? `toast-${tone}` : ""}`.trim();
  item.textContent = msg;
  stack.appendChild(item);
  setTimeout(function () {
    item.classList.add("fade");
    setTimeout(function () {
      item.remove();
    }, 240);
  }, 1800);
}

function statCard(label, value, tone = "") {
  const cls = tone ? `stat-item ${tone}` : "stat-item";
  return `<article class="${cls}"><p>${esc(label)}</p><strong>${esc(value)}</strong></article>`;
}

function renderSummary(s) {
  const done = (s.passed || 0) + (s.failed || 0) + (s.nt || 0);
  const pct = s.total_tasks ? Math.round((done / s.total_tasks) * 100) : 0;
  return `
    <p>Run ID: ${esc(s.run_id || "-")}</p>
    <p>Status: ${esc(s.status || "-")}</p>
    <p>Progress: ${done}/${s.total_tasks || 0} (${pct}%)</p>
    <p>PASS ${s.passed || 0} | FAIL ${s.failed || 0} | N/T ${s.nt || 0}</p>
    ${s.report_path ? `<p>Report: <a href="${esc(s.report_path)}" target="_blank">open</a></p>` : ""}
  `;
}

function renderSystemStats(dashboard, validate) {
  const v = validate || {};
  const s = v.summary || {};
  const connected = Number(s.connected || 0);
  const androidReady = Number(s.android_ready || 0);
  const iosReady = Number(s.ios_ready || 0);
  const listed = Number((dashboard.devices || []).length);
  const syncGap = Math.max(0, connected - listed);

  return [
    statCard("검증 연결 단말", `${connected}대`, connected > 0 ? "is-ok" : "is-warn"),
    statCard("대시보드 표시 단말", `${listed}대`),
    statCard("Android 준비", `${androidReady}대`, androidReady > 0 ? "is-ok" : "is-warn"),
    statCard("iOS 준비", `${iosReady}대`),
    statCard("동기화 격차", `${syncGap}대`, syncGap > 0 ? "is-warn" : "is-ok"),
  ].join("");
}

function renderQualityStats(runSummary) {
  const s = runSummary || {};
  const passed = Number(s.passed || 0);
  const failed = Number(s.failed || 0);
  const nt = Number(s.nt || 0);
  const total = Math.max(1, passed + failed + nt);
  const passRate = Math.round((passed / total) * 100);
  const failRate = Math.round((failed / total) * 100);
  const done = passed + failed + nt;
  const totalTasks = Number(s.total_tasks || 0);
  const progressRate = totalTasks > 0 ? Math.round((done / totalTasks) * 100) : 0;

  return [
    statCard("PASS 비율", `${passRate}%`, passRate >= 80 ? "is-ok" : "is-warn"),
    statCard("FAIL 비율", `${failRate}%`, failRate === 0 ? "is-ok" : "is-warn"),
    statCard("완료율", `${progressRate}%`),
    statCard("Running", `${s.running || 0}`),
    statCard("Pending", `${s.pending || 0}`),
  ].join("");
}

function getDateFilters() {
  const start = document.getElementById("memberStartDate")?.value || "";
  const end = document.getElementById("memberEndDate")?.value || "";
  return { start, end };
}

function applyDateFilterFromStorage() {
  try {
    const s = localStorage.getItem("qa_member_start_date") || "";
    const e = localStorage.getItem("qa_member_end_date") || "";
    const sInput = document.getElementById("memberStartDate");
    const eInput = document.getElementById("memberEndDate");
    if (sInput && s) sInput.value = s;
    if (eInput && e) eInput.value = e;
  } catch {}
}

function saveDateFilterToStorage() {
  try {
    const s = document.getElementById("memberStartDate")?.value || "";
    const e = document.getElementById("memberEndDate")?.value || "";
    localStorage.setItem("qa_member_start_date", s);
    localStorage.setItem("qa_member_end_date", e);
  } catch {}
}

function applyQaHashMode() {
  const hash = window.location.hash || "";
  const body = document.body;
  const overview = document.getElementById("qaOverviewSection");
  const recent = document.getElementById("recentIssueChartSection");
  const regular = document.getElementById("regularReleaseSection");
  const closing = document.getElementById("closingSummarySection");
  if (!overview || !recent || !regular || !closing) return;

  const quickLinks = Array.from(document.querySelectorAll("[data-qa-target-hash]"));
  for (const link of quickLinks) {
    const targetHash = String(link.getAttribute("data-qa-target-hash") || "").trim();
    link.classList.toggle("active", !!targetHash && targetHash === hash);
  }

  if (body) {
    body.classList.remove("qa-mode-all", "qa-mode-recent", "qa-mode-regular", "qa-mode-closing");
  }

  if (hash === "#recentIssueChartSection") {
    overview.hidden = true;
    recent.hidden = false;
    regular.hidden = true;
    closing.hidden = true;
    if (body) body.classList.add("qa-mode-recent");
    return;
  }
  if (hash === "#regularReleaseSection") {
    overview.hidden = true;
    recent.hidden = true;
    regular.hidden = false;
    closing.hidden = true;
    if (body) body.classList.add("qa-mode-regular");
    return;
  }
  if (hash === "#closingSummarySection") {
    overview.hidden = true;
    recent.hidden = true;
    regular.hidden = true;
    closing.hidden = false;
    if (body) body.classList.add("qa-mode-closing");
    return;
  }

  overview.hidden = false;
  recent.hidden = true;
  regular.hidden = true;
  closing.hidden = true;
  if (body) body.classList.add("qa-mode-all");
}

function renderClosingSummaryTabs(cycles, selectedCycle) {
  const root = document.getElementById("closingSummaryTabs");
  if (!root) return;
  const list = Array.isArray(cycles) ? cycles : [];
  const activeCycle = String(selectedCycle || "").trim();
  const allBtn = `<button type="button" class="btn-ghost closing-cycle-btn ${activeCycle ? "" : "active"}" data-cycle="">전체</button>`;
  const cycleBtns = list.map(function (cycle) {
    const active = String(cycle) === activeCycle;
    return `<button type="button" class="btn-ghost closing-cycle-btn ${active ? "active" : ""}" data-cycle="${esc(cycle)}">${esc(cycle)}</button>`;
  }).join("");
  root.innerHTML = allBtn + cycleBtns;
}

function renderClosingSummaryDetails(data) {
  const hint = document.getElementById("closingSummaryDetailHint");
  const body = document.getElementById("closingSummaryDetailBody");
  if (!hint || !body) return;

  currentClosingTicketRows = Array.isArray(data?.rows) ? data.rows : [];
  currentClosingDetailMeta = {
    cycle: String(data?.cycle || "").trim(),
    phase: String(data?.phase || "").trim(),
    group: String(data?.group || "").trim(),
    severity: String(data?.severity || "").trim(),
  };
  currentClosingStatus = "";
  currentClosingGroups = [];
  applyClosingDetailToolbarState();
  applyClosingTicketFilters();
}

function applyClosingDetailToolbarState() {
  const wantedStatus = normalizeStatusText(currentClosingStatus || "");
  const statusButtons = Array.from(document.querySelectorAll(".closing-status-btn"));
  for (const btn of statusButtons) {
    if (!(btn instanceof HTMLButtonElement)) continue;
    const status = normalizeStatusText(btn.dataset.status || "");
    btn.classList.toggle("active", !!wantedStatus && status === wantedStatus);
  }

  const groupSet = new Set((Array.isArray(currentClosingGroups) ? currentClosingGroups : []).map(normalizeGroupText));
  const groupButtons = Array.from(document.querySelectorAll(".closing-group-btn"));
  for (const btn of groupButtons) {
    if (!(btn instanceof HTMLButtonElement)) continue;
    const group = normalizeGroupText(btn.dataset.group || "");
    btn.classList.toggle("active", !!group && groupSet.has(group));
  }
}

function extractClosingGroupsFromRow(row) {
  const brand = normalizeGroupText(row?.brand || "");
  const out = [];
  for (const g of ["KOA", "HOA", "GOA"]) {
    if (brand.includes(g)) out.push(g);
  }
  return out;
}

function applyClosingTicketFilters() {
  const hint = document.getElementById("closingSummaryDetailHint");
  const body = document.getElementById("closingSummaryDetailBody");
  if (!hint || !body) return;

  const rows = Array.isArray(currentClosingTicketRows) ? currentClosingTicketRows : [];
  const cycle = String(currentClosingDetailMeta?.cycle || "").trim() || "전체";
  const phaseMap = { occurred: "발생 이슈", processed: "처리 이슈", remaining: "잔여 이슈" };
  const sevMap = { highest: "Highest", high: "High", medium: "Medium", lowlowest: "Low/Lowest", low: "Low", lowest: "Lowest" };
  const phase = phaseMap[String(currentClosingDetailMeta?.phase || "").trim().toLowerCase()] || "전체";
  const group = String(currentClosingDetailMeta?.group || "").trim() || "전체";
  const sev = sevMap[String(currentClosingDetailMeta?.severity || "").trim().toLowerCase()] || "전체";

  const wantedStatus = normalizeStatusText(currentClosingStatus || "");
  const groupSet = new Set((Array.isArray(currentClosingGroups) ? currentClosingGroups : []).map(normalizeGroupText));
  const filteredRows = rows.filter((r) => {
    if (wantedStatus && normalizeStatusText(r?.status) !== wantedStatus) return false;
    if (groupSet.size) {
      const rowGroups = extractClosingGroupsFromRow(r);
      if (!rowGroups.some((g) => groupSet.has(g))) return false;
    }
    return true;
  });

  const statusLabel = currentClosingStatus || "전체";
  const groupLabel = currentClosingGroups.length ? currentClosingGroups.join(",") : "전체";
  hint.innerText = `Summary 상세 | 코드: ${cycle} | 구분: ${phase} | 그룹: ${group} | 심각도: ${sev} | 상태필터: ${statusLabel} | 그룹필터: ${groupLabel} | 총 ${filteredRows.length}건`;

  if (!filteredRows.length) {
    body.innerHTML = '<tr><td colspan="9" class="hint">조회 결과가 없습니다.</td></tr>';
    return;
  }

  const cellText = (v) => {
    const t = String(v ?? "").trim();
    return t || "-";
  };

  body.innerHTML = filteredRows.slice(0, 400).map((r) => `
    <tr>
      <td>${esc(cellText(r.key))}</td>
      <td>${esc(cellText(r.status))}</td>
      <td>${esc(cellText(r.priority))}</td>
      <td>${esc(cellText(r.reporter))}</td>
      <td>${esc(cellText(r.created))}</td>
      <td>${esc(cellText(r.fix_versions))}</td>
      <td>${esc(cellText(r.components))}</td>
      <td>${esc(cellText(r.labels))}</td>
      <td>${esc(cellText(r.summary))}</td>
    </tr>
  `).join("");
}

async function refreshClosingSummaryDetails(force, filter) {
  const f = filter || {};
  const qs = new URLSearchParams();
  if (force) qs.set("force", "true");
  if (f.cycle) qs.set("cycle", String(f.cycle));
  if (f.phase) qs.set("phase", String(f.phase));
  if (f.group) qs.set("group", String(f.group));
  if (f.severity) qs.set("severity", String(f.severity));
  const res = await fetch(`/api/stats/closing-summary/detail?${qs.toString()}`);
  const data = await res.json();
  currentClosingDetailFilter = {
    cycle: String(data?.cycle || f.cycle || "").trim(),
    phase: String(data?.phase || f.phase || "").trim(),
    group: String(data?.group || f.group || "").trim(),
    severity: String(data?.severity || f.severity || "").trim(),
  };
  renderClosingSummaryDetails(data);
}

function makeClosingCountButton(value, phase, group, severity) {
  const n = Number(value || 0);
  if (n <= 0) return "0";
  return `<button type="button" class="closing-count-btn" data-phase="${esc(phase)}" data-group="${esc(group)}" data-severity="${esc(severity)}">${n}</button>`;
}

function renderClosingSummary(data) {
  const cards = document.getElementById("closingSummaryCards");
  const head = document.getElementById("closingSummaryHead");
  const body = document.getElementById("closingSummaryBody");
  const hint = document.getElementById("closingSummaryHint");
  if (!cards || !head || !body || !hint) return;

  const cycle = String(data?.selected_cycle || "").trim() || "전체";
  const rows = Array.isArray(data?.phase_rows) ? data.phase_rows : [];
  const totalRows = Number(data?.total_rows || 0);
  const phaseTotals = data?.phase_totals || {};
  const occurred = Number(phaseTotals?.occurred?.total || 0);
  const processed = Number(phaseTotals?.processed?.total || 0);
  const remaining = Number(phaseTotals?.remaining?.total || 0);

  cards.innerHTML = [
    statCard("선택 마감", cycle),
    statCard("총 Defect", `${totalRows}건`),
    statCard("발생 이슈", `${occurred}건`),
    statCard("처리 이슈", `${processed}건`),
    statCard("잔여 이슈", `${remaining}건`),
  ].join("");

  hint.innerText = `기준: DefectList_Raw | 코드: ${cycle} | 갱신 ${data?.updated_at || "-"}`;

  head.innerHTML = `
    <tr>
      <th>구분</th>
      <th>그룹</th>
      <th>Highest</th>
      <th>High</th>
      <th>Medium</th>
      <th>Low/Lowest</th>
      <th>Total</th>
    </tr>
  `;

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="9" class="hint">조회 결과가 없습니다.</td></tr>';
    return;
  }

  const orderedPhases = [
    { key: "occurred", label: "발생 이슈" },
    { key: "processed", label: "처리 이슈" },
    { key: "remaining", label: "잔여 이슈" },
  ];
  const orderedGroups = ["KOA", "HOA", "GOA"];

  const rowByKey = new Map();
  for (const r of rows) {
    const phaseKey = String(r?.phase || "").trim();
    const groupKey = String(r?.group || "").trim().toUpperCase();
    if (!phaseKey || !groupKey) continue;
    rowByKey.set(`${phaseKey}|${groupKey}`, r);
  }

  const rendered = [];
  for (const phase of orderedPhases) {
    let first = true;
    for (const group of orderedGroups) {
      const rec = rowByKey.get(`${phase.key}|${group}`) || { priority: {}, total: 0 };
      const p = rec?.priority || {};
      const lowLowest = Number(p.low || 0) + Number(p.lowest || 0);
      rendered.push(`
        <tr>
          ${first ? `<td class="summary-phase" rowspan="${orderedGroups.length}">${esc(phase.label)}</td>` : ""}
          <td>${esc(group)}</td>
          <td>${makeClosingCountButton(p.highest || 0, phase.key, group, "highest")}</td>
          <td>${makeClosingCountButton(p.high || 0, phase.key, group, "high")}</td>
          <td>${makeClosingCountButton(p.medium || 0, phase.key, group, "medium")}</td>
          <td>${makeClosingCountButton(lowLowest, phase.key, group, "lowlowest")}</td>
          <td>${makeClosingCountButton(rec?.total || 0, phase.key, group, "")}</td>
        </tr>
      `);
      first = false;
    }
  }

  body.innerHTML = rendered.join("");
}

async function refreshClosingSummary(force, cycle) {
  const selected = String(cycle || currentClosingCycle || "").trim();
  const qs = new URLSearchParams();
  if (force) qs.set("force", "true");
  if (selected) qs.set("cycle", selected);
  const res = await fetch(`/api/stats/closing-summary?${qs.toString()}`);
  const data = await res.json();

  const cycles = Array.isArray(data?.cycles) ? data.cycles : [];
  currentClosingCycle = String(data?.selected_cycle || selected || "").trim();
  renderClosingSummaryTabs(cycles, currentClosingCycle);
  renderClosingSummary(data);
}

function makeChartRows(items) {
  const list = Array.isArray(items) ? items : [];
  const max = Math.max(1, ...list.map((x) => Number(x.count || x.total_issue || 0)));
  return list.map((x) => {
    const name = x.name || "-";
    const value = Number(x.count || x.total_issue || 0);
    const width = Math.max(4, Math.round((value / max) * 100));
    return `
      <div class="chart-row">
        <span class="chart-label">${esc(name)}</span>
        <div class="chart-track"><div class="chart-fill" style="width:${width}%"></div></div>
        <span class="chart-value">${esc(value)}</span>
      </div>
    `;
  }).join("");
}

function renderIssueChart(defectStats) {
  const root = document.getElementById("issueChart");
  if (!root) return;
  const stats = defectStats || {};
  const statusTop = (stats.status_top || []).slice(0, 8);
  const severityTop = (stats.severity_top || []).slice(0, 8);

  if (!statusTop.length && !severityTop.length) {
    root.innerHTML = '<p class="hint">이슈 데이터가 없습니다.</p>';
    return;
  }

  root.innerHTML = `
    <section class="chart-group">
      <h3>Status Top</h3>
      ${makeChartRows(statusTop)}
    </section>
    <section class="chart-group">
      <h3>Severity Top</h3>
      ${makeChartRows(severityTop)}
    </section>
  `;
}

function renderMemberChart(stats) {
  const chart = document.getElementById("memberIssueChart");
  const cards = document.getElementById("memberIssueCards");
  const hint = document.getElementById("memberHint");
  const members = (stats?.members || []);
  lastMemberStats = Array.isArray(stats?.members) ? stats.members : [];
  renderMemberSelect(lastMemberStats.map((x) => x.name));

  if (hint) {
    hint.innerText = `조회: ${stats?.start_date || "전체"} ~ ${stats?.end_date || "전체"} | 총 ${Number(stats?.total_rows || 0)}건 | 갱신 ${stats?.updated_at || "-"}`;
  }

  if (!members.length) {
    if (chart) chart.innerHTML = '<p class="hint">인원 통계 데이터가 없습니다.</p>';
    if (cards) cards.innerHTML = "";
    return;
  }

  if (chart) {
    chart.innerHTML = `
      <section class="chart-group">
        <h3>Reporter Top</h3>
        ${makeChartRows(members.map((m) => ({ name: m.name, total_issue: m.total_issue })))}
      </section>
    `;
  }

  if (cards) {
    cards.innerHTML = members.map((m) => `
      <article class="member-mini-card">
        <h3>${esc(m.name)}</h3>
        <p>Total issue: <strong>${Number(m.total_issue || 0)}</strong></p>
        <p>Duplicate: ${Number(m.duplicate || 0)} | Not a Bug: ${Number(m.not_a_bug || 0)}</p>
        <p>Definite problem: ${Number(m.definite_problem || 0)} | Score: ${Number(m.score || 0).toFixed(1)}</p>
        <p>Mistake rate: ${Number(m.mistake_rate || 0).toFixed(1)}% | Rank: ${Number(m.rank || 0)}</p>
      </article>
    `).join("");
  }
}

async function fetchMemberNamesFromAdmin() {
  try {
    const res = await fetch("/api/admin/employees", { credentials: "same-origin" });
    if (!res.ok) return [];
    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    const seen = new Set();
    const out = [];
    items.forEach(function (row) {
      const name = String(row?.name || "").trim();
      if (!name || seen.has(name)) return;
      seen.add(name);
      out.push(name);
    });
    return out;
  } catch {
    return [];
  }
}

function toIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function setMemberDateRange(days) {
  const s = document.getElementById("memberStartDate");
  const e = document.getElementById("memberEndDate");
  if (!s || !e) return;
  if (!days || days <= 0) {
    s.value = "";
    e.value = "";
  } else {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    s.value = toIsoDate(start);
    e.value = toIsoDate(end);
  }
  saveDateFilterToStorage();
  refreshMemberStats(false).catch((err) => toast(`조회 실패: ${String(err)}`, "error"));
}

function toCsvCell(v) {
  const s = String(v ?? "");
  const escaped = s.replace(/"/g, '""');
  return `"${escaped}"`;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((r) => r.map(toCsvCell).join(",")).join("\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportMemberSearchTable() {
  const table = document.getElementById("memberSearchTable");
  if (!table) return;
  const rows = [];
  const head = Array.from(table.querySelectorAll("thead th")).map((th) => (th.textContent || "").trim());
  if (head.length) rows.push(head);
  for (const tr of Array.from(table.querySelectorAll("tbody tr"))) {
    const cols = Array.from(tr.querySelectorAll("td")).map((td) => (td.textContent || "").trim());
    if (cols.length) rows.push(cols);
  }
  if (rows.length <= 1) {
    toast("내보낼 검색 결과가 없습니다.", "warn");
    return;
  }
  downloadCsv(`member_search_${Date.now()}.csv`, rows);
  toast("검색 결과를 CSV로 저장했습니다.", "ok");
}

async function refreshIssueStats(force) {
  const qs = force ? "?force=true" : "";
  const res = await fetch(`/api/stats/defects${qs}`);
  const data = await res.json();
  renderIssueChart(data);
}

async function refreshDefectSheetNow(opts) {
  const options = opts || {};
  const buttonId = String(options.buttonId || "defectSheetRefreshBtn");
  const hintId = String(options.hintId || "defectSheetSyncHint");
  const btn = document.getElementById(buttonId);
  const hint = document.getElementById(hintId);
  const oldText = btn?.innerText || "";
  if (btn) {
    btn.disabled = true;
    btn.innerText = "최신화 중...";
  }
  try {
    const res = await fetch("/api/stats/defects/refresh", { method: "POST" });
    const data = await res.json();
    const jobs = [
      refreshQa(),
      refreshIssueStats(true),
      refreshRecentStatusIssues(currentRecentStatus || "Open", currentRecentGroups || [], true),
      refreshRegularRelease(true),
      refreshClosingSummary(true, currentClosingCycle || ""),
      refreshClosingSummaryDetails(true, currentClosingDetailFilter || { cycle: currentClosingCycle || "", phase: "", group: "", severity: "" }),
    ];
    await Promise.all(jobs);
    if (hint) hint.innerText = `DefectList_Raw 최신화 완료 | rows: ${Number(data?.defect_total_rows || 0)} | ${data?.defect_updated_at || "-"}`;
    toast("DefectList_Raw 최신화를 완료했습니다.", "ok");
  } catch (e) {
    if (hint) hint.innerText = `최신화 실패: ${String(e)}`;
    toast(`최신화 실패: ${String(e)}`, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = oldText || "DefectList_Raw 최신화";
    }
  }
}

function renderRecentStatusRows(data, status, groups, regions, startDate, endDate) {
  const hint = document.getElementById("recentStatusHint");
  const body = document.getElementById("recentStatusBody");
  if (!hint || !body) return;

  const cellText = (v) => {
    const t = String(v ?? "").trim();
    return t || "-";
  };

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const groupLabel = Array.isArray(groups) && groups.length ? groups.join(",") : "전체";
  const regionLabel = Array.isArray(regions) && regions.length ? regions.join(",") : "전체";
  const startLabel = String(startDate || "").trim() || "전체";
  const endLabel = String(endDate || "").trim() || "전체";
  hint.innerText = `상태: ${status} | 그룹: ${groupLabel} | 지역: ${regionLabel} | 기간: ${startLabel} ~ ${endLabel} | 총 ${Number(data?.count || 0)}건`;

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="12" class="hint">조회 결과가 없습니다.</td></tr>';
    return;
  }

  body.innerHTML = rows.slice(0, 300).map((r) => `
    <tr>
      <td>${esc(cellText(r.key))}</td>
      <td>${esc(cellText(r.status))}</td>
      <td>${esc(cellText(r.resolution))}</td>
      <td>${esc(cellText(r.priority))}</td>
      <td>${esc(cellText(r.reporter))}</td>
      <td>${esc(cellText(r.region))}</td>
      <td>${esc(cellText(r.os))}</td>
      <td>${esc(cellText(r.components))}</td>
      <td>${esc(cellText(r.assignee))}</td>
      <td>${esc(cellText(r.summary))}</td>
      <td>${esc(cellText(r.affects_versions))}</td>
      <td>${esc(cellText(r.brand))}</td>
    </tr>
  `).join("");
}

function setRecentStatusActive(status) {
  const buttons = Array.from(document.querySelectorAll(".recent-status-btn"));
  for (const btn of buttons) {
    if (!(btn instanceof HTMLButtonElement)) continue;
    const same = String(btn.dataset.status || "") === String(status || "");
    btn.classList.toggle("active", same);
  }
}

function setRecentGroupActive(groups) {
  const set = new Set((Array.isArray(groups) ? groups : []).map(normalizeGroupText));
  const buttons = Array.from(document.querySelectorAll(".recent-group-btn"));
  for (const btn of buttons) {
    if (!(btn instanceof HTMLButtonElement)) continue;
    const group = normalizeGroupText(btn.dataset.group || "");
    btn.classList.toggle("active", !!group && set.has(group));
  }
}

function extractRegionsFromData(rows) {
  const regions = new Set();
  for (const r of Array.isArray(rows) ? rows : []) {
    const region = String(r?.region || "").trim().toUpperCase();
    if (region) regions.add(region);
  }
  return Array.from(regions).sort();
}

function renderRecentRegionButtons(data) {
  const container = document.getElementById("regionFilterContainer");
  if (!container) return;
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const regions = extractRegionsFromData(rows);
  const regionSet = new Set((currentRecentRegions || []).map((r) => String(r).toUpperCase()));
  container.innerHTML = regions.map((region) => {
    const isActive = regionSet.has(region);
    return `<button type="button" class="btn-ghost recent-region-btn ${isActive ? "active" : ""}" data-region="${esc(region)}">${esc(region)}</button>`;
  }).join("");
}

function setRecentRegionActive(regions) {
  const set = new Set((Array.isArray(regions) ? regions : []).map((r) => String(r).toUpperCase()));
  const buttons = Array.from(document.querySelectorAll(".recent-region-btn"));
  for (const btn of buttons) {
    if (!(btn instanceof HTMLButtonElement)) continue;
    const region = String(btn.dataset.region || "").toUpperCase();
    btn.classList.toggle("active", !!region && set.has(region));
  }
}
async function refreshRecentStatusIssues(status, groups, force, regions, startDate, endDate) {
  const target = String(status || "").trim();
  if (!target) return;
  const groupList = Array.isArray(groups) ? groups.map(normalizeGroupText).filter(Boolean) : [];
  const regionList = Array.isArray(regions) ? regions.map((r) => String(r).toUpperCase()).filter(Boolean) : [];
  const startDateStr = String(startDate || "").trim();
  const endDateStr = String(endDate || "").trim();
  let data;
  try {
    const qs = new URLSearchParams({ status: target });
    if (groupList.length) qs.set("groups", groupList.join(","));
    if (regionList.length) qs.set("regions", regionList.join(","));
    if (startDateStr) qs.set("start_date", startDateStr);
    if (endDateStr) qs.set("end_date", endDateStr);
    if (force) qs.set("force", "true");
    const res = await fetch(`/api/stats/company-defects/by-status?${qs.toString()}`);
    if (!res.ok) {
      throw new Error(`status endpoint unavailable (${res.status})`);
    }
    data = await res.json();
  } catch {
    // Fallback for older running instances: aggregate rows per company member via existing detail API.
    const members = await fetchMemberNamesFromAdmin();
    const details = await Promise.all(
      members.map(async function (name) {
        const qs = new URLSearchParams({ name: String(name || "") });
        const r = await fetch(`/api/stats/company-defects/detail?${qs.toString()}`);
        if (!r.ok) return { rows: [] };
        return r.json();
      })
    );
    const wanted = normalizeStatusText(target);
    const groupSet = new Set(groupList);
    const regionSet = new Set(regionList);
    const rows = [];
    for (const part of details) {
      for (const row of Array.isArray(part?.rows) ? part.rows : []) {
        if (normalizeStatusText(row?.status) !== wanted) continue;
        const region = String(row?.region ?? "").toUpperCase();
        if (regionSet.size && !regionSet.has(region)) continue;
        if (groupSet.size) {
          const brand = normalizeGroupText(row?.brand);
          if (!brand || !Array.from(groupSet).some((g) => brand.includes(g))) continue;
        }
        if (startDateStr || endDateStr) {
          const created = String(row?.created || "").slice(0, 10);
          if (startDateStr && created < startDateStr) continue;
          if (endDateStr && created > endDateStr) continue;
        }
        rows.push(row);
      }
    }
    data = {
      ok: true,
      status: target,
      count: rows.length,
      rows,
      updated_at: new Date().toISOString().slice(0, 19),
    };
  }
  currentRecentStatus = target;
  currentRecentGroups = groupList;
  currentRecentRegions = regionList;
  currentRecentStartDate = startDateStr;
  currentRecentEndDate = endDateStr;
  setRecentStatusActive(target);
  setRecentGroupActive(groupList);
  setRecentRegionActive(regionList);
  renderRecentRegionButtons(data);
  renderRecentStatusRows(data, target, groupList, regionList, startDateStr, endDateStr);
}

async function refreshMemberStats(force) {
  const filters = getDateFilters();
  const qs = new URLSearchParams();
  if (force) qs.set("force", "true");
  if (filters.start) qs.set("start_date", filters.start);
  if (filters.end) qs.set("end_date", filters.end);

  const res = await fetch(`/api/stats/company-defects?${qs.toString()}`);
  const data = await res.json();
  renderMemberChart(data);
}

function renderMemberSearch(data, name) {
  const hint = document.getElementById("memberSearchHint");
  const stats = document.getElementById("memberSearchStats");
  const body = document.getElementById("memberSearchBody");
  if (!hint || !stats || !body) return;

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  memberSearchRows = rows;
  hint.innerText = `검색어: ${name || "-"} | 총 ${Number(data?.count || 0)}건 | 갱신 ${data?.updated_at || "-"}`;
  stats.innerHTML = [
    statCard("검색 건수", `${Number(data?.count || 0)}건`),
    statCard("시작일", data?.start_date || "전체"),
    statCard("종료일", data?.end_date || "전체"),
  ].join("");

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="9" class="hint">조회 결과가 없습니다.</td></tr>';
    return;
  }

  body.innerHTML = rows.slice(0, 200).map((r) => `
    <tr>
      <td>${esc(r.key || "-")}</td>
      <td>${esc(r.status || "-")}</td>
      <td>${esc(r.priority || "-")}</td>
      <td>${esc(r.reporter || "-")}</td>
      <td>${esc(r.created || "-")}</td>
      <td>${esc(r.fix_versions || "-")}</td>
      <td>${esc(r.components || "-")}</td>
      <td>${esc(r.labels || "-")}</td>
      <td>${esc(r.summary || "-")}</td>
    </tr>
  `).join("");

  renderSelectedMemberDetail(name, rows);
}

async function searchMemberIssues() {
  const name = (document.getElementById("memberSearchSelect")?.value || "").trim();
  if (!name) {
    toast("검색할 인원명을 입력해 주세요.", "warn");
    return;
  }
  const start = document.getElementById("memberStartDate")?.value || "";
  const end = document.getElementById("memberEndDate")?.value || "";
  const qs = new URLSearchParams({ name });
  if (start) qs.set("start_date", start);
  if (end) qs.set("end_date", end);
  const res = await fetch(`/api/stats/company-defects/detail?${qs.toString()}`);
  const data = await res.json();
  renderMemberSearch(data, name);
}

function renderMemberSelect(names) {
  const sel = document.getElementById("memberSearchSelect");
  if (!sel) return;
  const current = sel.value;
  const list = Array.isArray(names) ? names : [];
  sel.innerHTML = `<option value="">인원을 선택하세요</option>${list.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("")}`;
  if (current && list.includes(current)) {
    sel.value = current;
  }
}

function renderSelectedMemberDetail(name, rows) {
  const title = document.getElementById("memberDetailTitle");
  const stats = document.getElementById("memberDetailStats");
  const body = document.getElementById("memberDetailBreakdownBody");
  if (!title || !stats || !body) return;

  const member = lastMemberStats.find((x) => String(x.name) === String(name));
  if (!member) {
    title.innerText = "선택 인원 통계를 찾을 수 없습니다.";
    stats.innerHTML = "";
    body.innerHTML = "";
    return;
  }

  title.innerText = `${member.name} 상세 통계`;
  stats.innerHTML = [
    statCard("총 이슈", `${Number(member.total_issue || 0)}건`),
    statCard("Definite", `${Number(member.definite_problem || 0)}건`),
    statCard("Duplicate", `${Number(member.duplicate || 0)}건`),
    statCard("Not a Bug", `${Number(member.not_a_bug || 0)}건`),
    statCard("Mistake Rate", `${Number(member.mistake_rate || 0).toFixed(1)}%`),
    statCard("Score / Rank", `${Number(member.score || 0).toFixed(1)} / ${Number(member.rank || 0)}위`),
  ].join("");

  const highPriority = rows.filter((r) => String(r.priority || "").toLowerCase().includes("high")).length;
  body.innerHTML = [
    ["Highest", Number(member.highest || 0).toFixed(1)],
    ["High", Number(member.high || 0).toFixed(1)],
    ["Medium", Number(member.medium || 0).toFixed(1)],
    ["Low", Number(member.low || 0).toFixed(1)],
    ["Lowest", Number(member.lowest || 0).toFixed(1)],
    ["조회 결과(행)", `${rows.length}건`],
    ["조회 결과 High 포함", `${highPriority}건`],
  ].map((x) => `<tr><td>${esc(x[0])}</td><td>${esc(x[1])}</td></tr>`).join("");
}

function renderRegularRelease(data) {
  currentRegularReleaseData = data || null;

  const summary = document.getElementById("regularReleaseSummary");
  const head = document.getElementById("regularReleaseHead");
  const body = document.getElementById("regularReleaseBody");
  if (!summary || !head || !body) return;

  const rawVersions = Array.isArray(data?.versions) ? data.versions : [];
  const versions = Array.from(new Set(rawVersions)).sort(function (a, b) {
    const aText = String(a || "").trim();
    const bText = String(b || "").trim();
    const aDigits = aText.replace(/\D/g, "");
    const bDigits = bText.replace(/\D/g, "");
    const aOrder = aDigits ? Number.parseInt(aDigits.slice(-4), 10) : Number.POSITIVE_INFINITY;
    const bOrder = bDigits ? Number.parseInt(bDigits.slice(-4), 10) : Number.POSITIVE_INFINITY;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return aText.localeCompare(bText, "ko");
  });
  head.innerHTML = `
    <tr>
      <th>날짜</th>
      <th>SUM</th>
      <th>전수평가TC</th>
      ${versions.map((v) => `<th>${esc(v)}</th>`).join("")}
    </tr>
  `;

  const regions = (Array.isArray(data?.regions) ? data.regions : []).filter((r) =>
    String(r?.region || "").toLowerCase().includes("eu")
  );
  if (!regions.length) {
    summary.innerHTML = [statCard("정기배포 이슈", "0건"), statCard("전수평가TC", "0건")].join("");
    body.innerHTML = `<tr><td colspan="${3 + versions.length}" class="hint">정기배포 데이터가 없습니다.</td></tr>`;
    return;
  }

  const rows = [];
  const byDate = new Map();
  const summaryMap = {};
  for (const v of versions) {
    summaryMap[v] = 0;
  }
  for (const region of regions) {
    const members = Array.isArray(region.members) ? region.members : [];
    for (const member of members) {
      const dates = Array.isArray(member.dates) ? member.dates : [];
      for (const d of dates) {
        const day = String(d?.date || "-");
        if (!byDate.has(day)) {
          byDate.set(day, { sum: 0, full_tc: 0, versions: {} });
        }
        const rec = byDate.get(day);
        rec.full_tc = Number(rec.full_tc || 0) + Number(d?.full_tc || 0);
        for (const v of versions) {
          const n = Number((d?.versions || {})[v] || 0);
          rec.versions[v] = Number(rec.versions[v] || 0) + n;
          summaryMap[v] = Number(summaryMap[v] || 0) + n;
        }
      }
    }
  }

  const filteredTotal = versions.reduce((acc, v) => acc + Number(summaryMap[v] || 0), 0);
  const fullTcTotal = Number(data?.full_tc_total || 0);

  summary.innerHTML = [statCard("정기배포 이슈", `${filteredTotal}건`), statCard("전수평가TC", `${fullTcTotal}건`)].join("");

  rows.push(`
    <tr class="release-sum-row">
      <td>SUM</td>
      <td>${filteredTotal}</td>
      <td>${fullTcTotal > 0 ? `<button type="button" class="release-count-btn" data-version="" data-date="" data-fulltc="true">${fullTcTotal}</button>` : "0"}</td>
      ${versions.map((v) => {
        const n = Number(summaryMap[v] || 0);
        if (n <= 0) return `<td>0</td>`;
        return `<td><button type="button" class="release-count-btn" data-version="${esc(v)}" data-date="">${n}</button></td>`;
      }).join("")}
    </tr>
  `);
  const days = Array.from(byDate.keys()).sort();
  for (const day of days) {
    const d = byDate.get(day) || { sum: 0, full_tc: 0, versions: {} };
    const rowSum = versions.reduce((acc, v) => acc + Number((d.versions || {})[v] || 0), 0);
    rows.push(`
      <tr>
        <td>${esc(day)}</td>
        <td>${rowSum}</td>
        <td>${Number(d.full_tc || 0) > 0 ? `<button type="button" class="release-count-btn" data-version="" data-date="${esc(day)}" data-fulltc="true">${Number(d.full_tc || 0)}</button>` : "0"}</td>
        ${versions.map((v) => {
          const n = Number((d.versions || {})[v] || 0);
          if (n <= 0) return `<td>0</td>`;
          return `<td><button type="button" class="release-count-btn" data-version="${esc(v)}" data-date="${esc(day)}">${n}</button></td>`;
        }).join("")}
      </tr>
    `);
  }
  body.innerHTML = rows.join("");
}

function renderRegularReleaseDetails(data) {
  const hint = document.getElementById("regularReleaseDetailHint");
  const body = document.getElementById("regularReleaseDetailBody");
  if (!hint || !body) return;
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const version = String(data?.version || "").trim() || "전체";
  const day = String(data?.date || "").trim() || "전체";
  const fullTcOnly = !!data?.full_tc_only;
  hint.innerText = `정기배포 상세 | 버전: ${version} | 날짜: ${day} | 구분: ${fullTcOnly ? "전수평가TC" : "전체"} | 총 ${Number(data?.count || 0)}건`;
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="9" class="hint">조회 결과가 없습니다.</td></tr>';
    return;
  }
  const cellText = (v) => {
    const t = String(v ?? "").trim();
    return t || "-";
  };
  body.innerHTML = rows.slice(0, 300).map((r) => `
    <tr>
      <td>${esc(cellText(r.key))}</td>
      <td>${esc(cellText(r.status))}</td>
      <td>${esc(cellText(r.priority))}</td>
      <td>${esc(cellText(r.reporter))}</td>
      <td>${esc(cellText(r.assignee))}</td>
      <td>${esc(cellText(r.components))}</td>
      <td>${esc(cellText(r.created))}</td>
      <td>${esc(cellText(r.fix_versions))}</td>
      <td>${esc(cellText(r.summary))}</td>
      <td>${esc(cellText(r.affects_versions))}</td>
      <td>${esc(cellText(r.labels))}</td>
      <td>${esc(cellText(r.region))}</td>
    </tr>
  `).join("");
}

function extractReleaseTagsFromComponents(value) {
  const text = String(value ?? "").trim();
  if (!text || !text.includes("정기배포")) return [];
  const out = [];
  const seen = new Set();
  const re = /(\d{4})\s*정기배포/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const tag = `${m[1]}정기배포`;
    if (!seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  if (!out.length) out.push("정기배포");
  return out;
}

function normalizeCreatedDateText(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const m = text.match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})\)$/);
  if (m) {
    const yy = m[1];
    const mm = String(Number(m[2]) + 1).padStart(2, "0");
    const dd = String(Number(m[3])).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return "";
}

async function refreshRegularReleaseDetails(version, date, force, fullTcOnly) {
  const qs = new URLSearchParams();
  if (version) qs.set("version", String(version));
  if (date) qs.set("date", String(date));
  if (fullTcOnly) qs.set("full_tc_only", "true");
  if (force) qs.set("force", "true");
  try {
    const res = await fetch(`/api/stats/regular-release/detail?${qs.toString()}`);
    if (res.ok) {
      const data = await res.json();
      renderRegularReleaseDetails(data);
      return;
    }
  } catch {}

  // Fallback for older running instances: build rows from existing detail APIs.
  const wantedVersion = String(version || "").trim();
  const wantedDate = String(date || "").trim();
  const onlyFullTc = !!fullTcOnly;
  const rows = [];
  try {
    const members = await fetchMemberNamesFromAdmin();
    const details = await Promise.all(
      members.map(async function (name) {
        const qs = new URLSearchParams({ name: String(name || "") });
        if (force) qs.set("force", "true");
        const r = await fetch(`/api/stats/company-defects/detail?${qs.toString()}`);
        if (!r.ok) return { rows: [] };
        return r.json();
      })
    );

    for (const part of details) {
      for (const row of Array.isArray(part?.rows) ? part.rows : []) {
        const region = String(row?.region ?? "").toUpperCase();
        if (!region.includes("EU")) continue;
        const tags = extractReleaseTagsFromComponents(row?.components);
        if (!tags.length) continue;
        if (wantedVersion && !tags.includes(wantedVersion)) continue;
        const iso = normalizeCreatedDateText(row?.created);
        if (wantedDate && iso !== wantedDate) continue;
        const labels = String(row?.labels || "").toLowerCase();
        if (onlyFullTc && !labels.includes("전수평가tc")) continue;
        rows.push(row);
      }
    }
  } catch {}

  renderRegularReleaseDetails({ ok: true, version: wantedVersion, date: wantedDate, full_tc_only: onlyFullTc, count: rows.length, rows });
}

async function refreshRegularRelease(force) {
  const qs = force ? "?force=true" : "";
  const res = await fetch(`/api/stats/regular-release${qs}`);
  const data = await res.json();
  renderRegularRelease(data);
}

async function refreshQa() {
  const [dashboard, validate] = await Promise.all([
    fetchJson("/api/dashboard"),
    fetchJson("/api/devices/validate"),
  ]);

  const summary = document.getElementById("summary");
  const systemStats = document.getElementById("systemStats");
  const qualityStats = document.getElementById("qualityStats");

  if (summary) summary.innerHTML = renderSummary(dashboard.run_summary || {});
  if (systemStats) systemStats.innerHTML = renderSystemStats(dashboard, validate);
  if (qualityStats) qualityStats.innerHTML = renderQualityStats(dashboard.run_summary || {});
}

document.getElementById("memberDateFilterBtn")?.addEventListener("click", function () {
  saveDateFilterToStorage();
  refreshMemberStats(false).catch((e) => toast(`조회 실패: ${String(e)}`, "error"));
});

document.getElementById("memberStartDate")?.addEventListener("change", saveDateFilterToStorage);
document.getElementById("memberEndDate")?.addEventListener("change", saveDateFilterToStorage);

document.getElementById("memberSearchBtn")?.addEventListener("click", function () {
  searchMemberIssues().catch((e) => toast(`인원 검색 실패: ${String(e)}`, "error"));
});

document.getElementById("memberSearchSelect")?.addEventListener("change", function () {
  const name = (document.getElementById("memberSearchSelect")?.value || "").trim();
  if (!name) return;
  searchMemberIssues().catch((e) => toast(`인원 검색 실패: ${String(e)}`, "error"));
});

document.getElementById("memberPreset7dBtn")?.addEventListener("click", function () {
  setMemberDateRange(7);
});

document.getElementById("memberPreset30dBtn")?.addEventListener("click", function () {
  setMemberDateRange(30);
});

document.getElementById("memberPresetAllBtn")?.addEventListener("click", function () {
  setMemberDateRange(0);
});

document.getElementById("memberSearchClearBtn")?.addEventListener("click", function () {
  const input = document.getElementById("memberSearchSelect");
  if (input) input.value = "";
  const hint = document.getElementById("memberSearchHint");
  const stats = document.getElementById("memberSearchStats");
  const body = document.getElementById("memberSearchBody");
  const detailTitle = document.getElementById("memberDetailTitle");
  const detailStats = document.getElementById("memberDetailStats");
  const detailBody = document.getElementById("memberDetailBreakdownBody");
  if (hint) hint.innerText = "";
  if (stats) stats.innerHTML = "";
  if (body) body.innerHTML = "";
  if (detailTitle) detailTitle.innerText = "검색 인원을 선택하면 상세 통계가 표시됩니다.";
  if (detailStats) detailStats.innerHTML = "";
  if (detailBody) detailBody.innerHTML = "";
  toast("검색 상태를 초기화했습니다.", "ok");
});

document.getElementById("memberSearchExportBtn")?.addEventListener("click", exportMemberSearchTable);
document.getElementById("defectSheetRefreshBtn")?.addEventListener("click", function () {
  refreshDefectSheetNow().catch((e) => toast(`최신화 실패: ${String(e)}`, "error"));
});
document.getElementById("regularReleaseRefreshBtn")?.addEventListener("click", function () {
  refreshDefectSheetNow({
    buttonId: "regularReleaseRefreshBtn",
    hintId: "regularReleaseSyncHint",
  }).catch((e) => toast(`정기배포 최신화 실패: ${String(e)}`, "error"));
});

document.getElementById("regularReleaseBody")?.addEventListener("click", function (event) {
  const el = event.target;
  if (!(el instanceof HTMLElement)) return;
  const btn = el.closest(".release-count-btn");
  if (!(btn instanceof HTMLButtonElement)) return;
  const version = String(btn.dataset.version || "").trim();
  const day = String(btn.dataset.date || "").trim();
  const fullTcOnly = String(btn.dataset.fulltc || "").toLowerCase() === "true";
  if (!version && !fullTcOnly) return;
  refreshRegularReleaseDetails(version, day, false, fullTcOnly).catch((e) => toast(`정기배포 상세 조회 실패: ${String(e)}`, "error"));
});

document.getElementById("closingSummaryTabs")?.addEventListener("click", function (event) {
  const el = event.target;
  if (!(el instanceof HTMLElement)) return;
  const btn = el.closest(".closing-cycle-btn");
  if (!(btn instanceof HTMLButtonElement)) return;
  const cycle = String(btn.dataset.cycle || "").trim();
  refreshClosingSummary(false, cycle)
    .then(function () {
      return refreshClosingSummaryDetails(false, { cycle, phase: "", group: "", severity: "" });
    })
    .catch((e) => toast(`마감 통계 조회 실패: ${String(e)}`, "error"));
});

document.getElementById("closingSummaryBody")?.addEventListener("click", function (event) {
  const el = event.target;
  if (!(el instanceof HTMLElement)) return;
  const btn = el.closest(".closing-count-btn");
  if (!(btn instanceof HTMLButtonElement)) return;
  const phase = String(btn.dataset.phase || "").trim();
  const group = String(btn.dataset.group || "").trim().toUpperCase();
  const severity = String(btn.dataset.severity || "").trim().toLowerCase();
  refreshClosingSummaryDetails(false, {
    cycle: currentClosingCycle || "",
    phase,
    group,
    severity,
  }).catch((e) => toast(`Summary 상세 조회 실패: ${String(e)}`, "error"));
});

document.getElementById("closingSummaryDetailToolbar")?.addEventListener("click", function (event) {
  const el = event.target;
  if (!(el instanceof HTMLElement)) return;

  const statusBtn = el.closest(".closing-status-btn");
  if (statusBtn instanceof HTMLButtonElement) {
    const status = String(statusBtn.dataset.status || "").trim();
    if (!status) return;
    currentClosingStatus = (normalizeStatusText(currentClosingStatus) === normalizeStatusText(status)) ? "" : status;
    applyClosingDetailToolbarState();
    applyClosingTicketFilters();
    return;
  }

  const groupBtn = el.closest(".closing-group-btn");
  if (groupBtn instanceof HTMLButtonElement) {
    const group = normalizeGroupText(groupBtn.dataset.group || "");
    if (!group) return;
    const set = new Set((currentClosingGroups || []).map(normalizeGroupText));
    if (set.has(group)) set.delete(group);
    else set.add(group);
    currentClosingGroups = Array.from(set);
    applyClosingDetailToolbarState();
    applyClosingTicketFilters();
  }
});

document.getElementById("recentStatusToolbar")?.addEventListener("click", function (event) {
  const el = event.target;
  if (!(el instanceof HTMLElement)) return;
  const statusBtn = el.closest(".recent-status-btn");
  if (statusBtn instanceof HTMLButtonElement) {
    const status = String(statusBtn.dataset.status || "").trim();
    if (!status) return;
    refreshRecentStatusIssues(status, currentRecentGroups, false, currentRecentRegions, currentRecentStartDate, currentRecentEndDate).catch((e) => toast(`상태 조회 실패: ${String(e)}`, "error"));
    return;
  }

  const groupBtn = el.closest(".recent-group-btn");
  if (groupBtn instanceof HTMLButtonElement) {
    const group = normalizeGroupText(groupBtn.dataset.group || "");
    if (!group) return;
    const set = new Set((currentRecentGroups || []).map(normalizeGroupText));
    if (set.has(group)) set.delete(group);
    else set.add(group);
    const nextGroups = Array.from(set);
    refreshRecentStatusIssues(currentRecentStatus || "Open", nextGroups, false, currentRecentRegions, currentRecentStartDate, currentRecentEndDate).catch((e) => toast(`상태 조회 실패: ${String(e)}`, "error"));
    return;
  }

  const regionBtn = el.closest(".recent-region-btn");
  if (regionBtn instanceof HTMLButtonElement) {
    const region = String(regionBtn.dataset.region || "").toUpperCase();
    if (!region) return;
    const set = new Set((currentRecentRegions || []).map((r) => String(r).toUpperCase()));
    if (set.has(region)) set.delete(region);
    else set.add(region);
    const nextRegions = Array.from(set);
    refreshRecentStatusIssues(currentRecentStatus || "Open", currentRecentGroups, false, nextRegions, currentRecentStartDate, currentRecentEndDate).catch((e) => toast(`지역 조회 실패: ${String(e)}`, "error"));
  }
});

async function bootstrapQaDashboard() {
  applyDateFilterFromStorage();
  await applyQaRoleGuard();
  applyQaHashMode();
  window.addEventListener("hashchange", applyQaHashMode);

  await refreshQa().catch((e) => {
    const qualityStats = document.getElementById("qualityStats");
    if (qualityStats) {
      qualityStats.innerHTML = statCard("데이터 연결 상태", "오류", "danger") + statCard("안내", e?.message || "대시보드 데이터를 불러오지 못했습니다.");
    }
    toast(`대시보드 로딩 실패: ${String(e?.message || e)}`, "error");
  });
  if (qaIsAdmin) {
    refreshIssueStats(false).catch((e) => toast(`최근 이슈 통계 조회 실패: ${String(e)}`, "error"));
  }
  refreshRecentStatusIssues("Open", [], false, [], "", "").catch((e) => toast(`상태 조회 실패: ${String(e)}`, "error"));
  refreshRegularRelease(false).catch((e) => toast(`정기배포 조회 실패: ${String(e)}`, "error"));
  refreshClosingSummary(false, "").catch((e) => toast(`마감 통계 조회 실패: ${String(e)}`, "error"));
  refreshClosingSummaryDetails(false, { cycle: "", phase: "", group: "", severity: "" }).catch((e) => toast(`Summary 상세 조회 실패: ${String(e)}`, "error"));

  setInterval(function () {
    refreshQa().catch(function () {});
  }, 3000);
  if (qaIsAdmin) {
    setInterval(function () {
      refreshIssueStats(false).catch(function () {});
    }, 15000);
  }
  setInterval(function () {
    refreshRecentStatusIssues(currentRecentStatus || "Open", currentRecentGroups || [], false, currentRecentRegions || [], currentRecentStartDate || "", currentRecentEndDate || "").catch(function () {});
  }, 20000);
  setInterval(function () {
    refreshRegularRelease(false).catch(function () {});
  }, 30000);
  setInterval(function () {
    refreshClosingSummary(false, currentClosingCycle || "").catch(function () {});
  }, 30000);
  setInterval(function () {
    refreshClosingSummaryDetails(false, currentClosingDetailFilter || { cycle: currentClosingCycle || "", phase: "", group: "", severity: "" }).catch(function () {});
  }, 30000);
}

bootstrapQaDashboard().catch((e) => toast(`초기화 실패: ${String(e)}`, "error"));

document.getElementById("recentStartDate")?.addEventListener("change", function () {
  const startDate = this.value || "";
  currentRecentStartDate = startDate;
  refreshRecentStatusIssues(currentRecentStatus || "Open", currentRecentGroups || [], false, currentRecentRegions || [], currentRecentStartDate, currentRecentEndDate).catch((e) => toast(`날짜 조회 실패: ${String(e)}`, "error"));
});

document.getElementById("recentEndDate")?.addEventListener("change", function () {
  const endDate = this.value || "";
  currentRecentEndDate = endDate;
  refreshRecentStatusIssues(currentRecentStatus || "Open", currentRecentGroups || [], false, currentRecentRegions || [], currentRecentStartDate, currentRecentEndDate).catch((e) => toast(`날짜 조회 실패: ${String(e)}`, "error"));
});
// ===== 공용 테이블 컬럼 필터 시스템 =====
// recentStatusTable, regularReleaseDetailTable, closingSummaryDetailTable 에 적용

const _qaFilterState = {}; // { tableId: { colIdx: { mode, values:[] } } }
let _qaFilterPopup = null;
let _qaFilterMeta = null; // { tableEl, colIdx, allTokens }

function _qaCloseFilter() {
  if (_qaFilterPopup && _qaFilterPopup.parentNode) {
    _qaFilterPopup.parentNode.removeChild(_qaFilterPopup);
  }
  _qaFilterPopup = null;
  _qaFilterMeta = null;
}

function _qaColUniques(tableEl, colIdx) {
  const vals = new Set();
  for (const tr of tableEl.querySelectorAll("tbody tr")) {
    const text = (tr.cells[colIdx]?.textContent || "").trim() || "-";
    vals.add(text);
  }
  return Array.from(vals).sort((a, b) => a.localeCompare(b, "ko"));
}

function _qaApplyFilter(tableEl) {
  if (!tableEl) return;
  const id = tableEl.id;
  const state = _qaFilterState[id] || {};
  for (const tr of tableEl.querySelectorAll("tbody tr")) {
    let show = true;
    for (const [colIdxStr, cfg] of Object.entries(state)) {
      if (!cfg || !cfg.values || !cfg.values.length) continue;
      const colIdx = Number(colIdxStr);
      const cellText = (tr.cells[colIdx]?.textContent || "").trim() || "-";
      const token = encodeURIComponent(cellText);
      const inVals = cfg.values.includes(token);
      if (cfg.mode === "include" && !inVals) { show = false; break; }
      if (cfg.mode === "exclude" && inVals) { show = false; break; }
    }
    tr.style.display = show ? "" : "none";
  }
  // 필터 버튼 is-active 상태 갱신
  for (const btn of tableEl.querySelectorAll("thead .qa-col-filter-btn")) {
    const idx = String(btn.dataset.colidx || "");
    const cfg = (_qaFilterState[id] || {})[idx];
    const active = Boolean(cfg && cfg.values && cfg.values.length);
    btn.classList.toggle("is-active", active);
  }
}

function _qaOpenFilter(tableEl, colIdx, event) {
  event.stopPropagation();
  _qaCloseFilter();

  const id = tableEl.id;
  const cfg = (_qaFilterState[id] || {})[String(colIdx)] || { mode: "include", values: [] };
  const uniques = _qaColUniques(tableEl, colIdx);
  const allTokens = uniques.map((v) => encodeURIComponent(v));
  const selectedSet = new Set(cfg.values || []);
  const currentMode = cfg.mode || "include";

  const popup = document.createElement("div");
  popup.className = "filter-popup";
  popup.style.cssText = "position:fixed;z-index:9999;display:block;min-width:230px;max-width:280px;";

  popup.innerHTML = `
    <div class="filter-popup-header">
      <span>컬럼 필터</span>
      <button class="filter-popup-close" type="button">✕</button>
    </div>
    <div class="filter-tools">
      <button type="button" class="filter-tool-btn qa-mode-btn ${currentMode === "include" ? "is-active" : ""}" data-mode="include">포함</button>
      <button type="button" class="filter-tool-btn qa-mode-btn ${currentMode === "exclude" ? "is-active" : ""}" data-mode="exclude">제외</button>
    </div>
    <div class="filter-search-wrap">
      <input class="filter-search-input" type="text" placeholder="검색..." />
    </div>
    <div class="filter-tools">
      <button type="button" class="filter-tool-btn qa-sel-all">전체선택</button>
      <button type="button" class="filter-tool-btn qa-sel-none">전체해제</button>
    </div>
    <div class="filter-options">
      ${uniques.map((v, i) => {
        const token = allTokens[i];
        const checked = cfg.values.length ? selectedSet.has(token) : true;
        return `<label class="filter-option"><input type="checkbox" data-token="${esc(token)}" ${checked ? "checked" : ""}><span>${esc(v)}</span></label>`;
      }).join("")}
    </div>
    <div class="filter-actions">
      <button type="button" class="filter-apply">적용</button>
      <button type="button" class="filter-reset">초기화</button>
    </div>
  `;

  document.body.appendChild(popup);

  // 팝업 위치 계산
  const triggerEl = event.currentTarget instanceof Element ? event.currentTarget : event.target;
  const rect = triggerEl.getBoundingClientRect();
  const popW = 240;
  let left = rect.left;
  let top = rect.bottom + 4;
  if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
  if (top + 420 > window.innerHeight - 8) top = Math.max(4, rect.top - 420 - 4);
  popup.style.left = `${Math.max(4, left)}px`;
  popup.style.top = `${Math.max(4, top)}px`;

  _qaFilterPopup = popup;
  _qaFilterMeta = { tableEl, colIdx, allTokens };

  // 이벤트 바인딩
  popup.querySelector(".filter-popup-close").addEventListener("click", _qaCloseFilter);

  popup.querySelector(".filter-search-input").addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();
    for (const opt of popup.querySelectorAll(".filter-option")) {
      const text = (opt.querySelector("span")?.textContent || "").toLowerCase();
      opt.style.display = !q || text.includes(q) ? "" : "none";
    }
  });

  popup.querySelector(".qa-sel-all").addEventListener("click", () => {
    for (const cb of popup.querySelectorAll('.filter-option input[type="checkbox"]')) cb.checked = true;
  });
  popup.querySelector(".qa-sel-none").addEventListener("click", () => {
    for (const cb of popup.querySelectorAll('.filter-option input[type="checkbox"]')) cb.checked = false;
  });

  for (const btn of popup.querySelectorAll(".qa-mode-btn")) {
    btn.addEventListener("click", () => {
      for (const b of popup.querySelectorAll(".qa-mode-btn")) b.classList.remove("is-active");
      btn.classList.add("is-active");
    });
  }

  popup.querySelector(".filter-apply").addEventListener("click", () => {
    if (!_qaFilterMeta) return;
    const { tableEl: te, colIdx: ci, allTokens: at } = _qaFilterMeta;
    const mode = popup.querySelector(".qa-mode-btn.is-active")?.dataset.mode || "include";
    const selected = [];
    for (const cb of popup.querySelectorAll('.filter-option input[type="checkbox"]:checked')) {
      const token = cb.getAttribute("data-token");
      if (token) selected.push(token);
    }
    const tid = te.id;
    if (!_qaFilterState[tid]) _qaFilterState[tid] = {};
    if (!selected.length || selected.length === at.length) {
      delete _qaFilterState[tid][String(ci)];
    } else {
      _qaFilterState[tid][String(ci)] = { mode, values: selected };
    }
    _qaCloseFilter();
    _qaApplyFilter(te);
  });

  popup.querySelector(".filter-reset").addEventListener("click", () => {
    if (!_qaFilterMeta) return;
    const { tableEl: te, colIdx: ci } = _qaFilterMeta;
    const tid = te.id;
    if (_qaFilterState[tid]) delete _qaFilterState[tid][String(ci)];
    _qaCloseFilter();
    _qaApplyFilter(te);
  });
}

function initQaTableFilter(tableEl) {
  if (!tableEl) return;
  let idx = 0;
  for (const th of tableEl.querySelectorAll("thead tr:first-child th")) {
    if (!th.querySelector(".qa-col-filter-btn")) {
      const colIdx = idx;
      const btn = document.createElement("span");
      btn.className = "col-filter-btn qa-col-filter-btn";
      btn.setAttribute("data-colidx", String(colIdx));
      btn.title = "필터";
      btn.innerHTML = '<i class="fas fa-filter"></i>';
      btn.style.marginLeft = "4px";
      btn.addEventListener("click", (e) => _qaOpenFilter(tableEl, colIdx, e));
      th.style.whiteSpace = "nowrap";
      th.style.position = "relative";
      th.appendChild(btn);
    }
    idx++;
  }
}

// 팝업 외부 클릭 시 닫기
document.addEventListener("click", (e) => {
  if (_qaFilterPopup && !_qaFilterPopup.contains(e.target) && !e.target.closest(".qa-col-filter-btn")) {
    _qaCloseFilter();
  }
});

// 각 테이블 필터 초기화 (페이지 로드 후)
const _qaFilterTables = [
  document.getElementById("recentStatusTable"),
  document.getElementById("regularReleaseDetailTable"),
  document.getElementById("closingSummaryDetailTable"),
];
for (const t of _qaFilterTables) {
  initQaTableFilter(t);
}

// 렌더 후 필터 재적용을 위해 원본 함수 래핑
const _origRenderRecentStatusRows = renderRecentStatusRows;
window.renderRecentStatusRows = function (data, status, groups) {
  _origRenderRecentStatusRows(data, status, groups);
  _qaApplyFilter(document.getElementById("recentStatusTable"));
};

const _origRenderRegularReleaseDetails = renderRegularReleaseDetails;
window.renderRegularReleaseDetails = function (data) {
  _origRenderRegularReleaseDetails(data);
  _qaApplyFilter(document.getElementById("regularReleaseDetailTable"));
};

const _origRenderClosingSummaryDetails = renderClosingSummaryDetails;
window.renderClosingSummaryDetails = function (data) {
  _origRenderClosingSummaryDetails(data);
  _qaApplyFilter(document.getElementById("closingSummaryDetailTable"));
};

// applyClosingTicketFilters는 직접 tbody를 갱신하므로 래핑 필요
const _origApplyClosingTicketFilters = applyClosingTicketFilters;
window.applyClosingTicketFilters = function () {
  _origApplyClosingTicketFilters();
  _qaApplyFilter(document.getElementById("closingSummaryDetailTable"));
};
