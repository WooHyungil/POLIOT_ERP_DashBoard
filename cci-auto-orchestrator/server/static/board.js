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
const BOARD_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const BOARD_URGENT_POLL_MS = 10000;
const BOARD_SYNC_POLL_MS = 4000;
const COMMENT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const COMMENT_MAX_FILE_COUNT = 5;
const COMMENT_PICKER_EMOJIS = ['😀','😂','👍','🙏','🔥','✅','🎉','😮','😢','❤️','👀','💡'];
const QUICK_REACTION_EMOJIS = ['👍','❤️','😂','🎉','🔥','👀'];
const CUSTOM_EMOJI_RECENT_KEY = 'board.customEmojiRecent';

// @멘션 자동완성 상태
let _mentionMembers = null;
let _mentionTriggeredAt = -1;
let _customEmojis = [];
let _boardUpdateSeq = 0;
let _boardSyncInFlight = false;

function getRecentCustomEmojiNames() {
  try {
    const raw = JSON.parse(localStorage.getItem(CUSTOM_EMOJI_RECENT_KEY) || '[]');
    return Array.isArray(raw) ? raw.map((v) => String(v || '').toLowerCase()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function touchRecentCustomEmojiByToken(token) {
  const m = String(token || '').trim().match(/^:([a-z0-9_]{2,30}):$/i);
  if (!m) return;
  const name = String(m[1] || '').toLowerCase();
  const list = getRecentCustomEmojiNames().filter((v) => v !== name);
  list.unshift(name);
  try {
    localStorage.setItem(CUSTOM_EMOJI_RECENT_KEY, JSON.stringify(list.slice(0, 30)));
  } catch {}
}

function sortCustomEmojisByRecent(items) {
  const recent = getRecentCustomEmojiNames();
  const rank = new Map(recent.map((name, idx) => [name, idx]));
  return [...items].sort((a, b) => {
    const an = String(a?.name || '').toLowerCase();
    const bn = String(b?.name || '').toLowerCase();
    const ar = rank.has(an) ? rank.get(an) : 9999;
    const br = rank.has(bn) ? rank.get(bn) : 9999;
    if (ar !== br) return ar - br;
    return an.localeCompare(bn);
  });
}

function memberNameByEmail(email) {
  const target = String(email || '').toLowerCase();
  const list = Array.isArray(_mentionMembers) ? _mentionMembers : [];
  const hit = list.find((m) => String(m?.email || '').toLowerCase() === target);
  return hit ? String(hit.name || '').trim() : target;
}

// ── 유틸 ────────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function toSafeArray(v) {
  return Array.isArray(v) ? v : [];
}

function escapeRegExp(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function priorityTone(p) {
  const priority = String(p || 'Medium');
  if (priority === 'High') {
    return { cls: 'priority-high', icon: 'fas fa-exclamation-circle', title: '긴급 게시물' };
  }
  if (priority === 'Low') {
    return { cls: 'priority-low', icon: 'fas fa-arrow-circle-down', title: '일반 게시물' };
  }
  return { cls: 'priority-medium', icon: 'fas fa-minus-circle', title: '중요 게시물' };
}

function updateBoardPolicyNotice() {
  const subtitle = document.querySelector('.meta-text');
  const notice = document.querySelector('.board-form-notice');
  if (subtitle) {
    subtitle.textContent = boardState.isAdmin
      ? '관리자는 게시글을 즉시 게시할 수 있고, 일반 사용자의 게시글은 승인 후 공개됩니다.'
      : '팀원들과 공유하고 싶은 내용을 게시하세요. 일반 사용자의 글은 관리자 승인 후 공개됩니다.';
  }
  if (notice) {
    notice.innerHTML = boardState.isAdmin
      ? '<i class="fas fa-info-circle"></i> 관리자 작성 글은 바로 게시됩니다. 일반 사용자의 글은 승인 후 공개되며, 중요도에 따라 하단 알림 색상이 달라집니다.'
      : '<i class="fas fa-info-circle"></i> 게시글은 관리자 승인 후 게시판에 공개됩니다. 승인된 글은 중요도에 따라 하단 알림 색상으로 표시됩니다.';
  }
}

function statusLabel(s) {
  if (s === 'approved') return '✅ 승인됨';
  if (s === 'rejected') return '❌ 반려됨';
  if (s === 'withdrawn') return '↩️ 요청 철회';
  return '⏳ 승인 대기';
}

// ── API ────────────────────────────────────────────────────────────────────
async function apiFetch(url, opts = {}) {
  const r = await fetch(url, { credentials: 'include', ...opts });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) {
    const next = encodeURIComponent(`${window.location.pathname}${window.location.hash || ''}`);
    window.location.href = `/auth/login?next=${next}`;
    throw new Error('로그인이 필요합니다. 로그인 페이지로 이동합니다.');
  }
  if (!r.ok) throw new Error(data.detail || r.statusText);
  return data;
}

function buildFileList(files) {
  const dt = new DataTransfer();
  Array.from(files || []).forEach((file) => dt.items.add(file));
  return dt.files;
}

function normalizeSelectedFiles(fileList, announce = true) {
  const valid = [];
  const rejected = [];
  Array.from(fileList || []).forEach((file) => {
    if (Number(file.size || 0) > BOARD_MAX_FILE_SIZE_BYTES) {
      rejected.push(`${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
      return;
    }
    valid.push(file);
  });
  if (announce && rejected.length) {
    toast(`20MB 초과 파일은 첨부할 수 없습니다: ${rejected.join(', ')}`, 'error');
  }
  return { valid, rejected };
}

function applyFilesToInput(fileInput, files, announce = true) {
  if (!fileInput) return false;
  const { valid } = normalizeSelectedFiles(files, announce);
  fileInput.files = buildFileList(valid);
  renderFilePreview(fileInput.files);
  return valid.length > 0 || Array.from(files || []).length === 0;
}

// ── 목록 로드 ───────────────────────────────────────────────────────────────
async function loadPosts() {
  try {
    const data = await apiFetch('/api/board/posts');
    boardState.posts = data.items || [];
    boardState.isAdmin = !!data.is_admin;
    updateBoardPolicyNotice();

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
    items = items.filter(p => p.status === 'pending' || p.status === 'rejected');
  } else if (filter !== 'all') {
    items = items.filter(p => p.priority === filter && p.status === 'approved');
  } else {
    items = items.filter(p => {
      const authorEmail = String(p.author_email || '').toLowerCase();
      return p.status === 'approved' || boardState.isAdmin || (currentEmail && authorEmail === currentEmail);
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
  const normalizedId = String(id || '').trim();
  if (!normalizedId) {
    boardState.currentPostId = null;
    boardState.currentPost = null;
    showView('empty');
    renderList();
    return;
  }

  boardState.currentPostId = normalizedId;
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
    let data;
    try {
      data = await apiFetch(`/api/board/posts/${encodeURIComponent(normalizedId)}`);
    } catch {
      data = await apiFetch(`/api/board/post?post_id=${encodeURIComponent(normalizedId)}`);
    }
    if (!data || !data.post) {
      throw new Error('게시글 데이터를 받지 못했습니다.');
    }
    boardState.currentEmail = data.current_email || '';
    renderPostDetail(data.post, data.is_admin, data.current_email);
  } catch (e) {
    if (contentEl) {
      contentEl.innerHTML = `<div class="board-error"><i class="fas fa-exclamation-triangle"></i> 글 불러오기 실패: ${esc(e.message)}</div>`;
    }
  }
}

function getPostIdFromHash() {
  const raw = String(window.location.hash || '').replace(/^#/, '').trim();
  if (!raw) return '';
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw;
  }
}

async function openPostFromHash() {
  const postId = getPostIdFromHash();
  if (!postId) return;
  if (postId === boardState.currentPostId) return;
  await openPost(postId);
}

function renderPostDetail(post, isAdmin, currentEmail) {
  const view = document.getElementById('boardPostView');
  const priorityCls = `priority-${String(post.priority).toLowerCase()}`;
  boardState.currentPost = post;
  boardState.isAdmin = !!isAdmin;
  const comments = toSafeArray(post?.comments);
  const files = toSafeArray(post?.files);

  // 헤더
  document.getElementById('viewPriority').className = `board-priority-badge ${priorityCls}`;
  document.getElementById('viewPriority').innerHTML = priorityLabel(post.priority);
  document.getElementById('viewStatus').className = `board-status-badge board-status-${post.status}`;
  document.getElementById('viewStatus').textContent = statusLabel(post.status);
  document.getElementById('viewTitle').textContent = post.title;
  document.getElementById('viewAuthor').textContent = post.author_name;
  document.getElementById('viewDate').textContent = fmtDate(post.created_at);

  const commentCount = comments.length;
  document.getElementById('viewCommentCount').innerHTML = `<i class="fas fa-comment"></i> ${commentCount}`;
  const fileCount = files.length;
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
  const isOwner = String(post.author_email || '').toLowerCase() === String(currentEmail || '').toLowerCase();
  const canManage = isOwner || isAdmin;
  ownerAct.hidden = !canManage;
  if (editBtn) editBtn.hidden = !canManage;
  if (withdrawBtn) withdrawBtn.hidden = !(canManage && (post.status === 'pending' || post.status === 'rejected'));

  // 본문 (줄바꿈 처리)
  document.getElementById('viewContent').innerHTML = esc(post.content).replace(/\n/g, '<br>');

  // 첨부파일
  const filesWrap = document.getElementById('viewFilesWrap');
  if (files.length > 0) {
    filesWrap.hidden = false;
    document.getElementById('viewFileList').innerHTML = files.map(f =>
      `<li><a href="${esc(f.path)}" download="${esc(f.original_name)}" target="_blank">
        <i class="fas fa-file-download"></i> ${esc(f.original_name)}
      </a></li>`
    ).join('');
  } else {
    filesWrap.hidden = true;
  }

  // 댓글
  renderComments(comments);
  resetReplyTarget();

  // 댓글 폼: 승인된 글에만 보임
  const commentForm = document.getElementById('commentForm');
  if (commentForm) commentForm.style.display = post.status === 'approved' ? 'flex' : 'none';

  view.hidden = false;
}

function renderComments(comments) {
  comments = toSafeArray(comments);
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
    const currentEmail = String(boardState.currentEmail || '').toLowerCase();
    const canDelete = boardState.isAdmin || String(comment.author_email || '').toLowerCase() === currentEmail;
    const bodyHtml = renderCommentBody(comment.content || '', comment.mentions || []);
    const fileHtml = renderCommentFiles(toSafeArray(comment.files));
    const reactionHtml = renderCommentReactions(toSafeArray(comment.reactions), currentEmail, comment.id);
    const replyClass = depth > 0 ? ' board-comment-reply' : '';
    return `
      <div class="board-comment-item${replyClass}" style="margin-left:${indent}px;">
        <div class="board-comment-head">
          <span class="board-comment-author"><i class="fas fa-user-circle"></i> ${esc(comment.author_name)}</span>
          <span class="board-comment-date">${fmtDate(comment.created_at)}</span>
        </div>
        <div class="board-comment-body">${bodyHtml}</div>
        ${fileHtml}
        <div class="board-comment-reactions">${reactionHtml}</div>
        ${(canReply || canDelete) ? `<div class="board-comment-actions">${canReply ? `<button type="button" class="btn-ghost" data-reply-comment-id="${esc(comment.id)}" data-reply-comment-author="${esc(comment.author_name || '')}">답글</button>` : ''}${canDelete ? `<button type="button" class="btn-ghost board-comment-delete-btn" data-delete-comment-id="${esc(comment.id)}">삭제</button>` : ''}</div>` : ''}
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

  list.querySelectorAll('[data-delete-comment-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const commentId = btn.getAttribute('data-delete-comment-id') || '';
      if (!commentId || !boardState.currentPostId) return;
      if (!window.confirm('이 댓글을 삭제하시겠습니까? 대댓글이 있으면 함께 삭제됩니다.')) return;
      try {
        await apiFetch(`/api/board/posts/${encodeURIComponent(boardState.currentPostId)}/comments/${encodeURIComponent(commentId)}`, {
          method: 'DELETE',
        });
        toast('댓글이 삭제되었습니다.', 'ok');
        await openPost(boardState.currentPostId);
      } catch (error) {
        toast(`오류: ${error.message}`, 'error');
      }
    });
  });

  list.querySelectorAll('[data-reaction-emoji]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const commentId = btn.getAttribute('data-reaction-comment-id') || '';
      const emoji = btn.getAttribute('data-reaction-emoji') || '';
      if (!commentId || !emoji || !boardState.currentPostId) return;
      touchRecentCustomEmojiByToken(emoji);
      try {
        await apiFetch(`/api/board/posts/${encodeURIComponent(boardState.currentPostId)}/comments/${encodeURIComponent(commentId)}/reactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emoji }),
        });
        await openPost(boardState.currentPostId);
      } catch (error) {
        toast(`오류: ${error.message}`, 'error');
      }
    });
  });
}

function renderCommentBody(content, mentions) {
  let html = esc(content || '').replace(/\n/g,'<br>');
  (mentions || []).forEach((m) => {
    const name = String((m || {}).name || '').trim();
    if (!name) return;
    const re = new RegExp(`(^|\\s)@${escapeRegExp(name)}(?=\\s|$|<br>)`, 'g');
    html = html.replace(re, `$1<span class="mention-tag">@${esc(name)}</span>`);
  });

  _customEmojis.forEach((item) => {
    const name = String(item?.name || '').trim();
    const path = String(item?.path || '').trim();
    if (!name || !path) return;
    const token = `:${name}:`;
    const re = new RegExp(escapeRegExp(token), 'g');
    html = html.replace(re, `<img class="inline-custom-emoji" src="${esc(path)}" alt=":${esc(name)}:" />`);
  });

  return html;
}

async function loadCustomEmojis() {
  try {
    const data = await apiFetch('/api/board/emojis');
    _customEmojis = sortCustomEmojisByRecent(Array.isArray(data.items) ? data.items : []);
  } catch {
    _customEmojis = [];
  }
}

async function pollBoardUpdates() {
  if (_boardSyncInFlight) return;
  _boardSyncInFlight = true;
  try {
    const data = await apiFetch(`/api/board/updates/since?seq=${encodeURIComponent(_boardUpdateSeq)}`);
    const nextSeq = Number(data?.seq || 0);
    if (Number.isFinite(nextSeq) && nextSeq > 0) {
      _boardUpdateSeq = nextSeq;
    }
    if (data?.changed) {
      await loadCustomEmojis();
      await loadPosts();
      if (boardState.currentPostId) {
        await openPost(boardState.currentPostId);
      }
      await loadUrgentFloat();
    }
  } catch {
    // ignore sync error
  } finally {
    _boardSyncInFlight = false;
  }
}

function renderCommentReactions(reactions, currentEmail, commentId) {
  const all = Array.isArray(reactions) ? reactions : [];
  const map = new Map();
  all.forEach((r) => {
    const emoji = String((r || {}).emoji || '').trim();
    if (!emoji) return;
    const users = Array.isArray(r.users) ? r.users.map(v => String(v || '').toLowerCase()) : [];
    map.set(emoji, users);
  });

  const chunks = [];
  map.forEach((users, emoji) => {
    const mine = users.includes(String(currentEmail || '').toLowerCase());
    const names = users.map(memberNameByEmail).filter(Boolean);
    const title = names.length ? `title="${esc(names.join(', '))}"` : '';
    chunks.push(`<button type="button" class="board-reaction-chip${mine ? ' active' : ''}" data-reaction-comment-id="${esc(commentId)}" data-reaction-emoji="${esc(emoji)}" data-reaction-users="${esc(names.join(', '))}" ${title}>${renderReactionVisual(emoji)} <span>${users.length}</span></button>`);
  });

  const quickCustom = sortCustomEmojisByRecent(_customEmojis).slice(0, 3).map((x) => `:${x.name}:`);
  const quickList = QUICK_REACTION_EMOJIS.concat(quickCustom);
  quickList.forEach((emoji) => {
    if (map.has(emoji)) return;
    chunks.push(`<button type="button" class="board-reaction-chip ghost" data-reaction-comment-id="${esc(commentId)}" data-reaction-emoji="${esc(emoji)}">${renderReactionVisual(emoji)}</button>`);
  });

  return chunks.join('');
}

function getCustomEmojiPathByToken(token) {
  const t = String(token || '').trim();
  const m = t.match(/^:([a-z0-9_]{2,30}):$/i);
  if (!m) return '';
  const name = String(m[1] || '').toLowerCase();
  const hit = _customEmojis.find((x) => String(x?.name || '').toLowerCase() === name);
  return hit ? String(hit.path || '') : '';
}

function renderReactionVisual(emoji) {
  const token = String(emoji || '').trim();
  const customPath = getCustomEmojiPathByToken(token);
  if (customPath) {
    return `<img class="reaction-custom-emoji" src="${esc(customPath)}" alt="${esc(token)}" />`;
  }
  return esc(token);
}

function renderCommentFiles(files) {
  const list = Array.isArray(files) ? files : [];
  if (!list.length) return '';
  return `
    <div class="board-comment-files">
      ${list.map((f) => {
        const name = esc(f.original_name || '첨부파일');
        const path = esc(f.path || '#');
        const isImage = !!f.is_image;
        if (isImage) {
          return `<a class="board-comment-file board-comment-image" href="${path}" target="_blank" rel="noopener"><img src="${path}" alt="${name}" loading="lazy" /></a>`;
        }
        return `<a class="board-comment-file" href="${path}" target="_blank" rel="noopener"><i class="fas fa-paperclip"></i> ${name}</a>`;
      }).join('')}
    </div>
  `;
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
      applyFilesToInput(fileInput, e.dataTransfer.files);
    });
    fileInput.addEventListener('change', () => applyFilesToInput(fileInput, fileInput.files));
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
        const fileInput = document.getElementById('formFiles');
        if (fileInput && !applyFilesToInput(fileInput, fileInput.files, true)) {
          throw new Error('첨부 파일을 다시 확인해 주세요.');
        }
        const fd = new FormData(form);
        await apiFetch('/api/board/posts', { method: 'POST', body: fd });
        toast(boardState.isAdmin ? '게시글이 즉시 게시되었습니다.' : '게시글이 등록되었습니다. 관리자 승인 후 공개됩니다.', 'ok');
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
    if (!confirm('이 게시글의 승인 요청을 철회하시겠습니까?')) return;
    try {
      await apiFetch(`/api/board/posts/${encodeURIComponent(boardState.currentPostId)}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      toast('게시글 요청이 철회되었습니다.', 'warn');
      await loadPosts();
      await openPost(boardState.currentPostId);
      await loadUrgentFloat();
    } catch (e) {
      toast(`오류: ${e.message}`, 'error');
    }
  });

  // 댓글 폼
  const commentInput = document.getElementById('commentInput');
  const commentFiles = document.getElementById('commentFiles');
  const commentFilePreview = document.getElementById('commentFilePreview');
  const commentDropZone = document.getElementById('commentDropZone');
  const commentCharCount = document.getElementById('commentCharCount');
  commentInput?.addEventListener('input', () => {
    if (commentCharCount) commentCharCount.textContent = `${commentInput.value.length} / 1000`;
    _checkMentionTrigger(commentInput);
  });
  commentInput?.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') document.getElementById('commentForm').requestSubmit();
    // Esc로 멘션 드롭다운 닫기
    if (e.key === 'Escape') _hideMentionDropdown();
  });
  commentInput?.addEventListener('blur', () => {
    // mousedown 이벤트가 멌저 발사되므로 조금 지연 후 닫기
    setTimeout(_hideMentionDropdown, 150);
  });
  document.getElementById('commentReplyCancelBtn')?.addEventListener('click', () => {
    resetReplyTarget();
  });
  initCommentEmojiPicker(commentInput);

  commentFiles?.addEventListener('change', () => {
    const files = Array.from(commentFiles.files || []);
    const valid = files
      .filter((f) => Number(f.size || 0) <= COMMENT_MAX_FILE_SIZE_BYTES)
      .slice(0, COMMENT_MAX_FILE_COUNT);
    commentFiles.files = buildFileList(valid);
    if (commentFilePreview) {
      commentFilePreview.innerHTML = valid.map((f) =>
        `<div class="board-file-preview-item"><i class="fas fa-file"></i><span>${esc(f.name)}</span><small class="hint">${(f.size / 1024 / 1024).toFixed(2)} MB</small></div>`
      ).join('');
    }
    if (files.length > valid.length) {
      toast('댓글 첨부는 최대 5개, 파일당 10MB까지 가능합니다.', 'warn');
    }
  });

  if (commentDropZone && commentFiles) {
    commentDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      commentDropZone.classList.add('drag-over');
    });
    commentDropZone.addEventListener('dragleave', () => {
      commentDropZone.classList.remove('drag-over');
    });
    commentDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      commentDropZone.classList.remove('drag-over');
      const dropped = Array.from(e.dataTransfer?.files || []);
      const merged = Array.from(commentFiles.files || []).concat(dropped);
      const valid = merged
        .filter((f) => Number(f.size || 0) <= COMMENT_MAX_FILE_SIZE_BYTES)
        .slice(0, COMMENT_MAX_FILE_COUNT);
      commentFiles.files = buildFileList(valid);
      if (commentFilePreview) {
        commentFilePreview.innerHTML = valid.map((f) =>
          `<div class="board-file-preview-item"><i class="fas fa-file"></i><span>${esc(f.name || 'file')}</span><small class="hint">${(f.size / 1024 / 1024).toFixed(2)} MB</small></div>`
        ).join('');
      }
      if (dropped.length) toast('드롭한 파일을 댓글 첨부에 추가했습니다.', 'ok');
    });
  }

  commentInput?.addEventListener('paste', (e) => {
    if (!commentFiles) return;
    const items = Array.from(e.clipboardData?.items || []);
    const pastedFiles = items
      .filter((it) => it.kind === 'file')
      .map((it) => it.getAsFile())
      .filter(Boolean);
    if (!pastedFiles.length) return;
    e.preventDefault();

    const merged = Array.from(commentFiles.files || []).concat(pastedFiles);
    const valid = merged
      .filter((f) => Number(f.size || 0) <= COMMENT_MAX_FILE_SIZE_BYTES)
      .slice(0, COMMENT_MAX_FILE_COUNT);
    commentFiles.files = buildFileList(valid);
    if (commentFilePreview) {
      commentFilePreview.innerHTML = valid.map((f) =>
        `<div class="board-file-preview-item"><i class="fas fa-file"></i><span>${esc(f.name || 'pasted-image.png')}</span><small class="hint">${(f.size / 1024 / 1024).toFixed(2)} MB</small></div>`
      ).join('');
    }
    toast('붙여넣은 이미지를 댓글 첨부에 추가했습니다.', 'ok');
  });

  document.getElementById('commentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    _hideMentionDropdown();
    const content = commentInput?.value.trim();
    const hasFiles = !!(commentFiles && commentFiles.files && commentFiles.files.length > 0);
    if ((!content && !hasFiles) || !boardState.currentPostId) return;
    const btn = document.getElementById('commentSubmitBtn');
    btn.disabled = true;
    try {
      const fd = new FormData();
      fd.append('content', content || '');
      fd.append('parent_id', boardState.replyParentId || '');
      Array.from(commentFiles?.files || []).forEach((f) => fd.append('files', f));
      await apiFetch(`/api/board/posts/${encodeURIComponent(boardState.currentPostId)}/comments`, {
        method: 'POST',
        body: fd,
      });
      commentInput.value = '';
      if (commentFiles) commentFiles.value = '';
      if (commentFilePreview) commentFilePreview.innerHTML = '';
      resetReplyTarget();
      if (commentCharCount) commentCharCount.textContent = '0 / 1000';
      toast('댓글이 등록되었습니다.', 'ok');
      await openPost(boardState.currentPostId);
    } catch (err) {
      toast(`오류: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

function initCommentEmojiPicker(commentInput) {
  const btn = document.getElementById('commentEmojiBtn');
  const picker = document.getElementById('commentEmojiPicker');
  if (!btn || !picker || !commentInput) return;
  let customQuery = '';

  const renderPicker = () => {
    picker.className = 'comment-emoji-picker-wrap';
    const builtinHtml = COMMENT_PICKER_EMOJIS.map((emoji) =>
      `<button type="button" class="comment-emoji-item" data-emoji="${emoji}">${emoji}</button>`
    ).join('');
    const filtered = _customEmojis.filter((item) => {
      const n = String(item?.name || '').toLowerCase();
      return !customQuery || n.includes(customQuery);
    });
    const customHtml = filtered.map((item) => {
      const token = `:${item.name}:`;
      const delBtn = item.can_delete ? `<button type="button" class="custom-emoji-del" data-custom-del-id="${esc(item.id)}" title="삭제">✕</button>` : '';
      return `<div class="custom-emoji-cell"><button type="button" class="comment-emoji-item custom" data-custom-token="${esc(token)}" title="${esc(token)}"><img src="${esc(item.path)}" alt="${esc(token)}" /></button>${delBtn}</div>`;
    }).join('');

    picker.innerHTML = `
      <div class="comment-emoji-picker">${builtinHtml}${customHtml}</div>
      <div class="comment-emoji-upload">
        <input type="text" id="customEmojiSearch" placeholder="custom 검색" value="${esc(customQuery)}" maxlength="30" />
        <input type="text" id="customEmojiName" placeholder="custom_emoji_name" maxlength="30" />
        <input type="file" id="customEmojiFile" accept=".png,.jpg,.jpeg,.gif,.webp" />
        <button type="button" id="customEmojiAddBtn" class="btn-ghost">커스텀 추가</button>
      </div>
    `;

    picker.querySelector('#customEmojiSearch')?.addEventListener('input', (e) => {
      customQuery = String(e.target?.value || '').trim().toLowerCase();
      renderPicker();
    });

    picker.querySelectorAll('[data-emoji]').forEach((el) => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const emoji = el.getAttribute('data-emoji') || '';
        const start = commentInput.selectionStart;
        const end = commentInput.selectionEnd;
        const value = commentInput.value;
        commentInput.value = value.slice(0, start) + emoji + value.slice(end);
        const pos = start + emoji.length;
        commentInput.setSelectionRange(pos, pos);
        commentInput.focus();
        const cc = document.getElementById('commentCharCount');
        if (cc) cc.textContent = `${commentInput.value.length} / 1000`;
      });
    });

    picker.querySelectorAll('[data-custom-token]').forEach((el) => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const token = el.getAttribute('data-custom-token') || '';
        touchRecentCustomEmojiByToken(token);
        const start = commentInput.selectionStart;
        const end = commentInput.selectionEnd;
        const value = commentInput.value;
        const inserted = `${token} `;
        commentInput.value = value.slice(0, start) + inserted + value.slice(end);
        const pos = start + inserted.length;
        commentInput.setSelectionRange(pos, pos);
        commentInput.focus();
        const cc = document.getElementById('commentCharCount');
        if (cc) cc.textContent = `${commentInput.value.length} / 1000`;
      });
    });

    picker.querySelectorAll('[data-custom-del-id]').forEach((el) => {
      el.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const emojiId = el.getAttribute('data-custom-del-id') || '';
        if (!emojiId) return;
        if (!window.confirm('이 커스텀 이모지를 삭제하시겠습니까?')) return;
        try {
          await apiFetch(`/api/board/emojis/${encodeURIComponent(emojiId)}`, { method: 'DELETE' });
          await loadCustomEmojis();
          renderPicker();
          toast('커스텀 이모지를 삭제했습니다.', 'ok');
        } catch (err) {
          toast(`오류: ${err.message}`, 'error');
        }
      });
    });

    picker.querySelector('#customEmojiAddBtn')?.addEventListener('click', async () => {
      const nameEl = picker.querySelector('#customEmojiName');
      const fileEl = picker.querySelector('#customEmojiFile');
      const name = String(nameEl?.value || '').trim().toLowerCase();
      const file = fileEl?.files?.[0];
      if (!name || !file) {
        toast('커스텀 이모지 이름과 이미지를 선택해 주세요.', 'warn');
        return;
      }
      const fd = new FormData();
      fd.append('name', name);
      fd.append('file', file);
      try {
        await apiFetch('/api/board/emojis', { method: 'POST', body: fd });
        await loadCustomEmojis();
        renderPicker();
        toast('커스텀 이모지를 추가했습니다.', 'ok');
      } catch (err) {
        toast(`오류: ${err.message}`, 'error');
      }
    });
  };

  renderPicker();

  btn.addEventListener('click', () => {
    picker.hidden = !picker.hidden;
  });

  document.addEventListener('click', (e) => {
    if (picker.hidden) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest('#commentEmojiPicker') || target.closest('#commentEmojiBtn')) return;
    picker.hidden = true;
  });
}

function bindCommentImageLightbox() {

  function bindReactionUserPopover() {
    let pop = document.getElementById('reactionUserPopover');
    if (!pop) {
      pop = document.createElement('div');
      pop.id = 'reactionUserPopover';
      pop.className = 'reaction-user-popover';
      pop.hidden = true;
      document.body.appendChild(pop);
    }

    const hide = () => { pop.hidden = true; };
    document.querySelectorAll('.board-reaction-chip[data-reaction-users]').forEach((chip) => {
      chip.addEventListener('mouseenter', () => {
        const users = String(chip.getAttribute('data-reaction-users') || '').trim();
        if (!users) return;
        pop.textContent = users;
        const r = chip.getBoundingClientRect();
        pop.style.left = `${r.left + window.scrollX}px`;
        pop.style.top = `${r.top + window.scrollY - 34}px`;
        pop.hidden = false;
      });
      chip.addEventListener('mouseleave', hide);
    });
  }
  const modal = document.getElementById('boardImageLightbox');
  const modalImg = document.getElementById('boardImageLightboxImg');
  const closeBtn = document.getElementById('boardImageLightboxClose');
  if (!modal || !modalImg || !closeBtn) return;

  closeBtn.addEventListener('click', () => {
    modal.hidden = true;
    modalImg.setAttribute('src', '');
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.hidden = true;
      modalImg.setAttribute('src', '');
    }
  });

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const link = t.closest('.board-comment-image');
    if (!link) return;
    e.preventDefault();
    const href = String(link.getAttribute('href') || '').trim();
    if (!href) return;
    modalImg.setAttribute('src', href);
    modal.hidden = false;
  });

  bindReactionUserPopover();
}

function renderFilePreview(files) {
  const list = document.getElementById('filePreviewList');
  if (!list) return;
  if (!files || files.length === 0) { list.innerHTML = ''; return; }
  list.innerHTML = Array.from(files).map((f, i) =>
    `<div class="board-file-preview-item">
      <i class="fas fa-file"></i>
      <span>${esc(f.name)}</span>
      <small class="hint">${(f.size / 1024 / 1024).toFixed(2)} MB</small>
    </div>`
  ).join('');
}

// ── @멘션 자동완성 ──────────────────────────────────────────────────────────
function _injectMentionStyles() {
  if (document.getElementById('_mentionStyle')) return;
  const s = document.createElement('style');
  s.id = '_mentionStyle';
  s.textContent = `
    .mention-dropdown {
      position: absolute;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      box-shadow: 0 4px 18px rgba(0,0,0,.13);
      z-index: 9999;
      overflow: hidden;
      max-height: 220px;
      overflow-y: auto;
      min-width: 160px;
    }
    .mention-dropdown-item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 8px 14px;
      background: none;
      border: none;
      cursor: pointer;
      text-align: left;
      font-size: 14px;
      color: #374151;
      transition: background .15s;
    }
    .mention-dropdown-item:hover,
    .mention-dropdown-item:focus { background: #f3f4f6; outline: none; }
    .mention-name { font-weight: 600; color: #6366f1; }
    .board-comment-body .mention-tag {
      color: #6366f1;
      font-weight: 600;
      background: #eef2ff;
      border-radius: 4px;
      padding: 0 3px;
    }
    .comment-emoji-picker {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 6px;
      padding: 8px;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      background: #fff;
      box-shadow: 0 8px 24px rgba(0,0,0,.12);
      max-width: 280px;
    }
    .comment-emoji-picker-wrap {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .comment-emoji-upload {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr auto;
      gap: 6px;
      align-items: center;
    }
    .comment-emoji-upload input[type="text"],
    .comment-emoji-upload input[type="file"] {
      font-size: 12px;
      padding: 6px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      background: #fff;
    }
    .comment-emoji-item {
      font-size: 20px;
      border: none;
      background: #f9fafb;
      border-radius: 8px;
      cursor: pointer;
      padding: 6px;
    }
    .comment-emoji-item:hover { background: #eef2ff; }
    .comment-emoji-item.custom img {
      width: 20px;
      height: 20px;
      object-fit: contain;
      display: block;
      margin: 0 auto;
    }
    .custom-emoji-cell {
      position: relative;
      display: inline-block;
    }
    .custom-emoji-del {
      position: absolute;
      top: -6px;
      right: -6px;
      width: 16px;
      height: 16px;
      border: none;
      border-radius: 999px;
      background: #ef4444;
      color: #fff;
      font-size: 10px;
      line-height: 1;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .inline-custom-emoji {
      width: 18px;
      height: 18px;
      vertical-align: -3px;
      object-fit: contain;
    }
    .board-comment-reactions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
    }
    .board-comment-upload-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 6px;
    }
    .board-comment-upload-row.drag-over {
      outline: 2px dashed #6366f1;
      background: #eef2ff;
      border-radius: 10px;
      padding: 8px;
    }
    .board-comment-files {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 8px;
    }
    .board-comment-file {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 6px 10px;
      color: #374151;
      text-decoration: none;
      background: #f9fafb;
      max-width: 320px;
    }
    .board-comment-image {
      padding: 2px;
      border-radius: 10px;
      overflow: hidden;
    }
    .board-comment-image img {
      display: block;
      width: auto;
      height: auto;
      max-width: 220px;
      max-height: 160px;
      border-radius: 8px;
      object-fit: cover;
    }
    .board-reaction-chip {
      border: 1px solid #d1d5db;
      background: #fff;
      border-radius: 999px;
      padding: 2px 8px;
      cursor: pointer;
      font-size: 13px;
      line-height: 1.4;
    }
    .board-reaction-chip.active {
      border-color: #6366f1;
      background: #eef2ff;
      color: #3730a3;
    }
    .board-reaction-chip.ghost {
      opacity: .72;
    }
    .reaction-custom-emoji {
      width: 16px;
      height: 16px;
      object-fit: contain;
      vertical-align: -2px;
    }
    .reaction-user-popover {
      position: absolute;
      z-index: 12020;
      background: #111827;
      color: #fff;
      font-size: 12px;
      line-height: 1.35;
      border-radius: 8px;
      padding: 6px 8px;
      max-width: 320px;
      box-shadow: 0 8px 18px rgba(0,0,0,.2);
      pointer-events: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `;
  document.head.appendChild(s);
}

async function _loadMentionMembers() {
  if (_mentionMembers !== null) return _mentionMembers;
  try {
    const data = await apiFetch('/api/board/members');
    _mentionMembers = data.members || [];
  } catch {
    _mentionMembers = [];
  }
  return _mentionMembers;
}

function _hideMentionDropdown() {
  const dd = document.getElementById('_boardMentionDd');
  if (dd) dd.hidden = true;
}

async function _checkMentionTrigger(textarea) {
  const cursor = textarea.selectionStart;
  const textBefore = textarea.value.substring(0, cursor);
  const match = textBefore.match(/@([\w가-힣]{0,20})$/u);
  if (!match) { _hideMentionDropdown(); return; }

  const query = (match[1] || '').toLowerCase();
  _mentionTriggeredAt = cursor - match[0].length;

  const members = await _loadMentionMembers();
  const filtered = members.filter(m =>
    !query || m.name.toLowerCase().includes(query)
  ).slice(0, 8);

  if (filtered.length === 0) { _hideMentionDropdown(); return; }

  _injectMentionStyles();
  let dd = document.getElementById('_boardMentionDd');
  if (!dd) {
    dd = document.createElement('div');
    dd.id = '_boardMentionDd';
    dd.className = 'mention-dropdown';
    document.body.appendChild(dd);
  }

  // 드롭다운 위치: textarea 위 또는 아래
  const rect = textarea.getBoundingClientRect();
  const dropH = Math.min(filtered.length * 40 + 8, 220);
  const spaceAbove = rect.top;
  const spaceBelow = window.innerHeight - rect.bottom;
  const showAbove = spaceAbove >= dropH || spaceAbove >= spaceBelow;
  const top = showAbove
    ? rect.top + window.scrollY - dropH - 4
    : rect.bottom + window.scrollY + 4;
  dd.style.cssText = `position:absolute;left:${rect.left + window.scrollX}px;top:${top}px;width:${Math.min(rect.width, 280)}px;`;

  dd.innerHTML = filtered.map(m =>
    `<button type="button" class="mention-dropdown-item" data-name="${esc(m.name)}">
       <span class="mention-name">@${esc(m.name)}</span>
     </button>`
  ).join('');
  dd.hidden = false;

  dd.querySelectorAll('.mention-dropdown-item').forEach(btn => {
    btn.addEventListener('mousedown', (ev) => {
      ev.preventDefault(); // blur 없애기
      const name = btn.getAttribute('data-name') || '';
      const trigPos = _mentionTriggeredAt;
      const before = textarea.value.substring(0, trigPos);
      const afterCursor = textarea.value.substring(textarea.selectionStart);
      const inserted = `@${name} `;
      textarea.value = before + inserted + afterCursor;
      const nc = trigPos + inserted.length;
      textarea.setSelectionRange(nc, nc);
      _hideMentionDropdown();
      textarea.focus();
      const cc = document.getElementById('commentCharCount');
      if (cc) cc.textContent = `${textarea.value.length} / 1000`;
    });
  });
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
    const leadTone = priorityTone(items[0]?.priority);
    float.className = `board-urgent-float ${leadTone.cls}`;
    float.innerHTML = `
      <div class="board-urgent-header" id="boardUrgentToggle">
        <span class="board-urgent-fire"><i class="${leadTone.icon}"></i></span>
        <span class="board-urgent-title">${leadTone.title}</span>
        <span class="board-urgent-count">${items.length}</span>
        <button type="button" class="board-urgent-collapse" id="boardUrgentCloseBtn" title="닫기">✕</button>
        <button type="button" class="board-urgent-collapse" id="boardUrgentCollapseBtn" title="접기/펼치기">▼</button>
      </div>
      <div class="board-urgent-body" id="boardUrgentBody">
        ${items.map(p => `
          <div class="board-urgent-item ${priorityTone(p.priority).cls}" data-id="${esc(p.id)}" role="button" tabindex="0">
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

  await loadCustomEmojis();
  await _loadMentionMembers();
  bindEvents();
  bindCommentImageLightbox();
  await loadPosts();
  await pollBoardUpdates();
  await loadUrgentFloat();
  window.setInterval(() => {
    loadUrgentFloat();
  }, BOARD_URGENT_POLL_MS);
  window.setInterval(() => {
    pollBoardUpdates();
  }, BOARD_SYNC_POLL_MS);

  window.addEventListener('hashchange', () => {
    openPostFromHash();
  });

  // hash로 특정 글 직접 링크 지원
  await openPostFromHash();
}

document.addEventListener('DOMContentLoaded', init);
