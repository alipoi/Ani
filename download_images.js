var https = require('https');
var http = require('http');
var fs = require('fs');
var path = require('path');

var ROOT = __dirname;
var CONCURRENCY = 6;
var TIMEOUT = 15000;
var MAX_RETRIES = 3;

var _DATA = {};
var dataDir = path.join(ROOT, 'data');
var imageDir = path.join(ROOT, 'images');
var files = fs.readdirSync(dataDir).filter(function(f) { return f.endsWith('.js'); });

function imgName(t) {
  return t.replace(/:/g, '\uFF1A').replace(/[/]/g, '%2F').replace(/[\?\*"<>\|]/g, '');
}

function download(url, dest) {
  return new Promise(function(ok, fail) {
    var proto = url.startsWith('https') ? https : http;
    var req = proto.get(url, { timeout: TIMEOUT, headers: { 'User-Agent': 'Mozilla/5.0 Ani/1.0' } }, function(res) {
      if (res.statusCode === 302 || res.statusCode === 301) {
        var loc = res.headers['location'];
        if (loc) { download(loc, dest).then(ok).catch(fail); return; }
      }
      if (res.statusCode !== 200) { fail(new Error('HTTP ' + res.statusCode)); return; }
      var tmp = dest + '.tmp';
      var ws = fs.createWriteStream(tmp);
      res.pipe(ws);
      ws.on('finish', function() {
        ws.close(function() {
          fs.renameSync(tmp, dest);
          ok();
        });
      });
      ws.on('error', function(e) { fs.unlink(tmp, function(){}); fail(e); });
    });
    req.on('error', fail);
    req.on('timeout', function() { req.destroy(); fail(new Error('timeout')); });
  });
}

function downloadWithRetry(url, dest, retries) {
  return download(url, dest).catch(function(e) {
    if (retries > 0) {
      return new Promise(function(r) { setTimeout(r, 1000); }).then(function() {
        return downloadWithRetry(url, dest, retries - 1);
      });
    }
    throw e;
  });
}

var queue = [];
var total = 0;

files.forEach(function(f) {
  var key = f.replace('.js', '');
  try { eval(fs.readFileSync(path.join(dataDir, f), 'utf-8')); } catch(e) { return; }
  var d = _DATA[key];
  if (!d) return;
  Object.keys(d).forEach(function(season) {
    var entries = d[season];
    var seasonDir = path.join(imageDir, key);
    if (!fs.existsSync(seasonDir)) fs.mkdirSync(seasonDir, { recursive: true });
    entries.forEach(function(entry) {
      if (!entry.coverImage || !entry.title) return;
      var fn = imgName(entry.title) + '.jpg';
      var dest = path.join(seasonDir, fn);
      if (fs.existsSync(dest)) return;
      queue.push({ url: entry.coverImage, dest: dest });
    });
    total += entries.length;
  });
});

console.log('Total data entries: ' + total);
console.log('Images to download: ' + queue.length);
console.log('Concurrency: ' + CONCURRENCY + '\n');

var done = 0;
var failed = 0;
var idx = 0;

function next() {
  while (idx < queue.length && running < CONCURRENCY) {
    var item = queue[idx++];
    running++;
    downloadWithRetry(item.url, item.dest, MAX_RETRIES)
      .then(function() { done++; running--; printProgress(); next(); })
      .catch(function(e) { failed++; running--; printProgress(); });
  }
}

var running = 0;
var startTime = Date.now();

function printProgress() {
  var elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  var pct = queue.length ? ((done / queue.length) * 100).toFixed(1) : '100';
  process.stdout.write('\r  ' + done + '/' + queue.length + ' (' + pct + '%) done, ' + failed + ' failed, ' + elapsed + 's   ');
}

console.log('Starting download...');
next();

// Idle check
var checkInterval = setInterval(function() {
  if (done + failed >= queue.length) {
    clearInterval(checkInterval);
    setTimeout(function() {
      console.log('\n\nDone! ' + done + ' downloaded, ' + failed + ' failed, ' + (Date.now() - startTime)/1000 + 's');
      process.exit(0);
    }, 500);
  }
}, 200);
