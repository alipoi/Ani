// 一次性清理库内标题/字幕组字段中的零宽字符 (U+200B 等)，
// 修复这类字符导致的 [组名] 标签无法被前端识别为链接的问题
var Database = require('better-sqlite3');
var db = require('../db');

var ZWS = /[\u200B\u200C\u200D\uFEFF\u2060\u00AD]/g;

var d = new Database(db.DB_PATH);
d.pragma('journal_mode = WAL');
d.pragma('busy_timeout = 5000');

var rows = d.prepare('SELECT info_hash, title, subtitle_group FROM resources').all();
var up = d.prepare('UPDATE resources SET title = @title, subtitle_group = @subtitle_group WHERE info_hash = @info_hash');
var dirty = rows
  .map(function(r) {
    return {
      info_hash: r.info_hash,
      title: String(r.title || '').replace(ZWS, ''),
      subtitle_group: String(r.subtitle_group || '').replace(ZWS, '')
    };
  })
  .filter(function(r, i) {
    return r.title !== rows[i].title || r.subtitle_group !== rows[i].subtitle_group;
  });

var tx = d.transaction(function(list) {
  list.forEach(function(r) { up.run(r); });
});
tx(dirty);

console.log('rows scanned: ' + rows.length + ', cleaned: ' + dirty.length);
if (dirty.length) {
  dirty.slice(0, 20).forEach(function(r) { console.log('  ' + r.info_hash + ' -> ' + r.title); });
}
d.close();
