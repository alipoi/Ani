var https = require('https');
var http = require('http');
var fs = require('fs');
var path = require('path');

var season = process.argv[2];
if (!season) { console.log('Usage: node fetch_images.js <season_key>'); process.exit(1); }

var imgDir = path.join('images', season);
if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

var dataFile = path.join('data', season + '.js');
if (!fs.existsSync(dataFile)) { console.log('Data file not found: ' + dataFile); process.exit(1); }
var content = fs.readFileSync(dataFile, 'utf-8');
var titles = [];
var re = /"title":"([^"]+)"/g;
var m;
while ((m = re.exec(content)) !== null) titles.push(m[1]);

var existing = {};
if (fs.existsSync(imgDir)) {
  fs.readdirSync(imgDir).filter(function(f) { return f.endsWith('.jpg'); }).forEach(function(f) {
    try {
      var decoded = decodeURIComponent(path.basename(f, '.jpg'));
      existing[decoded] = true;
      existing[sanitizeName(decoded)] = true;
    } catch(e) {}
  });
}

var missing = titles.filter(function(t) { return !existing[t] && !existing[sanitizeName(t)]; });
console.log('Season ' + season + ': ' + titles.length + ' entries, ' + Object.keys(existing).length + ' images exist, ' + missing.length + ' missing');
if (missing.length === 0) { console.log('All images already present!'); process.exit(0); }

var pageUrl = 'https://yuc.wiki/' + season + '/';
console.log('Fetching ' + pageUrl + ' ...');

https.get(pageUrl, function(res) {
  if (res.statusCode !== 200) {
    console.log('HTTP ' + res.statusCode);
    process.exit(1);
  }
  var html = '';
  res.setEncoding('utf-8');
  res.on('data', function(c) { html += c; });
  res.on('end', function() {
    parseAndDownload(html);
  });
}).on('error', function(e) {
  console.log('Fetch error: ' + e.message);
  process.exit(1);
});

function norm(s) {
  return s.replace(/\s+/g, '');
}

function longestCommonSubstring(a, b) {
  var m = a.length, n = b.length;
  var dp = [], maxLen = 0, i, j;
  for (i = 0; i <= m; i++) dp[i] = [];
  for (i = 0; i < m; i++) {
    for (j = 0; j < n; j++) {
      if (a[i] === b[j]) {
        dp[i+1][j+1] = (dp[i][j] || 0) + 1;
        if (dp[i+1][j+1] > maxLen) maxLen = dp[i+1][j+1];
      } else {
        dp[i+1][j+1] = 0;
      }
    }
  }
  return maxLen;
}

function longestCommonSubsequence(a, b) {
  var m = a.length, n = b.length;
  var dp = [];
  for (var i = 0; i <= m; i++) dp[i] = [];
  for (var i = 0; i <= m; i++) {
    for (var j = 0; j <= n; j++) {
      if (i === 0 || j === 0) dp[i][j] = 0;
      else if (a[i-1] === b[j-1]) dp[i][j] = dp[i-1][j-1] + 1;
      else dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]);
    }
  }
  return dp[m][n];
}

