var https = require('https');
var fs = require('fs');
var path = require('path');

var ROOT = __dirname;
var BASE = 'https://api.bgm.tv';
var DAYS = ['周日','周一','周二','周三','周四','周五','周六'];

var MONTH_SEASONS = [
  { m: 1, season: 'winter', label: '冬季' },
  { m: 4, season: 'spring', label: '春季' },
  { m: 7, season: 'summer', label: '夏季' },
  { m: 10, season: 'fall', label: '秋季' }
];

var MONTH_KEYS = { winter: '01', spring: '04', summer: '07', fall: '10' };

function seasonDateRange(year, month) {
  // month is 1-indexed start month (1=winter, 4=spring, 7=summer, 10=fall)
  var endDate = new Date(year, month + 2, 0); // last day of month+2
  var endStr = endDate.getFullYear() + '-' + String(endDate.getMonth() + 1).padStart(2, '0') + '-' + String(endDate.getDate()).padStart(2, '0');
  return {
    start: year + '-' + String(month).padStart(2, '0') + '-01',
    end: endStr
  };
}

function searchSubjects(year, month, offset) {
  var range = seasonDateRange(year, month);
  var body = JSON.stringify({
    keyword: '',
    filter: {
      type: [2],
      air_date: ['>=' + range.start, '<=' + range.end]
    },
    sort: 'rank',
    page: 1
  });
  var qs = 'limit=20&offset=' + offset;

  return new Promise(function(ok, fail) {
    var req = https.request(BASE + '/v0/search/subjects?' + qs, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'AnimeCalendar/1.0 (bgm)' },
      timeout: 15000
    }, function(res) {
      var data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        try {
          var j = JSON.parse(data);
          if (j.title === 'Bad Request') {
            fail(new Error(j.description || 'Bad Request'));
            return;
          }
          ok(j);
        } catch(e) { fail(new Error('JSON parse: ' + e.message)); }
      });
    });
    req.on('error', fail);
    req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

function findInfobox(info, key) {
  if (!info || !Array.isArray(info)) return '';
  for (var i = 0; i < info.length; i++) {
    if (info[i].key === key) {
      var v = info[i].value;
      if (typeof v === 'string') return v;
      if (Array.isArray(v)) return v.map(function(x) { return x.v || x; }).filter(Boolean).join('、');
      return String(v);
    }
  }
  return '';
}

function formatContent(subj, infobox) {
  var lines = [];

  var platform = subj.platform || 'TV';
  var eps = subj.total_episodes || findInfobox(infobox, '话数');

  if (subj.date) {
    var d = new Date(subj.date);
    var wd = DAYS[d.getDay()];
    var md = (d.getMonth() + 1) + '/' + d.getDate();
    lines.push('播出：' + md + ' ' + wd + ' ' + (platform === 'WEB' ? '网络' : ''));
  }

  var studio = findInfobox(infobox, '动画制作');
  if (studio) lines.push('制作：' + studio);

  if (eps) lines.push('话数：' + eps);

  var orig = findInfobox(infobox, '原作');
  if (orig) lines.push('原作：' + orig);

  var director = findInfobox(infobox, '导演');
  if (director) lines.push('导演：' + director);

  var script = findInfobox(infobox, '脚本') || findInfobox(infobox, '编剧');
  if (script) lines.push('剧本：' + script);

  var music = findInfobox(infobox, '音乐');
  if (music) lines.push('音乐：' + music);

  var charDesign = findInfobox(infobox, '人物设定') || findInfobox(infobox, '人物原案') || findInfobox(infobox, '角色设计');
  if (charDesign) lines.push('人设：' + charDesign);

  var website = findInfobox(infobox, '官方网站');
  if (website) lines.push('官网：' + website);

  if (subj.rating && subj.rating.score) {
    lines.push('评分：' + subj.rating.score);
  }

  if (subj.summary) {
    var desc = subj.summary.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    lines.push('\n简介：' + desc.slice(0, 500));
  }

  if (subj.platform === 'WEB') { lines.push('类型：网络放送'); }
  else if (subj.platform === '剧场版') { lines.push('类型：剧场版'); }
  else if (subj.platform !== 'TV' && subj.platform) { lines.push('类型：' + subj.platform); }

  return lines.join('\n');
}

