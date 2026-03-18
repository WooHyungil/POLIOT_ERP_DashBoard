async function postForm(url, formData) {
  const res = await fetch(url, { method: "POST", body: formData });
  return await res.json();
}

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toDomId(v) {
  return String(v || "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

let currentDevices = [];
let selectedDeviceId = "";
let validateMap = {};
let selectorSignature = "";
let remotePollTimer = null;
let remoteLoadInFlight = false;
let lastThumbRefreshTs = 0;
const MAIN_FRAME_INTERVAL_MS = 180;
const THUMB_FRAME_INTERVAL_MS = 220;
const thumbInFlight = new Set();

let dragState = {
  active: false,
  moved: false,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
};

function showToast(message, level = "info") {
  const wrap = document.getElementById("toastStack");
  if (!wrap) return;
  const item = document.createElement("div");
  item.className = `toast-item toast-${level}`;
  item.innerText = message;
  wrap.appendChild(item);
  setTimeout(() => {
    item.classList.add("fade");
    setTimeout(() => item.remove(), 240);
  }, 2600);
}

function setHint(text) {
  const el = document.getElementById("remoteHint");
  if (el) el.innerText = text || "";
}

function renderStatusChip(deviceId) {
  const info = validateMap[String(deviceId || "")] || null;
  if (!info) return '<span class="status-chip status-unknown">확인중</span>';
  return info.online
    ? '<span class="status-chip status-online">연결됨</span>'
    : '<span class="status-chip status-offline">끊김</span>';
}

function setCurrentDeviceLabel() {
  const el = document.getElementById("remoteCurrentDevice");
  if (!el) return;
  const count = currentDevices.length;
  const d = currentDevices.find((x) => x.device_id === selectedDeviceId);
  if (!d) {
    el.innerText = `선택 단말: - (연결 ${count}대)`;
    return;
  }
  el.innerText = `선택 단말: ${d.name} (${d.platform} | ${d.device_id}) / 연결 ${count}대`;
}

function updateHealthText() {
  const el = document.getElementById("remoteHealthText");
  if (!el) return;
  const rows = Object.values(validateMap || {});
  const online = rows.filter((x) => x.online).length;
  const total = rows.length;
  if (!total) {
    el.innerText = "연동 상태: 연결된 단말이 없습니다.";
  } else if (online === total) {
    el.innerText = `연동 상태: 정상 (${online}/${total} 온라인)`;
  } else {
    el.innerText = `연동 상태: 주의 (${online}/${total} 온라인, 일부 끊김)`;
  }
}

function renderDeviceList() {
  const wrap = document.getElementById("remoteDeviceList");
  if (!wrap) return;
  if (!currentDevices.length) {
    wrap.innerHTML = '<p class="hint">연결 단말이 없습니다.</p>';
    return;
  }
  wrap.innerHTML = currentDevices.map((d) => `
    <button type="button" class="remote-device-item ${d.device_id === selectedDeviceId ? "active" : ""}" data-device-id="${esc(d.device_id)}">
      <strong>${esc(d.name)}</strong>
      <span>${esc(d.platform)} | ${esc(d.device_id)}</span>
      <span>${renderStatusChip(d.device_id)}</span>
    </button>
  `).join("");
}

function renderThumbs() {
  const wrap = document.getElementById("remoteThumbGrid");
  if (!wrap) return;
  if (!currentDevices.length) {
    wrap.innerHTML = '<p class="hint">연결 단말이 없습니다.</p>';
    return;
  }
  wrap.innerHTML = currentDevices.map((d) => {
    const domId = toDomId(d.device_id);
    const body = d.platform === "android"
      ? `<img id="remoteThumbImg_${domId}" alt="${esc(d.name)}" loading="eager" />`
      : '<div class="feed-empty">iOS 미리보기 준비중</div>';
    return `
      <button type="button" class="remote-thumb-item ${d.device_id === selectedDeviceId ? "active" : ""}" data-device-id="${esc(d.device_id)}">
        <div class="remote-thumb-head">
          <strong>${esc(d.name)}</strong>
          <span>${renderStatusChip(d.device_id)}</span>
        </div>
        <div class="remote-thumb-shot">${body}</div>
      </button>
    `;
  }).join("");
}

function chooseDefaultDevice() {
  if (!currentDevices.length) {
    selectedDeviceId = "";
    return;
  }
  if (currentDevices.some((x) => x.device_id === selectedDeviceId)) return;
  const android = currentDevices.find((x) => x.platform === "android");
  selectedDeviceId = (android || currentDevices[0]).device_id;
}

function getSelectedDevice() {
  return currentDevices.find((x) => x.device_id === selectedDeviceId) || null;
}

function applyActiveState() {
  document.querySelectorAll(".remote-device-item").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-device-id") === selectedDeviceId);
  });
  document.querySelectorAll(".remote-thumb-item").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-device-id") === selectedDeviceId);
  });
  setCurrentDeviceLabel();
}

