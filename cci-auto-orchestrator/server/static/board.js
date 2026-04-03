/* board.js – 게시판 페이지 전체 로직 */
'use strict';

// ── 상태 ────────────────────────────────────────────────────────────────────
let boardState = {
  posts: [],
  isAdmin: false,
  currentEmail: '',
  activeFilter: 'all',
  currentPostId: null,
  currentPost: null,
  editingPostId: null,
  replyParentId: '',
  replyParentAuthor: '',
  view: 'empty', // 'empty' | 'post' | 'write'
};

let commentLiveTimer = null;
let lastCommentSyncToken = '';

// ── 유틸 ────────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function fmtDate(iso) {
  if (!iso) return '-';
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso + (iso.includes('T') ? 'Z' : '')));
  } catch { return iso; }
}

function toast(msg, type = 'ok') {
  const stack = document.getElementById('toastStack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = `toast-item toast-${type}`;
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => { el.classList.add('fade'); setTimeout(() => el.remove(), 250); }, 3000);
}

function priorityLabel(p) {
  if (p === 'High') return '<i class="fas fa-exclamation-circle"></i> High';
  if (p === 'Low') return '<i class="fas fa-arrow-circle-down"></i> Low';
  return '<i class="fas fa-minus-circle"></i> Medium';
}

function statusLabel(s) {
  if (s === 'approved') return '✅ 승인됨';
  if (s === 'rejected') return '❌ 반려됨';
  if (s === 'withdrawn') return '↩️ 요청 철회';
  return '⏳ 승인 대기';
}

function buildCommentSyncToken(comments) {
  return (comments || [])
    .map((c) => `${String(c?.id || '')}:${String(c?.created_at || '')}`)
    .join('|');
}

function isNearBottom(el) {
  if (!el) return false;
  const remain = el.scrollHeight - el.scrollTop - el.clientHeight;
  return remain <= 40;
}

function updateCommentCounters() {
  const commentCount = (boardState.currentPost?.comments || []).length;
  const c1 = document.getElementById('viewCommentCount');
  const c2 = document.getElementById('viewCommentsCountHead');
  if (c1) c1.innerHTML = `<i class="fas fa-comment"></i> ${commentCount}`;
  if (c2) c2.textContent = commentCount;
}

function stopCommentLiveSync() {
  if (commentLiveTimer) {
    clearInterval(commentLiveTimer);
    commentLiveTimer = null;
  }
}

function startCommentLiveSync() {
  stopCommentLiveSync();
  if (!boardState.currentPostId || boardState.view !== 'post') return;
  commentLiveTimer = setInterval(syncCurrentPostComments, 3000);
}

async function syncCurrentPostComments() {
  if (!boardState.currentPostId || boardState.view !== 'post') return;
  try {
    const data = await apiFetch(`/api/board/posts/${encodeURIComponent(boardState.currentPostId)}`);
    const nextPost = data?.post;
    if (!nextPost) return;
    const nextComments = nextPost.comments || [];
    const nextToken = buildCommentSyncToken(nextComments);
    if (nextToken === lastCommentSyncToken) return;

    const listEl = document.getElementById('viewCommentsList');
    const keepBottom = isNearBottom(listEl);

    boardState.currentPost = { ...boardState.currentPost, ...nextPost, comments: nextComments };
    renderComments(nextComments);
    updateCommentCounters();
    lastCommentSyncToken = nextToken;

    const listElAfter = document.getElementById('viewCommentsList');
    if (keepBottom && listElAfter) {
      listElAfter.scrollTop = listElAfter.scrollHeight;
    }
  } catch {
    // Ignore transient sync errors.
  }
}

function getExt(name) {
  const raw = String(name || '');
  const idx = raw.lastIndexOf('.');
  return idx >= 0 ? raw.slice(idx).toLowerCase() : '';
}

function isImageFile(file) {
  const imageExt = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);
  const ext = getExt(file?.original_name || file?.name || '');
  if (imageExt.has(ext)) return true;
  const ctype = String(file?.content_type || '').toLowerCase();
  return ctype.startsWith('image/');
}

