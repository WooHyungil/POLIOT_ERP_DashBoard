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

function renderSummary(s) {
  const done = (s.passed || 0) + (s.failed || 0) + (s.nt || 0);
  const pct = s.total_tasks ? Math.round((done / s.total_tasks) * 100) : 0;
  return `
    <p>Run ID: ${s.run_id || "-"}</p>
    <p>Status: ${s.status}</p>
    <p>Progress: ${done}/${s.total_tasks} (${pct}%)</p>
    <p>PASS ${s.passed} | FAIL ${s.failed} | N/T ${s.nt || 0}</p>
    ${s.report_path ? `<p>Report: <a href="${s.report_path}" target="_blank">open</a></p>` : ""}
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
  return `
    <article class="stat-item ${connected > 0 ? "is-ok" : "is-warn"}"><p>검증 연결 단말</p><strong>${connected}대</strong></article>
    <article class="stat-item"><p>대시보드 표시 단말</p><strong>${listed}대</strong></article>
    <article class="stat-item ${androidReady > 0 ? "is-ok" : "is-warn"}"><p>Android 준비</p><strong>${androidReady}대</strong></article>
    <article class="stat-item"><p>iOS 준비</p><strong>${iosReady}대</strong></article>
    <article class="stat-item ${syncGap > 0 ? "is-warn" : "is-ok"}"><p>동기화 격차</p><strong>${syncGap}대</strong></article>
  `;
}

function renderProgress(rows) {
  if (!rows.length) return `<tr><td colspan="7">진행중 Task 없음</td></tr>`;
  return rows.map(r => `<tr><td>${esc((r.task_id || "").slice(0, 8))}</td><td>${esc(r.device_id)}</td><td class="text-clip" title="${esc(r.testcase_id)}">${esc(r.testcase_id)}</td><td>${esc(r.excel_row || "")}</td><td>${esc(r.iteration)}</td><td>${esc(r.status)}</td><td class="text-clip" title="${esc(r.issue || "")}">${esc(r.issue || "")}</td></tr>`).join("");
}

function renderIssues(issues) {
  if (!issues.length) return `<tr><td colspan="4">이슈 없음</td></tr>`;
  return issues.map(i => `<tr><td>${esc(i.time)}</td><td>${esc(i.device_id)}</td><td class="text-clip" title="${esc(i.testcase_id)}">${esc(i.testcase_id)}</td><td class="text-clip" title="${esc(i.issue)}">${esc(i.issue)}</td></tr>`).join("");
}

function renderFeeds(devices, deviceStates) {
  if (!devices.length) return `<p class="hint">연결 단말이 없습니다.</p>`;
  return devices.map((d) => {
    const state = deviceStates[d.device_id] || {};
    const shot = d.platform === "android"
      ? `/api/devices/${encodeURIComponent(d.device_id)}/live-shot`
      : (state.snapshot_path || "");
    const hasShot = !!shot;
    const img = hasShot
      ? `<img id="feedImg_${esc(d.device_id)}" alt="${esc(d.name)}" loading="eager" fetchpriority="high" /><div id="feedMsg_${esc(d.device_id)}" class="feed-empty" style="display:none;">화면 수신 중...</div>`
      : `<div class="feed-empty">아직 수집된 화면이 없습니다</div>`;
    return `
      <article class="device-feed-card">
        <header>
          <strong>${esc(d.name)}</strong>
          <span>${esc(d.platform)} | ${esc(d.device_id)}</span>
        </header>
        <div class="device-shot">${img}</div>
        ${hasShot ? `<div style="padding:8px 10px;"><a href="${esc(shot)}?t=${Date.now()}" target="_blank">라이브샷 직접 열기</a></div>` : ""}
      </article>
    `;
  }).join("");
}

const feedObjectUrls = {};
let currentDevices = [];
let feedPollTimer = null;
let lastFeedSignature = "";

async function updateFeedImages(devices, deviceStates) {
  for (const d of devices || []) {
    const imgEl = document.getElementById(`feedImg_${d.device_id}`);
    const msgEl = document.getElementById(`feedMsg_${d.device_id}`);
    if (!imgEl || !msgEl) continue;

    try {
      if (d.platform === "android") {
        const url = `/api/devices/${encodeURIComponent(d.device_id)}/live-shot?t=${Date.now()}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || `HTTP ${res.status}`);
        }
        const blob = await res.blob();
        if (feedObjectUrls[d.device_id]) {
          URL.revokeObjectURL(feedObjectUrls[d.device_id]);
        }
        const objUrl = URL.createObjectURL(blob);
        feedObjectUrls[d.device_id] = objUrl;
        imgEl.src = objUrl;
        imgEl.style.display = "block";
        msgEl.style.display = "none";
      } else {
        const state = (deviceStates || {})[d.device_id] || {};
        if (!state.snapshot_path) {
          throw new Error("iOS 스냅샷 없음");
        }
        imgEl.src = `${state.snapshot_path}?t=${Date.now()}`;
        imgEl.style.display = "block";
        msgEl.style.display = "none";
      }
    } catch (e) {
      imgEl.style.display = "none";
      msgEl.style.display = "flex";
      msgEl.innerText = `화면 로드 실패: ${e.message || e}`;
    }
  }
}

