function esc(value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

(function () {
	const memberBody = document.getElementById("memberRows");
	const memberDetailBody = document.getElementById("memberDetailBreakdownBody");
	const assetDeleteRequestBody = document.getElementById("assetDeleteRequestRows");
	const assetDeletedBody = document.getElementById("assetDeletedRows");
	const assetRejectedBody = document.getElementById("assetRejectedRows");
	const decisionQueueBody = document.getElementById("decisionQueueRows");
	const decisionQueueCheckAll = document.getElementById("decisionQueueCheckAll");
	const decisionSelectedCount = document.getElementById("decisionSelectedCount");
	const decisionTotalCount = document.getElementById("decisionTotalCount");
	const decisionSelectedOnlyCount = document.getElementById("decisionSelectedOnlyCount");
	const decisionActionableCount = document.getElementById("decisionActionableCount");
	const decisionBulkRejectReasonInput = document.getElementById("decisionBulkRejectReason");
	const decisionApplyBtn = document.getElementById("decisionApplyBtn");
	const decisionWithdrawSelectedBtn = document.getElementById("decisionWithdrawSelectedBtn");
	const memberGameAccessHeader = document.getElementById("memberGameAccessHeader");
	const memberEditGameAccessField = document.getElementById("memberEditGameAccessField");
	const memberEditGameAccessInput = document.getElementById("memberEditGameAccess");
	const memberEditModal = document.getElementById("memberEditModal");
	const memberEditForm = document.getElementById("memberEditForm");
	const memberPasswordForm = document.getElementById("memberPasswordForm");
	const adminMemberSearchInput = document.getElementById("adminMemberSearchInput");
	const adminMemberStatusFilter = document.getElementById("adminMemberStatusFilter");
	const adminMemberRefreshBtn = document.getElementById("adminMemberRefreshBtn");
	const adminMemberResultCount = document.getElementById("adminMemberResultCount");
	const adminApproveAllPendingBtn = document.getElementById("adminApproveAllPendingBtn");
	const adminPendingMemberQueue = document.getElementById("adminPendingMemberQueue");
	const adminMemberStatTotal = document.getElementById("adminMemberStatTotal");
	const adminMemberStatPending = document.getElementById("adminMemberStatPending");
	const adminMemberStatApproved = document.getElementById("adminMemberStatApproved");
	const adminMemberStatBlocked = document.getElementById("adminMemberStatBlocked");
	const adminCurrentUser = document.getElementById("adminCurrentUser");
	const adminGameAccess = document.getElementById("adminGameAccess");
	const adminMainGrid = document.getElementById("adminMainGrid");
	if (!memberBody) return;
	const activityLogBody = document.getElementById("activityLogRows");
	const adminIssueSearchInput = document.getElementById("adminIssueSearchInput");
	const adminIssueAuthorFilter = document.getElementById("adminIssueAuthorFilter");
	const adminIssueStatusFilter = document.getElementById("adminIssueStatusFilter");
	const adminIssueSortFilter = document.getElementById("adminIssueSortFilter");
	const adminIssueStartDate = document.getElementById("adminIssueStartDate");
	const adminIssueEndDate = document.getElementById("adminIssueEndDate");
	const adminIssueRefreshBtn = document.getElementById("adminIssueRefreshBtn");
	const adminIssueResetBtn = document.getElementById("adminIssueResetBtn");
	const adminIssueExportBtn = document.getElementById("adminIssueExportBtn");
	const adminIssueRangeButtons = Array.from(document.querySelectorAll(".admin-issue-range-btn"));
	const adminIssueResultCount = document.getElementById("adminIssueResultCount");
	const adminIssuePeriodHint = document.getElementById("adminIssuePeriodHint");
	const adminIssueSourceHint = document.getElementById("adminIssueSourceHint");
	const adminIssueUpdatedHint = document.getElementById("adminIssueUpdatedHint");
	const adminIssuePerfPanel = document.getElementById("adminIssuePerfPanel");
	const adminIssuePerfLevelBadge = document.getElementById("adminIssuePerfLevelBadge");
	const adminIssuePerfMeta = document.getElementById("adminIssuePerfMeta");
	const adminIssuePerfEndpointCards = document.getElementById("adminIssuePerfEndpointCards");
	const adminIssuePerfWindowButtons = Array.from(document.querySelectorAll(".admin-issue-perf-window-btn"));
	const adminIssueQuickMembers = document.getElementById("adminIssueQuickMembers");
	const adminCompanyMemberInput = document.getElementById("adminCompanyMemberInput");
	const adminCompanyMemberList = document.getElementById("adminCompanyMemberList");
	const adminCompanyMemberAddBtn = document.getElementById("adminCompanyMemberAddBtn");
	const adminCompanyMemberRemoveBtn = document.getElementById("adminCompanyMemberRemoveBtn");
	const adminCompanyMemberHint = document.getElementById("adminCompanyMemberHint");
	const adminIssuePodium = document.getElementById("adminIssuePodium");
	const adminIssueSummaryVisual = document.getElementById("adminIssueSummaryVisual");
	const adminIssueMemberRows = document.getElementById("adminIssueMemberRows");
	const adminIssueRows = document.getElementById("adminIssueRows");
	const adminIssueDetailCard = document.getElementById("adminIssueDetailCard");
	const adminIssueDetailCount = document.getElementById("adminIssueDetailCount");
	const adminIssueDetailToggleBtn = document.getElementById("adminIssueDetailToggleBtn");
	const adminIssueLoadMoreBtn = document.getElementById("adminIssueLoadMoreBtn");
	const adminIssueStatTotal = document.getElementById("adminIssueStatTotal");
	const adminIssueStatMembers = document.getElementById("adminIssueStatMembers");
	const adminIssueStatPending = document.getElementById("adminIssueStatPending");
	const adminIssueStatClosed = document.getElementById("adminIssueStatClosed");
	const requestDetailModal = document.getElementById("requestDetailModal");
	const requestDetailTitle = document.getElementById("requestDetailTitle");
	const requestDetailList = document.getElementById("requestDetailList");
	const memberAddModal = document.getElementById("memberAddModal");
	const memberAddForm = document.getElementById("memberAddForm");
	const adminMemberAddBtn = document.getElementById("adminMemberAddBtn");
	const memberAddPhoneInput = document.getElementById("memberAddPhone");
	const memberAddBirthInput = document.getElementById("memberAddBirth");
	const memberAddTitleInput = document.getElementById("memberAddTitle");
	const memberAddPostcodeInput = document.getElementById("memberAddPostcode");
	const memberAddAddressInput = document.getElementById("memberAddAddress");
	const memberAddAddressDetailInput = document.getElementById("memberAddAddressDetail");
	const memberAddSearchAddressBtn = document.getElementById("memberAddSearchAddressBtn");
	const ADMIN_SECTION_IDS = ["adminPeopleTab", "adminIssueTab", "adminAssetApprovalTab", "adminActivityLogTab", "adminAssetDeletedTab", "adminAssetRejectedTab"];
	const GAME_ACCESS_MANAGER_EMAIL = "hiss0723@poliot.co.kr";
	let pendingDeleteRequests = [];
	let activityLogItems = [];
	let preferredDecisionId = "";
	let currentAdminEmail = "";
	let canManageGameAccess = false;
	let rawMemberItems = [];
	let adminIssueSearchTimer = 0;
	let adminIssueDetailLimit = 120;
	let adminIssueDetailOffset = 0;
	let adminIssueDetailCollapsed = false;
	let adminIssueHasLoaded = false;
	let adminIssueNeedsRefresh = true;
	let adminIssueLastUpdatedAt = "";
	let adminIssuePerfBadgeText = "";
	let adminIssuePerfWindowSec = 60;
	let adminIssuePerfWarnMs = 800;
	let adminIssuePerfInfoMs = 250;
	let adminIssuePerfLevel = "normal";
	let adminIssueAutoRefreshTimer = 0;
	let adminIssueSummaryAbortController = null;
	let adminIssueDetailAbortController = null;
	let adminIssueRequestToken = 0;
	let adminIssueRowRenderToken = 0;
	const ADMIN_ISSUE_RESPONSE_CACHE_TTL_MS = 15000;
	const ADMIN_ISSUE_DETAIL_STEP = 120;
	const ADMIN_ISSUE_ROW_CHUNK_SIZE = 40;
	const ADMIN_ISSUE_POLL_WARN_MS = 20000;
	const ADMIN_ISSUE_POLL_INFO_MS = 40000;
	const ADMIN_ISSUE_POLL_NORMAL_MS = 60000;
	const adminIssueSummaryCache = new Map();
	const adminIssueDetailCache = new Map();

	const CORE_ADMINS = new Set(["hiss0723@poliot.co.kr"]);
	const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
	const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,100}$/;
	const PHONE_REGEX = /^(?:\+?\d[\d\-\s]{7,18}\d)$/;
	const BIRTH_REGEX = /^\d{4}-\d{2}-\d{2}$/;
	const PASSWORD_RULE_TEXT = "비밀번호는 8~100자이며, 영문/숫자/특수문자를 각각 1개 이상 포함해야 합니다.";
	const PHONE_RULE_TEXT = "전화번호 형식이 올바르지 않습니다. 예: 010-1234-5678";
	const BIRTH_RULE_TEXT = "생년월일 형식이 올바르지 않습니다. YYYY-MM-DD 형식으로 입력해 주세요.";

	function getMemberTableColumnCount() {
		return canManageGameAccess ? 9 : 8;
	}

	function syncGameAccessVisibility() {
		if (memberGameAccessHeader) {
			memberGameAccessHeader.hidden = !canManageGameAccess;
		}
		if (memberEditGameAccessField) {
			memberEditGameAccessField.hidden = !canManageGameAccess;
		}
		if (memberEditGameAccessInput && !canManageGameAccess) {
			memberEditGameAccessInput.checked = false;
			memberEditGameAccessInput.disabled = true;
		} else if (memberEditGameAccessInput) {
			memberEditGameAccessInput.disabled = false;
		}
	}

	function setDetailSummary(items) {
		if (!memberDetailBody) return;
		const total = items.length;
		const approved = items.filter((x) => Boolean(x.approved)).length;
		const blocked = items.filter((x) => !Boolean(x.can_login)).length;
		const adminCount = items.filter((x) => String(x.role || "").toLowerCase() === "admin").length;

		memberDetailBody.innerHTML = [
			`<tr><td>전체 계정 수</td><td>${total}</td></tr>`,
			`<tr><td>승인된 계정 수</td><td>${approved}</td></tr>`,
			`<tr><td>로그인 차단 계정 수</td><td>${blocked}</td></tr>`,
			`<tr><td>관리자 계정 수</td><td>${adminCount}</td></tr>`,
		].join("");
	}

	function normalizeMemberText(value) {
		return String(value || "").trim().toLowerCase();
	}

	function isValidEmail(value) {
		return EMAIL_REGEX.test(String(value || "").trim().toLowerCase());
	}

	function isValidPassword(value) {
		return PASSWORD_REGEX.test(String(value || ""));
	}

	function isValidPhone(value) {
		const text = String(value || "").trim();
		if (!text) return true;
		return PHONE_REGEX.test(text);
	}

	function isValidBirth(value) {
		const text = String(value || "").trim();
		if (!text) return true;
		if (!BIRTH_REGEX.test(text)) return false;
		const parts = text.split("-");
		if (parts.length !== 3) return false;
		const year = Number(parts[0]);
		const month = Number(parts[1]);
		const day = Number(parts[2]);
		const d = new Date(year, month - 1, day);
		return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
	}

	function normalizePhoneFormat(value) {
		let digits = String(value || "").replace(/\D/g, "");
		if (digits.length > 11) digits = digits.slice(0, 11);
		if (!digits) return "";
		if (digits.startsWith("02")) {
			if (digits.length <= 2) return digits;
			if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
			if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
			return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
		}
		if (digits.length <= 3) return digits;
		if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
		if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
		return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
	}

	function normalizeBirthFormat(value) {
		const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
		if (!digits) return "";
		if (digits.length <= 4) return digits;
		if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
		return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
	}

	function openMemberAddAddressSearch() {
		if (typeof daum === "undefined" || typeof daum.Postcode === "undefined") {
			window.alert("주소 검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.");
			return;
		}
		new daum.Postcode({
			oncomplete: (data) => {
				if (memberAddPostcodeInput) memberAddPostcodeInput.value = String(data?.zonecode || "");
				if (memberAddAddressInput) memberAddAddressInput.value = String(data?.roadAddress || data?.jibunAddress || "");
				if (memberAddAddressDetailInput) {
					memberAddAddressDetailInput.focus();
				}
			},
		}).open();
	}

	function bindMemberAddFieldEnhancements() {
		memberAddPhoneInput?.addEventListener("input", () => {
			memberAddPhoneInput.value = normalizePhoneFormat(memberAddPhoneInput.value);
		});
		memberAddBirthInput?.addEventListener("input", () => {
			memberAddBirthInput.value = normalizeBirthFormat(memberAddBirthInput.value);
		});
		memberAddSearchAddressBtn?.addEventListener("click", openMemberAddAddressSearch);
		memberAddPostcodeInput?.addEventListener("click", openMemberAddAddressSearch);
		memberAddAddressInput?.addEventListener("click", openMemberAddAddressSearch);
	}

	function getFilteredMembers(items) {
		const query = normalizeMemberText(adminMemberSearchInput?.value || "");
		const status = normalizeMemberText(adminMemberStatusFilter?.value || "all") || "all";
		return (items || []).filter((x) => {
			const approved = Boolean(x.approved);
			const canLogin = Boolean(x.can_login);
			const role = normalizeMemberText(x.role || "user");
			if (status === "pending" && approved) return false;
			if (status === "approved" && !approved) return false;
			if (status === "blocked" && canLogin) return false;
			if (status === "admin" && role !== "admin") return false;

			if (!query) return true;
			const haystack = [
				x.email,
				x.name,
				x.title,
				x.phone,
				x.birth,
				x.address,
			].map(normalizeMemberText).join(" ");
			return haystack.includes(query);
		});
	}

	function updateMemberStatCards(items) {
		const total = items.length;
		const pending = items.filter((x) => !Boolean(x.approved)).length;
		const approved = items.filter((x) => Boolean(x.approved)).length;
		const blocked = items.filter((x) => !Boolean(x.can_login)).length;
		if (adminMemberStatTotal) adminMemberStatTotal.textContent = String(total);
		if (adminMemberStatPending) adminMemberStatPending.textContent = String(pending);
		if (adminMemberStatApproved) adminMemberStatApproved.textContent = String(approved);
		if (adminMemberStatBlocked) adminMemberStatBlocked.textContent = String(blocked);
	}

	function renderPendingMemberQueue(items) {
		if (!adminPendingMemberQueue) return;
		const pending = (items || []).filter((x) => !Boolean(x.approved));
		if (!pending.length) {
			adminPendingMemberQueue.innerHTML = '<p class="hint">승인 대기 계정이 없습니다.</p>';
			return;
		}
		adminPendingMemberQueue.innerHTML = pending.map((x) => {
			const email = String(x.email || "").trim().toLowerCase();
			return `
				<div class="admin-pending-member-item">
					<div>
						<strong>${esc(x.name || "-")}</strong>
						<p class="hint">${esc(email || "-")} · ${esc(x.title || "직책 미입력")}</p>
					</div>
					<button type="button" class="btn-approve" data-approve-member="${esc(email)}">승인</button>
				</div>
			`;
		}).join("");
	}

	function applyMemberView(items) {
		const filtered = getFilteredMembers(items);
		renderMembers(filtered);
		if (adminMemberResultCount) {
			adminMemberResultCount.textContent = `조회 결과 ${filtered.length}명`;
		}
		updateMemberStatCards(items);
		renderPendingMemberQueue(items);
	}

	function findMemberByEmail(email) {
		const target = normalizeMemberText(email);
		return rawMemberItems.find((x) => normalizeMemberText(x.email) === target) || null;
	}

	function openMemberEditModal(member) {
		if (!memberEditModal || !member) return;
		document.getElementById("memberEditEmail").value = String(member.email || "").trim().toLowerCase();
		document.getElementById("memberEditName").value = String(member.name || "");
		document.getElementById("memberEditRole").value = String(member.role || "user").toLowerCase() === "admin" ? "admin" : "user";
		document.getElementById("memberEditTitle").value = String(member.title || "");
		document.getElementById("memberEditPhone").value = String(member.phone || "");
		document.getElementById("memberEditBirth").value = String(member.birth || "");
		document.getElementById("memberEditAddress").value = String(member.address || "");
		document.getElementById("memberEditApproved").checked = Boolean(member.approved);
		document.getElementById("memberEditCanLogin").checked = Boolean(member.can_login);
		if (memberEditGameAccessInput) {
			memberEditGameAccessInput.checked = Boolean(member.game_access);
		}
		const passwordInput = document.getElementById("memberPasswordInput");
		if (passwordInput) passwordInput.value = "";
		memberEditModal.hidden = false;
		document.body.classList.add("modal-open");
	}

	function closeMemberEditModal() {
		if (!memberEditModal) return;
		memberEditModal.hidden = true;
		document.body.classList.remove("modal-open");
	}

	function formatDisplayDateTime(value) {
		const text = String(value || "").trim();
		if (!text) return "-";
		const parsed = new Date(text);
		if (!Number.isNaN(parsed.getTime())) {
			const y = String(parsed.getFullYear());
			const m = String(parsed.getMonth() + 1).padStart(2, "0");
			const d = String(parsed.getDate()).padStart(2, "0");
			const hh = String(parsed.getHours()).padStart(2, "0");
			const mm = String(parsed.getMinutes()).padStart(2, "0");
			return `${y}-${m}-${d}, ${hh}:${mm}`;
		}
		const normalized = text.replace("T", " ");
		const m = normalized.match(/^(\d{4})-(\d{2})-(\d{2})[\s]+(\d{2}):(\d{2})/);
		if (m) return `${m[1]}-${m[2]}-${m[3]}, ${m[4]}:${m[5]}`;
		return text;
	}

	function formatMultilineText(value) {
		return esc(String(value || "-")).replace(/\n/g, "<br />");
	}

	function formatDisplayDate(value) {
		const text = String(value || "").trim();
		if (!text) return "-";
		const match = text.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
		if (!match) return text;
		return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
	}

	function defectPriorityBadge(priority) {
		const normalized = String(priority || "").trim();
		const lower = normalized.toLowerCase();
		if (lower === "highest") return '<span class="board-priority-badge priority-high"><i class="fas fa-angle-double-up"></i> Highest</span>';
		if (lower === "high") return '<span class="board-priority-badge priority-high"><i class="fas fa-exclamation-circle"></i> High</span>';
		if (lower === "low") return '<span class="board-priority-badge priority-low"><i class="fas fa-arrow-circle-down"></i> Low</span>';
		if (lower === "lowest") return '<span class="board-priority-badge priority-low"><i class="fas fa-angle-double-down"></i> Lowest</span>';
		return '<span class="board-priority-badge priority-medium"><i class="fas fa-minus-circle"></i> Medium</span>';
	}

	function renderAdminIssueStats(stats) {
		if (adminIssueStatTotal) adminIssueStatTotal.textContent = String(stats?.total_tickets ?? 0);
		if (adminIssueStatMembers) adminIssueStatMembers.textContent = String(stats?.definite_problem ?? 0);
		if (adminIssueStatPending) adminIssueStatPending.textContent = `${Number(stats?.mistake_rate ?? 0).toFixed(1)}%`;
		if (adminIssueStatClosed) adminIssueStatClosed.textContent = Number(stats?.score ?? 0).toFixed(1);
	}

	function formatOneDecimal(value) {
		const num = Number(value ?? 0);
		if (!Number.isFinite(num)) return "0.0";
		return num.toFixed(1);
	}

	function renderAdminIssueAuthorOptions(items) {
		if (!adminIssueAuthorFilter) return;
		const currentValue = String(adminIssueAuthorFilter.value || "").trim();
		const options = Array.isArray(items) ? items : [];
		adminIssueAuthorFilter.innerHTML = [
			'<option value="">전체 리포터</option>',
			...options.map((item) => {
				const value = String(item?.value || item?.name || "").trim();
				const name = String(item?.name || value || "-").trim();
				return `<option value="${esc(value)}">${esc(name)}</option>`;
			}),
		].join("");
		if (currentValue && options.some((item) => String(item?.value || item?.name || "").trim() === currentValue)) {
			adminIssueAuthorFilter.value = currentValue;
		}
	}

	function renderAdminIssueQuickMembers(items) {
		if (!adminIssueQuickMembers) return;
		const options = Array.isArray(items) ? items : [];
		if (!options.length) {
			adminIssueQuickMembers.innerHTML = '<span class="hint">빠른 선택 리포터가 없습니다.</span>';
			return;
		}
		const activeReporter = String(adminIssueAuthorFilter?.value || "").trim();
		adminIssueQuickMembers.innerHTML = [
			`<button type="button" class="admin-issue-chip${activeReporter ? '' : ' active'}" data-reporter="">전체</button>`,
			...options.map((item) => {
				const value = String(item?.value || item?.name || "").trim();
				const name = String(item?.name || value || "-").trim();
				return `<button type="button" class="admin-issue-chip${activeReporter === value ? ' active' : ''}" data-reporter="${esc(value)}">${esc(name)}</button>`;
			})
		].join("");
	}

	function renderAdminIssuePodium(items) {
		if (!adminIssuePodium) return;
		const rows = (Array.isArray(items) ? items : []).filter((item) => Number(item?.rank || 0) > 0).sort((a, b) => Number(a.rank || 999) - Number(b.rank || 999)).slice(0, 3);
		if (!rows.length) {
			adminIssuePodium.innerHTML = '<p class="hint">랭킹 데이터를 표시할 수 없습니다.</p>';
			return;
		}
		adminIssuePodium.innerHTML = rows.map((item, index) => {
			const rank = Number(item?.rank || index + 1);
			const reporter = String(item?.reporter || '-').trim();
			return `
				<button type="button" class="admin-issue-podium-card rank-${rank}" data-reporter="${esc(reporter)}">
					<span class="admin-issue-podium-rank">#${rank}</span>
					<strong>${esc(reporter)}</strong>
					<span>총 ${esc(item?.total_issue ?? 0)}건</span>
					<span>점수 ${formatOneDecimal(item?.score ?? 0)}</span>
					<span>Duplicate ${esc(item?.duplicate ?? 0)} · Not a Bug ${esc(item?.not_a_bug ?? 0)}</span>
				</button>
			`;
		}).join('');
	}

	function renderAdminIssueStatusOptions(items) {
		if (!adminIssueStatusFilter) return;
		const currentValue = String(adminIssueStatusFilter.value || "all").trim().toLowerCase();
		const options = Array.isArray(items) ? items : [];
		adminIssueStatusFilter.innerHTML = [
			'<option value="all">전체 상태</option>',
			...options.map((item) => {
				const value = String(item?.value || "").trim().toLowerCase();
				const label = String(item?.label || value || "-").trim();
				return `<option value="${esc(value)}">${esc(label)}</option>`;
			}),
		].join("");
		if (currentValue !== "all" && options.some((item) => String(item?.value || "").trim().toLowerCase() === currentValue)) {
			adminIssueStatusFilter.value = currentValue;
		}
	}

	function issueStatusBadge(status) {
		const normalized = String(status || "").trim().toLowerCase();
		if (normalized === "resolved" || normalized === "close" || normalized === "closed" || normalized === "done") {
			return `<span class="admin-issue-status-badge approved">${esc(status || "Resolved")}</span>`;
		}
		if (normalized === "in progress") {
			return `<span class="admin-issue-status-badge pending">${esc(status || "In Progress")}</span>`;
		}
		if (normalized === "reopened") {
			return `<span class="admin-issue-status-badge rejected">${esc(status || "Reopened")}</span>`;
		}
		return `<span class="admin-issue-status-badge withdrawn">${esc(status || "Open")}</span>`;
	}

	function applyAdminIssueReporterFilter(reporter) {
		const normalized = String(reporter || "").trim();
		if (adminIssueAuthorFilter) {
			adminIssueAuthorFilter.value = normalized;
		}
		adminIssueDetailLimit = 120;
		adminIssueDetailOffset = 0;
		refreshAdminIssueManagement();
	}

	function toLocalDateInputValue(date) {
		const year = String(date.getFullYear());
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}

	function updateAdminIssueRangeButtons() {
		const today = new Date();
		const todayText = toLocalDateInputValue(today);
		const startValue = String(adminIssueStartDate?.value || "").trim();
		const endValue = String(adminIssueEndDate?.value || "").trim();
		adminIssueRangeButtons.forEach((button) => {
			const range = String(button.getAttribute("data-range") || "").trim();
			let active = false;
			if (range === "all") {
				active = !startValue && !endValue;
			} else if (range === "today") {
				active = startValue === todayText && endValue === todayText;
			} else {
				const days = Number(range || 0);
				if (days > 0) {
					const start = new Date(today);
					start.setDate(today.getDate() - (days - 1));
					active = startValue === toLocalDateInputValue(start) && endValue === todayText;
				}
			}
			button.classList.toggle("active", active);
		});
	}

	function setAdminIssueDateRange(range) {
		const today = new Date();
		const todayText = toLocalDateInputValue(today);
		if (!adminIssueStartDate || !adminIssueEndDate) return;
		if (range === "all") {
			adminIssueStartDate.value = "";
			adminIssueEndDate.value = "";
		} else if (range === "today") {
			adminIssueStartDate.value = todayText;
			adminIssueEndDate.value = todayText;
		} else {
			const days = Number(range || 0);
			const start = new Date(today);
			start.setDate(today.getDate() - Math.max(days - 1, 0));
			adminIssueStartDate.value = toLocalDateInputValue(start);
			adminIssueEndDate.value = todayText;
		}
		adminIssueDetailLimit = 120;
		adminIssueDetailOffset = 0;
		updateAdminIssueRangeButtons();
		refreshAdminIssueManagement();
	}

	function renderIssueLinkCell(item) {
		const text = String(item?.links || "").trim();
		const url = String(item?.link_url || "").trim();
		if (!url) return esc(text || "-");
		return `<a class="admin-issue-external-link" href="${esc(url)}" target="_blank" rel="noreferrer">${esc(text || url)}</a>`;
	}

	function issueDonutGradient(totalIssue, definiteProblem, duplicate, notABug) {
		const total = Math.max(0, Number(totalIssue ?? 0));
		const important = Math.max(0, Number(definiteProblem ?? 0));
		const dup = Math.max(0, Number(duplicate ?? 0));
		const nab = Math.max(0, Number(notABug ?? 0));
		if (!total) {
			return "conic-gradient(#d8e0ea 0 360deg)";
		}
		const importantDeg = Math.min(360, (important / total) * 360);
		const dupDeg = Math.min(360 - importantDeg, (dup / total) * 360);
		const nabDeg = Math.max(0, 360 - importantDeg - dupDeg);
		const a = importantDeg;
		const b = importantDeg + dupDeg;
		const c = b + nabDeg;
		return `conic-gradient(#0f766e 0 ${a}deg, #f59e0b ${a}deg ${b}deg, #94a3b8 ${b}deg ${c}deg)`;
	}

	function renderAdminIssueSummaryVisual(items, stats) {
		if (!adminIssueSummaryVisual) return;
		const rows = Array.isArray(items) ? items : [];
		if (!rows.length) {
			adminIssueSummaryVisual.innerHTML = '<p class="hint">표시할 인원별 요약 데이터가 없습니다.</p>';
			return;
		}

		const totalCard = `
			<div class="admin-issue-summary-card total">
				<div class="admin-issue-summary-donut" style="background:${issueDonutGradient(stats?.total_issue ?? 0, stats?.definite_problem ?? 0, stats?.duplicate ?? 0, stats?.not_a_bug ?? 0)}">
					<div class="admin-issue-summary-donut-center">
						<strong>${esc(stats?.total_issue ?? 0)}</strong>
						<span>총 티켓</span>
					</div>
				</div>
				<div class="admin-issue-summary-meta">
					<h4>전체 요약</h4>
					<p>중요도 건수 ${esc(stats?.definite_problem ?? 0)}건</p>
					<p>Duplicate ${esc(stats?.duplicate ?? 0)}건 · Not a Bug ${esc(stats?.not_a_bug ?? 0)}건</p>
				</div>
			</div>
		`;

		const memberCards = rows.slice(0, 12).map((item) => {
			const reporter = String(item?.reporter || "").trim();
			const rank = Number(item?.rank ?? 0);
			return `
				<div class="admin-issue-summary-card" data-reporter="${esc(reporter)}">
					<div class="admin-issue-summary-rank">#${rank > 0 ? rank : "-"}</div>
					<div class="admin-issue-summary-donut" style="background:${issueDonutGradient(item?.total_issue ?? 0, item?.definite_problem ?? 0, item?.duplicate ?? 0, item?.not_a_bug ?? 0)}">
						<div class="admin-issue-summary-donut-center">
							<strong>${esc(item?.total_issue ?? 0)}</strong>
							<span>총 갯수</span>
						</div>
					</div>
					<div class="admin-issue-summary-meta">
						<h4>${esc(reporter || "-")}</h4>
						<p>중요도 갯수 ${esc(item?.definite_problem ?? 0)}건</p>
						<p>점수 ${formatOneDecimal(item?.score ?? 0)}</p>
						<button type="button" class="btn-secondary admin-issue-member-filter-btn" data-reporter="${esc(reporter)}">티켓 보기</button>
					</div>
				</div>
			`;
		}).join("");

		adminIssueSummaryVisual.innerHTML = totalCard + memberCards;
	}

	function renderAdminIssueMemberSummary(items, stats) {
		if (!adminIssueMemberRows) return;
		const rows = Array.isArray(items) ? items : [];
		const totals = stats || {};
		if (!rows.length) {
			renderAdminIssueSummaryVisual([], totals);
			adminIssueMemberRows.innerHTML = '<tr><td colspan="15">조회된 인원별 이슈 데이터가 없습니다.</td></tr>';
			return;
		}
		renderAdminIssueSummaryVisual(rows, totals);
		const totalRow = `
			<tr class="admin-issue-total-row">
				<td class="mi-th-rank"><span class="mi-rank-badge">합계</span></td>
				<td>-</td>
				<td>${esc(totals?.total_issue ?? 0)}</td>
				<td>${esc(totals?.duplicate ?? 0)}</td>
				<td>${esc(totals?.not_a_bug ?? 0)}</td>
				<td>${esc(totals?.definite_problem ?? 0)}</td>
				<td>${formatOneDecimal(totals?.mistake_rate ?? 0)}%</td>
				<td>${formatOneDecimal(totals?.highest ?? 0)}</td>
				<td>${formatOneDecimal(totals?.high ?? 0)}</td>
				<td>${formatOneDecimal(totals?.medium ?? 0)}</td>
				<td>${formatOneDecimal(totals?.low ?? 0)}</td>
				<td>${formatOneDecimal(totals?.lowest ?? 0)}</td>
				<td class="mi-score-cell">${formatOneDecimal(totals?.score ?? 0)}</td>
				<td>-</td>
				<td>-</td>
			</tr>
		`;

		adminIssueMemberRows.innerHTML = totalRow + rows.map((item) => {
			const reporter = String(item?.reporter || "").trim();
			const rank = Number(item?.rank ?? 0);
			const rankBadge = rank === 1 ? '<span class="mi-rank-badge mi-rank-gold">🥇 1위</span>'
				: rank === 2 ? '<span class="mi-rank-badge mi-rank-silver">🥈 2위</span>'
				: rank === 3 ? '<span class="mi-rank-badge mi-rank-bronze">🥉 3위</span>'
				: rank > 0 ? `<span class="mi-rank-badge">${rank}위</span>` : '<span class="mi-rank-badge mi-rank-none">-</span>';
			return `
				<tr class="admin-issue-summary-row" data-reporter="${esc(reporter)}">
					<td class="mi-th-rank">${rankBadge}</td>
					<td><button type="button" class="btn-ghost admin-issue-author-link mi-reporter-btn" data-reporter="${esc(reporter)}">${esc(reporter || "-")}</button></td>
					<td>${esc(item?.total_issue ?? 0)}</td>
					<td>${esc(item?.duplicate ?? 0)}</td>
					<td>${esc(item?.not_a_bug ?? 0)}</td>
					<td>${esc(item?.definite_problem ?? 0)}</td>
					<td>${formatOneDecimal(item?.mistake_rate ?? 0)}%</td>
					<td>${formatOneDecimal(item?.highest ?? 0)}</td>
					<td>${formatOneDecimal(item?.high ?? 0)}</td>
					<td>${formatOneDecimal(item?.medium ?? 0)}</td>
					<td>${formatOneDecimal(item?.low ?? 0)}</td>
					<td>${formatOneDecimal(item?.lowest ?? 0)}</td>
					<td class="mi-score-cell">${formatOneDecimal(item?.score ?? 0)}</td>
					<td>${esc(formatDisplayDate(item?.latest_created_at || ""))}</td>
					<td><button type="button" class="btn-secondary admin-issue-member-filter-btn" data-reporter="${esc(reporter)}">보기</button></td>
				</tr>
			`;
		}).join("");

	}

	function buildAdminIssueRowMarkup(item) {
		const keyText = String(item?.key || item?.id || "-").trim();
		const summaryText = String(item?.summary || "-").trim();
		const summaryShort = summaryText.length > 100 ? `${summaryText.slice(0, 97)}...` : summaryText;
		const linkUrl = String(item?.link_url || "").trim();
		const keyMarkup = linkUrl
			? `<a class="admin-issue-external-link" href="${esc(linkUrl)}" target="_blank" rel="noreferrer">${esc(keyText)}</a>`
			: esc(keyText || "-");
		const summaryMarkup = linkUrl
			? `<a class="admin-issue-external-link admin-issue-summary-link" href="${esc(linkUrl)}" target="_blank" rel="noreferrer" title="${esc(summaryText)}">${esc(summaryShort)}</a>`
			: `<span class="admin-issue-summary-text" title="${esc(summaryText)}">${esc(summaryShort || "-")}</span>`;
		return `
			<tr>
				<td class="admin-issue-title-cell">${keyMarkup}</td>
				<td>${esc(item?.reporter || "-")}</td>
				<td>${issueStatusBadge(item?.status || "Open")}</td>
				<td>${defectPriorityBadge(String(item?.priority || "Medium"))}</td>
				<td>${esc(item?.resolution || "-")}</td>
				<td class="admin-issue-content-cell">${summaryMarkup}</td>
				<td>${esc(item?.region || "-")}</td>
				<td>${esc(item?.os || "-")}</td>
				<td>${esc(item?.components || "-")}</td>
				<td>${esc(item?.brand || "-")}</td>
				<td>${esc(item?.affects_versions || "-")}</td>
				<td>${esc(item?.assignee || "-")}</td>
				<td>${esc(formatDisplayDate(item?.created || ""))}</td>
			</tr>
		`;
	}

	function renderAdminIssueRows(items) {
		if (!adminIssueRows) return;
		const rows = Array.isArray(items) ? items : [];
		const renderToken = ++adminIssueRowRenderToken;
		if (!rows.length) {
			adminIssueRows.innerHTML = '<tr><td colspan="13">조회된 티켓이 없습니다.</td></tr>';
			return;
		}
		adminIssueRows.innerHTML = '<tr><td colspan="13">상세 목록을 정리하는 중...</td></tr>';;
		const appendChunk = (startIndex) => {
			if (renderToken !== adminIssueRowRenderToken) return;
			const chunk = rows.slice(startIndex, startIndex + ADMIN_ISSUE_ROW_CHUNK_SIZE);
			if (!chunk.length) return;
			const markup = chunk.map(buildAdminIssueRowMarkup).join("");
			if (startIndex === 0) {
				adminIssueRows.innerHTML = markup;
			} else {
				adminIssueRows.insertAdjacentHTML("beforeend", markup);
			}
			if (startIndex + ADMIN_ISSUE_ROW_CHUNK_SIZE < rows.length) {
				window.requestAnimationFrame(() => appendChunk(startIndex + ADMIN_ISSUE_ROW_CHUNK_SIZE));
			}
		};
		window.requestAnimationFrame(() => appendChunk(0));
	}

	function setAdminIssueDetailCollapsed(collapsed) {
		adminIssueDetailCollapsed = Boolean(collapsed);
		adminIssueDetailCard?.classList.toggle("is-collapsed", adminIssueDetailCollapsed);
		if (adminIssueDetailToggleBtn) {
			adminIssueDetailToggleBtn.textContent = adminIssueDetailCollapsed ? "상세 펼치기" : "상세 접기";
		}
	}

	function getAdminIssueBootstrapData() {
		if (typeof window === "undefined") return {};
		const data = window.__ADMIN_ISSUE_BOOTSTRAP__;
		if (!data || typeof data !== "object") return {};
		return data;
	}

	function buildAdminIssueQueryString(includeDetailLimit = true, includeDetailOffset = false) {
		const params = new URLSearchParams();
		const search = String(adminIssueSearchInput?.value || "").trim();
		const reporter = String(adminIssueAuthorFilter?.value || "").trim();
		const status = String(adminIssueStatusFilter?.value || "all").trim().toLowerCase();
		const sortBy = String(adminIssueSortFilter?.value || "score_desc").trim().toLowerCase();
		const startDate = String(adminIssueStartDate?.value || "").trim();
		const endDate = String(adminIssueEndDate?.value || "").trim();
		if (search) params.set("search", search);
		if (reporter) params.set("reporter", reporter);
		if (status && status !== "all") params.set("status", status);
		if (sortBy && sortBy !== "total_desc") params.set("sort_by", sortBy);
		if (startDate) params.set("start_date", startDate);
		if (endDate) params.set("end_date", endDate);
		if (includeDetailLimit && adminIssueDetailLimit > 0) params.set("detail_limit", String(adminIssueDetailLimit));
		if (includeDetailOffset && adminIssueDetailOffset > 0) params.set("detail_offset", String(adminIssueDetailOffset));
		return params.toString();
	}

	function isAdminIssueTabActive() {
		const tab = document.getElementById("adminIssueTab");
		return Boolean(tab) && !Boolean(tab.hidden);
	}

	function updateAdminIssueDetailMeta(data) {
		const totalCount = Number(data?.detail_total_count ?? 0);
		const shownCount = Number(data?.detail_shown_count ?? data?.detail_returned_count ?? 0);
		const hasMore = Boolean(data?.detail_has_more);
		if (adminIssueDetailCount) {
			adminIssueDetailCount.textContent = hasMore
				? `상세 ${shownCount}건 표시 중 / 전체 ${totalCount}건`
				: `상세 ${shownCount}건 표시 중`;
		}
		if (adminIssueLoadMoreBtn) {
			adminIssueLoadMoreBtn.hidden = !hasMore;
			adminIssueLoadMoreBtn.disabled = false;
			adminIssueLoadMoreBtn.textContent = hasMore ? `더 보기 (+${ADMIN_ISSUE_DETAIL_STEP})` : "모두 표시됨";
		}
	}

	function getCachedAdminIssueResponse(cacheMap, queryKey) {
		const entry = cacheMap.get(queryKey);
		if (!entry) return null;
		if (Date.now() - Number(entry.ts || 0) > ADMIN_ISSUE_RESPONSE_CACHE_TTL_MS) {
			cacheMap.delete(queryKey);
			return null;
		}
		return entry.data || null;
	}

	function setCachedAdminIssueResponse(cacheMap, queryKey, data) {
		cacheMap.set(queryKey, { ts: Date.now(), data });
	}

	function updateAdminIssueUpdatedHint() {
		if (!adminIssueUpdatedHint) return;
		const updatedText = `갱신: ${formatDisplayDateTime(adminIssueLastUpdatedAt || "")}`;
		adminIssueUpdatedHint.textContent = adminIssuePerfBadgeText
			? `${updatedText} · ${adminIssuePerfBadgeText}`
			: updatedText;
	}

	function formatAdminIssuePerfWindowLabel(windowSec) {
		const numeric = Number(windowSec || 0);
		if (numeric >= 60) {
			return `최근${Math.round(numeric / 60)}분`;
		}
		return `최근${Math.max(1, Math.round(numeric))}초`;
	}

	function updateAdminIssuePerfWindowButtons() {
		adminIssuePerfWindowButtons.forEach((button) => {
			const value = Number(button.getAttribute("data-window-sec") || 0);
			button.classList.toggle("active", value === adminIssuePerfWindowSec);
		});
	}

	function renderAdminIssuePerfEndpoints(perf) {
		if (!adminIssuePerfEndpointCards) return;
		const endpoints = perf && typeof perf === "object" ? (perf.endpoints || {}) : {};
		const endpointNames = Object.keys(endpoints).sort((a, b) => {
			const ap95 = Number(endpoints[a]?.p95_ms ?? 0);
			const bp95 = Number(endpoints[b]?.p95_ms ?? 0);
			return bp95 - ap95;
		});
		if (!endpointNames.length) {
			adminIssuePerfEndpointCards.innerHTML = '<span class="hint">선택한 구간에 성능 샘플이 없습니다.</span>';
			return;
		}
		adminIssuePerfEndpointCards.innerHTML = endpointNames
			.map((name) => {
				const item = endpoints[name] || {};
				const p95 = Number(item.p95_ms ?? 0);
				const p99 = Number(item.p99_ms ?? 0);
				const count = Number(item.count ?? 0);
				const max = Number(item.max_ms ?? 0);
				const warnClass = p95 >= adminIssuePerfWarnMs ? " warn" : "";
				return `
					<article class="admin-issue-perf-endpoint-card${warnClass}">
						<span class="admin-issue-perf-endpoint-name">${esc(name)}</span>
						<span class="admin-issue-perf-endpoint-main">p95 ${Math.round(p95)}ms</span>
						<span class="admin-issue-perf-endpoint-sub">p99 ${Math.round(p99)}ms · max ${Math.round(max)}ms · ${count}건</span>
					</article>
				`;
			})
			.join("");
	}

	function renderAdminIssuePerfBadge(perf) {
		if (!adminIssuePerfLevelBadge) return;
		const p95 = Number(perf?.p95_ms ?? 0);
		adminIssuePerfLevelBadge.classList.remove("info", "warn");
		if (p95 >= adminIssuePerfWarnMs) {
			adminIssuePerfLevel = "warn";
			adminIssuePerfLevelBadge.textContent = "경고";
			adminIssuePerfLevelBadge.classList.add("warn");
			return;
		}
		if (p95 >= adminIssuePerfInfoMs) {
			adminIssuePerfLevel = "info";
			adminIssuePerfLevelBadge.textContent = "주의";
			adminIssuePerfLevelBadge.classList.add("info");
			return;
		}
		adminIssuePerfLevel = "normal";
		adminIssuePerfLevelBadge.textContent = "정상";
	}

	function getAdminIssueAutoRefreshMs() {
		if (adminIssuePerfLevel === "warn") {
			return ADMIN_ISSUE_POLL_WARN_MS;
		}
		if (adminIssuePerfLevel === "info") {
			return ADMIN_ISSUE_POLL_INFO_MS;
		}
		return ADMIN_ISSUE_POLL_NORMAL_MS;
	}

	function scheduleAdminIssueAutoRefresh() {
		if (adminIssueAutoRefreshTimer) {
			window.clearTimeout(adminIssueAutoRefreshTimer);
			adminIssueAutoRefreshTimer = 0;
		}
		const waitMs = getAdminIssueAutoRefreshMs();
		adminIssueAutoRefreshTimer = window.setTimeout(async () => {
			adminIssueAutoRefreshTimer = 0;
			if (isAdminIssueTabActive() && adminIssueHasLoaded) {
				await refreshAdminIssueManagement(true);
			} else {
				adminIssueNeedsRefresh = true;
			}
			scheduleAdminIssueAutoRefresh();
		}, waitMs);
	}

	async function refreshAdminIssuePerfSummary() {
		if (!isAdminIssueTabActive()) return;
		try {
			const perfPath = `/api/admin/board/member-issues/perf?window_sec=${encodeURIComponent(String(adminIssuePerfWindowSec))}`;
			const perf = await requestJson(perfPath, { method: "GET" });
			const p95 = Number(perf?.p95_ms ?? 0);
			const hitRate = Number(perf?.cache?.hit_rate ?? 0);
			const count = Number(perf?.sample_count ?? 0);
			const selectedWindow = Number(perf?.window_sec ?? adminIssuePerfWindowSec);
			adminIssuePerfWindowSec = selectedWindow;
			adminIssuePerfWarnMs = Number(perf?.thresholds?.warn_ms ?? adminIssuePerfWarnMs);
			adminIssuePerfInfoMs = Number(perf?.thresholds?.info_ms ?? adminIssuePerfInfoMs);
			const windowLabel = formatAdminIssuePerfWindowLabel(selectedWindow);
			adminIssuePerfBadgeText = `${windowLabel} p95 ${Math.round(p95)}ms · hit ${Math.round(hitRate)}% (${count})`;
			if (adminIssuePerfMeta) {
				adminIssuePerfMeta.textContent = `p95 ${Math.round(p95)}ms · p99 ${Math.round(Number(perf?.p99_ms ?? 0))}ms · hit ${Math.round(hitRate)}% · 샘플 ${count}건`;
			}
			if (adminIssuePerfPanel) {
				adminIssuePerfPanel.classList.toggle("warn", p95 >= adminIssuePerfWarnMs);
			}
			renderAdminIssuePerfBadge(perf);
			renderAdminIssuePerfEndpoints(perf);
			updateAdminIssuePerfWindowButtons();
			updateAdminIssueUpdatedHint();
			scheduleAdminIssueAutoRefresh();
		} catch {
			// Keep UI resilient: performance badge is optional and should not block data rendering.
			if (adminIssuePerfMeta) {
				adminIssuePerfMeta.textContent = "성능 지표를 불러오지 못했습니다.";
			}
			scheduleAdminIssueAutoRefresh();
		}
	}

	function applyAdminIssueSummaryData(data) {
		adminIssueHasLoaded = true;
		adminIssueNeedsRefresh = false;
		const stats = data?.stats || data?.summary || {};
		const memberItems = Array.isArray(data?.member_items)
			? data.member_items
			: (Array.isArray(data?.members) ? data.members : []);
		renderAdminIssueStats(stats);
		renderAdminIssueAuthorOptions(data?.author_options || data?.reporter_options || []);
		renderAdminIssueQuickMembers(data?.author_options || data?.reporter_options || []);
		renderAdminIssueStatusOptions(data?.status_options || []);
		renderAdminIssuePodium(memberItems);
		renderAdminIssueMemberSummary(memberItems, stats);
		updateAdminIssueDetailMeta(data);
		updateAdminIssueRangeButtons();
		if (adminIssueSourceHint) {
			adminIssueSourceHint.textContent = `데이터 출처: ${String(data?.source || data?.sheet || '-').trim() || '-'}`;
		}
		if (adminIssueUpdatedHint) {
			adminIssueLastUpdatedAt = String(data?.updated_at || "");
			updateAdminIssueUpdatedHint();
		}
		if (adminIssuePeriodHint) {
			const start = String(data?.period?.start || data?.date_range?.start || "").trim();
			const end = String(data?.period?.end || data?.date_range?.end || "").trim();
			adminIssuePeriodHint.textContent = `기간: ${start || "-"} ~ ${end || "-"}`;
		}
		if (adminIssueRows) {
			adminIssueRows.innerHTML = '<tr><td colspan="13">상세 목록을 불러오는 중...</td></tr>';
		}
		if (adminIssueDetailCount) {
			adminIssueDetailCount.textContent = `상세 0건 표시 중 / 전체 ${Number(data?.detail_total_count ?? 0)}건`;
		}
	}

	function appendAdminIssueRows(items) {
		if (!adminIssueRows) return;
		const rows = Array.isArray(items) ? items : [];
		if (!rows.length) return;
		const renderToken = ++adminIssueRowRenderToken;
		const appendChunk = (startIndex) => {
			if (renderToken !== adminIssueRowRenderToken) return;
			const chunk = rows.slice(startIndex, startIndex + ADMIN_ISSUE_ROW_CHUNK_SIZE);
			if (!chunk.length) return;
			adminIssueRows.insertAdjacentHTML("beforeend", chunk.map(buildAdminIssueRowMarkup).join(""));
			if (startIndex + ADMIN_ISSUE_ROW_CHUNK_SIZE < rows.length) {
				window.requestAnimationFrame(() => appendChunk(startIndex + ADMIN_ISSUE_ROW_CHUNK_SIZE));
			}
		};
		window.requestAnimationFrame(() => appendChunk(0));
	}

	function applyAdminIssueDetailData(summaryData, detailData) {
		const memberItems = Array.isArray(summaryData?.member_items)
			? summaryData.member_items
			: (Array.isArray(summaryData?.members) ? summaryData.members : []);
		const issueItems = Array.isArray(detailData?.items)
			? detailData.items
			: (Array.isArray(detailData?.issue_items) ? detailData.issue_items : []);
		updateAdminIssueDetailMeta(detailData);
		updateAdminIssueRangeButtons();
		adminIssueDetailOffset = Number(detailData?.detail_shown_count ?? issueItems.length);
		if (adminIssueResultCount) {
			const total = Number(detailData?.detail_total_count ?? issueItems.length);
			const members = memberItems.length;
			adminIssueResultCount.textContent = `조회 결과 ${total}건 · ${members}명`;
		}
		if (Number(detailData?.detail_offset ?? 0) > 0) {
			window.requestAnimationFrame(() => {
				appendAdminIssueRows(issueItems);
			});
			return;
		}
		window.requestAnimationFrame(() => {
			renderAdminIssueRows(issueItems);
		});
	}

	async function fetchAdminIssueSummary(query, forceRefresh, requestToken) {
		if (!forceRefresh) {
			const cachedSummary = getCachedAdminIssueResponse(adminIssueSummaryCache, query);
			if (cachedSummary) {
				applyAdminIssueSummaryData(cachedSummary);
				return cachedSummary;
			}
		}
		if (adminIssueSummaryAbortController) {
			adminIssueSummaryAbortController.abort();
		}
		adminIssueSummaryAbortController = new AbortController();
		adminIssueMemberRows.innerHTML = '<tr><td colspan="15">요약을 불러오는 중...</td></tr>';
		const summaryUrl = query ? `/api/admin/board/member-issues/summary?${query}` : "/api/admin/board/member-issues/summary";
		const summaryData = await requestJson(summaryUrl, {
			method: "GET",
			signal: adminIssueSummaryAbortController.signal,
		});
		if (requestToken !== adminIssueRequestToken) {
			return null;
		}
		setCachedAdminIssueResponse(adminIssueSummaryCache, query, summaryData);
		applyAdminIssueSummaryData(summaryData);
		return summaryData;
	}

	async function fetchAdminIssueDetail(summaryData, queryWithLimit, forceRefresh, requestToken) {
		if (!forceRefresh) {
			const cachedDetail = getCachedAdminIssueResponse(adminIssueDetailCache, queryWithLimit);
			if (cachedDetail) {
				applyAdminIssueDetailData(summaryData, cachedDetail);
				return;
			}
		}
		if (adminIssueDetailAbortController) {
			adminIssueDetailAbortController.abort();
		}
		adminIssueDetailAbortController = new AbortController();
		if (adminIssueLoadMoreBtn) {
			adminIssueLoadMoreBtn.disabled = true;
		}
		const detailUrl = queryWithLimit ? `/api/admin/board/member-issues/detail?${queryWithLimit}` : "/api/admin/board/member-issues/detail";
		const detailData = await requestJson(detailUrl, {
			method: "GET",
			signal: adminIssueDetailAbortController.signal,
		});
		if (requestToken !== adminIssueRequestToken) {
			return;
		}
		setCachedAdminIssueResponse(adminIssueDetailCache, queryWithLimit, detailData);
		applyAdminIssueDetailData(summaryData, detailData);
	}

	async function refreshAdminIssueManagement(force = false) {
		if (!adminIssueRows || !adminIssueMemberRows) return;
		if (!isAdminIssueTabActive()) {
			if (force) {
				adminIssueNeedsRefresh = true;
			}
			return;
		}
		const forceRefresh = force === true;
		const requestToken = ++adminIssueRequestToken;
		try {
			adminIssueDetailOffset = 0;
			const summaryQuery = buildAdminIssueQueryString(false);
			const detailQuery = buildAdminIssueQueryString(true, true);
			const summaryData = await fetchAdminIssueSummary(summaryQuery, forceRefresh, requestToken);
			if (!summaryData) {
				return;
			}
			await new Promise((resolve) => window.requestAnimationFrame(resolve));
			await fetchAdminIssueDetail(summaryData, detailQuery, forceRefresh, requestToken);
			refreshAdminIssuePerfSummary();
		} catch (error) {
			if (error?.name === "AbortError") {
				return;
			}
			const fallback = getAdminIssueBootstrapData();
			const fallbackStats = fallback?.stats || {};
			const fallbackMembers = Array.isArray(fallback?.member_items) ? fallback.member_items : [];
			const fallbackItems = Array.isArray(fallback?.items) ? fallback.items : [];
			if (fallbackMembers.length || fallbackItems.length) {
				const fallbackSummary = {
					...fallback,
					stats: fallbackStats,
					member_items: fallbackMembers,
					detail_total_count: Number(fallback?.detail_total_count ?? fallbackItems.length),
				};
				applyAdminIssueSummaryData(fallbackSummary);
				applyAdminIssueDetailData(fallbackSummary, {
					items: fallbackItems,
					detail_total_count: Number(fallback?.detail_total_count ?? fallbackItems.length),
					detail_returned_count: fallbackItems.length,
					detail_has_more: false,
				});
				if (adminIssuePeriodHint) {
					const start = String(fallback?.period?.start || "").trim();
					const end = String(fallback?.period?.end || "").trim();
					adminIssuePeriodHint.textContent = `기간: ${start || "-"} ~ ${end || "-"} (업로드 데이터)`;
				}
				return;
			}
			renderAdminIssueStats({ total_tickets: 0, definite_problem: 0, mistake_rate: 0, score: 0 });
			adminIssueMemberRows.innerHTML = `<tr><td colspan="15">${esc(error?.message || "인원별 이슈 요약을 불러오지 못했습니다.")}</td></tr>`;
			adminIssueRows.innerHTML = `<tr><td colspan="13">${esc(error?.message || "인원별 이슈 목록을 불러오지 못했습니다.")}</td></tr>`;
			if (adminIssuePeriodHint) {
				adminIssuePeriodHint.textContent = "기간: -";
			}
			if (adminIssueResultCount) {
				adminIssueResultCount.textContent = esc(error?.message || "조회 실패");
			}
		}
	}

	function ensureAdminIssueLoaded(force = false) {
		if (!isAdminIssueTabActive()) return;
		if (force || adminIssueNeedsRefresh || !adminIssueHasLoaded) {
			refreshAdminIssueManagement(force);
		}
	}

	function refreshAdminIssueDetailOnly(force = false) {
		if (!adminIssueRows) return;
		if (!isAdminIssueTabActive()) return;
		const requestToken = ++adminIssueRequestToken;
		const forceRefresh = force === true;
		const summaryQuery = buildAdminIssueQueryString(false);
		const detailQuery = buildAdminIssueQueryString(true, true);
		const summaryData = getCachedAdminIssueResponse(adminIssueSummaryCache, summaryQuery);
		if (!summaryData) {
			refreshAdminIssueManagement(forceRefresh);
			return;
		}
		fetchAdminIssueDetail(summaryData, detailQuery, forceRefresh, requestToken).catch((error) => {
			if (error?.name === "AbortError") return;
			adminIssueRows.innerHTML = `<tr><td colspan="13">${esc(error?.message || "상세 목록을 불러오지 못했습니다.")}</td></tr>`;
		});
	}

	function scheduleAdminIssueRefresh() {
		window.clearTimeout(adminIssueSearchTimer);
		adminIssueDetailLimit = 120;
		adminIssueDetailOffset = 0;
		adminIssueSearchTimer = window.setTimeout(() => {
			refreshAdminIssueManagement();
		}, 420);
	}

	function openDetailModal(title, lines) {
		if (!requestDetailModal || !requestDetailTitle || !requestDetailList) return;
		requestDetailTitle.textContent = String(title || "상세").trim() || "상세";
		const detailLines = Array.isArray(lines)
			? lines.map((line) => String(line || "").trim()).filter(Boolean)
			: [];
		requestDetailList.innerHTML = detailLines.length
			? detailLines.map((line) => `<li>${esc(line)}</li>`).join("")
			: "<li>상세 내용이 없습니다.</li>";
		requestDetailModal.hidden = false;
		document.body.classList.add("modal-open");
	}

	function exportAdminIssueManagement() {
		const query = buildAdminIssueQueryString(false, false);
		const rawUrl = query ? `/api/admin/board/member-issues/export?${query}` : "/api/admin/board/member-issues/export";
		const url = resolveApiUrl(rawUrl);
		window.location.href = url;
	}

	async function refreshAdminCompanyMembers() {
		if (!adminCompanyMemberHint && !adminCompanyMemberList) return;
		try {
			const data = await requestJson("/api/company-members", { method: "GET" });
			const members = Array.isArray(data?.members)
				? data.members.map((name) => String(name || "").trim()).filter(Boolean)
				: [];
			if (adminCompanyMemberHint) {
				adminCompanyMemberHint.textContent = `회사 인원 ${members.length}명 | ${members.join(", ") || "-"}`;
			}
			if (adminCompanyMemberList) {
				adminCompanyMemberList.innerHTML = members.map((name) => `<option value="${esc(name)}"></option>`).join("");
			}
		} catch (error) {
			if (adminCompanyMemberHint) {
				adminCompanyMemberHint.textContent = `회사 인원 목록 조회 실패: ${String(error?.message || error || "-")}`;
			}
		}
	}

	async function updateAdminCompanyMember(action) {
		const name = String(adminCompanyMemberInput?.value || "").trim();
		if (!name) {
			window.alert("이름을 입력해 주세요.");
			return;
		}
		const isAdd = action === "add";
		const button = isAdd ? adminCompanyMemberAddBtn : adminCompanyMemberRemoveBtn;
		if (button) button.disabled = true;
		try {
			const formData = new FormData();
			formData.set("name", name);
			await requestJson(isAdd ? "/api/company-members/add" : "/api/company-members/remove", {
				method: "POST",
				headers: undefined,
				body: formData,
			});
			await refreshAdminCompanyMembers();
			await refreshAdminIssueManagement(true);
			if (adminCompanyMemberInput) adminCompanyMemberInput.value = "";
		} catch (error) {
			window.alert(String(error?.message || error || "요청 실패"));
		} finally {
			if (button) button.disabled = false;
		}
	}

	function renderMembers(items) {
		memberBody.innerHTML = items
			.map((x) => {
				const email = String(x.email || "").toLowerCase();
				const isCoreAdmin = CORE_ADMINS.has(email);
				const approved = Boolean(x.approved);
				const canLogin = Boolean(x.can_login);
				const gameAccess = Boolean(x.game_access);
				const canSeeGameControl = canManageGameAccess;
				const titlePhone = [String(x.title || "").trim(), String(x.phone || "").trim()].filter(Boolean).join(" / ") || "-";
				const createdAt = formatDisplayDateTime(x.created_at || "");
				return `
					<tr>
						<td>${esc(email || "-")}</td>
						<td>${esc(x.name || "-")}</td>
						<td>${esc(titlePhone)}</td>
						<td><span class="admin-member-status-badge ${x.role === "admin" ? "is-admin" : "is-user"}">${esc(x.role || "user")}</span></td>
						<td><span class="admin-member-status-badge ${approved ? "is-approved" : "is-pending"}">${approved ? "승인" : "대기"}</span></td>
						<td>${canLogin ? "✓ 허용" : "✗ 차단"}</td>
						${canManageGameAccess ? `<td>${gameAccess ? "✓ 허용" : "✗ 차단"}</td>` : ""}
						<td>${esc(createdAt)}</td>
						<td>
							<div class="admin-action-buttons">
								<button type="button" class="btn-edit" data-open-member-edit="${esc(email)}">상세수정</button>
								<button type="button" class="btn-approve" data-approve-member="${esc(email)}" ${approved ? "disabled" : ""}>승인</button>
								<button type="button" class="btn-edit" data-toggle-role-member="${esc(email)}" data-next-role="${x.role === "admin" ? "user" : "admin"}" ${isCoreAdmin ? "disabled" : ""}>${x.role === "admin" ? "관리자해제" : "관리자부여"}</button>
								<button type="button" class="btn-edit" data-toggle-login-member="${esc(email)}" data-next-login="${canLogin ? 0 : 1}" ${isCoreAdmin ? "disabled" : ""}>${canLogin ? "차단" : "허용"}</button>
								${canSeeGameControl ? `<button type="button" class="btn-game-access" data-toggle-game-member="${esc(email)}" data-next-game="${gameAccess ? 0 : 1}" ${isCoreAdmin ? "disabled" : ""}>${gameAccess ? "차단" : "허용"}</button>` : ""}
								<button type="button" class="btn-delete" data-del-member="${esc(email)}" ${isCoreAdmin ? "disabled" : ""}>삭제</button>
							</div>
						</td>
					</tr>
				`;
			})
			.join("");

		setDetailSummary(items);
	}

	function resolveApiUrl(url) {
		const raw = String(url || "").trim();
		if (!raw || !raw.startsWith("/api/")) return raw;
		const path = String(window.location.pathname || "");
		if (!path) return raw;
		const marker = "/admin";
		const lowerPath = path.toLowerCase();
		const idx = lowerPath.lastIndexOf(marker);
		if (idx <= 0) return raw;
		const prefix = path.slice(0, idx).replace(/\/$/, "");
		if (!prefix) return raw;
		return `${prefix}${raw}`;
	}

	async function requestJson(url, options) {
		const requestOptions = {
			credentials: "same-origin",
			headers: { "Content-Type": "application/json" },
			...options,
		};
		const candidates = [];
		const resolvedUrl = resolveApiUrl(url);
		if (resolvedUrl) candidates.push(resolvedUrl);
		if (url && !candidates.includes(url)) candidates.push(url);
		let res = null;
		for (const candidate of candidates) {
			res = await fetch(candidate, requestOptions);
			if (res.status !== 404) break;
		}
		if (!res) {
			throw new Error("요청을 전송하지 못했습니다.");
		}
		const contentType = String(res.headers.get("content-type") || "").toLowerCase();
		if (!contentType.includes("application/json")) {
			if (res.status === 401 || res.status === 403 || res.redirected) {
				throw new Error("세션이 만료되었거나 권한이 없습니다. 다시 로그인해 주세요.");
			}
			throw new Error("서버 응답 형식이 올바르지 않습니다. 페이지를 새로고침해 주세요.");
		}
		let data = {};
		try {
			data = await res.json();
		} catch {
			throw new Error("서버 응답을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.");
		}
		if (!res.ok) {
			const detail = String(data?.detail || "요청 처리 중 오류가 발생했습니다.");
			throw new Error(detail);
		}
		return data;
	}

	async function refreshMembers() {
		try {
			const data = await requestJson("/api/admin/users", { method: "GET" });
			currentAdminEmail = String(data.current_user_email || "").trim().toLowerCase();
			if (adminCurrentUser) {
				adminCurrentUser.textContent = currentAdminEmail || "-";
			}
			console.log("[Admin] API Response - can_manage_game_access:", data.can_manage_game_access);
			const serverCanManageGameAccess = Boolean(data.can_manage_game_access);
			const emailCheckPassed = !currentAdminEmail || currentAdminEmail === GAME_ACCESS_MANAGER_EMAIL;
			canManageGameAccess = serverCanManageGameAccess && emailCheckPassed;
			console.log("[Admin] canManageGameAccess after assignment:", canManageGameAccess);
			
			// 게임 권한 상태 표시 (topbar에)
			if (adminGameAccess) {
				adminGameAccess.textContent = canManageGameAccess ? "✓ 허용" : "✗ 차단";
				adminGameAccess.style.color = canManageGameAccess ? "#4CAF50" : "#f44336";
			}
			
			syncGameAccessVisibility();
			console.log("[Admin] memberGameAccessHeader hidden?", memberGameAccessHeader?.hidden);
			console.log("[Admin] memberEditGameAccessField hidden?", memberEditGameAccessField?.hidden);
			console.log("[Admin] adminMemberAddBtn exists?", adminMemberAddBtn ? "yes" : "no");
			rawMemberItems = Array.isArray(data.items) ? data.items : [];
			rawMemberItems.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
			applyMemberView(rawMemberItems);
		} catch (error) {
			memberBody.innerHTML = `<tr><td colspan="${getMemberTableColumnCount()}">${esc(error?.message || "사용자 목록을 불러오지 못했습니다.")}</td></tr>`;
			if (memberDetailBody) {
				memberDetailBody.innerHTML = `<tr><td>상태</td><td>${esc(error?.message || "통계를 불러오지 못했습니다.")}</td></tr>`;
			}
		}
	}

	function renderAssetDeleteRequests(items) {
		if (!assetDeleteRequestBody) return;
		if (!items.length) {
			assetDeleteRequestBody.innerHTML = '<tr><td colspan="6">대기 중인 승인 요청이 없습니다.</td></tr>';
			return;
		}
		assetDeleteRequestBody.innerHTML = items
			.map((x) => {
				const requestId = String(x.request_id || "");
				const sourceType = String(x.source_type || "");
				const canApprove = sourceType === "asset-delete" || sourceType === "schedule";
				const canReject = sourceType === "asset-delete" || sourceType === "schedule";
				const canWithdraw = sourceType === "asset-delete" || sourceType === "schedule";
				return `
					<tr>
						<td>${esc(x.page_name || "-")}</td>
						<td>${esc(x.requester_name || "-")}<br /><span class="hint">${esc(x.requester_id || "-")}</span></td>
						<td>${esc(formatDisplayDateTime(x.requested_at || ""))}</td>
						<td><button type="button" class="btn-secondary" data-show-request-details="${esc(requestId)}">내용</button></td>
						<td>
							<div style="display:flex;gap:6px;flex-wrap:wrap;">
								<button type="button" class="btn-approve" data-approve-asset-request="${esc(requestId)}" ${canApprove ? "" : "disabled"}>승인</button>
								<button type="button" class="btn-reject" data-reject-asset-request="${esc(requestId)}" ${canReject ? "" : "disabled"}>반려</button>
							</div>
						</td>
						<td>
							<button type="button" class="btn-ghost" data-withdraw-asset-request="${esc(requestId)}" ${canWithdraw ? "" : "disabled"}>요청철회</button>
						</td>
					</tr>
				`;
			})
			.join("");
	}

	async function refreshAssetDeleteRequests() {
		if (!assetDeleteRequestBody) return;
		try {
			const data = await requestJson("/api/admin/assets/delete-requests", { method: "GET" });
			const items = Array.isArray(data.items) ? data.items : [];
			pendingDeleteRequests = items;
			renderAssetDeleteRequests(items);
			renderDecisionQueue(items);
		} catch (error) {
			assetDeleteRequestBody.innerHTML = `<tr><td colspan="6">${esc(error?.message || "승인 요청 목록을 불러오지 못했습니다.")}</td></tr>`;
			if (decisionQueueBody) {
				decisionQueueBody.innerHTML = `<tr><td colspan="6">${esc(error?.message || "판단 대기 목록을 불러오지 못했습니다.")}</td></tr>`;
			}
		}
	}

	function getPendingRequestById(requestId) {
		return pendingDeleteRequests.find((x) => String(x.request_id || "") === String(requestId || "")) || null;
	}

	function openRequestDetailModal(requestItem) {
		if (!requestItem) return;
		const title = `${String(requestItem.page_name || "요청").trim()} · ${String(requestItem.request_label || "상세").trim()}`;
		const lines = Array.isArray(requestItem.detail_lines) ? requestItem.detail_lines : [];
		openDetailModal(title, lines);
	}

	function closeRequestDetailModal() {
		if (!requestDetailModal) return;
		requestDetailModal.hidden = true;
		document.body.classList.remove("modal-open");
	}

	function getDecisionType() {
		const selected = document.querySelector('input[name="decisionType"]:checked');
		return String(selected?.value || "approve");
	}

	function getSelectedDecisionIds() {
		return Array.from(document.querySelectorAll('.decision-row-check:checked'))
			.map((el) => String(el.getAttribute("data-id") || "").trim())
			.filter(Boolean);
	}

	function getActionableRequests(items) {
		return (items || []).filter((x) => {
			const sourceType = String(x?.source_type || "");
			return sourceType === "asset-delete" || sourceType === "schedule";
		});
	}

	function updateDecisionSelectionSummary() {
		const total = pendingDeleteRequests.length;
		const actionable = getActionableRequests(pendingDeleteRequests).length;
		const selected = getSelectedDecisionIds().length;
		if (decisionSelectedCount) {
			decisionSelectedCount.textContent = actionable > 0
				? `${selected}개 선택됨 · 처리 가능 ${actionable}개`
				: `${selected}개 선택됨`;
		}
		if (decisionTotalCount) decisionTotalCount.textContent = String(total);
		if (decisionSelectedOnlyCount) decisionSelectedOnlyCount.textContent = String(selected);
		if (decisionActionableCount) decisionActionableCount.textContent = String(actionable);
		if (decisionQueueCheckAll) decisionQueueCheckAll.checked = actionable > 0 && selected === actionable;
		if (decisionWithdrawSelectedBtn) decisionWithdrawSelectedBtn.disabled = selected === 0;
	}

	async function withdrawPendingRequest(requestItem) {
		const withdrawId = String(requestItem?.target_id || "");
		if (!withdrawId) {
			throw new Error("철회할 요청 대상을 찾지 못했습니다.");
		}
		const sourceType = String(requestItem?.source_type || "");
		if (sourceType === "asset-delete") {
			await requestJson(`/api/admin/assets/${encodeURIComponent(withdrawId)}/withdraw-request`, {
				method: "POST",
				body: JSON.stringify({}),
			});
			return;
		}
		if (sourceType === "schedule") {
			await requestJson(`/api/manage/schedules/${encodeURIComponent(withdrawId)}/withdraw-request`, {
				method: "POST",
				body: JSON.stringify({}),
			});
			return;
		}
		throw new Error("지원하지 않는 요청 유형입니다.");
	}

	async function applyPendingRequestDecision(requestItem, decisionType, reason = "") {
		const id = String(requestItem?.target_id || "");
		const sourceType = String(requestItem?.source_type || "");
		if (!id) {
			throw new Error("처리할 요청 대상을 찾지 못했습니다.");
		}
		if (decisionType !== "approve" && decisionType !== "reject") {
			throw new Error("지원하지 않는 처리 방식입니다.");
		}
		if (sourceType === "asset-delete") {
			if (decisionType === "approve") {
				await requestJson(`/api/admin/assets/${encodeURIComponent(id)}/approve-delete`, {
					method: "POST",
					body: JSON.stringify({}),
				});
				return;
			}
			await requestJson(`/api/admin/assets/${encodeURIComponent(id)}/reject-delete`, {
				method: "POST",
				body: JSON.stringify({ reason }),
			});
			return;
		}
		if (sourceType === "schedule") {
			await requestJson(`/api/manage/schedules/${encodeURIComponent(id)}/approval`, {
				method: "POST",
				body: JSON.stringify({
					status: decisionType === "approve" ? "approved" : "rejected",
					reason: decisionType === "reject" ? reason : "",
				}),
			});
			return;
		}
		throw new Error("지원하지 않는 요청 유형입니다.");
	}

	function renderDecisionQueue(items) {
		if (!decisionQueueBody) return;
		if (!items.length) {
			decisionQueueBody.innerHTML = '<tr><td colspan="7">판단 대기 요청이 없습니다.</td></tr>';
			updateDecisionSelectionSummary();
			return;
		}
		decisionQueueBody.innerHTML = items
			.map((x) => {
				const requestId = String(x.request_id || "");
				const isPreferred = preferredDecisionId && preferredDecisionId === requestId;
				const sourceType = String(x.source_type || "");
				const canDecide = sourceType === "asset-delete" || sourceType === "schedule";
				const canWithdraw = sourceType === "asset-delete" || sourceType === "schedule";
				return `
					<tr data-decision-row-id="${esc(requestId)}">
						<td><input type="checkbox" class="decision-row-check" data-id="${esc(requestId)}" ${isPreferred ? "checked" : ""} ${canDecide ? "" : "disabled"} /></td>
						<td><span class="scope-badge">${esc(x.page_name || "-")}</span></td>
						<td>${esc(x.requester_name || "-")}<br /><span class="hint">${esc(x.requester_id || "-")}</span></td>
						<td><span class="decision-time">${esc(formatDisplayDateTime(x.requested_at || ""))}</span></td>
						<td><button type="button" class="btn-secondary" data-show-request-details="${esc(requestId)}">내용</button></td>
						<td><span class="asset-status-badge status-pending">${canDecide ? "대기중" : "조회전용"}</span></td>
						<td><button type="button" class="btn-warning" data-withdraw-decision-request="${esc(requestId)}" ${canWithdraw ? "" : "disabled"}>요청취소</button></td>
					</tr>
				`;
			})
			.join("");
		updateDecisionSelectionSummary();
	}

	function renderAssetDeletedItems(items) {
		if (!assetDeletedBody) return;
		if (!items.length) {
			assetDeletedBody.innerHTML = '<tr><td colspan="8">삭제된 항목이 없습니다.</td></tr>';
			return;
		}
		assetDeletedBody.innerHTML = items
			.map((x) => {
				const id = String(x.id || "");
				const reqStatus = String(x.delete_request_status || "none").toLowerCase();
				const isCancelled = reqStatus === "cancelled";
				const reviewer = isCancelled ? String(x.delete_cancelled_by || "") : String(x.delete_reviewed_by || "");
				const reviewedAt = isCancelled ? String(x.delete_cancelled_at || "") : String(x.delete_reviewed_at || "");
				return `
					<tr>
						<td>${esc(id || "-")}</td>
						<td>${esc(x["구 관리번호"] || "-")}</td>
						<td>${esc(x["NEW 관리 번호"] || "-")}</td>
						<td>${esc(x.delete_requested_by || "-")}</td>
						<td>${esc(formatDisplayDateTime(x.delete_requested_at || ""))}</td>
						<td>${esc(reviewer || "-")}</td>
						<td>${esc(formatDisplayDateTime(reviewedAt || ""))}</td>
						<td>
							${
								isCancelled
									? '<span class="asset-status-badge status-rejected">취소요청</span>'
									: `<button type="button" class="btn-secondary" data-restore-deleted-asset="${esc(id)}">복구</button>
									   <button type="button" class="btn-ghost" data-cancel-asset-approval="${esc(id)}">승인취소</button>`
							}
						</td>
					</tr>
				`;
			})
			.join("");
	}

	async function refreshAssetDeletedItems() {
		if (!assetDeletedBody) return;
		try {
			const data = await requestJson("/api/admin/assets/deleted-items", { method: "GET" });
			const items = Array.isArray(data.items) ? data.items : [];
			renderAssetDeletedItems(items);
		} catch (error) {
			assetDeletedBody.innerHTML = `<tr><td colspan="8">${esc(error?.message || "삭제된 목록을 불러오지 못했습니다.")}</td></tr>`;
		}
	}

	function renderAssetRejectedItems(items) {
		if (!assetRejectedBody) return;
		if (!items.length) {
			assetRejectedBody.innerHTML = '<tr><td colspan="9">반려된 항목이 없습니다.</td></tr>';
			return;
		}
		assetRejectedBody.innerHTML = items
			.map((x) => {
				const id = String(x.id || "");
				return `
					<tr>
						<td>${esc(id || "-")}</td>
						<td>${esc(x["구 관리번호"] || "-")}</td>
						<td>${esc(x["NEW 관리 번호"] || "-")}</td>
						<td>${esc(x.delete_requested_by || "-")}</td>
						<td>${esc(formatDisplayDateTime(x.delete_requested_at || ""))}</td>
						<td>${esc(x.delete_reviewed_by || "-")}</td>
						<td>${esc(formatDisplayDateTime(x.delete_reviewed_at || ""))}</td>
						<td>${esc(x.delete_reject_reason || "-")}</td>
						<td><button type="button" class="btn-secondary" data-restore-rejected-asset="${esc(id)}">복구</button></td>
					</tr>
				`;
			})
			.join("");
	}

	async function refreshAssetRejectedItems() {
		if (!assetRejectedBody) return;
		try {
			const data = await requestJson("/api/admin/assets/rejected-items", { method: "GET" });
			const items = Array.isArray(data.items) ? data.items : [];
			renderAssetRejectedItems(items);
		} catch (error) {
			assetRejectedBody.innerHTML = `<tr><td colspan="9">${esc(error?.message || "반려된 목록을 불러오지 못했습니다.")}</td></tr>`;
		}
	}

	function applyAdminHashMode() {
		let requestedId = (window.location.hash || "").replace("#", "");
		if (requestedId === "adminAssetDecisionTab") {
			requestedId = "adminAssetApprovalTab";
			window.location.hash = "#adminAssetApprovalTab";
		}
		if (requestedId === "adminBoardApprovalTab") {
			requestedId = "adminAssetApprovalTab";
			window.location.hash = "#adminAssetApprovalTab";
		}
		if (!requestedId) {
			for (const id of ADMIN_SECTION_IDS) {
				const section = document.getElementById(id);
				if (section) {
					section.hidden = false;
					section.style.gridColumn = "";
				}
			}
			adminMainGrid?.classList.remove("admin-single-mode");
			return;
		}
		const activeId = ADMIN_SECTION_IDS.includes(requestedId) ? requestedId : "adminPeopleTab";
		for (const id of ADMIN_SECTION_IDS) {
			const section = document.getElementById(id);
			if (section) {
				section.hidden = id !== activeId;
				section.style.gridColumn = id === activeId ? "1 / -1" : "";
			}
		}
		adminMainGrid?.classList.add("admin-single-mode");
		if (activeId === "adminIssueTab") {
			ensureAdminIssueLoaded();
		}
	}

	function openMemberAddModal() {
		console.log("[Admin] openMemberAddModal called");
		console.log("[Admin] memberAddModal exists?", memberAddModal ? "yes" : "no");
		console.log("[Admin] memberAddForm exists?", memberAddForm ? "yes" : "no");
		if (!memberAddModal) {
			console.error("[Admin] Modal element not found!");
			return;
		}
		if (memberAddForm) {
			memberAddForm.reset();
		}
		
		// Move modal to body to escape container constraints
		if (memberAddModal.parentElement !== document.body) {
			console.log("[Admin] Moving modal from", memberAddModal.parentElement.tagName, "to body");
			document.body.appendChild(memberAddModal);
		}
		
		// Remove hidden attribute FIRST
		memberAddModal.removeAttribute("hidden");
		
		// Force browser reflow before applying styles
		setTimeout(() => {
			// Ensure html/body have proper height
			document.documentElement.style.height = "100%";
			document.body.style.height = "100%";
			
			// Apply modal container styles with absolute positioning
			memberAddModal.style.cssText = "display: grid !important; position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; width: 100vw !important; height: 100vh !important; z-index: 9999 !important; place-items: center !important; padding: 16px !important; margin: 0 !important;";
			
			// Also apply to modal panel
			const panel = memberAddModal.querySelector(".modal-panel");
			if (panel) {
				panel.style.cssText = "position: relative !important; width: min(760px, 96vw) !important; max-height: 80vh !important; overflow: auto !important; background: #ffffff !important; border-radius: 12px !important; border: 1px solid #c9dbf0 !important; box-shadow: 0 22px 44px rgba(12, 36, 66, 0.28) !important;";
			}
			
			document.body.classList.add("modal-open");
			
			// Debug: Check actual computed styles after reflow
			const computed = window.getComputedStyle(memberAddModal);
			console.log("[Admin] Modal computed display:", computed.display);
			console.log("[Admin] Modal clientHeight:", memberAddModal.clientHeight);
			console.log("[Admin] Modal offsetHeight:", memberAddModal.offsetHeight);
			if (panel) {
				console.log("[Admin] Panel clientHeight:", panel.clientHeight);
				console.log("[Admin] Panel offsetHeight:", panel.offsetHeight);
			}
		}, 0);
	}

	function closeMemberAddModal() {
		if (!memberAddModal) return;
		memberAddModal.setAttribute("hidden", "");
		memberAddModal.style.display = "none";
		document.body.classList.remove("modal-open");
	}

	bindMemberAddFieldEnhancements();

	memberBody.addEventListener("click", async (event) => {
		const source = event.target;
		if (!(source instanceof Element)) return;
		const target = source.closest("button");
		if (!(target instanceof HTMLElement)) return;

		const approveEmail = target.getAttribute("data-approve-member");
		const editEmail = target.getAttribute("data-open-member-edit");
		const toggleRoleEmail = target.getAttribute("data-toggle-role-member");
		const nextRole = String(target.getAttribute("data-next-role") || "").trim().toLowerCase();
		const toggleEmail = target.getAttribute("data-toggle-login-member");
		const nextLogin = target.getAttribute("data-next-login");
		const toggleGameEmail = target.getAttribute("data-toggle-game-member");
		const nextGame = target.getAttribute("data-next-game");
		const deleteEmail = target.getAttribute("data-del-member");

		if (!approveEmail && !editEmail && !toggleRoleEmail && !toggleEmail && !toggleGameEmail && !deleteEmail) {
			return;
		}

		try {
			if (editEmail) {
				const member = findMemberByEmail(editEmail);
				if (!member) throw new Error("수정할 회원 정보를 찾지 못했습니다.");
				openMemberEditModal(member);
				return;
			}

			if (approveEmail) {
				await requestJson(`/api/admin/users/${encodeURIComponent(approveEmail)}`, {
					method: "PUT",
					body: JSON.stringify({ approved: true, can_login: true }),
				});
				await refreshMembers();
				return;
			}

			if (toggleEmail) {
				await requestJson(`/api/admin/users/${encodeURIComponent(toggleEmail)}`, {
					method: "PUT",
					body: JSON.stringify({ can_login: String(nextLogin) === "1" }),
				});
				await refreshMembers();
				return;
			}

			if (toggleRoleEmail) {
				if (nextRole !== "admin" && nextRole !== "user") {
					throw new Error("변경할 권한 정보가 올바르지 않습니다.");
				}
				await requestJson(`/api/admin/users/${encodeURIComponent(toggleRoleEmail)}`, {
					method: "PUT",
					body: JSON.stringify({ role: nextRole }),
				});
				await refreshMembers();
				return;
			}

			if (toggleGameEmail) {
				await requestJson(`/api/admin/users/${encodeURIComponent(toggleGameEmail)}`, {
					method: "PUT",
					body: JSON.stringify({ game_access: String(nextGame) === "1" }),
				});
				await refreshMembers();
				window.dispatchEvent(new Event("cci:auth-updated"));
				return;
			}

			if (deleteEmail) {
				const ok = window.confirm(`${deleteEmail} 계정을 삭제하시겠습니까?`);
				if (!ok) return;
				await requestJson(`/api/admin/users/${encodeURIComponent(deleteEmail)}`, {
					method: "DELETE",
				});
				await refreshMembers();
			}
		} catch (error) {
			window.alert(error?.message || "요청 처리 중 오류가 발생했습니다.");
		}
	});

	memberEditModal?.addEventListener("click", (event) => {
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;
		if (target.closest("[data-close-member-edit='1']")) {
			closeMemberEditModal();
		}
	});

	memberEditForm?.addEventListener("submit", async (event) => {
		event.preventDefault();
		const email = String(document.getElementById("memberEditEmail")?.value || "").trim().toLowerCase();
		if (!email) {
			window.alert("수정할 계정을 찾지 못했습니다.");
			return;
		}
		const payload = {
			name: String(document.getElementById("memberEditName")?.value || "").trim(),
			role: String(document.getElementById("memberEditRole")?.value || "user").trim().toLowerCase(),
			title: String(document.getElementById("memberEditTitle")?.value || "").trim(),
			phone: String(document.getElementById("memberEditPhone")?.value || "").trim(),
			birth: String(document.getElementById("memberEditBirth")?.value || "").trim(),
			address: String(document.getElementById("memberEditAddress")?.value || "").trim(),
			approved: Boolean(document.getElementById("memberEditApproved")?.checked),
			can_login: Boolean(document.getElementById("memberEditCanLogin")?.checked),
		};
		if (canManageGameAccess) {
			payload.game_access = Boolean(memberEditGameAccessInput?.checked);
		}
		if (!payload.name) {
			window.alert("이름을 입력해 주세요.");
			return;
		}
		if (!isValidPhone(payload.phone)) {
			window.alert(PHONE_RULE_TEXT);
			return;
		}
		if (!isValidBirth(payload.birth)) {
			window.alert(BIRTH_RULE_TEXT);
			return;
		}
		try {
			await requestJson(`/api/admin/users/${encodeURIComponent(email)}`, {
				method: "PUT",
				body: JSON.stringify(payload),
			});
			window.alert("회원 정보가 저장되었습니다.");
			closeMemberEditModal();
			await refreshMembers();
			window.dispatchEvent(new Event("cci:auth-updated"));
		} catch (error) {
			window.alert(error?.message || "회원 정보 저장 중 오류가 발생했습니다.");
		}
	});

	memberPasswordForm?.addEventListener("submit", async (event) => {
		event.preventDefault();
		const email = String(document.getElementById("memberEditEmail")?.value || "").trim().toLowerCase();
		const password = String(document.getElementById("memberPasswordInput")?.value || "").trim();
		if (!email) {
			window.alert("수정할 계정을 찾지 못했습니다.");
			return;
		}
		if (!isValidPassword(password)) {
			window.alert(PASSWORD_RULE_TEXT);
			return;
		}
		try {
			await requestJson(`/api/admin/users/${encodeURIComponent(email)}`, {
				method: "PUT",
				body: JSON.stringify({ password }),
			});
			await refreshMembers();
			window.alert("비밀번호가 변경되었습니다.");
			document.getElementById("memberPasswordInput").value = "";
		} catch (error) {
			window.alert(error?.message || "비밀번호 변경 중 오류가 발생했습니다.");
		}
	});

	// 인원 추가 버튼 클릭
	// 인원 추가 버튼 클릭
	if (adminMemberAddBtn) {
		console.log("[Admin] Attaching click listener to adminMemberAddBtn");
		adminMemberAddBtn.addEventListener("click", (e) => {
			console.log("[Admin] Button clicked!", e);
			openMemberAddModal();
		});
	} else {
		console.error("[Admin] adminMemberAddBtn not found during event setup!");
	}

	// 인원 추가 모달 닫기
	document.querySelectorAll('[data-close-member-add]').forEach((btn) => {
		btn.addEventListener("click", closeMemberAddModal);
	});

	// 인원 추가 폼 제출
	memberAddForm?.addEventListener("submit", async (event) => {
		event.preventDefault();
		try {
			const email = String(document.getElementById("memberAddEmail")?.value || "").trim().toLowerCase();
			const password = String(document.getElementById("memberAddPassword")?.value || "").trim();
			const name = String(document.getElementById("memberAddName")?.value || "").trim();
			const phone = normalizePhoneFormat(String(document.getElementById("memberAddPhone")?.value || "").trim());
			const title = String(document.getElementById("memberAddTitle")?.value || "").trim() || "SW품질/책임";
			const birth = normalizeBirthFormat(String(document.getElementById("memberAddBirth")?.value || "").trim());
			const baseAddress = String(document.getElementById("memberAddAddress")?.value || "").trim();
			const detailAddress = String(document.getElementById("memberAddAddressDetail")?.value || "").trim();
			const address = [baseAddress, detailAddress].filter(Boolean).join(" ");
			const approved = Boolean(document.getElementById("memberAddApproved")?.checked);
			const canLogin = Boolean(document.getElementById("memberAddCanLogin")?.checked);
			const isAdmin = Boolean(document.getElementById("memberAddRole")?.checked);

			if (!email || !name || !password) {
				window.alert("이메일, 이름, 비밀번호는 필수입니다.");
				return;
			}
			if (!isValidEmail(email)) {
				window.alert("이메일 형식이 올바르지 않습니다.");
				return;
			}
			if (!isValidPhone(phone)) {
				window.alert(PHONE_RULE_TEXT);
				return;
			}
			if (!isValidBirth(birth)) {
				window.alert(BIRTH_RULE_TEXT);
				return;
			}
			if (!isValidPassword(password)) {
				window.alert(PASSWORD_RULE_TEXT);
				return;
			}

			const payload = {
				email,
				password,
				name,
				phone,
				title,
				birth,
				address,
				approved,
				can_login: canLogin,
				role: isAdmin ? "admin" : "user",
			};

			const result = await requestJson("/api/admin/users", {
				method: "POST",
				body: JSON.stringify(payload),
			});

			if (result.ok) {
				window.alert("인원이 추가되었습니다.");
				closeMemberAddModal();
				await refreshMembers();
			}
		} catch (error) {
			window.alert(error?.message || "인원 추가 중 오류가 발생했습니다.");
		}
	});

	adminMemberSearchInput?.addEventListener("input", () => applyMemberView(rawMemberItems));
	adminMemberStatusFilter?.addEventListener("change", () => applyMemberView(rawMemberItems));
	adminMemberRefreshBtn?.addEventListener("click", refreshMembers);

	adminApproveAllPendingBtn?.addEventListener("click", async () => {
		const pending = rawMemberItems.filter((x) => !Boolean(x.approved));
		if (!pending.length) {
			window.alert("승인 대기 계정이 없습니다.");
			return;
		}
		const ok = window.confirm(`승인 대기 ${pending.length}건을 모두 승인하시겠습니까?`);
		if (!ok) return;
		try {
			for (const item of pending) {
				const email = String(item.email || "").trim().toLowerCase();
				if (!email) continue;
				await requestJson(`/api/admin/users/${encodeURIComponent(email)}`, {
					method: "PUT",
					body: JSON.stringify({ approved: true, can_login: true }),
				});
			}
			await refreshMembers();
			window.alert("승인 대기 계정을 모두 승인했습니다.");
		} catch (error) {
			window.alert(error?.message || "일괄 승인 중 오류가 발생했습니다.");
		}
	});

	assetDeleteRequestBody?.addEventListener("click", async (event) => {
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;

		const detailRequestId = target.getAttribute("data-show-request-details");
		if (detailRequestId) {
			openRequestDetailModal(getPendingRequestById(detailRequestId));
			return;
		}

		const approveRequestId = target.getAttribute("data-approve-asset-request");
		if (approveRequestId) {
			const requestItem = getPendingRequestById(approveRequestId);
			const ok = window.confirm("이 요청을 승인 처리하시겠습니까?");
			if (!ok) return;
			try {
				await applyPendingRequestDecision(requestItem, "approve", "");
				await refreshAssetDeleteRequests();
				await refreshAssetDeletedItems();
				await refreshAssetRejectedItems();
				await refreshActivityLog();
				if (String(requestItem?.source_type || "") === "asset-delete") {
					window.location.hash = "#adminAssetDeletedTab";
					applyAdminHashMode();
				}
				window.alert("승인 처리되었습니다.");
			} catch (error) {
				window.alert(error?.message || "승인 처리 중 오류가 발생했습니다.");
			}
			return;
		}

		const rejectRequestId = target.getAttribute("data-reject-asset-request");
		if (rejectRequestId) {
			const requestItem = getPendingRequestById(rejectRequestId);
			const sourceType = String(requestItem?.source_type || "");
			const needReason = sourceType === "schedule";
			const promptText = needReason
				? "반려 사유를 입력해 주세요."
				: "반려 사유를 입력하세요. (선택사항)";
			const reason = window.prompt(promptText, "") ?? null;
			if (reason === null) return;
			if (needReason && !String(reason).trim()) {
				window.alert("일정 반려는 사유가 필요합니다.");
				return;
			}
			try {
				await applyPendingRequestDecision(requestItem, "reject", String(reason).trim());
				await refreshAssetDeleteRequests();
				await refreshAssetDeletedItems();
				await refreshAssetRejectedItems();
				await refreshActivityLog();
				if (sourceType === "asset-delete") {
					window.location.hash = "#adminAssetRejectedTab";
					applyAdminHashMode();
				}
				window.alert("반려 처리되었습니다.");
			} catch (error) {
				window.alert(error?.message || "반려 처리 중 오류가 발생했습니다.");
			}
			return;
		}

		const withdrawRequestId = target.getAttribute("data-withdraw-asset-request");
		if (!withdrawRequestId) return;
		const requestItem = getPendingRequestById(withdrawRequestId);
		const ok = window.confirm("삭제 요청을 철회하시겠습니까? 항목이 정상 상태로 복원됩니다.");
		if (!ok) return;
		try {
			await withdrawPendingRequest(requestItem);
			await refreshAssetDeleteRequests();
			await refreshAssetDeletedItems();
			await refreshAssetRejectedItems();
			await refreshActivityLog();
			window.alert("요청이 철회되었습니다.");
		} catch (error) {
			window.alert(error?.message || "요청 철회 처리 중 오류가 발생했습니다.");
		}
	});

	assetDeletedBody?.addEventListener("click", async (event) => {
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;
		const restoreDeletedId = target.getAttribute("data-restore-deleted-asset");
		if (restoreDeletedId) {
			const ok = window.confirm("삭제됨 항목을 단말관리로 복구하시겠습니까?");
			if (!ok) return;
			try {
				await requestJson(`/api/admin/assets/${encodeURIComponent(restoreDeletedId)}/restore-deleted`, {
					method: "POST",
					body: JSON.stringify({}),
				});
				await refreshAssetDeleteRequests();
				await refreshAssetDeletedItems();
				await refreshActivityLog();
				window.alert("복구가 완료되었습니다.");
			} catch (error) {
				window.alert(error?.message || "복구 처리 중 오류가 발생했습니다.");
			}
			return;
		}

		const cancelId = target.getAttribute("data-cancel-asset-approval");
		if (!cancelId) return;
		const ok = window.confirm("승인을 취소하고 요청을 무효화(단말관리 비노출) 하시겠습니까?");
		if (!ok) return;
		try {
			await requestJson(`/api/admin/assets/${encodeURIComponent(cancelId)}/cancel-approval`, {
				method: "POST",
				body: JSON.stringify({}),
			});
			await refreshAssetDeleteRequests();
			await refreshAssetDeletedItems();
			await refreshActivityLog();
			window.alert("승인 취소가 완료되었습니다. 요청이 무효화되어 단말관리에서 숨김 처리됩니다.");
		} catch (error) {
			window.alert(error?.message || "승인 취소 처리 중 오류가 발생했습니다.");
		}
	});

	assetRejectedBody?.addEventListener("click", async (event) => {
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;
		const restoreRejectedId = target.getAttribute("data-restore-rejected-asset");
		if (!restoreRejectedId) return;
		const ok = window.confirm("반려됨 항목을 단말관리 정상 상태로 복구하시겠습니까?");
		if (!ok) return;
		try {
			await requestJson(`/api/admin/assets/${encodeURIComponent(restoreRejectedId)}/restore-rejected`, {
				method: "POST",
				body: JSON.stringify({}),
			});
			await refreshAssetDeleteRequests();
			await refreshAssetRejectedItems();
			await refreshActivityLog();
			window.alert("복구가 완료되었습니다.");
		} catch (error) {
			window.alert(error?.message || "복구 처리 중 오류가 발생했습니다.");
		}
	});

	decisionQueueBody?.addEventListener("change", (event) => {
		const target = event.target;
		if (!(target instanceof HTMLInputElement)) return;
		if (!target.classList.contains("decision-row-check")) return;
		updateDecisionSelectionSummary();
	});

	decisionQueueBody?.addEventListener("click", (event) => {
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;
		const detailRequestId = target.getAttribute("data-show-request-details");
		if (detailRequestId) {
			openRequestDetailModal(getPendingRequestById(detailRequestId));
			return;
		}
		const withdrawRequestId = target.getAttribute("data-withdraw-decision-request");
		if (!withdrawRequestId) return;
		const requestItem = getPendingRequestById(withdrawRequestId);
		window.setTimeout(async () => {
			const ok = window.confirm("이 요청을 요청판단 화면에서 바로 취소하시겠습니까?");
			if (!ok) return;
			try {
				await withdrawPendingRequest(requestItem);
				await refreshAssetDeleteRequests();
				await refreshAssetDeletedItems();
				await refreshAssetRejectedItems();
				await refreshActivityLog();
				window.alert("요청이 철회되었습니다.");
			} catch (error) {
				window.alert(error?.message || "요청 취소 처리 중 오류가 발생했습니다.");
			}
		}, 0);
	});

	decisionQueueCheckAll?.addEventListener("change", (event) => {
		const checked = Boolean((event.target instanceof HTMLInputElement) && event.target.checked);
		document.querySelectorAll(".decision-row-check").forEach((el) => {
			if (el instanceof HTMLInputElement && !el.disabled) el.checked = checked;
		});
		updateDecisionSelectionSummary();
	});

	decisionApplyBtn?.addEventListener("click", async () => {
		const selectedIds = getSelectedDecisionIds();
		if (!selectedIds.length) {
			window.alert("먼저 판단할 요청 건을 선택해 주세요.");
			return;
		}
		const decisionType = getDecisionType();
		const reason = String(decisionBulkRejectReasonInput?.value || "").trim();
		if (decisionType === "reject" && !reason) {
			window.alert("반려 사유를 입력해 주세요.");
			return;
		}
		const actionLabel = decisionType === "approve" ? "승인" : "반려";
		const ok = window.confirm(`${selectedIds.length}건을 ${actionLabel} 처리하시겠습니까?`);
		if (!ok) return;
		try {
			for (const requestId of selectedIds) {
				const requestItem = getPendingRequestById(requestId);
				await applyPendingRequestDecision(requestItem, decisionType, reason);
			}
			await refreshAssetDeleteRequests();
			await refreshAssetDeletedItems();
			await refreshAssetRejectedItems();
			await refreshActivityLog();
			if (decisionBulkRejectReasonInput) decisionBulkRejectReasonInput.value = "";
			preferredDecisionId = "";
			renderDecisionQueue(pendingDeleteRequests);
		} catch (error) {
			window.alert(error?.message || "요청 승인 처리 중 오류가 발생했습니다.");
		}
	});

	decisionWithdrawSelectedBtn?.addEventListener("click", async () => {
		const selectedIds = getSelectedDecisionIds();
		if (!selectedIds.length) {
			window.alert("먼저 요청취소할 항목을 선택해 주세요.");
			return;
		}
		const ok = window.confirm(`${selectedIds.length}건을 요청취소하시겠습니까?`);
		if (!ok) return;
		try {
			for (const requestId of selectedIds) {
				const requestItem = getPendingRequestById(requestId);
				await withdrawPendingRequest(requestItem);
			}
			await refreshAssetDeleteRequests();
			await refreshAssetDeletedItems();
			await refreshAssetRejectedItems();
			await refreshActivityLog();
			preferredDecisionId = "";
			window.alert("선택한 요청이 취소되었습니다.");
		} catch (error) {
			window.alert(error?.message || "선택 요청 취소 처리 중 오류가 발생했습니다.");
		}
	});

	requestDetailModal?.addEventListener("click", (event) => {
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;
		if (!target.closest("[data-close-request-detail='1']")) return;
		closeRequestDetailModal();
	});

	document.addEventListener("keydown", (event) => {
		if (event.key !== "Escape") return;
		if (!memberEditModal?.hidden) {
			closeMemberEditModal();
			return;
		}
		if (requestDetailModal?.hidden) return;
		closeRequestDetailModal();
	});

	function renderActivityLog(items) {
		if (!activityLogBody) return;
		activityLogItems = Array.isArray(items) ? items : [];
		if (!items.length) {
			activityLogBody.innerHTML = '<tr><td colspan="5">기록된 활동이 없습니다.</td></tr>';
			return;
		}
		const KIND_LABEL = { removed: "🗑️ 삭제", updated: "✏️ 변경", added: "➕ 추가" };
		activityLogBody.innerHTML = items
			.map((x, idx) => {
				const kindLabel = KIND_LABEL[x.kind] || x.kind || "-";
				const detailLines = Array.isArray(x.details)
					? x.details.map((line) => String(line || "").trim()).filter(Boolean)
					: [];
				const summary = detailLines.length ? detailLines[0] : "-";
				const hasMore = detailLines.length > 1;
				const detailTitle = `활동 상세 · ${String(x.title || "작업 내용")}`;
				const canWithdrawApproval = Boolean(x?.can_withdraw_schedule_approval && x?.target_schedule_id);
				const targetScheduleId = String(x?.target_schedule_id || "").trim();
				return `
					<tr>
						<td style="white-space:nowrap;">${esc(formatDisplayDateTime(x.updated_at || ""))}</td>
						<td>${esc(x.actor || "-")}</td>
						<td><span class="scope-badge">${esc(x.scope || "-")}</span></td>
						<td>${esc(kindLabel)} · ${esc(x.title || "-")}</td>
						<td class="detail-cell">
							<button type="button" class="btn-secondary" data-show-activity-details="${idx}" data-activity-title="${esc(detailTitle)}">항목상세</button>
							${canWithdrawApproval ? `<button type="button" class="btn-ghost" data-withdraw-schedule-approval="${esc(targetScheduleId)}">승인철회</button>` : ""}
							<div class="hint">${esc(summary)}${hasMore ? ` 외 ${detailLines.length - 1}건` : ""}</div>
						</td>
					</tr>
				`;
			})
			.join("");
	}

	activityLogBody?.addEventListener("click", async (event) => {
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;

		const withdrawScheduleId = String(target.getAttribute("data-withdraw-schedule-approval") || "").trim();
		if (withdrawScheduleId) {
			const ok = window.confirm("해당 일정의 승인 상태를 철회(승인 대기) 하시겠습니까?");
			if (!ok) return;
			try {
				await requestJson(`/api/manage/schedules/${encodeURIComponent(withdrawScheduleId)}/cancel-approval`, {
					method: "POST",
					body: JSON.stringify({}),
				});
				await refreshAssetDeleteRequests();
				await refreshActivityLog();
				window.alert("일정 승인 철회가 완료되었습니다.");
			} catch (error) {
				window.alert(error?.message || "일정 승인 철회 처리 중 오류가 발생했습니다.");
			}
			return;
		}

		const rawIndex = target.getAttribute("data-show-activity-details");
		if (rawIndex == null) return;
		const index = Number(rawIndex);
		if (!Number.isInteger(index) || index < 0 || index >= activityLogItems.length) return;
		const item = activityLogItems[index] || {};
		const lines = Array.isArray(item.details) ? item.details : [];
		const title = String(target.getAttribute("data-activity-title") || "활동 상세");
		openDetailModal(title, lines);
	});

	async function refreshActivityLog() {
		if (!activityLogBody) return;
		try {
			const data = await requestJson("/api/admin/activity-log?limit=300&include_all=1", { method: "GET" });
			const items = Array.isArray(data.items) ? data.items : [];
			renderActivityLog(items);
		} catch (error) {
			activityLogBody.innerHTML = `<tr><td colspan="5">${esc(error?.message || "활동 이력을 불러오지 못했습니다.")}</td></tr>`;
		}
	}

	window.addEventListener("hashchange", applyAdminHashMode);
	applyAdminHashMode();
	refreshMembers();
	refreshAssetDeleteRequests();
	refreshAssetDeletedItems();
	refreshAssetRejectedItems();
	refreshActivityLog();

	// ── 게시판 승인 관리 ────────────────────────────────────────────
	let boardAdminFilter = 'pending';

	function escBoard(s) {
		return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
	}
	function fmtBoardDate(iso) {
		if (!iso) return '-';
		try { return new Intl.DateTimeFormat('ko-KR', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }).format(new Date(iso + 'Z')); } catch { return iso; }
	}
	function priorityBadge(p) {
		if (p === 'High')   return `<span class="board-priority-badge priority-high"><i class="fas fa-exclamation-circle"></i> High</span>`;
		if (p === 'Low')    return `<span class="board-priority-badge priority-low"><i class="fas fa-arrow-circle-down"></i> Low</span>`;
		return `<span class="board-priority-badge priority-medium"><i class="fas fa-minus-circle"></i> Medium</span>`;
	}

	async function refreshAdminBoardPosts() {
		const container = document.getElementById('adminBoardPostsList');
		if (!container) return;
		container.innerHTML = '<p class="hint"><i class="fas fa-circle-notch fa-spin"></i> 불러오는 중...</p>';
		try {
			const r = await fetch('/api/board/posts', { credentials: 'include' });
			const data = await r.json();
			let items = data.items || [];
			if (boardAdminFilter === 'pending') {
				items = items.filter(p => p.status === 'pending');
			}
			if (items.length === 0) {
				container.innerHTML = '<p class="hint" style="padding:16px">해당 게시글이 없습니다.</p>';
				return;
			}
			container.innerHTML = items.map(p => {
				const priorityCls = `priority-${String(p.priority).toLowerCase()}`;
				const statusBadge = p.status === 'approved'
					? `<span style="color:#059669;font-size:0.75rem;font-weight:600;">✅ 승인됨</span>`
					: p.status === 'rejected'
					? `<span style="color:#dc2626;font-size:0.75rem;font-weight:600;">❌ 반려됨</span>`
					: p.status === 'withdrawn'
					? `<span style="color:#64748b;font-size:0.75rem;font-weight:600;">↩️ 철회됨</span>`
					: `<span style="color:#ca8a04;font-size:0.75rem;font-weight:600;">⏳ 대기</span>`;
				const isWithdrawn = p.status === 'withdrawn';
				return `<div class="board-admin-post-card ${priorityCls}" data-post-id="${escBoard(p.id)}">
					<div>
						<div class="board-admin-post-meta">
							${priorityBadge(p.priority)}
							${statusBadge}
							<span style="font-size:0.73rem;color:#94a3b8;">${fmtBoardDate(p.created_at)}</span>
						</div>
						<div class="board-admin-post-title">${escBoard(p.title)}</div>
						<div class="board-admin-post-info">
							<i class="fas fa-user"></i> ${escBoard(p.author_name)}
							${p.comment_count > 0 ? ` &nbsp;<i class="fas fa-comment"></i> ${p.comment_count}` : ''}
							${p.file_count > 0 ? ` &nbsp;<i class="fas fa-paperclip"></i> ${p.file_count}` : ''}
						</div>
					</div>
					<div class="board-admin-post-actions">
						${!isWithdrawn && p.status !== 'approved' ? `<button type="button" class="btn-approve board-admin-approve-btn" data-id="${escBoard(p.id)}" style="padding:6px 12px;font-size:0.8rem;"><i class="fas fa-check"></i> 승인</button>` : ''}
						${!isWithdrawn && p.status !== 'rejected' ? `<button type="button" class="btn-reject board-admin-reject-btn" data-id="${escBoard(p.id)}" style="padding:6px 12px;font-size:0.8rem;"><i class="fas fa-times"></i> 반려</button>` : ''}
						<a href="/board#${escBoard(p.id)}" target="_blank" style="padding:6px 12px;font-size:0.8rem;border:1px solid #c7d5eb;border-radius:7px;color:#334155;text-decoration:none;display:inline-flex;align-items:center;gap:4px;"><i class="fas fa-external-link-alt"></i> 보기</a>
						<button type="button" class="btn-reject board-admin-delete-btn" data-id="${escBoard(p.id)}" title="게시글 영구 삭제" style="padding:6px 12px;font-size:0.8rem;background:#fee2e2;border-color:#fca5a5;color:#b91c1c;"><i class="fas fa-trash"></i></button>
					</div>
				</div>`;
			}).join('');

			// 승인 버튼
			container.querySelectorAll('.board-admin-approve-btn').forEach(btn => {
				btn.addEventListener('click', async () => {
					const id = btn.dataset.id;
					btn.disabled = true;
					try {
						const r = await fetch(`/api/board/posts/${encodeURIComponent(id)}/approve`, { method: 'POST', credentials: 'include' });
						if (!r.ok) throw new Error(await r.text());
						await refreshAdminBoardPosts();
						await refreshAdminIssueManagement(true);
					} catch (e) { btn.disabled = false; alert('승인 실패: ' + e.message); }
				});
			});

			// 반려 버튼
			container.querySelectorAll('.board-admin-reject-btn').forEach(btn => {
				btn.addEventListener('click', async () => {
					const id = btn.dataset.id;
					const reason = prompt('반려 사유를 입력하세요 (선택사항)');
					if (reason === null) return;
					btn.disabled = true;
					try {
						const r = await fetch(`/api/board/posts/${encodeURIComponent(id)}/reject`, {
							method: 'POST',
							credentials: 'include',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ reason }),
						});
						if (!r.ok) throw new Error(await r.text());
						await refreshAdminBoardPosts();
						await refreshAdminIssueManagement(true);
					} catch (e) { btn.disabled = false; alert('반려 실패: ' + e.message); }
				});
			});

			// 삭제 버튼
			container.querySelectorAll('.board-admin-delete-btn').forEach(btn => {
				btn.addEventListener('click', async () => {
					const id = btn.dataset.id;
					if (!confirm('이 게시글을 영구 삭제하시겠습니까?\n\n삭제 후 복구가 불가능합니다.')) return;
					btn.disabled = true;
					try {
						const r = await fetch(`/api/board/posts/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
						if (!r.ok) throw new Error(await r.text());
						await refreshAdminBoardPosts();
						await refreshAdminIssueManagement(true);
					} catch (e) { btn.disabled = false; alert('삭제 실패: ' + e.message); }
				});
			});
		} catch (e) {
			container.innerHTML = `<p class="hint" style="color:#dc2626;">불러오기 실패: ${escBoard(e.message)}</p>`;
		}
	}

	// 게시판 필터 버튼
	document.querySelectorAll('.board-admin-filter-btn').forEach(btn => {
		btn.addEventListener('click', () => {
			document.querySelectorAll('.board-admin-filter-btn').forEach(b => b.classList.remove('active'));
			btn.classList.add('active');
			boardAdminFilter = btn.dataset.status;
			refreshAdminBoardPosts();
		});
	});
	document.getElementById('adminBoardRefreshBtn')?.addEventListener('click', refreshAdminBoardPosts);
	adminIssueSearchInput?.addEventListener("input", scheduleAdminIssueRefresh);
	adminIssueQuickMembers?.addEventListener("click", (event) => {
		const button = event.target.closest(".admin-issue-chip");
		if (!button) return;
		applyAdminIssueReporterFilter(button.getAttribute("data-reporter"));
	});
	adminIssuePodium?.addEventListener("click", (event) => {
		const button = event.target.closest(".admin-issue-podium-card");
		if (!button) return;
		applyAdminIssueReporterFilter(button.getAttribute("data-reporter"));
	});
	adminIssueSummaryVisual?.addEventListener("click", (event) => {
		const actionButton = event.target.closest(".admin-issue-member-filter-btn");
		if (actionButton) {
			event.stopPropagation();
			applyAdminIssueReporterFilter(actionButton.getAttribute("data-reporter"));
			return;
		}
		const card = event.target.closest(".admin-issue-summary-card[data-reporter]");
		if (!card) return;
		applyAdminIssueReporterFilter(card.getAttribute("data-reporter"));
	});
	adminIssueMemberRows?.addEventListener("click", (event) => {
		const actionButton = event.target.closest(".admin-issue-author-link, .admin-issue-member-filter-btn");
		if (actionButton) {
			event.stopPropagation();
			applyAdminIssueReporterFilter(actionButton.getAttribute("data-reporter"));
			return;
		}
		const row = event.target.closest(".admin-issue-summary-row[data-reporter]");
		if (!row) return;
		applyAdminIssueReporterFilter(row.getAttribute("data-reporter"));
	});
	adminIssueAuthorFilter?.addEventListener("change", () => {
		adminIssueDetailLimit = 120;
		adminIssueDetailOffset = 0;
		refreshAdminIssueManagement();
	});
	adminIssueStatusFilter?.addEventListener("change", () => {
		adminIssueDetailLimit = 120;
		adminIssueDetailOffset = 0;
		refreshAdminIssueManagement();
	});
	adminIssueSortFilter?.addEventListener("change", () => {
		adminIssueDetailLimit = 120;
		adminIssueDetailOffset = 0;
		refreshAdminIssueManagement();
	});
	adminIssueStartDate?.addEventListener("change", () => {
		adminIssueDetailLimit = 120;
		adminIssueDetailOffset = 0;
		updateAdminIssueRangeButtons();
		refreshAdminIssueManagement();
	});
	adminIssueEndDate?.addEventListener("change", () => {
		adminIssueDetailLimit = 120;
		adminIssueDetailOffset = 0;
		updateAdminIssueRangeButtons();
		refreshAdminIssueManagement();
	});
	adminIssueRefreshBtn?.addEventListener("click", () => {
		refreshAdminIssueManagement(true);
	});
	adminIssueDetailToggleBtn?.addEventListener("click", () => {
		setAdminIssueDetailCollapsed(!adminIssueDetailCollapsed);
	});
	adminIssueLoadMoreBtn?.addEventListener("click", () => {
		adminIssueDetailLimit = ADMIN_ISSUE_DETAIL_STEP;
		refreshAdminIssueDetailOnly(true);
	});
	adminIssueExportBtn?.addEventListener("click", exportAdminIssueManagement);
	adminIssueRangeButtons.forEach((button) => {
		button.addEventListener("click", () => {
			setAdminIssueDateRange(button.getAttribute("data-range") || "all");
		});
	});
	adminIssuePerfWindowButtons.forEach((button) => {
		button.addEventListener("click", () => {
			const next = Number(button.getAttribute("data-window-sec") || 60);
			if (next === adminIssuePerfWindowSec) return;
			adminIssuePerfWindowSec = next;
			updateAdminIssuePerfWindowButtons();
			refreshAdminIssuePerfSummary();
		});
	});
	adminIssueResetBtn?.addEventListener("click", () => {
		if (adminIssueSearchInput) adminIssueSearchInput.value = "";
		if (adminIssueAuthorFilter) adminIssueAuthorFilter.value = "";
		if (adminIssueStatusFilter) adminIssueStatusFilter.value = "all";
		if (adminIssueSortFilter) adminIssueSortFilter.value = "score_desc";
		if (adminIssueStartDate) adminIssueStartDate.value = "";
		if (adminIssueEndDate) adminIssueEndDate.value = "";
		adminIssueDetailLimit = 120;
		adminIssueDetailOffset = 0;
		adminIssuePerfWindowSec = 60;
		updateAdminIssuePerfWindowButtons();
		updateAdminIssueRangeButtons();
		refreshAdminIssueManagement(true);
	});
	adminCompanyMemberAddBtn?.addEventListener("click", () => {
		updateAdminCompanyMember("add");
	});
	adminCompanyMemberRemoveBtn?.addEventListener("click", () => {
		updateAdminCompanyMember("remove");
	});
	adminCompanyMemberInput?.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			event.preventDefault();
			updateAdminCompanyMember("add");
		}
	});

	refreshAdminBoardPosts();
	refreshAdminCompanyMembers();
	setAdminIssueDetailCollapsed(false);
	setInterval(refreshAdminBoardPosts, 60000);
	scheduleAdminIssueAutoRefresh();
})();
