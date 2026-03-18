(function () {
  const nav = document.getElementById("sideNav");
  if (!nav) return;

  const toggle = document.getElementById("sideNavToggle");
  const links = Array.from(nav.querySelectorAll(".side-nav-link"));
  const subLinks = Array.from(nav.querySelectorAll(".side-nav-sublink"));
  const parentButtons = Array.from(nav.querySelectorAll(".side-nav-parent[data-submenu-target]"));
  const path = (window.location.pathname || "/").replace(/\/+$/, "") || "/";

  function toAbsoluteUrl(rawHref) {
    const href = String(rawHref || "").trim();
    if (!href) return "";
    if (/^https?:\/\//i.test(href)) return href;
    if (href.startsWith("/")) return `${window.location.origin}${href}`;
    return new URL(href, window.location.href).toString();
  }

  function go(href) {
    const url = toAbsoluteUrl(href);
    if (!url) return;
    window.location.assign(url);
  }

  function isMatch(targetPath) {
    if (targetPath === "/") return path === "/";
    return path === targetPath || path.startsWith(targetPath + "/");
  }

  for (const link of links) {
    const target = link.getAttribute("data-path") || link.getAttribute("href") || "";
    if (isMatch(target)) {
      link.classList.add("active");
    }
  }

  function applySubLinkActiveState() {
    const currentHash = window.location.hash || "";
    const detailVisible = nav.classList.contains("is-open") || nav.matches(":hover");
    for (const link of subLinks) {
      const targetPath = link.getAttribute("data-path") || "/";
      const targetHash = link.getAttribute("data-hash") || "";
      const pathOk = isMatch(targetPath);
      const hashOk = targetHash ? currentHash === targetHash : true;
      const isCurrent = pathOk && hashOk;

      if (isCurrent) {
        const sub = link.closest(".side-nav-submenu");
        if (sub) {
          sub.classList.add("open");
          const parent = nav.querySelector(`.side-nav-parent[data-submenu-target="${sub.id}"]`);
          if (parent) parent.classList.add("expanded");
        }
      }

      link.classList.toggle("active", detailVisible && isCurrent);
    }
  }

  applySubLinkActiveState();

  for (const btn of parentButtons) {
    btn.addEventListener("click", function () {
      const clickTarget = btn.getAttribute("data-submenu-target");
      const sub = clickTarget ? document.getElementById(clickTarget) : null;
      if (!sub) return;
      const next = !sub.classList.contains("open");
      sub.classList.toggle("open", next);
      btn.classList.toggle("expanded", next);

      // First click opens submenu, second click enters parent page.
      if (!next) {
        const targetPath = btn.getAttribute("data-path") || "";
        if (targetPath) go(targetPath);
      }
    });
  }

  // Force stable navigation regardless of host(local/LAN) and browser quirks.
  for (const link of nav.querySelectorAll("a[href]")) {
    link.addEventListener("click", function (event) {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const href = link.getAttribute("href") || "";
      if (!href || href.startsWith("#")) return;
      event.preventDefault();
      go(href);
    });
  }

  if (toggle) {
    toggle.addEventListener("click", function () {
      const next = !nav.classList.contains("is-open");
      nav.classList.toggle("is-open", next);
      toggle.setAttribute("aria-expanded", next ? "true" : "false");
      applySubLinkActiveState();
    });

    document.addEventListener("click", function (event) {
      if (!nav.classList.contains("is-open")) return;
      if (nav.contains(event.target)) return;
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      applySubLinkActiveState();
    });
  }

  nav.addEventListener("mouseenter", applySubLinkActiveState);
  window.addEventListener("hashchange", applySubLinkActiveState);

  async function applyRoleGuard() {
    try {
      const res = await fetch("/api/auth/me", { credentials: "same-origin" });
      if (!res.ok) return;
      const data = await res.json();
      const role = String(data?.user?.role || "user").toLowerCase();
      const email = String(data?.user?.email || "").trim().toLowerCase();
      const name = String(data?.user?.name || "").trim();
      const loginAt = String(data?.user?.login_at || "").trim();
      if (email) {
        try {
          localStorage.setItem("cci_auth_user_email", email);
        } catch {}
      }

      // 상단 유저 이름 표시
      const nameEl = document.getElementById("topbarUserName");
      if (nameEl && name) {
        nameEl.textContent = name + "님";
        nameEl.hidden = false;
      }

      // 자동 로그아웃 카운트다운 (1시간)
      const countdownEl = document.getElementById("topbarCountdown");
      if (countdownEl && loginAt) {
        const SESSION_MS = 60 * 60 * 1000;
        // login_at은 UTC ISO 형식 (timezone suffix 없음) → 'Z' 추가
        const loginTime = new Date(loginAt.endsWith("Z") ? loginAt : loginAt + "Z").getTime();

        function updateCountdown() {
          const remaining = SESSION_MS - (Date.now() - loginTime);
          if (remaining <= 0) {
            // 세션 만료 → 자동 로그아웃
            const lf = document.querySelector('form[action="/auth/logout"]');
            if (lf) { lf.submit(); }
            return;
          }
          const totalMins = Math.floor(remaining / 60000);
          const h = Math.floor(totalMins / 60);
          const m = totalMins % 60;
          countdownEl.textContent = h > 0
            ? `${h}시간 ${m}분 뒤 자동 로그아웃됩니다.`
            : `${m}분 뒤 자동 로그아웃됩니다.`;
          countdownEl.hidden = false;
        }

        updateCountdown();
        setInterval(updateCountdown, 60000);
      }

      if (role === "admin") return;

      for (const el of document.querySelectorAll('[data-requires-admin="true"]')) {
        el.remove();
      }

    } catch {
      // Ignore auth-role fetch errors to keep navigation usable.
    }
  }

  applyRoleGuard();

  nav.addEventListener("mouseleave", function () {
    if (window.innerWidth <= 700) return;
    nav.classList.remove("is-open");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
    applySubLinkActiveState();
  });
})();
