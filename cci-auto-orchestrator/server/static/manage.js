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
let schedules = [];
let currentUser = null;
let scheduleViewMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

const SCHEDULE_TYPE_META = {
  vacation: { label: "휴가", className: "vacation" },
  annual_leave: { label: "연차", className: "annual_leave" },
  half_day: { label: "반차", className: "half_day" },
  sick_leave: { label: "병가", className: "sick_leave" },
  deployment: { label: "배포 일정", className: "deployment" },
  meeting: { label: "회의", className: "meeting" },
  brand_meeting: { label: "브랜드 회의", className: "brand_meeting" },
};

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

function isAssetLockedForEdit(row) {
  const statusRaw = String(row?.status || "active").trim().toLowerCase();
  const deleteReq = String(row?.delete_request_status || "none").trim().toLowerCase();
  return statusRaw === "pending" || statusRaw === "deleted" || deleteReq === "pending";
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

function normalizeScheduleType(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "schedule" || raw === "memo" || raw === "admin_schedule") return "meeting";
  if (raw === "annual" || raw === "annual-leave") return "annual_leave";
  if (raw === "half-day" || raw === "halfday") return "half_day";
  if (raw === "sick" || raw === "sick-leave") return "sick_leave";
  if (raw === "release") return "deployment";
  if (raw === "brand" || raw === "brand-meeting") return "brand_meeting";
  if (raw in SCHEDULE_TYPE_META) return raw;
  return "vacation";
}

function normalizeApprovalStatus(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "approved" || raw === "ok") return "approved";
  if (raw === "rejected" || raw === "reject" || raw === "denied") return "rejected";
  return "pending";
}

function approvalStatusLabel(value) {
  const status = normalizeApprovalStatus(value);
  if (status === "approved") return "승인";
  if (status === "rejected") return "반려";
  return "승인 대기";
}

function scheduleTypeLabel(type) {
  const normalized = normalizeScheduleType(type);
  return SCHEDULE_TYPE_META[normalized]?.label || "일정";
}

function currentUserEmail() {
  return String(currentUser?.email || "").trim().toLowerCase();
}

function isCurrentUserAdmin() {
  return String(currentUser?.role || "").trim().toLowerCase() === "admin";
}

function isScheduleLocked(item) {
  if (!item) return false;
  return normalizeApprovalStatus(item.approval_status) === "approved";
}

function canEditSchedule(item) {
  if (!item) return false;
  if (isScheduleLocked(item)) return false;
  if (isCurrentUserAdmin()) return true;
  return String(item.author_email || "").trim().toLowerCase() === currentUserEmail();
}

function setScheduleFormHint(text) {
  const hint = document.getElementById("scheduleFormHint");
  if (hint) hint.textContent = String(text || "");
}

function resetScheduleForm() {
  setById("scheduleId", "");
  setById("scheduleType", "vacation");
  setById("scheduleTitle", "");
  setById("scheduleBrand", "");
  setById("scheduleStartDate", "");
  setById("scheduleEndDate", "");
  setById("scheduleNote", "");
  setScheduleFormHint("");
}

function parseDateOnly(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const parts = text.split("-");
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return new Date(y, m - 1, d);
}

function formatDateRange(startDate, endDate) {
  const start = String(startDate || "");
  const end = String(endDate || "");
  if (!start && !end) return "-";
  if (!end || end === start) return start || end;
  return `${start} ~ ${end}`;
}

function scheduleDurationDays(startDate, endDate) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate || startDate);
  if (!start || !end) return 1;
  const ms = end.getTime() - start.getTime();
  if (ms < 0) return 1;
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

function formatDateRangeHtml(startDate, endDate) {
  const text = formatDateRange(startDate, endDate);
  const days = scheduleDurationDays(startDate, endDate);
  const longClass = days >= 2 ? "long" : "";
  return `<span class="schedule-range-chip ${longClass}">${esc(text)} · ${days}일</span>`;
}

function scheduleItemsForDate(dayText) {
  return schedules.filter((item) => {
    const start = String(item.start_date || "").trim();
    const end = String(item.end_date || start).trim();
    return start && start <= dayText && dayText <= end;
  });
}

