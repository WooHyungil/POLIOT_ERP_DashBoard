/* upload_full_tc.js v20260403a */
(function () {
  /* ── DOM refs ── */
  const dropZone    = document.getElementById("ftDrop");
  const fileInput   = document.getElementById("fullTcFile");
  const ftFileName  = document.getElementById("ftFileName");
  const ftFileNameT = document.getElementById("ftFileNameText");
  const uploadBtn   = document.getElementById("fullTcUploadBtn");
  const statusEl    = document.getElementById("ftUploadStatus");
  const infoList    = document.getElementById("ftInfoList");
  const sheetsBody  = document.getElementById("ftSheetsBody");
  const refreshStatusBtn = document.getElementById("ftRefreshStatusBtn");
  const refreshSheetsBtn = document.getElementById("ftRefreshSheetsBtn");
  const ftSrc    = document.getElementById("ftSrc");
  const ftTime   = document.getElementById("ftTime");
  const ftSheets = document.getElementById("ftSheets");
  const ftExists = document.getElementById("ftExists");

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
    statusEl.className = `ft-status ${type}`;
    if (type === "busy") {
      statusEl.innerHTML = `<span class="ft-spinner"></span><span>${msg}</span>`;
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

      if (res.status === 401) {
        throw new Error("로그인이 만료되었습니다. 다시 로그인해 주세요.");
      }
      if (res.status === 403) {
        throw new Error("관리자 권한이 필요합니다.");
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
    ftFileNameT.textContent = file.name;
    ftFileName.classList.add("show");
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
    const lower = file?.name?.toLowerCase() || "";
    if (file && (lower.endsWith(".xlsx") || lower.endsWith(".csv"))) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      handleFileSelect(file);
    } else if (file) {
      setStatus("error", ".xlsx 또는 .csv 파일만 업로드할 수 있습니다");
    }
  });

  /* ── 업로드 ── */
  uploadBtn?.addEventListener("click", async () => {
    const file = fileInput?.files?.[0];
    if (!file) { setStatus("error", "파일을 선택해 주세요"); return; }

    uploadBtn.disabled = true;
    setStatus("busy", "업로드 및 시트 인덱싱 중…");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res  = await fetch("/api/upload/full-tc", { method: "POST", body: fd, credentials: "same-origin" });
        const data = await parseApiResponse(res, "업로드 실패");
      const sheetCnt = Number(data.sheet_count || 0);
      setStatus("ok", `✅ 업로드 완료 | 시트 ${sheetCnt.toLocaleString()}개 인덱싱됨`);
      if (ftSheets) ftSheets.textContent = `${sheetCnt}개`;
      renderSheets(data.sheets || []);
      await loadStatus();
    } catch (err) {
      setStatus("error", `업로드 실패: ${String(err?.message || err)}`);
    } finally {
      uploadBtn.disabled = false;
    }
  });

  /* ── 소스 현황 ── */
  async function loadStatus() {
    try {
      const res  = await fetch("/api/upload/source-status", { credentials: "same-origin" });
        const data = await parseApiResponse(res, "상태 조회 실패");
      const raw = data?.full_tc || {};

      /* 배지 */
      let srcBadge;
      if (!raw.exists) {
        srcBadge = `<span class="ft-badge ft-badge-none">없음</span>`;
      } else if (raw.source_type === "uploaded_excel") {
        srcBadge = `<span class="ft-badge ft-badge-excel">📊 업로드 파일</span>`;
      } else {
        srcBadge = `<span class="ft-badge ft-badge-script">🔗 Apps Script</span>`;
      }

      /* 통계 카드 갱신 */
      if (ftSrc)    ftSrc.innerHTML      = srcBadge;
      if (ftTime)   ftTime.textContent   = raw.exists ? fmt(raw.uploaded_at) : "-";
      if (ftExists) ftExists.textContent = raw.exists ? "✅ 있음" : "❌ 없음";

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

  /* ── 시트 목록 ── */
  function renderSheets(sheets) {
    if (!sheets || !sheets.length) {
      sheetsBody.innerHTML = `<tr><td colspan="2" class="ft-empty">시트 정보가 없습니다</td></tr>`;
      if (ftSheets) ftSheets.textContent = "0개";
      return;
    }
    sheetsBody.innerHTML = sheets.map((s, i) =>
      `<tr><td class="h-no">${i + 1}</td><td>${esc(String(s))}</td></tr>`
    ).join("");
    if (ftSheets) ftSheets.textContent = `${sheets.length}개`;
  }

  async function loadSheets() {
    try {
      const res  = await fetch("/api/qa/full-tc/summary", { credentials: "same-origin" });
        const data = await parseApiResponse(res, "시트 조회 실패");
      /* summary의 components에서 sheet_name 추출 */
      const components = Array.isArray(data?.components) ? data.components : [];
      const sheets = components
        .map((c) => String(c?.sheet_name || "").trim())
        .filter(Boolean);
      renderSheets(sheets);
    } catch {
      sheetsBody.innerHTML = `<tr><td colspan="2" class="ft-empty">시트 목록을 불러올 수 없습니다</td></tr>`;
    }
  }

  /* ── 버튼 이벤트 ── */
  refreshStatusBtn?.addEventListener("click", async () => {
    refreshStatusBtn.disabled = true;
    await loadStatus();
    refreshStatusBtn.disabled = false;
  });

  refreshSheetsBtn?.addEventListener("click", async () => {
    refreshSheetsBtn.disabled = true;
    await loadSheets();
    refreshSheetsBtn.disabled = false;
  });

  /* ── 초기 로드 ── */
  Promise.all([loadStatus(), loadSheets()]);
})();