function fileSizeLabel(size) {
  const n = Number(size || 0);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

// ── API ────────────────────────────────────────────────────────────────────
async function apiFetch(url, opts = {}) {
  const r = await fetch(url, { credentials: 'include', ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || r.statusText);
  return data;
}

// ── 목록 로드 ───────────────────────────────────────────────────────────────
async function loadPosts() {
  try {
    const data = await apiFetch('/api/board/posts');
    boardState.posts = data.items || [];
    boardState.isAdmin = !!data.is_admin;

    const noticeText = document.getElementById('boardFormNoticeText');
    if (noticeText) {
      noticeText.textContent = boardState.isAdmin
        ? '관리자 계정으로 등록한 게시글은 즉시 공개됩니다. High 중요도 글은 모든 페이지의 긴급 알림 영역에 표시됩니다.'
        : '일반 사용자 게시글은 관리자 승인 후 게시판에 공개됩니다. High 중요도 글은 승인 후 모든 페이지의 긴급 알림 영역에 표시됩니다.';
    }

    // 관리자에게 대기 필터 버튼 표시
    const pendingBtn = document.getElementById('boardPendingFilterBtn');
    if (pendingBtn) pendingBtn.hidden = !boardState.isAdmin;

    renderList();
  } catch (e) {
    document.getElementById('boardListWrap').innerHTML =
      `<div class="board-error"><i class="fas fa-exclamation-triangle"></i> 불러오기 실패: ${esc(e.message)}</div>`;
  }
}

function renderList() {
  const wrap = document.getElementById('boardListWrap');
  if (!wrap) return;

  const filter = boardState.activeFilter;
  let items = boardState.posts;
  const currentEmail = String(boardState.currentEmail || '').toLowerCase();

  if (filter === 'pending') {
    // 관리자용 대기 필터: pending + rejected + withdrawn 전부 보임
    items = items.filter(p => p.status === 'pending' || p.status === 'rejected' || p.status === 'withdrawn');
  } else if (filter !== 'all') {
    items = items.filter(p => p.priority === filter && p.status === 'approved');
  } else {
    items = items.filter(p => {
      const st = p.status;
      if (st === 'approved') return true;
      // 반려는 관리자/작성자에게만 노출
      if (st === 'rejected') {
        const authorEmail = String(p.author_email || '').toLowerCase();
        return boardState.isAdmin || (currentEmail && authorEmail === currentEmail);
      }
      // 철회는 삭제 처리 대상이므로 숨김 (구 데이터 보호 차원에서 관리자만 예외 노출)
      if (st === 'withdrawn') return boardState.isAdmin;
      // pending: 관리자 또는 작성자 본인
      const authorEmail = String(p.author_email || '').toLowerCase();
      return boardState.isAdmin || (currentEmail && authorEmail === currentEmail);
    });
  }

  document.getElementById('boardPostCount').textContent = items.length;

  if (items.length === 0) {
    wrap.innerHTML = `<div class="board-empty-list"><i class="fas fa-inbox"></i><p>게시글이 없습니다.</p></div>`;
    return;
  }

  wrap.innerHTML = items.map(p => {
    const isActive = p.id === boardState.currentPostId ? ' board-list-item--active' : '';
    const priorityCls = `priority-${String(p.priority).toLowerCase()}`;
    return `<div class="board-list-item${isActive} ${priorityCls}" data-id="${esc(p.id)}" tabindex="0" role="button" aria-label="${esc(p.title)}">
      <div class="board-list-item-head">
        <span class="board-priority-badge ${priorityCls}">${priorityLabel(p.priority)}</span>
        ${p.status !== 'approved' ? `<span class="board-status-small board-status-${p.status}">${statusLabel(p.status)}</span>` : ''}
        <span class="board-list-date">${fmtDate(p.created_at)}</span>
      </div>
      <div class="board-list-item-title">${esc(p.title)}</div>
      <div class="board-list-item-meta">
        <span><i class="fas fa-user"></i> ${esc(p.author_name)}</span>
        ${p.comment_count > 0 ? `<span><i class="fas fa-comment"></i> ${p.comment_count}</span>` : ''}
        ${p.file_count > 0 ? `<span><i class="fas fa-paperclip"></i> ${p.file_count}</span>` : ''}
      </div>
    </div>`;
  }).join('');

  // 클릭 이벤트
  wrap.querySelectorAll('.board-list-item').forEach(el => {
    el.addEventListener('click', () => openPost(el.dataset.id));
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openPost(el.dataset.id); });
  });
}