function shiftDateText(dayText, deltaDays) {
  const base = parseDateOnly(dayText);
  if (!base || !Number.isFinite(deltaDays)) return dayText;
  const moved = new Date(base.getFullYear(), base.getMonth(), base.getDate() + deltaDays);
  return `${moved.getFullYear()}-${String(moved.getMonth() + 1).padStart(2, "0")}-${String(moved.getDate()).padStart(2, "0")}`;
}

function buildScheduleDotHtml(item, dayText) {
  const t = normalizeScheduleType(item?.type);
  const id = String(item?.id || "").trim();
  const prevDay = shiftDateText(dayText, -1);
  const nextDay = shiftDateText(dayText, 1);
  const prevIncluded = scheduleItemsForDate(prevDay).some((x) => String(x?.id || "").trim() === id);
  const nextIncluded = scheduleItemsForDate(nextDay).some((x) => String(x?.id || "").trim() === id);

  const segmentClass = prevIncluded
    ? (nextIncluded ? "cont-mid" : "cont-end")
    : (nextIncluded ? "cont-start" : "cont-single");

  const label = prevIncluded ? "" : esc(scheduleTypeLabel(t));
  return `<span class="schedule-dot ${t} ${segmentClass}" data-schedule-id="${esc(id)}" style="cursor:pointer;">${label || "&nbsp;"}</span>`;
}

function renderScheduleCalendar() {
  const monthLabel = document.getElementById("scheduleMonthLabel");
  const grid = document.getElementById("scheduleCalendarGrid");
  if (!monthLabel || !grid) return;

  const year = scheduleViewMonth.getFullYear();
  const month = scheduleViewMonth.getMonth();
  monthLabel.textContent = `${year}년 ${month + 1}월`;

  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay();
  const startDate = new Date(year, month, 1 - firstWeekday);
  const today = new Date();
  const todayText = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
    const inMonth = d.getMonth() === month;
    const dateText = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const items = scheduleItemsForDate(dateText);
    const dots = items.slice(0, 2).map((it) => buildScheduleDotHtml(it, dateText)).join("");
    const restCount = Math.max(0, items.length - 2);

    cells.push(`
      <button type="button" class="schedule-day ${inMonth ? "" : "muted"} ${dateText === todayText ? "today" : ""}" data-date="${dateText}" title="${dateText}">
        <div class="schedule-day-num">${d.getDate()}</div>
        ${dots}
        ${restCount > 0 ? `<span class="schedule-dot meeting">+${restCount}건</span>` : ""}
      </button>
    `);
  }

  grid.innerHTML = cells.join("");
}

function renderScheduleRows() {
  const body = document.getElementById("scheduleRows");
  if (!body) return;
  const sorted = [...schedules].sort((a, b) => {
    const aStart = String(a.start_date || "");
    const bStart = String(b.start_date || "");
    if (aStart !== bStart) return bStart.localeCompare(aStart);
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });

  if (!sorted.length) {
    body.innerHTML = '<tr><td colspan="7" class="hint">등록된 일정이 없습니다.</td></tr>';
    return;
  }

  body.innerHTML = sorted.map((row) => {
    const type = normalizeScheduleType(row.type);
    const canEdit = canEditSchedule(row);
    const approvalStatus = normalizeApprovalStatus(row.approval_status);
    const lockReason = approvalStatus === "approved" ? "승인 완료된 일정은 수정/삭제할 수 없습니다." : "작성자 또는 관리자만 수정/삭제할 수 있습니다.";
    const showBrand = String(row.brand || "").trim();
    const titleText = showBrand ? `${String(row.title || "-")} (${showBrand})` : String(row.title || "-");
    return `
      <tr>
        <td><span class="schedule-type-badge ${type}">${esc(scheduleTypeLabel(type))}</span></td>
        <td>${esc(titleText)}</td>
        <td>${formatDateRangeHtml(row.start_date, row.end_date)}</td>
        <td><span class="schedule-approval-badge ${approvalStatus}">${esc(approvalStatusLabel(approvalStatus))}</span></td>
        <td>${esc(row.author_name || row.author_email || "-")}</td>
        <td>${esc(row.note || row.reject_reason || "-")}</td>
        <td>
          <button type="button" title="${esc(lockReason)}" data-edit-schedule="${esc(row.id || "")}" ${canEdit ? "" : "disabled"}>수정</button>
          <button type="button" class="btn-ghost" title="${esc(lockReason)}" data-del-schedule="${esc(row.id || "")}" ${canEdit ? "" : "disabled"}>삭제</button>
        </td>
      </tr>
    `;
  }).join("");
}