function sanitizeName(s) {
  return s.replace(/[:]/g, '\uFF1A').replace(/[\/]/g, '%2F').replace(/[\?\*"<>\|]/g, '');
}

function isFuzzyMatch(dataTitle, summaryTitle) {
  var dn = norm(dataTitle).toLowerCase();
  var sn = norm(summaryTitle).toLowerCase();
  if (dn === sn) return true;
  if (dn.indexOf(sn) >= 0 || sn.indexOf(dn) >= 0) return true;
  var lcs = longestCommonSubstring(dn, sn);
  var minLen = Math.min(dn.length, sn.length);
  return lcs >= minLen * 0.6;
}

function parseAndDownload(html) {
  // Strategy A: float:left cards (main summary table)
  var cardMap = {};
  var reA = /<div style="float:left">\s*<div class="div_date_*\d*">[\s\S]*?<img[^>]*data-src="([^"]+)"[^>]*>[\s\S]*?<\/div>\s*<div>[\s\S]*?<td[^>]*class="date_title_*\d*"[^>]*>([\s\S]*?)<\/td>/g;
  var m;
  while ((m = reA.exec(html)) !== null) {
    var raw = m[2];
    var clean = raw.replace(/<br\s*\/?>/gi, '').replace(/<[^>]+>/g, '').replace(/\s+/g, '').trim();
    if (clean) {
      cardMap[norm(clean).toLowerCase()] = { title: clean, url: m[1] };
    }
  }

  // Strategy B: width:120px tables (网络放送 entries like 迪士尼扭曲仙境)
  // Note: poster image is NOT inside the table; it's in a preceding <div class="div_date_">
  var lastTableEnd = 0;
  var tableRe = /<table[\s\S]*?<\/table>/g;
  var mB;
  while ((mB = tableRe.exec(html)) !== null) {
    var tbl = mB[0];
    if (tbl.indexOf('width="120px"') < 0) { lastTableEnd = mB.index + tbl.length; continue; }
    var tdMatch = tbl.match(/<td[^>]*class="date_title_*\d*"[^>]*>([\s\S]*?)<\/td>/);
    if (!tdMatch) { lastTableEnd = mB.index + tbl.length; continue; }
    var rawB = tdMatch[1].replace(/<br\s*\/?>/gi, '').replace(/<[^>]+>/g, '').replace(/\s+/g, '').trim();
    if (!rawB) { lastTableEnd = mB.index + tbl.length; continue; }

    // Poster image is in the HTML between the previous table's end and this table's start
    // (inside a preceding <div class="div_date_"> for network/web entries)
    var between = html.substring(lastTableEnd, mB.index);
    var posterRe = /<img[^>]*data-src="([^"]*new_dyn[^"]*)"[^>]*>/g;
    var posterMatch = posterRe.exec(between);
    lastTableEnd = mB.index + tbl.length;

    var imgUrl = null;
    if (posterMatch) {
      imgUrl = posterMatch[1];
    } else {
      // Fallback: look inside the table for an hdslb image
      var innerRe = /<img[^>]*data-src="([^"]*hdslb[^"]+)"[^>]*>/g;
      var innerMatch = innerRe.exec(tbl);
      if (innerMatch) imgUrl = innerMatch[1];
    }

    if (imgUrl) {
      var nk = norm(rawB).toLowerCase();
      if (!cardMap[nk]) {
        cardMap[nk] = { title: rawB, url: imgUrl };
      }
    }
  }

  // Strategy C: title_main_r entries with last hdslb image before them
  // For: 涩谷♥八公 第4期, 我的英雄学院 第8期, plus title_cn_r2/title_cn_r6
  var reC = /<p class="title_cn_r\d*">([\s\S]*?)<\/p>/g;
  while ((m = reC.exec(html)) !== null) {
    var t = m[1].replace(/<br\s*\/?>/gi, '').replace(/<[^>]+>/g, '').replace(/\s+/g, '').trim();
    var tn = norm(t).toLowerCase();
    if (cardMap[tn]) continue;
    var before = html.substring(0, m.index);
    var lastImg = before.lastIndexOf('data-src="');
    if (lastImg >= 0) {
      var urlStart = lastImg + 10;
      var urlEnd = before.indexOf('"', urlStart);
      var url = before.substring(urlStart, urlEnd);
      if (url.indexOf('hdslb.com') >= 0) {
        cardMap[tn] = { title: t, url: url };
      }
    }
  }

  // Match missing titles against all card entries
  function scoreMatch(dn, sn) {
    if (dn === sn) return 100;
    if (dn.indexOf(sn) >= 0 || sn.indexOf(dn) >= 0) return 80;
    var lcss = longestCommonSubstring(dn, sn);
    var lcsq = longestCommonSubsequence(dn, sn);
    var minLen = Math.min(dn.length, sn.length);
    if (minLen > 0) return Math.max(lcss / minLen, lcsq / minLen) * 100;
    return 0;
  }

  var missing = titles.filter(function(t) { return !existing[t] && !existing[sanitizeName(t)]; });
  var entries = [];
  var used = {};

  missing.forEach(function(dataTitle) {
    var dn = norm(dataTitle).toLowerCase();
    var bestKey = null, bestScore = 0;
    for (var sk in cardMap) {
      if (used[sk]) continue;
      var score = scoreMatch(dn, sk);
      if (score > bestScore) { bestScore = score; bestKey = sk; }
    }
    if (bestKey && bestScore >= 60) {
      used[bestKey] = true;
      entries.push({ title: dataTitle, url: cardMap[bestKey].url });
    }
  });

  console.log('Found ' + entries.length + ' matching entries via fuzzy matching');
  if (entries.length < missing.length) {
    console.log('  (still unmatched: ' + (missing.length - entries.length) + ')');
    missing.forEach(function(t) {
      var matched = entries.some(function(e) { return e.title === t; });
      if (!matched) console.log('    ' + t);
    });
  }

  downloadAll(entries, 0);
}