// ── 글 상세 열기 ─────────────────────────────────────────────────────────────
async function openPost(id) {
  boardState.currentPostId = id;
  showView('post');
  renderList(); // 선택 강조

  // 상세 루트 DOM을 교체하면 하위 id 요소가 사라져 후속 렌더링이 깨진다.
  const titleEl = document.getElementById('viewTitle');
  const contentEl = document.getElementById('viewContent');
  const commentsEl = document.getElementById('viewCommentsList');
  if (titleEl) titleEl.textContent = '불러오는 중...';
  if (contentEl) contentEl.innerHTML = '<div class="board-loading"><i class="fas fa-circle-notch fa-spin"></i> 불러오는 중...</div>';
  if (commentsEl) commentsEl.innerHTML = '';

  try {
    const data = await apiFetch(`/api/board/posts/${encodeURIComponent(id)}`);
    boardState.currentEmail = data.current_email || '';
    renderPostDetail(data.post, data.is_admin, data.current_email);
  } catch (e) {
    const msg = String(e.message || '').toLowerCase();
    if (msg.includes('not approved') || msg.includes('403')) {
      // 반려/비공개 글 — 목록으로 돌아가기
      boardState.currentPostId = null;
      showView('empty');
      renderList();
      toast('이 게시글은 비공개(반려/철회) 상태입니다.', 'warn');
    } else {
      if (contentEl) {
        contentEl.innerHTML = `<div class="board-error"><i class="fas fa-exclamation-triangle"></i> 글 불러오기 실패: ${esc(e.message)}</div>`;
      }
    }
  }
}

