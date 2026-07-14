var https = require('https');
var http = require('http');
var fs = require('fs');
var path = require('path');
var OpenCC = require('opencc-js');

var ROOT = __dirname;
var t2s = OpenCC.Converter({ from: 'hk', to: 'cn' });
var BASE = 'https://acgsecrets.hk/bangumi';

var DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
var MONTH_SEASONS = [
  { m: 1, season: 'winter', label: '冬季' },
  { m: 4, season: 'spring', label: '春季' },
  { m: 7, season: 'summer', label: '夏季' },
  { m: 10, season: 'fall', label: '秋季' }
];
var MONTH_KEYS = { winter: '01', spring: '04', summer: '07', fall: '10' };

var CONCURRENCY = 3;
var IMAGE_CONCURRENCY = 4;
var MAX_RETRIES = 3;
var TIMEOUT = 30000;
var SEASON_DELAY = 2000;

var ROLE_MAP = {
  '原作': '原作',
  '導演': '导演',
  '脚本': '剧本',
  '編劇': '剧本',
  '剧本': '剧本',
  '音楽': '音乐',
  '音樂': '音乐',
  '人物設定': '人设',
  '人物設計': '人设',
  '角色設計': '人设',
  '角色原案': '人设',
  '動畫製作': '制作',
  'アニメーション制作': '制作',
  'アニメーション製作': '制作',
  '話数': '话数',
  '話數': '话数',
  '系列構成': '系列构成'
};

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

function fetchHTML(url) {
  return new Promise(function(resolve, reject) {
    var req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      timeout: TIMEOUT
    }, function(res) {
      if (res.statusCode === 302 || res.statusCode === 301) {
        var loc = res.headers['location'];
        if (loc) { fetchHTML(loc).then(resolve).catch(reject); return; }
      }
      if (res.statusCode !== 200) {
        reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
        return;
      }
      res.setEncoding('utf-8');
      var data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() { resolve(data); });
    });
    req.on('error', reject);
    req.on('timeout', function() { req.destroy(); reject(new Error('timeout')); });
  });
}

function extractAnimeBlocks(html) {
  var blocks = [];
  var startTag = '<div class="clear-both acgs-anime-block';
  var pos = 0;
  while (true) {
    var si = html.indexOf(startTag, pos);
    if (si === -1) break;
    var si2 = html.indexOf(startTag, si + 10);
    if (si2 === -1) {
      blocks.push(html.substring(si));
      break;
    }
    blocks.push(html.substring(si, si2));
    pos = si2;
  }
  return blocks;
}

function rgx(s, pattern, def) {
  var m = pattern.exec(s);
  return m ? m[1].trim() : (def || '');
}

function stripTags(s) {
  return s.replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ').trim();
}

function extractPersonEntries(html, startIdx) {
  if (startIdx < 0) return [];
  var section = html.substring(startIdx);
  var entries = [];
  var regex = /<div class="anime_person(?:[^"]*)">\s*<span class="type">([\s\S]*?)<\/span>(?:\uFF1A|：)\s*<div class="entities-block">([\s\S]*?)<\/div>\s*<\/div>/g;
  var m;
  while ((m = regex.exec(section)) !== null) {
    if (entries.length > 40) break;
    var role = stripTags(m[1]).replace(/\s+/g, '');
    var namesHtml = m[2];
    var names = stripTags(namesHtml).replace(/\s+/g, '').replace(/、(?:\s*、)*/g, '、').replace(/^、+|、+$/g, '');
    if (!names) continue;
    entries.push({ role: role, names: names });
  }
  return entries;
}

