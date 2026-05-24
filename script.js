var S = {
  year: 2025,
  season: 'spring',
  key: '202504',
  list: []
};

var MONTH = { winter:'01', spring:'04', summer:'07', fall:'10' };
var DAYS = ['周一','周二','周三','周四','周五','周六','周日'];
var SEASON_ORDER = ['winter','spring','summer','fall'];

function imgPath(a) {
  if (!a || !a.title) return '';
  var t = a.title.replace(/:/g, '\uFF1A').replace(/[\?\*"<>\|]/g, '');
  return '/images/' + S.key + '/' + encodeURIComponent(t) + '.jpg';
}

function updateUrl() {
  var m = MONTH[S.season];
  var path = '/' + S.year + m + '/';
  var search = getSearchParam();
  if (search) path += '?q=' + encodeURIComponent(search);
  if (window.location.pathname + window.location.search !== path) {
    window.history.replaceState(null, '', path);
  }
}

function syncSelects() {
  document.getElementById('yearSelect').value = S.year;
  document.getElementById('seasonSelect').value = S.season;
}

function nextSeason() {
  var idx = SEASON_ORDER.indexOf(S.season);
  if (idx < 3) { S.season = SEASON_ORDER[idx + 1]; }
  else { S.season = 'winter'; S.year++; if (S.year > 2030) S.year = 2030; }
  syncSelects();
  loadData(S.year, S.season);
}

function prevSeason() {
  var idx = SEASON_ORDER.indexOf(S.season);
  if (idx > 0) { S.season = SEASON_ORDER[idx - 1]; }
  else { S.season = 'fall'; S.year--; if (S.year < 2015) S.year = 2015; }
  syncSelects();
  loadData(S.year, S.season);
}

function getSearchParam() {
  var m = window.location.search.match(/[?&]q=([^&]*)/);
  return m ? decodeURIComponent(m[1]) : '';
}

function loadData(y, s) {
  var key = y + MONTH[s];
  S.key = key;
  updateUrl();
  showLoading();

  if (_DATA && _DATA[key]) {
    render(normalizeAll(_DATA[key][s] || []));
    return;
  }

  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/data/' + key + '/' + s, true);
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      try { render(JSON.parse(xhr.responseText)); } catch(e) { showError('数据解析失败'); }
    } else {
      showError('暂无该季度数据');
    }
  };
  xhr.onerror = function() {
    showError('加载失败，请刷新页面重试');
  };
  xhr.send();
}

function showLoading() {
  document.getElementById('loading').style.display = 'block';
  document.getElementById('empty').style.display = 'none';
  document.getElementById('list').innerHTML = '';
}

function showError(msg) {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('empty').style.display = 'block';
  document.getElementById('empty').textContent = msg;
}

function normalizeAll(arr) {
  if (!arr) return [];
  arr.forEach(normalize);
  return arr;
}

var searchInput = document.getElementById('searchInput');
var searchClear = document.getElementById('searchClear');

searchInput.addEventListener('input', function(){ applyFilter(); toggleClear(); saveSearchParam(); });
searchClear.addEventListener('click', function(){ searchInput.value = ''; toggleClear(); applyFilter(); searchInput.focus(); saveSearchParam(); });

function toggleClear() { searchClear.style.display = searchInput.value ? 'inline-flex' : 'none'; }

function saveSearchParam() {
  var term = searchInput.value.trim();
  var base = window.location.pathname;
  var newUrl = term ? base + '?q=' + encodeURIComponent(term) : base;
  window.history.replaceState(null, '', newUrl);
}

function applyFilter() {
  var term = searchInput.value.trim().toLowerCase();
  var list = S.list;
  if (term) {
    list = list.filter(function(a){
      return (a.title && a.title.toLowerCase().indexOf(term) !== -1) ||
             (a.titleJp && a.titleJp.toLowerCase().indexOf(term) !== -1) ||
             (a.content && a.content.toLowerCase().indexOf(term) !== -1);
    });
  }
  displayList(list);
}

