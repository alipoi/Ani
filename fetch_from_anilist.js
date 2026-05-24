const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const API = 'https://graphql.anilist.co';
const DELAY = 700;
const THRESHOLD = 60;

const QUERY = `query($s:String){Media(search:$s,type:ANIME){id siteUrl coverImage{extraLarge large}title{romaji english native}synonyms}}`;

function sanitizeName(s) {
  return s.replace(/[\n\r]/g, '').replace(/[:]/g, '\uFF1A').replace(/[\/]/g, '%2F').replace(/[\?\*"<>\|]/g, '');
}

function jpegDimensions(fp) {
  try {
    var fd = fs.openSync(fp, 'r');
    var buf = Buffer.alloc(65536);
    var bytesRead = fs.readSync(fd, buf, 0, 65536, 0);
    fs.closeSync(fd);
    if (bytesRead < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
    var i = 2;
    while (i < bytesRead - 1) {
      if (buf[i] !== 0xFF) return null;
      while (buf[i] === 0xFF) i++;
      var marker = buf[i];
      i++;
      if (marker === 0x00 || marker === 0xFF) return null;
      if (marker === 0xD9 || marker === 0xDA) return null;
      if (bytesRead < i + 1) return null;
      var len = (buf[i] << 8) | buf[i + 1];
      if (len < 2) return null;
      if ((marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC5 && marker <= 0xCB) || (marker >= 0xCD && marker <= 0xCF)) {
        if (bytesRead < i + 2 + len) return null;
        var h = (buf[i + 5] << 8) | buf[i + 6];
        var w = (buf[i + 7] << 8) | buf[i + 8];
        return { w: w, h: h };
      }
      i += 2 + len;
    }
    return null;
  } catch(e) { return null; }
}

function norm(s) { return (s || '').replace(/\s+/g, '').toLowerCase(); }

function lcs(a, b) {
  var m = a.length, n = b.length, dp = [], max = 0;
  for (var i = 0; i <= m; i++) dp[i] = [];
  for (var i = 0; i < m; i++)
    for (var j = 0; j < n; j++)
      if (a[i] === b[j]) {
        dp[i+1][j+1] = (dp[i][j] || 0) + 1;
        if (dp[i+1][j+1] > max) max = dp[i+1][j+1];
      } else dp[i+1][j+1] = 0;
  return max;
}

function score(a, b) {
  var an = norm(a), bn = norm(b);
  if (!an || !bn) return 0;
  if (an === bn) return 100;
  if (an.indexOf(bn) >= 0 || bn.indexOf(an) >= 0) return 80;
  var l = lcs(an, bn), min = Math.min(an.length, bn.length);
  return (l / min) * 100;
}

function bestScore(title, titleJp, media) {
  if (!media || !media.title) return 0;
  var names = [media.title.romaji, media.title.english, media.title.native];
  if (media.synonyms) names = names.concat(media.synonyms);
  var s1 = 0, s2 = 0;
  names.forEach(function(n) {
    if (!n) return;
    var sc = score(title, n);
    if (sc > s1) s1 = sc;
    if (titleJp) {
      sc = score(titleJp, n);
      if (sc > s2) s2 = sc;
    }
  });
  var best = Math.max(s1, s2);
  if ((titleJp || title) && best >= THRESHOLD) {
    var checkStr = (titleJp || '') + ' ' + (title || '');
    var hasSeasonMark = /第?\d+[期部]/.test(checkStr) || /Part\.?\s*\d+/i.test(checkStr) || /\d+\s*(st|nd|rd|th)?\s*[Ss]eason/.test(checkStr) || /[Ss]eason\s*\d+/.test(checkStr) || /第?\d+[期部]/.test(checkStr);
    if (hasSeasonMark) {
      var nameHasSeasonMark = names.some(function(n) { return n && (/第?\d+[期部]/.test(n) || /Part\.?\s*\d+/i.test(n) || /\d+\s*(st|nd|rd|th)?\s*[Ss]eason/.test(n) || /[Ss]eason\s*\d+/.test(n)); });
      if (!nameHasSeasonMark) best = Math.min(best, THRESHOLD - 1);
    }
  }
  return best;
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

function graphql(vars) {
  return new Promise(function(ok, fail) {
    var body = JSON.stringify({ query: QUERY, variables: vars });
    var req = https.request(API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'AnimeSchedule/1.0'
      },
      timeout: 15000
    }, function(res) {
      var data = '';
      if (res.statusCode === 429) {
        var retryAfter = parseInt(res.headers['retry-after']) || 30;
        console.log('  [RATE LIMITED] waiting ' + retryAfter + 's...');
        setTimeout(function() { graphql(vars).then(ok).catch(fail); }, retryAfter * 1000);
        return;
      }
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        try { ok(JSON.parse(data)); } catch(e) { fail(new Error('JSON parse error: ' + e.message)); }
      });
    });
    req.on('error', fail);
    req.write(body);
    req.end();
  });
}

