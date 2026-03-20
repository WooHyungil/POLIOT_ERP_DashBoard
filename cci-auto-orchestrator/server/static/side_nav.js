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

    // 접힘 상태에서도 활성 경로의 대메뉴만 active 표시
    for (const btn of parentButtons) {
      const targetPath = btn.getAttribute("data-path") || "";
      const isActive = Boolean(targetPath && isMatch(targetPath));
      btn.classList.toggle("active", isActive);
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
      // 대메뉴 클릭은 서브메뉴 토글만. 페이지 이동은 중메뉴(sublink) 클릭 시에만 수행.
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

  function setGameVisibility(enabled) {
    const on = Boolean(enabled);
    document.documentElement.setAttribute("data-game-access", on ? "1" : "0");
    for (const el of document.querySelectorAll('[data-requires-game="true"]')) {
      if (on) {
        el.removeAttribute("hidden");
      } else {
        el.setAttribute("hidden", "hidden");
      }
    }
  }

  async function applyRoleGuard() {
    try {
      const res = await fetch("/api/auth/me", { credentials: "same-origin" });
      if (!res.ok) return;
      const data = await res.json();
      const role = String(data?.user?.role || "user").toLowerCase();
      const gameAccess = Boolean(data?.user?.game_access);
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

      // 자동 로그아웃 카운트다운 (유휴 시간 기준)
      const countdownEl = document.getElementById("topbarCountdown");
      if (countdownEl) {
        const IDLE_MS = (window._idleLogout && window._idleLogout.IDLE_MS) || 60 * 60 * 1000;

        function updateIdleCountdown() {
          const lastActivity = (window._idleLogout && window._idleLogout.lastActivityAt && window._idleLogout.lastActivityAt()) || Date.now();
          const remaining = IDLE_MS - (Date.now() - lastActivity);
          if (remaining <= 0) {
            const lf = document.querySelector('form[action="/auth/logout"]');
            if (lf) { lf.submit(); }
            return;
          }
          const totalMins = Math.ceil(remaining / 60000);
          const h = Math.floor(totalMins / 60);
          const m = totalMins % 60;
          countdownEl.textContent = h > 0
            ? `${h}시간 ${m}분 동안 미사용 시 자동 로그아웃됩니다.`
            : `${m}분 동안 미사용 시 자동 로그아웃됩니다.`;
          countdownEl.hidden = false;
        }

        updateIdleCountdown();
        setInterval(updateIdleCountdown, 30 * 1000);
      }

      setGameVisibility(gameAccess);

      if (role === "admin") return;

      for (const el of document.querySelectorAll('[data-requires-admin="true"]')) {
        el.remove();
      }

      return;

    } catch {
      // Ignore auth-role fetch errors to keep navigation usable.
    }

    // Safe fallback when auth fetch fails.
    setGameVisibility(false);
  }

  applyRoleGuard();
  window.addEventListener("cci:auth-updated", applyRoleGuard);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) applyRoleGuard();
  });
  setInterval(applyRoleGuard, 5000);

  nav.addEventListener("mouseleave", function () {
    if (window.innerWidth <= 700) return;
    nav.classList.remove("is-open");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
    applySubLinkActiveState();
  });
})();