function normalize(a) {
  if (!a) return a;
  a.titleJp = a.titleJp || a.titleJapan || '';
  if (a.content) return a;

  var lines = [];
  if (a.airTime) lines.push('播出：' + a.airTime);
  if (a.studio) lines.push('制作：' + a.studio);
  if (a.episodes) lines.push('话数：' + a.episodes);
  if (a.original) lines.push('原作：' + a.original);
  if (a.director) lines.push('导演：' + a.director);
  if (a.screenwriter) lines.push('编剧：' + a.screenwriter);
  var cd = a.charDesign || a.characterDesign;
  if (cd) lines.push('人设：' + cd);
  if (a.music) lines.push('音乐：' + a.music);
  var cv = a.cast || a.voiceActors;
  if (cv) lines.push('声优：' + cv);
  if (a.genres && a.genres.length) lines.push('类型：' + a.genres.join('/'));
  var w = a.website || a.officialWebsite;
  if (w) lines.push('官网：' + w);
  if (a.intro) lines.push('\n' + a.intro);
  if (lines.length) a.content = lines.join('\n');
  return a;
}

function render(list) {
  S.list = normalizeAll(list);
  // Restore search from URL after data loads
  var q = getSearchParam();
  if (q && !searchInput.value) {
    searchInput.value = q;
    toggleClear();
  }
  applyFilter();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function displayList(list) {
  var el = document.getElementById('list');
  var ld = document.getElementById('loading');
  var em = document.getElementById('empty');
  ld.style.display = 'none';

  if (!list || !list.length) {
    el.innerHTML = '';
    em.style.display = 'block';
    return;
  }
  em.style.display = 'none';

  var byDay = {};
  DAYS.forEach(function(d){ byDay[d] = []; });
  list.forEach(function(a){
    var d = a.weekday || '周一';
    if (byDay[d]) byDay[d].push(a); else byDay[d] = [a];
  });

  var h = '';
  DAYS.forEach(function(d){
    var items = byDay[d];
    if (!items.length) return;
    h += '<div class="day-section"><div class="day-h">' + d + '</div><div class="card-list">';
    items.forEach(function(a){ h += cardHtml(a); });
    h += '</div></div>';
  });
  el.innerHTML = h;
  focusFirstCard();
}

var _focusedIndex = -1;

function cardHtml(a) {
  var img = imgPath(a);
  var h = '<div class="card" onclick="openDetail(\'' + esc(a.id) + '\')" data-id="' + esc(a.id) + '">';
  h += '<div class="card-img">';
  h += '<div class="card-img-placeholder"></div>';
  if (img) {
    h += '<img src="' + img + '" alt="' + esc(a.title) + '" loading="lazy" onerror="this.parentElement.classList.add(\'img-error\')">';
  }
  h += '</div>';
  h += '<div class="card-title">' + esc(a.title) + '</div>';
  h += '</div>';
  return h;
}

function focusFirstCard() {
  _focusedIndex = -1;
}

function focusCard(dir) {
  var cards = document.querySelectorAll('.card');
  if (!cards.length) return;
  _focusedIndex = Math.max(0, Math.min(cards.length - 1, _focusedIndex + dir));
  cards.forEach(function(c, i) {
    c.classList.toggle('card-focused', i === _focusedIndex);
  });
  cards[_focusedIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function openFocusedCard() {
  var cards = document.querySelectorAll('.card');
  if (_focusedIndex >= 0 && _focusedIndex < cards.length) {
    cards[_focusedIndex].click();
  }
}

document.addEventListener('keydown', function(e) {
  if (document.getElementById('overlay').classList.contains('open')) {
    if (e.key === 'Escape') closeOverlay();
    return;
  }
  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown': e.preventDefault(); focusCard(1); break;
    case 'ArrowLeft':
    case 'ArrowUp': e.preventDefault(); focusCard(-1); break;
    case 'Enter': e.preventDefault(); openFocusedCard(); break;
    case 'Escape': if (searchInput.value) { searchInput.value = ''; toggleClear(); applyFilter(); saveSearchParam(); searchInput.blur(); } break;
  }
});

function openDetail(id) {
  var a = null;
  for (var i=0;i<S.list.length;i++) { if (S.list[i].id === id) { a = S.list[i]; break; } }
  if (!a) return;

  var h = '<div class="detail-top">';
  var img = imgPath(a);
  if (img) h += '<div class="detail-img"><img src="' + img + '" alt="' + esc(a.title) + '" onerror="this.parentElement.style.display=\'none\'"></div>';
  h += '<div class="detail-info"><div class="detail-title">' + esc(a.title) + '</div>';
  if (a.titleJp) h += '<div class="detail-title-jp">' + esc(a.titleJp) + '</div>';

  if (a.airTime) {
    var at = a.airTime;
    if (at.indexOf('网络') >= 0) h += '<span class="detail-badge badge-web">网络</span>';
    else if (at.indexOf('深夜') >= 0) h += '<span class="detail-badge badge-night">深夜</span>';
    else h += '<span class="detail-badge badge-air">放送</span>';
    if (at.indexOf('泡面') >= 0) h += '<span class="detail-badge badge-short">泡面</span>';
  }

  h += '</div></div>';

  if (a.content) {
    h += '<div class="detail-body">' + formatContent(a.content) + '</div>';
  }

  document.getElementById('overlayContent').innerHTML = h;
  document.getElementById('overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function formatContent(content) {
  var lines = content.split('\n');
  var h = '';
  lines.forEach(function(line) {
    if (!line.trim()) { h += '<div class="detail-spacer"></div>'; return; }
    var colon = line.indexOf('：');
    if (colon > 0 && colon < 8) {
      var label = line.substring(0, colon + 1);
      var value = line.substring(colon + 1);
      if (label === '标签：' || label === '类型：') {
        var tags = value.split('/');
        h += '<div class="detail-field"><span class="field-label">' + esc(label) + '</span>';
        tags.forEach(function(t) {
          if (t.trim()) h += '<span class="field-tag">' + esc(t.trim()) + '</span>';
        });
        h += '</div>';
      } else if (label === '声优：' || label === '官网：') {
        h += '<div class="detail-field"><span class="field-label">' + esc(label) + '</span><span class="field-value">' + esc(value) + '</span></div>';
      } else {
        h += '<div class="detail-field"><span class="field-label">' + esc(label) + '</span><span class="field-value">' + esc(value) + '</span></div>';
      }
    } else {
      h += '<div class="detail-text">' + esc(line) + '</div>';
    }
  });
  return h;
}

function closeOverlay() {
  document.getElementById('overlay').classList.remove('open');
  document.body.style.overflow = '';
}

document.getElementById('overlayClose').onclick = closeOverlay;
document.getElementById('overlay').onclick = function(e){ if(e.target===this) closeOverlay(); };

function esc(s) {
  if (!s) return '';
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function loadSeasonView() {
  syncSelects();
  loadData(S.year, S.season);
}

document.getElementById('prevSeason').onclick = prevSeason;
document.getElementById('nextSeason').onclick = nextSeason;
document.getElementById('gotoToday').onclick = function(){
  var now = new Date();
  var m = now.getMonth() + 1;
  S.year = now.getFullYear();
  S.season = m <= 3 ? 'winter' : m <= 6 ? 'spring' : m <= 9 ? 'summer' : 'fall';
  loadSeasonView();
};

document.getElementById('yearSelect').onchange = function(){
  S.year = parseInt(this.value);
  loadData(S.year, S.season);
};
document.getElementById('seasonSelect').onchange = function(){
  S.season = this.value;
  loadData(S.year, S.season);
};

function populateYearSelect() {
  var sel = document.getElementById('yearSelect');
  for (var y = 2030; y >= 2015; y--) {
    var opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    sel.appendChild(opt);
  }
}

// service worker registration temporarily disabled for stability
// if ('serviceWorker' in navigator) {
//   navigator.serviceWorker.register('/sw.js');
// }

function init(){
  var now = new Date();
  var m = now.getMonth() + 1;
  var y = now.getFullYear();

  var pathMatch = window.location.pathname.match(/\/(\d{4})(\d{2})\/?$/);
  var seasonMap = { '01':'winter', '02':'winter', '03':'winter', '04':'spring', '05':'spring', '06':'spring', '07':'summer', '08':'summer', '09':'summer', '10':'fall', '11':'fall', '12':'fall' };

  if (pathMatch) {
    S.year = parseInt(pathMatch[1]);
    var month = pathMatch[2];
    S.season = seasonMap[month] || 'spring';
  } else {
    S.year = y;
    S.season = m <= 3 ? 'winter' : m <= 6 ? 'spring' : m <= 9 ? 'summer' : 'fall';
  }

  populateYearSelect();
  syncSelects();

  // Restore search from URL on init
  var q = getSearchParam();
  if (q) searchInput.value = q;
  toggleClear();

  loadData(S.year, S.season);
}
init();