function normalizeUrl(base, location) {
  if (location.indexOf('http://') === 0 || location.indexOf('https://') === 0) return location;
  var baseMatch = base.match(/^(https?:\/\/[^\/]+)/);
  if (!baseMatch) return location;
  if (location.indexOf('/') === 0) return baseMatch[1] + location;
  var basePath = base.replace(/\?.*$/, '').replace(/[^\/]*$/, '');
  return basePath + location;
}

function downloadOne(item, idx, redirectCount) {
  if (redirectCount === undefined) redirectCount = 0;
  if (redirectCount > 5) {
    console.log('  [TOO MANY REDIRECTS] ' + item.title);
    downloadAll(queue, idx + 1);
    return;
  }
  var filePath = path.join(imgDir, sanitizeName(item.title) + '.jpg');
  if (fs.existsSync(filePath)) {
    console.log('  [SKIP] ' + item.title);
    downloadAll(queue, idx + 1);
    return;
  }

  var url = item.url;
  // Handle protocol-relative URLs
  if (url.indexOf('//') === 0) {
    url = (url.indexOf('hdslb.com') >= 0 ? 'https:' : 'http:') + url;
  }
  // CDN requires HTTPS
  if (url.indexOf('hdslb.com') >= 0 && url.indexOf('https') !== 0) {
    url = url.replace(/^http:/, 'https:');
  }
  var isHttps = url.indexOf('https') === 0;
  var rest = url.replace(/^https?:\/\//, '');
  var hostname = rest.split('/')[0];
  var urlPath = rest.substring(hostname.length) || '/';

  var options = {
    hostname: hostname,
    path: urlPath,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  };
  var mod = isHttps ? https : http;

  var req = mod.get(options, function(res) {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      item.url = normalizeUrl(url, res.headers.location);
      console.log('  [REDIRECT] ' + item.title + ' -> ' + item.url);
      downloadOne(item, idx, redirectCount + 1);
      return;
    }
    if (res.statusCode === 200 || res.statusCode === 304) {
      var fileStream = fs.createWriteStream(filePath);
      res.pipe(fileStream);
      fileStream.on('finish', function() {
        fileStream.close();
        var size = fs.statSync(filePath).size;
        if (size < 1000) {
          console.log('  [TOO SMALL] ' + item.title + ' (' + size + ' bytes)');
          try { fs.unlinkSync(filePath); } catch(e2) {}
        } else {
          console.log('  [OK] ' + item.title + ' (' + size + ' bytes)');
        }
        downloadAll(queue, idx + 1);
      });
      fileStream.on('error', function(e) {
        console.log('  [FAIL] ' + item.title + ' (write: ' + e.message + ')');
        try { fs.unlinkSync(filePath); } catch(e2) {}
        downloadAll(queue, idx + 1);
      });
    } else {
      console.log('  [' + res.statusCode + '] ' + item.title);
      downloadAll(queue, idx + 1);
    }
  });
  req.on('error', function(e) {
    console.log('  [FAIL] ' + item.title + ' (req: ' + e.message + ')');
    downloadAll(queue, idx + 1);
  });
  req.setTimeout(15000, function() { req.destroy(); });
}

function downloadAll(q, idx) {
  queue = q;
  if (idx >= queue.length) {
    console.log('All downloads complete!');
    return;
  }
  downloadOne(queue[idx], idx);
}
var queue;
