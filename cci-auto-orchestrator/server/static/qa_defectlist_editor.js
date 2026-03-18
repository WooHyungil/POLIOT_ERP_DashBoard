(() => {
  const state = {
    payload: null,
    savingRows: new Set(),
  };

  const ui = {
    refreshBtn: document.getElementById("editorRefreshBtn"),
    rawRefreshBtn: document.getElementById("rawRefreshBtn"),
    hint: document.getElementById("editorHint"),
    stats: document.getElementById("editorStats"),
    head: document.getElementById("defectlistEditorHead"),
    body: document.getElementById("defectlistEditorBody"),
    toast: document.getElementById("toastStack"),
  };

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function showToast(message, kind = "ok") {
    if (!ui.toast) return;
    const el = document.createElement("div");
    el.className = `toast-item ${kind}`;
    el.textContent = message;
    ui.toast.appendChild(el);
    window.setTimeout(() => {
      el.classList.add("show");
      window.setTimeout(() => {
        el.classList.remove("show");
        window.setTimeout(() => el.remove(), 240);
      }, 1800);
    }, 20);
  }

  function setHint(msg) {
    if (ui.hint) ui.hint.textContent = msg || "";
  }

  function getDropdownOptions(colIdx, currentValue) {
    const options = (state.payload && state.payload.dropdown_options && state.payload.dropdown_options[String(colIdx)]) || [];
    if (currentValue && !options.includes(currentValue)) {
      return [currentValue, ...options];
    }
    return options;
  }

  function createEditableCell(row, colIdx, value) {
    const td = document.createElement("td");
    td.dataset.col = String(colIdx);

    const memoCol = Number((state.payload && state.payload.memo_column) || 5);
    if (colIdx === memoCol) {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "defectlist-cell-input";
      input.value = value || "";
      input.dataset.original = value || "";
      input.addEventListener("change", () => markRowDirty(row));
      td.appendChild(input);
      return td;
    }

    const select = document.createElement("select");
    select.className = "defectlist-cell-select";
    select.dataset.original = value || "";
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "-";
    select.appendChild(blank);

    getDropdownOptions(colIdx, value || "").forEach((opt) => {
      const option = document.createElement("option");
      option.value = opt;
      option.textContent = opt;
      select.appendChild(option);
    });
    select.value = value || "";
    select.addEventListener("change", () => markRowDirty(row));
    td.appendChild(select);
    return td;
  }

  function createReadonlyCell(value) {
    const td = document.createElement("td");
    td.innerHTML = escapeHtml(value || "");
    return td;
  }

  function readCellValue(td) {
    if (!td) return "";
    const input = td.querySelector("input,select");
    if (!input) return td.textContent || "";
    return String(input.value || "");
  }

  function readOriginalValue(td) {
    if (!td) return "";
    const input = td.querySelector("input,select");
    if (!input) return td.textContent || "";
    return String(input.dataset.original || "");
  }

  function rowHasChanges(tr) {
    const editable = tr.querySelectorAll("td[data-col]");
    return Array.from(editable).some((td) => readCellValue(td) !== readOriginalValue(td));
  }

  function markRowDirty(tr) {
    const saveBtn = tr.querySelector("button[data-action='save-row']");
    if (!saveBtn) return;
    const dirty = rowHasChanges(tr);
    saveBtn.disabled = !dirty || state.savingRows.has(String(tr.dataset.sheetRow || ""));
    tr.classList.toggle("row-dirty", dirty);
  }

  function renderStats() {
    if (!ui.stats || !state.payload) return;
    const totalRows = (state.payload.rows || []).length;
    const html = [
      `<div class=\"stat\"><p>DefectList 행 수</p><strong>${totalRows}</strong></div>`,
      `<div class=\"stat\"><p>원본 시트</p><strong>${escapeHtml(state.payload.sheet || "-")}</strong></div>`,
      `<div class=\"stat\"><p>Raw 기준</p><strong>${escapeHtml(state.payload.raw_sheet || "-")}</strong></div>`,
      `<div class=\"stat\"><p>업데이트 시각</p><strong>${escapeHtml(state.payload.updated_at || "-")}</strong></div>`,
    ];
    ui.stats.innerHTML = html.join("");
  }

  function renderTable() {
    if (!state.payload) return;
    const headers = state.payload.headers || [];
    const rows = state.payload.rows || [];
    const dropdownColumns = new Set((state.payload.dropdown_columns || []).map((x) => Number(x)));

    ui.head.innerHTML = "";
    const headTr = document.createElement("tr");
    const actionTh = document.createElement("th");
    actionTh.textContent = "작업";
    headTr.appendChild(actionTh);
    headers.forEach((h) => {
      const th = document.createElement("th");
      th.textContent = h || "-";
      headTr.appendChild(th);
    });
    const rawTh = document.createElement("th");
    rawTh.textContent = "Raw 참고";
    headTr.appendChild(rawTh);
    ui.head.appendChild(headTr);

    ui.body.innerHTML = "";
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.dataset.sheetRow = String(row.sheet_row || "");

      const actionTd = document.createElement("td");
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "btn-secondary";
      saveBtn.dataset.action = "save-row";
      saveBtn.textContent = `저장(${row.sheet_row})`;
      saveBtn.disabled = true;
      saveBtn.addEventListener("click", () => saveRow(tr));
      actionTd.appendChild(saveBtn);
      tr.appendChild(actionTd);

      const values = Array.isArray(row.values) ? row.values : [];
      values.forEach((value, colIdx) => {
        const td = dropdownColumns.has(colIdx)
          ? createEditableCell(tr, colIdx, String(value || ""))
          : createReadonlyCell(value || "");
        tr.appendChild(td);
      });

      const rawTd = document.createElement("td");
      const rawRef = row.raw_ref || {};
      rawTd.innerHTML = [
        `<div>status: ${escapeHtml(rawRef.status || "-")}</div>`,
        `<div>priority: ${escapeHtml(rawRef.priority || "-")}</div>`,
        `<div>reporter: ${escapeHtml(rawRef.reporter || "-")}</div>`,
      ].join("");
      tr.appendChild(rawTd);

      ui.body.appendChild(tr);
    });
  }

  async function fetchEditorData(force) {
    setHint(force ? "최신 데이터 재조회 중..." : "DefectList 불러오는 중...");
    const res = await fetch(`/api/qa/defectlist/editor-data?force=${force ? "true" : "false"}`, { cache: "no-store" });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || "failed to load");
    }
    state.payload = await res.json();
    renderStats();
    renderTable();
    setHint("B~I 편집 가능. G 컬럼은 자유 메모 입력 후 행별 저장 버튼으로 반영하세요.");
  }

  async function refreshRawThenReload() {
    setHint("DefectList_Raw 최신화 실행 중...");
    const res = await fetch("/api/stats/defects/refresh", { method: "POST" });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || "raw refresh failed");
    }
    await fetchEditorData(true);
    showToast("DefectList_Raw 최신화 후 다시 불러왔습니다.");
  }

  async function saveRow(tr) {
    const rowNum = String(tr.dataset.sheetRow || "").trim();
    if (!rowNum) return;
    if (state.savingRows.has(rowNum)) return;

    const changes = {};
    tr.querySelectorAll("td[data-col]").forEach((td) => {
      const col = String(td.dataset.col || "");
      const nextVal = readCellValue(td);
      const prevVal = readOriginalValue(td);
      if (nextVal !== prevVal) changes[col] = nextVal;
    });

    if (!Object.keys(changes).length) {
      markRowDirty(tr);
      return;
    }

    state.savingRows.add(rowNum);
    markRowDirty(tr);
    setHint(`${rowNum}행 저장 중...`);

    const form = new FormData();
    form.append("sheet_row", rowNum);
    form.append("updates_json", JSON.stringify(changes));

    try {
      const res = await fetch("/api/qa/defectlist/update-row", { method: "POST", body: form });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "save failed");
      }
      tr.querySelectorAll("td[data-col]").forEach((td) => {
        const input = td.querySelector("input,select");
        if (!input) return;
        input.dataset.original = String(input.value || "");
      });
      markRowDirty(tr);
      setHint(`${rowNum}행 저장 완료`);
      showToast(`${rowNum}행 저장 완료`);
    } catch (err) {
      const msg = err && err.message ? err.message : "저장 실패";
      setHint(msg);
      showToast(`저장 실패: ${msg}`, "err");
    } finally {
      state.savingRows.delete(rowNum);
      markRowDirty(tr);
    }
  }

  async function init() {
    if (ui.refreshBtn) {
      ui.refreshBtn.addEventListener("click", () => {
        fetchEditorData(true).catch((err) => {
          const msg = err && err.message ? err.message : "load failed";
          setHint(msg);
          showToast(msg, "err");
        });
      });
    }
    if (ui.rawRefreshBtn) {
      ui.rawRefreshBtn.addEventListener("click", () => {
        refreshRawThenReload().catch((err) => {
          const msg = err && err.message ? err.message : "refresh failed";
          setHint(msg);
          showToast(msg, "err");
        });
      });
    }

    try {
      await fetchEditorData(false);
    } catch (err) {
      const msg = err && err.message ? err.message : "load failed";
      setHint(msg);
      showToast(msg, "err");
    }
  }

  init();
})();
