function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let employees = [];
let assets = [];
let members = [];

const EMPLOYEE_FIELDS = [
  { key: "id", inputId: "employeeId" },
  { key: "name", inputId: "employeeName" },
  { key: "title", inputId: "employeeTitle" },
  { key: "birth", inputId: "employeeBirth" },
  { key: "employee_no", inputId: "employeeNo" },
  { key: "account_email", inputId: "employeeEmail" },
  { key: "phone", inputId: "employeePhone" },
  { key: "remote_id", inputId: "employeeRemoteId" },
  { key: "remote_password", inputId: "employeeRemotePw" },
  { key: "remote_device_info", inputId: "employeeRemoteDevice" },
  { key: "office_device_info", inputId: "employeeOfficeDevice" },
];

const ASSET_FIELD_DEFS = [
  { key: "구 관리번호", inputId: "assetOldNo", aliases: ["asset_no"] },
  { key: "NEW 관리 번호", inputId: "assetNewNo", aliases: ["management_no"] },
  { key: "OS", inputId: "assetOsType", aliases: ["platform"] },
  { key: "제조사", inputId: "assetMaker", aliases: ["maker"] },
  { key: "기기형태", inputId: "assetFormFactor", aliases: ["category"] },
  { key: "구매기기", inputId: "assetPurchaseDevice", aliases: ["model"] },
  { key: "OS 버전", inputId: "assetOsVersion", aliases: ["os_version"] },
  { key: "최종 OS 지원 버전", inputId: "assetOsMax", aliases: [] },
  { key: "모델번호", inputId: "assetModelNo", aliases: [] },
  { key: "제조번호(S/N)", inputId: "assetSerial", aliases: ["serial"] },
  { key: "사용 향지", inputId: "assetRegion", aliases: ["region"] },
  { key: "사용 브랜드", inputId: "assetUseBrand", aliases: [] },
  { key: "기기 소지자", inputId: "assetOwner", aliases: ["owner"] },
  { key: "엠콜스 어싸인", inputId: "assetAssignee", aliases: [] },
  { key: "비고", inputId: "assetMemo", aliases: [] },
  { key: "디키 여부", inputId: "assetDicky", aliases: [] },
  { key: "무선 MAC", inputId: "assetMac", aliases: [] },
  { key: "해상도", inputId: "assetResolution", aliases: [] },
  { key: "케이스", inputId: "assetCase", aliases: [] },
  { key: "구매년도", inputId: "assetYear", aliases: [] },
  { key: "구매날짜", inputId: "assetDate", aliases: [] },
  { key: "구매비용", inputId: "assetCost", aliases: [] },
  { key: "브랜드", inputId: "assetBrand", aliases: [] },
  { key: "보유처", inputId: "assetHolder", aliases: [] },
  { key: "영수증 번호", inputId: "assetReceipt", aliases: [] },
  { key: "실물 사진 번호", inputId: "assetPhoto", aliases: [] },
  { key: "구동 여부", inputId: "assetOperable", aliases: [] },
  { key: "비고(기타)", inputId: "assetEtc", aliases: ["비고2"] },
  { key: "구매 프로젝트", inputId: "assetProject", aliases: [] },
  { key: "엠콜스 티켓 NO", inputId: "assetTicket", aliases: [] },
];

function valById(id) {
  return document.getElementById(id)?.value?.trim() || "";
}

function setById(id, v) {
  const el = document.getElementById(id);
  if (el) el.value = String(v ?? "");
}

function pickAssetValue(row, def) {
  if (!row || typeof row !== "object") return "";
  const fromKey = row[def.key];
  if (fromKey !== undefined && fromKey !== null && String(fromKey).trim()) return String(fromKey).trim();
  for (const k of def.aliases) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
  }
  return "";
}

function normalizeAsset(row) {
  const fallbackId = String(row?.id || row?.["NEW 관리 번호"] || row?.["구 관리번호"] || "").trim();
  const out = { id: fallbackId };
  ASSET_FIELD_DEFS.forEach((def) => {
    out[def.key] = pickAssetValue(row, def);
  });
  if (!out.id) {
    out.id = String(out["NEW 관리 번호"] || out["구 관리번호"] || "").trim();
  }
  out["기기소지자 <> 엠콜스어싸인(비교)"] = String(row?.["기기소지자 <> 엠콜스어싸인(비교)"] || "").trim() || calcOwnerVsAssign(out);
  return out;
}

