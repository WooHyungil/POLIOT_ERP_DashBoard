(function () {
	const SESSION_IDLE_MS = 60 * 60 * 1000;
	let lastActivityAt = Date.now();
	let logoutRequested = false;

	function touch() {
		lastActivityAt = Date.now();
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
		if (Date.now() - lastActivityAt >= SESSION_IDLE_MS) {
			requestLogout();
		}
	}

	["click", "keydown", "mousemove", "scroll", "touchstart"].forEach(function (name) {
		window.addEventListener(name, touch, { passive: true });
	});

	touch();
	window.setInterval(checkIdle, 30 * 1000);
})();
