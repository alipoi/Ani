var http = require('http');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

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
}).listen(3000, function() {
  console.log('http://127.0.0.1:3000');
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