function selectDevice(deviceId) {
  if (!deviceId) return;
  selectedDeviceId = deviceId;
  applyActiveState();
  refreshRemoteFrame();
}

function renderSelectorsIfNeeded() {
  const nextSig = currentDevices.map((d) => `${d.device_id}:${d.platform}:${d.name}`).join("|");
  if (nextSig !== selectorSignature) {
    renderDeviceList();
    renderThumbs();
    selectorSignature = nextSig;
  }
  applyActiveState();
}

function refreshThumbFrames() {
  for (const d of currentDevices) {
    if (d.platform !== "android") continue;
    if (thumbInFlight.has(d.device_id)) continue;
    const img = document.getElementById(`remoteThumbImg_${toDomId(d.device_id)}`);
    if (!img) continue;
    thumbInFlight.add(d.device_id);
    img.onload = () => thumbInFlight.delete(d.device_id);
    img.onerror = () => thumbInFlight.delete(d.device_id);
    img.src = `/api/devices/${encodeURIComponent(d.device_id)}/live-shot?t=${Date.now()}`;
  }
}

async function refreshRemoteFrame() {
  const img = document.getElementById("remoteMainImage");
  const overlay = document.getElementById("remoteOverlay");
  if (!img || !overlay) return;
  if (remoteLoadInFlight) return;

  const target = getSelectedDevice();
  if (!target) {
    overlay.style.display = "flex";
    overlay.innerText = "연결 단말을 선택하세요.";
    return;
  }
  if (target.platform !== "android") {
    overlay.style.display = "flex";
    overlay.innerText = "iOS는 현재 원격 제어를 지원하지 않습니다.";
    return;
  }

  remoteLoadInFlight = true;
  const src = `/api/devices/${encodeURIComponent(target.device_id)}/live-shot?t=${Date.now()}`;
  img.dataset.deviceId = target.device_id;
  img.onload = () => {
    remoteLoadInFlight = false;
    overlay.style.display = "none";
  };
  img.onerror = () => {
    remoteLoadInFlight = false;
    overlay.style.display = "flex";
    overlay.innerText = "화면 수신 실패. 자동 재시도 중";
  };
  img.src = src;
}

function startPolling() {
  if (remotePollTimer) clearInterval(remotePollTimer);
  remotePollTimer = setInterval(() => {
    if (document.hidden) return;
    refreshRemoteFrame();
    const now = Date.now();
    if ((now - lastThumbRefreshTs) >= THUMB_FRAME_INTERVAL_MS) {
      refreshThumbFrames();
      lastThumbRefreshTs = now;
    }
  }, MAIN_FRAME_INTERVAL_MS);
}

function pointToNatural(img, clientX, clientY) {
  const rect = img.getBoundingClientRect();
  const xRatio = (clientX - rect.left) / Math.max(1, rect.width);
  const yRatio = (clientY - rect.top) / Math.max(1, rect.height);
  const naturalW = img.naturalWidth || 1080;
  const naturalH = img.naturalHeight || 2400;
  return {
    x: Math.max(0, Math.min(naturalW - 1, Math.round(naturalW * xRatio))),
    y: Math.max(0, Math.min(naturalH - 1, Math.round(naturalH * yRatio))),
  };
}

function updateCursorPosition(stage, cursor, clientX, clientY) {
  const rect = stage.getBoundingClientRect();
  const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
  const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
  cursor.style.left = `${x}px`;
  cursor.style.top = `${y}px`;
}

