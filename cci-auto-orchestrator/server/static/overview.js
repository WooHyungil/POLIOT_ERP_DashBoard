function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toast(msg, tone) {
  const stack = document.getElementById("toastStack");
  if (!stack) return;
  const item = document.createElement("div");
  item.className = `toast-item ${tone ? `toast-${tone}` : ""}`.trim();
  item.textContent = msg;
  stack.appendChild(item);
  setTimeout(function () {
    item.classList.add("fade");
    setTimeout(function () {
      item.remove();
    }, 240);
  }, 1800);
}

const overviewUpdateState = {
  items: [],
};

const OVERVIEW_PIE_COLORS = ["#2f73c5", "#12a182", "#e39f1d", "#d65a62", "#6b7fd7", "#7a8da6", "#b4c2d6"];
const summarySliderState = {
  slides: [],
  index: 0,
};
const overviewRecentRangeState = {
  days: 0,
};
const noticeState = {
  items: [],
  boardItems: [],
  activeFilter: "all",
};

function restartCssAnimation(el, className) {
  if (!el) return;
  el.classList.remove(className);
  // Force reflow so the same class animation can replay on data refresh.
  void el.offsetWidth;
  el.classList.add(className);
}

function animateDonutAndLegend(donut, legend) {
  if (!donut || !legend) return;
  restartCssAnimation(donut, "overview-donut-enter");
  const rows = legend.querySelectorAll("li");
  rows.forEach(function (row, idx) {
    row.style.animationDelay = `${Math.min(idx * 65, 380)}ms`;
    restartCssAnimation(row, "overview-legend-enter");
  });
}

function fmtTime(v) {
  const s = String(v || "").trim();
  if (!s) return "-";
  const n = Date.parse(s);
  if (!Number.isFinite(n)) {
    return s.replace("T", " ").replace("Z", "");
  }
  const d = new Date(n);
  const pad2 = function (x) { return String(x).padStart(2, "0"); };
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function kindText(kind) {
  const k = String(kind || "").trim().toLowerCase();
  if (k === "added") return "신규";
  if (k === "removed") return "제거";
  return "업데이트";
}

function kindClass(kind) {
  const k = String(kind || "").trim().toLowerCase();
  if (k === "added") return "is-added";
  if (k === "removed") return "is-removed";
  return "is-updated";
}

function updateTs(v) {
  const n = Date.parse(String(v || ""));
  return Number.isFinite(n) ? n : 0;
}

async function refreshFloatingLogout() {
  const form = document.getElementById("floatingLogoutForm");
  if (!form) return;
  try {
    const res = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (!res.ok) {
      form.hidden = true;
      return;
    }
    const data = await res.json();
    const email = String(data?.user?.email || "").trim().toLowerCase();
    if (email) {
      try {
        localStorage.setItem("cci_auth_user_email", email);
      } catch {}
      form.hidden = false;
      return;
    }
  } catch {}
  form.hidden = true;
}

function sortOverviewItems(items) {
  return [...items].sort(function (a, b) {
    const aWorking = String(a?.source || "") === "git-working" ? 1 : 0;
    const bWorking = String(b?.source || "") === "git-working" ? 1 : 0;
    if (aWorking !== bWorking) return bWorking - aWorking;
    return updateTs(b?.updated_at) - updateTs(a?.updated_at);
  });
}

function closeUpdateDetailModal() {
  const modal = document.getElementById("updateDetailModal");
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove("modal-open");
}

function openUpdateDetailModal(idx) {
  const row = overviewUpdateState.items[idx];
  if (!row) return;
  const modal = document.getElementById("updateDetailModal");
  const title = document.getElementById("updateDetailTitle");
  const meta = document.getElementById("updateDetailMeta");
  const source = document.getElementById("updateDetailSource");
  const list = document.getElementById("updateDetailList");
  const kindBadge = document.getElementById("updateDetailKind");
  const scopeBadge = document.getElementById("updateDetailScope");
  const timestamp = document.getElementById("updateDetailTimestamp");
  const count = document.getElementById("updateDetailCount");
  const icon = document.getElementById("updateDetailIcon");
  if (!modal || !title || !meta || !source || !list || !kindBadge || !scopeBadge || !timestamp || !count || !icon) return;

  const details = Array.isArray(row?.details) ? row.details : [];
  const kindInfo = getNoticeKindInfo(row);
  title.textContent = row?.title || "업데이트 상세";
  meta.textContent = `${kindText(row?.kind)} 변경 항목을 상세하게 확인할 수 있습니다.`;
  source.textContent = String(row?.source || "-");
  scopeBadge.textContent = String(row?.scope || "-");
  kindBadge.textContent = kindInfo.text;
  kindBadge.className = `update-detail-kind ${kindInfo.badgeClass}`;
  timestamp.textContent = fmtDateTimeForDetail(row?.updated_at);
  count.textContent = `${details.length || 0}건`;
  icon.className = `update-detail-icon ${kindInfo.badgeClass}`;
  icon.innerHTML = `<i class="${kindInfo.icon}"></i>`;
  list.innerHTML = details.length
    ? details.map(function (d, detailIdx) { return `<li><span class="update-detail-index">${detailIdx + 1}</span><span>${esc(d)}</span></li>`; }).join("")
    : "<li>상세 내용이 없습니다.</li>";

  modal.hidden = false;
  document.body.classList.add("modal-open");
}

function fmtDateTimeForDetail(value) {
  const text = String(value || "").trim();
  if (!text) return "-";
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return text.replace("T", " ").replace("Z", "");
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(parsed));
}

async function copyText(text, successMsg) {
  if (!text) {
    toast("복사할 값이 없습니다.", "warn");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast(successMsg, "ok");
  } catch {
    toast("복사 실패: 수동으로 복사해 주세요.", "warn");
  }
}

function isDefectListItem(item) {
  const title = String(item?.title || "").toLowerCase();
  const scope = String(item?.scope || "").toLowerCase();
  return title.includes("defect") || scope.includes("defect")
    || title.includes("결함") || scope.includes("결함")
    || title.includes("raw") || scope.includes("raw");
}

function getNoticeKindInfo(item) {
  if (isDefectListItem(item)) {
    return { badgeClass: "nk-defect", icon: "fas fa-table", text: "DefectList" };
  }
  const kind = String(item?.kind || "").trim().toLowerCase();
  if (kind === "added") return { badgeClass: "nk-added", icon: "fas fa-plus-circle", text: "신규 기능" };
  if (kind === "removed") return { badgeClass: "nk-removed", icon: "fas fa-minus-circle", text: "삭제" };
  return { badgeClass: "nk-updated", icon: "fas fa-sync-alt", text: "업데이트" };
}

