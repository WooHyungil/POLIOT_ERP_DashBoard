// FontAwesome 아이콘 매핑 및 [아이콘][이름] 구조로 사이드바 메뉴 렌더링
document.addEventListener('DOMContentLoaded', function () {
  var sideNav = document.getElementById('sideNav');
  if (!sideNav) return;
  // 메뉴별 FontAwesome 아이콘 클래스 매핑
  var iconMap = {
    '메인': 'fa-solid fa-house',
    '바로가기': 'fa-solid fa-bolt',
    'QA 대시보드': 'fa-solid fa-chart-line',
    '관리': 'fa-solid fa-gear',
    '관리자': 'fa-solid fa-user-shield',
    '테스트': 'fa-solid fa-flask',
    '결함 상세': 'fa-solid fa-bug',
    '엑셀 센터': 'fa-solid fa-file-excel',
    '원격 리모컨': 'fa-solid fa-remote',
    '라이브 모니터': 'fa-solid fa-tv'
  };
  var links = sideNav.querySelectorAll('.side-nav-link, .side-nav-parent');
  links.forEach(function(link) {
    // 메뉴명 추출 (span.side-nav-text가 있으면 그걸, 없으면 textContent)
    var text = link.querySelector('.side-nav-text') ? link.querySelector('.side-nav-text').textContent.trim() : link.textContent.trim();
    if (text.length > 0) {
      link.setAttribute('title', text);
      // 기존 아이콘 제거
      var oldIcon = link.querySelector('.side-nav-icon');
      if (oldIcon) oldIcon.remove();
      // 아이콘 span 생성
      var iconSpan = document.createElement('span');
      iconSpan.className = 'side-nav-icon';
      var iconClass = iconMap[text] || 'fa-solid fa-circle';
      var iTag = document.createElement('i');
      iTag.className = iconClass;
      iconSpan.appendChild(iTag);
      link.insertBefore(iconSpan, link.firstChild);
      // 메뉴명 텍스트가 별도 span이 없으면 생성
      if (!link.querySelector('.side-nav-text')) {
        var textSpan = document.createElement('span');
        textSpan.className = 'side-nav-text';
        textSpan.textContent = text;
        // 기존 텍스트 노드 제거 후 삽입
        link.childNodes.forEach(function(node) {
          if (node.nodeType === 3 && node.textContent.trim().length > 0) node.remove();
        });
        link.appendChild(textSpan);
      }
    }
  });

  // 활성화 메뉴 자동 적용 (URL, 해시, 경로 기반)
  function setActiveMenu() {
    var path = window.location.pathname;
    var hash = window.location.hash;
    // 모든 active 제거
    sideNav.querySelectorAll('.active').forEach(function(el) { el.classList.remove('active'); });
    // 메인
    if (path === '/' || path === '/overview' || path === '/dashboard') {
      var mainLink = sideNav.querySelector('.side-nav-link[data-path="/"]');
      if (mainLink) mainLink.classList.add('active');
      // 바로가기 해시
      if (hash && hash.startsWith('#shortcut')) {
        var shortcutLink = sideNav.querySelector('.side-nav-link[data-view="shortcuts"]');
        if (shortcutLink) shortcutLink.classList.add('active');
      }
    }
    // 관리
    if (path.startsWith('/manage')) {
      var manageBtn = sideNav.querySelector('.side-nav-parent[data-path="/manage"]');
      if (manageBtn) manageBtn.classList.add('active');
      // 세부 메뉴
      if (path.startsWith('/manage/schedule')) {
        var sub1 = sideNav.querySelector('.side-nav-sublink[href="/manage/schedule"]');
        if (sub1) sub1.classList.add('active');
      } else if (path.startsWith('/manage/device')) {
        var sub2 = sideNav.querySelector('.side-nav-sublink[href="/manage/device"]');
        if (sub2) sub2.classList.add('active');
      }
    }
    // QA 대시보드
    if (path.startsWith('/qa')) {
      var qaBtn = sideNav.querySelector('.side-nav-parent[data-path="/qa"]');
      if (qaBtn) qaBtn.classList.add('active');
    }
    // 관리자
    if (path.startsWith('/admin')) {
      var adminLink = sideNav.querySelector('.side-nav-link[data-path="/admin"]');
      if (adminLink) adminLink.classList.add('active');
    }
    // 테스트
    if (path.startsWith('/test') || path.startsWith('/defects') || path.startsWith('/excel') || path.startsWith('/remote') || path.startsWith('/live')) {
      var testBtn = sideNav.querySelector('.side-nav-parent[data-path="/test"]');
      if (testBtn) testBtn.classList.add('active');
    }
    // 테스트 하위 메뉴
    if (path.startsWith('/defects')) {
      var sub = sideNav.querySelector('.side-nav-sublink[href="/defects"]');
      if (sub) sub.classList.add('active');
    } else if (path.startsWith('/excel')) {
      var sub = sideNav.querySelector('.side-nav-sublink[href="/excel"]');
      if (sub) sub.classList.add('active');
    } else if (path.startsWith('/remote')) {
      var sub = sideNav.querySelector('.side-nav-sublink[href="/remote"]');
      if (sub) sub.classList.add('active');
    } else if (path.startsWith('/live')) {
      var sub = sideNav.querySelector('.side-nav-sublink[href="/live"]');
      if (sub) sub.classList.add('active');
    }
  }
  setActiveMenu();
  window.addEventListener('hashchange', setActiveMenu);
  window.addEventListener('popstate', setActiveMenu);
});
async function postForm(url, formData) {
  const res = await fetch(url, { method: "POST", body: formData });
  return await res.json();
}

