var S = {
  year: 2025,
  season: 'spring',
  key: '202504',
  list: []
};

var MONTH = { winter:'01', spring:'04', summer:'07', fall:'10' };
var DAYS = ['周一','周二','周三','周四','周五','周六','周日'];

function imgPath(a) {
  if (!a || !a.title) return '';
  var t = a.title.replace(/:/g, '\uFF1A').replace(/[\?\*"<>\|]/g, '');
  return '/images/' + S.key + '/' + encodeURIComponent(t) + '.jpg';
}

function updateUrl() {
  var m = { winter:'01', spring:'04', summer:'07', fall:'10' }[S.season];
  var path = '/' + S.year + m + '/';
  if (window.location.pathname !== path) {
    window.history.replaceState(null, '', path);
  }
}

function loadData(y, s, cb) {
  var key = y + MONTH[s];
  S.key = key;
  updateUrl();
  if (_DATA[key]) { cb(normalizeAll(_DATA[key][s] || [])); return; }
  var sc = document.createElement('script');
  sc.src = '/data/' + key + '.js';
  sc.onload = function(){ cb(normalizeAll(_DATA[key] ? _DATA[key][s] || [] : [])); };
  sc.onerror = function(){ cb([]); };
  document.head.appendChild(sc);
}

function normalizeAll(arr) {
  if (!arr) return [];
  arr.forEach(normalize);
  return arr;
}

// Search / filter
var searchInput = document.getElementById('searchInput');
var searchClear = document.getElementById('searchClear');

searchInput.addEventListener('input', function(){ applyFilter(); toggleClear(); });
searchClear.addEventListener('click', function(){ searchInput.value = ''; toggleClear(); applyFilter(); searchInput.focus(); });

function toggleClear() { searchClear.style.display = searchInput.value ? 'inline-flex' : 'none'; }

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
  S.list = list;
  applyFilter();
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
}

function cardHtml(a) {
  var img = imgPath(a);
  var h = '<div class="card" onclick="openDetail(\'' + esc(a.id) + '\')">';
  h += '<div class="card-img">';
  if (img) {
    h += '<img src="' + img + '" alt="' + esc(a.title) + '" loading="lazy" onerror="this.style.display=\'none\'">';
  }
  h += '</div>';
  h += '<div class="card-title">' + esc(a.title) + '</div>';
  h += '</div>';
  return h;
}

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
  document.getElementById('overlay').style.display = 'block';
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
  document.getElementById('overlay').style.display = 'none';
  document.body.style.overflow = '';
}

document.getElementById('overlayClose').onclick = closeOverlay;
document.getElementById('overlay').onclick = function(e){ if(e.target===this) closeOverlay(); };
document.addEventListener('keydown', function(e){ if(e.key==='Escape') closeOverlay(); });

function esc(s) {
  if (!s) return '';
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// Navigation
document.querySelectorAll('.sbtn').forEach(function(b){
  b.onclick = function(){
    S.season = b.dataset.s;
    document.querySelectorAll('.sbtn').forEach(function(x){ x.classList.toggle('on', x.dataset.s === S.season); });
    loadData(S.year, S.season, render);
  };
});

function updateYear() {
  document.getElementById('yearDisplay').textContent = S.year;
  loadData(S.year, S.season, render);
}
document.getElementById('yearPrev').onclick = function(){
  if (S.year > 2015) { S.year--; updateYear(); }
};
document.getElementById('yearNext').onclick = function(){
  if (S.year < 2030) { S.year++; updateYear(); }
};

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

  document.getElementById('yearDisplay').textContent = S.year;
  document.querySelectorAll('.sbtn').forEach(function(b){
    b.classList.toggle('on', b.dataset.s === S.season);
  });
  loadData(S.year, S.season, render);
}
init();
