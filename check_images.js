var fs = require('fs');
var vm = require('vm');

var content = fs.readFileSync('data/202604.js', 'utf-8');
var sandbox = { _DATA: {} };
vm.runInNewContext(content, sandbox);
var entries = sandbox._DATA['202604'].spring;

var imgDir = 'images/202604';
var files = {};
if (fs.existsSync(imgDir)) {
  fs.readdirSync(imgDir).forEach(function(f) {
    if (f.endsWith('.jpg')) files[f] = true;
  });
}

var missing = [];
entries.forEach(function(e) {
  var t = e.title.replace(/:/g, '\uFF1A').replace(/[\?\*"<>\|]/g, '');
  var expectedFile = t + '.jpg';
  if (!files[expectedFile]) {
    missing.push(e.title);
  }
});

console.log('Total entries: ' + entries.length);
console.log('Total image files: ' + Object.keys(files).length);
console.log('Mismatched: ' + missing.length);
if (missing.length > 0) {
  missing.forEach(function(m) { console.log('  ' + m); });
}