function formatScheduleItemForPopup(item) {
  const type = normalizeScheduleType(item?.type);
  const typeLabel = scheduleTypeLabel(type);
  const dateRange = formatDateRange(item.start_date, item.end_date);
  const approvalStatus = normalizeApprovalStatus(item.approval_status);
  const approvalLabel = approvalStatusLabel(approvalStatus);
  const brand = String(item.brand || "").trim();
  const note = String(item.note || "").trim();
  const author = item.author_name || item.author_email || "-";
  const createdAt = item.created_at ? new Date(item.created_at).toLocaleString("ko-KR") : "-";
  
  let html = `
    <div class="schedule-popup-item">
      <span class="schedule-popup-badge">
        <span class="schedule-type-badge ${type}">${esc(typeLabel)}</span>
      </span>
      <div class="schedule-popup-content">
        <p class="schedule-popup-title">${esc(item.title || "-")}</p>
        <p class="schedule-popup-meta">
          <span class="schedule-popup-date">📅 ${esc(dateRange)}</span>
          <span class="schedule-popup-status">
            <span class="schedule-approval-badge ${approvalStatus}">${esc(approvalLabel)}</span>
          </span>
  `;
  
  if (brand) {
    html += `<span class="schedule-popup-brand">${esc(brand)}</span>`;
  }
  
  html += `</p>`;
  
  if (note) {
    html += `<div class="schedule-popup-note">📝 ${esc(note)}</div>`;
  }
  
  html += `
        <div class="schedule-popup-author">
          작성자: ${esc(author)} | ${createdAt}
        </div>
      </div>
    </div>
  `;
  
  return html;
}

function closeSchedulePopup() {
  const overlay = document.getElementById("schedulePopupOverlay");
  const modal = document.getElementById("schedulePopupModal");
  if (overlay) overlay.classList.remove("active");
  if (modal) modal.style.display = "none";
}

function openSchedulePopupByDate(dateText) {
  const items = scheduleItemsForDate(dateText);
  if (!items.length) {
    alert(`${dateText}에 등록된 일정이 없습니다.`);
    return;
  }
  
  const overlay = document.getElementById("schedulePopupOverlay");
  const modal = document.getElementById("schedulePopupModal");
  const title = document.getElementById("schedulePopupTitle");
  const body = document.getElementById("schedulePopupBody");
  
  if (!overlay || !modal || !title || !body) return;
  
  const d = parseDateOnly(dateText);
  const dateDisplay = d ? `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${["일", "월", "화", "수", "목", "금", "토"][d.getDay()]})` : dateText;
  
  title.textContent = `${dateDisplay} 일정`;
  body.innerHTML = items.map((item) => formatScheduleItemForPopup(item)).join("");
  
  overlay.classList.add("active");
  modal.style.display = "block";
}

function openSchedulePopupByItem(scheduleId) {
  const item = schedules.find((x) => String(x?.id || "").trim() === String(scheduleId).trim());
  if (!item) {
    alert("일정을 찾을 수 없습니다.");
    return;
  }
  
  const overlay = document.getElementById("schedulePopupOverlay");
  const modal = document.getElementById("schedulePopupModal");
  const title = document.getElementById("schedulePopupTitle");
  const body = document.getElementById("schedulePopupBody");
  
  if (!overlay || !modal || !title || !body) return;
  
  title.textContent = "일정 상세 정보";
  body.innerHTML = formatScheduleItemForPopup(item);
  
  overlay.classList.add("active");
  modal.style.display = "block";
}

function renderScheduleAll() {
  renderScheduleCalendar();
  renderScheduleRows();
}

async function refreshCurrentUser() {
  const res = await fetch(`/api/auth/me?_ts=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) {
    currentUser = null;
    return;
  }
  const data = await res.json();
  currentUser = data?.user || null;
}

async function refreshSchedules() {
  const res = await fetch(`/api/manage/schedules?_ts=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) {
    schedules = [];
    renderScheduleAll();
    return;
  }
  const data = await res.json();
  schedules = Array.isArray(data.items) ? data.items.map((row) => ({
    ...row,
    type: normalizeScheduleType(row?.type),
    approval_status: normalizeApprovalStatus(row?.approval_status),
  })) : [];
  renderScheduleAll();
}

