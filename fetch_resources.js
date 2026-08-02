var https = require('https');
var http = require('http');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var db = require('./db');

var ROOT = __dirname;
var STATE_FILE = path.join(ROOT, 'data', 'crawl_state.json');
var MIKAN_BASE = process.env.MIKAN_BASE || 'https://mikanani.kas.pub';

var TIMEOUT = 30000;
var CONCURRENCY = 4;
var MIN_DELAY = 300;
var MAX_RETRIES = 3;
var CRAWL_STATE_KEY = 'classic_page';

var TRACKERS = [
  'http://t.nyaatracker.com/announce',
  'http://tracker.kamigami.org:2710/announce',
  'http://share.camoe.cn:8080/announce',
  'http://opentracker.acgnx.se/announce',
  'http://anidex.moe:6969/announce',
  'http://t.acg.rip:6699/announce',
  'https://tr.bangumi.moe:9696/announce',
  'udp://tr.bangumi.moe:6969/announce',
  'http://open.acgtracker.com:1096/announce',
  'udp://tracker.opentrackr.org:1337/announce'
];

var sleep = function(ms) { return new Promise(function(r) { setTimeout(r, ms); }); };

function get(url) {
  return new Promise(function(resolve, reject) {
    var mod = url.indexOf('https:') === 0 ? https : http;
    var req = mod.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      timeout: TIMEOUT
    }, function(res) {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303) {
        var loc = res.headers['location'];
        res.resume();
        if (loc) { get(loc).then(resolve).catch(reject); return; }
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error('HTTP ' + res.statusCode + ' ' + url));
        return;
      }
      res.setEncoding('utf-8');
      var data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() { resolve(data); });
    });
    req.on('error', reject);
    req.on('timeout', function() { req.destroy(); reject(new Error('timeout ' + url)); });
  });
}

function getWithRetry(url, retries) {
  return get(url).catch(function(e) {
    if (retries > 0) {
      return sleep(2000 * Math.pow(2, MAX_RETRIES - retries)).then(function() {
        return getWithRetry(url, retries - 1);
      });
    }
    throw e;
  });
}

// ---------- html utils ----------

function decodeEntities(s) {
  return (s || '')
    .replace(/&#x([0-9a-fA-F]+);/g, function(m, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function(m, d) { return String.fromCharCode(parseInt(d, 10)); })
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .trim();
}

function strip(s) {
  return (s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '')
    .trim();
}

// ---------- Mikan Classic page parser ----------

function parseClassicRows(html) {
  var rows = [];
  var trRe = /<tr>([\s\S]*?)<\/tr>/g;
  var m;
  while ((m = trRe.exec(html)) !== null) {
    var block = m[1];
    if (block.indexOf('data-clipboard-text="magnet:') === -1) continue;
    var magnet = (block.match(/data-clipboard-text="(magnet:[^"]*)"/) || [])[1];
    var hash = (magnet.match(/btih:([0-9a-fA-F]{40})/) || [])[1];
    if (!hash) continue;
    var timeCell = (block.match(/<td>([^<]*?)<\/td>/) || [])[1] || '';
    var groupMatch = block.match(/href="\/Home\/PublishGroup\/\d+"[^>]*>([\s\S]*?)<\/a>/);
    var titleMatch = block.match(/href="\/Home\/Episode\/[^"]+"[^>]*>([\s\S]*?)<\/a>/);
    var sizeMatch = block.match(/<td>([\d.,]+\s*(?:M|G|T)B)<\/td>/i);
    var torMatch = block.match(/href="(\/Download\/[^"]+\.torrent)"/);
    rows.push({
      time: timeCell.trim(),
      group: groupMatch ? decodeEntities(groupMatch[1]) : '',
      title: titleMatch ? decodeEntities(titleMatch[1]) : '',
      size: sizeMatch ? sizeMatch[1].toUpperCase() : '',
      torrentUrl: torMatch ? MIKAN_BASE + torMatch[1] : '',
      magnet: decodeEntities(magnet),
      hash: hash
    });
  }
  return rows;
}