function renderNoticeList() {
  const root = document.getElementById("noticeList");
  if (!root) return;

  // 게시판 탭: boardItems 배열을 전용 렌더링
  if (noticeState.activeFilter === "board") {
    const boards = noticeState.boardItems;
    if (!boards.length) {
      root.innerHTML = '<p class="notice-empty">등록된 게시글이 없습니다.</p>';
      return;
    }
    root.innerHTML = boards.map(function (p) {
      const priorityBadge = p.priority === 'High'
        ? '<span class="notice-board-badge nk-removed"><i class="fas fa-exclamation-circle"></i> High</span>'
        : p.priority === 'Medium'
        ? '<span class="notice-board-badge nk-updated"><i class="fas fa-minus-circle"></i> Medium</span>'
        : '<span class="notice-board-badge nk-defect"><i class="fas fa-arrow-circle-down"></i> Low</span>';
      const statusBadge = p.status && p.status !== 'approved'
        ? `<span class="notice-working-tag">${p.status === 'pending' ? '승인 대기' : '반려'}</span>`
        : '';
      const commentBadge = p.comment_count > 0
        ? `<span class="hint" style="font-size:0.75rem;"><i class="fas fa-comment"></i> ${esc(String(p.comment_count))}</span>`
        : '';
      const date = (function (iso) {
        if (!iso) return '';
        try { return new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit' }).format(new Date(iso + 'Z')); } catch { return iso; }
      })(p.created_at);
      return `
        <a class="notice-board-item" href="/board#${esc(p.id)}">
          <div class="notice-item-badge-col">
            <span class="notice-kind-badge nk-added"><i class="fas fa-clipboard-list"></i></span>
            <div class="notice-item-line"></div>
          </div>
          <div class="notice-item-body">
            <div class="notice-item-top">${priorityBadge} ${statusBadge}</div>
            <strong class="notice-item-title">${esc(p.title || '-')}</strong>
            <p class="notice-item-meta">${esc(p.author_name || '-')} · ${esc(date)} ${commentBadge}</p>
          </div>
        </a>
      `;
    }).join("");
    return;
  }

  const allItems = noticeState.items;
  const filtered = noticeState.activeFilter === "defect"
    ? allItems.filter(isDefectListItem)
    : noticeState.activeFilter === "program"
    ? allItems.filter(function (item) { return !isDefectListItem(item); })
    : allItems;

  if (!filtered.length) {
    root.innerHTML = '<p class="notice-empty">표시할 공지사항이 없습니다.</p>';
    return;
  }

  root.innerHTML = filtered.slice(0, 20).map(function (item) {
    const details = Array.isArray(item?.details) ? item.details : [];
    const preview = details.slice(0, 2);
    const isWorking = String(item?.source || "") === "git-working";
    const kindInfo = getNoticeKindInfo(item);
    const realIdx = overviewUpdateState.items.indexOf(item);
    return `
      <div class="notice-item ${isWorking ? "is-working" : ""}" data-notice-idx="${realIdx}" role="button" tabindex="0" aria-label="공지 상세 보기">
        <div class="notice-item-badge-col">
          <span class="notice-kind-badge ${kindInfo.badgeClass}"><i class="${kindInfo.icon}"></i></span>
          <div class="notice-item-line"></div>
        </div>
        <div class="notice-item-body">
          <div class="notice-item-top">
            <span class="notice-kind-label ${kindInfo.badgeClass}">${esc(kindInfo.text)}</span>
            ${isWorking ? '<span class="notice-working-tag">작업중</span>' : ""}
          </div>
          <strong class="notice-item-title">${esc(item?.title || "-")}</strong>
          <p class="notice-item-meta">${esc(item?.scope || "-")} · ${esc(fmtTime(item?.updated_at))}</p>
          ${preview.length ? `<ul class="notice-item-details">${preview.map(function (detail) { return `<li>${esc(detail)}</li>`; }).join("")}</ul>` : ""}
          ${details.length > 2 ? `<span class="notice-item-more">+${details.length - 2}건 더보기</span>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

async function refreshNoticeCard() {
  const root = document.getElementById("noticeList");
  const syncText = document.getElementById("noticeLastSyncText");
  const newDot = document.getElementById("noticeNewDot");
  if (!root) return;
  root.innerHTML = '<div class="notice-loading"><i class="fas fa-circle-notch fa-spin"></i><span>공지사항을 불러오는 중...</span></div>';
  try {
    const [updatesRes, boardRes] = await Promise.all([
      fetch("/api/overview/updates"),
      fetch("/api/board/overview", { credentials: "include" }).catch(function () { return null; }),
    ]);
    const data = await updatesRes.json();
    const items = sortOverviewItems(Array.isArray(data?.items) ? data.items : []).slice(0, 40);
    overviewUpdateState.items = items;
    noticeState.items = items;

    // 게시판 글 로드
    if (boardRes && boardRes.ok) {
      const boardData = await boardRes.json();
      noticeState.boardItems = Array.isArray(boardData?.items) ? boardData.items : [];
    } else {
      noticeState.boardItems = [];
    }

    const latest = items[0];
    if (syncText) {
      syncText.textContent = latest
        ? `최근 변경: ${fmtTime(latest?.updated_at)}`
        : "변경 이력이 없습니다.";
    }
    if (newDot) {
      newDot.hidden = !items.some(function (item) { return String(item?.source || "") === "git-working"; });
    }
    renderNoticeList();
  } catch (e) {
    overviewUpdateState.items = [];
    noticeState.items = [];
    noticeState.boardItems = [];
    root.innerHTML = `<p class="notice-empty">공지사항 조회 실패: ${esc(String(e))}</p>`;
  }
}

function refreshOverviewUpdates() {
  return refreshNoticeCard();
}

function buildPieItems(rawItems, maxItems) {
  const list = (Array.isArray(rawItems) ? rawItems : [])
    .map(function (x) {
      return {
        name: String(x?.name || "").trim() || "기타",
        count: Number(x?.count || 0),
      };
    })
    .filter(function (x) { return Number.isFinite(x.count) && x.count > 0; })
    .sort(function (a, b) { return b.count - a.count; });

  const limit = Math.max(1, Number(maxItems || 6));
  const head = list.slice(0, limit);
  const rest = list.slice(limit);
  const restSum = rest.reduce(function (acc, cur) { return acc + cur.count; }, 0);
  if (restSum > 0) {
    head.push({ name: "기타", count: restSum });
  }
  return head;
}

function renderOverviewDonut(donutId, legendId, items) {
  const donut = document.getElementById(donutId);
  const legend = document.getElementById(legendId);
  if (!donut || !legend) return;

  const centerLabel = donutId === "overviewRecentDonut" ? "최근 이슈" : donutId === "overviewSummaryDonut" ? "Summary" : "통계";

  const safeItems = Array.isArray(items) ? items : [];
  const total = safeItems.reduce(function (acc, cur) { return acc + Number(cur.count || 0); }, 0);
  if (!total) {
    donut.classList.add("overview-donut-empty");
    donut.style.background = "conic-gradient(#eaf1fb 0 360deg)";
    donut.innerHTML = `<div class="overview-donut-center"><strong>0</strong><span>${centerLabel}</span></div>`;
    legend.innerHTML = '<li class="hint">표시할 데이터가 없습니다.</li>';
    animateDonutAndLegend(donut, legend);
    return;
  }

  donut.classList.remove("overview-donut-empty");
  let startDeg = 0;
  const segments = safeItems.map(function (item, idx) {
    const ratio = Number(item.count || 0) / total;
    const sweep = ratio * 360;
    const endDeg = startDeg + sweep;
    const color = OVERVIEW_PIE_COLORS[idx % OVERVIEW_PIE_COLORS.length];
    const part = `${color} ${startDeg.toFixed(2)}deg ${endDeg.toFixed(2)}deg`;
    startDeg = endDeg;
    return part;
  });
  donut.style.background = `conic-gradient(${segments.join(",")})`;
  donut.innerHTML = `<div class="overview-donut-center"><strong>${esc(String(total))}</strong><span>${centerLabel}</span></div>`;

  legend.innerHTML = safeItems.map(function (item, idx) {
    const color = OVERVIEW_PIE_COLORS[idx % OVERVIEW_PIE_COLORS.length];
    const pct = Math.round((Number(item.count || 0) / total) * 100);
    return `<li><span class="overview-legend-dot" style="background:${color}"></span><span class="overview-legend-label">${esc(item.name)}</span><strong class="overview-legend-value">${esc(String(item.count))}건</strong><span class="overview-legend-pct">${esc(String(pct))}%</span></li>`;
  }).join("");

  animateDonutAndLegend(donut, legend);
}

function extractRegularPieItems(payload) {
  const base = Array.isArray(payload?.summary_by_version) ? payload.summary_by_version : [];
  return buildPieItems(base, 5);
}

function extractRecentPieItems(payload) {
  const base = Array.isArray(payload?.status_top) ? payload.status_top : [];
  return buildPieItems(base, 8);
}

function extractSummaryCyclePieItems(payload) {
  const base = Array.isArray(payload?.cycle_counts) ? payload.cycle_counts : [];
  return base
    .map(function (x) {
      return {
        name: String(x?.name || "").trim(),
        count: Number(x?.count || 0),
      };
    })
    .filter(function (x) {
      return x.name && Number.isFinite(x.count) && x.count > 0;
    });
}

function renderSummaryCycleChips(items) {
  const root = document.getElementById("overviewSummaryCycleChips");
  if (!root) return;
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    root.innerHTML = '<span class="overview-cycle-chip is-empty">사이클 데이터 없음</span>';
    return;
  }
  root.innerHTML = list.map(function (row) {
    return `<span class="overview-cycle-chip">${esc(String(row.name))} <b>${esc(String(row.count))}</b></span>`;
  }).join("");
}

function buildSummaryCyclesFromCurrentMonth() {
  const now = new Date();
  let yy = Number(String(now.getFullYear()).slice(-2));
  let mm = now.getMonth() + 1;
  const out = [];
  for (let i = 0; i < 3; i += 1) {
    let y = yy;
    let m = mm - i;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    out.push(`${String(y).padStart(2, "0")}${String(m).padStart(2, "0")}`);
  }
  return out;
}

function extractSummaryPieItems(cycleCounts, cycleOrder) {
  const order = Array.isArray(cycleOrder) ? cycleOrder : [];
  const mapped = order.map(function (cycle, idx) {
    const label = idx === 0 ? `${cycle} (현재)` : `${cycle} (이전${idx})`;
    return { name: label, count: Number(cycleCounts?.[cycle] || 0) };
  });
  return buildPieItems(mapped, 3);
}

function extractSummaryPhasePieItems(phaseTotals) {
  const p = phaseTotals || {};
  return buildPieItems([
    { name: "발생", count: Number(p?.occurred?.total || 0) },
    { name: "처리", count: Number(p?.processed?.total || 0) },
    { name: "잔여", count: Number(p?.remaining?.total || 0) },
  ], 3);
}

function renderSummarySlider() {
  const track = document.getElementById("overviewSummaryTrack");
  const prevBtn = document.getElementById("overviewSummaryPrevBtn");
  const nextBtn = document.getElementById("overviewSummaryNextBtn");
  const hint = document.getElementById("overviewSummaryCycleHint");
  const slides = Array.isArray(summarySliderState.slides) ? summarySliderState.slides : [];
  if (!track || !prevBtn || !nextBtn) return;

  if (!slides.length) {
    track.innerHTML = '<div class="summary-slide">Summary 데이터가 없습니다.</div>';
    track.style.transform = "translateX(0%)";
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    renderOverviewDonut("overviewSummaryDonut", "overviewSummaryLegend", []);
    return;
  }

  summarySliderState.index = Math.max(0, Math.min(summarySliderState.index, slides.length - 1));

  track.innerHTML = slides.map(function (s) {
    const label = esc(String(s?.label || s?.cycle || "-"));
    const cycle = esc(String(s?.cycle || "-"));
    const total = esc(String(s?.total || 0));
    return `<div class="summary-slide"><span class="summary-slide-main"><b>${label}</b><small>${cycle}</small></span><span class="summary-slide-total">${total}건</span></div>`;
  }).join("");
  track.style.transform = `translateX(-${summarySliderState.index * 100}%)`;

  track.querySelectorAll(".summary-slide").forEach(function (slide, idx) {
    if (idx === summarySliderState.index) {
      slide.classList.add("is-active");
    } else {
      slide.classList.remove("is-active");
    }
  });
  restartCssAnimation(track, "summary-track-shift");

  prevBtn.disabled = summarySliderState.index <= 0;
  nextBtn.disabled = summarySliderState.index >= slides.length - 1;

  const selected = slides[summarySliderState.index];
  renderOverviewDonut("overviewSummaryDonut", "overviewSummaryLegend", extractSummaryPhasePieItems(selected?.phaseTotals || {}));
  if (hint) {
    hint.textContent = `Summary 사이클 ${selected?.cycle || "-"} (${summarySliderState.index + 1}/${slides.length}) · 발생/처리/잔여 분포`;
  }
}

function bindSummarySliderControls() {
  const slider = document.getElementById("overviewSummarySlider");
  const prevBtn = document.getElementById("overviewSummaryPrevBtn");
  const nextBtn = document.getElementById("overviewSummaryNextBtn");
  if (!slider || !prevBtn || !nextBtn) return;

  // 카드 전체 클릭 이동과 충돌하지 않도록 슬라이더 내부 클릭은 버블링 차단
  slider.addEventListener("click", function (ev) { ev.stopPropagation(); });
  slider.addEventListener("keydown", function (ev) { ev.stopPropagation(); });

  prevBtn.addEventListener("click", function (ev) {
    ev.stopPropagation();
    if (summarySliderState.index <= 0) return;
    summarySliderState.index -= 1;
    renderSummarySlider();
  });
  nextBtn.addEventListener("click", function (ev) {
    ev.stopPropagation();
    if (summarySliderState.index >= summarySliderState.slides.length - 1) return;
    summarySliderState.index += 1;
    renderSummarySlider();
  });

  slider.addEventListener("mouseenter", function () {
    slider.classList.add("is-hovered");
  });
  slider.addEventListener("mouseleave", function () {
    slider.classList.remove("is-hovered");
  });
}

async function refreshOverviewQaPies() {
  try {
    const recentDays = Number(overviewRecentRangeState.days || 0);
    const [recentRes, summaryCycleRes] = await Promise.all([
      fetch(`/api/stats/company-defects/status-summary?days=${encodeURIComponent(String(recentDays))}`),
      fetch("/api/stats/closing-summary/cycle-counts"),
    ]);

    const recentData = await recentRes.json();
    const summaryCycleData = await summaryCycleRes.json();
    const summaryCycleItems = extractSummaryCyclePieItems(summaryCycleData);

    renderOverviewDonut("overviewRecentDonut", "overviewRecentLegend", extractRecentPieItems(recentData));
    renderOverviewDonut("overviewSummaryDonut", "overviewSummaryLegend", summaryCycleItems);
    renderSummaryCycleChips(summaryCycleItems);

    const recentHint = document.getElementById("overviewRecentRangeHint");
    if (recentHint) {
      const sd = String(recentData?.start_date || "");
      const ed = String(recentData?.end_date || "");
      if (recentDays <= 0) {
        recentHint.textContent = "DefectList_Raw 전체 기간 Status Top 분포입니다. 선택 시 최근 이슈 차트로 이동합니다.";
      } else {
        recentHint.textContent = sd && ed
          ? `최근 ${recentDays}일(${sd} ~ ${ed}) Status Top 분포입니다. 선택 시 최근 이슈 차트로 이동합니다.`
          : `최근 ${recentDays}일 Status Top 분포입니다.`;
      }
    }

    const summaryHint = document.getElementById("overviewSummaryCycleHint");
    if (summaryHint) {
      summaryHint.textContent = summaryCycleItems.length
        ? `DefectList_Raw 마감 사이클 전체(${summaryCycleItems.map(function (x) { return x.name; }).join(", ")}) 분포입니다.`
        : "DefectList_Raw 마감 사이클 데이터가 없습니다.";
    }
  } catch (e) {
    const err = String(e || "");
    const recentLegend = document.getElementById("overviewRecentLegend");
    const summaryLegend = document.getElementById("overviewSummaryLegend");
    if (recentLegend) recentLegend.innerHTML = `<li class="hint">최근 이슈 차트 조회 실패: ${esc(err)}</li>`;
    if (summaryLegend) summaryLegend.innerHTML = `<li class="hint">Summary 차트 조회 실패: ${esc(err)}</li>`;
  }
}

function bindNoticeTabControls() {
  const tabs = document.getElementById("noticeTabs");
  if (tabs) {
    tabs.addEventListener("click", function (ev) {
      const tab = ev.target instanceof Element ? ev.target.closest(".notice-tab") : null;
      if (!tab) return;
      noticeState.activeFilter = String(tab.getAttribute("data-filter") || "all");
      tabs.querySelectorAll(".notice-tab").forEach(function (button) {
        button.classList.toggle("active", button === tab);
      });
      renderNoticeList();
    });
  }
  document.getElementById("noticeRefreshBtn")?.addEventListener("click", refreshNoticeCard);
  document.getElementById("noticeList")?.addEventListener("click", function (ev) {
    const item = ev.target instanceof Element ? ev.target.closest(".notice-item") : null;
    if (!item) return;
    const idx = Number(item.getAttribute("data-notice-idx"));
    if (!Number.isNaN(idx)) openUpdateDetailModal(idx);
  });
  document.getElementById("noticeList")?.addEventListener("keydown", function (ev) {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const item = ev.target instanceof Element ? ev.target.closest(".notice-item") : null;
    if (!item) return;
    ev.preventDefault();
    const idx = Number(item.getAttribute("data-notice-idx"));
    if (!Number.isNaN(idx)) openUpdateDetailModal(idx);
  });
}

function bindOverviewRecentRangeControls() {
  const root = document.getElementById("overviewRecentRangeTabs");
  if (!root) return;
  root.addEventListener("click", function (ev) {
    const tab = ev.target instanceof Element ? ev.target.closest(".overview-range-tab") : null;
    if (!(tab instanceof HTMLButtonElement)) return;
    ev.stopPropagation();
    const days = Number(tab.getAttribute("data-days") || "0");
    overviewRecentRangeState.days = Number.isFinite(days) ? days : 0;

    root.querySelectorAll(".overview-range-tab").forEach(function (btn) {
      btn.classList.toggle("active", btn === tab);
    });

    refreshOverviewQaPies();
  });
}

function bindOverviewCardNavigation() {
  document.querySelectorAll(".overview-nav-card[data-link]").forEach(function (el) {
    const link = String(el.getAttribute("data-link") || "").trim();
    if (!link) return;
    el.addEventListener("click", function () {
      window.location.href = link;
    });
    el.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      ev.preventDefault();
      window.location.href = link;
    });
  });
}

document.getElementById("updateDetailCloseBtn")?.addEventListener("click", closeUpdateDetailModal);

document.getElementById("updateDetailModal")?.addEventListener("click", function (ev) {
  const target = ev.target;
  if (!(target instanceof Element)) return;
  if (target.getAttribute("data-modal-close") === "true") {
    closeUpdateDetailModal();
  }
});

document.addEventListener("keydown", function (ev) {
  if (ev.key !== "Escape") return;
  const modal = document.getElementById("updateDetailModal");
  if (!modal || modal.hidden) return;
  closeUpdateDetailModal();
});


const SHORTCUT_STORAGE_KEY = "cci_shortcuts_v1";
const DEFAULT_SHORTCUTS = [
  {
    id: "fixed-defectlist",
    name: "[EU]_DefectList",
    url: "https://docs.google.com/spreadsheets/d/1vEiIZM--JUzh7WYX8DLTqi8dysplrOY7n20nNT18eL8/edit?gid=407769955#gid=407769955",
    fixed: true,
  },
  {
    id: "fixed-fulltc",
    name: "[EU]_Full_TC",
    url: "https://docs.google.com/spreadsheets/d/1UP6ruF4DlPwzNgVuEastRcxoky1SihNlsqIWMTIkQuI/edit?gid=529386068#gid=529386068&fvid=1436018023",
    fixed: true,
  },
  {
    id: "fixed-sanity-check",
    name: "[EU]_Sanity/Check",
    url: "https://docs.google.com/spreadsheets/d/11bv1DKhFLLIHXiq3JChsJrqoyU4BBats53-fVoteVxw/edit?gid=1196102142#gid=1196102142",
    fixed: true,
  },
  {
    id: "fixed-spec-sheet",
    name: "[EU]_사양시트",
    url: "https://docs.google.com/spreadsheets/d/1ldoiVk1mc3dwpFhK4zh0aV15YFtFyCYSmFr9A8Tp35s/edit?gid=636517542#gid=636517542",
    fixed: true,
  },
  {
    id: "fixed-asset-manage",
    name: "[EU]_단말관리",
    url: "https://docs.google.com/spreadsheets/d/1anqfp6zx7PJrsUmvhqhiuvK4ptwCXX_Ilnl89WccfBI/edit?gid=301763855#gid=301763855",
    fixed: true,
  },
  {
    id: "fixed-schedule",
    name: "[EU]_일정관리",
    url: "https://docs.google.com/spreadsheets/d/1QNRyS2gj4_QEigFiQGVaytGaISJjDF3e0N5C4Jf-v7k/edit?gid=0#gid=0",
    fixed: true,
  },
  {
    id: "fixed-account",
    name: "[EU]_계정관리",
    url: "https://docs.google.com/spreadsheets/d/16jL3vexlJx0hav91Z603QGd-dJ34UjNpfapHASmoV3o/edit?gid=1838534105#gid=1838534105",
    fixed: true,
  },
];
const REQUIRED_SHORTCUT_IDS = new Set(DEFAULT_SHORTCUTS.map(function (x) { return String(x.id); }));

const shortcutState = {
  items: [],
  windows: new Map(),
  zIndex: 20,
  nextOffset: 0,
  serverSaveTimer: null,
};

function createShortcutId() {
  return `sc_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`;
}

function getShortcutStorageKey() {
  try {
    const email = String(localStorage.getItem("cci_auth_user_email") || "").trim().toLowerCase();
    if (email) return `${SHORTCUT_STORAGE_KEY}:${email}`;
  } catch {}
  return SHORTCUT_STORAGE_KEY;
}

function normalizeShortcutUrl(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  try {
    const u = new URL(text, window.location.origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    // Keep same-origin shortcuts as relative paths for readability.
    if (u.origin === window.location.origin) {
      return `${u.pathname}${u.search}${u.hash}` || "/";
    }
    return u.toString();
  } catch {
    return "";
  }
}

function isSameOriginShortcut(url) {
  const text = String(url || "").trim();
  if (!text) return false;
  try {
    const u = new URL(text, window.location.origin);
    return u.origin === window.location.origin;
  } catch {
    return false;
  }
}

function shouldOpenShortcutExternally(url) {
  return !isSameOriginShortcut(url);
}

function launchShortcut(item, preferWebView) {
  if (!item || !item.url) return;
  if (!preferWebView && !item.webview && shouldOpenShortcutExternally(item.url)) {
    window.open(item.url, "_blank", "noopener,noreferrer");
    return;
  }
  openShortcutWindow(item);
}

function normalizeShortcutItems(items) {
  const loaded = Array.isArray(items) ? items : [];
  try {
    // no-op to keep try/catch behavior consistent with storage reads.
  } catch {
    return [];
  }

  return loaded
    .filter(function (x) {
      return x && typeof x === "object";
    })
    .map(function (x) {
      const name = String(x.name || "").trim();
      const url = normalizeShortcutUrl(x.url);
      return {
        id: String(x.id || createShortcutId()),
        name,
        url,
        fixed: Boolean(x.fixed) || REQUIRED_SHORTCUT_IDS.has(String(x.id || "")),
        webview: Boolean(x.webview),
      };
    })
    .filter(function (x) {
      return x.name && x.url;
    });
}

function withRequiredShortcuts(items) {
  const normalized = normalizeShortcutItems(items);
  const byId = new Map();
  normalized.forEach(function (item) {
    byId.set(String(item.id), item);
  });
  DEFAULT_SHORTCUTS.forEach(function (fixed) {
    byId.set(String(fixed.id), { ...fixed });
  });

  const fixedFirst = DEFAULT_SHORTCUTS.map(function (x) { return byId.get(String(x.id)); }).filter(Boolean);
  const custom = Array.from(byId.values()).filter(function (x) {
    return !REQUIRED_SHORTCUT_IDS.has(String(x.id));
  });
  custom.sort(function (a, b) {
    return String(a.name || "").localeCompare(String(b.name || ""), "ko");
  });
  return fixedFirst.concat(custom);
}

async function loadShortcutState() {
  let localItems = [];
  let localWindows = [];
  try {
    const raw = localStorage.getItem(getShortcutStorageKey());
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.items)) localItems = parsed.items;
      else if (Array.isArray(parsed)) localItems = parsed;
      if (Array.isArray(parsed?.windows)) localWindows = parsed.windows;
    }
  } catch {}

  try {
    const res = await fetch("/api/user/shortcut-state", { credentials: "same-origin" });
    if (res.ok) {
      const data = await res.json();
      return {
        items: withRequiredShortcuts(data?.items || localItems),
        windows: Array.isArray(data?.windows) ? data.windows : localWindows,
      };
    }
  } catch {}

  return {
    items: withRequiredShortcuts(localItems),
    windows: Array.isArray(localWindows) ? localWindows : [],
  };
}

