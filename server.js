var http = require('http');
var fs = require('fs');
var path = require('path');

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

http.createServer(function(req, res) {
  if (handleAPI(req, res)) return;
  var urlPath = req.url.split('?')[0]
    .replace(/%2F/gi, '\x00SLASH\x00');
  urlPath = decodeURIComponent(urlPath)
    .replace(/\x00SLASH\x00/g, '%2F')
    .replace(/:/g, '\uFF1A');
  var filePath = path.join(root, urlPath === '/' ? 'index.html' : urlPath);

  console.log(req.url, '->', filePath);

  fs.stat(filePath, function(err, stat) {
    if (!err && stat.isFile()) {
      return serve(res, filePath);
    }

    // Check directory + index.html
    var dirIndex = path.join(filePath, 'index.html');
    fs.stat(dirIndex, function(err2) {
      if (!err2) { return serve(res, dirIndex); }

      // SPA: serve root index.html for unknown paths
      serve(res, path.join(root, 'index.html'));
    });
  });
}).listen(3000, function() {
  console.log('http://127.0.0.1:3000');
});
function serve(res, fp) {
  var ext = path.extname(fp).toLowerCase();
  res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
  fs.createReadStream(fp).pipe(res);
}

function parseBody(req, cb) {
  var body = '';
  req.on('data', function(c) { body += c; });
  req.on('end', function() {
    try { cb(JSON.parse(body)); } catch(e) { cb(null); }
  });
}

function handleAPI(req, res) {
  var urlPath = decodeURI(req.url.split('?')[0]);

  if (urlPath === '/api/list' && req.method === 'POST') {
    parseBody(req, function(body) {
      if (!body || !body.key || !body.season) { writeJSON(res, 400, { error:'missing key or season' }); return; }
      var fp = path.join(root, 'data', body.key + '.js');
      fs.readFile(fp, 'utf-8', function(err, content) {
        if (err) { writeJSON(res, 200, []); return; }
        var re = new RegExp('_DATA\\["' + body.key + '"\\]\\["' + body.season + '"\\]\\s*=\\s*(\\[[\\s\\S]*?\\]);');
        var m = content.match(re);
        if (!m) { writeJSON(res, 200, []); return; }
        try { writeJSON(res, 200, JSON.parse(m[1])); } catch(e) { writeJSON(res, 200, []); }
      });
    });
    return true;
  }

  if (urlPath === '/api/delete' && req.method === 'POST') {
    parseBody(req, function(body) {
      if (!body || !body.key || !body.season || !body.id) { writeJSON(res, 400, { error:'missing fields' }); return; }
      var fp = path.join(root, 'data', body.key + '.js');
      fs.readFile(fp, 'utf-8', function(err, content) {
        if (err) { writeJSON(res, 404, { error:'file not found' }); return; }
        var re = new RegExp('(_DATA\\["' + body.key + '"\\]\\["' + body.season + '"\\]\\s*=\\s*)(\\[[\\s\\S]*?\\])(;)?');
        var m = content.match(re);
        if (!m) { writeJSON(res, 404, { error:'season not found' }); return; }
        try {
          var arr = JSON.parse(m[2]);
          var filtered = arr.filter(function(item) { return item.id !== body.id; });
          if (filtered.length === arr.length) { writeJSON(res, 200, { success:true }); return; }
          var newContent = content.replace(m[0], m[1] + JSON.stringify(filtered, null, '  ') + (m[3]||''));
          fs.writeFile(fp, newContent, 'utf-8', function(err2) {
            if (err2) { writeJSON(res, 500, { error:'write error' }); return; }
            writeJSON(res, 200, { success:true });
          });
        } catch(e) { writeJSON(res, 500, { error:'parse error' }); }
      });
    });
    return true;
  }

  return false;
}

function writeJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}
