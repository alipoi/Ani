var S = { year: 2025, season: 'spring', key: '202504', list: [] };
var MONTH = { winter:'01', spring:'04', summer:'07', fall:'10' };
var DAYS = ['周一','周二','周三','周四','周五','周六','周日'];
var SEASON_ORDER = ['winter','spring','summer','fall'];
var SEASON_LABEL = { winter:'冬季', spring:'春季', summer:'夏季', fall:'秋季' };
var _cache = {};
var _xhr = null;
var _searchTimer = null;

var yearSelect = document.getElementById('yearSelect');
var seasonSelect = document.getElementById('seasonSelect');
var searchInput = document.getElementById('searchInput');
var listEl = document.getElementById('list');
var loading = document.getElementById('loading');
var empty = document.getElementById('empty');
var overlay = document.getElementById('overlay');
var overlayContent = document.getElementById('overlayContent');
var overlayClose = document.getElementById('overlayClose');
var statsBar = document.getElementById('statsBar');

function imgName(t) {
  return t.replace(/:/g, '\uFF1A').replace(/[/]/g, '%2F').replace(/[\?\*"<>\|]/g, '');
}
function imgPath(a) {
  if (!a || !a.title) return '';
  return '/images/' + S.key + '/' + encodeURI(imgName(a.title)) + '.jpg';
}

function getSearch() {
  var m = window.location.search.match(/[?&]q=([^&]*)/);
  return m ? decodeURIComponent(m[1]) : '';
}

function saveQ() {
  var q = searchInput.value.trim();
  var p = window.location.pathname;
  window.history.replaceState(null, '', q ? p + '?q=' + encodeURIComponent(q) : p);
}

function syncSel() {
  yearSelect.value = S.year;
  seasonSelect.value = S.season;
}

function goSeason(d) {
  var i = SEASON_ORDER.indexOf(S.season);
  if (d > 0) S.season = i < 3 ? SEASON_ORDER[i+1] : (S.year++, 'winter');
  else S.season = i > 0 ? SEASON_ORDER[i-1] : (S.year--, 'fall');
  if (S.year > new Date().getFullYear()) S.year = new Date().getFullYear();
  if (S.year < 2015) S.year = 2015;
  loadView();
}

function loadData(y, s) {
  var key = y + MONTH[s];
  S.key = key;
  var sp = window.location.pathname;
  var np = '/' + key + '/';
  var q = getSearch();
  if (q) np += '?q=' + encodeURIComponent(q);
  if (sp !== np) window.history.replaceState(null, '', np);

  showLoad();
  var cached = _cache[key + '_' + s];
  if (cached) { render(cached); return; }
  if (_xhr) _xhr.abort();
  _xhr = new XMLHttpRequest();
  _xhr.open('GET', '/api/data/' + key + '/' + s, true);
  _xhr.onload = function() {
    _xhr = null;
    if (this.status < 200 || this.status >= 300) { showErr('暂无该季度数据'); return; }
    try { var d = JSON.parse(this.responseText); _cache[key + '_' + s] = d; render(d); }
    catch(e) { showErr('数据解析失败'); }
  };
  _xhr.onerror = function() { _xhr = null; showErr('加载失败'); };
  _xhr.send();
}

function showLoad() {
  loading.style.display = 'block';
  empty.style.display = 'none';
  listEl.innerHTML = '';
}
function showErr(m) {
  loading.style.display = 'none';
  empty.style.display = 'block';
  empty.textContent = m;
}

function normAll(arr) {
  if (!arr) return [];
  arr.forEach(norm);
  return arr;
}
function norm(a) {
  if (!a || a.content) return a;
  a.titleJp = a.titleJp || a.titleJapan || '';
  var l = [];
  if (a.airTime) l.push('播出：' + a.airTime);
  if (a.studio) l.push('制作：' + a.studio);
  if (a.episodes) l.push('话数：' + a.episodes);
  if (a.original) l.push('原作：' + a.original);
  if (a.director) l.push('导演：' + a.director);
  if (a.screenwriter) l.push('编剧：' + a.screenwriter);
  var cd = a.charDesign || a.characterDesign;
  if (cd) l.push('人设：' + cd);
  if (a.music) l.push('音乐：' + a.music);
  var cv = a.cast || a.voiceActors;
  if (cv) l.push('声优：' + cv);
  if (a.genres && a.genres.length) l.push('类型：' + a.genres.join('/'));
  var w = a.website || a.officialWebsite;
  if (w) l.push('官网：' + w);
  if (a.intro) l.push('\n' + a.intro);
  if (l.length) a.content = l.join('\n');
}

function render(list) {
  S.list = normAll(list);
  var q = getSearch();
  if (q && !searchInput.value) searchInput.value = q;
  var term = searchInput.value.trim().toLowerCase();
  var f = term ? S.list.filter(function(a) {
    return (a.title && a.title.toLowerCase().indexOf(term) >= 0) ||
           (a.titleJp && a.titleJp.toLowerCase().indexOf(term) >= 0) ||
           (a.content && a.content.toLowerCase().indexOf(term) >= 0);
  }) : S.list;

  loading.style.display = 'none';
  if (!f.length) {
    listEl.innerHTML = '';
    empty.style.display = 'block';
    empty.textContent = term ? '未找到匹配的番剧' : '暂无数据';
    return;
  }
  empty.style.display = 'none';

  statsBar.innerHTML = '<span class="stats-icon">📅</span> ' + S.year + '年' + SEASON_LABEL[S.season] +
    (term ? ' · 搜索「' + esc(term) + '」找到 <span class="stats-num">' + f.length + '</span> 部' :
     ' · 共 <span class="stats-num">' + f.length + '</span> 部番剧');

  var byDay = {};
  DAYS.forEach(function(d) { byDay[d] = []; });
  f.forEach(function(a) {
    var d = a.weekday || '周一';
    if (byDay[d]) byDay[d].push(a); else byDay[d] = [a];
  });

  var h = '';
  DAYS.forEach(function(d) {
    var items = byDay[d];
    if (!items.length) return;
    h += '<div class="day-section"><div class="day-h">' + d + '<span class="day-count">' + items.length + '</span></div><div class="card-list">';
    items.forEach(function(a) { h += cardHTML(a); });
    h += '</div></div>';
  });
  listEl.innerHTML = h;
  scrollToToday();
}

function scrollToToday() {
  if (searchInput.value.trim()) return;
  var dayIndex = new Date().getDay();
  var map = ['周日','周一','周二','周三','周四','周五','周六'];
  var today = map[dayIndex];
  var sections = document.querySelectorAll('.day-section');
  for (var i = 0; i < sections.length; i++) {
    var dh = sections[i].querySelector('.day-h');
    if (dh && dh.textContent.trim() === today) {
      sections[i].classList.add('current');
      setTimeout(function(el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100, sections[i]);
      break;
    }
  }
}

function cardHTML(a) {
  var fav = isFav(a.id);
  var img = imgPath(a);
  var fb = a.coverImage ? ' onerror="this.src=\'' + esc(a.coverImage) + '\'"' : '';
  return '<div class="card" data-id="' + esc(a.id) + '">' +
    '<div class="card-img">' +
    (img && a.coverImage ? '<img src="' + img + '" alt="' + esc(a.title) + '" loading="lazy" class="lazy-fade"' + fb + '>' : '') +
    '</div>' +
    '<button class="fav-btn' + (fav ? ' on' : '') + '" data-id="' + esc(a.id) + '">' + (fav ? '★' : '☆') + '</button>' +
    '<div class="card-title">' + esc(a.title) + '</div>' +
    '</div>';
}

listEl.addEventListener('click', function(e) {
  var card = e.target.closest('.card');
  if (!card) return;
  if (e.target.classList.contains('fav-btn')) { toggleFav(card.dataset.id, e.target); return; }
  var id = card.dataset.id;
  for (var i = 0; i < S.list.length; i++)
    if (S.list[i].id === id) { openDetail(S.list[i]); return; }
});

function openDetail(a) {
  var img = imgPath(a);
  var fb = a.coverImage ? ' onerror="this.src=\'' + esc(a.coverImage) + '\'"' : '';
  var h = '<div class="detail-top">' +
    '<div class="detail-img">' +
    (img && a.coverImage ? '<img src="' + img + '" alt="' + esc(a.title) + '"' + fb + '>' : '') +
    '</div>' +
    '<div class="detail-info"><div class="detail-title">' + esc(a.title) + '</div>' +
    (a.titleJp ? '<div class="detail-title-jp">' + esc(a.titleJp) + '</div>' : '');
  if (a.airTime) {
    var at = a.airTime;
    if (at.indexOf('网络') >= 0) h += '<span class="detail-badge badge-web">网络</span>';
    else if (at.indexOf('深夜') >= 0) h += '<span class="detail-badge badge-night">深夜</span>';
    else h += '<span class="detail-badge badge-air">放送</span>';
    if (at.indexOf('泡面') >= 0) h += '<span class="detail-badge badge-short">泡面</span>';
  }
  h += '</div></div>';
  if (a.content) h += '<div class="detail-body">' + fmt(a.content) + '</div>';
  overlayContent.innerHTML = h;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function fmt(c) {
  var out = '';
  c.split('\n').forEach(function(line) {
    if (!line.trim()) { out += '<div class="detail-spacer"></div>'; return; }
    var ci = line.indexOf('：');
    if (ci > 0 && ci < 8) {
      var label = line.substring(0, ci + 1);
      var val = line.substring(ci + 1);
      if (label === '类型：' || label === '标签：') {
        out += '<div class="detail-field"><span class="field-label">' + esc(label) + '</span>';
        val.split('/').forEach(function(t) { if (t.trim()) out += '<span class="field-tag">' + esc(t.trim()) + '</span>'; });
        out += '</div>';
      } else if (label === '官网：') {
        var url = val.trim();
        if (url.indexOf('http') !== 0) url = 'https://' + url;
        out += '<div class="detail-field"><span class="field-label">官网：</span><a href="' + esc(url) + '" target="_blank" rel="noopener" class="field-link">' + esc(val.trim()) + '</a></div>';
      } else {
        out += '<div class="detail-field"><span class="field-label">' + esc(label) + '</span><span class="field-value">' + esc(val) + '</span></div>';
      }
    } else {
      out += '<div class="detail-text">' + esc(line) + '</div>';
    }
  });
  return out;
}

overlayClose.onclick = function() { closeOverlay(); };
overlay.onclick = function(e) { if (e.target === this) closeOverlay(); };

function closeOverlay() {
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', function(e) {
  if (overlay.classList.contains('open')) { if (e.key === 'Escape') closeOverlay(); return; }
  if (e.key === 'Escape' && searchInput.value) { searchInput.value = ''; render(S.list); saveQ(); searchInput.blur(); }
  if (!searchInput.value) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); goSeason(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); goSeason(1); }
  }
});