async function saveSchedule(ev) {
  ev.preventDefault();
  const scheduleId = valById("scheduleId");
  const type = normalizeScheduleType(valById("scheduleType") || "vacation");
  const title = valById("scheduleTitle");
  const brand = valById("scheduleBrand");
  const startDate = valById("scheduleStartDate");
  const endDate = valById("scheduleEndDate") || startDate;
  const note = valById("scheduleNote");

  if (!startDate) {
    window.alert("시작일을 입력해 주세요.");
    return;
  }
  if (endDate < startDate) {
    window.alert("종료일은 시작일보다 빠를 수 없습니다.");
    return;
  }
  const payload = {
    type,
    title,
    brand,
    start_date: startDate,
    end_date: endDate,
    note,
  };

  const method = scheduleId ? "PUT" : "POST";
  const url = scheduleId ? `/api/manage/schedules/${encodeURIComponent(scheduleId)}` : "/api/manage/schedules";
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let detail = "일정 저장에 실패했습니다.";
    try {
      const data = await res.json();
      detail = String(data?.detail || detail);
    } catch {}
    window.alert(detail);
    return;
  }

  resetScheduleForm();
  await refreshSchedules();
}

function fillScheduleFormForEdit(item) {
  if (!item) return;
  setById("scheduleId", item.id || "");
  setById("scheduleType", normalizeScheduleType(item.type));
  setById("scheduleTitle", item.title || "");
  setById("scheduleBrand", item.brand || "");
  setById("scheduleStartDate", item.start_date || "");
  setById("scheduleEndDate", item.end_date || item.start_date || "");
  setById("scheduleNote", item.note || "");
  setScheduleFormHint("수정 저장 시 다시 승인 대기로 변경될 수 있습니다.");
}

async function updateScheduleApproval(scheduleId, status) {
  if (!scheduleId) return;
  let reason = "";
  if (status === "rejected") {
    reason = window.prompt("반려 사유를 입력해 주세요.", "") || "";
    if (!reason.trim()) {
      window.alert("반려 사유를 입력해야 합니다.");
      return;
    }
  }
  const res = await fetch(`/api/manage/schedules/${encodeURIComponent(scheduleId)}/approval`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, reason }),
  });
  if (!res.ok) {
    let detail = "승인 처리에 실패했습니다.";
    try {
      const data = await res.json();
      detail = String(data?.detail || detail);
    } catch {}
    window.alert(detail);
    return;
  }
  await refreshSchedules();
}

