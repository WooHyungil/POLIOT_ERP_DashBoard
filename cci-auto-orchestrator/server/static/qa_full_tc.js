/* qa_full_tc.js - v20260326c */
"use strict";

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function chip(value) {
  const text = String(value || "").trim();
  if (!text) return '<span class="ftc-rc is-empty">-</span>';
  const upper = text.toUpperCase();
  if (upper === "N" || upper === "FAIL") return '<span class="ftc-rc is-n">' + esc(text) + '</span>';
  if (upper === "P" || upper === "PASS") return '<span class="ftc-rc is-p">' + esc(text) + '</span>';
  if (upper === "NT" || upper === "N/T") return '<span class="ftc-rc is-nt">' + esc(text) + '</span>';
  if (upper === "NA" || upper === "N/A") return '<span class="ftc-rc is-na">' + esc(text) + '</span>';
  return '<span class="ftc-rc">' + esc(text) + '</span>';
}

function normalizeResultBucket(value) {
  const upper = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!upper) return "empty";
  if (upper === "N" || upper === "FAIL" || upper === "F") return "fail";
  if (upper === "P" || upper === "PASS" || upper === "OK") return "pass";
  if (upper === "NT" || upper === "N/T" || upper === "NOTTESTED") return "nt";
  if (upper === "NA" || upper === "N/A" || upper === "NOTAPPLICABLE") return "na";
  return "other";
}

function countChip(value, tone) {
  return '<span class="ftc-nc' + (tone ? ' is-' + tone : '') + '">' + formatNumber(value) + '</span>';
}

function percentBar(value, total) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return '<div class="ftc-bar"><div class="ftc-bar-fill" style="width:' + pct + '%"></div><span>' + pct + '%</span></div>';
}

function toast(message, tone) {
  const stack = document.getElementById("toastStack");
  if (!stack) return;
  const item = document.createElement("div");
  item.className = "toast-item" + (tone ? " toast-" + tone : "");
  item.textContent = message;
  stack.appendChild(item);
  setTimeout(function () {
    item.classList.add("fade");
    setTimeout(function () { item.remove(); }, 220);
  }, 2200);
}

function auditLabel(code) {
  const labels = {
    active_ok: "정상",
    active_missing_y: "진행건 Full_TC 지라 NO. 누락",
    active_in_x_only: "진행건 Full_TC Closed 지라 오배치",
    active_mixed: "진행건 Full_TC Closed 지라/지라 NO. 중복",
    closed_ok: "정상",
    closed_missing_x: "Closed Full_TC Closed 지라 누락",
    closed_in_y_only: "Closed Full_TC 지라 NO. 오배치",
    closed_mixed: "Closed Full_TC Closed 지라/지라 NO. 중복",
    banned_duplicate_ok: "정상 제외",
    banned_not_a_bug_ok: "정상 제외",
    banned_duplicate_in_full_tc: "Duplicate 유입",
    banned_not_a_bug_in_full_tc: "Not a Bug 유입"
  };
  return labels[code] || code || "-";
}

function auditTone(code) {
  if (!code) return "neutral";
  if (/_ok$/.test(code)) return "ok";
  if (code.indexOf("banned_") === 0) return "danger";
  if (code.indexOf("missing") >= 0) return "warn";
  return "danger";
}

function auditChip(code) {
  return '<span class="ftc-audit-chip is-' + auditTone(code) + '">' + esc(auditLabel(code)) + '</span>';
}

function slotLabel(slot) {
  if (slot === "X") return "Full_TC Closed 지라";
  if (slot === "Y") return "Full_TC 지라 NO.";
  if (slot === "X+Y") return "Full_TC Closed 지라 + 지라 NO.";
  if (slot === "금지") return "반영 금지";
  if (slot === "-") return "미반영";
  return slot || "-";
}

function slotChip(slot) {
  const tone = slot === "X" ? "closed" : slot === "Y" ? "open" : slot === "X+Y" ? "mixed" : slot === "금지" ? "danger" : "empty";
  return '<span class="ftc-slot-chip is-' + tone + '">' + esc(slotLabel(slot)) + '</span>';
}

function refsMarkup(refs) {
  const items = Array.isArray(refs) ? refs : [];
  if (!items.length) return "-";
  return items.map(function (ref) {
    return '<span class="ftc-tc-ref">' + esc(ref.component || "") + ' ' + esc(ref.tc_id || "") + ' (' + esc(ref.field_label || "") + ')</span>';
  }).join(" ");
}

function tcIdRefsMarkup(refs) {
  const items = Array.isArray(refs) ? refs : [];
  if (!items.length) return "-";
  const unique = [];
  const seen = new Set();
  items.forEach(function (ref) {
    const tcId = String((ref && ref.tc_id) || "").trim();
    if (!tcId) return;
    const key = tcId.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(tcId);
  });
  if (!unique.length) return "-";
  return unique.map(function (tcId) {
    return '<span class="ftc-tc-ref">' + esc(tcId) + '</span>';
  }).join(" ");
}

function normalizeDefectHeader(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "");
}

function defectRawHeaderIndexMap() {
  const headers = (S.defect && Array.isArray(S.defect.defect_raw_headers)) ? S.defect.defect_raw_headers : [];
  const map = new Map();
  headers.forEach(function (header, idx) {
    const key = normalizeDefectHeader(header);
    if (!key || map.has(key)) return;
    map.set(key, idx);
  });
  return map;
}

function defectRawValue(row, aliases) {
  const values = Array.isArray(row && row.raw_values) ? row.raw_values : [];
  const indexMap = defectRawHeaderIndexMap();
  const list = Array.isArray(aliases) ? aliases : [aliases];
  for (let i = 0; i < list.length; i += 1) {
    const key = normalizeDefectHeader(list[i]);
    if (!key) continue;
    const idx = indexMap.get(key);
    if (!Number.isInteger(idx) || idx < 0 || idx >= values.length) continue;
    const val = String(values[idx] || "").trim();
    if (val) return val;
  }
  return "";
}

function hasSpaqaTcRef(row) {
  const refs = Array.isArray(row && row.tc_refs) ? row.tc_refs : [];
  return refs.some(function (ref) {
    const tcId = String((ref && ref.tc_id) || "").trim().toUpperCase();
    return tcId.indexOf("SPAQA-") === 0;
  });
}

function defectTcCoverage(row) {
  const policy = String((row && row.policy_bucket) || "").toLowerCase();
  const inX = Boolean(row && row.in_closed_jira_no);
  const inY = Boolean(row && row.in_jira_no);

  if (policy === "duplicate" || policy === "not_a_bug") {
    if (inX || inY) {
      return { tone: "danger", missing: true, label: "TC 제외 필요 (반영 금지 이슈)" };
    }
    return { tone: "ok", missing: false, label: "TC 제외 정상" };
  }

  if (policy === "closed") {
    if (inX && !inY) return { tone: "ok", missing: false, label: "반영됨 (X열)" };
    if (!inX && !inY) return { tone: "warn", missing: true, label: "누락 (Closed 반영 필요)" };
    if (!inX && inY) return { tone: "warn", missing: true, label: "반영 필요 (Closed는 X열)" };
    return { tone: "warn", missing: true, label: "정리 필요 (Closed X/Y 중복)" };
  }

  if (inY && !inX) return { tone: "ok", missing: false, label: "반영됨 (Y열)" };
  if (!inX && !inY) return { tone: "warn", missing: true, label: "누락 (반영 필요)" };
  if (inX && !inY) return { tone: "warn", missing: true, label: "오배치 (Y열 반영 필요)" };
  return { tone: "warn", missing: true, label: "정리 필요 (X/Y 중복)" };
}

function defectCoverageChip(row) {
  const coverage = defectTcCoverage(row);
  return '<span class="ftc-audit-chip is-' + coverage.tone + '">' + esc(coverage.label) + '</span>';
}

function buildDefectDisplayRow(row) {
  const coverage = defectTcCoverage(row);
  return {
    coverage: coverage,
    coverageLabel: coverage.label,
    key: String(row.key || "").trim() || "-",
    reporter: String(row.reporter || defectRawValue(row, ["Reporter", "작성자", "제보자"]) || "").trim() || "-",
    fixVersion: defectRawValue(row, ["Fix Version/s", "Fix Versions", "Fix Version", "수정 버전"]) || "-",
    status: String(row.status || "").trim() || "-",
    resolution: String(row.resolution || "").trim() || "-",
    created: String(row.created || defectRawValue(row, ["Created", "생성일", "등록일"]) || "").trim() || "-",
    priority: String(row.priority || defectRawValue(row, ["Priority", "우선순위", "심각도"]) || "").trim() || "-",
    summary: String(row.summary || defectRawValue(row, ["Summary", "요약", "제목"]) || "").trim() || "-",
    region: defectRawValue(row, ["Region", "리전"]) || "-",
    brand: defectRawValue(row, ["Brand", "브랜드"]) || "-",
    os: defectRawValue(row, ["OS", "Platform", "운영체제"]) || "-",
    components: defectRawValue(row, ["Components", "Component", "컴포넌트"]) || "-",
    affectsVersion: defectRawValue(row, ["Affects Version/s", "Affects Versions", "Affects Version", "영향 버전"]) || "-",
    assignee: String(row.assignee || defectRawValue(row, ["Assignee", "담당자"]) || "").trim() || "-",
    labels: String(row.labels || defectRawValue(row, ["Labels", "Label", "라벨"]) || "").trim() || "-",
  };
}

const DEFECT_VISIBLE_COLUMNS = [
  { label: "TC 반영 여부", key: "coverageLabel" },
  { label: "Key", key: "key" },
  { label: "Reporter", key: "reporter" },
  { label: "Fix Version/s", key: "fixVersion" },
  { label: "Status", key: "status" },
  { label: "Resolution", key: "resolution" },
  { label: "생성일", key: "created" },
  { label: "Priority", key: "priority" },
  { label: "Summary", key: "summary" },
  { label: "Region", key: "region" },
  { label: "Brand", key: "brand" },
  { label: "OS", key: "os" },
  { label: "Components", key: "components" },
  { label: "Affects Version/s", key: "affectsVersion" },
  { label: "Assignee", key: "assignee" },
  { label: "Labels", key: "labels" },
];

function renderDefectTableHead() {
  const head = document.getElementById("defectMatchHead");
  if (!head) return;
  head.innerHTML = '<tr>' + DEFECT_VISIBLE_COLUMNS.map(function (col) {
    return '<th>' + esc(col.label) + '</th>';
  }).join("") + '</tr>';
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 1000);
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function downloadDefectHtmlFallback(headers, rows) {
  const title = "Defect 대조 결과";
  const tableHead = headers.map(function (header) {
    return "<th>" + escapeHtml(header) + "</th>";
  }).join("");
  const tableBody = rows.map(function (row) {
    return "<tr>" + row.map(function (cell) {
      return "<td>" + escapeHtml(cell) + "</td>";
    }).join("") + "</tr>";
  }).join("");
  const html = '<!doctype html><html lang="ko"><head><meta charset="utf-8">' +
    '<title>' + escapeHtml(title) + '</title>' +
    '<style>' +
    'body{font-family:Segoe UI,Arial,sans-serif;padding:24px;color:#1f2937;}' +
    'h1{margin:0 0 16px;font-size:22px;}' +
    'table{border-collapse:collapse;width:100%;font-size:13px;}' +
    'th,td{border:1px solid #cfd8e3;padding:8px 10px;vertical-align:top;word-break:break-word;}' +
    'th{background:#eef5fb;}' +
    'tbody tr:nth-child(even){background:#fafcff;}' +
    '</style></head><body>' +
    '<h1>' + escapeHtml(title) + '</h1>' +
    '<table><thead><tr>' + tableHead + '</tr></thead><tbody>' + tableBody + '</tbody></table>' +
    '</body></html>';
  const stamp = new Date();
  const filename = "defect_compare_" +
    stamp.getFullYear() +
    String(stamp.getMonth() + 1).padStart(2, "0") +
    String(stamp.getDate()).padStart(2, "0") + "_" +
    String(stamp.getHours()).padStart(2, "0") +
    String(stamp.getMinutes()).padStart(2, "0") + ".html";
  const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
  downloadBlob(filename, blob);
}

async function exportDefectTable(format) {
  if (!S.defect || !S.defect.ok || !S.defect.defect_source_ok) {
    toast("추출할 Defect 데이터가 없습니다.", "warn");
    return;
  }
  const rows = getDefectFilteredRows(S.defect.rows || [], "main");
  if (!rows.length) {
    toast("현재 필터 조건에 맞는 데이터가 없습니다.", "warn");
    return;
  }
  const headers = DEFECT_VISIBLE_COLUMNS.map(function (col) { return col.label; });
  const exportRows = rows.map(function (row) {
    const item = buildDefectDisplayRow(row);
    return DEFECT_VISIBLE_COLUMNS.map(function (col) {
      return item[col.key] || "-";
    });
  });
  try {
    const response = await fetch("/api/qa/full-tc/defect-export", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: format,
        title: "Defect 대조 결과",
        columns: headers,
        rows: exportRows,
      }),
    });
    if (!response.ok) {
      let detail = "내보내기 실패";
      try {
        const data = await response.json();
        detail = String((data && (data.detail || data.message)) || detail);
      } catch (_jsonError) {
        try {
          const text = await response.text();
          if (text) detail = text;
        } catch (_textError) {
          // ignore
        }
      }
      throw new Error(detail);
    }
    const blob = await response.blob();
    const disposition = String(response.headers.get("Content-Disposition") || "");
    const matched = disposition.match(/filename="?([^";]+)"?/i);
    const filename = matched ? matched[1] : (format === "html" ? "defect_compare.html" : "defect_compare.xlsx");
    downloadBlob(filename, blob);
    toast("Defect 대조 결과를 " + String(format || "").toUpperCase() + "로 추출했습니다.", "ok");
  } catch (error) {
    if (format === "html") {
      downloadDefectHtmlFallback(headers, exportRows);
      toast("HTML 다운로드를 브라우저에서 직접 생성해 완료했습니다.", "ok");
      return;
    }
    toast((error && error.message) || "내보내기 실패", "error");
  }
}

const FTC_INLINE_OVERRIDE_KEY = "qa_full_tc_inline_overrides_v1";
const FTC_TRANSPORT_SNAPSHOT_KEY = "qa_full_tc_transport_snapshot_v1";
const FTC_BRIDGE_PERF_POLL_MS = 30000;
const FTC_BRIDGE_AUTO_HEAL_COOLDOWN_MS = 60000;
const FTC_BRIDGE_DEGRADED_MIN_SAMPLES = 4;
const FTC_FILTER_INPUT_DEBOUNCE_MS = 180;
const FTC_DEFAULT_PAGE_SIZE = 200;
const FTC_SUMMARY_TIMEOUT_MS = 45000;
const FTC_DEFECT_TIMEOUT_MS = 60000;
const FTC_BRIDGE_TIMEOUT_MS = 70000;
const FTC_BRIDGE_PERF_TIMEOUT_MS = 12000;

const FTC_VIEW_ALIAS = {
  summary: "summary",
  group: "group",
  label: "label",
  defect: "defect",
  missing: "defect",
};

const FTC_SECTION_LABEL = {
  summary: "Statistics",
  group: "카테고리 분석",
  label: "LABEL 통계",
  defect: "Defect 대조",
};

function loadInlineOverrides() {
  try {
    const raw = localStorage.getItem(FTC_INLINE_OVERRIDE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_e) {
    return {};
  }
}

function saveInlineOverrides() {
  try {
    localStorage.setItem(FTC_INLINE_OVERRIDE_KEY, JSON.stringify(S.inlineOverrides || {}));
  } catch (_e) {
    // 저장 실패 시에도 페이지 동작은 유지
  }
}

function rowOverrideKey(row) {
  return [String(row.component || ""), String(row.tc_id || ""), String(row.sheet_row || "")].join("::");
}

function applyInlineOverride(row) {
  const key = rowOverrideKey(row);
  const override = (S.inlineOverrides && S.inlineOverrides[key]) || null;
  if (!override) return row;
  return Object.assign({}, row, {
    base_result: override.base_result || row.base_result,
    nt_na_reason: override.nt_na_reason || row.nt_na_reason,
    nt_na_filter: override.nt_na_filter || row.nt_na_filter,
  });
}

const S = {
  data: null,
  defect: null,
  bridge: null,
  bridgePerf: null,
  transportBaseText: "연결 준비중",
  transportBaseTone: null,
  bridgePerfTimer: null,
  lastBridgeAutoHealAt: 0,
  tab: "summary",
  summaryView: "brand",
  component: "all",
  activeLabel: "",
  groupQuery: "",
  groupLimit: 100,
  labelQuery: "",
  labelLimit: 100,
  query: "",
  nOnly: false,
  ntOnly: false,  // N/T만 표시
  naOnly: false,  // N/A만 표시
  colGroups: { basic: true, tc: false, result: true, issue: true },
  inlineOverrides: loadInlineOverrides(),
  defectQuery: "",
  defectStatus: "all",
  defectRangeMin: "SPAQA-12000",
  defectRangeMax: "",
  pageSize: FTC_DEFAULT_PAGE_SIZE,
  pageDetail: 1,
  pageDefectMissing: 1,
  pageDefectMissingTc: 1,
  pageDefectAllColumns: 1,
  pageDefectMatch: 1,
  pageDefectViolation: 1,
  pageBrandDrill: 1,
  pageCategoryDrill: 1,
  detailFocusKey: "",
  brandDrill: null,
  brandDrillViolationOnly: false,
  categoryDrill: null,
  labelBrandDrill: null,   // { label, brand }
  labelRowDrill: null,     // { label, brand, component }
  labelRowDrillPage: 1,
  defectFilterCache: {
    main: { key: "", source: null, rows: [] },
    violation: { key: "", source: null, rows: [] }
  }
};

let mainFilterDebounceTimer = null;
let defectFilterDebounceTimer = null;

function scheduleMainRender() {
  if (mainFilterDebounceTimer) {
    window.clearTimeout(mainFilterDebounceTimer);
  }
  mainFilterDebounceTimer = window.setTimeout(function () {
    renderAll();
  }, FTC_FILTER_INPUT_DEBOUNCE_MS);
}

function scheduleDefectRender() {
  if (defectFilterDebounceTimer) {
    window.clearTimeout(defectFilterDebounceTimer);
  }
  defectFilterDebounceTimer = window.setTimeout(function () {
    renderDefectKpi();
    renderDefectTable();
  }, FTC_FILTER_INPUT_DEBOUNCE_MS);
}

function invalidateDefectFilterCache() {
  S.defectFilterCache.main = { key: "", source: null, rows: [] };
  S.defectFilterCache.violation = { key: "", source: null, rows: [] };
}

function clampPage(page, totalPages) {
  const p = Number(page);
  if (!Number.isFinite(p) || p < 1) return 1;
  if (p > totalPages) return totalPages;
  return p;
}

function paginateRows(rows, page) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const size = Math.max(20, Number(S.pageSize || FTC_DEFAULT_PAGE_SIZE));
  const total = safeRows.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage = clampPage(page, totalPages);
  const start = (safePage - 1) * size;
  const end = Math.min(start + size, total);
  return {
    rows: safeRows.slice(start, end),
    total: total,
    totalPages: totalPages,
    page: safePage,
    start: total ? start + 1 : 0,
    end: end,
  };
}

function pageStateKey(target) {
  if (target === "detail") return "pageDetail";
  if (target === "brand_drill") return "pageBrandDrill";
  if (target === "category_drill") return "pageCategoryDrill";
  if (target === "defect_missing") return "pageDefectMissing";
  if (target === "defect_missing_tc") return "pageDefectMissingTc";
  if (target === "defect_all_columns") return "pageDefectAllColumns";
  if (target === "defect_match") return "pageDefectMatch";
  if (target === "defect_violation") return "pageDefectViolation";
  return "";
}

function updatePage(target, nextPage) {
  const key = pageStateKey(target);
  if (!key) return;
  S[key] = Math.max(1, Number(nextPage || 1));
  if (target === "detail") {
    renderDetailTable();
    return;
  }
  if (target === "brand_drill") {
    renderBrandDrillRows();
    return;
  }
  if (target === "category_drill") {
    renderCategoryDrillRows();
    return;
  }
  if (target === "defect_missing") {
    renderDefectMissingKeyTable();
    return;
  }
  if (target === "defect_missing_tc") {
    renderDefectMissingTcTable();
    return;
  }
  if (target === "defect_all_columns") {
    renderDefectAllColumnsTable();
    return;
  }
  if (target === "defect_match") {
    renderDefectTable();
    return;
  }
  if (target === "defect_violation") {
    renderDefectViolationTable();
  }
}

