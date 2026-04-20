/* upload_defectlist_raw.js v20260408a */
(function () {
  /* ── DOM refs ── */
  const dropZone    = document.getElementById("drDrop");
  const fileInput   = document.getElementById("defectRawFile");
  const ddFileName  = document.getElementById("ddFileName");
  const ddFileNameT = document.getElementById("ddFileNameText");
  const uploadBtn   = document.getElementById("defectRawUploadBtn");
  const statusEl    = document.getElementById("drUploadStatus");
  const infoList    = document.getElementById("drInfoList");
  const historyBody = document.getElementById("drHistoryBody");
  const refreshStatusBtn  = document.getElementById("drRefreshStatusBtn");
  const refreshHistoryBtn = document.getElementById("drRefreshHistoryBtn");
  const dsSrc   = document.getElementById("dsSrc");
  const dsTime  = document.getElementById("dsTime");
  const dsRows  = document.getElementById("dsRows");
  const dsHistoryCount = document.getElementById("dsHistory");

  /* ── utils ── */
  function fmt(v) {
    const text = String(v || "").trim();
    if (!text) return "-";
    const d = new Date(text);
    if (Number.isNaN(d.getTime())) return text;
    const y   = d.getFullYear();
    const mo  = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh  = String(d.getHours()).padStart(2, "0");
    const mm  = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${mo}-${day}, ${hh}:${mm}`;
  }

  function setStatus(type, msg) {
    statusEl.className = `dr-status ${type}`;
    if (type === "busy") {
      statusEl.innerHTML = `<span class="dr-spinner"></span><span>${msg}</span>`;
    } else {
      statusEl.innerHTML = `<span>${msg}</span>`;
    }
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function parseApiResponse(res, defaultErrorMsg) {
    const rawText = await res.text();
    let data = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = null;
    }

    if (res.ok && data && data.ok !== false) {
      return data;
    }

    const detail = String((data && (data.detail || data.message)) || "").trim();
    if (detail) {
      throw new Error(detail);
    }
    throw new Error(defaultErrorMsg);
  }

  /* ── 파일 선택 ── */
  function handleFileSelect(file) {
    if (!file) return;
    ddFileNameT.textContent = file.name;
    ddFileName.classList.add("show");
    uploadBtn.disabled = false;
    setStatus("idle", `"${file.name}" 선택됨 — 버튼을 눌러 업로드하세요`);
  }

  fileInput?.addEventListener("change", () => {
    handleFileSelect(fileInput.files?.[0]);
  });

  /* drag & drop */
  dropZone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("over");
  });
  dropZone?.addEventListener("dragleave", () => dropZone.classList.remove("over"));
  dropZone?.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("over");
    const file = e.dataTransfer?.files?.[0];
    if (file && file.name.toLowerCase().endsWith(".xlsx")) {
      // sync to input for form-based access
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      handleFileSelect(file);
    } else if (file) {
      setStatus("error", ".xlsx 파일만 업로드할 수 있습니다");
    }
  });

  /* ── 업로드 ── */
  uploadBtn?.addEventListener("click", async () => {
    const file = fileInput?.files?.[0];
    if (!file) { setStatus("error", "파일을 선택해 주세요"); return; }

    uploadBtn.disabled = true;
    setStatus("busy", "업로드 및 캐시 갱신 중…");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res  = await fetch("/api/upload/defectlist-raw", { method: "POST", body: fd, credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(String(data?.detail || "업로드 실패"));
      setStatus("ok", `✅ 업로드 완료 | 결함 ${Number(data.defect_total_rows || 0).toLocaleString()}건 | 이슈 ${Number(data.raw_issue_total_rows || 0).toLocaleString()}건`);
      /* 업로드 성공 후 전체 새로고침 */
      await Promise.all([loadStatus(), loadHistory()]);
    } catch (err) {
      setStatus("error", `업로드 실패: ${String(err?.message || err)}`);
      uploadBtn.disabled = false;
    }
  });

  /* ── 소스 현황 ── */
  async function loadStatus() {
    try {
      const res  = await fetch("/api/upload/source-status", { credentials: "same-origin" });
      const data = await parseApiResponse(res, "상태 조회 실패");
      const raw = data?.defect_raw || {};

      /* 배지 */
      const srcBadge = raw.exists
        ? `<span class="dr-badge dr-badge-excel">📊 업로드 파일</span>`
        : `<span class="dr-badge dr-badge-none">없음</span>`;

      /* 통계 카드 갱신 */
      if (dsSrc)  dsSrc.innerHTML  = srcBadge;
      if (dsTime) dsTime.textContent = raw.exists ? fmt(raw.uploaded_at) : "-";

      /* info list */
      infoList.innerHTML = [
        `<li><span class="il-key">소스 타입</span><span class="il-val">${esc(raw.source_type || "-")}</span></li>`,
        `<li><span class="il-key">저장 파일명</span><span class="il-val">${esc(raw.source || "-")}</span></li>`,
        `<li><span class="il-key">업로드 일시</span><span class="il-val">${fmt(raw.uploaded_at)}</span></li>`,
        `<li><span class="il-key">파일 존재</span><span class="il-val">${raw.exists ? "✅ 예" : "❌ 없음"}</span></li>`,
      ].join("");
    } catch (err) {
      infoList.innerHTML = `<li><span class="il-key">오류: ${esc(String(err?.message || err))}</span></li>`;
    }
  }

  async function loadHistoryFromStatic() {
    const res = await fetch("/uploads/defectlist_raw_upload_history.json", { cache: "no-store" });
    if (!res.ok) throw new Error("업로드 이력 파일이 없습니다");
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("업로드 이력 형식이 올바르지 않습니다");
    return data;
  }

  /* ── 업로드 이력 ── */
  async function loadHistory() {
    try {
      const res  = await fetch("/api/upload/defectlist-raw/history", { credentials: "same-origin" });
      const data = await parseApiResponse(res, "이력 조회 실패");
      const list = data.history || [];

      /* 총 횟수 카드 */
      if (dsHistoryCount) dsHistoryCount.textContent = list.length ? `${list.length}회` : "0회";

      if (!list.length) {
        historyBody.innerHTML = `<tr><td colspan="7" class="dr-empty">아직 업로드 이력이 없습니다</td></tr>`;
        return;
      }
      historyBody.innerHTML = list.map((h, i) => {
        const name  = esc(h.uploader_name  || "-");
        const email = esc(h.uploader_email || "");
        const who   = email ? `${name}<br><small style="color:#94a3b8;">${email}</small>` : name;
        const fallbackDownload = h?.snapshot_file
          ? `/uploads/defectlist_raw_history/${encodeURIComponent(String(h.snapshot_file))}`
          : "";
        const downloadUrl = String(h.download_url || fallbackDownload || "").trim();
        const downloadBtn = downloadUrl
          ? `<a class="dr-mini-btn" href="${esc(downloadUrl)}" style="text-decoration:none;">⬇️ 파일</a>`
          : `<span style="color:#94a3b8;">-</span>`;
        return `<tr>
          <td class="h-no">${i + 1}</td>
          <td class="h-at">${fmt(h.uploaded_at)}</td>
          <td class="h-who">${who}</td>
          <td class="h-file" title="${esc(h.original_filename)}">${esc(h.original_filename || "-")}</td>
          <td class="h-num">${Number(h.defect_total_rows || 0).toLocaleString()}</td>
          <td class="h-num">${Number(h.raw_issue_total_rows || 0).toLocaleString()}</td>
          <td>${downloadBtn}</td>
        </tr>`;
      }).join("");

      /* 첫 번째 행 기준으로 dsRows 갱신 */
      if (dsRows && list[0]) {
        dsRows.textContent = Number(list[0].defect_total_rows || 0).toLocaleString();
      }
    } catch (err) {
      const msg = String(err?.message || "").trim();
      if (msg.toLowerCase() === "not found") {
        try {
          const list = await loadHistoryFromStatic();
          if (dsHistoryCount) dsHistoryCount.textContent = list.length ? `${list.length}회` : "0회";
          if (!list.length) {
            historyBody.innerHTML = `<tr><td colspan="7" class="dr-empty">아직 업로드 이력이 없습니다</td></tr>`;
            return;
          }
          historyBody.innerHTML = list.map((h, i) => {
            const fallbackDownload = h?.snapshot_file
              ? `/uploads/defectlist_raw_history/${encodeURIComponent(String(h.snapshot_file))}`
              : "";
            const downloadBtn = fallbackDownload
              ? `<a class="dr-mini-btn" href="${esc(fallbackDownload)}" style="text-decoration:none;">⬇️ 파일</a>`
              : `<span style="color:#94a3b8;">-</span>`;
            return `<tr>
              <td class="h-no">${i + 1}</td>
              <td class="h-at">${fmt(h.uploaded_at)}</td>
              <td class="h-who">-</td>
              <td class="h-file" title="${esc(h.original_filename)}">${esc(h.original_filename || "-")}</td>
              <td class="h-num">${Number(h.defect_total_rows || 0).toLocaleString()}</td>
              <td class="h-num">${Number(h.raw_issue_total_rows || 0).toLocaleString()}</td>
              <td>${downloadBtn}</td>
            </tr>`;
          }).join("");
          return;
        } catch {
          // keep message below
        }
      }
      historyBody.innerHTML = `<tr><td colspan="7" class="dr-empty">오류: ${esc(msg || "이력 조회 실패")}</td></tr>`;
    }
  }

  /* ── 버튼 이벤트 ── */
  refreshStatusBtn?.addEventListener("click", async () => {
    refreshStatusBtn.disabled = true;
    await loadStatus();
    refreshStatusBtn.disabled = false;
  });

  refreshHistoryBtn?.addEventListener("click", async () => {
    refreshHistoryBtn.disabled = true;
    await loadHistory();
    refreshHistoryBtn.disabled = false;
  });

  /* ── 초기 로드 ── */
  Promise.all([loadStatus(), loadHistory()]);
})();