function serializeShortcutWindows() {
  const rows = [];
  shortcutState.windows.forEach(function (entry, id) {
    const el = entry?.el;
    if (!el) return;
    rows.push({
      id,
      left: el.style.left || "",
      top: el.style.top || "",
      width: el.style.width || "",
      height: el.style.height || "",
      is_minimized: el.classList.contains("is-minimized"),
      is_maximized: el.classList.contains("is-maximized"),
      is_snapped_left: el.classList.contains("is-snapped-left"),
      is_snapped_right: el.classList.contains("is-snapped-right"),
    });
  });
  return rows;
}

async function saveShortcutStateToServer() {
  try {
    await fetch("/api/user/shortcut-state", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: shortcutState.items, windows: serializeShortcutWindows() }),
    });
  } catch {}
}

function saveShortcutItems(immediateServerSync) {
  const payload = {
    items: shortcutState.items,
    windows: serializeShortcutWindows(),
  };
  localStorage.setItem(getShortcutStorageKey(), JSON.stringify(payload));
  if (shortcutState.serverSaveTimer) {
    clearTimeout(shortcutState.serverSaveTimer);
    shortcutState.serverSaveTimer = null;
  }
  if (immediateServerSync) {
    saveShortcutStateToServer();
    return;
  }
  shortcutState.serverSaveTimer = setTimeout(function () {
    shortcutState.serverSaveTimer = null;
    saveShortcutStateToServer();
  }, 350);
}