function renderPagination(elId, target, pageInfo) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!pageInfo || pageInfo.total <= 0) {
    el.innerHTML = "";
    return;
  }
  const page = Number(pageInfo.page || 1);
  const totalPages = Number(pageInfo.totalPages || 1);
  const prevDisabled = page <= 1 ? " disabled" : "";
  const nextDisabled = page >= totalPages ? " disabled" : "";
  const summary = '<span class="ftc-page-summary">' + formatNumber(pageInfo.start) + '-' + formatNumber(pageInfo.end) + ' / ' + formatNumber(pageInfo.total) + '건</span>';
  const controls = '<div class="ftc-page-controls">' +
    '<button type="button" class="ftc-page-btn" data-page-target="' + target + '" data-page="1"' + prevDisabled + '>처음</button>' +
    '<button type="button" class="ftc-page-btn" data-page-target="' + target + '" data-page="' + (page - 1) + '"' + prevDisabled + '>이전</button>' +
    '<span class="ftc-page-current">' + page + ' / ' + totalPages + '</span>' +
    '<button type="button" class="ftc-page-btn" data-page-target="' + target + '" data-page="' + (page + 1) + '"' + nextDisabled + '>다음</button>' +
    '<button type="button" class="ftc-page-btn" data-page-target="' + target + '" data-page="' + totalPages + '"' + nextDisabled + '>마지막</button>' +
    '</div>';
  el.innerHTML = summary + controls;
}

function resetMainPagination() {
  S.pageDetail = 1;
  S.pageBrandDrill = 1;
  S.pageCategoryDrill = 1;
}

function resetDefectPagination() {
  S.pageDefectMissing = 1;
  S.pageDefectMissingTc = 1;
  S.pageDefectAllColumns = 1;
  S.pageDefectMatch = 1;
  S.pageDefectViolation = 1;
}

function normalizeIssueThreshold(value) {
  const text = String(value == null ? "" : value).trim().toUpperCase();
  if (!text) return null;
  const matched = text.match(/-(\d+)$/) || text.match(/(\d+)$/);
  if (!matched) return null;
  const num = Number(matched[1]);
  return Number.isFinite(num) ? Math.trunc(num) : null;
}

function toneRank(tone) {
  if (tone === "danger") return 3;
  if (tone === "warn") return 2;
  if (tone === "ok") return 1;
  return 0;
}

function bridgePerfTone(perf) {
  if (!perf || !Number(perf.sample_count)) return null;
  const okRate = Number(perf.full_ok_rate || 0);
  const p95 = Number(perf.p95_ms || 0);
  if (okRate < 85 || p95 >= 10000) return "danger";
  if (okRate < 95 || p95 >= 5000) return "warn";
  return "ok";
}

function composeTransportText(baseText) {
  const text = baseText || "연결 준비중";
  const perf = S.bridgePerf;
  if (!perf || !Number(perf.sample_count)) return text;
  const okRate = Number(perf.full_ok_rate || 0);
  const p95 = Number(perf.p95_ms || 0);
  const sampleCount = Number(perf.sample_count || 0);
  return text + " | ok " + okRate.toFixed(1) + "% | p95 " + Math.round(p95) + "ms | n=" + sampleCount;
}

function mergedTransportTone(baseTone) {
  const perfTone = bridgePerfTone(S.bridgePerf);
  return toneRank(perfTone) > toneRank(baseTone) ? perfTone : baseTone;
}

function setTransportHint(text, tone) {
  const el = document.getElementById("qaFullTcTransportHint");
  if (!el) return;
  S.transportBaseText = text || "연결 준비중";
  S.transportBaseTone = tone || null;
  const mergedTone = mergedTransportTone(S.transportBaseTone);
  el.textContent = composeTransportText(S.transportBaseText);
  el.classList.remove("is-ok", "is-warn", "is-danger");
  if (mergedTone === "ok" || mergedTone === "warn" || mergedTone === "danger") {
    el.classList.add("is-" + mergedTone);
  }
}

function maybeAutoHealBridge() {
  const perf = S.bridgePerf;
  if (!perf) return;
  const sampleCount = Number(perf.sample_count || 0);
  if (sampleCount < FTC_BRIDGE_DEGRADED_MIN_SAMPLES) return;
  const okRate = Number(perf.full_ok_rate || 0);
  const p95 = Number(perf.p95_ms || 0);
  const isDegraded = okRate < 92 || p95 >= 7000;
  if (!isDegraded) return;
  const now = Date.now();
  if (now - Number(S.lastBridgeAutoHealAt || 0) < FTC_BRIDGE_AUTO_HEAL_COOLDOWN_MS) return;
  S.lastBridgeAutoHealAt = now;
  setTransportHint("Bridge 자동복구 시도", "warn");
  loadBridge(true)
    .then(function () {
      setTransportHint("Bridge 자동복구 완료", "warn");
      renderAll();
      renderIntegrityAlert();
      toast("브리지 품질 저하로 자동복구를 실행했습니다.", "ok");
    })
    .catch(function () {
      setTransportHint("Bridge 자동복구 실패", "danger");
    });
}

async function loadBridgePerf() {
  const data = await fetchJsonWithRetry("/api/qa/full-tc/bridge/perf?window_sec=300", { method: "GET" }, 1, FTC_BRIDGE_PERF_TIMEOUT_MS);
  if (!data || !data.ok) return;
  S.bridgePerf = data;
  setTransportHint(S.transportBaseText, S.transportBaseTone);
  maybeAutoHealBridge();
}

function startBridgePerfPolling() {
  if (S.bridgePerfTimer) {
    window.clearInterval(S.bridgePerfTimer);
    S.bridgePerfTimer = null;
  }
  loadBridgePerf().catch(function () {
    // Perf panel is best effort and should not block core data rendering.
  });
  S.bridgePerfTimer = window.setInterval(function () {
    loadBridgePerf().catch(function () {
      // Ignore perf polling failures.
    });
  }, FTC_BRIDGE_PERF_POLL_MS);
}

function saveTransportSnapshot() {
  if (!S.data) return;
  try {
    localStorage.setItem(FTC_TRANSPORT_SNAPSHOT_KEY, JSON.stringify({
      saved_at: new Date().toISOString(),
      summary: S.data || null,
      defect: S.defect || null,
      bridge: S.bridge || null,
    }));
  } catch (_e) {
    // Storage failure should not block rendering.
  }
}

function restoreTransportSnapshot() {
  try {
    const raw = localStorage.getItem(FTC_TRANSPORT_SNAPSHOT_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return false;
    if (parsed.summary && typeof parsed.summary === "object") {
      S.data = parsed.summary;
    }
    if (parsed.defect && typeof parsed.defect === "object") {
      S.defect = parsed.defect;
    }
    if (parsed.bridge && typeof parsed.bridge === "object") {
      S.bridge = parsed.bridge;
    }
    return Boolean(S.data);
  } catch (_e) {
    return false;
  }
}

function renderIntegrityAlert() {
  const alertEl = document.getElementById("qaFullTcIntegrityAlert");
  if (!alertEl) return;
  const summaryRows = Number((S.data && S.data.totals && S.data.totals.row_count) || 0);
  const defectRows = Number((S.defect && S.defect.total_defects) || 0);
  const violations = Number((S.defect && S.defect.audit_totals && S.defect.audit_totals.violation_count) || 0);
  const closedYOnly = Number((S.defect && S.defect.audit_totals && S.defect.audit_totals.closed_in_y_only) || 0);
  const mismatch = summaryRows > 0 && defectRows > 0 && Math.abs(summaryRows - defectRows) > Math.max(10, Math.round(summaryRows * 0.4));
  if (!mismatch && violations <= 0 && closedYOnly <= 0) {
    alertEl.hidden = true;
    alertEl.textContent = "";
    return;
  }
  const parts = [];
  if (mismatch) {
    parts.push("요약/대조 행 수 편차 큼");
  }
  if (violations > 0) {
    parts.push("위반 " + formatNumber(violations) + "건");
  }
  if (closedYOnly > 0) {
    parts.push("Closed인데 Y열 " + formatNumber(closedYOnly) + "건");
  }
  alertEl.hidden = false;
  alertEl.textContent = "무결성 경고: " + parts.join(" | ");
}

function setLoadAlert(message, tone) {
  const el = document.getElementById("qaFullTcLoadAlert");
  if (!el) return;
  const text = String(message || "").trim();
  if (!text) {
    el.hidden = true;
    el.textContent = "";
    el.classList.remove("is-warn", "is-danger");
    return;
  }
  el.hidden = false;
  el.textContent = text;
  el.classList.remove("is-warn", "is-danger");
  if (tone === "warn" || tone === "danger") {
    el.classList.add("is-" + tone);
  }
}

function isAuthError(error) {
  const text = String((error && error.message) || "").toLowerCase();
  return text.includes("인증") || text.includes("로그인") || text.includes("401") || text.includes("unauthorized");
}

async function fetchJsonWithRetry(url, options, retries, timeoutMs) {
  const maxRetries = Number.isFinite(retries) ? Math.max(0, retries) : 2;
  const waitMs = Number.isFinite(timeoutMs) ? Math.max(0, timeoutMs) : FTC_SUMMARY_TIMEOUT_MS;
  let lastError = null;
  for (let i = 0; i <= maxRetries; i += 1) {
    const controller = new AbortController();
    const timer = waitMs > 0 ? window.setTimeout(function () {
      controller.abort();
    }, waitMs) : null;
    try {
      const response = await fetch(url, {
        credentials: "same-origin",
        ...options,
        signal: controller.signal,
      });
      let data = null;
      try {
        data = await response.json();
      } catch (_e) {
        data = null;
      }
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("인증이 만료되어 데이터를 가져오지 못했습니다. 다시 로그인 후 시도해 주세요.");
        }
        const detail = data && data.detail ? data.detail : "요청 실패";
        throw new Error(detail);
      }
      return data || {};
    } catch (error) {
      lastError = error;
      const isAbort = error && error.name === "AbortError";
      if (i >= maxRetries) break;
      await new Promise(function (resolve) {
        window.setTimeout(resolve, isAbort ? 180 : 120 * (i + 1));
      });
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }
  throw (lastError || new Error("요청 실패"));
}

async function loadBridge(force, includeDefect) {
  const shouldIncludeDefect = includeDefect !== false;
  const qs = [];
  if (force) qs.push("force=true");
  qs.push("include_defect=" + (shouldIncludeDefect ? "true" : "false"));
  const url = "/api/qa/full-tc/bridge" + (qs.length ? "?" + qs.join("&") : "");
  const data = await fetchJsonWithRetry(url, { method: "GET" }, 2, FTC_BRIDGE_TIMEOUT_MS);
  const summary = data && data.summary ? data.summary : null;
  const defect = data && data.defect ? data.defect : null;
  if (!summary || !summary.ok) {
    throw new Error((summary && summary.detail) || "브리지 요약 로드 실패");
  }
  S.bridge = data;
  S.data = summary;
  if (defect) {
    S.defect = defect;
  }
  const health = data && data.health ? data.health : {};
  if (health.summary_ok && (shouldIncludeDefect ? health.defect_ok : true)) {
    setTransportHint("Bridge 정상", "ok");
  } else if (health.summary_ok) {
    setTransportHint("Bridge 부분정상", "warn");
  } else {
    setTransportHint("Bridge 장애", "danger");
  }
  saveTransportSnapshot();
  renderIntegrityAlert();
  return data;
}

function parseRangeNumber(value) {
  const text = String(value == null ? "" : value).trim();
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) ? Math.trunc(num) : null;
}

function normalizeViewTab(rawView) {
  const key = String(rawView || "summary").trim().toLowerCase();
  return FTC_VIEW_ALIAS[key] || "summary";
}

function readTabFromUrl() {
  const params = new URLSearchParams(window.location.search || "");
  return normalizeViewTab(params.get("view"));
}

function applyViewPresetFromUrl() {
  const params = new URLSearchParams(window.location.search || "");
  const view = String(params.get("view") || "").trim().toLowerCase();
  if (view === "missing") {
    S.defectStatus = "missing";
  }
}

function syncDefectStatusChips() {
  document.querySelectorAll(".ftc-status-chip").forEach(function (chipEl) {
    chipEl.classList.toggle("active", chipEl.dataset.status === S.defectStatus);
  });
}

function updateSectionTitle(tab) {
  const el = document.getElementById("qaFullTcSectionTitle");
  if (!el) return;
  el.textContent = FTC_SECTION_LABEL[tab] || FTC_SECTION_LABEL.summary;
}

function switchTab(tab, syncUrl) {
  const normalized = normalizeViewTab(tab);
  const shouldSyncUrl = syncUrl !== false;
  S.tab = normalized;
  document.querySelectorAll(".ftc-tab").forEach(function (button) {
    button.classList.toggle("active", button.dataset.tab === normalized);
    button.setAttribute("aria-selected", button.dataset.tab === normalized ? "true" : "false");
  });
  document.querySelectorAll(".ftc-panel").forEach(function (panel) {
    panel.classList.toggle("ftc-panel-hidden", panel.id !== "panel-" + normalized);
  });
  updateSectionTitle(normalized);
  syncDefectStatusChips();
  if (shouldSyncUrl) {
    const params = new URLSearchParams(window.location.search || "");
    params.set("view", normalized);
    const next = window.location.pathname + "?" + params.toString();
    window.history.replaceState({}, "", next);
  }
  if (normalized === "defect" && !S.defect) {
    loadDefectMatch(false).catch(function (error) {
      toast(error.message || "Defect 대조 로드 실패", "error");
    });
    return;
  }
  renderAll();
}

function hasFailureLikeResult(row) {
  return [
    "base_result", "koa_result", "koa_android", "koa_ios",
    "hoa_result", "hoa_android", "hoa_ios",
    "goa_result", "goa_android", "goa_ios"
  ].some(function (key) {
    const value = String(row[key] || "").trim().toUpperCase();
    return value === "N" || value === "FAIL";
  });
}

function hasNTResult(row) {
  // N/T 결과 판정
  return row && (String(row.nt_na_filter || "").trim().toUpperCase() === "N/T");
}

function hasNAResult(row) {
  // N/A 결과 판정
  return row && (String(row.nt_na_filter || "").trim().toUpperCase() === "N/A");
}

function detailMatchesQuery(row, query) {
  if (!query) return true;
  const haystack = [
    row.component, row.tc_id, row.category, row.depth1, row.depth2, row.depth3,
    row.direction, row.brand, row.priority, row.pre_condition, row.tc_procedure,
    row.expected_result, row.closed_jira_no, row.jira_no, row.nt_na_reason,
    row.nt_na_filter, row.label
  ].map(function (value) {
    return String(value || "").toLowerCase();
  }).join(" ");
  return haystack.includes(query.toLowerCase());
}

function splitLabelTokens(value) {
  return String(value || "")
    .split(/[\n,;/|]+/)
    .map(function (item) { return item.trim(); })
    .filter(Boolean);
}

function rowHasLabel(row, label) {
  const target = String(label || "").trim().toLowerCase();
  if (!target) return false;
  return splitLabelTokens(row && row.label).some(function (token) {
    return token.toLowerCase() === target;
  });
}

function markQueryText(value, query) {
  const text = String(value || "");
  const q = String(query || "").trim();
  if (!q) return esc(text);
  const lower = text.toLowerCase();
  const token = q.toLowerCase();
  const idx = lower.indexOf(token);
  if (idx < 0) return esc(text);
  const before = esc(text.slice(0, idx));
  const hit = esc(text.slice(idx, idx + token.length));
  const after = esc(text.slice(idx + token.length));
  return before + '<mark class="ftc-cat-hit">' + hit + '</mark>' + after;
}

function aggregateCategoryRows(rows) {
  const map = {};
  rows.forEach(function (row) {
    const component = String(row.component || "-");
    const depth1 = String(row.depth1 || "(대분류 없음)");
    const depth2 = String(row.depth2 || "(중분류 없음)");
    const depth3 = String(row.depth3 || "(소분류 없음)");
    const key = [component, depth1, depth2, depth3].join("||");
    if (!map[key]) {
      map[key] = { component: component, depth1: depth1, depth2: depth2, depth3: depth3, count: 0 };
    }
    map[key].count += 1;
  });
  return Object.keys(map).map(function (key) { return map[key]; });
}

function renderCategoryOutlineTable(aggregated, query) {
  const hint = document.getElementById("qaFullTcCategoryOutlineHint");
  const body = document.getElementById("qaFullTcCategoryOutlineBody");
  if (!body) return;

  const list = Array.isArray(aggregated) ? aggregated : [];
  if (!list.length) {
    if (hint) hint.textContent = "";
    body.innerHTML = '<tr><td colspan="5" class="hint">카테고리 데이터가 없습니다.</td></tr>';
    return;
  }

  const componentMap = new Map();
  list.forEach(function (item) {
    const componentName = String(item.component || "-");
    const depth1Name = String(item.depth1 || "(대분류 없음)");
    const depth2Name = String(item.depth2 || "(중분류 없음)");
    const depth3Name = String(item.depth3 || "(소분류 없음)");
    const count = Number(item.count || 0);

    let component = componentMap.get(componentName);
    if (!component) {
      component = { name: componentName, total: 0, leafCount: 0, depth1List: [], depth1Map: new Map() };
      componentMap.set(componentName, component);
    }
    component.total += count;

    let depth1 = component.depth1Map.get(depth1Name);
    if (!depth1) {
      depth1 = { name: depth1Name, total: 0, leafCount: 0, depth2List: [], depth2Map: new Map() };
      component.depth1Map.set(depth1Name, depth1);
      component.depth1List.push(depth1);
    }
    depth1.total += count;

    let depth2 = depth1.depth2Map.get(depth2Name);
    if (!depth2) {
      depth2 = { name: depth2Name, total: 0, leafCount: 0, depth3List: [], depth3Map: new Map() };
      depth1.depth2Map.set(depth2Name, depth2);
      depth1.depth2List.push(depth2);
    }
    depth2.total += count;

    let depth3 = depth2.depth3Map.get(depth3Name);
    if (!depth3) {
      depth3 = { name: depth3Name, count: 0 };
      depth2.depth3Map.set(depth3Name, depth3);
      depth2.depth3List.push(depth3);
    }
    depth3.count += count;
  });

  const components = Array.from(componentMap.values());
  components.forEach(function (component) {
    component.leafCount = 0;
    component.depth1List.forEach(function (depth1) {
      depth1.leafCount = 0;
      depth1.depth2List.forEach(function (depth2) {
        depth2.leafCount = Math.max(1, depth2.depth3List.length);
        depth1.leafCount += depth2.leafCount;
      });
      component.leafCount += depth1.leafCount;
    });
  });

  const totalLeaf = list.reduce(function (sum, row) { return sum + Number(row.count || 0); }, 0);
  if (hint) {
    hint.textContent = "컴포넌트 " + formatNumber(components.length) + "개 · 소분류 " + formatNumber(list.length) + "개 · TC " + formatNumber(totalLeaf) + "건";
  }

  const rows = [];
  components.forEach(function (component) {
    component.depth1List.forEach(function (depth1, d1Idx) {
      depth1.depth2List.forEach(function (depth2, d2Idx) {
        depth2.depth3List.forEach(function (depth3, d3Idx) {
          const cells = [];
          if (d1Idx === 0 && d2Idx === 0 && d3Idx === 0) {
            cells.push(
              '<td rowspan="' + component.leafCount + '">' +
                '<div class="ftc-cat-outline-cell is-component"><strong>' + markQueryText(component.name, query) + '</strong><span>TC ' + formatNumber(component.total) + '</span></div>' +
              '</td>'
            );
          }
          if (d2Idx === 0 && d3Idx === 0) {
            const selectedDepth1 = !!(S.categoryDrill &&
              S.categoryDrill.level === "depth1" &&
              S.categoryDrill.component === component.name &&
              S.categoryDrill.depth1 === depth1.name);
            cells.push(
              '<td rowspan="' + depth1.leafCount + '">' +
                '<div class="ftc-cat-outline-cell is-depth1"><strong>' + markQueryText(depth1.name, query) + '</strong>' +
                '<button type="button" class="ftc-cat-count-btn ftc-cat-inline-btn' + (selectedDepth1 ? ' active' : '') + '"' +
                  ' data-level="depth1"' +
                  ' data-component="' + esc(component.name) + '"' +
                  ' data-depth1="' + esc(depth1.name) + '">' + formatNumber(depth1.total) + '</button></div>' +
              '</td>'
            );
          }
          if (d3Idx === 0) {
            const selectedDepth2 = !!(S.categoryDrill &&
              S.categoryDrill.level === "depth2" &&
              S.categoryDrill.component === component.name &&
              S.categoryDrill.depth1 === depth1.name &&
              S.categoryDrill.depth2 === depth2.name);
            cells.push(
              '<td rowspan="' + depth2.leafCount + '">' +
                '<div class="ftc-cat-outline-cell is-depth2"><strong>' + markQueryText(depth2.name, query) + '</strong>' +
                '<button type="button" class="ftc-cat-count-btn ftc-cat-inline-btn' + (selectedDepth2 ? ' active' : '') + '"' +
                  ' data-level="depth2"' +
                  ' data-component="' + esc(component.name) + '"' +
                  ' data-depth1="' + esc(depth1.name) + '"' +
                  ' data-depth2="' + esc(depth2.name) + '">' + formatNumber(depth2.total) + '</button></div>' +
              '</td>'
            );
          }
          cells.push('<td><div class="ftc-cat-outline-cell is-depth3"><strong>' + markQueryText(depth3.name, query) + '</strong></div></td>');
          const selected = !!(S.categoryDrill &&
            S.categoryDrill.level === "depth3" &&
            S.categoryDrill.component === component.name &&
            S.categoryDrill.depth1 === depth1.name &&
            S.categoryDrill.depth2 === depth2.name &&
            S.categoryDrill.depth3 === depth3.name);
          cells.push('<td><button type="button" class="ftc-cat-count-btn' + (selected ? ' active' : '') + '"' +
            ' data-level="depth3"' +
            ' data-component="' + esc(component.name) + '"' +
            ' data-depth1="' + esc(depth1.name) + '"' +
            ' data-depth2="' + esc(depth2.name) + '"' +
            ' data-depth3="' + esc(depth3.name) + '">' + formatNumber(depth3.count) + '</button></td>');
          rows.push('<tr>' + cells.join("") + '</tr>');
        });
      });
    });
  });
  body.innerHTML = rows.join("");
}

