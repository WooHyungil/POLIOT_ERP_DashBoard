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
	if (!memberBody) return;
	const ADMIN_SECTION_IDS = ["adminPeopleTab", "adminIssueTab"];

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

	function applyAdminHashMode() {
		const requestedId = (window.location.hash || "").replace("#", "");
		const activeId = ADMIN_SECTION_IDS.includes(requestedId) ? requestedId : "adminPeopleTab";
		for (const id of ADMIN_SECTION_IDS) {
			const section = document.getElementById(id);
			if (section) section.hidden = id !== activeId;
		}
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

	window.addEventListener("hashchange", applyAdminHashMode);
	applyAdminHashMode();
	refreshMembers();
})();