function startFeedPolling() {
  if (feedPollTimer) {
    clearInterval(feedPollTimer);
  }
  feedPollTimer = setInterval(() => {
    updateFeedImages(currentDevices, {});
  }, 900);
}

async function refresh() {
  try {
    const [data, validate] = await Promise.all([
      (await fetch("/api/dashboard")).json(),
      (await fetch("/api/devices/validate")).json().catch(() => ({})),
    ]);
    document.getElementById("summary").innerHTML = renderSummary(data.run_summary);
    const systemStats = document.getElementById("systemStats");
    if (systemStats) {
      systemStats.innerHTML = renderSystemStats(data, validate);
    }
    document.getElementById("progressTable").innerHTML = renderProgress(data.progress_tasks || []);
    document.getElementById("issueTable").innerHTML = renderIssues(data.issues || []);
    const devices = data.devices || [];
    const signature = devices.map((d) => `${d.device_id}:${d.platform}:${d.name}`).join("|");
    if (signature !== lastFeedSignature) {
      document.getElementById("deviceFeeds").innerHTML = renderFeeds(devices, data.device_states || {});
      lastFeedSignature = signature;
      currentDevices = devices;
      startFeedPolling();
    }
    updateFeedImages(devices, data.device_states || {});
    document.getElementById("latestSourceInfo").innerText =
      `latest_upload=${data.latest_upload || "-"}, latest_converted=${data.latest_converted || "-"}`;
    const cmp = data.compare || { active: false, device_ids: [] };
    document.getElementById("compareStatus").innerText = cmp.active
      ? `수동 비교중: ${cmp.device_ids.join(", ")} (state_count=${cmp.state_count})`
      : "수동 비교 비활성";
  } catch {
    document.getElementById("deviceFeeds").innerHTML = `<p class="hint">대시보드 갱신 실패. 2초 후 자동 재시도합니다.</p>`;
  }
}

document.getElementById("deviceFeeds").addEventListener("click", async (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  const id = (img.id || "").replace("feedImg_", "");
  if (!id) return;

  const rect = img.getBoundingClientRect();
  const xRatio = (e.clientX - rect.left) / Math.max(1, rect.width);
  const yRatio = (e.clientY - rect.top) / Math.max(1, rect.height);
  const naturalW = img.naturalWidth || 1080;
  const naturalH = img.naturalHeight || 2400;
  const x = Math.max(0, Math.min(naturalW - 1, Math.round(naturalW * xRatio)));
  const y = Math.max(0, Math.min(naturalH - 1, Math.round(naturalH * yRatio)));

  const fd = new FormData();
  fd.append("x", String(x));
  fd.append("y", String(y));
  const result = await postForm(`/api/devices/${encodeURIComponent(id)}/tap`, fd);
  document.getElementById("deviceValidation").innerText = result.ok
    ? `원격 탭 전송: ${id} (${x}, ${y})`
    : `원격 탭 실패: ${JSON.stringify(result)}`;
});