function buildCategoryDrillRows() {
  if (!S.categoryDrill) return [];
  const selected = S.categoryDrill;
  const rows = filterDetail(S.data && S.data.detail_rows ? S.data.detail_rows : []);
  return rows.filter(function (row) {
    const component = String(row.component || "-");
    const depth1 = String(row.depth1 || "(대분류 없음)");
    const depth2 = String(row.depth2 || "(중분류 없음)");
    const depth3 = String(row.depth3 || "(소분류 없음)");
    if (component !== selected.component) return false;
    if (selected.level === "depth1") {
      return depth1 === selected.depth1;
    }
    if (selected.level === "depth2") {
      return depth1 === selected.depth1 && depth2 === selected.depth2;
    }
    return depth1 === selected.depth1 && depth2 === selected.depth2 && depth3 === selected.depth3;
  });
}

function renderCategoryDrillRows() {
  const wrap = document.getElementById("qaFullTcCategoryDrillWrap");
  const hint = document.getElementById("qaFullTcCategoryDrillHint");
  const body = document.getElementById("qaFullTcCategoryDrillBody");
  if (!wrap || !body) return;

  if (!S.categoryDrill) {
    wrap.hidden = true;
    body.innerHTML = "";
    renderPagination("qaFullTcCategoryDrillPagination", "category_drill", { total: 0 });
    return;
  }

  const rows = buildCategoryDrillRows();
  const pageInfo = paginateRows(rows, S.pageCategoryDrill);
  S.pageCategoryDrill = pageInfo.page;
  wrap.hidden = false;

  if (hint) {
    const scope = S.categoryDrill.level === "depth1"
      ? (S.categoryDrill.component + " · " + S.categoryDrill.depth1)
      : S.categoryDrill.level === "depth2"
        ? (S.categoryDrill.component + " · " + S.categoryDrill.depth1 + " · " + S.categoryDrill.depth2)
        : (S.categoryDrill.component + " · " + S.categoryDrill.depth1 + " · " + S.categoryDrill.depth2 + " · " + S.categoryDrill.depth3);
    hint.textContent = scope +
      " | " + rows.length + "건" + (rows.length ? " | " + pageInfo.start + "~" + pageInfo.end + " 표시" : "");
  }

  if (!pageInfo.rows.length) {
    body.innerHTML = '<tr><td colspan="28" class="hint">조회 결과 없음</td></tr>';
    renderPagination("qaFullTcCategoryDrillPagination", "category_drill", pageInfo);
    return;
  }

  body.innerHTML = pageInfo.rows.map(function (row) {
    return '<tr>' +
      '<td>' + esc(row.component || "-") + '</td>' +
      '<td>' + esc(row.tc_id || "-") + '</td>' +
      '<td>' + esc(row.sheet_row || "-") + '</td>' +
      '<td>' + esc(row.category || "-") + '</td>' +
      '<td>' + esc(row.depth1 || "-") + '</td>' +
      '<td>' + esc(row.depth2 || "-") + '</td>' +
      '<td>' + esc(row.depth3 || "-") + '</td>' +
      '<td>' + esc(row.direction || "-") + '</td>' +
      '<td>' + esc(row.brand || "-") + '</td>' +
      '<td>' + esc(row.priority || "-") + '</td>' +
      '<td class="ftc-text-cell">' + esc(row.pre_condition || "-") + '</td>' +
      '<td class="ftc-text-cell">' + esc(row.tc_procedure || "-") + '</td>' +
      '<td class="ftc-text-cell">' + esc(row.expected_result || "-") + '</td>' +
      '<td>' + chip(row.base_result) + '</td>' +
      '<td>' + chip(row.koa_result) + '</td>' +
      '<td>' + chip(row.koa_android) + '</td>' +
      '<td>' + chip(row.koa_ios) + '</td>' +
      '<td>' + chip(row.hoa_result) + '</td>' +
      '<td>' + chip(row.hoa_android) + '</td>' +
      '<td>' + chip(row.hoa_ios) + '</td>' +
      '<td>' + chip(row.goa_result) + '</td>' +
      '<td>' + chip(row.goa_android) + '</td>' +
      '<td>' + chip(row.goa_ios) + '</td>' +
      '<td>' + esc(row.closed_jira_no || "-") + '</td>' +
      '<td>' + esc(row.jira_no || "-") + '</td>' +
      '<td class="ftc-text-cell">' + esc(row.nt_na_reason || "-") + '</td>' +
      '<td>' + esc(row.nt_na_filter || "-") + '</td>' +
      '<td class="ftc-label-cell">' + esc(row.label || "-") + '</td>' +
      '</tr>';
  }).join("");
  renderPagination("qaFullTcCategoryDrillPagination", "category_drill", pageInfo);
}

function buildLabelProgressMap(detailRows) {
  const map = {};
  (detailRows || []).forEach(function (row) {
    const labels = splitLabelTokens(row.label);
    if (!labels.length) return;
    const baseBucket = normalizeResultBucket(row.base_result);
    const baseDone = baseBucket !== "empty" ? 1 : 0;
    const koaBucket = normalizeResultBucket(row.koa_result);
    const hoaBucket = normalizeResultBucket(row.hoa_result);
    const goaBucket = normalizeResultBucket(row.goa_result);
    const koaDone = koaBucket !== "empty" ? 1 : 0;
    const hoaDone = hoaBucket !== "empty" ? 1 : 0;
    const goaDone = goaBucket !== "empty" ? 1 : 0;
    labels.forEach(function (label) {
      if (!map[label]) {
        map[label] = {
          total: 0,
          baseDone: 0,
          koaDone: 0,
          hoaDone: 0,
          goaDone: 0,
          pass: 0,
          fail: 0,
          nt: 0,
          na: 0,
          empty: 0,
          koa: { pass: 0, fail: 0, nt: 0, na: 0, empty: 0 },
          hoa: { pass: 0, fail: 0, nt: 0, na: 0, empty: 0 },
          goa: { pass: 0, fail: 0, nt: 0, na: 0, empty: 0 },
        };
      }
      map[label].total += 1;
      map[label].baseDone += baseDone;
      map[label].koaDone += koaDone;
      map[label].hoaDone += hoaDone;
      map[label].goaDone += goaDone;
      if (baseBucket === "pass") map[label].pass += 1;
      else if (baseBucket === "fail") map[label].fail += 1;
      else if (baseBucket === "nt") map[label].nt += 1;
      else if (baseBucket === "na") map[label].na += 1;
      else map[label].empty += 1;

      if (koaBucket === "pass") map[label].koa.pass += 1;
      else if (koaBucket === "fail") map[label].koa.fail += 1;
      else if (koaBucket === "nt") map[label].koa.nt += 1;
      else if (koaBucket === "na") map[label].koa.na += 1;
      else map[label].koa.empty += 1;

      if (hoaBucket === "pass") map[label].hoa.pass += 1;
      else if (hoaBucket === "fail") map[label].hoa.fail += 1;
      else if (hoaBucket === "nt") map[label].hoa.nt += 1;
      else if (hoaBucket === "na") map[label].hoa.na += 1;
      else map[label].hoa.empty += 1;

      if (goaBucket === "pass") map[label].goa.pass += 1;
      else if (goaBucket === "fail") map[label].goa.fail += 1;
      else if (goaBucket === "nt") map[label].goa.nt += 1;
      else if (goaBucket === "na") map[label].goa.na += 1;
      else map[label].goa.empty += 1;
    });
  });
  return map;
}

function progressRateText(done, total) {
  const nDone = Number(done || 0);
  const nTotal = Number(total || 0);
  if (!nTotal) return "0%";
  return Math.round((nDone / nTotal) * 100) + "%";
}

function percentText(count, total) {
  const nCount = Number(count || 0);
  const nTotal = Number(total || 0);
  if (!nTotal) return "0%";
  return Math.round((nCount / nTotal) * 100) + "%";
}

function resultCountSetMarkup(resultMap) {
  const r = resultMap || { pass: 0, fail: 0, nt: 0, na: 0, empty: 0 };
  return '<div class="ftc-result-count-set">' +
    '<span class="ftc-mini-count-chip is-pass">P ' + formatNumber(r.pass) + '</span>' +
    '<span class="ftc-mini-count-chip is-fail">F ' + formatNumber(r.fail) + '</span>' +
    '<span class="ftc-mini-count-chip is-nt">NT ' + formatNumber(r.nt) + '</span>' +
    '<span class="ftc-mini-count-chip is-na">NA ' + formatNumber(r.na) + '</span>' +
    '<span class="ftc-mini-count-chip is-empty">공란 ' + formatNumber(r.empty) + '</span>' +
  '</div>';
}

function filterDetail(rows) {
  return (rows || []).filter(function (row) {
    const effectiveRow = applyInlineOverride(row);
    if (S.component !== "all" && effectiveRow.component !== S.component) return false;
    if (!detailMatchesQuery(effectiveRow, S.query)) return false;
    if (S.nOnly && !hasFailureLikeResult(effectiveRow)) return false;
    if (S.ntOnly && !hasNTResult(effectiveRow)) return false;
    if (S.naOnly && !hasNAResult(effectiveRow)) return false;
    return true;
  });
}

function openInlineEditPrompt(row) {
  const currentResult = String(row.base_result || "").trim();
  const currentReason = String(row.nt_na_reason || "").trim();
  const currentFilter = String(row.nt_na_filter || "").trim().toUpperCase();

  const nextResult = prompt("기본 결과값을 입력하세요 (예: N, PASS, FAIL, N/T, N/A)", currentResult);
  if (nextResult === null) return;
  const nextReason = prompt("비고(NT/NA 사유)를 입력하세요", currentReason);
  if (nextReason === null) return;
  const nextFilter = prompt("NT/NA 필터값을 입력하세요 (N/T 또는 N/A, 공백 가능)", currentFilter);
  if (nextFilter === null) return;

  const key = rowOverrideKey(row);
  S.inlineOverrides[key] = {
    base_result: String(nextResult || "").trim(),
    nt_na_reason: String(nextReason || "").trim(),
    nt_na_filter: String(nextFilter || "").trim(),
    updated_at: new Date().toISOString(),
  };
  saveInlineOverrides();
  renderDetailTable();
  toast("행 값/비고를 저장했습니다.", "ok");
}

function renderKpiBar() {
  const el = document.getElementById("qaFullTcKpiBar");
  if (!el) return;
  const totals = S.data && S.data.totals ? S.data.totals : {};
  const items = [
    { label: "전체 TC", value: totals.row_count || 0, icon: "fa-list-check", tone: "" },
    { label: "브랜드", value: totals.brand_count || 0, icon: "fa-tags", tone: "" },
    { label: "FAIL", value: totals.result_fail_count || 0, icon: "fa-circle-xmark", tone: "danger" },
    { label: "PASS", value: totals.result_pass_count || 0, icon: "fa-circle-check", tone: "ok" },
    { label: "N/T", value: totals.result_nt_count || 0, icon: "fa-hourglass-half", tone: "warn" },
    { label: "N/A", value: totals.result_na_count || 0, icon: "fa-ban", tone: "warn" },
    { label: "지라 연결", value: totals.jira_count || 0, icon: "fa-link", tone: "" },
    { label: "Closed", value: totals.closed_jira_count || 0, icon: "fa-box-archive", tone: "" },
    { label: "NT/NA 사유", value: totals.nt_na_count || 0, icon: "fa-filter-circle-xmark", tone: "" },
    { label: "LABEL", value: totals.label_count || 0, icon: "fa-tag", tone: "" }
  ];
  el.innerHTML = items.map(function (item) {
    return '<div class="ftc-kpi' + (item.tone ? ' ftc-kpi-' + item.tone : '') + '">' +
      '<i class="fa ' + item.icon + '"></i>' +
      '<strong>' + formatNumber(item.value) + '</strong>' +
      '<span>' + esc(item.label) + '</span>' +
      '</div>';
  }).join("");
}

function renderCompChips() {
  const el = document.getElementById("qaFullTcCompChips");
  if (!el) return;
  const components = (S.data && S.data.components ? S.data.components : []).filter(function (item) {
    return item.matched_sheet;
  });
  const html = ['<button class="ftc-comp-chip' + (S.component === "all" ? ' active' : '') + '" data-component="all">전체</button>'];
  components.forEach(function (item) {
    const key = item.component || "";
    html.push('<button class="ftc-comp-chip' + (S.component === key ? ' active' : '') + '" data-component="' + esc(key) + '">' + esc(key) + '</button>');
  });
  el.innerHTML = html.join("");
}

function renderSummaryCards() {
  const el = document.getElementById("qaFullTcCompCards");
  if (!el) return;
  const components = S.data && S.data.components ? S.data.components : [];
  if (!components.length) {
    el.innerHTML = '<p class="hint" style="padding:20px">데이터가 없습니다.</p>';
    return;
  }
  el.innerHTML = components.map(function (item) {
    if (!item.matched_sheet) {
      return '<div class="ftc-comp-card is-unmatched"><div class="ftc-cc-name">' + esc(item.component) + '</div><div class="hint">시트 매칭 실패</div></div>';
    }
    const counts = item.counts || {};
    const failCount = counts.result_fail_count || 0;
    const passCount = counts.result_pass_count || 0;
    const ntCount = counts.result_nt_count || 0;
    const naCount = counts.result_na_count || 0;
    const otherCount = counts.result_other_count || 0;
    const cellCount = failCount + passCount + ntCount + naCount + otherCount;
    const koaFail = Number(counts.koa_n || 0) + Number(counts.koa_android_n || 0) + Number(counts.koa_ios_n || 0);
    const hoaFail = Number(counts.hoa_n || 0) + Number(counts.hoa_android_n || 0) + Number(counts.hoa_ios_n || 0);
    const goaFail = Number(counts.goa_n || 0) + Number(counts.goa_android_n || 0) + Number(counts.goa_ios_n || 0);
    return '<div class="ftc-comp-card' + (S.component === item.component ? ' active' : '') + '" data-component="' + esc(item.component) + '">' +
      '<div class="ftc-cc-head"><span class="ftc-cc-name">' + esc(item.component) + '</span><span class="ftc-cc-badge">' + esc(item.sheet_name || "") + '</span></div>' +
      '<div class="ftc-cc-total"><strong>' + formatNumber(item.row_count || 0) + '</strong> <span>행</span></div>' +
      '<div class="ftc-cc-bar-wrap"><span class="ftc-cc-bar-label">Fail 비율</span>' + percentBar(failCount, cellCount) + '</div>' +
      '<div class="ftc-cc-row4">' +
        '<div class="ftc-cc-stat is-fail"><span>FAIL</span><strong>' + formatNumber(failCount) + '</strong></div>' +
        '<div class="ftc-cc-stat is-pass"><span>PASS</span><strong>' + formatNumber(passCount) + '</strong></div>' +
        '<div class="ftc-cc-stat is-nt"><span>N/T</span><strong>' + formatNumber(ntCount) + '</strong></div>' +
        '<div class="ftc-cc-stat is-na"><span>N/A</span><strong>' + formatNumber(naCount) + '</strong></div>' +
      '</div>' +
      '<div class="ftc-cc-footer">' +
        '<span><i class="fa fa-link"></i> 지라 NO. ' + formatNumber(counts.jira_count || 0) + '</span>' +
        '<span><i class="fa fa-box-archive"></i> Closed 지라 ' + formatNumber(counts.closed_jira_count || 0) + '</span>' +
        '<span><i class="fa fa-ban"></i> NT/NA ' + formatNumber(counts.nt_na_count || 0) + '</span>' +
        '<span><i class="fa fa-tag"></i> LABEL ' + formatNumber(item.label_count || 0) + '</span>' +
        '<span><i class="fa fa-flag"></i> KOA N ' + formatNumber(koaFail) + ' (AOS ' + formatNumber(counts.koa_android_n || 0) + ' / iOS ' + formatNumber(counts.koa_ios_n || 0) + ')</span>' +
        '<span><i class="fa fa-flag"></i> HOA N ' + formatNumber(hoaFail) + ' (AOS ' + formatNumber(counts.hoa_android_n || 0) + ' / iOS ' + formatNumber(counts.hoa_ios_n || 0) + ')</span>' +
        '<span><i class="fa fa-flag"></i> GOA N ' + formatNumber(goaFail) + ' (AOS ' + formatNumber(counts.goa_android_n || 0) + ' / iOS ' + formatNumber(counts.goa_ios_n || 0) + ')</span>' +
      '</div></div>';
  }).join("");
}

function newResultCounter() {
  return { fail: 0, pass: 0, nt: 0, na: 0, other: 0, total: 0 };
}

function addResultValue(counter, value) {
  const bucket = normalizeResultBucket(value);
  if (bucket === "empty") return;
  counter.total += 1;
  if (bucket === "fail") counter.fail += 1;
  else if (bucket === "pass") counter.pass += 1;
  else if (bucket === "nt") counter.nt += 1;
  else if (bucket === "na") counter.na += 1;
  else counter.other += 1;
}

function renderResultPack(counter) {
  const total = Number(counter.total || 0);
  const fail = Number(counter.fail || 0);
  const pass = Number(counter.pass || 0);
  const nt = Number(counter.nt || 0);
  const na = Number(counter.na || 0);
  const failRate = total > 0 ? Math.round((fail / total) * 1000) / 10 : 0;
  return '<div class="ftc-rpack">' +
    '<strong>F ' + formatNumber(fail) + '</strong>' +
    '<span>P ' + formatNumber(pass) + '</span>' +
    '<span>NT ' + formatNumber(nt) + '</span>' +
    '<span>NA ' + formatNumber(na) + '</span>' +
    '<em>Fail ' + failRate + '%</em>' +
    '</div>';
}

function ratioText(done, total) {
  const safeTotal = Number(total || 0);
  const safeDone = Number(done || 0);
  const pct = safeTotal > 0 ? (safeDone / safeTotal) * 100 : 0;
  return {
    pct: pct,
    text: pct.toFixed(1) + "%",
  };
}

