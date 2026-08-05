var fs = require('fs');
var path = require('path');
var Database = require('better-sqlite3');

var ROOT = __dirname;
var DB_PATH = path.join(ROOT, 'data', 'resources.db');

var db = null;

function init() {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.exec('CREATE TABLE IF NOT EXISTS resources (' +
    '  info_hash   TEXT PRIMARY KEY,' +
    '  title       TEXT NOT NULL,' +
    '  bangumi_id  TEXT,' +
    '  season_key  TEXT,' +
    '  episode     TEXT,' +
    '  subtitle_group TEXT,' +
    '  size        TEXT,' +
    '  magnet      TEXT,' +
    '  torrent_url TEXT,' +
    '  source      TEXT,' +
    '  publish_time TEXT,' +
    '  added_at    TEXT' +
    ')');
  db.exec('CREATE INDEX IF NOT EXISTS idx_res_bangumi ON resources(bangumi_id, season_key)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_res_time ON resources(publish_time)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_res_group ON resources(subtitle_group)');
  db.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)');
  addColumn('description', 'TEXT');
  addColumn('images', 'TEXT');
  addColumn('detail_fetched', 'INTEGER');
  return db;
}

function addColumn(name, type) {
  var cols = db.prepare('PRAGMA table_info(resources)').all().map(function(c) { return c.name; });
  if (cols.indexOf(name) === -1) {
    db.exec('ALTER TABLE resources ADD COLUMN ' + name + ' ' + type);
  }
}

function insert(item) {
  init();
  return db.prepare('INSERT OR IGNORE INTO resources ' +
    '(info_hash, title, bangumi_id, season_key, episode, subtitle_group, size, magnet, torrent_url, source, publish_time, added_at) ' +
    'VALUES (@info_hash, @title, @bangumi_id, @season_key, @episode, @subtitle_group, @size, @magnet, @torrent_url, @source, @publish_time, @added_at)')
    .run(item);
}

function count() {
  init();
  return db.prepare('SELECT COUNT(*) AS c FROM resources').get().c;
}

function latest(opts) {
  init();
  opts = opts || {};
  var page = Math.max(1, opts.page || 1);
  var size = Math.min(100, Math.max(1, opts.size || 30));
  var where = [];
  var params = {};
  if (opts.group) {
    where.push('subtitle_group = @group');
    params.group = opts.group;
  }
  if (opts.groupPrefix) {
    where.push('subtitle_group LIKE @groupPrefix');
    params.groupPrefix = opts.groupPrefix + '%';
  }
  if (opts.season) {
    where.push('season_key = @season');
    params.season = opts.season;
  }
  if (opts.q) {
    where.push('title LIKE @q');
    params.q = '%' + opts.q + '%';
  }
  var whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  var rows;
  if (opts.q) {
    // 无索引 LIKE 需全表扫：先只读排序列生成候选集（避免载入 description/images 大字段），再按主键取全列
    var total = db.prepare('SELECT COUNT(*) AS c FROM resources ' + whereSql).get(params).c;
    var ids = db.prepare('SELECT info_hash FROM resources ' + whereSql +
      ' ORDER BY publish_time DESC, added_at DESC LIMIT @limit OFFSET @offset')
      .all(Object.assign({}, params, { limit: size, offset: (page - 1) * size }))
      .map(function(r) { return r.info_hash; });
    if (!ids.length) {
      rows = [];
    } else {
      var ph = ids.map(function() { return '?'; }).join(',');
      var stmt = db.prepare('SELECT * FROM resources WHERE info_hash IN (' + ph + ')');
      rows = stmt.all.apply(stmt, ids);
      var order = {};
      ids.forEach(function(h, i) { order[h] = i; });
      rows.sort(function(a, b) { return order[a.info_hash] - order[b.info_hash]; });
    }
  } else {
    var total = db.prepare('SELECT COUNT(*) AS c FROM resources ' + whereSql).get(params).c;
    rows = db.prepare('SELECT * FROM resources ' + whereSql +
      ' ORDER BY publish_time DESC, added_at DESC LIMIT @limit OFFSET @offset')
      .all(Object.assign({}, params, { limit: size, offset: (page - 1) * size }));
  }
  return { list: rows, total: total, page: page, size: size };
}

function byBangumi(bangumiId, seasonKey) {
  init();
  var rows = db.prepare('SELECT * FROM resources WHERE bangumi_id = @id AND season_key = @s ORDER BY publish_time DESC')
    .all({ id: bangumiId, s: seasonKey });
  if (!rows.length) {
    rows = db.prepare('SELECT * FROM resources WHERE bangumi_id = @id ORDER BY publish_time DESC')
      .all({ id: bangumiId });
  }
  return rows;
}