function renderPostDetail(post, isAdmin, currentEmail) {
  const view = document.getElementById('boardPostView');
  const priorityCls = `priority-${String(post.priority).toLowerCase()}`;
  boardState.currentPost = post;

  // 헤더
  document.getElementById('viewPriority').className = `board-priority-badge ${priorityCls}`;
  document.getElementById('viewPriority').innerHTML = priorityLabel(post.priority);
  document.getElementById('viewStatus').className = `board-status-badge board-status-${post.status}`;
  document.getElementById('viewStatus').textContent = statusLabel(post.status);
  document.getElementById('viewTitle').textContent = post.title;
  document.getElementById('viewAuthor').textContent = post.author_name;
  document.getElementById('viewDate').textContent = fmtDate(post.created_at);

  const commentCount = (post.comments || []).length;
  document.getElementById('viewCommentCount').innerHTML = `<i class="fas fa-comment"></i> ${commentCount}`;
  const fileCount = (post.files || []).length;
  const fileCountEl = document.getElementById('viewFileCount');
  fileCountEl.hidden = fileCount === 0;
  fileCountEl.innerHTML = `<i class="fas fa-paperclip"></i> ${fileCount}개`;

  // 반려 사유 표시
  const rejectedEl = document.getElementById('viewRejectedReason');
  if ((post.status === 'rejected' || post.status === 'withdrawn') && post.reject_reason) {
    rejectedEl.hidden = false;
    document.getElementById('viewRejectedReasonText').textContent = post.reject_reason;
  } else {
    rejectedEl.hidden = true;
  }

  // 작성자/관리자 액션 버튼
  const ownerAct = document.getElementById('viewOwnerActions');
  const editBtn = document.getElementById('viewEditBtn');
  const withdrawBtn = document.getElementById('viewWithdrawBtn');
  const deleteBtn = document.getElementById('viewDeleteBtn');
  const isOwner = String(post.author_email || '').toLowerCase() === String(currentEmail || '').toLowerCase();
  const canManage = isOwner || isAdmin;
  ownerAct.hidden = !canManage;
  if (editBtn) editBtn.hidden = !canManage;
  if (withdrawBtn) withdrawBtn.hidden = !(canManage && (post.status === 'pending' || post.status === 'rejected'));
  if (deleteBtn) deleteBtn.hidden = !canManage;

  // 본문 (줄바꿈 처리)
  document.getElementById('viewContent').innerHTML = esc(post.content).replace(/\n/g, '<br>');

  // 첨부파일
  const filesWrap = document.getElementById('viewFilesWrap');
  const files = post.files || [];
  if (files.length > 0) {
    filesWrap.hidden = false;
    document.getElementById('viewFileList').innerHTML = files.map((f, idx) => {
      const originalName = String(f?.original_name || `file-${idx + 1}`);
      const openPath = String(f?.path || '');
      const downloadPath = `/api/board/posts/${encodeURIComponent(post.id)}/files/${idx}/download`;
      const isImage = Boolean(f?.is_image) || isImageFile(f);
      const sizeText = fileSizeLabel(f?.size);

      if (isImage && openPath) {
        return `<li class="board-file-item board-file-item-image">
          <div class="board-file-meta">
            <i class="fas fa-image"></i>
            <span class="board-file-name">${esc(originalName)}</span>
            ${sizeText ? `<small class="hint">${esc(sizeText)}</small>` : ''}
          </div>
          <a href="${esc(openPath)}" target="_blank" rel="noopener noreferrer">
            <img class="board-file-image-preview" src="${esc(openPath)}" alt="${esc(originalName)}" loading="lazy" />
          </a>
          <div class="board-file-actions">
            <a href="${esc(openPath)}" target="_blank" rel="noopener noreferrer"><i class="fas fa-up-right-from-square"></i> 원본 보기</a>
            <a href="${esc(downloadPath)}"><i class="fas fa-download"></i> 파일 다운로드</a>
          </div>
        </li>`;
      }

      return `<li class="board-file-item">
        <div class="board-file-meta">
          <i class="fas fa-file"></i>
          <span class="board-file-name">${esc(originalName)}</span>
          ${sizeText ? `<small class="hint">${esc(sizeText)}</small>` : ''}
        </div>
        <div class="board-file-actions">
          ${openPath ? `<a href="${esc(openPath)}" target="_blank" rel="noopener noreferrer"><i class="fas fa-up-right-from-square"></i> 열기</a>` : ''}
          <a href="${esc(downloadPath)}"><i class="fas fa-download"></i> 파일 다운로드</a>
        </div>
      </li>`;
    }).join('');
  } else {
    filesWrap.hidden = true;
  }

  // 댓글
  renderComments(post.comments || []);
  resetReplyTarget();
  lastCommentSyncToken = buildCommentSyncToken(post.comments || []);
  startCommentLiveSync();

  // 댓글 폼: 승인된 글에만 보임
  const commentForm = document.getElementById('commentForm');
  if (commentForm) commentForm.style.display = 'flex';

  view.hidden = false;
}