function renderSummaryProgressDeck() {
  const hint = document.getElementById("qaFullTcProgressHint");
  const deck = document.getElementById("qaFullTcProgressDeck");
  if (!deck) return;

  const detailRows = filterDetail(S.data && S.data.detail_rows ? S.data.detail_rows : []);
  const brandRows = (S.data && S.data.brand_rows ? S.data.brand_rows : []).filter(function (row) {
    if (S.component !== "all") {
      const components = String(row.components || "").split(/\s*,\s*/).filter(Boolean);
      if (!components.includes(S.component)) return false;
    }
    return true;
  });

  const compMap = {};
  detailRows.forEach(function (row) {
    const component = String(row.component || "-");
    if (!compMap[component]) {
      compMap[component] = { total: 0, done: 0, fail: 0, pass: 0 };
    }
    const target = compMap[component];
    target.total += 9;
    [
      row.koa_result, row.koa_android, row.koa_ios,
      row.hoa_result, row.hoa_android, row.hoa_ios,
      row.goa_result, row.goa_android, row.goa_ios,
    ].forEach(function (value) {
      const bucket = normalizeResultBucket(value);
      if (bucket === "empty") return;
      target.done += 1;
      if (bucket === "fail") target.fail += 1;
      if (bucket === "pass") target.pass += 1;
    });
  });

  const componentItems = Object.keys(compMap).map(function (name) {
    const item = compMap[name];
    const ratio = ratioText(item.done, item.total);
    return {
      name: name,
      total: item.total,
      done: item.done,
      fail: item.fail,
      pass: item.pass,
      pct: ratio.pct,
      pctText: ratio.text,
    };
  }).sort(function (a, b) {
    if (b.pct !== a.pct) return b.pct - a.pct;
    return String(a.name).localeCompare(String(b.name));
  });

  const brandItems = brandRows.map(function (row) {
    const total = Number(row.cell_count || 0);
    const done = Number(row.fail_count || 0) + Number(row.pass_count || 0) + Number(row.nt_count || 0) + Number(row.na_count || 0) + Number(row.other_count || 0);
    const ratio = ratioText(done, total);
    return {
      name: String(row.brand || "-"),
      total: total,
      done: done,
      fail: Number(row.fail_count || 0),
      pass: Number(row.pass_count || 0),
      pct: ratio.pct,
      pctText: ratio.text,
    };
  }).sort(function (a, b) {
    if (b.pct !== a.pct) return b.pct - a.pct;
    return String(a.name).localeCompare(String(b.name));
  });

  if (hint) {
    hint.textContent = "브랜드 " + brandItems.length + "개 · 컴포넌트 " + componentItems.length + "개";
  }

  if (!brandItems.length && !componentItems.length) {
    deck.innerHTML = '<p class="hint" style="padding:16px 0;">진행률 데이터를 표시할 수 없습니다.</p>';
    return;
  }

  const brandHtml = brandItems.slice(0, 8).map(function (item) {
    return '<div class="ftc-progress-item">' +
      '<div class="ftc-progress-head"><strong>' + esc(item.name) + '</strong><span>' + esc(item.pctText) + '</span></div>' +
      '<div class="ftc-progress-track"><div class="ftc-progress-fill" style="width:' + Math.max(0, Math.min(100, item.pct)).toFixed(1) + '%"></div></div>' +
      '<div class="ftc-progress-meta">진행 ' + formatNumber(item.done) + ' / ' + formatNumber(item.total) + ' · PASS ' + formatNumber(item.pass) + ' · FAIL ' + formatNumber(item.fail) + '</div>' +
      '</div>';
  }).join("");

  const componentHtml = componentItems.slice(0, 10).map(function (item) {
    return '<div class="ftc-progress-item">' +
      '<div class="ftc-progress-head"><strong>' + esc(item.name) + '</strong><span>' + esc(item.pctText) + '</span></div>' +
      '<div class="ftc-progress-track"><div class="ftc-progress-fill is-component" style="width:' + Math.max(0, Math.min(100, item.pct)).toFixed(1) + '%"></div></div>' +
      '<div class="ftc-progress-meta">진행 ' + formatNumber(item.done) + ' / ' + formatNumber(item.total) + ' · PASS ' + formatNumber(item.pass) + ' · FAIL ' + formatNumber(item.fail) + '</div>' +
      '</div>';
  }).join("");

  deck.innerHTML = '<div class="ftc-progress-col"><h3>브랜드별 Full_TC 진행률</h3>' + brandHtml + '</div>' +
    '<div class="ftc-progress-col"><h3>컴포넌트별 Full_TC 진행률</h3>' + componentHtml + '</div>';
}

const ALL_RESULT_FIELDS = [
  "koa_result", "koa_android", "koa_ios",
  "hoa_result", "hoa_android", "hoa_ios",
  "goa_result", "goa_android", "goa_ios",
];

const BRAND_FIELD_SPECS = [
  { key: "all", label: "통합", fields: ALL_RESULT_FIELDS },
  { key: "koa", label: "KOA", fields: ["koa_result", "koa_android", "koa_ios"] },
  { key: "hoa", label: "HOA", fields: ["hoa_result", "hoa_android", "hoa_ios"] },
  { key: "goa", label: "GOA", fields: ["goa_result", "goa_android", "goa_ios"] },
];

function newBrandCounter() {
  return { pass: 0, fail: 0, nt: 0, na: 0, empty: 0, total: 0 };
}

function addBrandBucket(counter, value) {
  const bucket = normalizeResultBucket(value);
  counter.total += 1;
  if (bucket === "pass") counter.pass += 1;
  else if (bucket === "fail") counter.fail += 1;
  else if (bucket === "nt") counter.nt += 1;
  else if (bucket === "na") counter.na += 1;
  else counter.empty += 1;
}

function rowBucketByFields(row, fields) {
  const buckets = (fields || []).map(function (field) {
    return normalizeResultBucket(row && row[field]);
  });
  if (buckets.includes("fail")) return "fail";
  if (buckets.includes("pass")) return "pass";
  if (buckets.includes("nt")) return "nt";
  if (buckets.includes("na")) return "na";
  return "empty";
}

function calcRateText(numerator, denominator) {
  const den = Number(denominator || 0);
  const num = Number(numerator || 0);
  const pct = den > 0 ? (num / den) * 100 : 0;
  return pct.toFixed(1) + "%";
}

function rateToneByPercent(pct) {
  const value = Number(pct || 0);
  if (value >= 70) return "high";
  if (value >= 45) return "mid";
  return "low";
}

function rateGaugeMarkup(percent, tone, label) {
  const safe = Math.max(0, Math.min(100, Number(percent || 0)));
  const text = (label || "Rate") + " " + safe.toFixed(1) + "%";
  return '<span class="ftc-line-gauge-wrap is-rate-' + esc(tone || "mid") + '">' +
    '<span class="ftc-line-gauge"><i class="is-rate-' + esc(tone || "mid") + '" style="width:' + safe.toFixed(1) + '%"></i></span>' +
    '<span class="ftc-line-gauge-text">' + esc(text) + '</span>' +
  '</span>';
}

function rateCellMarkup(percent, tone) {
  const safe = Math.max(0, Math.min(100, Number(percent || 0)));
  return '<span class="ftc-rate-cell">' +
    '<span class="ftc-rate-pill is-rate-' + esc(tone || "mid") + '">' + safe.toFixed(1) + '%</span>' +
    '<span class="ftc-rate-cell-gauge"><i class="is-rate-' + esc(tone || "mid") + '" style="width:' + safe.toFixed(1) + '%"></i></span>' +
  '</span>';
}

function buildBrandStatusSummaryRows() {
  const query = String(S.query || "").trim().toLowerCase();
  const rows = filterDetail(S.data && S.data.detail_rows ? S.data.detail_rows : []).filter(function (row) {
    if (query) {
      const text = [row.component, row.category, row.depth1, row.depth2, row.depth3]
        .map(function (value) { return String(value || "").toLowerCase(); })
        .join(" ");
      if (!text.includes(query)) return false;
    }
    return true;
  });

  const byBrand = {};
  BRAND_FIELD_SPECS.forEach(function (spec) {
    byBrand[spec.key] = {
      key: spec.key,
      label: spec.label,
      total: newBrandCounter(),
      components: {},
    };
  });

  rows.forEach(function (row) {
    const component = String(row.component || "-");
    BRAND_FIELD_SPECS.forEach(function (spec) {
      const brandObj = byBrand[spec.key];
      if (!brandObj.components[component]) {
        brandObj.components[component] = newBrandCounter();
      }
      const bucket = rowBucketByFields(row, spec.fields);
      brandObj.total.total += 1;
      brandObj.components[component].total += 1;
      if (bucket === "pass") {
        brandObj.total.pass += 1;
        brandObj.components[component].pass += 1;
      } else if (bucket === "fail") {
        brandObj.total.fail += 1;
        brandObj.components[component].fail += 1;
      } else if (bucket === "nt") {
        brandObj.total.nt += 1;
        brandObj.components[component].nt += 1;
      } else if (bucket === "na") {
        brandObj.total.na += 1;
        brandObj.components[component].na += 1;
      } else {
        brandObj.total.empty += 1;
        brandObj.components[component].empty += 1;
      }
    });
  });

  return BRAND_FIELD_SPECS.map(function (spec) {
    const brandObj = byBrand[spec.key];
    const componentRows = Object.keys(brandObj.components).map(function (name) {
      const c = brandObj.components[name];
      return {
        brand: spec.label,
        rowType: "component",
        name: name,
        total: c.total,
        pass: c.pass,
        fail: c.fail,
        na: c.na,
        nt: c.nt,
        empty: c.empty,
      };
    }).filter(function (item) {
      if (!item.total) return false;
      if (S.nOnly && item.fail <= 0) return false;
      return true;
    }).sort(function (a, b) {
      if (b.fail !== a.fail) return b.fail - a.fail;
      return String(a.name).localeCompare(String(b.name));
    });

    const visibleTotal = componentRows.reduce(function (acc, item) {
      acc.total += item.total;
      acc.pass += item.pass;
      acc.fail += item.fail;
      acc.na += item.na;
      acc.nt += item.nt;
      acc.empty += item.empty;
      return acc;
    }, { total: 0, pass: 0, fail: 0, na: 0, nt: 0, empty: 0 });

    const totalRow = {
      brand: spec.label,
      rowType: "total",
      name: spec.label + " Total",
      total: visibleTotal.total,
      pass: visibleTotal.pass,
      fail: visibleTotal.fail,
      na: visibleTotal.na,
      nt: visibleTotal.nt,
      empty: visibleTotal.empty,
    };

    return {
      key: spec.key,
      label: spec.label,
      totalRow: totalRow,
      componentRows: componentRows,
    };
  });
}

function countButton(value, bucket, context) {
  const isActive = !!(S.brandDrill &&
    S.brandDrill.brandKey === context.brandKey &&
    S.brandDrill.rowName === context.rowName &&
    S.brandDrill.bucket === bucket);
  const tone = bucket === "fail" ? "danger" : bucket === "pass" ? "ok" : bucket === "empty" ? "empty" : "warn";
  return '<button type="button" class="ftc-brand-count-btn is-' + tone + (isActive ? ' active' : '') + '"' +
    ' data-brand-key="' + esc(context.brandKey) + '"' +
    ' data-row-name="' + esc(context.rowName) + '"' +
    ' data-bucket="' + esc(bucket) + '">' + formatNumber(value) + '</button>';
}

function resolveBrandSpec(brandKey) {
  for (let i = 0; i < BRAND_FIELD_SPECS.length; i += 1) {
    if (BRAND_FIELD_SPECS[i].key === brandKey) return BRAND_FIELD_SPECS[i];
  }
  return BRAND_FIELD_SPECS[0];
}

function buildBrandDrillRows() {
  if (!S.brandDrill) return [];
  const selection = S.brandDrill;
  const spec = resolveBrandSpec(selection.brandKey);
  const source = filterDetail(S.data && S.data.detail_rows ? S.data.detail_rows : []);
  return source.filter(function (row) {
    if (selection.rowName !== "__TOTAL__" && String(row.component || "") !== selection.rowName) {
      return false;
    }
    return rowBucketByFields(row, spec.fields) === selection.bucket;
  });
}

function hasJiraNoValue(row) {
  const raw = String((row && row.jira_no) || "").trim();
  return !!raw && raw !== "-";
}

function isBrandDrillViolationAvailable() {
  if (!S.brandDrill) return false;
  return S.brandDrill.bucket === "pass" || S.brandDrill.bucket === "fail";
}

function isBrandDrillViolationRow(row, bucket) {
  if (bucket === "pass") {
    return hasJiraNoValue(row);
  }
  if (bucket === "fail") {
    return !hasJiraNoValue(row);
  }
  return false;
}

function renderBrandDrillRows() {
  const wrap = document.getElementById("qaFullTcBrandDrillWrap");
  const hint = document.getElementById("qaFullTcBrandDrillHint");
  const body = document.getElementById("qaFullTcBrandDrillBody");
  const violationBtn = document.getElementById("qaFullTcBrandViolationBtn");
  if (!wrap || !body) return;
  if (!S.brandDrill) {
    wrap.hidden = true;
    body.innerHTML = "";
    S.brandDrillViolationOnly = false;
    if (violationBtn) {
      violationBtn.hidden = true;
      violationBtn.classList.remove("active");
    }
    renderPagination("qaFullTcBrandDrillPagination", "brand_drill", { total: 0 });
    return;
  }

  const bucketLabelMap = {
    pass: "PASS",
    fail: "FAIL",
    na: "N/A",
    nt: "N/T",
    empty: "공란",
  };
  const allRows = buildBrandDrillRows();
  const violationAvailable = isBrandDrillViolationAvailable();
  const violationRows = violationAvailable
    ? allRows.filter(function (row) { return isBrandDrillViolationRow(row, S.brandDrill.bucket); })
    : [];
  const rows = (violationAvailable && S.brandDrillViolationOnly) ? violationRows : allRows;
  const pageInfo = paginateRows(rows, S.pageBrandDrill);
  S.pageBrandDrill = pageInfo.page;
  wrap.hidden = false;
  if (violationBtn) {
    if (violationAvailable) {
      violationBtn.hidden = false;
      violationBtn.classList.toggle("active", !!S.brandDrillViolationOnly);
      violationBtn.textContent = "위반 " + formatNumber(violationRows.length);
    } else {
      violationBtn.hidden = true;
      violationBtn.classList.remove("active");
    }
  }
  if (hint) {
    const scope = S.brandDrill.rowName === "__TOTAL__" ? "전체 컴포넌트" : S.brandDrill.rowName;
    hint.textContent = S.brandDrill.brandLabel + " · " + scope + " · " + (bucketLabelMap[S.brandDrill.bucket] || S.brandDrill.bucket) +
      " | " + rows.length + "건" + (violationAvailable ? " (위반 " + violationRows.length + "건)" : "") +
      (rows.length ? " | " + pageInfo.start + "~" + pageInfo.end + " 표시" : "");
  }

  if (!pageInfo.rows.length) {
    body.innerHTML = '<tr><td colspan="28" class="hint">조회 결과 없음</td></tr>';
    renderPagination("qaFullTcBrandDrillPagination", "brand_drill", pageInfo);
    return;
  }

  body.innerHTML = pageInfo.rows.map(function (row) {
    return '<tr>' +
      '<td>' + esc(row.component || "-") + '</td>' +
      '<td>' + esc(row.tc_id || "-") + '</td>' +
      '<td>' + esc(row.sheet_row || "-") + '</td>' +
      '<td>' + esc(row.category || "-") + '</td>' +
      '<td>' + esc(row.depth1 || "-") + '</td>' +
      '<td>' + esc(row.depth2 || "-") + '</td>' +
      '<td>' + esc(row.depth3 || "-") + '</td>' +
      '<td>' + esc(row.direction || "-") + '</td>' +
      '<td>' + esc(row.brand || "-") + '</td>' +
      '<td>' + esc(row.priority || "-") + '</td>' +
      '<td class="ftc-text-cell">' + esc(row.pre_condition || "-") + '</td>' +
      '<td class="ftc-text-cell">' + esc(row.tc_procedure || "-") + '</td>' +
      '<td class="ftc-text-cell">' + esc(row.expected_result || "-") + '</td>' +
      '<td>' + chip(row.base_result) + '</td>' +
      '<td>' + chip(row.koa_result) + '</td>' +
      '<td>' + chip(row.koa_android) + '</td>' +
      '<td>' + chip(row.koa_ios) + '</td>' +
      '<td>' + chip(row.hoa_result) + '</td>' +
      '<td>' + chip(row.hoa_android) + '</td>' +
      '<td>' + chip(row.hoa_ios) + '</td>' +
      '<td>' + chip(row.goa_result) + '</td>' +
      '<td>' + chip(row.goa_android) + '</td>' +
      '<td>' + chip(row.goa_ios) + '</td>' +
      '<td>' + esc(row.closed_jira_no || "-") + '</td>' +
      '<td>' + esc(row.jira_no || "-") + '</td>' +
      '<td class="ftc-text-cell">' + esc(row.nt_na_reason || "-") + '</td>' +
      '<td>' + esc(row.nt_na_filter || "-") + '</td>' +
      '<td class="ftc-label-cell">' + esc(row.label || "-") + '</td>' +
    '</tr>';
  }).join("");
  renderPagination("qaFullTcBrandDrillPagination", "brand_drill", pageInfo);
}

function switchSummaryView(view) {
  const allowed = { matrix: true, brand: true, category: true };
  const next = allowed[view] ? view : "matrix";
  S.summaryView = next;

  document.querySelectorAll(".ftc-summary-view-tab").forEach(function (button) {
    const active = button.dataset.summaryView === next;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });

  ["matrix", "brand", "category"].forEach(function (name) {
    const block = document.getElementById("summary-block-" + name);
    if (!block) return;
    block.classList.toggle("ftc-panel-hidden", name !== next);
  });
}

function renderComponentResultTable() {
  const hint = document.getElementById("qaFullTcComponentResultHint");
  const body = document.getElementById("qaFullTcComponentResultBody");
  if (!body) return;
  const rows = filterDetail(S.data && S.data.detail_rows ? S.data.detail_rows : []);
  const byComponent = {};
  rows.forEach(function (row) {
    const component = String(row.component || "-");
    if (!byComponent[component]) {
      byComponent[component] = {
        component: component,
        koa_result: newResultCounter(),
        koa_android: newResultCounter(),
        koa_ios: newResultCounter(),
        hoa_result: newResultCounter(),
        hoa_android: newResultCounter(),
        hoa_ios: newResultCounter(),
        goa_result: newResultCounter(),
        goa_android: newResultCounter(),
        goa_ios: newResultCounter(),
      };
    }
    const target = byComponent[component];
    addResultValue(target.koa_result, row.koa_result);
    addResultValue(target.koa_android, row.koa_android);
    addResultValue(target.koa_ios, row.koa_ios);
    addResultValue(target.hoa_result, row.hoa_result);
    addResultValue(target.hoa_android, row.hoa_android);
    addResultValue(target.hoa_ios, row.hoa_ios);
    addResultValue(target.goa_result, row.goa_result);
    addResultValue(target.goa_android, row.goa_android);
    addResultValue(target.goa_ios, row.goa_ios);
  });
  const items = Object.keys(byComponent).map(function (key) { return byComponent[key]; });
  items.sort(function (a, b) {
    const failA = a.koa_result.fail + a.koa_android.fail + a.koa_ios.fail + a.hoa_result.fail + a.hoa_android.fail + a.hoa_ios.fail + a.goa_result.fail + a.goa_android.fail + a.goa_ios.fail;
    const failB = b.koa_result.fail + b.koa_android.fail + b.koa_ios.fail + b.hoa_result.fail + b.hoa_android.fail + b.hoa_ios.fail + b.goa_result.fail + b.goa_android.fail + b.goa_ios.fail;
    if (failA !== failB) return failB - failA;
    return String(a.component).localeCompare(String(b.component));
  });
  if (hint) hint.textContent = items.length + "개 컴포넌트";
  if (!items.length) {
    body.innerHTML = '<tr><td colspan="10" class="hint">조회 결과 없음</td></tr>';
    return;
  }
  body.innerHTML = items.map(function (item) {
    return '<tr>' +
      '<td><strong>' + esc(item.component || "-") + '</strong></td>' +
      '<td>' + renderResultPack(item.koa_result) + '</td>' +
      '<td>' + renderResultPack(item.koa_android) + '</td>' +
      '<td>' + renderResultPack(item.koa_ios) + '</td>' +
      '<td>' + renderResultPack(item.hoa_result) + '</td>' +
      '<td>' + renderResultPack(item.hoa_android) + '</td>' +
      '<td>' + renderResultPack(item.hoa_ios) + '</td>' +
      '<td>' + renderResultPack(item.goa_result) + '</td>' +
      '<td>' + renderResultPack(item.goa_android) + '</td>' +
      '<td>' + renderResultPack(item.goa_ios) + '</td>' +
      '</tr>';
  }).join("");
}

