/* B1U1 点读 App —— 目录 / 单元点读 / 导入 */
const $ = (s, r = document) => r.querySelector(s);
const appEl = $('#app');
const titleEl = $('#title');
const subEl = $('#sub');
const backEl = $('#back');
const toastEl = $('#toast');

const state = {
  units: [],      // 远端单元元数据（units/index.json）
  local: [],      // 本机导入的单元（IndexedDB）
  unit: null,     // 当前打开的单元
  showCn: true,
  showExt: true,
};

/* ---------- 小工具 ---------- */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toastEl.hidden = true; }, 2200);
}
async function fetchJSON(path, opts) {
  const r = await fetch(path, opts || {});
  if (!r.ok) throw new Error(path + ' → HTTP ' + r.status);
  return r.json();
}

/* ---------- 本地存储（IndexedDB） ---------- */
function idb() {
  return new Promise((res, rej) => {
    const q = indexedDB.open('b1u1app', 1);
    q.onupgradeneeded = () => { q.result.createObjectStore('units', { keyPath: 'id' }); };
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
async function idbAll() {
  const db = await idb();
  return new Promise((res, rej) => {
    const r = db.transaction('units', 'readonly').objectStore('units').getAll();
    r.onsuccess = () => res(r.result || []);
    r.onerror = () => rej(r.error);
  });
}
async function idbPut(unit) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('units', 'readwrite');
    tx.objectStore('units').put(unit);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function idbDel(id) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('units', 'readwrite');
    tx.objectStore('units').delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

/* ---------- 发音 ---------- */
const audio = new Audio();
audio.preload = 'auto';
function playSrc(src, fallbackText) {
  try {
    audio.pause();
    audio.src = src;
    audio.currentTime = 0;
    return audio.play().catch(() => speakTTS(fallbackText));
  } catch (e) { speakTTS(fallbackText); }
  return null;
}
function speakTTS(text) {
  if (!window.speechSynthesis) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-GB';
    u.rate = 0.95;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch (e) { /* ignore */ }
}
function playWord(item) {
  if (item.audio) { playSrc(item.audio, item.w || item.p); return; }
  const text = item.w || item.p;
  const url = 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(text) + '&type=1';
  try {
    const a = new Audio(url);
    a.play().catch(() => speakTTS(text));
  } catch (e) { speakTTS(text); }
}

/* ---------- 路由 ---------- */
function route() {
  const m = location.hash.match(/^#\/unit\/(.+)$/);
  if (m) openUnit(decodeURIComponent(m[1]));
  else renderTOC();
}
window.addEventListener('hashchange', route);

/* ---------- 目录页 ---------- */
function unitCard(u, isLocal) {
  const id = esc(u.id);
  const name = esc(u.title || u.id);
  const meta = [u.words ? u.words + ' 词' : '', u.phrases ? u.phrases + ' 短语' : '', u.subtitle ? esc(u.subtitle) : '']
    .filter(Boolean).join(' · ');
  const del = isLocal ? `<button class="del" data-del="${id}" aria-label="删除">✕</button>` : '';
  return `<div class="unit-card" data-open="${id}">
      <div class="unit-cover">${esc((u.title || '?').replace(/^Unit\s*/i, '').trim().slice(0, 2) || 'U')}</div>
      <div class="unit-info">
        <div class="unit-name">${name}${isLocal ? '<span class="badge">本地</span>' : ''}</div>
        <div class="unit-meta">${meta || '点开学习'}</div>
      </div>
      ${del}
    </div>`;
}

function renderTOC() {
  state.unit = null;
  titleEl.textContent = '点读单词';
  subEl.textContent = '目录 · 选择单元开始';
  backEl.hidden = true;
  const remote = state.units.map(u => unitCard(u, false)).join('');
  const local = state.local.map(u => unitCard(u, true)).join('');
  appEl.innerHTML = `
    <div class="actions">
      <button class="btn primary" id="importBtn">＋ 导入单元</button>
      <button class="btn" id="refreshBtn">刷新列表</button>
      <input type="file" id="fileInput" accept=".json,application/json" hidden>
    </div>
    <div class="section-title">教材单元</div>
    ${remote || '<div class="hint">还没有单元。把 unitX.json 放进 units/ 并在 units/index.json 里登记即可。</div>'}
    ${local ? '<div class="section-title">本机导入</div>' + local : ''}
    <div class="hint">
      · 单元页：点单词发音，点中文/行空白测试自己，▶ 朗读整节。<br>
      · 导入：选择 JSON 单元文件（格式见 <code>units/example.json</code>），会保存在本机。<br>
      · 新增教材单元：Agent 生成 <code>units/unitN.json</code> 并登记到 <code>units/index.json</code>，点“刷新列表”即可。
    </div>`;
  $('#importBtn').onclick = () => $('#fileInput').click();
  $('#fileInput').onchange = onImportFile;
  $('#refreshBtn').onclick = loadIndex;
  appEl.querySelectorAll('[data-open]').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.dataset.del) return;
      location.hash = '#/unit/' + encodeURIComponent(el.dataset.open);
    });
  });
  appEl.querySelectorAll('[data-del]').forEach(el => {
    el.addEventListener('click', async e => {
      e.stopPropagation();
      const id = el.dataset.del;
      if (!confirm('删除这个本地单元？')) return;
      await idbDel(id);
      state.local = await idbAll();
      renderTOC();
      toast('已删除');
    });
  });
}