function calcOwnerVsAssign(row) {
  const owner = String(row?.["기기 소지자"] || "").trim();
  const assignee = String(row?.["엠콜스 어싸인"] || "").trim();
  if (!owner && !assignee) return "";
  return owner === assignee ? "일치" : "불일치";
}

function resetEmployeeForm() {
  EMPLOYEE_FIELDS.forEach((f) => setById(f.inputId, ""));
}

function resetAssetForm() {
  setById("assetId", "");
  ASSET_FIELD_DEFS.forEach((f) => setById(f.inputId, ""));
}

const MANAGE_SECTION_IDS = [
  "manageDeviceTab",
  "managePeopleTab",
  "manageUsimTab",
  "manageInOutTab",
  "manageScheduleTab",
];

function showManageSectionFromHash() {
  const requestedId = (window.location.hash || "").replace("#", "");
  const activeId = MANAGE_SECTION_IDS.includes(requestedId) ? requestedId : "manageDeviceTab";
  MANAGE_SECTION_IDS.forEach((id) => {
    const section = document.getElementById(id);
    if (section) section.hidden = id !== activeId;
  });
}

function renderEmployees() {
  const body = document.getElementById("employeeRows");
  if (!body) return;
  body.innerHTML = employees.map((x) => `
    <tr>
      <td>${esc(x.name || "-")}</td>
      <td>${esc(x.title || "-")}</td>
      <td>${esc(x.employee_no || "-")}</td>
      <td>${esc(x.account_email || "-")}</td>
      <td>${esc(x.phone || "-")}</td>
      <td>${esc(x.remote_id || "-")}</td>
      <td>${esc(x.remote_device_info || "-")}</td>
      <td>${esc(x.office_device_info || "-")}</td>
      <td>
        <button type="button" data-edit-emp="${esc(x.id)}">수정</button>
        <button type="button" class="btn-ghost" data-del-emp="${esc(x.id)}">삭제</button>
      </td>
    </tr>
  `).join("");
}

