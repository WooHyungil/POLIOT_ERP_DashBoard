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
  const out = { id: String(row?.id || "").trim() };
  ASSET_FIELD_DEFS.forEach((def) => {
    out[def.key] = pickAssetValue(row, def);
  });
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
    return `
    <tr>
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
      <td>
        <button type="button" data-edit-asset="${esc(row.id)}">수정</button>
        <button type="button" class="btn-ghost" data-del-asset="${esc(row.id)}">삭제</button>
      </td>
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
  const res = await fetch("/api/admin/assets");
  const data = await res.json();
  assets = Array.isArray(data.items) ? data.items : [];
  renderAssets();
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

document.getElementById("assetForm")?.addEventListener("submit", saveAsset);
document.getElementById("assetResetBtn")?.addEventListener("click", resetAssetForm);

document.getElementById("assetRows")?.addEventListener("click", async (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLElement)) return;
  const delId = t.getAttribute("data-del-asset");
  const editId = t.getAttribute("data-edit-asset");
  if (delId) {
    await fetch(`/api/admin/assets/${encodeURIComponent(delId)}`, { method: "DELETE" });
    await refreshAssets();
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
