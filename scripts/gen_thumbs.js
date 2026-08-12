const fs = require('fs');
const path = require('path');
const sharp = require('/opt/ani/node_modules/sharp');

const SRC = '/opt/ani/images';
const OUT = '/opt/ani/thumbs';
const W = 600, H = 800;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const seasons = fs.readdirSync(SRC).filter(d => fs.statSync(path.join(SRC, d)).isDirectory());
  let total = 0, done = 0, fail = 0;
  const errors = [];
  for (const season of seasons) {
    const sdir = path.join(SRC, season);
    const files = fs.readdirSync(sdir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
    total += files.length;
    const odir = path.join(OUT, season);
    fs.mkdirSync(odir, { recursive: true });
    for (const f of files) {
      const src = path.join(sdir, f);
      const out = path.join(odir, f.replace(/\.(jpg|jpeg|png|webp)$/i, '.webp'));
      try {
        await sharp(src, { failOn: 'none' })
          .resize(W, H, { fit: 'cover', kernel: 'lanczos3' })
          .webp({ quality: 82, effort: 4 })
          .toFile(out);
        done++;
      } catch (e) {
        fail++;
        errors.push(f + ': ' + e.message);
      }
    }
    console.log('season', season, 'done', done, 'fail', fail);
  }
  console.log('TOTAL', total, 'DONE', done, 'FAIL', fail);
  if (errors.length) console.log(errors.slice(0, 20).join('\n'));
}

main().catch(e => { console.error(e); process.exit(1); });