function renderAssets() {
  const body = document.getElementById("assetRows");
  if (!body) return;
  body.innerHTML = assets.map((x) => {
    const row = normalizeAsset(x);
    const compare = row["기기소지자 <> 엠콜스어싸인(비교)"] || calcOwnerVsAssign(row);
    const statusRaw = String(x.status || "active").toLowerCase();
    const deleteReq = String(x.delete_request_status || "none").toLowerCase();
    const statusText = statusRaw === "pending"
      ? "대기중"
      : statusRaw === "deleted"
      ? "삭제 완료"
      : deleteReq === "rejected"
      ? "반려"
      : "정상";
    const statusClass = statusRaw === "pending" ? "status-pending" : statusRaw === "deleted" ? "status-deleted" : deleteReq === "rejected" ? "status-rejected" : "status-active";
    const isPending = statusRaw === "pending";
    return `
    <tr>
      <td><input type="checkbox" class="asset-row-check" data-asset-id="${esc(row.id)}" /></td>
      <td><span class="asset-status-badge ${statusClass}">${esc(statusText)}</span></td>
      <td>
        <button type="button" data-edit-asset="${esc(row.id)}">수정</button>
        ${isPending
          ? `<button type="button" class="btn-warning" data-withdraw-asset="${esc(row.id)}">요청철회</button>`
          : `<button type="button" class="btn-ghost" data-del-asset="${esc(row.id)}" ${statusRaw !== "active" ? "disabled" : ""}>삭제요청</button>`
        }
      </td>
      <td>${esc(row["구 관리번호"] || "-")}</td>
      <td>${esc(row["NEW 관리 번호"] || "-")}</td>
      <td>${esc(row["OS"] || "-")}</td>
      <td>${esc(row["제조사"] || "-")}</td>
      <td>${esc(row["기기형태"] || "-")}</td>
      <td>${esc(row["구매기기"] || "-")}</td>
      <td>${esc(row["OS 버전"] || "-")}</td>
      <td>${esc(row["최종 OS 지원 버전"] || "-")}</td>
      <td>${esc(row["모델번호"] || "-")}</td>
      <td>${esc(row["제조번호(S/N)"] || "-")}</td>
      <td>${esc(row["사용 향지"] || "-")}</td>
      <td>${esc(row["사용 브랜드"] || "-")}</td>
      <td>${esc(row["기기 소지자"] || "-")}</td>
      <td>${esc(row["엠콜스 어싸인"] || "-")}</td>
      <td>${esc(row["비고"] || "-")}</td>
      <td>${esc(row["디키 여부"] || "-")}</td>
      <td>${esc(row["무선 MAC"] || "-")}</td>
      <td>${esc(row["해상도"] || "-")}</td>
      <td>${esc(row["케이스"] || "-")}</td>
      <td>${esc(row["구매년도"] || "-")}</td>
      <td>${esc(row["구매날짜"] || "-")}</td>
      <td>${esc(row["구매비용"] || "-")}</td>
      <td>${esc(row["브랜드"] || "-")}</td>
      <td>${esc(row["보유처"] || "-")}</td>
      <td>${esc(row["영수증 번호"] || "-")}</td>
      <td>${esc(row["실물 사진 번호"] || "-")}</td>
      <td>${esc(row["구동 여부"] || "-")}</td>
      <td>${esc(row["비고(기타)"] || "-")}</td>
      <td>${esc(row["구매 프로젝트"] || "-")}</td>
      <td>${esc(row["엠콜스 티켓 NO"] || "-")}</td>
      <td>${esc(compare || "-")}</td>
    </tr>
  `;
  }).join("");
}

function renderMembers() {
  const body = document.getElementById("memberRows");
  if (!body) return;
  members.sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) * -1);
  body.innerHTML = members.map((x) => {
    const isCoreAdmin = String(x.email || "").toLowerCase() === "sue@poliot.co.kr" || String(x.email || "").toLowerCase() === "hiss0723@poliot.co.kr";
    return `
    <tr>
      <td>${esc(x.email || "-")}</td>
      <td>${esc(x.name || "-")}</td>
      <td>${esc(x.role || "user")}</td>
      <td>${x.approved ? "승인" : "대기"}</td>
      <td>${x.can_login ? "허용" : "차단"}</td>
      <td>
        <button type="button" data-approve-member="${esc(x.email)}" ${x.approved ? "disabled" : ""}>승인</button>
        <button type="button" class="btn-secondary" data-toggle-login-member="${esc(x.email)}" data-next-login="${x.can_login ? "0" : "1"}" ${isCoreAdmin ? "disabled" : ""}>${x.can_login ? "로그인 차단" : "로그인 허용"}</button>
        <button type="button" class="btn-ghost" data-del-member="${esc(x.email)}" ${isCoreAdmin ? "disabled" : ""}>삭제</button>
      </td>
    </tr>
  `;
  }).join("");
}

async function refreshEmployees() {
  const res = await fetch("/api/admin/employees");
  const data = await res.json();
  employees = Array.isArray(data.items) ? data.items : [];
  renderEmployees();
}

async function refreshAssets() {
  const res = await fetch(`/api/admin/assets?_ts=${Date.now()}`, { cache: "no-store" });
  const data = await res.json();
  assets = Array.isArray(data.items) ? data.items : [];
  renderAssets();
  filterTableRows();
}

async function maybeMoveToAdminDecisionPage() {
  // 일반 사용자 접근을 고려해 삭제요청 후 관리자 페이지로 자동 이동하지 않는다.
  return;
}

function getSelectedAssetIds() {
  return Array.from(document.querySelectorAll(".asset-row-check:checked"))
    .map((el) => String(el.getAttribute("data-asset-id") || "").trim())
    .filter(Boolean);
}

function clearAllAssetFilters() {
  Object.keys(filterState).forEach((k) => delete filterState[k]);
  closeFilterPopup();
  filterTableRows();
}