function renderComponentToc() {
  const hint = document.getElementById("qaFullTcComponentTocHint");
  const el = document.getElementById("qaFullTcComponentToc");
  if (!el) return;
  const components = (S.data && S.data.components ? S.data.components : []).filter(function (item) {
    return item && item.matched_sheet;
  });
  if (hint) hint.textContent = "전체 + " + components.length + "개 컴포넌트";
  function buildTocCard(componentKey, title, metaText, sheetName, counts, isAll) {
    const fail = Number((counts && counts.result_fail_count) || 0);
    const pass = Number((counts && counts.result_pass_count) || 0);
    const nt = Number((counts && counts.result_nt_count) || 0);
    const na = Number((counts && counts.result_na_count) || 0);
    const other = Number((counts && counts.result_other_count) || 0);
    const total = fail + pass + nt + na + other;
    const executed = fail + pass + nt + na;
    const runPct = total > 0 ? ((executed / total) * 100) : 0;
    const tone = rateToneByPercent(runPct);
    return '<button class="ftc-toc-item is-rate-' + esc(tone) + (S.component === componentKey ? ' active' : '') + (isAll ? ' is-all' : '') + '" data-component="' + esc(componentKey) + '">' +
      '<div class="ftc-toc-top">' +
        '<span class="ftc-toc-title">' + esc(title) + '</span>' +
        '<span class="ftc-toc-sheet">' + esc(sheetName || "ALL") + '</span>' +
      '</div>' +
      '<div class="ftc-toc-meta">' + esc(metaText) + '</div>' +
      '<div class="ftc-toc-kpis">' +
        '<span class="kpi-fail">F ' + formatNumber(fail) + '</span>' +
        '<span class="kpi-pass">P ' + formatNumber(pass) + '</span>' +
        '<span class="kpi-nt">NT ' + formatNumber(nt) + '</span>' +
        '<span class="kpi-na">NA ' + formatNumber(na) + '</span>' +
      '</div>' +
      '<div class="ftc-toc-progress">' + rateGaugeMarkup(runPct, tone, "Run") + '</div>' +
    '</button>';
  }

  if (!components.length) {
    el.innerHTML = buildTocCard("all", "전체", "컴포넌트 데이터 없음", "ALL", {}, true);
    return;
  }

  const totalCounts = components.reduce(function (acc, item) {
    const counts = item.counts || {};
    acc.result_fail_count += Number(counts.result_fail_count || 0);
    acc.result_pass_count += Number(counts.result_pass_count || 0);
    acc.result_nt_count += Number(counts.result_nt_count || 0);
    acc.result_na_count += Number(counts.result_na_count || 0);
    acc.result_other_count += Number(counts.result_other_count || 0);
    acc.row_count += Number(item.row_count || 0);
    return acc;
  }, {
    result_fail_count: 0,
    result_pass_count: 0,
    result_nt_count: 0,
    result_na_count: 0,
    result_other_count: 0,
    row_count: 0,
  });

  const allButton = buildTocCard(
    "all",
    "전체",
    "모든 컴포넌트 · " + formatNumber(totalCounts.row_count) + "행",
    "ALL",
    totalCounts,
    true
  );

  el.innerHTML = allButton + components.map(function (item) {
    const counts = item.counts || {};
    const rowCount = Number(item.row_count || 0);
    const failCount = Number(counts.result_fail_count || 0);
    return buildTocCard(
      String(item.component || ""),
      String(item.component || "-"),
      formatNumber(rowCount) + "행 · FAIL " + formatNumber(failCount),
      String(item.sheet_name || "-"),
      counts,
      false
    );
  }).join("");
}

function renderBrandTable() {
  const hint = document.getElementById("qaFullTcBrandHint");
  const body = document.getElementById("qaFullTcBrandBody");
  const overview = document.getElementById("qaFullTcBrandOverview");
  if (!body) return;
  const groups = buildBrandStatusSummaryRows();
  if (hint) {
    const compCount = groups.reduce(function (acc, group) { return acc + group.componentRows.length; }, 0);
    hint.textContent = "브랜드 " + groups.length + "개 · 컴포넌트 " + compCount + "개";
  }

  if (overview) {
    overview.innerHTML = groups.map(function (group) {
      const t = group.totalRow;
      const executed = t.pass + t.fail + t.nt + t.na;
      const runRate = calcRateText(executed, t.total);
      const passRate = calcRateText(t.pass, t.pass + t.fail);
      const runPct = t.total > 0 ? Math.max(0, Math.min(100, (executed / t.total) * 100)) : 0;
      const passPct = (t.pass + t.fail) > 0 ? Math.max(0, Math.min(100, (t.pass / (t.pass + t.fail)) * 100)) : 0;
      const tone = rateToneByPercent(runPct);
      const passTone = rateToneByPercent(passPct);
      return '<article class="ftc-brand-overview-card is-' + esc(group.key) + ' is-rate-' + esc(tone) + '">' +
        '<div class="ftc-brand-overview-top"><h3>' + esc(group.label) + '</h3><span class="ftc-brand-overview-badge">' + esc(group.label) + '</span></div>' +
        '<div class="ftc-brand-overview-meta">브랜드 전체 · Run ' + esc(runRate) + '</div>' +
        '<div class="ftc-brand-overview-metrics">' +
          '<span class="is-pass">PASS ' + formatNumber(t.pass) + '</span>' +
          '<span class="is-fail">FAIL ' + formatNumber(t.fail) + '</span>' +
          '<span class="is-nt">N/T ' + formatNumber(t.nt) + '</span>' +
          '<span class="is-na">N/A ' + formatNumber(t.na) + '</span>' +
          '<span class="is-empty">공란 ' + formatNumber(t.empty) + '</span>' +
        '</div>' +
        '<div class="ftc-brand-overview-progress">' + rateGaugeMarkup(runPct, tone, "Run") + '</div>' +
        '<footer><span>Total ' + formatNumber(t.total) + '</span>' + rateGaugeMarkup(passPct, passTone, "Pass") + '</footer>' +
      '</article>';
    }).join("");
  }

  const tableRows = [];
  groups.forEach(function (group) {
    const showTotalRow = S.component === "all";
    const allRows = showTotalRow ? [group.totalRow].concat(group.componentRows) : group.componentRows.slice();
    if (!allRows.length) {
      return;
    }
    const rowspan = allRows.length;
    allRows.forEach(function (row, idx) {
      const executed = row.pass + row.fail + row.nt + row.na;
      const runRate = calcRateText(executed, row.total);
      const passRate = calcRateText(row.pass, row.pass + row.fail);
      const runPct = row.total > 0 ? (executed / row.total) * 100 : 0;
      const passPct = (row.pass + row.fail) > 0 ? (row.pass / (row.pass + row.fail)) * 100 : 0;
      const runTone = rateToneByPercent(runPct);
      const passTone = rateToneByPercent(passPct);
      const trClass = row.rowType === "total" ? "ftc-brand-total-row" : "";
      const rowNameKey = row.rowType === "total" ? "__TOTAL__" : String(row.name || "");
      const ctx = {
        brandKey: group.key,
        rowName: rowNameKey,
      };
      const brandCell = idx === 0
        ? '<td rowspan="' + rowspan + '" class="ftc-brand-sticky"><strong>' + esc(group.label) + '</strong></td>'
        : "";
      tableRows.push('<tr class="' + trClass + '">' +
        brandCell +
        '<td><strong>' + esc(row.name) + '</strong></td>' +
        '<td>' + countChip(row.total) + '</td>' +
        '<td>' + countButton(row.pass, "pass", ctx) + '</td>' +
        '<td>' + countButton(row.fail, "fail", ctx) + '</td>' +
        '<td>' + countButton(row.na, "na", ctx) + '</td>' +
        '<td>' + countButton(row.nt, "nt", ctx) + '</td>' +
        '<td>' + countButton(row.empty, "empty", ctx) + '</td>' +
        '<td>' + rateCellMarkup(runPct, runTone) + '</td>' +
        '<td>' + rateCellMarkup(passPct, passTone) + '</td>' +
      '</tr>');
    });
  });

  if (!tableRows.length) {
    body.innerHTML = '<tr><td colspan="10" class="hint">조회 결과 없음</td></tr>';
    renderBrandDrillRows();
    return;
  }
  body.innerHTML = tableRows.join("");
  renderBrandDrillRows();
}

function renderBrandCategoryTable() {
  const hint = document.getElementById("qaFullTcBrandCategoryHint");
  const body = document.getElementById("qaFullTcBrandCategoryBody");
  if (!body) return;
  const query = S.query.trim().toLowerCase();
  const rows = (S.data && S.data.brand_group_rows ? S.data.brand_group_rows : []).filter(function (row) {
    if (S.component !== "all" && row.component !== S.component) return false;
    if (query) {
      const text = [row.brand, row.component, row.category, row.depth1, row.depth2, row.depth3]
        .map(function (value) { return String(value || "").toLowerCase(); })
        .join(" ");
      if (!text.includes(query)) return false;
    }
    if (S.nOnly && !(Number(row.fail_count || 0) > 0)) return false;
    if (S.ntOnly && !(Number(row.nt_count || 0) > 0)) return false;
    if (S.naOnly && !(Number(row.na_count || 0) > 0)) return false;
    return true;
  });
  if (hint) hint.textContent = rows.length + "개 그룹";
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="12" class="hint">조회 결과 없음</td></tr>';
    return;
  }
  body.innerHTML = rows.slice(0, 500).map(function (row) {
    return '<tr>' +
      '<td><strong>' + esc(row.brand || "-") + '</strong></td>' +
      '<td>' + esc(row.component || "-") + '</td>' +
      '<td>' + esc(row.category || "-") + '</td>' +
      '<td>' + esc(row.depth1 || "-") + '</td>' +
      '<td>' + esc(row.depth2 || "-") + '</td>' +
      '<td>' + esc(row.depth3 || "-") + '</td>' +
      '<td>' + countChip(row.pass_count, "ok") + '</td>' +
      '<td>' + countChip(row.fail_count, "danger") + '</td>' +
      '<td>' + countChip(row.nt_count, "warn") + '</td>' +
      '<td>' + countChip(row.na_count, "warn") + '</td>' +
      '<td>' + countChip(row.other_count) + '</td>' +
      '<td><span class="ftc-rate-pill">' + esc(String(row.pass_rate || 0)) + '%</span></td>' +
      '</tr>';
  }).join('');
}

function renderGroupTable() {
  const hint = document.getElementById("qaFullTcGroupHint");
  const body = document.getElementById("qaFullTcGroupBody");
  if (!body) return;
  const filtered = filterDetail(S.data && S.data.detail_rows ? S.data.detail_rows : []);
  const keys = new Set(filtered.map(function (row) {
    return [row.component, row.category, row.depth1, row.depth2, row.depth3, row.brand].join("||");
  }));
  const rows = (S.data && S.data.group_rows ? S.data.group_rows : []).filter(function (row) {
    return keys.has([row.component, row.category, row.depth1, row.depth2, row.depth3, row.brand].join("||"));
  });
  if (hint) hint.textContent = rows.length + "개 그룹";
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="22" class="hint">조회 결과 없음</td></tr>';
    return;
  }
  body.innerHTML = rows.map(function (row) {
    return '<tr>' +
      '<td>' + esc(row.component || "-") + '</td>' +
      '<td>' + esc(row.category || "-") + '</td>' +
      '<td>' + esc(row.depth1 || "-") + '</td>' +
      '<td>' + esc(row.depth2 || "-") + '</td>' +
      '<td>' + esc(row.depth3 || "-") + '</td>' +
      '<td>' + esc(row.brand || "-") + '</td>' +
      '<td><strong>' + formatNumber(row.row_count || 0) + '</strong></td>' +
      '<td>' + countChip(row.base_n, "danger") + '</td>' +
      '<td>' + countChip((row.base_n || 0) + (row.koa_n || 0) + (row.hoa_n || 0) + (row.goa_n || 0), "danger") + '</td>' +
      '<td>' + countChip(row.koa_n, "danger") + '</td>' +
      '<td>' + countChip(row.koa_android_n, "danger") + '</td>' +
      '<td>' + countChip(row.koa_ios_n, "danger") + '</td>' +
      '<td>' + countChip(row.hoa_n, "danger") + '</td>' +
      '<td>' + countChip(row.hoa_android_n, "danger") + '</td>' +
      '<td>' + countChip(row.hoa_ios_n, "danger") + '</td>' +
      '<td>' + countChip(row.goa_n, "danger") + '</td>' +
      '<td>' + countChip(row.goa_android_n, "danger") + '</td>' +
      '<td>' + countChip(row.goa_ios_n, "danger") + '</td>' +
      '<td>' + countChip(row.jira_count) + '</td>' +
      '<td>' + countChip(row.closed_jira_count) + '</td>' +
      '<td>' + countChip(row.nt_na_count) + '</td>' +
      '<td class="ftc-label-cell">' + esc(row.labels_preview || "-") + '</td>' +
      '</tr>';
  }).join("");
}

function renderCategoryTree() {
  const hint = document.getElementById("qaFullTcGroupHint");
  const cardsEl = document.getElementById("qaFullTcCategoryComponentCards");
  const statsEl = document.getElementById("qaFullTcCategoryStats");
  const top100Btn = document.getElementById("qaFullTcCategoryTop100");
  const showAllBtn = document.getElementById("qaFullTcCategoryShowAll");
  const rows = filterDetail(S.data && S.data.detail_rows ? S.data.detail_rows : []);
  const query = String(S.groupQuery || "").trim().toLowerCase();
  const aggregated = aggregateCategoryRows(rows).filter(function (item) {
    if (!query) return true;
    const text = [item.component, item.depth1, item.depth2, item.depth3].join(" ").toLowerCase();
    return text.includes(query);
  });

  if (S.categoryDrill) {
    const exists = aggregated.some(function (item) {
      const component = String(item.component || "-");
      const depth1 = String(item.depth1 || "(대분류 없음)");
      const depth2 = String(item.depth2 || "(중분류 없음)");
      const depth3 = String(item.depth3 || "(소분류 없음)");
      if (S.categoryDrill.level === "depth1") {
        return component === S.categoryDrill.component && depth1 === S.categoryDrill.depth1;
      }
      if (S.categoryDrill.level === "depth2") {
        return component === S.categoryDrill.component && depth1 === S.categoryDrill.depth1 && depth2 === S.categoryDrill.depth2;
      }
      return component === S.categoryDrill.component && depth1 === S.categoryDrill.depth1 && depth2 === S.categoryDrill.depth2 && depth3 === S.categoryDrill.depth3;
    });
    if (!exists) {
      S.categoryDrill = null;
      S.pageCategoryDrill = 1;
    }
  }

  const componentTotalMap = {};
  aggregated.forEach(function (item) {
    const key = item.component;
    componentTotalMap[key] = (componentTotalMap[key] || 0) + Number(item.count || 0);
  });

  const componentRows = Object.keys(componentTotalMap).map(function (component) {
    return { component: component, count: componentTotalMap[component] };
  }).sort(function (a, b) {
    if (b.count !== a.count) return b.count - a.count;
    return String(a.component).localeCompare(String(b.component));
  });

  const totalRows = aggregated.reduce(function (sum, row) { return sum + Number(row.count || 0); }, 0);
  const maxCount = aggregated.reduce(function (max, row) { return Math.max(max, Number(row.count || 0)); }, 0);
  const depth1Set = new Set(aggregated.map(function (row) { return row.depth1; }));
  const depth2Set = new Set(aggregated.map(function (row) { return row.depth2; }));
  const depth3Set = new Set(aggregated.map(function (row) { return row.depth3; }));

  if (hint) {
    hint.textContent = formatNumber(aggregated.length) + "개 카테고리 조합 | " + formatNumber(totalRows) + "건";
  }
  if (statsEl) {
    statsEl.innerHTML =
      '<div class="ftc-cat-stat"><span>컴포넌트</span><strong>' + formatNumber(componentRows.length) + '</strong></div>' +
      '<div class="ftc-cat-stat"><span>대분류</span><strong>' + formatNumber(depth1Set.size) + '</strong></div>' +
      '<div class="ftc-cat-stat"><span>중분류</span><strong>' + formatNumber(depth2Set.size) + '</strong></div>' +
      '<div class="ftc-cat-stat"><span>소분류</span><strong>' + formatNumber(depth3Set.size) + '</strong></div>' +
      '<div class="ftc-cat-stat is-total"><span>전체 건수</span><strong>' + formatNumber(totalRows) + '</strong></div>';
  }

  if (cardsEl) {
    cardsEl.innerHTML = componentRows.slice(0, 8).map(function (row, idx) {
      const ratio = totalRows > 0 ? Math.round((row.count / totalRows) * 100) : 0;
      return '<button type="button" class="ftc-cat-comp-card' + (S.component === row.component ? ' is-active' : '') + '" data-component="' + esc(row.component) + '">' +
        '<span class="ftc-cat-comp-rank">#' + (idx + 1) + '</span>' +
        '<strong>' + esc(row.component) + '</strong>' +
        '<span class="ftc-cat-comp-meta">' + formatNumber(row.count) + '건 · ' + ratio + '%</span>' +
      '</button>';
    }).join("");
  }

  if (top100Btn && showAllBtn) {
    const isTop100 = Number(S.groupLimit || 0) > 0;
    top100Btn.classList.toggle("is-active", isTop100);
    showAllBtn.classList.toggle("is-active", !isTop100);
  }

  if (!aggregated.length) {
    renderCategoryOutlineTable([], query);
    renderCategoryDrillRows();
    return;
  }

  renderCategoryOutlineTable(aggregated, query);
  renderCategoryDrillRows();
}

