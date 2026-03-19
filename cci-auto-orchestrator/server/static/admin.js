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
	if (!memberBody) return;
	const activityLogBody = document.getElementById("activityLogRows");
	const requestDetailModal = document.getElementById("requestDetailModal");
	const requestDetailTitle = document.getElementById("requestDetailTitle");
	const requestDetailList = document.getElementById("requestDetailList");
	const ADMIN_SECTION_IDS = ["adminIssueTab", "adminPeopleTab", "adminAssetDecisionTab", "adminAssetApprovalTab", "adminActivityLogTab", "adminAssetDeletedTab", "adminAssetRejectedTab"];
	let pendingDeleteRequests = [];
	let activityLogItems = [];
	let preferredDecisionId = "";

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

	function renderMembers(items) {
		memberBody.innerHTML = items
			.map((x) => {
				const email = String(x.email || "").toLowerCase();
				const isCoreAdmin = CORE_ADMINS.has(email);
				const approved = Boolean(x.approved);
				const canLogin = Boolean(x.can_login);
				return `
					<tr>
						<td>${esc(email || "-")}</td>
						<td>${esc(x.name || "-")}</td>
						<td>${esc(x.role || "user")}</td>
						<td>${approved ? "승인" : "대기"}</td>
						<td>${canLogin ? "허용" : "차단"}</td>
						<td>
							<button type="button" data-approve-member="${esc(email)}" ${approved ? "disabled" : ""}>승인</button>
							<button type="button" class="btn-secondary" data-toggle-login-member="${esc(email)}" data-next-login="${canLogin ? "0" : "1"}" ${isCoreAdmin ? "disabled" : ""}>${canLogin ? "로그인 차단" : "로그인 허용"}</button>
							<button type="button" class="btn-ghost" data-del-member="${esc(email)}" ${isCoreAdmin ? "disabled" : ""}>삭제</button>
						</td>
					</tr>
				`;
			})
			.join("");

		setDetailSummary(items);
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
			const items = Array.isArray(data.items) ? data.items : [];
			items.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
			renderMembers(items);
		} catch (error) {
			memberBody.innerHTML = `<tr><td colspan="6">${esc(error?.message || "사용자 목록을 불러오지 못했습니다.")}</td></tr>`;
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
				const canDecide = String(x.source_type || "") === "asset-delete";
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
							<button type="button" class="btn-ghost" data-withdraw-asset-request="${esc(requestId)}" ${canDecide ? "" : "disabled"}>요청철회</button>
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
		return (items || []).filter((x) => String(x?.source_type || "") === "asset-delete");
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
		if (String(requestItem?.source_type || "") !== "asset-delete") {
			throw new Error("현재는 단말관리 요청만 요청취소할 수 있습니다.");
		}
		await requestJson(`/api/admin/assets/${encodeURIComponent(withdrawId)}/withdraw-request`, {
			method: "POST",
			body: JSON.stringify({}),
		});
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
				const canDecide = String(x.source_type || "") === "asset-delete";
				return `
					<tr data-decision-row-id="${esc(requestId)}">
						<td><input type="checkbox" class="decision-row-check" data-id="${esc(requestId)}" ${isPreferred ? "checked" : ""} ${canDecide ? "" : "disabled"} /></td>
						<td><span class="scope-badge">${esc(x.page_name || "-")}</span></td>
						<td>${esc(x.requester_name || "-")}<br /><span class="hint">${esc(x.requester_id || "-")}</span></td>
						<td><span class="decision-time">${esc(formatDisplayDateTime(x.requested_at || ""))}</span></td>
						<td><button type="button" class="btn-secondary" data-show-request-details="${esc(requestId)}">내용</button></td>
						<td><span class="asset-status-badge status-pending">${canDecide ? "대기중" : "조회전용"}</span></td>
						<td><button type="button" class="btn-warning" data-withdraw-decision-request="${esc(requestId)}" ${canDecide ? "" : "disabled"}>요청취소</button></td>
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
		const activeId = ADMIN_SECTION_IDS.includes(requestedId) ? requestedId : "adminIssueTab";
		for (const id of ADMIN_SECTION_IDS) {
			const section = document.getElementById(id);
			if (section) {
				section.hidden = id !== activeId;
				section.style.gridColumn = id === activeId ? "1 / -1" : "";
			}
		}
		adminMainGrid?.classList.add("admin-single-mode");
	}

	memberBody.addEventListener("click", async (event) => {
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;

		const approveEmail = target.getAttribute("data-approve-member");
		const toggleEmail = target.getAttribute("data-toggle-login-member");
		const nextLogin = target.getAttribute("data-next-login");
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
				if (String(requestItem?.source_type || "") !== "asset-delete" || !id) {
					throw new Error("현재는 단말관리 요청만 승인/반려 처리할 수 있습니다.");
				}
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
			}
			await refreshAssetDeleteRequests();
			await refreshAssetDeletedItems();
			await refreshAssetRejectedItems();
			await refreshActivityLog();
			if (decisionBulkRejectReasonInput) decisionBulkRejectReasonInput.value = "";
			preferredDecisionId = "";
			renderDecisionQueue(pendingDeleteRequests);
		} catch (error) {
			window.alert(error?.message || "삭제 승인 처리 중 오류가 발생했습니다.");
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
	refreshMembers();
	refreshAssetDeleteRequests();
	refreshAssetDeletedItems();
	refreshAssetRejectedItems();
	refreshActivityLog();
})();