async function requestDeleteAssets(ids) {
  const uniqueIds = [...new Set((ids || []).map((x) => String(x || "").trim()).filter(Boolean))];
  if (!uniqueIds.length) {
    window.alert("삭제 요청할 항목을 선택해 주세요.");
    return;
  }

  const meRes = await fetch(`/api/auth/me?_ts=${Date.now()}`, { cache: "no-store" });
  let actorEmail = "unknown";
  if (meRes.ok) {
    try {
      const me = await meRes.json();
      actorEmail = String(me?.user?.email || "unknown").trim().toLowerCase() || "unknown";
    } catch {}
  }

  const failed = [];
  for (const rawId of uniqueIds) {
    const id = String(rawId || "").trim();
    const row = assets.find((x) => {
      const candidates = [
        String(x?.id || ""),
        String(x?.["NEW 관리 번호"] || ""),
        String(x?.["구 관리번호"] || ""),
        String(x?.management_no || ""),
        String(x?.asset_no || ""),
      ].map((v) => v.trim().toLowerCase()).filter(Boolean);
      return candidates.includes(id.toLowerCase());
    });

    const keys = [...new Set([
      id,
      String(row?.id || "").trim(),
      String(row?.["NEW 관리 번호"] || "").trim(),
      String(row?.["구 관리번호"] || "").trim(),
      String(row?.management_no || "").trim(),
      String(row?.asset_no || "").trim(),
    ].filter(Boolean))];

    let success = false;
    let lastErr = "";

    for (const key of keys) {
      const reqRes = await fetch(`/api/admin/assets/${encodeURIComponent(key)}/request-delete`, { method: "POST" });
      if (reqRes.ok) {
        success = true;
        break;
      }
      try {
        const data = await reqRes.json();
        lastErr = String(data?.detail || reqRes.statusText || "").trim();
      } catch {
        lastErr = String(reqRes.statusText || "").trim();
      }
    }

    if (!success && row?.id) {
      const putRes = await fetch(`/api/admin/assets/${encodeURIComponent(String(row.id))}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "pending",
          delete_request_status: "pending",
          delete_requested_by: actorEmail,
          delete_requested_at: new Date().toISOString(),
          delete_reviewed_by: "",
          delete_reviewed_at: "",
          delete_reject_reason: "",
        }),
      });
      if (putRes.ok) {
        success = true;
      } else {
        try {
          const data = await putRes.json();
          lastErr = String(data?.detail || putRes.statusText || lastErr || "").trim();
        } catch {
          lastErr = String(putRes.statusText || lastErr || "").trim();
        }
      }
    }

    if (!success) {
      failed.push(`${id}${lastErr ? `(${lastErr})` : ""}`);
      continue;
    }

    if (row) {
      row.status = "pending";
      row.delete_request_status = "pending";
      row.delete_requested_by = actorEmail;
      row.delete_requested_at = new Date().toISOString();
    }
  }

  if (failed.length) {
    throw new Error(`삭제 요청 실패: ${failed.join(", ")}`);
  }

  for (const id of uniqueIds) {
    // 요청 직후 UI에서 상태를 즉시 대기중으로 반영
    const target = assets.find((x) => {
      const candidates = [
        String(x?.id || ""),
        String(x?.["NEW 관리 번호"] || ""),
        String(x?.["구 관리번호"] || ""),
        String(x?.management_no || ""),
        String(x?.asset_no || ""),
      ].map((v) => v.trim().toLowerCase()).filter(Boolean);
      return candidates.includes(String(id || "").trim().toLowerCase());
    });
    if (target) {
      target.status = "pending";
      target.delete_request_status = "pending";
    }
  }
  renderAssets();
  filterTableRows();
  await refreshAssets();
}

async function withdrawDeleteAssets(ids) {
  const uniqueIds = [...new Set((ids || []).map((x) => String(x || "").trim()).filter(Boolean))];
  if (!uniqueIds.length) {
    window.alert("철회할 요청 항목이 없습니다.");
    return;
  }

  const failed = [];
  for (const rawId of uniqueIds) {
    const id = String(rawId || "").trim();
    const row = assets.find((x) => {
      const candidates = [
        String(x?.id || ""),
        String(x?.["NEW 관리 번호"] || ""),
        String(x?.["구 관리번호"] || ""),
        String(x?.management_no || ""),
        String(x?.asset_no || ""),
      ].map((v) => v.trim().toLowerCase()).filter(Boolean);
      return candidates.includes(id.toLowerCase());
    });

    const keys = [...new Set([
      id,
      String(row?.id || "").trim(),
      String(row?.["NEW 관리 번호"] || "").trim(),
      String(row?.["구 관리번호"] || "").trim(),
      String(row?.management_no || "").trim(),
      String(row?.asset_no || "").trim(),
    ].filter(Boolean))];

    let success = false;
    let lastErr = "";

    for (const key of keys) {
      const reqRes = await fetch(`/api/admin/assets/${encodeURIComponent(key)}/withdraw-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
      });
      if (reqRes.ok) {
        success = true;
        break;
      }
      try {
        const data = await reqRes.json();
        lastErr = String(data?.detail || reqRes.statusText || "").trim();
      } catch {
        lastErr = String(reqRes.statusText || "").trim();
      }
    }

    if (!success) {
      failed.push(`${id}${lastErr ? `(${lastErr})` : ""}`);
      continue;
    }

    if (row) {
      row.status = "active";
      row.delete_request_status = "none";
      row.delete_requested_by = "";
      row.delete_requested_at = "";
      row.delete_reviewed_by = "";
      row.delete_reviewed_at = "";
      row.delete_reject_reason = "";
    }
  }

  if (failed.length) {
    throw new Error(`요청 철회 실패: ${failed.join(", ")}`);
  }

  renderAssets();
  filterTableRows();
  await refreshAssets();
}