function parseBlock(block) {
  var entry = {};

  entry.id = 'acgs-' + rgx(block, /acgs-bangumi-anime-id="([^"]+)"/);

  entry.title = rgx(block, /<h3 class="entity_localized_name">([\s\S]*?)<\/h3>/);
  entry.title = t2s(stripTags(entry.title));

  entry.titleJp = rgx(block, /<div class="notranslate entity_original_name">([\s\S]*?)<\/div>/);
  entry.titleJp = stripTags(entry.titleJp);

  entry.coverImage = rgx(block, /acgs-img-data-url="([^"]+)"/);

  var tsStr = rgx(block, /onairtime="(\d+)"/);
  if (tsStr) {
    var ts = parseInt(tsStr);
    var d = new Date(ts);
    if (!isNaN(d.getTime())) {
      entry.weekday = DAY_NAMES[d.getDay()];
      var month = d.getMonth() + 1;
      var day = d.getDate();
      entry.airTime = month + '/' + day + ' ' + entry.weekday;
    }
  }

  var timeStr = rgx(block, /<div class="time_today main_time">([^<]+)<\/div>/);
  if (!entry.airTime && timeStr) {
    var dm = timeStr.match(/(\d+)月(\d+)日/);
    if (dm) {
      entry.airTime = dm[1] + '/' + dm[2];
      if (entry.weekday) entry.airTime += ' ' + entry.weekday;
    }
  }

  var contentLines = [];

  if (timeStr) {
    contentLines.push('播出：' + timeStr.replace(/／/g, ' '));
  }

  var staffStartIdx = block.indexOf('製作人員');
  if (staffStartIdx > -1) {
    var staffEntries = extractPersonEntries(block, staffStartIdx);
    staffEntries.forEach(function(p) {
      var mapped = ROLE_MAP[p.role] || p.role;
      contentLines.push(mapped + '：' + p.names);
    });
  }

  var linkSectionMatch = block.match(/<a class="normal\s+hp"[^>]*href="([^"]+)"[^>]*>/);
  if (linkSectionMatch) {
    var website = linkSectionMatch[1];
    if (website && !website.includes('example.com')) {
      contentLines.push('官网：' + website);
    }
  }

  var storyMatch = block.match(/<div class="anime_story">([\s\S]*?)<\/div>/);
  if (storyMatch) {
    var storyText = stripTags(storyMatch[1]).trim();
    if (storyText) {
      contentLines.push('');
      contentLines.push('简介：' + storyText.slice(0, 800));
    }
  }

  entry.content = t2s(contentLines.join('\n'));

  return entry;
}