var WEEKDAY_MAP = {
  '星期一': '周一', '星期二': '周二', '星期三': '周三', '星期四': '周四', '星期五': '周五', '星期六': '周六', '星期日': '周日', '星期天': '周日',
  '周一': '周一', '周二': '周二', '周三': '周三', '周四': '周四', '周五': '周五', '周六': '周六', '周日': '周日',
  'Monday': '周一', 'Mon': '周一', 'Tuesday': '周二', 'Tue': '周二', 'Wednesday': '周三', 'Wed': '周三',
  'Thursday': '周四', 'Thu': '周四', 'Friday': '周五', 'Fri': '周五', 'Saturday': '周六', 'Sat': '周六', 'Sunday': '周日', 'Sun': '周日'
};

function normWeekday(wd) {
  return WEEKDAY_MAP[wd] || wd;
}

function buildEntry(subj) {
  var infobox = subj.infobox || [];

  var title = subj.name_cn || subj.name || '';
  var titleJp = (subj.name_cn ? subj.name : '') || '';

  var weekday = '';
  var airTime = '';
  if (subj.date) {
    var d = new Date(subj.date);
    weekday = DAYS[d.getDay()];
    var md = (d.getMonth() + 1) + '/' + d.getDate();
    airTime = md + ' ' + weekday;

    var wdKey = findInfobox(infobox, '放送星期');
    if (wdKey) {
      weekday = normWeekday(wdKey);
      if (weekday === '每天') weekday = DAYS[d.getDay()];
    }

    if (subj.platform === 'WEB') airTime += '网络';
    else if (subj.platform === '剧场版') airTime += '剧场版';
  }

  return {
    id: 'bgm' + subj.id,
    title: title,
    titleJp: titleJp || subj.name || '',
    weekday: weekday,
    airTime: airTime,
    content: formatContent(subj, infobox),
    coverImage: (subj.images && subj.images.large) || ''
  };
}

async function fetchSeasonData(year, month) {
  var allEntries = [];
  var offset = 0;

  while (true) {
    await sleep(300);
    try {
      var result = await searchSubjects(year, month, offset);
      var items = result.data || [];

      if (items.length === 0) break;

      items.forEach(function(subj) {
        allEntries.push(buildEntry(subj));
      });

      offset += items.length;
      if (offset >= result.total) break;

      console.log('  offset=' + offset + '/' + result.total + ' items=' + items.length);
    } catch (e) {
      console.log('  [ERROR] offset=' + offset + ': ' + e.message);
      break;
    }
  }

  return allEntries;
}

function writeDataFile(key, seasonKey, entries) {
  var fp = path.join(ROOT, 'data', key + '.js');
  var header = '// ' + key + ' data from Bangumi\n';
  header += '_DATA["' + key + '"] = _DATA["' + key + '"] || {};\n\n';
  header += '_DATA["' + key + '"]["' + seasonKey + '"] = ' + JSON.stringify(entries, null, '  ') + ';\n';
  fs.writeFileSync(fp, header, 'utf-8');
  console.log('  Written to data/' + key + '.js (' + entries.length + ' entries)');
}

function getExistingFilesSet() {
  var files = {};
  if (!fs.existsSync(path.join(ROOT, 'data'))) fs.mkdirSync(path.join(ROOT, 'data'));
  var names = fs.readdirSync(path.join(ROOT, 'data'));
  names.forEach(function(f) {
    if (f.endsWith('.js')) files[f.replace('.js', '')] = true;
  });
  return files;
}

async function main() {
  var args = process.argv.slice(2);
  var startYear = 2015, endYear = new Date().getFullYear();

  if (args.length >= 2) {
    startYear = parseInt(args[0]);
    endYear = parseInt(args[1]);
  } else if (args.length === 1) {
    startYear = parseInt(args[0]);
    endYear = startYear;
  }

  var force = process.argv.includes('--force');
  var existing = getExistingFilesSet();

  console.log('Fetching anime from Bangumi for ' + startYear + '-' + endYear + (force ? ' (force)' : '') + '\n');

  for (var y = startYear; y <= endYear; y++) {
    for (var si = 0; si < MONTH_SEASONS.length; si++) {
      var ms = MONTH_SEASONS[si];
      var key = y + MONTH_KEYS[ms.season];
      var fp = path.join(ROOT, 'data', key + '.js');

      if (!force && existing[key]) {
        console.log('Skip ' + key + ' (exists)');
        continue;
      }

      console.log('\n=== ' + key + ' (' + y + ' ' + ms.label + ') ===');
      var entries = await fetchSeasonData(y, ms.m);
      if (entries.length > 0) {
        writeDataFile(key, ms.season, entries);
      } else {
        console.log('  No entries found');
      }
      await sleep(500);
    }
  }

  console.log('\nDone!');
}

main().catch(function(e) {
  console.error('Fatal:', e.message);
  process.exit(1);
});