async function refreshMembers() {
  const res = await fetch("/api/admin/users");
  const data = await res.json();
  members = Array.isArray(data.items) ? data.items : [];
  renderMembers();
}

async function saveEmployee(ev) {
  ev.preventDefault();
  const id = valById("employeeId");
  const payload = {};
  EMPLOYEE_FIELDS.forEach((f) => {
    payload[f.key] = valById(f.inputId);
  });
  payload.id = id;
  const method = id ? "PUT" : "POST";
  const url = id ? `/api/admin/employees/${encodeURIComponent(id)}` : "/api/admin/employees";
  await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  resetEmployeeForm();
  await refreshEmployees();
}

async function saveAsset(ev) {
  ev.preventDefault();
  const id = valById("assetId");
  const payload = { id };
  ASSET_FIELD_DEFS.forEach((f) => {
    payload[f.key] = valById(f.inputId);
  });
  payload["기기소지자 <> 엠콜스어싸인(비교)"] = calcOwnerVsAssign(payload);

  // Backward-compatible keys for existing exports/scripts.
  payload.asset_no = payload["구 관리번호"];
  payload.management_no = payload["NEW 관리 번호"];
  payload.platform = payload["OS"];
  payload.maker = payload["제조사"];
  payload.category = payload["기기형태"];
  payload.model = payload["구매기기"];
  payload.os_version = payload["OS 버전"];
  payload.serial = payload["제조번호(S/N)"];
  payload.region = payload["사용 향지"];
  payload.owner = payload["기기 소지자"];

  const method = id ? "PUT" : "POST";
  const url = id ? `/api/admin/assets/${encodeURIComponent(id)}` : "/api/admin/assets";
  await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  resetAssetForm();
  await refreshAssets();
}

// ===== 모달 함수 =====
function openAssetModal() {
  document.getElementById("assetModal").style.display = "flex";
  resetAssetForm();
}

function closeAssetModal() {
  document.getElementById("assetModal").style.display = "none";
}

// 모달 오버레이 클릭 시 닫기
document.getElementById("assetModal")?.addEventListener("click", (ev) => {
  if (ev.target.classList.contains("modal-overlay")) {
    closeAssetModal();
  }
});

// 모달 닫기 버튼 클릭 시 닫기
document.querySelector(".modal-close-btn")?.addEventListener("click", closeAssetModal);

