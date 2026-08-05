var http = require('http');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var zlib = require('zlib');
var db = require('./db');

var root = __dirname;
var PORT = parseInt(process.env.PORT) || 8080;
var HOST = process.env.HOST || '0.0.0.0';
var types = {
  '.html': 'text/html;charset=utf-8',
  '.js': 'application/javascript;charset=utf-8',
  '.css': 'text/css;charset=utf-8',
  '.json': 'application/json;charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.xsl': 'application/xml'
};

// Cache duration in seconds for different file types
var cacheDuration = {
  '.jpg': 86400 * 7,
  '.jpeg': 86400 * 7,
  '.png': 86400 * 7,
  '.gif': 86400 * 7,
  '.svg': 86400 * 7,
  '.ico': 86400 * 7,
  '.js': 0,
  '.css': 0,
  '.json': 0,
  '.html': 0
};

function parseDataFile(content) {
  var sandbox = { _DATA: {} };
  try {
    vm.runInNewContext(content, sandbox, { timeout: 1000 });
  } catch(e) {
    return null;
  }
  return sandbox._DATA;
}

// season data cache: key -> { mtime, data }
var seasonCache = {};
var searchCache = {}; // q -> { ts, payload }
var SEARCH_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
var SEARCH_CACHE_MAX = 200;

function getSeasonData(key, season) {
  var fp = path.join(root, 'data', key + '.js');
  if (!fs.existsSync(fp)) return null;
  var cached = seasonCache[key];
  var mtime = fs.statSync(fp).mtimeMs;
  if (cached && cached.mtime === mtime) return cached.data[key] ? cached.data[key][season] || null : null;
  var content = fs.readFileSync(fp, 'utf-8');
  var data = parseDataFile(content);
  seasonCache[key] = { mtime: mtime, data: data };
  if (!data || !data[key]) return null;
  return data[key][season] || null;
}

function cacheSearchResult(kw, payload) {
  if (Object.keys(searchCache).length >= SEARCH_CACHE_MAX) {
    searchCache = {};
  }
  searchCache[kw] = { ts: Date.now(), payload: payload };
}

function getCachedSearchResult(kw) {
  var hit = searchCache[kw];
  if (!hit) return null;
  if (Date.now() - hit.ts > SEARCH_CACHE_TTL) {
    delete searchCache[kw];
    return null;
  }
  return hit.payload;
}

var staticRoot = path.join(root, 'dist');
var hasDist = fs.existsSync(path.join(staticRoot, 'index.html'));