/* ---------- 导入 ---------- */
async function onImportFile(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const txt = await file.text();
    const unit = JSON.parse(txt);
    if (!unit || !Array.isArray(unit.words) || !unit.words.length) throw new Error('缺少 words 数组');
    unit.id = unit.id || ('local-' + Date.now());
    if (!unit.title) unit.title = '导入单元';
    unit._local = true;
    await idbPut(unit);
    state.local = await idbAll();
    renderTOC();
    toast('已导入：' + unit.title);
  } catch (err) {
    alert('导入失败：' + err.message);
  }
}

/* ---------- 单元页 ---------- */
async function openUnit(id) {
  let unit = null;
  if (id.indexOf('local-') === 0) {
    unit = state.local.find(u => u.id === id);
  } else {
    try {
      unit = await fetchJSON('units/' + encodeURIComponent(id) + '.json');
    } catch (e) {
      unit = null;
    }
  }
  if (!unit) { toast('单元不存在或加载失败'); renderTOC(); return; }
  state.unit = unit;
  renderUnit(unit);
}

function rowHTML(item, idx, kind) {
  const name = kind === 'w' ? item.w : item.p;
  const ipa = item.ipa ? `<span class="ipa">${esc(item.ipa)}</span>` : '';
  const mk = item.cet4 ? '<span class="mk4">▲</span>' : '';
  const cls = item.audio ? 'row' : 'row missing';
  const cn = kind === 'w' ? esc(item.cn || '') : '';
  const ext = kind === 'w' && item.ext ? `<div class="ext">搭配：${esc(item.ext)}</div>` : '';
  const phCn = kind === 'p' ? `<div class="ph-cn">${esc(item.cn || '')}</div>` : '';
  return `<div class="${cls}" data-i="${idx}" data-kind="${kind}">
      <div class="l1"><span class="idx">${String(idx + 1).padStart(2, '0')}</span>
      <button class="wbtn" data-play="${kind}:${idx}">${esc(name)}</button>${mk}${ipa}</div>
      ${cn ? '<div class="cn">' + cn + '</div>' : ''}${phCn}${ext}
    </div>`;
}

function renderUnit(unit) {
  const words = unit.words || [];
  const phrases = unit.phrases || [];
  titleEl.textContent = unit.title || '单元';
  subEl.textContent = words.length + ' 词' + (phrases.length ? ' · ' + phrases.length + ' 短语' : '');
  backEl.hidden = false;
  const wordsHTML = words.map((w, i) => rowHTML(w, i, 'w')).join('');
  const phrasesHTML = phrases.map((p, i) => rowHTML(p, i, 'p')).join('');
  appEl.innerHTML = `
    <div class="unit-hero">
      <div class="big">${esc(unit.title || '')}</div>
      <div class="small">${esc(unit.subtitle || '')}</div>
    </div>
    <div class="tools">
      <button class="btn" id="hideAll">隐藏中文</button>
      <button class="btn" id="showAll">显示中文</button>
      <button class="btn" id="toggleExt">显示搭配</button>
      <button class="btn" id="stopBtn">■ 停止</button>
    </div>
    ${words.length ? '<h2 class="group">单词<button class="play" data-playsec="w">▶ 朗读</button></h2>' + wordsHTML : ''}
    ${phrases.length ? '<h2 class="group">短语<button class="play" data-playsec="p">▶ 朗读</button></h2>' + phrasesHTML : ''}
    <div class="hint">点英文单词/短语发音；点行空白或中文处隐藏中文；▲ 为四级词。</div>`;

  $('#hideAll').onclick = () => { appEl.querySelectorAll('.row').forEach(r => r.classList.add('hid')); };
  $('#showAll').onclick = () => { appEl.querySelectorAll('.row').forEach(r => r.classList.remove('hid')); };
  $('#toggleExt').onclick = () => {
    state.showExt = !state.showExt;
    document.body.classList.toggle('hide-ext', !state.showExt);
    $('#toggleExt').textContent = state.showExt ? '显示搭配' : '隐藏搭配';
  };
  $('#stopBtn').onclick = () => { try { audio.pause(); audio.src = ''; } catch (e) {} if (window.speechSynthesis) speechSynthesis.cancel(); };
  document.body.classList.toggle('hide-ext', !state.showExt);

  // 点击：单词发音 / 行切换中文
  appEl.querySelectorAll('[data-play]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const [kind, i] = btn.dataset.play.split(':');
      const item = kind === 'w' ? words[+i] : phrases[+i];
      if (item) playWord(item);
    });
  });
  appEl.querySelectorAll('.row').forEach(row => {
    row.addEventListener('click', () => row.classList.toggle('hid'));
  });
  // ▶ 朗读整节
  appEl.querySelectorAll('[data-playsec]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const kind = btn.dataset.playsec;
      const list = kind === 'w' ? words : phrases;
      playQueue(list, kind);
    });
  });
}

let queueToken = 0;
function playQueue(list, kind) {
  const token = ++queueToken;
  let i = 0;
  (function next() {
    if (token !== queueToken) return;
    if (i >= list.length) return;
    const item = list[i++];
    const text = kind === 'w' ? item.w : item.p;
    if (item.audio) {
      audio.pause();
      audio.src = item.audio;
      audio.onended = next;
      audio.play().catch(() => { setTimeout(next, 900); });
    } else {
      speakTTS(text);
      setTimeout(next, 1200);
    }
  })();
}

/* ---------- 初始化 ---------- */
async function loadIndex() {
  try {
    const idx = await fetchJSON('units/index.json?ts=' + Date.now(), { cache: 'no-cache' });
    state.units = idx.units || [];
  } catch (e) {
    state.units = [];
  }
  state.local = await idbAll().catch(() => []);
  if (!location.hash) renderTOC();
}

backEl.addEventListener('click', () => { location.hash = ''; });
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
loadIndex();