function renderComments(comments) {
  const list = document.getElementById('viewCommentsList');
  document.getElementById('viewCommentsCountHead').textContent = comments.length;

  if (comments.length === 0) {
    list.innerHTML = `<p class="hint">첫 번째 댓글을 남겨보세요!</p>`;
    return;
  }

  const commentMap = new Map();
  const roots = [];
  comments.forEach((comment) => {
    const id = String(comment.id || '');
    commentMap.set(id, { ...comment, children: [] });
  });
  commentMap.forEach((comment) => {
    const parentId = String(comment.parent_id || '');
    if (parentId && commentMap.has(parentId)) {
      commentMap.get(parentId).children.push(comment);
    } else {
      roots.push(comment);
    }
  });

  const renderNode = (comment, depth = 0) => {
    const indent = Math.min(depth * 18, 54);
    const canReply = boardState.currentPost && boardState.currentPost.status === 'approved';
    const replyClass = depth > 0 ? ' board-comment-reply' : '';
    return `
      <div class="board-comment-item${replyClass}" style="margin-left:${indent}px;">
        <div class="board-comment-head">
          <span class="board-comment-author"><i class="fas fa-user-circle"></i> ${esc(comment.author_name)}</span>
          <span class="board-comment-date">${fmtDate(comment.created_at)}</span>
        </div>
        <div class="board-comment-body">${esc(comment.content).replace(/\n/g,'<br>')}</div>
        ${canReply ? `<div class="board-comment-actions"><button type="button" class="btn-ghost" data-reply-comment-id="${esc(comment.id)}" data-reply-comment-author="${esc(comment.author_name || '')}">답글</button></div>` : ''}
      </div>
      ${comment.children.map((child) => renderNode(child, depth + 1)).join('')}
    `;
  };

  list.innerHTML = roots.map((root) => renderNode(root)).join('');

  list.querySelectorAll('[data-reply-comment-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      boardState.replyParentId = btn.getAttribute('data-reply-comment-id') || '';
      boardState.replyParentAuthor = btn.getAttribute('data-reply-comment-author') || '';
      applyReplyTargetUI();
      document.getElementById('commentInput')?.focus();
    });
  });
}

function applyReplyTargetUI() {
  const targetWrap = document.getElementById('commentReplyTarget');
  const targetText = document.getElementById('commentReplyTargetText');
  if (!targetWrap || !targetText) return;
  if (!boardState.replyParentId) {
    targetWrap.hidden = true;
    targetText.textContent = '';
    return;
  }
  targetWrap.hidden = false;
  targetText.textContent = `${boardState.replyParentAuthor || '댓글'}님에게 답글 작성 중`;
}

function resetReplyTarget() {
  boardState.replyParentId = '';
  boardState.replyParentAuthor = '';
  applyReplyTargetUI();
}

// ── 뷰 전환 ─────────────────────────────────────────────────────────────────
function showView(view) {
  boardState.view = view;
  document.getElementById('boardEmptyState').hidden = view !== 'empty';
  document.getElementById('boardPostView').hidden = view !== 'post';
  document.getElementById('boardWriteForm').hidden = view !== 'write';
  if (view !== 'post') {
    stopCommentLiveSync();
  }
}

// ── 글 작성 폼 ───────────────────────────────────────────────────────────────
function openWriteForm() {
  boardState.editingPostId = null;
  showView('write');
  boardState.currentPostId = null;
  boardState.currentPost = null;
  renderList();
  document.getElementById('boardPostForm').reset();
  document.getElementById('formPriority').value = 'Medium';
  document.getElementById('filePreviewList').innerHTML = '';
  const formTitle = document.getElementById('boardFormTitle');
  if (formTitle) formTitle.innerHTML = '<i class="fas fa-edit"></i> 새 글 작성';
  const submitBtn = document.getElementById('boardFormSubmitBtn');
  if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> 게시글 등록';
  updateContentCharCount();

  // 우선순위 버튼 초기화
  document.querySelectorAll('.board-priority-opt').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === 'Medium');
  });
}

function openEditForm(post) {
  if (!post) return;
  boardState.editingPostId = post.id;
  showView('write');
  const formTitle = document.getElementById('boardFormTitle');
  if (formTitle) formTitle.innerHTML = '<i class="fas fa-pen"></i> 게시글 수정';
  const submitBtn = document.getElementById('boardFormSubmitBtn');
  if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-save"></i> 수정 저장';

  document.getElementById('formTitle').value = post.title || '';
  document.getElementById('formAuthorName').value = post.author_name || '';
  document.getElementById('formContent').value = post.content || '';
  document.getElementById('formPriority').value = post.priority || 'Medium';
  document.getElementById('filePreviewList').innerHTML = '';
  const fileInput = document.getElementById('formFiles');
  if (fileInput) fileInput.value = '';
  updateContentCharCount();

  document.querySelectorAll('.board-priority-opt').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === (post.priority || 'Medium'));
  });
}