function download(url, fp) {
  return new Promise(function(ok, fail) {
    if (url.indexOf('//') === 0) url = 'https:' + url;
    var isHttps = url.indexOf('https') === 0;
    var mod = isHttps ? https : http;
    var rest = url.replace(/^https?:\/\//, '');
    var hostname = rest.split('/')[0];
    var urlPath = '/' + rest.substring(hostname.length + 1);
    mod.get({ hostname: hostname, path: urlPath, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 }, function(res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location, fp).then(ok).catch(fail);
        return;
      }
      if (res.statusCode !== 200) { fail(new Error('HTTP ' + res.statusCode)); return; }
      var ws = fs.createWriteStream(fp);
      res.pipe(ws);
      ws.on('finish', function() {
        ws.close();
        var size = fs.statSync(fp).size;
      if (size < 1000) { try { fs.unlinkSync(fp); } catch(e) {} fail(new Error('too small: ' + size)); }
      else {
        var dims = jpegDimensions(fp);
        if (dims && (dims.w < 100 || dims.h < 100)) {
          try { fs.unlinkSync(fp); } catch(e) {}
          fail(new Error('tiny dimensions: ' + dims.w + 'x' + dims.h));
        } else {
          ok(size);
        }
      }
      });
      ws.on('error', function(e) { try { fs.unlinkSync(fp); } catch(e2) {} fail(e); });
    }).on('error', fail);
  });
}

function loadSeason(key) {
  var fp = path.join(ROOT, 'data', key + '.js');
  if (!fs.existsSync(fp)) return null;
  var content = fs.readFileSync(fp, 'utf-8');
  var seasons = ['winter', 'spring', 'summer', 'fall'];
  for (var i = 0; i < seasons.length; i++) {
    var re = new RegExp('_DATA\\["' + key + '"\\]\\["' + seasons[i] + '"\\]\\s*=\\s*(\\[[\\s\\S]*?\\]);');
    var m = content.match(re);
    if (m) return { key: key, season: seasons[i], entries: JSON.parse(m[1]) };
  }
  return null;
}

function existingImages(key) {
  var dir = path.join(ROOT, 'images', key);
  var map = {};
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir).forEach(function(f) {
      if (f.endsWith('.jpg')) map[sanitizeName(path.basename(f, '.jpg'))] = true;
    });
  }
  return map;
}

function simplifyTitle(t) {
  return t.replace(/[　\s]+/g, '').replace(/第\d+期/g, '').replace(/第\d+部/g, '').replace(/Part\.\d+/gi, '').replace(/Season\s*\d+/gi, '').replace(/\([^)]*\)/g, '').replace(/（[^）]*）/g, '').replace(/[\[\]【】]/g, '').trim();
}

function buildTitleJpLookup() {
  var lookup = {};
  var files = fs.readdirSync(path.join(ROOT, 'data')).filter(function(f) { return /^\d{6}\.js$/.test(f); });
  files.forEach(function(f) {
    var key = path.basename(f, '.js');
    var data = loadSeason(key);
    if (data) data.entries.forEach(function(e) {
      if (e.title && e.titleJp) {
        lookup[e.title] = e.titleJp;
        lookup[simplifyTitle(e.title)] = e.titleJp;
        lookup[sanitizeName(e.title)] = e.titleJp;
      }
    });
  });
  return lookup;
}

var _jpLookup = null;

function findJpFallback(title) {
  if (!_jpLookup) _jpLookup = buildTitleJpLookup();
  return _jpLookup[title] || _jpLookup[simplifyTitle(title)] || null;
}

