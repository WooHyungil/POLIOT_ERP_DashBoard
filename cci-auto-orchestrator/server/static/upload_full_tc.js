(function () {
  const form = document.getElementById("fullTcUploadForm");
  const hint = document.getElementById("fullTcUploadHint");
  const statusBody = document.getElementById("fullTcStatusRows");
  const uploadBtn = document.getElementById("fullTcUploadBtn");

  function fmt(v) {
    const text = String(v || "").trim();
    if (!text) return "-";
    const d = new Date(text);
    if (Number.isNaN(d.getTime())) return text;
    const y = String(d.getFullYear());
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day}, ${hh}:${mm}`;
  }

  function renderStatus(data) {
    const raw = data?.full_tc || {};
    statusBody.innerHTML = [
      `<tr><td>소스 타입</td><td>${String(raw.source_type || "-")}</td></tr>`,
      `<tr><td>소스</td><td>${String(raw.source || "-")}</td></tr>`,
      `<tr><td>업로드 시각</td><td>${fmt(raw.uploaded_at)}</td></tr>`,
      `<tr><td>파일 존재</td><td>${raw.exists ? "예" : "아니오"}</td></tr>`,
    ].join("");
  }

  async function loadStatus() {
    try {
      const res = await fetch("/api/upload/source-status", { credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(String(data?.detail || "상태 조회 실패"));
      renderStatus(data);
    } catch (err) {
      statusBody.innerHTML = `<tr><td colspan=\"2\">${String(err?.message || err)}</td></tr>`;
    }
  }

  async function uploadFile(file) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload/full-tc", {
      method: "POST",
      body: fd,
      credentials: "same-origin",
    });
    const data = await res.json();
    if (!res.ok || !data?.ok) throw new Error(String(data?.detail || "업로드 실패"));
    return data;
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("fullTcFile");
    const file = input?.files?.[0];
    if (!file) {
      hint.textContent = "업로드할 파일을 선택해 주세요.";
      return;
    }
    uploadBtn.disabled = true;
    hint.textContent = "업로드 및 시트 인덱싱 중...";
    try {
      const data = await uploadFile(file);
      hint.textContent = `업로드 완료 | 시트 ${Number(data.sheet_count || 0)}개`;
      await loadStatus();
    } catch (err) {
      hint.textContent = `실패: ${String(err?.message || err)}`;
    } finally {
      uploadBtn.disabled = false;
    }
  });

  loadStatus();
})();