document.getElementById("assetForm")?.addEventListener("submit", saveAsset);
document.getElementById("assetResetBtn")?.addEventListener("click", resetAssetForm);
document.getElementById("newAssetBtn")?.addEventListener("click", openAssetModal);

// ===== 필터링 로직 =====
const filterState = {};

function getAssetColumnValue(rawRow, colName) {
  const n = normalizeAsset(rawRow);
  return String(n[colName] || "").trim();
}

function getHeaderColumnName(th) {
  const clone = th.cloneNode(true);
  clone.querySelectorAll(".col-filter-btn").forEach((el) => el.remove());
  return String(clone.textContent || "").trim();
}

function getColumnIndexMap() {
  const map = {};
  document.querySelectorAll(".asset-table thead th.table-col-header").forEach((th, idx) => {
    const btn = th.querySelector(".col-filter-btn");
    const colName = btn?.dataset.col || getHeaderColumnName(th);
    if (colName) map[colName] = idx;
  });
  return map;
}

function ensureAssetFilterButtons() {
  document.querySelectorAll(".asset-table thead th.table-col-header").forEach((th) => {
    const existing = th.querySelector(".col-filter-btn");
    const colName = existing?.dataset.col || getHeaderColumnName(th);
    if (!colName) return;

    if (!existing) {
      const btn = document.createElement("span");
      btn.className = "col-filter-btn";
      btn.dataset.col = colName;
      btn.title = "필터/정렬";
      btn.innerHTML = '<i class="fas fa-filter"></i>';
      th.appendChild(btn);
    } else if (!existing.dataset.col) {
      existing.dataset.col = colName;
    }
  });
  updateAssetFilterButtonStates();
}

function updateAssetFilterButtonStates() {
  document.querySelectorAll(".asset-table thead .col-filter-btn").forEach((btn) => {
    const colName = String(btn.getAttribute("data-col") || "").trim();
    const cfg = filterState[colName];
    const active = Boolean(cfg && Array.isArray(cfg.values) && cfg.values.length > 0);
    btn.classList.toggle("is-active", active);
  });
}

function getPopupSelectedTokens(popup) {
  const tokens = [];
  popup.querySelectorAll('.filter-option input[type="checkbox"]:checked').forEach((cb) => {
    const token = cb.getAttribute("data-token");
    if (token) tokens.push(token);
  });
  return tokens;
}

function persistFilterByMode(colName, mode, selectedTokens, allTokens) {
  const unique = [...new Set(selectedTokens)];
  if (!unique.length || unique.length === allTokens.length) {
    delete filterState[colName];
    return;
  }
  filterState[colName] = { mode, values: unique };
}

