;(function () {
  "use strict";

  const TABLE_COL_COUNT = 11;
  const DRILL_COL_COUNT = 28;
  const COLOR_ORDER = ["red", "orange", "yellow", "green", "none", "other"];
  const COMPONENT_ORDER = [
    "control",
    "map",
    "mycar",
    "handlelayer/home",
    "widget",
    "watch",
    "common ui",
  ];
  const BRAND_ORDER = ["통합", "KOA", "HOA", "GOA"];

  let DETAIL_ROWS = [];
  let CURRENT_HISTORY_ID = "";

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toNum(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n : 0;
  }

  function pct(numerator, denominator) {
    if (!denominator) return 0;
    return (toNum(numerator) / toNum(denominator)) * 100;
  }

  function fmtPct(value) {
    return `${toNum(value).toFixed(1)}%`;
  }

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeColor(value) {
    const key = normalizeText(value);
    if (COLOR_ORDER.includes(key)) return key;
    return "other";
  }

  function normalizeBrandFromRow(value) {
    const text = String(value || "").trim().toUpperCase();
    if (!text || text === "-" || text === "ALL" || text === "TOTAL") return "통합";
    if (text === "KOA") return "KOA";
    if (text === "HOA") return "HOA";
    if (text === "GOA") return "GOA";
    return String(value || "통합").trim();
  }

  function colorLabel(color) {
    const key = normalizeColor(color);
    if (key === "red") return "빨강";
    if (key === "orange") return "주황";
    if (key === "yellow") return "노랑";
    if (key === "green") return "초록";
    if (key === "none") return "미지정";
    return "기타";
  }

  function resultBucket(value) {
    const key = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
    if (!key) return "empty";
    if (key === "-" || key === "--" || key === "---") return "empty";
    if (key === "NAN" || key === "NULL" || key === "NONE") return "empty";
    if (key === "(BLANK)" || key === "BLANK") return "empty";
    if (key === "N") return "empty";
    if (key === "P" || key === "PASS" || key === "OK") return "pass";
    if (key === "FAIL" || key === "F") return "fail";
    if (key === "NT" || key === "N/T") return "nt";
    if (key === "NA" || key === "N/A") return "na";
    return "other";
  }

  function chip(value) {
    const text = String(value || "").trim();
    if (!text) return '<span class="ftc-rc is-empty">-</span>';
    const upper = text.toUpperCase();
    if (upper === "N") return '<span class="ftc-rc is-empty">-</span>';
    if (upper === "FAIL" || upper === "F") return '<span class="ftc-rc is-n">' + esc(text) + "</span>";
    if (upper === "P" || upper === "PASS") return '<span class="ftc-rc is-p">' + esc(text) + "</span>";
    if (upper === "NT" || upper === "N/T") return '<span class="ftc-rc is-nt">' + esc(text) + "</span>";
    if (upper === "NA" || upper === "N/A") return '<span class="ftc-rc is-na">' + esc(text) + "</span>";
    return '<span class="ftc-rc">' + esc(text) + "</span>";
  }

  function brandSortValue(brand) {
    const key = normalizeBrandFromRow(brand);
    const idx = BRAND_ORDER.indexOf(key);
    return idx >= 0 ? idx : 999;
  }

  function componentSortValue(component) {
    const key = normalizeText(component);
    const idx = COMPONENT_ORDER.indexOf(key);
    return idx >= 0 ? idx : 999;
  }

  function calcRunCount(item) {
    return Math.max(0, toNum(item.total) - toNum(item.red));
  }

  function stageBar(row) {
    const total = toNum(row.red) + toNum(row.orange) + toNum(row.yellow) + toNum(row.green);
    const r = pct(row.red, total);
    const o = pct(row.orange, total);
    const y = pct(row.yellow, total);
    const g = pct(row.green, total);
    return `
      <div class="cs-stage-wrap">
        <div class="cs-stage-track">
          <span class="cs-stage-seg red" style="width:${r.toFixed(2)}%"></span>
          <span class="cs-stage-seg orange" style="width:${o.toFixed(2)}%"></span>
          <span class="cs-stage-seg yellow" style="width:${y.toFixed(2)}%"></span>
          <span class="cs-stage-seg green" style="width:${g.toFixed(2)}%"></span>
        </div>
        <div class="cs-stage-label">빨강 ${esc(r.toFixed(1))}% | 주황 ${esc(o.toFixed(1))}% | 노랑 ${esc(y.toFixed(1))}% | 초록 ${esc(g.toFixed(1))}%</div>
      </div>
    `;
  }

  function colorRatePill(brand, component, metric, count, total) {
    const key = normalizeColor(metric);
    const rate = pct(count, total);
    return `<button type="button" class="cs-count-pill ${key} cs-drill-link" data-brand="${esc(brand)}" data-component="${esc(component)}" data-metric="${esc(key)}"><span class="cs-dot ${key}"></span>${esc(toNum(count))} (${esc(rate.toFixed(1))}%)</button>`;
  }

  function slotsForBrand(brand) {
    const b = normalizeBrandFromRow(brand);
    if (b === "KOA") return ["KOA"];
    if (b === "HOA") return ["HOA"];
    if (b === "GOA") return ["GOA"];
    return ["KOA", "HOA", "GOA"];
  }

  function slotColor(row, slot) {
    if (slot === "KOA") return normalizeColor(row?.koa_color);
    if (slot === "HOA") return normalizeColor(row?.hoa_color);
    return normalizeColor(row?.goa_color);
  }

  function slotResultBucket(row, slot) {
    if (slot === "KOA") return resultBucket(row?.koa_result);
    if (slot === "HOA") return resultBucket(row?.hoa_result);
    return resultBucket(row?.goa_result);
  }

  function matchesMetric(row, brand, metric) {
    const slots = slotsForBrand(brand);
    const key = String(metric || "").trim().toLowerCase();
    if (["red", "orange", "yellow", "green"].includes(key)) {
      return slots.some((slot) => slotColor(row, slot) === key);
    }
    if (key === "run") {
      return slots.some((slot) => slotColor(row, slot) !== "red");
    }
    if (key === "pass") {
      return slots.some((slot) => slotResultBucket(row, slot) === "pass");
    }
    return false;
  }

  function metricLabel(metric) {
    if (metric === "run") return "Run Rate";
    if (metric === "pass") return "Pass Rate";
    return `${colorLabel(metric)} 진행율`;
  }

  function aggregateBrandComponentRows(rows) {
    const matrixMap = new Map();
    const safeRows = Array.isArray(rows) ? rows : [];

    for (const row of safeRows) {
      const brand = normalizeBrandFromRow(row?.brand);
      const component = String(row?.component || "-").trim() || "-";
      const key = `${brand}||${component}`;
      const color = normalizeColor(row?.color);
      const count = toNum(row?.count);

      if (!matrixMap.has(key)) {
        matrixMap.set(key, {
          brand,
          component,
          total: 0,
          empty: 0,
          nonEmpty: 0,
          pass: 0,
          fail: 0,
          red: 0,
          orange: 0,
          yellow: 0,
          green: 0,
          none: 0,
          other: 0,
        });
      }

      const item = matrixMap.get(key);
      item.total += count;
      item.empty += toNum(row?.empty_result_count);
      item.nonEmpty += toNum(row?.non_empty_result_count);
      item.pass += toNum(row?.pass_count);
      item.fail += toNum(row?.fail_count);
      item[color] += count;
    }

    const out = Array.from(matrixMap.values()).map((item) => {
      const passDen = item.pass + item.fail;
      const effectiveEmpty = Math.max(toNum(item.empty), toNum(item.red));
      const runCount = calcRunCount(item);
      return {
        ...item,
        empty: effectiveEmpty,
        runCount,
        runRate: pct(runCount, item.total),
        passRate: pct(item.pass, passDen),
      };
    });

    out.sort((a, b) => {
      const aBrandSort = brandSortValue(a.brand);
      const bBrandSort = brandSortValue(b.brand);
      if (aBrandSort !== bBrandSort) return aBrandSort - bBrandSort;
      const brandCmp = String(a.brand).localeCompare(String(b.brand), "ko");
      if (brandCmp !== 0) return brandCmp;
      const aCompSort = componentSortValue(a.component);
      const bCompSort = componentSortValue(b.component);
      if (aCompSort !== bCompSort) return aCompSort - bCompSort;
      return String(a.component).localeCompare(String(b.component), "ko");
    });

    return out;
  }

  function renderKpis(rows) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const totalCount = safeRows.reduce((acc, row) => acc + toNum(row.count), 0);
    const totalRed = safeRows.reduce((acc, row) => {
      return acc + (normalizeColor(row.color) === "red" ? toNum(row.count) : 0);
    }, 0);
    const totalRun = Math.max(0, totalCount - totalRed);
    const totalEmptyByCell = safeRows.reduce((acc, row) => acc + toNum(row.empty_result_count), 0);
    const totalEmpty = Math.max(totalEmptyByCell, totalRed);
    const totalPass = safeRows.reduce((acc, row) => acc + toNum(row.pass_count), 0);
    const totalFail = safeRows.reduce((acc, row) => acc + toNum(row.fail_count), 0);

    const runRate = pct(totalRun, totalCount);
    const passRate = pct(totalPass, totalPass + totalFail);

    const runEl = document.getElementById("colorStatsKpiRunRate");
    const passEl = document.getElementById("colorStatsKpiPassRate");
    const validEl = document.getElementById("colorStatsKpiValid");
    const emptyEl = document.getElementById("colorStatsKpiEmpty");
    const passFailEl = document.getElementById("colorStatsKpiPassFail");

    if (runEl) runEl.textContent = fmtPct(runRate);
    if (passEl) passEl.textContent = fmtPct(passRate);
    if (validEl) validEl.textContent = String(totalRun);
    if (emptyEl) emptyEl.textContent = String(totalEmpty);
    if (passFailEl) passFailEl.textContent = `${totalPass} / ${totalFail}`;
  }

  function renderColorOverview(rows) {
    const wrap = document.getElementById("colorStatsColorOverview");
    if (!wrap) return;

    const totals = {
      red: 0,
      orange: 0,
      yellow: 0,
      green: 0,
    };

    const safeRows = Array.isArray(rows) ? rows : [];
    for (const row of safeRows) {
      const key = normalizeColor(row?.color);
      if (Object.prototype.hasOwnProperty.call(totals, key)) {
        totals[key] += toNum(row?.count);
      }
    }

    wrap.innerHTML = ["red", "orange", "yellow", "green"].map((key) => {
      return `
        <article class="colorstats-overview-card ${key}">
          <div class="colorstats-overview-title"><span class="cs-dot ${key}"></span>${esc(colorLabel(key))}</div>
          <div class="colorstats-overview-value">${esc(totals[key])}</div>
        </article>
      `;
    }).join("");
  }

  function renderDetailTable(rows) {
    const bodyEl = document.getElementById("colorStatsBody");
    if (!bodyEl) return;

    const matrix = aggregateBrandComponentRows(rows);
    if (!matrix.length) {
      bodyEl.innerHTML = `<tr><td colspan="${TABLE_COL_COUNT}">선택한 색상에 대한 데이터가 없습니다.</td></tr>`;
      return;
    }

    const groups = new Map();
    for (const row of matrix) {
      if (!groups.has(row.brand)) groups.set(row.brand, []);
      groups.get(row.brand).push(row);
    }

    const brandKeys = Array.from(groups.keys()).sort((a, b) => {
      const aSort = brandSortValue(a);
      const bSort = brandSortValue(b);
      if (aSort !== bSort) return aSort - bSort;
      return String(a).localeCompare(String(b), "ko");
    });

    const htmlParts = [];
    for (const brand of brandKeys) {
      const rowsByBrand = groups.get(brand) || [];
      rowsByBrand.forEach((row, idx) => {
        htmlParts.push(`
          <tr>
            ${idx === 0 ? `<td rowspan="${rowsByBrand.length}">${esc(brand)}</td>` : ""}
            <td>${esc(row.component)}</td>
            <td>${esc(row.total)}</td>
            <td>${esc(row.empty)}</td>
            <td>${colorRatePill(brand, row.component, "red", row.red, row.total)}</td>
            <td>${colorRatePill(brand, row.component, "orange", row.orange, row.total)}</td>
            <td>${colorRatePill(brand, row.component, "yellow", row.yellow, row.total)}</td>
            <td>${colorRatePill(brand, row.component, "green", row.green, row.total)}</td>
            <td>${stageBar(row)}</td>
            <td class="colorstats-rate"><button type="button" class="cs-drill-link" data-metric="run" data-brand="${esc(brand)}" data-component="${esc(row.component)}">${esc(toNum(row.runRate).toFixed(1))}</button></td>
            <td class="colorstats-rate"><button type="button" class="cs-drill-link" data-metric="pass" data-brand="${esc(brand)}" data-component="${esc(row.component)}">${esc(toNum(row.passRate).toFixed(1))}</button></td>
          </tr>
        `);
      });
    }

    bodyEl.innerHTML = htmlParts.join("");
    bodyEl.querySelectorAll(".cs-drill-link").forEach((btn) => {
      btn.addEventListener("click", function () {
        renderDrillRows(btn.dataset.brand || "통합", btn.dataset.component || "-", btn.dataset.metric || "");
      });
    });
  }

  function renderDrillRows(brand, component, metric) {
    const sectionEl = document.getElementById("colorStatsDrillSection");
    const titleEl = document.getElementById("colorStatsDrillTitle");
    const hintEl = document.getElementById("colorStatsDrillHint");
    const bodyEl = document.getElementById("colorStatsDrillBody");
    if (!sectionEl || !titleEl || !hintEl || !bodyEl) return;

    const filtered = (Array.isArray(DETAIL_ROWS) ? DETAIL_ROWS : []).filter((row) => {
      const rowComponent = String(row?.component || "-").trim();
      if (rowComponent !== String(component || "-").trim()) return false;
      return matchesMetric(row, brand, metric);
    });

    titleEl.innerHTML = `<i class="fa fa-magnifying-glass-chart"></i> Full_TC 원본 드릴다운 - ${esc(brand)} / ${esc(component)} / ${esc(metricLabel(metric))}`;
    hintEl.textContent = `${filtered.length}건의 원본 행이 조회되었습니다.`;

    if (!filtered.length) {
      bodyEl.innerHTML = `<tr><td colspan="${DRILL_COL_COUNT}">선택한 조건에 해당하는 원본 행이 없습니다.</td></tr>`;
      sectionEl.hidden = false;
      return;
    }

    bodyEl.innerHTML = filtered.map((row) => {
      return `
        <tr>
          <td>${esc(row.component)}</td>
          <td>${esc(row.tc_id)}</td>
          <td>${esc(row.sheet_row)}</td>
          <td>${esc(row.category)}</td>
          <td>${esc(row.depth1)}</td>
          <td>${esc(row.depth2)}</td>
          <td>${esc(row.depth3)}</td>
          <td>${esc(row.direction)}</td>
          <td>${esc(row.brand)}</td>
          <td>${esc(row.priority)}</td>
          <td>${esc(row.pre_condition)}</td>
          <td>${esc(row.tc_procedure)}</td>
          <td>${esc(row.expected_result)}</td>
          <td>${chip(row.base_result)}</td>
          <td>${chip(row.koa_result)}</td>
          <td>${chip(row.koa_android)}</td>
          <td>${chip(row.koa_ios)}</td>
          <td>${chip(row.hoa_result)}</td>
          <td>${chip(row.hoa_android)}</td>
          <td>${chip(row.hoa_ios)}</td>
          <td>${chip(row.goa_result)}</td>
          <td>${chip(row.goa_android)}</td>
          <td>${chip(row.goa_ios)}</td>
          <td>${esc(row.closed_jira_no)}</td>
          <td>${esc(row.jira_no)}</td>
          <td>${esc(row.nt_na_reason)}</td>
          <td>${esc(row.nt_na_filter)}</td>
          <td>${esc(row.label)}</td>
        </tr>
      `;
    }).join("");

    sectionEl.hidden = false;
    sectionEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function setCycleButtons(versions) {
    const bar = document.getElementById("ftcCycleFilterBar");
    if (!bar) return;

    const active = CURRENT_HISTORY_ID;
    const chips = [
      `<button type="button" class="colorstats-filter-chip${!active ? " active" : ""}" data-history-id="" data-cycle="">전체</button>`,
    ];

    for (const item of versions) {
      const hid = String(item?.history_id || "").trim();
      const cycle = String(item?.cycle || hid).trim();
      if (!hid || !cycle) continue;
      const title = String(item?.original_filename || "").trim();
      const isActive = active === hid;
      chips.push(
        `<button type="button" class="colorstats-filter-chip${isActive ? " active" : ""}" data-history-id="${esc(hid)}" data-cycle="${esc(cycle)}" title="${esc(title)}">${esc(cycle)}</button>`
      );
    }

    bar.innerHTML = chips.join("");
    bar.querySelectorAll(".colorstats-filter-chip").forEach((btn) => {
      btn.addEventListener("click", function () {
        bar.querySelectorAll(".colorstats-filter-chip").forEach((chipEl) => chipEl.classList.remove("active"));
        btn.classList.add("active");
        CURRENT_HISTORY_ID = String(btn.getAttribute("data-history-id") || "");
        loadColorStats(false);
      });
    });
  }

  async function loadVersions() {
    try {
      const res = await fetch("/api/qa/full-tc/versions", { credentials: "same-origin" });
      if (!res.ok) {
        setCycleButtons([]);
        return;
      }
      const data = await res.json();
      const versions = Array.isArray(data?.versions) ? data.versions : [];
      setCycleButtons(versions);
    } catch (_) {
      setCycleButtons([]);
    }
  }

  async function loadColorStats(force) {
    const hintEl = document.getElementById("colorStatsHint");
    const bodyEl = document.getElementById("colorStatsBody");
    const totalEl = document.getElementById("colorStatsTotalRows");
    const brandEl = document.getElementById("colorStatsBrands");
    const componentEl = document.getElementById("colorStatsComponents");
    const drillEl = document.getElementById("colorStatsDrillSection");

    if (drillEl) drillEl.hidden = true;
    if (bodyEl) {
      bodyEl.innerHTML = `<tr><td colspan="${TABLE_COL_COUNT}">데이터를 불러오는 중...</td></tr>`;
    }

    try {
      const params = new URLSearchParams();
      if (force) params.set("force", "true");
      if (CURRENT_HISTORY_ID) params.set("history_id", CURRENT_HISTORY_ID);
      const qs = params.toString() ? `?${params.toString()}` : "";

      let res = await fetch(`/api/qa/full-tc/color-stats${qs}`, { credentials: "same-origin" });
      if (res.status === 404 && !CURRENT_HISTORY_ID) {
        res = await fetch(`/api/qa/full-tc/color_stats${qs}`, { credentials: "same-origin" });
      }
      let usedSummaryFallback = false;
      if (res.status === 404 && !CURRENT_HISTORY_ID) {
        res = await fetch(`/api/qa/full-tc/summary${qs}`, { credentials: "same-origin" });
        usedSummaryFallback = true;
      }
      if (res.status === 401) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.assign(`/auth/login?next=${next}`);
        return;
      }

      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(String(data?.detail || "색상 통계를 불러오지 못했습니다."));
      }

      const rows = usedSummaryFallback
        ? (Array.isArray(data.brand_component_color_rows) ? data.brand_component_color_rows : [])
        : (Array.isArray(data.rows) ? data.rows : []);
      DETAIL_ROWS = Array.isArray(data.detail_rows) ? data.detail_rows : [];

      const matrix = aggregateBrandComponentRows(rows);
      if (totalEl) totalEl.textContent = `Rows ${rows.length}`;
      if (brandEl) {
        const brandCount = new Set(matrix.map((row) => String(row?.brand || "통합"))).size;
        brandEl.textContent = `Brands ${brandCount}`;
      }
      if (componentEl) {
        const componentCount = new Set(matrix.map((row) => String(row?.component || ""))).size;
        componentEl.textContent = `Components ${componentCount}`;
      }
      if (hintEl) {
        const prefix = usedSummaryFallback ? "(호환 모드) " : "";
        const label = data.history_label ? ` | 버전: ${String(data.history_label)}` : "";
        hintEl.textContent = `${prefix}소스: ${String(data.source || "-")} | 업로드: ${String(data.uploaded_at || "-")} | 갱신: ${String(data.updated_at || "-")}${label}`;
      }

      if (!rows.length) {
        if (bodyEl) bodyEl.innerHTML = `<tr><td colspan="${TABLE_COL_COUNT}">표시할 색상 통계가 없습니다.</td></tr>`;
        return;
      }

      renderKpis(rows);
      renderColorOverview(rows);
      renderDetailTable(rows);
    } catch (error) {
      if (hintEl) {
        hintEl.textContent = String(error?.message || "색상 통계를 불러오지 못했습니다.");
      }
      if (bodyEl) {
        bodyEl.innerHTML = `<tr><td colspan="${TABLE_COL_COUNT}">${esc(error?.message || "색상 통계를 불러오지 못했습니다.")}</td></tr>`;
      }
    }
  }

  document.getElementById("colorStatsRefreshBtn")?.addEventListener("click", function () {
    loadColorStats(true);
  });

  loadVersions().finally(function () {
    loadColorStats(true);
  });
})();;(function () {
  "use strict";

  const TABLE_COL_COUNT = 11;
  const DRILL_COL_COUNT = 28;
  const COLOR_ORDER = ["red", "orange", "yellow", "green", "none", "other"];
  const COMPONENT_ORDER = [
    "control",
    "map",
    "mycar",
    "handlelayer/home",
    "widget",
    "watch",
    "common ui",
  ];
  const BRAND_ORDER = ["통합", "KOA", "HOA", "GOA"];
  let DETAIL_ROWS = [];
  let CURRENT_HISTORY_ID = "";

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toNum(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n : 0;
  }

  function pct(numerator, denominator) {
    if (!denominator) return 0;
    return (toNum(numerator) / toNum(denominator)) * 100;
  }

  function fmtPct(value) {
    return `${toNum(value).toFixed(1)}%`;
  }

  function normalizeColor(value) {
    const key = String(value || "none").trim().toLowerCase();
    if (COLOR_ORDER.includes(key)) return key;
    return "other";
  }

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function colorLabel(color) {
    const key = normalizeColor(color);
    if (key === "red") return "빨강";
    if (key === "orange") return "주황";
    if (key === "yellow") return "노랑";
    if (key === "green") return "초록";
    if (key === "none") return "미지정";
    return "기타";
  }

  function colorCountPill(color, count) {
    const key = normalizeColor(color);
    return `<span class="cs-count-pill ${key}"><span class="cs-dot ${key}"></span>${esc(count)}</span>`;
  }

  function stageBar(row) {
    const total = toNum(row.red) + toNum(row.orange) + toNum(row.yellow) + toNum(row.green);
    const r = pct(row.red, total);
    const o = pct(row.orange, total);
    const y = pct(row.yellow, total);
    const g = pct(row.green, total);
    return `
      <div class="cs-stage-wrap">
        <div class="cs-stage-track">
          <span class="cs-stage-seg red" style="width:${r.toFixed(2)}%"></span>
          <span class="cs-stage-seg orange" style="width:${o.toFixed(2)}%"></span>
          <span class="cs-stage-seg yellow" style="width:${y.toFixed(2)}%"></span>
          <span class="cs-stage-seg green" style="width:${g.toFixed(2)}%"></span>
        </div>
        <div class="cs-stage-label">빨강 ${esc(r.toFixed(1))}% | 주황 ${esc(o.toFixed(1))}% | 노랑 ${esc(y.toFixed(1))}% | 초록 ${esc(g.toFixed(1))}%</div>
      </div>
    `;
  }

  function colorRatePill(color, count, total) {
    const key = normalizeColor(color);
    const rate = pct(count, total);
    return `<button type="button" class="cs-count-pill ${key} cs-drill-link" data-metric="${esc(key)}"><span class="cs-dot ${key}"></span>${esc(toNum(count))} (${esc(rate.toFixed(1))}%)</button>`;
  }

  function resultBucket(value) {
    const key = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
    if (!key) return "empty";
    if (key === "-" || key === "--" || key === "---") return "empty";
    if (key === "NAN" || key === "NULL" || key === "NONE") return "empty";
    if (key === "(BLANK)" || key === "BLANK") return "empty";
    if (key === "N") return "empty";
    if (key === "P" || key === "PASS" || key === "OK") return "pass";
    if (key === "FAIL" || key === "F") return "fail";
    if (key === "NT" || key === "N/T") return "nt";
    if (key === "NA" || key === "N/A") return "na";
    return "other";
  }

  function chip(value) {
    const text = String(value || "").trim();
    if (!text) return '<span class="ftc-rc is-empty">-</span>';
    const upper = text.toUpperCase();
    if (upper === "N") return '<span class="ftc-rc is-empty">-</span>';
    if (upper === "FAIL" || upper === "F") return '<span class="ftc-rc is-n">' + esc(text) + '</span>';
    if (upper === "P" || upper === "PASS") return '<span class="ftc-rc is-p">' + esc(text) + '</span>';
    if (upper === "NT" || upper === "N/T") return '<span class="ftc-rc is-nt">' + esc(text) + '</span>';
    if (upper === "NA" || upper === "N/A") return '<span class="ftc-rc is-na">' + esc(text) + '</span>';
    return '<span class="ftc-rc">' + esc(text) + '</span>';
  }

  function slotsForBrand(brand) {
    const b = String(brand || "통합").trim().toUpperCase();
    if (b === "KOA") return ["KOA"];
    if (b === "HOA") return ["HOA"];
    if (b === "GOA") return ["GOA"];
    return ["KOA", "HOA", "GOA"];
  }

  function slotColor(row, slot) {
    if (slot === "KOA") return normalizeColor(row?.koa_color);
    if (slot === "HOA") return normalizeColor(row?.hoa_color);
    return normalizeColor(row?.goa_color);
  }

  function slotResultBucket(row, slot) {
    if (slot === "KOA") return resultBucket(row?.koa_result);
    if (slot === "HOA") return resultBucket(row?.hoa_result);
    return resultBucket(row?.goa_result);
  }

  function matchesMetric(row, brand, metric) {
    const slots = slotsForBrand(brand);
    const key = String(metric || "").trim().toLowerCase();
    if (["red", "orange", "yellow", "green"].includes(key)) {
      return slots.some((slot) => slotColor(row, slot) === key);
    }
    if (key === "run") {
      return slots.some((slot) => slotColor(row, slot) !== "red");
    }
    if (key === "pass") {
      return slots.some((slot) => slotResultBucket(row, slot) === "pass");
    }
    return false;
  }

  function metricLabel(metric) {
    if (metric === "run") return "Run Rate";
    if (metric === "pass") return "Pass Rate";
    return `${colorLabel(metric)} 진행율`;
  }

  function renderDrillRows(brand, component, metric) {
    const sectionEl = document.getElementById("colorStatsDrillSection");
    const titleEl = document.getElementById("colorStatsDrillTitle");
    const hintEl = document.getElementById("colorStatsDrillHint");
    const bodyEl = document.getElementById("colorStatsDrillBody");
    if (!sectionEl || !titleEl || !hintEl || !bodyEl) return;

    const filtered = (Array.isArray(DETAIL_ROWS) ? DETAIL_ROWS : []).filter((row) => {
      const rowComponent = String(row?.component || "-").trim();
      if (rowComponent !== String(component || "-").trim()) return false;
      return matchesMetric(row, brand, metric);
    });

    async function loadVersions() {
      const bar = document.getElementById("ftcCycleFilterBar");
      if (!bar) return;
      try {
        const res = await fetch("/api/qa/full-tc/versions", { credentials: "same-origin" });
        if (!res.ok) return;
        const data = await res.json();
        const versions = Array.isArray(data?.versions) ? data.versions : [];
        if (!versions.length) return;
        const active = CURRENT_HISTORY_ID;
        bar.innerHTML = [
          `<button type="button" class="colorstats-filter-chip${!active ? " active" : ""}" data-history-id="" data-cycle="">전체</button>`,
          ...versions.map(function (v) {
            const hid = String(v.history_id || "");
            const cycle = String(v.cycle || hid);
            const isActive = active === hid;
            return `<button type="button" class="colorstats-filter-chip${isActive ? " active" : ""}" data-history-id="${esc(hid)}" data-cycle="${esc(cycle)}" title="${esc(v.original_filename || "")}">${esc(cycle)}</button>`;
          }),
        ].join("");
        bar.querySelectorAll(".colorstats-filter-chip").forEach(function (btn) {
          btn.addEventListener("click", function () {
            bar.querySelectorAll(".colorstats-filter-chip").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            const hid = String(btn.getAttribute("data-history-id") || "");
            CURRENT_HISTORY_ID = hid;
            loadColorStats(false);
          });
        });
      } catch (_) {}
    }
    for (const row of rows) {
    async function loadColorStats(force) {
      const hintEl = document.getElementById("colorStatsHint");
      const bodyEl = document.getElementById("colorStatsBody");
      const totalEl = document.getElementById("colorStatsTotalRows");
      const brandEl = document.getElementById("colorStatsBrands");
      const componentEl = document.getElementById("colorStatsComponents");

      if (bodyEl) {
        bodyEl.innerHTML = `<tr><td colspan="${TABLE_COL_COUNT}">데이터를 불러오는 중...</td></tr>`;
      }

      try {
        const params = new URLSearchParams();
        if (force) params.set("force", "true");
        if (CURRENT_HISTORY_ID) params.set("history_id", CURRENT_HISTORY_ID);
        const qs = params.toString() ? `?${params.toString()}` : "";
        let res = await fetch(`/api/qa/full-tc/color-stats${qs}`, { credentials: "same-origin" });
        if (res.status === 404 && !CURRENT_HISTORY_ID) {
          res = await fetch(`/api/qa/full-tc/color_stats${qs}`, { credentials: "same-origin" });
        }
        let usedSummaryFallback = false;
        if (res.status === 404 && !CURRENT_HISTORY_ID) {
          res = await fetch(`/api/qa/full-tc/summary${qs}`, { credentials: "same-origin" });
          usedSummaryFallback = true;
        }
        if (res.status === 401) {
          const next = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.assign(`/auth/login?next=${next}`);
          return;
        }

        const data = await res.json();
        if (!res.ok || !data?.ok) {
          throw new Error(String(data?.detail || "색상 통계를 불러오지 못했습니다."));
        }
      const brand = normalizeBrandFromRow(row);
        const rows = usedSummaryFallback
          ? (Array.isArray(data.brand_component_color_rows) ? data.brand_component_color_rows : [])
          : (Array.isArray(data.rows) ? data.rows : []);
        DETAIL_ROWS = usedSummaryFallback
          ? (Array.isArray(data.detail_rows) ? data.detail_rows : [])
          : (Array.isArray(data.detail_rows) ? data.detail_rows : []);
        const matrix = aggregateBrandComponentRows(rows);
      const component = String(row.component || "-").trim() || "-";
        if (totalEl) totalEl.textContent = `Rows ${rows.length}`;
        if (brandEl) {
          const brandCount = new Set(matrix.map((row) => String(row?.brand || "통합"))).size;
          brandEl.textContent = `Brands ${brandCount}`;
        }
        if (componentEl) {
          const componentCount = new Set(matrix.map((row) => String(row?.component || ""))).size;
          componentEl.textContent = `Components ${componentCount}`;
        }
        if (hintEl) {
          const prefix = usedSummaryFallback ? "(호환 모드) " : "";
          const label = data.history_label ? ` | 버전: ${String(data.history_label).replace(/^.*?v(\d[\d.]+)/i, 'v$1').substring(0, 40)}` : "";
          hintEl.textContent = `${prefix}소스: ${String(data.source || "-")} | 업로드: ${String(data.uploaded_at || "-")} | 갱신: ${String(data.updated_at || "-")}${label}`;
        }
      const key = `${brand}||${component}`;
        if (!rows.length) {
          if (bodyEl) bodyEl.innerHTML = `<tr><td colspan="${TABLE_COL_COUNT}">표시할 색상 통계가 없습니다.</td></tr>`;
          return;
        }
      const color = normalizeColor(row.color);
        renderKpis(rows);
        renderColorOverview(rows);
        renderDetailTable(rows);
      } catch (error) {
        if (hintEl) {
          hintEl.textContent = String(error?.message || "색상 통계를 불러오지 못했습니다.");
        }
        if (bodyEl) {
          bodyEl.innerHTML = `<tr><td colspan="${TABLE_COL_COUNT}">${esc(error?.message || "색상 통계를 불러오지 못했습니다.")}</td></tr>`;
        }
      }
    }
      const count = toNum(row.count);
    document.getElementById("colorStatsRefreshBtn")?.addEventListener("click", function () {
      loadColorStats(true);
    });

    loadVersions();
    loadColorStats(true);
      if (!matrixMap.has(key)) {
        matrixMap.set(key, {
          brand,
          component,
          total: 0,
          empty: 0,
          nonEmpty: 0,
          pass: 0,
          fail: 0,
          red: 0,
          orange: 0,
          yellow: 0,
          green: 0,
          none: 0,
          other: 0,
        });
      }

      const item = matrixMap.get(key);
      item.total += count;
      item.empty += toNum(row.empty_result_count);
      item.nonEmpty += toNum(row.non_empty_result_count);
      item.pass += toNum(row.pass_count);
      item.fail += toNum(row.fail_count);
      item[color] += count;
    }

    const out = Array.from(matrixMap.values()).map((item) => {
      const passDen = item.pass + item.fail;
      const effectiveEmpty = Math.max(toNum(item.empty), toNum(item.red));
      const runCount = calcRunCount(item);
      return {
        ...item,
        empty: effectiveEmpty,
        runCount,
        runRate: pct(runCount, item.total),
        passRate: pct(item.pass, passDen),
      };
    });

    out.sort((a, b) => {
      const aBrandSort = brandSortValue(a.brand);
      const bBrandSort = brandSortValue(b.brand);
      if (aBrandSort !== bBrandSort) return aBrandSort - bBrandSort;
      const brandCmp = String(a.brand).localeCompare(String(b.brand), "ko");
      if (brandCmp !== 0) return brandCmp;
      const aCompSort = componentSortValue(a.component);
      const bCompSort = componentSortValue(b.component);
      if (aCompSort !== bCompSort) return aCompSort - bCompSort;
      return String(a.component).localeCompare(String(b.component), "ko");
    });
    return out;
  }

  function renderKpis(rows) {
    const totalCount = rows.reduce((acc, row) => acc + toNum(row.count), 0);
    const totalRed = rows.reduce((acc, row) => {
      return acc + (normalizeColor(row.color) === "red" ? toNum(row.count) : 0);
    }, 0);
    const totalRun = Math.max(0, totalCount - totalRed);
    const totalEmptyByCell = rows.reduce((acc, row) => acc + toNum(row.empty_result_count), 0);
    const totalEmpty = Math.max(totalEmptyByCell, totalRed);
    const totalPass = rows.reduce((acc, row) => acc + toNum(row.pass_count), 0);
    const totalFail = rows.reduce((acc, row) => acc + toNum(row.fail_count), 0);

    const runRate = pct(totalRun, totalCount);
    const passRate = pct(totalPass, totalPass + totalFail);

    const runEl = document.getElementById("colorStatsKpiRunRate");
    const passEl = document.getElementById("colorStatsKpiPassRate");
    const validEl = document.getElementById("colorStatsKpiValid");
    const emptyEl = document.getElementById("colorStatsKpiEmpty");
    const passFailEl = document.getElementById("colorStatsKpiPassFail");

    if (runEl) runEl.textContent = fmtPct(runRate);
    if (passEl) passEl.textContent = fmtPct(passRate);
    if (validEl) validEl.textContent = String(totalRun);
    if (emptyEl) emptyEl.textContent = String(totalEmpty);
    if (passFailEl) passFailEl.textContent = `${totalPass} / ${totalFail}`;
  }

  function renderDetailTable(rows) {
    const bodyEl = document.getElementById("colorStatsBody");
    if (!bodyEl) return;

    const matrix = aggregateBrandComponentRows(rows);
    if (!matrix.length) {
      bodyEl.innerHTML = `<tr><td colspan="${TABLE_COL_COUNT}">선택한 색상에 대한 데이터가 없습니다.</td></tr>`;
      return;
    }

    const groups = new Map();
    for (const row of matrix) {
      if (!groups.has(row.brand)) groups.set(row.brand, []);
      groups.get(row.brand).push(row);
    }

    const brandKeys = Array.from(groups.keys()).sort((a, b) => {
      const aSort = brandSortValue(a);
      const bSort = brandSortValue(b);
      if (aSort !== bSort) return aSort - bSort;
      return String(a).localeCompare(String(b), "ko");
    });

    const htmlParts = [];
    for (const brand of brandKeys) {
      const rowsByBrand = groups.get(brand) || [];
      rowsByBrand.forEach((row, idx) => {
        htmlParts.push(`
          <tr>
            ${idx === 0 ? `<td rowspan="${rowsByBrand.length}">${esc(brand)}</td>` : ""}
            <td>${esc(row.component)}</td>
            <td>${esc(row.total)}</td>
            <td>${esc(row.empty)}</td>
            <td><span data-brand="${esc(brand)}" data-component="${esc(row.component)}">${colorRatePill("red", row.red, row.total)}</span></td>
            <td><span data-brand="${esc(brand)}" data-component="${esc(row.component)}">${colorRatePill("orange", row.orange, row.total)}</span></td>
            <td><span data-brand="${esc(brand)}" data-component="${esc(row.component)}">${colorRatePill("yellow", row.yellow, row.total)}</span></td>
            <td><span data-brand="${esc(brand)}" data-component="${esc(row.component)}">${colorRatePill("green", row.green, row.total)}</span></td>
            <td>${stageBar(row)}</td>
            <td class="colorstats-rate"><button type="button" class="cs-drill-link" data-metric="run" data-brand="${esc(brand)}" data-component="${esc(row.component)}">${esc(toNum(row.runRate).toFixed(1))}</button></td>
            <td class="colorstats-rate"><button type="button" class="cs-drill-link" data-metric="pass" data-brand="${esc(brand)}" data-component="${esc(row.component)}">${esc(toNum(row.passRate).toFixed(1))}</button></td>
          </tr>
        `);
      });
    }

    bodyEl.innerHTML = htmlParts.join("");
    bodyEl.querySelectorAll(".cs-drill-link").forEach((btn) => {
      const parent = btn.closest("span[data-brand][data-component]");
      if (parent) {
        btn.dataset.brand = parent.dataset.brand || "통합";
        btn.dataset.component = parent.dataset.component || "-";
      }
      btn.addEventListener("click", function () {
        renderDrillRows(btn.dataset.brand || "통합", btn.dataset.component || "-", btn.dataset.metric || "");
      });
    });
  }

  function renderColorOverview(rows) {
    const wrap = document.getElementById("colorStatsColorOverview");
    if (!wrap) return;

    const totals = {
      red: 0,
      orange: 0,
      yellow: 0,
      green: 0,
    };
    for (const row of rows) {
      const key = normalizeColor(row.color);
      if (Object.prototype.hasOwnProperty.call(totals, key)) {
        totals[key] += toNum(row.count);
      }
    }

    wrap.innerHTML = ["red", "orange", "yellow", "green"].map((key) => {
      return `
        <article class="colorstats-overview-card ${key}">
          <div class="colorstats-overview-title"><span class="cs-dot ${key}"></span>${esc(colorLabel(key))}</div>
          <div class="colorstats-overview-value">${esc(totals[key])}</div>
        </article>
      `;
    }).join("");
  }

  async function loadColorStats(force) {
    const hintEl = document.getElementById("colorStatsHint");
    const bodyEl = document.getElementById("colorStatsBody");
    const totalEl = document.getElementById("colorStatsTotalRows");
    const brandEl = document.getElementById("colorStatsBrands");
    const componentEl = document.getElementById("colorStatsComponents");

    if (bodyEl) {
      bodyEl.innerHTML = `<tr><td colspan="${TABLE_COL_COUNT}">데이터를 불러오는 중...</td></tr>`;
    }

    try {
      const qs = force ? "?force=true" : "";
      let res = await fetch(`/api/qa/full-tc/color-stats${qs}`, { credentials: "same-origin" });
      if (res.status === 404) {
        res = await fetch(`/api/qa/full-tc/color_stats${qs}`, { credentials: "same-origin" });
      }
      let usedSummaryFallback = false;
      if (res.status === 404) {
        res = await fetch(`/api/qa/full-tc/summary${qs}`, { credentials: "same-origin" });
        usedSummaryFallback = true;
      }
      if (res.status === 401) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.assign(`/auth/login?next=${next}`);
        return;
      }

      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(String(data?.detail || "색상 통계를 불러오지 못했습니다."));
      }

      const rows = usedSummaryFallback
        ? (Array.isArray(data.brand_component_color_rows) ? data.brand_component_color_rows : [])
        : (Array.isArray(data.rows) ? data.rows : []);
      DETAIL_ROWS = usedSummaryFallback
        ? (Array.isArray(data.detail_rows) ? data.detail_rows : [])
        : (Array.isArray(data.detail_rows) ? data.detail_rows : []);
      const matrix = aggregateBrandComponentRows(rows);

      if (totalEl) totalEl.textContent = `Rows ${rows.length}`;
      if (brandEl) {
        const brandCount = new Set(matrix.map((row) => String(row?.brand || "통합"))).size;
        brandEl.textContent = `Brands ${brandCount}`;
      }
      if (componentEl) {
        const componentCount = new Set(matrix.map((row) => String(row?.component || ""))).size;
        componentEl.textContent = `Components ${componentCount}`;
      }
      if (hintEl) {
        const prefix = usedSummaryFallback ? "(호환 모드) " : "";
        hintEl.textContent = `${prefix}소스: ${String(data.source || "-")} | 업로드: ${String(data.uploaded_at || "-")} | 갱신: ${String(data.updated_at || "-")}`;
      }

      if (!rows.length) {
        if (bodyEl) bodyEl.innerHTML = `<tr><td colspan="${TABLE_COL_COUNT}">표시할 색상 통계가 없습니다.</td></tr>`;
        return;
      }

      renderKpis(rows);
      renderColorOverview(rows);
      renderDetailTable(rows);
    } catch (error) {
      if (hintEl) {
        hintEl.textContent = String(error?.message || "색상 통계를 불러오지 못했습니다.");
      }
      if (bodyEl) {
        bodyEl.innerHTML = `<tr><td colspan="${TABLE_COL_COUNT}">${esc(error?.message || "색상 통계를 불러오지 못했습니다.")}</td></tr>`;
      }
    }
  }

  document.getElementById("colorStatsRefreshBtn")?.addEventListener("click", function () {
    loadColorStats(true);
  });

  loadColorStats(true);
})();