function resolveTime(cell) {
  var now = new Date();
  var m = cell.match(/^今天\s+(\d{1,2}):(\d{2})/);
  if (m) {
    var d1 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), +m[1], +m[2], 0);
    return d1.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
  }
  m = cell.match(/^昨天\s+(\d{1,2}):(\d{2})/);
  if (m) {
    var d2 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, +m[1], +m[2], 0);
    return d2.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
  }
  m = cell.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (m) {
    var d3 = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0);
    return d3.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
  }
  return null;
}

// ---------- episode / size utils ----------

var EPISODE_PATTERNS = [
  /[Ss]\d{1,2}[Ee](\d{1,3})/,
  /第\s*(\d{1,3})\s*[话話集回]/,
  /\[(\d{1,4})(?:[vV]\d{1,2})?\]/,
  /【(\d{1,4})】/,
  /[Ee][pP]\s*\.?\s*(\d{1,3})/,
  /[\s-](\d{1,4})\s*[话話集回]/,
  /[-–—]\s*(\d{1,2})v\d+\s*[\[\(]/,
  /[-–—]\s*(\d{1,2})\s*[-–—]/,
  /[-\s](\d{1,2})\s*[\[\(]/
];

function extractEpisode(title) {
  if (/剧场版|劇場版|Movie|MOVIE|映画/.test(title)) return '剧场版';
  if (/\bOVA\b|\bOAD\b/.test(title)) return 'OVA';
  var range = title.match(/[\s\[](\d{1,2})\s*[-~]\s*(\d{1,2})(?![.\d])/);
  if (range && +range[2] > +range[1]) return range[1] + '-' + range[2];
  for (var i = 0; i < EPISODE_PATTERNS.length; i++) {
    var m = title.match(EPISODE_PATTERNS[i]);
    if (m) return m[1];
  }
  var long = title.match(/[-–—]\s*(\d{3,4})\s*(?:[\(\[/]|$)/);
  if (long) return long[1];
  return '';
}

function fmtBytes(b) {
  var u = ['B', 'KB', 'MB', 'GB', 'TB'];
  var i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return (i ? b.toFixed(1) : b) + ' ' + u[i];
}

// ---------- Classic crawl ----------

function stateGet() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); } catch (e) { return {}; }
}
function stateSet(s) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(s)); } catch (e) {}
}

var stats = { pages: 0, rows: 0, inserted: 0, seen: 0, failed: 0 };

function saveRow(r) {
  var ep = extractEpisode(r.title);
  return db.insert({
    info_hash: r.hash,
    title: r.title,
    bangumi_id: null,
    season_key: null,
    episode: ep,
    subtitle_group: r.group,
    size: r.size,
    magnet: r.magnet,
    torrent_url: r.torrentUrl,
    source: 'mikan',
    publish_time: r.timeIso,
    added_at: new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')
  });
}

async function crawlPages(startPage, maxPages, stopOnSeen) {
  var end = startPage + maxPages - 1;
  var totalPages = null;
  var pages = [];
  var stop = false;

  for (var p = startPage; p <= end && !stop; p++) {
    pages.push(p);
  }

  return new Promise(function(resolve) {
    var idx = 0;

    function worker() {
      if (stop) { return resolve(); }
      if (idx >= pages.length) { return resolve(); }
      var p = pages[idx++];
      processPage(p).then(function() { worker(); }).catch(function() { worker(); });
    }

    async function processPage(p) {
      var url = MIKAN_BASE + '/Home/Classic/' + p;
      var html;
      try { html = await getWithRetry(url, MAX_RETRIES); }
      catch (e) {
        stats.failed++;
        console.log('  [FAIL] page ' + p + ': ' + e.message);
        return;
      }
      stats.pages++;
      var rows = parseClassicRows(html);
      var pm = html.match(/\/ (\d+)<\/span>/);
      if (pm) totalPages = parseInt(pm[1]);

      var inserted = 0, seen = 0;
      rows.forEach(function(r) {
        r.timeIso = resolveTime(r.time);
        if (db.exists(r.hash)) { seen++; return; }
        var ok = saveRow(r);
        if (ok.changes > 0) inserted++; else seen++;
      });
      stats.rows += rows.length;
      stats.inserted += inserted;
      stats.seen += seen;

      if (p % 50 === 0 || (inserted === 0 && seen > 0)) {
        console.log('  page ' + p + '/' + (totalPages || '?') + ' rows=' + rows.length + ' new=' + inserted + ' seen=' + seen + ' total=' + db.count());
      }
      stateSet({ page: p });

      if (pm && p > totalPages) {
        console.log('  Page ' + p + ' beyond total ' + totalPages + ' - stopping');
        stop = true;
        return;
      }
      if (stopOnSeen && rows.length > 0 && inserted === 0) {
        console.log('  All rows on page ' + p + ' already in DB - stopping incremental crawl');
        stop = true;
      }
      await sleep(MIN_DELAY + Math.random() * 200);
    }

    for (var i = 0; i < Math.min(CONCURRENCY, pages.length); i++) worker();
    if (pages.length === 0) resolve();
  });
}

// ---------- bangumi loading ----------

function loadBangumi(key) {
  var fp = path.join(ROOT, 'data', key + '.js');
  if (!fs.existsSync(fp)) return [];
  var sandbox = { _DATA: {} };
  try { vm.runInNewContext(fs.readFileSync(fp, 'utf-8'), sandbox, { timeout: 1000 }); }
  catch (e) { return []; }
  var d = sandbox._DATA[key];
  if (!d) return [];
  var list = [];
  Object.keys(d).forEach(function(season) {
    (d[season] || []).forEach(function(a) {
      list.push({ id: a.id, title: a.title || '', titleJp: a.titleJp || '', season: season, key: key });
    });
  });
  return list;
}

function loadAllBangumi() {
  var out = [];
  fs.readdirSync(path.join(ROOT, 'data')).forEach(function(f) {
    var m = f.match(/^(\d{6})\.js$/);
    if (m) out = out.concat(loadBangumi(m[1]));
  });
  return out;
}

// ---------- matching ----------

var OpenCC = require('opencc-js');
var _t2s = null;
function t2s(s) {
  if (!_t2s) {
    try { _t2s = OpenCC.Converter({ from: 'tw', to: 'cn' }); }
    catch (e) { _t2s = null; }
  }
  if (!_t2s) return s;
  try { return _t2s(s); } catch (e) { return s; }
}

function norm(s) {
  return t2s(s).replace(/[！]/g, '!').replace(/[？]/g, '?').replace(/[：]/g, ':')
    .replace(/[（]/g, '(').replace(/[）]/g, ')').replace(/[～]/g, '~')
    .replace(/[－]/g, '-').replace(/[\u3000]/g, ' ')
    .toLowerCase();
}

function hasBoundary(title, key) {
  var i = title.indexOf(key);
  if (i === -1) return false;
  var before = i === 0 ? ' ' : title.charAt(i - 1);
  var after = title.charAt(i + key.length) || ' ';
  return /[\s\/\(\[「『：（|,.]/.test(before) && /[\s\/\)\]」』：,.－-]/.test(after);
}

function tokenize(s) {
  return (s || '').split(/[～～!！?？・·／\s\-–—+()\[\]【】「」『』,，.。：:]+/)
    .map(function(t) { return t.trim(); })
    .filter(function(t) { return t.length >= 2; });
}

var ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10,
  Ⅰ: 1, Ⅱ: 2, Ⅲ: 3, Ⅳ: 4, Ⅴ: 5, Ⅵ: 6, Ⅶ: 7, Ⅷ: 8, Ⅸ: 9, Ⅹ: 10 };
var CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

function seasonOfTitle(s) {
  s = s || '';
  var m = s.match(/第\s*([1-9]\d*)\s*[季期]/) ||
    s.match(/第\s*([一二三四五六七八九十]+)\s*[季期]/) ||
    s.match(/[Ss]\s*([1-9]\d*)\b/) ||
    s.match(/([1-9]\d*)\s*(?:st|nd|rd|th)\s*[Ss]eason/) ||
    s.match(/([1-9]\d*)\s*[季期]\b/);
  if (m) return /^[一二三四五六七八九十]+$/.test(m[1]) ? (CN_NUM[m[1]] || null) : +m[1];
  var r = s.match(/([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+)\s*$/);
  if (r) return ROMAN[r[1]] || null;
  var h = s.match(/([IVXLCDM]{2,6})(?:\s*$|[\s\-–—/\[(])/);
  if (h) { for (var k in ROMAN) if (k === h[1]) return ROMAN[k]; }
  var q = s.match(/([\u4e00-\u9fff！!])\s*([2-9])\s*[！!]{1,4}(?=\s*(?:$|\/|[-–—\[(]))/) ||
    s.match(/([\u4e00-\u9fff！!])\s*([2-9])(?=\s*(?:$|\/|[-–—\[(]))/);
  if (q) return +q[2];
  var t = s.match(/[^\d](\d{1,2})\s*[！!]*\s*$/);
  if (t) return +t[1];
  return null;
}

var SEASON_TOKEN_RE = /^(第\s*\d+\s*[季期クール]|第\s*[一二三四五六七八九十]+\s*[季期クール]|\d{1,2}\s*(?:st|nd|rd|th)\s*[Ss]eason|[Ss]\d{1,2}|[Ss]eason\s*\d{1,2}|[ⅰ-ⅹⅠ-Ⅹ]|[ivxlcdm]{2,6}|…+)$/;

function seasonStatus(seasonR, seasonB) {
  if (seasonR === null) return 0;
  if (seasonB === null) return seasonR > 1 ? -1 : 0;
  return seasonR === seasonB ? 1 : -1;
}

function matchAll(bangumi) {
  var t0 = Date.now();
  var items = db.allUnmatched();
  console.log('match: unmatched rows=' + items.length);
  var matched = 0, skipped = 0;
  var updates = [];

  // build per-bangumi search keys: titleJp (boundary, strong), full cn title (weak),
  // and cn tokens (fallback: all tokens must appear in the title)
  var plans = bangumi.map(function(b) {
    var keys = [];
    var jp = norm(b.titleJp);
    var jpKey = { type: 'jp', key: jp };
    keys.push(jpKey);
    var seasonB = seasonOfTitle(b.titleJp);
    if (seasonB === null) seasonB = seasonOfTitle(b.title);
    if (seasonB !== null) {
      var stripped = norm(b.titleJp).replace(/(?:[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]|[ivxlcdm]{2,6}|\d{1,2})\s*$/, '').replace(/第\s*\d+\s*[季期]\s*$/, '');
      if (stripped.length >= 2 && stripped !== jpKey.key) {
        keys.push({ type: 'jps', key: stripped });
      }
    }
    if (b.title && b.title.length >= 3 && b.title !== b.titleJp) keys.push({ type: 'cn', key: norm(b.title) });
    var tokens = tokenize(norm(b.title));
    var expanded = tokens.slice();
    tokens.forEach(function(t) {
      if (t.length >= 8 && /^[\u4e00-\u9fff]+$/.test(t)) {
        t.split(/[的了这与和及在]/).forEach(function(s) {
          if (s.length >= 4 && expanded.indexOf(s) === -1) expanded.push(s);
        });
      }
    });
    keys = keys.concat(expanded.filter(function(t) { return !SEASON_TOKEN_RE.test(t) && !/^[a-z]{1,2}$/.test(t); })
      .map(function(t) { return { type: 'token', key: t }; }));
    return { b: b, keys: keys, tokens: expanded, seasonB: seasonB };
  });
  var planById = {};
  plans.forEach(function(p) { planById[p.b.id] = p; });

  // inverted index by first character: a key can only match a title that contains its first char
  var keyIndex = {};
  plans.forEach(function(p) {
    p.keys.forEach(function(k) {
      if (!k.key) return;
      var c = k.key.charAt(0);
      if (!keyIndex[c]) keyIndex[c] = [];
      keyIndex[c].push({ plan: p, key: k, keyC: k.key.replace(/\s+/g, '') });
    });
  });

  // scan: for each resource, check only keys whose first char appears in the title
  items.forEach(function(item) {
    var title = norm(item.title);
    var titleC = title.replace(/\s+/g, '');
    var seasonR = seasonOfTitle(item.title);
    var seen = {};
    var chars = {};
    for (var i = 0; i < title.length; i++) chars[title.charAt(i)] = true;
    for (var c in chars) {
      var cands = keyIndex[c];
      if (!cands) continue;
      for (var j = 0; j < cands.length; j++) {
        var cand = cands[j];
        var sc = 0;
        if (cand.key.type === 'jp') {
          if (hasBoundary(title, cand.key.key)) sc = 4;
        } else if (cand.key.type === 'jps') {
          if (hasBoundary(title, cand.key.key)) sc = 3;
        } else if (cand.key.type === 'cn') {
          if (title.indexOf(cand.key.key) !== -1 || titleC.indexOf(cand.keyC) !== -1) sc = 3;
        } else {
          var hit = title.indexOf(cand.key.key) !== -1;
          if (hit && !/[\u4e00-\u9fff]/.test(cand.key.key)) hit = hasBoundary(title, cand.key.key);
          if (hit) sc = /[\u4e00-\u9fff]/.test(cand.key.key) ? 2 : 1;
        }
        if (sc === 0) continue;
        var st = seasonStatus(seasonR, cand.plan.seasonB);
        if (st === -1) continue;
        if (st === 1) sc += 2;
        if (seen[cand.plan.b.id] === undefined || sc > seen[cand.plan.b.id]) {
          seen[cand.plan.b.id] = sc;
        }
      }
    }
    // token fallback: all tokens must appear, OR a single strong (>=6 char) token hit counts
    for (var id in seen) {
      if (seen[id] === 2) {
        var p = planById[id];
        if (!p || p.tokens.length < 2) { delete seen[id]; continue; }
        var all = p.tokens.every(function(t) { return title.indexOf(t) !== -1; });
        if (all) continue;
        var strong = p.tokens.some(function(t) {
          return t.length >= 6 && /[\u4e00-\u9fff]/.test(t) && title.indexOf(t) !== -1;
        });
        if (!strong) delete seen[id];
      }
    }
    // verify an episode exists
    if (!extractEpisode(item.title)) return;
    var best = null, bestScore = 0, tie = false;
    for (var id in seen) {
      var sc = seen[id];
      if (sc > bestScore) { bestScore = sc; best = id; tie = false; }
      else if (sc === bestScore) tie = true;
    }
    if (best && !tie) {
      var b = null;
      for (var k = 0; k < plans.length; k++) { if (plans[k].b.id === best) { b = plans[k].b; break; } }
      if (b) {
        matched++;
        updates.push({ hash: item.info_hash, id: b.id, key: b.key });
      }
    } else if (best) {
      skipped++;
    }
  });

  console.log('match: linked=' + matched + ' ambiguous=' + skipped);
  // batch update
  for (var i = 0; i < updates.length; i += 500) {
    db.updateBangumiMany(updates.slice(i, i + 500));
  }
  console.log('match: done linked=' + matched + ' unmatched=' + db.countUnmatched() +
    ' in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
}

// ---------- RSS incremental (optional) ----------

var RSS_SOURCES = {
  mikan: { url: function(kw) { return MIKAN_BASE + '/RSS/Search?searchstr=' + encodeURIComponent(kw); }, enabled: true },
  nyaa: { url: function(kw) { return 'https://nyaa.si/?page=rss&q=' + encodeURIComponent(kw); }, enabled: true },
  acgrip: { url: function(kw) { return 'https://acg.rip/.xml?term=' + encodeURIComponent(kw); }, enabled: false },
  dmhy: { url: function(kw) { return 'https://dmhy.org/topics/rss/rss.xml?keyword=' + encodeURIComponent(kw); }, enabled: true }
};

function splitItems(xml) {
  var items = [];
  var pos = 0;
  while (true) {
    var si = xml.indexOf('<item', pos);
    if (si === -1) break;
    var ei = xml.indexOf('</item>', si);
    if (ei === -1) break;
    items.push(xml.substring(si, ei));
    pos = ei + 7;
  }
  return items;
}

function tag(block, name) {
  var m = block.match(new RegExp('<' + name + '[^>]*>([\\s\\S]*?)</' + name + '>'));
  return m ? m[1] : '';
}

function parseRssItem(block, source) {
  var title = strip(tag(block, 'title'));
  if (!title) return null;
  var hash = '';
  var magnet = '';
  var size = '';
  var torrentUrl = '';
  var sourceUrl = strip(tag(block, 'guid')) || strip(tag(block, 'link'));

  if (source === 'mikan') {
    var enc = block.match(/<enclosure[^>]*url="([^"]+\.torrent)"/);
    torrentUrl = enc ? enc[1] : '';
    hash = (torrentUrl.match(/([0-9a-fA-F]{40})\.torrent/) || [])[1];
    var pub = tag(block, 'torrent').match(/<pubDate>([^<]+)<\/pubDate>/);
    var pm = pub ? pub[1] : '';
    var desc = strip(tag(block, 'description'));
    var sm = desc.match(/\[([^\[]*?)\s*MB\]/);
    if (sm) size = sm[1] + ' MB';
    else { var gm = desc.match(/\[([^\[]*?)\s*GB\]/); if (gm) size = gm[1] + ' GB'; }
    if (hash) magnet = 'magnet:?xt=urn:btih:' + hash;
    return { title: title, hash: hash, size: size, magnet: magnet, torrentUrl: torrentUrl, sourceUrl: sourceUrl, publishTime: pm };
  }
  if (source === 'nyaa') {
    var cat = strip(tag(block, 'categoryId')) || '';
    if (cat && cat.indexOf('1_') !== 0) return null;
    hash = strip(tag(block, 'infoHash')) || '';
    size = strip(tag(block, 'size'));
    torrentUrl = strip(tag(block, 'link'));
    var pt = strip(tag(block, 'pubDate'));
    return { title: title, hash: hash, size: size, magnet: hash ? 'magnet:?xt=urn:btih:' + hash : '', torrentUrl: torrentUrl, sourceUrl: sourceUrl, publishTime: pt };
  }
  if (source === 'dmhy') {
    var cat2 = strip(tag(block, 'category')) || '';
    if (cat2 && cat2.indexOf('動畫') === -1) return null;
    var enc2 = block.match(/<enclosure[^>]*url="(magnet:[^"]*btih:([0-9a-fA-F]{40}))"/i);
    if (enc2) { magnet = enc2[1]; hash = enc2[2]; }
    var pt2 = strip(tag(block, 'pubDate'));
    return { title: title, hash: hash, size: '', magnet: magnet, torrentUrl: magnet, sourceUrl: sourceUrl, publishTime: pt2 };
  }
  return null;
}

function normDate(s) {
  var d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

var BAD_GROUP = /(1080|720|4k|2160|HEVC|HVC|AVC|H\.?264|H\.?265|x26[45]|AAC|AC3|FLAC|MP4|MKV|WEB[-\s]?DL|Baha|Bahamut|CR|Netflix|ABEMA|CATCHPLAY|Hi10P|v\d+|TV版|无修版|BD[Rr]ip|合集|全集|片源|搬运|压制|RAW|字幕|内嵌|内封|双语|多国|剧场版|第\d+季)/i;

function extractGroup(title, author) {
  var m = title.match(/^\s*\[([^\[\]]{1,40})\]/);
  var cand = m ? m[1] : '';
  if (cand && !BAD_GROUP.test(cand)) return cand;
  m = title.match(/^\s*\[([^\[\]]+)\]\s*\[([^\[\]]{1,40})\]/);
  if (m && !BAD_GROUP.test(m[2])) return m[2];
  if (author && !BAD_GROUP.test(author)) return author;
  return '';
}

async function rssIncremental(bangumi) {
  var rStats = { fetched: 0, inserted: 0, failed: 0 };
  for (var i = 0; i < bangumi.length; i++) {
    var b = bangumi[i];
    Object.keys(RSS_SOURCES).forEach(function(src) {
      if (!RSS_SOURCES[src].enabled) return;
      queue.push(function() { return fetchRss(b, src, rStats); });
    });
  }
  var t0 = Date.now();
  await worker();
  console.log('rss: fetched=' + rStats.fetched + ' inserted=' + rStats.inserted + ' failed=' + rStats.failed +
    ' in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
}

async function fetchRss(b, src, rStats) {
  var kws = [b.titleJp, b.title].filter(function(k) { return k && k.length >= 2; });
  var nkws = kws.map(norm);
  var seen = false;
  for (var i = 0; i < kws.length; i++) {
    var xml;
    try {
      xml = await getWithRetry(RSS_SOURCES[src].url(kws[i]), 1);
      rStats.fetched++;
    } catch (e) { rStats.failed++; continue; }
    var items = splitItems(xml).map(function(bl) { return parseRssItem(bl, src); }).filter(Boolean);
    if (items.length > 0) seen = true;
    items.forEach(function(it) {
      if (!it.hash) return;
      if (db.exists(it.hash)) return;
      // RSS search is token-based; only accept items whose title actually contains the keyword
      if (!nkws.some(function(k) { return norm(it.title).indexOf(k) !== -1; })) return;
      var ok = db.insert({
        info_hash: it.hash,
        title: it.title,
        bangumi_id: b.id,
        season_key: b.key,
        episode: extractEpisode(it.title),
        subtitle_group: extractGroup(it.title, ''),
        size: it.size,
        magnet: it.magnet,
        torrent_url: it.torrentUrl,
        source: src,
        publish_time: normDate(it.publishTime),
        added_at: new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')
      });
      if (ok.changes > 0) rStats.inserted++;
    });
    if (seen) break;
    await sleep(MIN_DELAY);
  }
}

var queue = [];
var running = 0;

function worker() {
  return new Promise(function(resolve) {
    function next() {
      if (queue.length === 0) { resolve(); return; }
      var job = queue.shift();
      running++;
      job().then(function() { running--; next(); }).catch(function() { running--; next(); });
    }
    for (var i = 0; i < CONCURRENCY; i++) next();
  });
}

// ---------- Episode detail crawl ----------

var DETAIL_STATE_KEY = 'detail_page';

function parseDetailIntro(html) {
  var intro = '';
  var start = html.indexOf('<p class="title" style="color:#3bc0c3;">介绍</p>');
  if (start === -1) start = html.indexOf('>介绍</p>');
  if (start === -1) return { text: '', images: [], hasIntro: false };
  var div = html.indexOf('<div class="info">', start);
  if (div === -1) return { text: '', images: [], hasIntro: false };
  var inner = html.substring(div + '<div class="info">'.length);
  var end = inner.indexOf('</div>');
  if (end === -1) end = inner.length;
  inner = inner.substring(0, end);

  var images = [];
  var imgRe = /<img[^>]*src="([^"]+)"[^>]*>/g;
  var m;
  while ((m = imgRe.exec(inner)) !== null) {
    var src = m[1];
    if (src.indexOf('http') !== 0) src = MIKAN_BASE + src;
    images.push(src);
  }
  var text = inner
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&#x([0-9a-fA-F]+);/g, function(x, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function(x, d) { return String.fromCharCode(parseInt(d, 10)); })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text: text, images: images, hasIntro: text.length > 0 || images.length > 0 };
}

var detailStats = { fetched: 0, updated: 0, noIntro: 0, failed: 0, empty: 0 };

async function crawlDetails(maxItems) {
  var done = 0;
  var failCount = 0;

  while (maxItems === null || done < maxItems) {
    var batch = db.noDetails(100);
    if (batch.length === 0) break;

    var jobs = batch.map(function(item) {
      return function() {
        return fetchDetail(item).then(function(ok) {
          if (!ok) failCount++;
          else failCount = 0;
        });
      };
    });
    var q = jobs.slice();
    var index2 = 0;
    var detailConcurrency = 8;
    await new Promise(function(resolve) {
      function next2() {
        if (index2 >= q.length) { resolve(); return; }
        var job = q[index2++];
        job().then(function() { next2(); }).catch(function() { next2(); });
      }
      for (var i = 0; i < detailConcurrency; i++) next2();
    });
    done += batch.length;
    if (failCount >= 20) {
      console.log('  too many failures (' + failCount + '), stopping');
      break;
    }
    if (maxItems !== null && done >= maxItems) break;
  }
  return done;
}

async function fetchDetail(item) {
  var url = MIKAN_BASE + '/Home/Episode/' + item.info_hash;
  var html;
  try {
    html = await getWithRetry(url, 1);
  } catch (e) {
    detailStats.failed++;
    if (/404|410/.test(e.message)) {
      db.updateDetails(item.info_hash, null, null);
      return true;
    }
    return false;
  }
  detailStats.fetched++;
  var parsed = parseDetailIntro(html);
  if (!parsed.hasIntro) detailStats.noIntro++;
  var ok = db.updateDetails(item.info_hash, parsed.text || null, JSON.stringify(parsed.images));
  if (ok.changes > 0) detailStats.updated++;
  if (detailStats.fetched % 100 === 0) {
    console.log('  details: fetched=' + detailStats.fetched + ' updated=' + detailStats.updated + ' noIntro=' + detailStats.noIntro + ' failed=' + detailStats.failed + ' remaining=' + db.noDetails(1).length);
  }
  await sleep(60 + Math.random() * 40);
  return true;
}

// ---------- main ----------

function arg(name) {
  var i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : null;
}
function has(name) {
  return process.argv.indexOf(name) > -1;
}

async function main() {
  db.init();
  var args = process.argv.slice(2);

  if (has('--rematch')) db.resetBangumi();

  var bangumi = loadAllBangumi();
  console.log('Bangumi loaded: ' + bangumi.length + '  DB rows: ' + db.count());

  var doCrawl = !has('--match-only') && !has('--details-only');
  var doMatch = !has('--no-match') && !has('--rss-only');
  var doRss = has('--rss');
  var doDetails = has('--details') || has('--details-only');

  if (doDetails) {
    var maxItems = arg('--details-max') ? parseInt(arg('--details-max')) : null;
    console.log('Crawling episode details (max=' + (maxItems || 'all') + ')...');
    var done = await crawlDetails(maxItems);
    console.log('details: done=' + done + ' fetched=' + detailStats.fetched + ' updated=' + detailStats.updated + ' noIntro=' + detailStats.noIntro + ' failed=' + detailStats.failed);
    process.exit(0);
  }

  if (doCrawl) {
    var state = stateGet();
    var start = arg('--crawl') ? parseInt(arg('--crawl')) : ((state.page || 0) + 1);
    var maxPages = arg('--pages') ? parseInt(arg('--pages')) : 99999;
    var stopOnSeen = !has('--full'); // 增量默认遇已见页即停；--full 强制爬完
    console.log('Crawling Classic pages from ' + start + ' (max ' + maxPages + ', stopOnSeen=' + stopOnSeen + ')');
    await crawlPages(start, maxPages, stopOnSeen);
    console.log('crawl: pages=' + stats.pages + ' rows=' + stats.rows + ' new=' + stats.inserted + ' seen=' + stats.seen + ' failed=' + stats.failed);
  }

  if (doRss) {
    console.log('RSS incremental...');
    await rssIncremental(bangumi);
  }

  if (doMatch) {
    console.log('Matching resources to bangumi...');
    matchAll(bangumi);
  }

  console.log('DB total: ' + db.count());
}

main().catch(function(e) {
  console.error('\nFatal:', e.message);
  process.exit(1);
});