function writeDataFile(key, seasonKey, entries) {
  var dir = path.join(ROOT, 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  var fp = path.join(dir, key + '.js');
  var header = '// ' + key + ' data from acgsecrets\n';
  header += '_DATA["' + key + '"] = _DATA["' + key + '"] || {};\n\n';
  header += '_DATA["' + key + '"]["' + seasonKey + '"] = ' + JSON.stringify(entries, null, '  ') + ';\n';
  fs.writeFileSync(fp, header, 'utf-8');
  console.log('  Written to data/' + key + '.js (' + entries.length + ' entries)');
}

function imgName(t) {
  return t.replace(/:/g, '\uFF1A').replace(/[/]/g, '%2F').replace(/[\?\*"<>\|]/g, '');
}

function downloadImage(url, dest) {
  return new Promise(function(ok, fail) {
    var proto = url.startsWith('https') ? https : http;
    var req = proto.get(url, { timeout: TIMEOUT, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, function(res) {
      if (res.statusCode === 302 || res.statusCode === 301) {
        var loc = res.headers['location'];
        if (loc) { downloadImage(loc, dest).then(ok).catch(fail); return; }
      }
      if (res.statusCode !== 200) {
        fail(new Error('HTTP ' + res.statusCode));
        return;
      }
      var tmp = dest + '.tmp';
      var ws = fs.createWriteStream(tmp);
      res.pipe(ws);
      ws.on('finish', function() {
        ws.close(function() {
          if (fs.existsSync(tmp)) {
            fs.renameSync(tmp, dest);
          }
          ok();
        });
      });
      ws.on('error', function(e) {
        try { fs.unlinkSync(tmp); } catch (ex) {}
        fail(e);
      });
    });
    req.on('error', fail);
    req.on('timeout', function() { req.destroy(); fail(new Error('timeout')); });
  });
}

function downloadWithRetry(url, dest, retries) {
  return downloadImage(url, dest).catch(function(e) {
    if (retries > 0) {
      return sleep(1000).then(function() {
        return downloadWithRetry(url, dest, retries - 1);
      });
    }
    throw e;
  });
}

async function fetchSeasonData(key) {
  var url = BASE + '/' + key + '/';
  console.log('  Fetching ' + url);

  var html;
  try {
    html = await fetchHTML(url);
  } catch (e) {
    console.log('  [ERROR] Failed to fetch ' + key + ': ' + e.message);
    return [];
  }

  var blocks = extractAnimeBlocks(html);
  console.log('  Found ' + blocks.length + ' anime blocks');

  if (blocks.length === 0) return [];

  var entries = [];
  for (var i = 0; i < blocks.length; i++) {
    try {
      var entry = parseBlock(blocks[i]);
      if (entry.title) {
        entries.push(entry);
      }
    } catch (e) {
      console.log('  [ERROR] Parsing block ' + i + ': ' + e.message);
    }
  }

  return entries;
}

async function downloadAllImages(entries, key) {
  var seasonDir = path.join(ROOT, 'images', key);
  if (!fs.existsSync(seasonDir)) fs.mkdirSync(seasonDir, { recursive: true });

  var queue = [];
  entries.forEach(function(entry) {
    if (!entry.coverImage || !entry.title) return;
    var fn = imgName(entry.title) + '.jpg';
    var dest = path.join(seasonDir, fn);
    if (fs.existsSync(dest)) return;
    queue.push({ url: entry.coverImage, dest: dest, title: entry.title });
  });

  if (queue.length === 0) return 0;

  console.log('  Images to download: ' + queue.length);

  var done = 0;
  var failed = 0;
  var idx = 0;

  return new Promise(function(resolve) {
    var running = 0;
    function next() {
      while (idx < queue.length && running < IMAGE_CONCURRENCY) {
        var item = queue[idx++];
        running++;
        downloadWithRetry(item.url, item.dest, MAX_RETRIES)
          .then(function() {
            done++; running--;
            process.stdout.write('\r    Images: ' + done + '/' + queue.length + ' done, ' + failed + ' failed');
            if (done + failed >= queue.length) {
              console.log('');
              resolve(done);
            } else { next(); }
          })
          .catch(function() {
            failed++; running--;
            process.stdout.write('\r    Images: ' + done + '/' + queue.length + ' done, ' + failed + ' failed');
            if (done + failed >= queue.length) {
              console.log('');
              resolve(done);
            } else { next(); }
          });
      }
    }
    next();
  });
}

async function main() {
  var args = process.argv.slice(2);
  var startYear = 2016, endYear = new Date().getFullYear();

  if (args.length >= 2) {
    startYear = parseInt(args[0]);
    endYear = parseInt(args[1]);
  } else if (args.length === 1) {
    startYear = parseInt(args[0]);
    endYear = startYear;
  }

  var dataOnly = process.argv.includes('--data-only');
  var imagesOnly = process.argv.includes('--images-only');
  var force = process.argv.includes('--force');
  var noImages = process.argv.includes('--no-images');

  console.log('Scraping anime from acgsecrets.hk for ' + startYear + '-' + endYear + '\n');

  for (var y = startYear; y <= endYear; y++) {
    for (var si = 0; si < MONTH_SEASONS.length; si++) {
      var ms = MONTH_SEASONS[si];
      var key = y + MONTH_KEYS[ms.season];
      var fp = path.join(ROOT, 'data', key + '.js');

      var exists = fs.existsSync(fp);

      if (imagesOnly) {
        if (!exists) { console.log('Skip ' + key + ' (no data file)'); continue; }
        var _DATA = {};
        try { eval(fs.readFileSync(fp, 'utf-8')); } catch (e) { console.log('Skip ' + key + ' (parse error)'); continue; }
        var seasonData = _DATA[key] ? _DATA[key][ms.season] : null;
        if (!seasonData || seasonData.length === 0) { console.log('Skip ' + key + ' (empty data)'); continue; }
        console.log('\n=== ' + key + ' (' + y + ' ' + ms.label + ') - Images ===');
        var dlCount = await downloadAllImages(seasonData, key);
        console.log('  Done: ' + dlCount + ' new images');
        await sleep(500);
        continue;
      }

      if (!force && exists) {
        console.log('Skip ' + key + ' (exists, use --force)');
        continue;
      }

      console.log('\n=== ' + key + ' (' + y + ' ' + ms.label + ') ===');

      var entries = await fetchSeasonData(key);
      if (entries.length > 0) {
        writeDataFile(key, ms.season, entries);
        if (!dataOnly && !noImages) {
          var dlCount = await downloadAllImages(entries, key);
          console.log('  Downloaded ' + dlCount + ' images');
        }
      } else {
        console.log('  No entries for ' + key);
      }

      await sleep(SEASON_DELAY);
    }
  }

  console.log('\nAll done!');
}

main().catch(function(e) {
  console.error('\nFatal:', e.message);
  process.exit(1);
});
