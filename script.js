var S = { year: 2025, season: 'spring', key: '202504', list: [] };
var MONTH = { winter:'01', spring:'04', summer:'07', fall:'10' };
var DAYS = ['周一','周二','周三','周四','周五','周六','周日'];
var SEASON_ORDER = ['winter','spring','summer','fall'];
var SEASON_LABEL = { winter:'冬季', spring:'春季', summer:'夏季', fall:'秋季' };
var _cache = {};
var _xhr = null;
var _searchTimer = null;
var MODE = 'calendar';

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
  return t.replace(/:/g, '\uFF1A').replace(/[/]/g, '%2F').replace(/[\?\*"<>\|']/g, '');
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
  if (S.year < 2016) S.year = 2016;
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
  var bgStyle = img && a.coverImage ? ' style="background-image:url(' + img + ')"' : '';
  return '<div class="card" data-id="' + esc(a.id) + '">' +
    '<div class="card-img"' + bgStyle + '></div>' +
    '<button class="fav-btn' + (fav ? ' on' : '') + '" data-id="' + esc(a.id) + '">' + (fav ? '★' : '☆') + '</button>' +
    '<div class="card-title">' + esc(a.title) + '</div>' +
    '</div>';
}

listEl.addEventListener('click', function(e) {
  var gcard = e.target.closest('.group-card');
  if (gcard) { location.href = '/group/' + encodeURIComponent(gcard.dataset.name); return; }
  var rrow = e.target.closest('.res-row');
  if (rrow) { openResource(rrow.dataset.hash); return; }
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
    '<div class="detail-img" onclick="openLightbox(\'' + esc(img) + '\')">' +
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
  h += '<div class="detail-res" data-key="' + esc(S.key) + '" data-id="' + esc(a.id) + '"><div class="detail-res-h">资源更新</div><div class="res-loading">加载中...</div></div>';
  overlayContent.innerHTML = h;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  loadBangumiResources(S.key, a.id);
}

function loadBangumiResources(key, id) {
  var box = overlayContent.querySelector('.detail-res');
  if (!box) return;
  var boxInner = box.querySelector('.res-loading');
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/resources/bangumi?key=' + encodeURIComponent(key) + '&id=' + encodeURIComponent(id) + '&size=10', true);
  xhr.onload = function() {
    if (this.status < 200 || this.status >= 300) {
      box.innerHTML = '<div class="res-empty">暂无资源</div>';
      return;
    }
    try {
      var d = JSON.parse(this.responseText);
      if (!d.total) {
        box.innerHTML = '<div class="res-empty">暂无资源</div><a class="rss-link" href="/rss/bangumi/' + encodeURIComponent(key) + '/' + encodeURIComponent(id) + '" target="_blank">📡 RSS 订阅</a>';
        return;
      }
      box.innerHTML = '<div class="res-list">' + d.list.map(function(r) { return resRowHTML(r, true); }).join('') + '</div>' +
        '<div class="res-more"><a class="rss-link" href="/rss/bangumi/' + encodeURIComponent(key) + '/' + encodeURIComponent(id) + '" target="_blank">📡 RSS 订阅</a>' +
        '<span class="res-total">共 ' + d.total + ' 条</span></div>';
    } catch(e) {
      box.innerHTML = '<div class="res-empty">加载失败</div>';
    }
  };
  xhr.onerror = function() { box.innerHTML = '<div class="res-empty">加载失败</div>'; };
  xhr.send();
}

function resRowHTML(r, mini) {
  var cls = 'res-row' + (mini ? ' mini' : '');
  var title = esc(r.title);
  return '<div class="' + cls + '" data-hash="' + esc(r.info_hash) + '">' +
    '<span class="res-ep">' + esc(r.episode || '?') + '</span>' +
    '<span class="res-title" title="' + title + '">' + title + '</span>' +
    '<span class="res-group">' + esc(r.subtitle_group || '') + '</span>' +
    '<span class="res-size">' + esc(r.size || '') + '</span>' +
    '<span class="res-time">' + esc(fmtTime(r.publish_time)) + '</span>' +
    '</div>';
}

function fmtTime(t) {
  if (!t) return '';
  var d = new Date(t.replace(' UTC', ''));
  if (isNaN(d.getTime())) return t;
  var p = function(n) { return (n < 10 ? '0' : '') + n; };
  return d.getFullYear() + '/' + p(d.getMonth()+1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
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

var lightboxEl = document.getElementById('lightbox');
var lightboxImg = document.getElementById('lightboxImg');
function openLightbox(src) {
  if (!src) return;
  lightboxImg.src = src;
  lightboxEl.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  lightboxEl.classList.remove('open');
  document.body.style.overflow = '';
}
lightboxEl.onclick = function(e) { if (e.target === this) closeLightbox(); };
document.getElementById('lightboxClose').onclick = closeLightbox;

overlayContent.addEventListener('click', function(e) {
  var row = e.target.closest('.res-row');
  if (row) { openResource(row.dataset.hash); return; }
  var link = e.target.closest('a[data-copy]');
  if (link) { e.preventDefault(); copyMagnet(link.dataset.copy); return; }
  var trigger = e.target.closest('.img-lightbox-trigger');
  if (!trigger) return;
  e.preventDefault();
  var img = trigger.querySelector('img');
  if (img) openLightbox(img.src);
});

document.getElementById('lightbox').onclick = function(e) {
  if (e.target === this || e.target.classList.contains('lightbox-close')) closeLightbox();
};

document.addEventListener('keydown', function(e) {
  if (overlay.classList.contains('open')) { if (e.key === 'Escape') closeOverlay(); return; }
  if (lightboxEl.classList.contains('open')) { if (e.key === 'Escape') closeLightbox(); return; }
  if (e.key === 'Escape' && searchInput.value) { searchInput.value = ''; render(S.list); saveQ(); searchInput.blur(); }
  if (!searchInput.value && MODE === 'calendar') {
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
  for (var y = cur; y >= 2016; y--) {
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
  _searchTimer = setTimeout(function() {
    if (MODE === 'calendar') { render(S.list); saveQ(); }
    else if (MODE === 'classic') { renderClassic(1); }
    else if (MODE === 'groups') { renderGroups(1); }
    else if (MODE === 'group') { renderGroupResources(1); }
  }, 250);
});

// ---------- mode routing ----------

var RES_GROUPS = []; // cached group list for filter

function setMode(m) {
  MODE = m;
  var tabs = document.querySelectorAll('.nav-tabs a');
  tabs.forEach(function(a) { a.classList.toggle('active', a.dataset.mode === m); });
  var seasonControls = [yearSelect, seasonSelect, document.querySelector('.nav-sep')];
  seasonControls.forEach(function(el) { el.style.display = (m === 'calendar') ? '' : 'none'; });
  if (m === 'calendar') {
    loadData(S.year, S.season);
  } else if (m === 'classic') {
    renderClassic(1);
  } else if (m === 'groups') {
    renderGroups(1);
  }
}

// ---------- classic resource list ----------

var classicState = { page: 1, group: '', size: 30 };

function renderClassic(page) {
  MODE = 'classic';
  classicState.page = page || 1;
  showLoad();
  var term = searchInput.value.trim();
  var url = '/api/resources/latest?page=' + classicState.page + '&size=' + classicState.size +
    (classicState.group ? '&group=' + encodeURIComponent(classicState.group) : '') +
    (term ? '&q=' + encodeURIComponent(term) : '');
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.onload = function() {
    if (this.status < 200 || this.status >= 300) { showErr('加载失败'); return; }
    var d = JSON.parse(this.responseText);
    loading.style.display = 'none';
    if (!d.list.length) { empty.style.display = 'block'; empty.textContent = '暂无资源'; }
    else empty.style.display = 'none';
    var groupHtml = '<select id="groupFilter" class="res-filter">' +
      '<option value="">全部字幕组</option>' +
      RES_GROUPS.map(function(g) {
        return '<option value="' + esc(g.name) + '"' + (classicState.group === g.name ? ' selected' : '') + '>' +
          esc(g.name) + ' (' + g.count + ')</option>';
      }).join('') + '</select>';
    statsBar.innerHTML = '<span class="stats-icon">📦</span> 资源更新' +
      (classicState.group ? ' · ' + esc(classicState.group) : '') +
      (term ? ' · 搜索「' + esc(term) + '」' : '') +
      ' · 共 <span class="stats-num">' + d.total + '</span> 条' +
      '<span style="flex:1"></span>' + groupHtml;
    var h = '<div class="res-table">' +
      '<div class="res-table-head"><span>集数</span><span>标题</span><span>字幕组</span><span>大小</span><span>时间</span></div>' +
      d.list.map(function(r) { return resRowHTML(r); }).join('') +
      '</div>';
    var pages = Math.ceil(d.total / d.size);
    if (classicState.page > pages && pages > 0) { renderClassic(pages); return; }
    syncPageURL(classicState.page);
    if (pages > 1) {
      h += pagerHTML(classicState.page, pages);
    }
    listEl.innerHTML = h;
  };
  xhr.onerror = function() { showErr('加载失败'); };
  xhr.send();
}

function loadGroupFilter() {
  if (RES_GROUPS.length) return;
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/groups', true);
  xhr.onload = function() {
    try {
      var d = JSON.parse(this.responseText);
      RES_GROUPS = d.list || [];
      var sel = document.getElementById('groupFilter');
      if (sel && !sel.querySelector('option:not(:first-child)')) {
        sel.innerHTML = '<option value="">全部字幕组</option>' + RES_GROUPS.map(function(g) {
          return '<option value="' + esc(g.name) + '">' + esc(g.name) + ' (' + g.count + ')</option>';
        }).join('');
        sel.value = classicState.group || '';
      }
    } catch(e) {}
  };
  xhr.send();
}

// ---------- groups list ----------

var groupsState = { page: 1, size: 90 };

function groupInitial(name) {
  if (!name) return '?';
  var ch = name.trim().charAt(0);
  return /[A-Za-z0-9]/.test(ch) ? ch.toUpperCase() : '#';
}

function renderGroups(page) {
  MODE = 'groups';
  groupsState.page = page || 1;
  showLoad();
  var term = searchInput.value.trim();
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/groups?q=' + encodeURIComponent(term), true);
  xhr.onload = function() {
    if (this.status < 200 || this.status >= 300) { showErr('加载失败'); return; }
    var d = JSON.parse(this.responseText);
    var list = d.list || [];
    loading.style.display = 'none';
    if (!list.length) { empty.style.display = 'block'; empty.textContent = '暂无字幕组'; }
    else empty.style.display = 'none';
    var pages = Math.ceil(list.length / groupsState.size);
    if (groupsState.page > pages && pages > 0) { renderGroups(pages); return; }
    syncPageURL(groupsState.page);
    var slice = list.slice((groupsState.page - 1) * groupsState.size, groupsState.page * groupsState.size);
    statsBar.innerHTML = '<span class="stats-icon">🏷</span> 字幕组列表' +
      (term ? ' · 搜索「' + esc(term) + '」' : '') +
      ' · 共 <span class="stats-num">' + list.length + '</span> 个';
    var h = '<div class="group-grid">' + slice.map(function(g) {
      return '<div class="group-card" data-name="' + esc(g.name) + '">' +
        '<div class="group-avatar">' + esc(groupInitial(g.name)) + '</div>' +
        '<div class="group-body"><div class="group-name" title="' + esc(g.name) + '">' + esc(g.name) + '</div>' +
        '<div class="group-count">' + g.count + ' 条资源</div></div>' +
        '</div>';
    }).join('') + '</div>';
    if (pages > 1) {
      h += pagerHTML(groupsState.page, pages);
    }
    listEl.innerHTML = h;
  };
  xhr.onerror = function() { showErr('加载失败'); };
  xhr.send();
}

// ---------- single group page ----------

function renderGroupResources(page) {
  MODE = 'group';
  var gname = decodeURIComponent(window.location.pathname.split('/').pop());
  classicState.page = page || 1;
  showLoad();
  var term = searchInput.value.trim();
  var url = '/api/group/' + encodeURIComponent(gname) + '?page=' + classicState.page + '&size=30' +
    (term ? '&q=' + encodeURIComponent(term) : '');
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.onload = function() {
    if (this.status < 200 || this.status >= 300) { showErr('加载失败'); return; }
    var d = JSON.parse(this.responseText);
    loading.style.display = 'none';
    if (!d.list.length) { empty.style.display = 'block'; empty.textContent = '暂无资源'; }
    else empty.style.display = 'none';
    statsBar.innerHTML = '<span class="stats-icon">🏷</span> ' + esc(gname) +
      (term ? ' · 搜索「' + esc(term) + '」' : '') +
      ' · 共 <span class="stats-num">' + d.total + '</span> 条';
    var h = '<div class="res-table">' +
      '<div class="res-table-head"><span>集数</span><span>标题</span><span>字幕组</span><span>大小</span><span>时间</span></div>' +
      d.list.map(function(r) { return resRowHTML(r); }).join('') +
      '</div>';
    var pages = Math.ceil(d.total / d.size);
    if (classicState.page > pages && pages > 0) { renderGroupResources(pages); return; }
    syncPageURL(classicState.page);
    if (pages > 1) {
      h += pagerHTML(classicState.page, pages);
    }
    listEl.innerHTML = h;
  };
  xhr.onerror = function() { showErr('加载失败'); };
  xhr.send();
}

// ---------- resource detail ----------

function openResource(hash) {
  if (!hash) return;
  overlayContent.innerHTML = '<div class="res-loading">加载中...</div>';
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/resources/hash/' + hash, true);
  xhr.onload = function() {
    if (this.status < 200 || this.status >= 300) {
      overlayContent.innerHTML = '<div class="res-empty">资源不存在或已删除</div>';
      return;
    }
    var r = JSON.parse(this.responseText);
    var h = '<div class="detail-top res-detail-top">' +
      '<div class="detail-info" style="flex:1">' +
      '<div class="detail-title" style="font-size:15px">' + esc(r.title) + '</div>';
    h += '<div class="res-meta">';
    if (r.subtitle_group) h += '<span class="detail-badge badge-web" style="margin-top:6px">' + esc(r.subtitle_group) + '</span>';
    if (r.size) h += '<span class="detail-badge badge-air" style="margin-top:6px">' + esc(r.size) + '</span>';
    if (r.publish_time) h += '<span class="detail-badge badge-night" style="margin-top:6px">' + esc(fmtTime(r.publish_time)) + '</span>';
    h += '</div></div></div>';
    h += '<div class="res-actions">';
    if (r.magnet) h += '<button class="btn-primary" data-copy="' + esc(r.magnet) + '">🧲 复制磁力</button>' +
      '<a class="btn-secondary" href="' + esc(r.magnet) + '">打开磁力</a>';
    if (r.torrent_url) h += '<a class="btn-secondary" href="' + esc(r.torrent_url) + '" target="_blank">⬇ 下载种子</a>';
    h += '</div>';
    if (r.images && r.images.length) {
      h += '<div class="res-images">' + r.images.map(function(src) {
        return '<img src="' + esc(src) + '" loading="lazy" onclick="openLightbox(\'' + esc(src) + '\')">';
      }).join('') + '</div>';
    }
    if (r.description) {
      h += '<div class="detail-body res-desc">' + esc(r.description).split('\n').map(function(line) {
        return line ? '<div>' + esc(line) + '</div>' : '<div class="detail-spacer"></div>';
      }).join('') + '</div>';
    }
    overlayContent.innerHTML = h;
  };
  xhr.onerror = function() { overlayContent.innerHTML = '<div class="res-empty">加载失败</div>'; };
  xhr.send();
}

function copyMagnet(magnet) {
  if (!magnet) return;
  var ta = document.createElement('textarea');
  ta.value = magnet;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch(e) {}
  document.body.removeChild(ta);
  var btn = overlayContent.querySelector('[data-copy]');
  if (btn) {
    var old = btn.textContent;
    btn.textContent = '✓ 已复制';
    setTimeout(function() { btn.textContent = old; }, 1500);
  }
}

// ---------- pager delegation ----------

function pagerHTML(page, pages) {
  return '<div class="pager">' +
    '<button class="pager-btn" data-page="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + '>← 上一页</button>' +
    '<span class="pager-info">' + page + ' / ' + pages + '</span>' +
    '<span class="pager-jump">跳至 <input type="number" class="pager-input" min="1" max="' + pages + '" value="' + page + '"> 页</span>' +
    '<button class="pager-btn pager-go">跳转</button>' +
    '<button class="pager-btn" data-page="' + (page + 1) + '"' + (page >= pages ? ' disabled' : '') + '>下一页 →</button>' +
    '</div>';
}

function syncPageURL(page) {
  var base = MODE === 'group' ? window.location.pathname : '/' + MODE;
  history.replaceState(null, '', page > 1 ? base + '?page=' + page : base);
}

function pageFromURL() {
  var m = (window.location.search.match(/[?&]page=(\d+)/) || [])[1];
  var p = parseInt(m);
  return p >= 1 ? p : 1;
}

function doPageJump() {
  var input = listEl.querySelector('.pager-input');
  if (!input) return;
  var p = parseInt(input.value);
  var max = parseInt(input.max) || 1;
  if (!p || p < 1) p = 1;
  if (p > max) p = max;
  if (MODE === 'classic') renderClassic(p);
  else if (MODE === 'group') renderGroupResources(p);
  else if (MODE === 'groups') renderGroups(p);
}

listEl.addEventListener('click', function(e) {
  if (e.target.closest('.pager-go')) { doPageJump(); return; }
  var pb = e.target.closest('.pager-btn');
  if (!pb || pb.disabled) return;
  var page = parseInt(pb.dataset.page);
  if (MODE === 'classic') renderClassic(page);
  else if (MODE === 'group') renderGroupResources(page);
  else if (MODE === 'groups') renderGroups(page);
});

listEl.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && e.target.classList.contains('pager-input')) {
    e.preventDefault();
    doPageJump();
  }
});

listEl.addEventListener('change', function(e) {
  if (e.target.id === 'groupFilter') {
    classicState.group = e.target.value;
    renderClassic(1);
  }
});

// ---------- init ----------

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

  var path = window.location.pathname;
  if (path === '/classic') {
    loadGroupFilter();
    setMode('classic');
    renderClassic(pageFromURL());
  } else if (path === '/groups') {
    setMode('groups');
    renderGroups(pageFromURL());
  } else if (path.indexOf('/group/') === 0) {
    setMode('group');
    renderGroupResources(pageFromURL());
  } else {
    setMode('calendar');
    loadData(S.year, S.season);
  }
}
init();