async function deleteScheduleById(scheduleId) {
  if (!scheduleId) return;
  const ok = window.confirm("이 일정을 삭제하시겠습니까?");
  if (!ok) return;
  const res = await fetch(`/api/manage/schedules/${encodeURIComponent(scheduleId)}`, { method: "DELETE" });
  if (!res.ok) {
    let detail = "일정 삭제에 실패했습니다.";
    try {
      const data = await res.json();
      detail = String(data?.detail || detail);
    } catch {}
    window.alert(detail);
    return;
  }
  await refreshSchedules();
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
  body.innerHTML = assets.map((x, idx) => {
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
    const editLocked = isAssetLockedForEdit(x);
    const lockReason = isPending
      ? "삭제 요청 대기중에는 수정할 수 없습니다."
      : statusRaw === "deleted"
      ? "삭제 완료된 자산은 수정할 수 없습니다."
      : "삭제 승인 흐름 중인 자산은 수정할 수 없습니다.";
    const rowId = String(row.id || x.id || x["NEW 관리 번호"] || x["구 관리번호"] || "").trim();
    return `
    <tr data-asset-row-id="${esc(rowId)}" data-asset-row-index="${idx}">
      <td><input type="checkbox" class="asset-row-check" data-asset-id="${esc(row.id)}" /></td>
      <td><span class="asset-status-badge ${statusClass}">${esc(statusText)}</span></td>
      <td>
        <button type="button" title="${esc(lockReason)}" data-edit-asset="${esc(row.id)}" ${editLocked ? "disabled" : ""}>수정</button>
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

  if (id) {
    const existing = assets.find((x) => String(x?.id || "") === String(id));
    if (existing && isAssetLockedForEdit(existing)) {
      window.alert("삭제 승인 흐름 중인 자산은 수정할 수 없습니다.");
      return;
    }
  }

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

function getAssetRowKey(rawRow) {
  const n = normalizeAsset(rawRow || {});
  return String(n.id || rawRow?.id || rawRow?.["NEW 관리 번호"] || rawRow?.["구 관리번호"] || "").trim().toLowerCase();
}

function getHeaderColumnName(th) {
  const clone = th.cloneNode(true);
  clone.querySelectorAll(".col-filter-btn").forEach((el) => el.remove());
  return String(clone.textContent || "").trim();
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
    const active = Boolean(cfg && Array.isArray(cfg.values));
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

function getVisibleFilterCheckboxes(popup) {
  return Array.from(popup.querySelectorAll('.filter-option input[type="checkbox"]')).filter((cb) => {
    const option = cb.closest(".filter-option");
    return option && option.style.display !== "none";
  });
}

function persistFilterSelection(colName, selectedTokens, allTokens) {
  const unique = [...new Set(selectedTokens)];
  if (unique.length === allTokens.length) {
    delete filterState[colName];
    return;
  }
  filterState[colName] = { mode: "include", values: unique };
}

function updatePopupSelectionSummary(popup, totalCount) {
  if (!popup) return;
  const selected = getPopupSelectedTokens(popup).length;
  const summaryEl = popup.querySelector(".filter-popup-meta");
  if (summaryEl) {
    summaryEl.textContent = `${selected}개 선택 / ${totalCount}개`;
  }
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
      <span>${esc(colName)}</span>
      <button type="button" class="filter-popup-close" data-action="close" aria-label="닫기">
        <i class="fas fa-times"></i>
      </button>
    </div>
    <div class="filter-popup-meta"></div>
    <div class="filter-sorting">
      <button type="button" class="filter-sort-btn asc-btn" data-action="sort-asc">오름차순</button>
      <button type="button" class="filter-sort-btn desc-btn" data-action="sort-desc">내림차순</button>
    </div>
    <div class="filter-search-wrap">
      <input type="text" class="filter-search-input" placeholder="값 검색" data-role="search" />
    </div>
    <div class="filter-tools">
      <button type="button" class="filter-tool-btn" data-action="check-all">전체 선택</button>
      <button type="button" class="filter-tool-btn" data-action="uncheck-all">전체 해제</button>
      <button type="button" class="filter-tools-link" data-action="clear-filter">이 열 필터 지우기</button>
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
      <button type="button" class="filter-cancel" data-action="close">취소</button>
      <button type="button" class="filter-apply" data-action="apply">확인</button>
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
        const labelText = String(optionEl.querySelector("label")?.textContent || optionEl.textContent || "").trim().toLowerCase();
        const txt = labelText.replace(/\s+/g, " ");
        optionEl.style.display = txt.includes(keyword) ? "flex" : "none";
      });
    });
  }

  popup.querySelectorAll('.filter-option input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", () => updatePopupSelectionSummary(popup, tokens.length));
  });

  updatePopupSelectionSummary(popup, tokens.length);

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
      getVisibleFilterCheckboxes(popup).forEach((cb) => {
        cb.checked = true;
      });
      updatePopupSelectionSummary(popup, tokens.length);
    } else if (action === "uncheck-all") {
      getVisibleFilterCheckboxes(popup).forEach((cb) => {
        cb.checked = false;
      });
      updatePopupSelectionSummary(popup, tokens.length);
    } else if (action === "clear-filter") {
      delete filterState[colName];
      filterTableRows();
      closeFilterPopup();
    } else if (action === "apply") {
      const selected = getPopupSelectedTokens(popup);
      persistFilterSelection(colName, selected, tokens.map((x) => x.token));
      filterTableRows();
      closeFilterPopup();
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

  rows.forEach((row) => {
    let isVisible = true;
    const rowIndex = Number(row.getAttribute("data-asset-row-index"));
    const rawItem = Number.isInteger(rowIndex) ? assets[rowIndex] : undefined;

    if (!rawItem) {
      row.style.display = "";
      return;
    }

    for (const [colName, cfg] of Object.entries(filterState)) {
      const selectedValues = new Set(cfg?.values || []);
      if (!selectedValues.size) {
        isVisible = false;
        break;
      }

      const cellValue = getAssetColumnValue(rawItem, colName) || "-";
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
  renderAssets();
  filterTableRows();
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
    const row = assets.find((a) => String(a.id) === String(editId) || String(normalizeAsset(a).id) === String(editId));
    if (!row) return;
    if (isAssetLockedForEdit(row)) {
      window.alert("삭제 승인 흐름 중인 자산은 수정할 수 없습니다.");
      return;
    }
    const n = normalizeAsset(row);
    resetAssetForm();
    setById("assetId", n.id || "");
    ASSET_FIELD_DEFS.forEach((f) => setById(f.inputId, n[f.key] || ""));
    document.getElementById("assetModal").style.display = "flex";
  }
});

window.addEventListener("hashchange", showManageSectionFromHash);
showManageSectionFromHash();

document.getElementById("schedulePrevMonthBtn")?.addEventListener("click", () => {
  scheduleViewMonth = new Date(scheduleViewMonth.getFullYear(), scheduleViewMonth.getMonth() - 1, 1);
  renderScheduleCalendar();
});

document.getElementById("scheduleNextMonthBtn")?.addEventListener("click", () => {
  scheduleViewMonth = new Date(scheduleViewMonth.getFullYear(), scheduleViewMonth.getMonth() + 1, 1);
  renderScheduleCalendar();
});

document.getElementById("scheduleCalendarGrid")?.addEventListener("click", (ev) => {
  const target = ev.target;
  if (!(target instanceof HTMLElement)) return;
  
  // 일정 바(schedule-dot) 클릭 → 일정 상세 팝업
  const dot = target.closest(".schedule-dot");
  if (dot && dot.getAttribute("data-schedule-id")) {
    const scheduleId = String(dot.getAttribute("data-schedule-id") || "");
    openSchedulePopupByItem(scheduleId);
    return;
  }
  
  // 날짜 버튼(schedule-day) 클릭 → 날짜별 팝업 또는 폼 채우기
  const btn = target.closest(".schedule-day");
  if (!btn) return;
  const dateText = String(btn.getAttribute("data-date") || "");
  if (!dateText) return;
  
  // Ctrl/Cmd 키 누르거나 날짜에 여러 일정이 있으면 팝업 표시
  const itemsOnDay = scheduleItemsForDate(dateText);
  if (itemsOnDay.length > 2 || ev.ctrlKey || ev.metaKey) {
    openSchedulePopupByDate(dateText);
  } else {
    // 그 외에는 일반적인 날짜 선택 동작
    setById("scheduleStartDate", dateText);
    if (!valById("scheduleEndDate")) {
      setById("scheduleEndDate", dateText);
    }
  }
});

document.getElementById("scheduleForm")?.addEventListener("submit", saveSchedule);
document.getElementById("scheduleResetBtn")?.addEventListener("click", resetScheduleForm);

// 팝업 닫기
document.getElementById("schedulePopupOverlay")?.addEventListener("click", closeSchedulePopup);
document.querySelector(".schedule-popup-close")?.addEventListener("click", closeSchedulePopup);

document.getElementById("scheduleRows")?.addEventListener("click", async (ev) => {
  const target = ev.target;
  if (!(target instanceof HTMLElement)) return;
  const editId = target.getAttribute("data-edit-schedule");
  const delId = target.getAttribute("data-del-schedule");
  const approveId = target.getAttribute("data-approve-schedule");
  const rejectId = target.getAttribute("data-reject-schedule");
  if (editId) {
    const item = schedules.find((x) => String(x.id || "") === String(editId));
    if (!canEditSchedule(item)) {
      window.alert("승인 완료된 일정은 수정할 수 없습니다.");
      return;
    }
    fillScheduleFormForEdit(item);
    return;
  }
  if (delId) {
    const item = schedules.find((x) => String(x.id || "") === String(delId));
    if (!canEditSchedule(item)) {
      window.alert("승인 완료된 일정은 삭제할 수 없습니다.");
      return;
    }
    await deleteScheduleById(delId);
    return;
  }
  if (approveId) {
    await updateScheduleApproval(approveId, "approved");
    return;
  }
  if (rejectId) {
    await updateScheduleApproval(rejectId, "rejected");
  }
});

refreshCurrentUser().then(refreshSchedules).catch(() => {
  schedules = [];
  renderScheduleAll();
});

refreshAssets();
