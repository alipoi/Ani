var http = require('http');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var db = require('./db');

var root = __dirname;
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
  '.ico': 'image/x-icon'
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

http.createServer(function(req, res) {
  if (handleAPI(req, res)) return;
  var urlPath = req.url.split('?')[0]
    .replace(/%2F/gi, '\x00SLASH\x00');
  urlPath = decodeURIComponent(urlPath)
    .replace(/\x00SLASH\x00/g, '%2F')
    .replace(/:/g, '\uFF1A');
  var filePath = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
  filePath = path.resolve(filePath);

  // prevent path traversal outside project root
  if (filePath.indexOf(root) !== 0) {
    res.writeHead(403);
    return res.end();
  }

  console.log(req.url, '->', filePath);

  fs.stat(filePath, function(err, stat) {
    if (!err && stat.isFile()) {
      return serve(res, filePath);
    }

    var dirIndex = path.join(filePath, 'index.html');
    fs.stat(dirIndex, function(err2) {
      if (!err2) { return serve(res, dirIndex); }

      serve(res, path.join(root, 'index.html'));
    });
  });
}).listen(8080, function() {
  console.log('http://127.0.0.1:8080');
});

function serve(res, fp) {
  var ext = path.extname(fp).toLowerCase();
  var headers = { 'Content-Type': types[ext] || 'text/plain' };
  var maxAge = cacheDuration[ext];
  if (maxAge > 0) {
    headers['Cache-Control'] = 'public, max-age=' + maxAge;
  } else if (ext === '.html' || ext === '.js' || ext === '.css') {
    headers['Cache-Control'] = 'no-store, no-cache, must-revalidate';
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

function writeJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function getSeasonData(key, season) {
  var fp = path.join(root, 'data', key + '.js');
  if (!fs.existsSync(fp)) return null;
  var content = fs.readFileSync(fp, 'utf-8');
  var data = parseDataFile(content);
  if (!data || !data[key]) return null;
  return data[key][season] || null;
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
    var data = db.latest({
      page: parseInt(q('page')) || 1,
      size: parseInt(q('size')) || 30,
      group: q('group'),
      season: q('season'),
      q: q('q')
    });
    writeJSON(res, 200, data);
    return true;
  }

  // GET /api/resources/hash/:hash
  var hashMatch = urlPath.match(/^\/api\/resources\/hash\/([0-9a-fA-F]{40})$/);
  if (hashMatch) {
    var item = db.byHash(hashMatch[1]);
    if (!item) { writeJSON(res, 404, { error: 'not found' }); return true; }
    if (item.images) {
      try { item.images = JSON.parse(item.images); } catch(e) { item.images = []; }
    }
    writeJSON(res, 200, item);
    return true;
  }

  // GET /api/resources/bangumi?key=202607&id=acgs-anime-2229&page=&size=
  if (urlPath === '/api/resources/bangumi' && req.method === 'GET') {
    var key = q('key'), id = q('id');
    if (!key || !id) { writeJSON(res, 400, { error: 'missing key or id' }); return true; }
    var all = db.byBangumi(id, key);
    var page = parseInt(q('page')) || 1;
    var size = Math.min(100, parseInt(q('size')) || 30);
    var slice = all.slice((page - 1) * size, page * size);
    writeJSON(res, 200, { list: slice, total: all.length, page: page, size: size });
    return true;
  }

  // GET /api/groups?q=&page=&size=
  if (urlPath === '/api/groups' && req.method === 'GET') {
    writeJSON(res, 200, { list: db.groups(q('q')) });
    return true;
  }

  // GET /api/group/:name?page=&size=
  var groupMatch = urlPath.match(/^\/api\/group\/([^\/]+)$/);
  if (groupMatch) {
    var gname = groupMatch[1];
    var gpage = parseInt(q('page')) || 1;
    var gsize = Math.min(100, parseInt(q('size')) || 30);
    var gdata = db.latest({ group: gname, page: gpage, size: gsize });
    writeJSON(res, 200, gdata);
    return true;
  }

  // GET /api/search?q=
  if (urlPath === '/api/search' && req.method === 'GET') {
    var kw = q('q');
    if (!kw) { writeJSON(res, 400, { error: 'missing q' }); return true; }
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
    writeJSON(res, 200, { resources: resources, bangumi: bangumi.slice(0, 20) });
    return true;
  }

  // GET /rss/bangumi/:key/:id
  var rssMatch = urlPath.match(/^\/rss\/bangumi\/(\d{6})\/([^\/]+)$/);
  if (rssMatch) {
    var list = db.byBangumi(rssMatch[2], rssMatch[1]);
    var seasonData = getSeasonData(rssMatch[1], 'summer') || getSeasonData(rssMatch[1], 'spring') ||
      getSeasonData(rssMatch[1], 'fall') || getSeasonData(rssMatch[1], 'winter');
    var title = 'Ani - 订阅';
    if (seasonData) {
      seasonData.forEach(function(a) { if (a.id === rssMatch[2]) title = a.title; });
    }
    var base = 'http://' + req.headers.host;
    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<rss version="2.0"><channel>' +
      '<title>' + esc(title) + '</title>' +
      '<link>' + base + '/bangumi.html?key=' + rssMatch[1] + '&amp;id=' + encodeURIComponent(rssMatch[2]) + '</link>' +
      '<description>Ani - ' + esc(title) + ' 更新订阅</description>';
    list.forEach(function(r) {
      var link = r.magnet ? r.magnet : (r.torrent_url || '');
      xml += '<item><title>' + esc(r.title) + '</title><link>' + esc(link) + '</link>' +
        '<guid isPermaLink="false">' + esc(r.info_hash) + '</guid>' +
        '<description>' + esc(r.subtitle_group + ' ' + (r.size || '') + ' ' + r.source) + '</description>' +
        '<pubDate>' + (r.publish_time || '') + '</pubDate></item>';
    });
    xml += '</channel></rss>';
    res.writeHead(200, { 'Content-Type': 'application/rss+xml;charset=utf-8' });
    res.end(xml);
    return true;
  }

  // GET /api/data/:key/:season
  var getMatch = urlPath.match(/^\/api\/data\/(\d{6})\/(winter|spring|summer|fall)$/);
  if (getMatch && req.method === 'GET') {
    var key = getMatch[1], season = getMatch[2];
    var data = getSeasonData(key, season);
    if (data === null) { writeJSON(res, 404, { error: 'not found' }); return true; }
    writeJSON(res, 200, data);
    return true;
  }

  if (urlPath === '/api/list' && req.method === 'POST') {
    parseBody(req, function(body) {
      if (!body || !body.key || !body.season) { writeJSON(res, 400, { error:'missing key or season' }); return; }
      var data = getSeasonData(body.key, body.season);
      writeJSON(res, 200, data || []);
    });
    return true;
  }

  if (urlPath === '/api/delete' && req.method === 'POST') {
    parseBody(req, function(body) {
      if (!body || !body.key || !body.season || !body.id) { writeJSON(res, 400, { error:'missing fields' }); return; }
      var fp = path.join(root, 'data', body.key + '.js');
      fs.readFile(fp, 'utf-8', function(err, content) {
        if (err) { writeJSON(res, 404, { error:'file not found' }); return; }
        var data = parseDataFile(content);
        if (!data || !data[body.key] || !data[body.key][body.season]) { writeJSON(res, 404, { error:'season not found' }); return; }
        var arr = data[body.key][body.season];
        var filtered = arr.filter(function(item) { return item.id !== body.id; });
        if (filtered.length === arr.length) { writeJSON(res, 200, { success:true }); return; }
        var newContent = content.replace(
          /(_DATA\["[^"]+"\]\["[^"]+"\]\s*=\s*)(\[[\s\S]*?\])(;?)/,
          '$1' + JSON.stringify(filtered, null, '  ') + '$3'
        );
        fs.writeFile(fp, newContent, 'utf-8', function(err2) {
          if (err2) { writeJSON(res, 500, { error:'write error' }); return; }
          writeJSON(res, 200, { success:true });
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

var SEASON_KEYS = ['01', '04', '07', '10'];
var SEASON_NAMES = ['winter', 'spring', 'summer', 'fall'];
