(function () {
	const IDLE_MS = 60 * 60 * 1000;          // 1시간 유휴 → 자동 로그아웃
	const HEARTBEAT_MIN_MS = 60 * 1000;      // 서버에 최소 1분마다 한 번 갱신
	let lastActivityAt = Date.now();
	let lastHeartbeatAt = 0;
	let logoutRequested = false;

	function touch() {
		lastActivityAt = Date.now();
		maybeHeartbeat();
	}

	function maybeHeartbeat() {
		const now = Date.now();
		if (now - lastHeartbeatAt < HEARTBEAT_MIN_MS) return;
		lastHeartbeatAt = now;
		fetch("/api/auth/heartbeat", {
			method: "POST",
			credentials: "same-origin",
			headers: { "Content-Type": "application/json" },
		}).catch(function () {});
	}

	function findLogoutForm() {
		return document.querySelector('form[action="/auth/logout"]');
	}

	function requestLogout() {
		if (logoutRequested) return;
		logoutRequested = true;

		const form = findLogoutForm();
		if (form) {
			form.submit();
			return;
		}

		fetch("/auth/logout", {
			method: "POST",
			credentials: "same-origin",
		}).finally(function () {
			window.location.assign("/auth/login");
		});
	}

	function checkIdle() {
		if (Date.now() - lastActivityAt >= IDLE_MS) {
			requestLogout();
		}
	}

	["click", "keydown", "mousemove", "scroll", "touchstart"].forEach(function (name) {
		window.addEventListener(name, touch, { passive: true });
	});

	// side_nav.js의 카운트다운이 공유하는 참조
	window._idleLogout = {
		IDLE_MS: IDLE_MS,
		lastActivityAt: function () { return lastActivityAt; },
	};

	touch();
	window.setInterval(checkIdle, 30 * 1000);
})();