function renderShortcutToolbar() {
  const root = document.getElementById("shortcutToolbarList");
  if (!root) return;
  root.innerHTML = shortcutState.items.map(function (item) {
    const isExternal = shouldOpenShortcutExternally(item.url);
    const suffix = item.webview ? "웹뷰 열기" : (isExternal ? "새 탭 열기" : "웹뷰 열기");
    return `<button type="button" class="sc-tb-shortcut-btn" data-shortcut-action="launch" data-shortcut-id="${esc(item.id)}" title="${esc(item.url)} (${suffix})">${esc(item.name)}</button>`;
  }).join("");
}

function renderShortcutList() {
  const root = document.getElementById("shortcutList");
  if (!root) return;
  if (!shortcutState.items.length) {
    root.innerHTML = '<p class="hint">저장된 바로가기가 없습니다.</p>';
    return;
  }

  root.innerHTML = shortcutState.items
    .map(function (item) {
      return `
        <article class="shortcut-item" data-shortcut-id="${esc(item.id)}">
          <div class="shortcut-item-top">
            <strong class="shortcut-item-title">${esc(item.name)}</strong>
          </div>
          <p class="shortcut-item-url">${esc(item.url)}</p>
          <div class="shortcut-item-actions">
            ${item.webview
              ? `<button type="button" data-shortcut-action="launch" data-shortcut-id="${esc(item.id)}">웹뷰로 열기</button>
            <button type="button" class="btn-secondary" data-shortcut-action="open-newtab" data-shortcut-id="${esc(item.id)}">새 탭으로 열기</button>`
              : `<button type="button" data-shortcut-action="launch" data-shortcut-id="${esc(item.id)}">${shouldOpenShortcutExternally(item.url) ? "새 탭으로 열기" : "열기"}</button>
            <button type="button" class="btn-secondary" data-shortcut-action="open-webview" data-shortcut-id="${esc(item.id)}">웹뷰로 열기</button>`}
            ${item.fixed ? '<span class="hint">고정 링크</span>' : `<button type="button" class="btn-secondary" data-shortcut-action="edit" data-shortcut-id="${esc(item.id)}">수정</button>
            <button type="button" class="btn-ghost" data-shortcut-action="delete" data-shortcut-id="${esc(item.id)}">삭제</button>`}
          </div>
        </article>
      `;
    })
    .join("");
}