document.getElementById("validateDevicesBtn").addEventListener("click", async () => {
  const result = await (await fetch("/api/devices/validate")).json();
  if (!result.ok) {
    document.getElementById("deviceValidation").innerText = "단말 연동 확인 실패";
    return;
  }
  const s = result.summary || {};
  document.getElementById("deviceValidation").innerText =
    `연동확인 완료: connected=${s.connected || 0}, android_ready=${s.android_ready || 0}, ios_ready=${s.ios_ready || 0}`;
});

document.getElementById("runForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData();
  fd.append("repeat_count", e.target.querySelector('input[name="repeat_count"]').value);
  fd.append("run_android", e.target.querySelector('input[name="run_android"]').checked ? "true" : "false");
  fd.append("run_ios", e.target.querySelector('input[name="run_ios"]').checked ? "true" : "false");
  const result = await postForm("/api/runs/start", fd);
  document.getElementById("runResult").innerText = result.ok ? `Run started: ${result.run_id}` : JSON.stringify(result);
  refresh();
});

document.getElementById("loadBuiltinBtn").addEventListener("click", async () => {
  const result = await postForm("/api/testcases/load-builtin", new FormData());
  document.getElementById("runResult").innerText = result.ok
    ? `기본 테스트케이스 로드 완료 (TC ${result.testcase_count})`
    : JSON.stringify(result);
  refresh();
});

document.getElementById("quickDemoBtn").addEventListener("click", async () => {
  const fd = new FormData();
  fd.append("repeat_count", "1");
  fd.append("run_android", "true");
  fd.append("run_ios", "false");
  const result = await postForm("/api/demo/quick-run", fd);
  document.getElementById("runResult").innerText = result.ok
    ? `퀵 데모 시작: ${result.run_id} (task ${result.task_count})`
    : JSON.stringify(result);
  refresh();
});

document.getElementById("runLatestUploadBtn").addEventListener("click", async () => {
  const fd = new FormData();
  fd.append("repeat_count", "1");
  fd.append("run_android", "true");
  fd.append("run_ios", "false");
  const result = await postForm("/api/runs/start-latest-upload", fd);
  document.getElementById("runResult").innerText = result.ok
    ? `업로드 엑셀 실행 시작: ${result.run_id} (task ${result.task_count}) source=${result.source}`
    : JSON.stringify(result);
  refresh();
});

document.getElementById("refreshFeedBtn").addEventListener("click", async () => {
  refresh();
});

document.getElementById("startCompareBtn").addEventListener("click", async () => {
  const fd = new FormData();
  fd.append("cross_platform", "true");
  const result = await postForm("/api/compare/start", fd);
  document.getElementById("runResult").innerText = result.ok
    ? `수동 비교 시작: ${result.compare.device_ids.join(", ")}`
    : JSON.stringify(result);
  refresh();
});

document.getElementById("stopCompareBtn").addEventListener("click", async () => {
  const result = await postForm("/api/compare/stop", new FormData());
  document.getElementById("runResult").innerText = result.ok
    ? "수동 비교 중지"
    : JSON.stringify(result);
  refresh();
});

document.getElementById("exportResultBtn").addEventListener("click", async () => {
  const result = await postForm("/api/results/export-default", new FormData());
  document.getElementById("runResult").innerText = result.ok
    ? `결과 파일: ${result.file} (반영 ${result.updated_rows}) ${result.download_link}`
    : JSON.stringify(result);
});

refresh();
setInterval(refresh, 2000);