var server = http.createServer(function(req, res) {
  if (handleAPI(req, res)) return;
  var urlPath = req.url.split('?')[0]
    .replace(/%2F/gi, '\x00SLASH\x00');
  urlPath = decodeURIComponent(urlPath)
    .replace(/\x00SLASH\x00/g, '%2F')
    .replace(/:/g, '\uFF1A');
  // 图片/季度数据/favicon 始终从项目根目录服务；其余（构建产物）从 dist 服务
  var base = (!hasDist || /^\/(images|data)\//.test(urlPath) || /^\/favicon\.(png|ico)$/.test(urlPath)) ? root : staticRoot;
  var filePath = path.join(base, urlPath === '/' ? 'index.html' : urlPath);
  filePath = path.resolve(filePath);

  // prevent path traversal outside base dir
  if (filePath.indexOf(base) !== 0) {
    res.writeHead(403);
    return res.end();
  }

  console.log(req.url, '->', filePath);

  fs.stat(filePath, function(err, stat) {
    if (!err && stat.isFile()) {
      return serve(req, res, filePath);
    }

    var dirIndex = path.join(filePath, 'index.html');
    fs.stat(dirIndex, function(err2) {
      if (!err2) { return serve(req, res, dirIndex); }

      serve(req, res, path.join(staticRoot, 'index.html'));
    });
  });
}).listen(PORT, HOST, function() {
  console.log('http://' + HOST + ':' + PORT + (hasDist ? ' (dist mode)' : ''));
});

function shutdown() {
  console.log('shutting down...');
  try { server.close(); } catch (e) {}
  db.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function wantsGzip(req) {
  return /gzip/.test(req.headers['accept-encoding'] || '');
}

function serve(req, res, fp) {
  var ext = path.extname(fp).toLowerCase();
  var headers = { 'Content-Type': types[ext] || 'text/plain' };
  var maxAge = cacheDuration[ext];
  if (maxAge > 0) {
    headers['Cache-Control'] = 'public, max-age=' + maxAge;
  } else if (ext === '.html' || ext === '.js' || ext === '.css') {
    headers['Cache-Control'] = 'no-store, no-cache, must-revalidate';
  }
  if (wantsGzip(req) && maxAge === 0) {
    headers['Content-Encoding'] = 'gzip';
    res.writeHead(200, headers);
    fs.createReadStream(fp).pipe(zlib.createGzip()).pipe(res);
    return;
  }
  res.writeHead(200, headers);
  fs.createReadStream(fp).pipe(res);
}

function parseBody(req, cb) {
  var body = '';
  req.on('data', function(c) { body += c; });
  req.on('end', function() {
    try { cb(JSON.parse(body)); } catch(e) { cb(null); }
  });
}

function sendText(req, res, status, contentType, body) {
  var headers = { 'Content-Type': contentType };
  if (wantsGzip(req)) {
    headers['Content-Encoding'] = 'gzip';
    res.writeHead(status, headers);
    res.end(zlib.gzipSync(body));
    return;
  }
  res.writeHead(status, headers);
  res.end(body);
}

function writeJSON(req, res, status, data) {
  sendText(req, res, status, 'application/json', JSON.stringify(normalizeMagnet(data)));
}

function handleAPI(req, res) {
  var urlPath = decodeURIComponent(req.url.split('?')[0]);
  var query = req.url.split('?')[1] || '';
  if (/^\/(api|rss)\//.test(urlPath)) db.init();
  function q(name) {
    var m = query.match(new RegExp('(?:^|[?&])' + name + '=([^&]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  // GET /api/resources/latest?page=&size=&group=&season=&q=
  if (urlPath === '/api/resources/latest' && req.method === 'GET') {
    var lOpts = {
      page: parseInt(q('page')) || 1,
      size: parseInt(q('size')) || 30,
      group: q('group'),
      season: q('season'),
      q: q('q')
    };
    var lKey = 'latest:' + [lOpts.page, lOpts.size, lOpts.group, lOpts.season, lOpts.q].join('|');
    var data = (lOpts.q || lOpts.group) ? cachedResource(lKey, function() { return db.latest(lOpts); }) : db.latest(lOpts);
    writeJSON(req, res, 200, data);
    return true;
  }

  // GET /api/resources/hash/:hash
  var hashMatch = urlPath.match(/^\/api\/resources\/hash\/([0-9a-fA-F]{40})$/);
  if (hashMatch) {
    var item = db.byHash(hashMatch[1]);
    if (!item) { writeJSON(req, res, 404, { error: 'not found' }); return true; }
    if (item.images) {
      try { item.images = JSON.parse(item.images); } catch(e) { item.images = []; }
    }
    writeJSON(req, res, 200, item);
    return true;
  }

  // GET /api/resources/bangumi?key=202607&id=acgs-anime-2229&page=&size=
  if (urlPath === '/api/resources/bangumi' && req.method === 'GET') {
    var key = q('key'), id = q('id');
    if (!key || !id) { writeJSON(req, res, 400, { error: 'missing key or id' }); return true; }
    var all = db.byBangumi(id, key);
    var page = parseInt(q('page')) || 1;
    var size = Math.min(100, parseInt(q('size')) || 30);
    var slice = all.slice((page - 1) * size, page * size);
    writeJSON(req, res, 200, { list: slice, total: all.length, page: page, size: size });
    return true;
  }

  // GET /api/groups?q=&page=&size=
  if (urlPath === '/api/groups' && req.method === 'GET') {
    writeJSON(req, res, 200, { list: db.groups(q('q')) });
    return true;
  }

  // GET /api/group/:name?page=&size=&q=
  var groupMatch = urlPath.match(/^\/api\/group\/([^\/]+)$/);
  if (groupMatch) {
    var gname = groupMatch[1];
    var gpage = parseInt(q('page')) || 1;
    var gsize = Math.min(100, parseInt(q('size')) || 30);
    var gq = q('q');
    var gdata;
    if (gq) {
      gdata = cachedResource('group:' + [gname, gpage, gsize, gq].join('|'), function() {
        return db.latest({ group: gname, page: gpage, size: gsize, q: gq });
      });
    } else {
      gdata = db.latest({ group: gname, page: gpage, size: gsize });
      if (!gdata.total) {
        var prefix = db.latest({ groupPrefix: gname, page: gpage, size: gsize });
        if (prefix.total) gdata = prefix;
      }
    }
    writeJSON(req, res, 200, gdata);
    return true;
  }

  // GET /api/search?q=
  if (urlPath === '/api/search' && req.method === 'GET') {
    var kw = q('q');
    if (!kw) { writeJSON(req, res, 400, { error: 'missing q' }); return true; }
    var cached = getCachedSearchResult(kw);
    if (cached) {
      writeJSON(req, res, 200, cached);
      return true;
    }
    var resources = db.search(kw, 50);
    var bangumi = [];
    var now = new Date();
    var seenBangumi = {};
    for (var y = now.getFullYear(); y >= 2016; y--) {
      for (var si = 0; si < SEASON_KEYS.length; si++) {
        var seasonData = getSeasonData(y + SEASON_KEYS[si], SEASON_NAMES[si]);
        if (!seasonData) continue;
        seasonData.forEach(function(a) {
          if (seenBangumi[a.id]) return;
          if ((a.title && a.title.indexOf(kw) !== -1) || (a.titleJp && a.titleJp.indexOf(kw) !== -1)) {
            seenBangumi[a.id] = true;
            bangumi.push({ id: a.id, title: a.title, titleJp: a.titleJp, season_key: y + SEASON_KEYS[si], weekday: a.weekday, airTime: a.airTime });
          }
        });
        if (bangumi.length > 20) break;
      }
      if (bangumi.length > 20) break;
    }
    var payload = { resources: resources, bangumi: bangumi.slice(0, 20) };
    cacheSearchResult(kw, payload);
    writeJSON(req, res, 200, payload);
    return true;
  }

  // GET /rss/bangumi/:key/:id
  var rssMatch = urlPath.match(/^\/rss\/bangumi\/(\d{6})\/([^\/]+)$/);
  if (rssMatch) {
    var bid = rssMatch[2], bkey = rssMatch[1];
    var rssKey = 'bangumi:' + bkey + ':' + bid;
    var xml = cachedRss(rssKey, function() {
      var title = 'ANi';
      ['winter', 'spring', 'summer', 'fall'].forEach(function(sn) {
        if (title !== 'ANi') return;
        var sd = getSeasonData(bkey, sn);
        if (!sd) return;
        sd.forEach(function(a) { if (a.id === bid) title = a.title || title; });
      });
      var base = 'http://' + req.headers.host;
      return buildRssFeed(base + '/' + bkey + '/', title, db.byBangumi(bid, bkey).slice(0, 200));
    });
    sendText(req, res, 200, 'application/xml; charset=UTF-8', xml);
    return true;
  }

  // GET /rss/group/:name — 按字幕组订阅最新发布
  var rssGroupMatch = urlPath.match(/^\/rss\/group\/([^\/]+)$/);
  if (rssGroupMatch) {
    var gname = rssGroupMatch[1];
    var xmlG = cachedRss('group:' + gname, function() {
      var gdata = db.latest({ group: gname, page: 1, size: 50 });
      var gLink = 'http://' + req.headers.host + '/groups?q=' + encodeURIComponent(gname);
      return buildRssFeed(gLink, gname, gdata.list);
    });
    sendText(req, res, 200, 'application/xml; charset=UTF-8', xmlG);
    return true;
  }

  // GET /api/data/:key/:season
  var getMatch = urlPath.match(/^\/api\/data\/(\d{6})\/(winter|spring|summer|fall)$/);
  if (getMatch && req.method === 'GET') {
    var key = getMatch[1], season = getMatch[2];
    var data = getSeasonData(key, season);
    if (data === null) { writeJSON(req, res, 404, { error: 'not found' }); return true; }
    writeJSON(req, res, 200, data);
    return true;
  }

  if (urlPath === '/api/list' && req.method === 'POST') {
    parseBody(req, function(body) {
      if (!body || !body.key || !body.season) { writeJSON(req, res, 400, { error:'missing key or season' }); return; }
      var data = getSeasonData(body.key, body.season);
      writeJSON(req, res, 200, data || []);
    });
    return true;
  }

  if (urlPath === '/api/delete' && req.method === 'POST') {
    parseBody(req, function(body) {
      if (!body || !body.key || !body.season || !body.id) { writeJSON(req, res, 400, { error:'missing fields' }); return; }
      var fp = path.join(root, 'data', body.key + '.js');
      fs.readFile(fp, 'utf-8', function(err, content) {
        if (err) { writeJSON(req, res, 404, { error:'file not found' }); return; }
        var data = parseDataFile(content);
        if (!data || !data[body.key] || !data[body.key][body.season]) { writeJSON(req, res, 404, { error:'season not found' }); return; }
        var arr = data[body.key][body.season];
        var filtered = arr.filter(function(item) { return item.id !== body.id; });
        if (filtered.length === arr.length) { writeJSON(req, res, 200, { success:true }); return; }
        var newContent = content.replace(
          /(_DATA\["[^"]+"\]\["[^"]+"\]\s*=\s*)(\[[\s\S]*?\])(;?)/,
          '$1' + JSON.stringify(filtered, null, '  ') + '$3'
        );
        fs.writeFile(fp, newContent, 'utf-8', function(err2) {
          if (err2) { writeJSON(req, res, 500, { error:'write error' }); return; }
          writeJSON(req, res, 200, { success:true });
        });
      });
    });
    return true;
  }

  return false;
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

var MY_TRACKERS =
  '&tr=https%3a%2f%2f004430.xyz%2fannounce' +
  '&tr=https%3a%2f%2ftracker.nekomi.cn%2fannounce' +
  '&tr=http%3a%2f%2ftracker1.itzmx.com%3a8080%2fannounce' +
  '&tr=http%3a%2f%2ftracker2.itzmx.com%3a6961%2fannounce' +
  '&tr=http%3a%2f%2ftracker3.itzmx.com%3a6961%2fannounce' +
  '&tr=http%3a%2f%2ftracker4.itzmx.com%3a2710%2fannounce' +
  '&tr=udp%3a%2f%2ftracker1.itzmx.com%3a8080%2fannounce' +
  '&tr=udp%3a%2f%2ftracker2.itzmx.com%3a6961%2fannounce' +
  '&tr=udp%3a%2f%2ftracker3.itzmx.com%3a6961%2fannounce' +
  '&tr=udp%3a%2f%2ftracker4.itzmx.com%3a2710%2fannounce' +
  '&tr=http%3a%2f%2ftracker.opentorrent.top%3a6969%2fannounce' +
  '&tr=http%3a%2f%2ftracker.opentrackr.org%3a1337%2fannounce' +
  '&tr=http%3a%2f%2f107.189.2.131%3a1337%2fannounce' +
  '&tr=http%3a%2f%2f132.243.161.144%3a6969%2fannounce' +
  '&tr=http%3a%2f%2f207.241.226.111%3a6969%2fannounce' +
  '&tr=http%3a%2f%2f207.241.231.226%3a6969%2fannounce' +
  '&tr=http%3a%2f%2f[2605%3a6400%3a30%3afad6%3a%3adead%3ac0d3]%3a1337%2fannounce' +
  '&tr=http%3a%2f%2f[2a04%3aac00%3a1%3a3dd8%3a%3a1%3a2710]%3a2710%2fannounce' +
  '&tr=udp%3a%2f%2ftracker.opentrackr.org%3a1337%2fannounce' +
  '&tr=udp%3a%2f%2ftracker.torrent.eu.org%3a451%2fannounce' +
  '&tr=udp%3a%2f%2ftracker.dler.com%3a6969%2fannounce' +
  '&tr=http%3a%2f%2ftracker.dler.com%3a6969%2fannounce' +
  '&tr=http%3a%2f%2ftracker2.dler.org%2fannounce';

function magnetWithMyTrackers(m) {
  if (!m || m.indexOf('magnet:?') !== 0) return m;
  var parts = m.split('&').filter(function(k) { return k.indexOf('tr=') !== 0; });
  var base = parts.join('&').replace(/^magnet:\?&/, 'magnet:?');
  return base + (base.indexOf('?') >= 0 ? '&' : '?') + MY_TRACKERS.slice(1);
}

function normalizeMagnet(obj) {
  if (Array.isArray(obj)) { obj.forEach(normalizeMagnet); return obj; }
  if (obj && typeof obj === 'object') {
    Object.keys(obj).forEach(function(k) {
      if (k === 'magnet') obj[k] = magnetWithMyTrackers(obj[k]);
      else normalizeMagnet(obj[k]);
    });
  }
  return obj;
}

// RSS 2.0 要求 RFC 822 日期：Sun, 02 Aug 2026 10:30:00 GMT
function toRfcDate(s) {
  if (!s) return '';
  var d = new Date(String(s));
  if (isNaN(d.getTime())) return String(s);
  return d.toUTCString();
}

// RSS 内存缓存（60s TTL），避免每次请求重建 XML
var rssCache = {};
function cachedRss(key, build) {
  var c = rssCache[key];
  if (c && Date.now() - c.t < 60000) return c.xml;
  var xml = build();
  rssCache[key] = { t: Date.now(), xml: xml };
  return xml;
}

// 搜索结果内存缓存（10 分钟 TTL）：无索引 LIKE 全表扫较慢，重复搜索直接命中
var resourceCache = {};
function cachedResource(key, build) {
  var c = resourceCache[key];
  if (c && Date.now() - c.t < 600000) return c.payload;
  var p = build();
  if (Object.keys(resourceCache).length >= 300) resourceCache = {};
  resourceCache[key] = { t: Date.now(), payload: p };
  return p;
}

function buildRssFeed(channelLink, channelTitle, list) {
  var xml = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<rss version="2.0">' +
    '<channel>' +
    '<title>' + esc(channelTitle) + ' 最新动画资源</title>' +
    '<description>' + esc('Nekomi 是动漫资源聚合站') + '</description>' +
    '<link>' + esc(channelLink) + '</link>';
  list.forEach(function(r) {
    var magnet = magnetWithMyTrackers(r.magnet);
    if (!magnet && !r.torrent_url) return;
    var encUrl = magnet || r.torrent_url;
    var detailUrl = channelLink.replace(/^(https?:\/\/[^\/]+)\/.*$/, '$1') + '/#res/' + r.info_hash;
    xml += '<item><title>' + esc(r.title) + '</title>' +
      '<link>' + esc(detailUrl) + '</link>' +
      '<guid isPermaLink="true">' + esc(detailUrl) + '</guid>' +
      '<pubDate>' + toRfcDate(r.publish_time) + '</pubDate>' +
      '<enclosure url="' + esc(encUrl) + '" length="' + rssSize(r.size) + '" type="application/x-bittorrent"/></item>';
  });
  xml += '</channel></rss>';
  return xml;
}

// "1.2 GB"/"704.6MB" -> bytes; fallback 0
function rssSize(s) {
  var m = String(s || '').match(/([\d.]+)\s*(B|KB|MB|GB|TB)/i);
  if (!m) return '0';
  var n = parseFloat(m[1]);
  var mult = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024, TB: 1024 * 1024 * 1024 * 1024 }[m[2].toUpperCase()];
  return String(Math.round(n * mult));
}

var SEASON_KEYS = ['01', '04', '07', '10'];
var SEASON_NAMES = ['winter', 'spring', 'summer', 'fall'];

// warm season cache on startup
(function warmSeasonCache() {
  var now = new Date();
  for (var y = now.getFullYear(); y >= 2016; y--) {
    for (var si = 0; si < SEASON_KEYS.length; si++) {
      getSeasonData(y + SEASON_KEYS[si], SEASON_NAMES[si]);
    }
  }
  console.log('season cache warmed (' + Object.keys(seasonCache).length + ' files)');
})();