function buildQueries(e) {
  var q = [];
  if (e.title) q.push(e.title);
  if (e.titleJp && e.titleJp !== e.title) {
    q.push(e.titleJp);
    var jpSimplified = simplifyTitle(e.titleJp);
    if (jpSimplified !== e.titleJp && jpSimplified.length > 2 && q.indexOf(jpSimplified) < 0) q.push(jpSimplified);
    var engJp = e.titleJp.match(/[a-zA-Z][a-zA-Z0-9.\s'-]+[a-zA-Z0-9)]/g);
    if (engJp) engJp.forEach(function(w) {
      w = w.trim().replace(/[()]/g, '').trim();
      if (w.length > 3 && q.indexOf(w) < 0) q.push(w);
    });
  }
  var jpFallback = findJpFallback(e.title);
  if (jpFallback && q.indexOf(jpFallback) < 0) q.push(jpFallback);
  var simplified = simplifyTitle(e.title);
  if (simplified !== e.title && q.indexOf(simplified) < 0) q.push(simplified);
  var eng = e.title.match(/[a-zA-Z][a-zA-Z0-9.\s'-]+[a-zA-Z0-9)]/g);
  if (eng) eng.forEach(function(w) {
    w = w.trim().replace(/[()]/g, '').trim();
    if (w.length > 3 && q.indexOf(w) < 0) q.push(w);
  });
  if (e.content) {
    var keywords = e.content.match(/(?:原作[：:]\s*([^\n]+)|作者[：:]\s*([^\n]+))/);
    if (keywords) {
      var kw = (keywords[1] || keywords[2] || '').replace(/[\/\\].*$/, '').trim();
      if (kw && kw.length > 1 && q.indexOf(kw) < 0) q.push(kw);
    }
    var urlMatch = e.content.match(/https?:\/\/([^.]+)\./);
    if (urlMatch) {
      var domain = urlMatch[1].replace(/[-]/g, ' ');
      if (domain.length > 3 && q.indexOf(domain) < 0) q.push(domain);
      domain.split(/[\s-]+/).forEach(function(part) {
        if (part.length > 3 && q.indexOf(part) < 0) q.push(part);
      });
    }
  }
  return q;
}

async function processSeason(key) {
  var data = loadSeason(key);
  if (!data) { console.log('[' + key + '] No data found'); return; }
  var existing = existingImages(key);
  var missing = data.entries.filter(function(e) {
    return e.title && !existing[e.title] && !existing[sanitizeName(e.title)];
  });
  if (!missing.length) { console.log('[' + key + '] All ' + data.entries.length + ' images present'); return; }
  console.log('[' + key + '] ' + missing.length + '/' + data.entries.length + ' missing');
  var okCount = 0, failCount = 0;
  for (var i = 0; i < missing.length; i++) {
    var e = missing[i];
    var effectiveJp = e.titleJp || findJpFallback(e.title) || null;
    var queries = buildQueries(e);
    var bestMedia = null, bestSc = 0;
    for (var q = 0; q < queries.length; q++) {
      try {
        await sleep(DELAY);
        var result = await graphql({ s: queries[q] });
        if (result.errors) continue;
        if (result.data && result.data.Media) {
          var sc = bestScore(e.title, effectiveJp, result.data.Media);
          if (sc < THRESHOLD && queries[q]) {
            var media = result.data.Media;
            var qNorm = norm(queries[q]);
            // Boost if query is substantial (>=6 chars) and either:
            // 1. matches any media title/synonym, OR
            // 2. comes from the entry's URL domain (strong signal)
            var shouldBoost = qNorm && qNorm.length >= 6 && qNorm.length <= 40;
            if (shouldBoost) {
              var boost = false;
              var tNames = [media.title.romaji, media.title.english, media.title.native];
              if (media.synonyms) tNames = tNames.concat(media.synonyms);
              for (var ni = 0; ni < tNames.length; ni++) {
                if (!tNames[ni]) continue;
                var nNorm = norm(tNames[ni]);
                if (nNorm.indexOf(qNorm) >= 0 || qNorm.indexOf(nNorm) >= 0) {
                  boost = true; break;
                }
              }
              // Query from content URL domain is a strong signal (official website)
              if (!boost && e.content) {
                var urlMatch = e.content.match(/https?:\/\/([^.]+)\./);
                if (urlMatch) {
                  var domain = norm(urlMatch[1]);
                  if (domain && domain.length >= 6 && (qNorm === domain || qNorm.indexOf(domain) >= 0 || domain.indexOf(qNorm) >= 0)) {
                    boost = true;
                  }
                }
              }
              if (boost) {
                sc = Math.max(sc, 80);
              }
            }
          }
          if (sc > bestSc) { bestSc = sc; bestMedia = result.data.Media; }
          if (sc >= 100) break;
        }
      } catch(err) {}
    }

    if (!bestMedia || bestSc < THRESHOLD) {
      if (effectiveJp) {
        var baseJp = simplifyTitle(effectiveJp);
        if (baseJp !== effectiveJp && baseJp.length > 2) {
          try {
            await sleep(DELAY);
            var baseResult = await graphql({ s: baseJp });
            if (!baseResult.errors && baseResult.data && baseResult.data.Media) {
              var base = baseResult.data.Media;
              var baseTitles = [base.title.romaji, base.title.english, base.title.native].filter(function(n) { return n && n.length > 2; });
              var sNum = null, pNum = null;
              var jt = effectiveJp;
              var sm = jt.match(/第(\d+)期/); if (sm) sNum = parseInt(sm[1]);
              var pm = jt.match(/第(\d+)部/); if (pm) pNum = parseInt(pm[1]);
              if (!sNum) { sm = jt.match(/Part\.?\s*(\d+)/i); if (sm) pNum = parseInt(sm[1]); }
              if (!sNum) { sm = jt.match(/Season\s*(\d+)/i); if (sm) sNum = parseInt(sm[1]); }
              var ord = function(n) { if (n === 1) return '1st'; if (n === 2) return '2nd'; if (n === 3) return '3rd'; return n + 'th'; };
              for (var b = 0; b < baseTitles.length; b++) {
                var suffixes = [];
                if (sNum && pNum) {
                  suffixes.push(' ' + ord(sNum) + ' Season Part ' + pNum);
                  suffixes.push(' Season ' + sNum + ' Part ' + pNum);
                  suffixes.push(' ' + sNum + 'nd Season Part ' + pNum);
                } else if (sNum) {
                  suffixes.push(' ' + ord(sNum) + ' Season');
                  suffixes.push(' Season ' + sNum);
                  suffixes.push(' ' + sNum + 'nd Season');
                } else if (pNum) {
                  suffixes.push(' Part ' + pNum);
                }
                for (var s = 0; s < suffixes.length; s++) {
                  var newQ = baseTitles[b] + suffixes[s];
                  await sleep(DELAY);
                  var res2 = await graphql({ s: newQ });
                  if (!res2.errors && res2.data && res2.data.Media) {
                    var sc2 = bestScore(e.title, effectiveJp, res2.data.Media);
                    if (sc2 > bestSc) { bestSc = sc2; bestMedia = res2.data.Media; }
                  }
                }
              }
            }
          } catch(err) {}
        }
      }
    }

    if (!bestMedia || bestSc < THRESHOLD) {
      console.log('  [SKIP] ' + e.title + ' (best score: ' + (bestSc ? bestSc.toFixed(0) : 'N/A') + ')');
      failCount++;
      continue;
    }
    var imgUrl = bestMedia.coverImage.extraLarge || bestMedia.coverImage.large;
    if (!imgUrl) { console.log('  [NO IMG] ' + e.title); failCount++; continue; }
    var dir = path.join(ROOT, 'images', key);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    var fp = path.join(dir, sanitizeName(e.title) + '.jpg');
    if (fs.existsSync(fp)) { okCount++; continue; }
    try {
      var size = await download(imgUrl, fp);
      var matchName = bestMedia.title.romaji || bestMedia.title.english || bestMedia.title.native || '';
      console.log('  [OK] ' + e.title + ' (' + size + ' bytes) matched: ' + matchName);
      okCount++;
    } catch(err) {
      console.log('  [FAIL] ' + e.title + ' (' + err.message + ')');
      failCount++;
    }
  }
  console.log('[' + key + '] Done: ' + okCount + ' ok, ' + failCount + ' failed');
}

async function main() {
  var args = process.argv.slice(2);
  if (args.length) {
    for (var i = 0; i < args.length; i++) await processSeason(args[i]);
  } else {
    var files = fs.readdirSync(path.join(ROOT, 'data')).filter(function(f) { return /^\d{6}\.js$/.test(f); }).sort();
    for (var i = 0; i < files.length; i++) {
      var key = path.basename(files[i], '.js');
      console.log('\n=== ' + key + ' ===');
      await processSeason(key);
    }
  }
  console.log('\nAll done!');
}

main().catch(function(e) { console.error('Fatal:', e.message); process.exit(1); });