function openFilterPopup(colName, event) {
  event.stopPropagation();
  const existing = document.querySelector(".filter-popup.active");
  if (existing && existing.dataset.col === colName) {
    closeFilterPopup();
    return;
  }
  closeFilterPopup();

  const uniqueValues = new Set();
  assets.forEach((row) => {
    const val = getAssetColumnValue(row, colName);
    uniqueValues.add(val || "-");
  });

  const allValues = Array.from(uniqueValues).sort((a, b) => String(a).localeCompare(String(b), "ko"));
  const tokens = allValues.map((v) => ({ value: v, token: encodeURIComponent(v) }));
  const selectedTokens = new Set(filterState[colName]?.values || tokens.map((x) => x.token));

  const popup = document.createElement("div");
  popup.className = "filter-popup active";
  popup.dataset.col = colName;
  popup.innerHTML = `
    <div class="filter-popup-header">
      ${esc(colName)}
      <button type="button" class="filter-popup-close" data-action="close" aria-label="닫기">
        <i class="fas fa-times"></i>
      </button>
    </div>
    <div class="filter-sorting">
      <button type="button" class="filter-sort-btn asc-btn" data-action="sort-asc">오름차순</button>
      <button type="button" class="filter-sort-btn desc-btn" data-action="sort-desc">내림차순</button>
    </div>
    <div class="filter-search-wrap">
      <input type="text" class="filter-search-input" placeholder="값 검색" data-role="search" />
    </div>
    <div class="filter-tools">
      <button type="button" class="filter-tool-btn" data-action="check-all">전체선택</button>
      <button type="button" class="filter-tool-btn" data-action="uncheck-all">전체해제</button>
    </div>
    <div class="filter-options">
      ${tokens
        .map(({ value, token }, idx) => {
          const safeVal = esc(value);
          const checked = selectedTokens.has(token) ? "checked" : "";
          return `
            <div class="filter-option">
              <input type="checkbox" data-token="${token}" id="f-${idx}" ${checked}>
              <label for="f-${idx}">${safeVal}</label>
            </div>
          `;
        })
        .join("")}
    </div>
    <div class="filter-actions">
      <button type="button" class="filter-apply" data-action="apply-include">선택 포함</button>
      <button type="button" class="filter-apply" data-action="apply-exclude">선택 제외</button>
      <button type="button" class="filter-reset" data-action="reset">초기화</button>
    </div>
  `;

  const btn = event.target.closest(".col-filter-btn");
  if (!btn) return;
  const rect = btn.getBoundingClientRect();
  const popupWidth = 280;
  const popupHeight = 360;
  const top = rect.bottom + popupHeight + 8 > window.innerHeight
    ? Math.max(8, rect.top - popupHeight - 8)
    : rect.bottom + 6;
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - popupWidth - 8);
  popup.style.position = "fixed";
  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;
  popup.style.right = "auto";
  popup.style.minWidth = `${popupWidth}px`;
  popup.style.display = "block";
  document.body.appendChild(popup);

  const searchInput = popup.querySelector('[data-role="search"]');
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const keyword = String(searchInput.value || "").trim().toLowerCase();
      popup.querySelectorAll(".filter-option").forEach((optionEl) => {
        const txt = String(optionEl.textContent || "").trim().toLowerCase();
        optionEl.style.display = txt.includes(keyword) ? "flex" : "none";
      });
    });
  }

  popup.addEventListener("click", (e) => {
    e.stopPropagation();
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const actionEl = target.closest("[data-action]");
    if (!actionEl) return;
    const action = actionEl.getAttribute("data-action");
    if (action === "close") {
      closeFilterPopup();
    } else if (action === "check-all") {
      popup.querySelectorAll('.filter-option input[type="checkbox"]').forEach((cb) => {
        cb.checked = true;
      });
    } else if (action === "uncheck-all") {
      popup.querySelectorAll('.filter-option input[type="checkbox"]').forEach((cb) => {
        cb.checked = false;
      });
    } else if (action === "apply-include") {
      const selected = getPopupSelectedTokens(popup);
      persistFilterByMode(colName, "include", selected, tokens.map((x) => x.token));
      filterTableRows();
      closeFilterPopup();
    } else if (action === "apply-exclude") {
      const selected = getPopupSelectedTokens(popup);
      persistFilterByMode(colName, "exclude", selected, tokens.map((x) => x.token));
      filterTableRows();
      closeFilterPopup();
    } else if (action === "reset") {
      resetFilter(colName);
    } else if (action === "sort-asc") {
      sortColumnBy(colName, true);
      closeFilterPopup();
    } else if (action === "sort-desc") {
      sortColumnBy(colName, false);
      closeFilterPopup();
    }
  });
}

function closeFilterPopup() {
  const popup = document.querySelector(".filter-popup.active");
  if (popup) popup.remove();
}

function resetFilter(colName) {
  delete filterState[colName];
  filterTableRows();
  updateAssetFilterButtonStates();
  closeFilterPopup();
}

function filterTableRows() {
  const rows = document.querySelectorAll("#assetRows tr");
  const colIndexMap = getColumnIndexMap();

  rows.forEach((row) => {
    let isVisible = true;

    for (const [colName, cfg] of Object.entries(filterState)) {
      const selectedValues = new Set(cfg?.values || []);
      if (!selectedValues.size) continue;

      const cellIdx = colIndexMap[colName];
      if (cellIdx === undefined) continue;

      const cellValue = (row.cells[cellIdx]?.textContent || "").trim() || "-";
      const token = encodeURIComponent(cellValue);
      if (cfg.mode === "exclude" && selectedValues.has(token)) {
        isVisible = false;
        break;
      }
      if (cfg.mode !== "exclude" && !selectedValues.has(token)) {
        isVisible = false;
        break;
      }
    }

    row.style.display = isVisible ? "" : "none";
  });
  updateAssetFilterButtonStates();
}