function bringWindowToFront(winEl) {
  shortcutState.zIndex += 1;
  winEl.style.zIndex = String(shortcutState.zIndex);
}

function closeShortcutWindow(id) {
  const found = shortcutState.windows.get(id);
  if (!found) return;
  found.el.remove();
  shortcutState.windows.delete(id);
  saveShortcutItems();
}

function openShortcutWindow(item, restoreState) {
  const desktop = document.getElementById("shortcutDesktop");
  if (!desktop) return;

  const existing = shortcutState.windows.get(item.id);
  if (existing) {
    const winEl = existing.el;
    winEl.classList.remove("is-minimized", "is-maximized", "is-snapped-left", "is-snapped-right");
    if (existing._savedRect) {
      winEl.style.left = existing._savedRect.left;
      winEl.style.top = existing._savedRect.top;
      winEl.style.width = existing._savedRect.width;
      winEl.style.height = existing._savedRect.height;
    }
    const minBtn = winEl.querySelector('[data-win-action="minimize"]');
    if (minBtn) minBtn.textContent = "_";
    bringWindowToFront(winEl);
    return;
  }

  const el = document.createElement("article");
  el.className = "shortcut-window";
  el.setAttribute("data-win-id", item.id);

  const offset = shortcutState.nextOffset % 8;
  shortcutState.nextOffset += 1;
  el.style.left = `${20 + offset * 28}px`;
  el.style.top  = `${20 + offset * 26}px`;

  el.innerHTML = `
    <header class="shortcut-window-head" data-win-drag="true">
      <div class="shortcut-window-title">${esc(item.name)}</div>
      <div class="shortcut-window-actions">
        <button type="button" class="sc-win-btn" data-win-action="external" title="새 탭으로 열기">&#11040;</button>
        <button type="button" class="sc-win-btn" data-win-action="snap-left"  title="왼쪽 반반">&#9001;</button>
        <button type="button" class="sc-win-btn" data-win-action="snap-right" title="오른쪽 반반">&#9002;</button>
        <button type="button" class="sc-win-btn" data-win-action="maximize"   title="최대화">&#9633;</button>
        <button type="button" class="sc-win-btn" data-win-action="minimize"   title="최소화">_</button>
        <button type="button" class="sc-win-btn sc-win-close" data-win-action="close" title="닫기">&times;</button>
      </div>
    </header>
    <div class="shortcut-window-body">
      <iframe src="${esc(item.url)}" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-top-navigation"></iframe>
    </div>
  `;

  desktop.appendChild(el);
  bringWindowToFront(el);

  const entry = { el, item, _savedRect: null };
  shortcutState.windows.set(item.id, entry);

  if (restoreState && typeof restoreState === "object") {
    if (restoreState.left) el.style.left = String(restoreState.left);
    if (restoreState.top) el.style.top = String(restoreState.top);
    if (restoreState.width) el.style.width = String(restoreState.width);
    if (restoreState.height) el.style.height = String(restoreState.height);
    el.classList.toggle("is-minimized", !!restoreState.is_minimized);
    el.classList.toggle("is-maximized", !!restoreState.is_maximized);
    el.classList.toggle("is-snapped-left", !!restoreState.is_snapped_left);
    el.classList.toggle("is-snapped-right", !!restoreState.is_snapped_right);
    const minBtn = el.querySelector('[data-win-action="minimize"]');
    if (minBtn) minBtn.textContent = restoreState.is_minimized ? "\u25A1" : "_";
  }

  function saveCurRect() {
    if (el.classList.contains("is-maximized") ||
        el.classList.contains("is-snapped-left") ||
        el.classList.contains("is-snapped-right")) return;
    entry._savedRect = {
      left: el.style.left, top: el.style.top,
      width: el.style.width || "", height: el.style.height || ""
    };
  }

  function restoreSaved() {
    el.classList.remove("is-maximized", "is-snapped-left", "is-snapped-right");
    el.style.resize = "";
    if (entry._savedRect) {
      el.style.left   = entry._savedRect.left;
      el.style.top    = entry._savedRect.top;
      el.style.width  = entry._savedRect.width;
      el.style.height = entry._savedRect.height;
    }
  }

  el.addEventListener("mousedown", function () { bringWindowToFront(el); });

  el.querySelector('[data-win-action="external"]')?.addEventListener("click", function () {
    window.open(item.url, "_blank", "noopener,noreferrer");
  });

  el.querySelector('[data-win-action="close"]')?.addEventListener("click", function () {
    closeShortcutWindow(item.id);
  });

  el.querySelector('[data-win-action="minimize"]')?.addEventListener("click", function (ev) {
    const btn = ev.currentTarget;
    const minimized = el.classList.toggle("is-minimized");
    btn.textContent = minimized ? "\u25A1" : "_";
    saveShortcutItems();
  });

  el.querySelector('[data-win-action="maximize"]')?.addEventListener("click", function (ev) {
    const btn = ev.currentTarget;
    if (el.classList.contains("is-maximized")) {
      restoreSaved();
      btn.title = "최대화";
    } else {
      saveCurRect();
      el.classList.remove("is-snapped-left", "is-snapped-right", "is-minimized");
      el.classList.add("is-maximized");
      btn.title = "복원";
    }
    saveShortcutItems();
  });

  el.querySelector('[data-win-action="snap-left"]')?.addEventListener("click", function () {
    if (el.classList.contains("is-snapped-left")) { restoreSaved(); return; }
    saveCurRect();
    el.classList.remove("is-maximized", "is-snapped-right", "is-minimized");
    el.classList.add("is-snapped-left");
    saveShortcutItems();
  });

  el.querySelector('[data-win-action="snap-right"]')?.addEventListener("click", function () {
    if (el.classList.contains("is-snapped-right")) { restoreSaved(); return; }
    saveCurRect();
    el.classList.remove("is-maximized", "is-snapped-left", "is-minimized");
    el.classList.add("is-snapped-right");
    saveShortcutItems();
  });

  const head = el.querySelector(".shortcut-window-head");
  let dragging = false;
  let startX = 0, startY = 0, baseLeft = 0, baseTop = 0;

  head?.addEventListener("mousedown", function (ev) {
    if (!(ev.target instanceof Element)) return;
    if (ev.target.closest("button")) return;
    // 최대화/스냅 상태에서 드래그 시작하면 일반 모드로 복원
    if (el.classList.contains("is-maximized") ||
        el.classList.contains("is-snapped-left") ||
        el.classList.contains("is-snapped-right")) {
      restoreSaved();
      el.querySelector('[data-win-action="maximize"]') && (el.querySelector('[data-win-action="maximize"]').title = "최대화");
    }
    dragging = true;
    const rect = el.getBoundingClientRect();
    const hostRect = desktop.getBoundingClientRect();
    startX = ev.clientX;
    startY = ev.clientY;
    baseLeft = rect.left - hostRect.left;
    baseTop  = rect.top  - hostRect.top;
    bringWindowToFront(el);
    ev.preventDefault();
  });

  document.addEventListener("mousemove", function (ev) {
    if (!dragging) return;
    const hostRect = desktop.getBoundingClientRect();
    const width  = el.offsetWidth;
    const height = el.offsetHeight;
    const nextLeft = baseLeft + (ev.clientX - startX);
    const nextTop  = baseTop  + (ev.clientY - startY);
    const maxLeft  = Math.max(0, hostRect.width  - width);
    const maxTop   = Math.max(0, hostRect.height - 42);
    el.style.left = `${Math.max(0, Math.min(nextLeft, maxLeft))}px`;
    el.style.top  = `${Math.max(0, Math.min(nextTop,  maxTop ))}px`;
  });

  document.addEventListener("mouseup", function () {
    if (!dragging) return;
    dragging = false;
    saveShortcutItems();
  });

  saveShortcutItems();
}