function renderLabelTable() {
  const hint = document.getElementById("qaFullTcLabelHint");
  const body = document.getElementById("qaFullTcLabelBody");
  const statsEl = document.getElementById("qaFullTcLabelStats");
  const top100Btn = document.getElementById("qaFullTcLabelTop100");
  const showAllBtn = document.getElementById("qaFullTcLabelShowAll");
  if (!body) return;
  const query = String(S.labelQuery || S.query || "").trim().toLowerCase();
  const rows = (S.data && S.data.label_rows ? S.data.label_rows : []).filter(function (row) {
    if (query && !String(row.label || "").toLowerCase().includes(query)) return false;
    return true;
  });
  rows.sort(function (a, b) {
    if (Number(b.count || 0) !== Number(a.count || 0)) return Number(b.count || 0) - Number(a.count || 0);
    return String(a.label || "").localeCompare(String(b.label || ""));
  });

  const totalTc = rows.reduce(function (sum, r) { return sum + Number(r.count || 0); }, 0);
  const labelProgressMap = buildLabelProgressMap(S.data && S.data.detail_rows ? S.data.detail_rows : []);

  if (hint) hint.textContent = formatNumber(rows.length) + "개 LABEL | TC " + formatNumber(totalTc) + "건";
  if (statsEl) {
    const totalTask = rows.reduce(function (sum, r) { return sum + Number(r.task_count || r.count || 0); }, 0);
    const totalIssueN = rows.reduce(function (sum, r) {
      return sum + Number(r.base_n || 0) + Number(r.koa_n || 0) + Number(r.hoa_n || 0) + Number(r.goa_n || 0);
    }, 0);
    const totalJira = rows.reduce(function (sum, r) { return sum + Number(r.jira_count || 0); }, 0);
    const totalClosed = rows.reduce(function (sum, r) { return sum + Number(r.closed_jira_count || 0); }, 0);
    statsEl.innerHTML =
      '<div class="ftc-cat-stat"><span>LABEL 수</span><strong>' + formatNumber(rows.length) + '</strong></div>' +
      '<div class="ftc-cat-stat"><span>TC 합계</span><strong>' + formatNumber(totalTc) + '</strong></div>' +
      '<div class="ftc-cat-stat"><span>Task 합계</span><strong>' + formatNumber(totalTask) + '</strong></div>' +
      '<div class="ftc-cat-stat"><span>N 합계</span><strong>' + formatNumber(totalIssueN) + '</strong></div>' +
      '<div class="ftc-cat-stat is-total"><span>지라 / Closed</span><strong>' + formatNumber(totalJira) + ' / ' + formatNumber(totalClosed) + '</strong></div>';
  }

  if (top100Btn && showAllBtn) {
    const isTop100 = Number(S.labelLimit || 0) > 0;
    top100Btn.classList.toggle("is-active", isTop100);
    showAllBtn.classList.toggle("is-active", !isTop100);
  }

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="8" class="hint">조회 결과 없음</td></tr>';
    return;
  }

  const limited = S.labelLimit > 0 ? rows.slice(0, S.labelLimit) : rows;

  function totalGaugeCell(label, totalProgress, total) {
    if (!totalProgress) return '<td class="ftc-lbg-cell">-</td>';
    const done = total - Number(totalProgress.empty || 0);
    const pct = total ? Math.round((done / total) * 100) : 0;
    const passPct = total ? Math.round((Number(totalProgress.pass || 0) / total) * 100) : 0;
    const failPct = total ? Math.round((Number(totalProgress.fail || 0) / total) * 100) : 0;
    const ntPct = total ? Math.round((Number(totalProgress.nt || 0) / total) * 100) : 0;
    const naPct = total ? Math.round((Number(totalProgress.na || 0) / total) * 100) : 0;
    return '<td class="ftc-lbg-cell ftc-brand-col total">' +
      '<button type="button" class="ftc-lbg-wrap" data-label="' + esc(label) + '" data-brand="TOTAL">' +
        '<div class="ftc-lbg-bar">' +
          '<i class="pass" style="width:' + passPct + '%"></i>' +
          '<i class="fail" style="width:' + failPct + '%"></i>' +
          '<i class="nt" style="width:' + ntPct + '%"></i>' +
          '<i class="na" style="width:' + naPct + '%"></i>' +
        '</div>' +
        '<div class="ftc-lbg-nums">' +
          '<span class="ftc-lbg-pct">' + pct + '%</span>' +
          '<span class="ftc-lbg-detail">' +
            '<em class="pass">P ' + formatNumber(totalProgress.pass) + '</em>' +
            '<em class="fail">F ' + formatNumber(totalProgress.fail) + '</em>' +
            '<em class="nt">NT ' + formatNumber(totalProgress.nt) + '</em>' +
          '</span>' +
        '</div>' +
      '</button>' +
    '</td>';
  }

  function brandGaugeCell(label, brand, bp, total) {
    if (!bp) return '<td class="ftc-lbg-cell">-</td>';
    const done = total - Number(bp.empty || 0);
    const pct = total ? Math.round((done / total) * 100) : 0;
    const passPct = total ? Math.round((Number(bp.pass || 0) / total) * 100) : 0;
    const failPct = total ? Math.round((Number(bp.fail || 0) / total) * 100) : 0;
    const ntPct = total ? Math.round((Number(bp.nt || 0) / total) * 100) : 0;
    const naPct = total ? Math.round((Number(bp.na || 0) / total) * 100) : 0;
    const brandLow = brand.toLowerCase();
    return '<td class="ftc-lbg-cell ftc-brand-col ' + brandLow + '">' +
      '<button type="button" class="ftc-lbg-wrap" data-label="' + esc(label) + '" data-brand="' + esc(brand) + '">' +
        '<div class="ftc-lbg-bar">' +
          '<i class="pass" style="width:' + passPct + '%"></i>' +
          '<i class="fail" style="width:' + failPct + '%"></i>' +
          '<i class="nt" style="width:' + ntPct + '%"></i>' +
          '<i class="na" style="width:' + naPct + '%"></i>' +
        '</div>' +
        '<div class="ftc-lbg-nums">' +
          '<span class="ftc-lbg-pct">' + pct + '%</span>' +
          '<span class="ftc-lbg-detail">' +
            '<em class="pass">P ' + formatNumber(bp.pass) + '</em>' +
            '<em class="fail">F ' + formatNumber(bp.fail) + '</em>' +
            '<em class="nt">NT ' + formatNumber(bp.nt) + '</em>' +
          '</span>' +
        '</div>' +
      '</button>' +
    '</td>';
  }

  function shareGaugeCell(count) {
    const pctValue = totalTc > 0 ? Math.max(0, Math.round((count / totalTc) * 100)) : 0;
    let tone = 'low';
    let toneLabel = '소규모';
    if (pctValue >= 40) {
      tone = 'dominant';
      toneLabel = '핵심';
    } else if (pctValue >= 20) {
      tone = 'high';
      toneLabel = '상위';
    } else if (pctValue >= 10) {
      tone = 'mid';
      toneLabel = '중간';
    }
    return '<td class="ftc-share-cell">' +
      '<div class="ftc-share-gauge is-' + tone + '">' +
        '<div class="ftc-share-gauge-head">' +
          '<strong>' + pctValue + '%</strong>' +
          '<span class="ftc-share-chip is-' + tone + '">' + toneLabel + '</span>' +
        '</div>' +
        '<div class="ftc-share-track"><i class="is-' + tone + '" style="width:' + pctValue + '%"></i></div>' +
        '<div class="ftc-share-meta">' +
          '<span>TC ' + formatNumber(count) + '</span>' +
          '<span>전체 ' + formatNumber(totalTc) + '</span>' +
        '</div>' +
      '</div>' +
    '</td>';
  }

  body.innerHTML = limited.map(function (row, index) {
    const label = String(row.label || "-");
    const active = S.activeLabel && S.activeLabel.toLowerCase() === label.toLowerCase();
    const count = Number(row.count || 0);
    const progress = labelProgressMap[label] || {
      total: count, koa: { pass: 0, fail: 0, nt: 0, na: 0, empty: count },
      hoa: { pass: 0, fail: 0, nt: 0, na: 0, empty: count },
      goa: { pass: 0, fail: 0, nt: 0, na: 0, empty: count },
    };
    return '<tr class="' + (active ? 'ftc-label-row-active' : '') + '">' +
      '<td><span class="ftc-cat-rank">' + (index + 1) + '</span></td>' +
      '<td><button type="button" class="ftc-label-badge ftc-label-row-btn' + (active ? ' is-active' : '') + '" data-label="' + esc(label) + '">' + esc(label) + '</button></td>' +
      '<td><strong>' + formatNumber(count) + '</strong></td>' +
      totalGaugeCell(label, progress, count) +
      brandGaugeCell(label, 'KOA', progress.koa, count) +
      brandGaugeCell(label, 'HOA', progress.hoa, count) +
      brandGaugeCell(label, 'GOA', progress.goa, count) +
      shareGaugeCell(count) +
    '</tr>';
  }).join("");
}

function renderLabelBrandDrill() {
  const card = document.getElementById("qaLabelBrandDrillCard");
  const titleEl = document.getElementById("qaLabelBrandDrillTitle");
  const hintEl = document.getElementById("qaLabelBrandDrillHint");
  const tabsEl = document.getElementById("qaLabelBrandTabs");
  const body = document.getElementById("qaLabelCompBody");
  if (!card || !body) return;

  const drill = S.labelBrandDrill;
  if (!drill || !drill.label) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  if (card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "nearest" });

  const label = drill.label;
  const activeBrand = String(drill.brand || "TOTAL").toUpperCase();
  const activeBrandLabel = activeBrand === "TOTAL" ? "전체" : activeBrand;
  if (titleEl) titleEl.innerHTML = '<i class="fa fa-layer-group"></i> <strong>' + esc(label) + '</strong> 브랜드별 컴포넌트 분석';

  // Brand tabs
  if (tabsEl) {
    tabsEl.innerHTML = [
      { key: 'TOTAL', text: '전체' },
      { key: 'KOA', text: 'KOA' },
      { key: 'HOA', text: 'HOA' },
      { key: 'GOA', text: 'GOA' }
    ].map(function (tab) {
      const active = tab.key === activeBrand;
      return '<button type="button" class="ftc-label-brand-tab-btn ' + tab.key.toLowerCase() + (active ? ' active' : '') + '" data-label="' + esc(label) + '" data-brand="' + tab.key + '">' + tab.text + '</button>';
    }).join("");
  }

  // Filter rows for this label × brand
  const brandKey = activeBrand === 'TOTAL' ? 'base_result' : activeBrand.toLowerCase() + '_result';
  const allRows = (S.data && S.data.detail_rows ? S.data.detail_rows : []).filter(function (row) {
    if (!rowHasLabel(row, label)) return false;
    if (S.component !== "all" && String(row.component || "") !== S.component) return false;
    return true;
  });

  if (!allRows.length) {
    if (hintEl) hintEl.textContent = "해당 LABEL의 데이터가 없습니다.";
    body.innerHTML = '<tr><td colspan="9" class="hint">데이터 없음</td></tr>';
    return;
  }

  // Aggregate by component
  const compMap = {};
  allRows.forEach(function (row) {
    const comp = String(row.component || "기타");
    if (!compMap[comp]) compMap[comp] = { component: comp, total: 0, pass: 0, fail: 0, nt: 0, na: 0, empty: 0 };
    const bucket = normalizeResultBucket(row[brandKey] || "");
    compMap[comp].total += 1;
    if (bucket === "pass") compMap[comp].pass += 1;
    else if (bucket === "fail") compMap[comp].fail += 1;
    else if (bucket === "nt") compMap[comp].nt += 1;
    else if (bucket === "na") compMap[comp].na += 1;
    else compMap[comp].empty += 1;
  });

  const compRows = Object.values(compMap).sort(function (a, b) { return b.total - a.total; });
  const totalRows = allRows.length;
  if (hintEl) hintEl.textContent = label + ' · ' + activeBrandLabel + ' · ' + formatNumber(compRows.length) + '개 컴포넌트 · TC ' + formatNumber(totalRows) + '건';

  function miniGaugeBar(row) {
    const t = row.total;
    if (!t) return '<div class="ftc-lbg-bar" style="height:6px;"></div>';
    const passPct = Math.round((row.pass / t) * 100);
    const failPct = Math.round((row.fail / t) * 100);
    const ntPct = Math.round((row.nt / t) * 100);
    const naPct = Math.round((row.na / t) * 100);
    const donePct = 100 - Math.round((row.empty / t) * 100);
    return '<div class="ftc-comp-gauge">' +
      '<div class="ftc-lbg-bar">' +
        '<i class="pass" style="width:' + passPct + '%"></i>' +
        '<i class="fail" style="width:' + failPct + '%"></i>' +
        '<i class="nt" style="width:' + ntPct + '%"></i>' +
        '<i class="na" style="width:' + naPct + '%"></i>' +
      '</div>' +
      '<span class="ftc-lbg-pct">' + donePct + '%</span>' +
    '</div>';
  }

  body.innerHTML = compRows.map(function (row) {
    const t = row.total;
    const activeComp = S.labelRowDrill && S.labelRowDrill.label === label && S.labelRowDrill.brand === activeBrand && S.labelRowDrill.component === row.component;
    return '<tr class="' + (activeComp ? 'ftc-label-row-active' : '') + '">' +
      '<td><strong>' + esc(row.component) + '</strong></td>' +
      '<td>' + formatNumber(t) + '</td>' +
      '<td class="ftc-res-col pass"><span class="ftc-mini-count-chip is-pass">' + formatNumber(row.pass) + '</span></td>' +
      '<td class="ftc-res-col fail"><span class="ftc-mini-count-chip is-fail">' + formatNumber(row.fail) + '</span></td>' +
      '<td class="ftc-res-col nt"><span class="ftc-mini-count-chip is-nt">' + formatNumber(row.nt) + '</span></td>' +
      '<td class="ftc-res-col na"><span class="ftc-mini-count-chip is-na">' + formatNumber(row.na) + '</span></td>' +
      '<td class="ftc-res-col empty"><span class="ftc-mini-count-chip is-empty">' + formatNumber(row.empty) + '</span></td>' +
      '<td>' + miniGaugeBar(row) + '</td>' +
      '<td><button type="button" class="btn-secondary btn-sm ftc-label-row-drill-btn" data-label="' + esc(label) + '" data-brand="' + esc(activeBrand) + '" data-component="' + esc(row.component) + '"><i class="fa fa-list"></i> 행 보기</button></td>' +
    '</tr>';
  }).join("");
}

function renderLabelRowDrill() {
  const card = document.getElementById("qaLabelRowDrillCard");
  const titleEl = document.getElementById("qaLabelRowDrillTitle");
  const hintEl = document.getElementById("qaLabelRowDrillHint");
  const body = document.getElementById("qaLabelRowDrillBody");
  const pager = document.getElementById("qaLabelRowDrillPager");
  if (!card || !body) return;

  const drill = S.labelRowDrill;
  if (!drill || !drill.label) {
    card.hidden = true;
    return;
  }
  card.hidden = false;

  const label = drill.label;
  const brand = String(drill.brand || "TOTAL").toUpperCase();
  const brandLabel = brand === 'TOTAL' ? '전체' : brand;
  const component = drill.component || "";
  const brandKey = brand === 'TOTAL' ? 'base_result' : brand.toLowerCase() + '_result';
  const androidKey = brand === 'TOTAL' ? '' : brand.toLowerCase() + '_android';
  const iosKey = brand === 'TOTAL' ? '' : brand.toLowerCase() + '_ios';

  if (titleEl) titleEl.innerHTML = '<i class="fa fa-table-list"></i> Full_TC 행 조회 — <strong>' + esc(label) + '</strong> · <span class="ftc-brand-badge ' + brand.toLowerCase() + '">' + brandLabel + '</span>' + (component ? ' · ' + esc(component) : '');

  const allRows = (S.data && S.data.detail_rows ? S.data.detail_rows : []).filter(function (row) {
    if (!rowHasLabel(row, label)) return false;
    if (component && String(row.component || "") !== component) return false;
    return true;
  });

  const page = Number(S.labelRowDrillPage || 1);
  const pageSize = 50;
  const totalRows = allRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const pageRows = allRows.slice(start, start + pageSize);

  if (hintEl) hintEl.textContent = label + ' · ' + brandLabel + (component ? ' · ' + component : '') + ' | ' + formatNumber(totalRows) + '건 · ' + safePage + '/' + totalPages + '페이지';

  if (!pageRows.length) {
    body.innerHTML = '<tr><td colspan="11" class="hint">해당 조건의 Full_TC 행이 없습니다.</td></tr>';
    if (pager) pager.innerHTML = "";
    return;
  }

  body.innerHTML = pageRows.map(function (row) {
    const baseBucket = normalizeResultBucket(row.base_result);
    const brandBucket = normalizeResultBucket(row[brandKey] || "");
    return '<tr>' +
      '<td>' + esc(row.component || "-") + '</td>' +
      '<td>' + esc(row.tc_id || "-") + '</td>' +
      '<td>' + esc(row.depth1 || "-") + '</td>' +
      '<td>' + esc(row.depth2 || "-") + '</td>' +
      '<td>' + esc(row.depth3 || "-") + '</td>' +
      '<td>' + esc(row.direction || "-") + '</td>' +
      '<td>' + chip(row.base_result) + '</td>' +
      '<td>' + chip(row[brandKey] || "") + '</td>' +
      '<td>' + chip(androidKey ? (row[androidKey] || "") : "") + '</td>' +
      '<td>' + chip(iosKey ? (row[iosKey] || "") : "") + '</td>' +
      '<td class="ftc-label-cell">' + esc(row.label || "-") + '</td>' +
    '</tr>';
  }).join("");

  // Pager
  if (pager) {
    if (totalPages <= 1) {
      pager.innerHTML = "";
    } else {
      let btns = '';
      const rangeStart = Math.max(1, safePage - 3);
      const rangeEnd = Math.min(totalPages, safePage + 3);
      if (rangeStart > 1) btns += '<button type="button" class="ftc-pager-btn" data-drill-page="1">1</button><span class="ftc-pager-sep">…</span>';
      for (let p = rangeStart; p <= rangeEnd; p++) {
        btns += '<button type="button" class="ftc-pager-btn' + (p === safePage ? ' active' : '') + '" data-drill-page="' + p + '">' + p + '</button>';
      }
      if (rangeEnd < totalPages) btns += '<span class="ftc-pager-sep">…</span><button type="button" class="ftc-pager-btn" data-drill-page="' + totalPages + '">' + totalPages + '</button>';
      pager.innerHTML = '<div class="ftc-pager-inner">' + btns + '</div>';
    }
  }

  if (card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// renderLabelRowsTable → 더 이상 사용하지 않음(renderLabelBrandDrill + renderLabelRowDrill로 대체)
// renderLabelRowsTable / renderLabelToc → renderLabelBrandDrill + renderLabelRowDrill로 대체됨
function renderLabelRowsTable() {}
function renderLabelToc() {}

function setActiveLabel(label) {
  S.activeLabel = String(label || "").trim();
}

function applyColGroups() {
  const table = document.getElementById("qaFullTcDetailTable");
  if (!table) return;
  ["basic", "tc", "result", "issue"].forEach(function (groupKey) {
    const show = !!S.colGroups[groupKey];
    table.querySelectorAll('[data-colgroup="' + groupKey + '"]').forEach(function (el) {
      el.style.display = show ? "" : "none";
    });
  });
}

function renderDetailTable() {
  const hint = document.getElementById("qaFullTcDetailHint");
  const body = document.getElementById("qaFullTcDetailBody");
  if (!body) return;
  const rows = filterDetail(S.data && S.data.detail_rows ? S.data.detail_rows : []);
  const pageInfo = paginateRows(rows, S.pageDetail);
  S.pageDetail = pageInfo.page;
  if (hint) hint.textContent = rows.length + "건 | " + pageInfo.start + "~" + pageInfo.end + " 표시";
  if (!pageInfo.rows.length) {
    body.innerHTML = '<tr><td colspan="29" class="hint">조회 결과 없음</td></tr>';
    renderPagination("qaFullTcDetailPagination", "detail", pageInfo);
    return;
  }
  body.innerHTML = pageInfo.rows.map(function (rawRow, idx) {
    const row = applyInlineOverride(rawRow);
    const rowKey = rowOverrideKey(rawRow);
    const rowClass = S.detailFocusKey && S.detailFocusKey === rowKey ? ' class="ftc-row-focus"' : '';
    return '<tr' + rowClass + ' data-row-key="' + esc(rowKey) + '">' +
      '<td class="ftc-sticky-col s0">' + esc(row.component || "-") + '</td>' +
      '<td class="ftc-sticky-col s1">' + esc(row.tc_id || "-") + '</td>' +
      '<td class="ftc-sticky-col s2">' + esc(row.sheet_row || "-") + '</td>' +
      '<td data-colgroup="basic">' + esc(row.category || "-") + '</td>' +
      '<td data-colgroup="basic">' + esc(row.depth1 || "-") + '</td>' +
      '<td data-colgroup="basic">' + esc(row.depth2 || "-") + '</td>' +
      '<td data-colgroup="basic">' + esc(row.depth3 || "-") + '</td>' +
      '<td data-colgroup="basic">' + esc(row.direction || "-") + '</td>' +
      '<td data-colgroup="basic">' + esc(row.brand || "-") + '</td>' +
      '<td data-colgroup="basic">' + esc(row.priority || "-") + '</td>' +
      '<td data-colgroup="tc" class="ftc-text-cell">' + esc(row.pre_condition || "-") + '</td>' +
      '<td data-colgroup="tc" class="ftc-text-cell">' + esc(row.tc_procedure || "-") + '</td>' +
      '<td data-colgroup="tc" class="ftc-text-cell">' + esc(row.expected_result || "-") + '</td>' +
      '<td data-colgroup="result">' + chip(row.base_result) + '</td>' +
      '<td data-colgroup="result">' + chip(row.koa_result) + '</td>' +
      '<td data-colgroup="result">' + chip(row.koa_android) + '</td>' +
      '<td data-colgroup="result">' + chip(row.koa_ios) + '</td>' +
      '<td data-colgroup="result">' + chip(row.hoa_result) + '</td>' +
      '<td data-colgroup="result">' + chip(row.hoa_android) + '</td>' +
      '<td data-colgroup="result">' + chip(row.hoa_ios) + '</td>' +
      '<td data-colgroup="result">' + chip(row.goa_result) + '</td>' +
      '<td data-colgroup="result">' + chip(row.goa_android) + '</td>' +
      '<td data-colgroup="result">' + chip(row.goa_ios) + '</td>' +
      '<td data-colgroup="issue">' + esc(row.closed_jira_no || "-") + '</td>' +
      '<td data-colgroup="issue">' + esc(row.jira_no || "-") + '</td>' +
      '<td data-colgroup="issue" class="ftc-text-cell">' + esc(row.nt_na_reason || "-") + '</td>' +
      '<td data-colgroup="issue">' + esc(row.nt_na_filter || "-") + '</td>' +
      '<td data-colgroup="issue" class="ftc-label-cell">' + esc(row.label || "-") + '</td>' +
      '<td data-colgroup="issue"><button type="button" class="btn-ghost btn-sm ftc-inline-edit-btn" data-row-index="' + idx + '" data-row-key="' + esc(rowKey) + '">수정</button></td>' +
      '</tr>';
  }).join("");
  body.querySelectorAll(".ftc-inline-edit-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const index = Number(btn.dataset.rowIndex || "-1");
      if (!Number.isFinite(index) || index < 0 || index >= pageInfo.rows.length) return;
      openInlineEditPrompt(pageInfo.rows[index]);
    });
  });
  renderPagination("qaFullTcDetailPagination", "detail", pageInfo);
  applyColGroups();
  if (S.detailFocusKey) {
    const targetRow = body.querySelector('tr[data-row-key="' + CSS.escape(S.detailFocusKey) + '"]');
    if (targetRow) {
      targetRow.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }
}