function sortColumnBy(colName, isAsc) {
  const sorted = [...assets].sort((a, b) => {
    const aVal = getAssetColumnValue(a, colName).toLowerCase();
    const bVal = getAssetColumnValue(b, colName).toLowerCase();
    return isAsc ? aVal.localeCompare(bVal, "ko") : bVal.localeCompare(aVal, "ko");
  });
  assets = sorted;
  refreshAssets();
}

// 필터 버튼 클릭 이벤트 위임
document.addEventListener("click", (e) => {
  if (!(e.target instanceof Element)) return;
  const filterBtn = e.target.closest(".col-filter-btn");
  if (filterBtn) {
    const colName = filterBtn.dataset.col;
    openFilterPopup(colName, e);
  } else if (!e.target.closest(".filter-popup")) {
    // 필터 팝업 외부 클릭 시 닫기
    closeFilterPopup();
  }
});

ensureAssetFilterButtons();

document.getElementById("assetCheckAll")?.addEventListener("change", (ev) => {
  const checked = Boolean(ev?.target?.checked);
  document.querySelectorAll(".asset-row-check").forEach((el) => {
    el.checked = checked;
  });
});

document.getElementById("clearAssetFiltersBtn")?.addEventListener("click", clearAllAssetFilters);
document.getElementById("requestDeleteSelectedBtn")?.addEventListener("click", async () => {
  try {
    const ids = getSelectedAssetIds();
    if (!ids.length) {
      window.alert("선택된 항목이 없습니다.");
      return;
    }
    const ok = window.confirm(`${ids.length}건 삭제 요청하시겠습니까?`);
    if (!ok) return;
    await requestDeleteAssets(ids);
    window.alert("삭제 요청이 접수되었습니다. 상태가 대기중으로 변경되며 관리자 승인판단 페이지에서 처리됩니다.");
    await maybeMoveToAdminDecisionPage();
  } catch (error) {
    window.alert(error?.message || "삭제 요청 처리 중 오류가 발생했습니다.");
  }
});

document.getElementById("assetRows")?.addEventListener("click", async (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLElement)) return;
  const delId = t.getAttribute("data-del-asset");
  const withdrawId = t.getAttribute("data-withdraw-asset");
  const editId = t.getAttribute("data-edit-asset");
  if (delId) {
    try {
      const ok = window.confirm("해당 자산을 삭제 요청하시겠습니까? (관리자 승인 필요)");
      if (!ok) return;
      await requestDeleteAssets([delId]);
      window.alert("삭제 요청이 접수되었습니다. 상태가 대기중으로 변경되며 관리자 승인판단 페이지에서 처리됩니다.");
      await maybeMoveToAdminDecisionPage();
    } catch (error) {
      window.alert(error?.message || "삭제 요청 처리 중 오류가 발생했습니다.");
    }
    return;
  }
  if (withdrawId) {
    try {
      const ok = window.confirm("삭제 요청을 철회하시겠습니까? 항목이 정상 상태로 복원됩니다.");
      if (!ok) return;
      await withdrawDeleteAssets([withdrawId]);
      window.alert("요청이 철회되었습니다. 항목이 정상 상태로 복원되었습니다.");
    } catch (error) {
      window.alert(error?.message || "요청 철회 처리 중 오류가 발생했습니다.");
    }
    return;
  }
  if (editId) {
    const row = assets.find((x) => String(x.id) === String(editId));
    if (!row) return;
    const n = normalizeAsset(row);
    setById("assetId", n.id || "");
    ASSET_FIELD_DEFS.forEach((f) => setById(f.inputId, n[f.key] || ""));
  }
});

window.addEventListener("hashchange", showManageSectionFromHash);
showManageSectionFromHash();
refreshAssets();