function setShortcutForm(item) {
  const idEl = document.getElementById("shortcutEditId");
  const nameEl = document.getElementById("shortcutNameInput");
  const urlEl = document.getElementById("shortcutUrlInput");
  if (!idEl || !nameEl || !urlEl) return;
  if (!item) {
    idEl.value = "";
    nameEl.value = "";
    urlEl.value = "";
    return;
  }
  idEl.value = item.id;
  nameEl.value = item.name;
  urlEl.value = item.url;
}

function closeAllShortcutWindows() {
  const ids = Array.from(shortcutState.windows.keys());
  ids.forEach(function (id) {
    closeShortcutWindow(id);
  });
}

async function initShortcuts() {
  const form = document.getElementById("shortcutForm");
  const list = document.getElementById("shortcutList");
  if (!form || !list) return;

  const loaded = await loadShortcutState();
  shortcutState.items = withRequiredShortcuts(loaded.items || []);
  saveShortcutItems();
  renderShortcutList();
  renderShortcutToolbar();

  // Restore previously opened windows after relogin/page navigation.
  const savedWindows = Array.isArray(loaded?.windows) ? loaded.windows : [];
  savedWindows.forEach(function (win) {
    const item = shortcutState.items.find(function (x) { return String(x.id) === String(win?.id || ""); });
    if (item) openShortcutWindow(item, win);
  });

  // 관리 패널 토글
  document.getElementById("shortcutManageToggleBtn")?.addEventListener("click", function () {
    const panel = document.getElementById("shortcutManagerPanel");
    if (!panel) return;
    panel.hidden = !panel.hidden;
    this.textContent = panel.hidden ? "\u2699 관리" : "\u2699 관리 닫기";
  });

  document.getElementById("shortcutManagerCloseBtn")?.addEventListener("click", function () {
    const panel = document.getElementById("shortcutManagerPanel");
    if (panel) panel.hidden = true;
    const btn = document.getElementById("shortcutManageToggleBtn");
    if (btn) btn.textContent = "\u2699 관리";
  });
  // 툴바 바로가기 버튼 클릭 위임 (한 번만 등록)
  const toolbarList = document.getElementById("shortcutToolbarList");
  toolbarList?.addEventListener("click", function (ev) {
    const btn = ev.target.closest("[data-shortcut-action='launch']");
    if (!btn) return;
    const id = String(btn.getAttribute("data-shortcut-id") || "");
    const item = shortcutState.items.find(function (x) { return x.id === id; });
    if (item) launchShortcut(item, false);
  });
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    const editId = String(document.getElementById("shortcutEditId")?.value || "").trim();
    const name = String(document.getElementById("shortcutNameInput")?.value || "").trim();
    const url = normalizeShortcutUrl(document.getElementById("shortcutUrlInput")?.value || "");

    if (!name) {
      toast("이름을 입력해 주세요.", "warn");
      return;
    }
    if (!url) {
      toast("URL 형식이 올바르지 않습니다. http/https만 허용됩니다.", "warn");
      return;
    }

    if (editId) {
      const idx = shortcutState.items.findIndex(function (x) { return x.id === editId; });
      if (idx >= 0) {
        if (shortcutState.items[idx].fixed) {
          toast("고정 링크는 수정할 수 없습니다.", "warn");
          return;
        }
        shortcutState.items[idx] = { ...shortcutState.items[idx], name, url };
        closeShortcutWindow(editId);
        toast("바로가기를 수정했습니다.", "ok");
      }
    } else {
      shortcutState.items.push({ id: createShortcutId(), name, url });
      toast("바로가기를 추가했습니다.", "ok");
    }

    saveShortcutItems();
    renderShortcutList();
    renderShortcutToolbar();
    setShortcutForm(null);
  });

  document.getElementById("shortcutResetBtn")?.addEventListener("click", function () {
    setShortcutForm(null);
  });

  document.getElementById("shortcutCloseAllBtn")?.addEventListener("click", function () {
    closeAllShortcutWindows();
  });

  list.addEventListener("click", function (ev) {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    const actionEl = target.closest("[data-shortcut-action]");
    if (!actionEl) return;

    const action = String(actionEl.getAttribute("data-shortcut-action") || "");
    const id = String(actionEl.getAttribute("data-shortcut-id") || "");
    const item = shortcutState.items.find(function (x) { return x.id === id; });
    if (!item) return;

    if (action === "launch") {
      launchShortcut(item, false);
      return;
    }
    if (action === "open-webview") {
      openShortcutWindow(item);
      return;
    }
    if (action === "open-newtab") {
      if (item.url) window.open(item.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (action === "edit") {
      setShortcutForm(item);
      const panel = document.getElementById("shortcutManagerPanel");
      if (panel) panel.hidden = false;
      const btn = document.getElementById("shortcutManageToggleBtn");
      if (btn) btn.textContent = "\u2699 관리 닫기";
      return;
    }
    if (action === "delete") {
      if (item.fixed) {
        toast("고정 링크는 삭제할 수 없습니다.", "warn");
        return;
      }
      if (!confirm(`'${item.name}' 바로가기를 삭제할까요?`)) return;
      shortcutState.items = shortcutState.items.filter(function (x) { return x.id !== id; });
      closeShortcutWindow(id);
      saveShortcutItems();
      renderShortcutList();
      renderShortcutToolbar();
      setShortcutForm(null);
      toast("바로가기를 삭제했습니다.", "ok");
    }
  });
}

refreshOverviewQaPies();
refreshNoticeCard();
refreshFloatingLogout();
initShortcuts();
bindOverviewCardNavigation();
bindSummarySliderControls();
bindOverviewRecentRangeControls();
bindNoticeTabControls();
setInterval(refreshOverviewQaPies, 60000);
setInterval(refreshNoticeCard, 60000);
window.addEventListener("beforeunload", function () { saveShortcutItems(true); });

// ── 뷰 전환: 개요 ↔ 바로가기 ──────────────────────────────
function showView(view) {
  const mainContent = document.getElementById("overviewMainContent");
  const shortcutPage = document.getElementById("shortcutPage");
  if (view === "shortcuts") {
    if (mainContent) mainContent.hidden = true;
    if (shortcutPage) shortcutPage.hidden = false;
    history.replaceState(null, "", "/#shortcutManagerSection");
  } else {
    if (mainContent) mainContent.hidden = false;
    if (shortcutPage) shortcutPage.hidden = true;
    history.replaceState(null, "", "/");
  }
}

document.querySelectorAll('[data-view="shortcuts"]').forEach(function (el) {
  el.addEventListener("click", function (ev) {
    ev.preventDefault();
    showView("shortcuts");
  });
});

document.getElementById("shortcutBackBtn")?.addEventListener("click", function () {
  showView("overview");
});

if (location.hash === "#shortcutManagerSection") {
  showView("shortcuts");
}