function updateContentCharCount() {
  const el = document.getElementById('formContent');
  const count = document.getElementById('contentCharCount');
  if (el && count) count.textContent = `${el.value.length} / 5000`;
}

// ── 이벤트 바인딩 ────────────────────────────────────────────────────────────
function bindEvents() {
  // 글쓰기 버튼
  ['boardWriteBtn', 'boardWriteBtn2'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', openWriteForm);
  });

  // 폼 취소
  ['boardFormCancelBtn', 'boardFormCancelBtn2'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => {
      boardState.editingPostId = null;
      if (boardState.currentPostId) showView('post');
      else showView('empty');
    });
  });

  // 중요도 선택
  document.querySelectorAll('.board-priority-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.board-priority-opt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('formPriority').value = btn.dataset.value;
    });
  });

  // 본문 글자수
  document.getElementById('formContent')?.addEventListener('input', updateContentCharCount);

  // 파일 드롭존
  const dropZone = document.getElementById('fileDropZone');
  const fileInput = document.getElementById('formFiles');
  if (dropZone && fileInput) {
    dropZone.addEventListener('click', (e) => {
      if (e.target !== fileInput) fileInput.click();
    });
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      fileInput.files = e.dataTransfer.files;
      renderFilePreview(fileInput.files);
    });
    fileInput.addEventListener('change', () => renderFilePreview(fileInput.files));
  }

  // 글 등록 폼 제출
  document.getElementById('boardPostForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('boardFormSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> 처리 중...`;
    try {
      const form = e.target;
      if (boardState.editingPostId) {
        const payload = {
          title: document.getElementById('formTitle').value,
          author_name: document.getElementById('formAuthorName').value,
          content: document.getElementById('formContent').value,
          priority: document.getElementById('formPriority').value,
        };
        const data = await apiFetch(`/api/board/posts/${encodeURIComponent(boardState.editingPostId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        toast('게시글이 수정되었습니다. 작성자 수정본은 관리자 승인 후 다시 공개됩니다.', 'ok');
        const editedId = boardState.editingPostId;
        boardState.editingPostId = null;
        await loadPosts();
        await openPost(editedId);
        if (data?.post?.status === 'approved') {
          await loadUrgentFloat();
        }
      } else {
        const fd = new FormData(form);
        const created = await apiFetch('/api/board/posts', { method: 'POST', body: fd });
        const createdStatus = String((created?.post || {}).status || '').toLowerCase();
        if (createdStatus === 'approved') {
          toast('게시글이 등록되고 즉시 공개되었습니다.', 'ok');
        } else {
          toast('게시글이 등록되었습니다. 관리자 승인 후 공개됩니다.', 'ok');
        }
        await loadPosts();
        showView('empty');
        await loadUrgentFloat();
      }
    } catch (err) {
      toast(`오류: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      if (boardState.editingPostId) {
        btn.innerHTML = `<i class="fas fa-save"></i> 수정 저장`;
      } else {
        btn.innerHTML = `<i class="fas fa-paper-plane"></i> 게시글 등록`;
      }
    }
  });

  // 필터 버튼
  document.querySelectorAll('.board-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.board-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      boardState.activeFilter = btn.dataset.priority;
      renderList();
    });
  });

  // 수정 버튼
  document.getElementById('viewEditBtn')?.addEventListener('click', () => {
    if (!boardState.currentPost) return;
    openEditForm(boardState.currentPost);
  });

  // 요청 철회 버튼
  document.getElementById('viewWithdrawBtn')?.addEventListener('click', async () => {
    if (!boardState.currentPostId) return;
    const reason = prompt('요청 철회 사유를 입력하세요. (선택)', '') || '';
    if (!confirm('이 게시글의 승인 요청을 철회하고 글을 삭제하시겠습니까?\n\n삭제 후 복구할 수 없습니다.')) return;
    try {
      await apiFetch(`/api/board/posts/${encodeURIComponent(boardState.currentPostId)}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const deletedId = boardState.currentPostId;
      boardState.currentPostId = null;
      boardState.currentPost = null;
      showView('empty');
      toast('게시글 요청 철회와 함께 글이 삭제되었습니다.', 'warn');
      await loadPosts();
      if (deletedId && location.hash.replace('#', '') === deletedId) {
        history.replaceState(null, '', '/board');
      }
      await loadUrgentFloat();
    } catch (e) {
      toast(`오류: ${e.message}`, 'error');
    }
  });

  // 삭제 버튼
  document.getElementById('viewDeleteBtn')?.addEventListener('click', async () => {
    if (!boardState.currentPostId) return;
    const post = boardState.currentPost;
    const titlePreview = post?.title ? `"${post.title}"` : '이 게시글';
    if (!confirm(`${titlePreview}을(를) 삭제하시겠습니까?\n\n삭제 후 복구할 수 없습니다.`)) return;
    try {
      await apiFetch(`/api/board/posts/${encodeURIComponent(boardState.currentPostId)}`, {
        method: 'DELETE',
      });
      const deletedId = boardState.currentPostId;
      boardState.currentPostId = null;
      boardState.currentPost = null;
      showView('empty');
      toast('게시글이 삭제되었습니다.', 'warn');
      await loadPosts();
      if (deletedId && location.hash.replace('#', '') === deletedId) {
        history.replaceState(null, '', '/board');
      }
      await loadUrgentFloat();
    } catch (e) {
      toast(`오류: ${e.message}`, 'error');
    }
  });

  // 댓글 폼
  const commentInput = document.getElementById('commentInput');
  const commentCharCount = document.getElementById('commentCharCount');
  commentInput?.addEventListener('input', () => {
    if (commentCharCount) commentCharCount.textContent = `${commentInput.value.length} / 1000`;
  });
  commentInput?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.shiftKey) return;
    // Enter submits like messenger/youtube comment box, Shift+Enter adds newline.
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('commentForm')?.requestSubmit();
  });
  document.getElementById('commentReplyCancelBtn')?.addEventListener('click', () => {
    resetReplyTarget();
  });

  document.getElementById('commentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const content = commentInput?.value.trim();
    if (!content || !boardState.currentPostId) return;
    const btn = document.getElementById('commentSubmitBtn');
    btn.disabled = true;
    try {
      await apiFetch(`/api/board/posts/${encodeURIComponent(boardState.currentPostId)}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, parent_id: boardState.replyParentId || '' }),
      });

      const me = String(boardState.currentEmail || '').trim();
      const optimisticComment = {
        id: `local-${Date.now()}`,
        author_name: me || '나',
        author_email: me,
        content,
        parent_id: boardState.replyParentId || '',
        created_at: new Date().toISOString().slice(0, 19),
      };
      const currentComments = Array.isArray(boardState.currentPost?.comments) ? boardState.currentPost.comments : [];
      boardState.currentPost.comments = [...currentComments, optimisticComment];
      renderComments(boardState.currentPost.comments);
      updateCommentCounters();
      const listEl = document.getElementById('viewCommentsList');
      if (listEl) listEl.scrollTop = listEl.scrollHeight;

      commentInput.value = '';
      resetReplyTarget();
      if (commentCharCount) commentCharCount.textContent = '0 / 1000';
      toast('댓글이 등록되었습니다.', 'ok');
      setTimeout(syncCurrentPostComments, 150);
    } catch (err) {
      toast(`오류: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

function renderFilePreview(files) {
  const list = document.getElementById('filePreviewList');
  if (!list) return;
  if (!files || files.length === 0) { list.innerHTML = ''; return; }
  list.innerHTML = Array.from(files).map((f) => {
    const image = isImageFile(f);
    const sizeText = fileSizeLabel(f.size);
    if (image) {
      const previewUrl = URL.createObjectURL(f);
      return `<div class="board-file-preview-item board-file-preview-item-image">
        <img class="board-file-preview-thumb" src="${esc(previewUrl)}" alt="${esc(f.name)}" loading="lazy" />
        <div class="board-file-preview-meta">
          <span>${esc(f.name)}</span>
          <small class="hint">이미지${sizeText ? ` · ${esc(sizeText)}` : ''}</small>
        </div>
      </div>`;
    }
    return `<div class="board-file-preview-item">
      <i class="fas fa-file"></i>
      <span>${esc(f.name)}</span>
      <small class="hint">${esc(sizeText)}</small>
    </div>`;
  }).join('');
}

// ── 긴급 플로팅 배너 ──────────────────────────────────────────────────────────
async function loadUrgentFloat() {
  try {
    const data = await apiFetch('/api/board/urgent');
    const items = data.items || [];
    const float = document.getElementById('boardUrgentFloat');
    if (!float) return;
    if (items.length === 0) { float.hidden = true; return; }

    const latestToken = `${items[0]?.id || ''}|${items[0]?.created_at || ''}`;
    const dismissedToken = localStorage.getItem('board.urgent.dismissedToken') || '';
    if (dismissedToken && dismissedToken === latestToken) {
      float.hidden = true;
      return;
    }

    float.hidden = false;
    float.innerHTML = `
      <div class="board-urgent-header" id="boardUrgentToggle">
        <span class="board-urgent-fire"><i class="fas fa-fire"></i></span>
        <span class="board-urgent-title">긴급 게시물</span>
        <span class="board-urgent-count">${items.length}</span>
        <button type="button" class="board-urgent-collapse" id="boardUrgentCloseBtn" title="닫기">✕</button>
        <button type="button" class="board-urgent-collapse" id="boardUrgentCollapseBtn" title="접기/펼치기">▼</button>
      </div>
      <div class="board-urgent-body" id="boardUrgentBody">
        ${items.map(p => `
          <div class="board-urgent-item" data-id="${esc(p.id)}" role="button" tabindex="0">
            <span class="board-urgent-item-title">${esc(p.title)}</span>
            <span class="board-urgent-item-date">${fmtDate(p.created_at)}</span>
          </div>
        `).join('')}
        <a href="/board" class="board-urgent-more">게시판에서 전체 보기 →</a>
      </div>`;

    float.querySelectorAll('.board-urgent-item').forEach(el => {
      el.addEventListener('click', () => {
        window.location.href = `/board#${el.dataset.id}`;
      });
    });

    document.getElementById('boardUrgentCollapseBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const body = document.getElementById('boardUrgentBody');
      const btn = document.getElementById('boardUrgentCollapseBtn');
      const collapsed = body.style.display === 'none';
      body.style.display = collapsed ? '' : 'none';
      btn.textContent = collapsed ? '▼' : '▲';
    });

    document.getElementById('boardUrgentCloseBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      localStorage.setItem('board.urgent.dismissedToken', latestToken);
      float.hidden = true;
    });
  } catch (e) {
    console.warn('urgent load failed', e);
  }
}

// ── 초기화 ──────────────────────────────────────────────────────────────────
async function init() {
  // 세션 유저 정보 가져오기 (이름 자동 입력)
  try {
    const me = await apiFetch('/api/auth/me');
    const user = me?.user || me || {};
    if (user && user.name) {
      const nameInput = document.getElementById('formAuthorName');
      if (nameInput) nameInput.value = user.name;
    }
    if (user && user.email) boardState.currentEmail = user.email;
  } catch { /* ignore */ }

  bindEvents();
  await loadPosts();
  await loadUrgentFloat();

  // hash로 특정 글 직접 링크 지원
  const hash = location.hash.replace('#', '');
  if (hash && hash.startsWith('board-')) {
    openPost(hash);
  }

  window.addEventListener('beforeunload', stopCommentLiveSync);
}

document.addEventListener('DOMContentLoaded', init);