function groups(q) {
  init();
  var rows;
  if (q) {
    rows = db.prepare("SELECT subtitle_group AS name, COUNT(*) AS count FROM resources WHERE subtitle_group != '' AND subtitle_group LIKE @q GROUP BY subtitle_group ORDER BY count DESC LIMIT 100")
      .all({ q: '%' + q + '%' });
  } else {
    rows = db.prepare("SELECT subtitle_group AS name, COUNT(*) AS count FROM resources WHERE subtitle_group != '' GROUP BY subtitle_group ORDER BY count DESC LIMIT 200").all();
  }
  return rows;
}

function search(q, limit) {
  init();
  limit = limit || 50;
  return db.prepare('SELECT * FROM resources WHERE title LIKE @q ORDER BY publish_time DESC LIMIT @limit')
    .all({ q: '%' + q + '%', limit: limit });
}

function byHash(hash) {
  init();
  return db.prepare('SELECT * FROM resources WHERE info_hash = @h').get({ h: hash });
}

function updateBangumi(hash, bangumiId, seasonKey) {
  init();
  return db.prepare('UPDATE resources SET bangumi_id = @b, season_key = @s WHERE info_hash = @h')
    .run({ h: hash, b: bangumiId, s: seasonKey });
}

function updateDetails(hash, description, images) {
  init();
  return db.prepare('UPDATE resources SET description = @d, images = @i, detail_fetched = 1 WHERE info_hash = @h')
    .run({ h: hash, d: description, i: images });
}

function noDetails(limit, before) {
  init();
  limit = limit || 100;
  if (before) {
    return db.prepare('SELECT info_hash, title, publish_time FROM resources WHERE detail_fetched IS NULL AND publish_time IS NOT NULL AND publish_time < @b ORDER BY publish_time DESC LIMIT @limit')
      .all({ limit: limit, b: before });
  }
  return db.prepare('SELECT info_hash, title, publish_time FROM resources WHERE detail_fetched IS NULL ORDER BY publish_time DESC LIMIT @limit')
    .all({ limit: limit });
}

function hasDetails(hash) {
  init();
  var row = db.prepare('SELECT detail_fetched FROM resources WHERE info_hash = @h').get({ h: hash });
  return row && row.detail_fetched === 1;
}

function exists(hash) {
  init();
  return !!db.prepare('SELECT 1 FROM resources WHERE info_hash = @h').get({ h: hash });
}

function metaGet(k) {
  init();
  var row = db.prepare('SELECT v FROM meta WHERE k = @k').get({ k: k });
  return row ? row.v : null;
}

function metaSet(k, v) {
  init();
  db.prepare('INSERT OR REPLACE INTO meta (k, v) VALUES (@k, @v)').run({ k: k, v: String(v) });
}

function countUnmatched() {
  init();
  return db.prepare('SELECT COUNT(*) AS c FROM resources WHERE bangumi_id IS NULL').get().c;
}

function hashesLike(pattern) {
  init();
  return db.prepare('SELECT info_hash, title FROM resources WHERE bangumi_id IS NULL AND title LIKE @p').all({ p: pattern });
}

function allUnmatched() {
  init();
  return db.prepare('SELECT info_hash, title FROM resources WHERE bangumi_id IS NULL').all();
}

function allRows() {
  init();
  return db.prepare('SELECT info_hash, title, episode FROM resources').all();
}

function byHashes(hashes) {
  init();
  var out = [];
  for (var i = 0; i < hashes.length; i += 200) {
    var slice = hashes.slice(i, i + 200);
    var ph = slice.map(function() { return '?'; }).join(',');
    var stmt = db.prepare('SELECT info_hash, title FROM resources WHERE info_hash IN (' + ph + ')');
    out = out.concat(stmt.all.apply(stmt, slice));
  }
  return out;
}

function updateEpisode(hash, ep) {
  init();
  return db.prepare('UPDATE resources SET episode = @e WHERE info_hash = @h').run({ h: hash, e: ep });
}

function updateBangumiMany(items) {
  init();
  var up = db.prepare('UPDATE resources SET bangumi_id = @b, season_key = @s WHERE info_hash = @h');
  var tx = db.transaction(function(list) {
    list.forEach(function(it) { up.run({ h: it.hash, b: it.id, s: it.key }); });
  });
  tx(items);
}

function resetBangumi() {
  init();
  return db.prepare('UPDATE resources SET bangumi_id = NULL, season_key = NULL').run();
}

function close() {
  if (db) {
    try { db.close(); } catch (e) {}
    db = null;
  }
}

module.exports = {
  init: init,
  close: close,
  insert: insert,
  count: count,
  latest: latest,
  byBangumi: byBangumi,
  groups: groups,
  search: search,
  byHash: byHash,
  updateBangumi: updateBangumi,
  updateDetails: updateDetails,
  noDetails: noDetails,
  hasDetails: hasDetails,
  exists: exists,
  metaGet: metaGet,
  metaSet: metaSet,
  countUnmatched: countUnmatched,
  hashesLike: hashesLike,
  allUnmatched: allUnmatched,
  allRows: allRows,
  byHashes: byHashes,
  updateEpisode: updateEpisode,
  updateBangumiMany: updateBangumiMany,
  resetBangumi: resetBangumi,
  DB_PATH: DB_PATH
};
