function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const FULL_TC_MAX_ROWS = 350;
const FULL_TC_REALTIME_MS = 5000;

let fullTcSheets = [];
let fullTcRealtimeSet = new Set();
let fullTcCurrentSheet = "";
let fullTcTimer = null;
let fullTcSourceType = "";
let fullTcListDetail = "";

function prettyFullTcError(detail) {
  const code = String(detail || "").trim();
  if (!code) return "원인을 알 수 없는 오류";
  if (code === "apps_script_login_required_or_public_access_disabled") {
    return "Apps Script 접근 권한 문제로 데이터를 불러오지 못했습니다. 웹앱 배포 권한을 'Anyone' 또는 사내 접근 가능 설정으로 바꿔주세요.";
  }
  if (code === "apps_script_timeout") {
    return "Apps Script 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.";
  }
  if (code.startsWith("apps_script_http_")) {
    return `Apps Script HTTP 오류(${code.replace("apps_script_http_", "")})로 조회에 실패했습니다.`;
  }
  if (code === "apps_script_url_missing") {
    return "FULL_TC Apps Script URL 설정이 비어 있습니다.";
  }
  if (code === "apps_script_invalid_json_response" || code === "apps_script_non_object_json") {
    return "Apps Script 응답 형식이 올바르지 않습니다. 배포된 스크립트 반환값을 확인해주세요.";
  }
  return code;
}

function setHint(text) {
  const el = document.getElementById("fullTcSheetHint");
  if (!el) return;
  el.innerText = text;
}

function setRealtimeBadge(enabled) {
  const el = document.getElementById("fullTcRealtimeBadge");
  if (!el) return;
  el.innerText = enabled
    ? `실시간 모드: ON (${Math.round(FULL_TC_REALTIME_MS / 1000)}초 주기)`
    : "실시간 모드: OFF";
}

function stopRealtimePolling() {
  if (!fullTcTimer) return;
  clearInterval(fullTcTimer);
  fullTcTimer = null;
}

function startRealtimePollingIfNeeded() {
  stopRealtimePolling();
  const enabled = fullTcRealtimeSet.has(fullTcCurrentSheet);
  setRealtimeBadge(enabled);
  if (!enabled) return;

  fullTcTimer = setInterval(function () {
    if (!fullTcCurrentSheet) return;
    loadSheetData(fullTcCurrentSheet, false).catch(function () {});
  }, FULL_TC_REALTIME_MS);
}

function renderSheetButtons() {
  const root = document.getElementById("fullTcSheetButtons");
  if (!root) return;
  if (!fullTcSheets.length) {
    root.innerHTML = '<p class="hint">표시할 시트가 없습니다.</p>';
    return;
  }

  root.innerHTML = fullTcSheets.map(function (name) {
    const active = name === fullTcCurrentSheet;
    return `<button type="button" class="btn-ghost fulltc-sheet-btn ${active ? "active" : ""}" data-sheet="${esc(name)}">${esc(name)}</button>`;
  }).join("");
}

function renderSheetTable(data) {
  const head = document.getElementById("fullTcHead");
  const body = document.getElementById("fullTcBody");
  if (!head || !body) return;

  const headers = Array.isArray(data?.headers) ? data.headers : [];
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  if (!headers.length) {
    head.innerHTML = "";
    body.innerHTML = '<tr><td class="hint">데이터를 불러오지 못했습니다.</td></tr>';
    return;
  }

  head.innerHTML = `<tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>`;
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="${headers.length}" class="hint">데이터가 없습니다.</td></tr>`;
    return;
  }

  body.innerHTML = rows.map(function (row) {
    const cells = headers.map(function (_, idx) {
      const raw = Array.isArray(row) ? row[idx] : "";
      const text = String(raw ?? "").trim();
      return `<td>${esc(text || "-")}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
}

async function fetchSheetList(force) {
  const qs = new URLSearchParams();
  if (force) qs.set("force", "true");
  const url = `/api/fulltc/sheets${qs.toString() ? `?${qs.toString()}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`시트 목록 조회 실패 (${res.status})`);
  }
  return await res.json();
}

async function loadSheetData(sheetName, force) {
  const target = String(sheetName || "").trim();
  if (!target) return;

  const qs = new URLSearchParams({ sheet: target, max_rows: String(FULL_TC_MAX_ROWS) });
  if (force) qs.set("force", "true");
  const res = await fetch(`/api/fulltc/sheet-data?${qs.toString()}`);
  if (!res.ok) {
    throw new Error(`시트 데이터 조회 실패 (${res.status})`);
  }

  const data = await res.json();
  if (!data?.ok) {
    throw new Error(prettyFullTcError(data?.detail || "시트 데이터 조회 실패"));
  }

  fullTcCurrentSheet = target;
  renderSheetButtons();
  renderSheetTable(data);
  startRealtimePollingIfNeeded();
  const source = String(data?.source_type || fullTcSourceType || "-");
  setHint(`${target} | ${Number(data?.count || 0)}행 | 갱신 ${data?.updated_at || "-"} | source: ${source}`);
}

async function bootstrapFullTcPage() {
  try {
    const listData = await fetchSheetList(false);
    fullTcSheets = Array.isArray(listData?.sheets) ? listData.sheets : [];
    fullTcRealtimeSet = new Set(Array.isArray(listData?.realtime_sheets) ? listData.realtime_sheets : []);
    fullTcSourceType = String(listData?.source_type || "");
    fullTcListDetail = String(listData?.detail || "");

    if (!fullTcSheets.length) {
      renderSheetButtons();
      setRealtimeBadge(false);
      setHint("시트 목록을 불러오지 못했습니다.");
      return;
    }

    fullTcCurrentSheet = fullTcSheets[0];
    renderSheetButtons();

    if (listData?.using_fallback) {
      setHint(`시트 목록 fallback 사용중 (${prettyFullTcError(fullTcListDetail || "unknown")}). Apps Script 웹앱 /exec URL 설정 시 자동 전환됩니다.`);
    }

    await loadSheetData(fullTcCurrentSheet, false);
  } catch (err) {
    setRealtimeBadge(false);
    setHint(`초기화 실패: ${String(err)}`);
  }
}

document.getElementById("fullTcSheetButtons")?.addEventListener("click", function (event) {
  const el = event.target;
  if (!(el instanceof HTMLElement)) return;
  const btn = el.closest(".fulltc-sheet-btn");
  if (!(btn instanceof HTMLButtonElement)) return;
  const sheet = String(btn.dataset.sheet || "").trim();
  if (!sheet || sheet === fullTcCurrentSheet) return;
  loadSheetData(sheet, false).catch(function (err) {
    setHint(`시트 조회 실패: ${String(err)}`);
  });
});

document.getElementById("fullTcRefreshBtn")?.addEventListener("click", function () {
  if (!fullTcCurrentSheet) return;
  loadSheetData(fullTcCurrentSheet, true).catch(function (err) {
    setHint(`새로고침 실패: ${String(err)}`);
  });
});

bootstrapFullTcPage();
