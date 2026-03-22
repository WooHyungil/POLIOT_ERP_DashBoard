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
	const adminMainGrid = document.getElementById("adminMainGrid");
	const adminMemberSearchInput = document.getElementById("adminMemberSearchInput");
	const adminMemberStatusFilter = document.getElementById("adminMemberStatusFilter");
	const adminMemberRefreshBtn = document.getElementById("adminMemberRefreshBtn");
	const adminMemberResultCount = document.getElementById("adminMemberResultCount");
	const adminMemberAddBtn = document.getElementById("adminMemberAddBtn");
	const memberEditModal = document.getElementById("memberEditModal");
	const memberEditForm = document.getElementById("memberEditForm");
	const memberEditEmail = document.getElementById("memberEditEmail");
	const memberEditName = document.getElementById("memberEditName");
	const memberEditRole = document.getElementById("memberEditRole");
	const memberEditTitle = document.getElementById("memberEditTitle");
	const memberEditPhone = document.getElementById("memberEditPhone");
	const memberEditBirth = document.getElementById("memberEditBirth");
	const memberEditAddress = document.getElementById("memberEditAddress");
	const memberEditApproved = document.getElementById("memberEditApproved");
	const memberEditCanLogin = document.getElementById("memberEditCanLogin");
	const memberEditGameAccess = document.getElementById("memberEditGameAccess");
	const memberPasswordForm = document.getElementById("memberPasswordForm");
	const memberPasswordInput = document.getElementById("memberPasswordInput");
	const memberAddModal = document.getElementById("memberAddModal");
	const memberAddForm = document.getElementById("memberAddForm");
	const memberAddEmail = document.getElementById("memberAddEmail");
	const memberAddName = document.getElementById("memberAddName");
	const memberAddRole = document.getElementById("memberAddRole");
	const memberAddTitle = document.getElementById("memberAddTitle");
	const memberAddPhone = document.getElementById("memberAddPhone");
	const memberAddPassword = document.getElementById("memberAddPassword");
	const memberAddApproved = document.getElementById("memberAddApproved");
	const memberAddCanLogin = document.getElementById("memberAddCanLogin");
	if (!memberBody) return;
	const activityLogBody = document.getElementById("activityLogRows");
	const requestDetailModal = document.getElementById("requestDetailModal");
	const requestDetailTitle = document.getElementById("requestDetailTitle");
	const requestDetailList = document.getElementById("requestDetailList");
	const ADMIN_SECTION_IDS = ["adminIssueTab", "adminPeopleTab", "adminAssetDecisionTab", "adminAssetApprovalTab", "adminBoardApprovalTab", "adminActivityLogTab", "adminAssetDeletedTab", "adminAssetRejectedTab"];
	let pendingDeleteRequests = [];
	let activityLogItems = [];
	let preferredDecisionId = "";
	let canManageGameAccess = false;
	let allMembers = [];

	const CORE_ADMINS = new Set(["sue@poliot.co.kr", "hiss0723@poliot.co.kr"]);

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

	function applyMemberFilters(items) {
		const keyword = String(adminMemberSearchInput?.value || "").trim().toLowerCase();
		const status = String(adminMemberStatusFilter?.value || "all").trim().toLowerCase();
		return (items || []).filter((x) => {
			const role = String(x.role || "user").toLowerCase();
			const approved = Boolean(x.approved);
			const canLogin = Boolean(x.can_login);
			const haystack = [
				String(x.name || ""),
				String(x.email || ""),
				String(x.title || ""),
				String(x.phone || ""),
			]
				.join(" ")
				.toLowerCase();

			if (keyword && !haystack.includes(keyword)) return false;
			if (status === "pending" && approved) return false;
			if (status === "approved" && !approved) return false;
			if (status === "blocked" && canLogin) return false;
			if (status === "admin" && role !== "admin") return false;
			return true;
		});
	}

	function updateMemberResultCount(visibleCount, totalCount) {
		if (!adminMemberResultCount) return;
		adminMemberResultCount.textContent = `조회 결과 ${visibleCount}명 / 전체 ${totalCount}명`;
	}

	function renderMembers(items) {
		const visibleItems = applyMemberFilters(items);
		updateMemberResultCount(visibleItems.length, items.length);

		if (!visibleItems.length) {
			memberBody.innerHTML = '<div class="admin-member-empty">조건에 맞는 계정이 없습니다.</div>';
			setDetailSummary(items);
			return;
		}

		memberBody.innerHTML = visibleItems
			.map((x) => {
				const email = String(x.email || "").toLowerCase();
				const isCoreAdmin = CORE_ADMINS.has(email);
				const approved = Boolean(x.approved);
				const canLogin = Boolean(x.can_login);
				const gameAccess = Boolean(x.game_access);
				const isAdminRole = String(x.role || "").toLowerCase() === "admin";
				const canToggleGame = canManageGameAccess && email !== "hiss0723@poliot.co.kr" && !isAdminRole;
				const gameButtonTitle = !canManageGameAccess
					? "게임 권한은 hiss0723 계정만 변경할 수 있습니다"
					: (isAdminRole ? "관리자 계정의 게임 권한은 변경할 수 없습니다" : (email === "hiss0723@poliot.co.kr" ? "관리자 본인 계정은 변경할 수 없습니다" : "게임 권한 변경"));
				const titlePhone = [String(x.title || "").trim(), String(x.phone || "").trim()].filter(Boolean).join(" / ") || "-";
				const createdAt = formatDisplayDateTime(x.created_at || "");
				const role = String(x.role || "user").toLowerCase();
				const roleKr = role === "admin" ? "관리자" : "사용자";
				const approvedStatus = approved ? "승인완료" : "승인대기";
				const loginStatus = canLogin ? "허용" : "차단";
				const gameStatus = gameAccess ? "허용" : "차단";
				const safeName = String(x.name || "이름없음");
				const avatarText = safeName ? safeName.charAt(0).toUpperCase() : "?";
				
				return `
					<div class="admin-member-card" data-member-email="${esc(email)}">
						<div class="admin-member-card-header">
							<div class="admin-member-card-main">
								<div class="admin-member-card-avatar">
									${esc(avatarText)}
								</div>
								<div class="admin-member-card-info">
									<h3 class="admin-member-card-name">${esc(safeName)}</h3>
									<p class="admin-member-card-email">${esc(email)}</p>
									<p class="admin-member-card-title">${esc(titlePhone)}</p>
								</div>
							</div>
							<div class="admin-member-card-badges">
								<span class="admin-member-status-badge is-${role}">${esc(roleKr)}</span>
								<span class="admin-member-status-badge is-${approved ? "approved" : "pending"}">${esc(approvedStatus)}</span>
							</div>
						</div>

						<div class="admin-member-meta-grid">
							<div class="admin-member-meta-item"><span>로그인</span><strong>${esc(loginStatus)}</strong></div>
							<div class="admin-member-meta-item"><span>게임 권한</span><strong>${esc(gameStatus)}</strong></div>
							<div class="admin-member-meta-item"><span>가입일</span><strong>${esc(createdAt)}</strong></div>
						</div>
						
						<div class="admin-member-card-actions">
							<button type="button" class="btn-warning" data-edit-member="${esc(email)}" title="회원 정보 수정">
								<i class="fas fa-edit"></i> 수정
							</button>
							${!approved ? `<button type="button" class="btn-primary" data-approve-member="${esc(email)}" title="회원 승인">
								<i class="fas fa-check"></i> 승인
							</button>` : ""}
							<button type="button" class="btn-secondary" data-toggle-login-member="${esc(email)}" data-next-login="${canLogin ? "0" : "1"}" ${isCoreAdmin ? "disabled" : ""} title="${canLogin ? "로그인 차단" : "로그인 허용"}">
								<i class="fas fa-${canLogin ? "ban" : "check"}"></i> 로그인 ${canLogin ? "차단" : "허용"}
							</button>
							<button type="button" class="btn-secondary" data-toggle-game-member="${esc(email)}" data-next-game="${gameAccess ? "0" : "1"}" ${canToggleGame ? "" : "disabled"} title="${esc(gameButtonTitle)}">
								<i class="fas fa-gamepad"></i> 게임 ${gameAccess ? "차단" : "허용"}
							</button>
							<button type="button" class="btn-ghost" data-del-member="${esc(email)}" ${isCoreAdmin ? "disabled" : ""} title="사용자 삭제">
								<i class="fas fa-trash"></i> 삭제
							</button>
						</div>
					</div>
				`;
			})
			.join("");

		setDetailSummary(items);
	}

	function bindMemberToolbarEvents() {
		adminMemberSearchInput?.addEventListener("input", () => {
			renderMembers(allMembers);
		});
		adminMemberStatusFilter?.addEventListener("change", () => {
			renderMembers(allMembers);
		});
		adminMemberRefreshBtn?.addEventListener("click", () => {
			refreshMembers();
		});
	}

	// ── 회원 수정 모달 ───────────────────────────────────────────────
	function openMemberEditModal(memberData) {
		if (!memberEditModal) return;
		const email = String(memberData.email || "").toLowerCase();
		const isCoreAdmin = CORE_ADMINS.has(email);
		const isAdminRole = String(memberData.role || "").toLowerCase() === "admin";
		if (memberEditEmail) memberEditEmail.value = email;
		if (memberEditName) memberEditName.value = String(memberData.name || "");
		if (memberEditRole) {
			memberEditRole.value = String(memberData.role || "user");
			memberEditRole.disabled = isCoreAdmin;
		}
		if (memberEditTitle) memberEditTitle.value = String(memberData.title || "");
		if (memberEditPhone) memberEditPhone.value = String(memberData.phone || "");
		if (memberEditBirth) memberEditBirth.value = String(memberData.birth || "");
		if (memberEditAddress) memberEditAddress.value = String(memberData.address || "");
		if (memberEditApproved) {
			memberEditApproved.checked = Boolean(memberData.approved);
			memberEditApproved.disabled = isCoreAdmin;
		}
		if (memberEditCanLogin) {
			memberEditCanLogin.checked = Boolean(memberData.can_login);
			memberEditCanLogin.disabled = isCoreAdmin;
		}
		if (memberEditGameAccess) {
			memberEditGameAccess.checked = Boolean(memberData.game_access);
			memberEditGameAccess.disabled = !canManageGameAccess || email === "hiss0723@poliot.co.kr" || isAdminRole;
		}
		if (memberPasswordInput) memberPasswordInput.value = "";
		memberEditModal.hidden = false;
		document.body.classList.add("modal-open");
	}

	function closeMemberEditModal() {
		if (!memberEditModal) return;
		memberEditModal.hidden = true;
		document.body.classList.remove("modal-open");
	}

	// ── 회원 추가 모달 ───────────────────────────────────────────────
	function openMemberAddModal() {
		if (!memberAddModal) return;
		if (memberAddForm) memberAddForm.reset();
		memberAddModal.hidden = false;
		document.body.classList.add("modal-open");
	}

	function closeMemberAddModal() {
		if (!memberAddModal) return;
		memberAddModal.hidden = true;
		document.body.classList.remove("modal-open");
	}

	async function requestJson(url, options) {
		const res = await fetch(url, {
			credentials: "same-origin",
			headers: { "Content-Type": "application/json" },
			...options,
		});
		let data = {};
		try {
			data = await res.json();
		} catch {
			data = {};
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
			canManageGameAccess = Boolean(data.can_manage_game_access);
			const items = Array.isArray(data.items) ? data.items : [];
			items.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
			allMembers = items;
			renderMembers(allMembers);
		} catch (error) {
			memberBody.innerHTML = `<div class="admin-member-empty is-error">${esc(error?.message || "사용자 목록을 불러오지 못했습니다.")}</div>`;
			updateMemberResultCount(0, 0);
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
				const canDecide = sourceType === "asset-delete" || sourceType === "schedule" || sourceType === "board";
				const canWithdraw = sourceType === "asset-delete" || sourceType === "schedule" || sourceType === "board";
				return `
					<tr>
						<td>${esc(x.page_name || "-")}</td>
						<td>${esc(x.requester_name || "-")}<br /><span class="hint">${esc(x.requester_id || "-")}</span></td>
						<td>${esc(formatDisplayDateTime(x.requested_at || ""))}</td>
						<td><button type="button" class="btn-secondary" data-show-request-details="${esc(requestId)}">내용</button></td>
						<td>
							<button type="button" data-open-asset-decision="${esc(requestId)}" ${canDecide ? "" : "disabled"}>판단하기</button>
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
			return sourceType === "asset-delete" || sourceType === "schedule" || sourceType === "board";
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
		if (sourceType === "board") {
			await requestJson(`/api/board/posts/${encodeURIComponent(withdrawId)}/withdraw`, {
				method: "POST",
				body: JSON.stringify({ reason: "관리자 요청취소 처리" }),
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
				const canDecide = sourceType === "asset-delete" || sourceType === "schedule" || sourceType === "board";
				const canWithdraw = sourceType === "asset-delete" || sourceType === "schedule" || sourceType === "board";
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
				const sourceType = String(x.source_type || "asset");
				const targetId = String(x.target_id || "");
				const requestedBy = String(x.requested_by || "-");
				const reviewedBy = String(x.reviewed_by || "-");
				const requestedAt = String(x.requested_at || "");
				const reviewedAt = String(x.reviewed_at || "");
				const stateText = String(x.state_text || "삭제완료");
				const titleText = String(x.title_text || "-");
				let actionHtml = "<span class=\"hint\">-</span>";
				if (sourceType === "asset") {
					actionHtml = `
						<button type="button" class="btn-secondary" data-restore-deleted-asset="${esc(targetId)}">복구</button>
						<button type="button" class="btn-ghost" data-cancel-asset-approval="${esc(targetId)}">승인취소</button>
					`;
				}
				return `
					<tr>
						<td><span class="scope-badge">${esc(x.scope_name || "-")}</span></td>
						<td>${esc(titleText)}</td>
						<td>${esc(requestedBy)}</td>
						<td>${esc(reviewedBy)}</td>
						<td>${esc(formatDisplayDateTime(requestedAt))}</td>
						<td>${esc(formatDisplayDateTime(reviewedAt))}</td>
						<td><span class="asset-status-badge status-approved">${esc(stateText)}</span></td>
						<td>${actionHtml}</td>
					</tr>
				`;
			})
			.join("");
	}

	async function refreshAssetDeletedItems() {
		if (!assetDeletedBody) return;
		try {
			const [assetData, activityData] = await Promise.all([
				requestJson("/api/admin/assets/deleted-items", { method: "GET" }),
				requestJson("/api/admin/activity-log?limit=300&include_all=1", { method: "GET" }),
			]);
			const assetItems = Array.isArray(assetData.items) ? assetData.items : [];
			const activityItems = Array.isArray(activityData.items) ? activityData.items : [];
			const mappedAssets = assetItems.map((x) => {
				const reqStatus = String(x.delete_request_status || "none").toLowerCase();
				const isCancelled = reqStatus === "cancelled";
				return {
					source_type: "asset",
					scope_name: "단말관리",
					target_id: String(x.id || ""),
					title_text: [String(x["구 관리번호"] || "").trim(), String(x["NEW 관리 번호"] || "").trim()].filter(Boolean).join(" / ") || String(x.id || "-"),
					requested_by: String(x.delete_requested_by || "-"),
					reviewed_by: isCancelled ? String(x.delete_cancelled_by || "-") : String(x.delete_reviewed_by || "-"),
					requested_at: String(x.delete_requested_at || ""),
					reviewed_at: isCancelled ? String(x.delete_cancelled_at || "") : String(x.delete_reviewed_at || ""),
					state_text: isCancelled ? "승인취소" : "삭제승인",
				};
			});
			const mappedRemovedLogs = activityItems
				.filter((x) => String(x.kind || "").toLowerCase() === "removed")
				.map((x) => ({
					source_type: "activity",
					scope_name: String(x.scope || "기타"),
					target_id: "",
					title_text: String(x.title || "삭제 이력"),
					requested_by: String(x.actor || "-"),
					reviewed_by: String(x.actor || "-"),
					requested_at: String(x.updated_at || ""),
					reviewed_at: String(x.updated_at || ""),
					state_text: "삭제처리",
				}));
			const merged = mappedAssets.concat(mappedRemovedLogs);
			merged.sort((a, b) => String(b.reviewed_at || b.requested_at || "").localeCompare(String(a.reviewed_at || a.requested_at || "")));
			renderAssetDeletedItems(merged);
		} catch (error) {
			assetDeletedBody.innerHTML = `<tr><td colspan="8">${esc(error?.message || "삭제된 목록을 불러오지 못했습니다.")}</td></tr>`;
		}
	}

	function renderAssetRejectedItems(items) {
		if (!assetRejectedBody) return;
		if (!items.length) {
			assetRejectedBody.innerHTML = '<tr><td colspan="8">반려된 항목이 없습니다.</td></tr>';
			return;
		}
		assetRejectedBody.innerHTML = items
			.map((x) => {
				const sourceType = String(x.source_type || "");
				const targetId = String(x.target_id || "");
				let actionHtml = "<span class=\"hint\">-</span>";
				if (sourceType === "asset") {
					actionHtml = `<button type="button" class="btn-secondary" data-restore-rejected-asset="${esc(targetId)}">복구</button>`;
				} else if (sourceType === "board") {
					actionHtml = `<a href="/board#${esc(targetId)}" class="btn-secondary" style="display:inline-flex;align-items:center;">게시글 보기</a>`;
				} else if (sourceType === "schedule") {
					actionHtml = '<a href="/manage#manageScheduleTab" class="btn-secondary" style="display:inline-flex;align-items:center;">일정 보기</a>';
				}
				return `
					<tr>
						<td><span class="scope-badge">${esc(x.scope_name || "-")}</span></td>
						<td>${esc(x.title_text || "-")}</td>
						<td>${esc(x.requested_by || "-")}</td>
						<td>${esc(x.reviewed_by || "-")}</td>
						<td>${esc(formatDisplayDateTime(x.requested_at || ""))}</td>
						<td>${esc(formatDisplayDateTime(x.reviewed_at || ""))}</td>
						<td>${esc(x.reject_reason || "-")}</td>
						<td>${actionHtml}</td>
					</tr>
				`;
			})
			.join("");
	}

	async function refreshAssetRejectedItems() {
		if (!assetRejectedBody) return;
		try {
			const [assetData, scheduleData, boardData] = await Promise.all([
				requestJson("/api/admin/assets/rejected-items", { method: "GET" }),
				requestJson("/api/manage/schedules", { method: "GET" }),
				requestJson("/api/board/posts", { method: "GET" }),
			]);
			const assetItems = (Array.isArray(assetData.items) ? assetData.items : []).map((x) => ({
				source_type: "asset",
				scope_name: "단말관리",
				target_id: String(x.id || ""),
				title_text: [String(x["구 관리번호"] || "").trim(), String(x["NEW 관리 번호"] || "").trim()].filter(Boolean).join(" / ") || String(x.id || "-"),
				requested_by: String(x.delete_requested_by || "-"),
				reviewed_by: String(x.delete_reviewed_by || "-"),
				requested_at: String(x.delete_requested_at || ""),
				reviewed_at: String(x.delete_reviewed_at || ""),
				reject_reason: String(x.delete_reject_reason || "-"),
			}));
			const scheduleItems = (Array.isArray(scheduleData.items) ? scheduleData.items : [])
				.filter((x) => String(x.approval_status || "").toLowerCase() === "rejected")
				.map((x) => ({
					source_type: "schedule",
					scope_name: "일정관리",
					target_id: String(x.id || ""),
					title_text: String(x.title || "-") || "-",
					requested_by: String(x.author_name || x.author_email || "-"),
					reviewed_by: String(x.approved_by || "-"),
					requested_at: String(x.requested_at || x.created_at || ""),
					reviewed_at: String(x.approved_at || ""),
					reject_reason: String(x.reject_reason || "-"),
				}));
			const boardItems = (Array.isArray(boardData.items) ? boardData.items : [])
				.filter((x) => String(x.status || "").toLowerCase() === "rejected")
				.map((x) => ({
					source_type: "board",
					scope_name: "게시판",
					target_id: String(x.id || ""),
					title_text: String(x.title || "-") || "-",
					requested_by: String(x.author_name || x.author_email || "-"),
					reviewed_by: String(x.reviewed_by || "-"),
					requested_at: String(x.created_at || ""),
					reviewed_at: String(x.reviewed_at || ""),
					reject_reason: String(x.reject_reason || "-"),
				}));
			const merged = assetItems.concat(scheduleItems, boardItems);
			merged.sort((a, b) => String(b.reviewed_at || b.requested_at || "").localeCompare(String(a.reviewed_at || a.requested_at || "")));
			renderAssetRejectedItems(merged);
		} catch (error) {
			assetRejectedBody.innerHTML = `<tr><td colspan="8">${esc(error?.message || "반려된 목록을 불러오지 못했습니다.")}</td></tr>`;
		}
	}

	function applyAdminHashMode() {
		const requestedId = (window.location.hash || "").replace("#", "");
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
		const normalizedId = requestedId === "adminBoardApprovalTab" ? "adminAssetApprovalTab" : requestedId;
		const activeId = ADMIN_SECTION_IDS.includes(requestedId) ? normalizedId : "adminIssueTab";
		for (const id of ADMIN_SECTION_IDS) {
			const sectionId = id === "adminBoardApprovalTab" ? "adminAssetApprovalTab" : id;
			const section = document.getElementById(sectionId);
			if (section) {
				section.hidden = sectionId !== activeId;
				section.style.gridColumn = sectionId === activeId ? "1 / -1" : "";
			}
		}
		adminMainGrid?.classList.add("admin-single-mode");
	}

	memberBody.addEventListener("click", async (event) => {
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;

		const editEmail = target.closest("[data-edit-member]")?.getAttribute("data-edit-member") || target.getAttribute("data-edit-member");
		if (editEmail) {
			const memberData = allMembers.find((m) => String(m.email || "").toLowerCase() === editEmail);
			if (memberData) openMemberEditModal(memberData);
			else window.alert("회원 정보를 찾을 수 없습니다.");
			return;
		}

		const approveEmail = target.getAttribute("data-approve-member");
		const toggleEmail = target.getAttribute("data-toggle-login-member");
		const nextLogin = target.getAttribute("data-next-login");
		const toggleGameEmail = target.getAttribute("data-toggle-game-member");
		const nextGame = target.getAttribute("data-next-game");
		const deleteEmail = target.getAttribute("data-del-member");

		try {
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

	// ── 수정 모달 이벤트 ─────────────────────────────────────────────
	document.querySelectorAll("[data-close-member-edit]").forEach((el) => {
		el.addEventListener("click", closeMemberEditModal);
	});

	memberEditForm?.addEventListener("submit", async (event) => {
		event.preventDefault();
		const email = String(memberEditEmail?.value || "").trim().toLowerCase();
		if (!email) return;
		const isCoreAdmin = CORE_ADMINS.has(email);
		const saveBtn = document.getElementById("memberEditSaveBtn");
		if (saveBtn) saveBtn.disabled = true;
		try {
			const payload = {
				name: String(memberEditName?.value || "").trim(),
				title: String(memberEditTitle?.value || "").trim(),
				phone: String(memberEditPhone?.value || "").trim(),
				birth: String(memberEditBirth?.value || "").trim(),
				address: String(memberEditAddress?.value || "").trim(),
			};
			if (!isCoreAdmin) {
				payload.role = String(memberEditRole?.value || "user");
				payload.approved = Boolean(memberEditApproved?.checked);
				payload.can_login = Boolean(memberEditCanLogin?.checked);
			}
			if (canManageGameAccess && memberEditGameAccess && !memberEditGameAccess.disabled) {
				payload.game_access = Boolean(memberEditGameAccess.checked);
			}
			await requestJson(`/api/admin/users/${encodeURIComponent(email)}`, {
				method: "PUT",
				body: JSON.stringify(payload),
			});
			closeMemberEditModal();
			await refreshMembers();
		} catch (error) {
			window.alert(error?.message || "저장 중 오류가 발생했습니다.");
		} finally {
			if (saveBtn) saveBtn.disabled = false;
		}
	});

	memberPasswordForm?.addEventListener("submit", async (event) => {
		event.preventDefault();
		const email = String(memberEditEmail?.value || "").trim().toLowerCase();
		const password = String(memberPasswordInput?.value || "").trim();
		if (!email || !password) return;
		const saveBtn = document.getElementById("memberPasswordSaveBtn");
		if (saveBtn) saveBtn.disabled = true;
		try {
			await requestJson(`/api/admin/users/${encodeURIComponent(email)}`, {
				method: "PUT",
				body: JSON.stringify({ password }),
			});
			if (memberPasswordInput) memberPasswordInput.value = "";
			window.alert("비밀번호가 변경되었습니다.");
		} catch (error) {
			window.alert(error?.message || "비밀번호 변경 중 오류가 발생했습니다.");
		} finally {
			if (saveBtn) saveBtn.disabled = false;
		}
	});

	// ── 추가 모달 이벤트 ─────────────────────────────────────────────
	adminMemberAddBtn?.addEventListener("click", openMemberAddModal);

	document.querySelectorAll("[data-close-member-add]").forEach((el) => {
		el.addEventListener("click", closeMemberAddModal);
	});

	memberAddForm?.addEventListener("submit", async (event) => {
		event.preventDefault();
		const email = String(memberAddEmail?.value || "").trim().toLowerCase();
		const password = String(memberAddPassword?.value || "").trim();
		if (!email || !password) return;
		const saveBtn = document.getElementById("memberAddSaveBtn");
		if (saveBtn) saveBtn.disabled = true;
		try {
			const payload = {
				email,
				password,
				name: String(memberAddName?.value || "").trim(),
				role: String(memberAddRole?.value || "user"),
				title: String(memberAddTitle?.value || "").trim(),
				phone: String(memberAddPhone?.value || "").trim(),
				approved: Boolean(memberAddApproved?.checked),
				can_login: Boolean(memberAddCanLogin?.checked),
			};
			await requestJson("/api/admin/users", {
				method: "POST",
				body: JSON.stringify(payload),
			});
			closeMemberAddModal();
			await refreshMembers();
			window.alert(`${email} 계정이 생성되었습니다.`);
		} catch (error) {
			window.alert(error?.message || "계정 생성 중 오류가 발생했습니다.");
		} finally {
			if (saveBtn) saveBtn.disabled = false;
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

		const openDecisionId = target.getAttribute("data-open-asset-decision");
		if (openDecisionId) {
			preferredDecisionId = String(openDecisionId);
			renderDecisionQueue(pendingDeleteRequests);
			window.location.hash = "#adminAssetDecisionTab";
			applyAdminHashMode();
			setTimeout(() => {
				const row = document.querySelector(`[data-decision-row-id="${preferredDecisionId}"]`);
				row?.scrollIntoView({ block: "center", behavior: "smooth" });
			}, 10);
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
				const id = String(requestItem?.target_id || "");
				const sourceType = String(requestItem?.source_type || "");
				if (!id) {
					throw new Error("처리할 요청 대상을 찾지 못했습니다.");
				}
				if (sourceType === "asset-delete") {
					if (decisionType === "approve") {
						await requestJson(`/api/admin/assets/${encodeURIComponent(id)}/approve-delete`, {
							method: "POST",
							body: JSON.stringify({}),
						});
						continue;
					}
					await requestJson(`/api/admin/assets/${encodeURIComponent(id)}/reject-delete`, {
						method: "POST",
						body: JSON.stringify({ reason }),
					});
					continue;
				}
				if (sourceType === "schedule") {
					await requestJson(`/api/manage/schedules/${encodeURIComponent(id)}/approval`, {
						method: "POST",
						body: JSON.stringify({
							status: decisionType === "approve" ? "approved" : "rejected",
							reason: decisionType === "reject" ? reason : "",
						}),
					});
					continue;
				}
				if (sourceType === "board") {
					if (decisionType === "approve") {
						await requestJson(`/api/board/posts/${encodeURIComponent(id)}/approve`, {
							method: "POST",
							body: JSON.stringify({}),
						});
						continue;
					}
					await requestJson(`/api/board/posts/${encodeURIComponent(id)}/reject`, {
						method: "POST",
						body: JSON.stringify({ reason }),
					});
					continue;
				}
				throw new Error("지원하지 않는 요청 유형입니다.");
			}
			await refreshAssetDeleteRequests();
			await refreshAssetDeletedItems();
			await refreshAssetRejectedItems();
			await refreshActivityLog();
			window.location.hash = decisionType === "approve" ? "#adminAssetDeletedTab" : "#adminAssetRejectedTab";
			applyAdminHashMode();
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
				return `
					<tr>
						<td style="white-space:nowrap;">${esc(formatDisplayDateTime(x.updated_at || ""))}</td>
						<td>${esc(x.actor || "-")}</td>
						<td><span class="scope-badge">${esc(x.scope || "-")}</span></td>
						<td>${esc(kindLabel)} · ${esc(x.title || "-")}</td>
						<td class="detail-cell">
							<button type="button" class="btn-secondary" data-show-activity-details="${idx}" data-activity-title="${esc(detailTitle)}">항목상세</button>
							<div class="hint">${esc(summary)}${hasMore ? ` 외 ${detailLines.length - 1}건` : ""}</div>
						</td>
					</tr>
				`;
			})
			.join("");
	}

	activityLogBody?.addEventListener("click", (event) => {
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;
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
	bindMemberToolbarEvents();
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
			const data = await requestJson('/api/board/posts', { method: 'GET', credentials: 'include' });
			let items = data.items || [];
			const boardItemMap = new Map(items.map((p) => [String(p.id || ''), p]));
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
					: `<span style="color:#ca8a04;font-size:0.75rem;font-weight:600;">⏳ 대기</span>`;
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
						${p.status !== 'approved' ? `<button type="button" class="btn-approve board-admin-approve-btn" data-id="${escBoard(p.id)}" style="padding:6px 12px;font-size:0.8rem;"><i class="fas fa-check"></i> 승인</button>` : ''}
						${p.status !== 'rejected' ? `<button type="button" class="btn-reject board-admin-reject-btn" data-id="${escBoard(p.id)}" style="padding:6px 12px;font-size:0.8rem;"><i class="fas fa-times"></i> 반려</button>` : ''}
						<button type="button" class="btn-warning board-admin-edit-btn" data-id="${escBoard(p.id)}" style="padding:6px 12px;font-size:0.8rem;"><i class="fas fa-pen"></i> 수정</button>
						<button type="button" class="btn-ghost board-admin-delete-btn" data-id="${escBoard(p.id)}" style="padding:6px 12px;font-size:0.8rem;"><i class="fas fa-trash"></i> 삭제</button>
						<a href="/board#${escBoard(p.id)}" target="_blank" style="padding:6px 12px;font-size:0.8rem;border:1px solid #c7d5eb;border-radius:7px;color:#334155;text-decoration:none;display:inline-flex;align-items:center;gap:4px;"><i class="fas fa-external-link-alt"></i> 보기</a>
					</div>
				</div>`;
			}).join('');

			// 승인 버튼
			container.querySelectorAll('.board-admin-approve-btn').forEach(btn => {
				btn.addEventListener('click', async () => {
					const id = btn.dataset.id;
					btn.disabled = true;
					try {
						await requestJson(`/api/board/posts/${encodeURIComponent(id)}/approve`, { method: 'POST', credentials: 'include', body: JSON.stringify({}) });
						await refreshAdminBoardPosts();
						await refreshAssetRejectedItems();
						await refreshActivityLog();
					} catch (e) { alert('승인 실패: ' + e.message); btn.disabled = false; }
				});
			});

			// 반려 버튼
			container.querySelectorAll('.board-admin-reject-btn').forEach(btn => {
				btn.addEventListener('click', async () => {
					const id = btn.dataset.id;
					const reason = prompt('반려 사유를 입력하세요 (선택사항)') ?? '';
					if (reason === null) return;
					btn.disabled = true;
					try {
						await requestJson(`/api/board/posts/${encodeURIComponent(id)}/reject`, {
							method: 'POST',
							credentials: 'include',
							body: JSON.stringify({ reason }),
						});
						await refreshAdminBoardPosts();
						await refreshAssetRejectedItems();
						await refreshActivityLog();
					} catch (e) { alert('반려 실패: ' + e.message); btn.disabled = false; }
				});
			});

			container.querySelectorAll('.board-admin-edit-btn').forEach(btn => {
				btn.addEventListener('click', async () => {
					const id = String(btn.dataset.id || '');
					const post = boardItemMap.get(id);
					if (!post) {
						window.alert('게시글 정보를 찾지 못했습니다. 새로고침 후 다시 시도해 주세요.');
						return;
					}
					const nextTitle = window.prompt('제목을 입력하세요.', String(post.title || ''));
					if (nextTitle === null) return;
					const nextContent = window.prompt('내용을 입력하세요.', String(post.content || ''));
					if (nextContent === null) return;
					const nextPriorityRaw = window.prompt('우선순위(High, Medium, Low)', String(post.priority || 'Medium'));
					if (nextPriorityRaw === null) return;
					const normalizedPriority = String(nextPriorityRaw || 'Medium').trim();
					const nextPriority = ['High', 'Medium', 'Low'].includes(normalizedPriority) ? normalizedPriority : 'Medium';
					btn.disabled = true;
					try {
						await requestJson(`/api/board/posts/${encodeURIComponent(id)}`, {
							method: 'PUT',
							credentials: 'include',
							body: JSON.stringify({
								title: String(nextTitle).trim(),
								author_name: String(post.author_name || ''),
								content: String(nextContent).trim(),
								priority: nextPriority,
							}),
						});
						await refreshAdminBoardPosts();
						await refreshActivityLog();
					} catch (e) {
						window.alert('수정 실패: ' + (e.message || '오류가 발생했습니다.'));
						btn.disabled = false;
					}
				});
			});

			container.querySelectorAll('.board-admin-delete-btn').forEach(btn => {
				btn.addEventListener('click', async () => {
					const id = String(btn.dataset.id || '');
					const ok = window.confirm('이 게시글을 삭제하시겠습니까?');
					if (!ok) return;
					btn.disabled = true;
					try {
						await requestJson(`/api/board/posts/${encodeURIComponent(id)}`, {
							method: 'DELETE',
							credentials: 'include',
						});
						await refreshAdminBoardPosts();
						await refreshActivityLog();
						await refreshAssetDeletedItems();
					} catch (e) {
						window.alert('삭제 실패: ' + (e.message || '오류가 발생했습니다.'));
						btn.disabled = false;
					}
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

	refreshAdminBoardPosts();
	setInterval(() => {
		refreshAdminBoardPosts().catch(() => {});
	}, 60000);
})();
