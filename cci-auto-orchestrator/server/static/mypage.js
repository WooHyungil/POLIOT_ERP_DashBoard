(function () {
  function byId(id) {
    return document.getElementById(id);
  }

  const state = {
    user: null,
    schedules: [],
    shortcutState: null,
    initialProfile: { name: "", address: "" },
  };

  const emailEl = byId("mypageEmail");
  const nameEl = byId("mypageName");
  const addressEl = byId("mypageAddress");
  const flashEl = byId("mypageFlash");
  const formEl = byId("mypageForm");
  const saveBtn = byId("mypageSaveBtn");

  function escText(v) {
    return String(v || "").trim();
  }

  function fmtDateTime(value) {
    const text = escText(value);
    if (!text) return "-";
    const parsed = Date.parse(text);
    if (!Number.isFinite(parsed)) return text.replace("T", " ").replace("Z", "");
    const d = new Date(parsed);
    const pad = function (n) { return String(n).padStart(2, "0"); };
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function setFlash(message, tone) {
    if (!flashEl) return;
    flashEl.textContent = message || "";
    flashEl.setAttribute("data-tone", tone || "");
  }

  function initials(name, email) {
    const source = escText(name) || escText(email) || "U";
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return source.slice(0, 2).toUpperCase();
  }

  function computeProfilePercent(user) {
    let score = 0;
    if (escText(user?.email)) score += 34;
    if (escText(user?.name)) score += 33;
    if (escText(user?.address)) score += 33;
    return Math.min(score, 100);
  }

  function passwordStrength(password) {
    const text = String(password || "");
    if (!text) return { score: 0, label: "비밀번호를 입력하면 강도를 안내합니다." };
    let score = 0;
    if (text.length >= 8) score += 25;
    if (/[A-Z]/.test(text)) score += 20;
    if (/[a-z]/.test(text)) score += 20;
    if (/\d/.test(text)) score += 20;
    if (/[^A-Za-z0-9]/.test(text)) score += 15;
    if (score < 40) return { score, label: "약함: 영문 대소문자, 숫자, 특수문자를 섞는 것이 좋습니다." };
    if (score < 75) return { score, label: "보통: 조금 더 복잡하게 만들면 더 안전합니다." };
    return { score, label: "강함: 현재 비밀번호 구성이 충분히 안정적입니다." };
  }

  function authoredSchedules() {
    const userEmail = String(state.user?.email || "").trim().toLowerCase();
    return state.schedules.filter(function (row) {
      return String(row?.author_email || "").trim().toLowerCase() === userEmail;
    });
  }

  function renderProfile(user) {
    state.user = user || null;
    const profileUser = state.user || {};
    if (emailEl) emailEl.value = escText(profileUser.email);
    if (nameEl) nameEl.value = escText(profileUser.name);
    if (addressEl) addressEl.value = escText(profileUser.address);

    byId("mypageEmailText").textContent = escText(profileUser.email) || "-";
    byId("mypageNameText").textContent = escText(profileUser.name) || "-";
    byId("mypageAddressText").textContent = escText(profileUser.address) || "미입력";
    byId("mypageHeroName").textContent = escText(profileUser.name) || "이름을 설정해 주세요";
    byId("mypageHeroMeta").textContent = escText(profileUser.email) || "계정 정보를 확인할 수 없습니다.";
    byId("mypageAvatar").textContent = initials(profileUser.name, profileUser.email);

    const roleText = profileUser.role === "admin" ? "관리자" : "사용자";
    byId("mypageRoleBadge").textContent = `권한 ${roleText}`;
    byId("mypageApproveBadge").textContent = profileUser.approved ? "승인 완료" : "승인 대기";
    byId("mypageLoginBadge").textContent = profileUser.can_login ? "로그인 가능" : "로그인 제한";
    byId("mypageCanLoginText").textContent = profileUser.can_login ? "허용" : "제한";
    byId("mypageLoginAt").textContent = fmtDateTime(profileUser.login_at);
    byId("mypageLastActiveAt").textContent = fmtDateTime(profileUser.last_active_at);

    const percent = computeProfilePercent(profileUser);
    byId("mypageProfileProgressBar").style.width = `${percent}%`;
    byId("mypageProfileProgressText").textContent = `${percent}%`;

    const topbarName = byId("topbarUserName");
    if (topbarName) {
      topbarName.hidden = false;
      topbarName.textContent = escText(profileUser.name) ? `${profileUser.name}님` : "사용자";
    }

    const adminLink = byId("mypageAdminLink");
    if (adminLink) adminLink.hidden = profileUser.role !== "admin";

    state.initialProfile = {
      name: escText(profileUser.name),
      address: escText(profileUser.address),
    };
    syncSaveButtonState();
  }

  function renderShortcutState(data) {
    state.shortcutState = data || { items: [], windows: [] };
    const items = Array.isArray(state.shortcutState.items) ? state.shortcutState.items : [];
    const windows = Array.isArray(state.shortcutState.windows) ? state.shortcutState.windows : [];
    byId("mypageShortcutCount").textContent = String(items.length);
    byId("mypageWindowCount").textContent = String(windows.length);
  }

  function renderSchedules() {
    const mine = authoredSchedules();
    const pending = mine.filter(function (item) { return String(item?.approval_status || "") === "pending"; }).length;
    const approved = mine.filter(function (item) { return String(item?.approval_status || "") === "approved"; }).length;
    const rejected = mine.filter(function (item) { return String(item?.approval_status || "") === "rejected"; }).length;
    byId("mypageScheduleCount").textContent = String(mine.length);
    byId("mypageSchedulePending").textContent = String(pending);
    byId("mypageScheduleApproved").textContent = String(approved);
    byId("mypageScheduleRejected").textContent = String(rejected);

    const list = byId("mypageScheduleList");
    if (!list) return;
    if (!mine.length) {
      list.innerHTML = '<p class="hint">등록한 일정이 없습니다.</p>';
      return;
    }
    const sorted = [...mine].sort(function (a, b) {
      return String(a?.start_date || "").localeCompare(String(b?.start_date || ""));
    });
    list.innerHTML = sorted.slice(0, 5).map(function (item) {
      const status = String(item?.approval_status || "pending");
      const statusText = status === "approved" ? "승인" : status === "rejected" ? "반려" : "대기";
      const note = escText(item?.memo || item?.note || "");
      return `
        <div class="mypage-schedule-item">
          <div class="mypage-schedule-item-head">
            <strong>${escText(item?.brand || item?.type || "일정") || "일정"}</strong>
            <span class="mypage-status-pill ${status}">${statusText}</span>
          </div>
          <p>${escText(item?.start_date)} ~ ${escText(item?.end_date)}</p>
          <small>${note || "메모 없음"}</small>
        </div>
      `;
    }).join("");
  }

  function syncSaveButtonState() {
    if (!saveBtn) return;
    const changed = escText(nameEl?.value) !== state.initialProfile.name
      || escText(addressEl?.value) !== state.initialProfile.address
      || escText(byId("mypagePw1")?.value)
      || escText(byId("mypagePw2")?.value);
    saveBtn.disabled = !changed;
  }

  function updatePasswordStrength() {
    const result = passwordStrength(byId("mypagePw1")?.value || "");
    byId("mypagePasswordStrengthBar").style.width = `${result.score}%`;
    byId("mypagePasswordStrengthText").textContent = result.label;
  }

  async function loadProfile() {
    const res = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (!res.ok) throw new Error("계정 정보를 불러오지 못했습니다.");
    const data = await res.json();
    renderProfile(data.user || {});
  }

  async function loadShortcutState() {
    const res = await fetch("/api/user/shortcut-state", { credentials: "same-origin" });
    if (!res.ok) throw new Error("바로가기 상태를 불러오지 못했습니다.");
    const data = await res.json();
    renderShortcutState(data);
  }

  async function loadSchedules() {
    const res = await fetch("/api/manage/schedules", { credentials: "same-origin" });
    if (!res.ok) throw new Error("일정 정보를 불러오지 못했습니다.");
    const data = await res.json();
    state.schedules = Array.isArray(data?.items) ? data.items : [];
    renderSchedules();
  }

  async function saveProfile(ev) {
    ev.preventDefault();
    const password1 = byId("mypagePw1").value;
    const password2 = byId("mypagePw2").value;
    if (password1 || password2) {
      if (password1 !== password2) {
        setFlash("비밀번호가 일치하지 않습니다.", "error");
        return;
      }
      if (password1.length < 8) {
        setFlash("비밀번호는 8자 이상이어야 합니다.", "error");
        return;
      }
    }

    const payload = {
      name: escText(nameEl.value),
      address: escText(addressEl.value),
    };
    if (password1) payload.password = password1;

    saveBtn.disabled = true;
    try {
      const res = await fetch("/api/user/me", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.detail || "저장 중 오류가 발생했습니다.");
      }
      byId("mypagePw1").value = "";
      byId("mypagePw2").value = "";
      updatePasswordStrength();
      renderProfile({ ...state.user, ...data.user });
      setFlash("마이페이지 정보가 저장되었습니다.", "ok");
    } catch (error) {
      setFlash(error?.message || "저장 중 오류가 발생했습니다.", "error");
      syncSaveButtonState();
    }
  }

  function bindPasswordToggle(buttonId, inputId) {
    byId(buttonId)?.addEventListener("click", function () {
      const input = byId(inputId);
      if (!input) return;
      input.type = input.type === "password" ? "text" : "password";
    });
  }

  function resetFormToInitial() {
    if (nameEl) nameEl.value = state.initialProfile.name;
    if (addressEl) addressEl.value = state.initialProfile.address;
    byId("mypagePw1").value = "";
    byId("mypagePw2").value = "";
    updatePasswordStrength();
    syncSaveButtonState();
    setFlash("변경 내용을 되돌렸습니다.", "warn");
  }

  function copyEmail() {
    const email = escText(state.user?.email);
    if (!email) return;
    navigator.clipboard.writeText(email)
      .then(function () { setFlash("이메일을 복사했습니다.", "ok"); })
      .catch(function () { setFlash("이메일 복사에 실패했습니다.", "error"); });
  }

  function bindEvents() {
    formEl?.addEventListener("submit", saveProfile);
    nameEl?.addEventListener("input", syncSaveButtonState);
    addressEl?.addEventListener("input", syncSaveButtonState);
    byId("mypagePw1")?.addEventListener("input", function () {
      updatePasswordStrength();
      syncSaveButtonState();
    });
    byId("mypagePw2")?.addEventListener("input", syncSaveButtonState);
    byId("mypageResetBtn")?.addEventListener("click", resetFormToInitial);
    byId("mypageCopyEmailBtn")?.addEventListener("click", copyEmail);
    bindPasswordToggle("mypageTogglePw1", "mypagePw1");
    bindPasswordToggle("mypageTogglePw2", "mypagePw2");
  }

  Promise.allSettled([loadProfile(), loadShortcutState(), loadSchedules()])
    .then(function (results) {
      const rejected = results.find(function (row) { return row.status === "rejected"; });
      if (rejected) {
        setFlash(rejected.reason?.message || "일부 정보를 불러오지 못했습니다.", "error");
      }
    });

  updatePasswordStrength();
  bindEvents();
})();