function renderSummary(s) {
  const reportHtml = s.report_path ? `<p>Report: <a href="${s.report_path}" target="_blank">open</a></p>` : "";
  const done = (s.passed || 0) + (s.failed || 0) + (s.nt || 0);
  const pct = s.total_tasks ? Math.round((done / s.total_tasks) * 100) : 0;
  return `
    <p>Run ID: ${s.run_id || "-"}</p>
    <p>Status: ${s.status}</p>
    <p>Tasks: total ${s.total_tasks}, pending ${s.pending}, running ${s.running}, passed ${s.passed}, failed ${s.failed}, N/T ${s.nt || 0}</p>
    <p>Progress: ${done}/${s.total_tasks} (${pct}%)</p>
    <p>Repeat: ${s.repeat_count}</p>
    ${reportHtml}
  `;
}

function renderDevices(devices) {
  if (!devices.length) return `<tr><td colspan="5">연결된 단말 없음</td></tr>`;
  return devices.map(d => `
    <tr>
      <td>${d.name}</td>
      <td>${d.platform}</td>
      <td>${d.udid}</td>
      <td>${d.last_seen}</td>
      <td>
        <div class="rename-wrap">
          <input class="rename-input" data-device-id="${d.device_id}" value="${d.name}" />
          <button class="rename-btn" data-device-id="${d.device_id}" type="button">저장</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function renderIssues(issues) {
  if (!issues.length) return `<tr><td colspan="4">이슈 없음</td></tr>`;
  return issues.map(i => {
    const shot = i.screenshot_path ? `<a href="${i.screenshot_path}" target="_blank">screenshot</a>` : "-";
    return `<tr><td>${i.time}</td><td>${i.device_id}</td><td>${i.testcase_id}</td><td>${i.issue}<br/>${shot}</td></tr>`;
  }).join("");
}

function renderProgress(rows) {
  if (!rows.length) return `<tr><td colspan="6">진행중인 Task 없음</td></tr>`;
  return rows.map(r => `<tr><td>${r.task_id.slice(0, 8)}</td><td>${r.device_id}</td><td>${r.testcase_id}</td><td>${r.iteration}</td><td>${r.status}</td><td>${r.issue || ""}</td></tr>`).join("");
}

function renderTestcasePreview(rows) {
  if (!rows.length) return `<tr><td colspan="6">로드된 테스트케이스 없음</td></tr>`;
  return rows.map(r => {
    const cls = [r.major, r.middle, r.minor].filter(Boolean).join(" > ");
    return `<tr><td>${r.testcase_id}</td><td>${r.source_row || ""}</td><td>${r.category || ""}</td><td>${cls}</td><td>${r.target || ""}</td><td>${r.value || ""}</td></tr>`;
  }).join("");
}

async function refreshTestcasePreview() {
  const res = await fetch("/api/testcases/preview?limit=200");
  const data = await res.json();
  document.getElementById("testcasePreviewTable").innerHTML = renderTestcasePreview(data.rows || []);
}

async function refreshDashboard() {
  const res = await fetch("/api/dashboard");
  const data = await res.json();
  document.getElementById("summary").innerHTML = renderSummary(data.run_summary);
  document.getElementById("deviceTable").innerHTML = renderDevices(data.devices);
  document.getElementById("issueTable").innerHTML = renderIssues(data.issues);
  document.getElementById("progressTable").innerHTML = renderProgress(data.progress_tasks || []);

  document.querySelectorAll(".rename-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const deviceId = btn.getAttribute("data-device-id");
      const input = document.querySelector(`.rename-input[data-device-id="${deviceId}"]`);
      const fd = new FormData();
      fd.append("name", input.value);
      await postForm(`/api/devices/${deviceId}/rename`, fd);
      refreshDashboard();
    });
  });
}

document.getElementById("uploadForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const result = await postForm("/api/upload-testcases", formData);
  document.getElementById("uploadResult").innerText = result.ok
    ? `${result.file} 업로드 완료 (TC ${result.testcase_count}개)`
    : JSON.stringify(result);
  refreshDashboard();
  refreshTestcasePreview();
});

document.getElementById("loadDefaultBtn").addEventListener("click", async () => {
  const result = await postForm("/api/load-default-testcases", new FormData());
  document.getElementById("uploadResult").innerText = result.ok
    ? `${result.file} 불러오기 완료 (TC ${result.testcase_count}개)`
    : JSON.stringify(result);
  refreshDashboard();
  refreshTestcasePreview();
});

document.getElementById("convertDefaultBtn").addEventListener("click", async () => {
  const result = await postForm("/api/convert-default-excel", new FormData());
  document.getElementById("uploadResult").innerText = result.ok
    ? `${result.source} -> ${result.converted} 변환 완료 | rows ${result.rows}, executable ${result.executable_count}, TC ${result.testcase_count}, unresolved ${result.unresolved}, note ${result.note_count}`
    : JSON.stringify(result);
  refreshDashboard();
  refreshTestcasePreview();
});

document.getElementById("convertUploadBtn").addEventListener("click", async () => {
  const result = await postForm("/api/convert-last-upload", new FormData());
  document.getElementById("uploadResult").innerText = result.ok
    ? `${result.source} -> ${result.converted} 변환 완료 | rows ${result.rows}, executable ${result.executable_count}, TC ${result.testcase_count}, unresolved ${result.unresolved}, note ${result.note_count}`
    : JSON.stringify(result);
  refreshDashboard();
  refreshTestcasePreview();
});

document.getElementById("runForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData();
  const repeat = e.target.querySelector('input[name="repeat_count"]').value;
  const runAndroid = e.target.querySelector('input[name="run_android"]').checked;
  const runIos = e.target.querySelector('input[name="run_ios"]').checked;
  fd.append("repeat_count", repeat);
  fd.append("run_android", runAndroid ? "true" : "false");
  fd.append("run_ios", runIos ? "true" : "false");
  const result = await postForm("/api/runs/start", fd);
  document.getElementById("runResult").innerText = result.ok
    ? `실행 시작: ${result.run_id} (task ${result.task_count}개)`
    : JSON.stringify(result);
  refreshDashboard();
});

document.getElementById("exportResultBtn").addEventListener("click", async () => {
  const result = await postForm("/api/results/export-default", new FormData());
  document.getElementById("runResult").innerText = result.ok
    ? `결과 파일 생성: ${result.file} (반영 행 ${result.updated_rows})`
    : JSON.stringify(result);
});

refreshDashboard();
refreshTestcasePreview();
setInterval(refreshDashboard, 3000);
setInterval(refreshTestcasePreview, 5000);