function renderDefectKpi() {
  const el = document.getElementById("defectMatchKpi");
  const rangeSummary = document.getElementById("defectRangeSummary");
  if (!el) return;
  const data = S.defect || {};
  if (!data.ok || !data.defect_source_ok) {
    el.innerHTML = '<div class="ftc-defect-notice">' + esc(data.detail || "Defect 데이터를 불러오는 중...") + '</div>';
    if (rangeSummary) rangeSummary.textContent = "";
    return;
  }
  const allRows = Array.isArray(data.rows) ? data.rows : [];
  const minRange = normalizeIssueThreshold(S.defectRangeMin);
  const rangedRows = allRows.filter(function (row) {
    const keyNumber = row && Number.isFinite(row.key_number) ? Number(row.key_number) : null;
    if (minRange != null && (keyNumber == null || keyNumber < minRange)) return false;
    return true;
  });
  const rangedMatched = rangedRows.filter(function (row) { return !!row.in_full_tc; }).length;
  const rangedUnmatched = rangedRows.length - rangedMatched;
  const rangedRate = rangedRows.length ? Math.round((rangedMatched / rangedRows.length) * 1000) / 10 : 0;
  const rate = Number(data.match_rate || 0);
  const tone = rate >= 80 ? "ok" : rate >= 50 ? "warn" : "danger";
  el.innerHTML = '<div class="ftc-defect-kpi-cards">' +
    '<div class="ftc-dk ftc-dk-total"><i class="fa fa-bug"></i><strong>' + formatNumber(data.total_defects || 0) + '</strong><span>전체 Defect 키</span></div>' +
    '<div class="ftc-dk ftc-dk-found"><i class="fa fa-circle-check"></i><strong>' + formatNumber(data.matched_count || 0) + '</strong><span>Full_TC 포함</span></div>' +
    '<div class="ftc-dk ftc-dk-miss"><i class="fa fa-circle-xmark"></i><strong>' + formatNumber(data.unmatched_count || 0) + '</strong><span>Full_TC 미포함</span></div>' +
    '<div class="ftc-dk ftc-dk-' + tone + '"><i class="fa fa-percent"></i><strong>' + rate + '%</strong><span>매칭률</span>' +
      '<div class="ftc-bar ftc-dk-bar"><div class="ftc-bar-fill" style="width:' + rate + '%"></div></div>' +
      '</div>' +
    '<div class="ftc-dk ftc-dk-ok"><i class="fa fa-filter"></i><strong>' + formatNumber(rangedMatched) + '/' + formatNumber(rangedRows.length) + '</strong><span>선택 범위 반영</span></div>' +
    '<div class="ftc-dk ftc-dk-' + (rangedRate >= 80 ? 'ok' : rangedRate >= 50 ? 'warn' : 'danger') + '"><i class="fa fa-list-ol"></i><strong>' + rangedRate + '%</strong><span>선택 범위 매칭률</span></div>' +
    '</div>' +
    '<div class="ftc-defect-sources hint"><i class="fa fa-file-excel"></i> DefectList_Raw(최신 업로드본): ' + esc(data.defect_source || "-") + ' (' + esc(data.defect_uploaded_at || "-") + ')' +
    ' &nbsp;|&nbsp; <i class="fa fa-file-excel"></i> Full_TC(최신 업로드본): ' + esc(data.full_tc_source || "-") + '</div>';
  if (rangeSummary) {
    const keyRange = data.key_range || {};
    const sourceRangeText = keyRange.min != null && keyRange.max != null
      ? ('전체 Key 범위: ' + keyRange.min + ' ~ ' + keyRange.max)
      : '전체 Key 범위를 계산할 수 없습니다';
    const selectedRangeText = (minRange != null)
      ? ('최소 Key 기준: ' + minRange + ' 이상 | 미반영 ' + formatNumber(rangedUnmatched) + '건')
      : '최소 Key를 입력하면 해당 번호 이상 구간의 Full_TC 반영 현황을 바로 확인할 수 있습니다.';
    rangeSummary.textContent = sourceRangeText + ' | ' + selectedRangeText;
  }
}

function renderDefectAuditKpi() {
  const el = document.getElementById("defectAuditKpi");
  const hint = document.getElementById("defectAuditHint");
  if (!el) return;
  const data = S.defect || {};
  if (!data.ok || !data.defect_source_ok) {
    el.innerHTML = '<div class="ftc-defect-notice">' + esc(data.detail || "데이터 없음") + '</div>';
    if (hint) hint.textContent = "";
    return;
  }
  const audit = data.audit_totals || {};
  if (hint) hint.textContent = '진행건 ' + formatNumber(audit.active_total || 0) + ' / Closed ' + formatNumber(audit.closed_total || 0) + ' / 금지상태 ' + formatNumber(audit.banned_total || 0);
  const cards = [
    { label: "진행건 Full_TC 지라 NO. 누락", value: audit.active_missing_y || 0, tone: "warn" },
    { label: "진행건 Full_TC 컬럼 오배치", value: audit.active_wrong_slot || 0, tone: "danger" },
    { label: "Closed Full_TC Closed 지라 누락", value: audit.closed_missing_x || 0, tone: "warn" },
    { label: "Closed Full_TC 컬럼 오배치", value: audit.closed_wrong_slot || 0, tone: "danger" },
    { label: "Duplicate 유입", value: audit.duplicate_linked || 0, tone: "danger" },
    { label: "Not a Bug 유입", value: audit.not_a_bug_linked || 0, tone: "danger" },
    { label: "전체 위반", value: audit.violation_count || 0, tone: "danger" }
  ];
  el.innerHTML = cards.map(function (card) {
    return '<div class="ftc-audit-card is-' + card.tone + '"><strong>' + formatNumber(card.value) + '</strong><span>' + esc(card.label) + '</span></div>';
  }).join("");
}

function filterDefectRows(rows) {
  const query = S.defectQuery.trim().toLowerCase();
  const minRange = normalizeIssueThreshold(S.defectRangeMin);
  return (rows || []).filter(function (row) {
    const coverage = defectTcCoverage(row);
    if (S.defectStatus === "found" && coverage.missing) return false;
    if (S.defectStatus === "missing" && !coverage.missing) return false;
    if (minRange != null && (!Number.isFinite(row.key_number) || Number(row.key_number) < minRange)) return false;
    if (query) {
      const text = [
        row.key,
        row.key_number,
        row.raw_sheet_row,
        row.status,
        row.resolution,
        row.priority,
        row.reporter,
        row.summary,
        row.audit_code,
        slotLabel(row.expected_slot),
        slotLabel(row.actual_slot),
      ]
        .map(function (value) { return String(value || "").toLowerCase(); })
        .join(" ");
      if (!text.includes(query)) return false;
    }
    return true;
  });
}

function getDefectFilteredRows(rows, scope) {
  const bucket = scope === "violation" ? S.defectFilterCache.violation : S.defectFilterCache.main;
  const query = S.defectQuery.trim().toLowerCase();
  const signature = [scope, S.defectStatus, query, S.defectRangeMin].join("|");
  if (bucket.source === rows && bucket.key === signature) {
    return bucket.rows;
  }
  const filtered = filterDefectRows(rows);
  bucket.source = rows;
  bucket.key = signature;
  bucket.rows = filtered;
  return filtered;
}

function filterMissingKeyRows(rows) {
  const query = S.defectQuery.trim().toLowerCase();
  const minRange = normalizeIssueThreshold(S.defectRangeMin);
  return (rows || []).filter(function (row) {
    if (row.in_full_tc) return false;
    if (minRange != null && (!Number.isFinite(row.key_number) || Number(row.key_number) < minRange)) return false;
    if (!query) return true;
    const text = [row.key, row.key_number, row.raw_sheet_row, row.status, row.resolution, row.reporter, row.summary]
      .map(function (value) { return String(value || "").toLowerCase(); })
      .join(" ");
    return text.includes(query);
  });
}

function applyMissingTcFilters(rows) {
  const query = S.defectQuery.trim().toLowerCase();
  const minRange = normalizeIssueThreshold(S.defectRangeMin);
  return (rows || []).filter(function (row) {
    if (minRange != null && (!Number.isFinite(row.key_number) || Number(row.key_number) < minRange)) return false;
    if (!query) return true;
    const text = [
      row.key,
      row.component,
      row.tc_id,
      row.sheet_row,
      row.field_label,
      row.category,
      row.brand,
      row.label,
    ].map(function (value) { return String(value || "").toLowerCase(); }).join(" ");
    return text.includes(query);
  });
}

function openDetailByMissingTc(row) {
  if (!S.data || !Array.isArray(S.data.detail_rows)) return;
  S.component = row.component || "all";
  S.query = "";
  S.nOnly = false;
  S.ntOnly = false;
  S.naOnly = false;
  const targetSheetRow = Number(row.sheet_row || 0);
  const filtered = filterDetail(S.data.detail_rows || []);
  const targetIndex = filtered.findIndex(function (item) {
    return String(item.component || "") === String(row.component || "") &&
      String(item.tc_id || "") === String(row.tc_id || "") &&
      Number(item.sheet_row || 0) === targetSheetRow;
  });
  if (targetIndex < 0) {
    toast("해당 Full_TC 행을 찾지 못했습니다.", "error");
    return;
  }
  const targetRow = filtered[targetIndex];
  S.pageDetail = Math.floor(targetIndex / Math.max(20, Number(S.pageSize || FTC_DEFAULT_PAGE_SIZE))) + 1;
  S.detailFocusKey = rowOverrideKey(targetRow);
  const searchInput = document.getElementById("qaFullTcSearch");
  if (searchInput) searchInput.value = "";
  const nOnlyInput = document.getElementById("qaFullTcNOnly");
  const ntOnlyInput = document.getElementById("qaFullTcNTOnly");
  const naOnlyInput = document.getElementById("qaFullTcNAOnly");
  if (nOnlyInput) nOnlyInput.checked = false;
  if (ntOnlyInput) ntOnlyInput.checked = false;
  if (naOnlyInput) naOnlyInput.checked = false;
  switchTab("summary", true);
}

function renderDefectMissingTcTable() {
  const hint = document.getElementById("defectMissingTcHint");
  const body = document.getElementById("defectMissingTcBody");
  if (!body) return;
  if (!S.defect || !S.defect.ok || !S.defect.defect_source_ok) {
    body.innerHTML = '<tr><td colspan="9" class="hint">' + esc((S.defect && S.defect.detail) || "데이터 없음") + '</td></tr>';
    return;
  }
  const rows = applyMissingTcFilters(S.defect.missing_tc_rows || []);
  const pageInfo = paginateRows(rows, S.pageDefectMissingTc);
  S.pageDefectMissingTc = pageInfo.page;
  if (hint) hint.textContent = rows.length + "건 (Full_TC에는 있으나 DefectList_Raw에는 없음)";
  if (!pageInfo.rows.length) {
    body.innerHTML = '<tr><td colspan="9" class="hint">누락 없음</td></tr>';
    renderPagination("defectMissingTcPagination", "defect_missing_tc", pageInfo);
    return;
  }
  body.innerHTML = pageInfo.rows.map(function (row) {
    return '<tr class="ftc-row-missing">' +
      '<td><strong>' + esc(row.key || "-") + '</strong></td>' +
      '<td>' + esc(row.field_label || "-") + '</td>' +
      '<td>' + esc(row.component || "-") + '</td>' +
      '<td>' + esc(row.tc_id || "-") + '</td>' +
      '<td>' + esc(row.sheet_row != null ? row.sheet_row : "-") + '</td>' +
      '<td>' + esc(row.category || "-") + '</td>' +
      '<td>' + esc(row.brand || "-") + '</td>' +
      '<td class="ftc-label-cell">' + esc(row.label || "-") + '</td>' +
      '<td><button type="button" class="btn-ghost btn-sm ftc-open-detail-btn" data-component="' + esc(row.component || "") + '" data-tc-id="' + esc(row.tc_id || "") + '" data-sheet-row="' + esc(row.sheet_row != null ? row.sheet_row : "") + '">해당 행 보기</button></td>' +
      '</tr>';
  }).join("");
  body.querySelectorAll(".ftc-open-detail-btn").forEach(function (btn, idx) {
    btn.addEventListener("click", function () {
      const row = pageInfo.rows[idx];
      if (!row) return;
      openDetailByMissingTc(row);
    });
  });
  renderPagination("defectMissingTcPagination", "defect_missing_tc", pageInfo);
}

function renderDefectMissingKeyTable() {
  const hint = document.getElementById("defectMissingKeyHint");
  const body = document.getElementById("defectMissingKeyBody");
  if (!body) return;
  if (!S.defect || !S.defect.ok || !S.defect.defect_source_ok) {
    body.innerHTML = '<tr><td colspan="8" class="hint">' + esc((S.defect && S.defect.detail) || "데이터 없음") + '</td></tr>';
    return;
  }
  const rows = filterMissingKeyRows(S.defect.rows || []);
  const pageInfo = paginateRows(rows, S.pageDefectMissing);
  S.pageDefectMissing = pageInfo.page;
  if (hint) hint.textContent = rows.length + "건 (DefectList_Raw에는 있고 Full_TC에는 없음)";
  if (!pageInfo.rows.length) {
    body.innerHTML = '<tr><td colspan="8" class="hint">누락 없음</td></tr>';
    renderPagination("defectMissingPagination", "defect_missing", pageInfo);
    return;
  }
  body.innerHTML = pageInfo.rows.map(function (row) {
    return '<tr class="ftc-row-missing">' +
      '<td><strong>' + esc(row.key || "-") + '</strong></td>' +
      '<td>' + esc(row.key_number != null ? row.key_number : "-") + '</td>' +
      '<td>' + esc(row.raw_sheet_row != null ? row.raw_sheet_row : "-") + '</td>' +
      '<td>' + esc(row.status || "-") + '</td>' +
      '<td>' + esc(row.resolution || "-") + '</td>' +
      '<td>' + esc(row.reporter || "-") + '</td>' +
      '<td class="ftc-label-cell">' + esc(row.summary || "-") + '</td>' +
      '<td><span class="ftc-audit-chip is-warn">Full_TC 지라 NO. 또는 Closed 지라 반영 필요</span></td>' +
      '</tr>';
  }).join("");
  renderPagination("defectMissingPagination", "defect_missing", pageInfo);
}

function renderDefectTable() {
  const hint = document.getElementById("defectTableHint");
  const body = document.getElementById("defectMatchBody");
  renderDefectTableHead();
  if (!body) return;
  if (!S.defect || !S.defect.ok || !S.defect.defect_source_ok) {
    body.innerHTML = '<tr><td colspan="16" class="hint">' + esc((S.defect && S.defect.detail) || "데이터 없음") + '</td></tr>';
    return;
  }
  const rows = getDefectFilteredRows(S.defect.rows, "main");
  const pageInfo = paginateRows(rows, S.pageDefectMatch);
  S.pageDefectMatch = pageInfo.page;
  if (hint) {
    const cols = (S.defect && S.defect.defect_raw_columns) || {};
    const keyCol = Number.isFinite(Number(cols.key)) ? "key C" + (Number(cols.key) + 1) : "key ?";
    const statusCol = Number.isFinite(Number(cols.status)) ? "status C" + (Number(cols.status) + 1) : "status ?";
    const resolutionCol = Number.isFinite(Number(cols.resolution)) ? "resolution C" + (Number(cols.resolution) + 1) : "resolution ?";
    hint.textContent = rows.length + "건 | " + pageInfo.start + "~" + pageInfo.end + " 표시 | Raw " + keyCol + ", " + statusCol + ", " + resolutionCol + " | 정책: status+resolution";
  }
  if (!pageInfo.rows.length) {
    body.innerHTML = '<tr><td colspan="16" class="hint">조회 결과 없음</td></tr>';
    renderPagination("defectMatchPagination", "defect_match", pageInfo);
    return;
  }
  body.innerHTML = pageInfo.rows.map(function (row) {
    const item = buildDefectDisplayRow(row);
    const coverage = item.coverage;
    const rowClass = coverage.tone === "danger" ? "ftc-row-alert" : (coverage.missing ? "ftc-row-missing" : "");
    return '<tr class="' + rowClass + '">' +
      '<td>' + defectCoverageChip(row) + '</td>' +
      '<td><strong>' + esc(item.key) + '</strong></td>' +
      '<td>' + esc(item.reporter) + '</td>' +
      '<td>' + esc(item.fixVersion) + '</td>' +
      '<td>' + esc(item.status) + '</td>' +
      '<td>' + esc(item.resolution) + '</td>' +
      '<td>' + esc(item.created) + '</td>' +
      '<td>' + esc(item.priority) + '</td>' +
      '<td class="ftc-label-cell ftc-summary-col">' + esc(item.summary) + '</td>' +
      '<td>' + esc(item.region) + '</td>' +
      '<td>' + esc(item.brand) + '</td>' +
      '<td>' + esc(item.os) + '</td>' +
      '<td class="ftc-label-cell">' + esc(item.components) + '</td>' +
      '<td>' + esc(item.affectsVersion) + '</td>' +
      '<td>' + esc(item.assignee) + '</td>' +
      '<td class="ftc-label-cell">' + esc(item.labels) + '</td>' +
      '</tr>';
  }).join("");
  renderPagination("defectMatchPagination", "defect_match", pageInfo);
}

function renderDefectAllColumnsTable() {
  const hint = document.getElementById("defectAllColumnsHint");
  const head = document.getElementById("defectAllColumnsHead");
  const body = document.getElementById("defectAllColumnsBody");
  if (!head || !body) return;
  if (!S.defect || !S.defect.ok || !S.defect.defect_source_ok) {
    head.innerHTML = "";
    body.innerHTML = '<tr><td class="hint">' + esc((S.defect && S.defect.detail) || "데이터 없음") + '</td></tr>';
    return;
  }
  const headers = Array.isArray(S.defect.defect_raw_headers) ? S.defect.defect_raw_headers : [];
  const rows = getDefectFilteredRows(S.defect.rows || [], "main");
  const pageInfo = paginateRows(rows, S.pageDefectAllColumns);
  S.pageDefectAllColumns = pageInfo.page;
  const dynamicColCount = Math.max(1, headers.length);
  if (hint) {
    hint.textContent = rows.length + "건 | " + pageInfo.start + "~" + pageInfo.end + " 표시 | Raw 헤더 " + dynamicColCount + "개";
  }
  head.innerHTML = '<tr><th>지라 키</th><th>Raw 행</th>' + headers.map(function (header, idx) {
    const text = String(header || "").trim();
    return '<th>' + esc(text || ("C" + (idx + 1))) + '</th>';
  }).join("") + '</tr>';
  if (!pageInfo.rows.length) {
    body.innerHTML = '<tr><td colspan="' + (dynamicColCount + 2) + '" class="hint">조회 결과 없음</td></tr>';
    renderPagination("defectAllColumnsPagination", "defect_all_columns", pageInfo);
    return;
  }
  body.innerHTML = pageInfo.rows.map(function (row) {
    const rawValues = Array.isArray(row.raw_values) ? row.raw_values : [];
    const normalizedValues = [];
    for (let i = 0; i < dynamicColCount; i += 1) {
      normalizedValues.push(String(rawValues[i] || "").trim() || "-");
    }
    return '<tr>' +
      '<td><strong>' + esc(row.key || "-") + '</strong></td>' +
      '<td>' + esc(row.raw_sheet_row != null ? row.raw_sheet_row : "-") + '</td>' +
      normalizedValues.map(function (cell) {
        return '<td class="ftc-label-cell">' + esc(cell) + '</td>';
      }).join("") +
      '</tr>';
  }).join("");
  renderPagination("defectAllColumnsPagination", "defect_all_columns", pageInfo);
}

function renderDefectViolationTable() {
  const hint = document.getElementById("defectViolationHint");
  const body = document.getElementById("defectViolationBody");
  if (!body) return;
  if (!S.defect || !S.defect.ok || !S.defect.defect_source_ok) {
    body.innerHTML = '<tr><td colspan="11" class="hint">' + esc((S.defect && S.defect.detail) || "데이터 없음") + '</td></tr>';
    return;
  }
  const rows = getDefectFilteredRows(S.defect.violation_rows || [], "violation");
  const pageInfo = paginateRows(rows, S.pageDefectViolation);
  S.pageDefectViolation = pageInfo.page;
  if (hint) hint.textContent = rows.length + "건 | " + pageInfo.start + "~" + pageInfo.end + " 표시";
  if (!pageInfo.rows.length) {
    body.innerHTML = '<tr><td colspan="11" class="hint">위반 없음</td></tr>';
    renderPagination("defectViolationPagination", "defect_violation", pageInfo);
    return;
  }
  body.innerHTML = pageInfo.rows.map(function (row) {
    return '<tr class="ftc-row-alert">' +
      '<td><strong>' + esc(row.key || "-") + '</strong></td>' +
      '<td>' + esc(row.key_number != null ? row.key_number : "-") + '</td>' +
      '<td>' + esc(row.raw_sheet_row != null ? row.raw_sheet_row : "-") + '</td>' +
      '<td>' + esc(row.status || "-") + '</td>' +
      '<td>' + esc(row.resolution || "-") + '</td>' +
      '<td>' + esc(row.reporter || "-") + '</td>' +
      '<td>' + slotChip(row.expected_slot) + '</td>' +
      '<td>' + slotChip(row.actual_slot) + '</td>' +
      '<td>' + auditChip(row.audit_code) + '</td>' +
        '<td class="ftc-label-cell">' + tcIdRefsMarkup(row.tc_refs) + '</td>' +
      '<td class="ftc-label-cell">' + refsMarkup(row.tc_refs) + '</td>' +
      '</tr>';
  }).join("");
  renderPagination("defectViolationPagination", "defect_violation", pageInfo);
}