function esc(s) {
  if (!s && s !== 0) return '';
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function loadView() {
  syncSel();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  loadData(S.year, S.season);
}

yearSelect.onchange = function() { S.year = parseInt(this.value); loadView(); };
seasonSelect.onchange = function() { S.season = this.value; loadView(); };

function popYear() {
  var cur = new Date().getFullYear();
  for (var y = cur; y >= 2015; y--) {
    var o = document.createElement('option');
    o.value = y; o.textContent = y;
    yearSelect.appendChild(o);
  }
}

function getFavs() { try { return JSON.parse(localStorage.getItem('favs') || '[]'); } catch(e) { return []; } }
function setFavs(a) { localStorage.setItem('favs', JSON.stringify(a)); }
function isFav(id) { return getFavs().indexOf(id) >= 0; }
function toggleFav(id, btn) {
  var a = getFavs();
  var i = a.indexOf(id);
  if (i < 0) a.push(id); else a.splice(i, 1);
  setFavs(a);
  if (btn) { btn.textContent = i < 0 ? '★' : '☆'; btn.classList.toggle('on', i < 0); }
}

var goTop = document.getElementById('goTop');
window.addEventListener('scroll', function() {
  goTop.classList.toggle('show', window.scrollY > 400);
});
goTop.onclick = function() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

var kbdHint = document.getElementById('kbdHint');
if (localStorage.getItem('kbdHintClosed')) kbdHint.style.display = 'none';
kbdHint.onclick = function() {
  kbdHint.style.display = 'none';
  localStorage.setItem('kbdHintClosed', '1');
};

function applyTheme() {
  document.documentElement.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches);
}
applyTheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

searchInput.addEventListener('input', function() {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(function() { render(S.list); saveQ(); }, 150);
});

function init() {
  var now = new Date(), m = now.getMonth() + 1, y = now.getFullYear();
  var pm = window.location.pathname.match(/\/(\d{4})(\d{2})\/?$/);
  var sm = { '01':'winter','02':'winter','03':'winter','04':'spring','05':'spring','06':'spring','07':'summer','08':'summer','09':'summer','10':'fall','11':'fall','12':'fall' };
  if (pm) { S.year = parseInt(pm[1]); S.season = sm[pm[2]] || 'spring'; }
  else { S.year = y; S.season = m <= 3 ? 'winter' : m <= 6 ? 'spring' : m <= 9 ? 'summer' : 'fall'; }
  popYear();
  syncSel();
  var q = getSearch();
  if (q) searchInput.value = q;
  loadData(S.year, S.season);
}
init();