function updateDragBox(stage, box) {
  if (!dragState.active) {
    box.style.display = "none";
    return;
  }
  const rect = stage.getBoundingClientRect();
  const sx = dragState.startX - rect.left;
  const sy = dragState.startY - rect.top;
  const cx = dragState.currentX - rect.left;
  const cy = dragState.currentY - rect.top;
  box.style.display = "block";
  box.style.left = `${Math.min(sx, cx)}px`;
  box.style.top = `${Math.min(sy, cy)}px`;
  box.style.width = `${Math.max(2, Math.abs(cx - sx))}px`;
  box.style.height = `${Math.max(2, Math.abs(cy - sy))}px`;
}

async function sendSelectedKey(key) {
  const target = getSelectedDevice();
  if (!target || target.platform !== "android") {
    setHint("Android 단말을 선택하세요.");
    return;
  }
  const fd = new FormData();
  fd.append("key", key);
  const r = await postForm(`/api/devices/${encodeURIComponent(target.device_id)}/key`, fd);
  setHint(r.ok ? `${target.name} ${key} 전송` : `${target.name} ${key} 실패`);
  showToast(r.ok ? `${key} 전송 완료` : `${key} 전송 실패`, r.ok ? "ok" : "error");
}

async function sendSelectedLock(action) {
  const target = getSelectedDevice();
  if (!target || target.platform !== "android") {
    setHint("Android 단말을 선택하세요.");
    return;
  }
  const fd = new FormData();
  if (action === "unlock") {
    fd.append("mode", "pattern");
    fd.append("pattern", "1,2,3,6,9");
  }
  const r = await postForm(`/api/devices/${encodeURIComponent(target.device_id)}/${action}`, fd);
  setHint(r.ok ? `${target.name} ${action === "unlock" ? "잠금해제" : "잠금"} 완료` : `${target.name} 제어 실패`);
  showToast(r.ok ? `${target.name} 제어 완료` : `${target.name} 제어 실패`, r.ok ? "ok" : "error");
}

async function sendAllUnlock() {
  const fd = new FormData();
  fd.append("action", "unlock");
  fd.append("platform", "android");
  fd.append("pattern", "1,2,3,6,9");
  const r = await postForm("/api/devices/bulk-action", fd);
  const okCount = Array.isArray(r.results) ? r.results.filter((x) => x.ok).length : 0;
  const failCount = Math.max(0, Number(r.count || 0) - okCount);
  const msg = `전체 잠금해제: 성공 ${okCount} / 실패 ${failCount}`;
  setHint(msg);
  showToast(msg, failCount > 0 ? "warn" : "ok");
}

async function quickResync() {
  const r = await postForm("/api/devices/resync", new FormData());
  const msg = r.ok ? `빠른 재연동 완료: ${r.device_count}대` : "빠른 재연동 실패";
  setHint(msg);
  showToast(msg, r.ok ? "ok" : "error");
  await refresh();
}