function renderAll() {
  renderKpiBar();
  renderCompChips();
  renderComponentToc();
  renderLabelToc();
  if (S.tab === "summary") {
    renderSummaryProgressDeck();
    switchSummaryView(S.summaryView);
    renderSummaryCards();
    renderComponentResultTable();
    renderBrandTable();
    renderBrandCategoryTable();
    return;
  }
  if (S.tab === "group") {
    renderCategoryTree();
    return;
  }
  if (S.tab === "label") {
    renderLabelTable();
    renderLabelRowsTable();
    return;
  }
  if (S.tab === "detail") {
    renderDetailTable();
    return;
  }
  if (S.tab === "defect") {
    renderDefectKpi();
    renderDefectAuditKpi();
    renderDefectTable();
  }
}

async function loadSummary(force) {
  const hint = document.getElementById("qaFullTcHint");
  if (hint) hint.textContent = "데이터 로드 중...";
  setLoadAlert("", null);
  try {
    const data = await fetchJsonWithRetry("/api/qa/full-tc/summary" + (force ? "?force=true" : ""), { method: "GET" }, 2, FTC_SUMMARY_TIMEOUT_MS);
    if (!data || !data.ok) throw new Error((data && data.detail) || "Full_TC 통계 로드 실패");
    S.data = data;
    if (!S.activeLabel) {
      const firstLabel = (data.label_rows && data.label_rows[0] && data.label_rows[0].label) || "";
      S.activeLabel = String(firstLabel || "").trim();
    }
    resetMainPagination();
    setTransportHint("Direct 정상", "ok");
    saveTransportSnapshot();
  } catch (_e) {
    try {
      await loadBridge(force, false);
      setTransportHint("Bridge(요약 전용) 우회", "warn");
    } catch (_bridgeError) {
      if (!restoreTransportSnapshot()) {
        throw _bridgeError;
      }
      setTransportHint("스냅샷 복구", "warn");
    }
  }
  const data = S.data || {};
  if (!data || !data.ok) {
    setLoadAlert("데이터 소스 연결이 불안정합니다. 새로고침을 눌러 재시도해 주세요.", "warn");
  }
  if (hint) hint.textContent = "최신 업로드 Full_TC 기준 | 소스: " + (data.source || "-") + " | 업로드: " + (data.uploaded_at || "-") + " | 갱신: " + (data.updated_at || "-");
  renderAll();
  renderIntegrityAlert();
}

async function loadDefectMatch(force) {
  if (S.tab === "defect") {
    setLoadAlert("Defect 대조 데이터를 불러오는 중입니다.", "warn");
  }
  try {
    const data = await fetchJsonWithRetry("/api/qa/full-tc/defect-match" + (force ? "?force=true" : ""), { method: "GET" }, 2, FTC_DEFECT_TIMEOUT_MS);
    if (!data) throw new Error("Defect 대조 로드 실패");
    S.defect = data;
    resetDefectPagination();
    invalidateDefectFilterCache();
    if (S.data) {
      setTransportHint("Direct 정상", "ok");
    }
    saveTransportSnapshot();
  } catch (_e) {
    try {
      await loadBridge(force, true);
      setTransportHint("Bridge(전체) 우회", "warn");
    } catch (_bridgeError) {
      if (!restoreTransportSnapshot()) {
        throw _bridgeError;
      }
      setTransportHint("스냅샷 복구", "warn");
    }
  }
  if (!S.defect || !S.defect.ok) {
    setLoadAlert("Defect 대조 데이터를 불러오지 못했습니다. 소스 파일 또는 권한 상태를 확인해 주세요.", "warn");
  } else if (S.tab !== "defect") {
    setLoadAlert("", null);
  }
  renderAll();
  renderIntegrityAlert();
}

async function bootLoad() {
  try {
    await loadSummary(true);
    loadDefectMatch(true).catch(function () {
      // Summary는 표시하고 defect는 백그라운드 재시도 가능 상태로 둔다.
    });
  } catch (error) {
    if (isAuthError(error)) {
      setLoadAlert(error.message || "인증 만료로 데이터 로드 실패", "danger");
      const hint = document.getElementById("qaFullTcHint");
      if (hint) hint.textContent = "인증 상태 확인 필요";
      return;
    }
    setLoadAlert("초기 로드에 실패했습니다. 자동 재시도를 실행합니다.", "warn");
    await new Promise(function (resolve) { window.setTimeout(resolve, 600); });
    try {
      await loadSummary(true);
      loadDefectMatch(true).catch(function () {
        // defect 재로드 실패는 요약 표시를 막지 않는다.
      });
      setLoadAlert("연결이 복구되어 데이터를 다시 불러왔습니다.", "warn");
    } catch (retryError) {
      const hint = document.getElementById("qaFullTcHint");
      if (hint) hint.textContent = (retryError && retryError.message) || "로드 실패";
      setLoadAlert((retryError && retryError.message) || "데이터 로드 실패", "danger");
      toast((retryError && retryError.message) || "Full_TC 통계 로드 실패", "error");
    }
  }
}

document.querySelectorAll(".ftc-tab").forEach(function (button) {
  button.addEventListener("click", function () {
    switchTab(button.dataset.tab);
  });
});

document.querySelectorAll(".ftc-summary-view-tab").forEach(function (button) {
  button.addEventListener("click", function () {
    switchSummaryView(button.dataset.summaryView || "matrix");
  });
});

document.getElementById("qaFullTcCompChips")?.addEventListener("click", function (event) {
  const button = event.target.closest("[data-component]");
  if (!button) return;
  S.component = button.dataset.component || "all";
  resetMainPagination();
  renderAll();
});

document.getElementById("qaFullTcBrandBody")?.addEventListener("click", function (event) {
  const button = event.target.closest(".ftc-brand-count-btn");
  if (!button) return;
  const next = {
    brandKey: String(button.dataset.brandKey || ""),
    brandLabel: String(button.dataset.brandKey || "").toUpperCase() === "ALL" ? "통합" : String(button.dataset.brandKey || "").toUpperCase(),
    rowName: String(button.dataset.rowName || ""),
    bucket: String(button.dataset.bucket || ""),
  };
  if (
    S.brandDrill &&
    S.brandDrill.brandKey === next.brandKey &&
    S.brandDrill.rowName === next.rowName &&
    S.brandDrill.bucket === next.bucket
  ) {
    S.brandDrill = null;
    S.brandDrillViolationOnly = false;
  } else {
    S.brandDrill = next;
    S.brandDrillViolationOnly = false;
    S.pageBrandDrill = 1;
  }
  renderBrandTable();
});

document.getElementById("qaFullTcBrandViolationBtn")?.addEventListener("click", function () {
  if (!isBrandDrillViolationAvailable()) return;
  S.brandDrillViolationOnly = !S.brandDrillViolationOnly;
  S.pageBrandDrill = 1;
  renderBrandDrillRows();
});

// ── LABEL 이벤트 핸들러 ──────────────────────────────────────

// 메인 LABEL 테이블 클릭: 라벨 버튼 → 브랜드 드릴, 게이지 버튼 → 해당 브랜드 드릴
document.getElementById("qaFullTcLabelBody")?.addEventListener("click", function (event) {
  // 라벨 이름 버튼 클릭
  const labelBtn = event.target.closest(".ftc-label-row-btn");
  if (labelBtn) {
    const label = labelBtn.dataset.label || "";
    setActiveLabel(label);
    S.labelBrandDrill = { label: label, brand: "TOTAL" };
    S.labelRowDrill = null;
    renderLabelTable();
    renderLabelBrandDrill();
    renderLabelRowDrill();
    return;
  }
  // 특정 브랜드 게이지 버튼 클릭
  const gaugeBtn = event.target.closest(".ftc-lbg-wrap");
  if (gaugeBtn) {
    const label = gaugeBtn.dataset.label || "";
    const brand = gaugeBtn.dataset.brand || "KOA";
    setActiveLabel(label);
    S.labelBrandDrill = { label: label, brand: brand };
    S.labelRowDrill = null;
    renderLabelTable();
    renderLabelBrandDrill();
    renderLabelRowDrill();
    return;
  }
});

// 브랜드 탭 클릭 (KOA / HOA / GOA)
document.getElementById("qaLabelBrandTabs")?.addEventListener("click", function (event) {
  const btn = event.target.closest("[data-brand]");
  if (!btn) return;
  const label = btn.dataset.label || (S.labelBrandDrill && S.labelBrandDrill.label) || "";
  const brand = btn.dataset.brand || "TOTAL";
  S.labelBrandDrill = { label: label, brand: brand };
  if (S.labelRowDrill && S.labelRowDrill.label === label) {
    S.labelRowDrill = { ...S.labelRowDrill, brand: brand };
  } else {
    S.labelRowDrill = null;
  }
  renderLabelBrandDrill();
  renderLabelRowDrill();
});

// 컴포넌트 행 보기 버튼
document.getElementById("qaLabelCompBody")?.addEventListener("click", function (event) {
  const btn = event.target.closest(".ftc-label-row-drill-btn");
  if (!btn) return;
  const label = btn.dataset.label || "";
  const brand = btn.dataset.brand || "KOA";
  const component = btn.dataset.component || "";
  S.labelRowDrill = { label: label, brand: brand, component: component };
  S.labelRowDrillPage = 1;
  renderLabelBrandDrill();
  renderLabelRowDrill();
});

// 브랜드 드릴 닫기
document.getElementById("qaLabelBrandDrillClose")?.addEventListener("click", function () {
  S.labelBrandDrill = null;
  S.labelRowDrill = null;
  const card = document.getElementById("qaLabelBrandDrillCard");
  if (card) card.hidden = true;
  const rowCard = document.getElementById("qaLabelRowDrillCard");
  if (rowCard) rowCard.hidden = true;
});

// 행 드릴 닫기
document.getElementById("qaLabelRowDrillClose")?.addEventListener("click", function () {
  S.labelRowDrill = null;
  const rowCard = document.getElementById("qaLabelRowDrillCard");
  if (rowCard) rowCard.hidden = true;
});

// 행 드릴 페이저
document.getElementById("qaLabelRowDrillPager")?.addEventListener("click", function (event) {
  const btn = event.target.closest("[data-drill-page]");
  if (!btn) return;
  S.labelRowDrillPage = Number(btn.dataset.drillPage || 1);
  renderLabelRowDrill();
});

document.getElementById("qaFullTcLabelSearch")?.addEventListener("input", function (event) {
  S.labelQuery = String(event.target.value || "").trim();
  if (S.tab === "label") renderLabelTable();
});

document.getElementById("qaFullTcLabelTop100")?.addEventListener("click", function () {
  S.labelLimit = 100;
  if (S.tab === "label") renderLabelTable();
});

document.getElementById("qaFullTcLabelShowAll")?.addEventListener("click", function () {
  S.labelLimit = 0;
  if (S.tab === "label") renderLabelTable();
});

document.getElementById("qaFullTcCategorySearch")?.addEventListener("input", function (event) {
  S.groupQuery = String(event.target.value || "").trim();
  if (S.tab === "group") {
    renderCategoryTree();
  }
});

document.getElementById("qaFullTcCategoryTop100")?.addEventListener("click", function () {
  S.groupLimit = 100;
  if (S.tab === "group") renderCategoryTree();
});

document.getElementById("qaFullTcCategoryShowAll")?.addEventListener("click", function () {
  S.groupLimit = 0;
  if (S.tab === "group") renderCategoryTree();
});

document.getElementById("qaFullTcCategoryComponentCards")?.addEventListener("click", function (event) {
  const button = event.target.closest("[data-component]");
  if (!button) return;
  const component = button.dataset.component || "all";
  S.component = S.component === component ? "all" : component;
  S.pageCategoryDrill = 1;
  renderCategoryTree();
});

document.getElementById("qaFullTcCategoryOutlineBody")?.addEventListener("click", function (event) {
  const button = event.target.closest(".ftc-cat-count-btn");
  if (!button) return;
  const level = String(button.dataset.level || "depth3");
  const next = {
    level: level,
    component: String(button.dataset.component || "-"),
    depth1: String(button.dataset.depth1 || "(대분류 없음)"),
    depth2: String(button.dataset.depth2 || "(중분류 없음)"),
    depth3: String(button.dataset.depth3 || "(소분류 없음)"),
  };
  if (
    S.categoryDrill &&
    S.categoryDrill.level === next.level &&
    S.categoryDrill.component === next.component &&
    S.categoryDrill.depth1 === next.depth1 &&
    S.categoryDrill.depth2 === next.depth2 &&
    S.categoryDrill.depth3 === next.depth3
  ) {
    S.categoryDrill = null;
  } else {
    S.categoryDrill = next;
  }
  S.pageCategoryDrill = 1;
  renderCategoryTree();
});

document.getElementById("qaFullTcLabelSearch")?.addEventListener("input", function (event) {
  S.labelQuery = String(event.target.value || "").trim();
  if (S.tab === "label") renderLabelTable();
});

document.getElementById("qaFullTcLabelTop100")?.addEventListener("click", function () {
  S.labelLimit = 100;
  if (S.tab === "label") renderLabelTable();
});

document.getElementById("qaFullTcLabelShowAll")?.addEventListener("click", function () {
  S.labelLimit = 0;
  if (S.tab === "label") renderLabelTable();
});

document.getElementById("qaFullTcLabelTopCards")?.addEventListener("click", function (event) {
  const button = event.target.closest("[data-label]");
  if (!button) return;
  setActiveLabel(button.dataset.label || "");
  switchTab("label", true);
  renderLabelTable();
  renderLabelRowsTable();
});

document.getElementById("qaFullTcComponentToc")?.addEventListener("click", function (event) {
  const button = event.target.closest("[data-component]");
  if (!button) return;
  S.component = button.dataset.component || "all";
  resetMainPagination();
  renderAll();
});

document.getElementById("qaFullTcSearch")?.addEventListener("input", function (event) {
  S.query = String(event.target.value || "").trim();
  resetMainPagination();
  scheduleMainRender();
});

document.getElementById("qaFullTcNOnly")?.addEventListener("change", function (event) {
  S.nOnly = Boolean(event.target.checked);
  resetMainPagination();
  renderAll();
});

document.getElementById("qaFullTcNTOnly")?.addEventListener("change", function (event) {
  S.ntOnly = Boolean(event.target.checked);
  resetMainPagination();
  if (S.ntOnly) S.naOnly = false; // N/T와 N/A는 동시 선택 불가
  const naCheckbox = document.getElementById("qaFullTcNAOnly");
  if (naCheckbox) naCheckbox.checked = false;
  renderAll();
});

document.getElementById("qaFullTcNAOnly")?.addEventListener("change", function (event) {
  S.naOnly = Boolean(event.target.checked);
  resetMainPagination();
  if (S.naOnly) S.ntOnly = false; // N/T와 N/A는 동시 선택 불가
  const ntCheckbox = document.getElementById("qaFullTcNTOnly");
  if (ntCheckbox) ntCheckbox.checked = false;
  renderAll();
});

document.getElementById("qaFilterReset")?.addEventListener("click", function () {
  S.query = "";
  S.nOnly = false;
  S.ntOnly = false;
  S.naOnly = false;
  S.component = "all";
  resetMainPagination();
  const searchInput = document.getElementById("qaFullTcSearch");
  const nOnlyInput = document.getElementById("qaFullTcNOnly");
  const ntOnlyInput = document.getElementById("qaFullTcNTOnly");
  const naOnlyInput = document.getElementById("qaFullTcNAOnly");
  if (searchInput) searchInput.value = "";
  if (nOnlyInput) nOnlyInput.checked = false;
  if (ntOnlyInput) ntOnlyInput.checked = false;
  if (naOnlyInput) naOnlyInput.checked = false;
  renderAll();
});

document.getElementById("qaPageSizeSelect")?.addEventListener("change", function (event) {
  const nextSize = Number(event.target.value || FTC_DEFAULT_PAGE_SIZE);
  S.pageSize = Number.isFinite(nextSize) ? Math.max(20, nextSize) : FTC_DEFAULT_PAGE_SIZE;
  resetMainPagination();
  resetDefectPagination();
  renderAll();
});

document.getElementById("qaFullTcInlineEditBtn")?.addEventListener("click", function () {
  switchTab("summary", true);
  toast("각 행에서 '수정' 버튼으로 값/비고를 입력하세요.", "ok");
});

document.getElementById("qaFullTcRefreshBtn")?.addEventListener("click", function () {
  loadSummary(true)
    .then(function () {
      loadDefectMatch(true).catch(function () {
        // 요약은 최신 상태이므로 defect 실패는 안내만 하고 유지
      });
      toast("요약 데이터 갱신 완료 (Defect는 이어서 갱신)", "ok");
    })
    .catch(function (error) { toast(error.message || "새로고침 실패", "error"); });
});

document.getElementById("qaDetailColToggles")?.addEventListener("change", function (event) {
  const checkbox = event.target;
  if (!checkbox || checkbox.type !== "checkbox") return;
  const groupKey = checkbox.dataset.colgroup;
  if (!groupKey) return;
  S.colGroups[groupKey] = checkbox.checked;
  renderDetailTable();
});

document.getElementById("defectSearch")?.addEventListener("input", function (event) {
  S.defectQuery = String(event.target.value || "").trim();
  resetDefectPagination();
  invalidateDefectFilterCache();
  scheduleDefectRender();
});

["defectRangeMin"].forEach(function (id) {
  document.getElementById(id)?.addEventListener("input", function (event) {
    S[id] = String(event.target.value || "").trim();
    S.defectRangeMax = "";
    resetDefectPagination();
    invalidateDefectFilterCache();
    scheduleDefectRender();
  });
});

const defectRangeMinInput = document.getElementById("defectRangeMin");
if (defectRangeMinInput && !String(defectRangeMinInput.value || "").trim()) {
  defectRangeMinInput.value = S.defectRangeMin;
}

document.getElementById("defectStatusFilter")?.addEventListener("click", function (event) {
  const button = event.target.closest("[data-status]");
  if (!button) return;
  S.defectStatus = button.dataset.status || "all";
  resetDefectPagination();
  invalidateDefectFilterCache();
  syncDefectStatusChips();
  renderDefectKpi();
  renderDefectTable();
});

document.getElementById("defectResetBtn")?.addEventListener("click", function () {
  S.defectQuery = "";
  S.defectStatus = "all";
  S.defectRangeMin = "SPAQA-12000";
  S.defectRangeMax = "";
  const searchInput = document.getElementById("defectSearch");
  if (searchInput) searchInput.value = "";
  const minInput = document.getElementById("defectRangeMin");
  if (minInput) minInput.value = S.defectRangeMin;
  resetDefectPagination();
  invalidateDefectFilterCache();
  syncDefectStatusChips();
  renderDefectKpi();
  renderDefectTable();
  toast("Defect 조회 필터를 초기화했습니다.", "ok");
});

document.addEventListener("click", function (event) {
  const button = event.target.closest(".ftc-page-btn");
  if (!button || button.disabled) return;
  const target = String(button.dataset.pageTarget || "");
  const page = Number(button.dataset.page || "1");
  updatePage(target, page);
});

document.getElementById("defectRefreshBtn")?.addEventListener("click", function () {
  loadDefectMatch(true)
    .then(function () { toast("Defect 조회를 새로고침했습니다.", "ok"); })
    .catch(function (error) { toast(error.message || "새로고침 실패", "error"); });
});

document.getElementById("defectExportXlsxBtn")?.addEventListener("click", function () {
  exportDefectTable("xlsx");
});

document.getElementById("defectExportHtmlBtn")?.addEventListener("click", function () {
  exportDefectTable("html");
});

window.addEventListener("beforeunload", function () {
  if (S.bridgePerfTimer) {
    window.clearInterval(S.bridgePerfTimer);
    S.bridgePerfTimer = null;
  }
});

window.addEventListener("online", function () {
  loadSummary(true)
    .then(function () {
      setLoadAlert("네트워크가 복구되어 데이터를 다시 불러왔습니다.", "warn");
    })
    .catch(function (_e) {
      // online 이벤트 후 실패 시에는 기존 상태를 유지한다.
    });
});

applyViewPresetFromUrl();
switchTab(readTabFromUrl(), false);
startBridgePerfPolling();
bootLoad();