function bindRemoteGestures() {
  const stage = document.getElementById("remoteStage");
  const img = document.getElementById("remoteMainImage");
  const cursor = document.getElementById("remoteCursor");
  const dragBox = document.getElementById("remoteDragBox");
  if (!stage || !img || !cursor || !dragBox) return;

  const pointerMove = (e) => {
    const t = e.touches && e.touches[0] ? e.touches[0] : e;
    updateCursorPosition(stage, cursor, t.clientX, t.clientY);
    if (dragState.active) {
      dragState.currentX = t.clientX;
      dragState.currentY = t.clientY;
      if (Math.abs(dragState.currentX - dragState.startX) > 6 || Math.abs(dragState.currentY - dragState.startY) > 6) {
        dragState.moved = true;
      }
      updateDragBox(stage, dragBox);
    }
  };

  const pointerDown = (e) => {
    const target = getSelectedDevice();
    if (!target || target.platform !== "android") return;
    const t = e.touches && e.touches[0] ? e.touches[0] : e;
    dragState.active = true;
    dragState.moved = false;
    dragState.startX = t.clientX;
    dragState.startY = t.clientY;
    dragState.currentX = t.clientX;
    dragState.currentY = t.clientY;
    updateCursorPosition(stage, cursor, t.clientX, t.clientY);
    updateDragBox(stage, dragBox);
  };

  const pointerUp = async (e) => {
    if (!dragState.active) return;
    const target = getSelectedDevice();
    if (!target || target.platform !== "android") {
      dragState.active = false;
      updateDragBox(stage, dragBox);
      return;
    }

    const t = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : e;
    dragState.currentX = t.clientX;
    dragState.currentY = t.clientY;
    const start = pointToNatural(img, dragState.startX, dragState.startY);
    const end = pointToNatural(img, dragState.currentX, dragState.currentY);

    if (dragState.moved) {
      const fd = new FormData();
      fd.append("x1", String(start.x));
      fd.append("y1", String(start.y));
      fd.append("x2", String(end.x));
      fd.append("y2", String(end.y));
      fd.append("duration_ms", "200");
      const r = await postForm(`/api/devices/${encodeURIComponent(target.device_id)}/swipe`, fd);
      setHint(r.ok ? `${target.name} 드래그 전송` : `${target.name} 드래그 실패`);
    } else {
      const fd = new FormData();
      fd.append("x", String(end.x));
      fd.append("y", String(end.y));
      const r = await postForm(`/api/devices/${encodeURIComponent(target.device_id)}/tap`, fd);
      setHint(r.ok ? `${target.name} 탭 전송` : `${target.name} 탭 실패`);
    }

    dragState.active = false;
    dragState.moved = false;
    updateDragBox(stage, dragBox);
  };

  stage.addEventListener("mousemove", pointerMove);
  stage.addEventListener("mousedown", pointerDown);
  stage.addEventListener("mouseup", pointerUp);
  stage.addEventListener("mouseleave", () => {
    dragState.active = false;
    updateDragBox(stage, dragBox);
  });
  stage.addEventListener("touchstart", pointerDown, { passive: true });
  stage.addEventListener("touchmove", pointerMove, { passive: true });
  stage.addEventListener("touchend", pointerUp, { passive: true });
}

function bindButtonHandlers() {
  const listWrap = document.getElementById("remoteDeviceList");
  if (listWrap) {
    listWrap.addEventListener("click", (e) => {
      const btn = e.target.closest(".remote-device-item");
      if (!btn) return;
      selectDevice(btn.getAttribute("data-device-id") || "");
    });
  }

  const thumbWrap = document.getElementById("remoteThumbGrid");
  if (thumbWrap) {
    thumbWrap.addEventListener("click", (e) => {
      const btn = e.target.closest(".remote-thumb-item");
      if (!btn) return;
      selectDevice(btn.getAttribute("data-device-id") || "");
    });
  }

  document.getElementById("rcBackBtn")?.addEventListener("click", () => sendSelectedKey("back"));
  document.getElementById("rcHomeBtn")?.addEventListener("click", () => sendSelectedKey("home"));
  document.getElementById("rcRecentBtn")?.addEventListener("click", () => sendSelectedKey("recent"));
  document.getElementById("rcLockBtn")?.addEventListener("click", () => sendSelectedLock("lock"));
  document.getElementById("rcUnlockBtn")?.addEventListener("click", () => sendSelectedLock("unlock"));
  document.getElementById("rcAllUnlockBtn")?.addEventListener("click", sendAllUnlock);
  document.getElementById("rcResyncBtn")?.addEventListener("click", quickResync);
  document.getElementById("rcRefreshBtn")?.addEventListener("click", () => {
    refreshRemoteFrame();
    refreshThumbFrames();
  });
}

async function refresh() {
  try {
    const [dashboardResp, validateResp] = await Promise.all([
      fetch("/api/dashboard"),
      fetch("/api/devices/validate"),
    ]);
    const data = await dashboardResp.json();
    const validate = await validateResp.json();

    validateMap = {};
    for (const row of (validate.devices || [])) {
      validateMap[String(row.device_id || "")] = row;
    }

    currentDevices = data.devices || [];
    chooseDefaultDevice();
    renderSelectorsIfNeeded();
    updateHealthText();
    refreshRemoteFrame();
    refreshThumbFrames();
  } catch {
    setHint("원격 데이터 갱신 실패");
    showToast("원격 데이터 갱신 실패", "error");
  }
}

bindButtonHandlers();
bindRemoteGestures();
startPolling();
refresh();
setInterval(refresh, 1800);
