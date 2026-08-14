const https = require('https')
const fs = require('fs')

const OUT = '/opt/ani/anime_index.json'
const TMP = '/opt/ani/anime_index.tmp.json'
const BGMAPI = 'https://bgmapi.072139.xyz'
const UA = 'Nekomi-AniIndex/1.0 (anime calendar site)'
const LIMIT = 50
const PACE = parseInt(process.env.PACE, 10) || 420
const MIN_YEAR = 1900
const MAX_YEAR = 2026
const SKIP_FILE = '/opt/ani/index_skip.json'

const meta = []
let totalRows = 0

function getJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode))
      let s = ''
      res.setEncoding('utf8')
      res.on('data', (d) => { s += d })
      res.on('end', () => { try { resolve(JSON.parse(s)) } catch (e) { reject(e) } })
    })
    req.on('error', reject)
    req.setTimeout(20000, () => req.destroy(new Error('timeout')))
  })
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

function delay() {
  return sleep(PACE + Math.floor(Math.random() * 150))
}

function imgPath(images) {
  if (!images || !images.large) return ''
  return 'https://bgmimg.072139.xyz' + images.large.replace(/^https?:\/\/[^/]+/, '')
}

function jstr(s) { return String(s || '').replace(/\|/g, ' ').trim() }

function flush() {
  const tmp = TMP + '.' + Math.floor(Math.random() * 1e6)
  fs.writeFileSync(tmp, JSON.stringify(meta))
  if (fs.existsSync(TMP)) fs.unlinkSync(TMP)
  fs.renameSync(tmp, TMP)
  console.log('flushed', meta.length, 'rows ->', TMP)
}

function finalize() {
  let arr = JSON.parse(fs.readFileSync(TMP, 'utf8'))
  const seen = new Set()
  arr = arr.filter((x) => { if (seen.has(x[0])) return false; seen.add(x[0]); return true })
  arr.sort((a, b) => a[0] - b[0])
  fs.writeFileSync(OUT, JSON.stringify(arr))
  try { fs.unlinkSync(TMP) } catch (e) {}
  try { fs.unlinkSync(SKIP_FILE) } catch (e) {}
  console.log('FINAL rows =', arr.length, 'saved', OUT, (fs.statSync(OUT).size / 1048576).toFixed(1), 'MB')
}

async function main() {
  const skip = {}
  if (fs.existsSync(SKIP_FILE)) {
    try { Object.assign(skip, JSON.parse(fs.readFileSync(SKIP_FILE, 'utf8'))) } catch (e) {}
  }
  let years = []
  if (process.argv[2] && process.argv[3]) {
    for (let y = +process.argv[2]; y <= +process.argv[3]; y++) years.push(y)
  } else {
    for (let y = MIN_YEAR; y <= MAX_YEAR; y++) years.push(y)
  }
  if (skip.years) years = years.filter((y) => skip.years.indexOf(y) < 0)

  for (const y of years) {
    let offset = 0
    let total = null
    const bad = []
    const doneOffsets = (skip.offsets && skip.offsets[y]) || []
    for (;;) {
      if (doneOffsets.indexOf(offset) >= 0) { offset += LIMIT; continue }
      let j = null
      try {
        j = await getJSON(BGMAPI + '/v0/subjects?type=2&year=' + y + '&sort=date&limit=' + LIMIT + '&offset=' + offset)
      } catch (e) {
        bad.push(offset)
        if (bad.length > 3) {
          console.log('year', y, 'giving up at offset', offset, '(bad x3)')
          break
        }
        await sleep(2500)
        continue
      }
      bad.length = 0
      total = j.total
      for (const it of j.data || []) {
        if (it.nsfw) continue
        meta.push([
          it.id,
          jstr(it.name_cn || it.name),
          jstr(it.name),
          it.date || '',
          it.platform || '',
          it.rating && it.rating.score ? Number(it.rating.score) : 0,
          it.total_episodes || it.eps || 0,
          it.collection ? (it.collection.collect || 0) + (it.collection.on_hold || 0) + (it.collection.doing || 0) + (it.collection.wish || 0) : 0,
          imgPath(it.images)
        ])
      }
      totalRows += (j.data || []).length
      doneOffsets.push(offset)
      if (skip.offsets) skip.offsets[y] = doneOffsets
      offset += LIMIT
      if (offset >= total) break
      await delay()
    }
    skip.years = skip.years || []
    skip.years.push(y)
    if (skip.offsets) delete skip.offsets[y]
    fs.writeFileSync(SKIP_FILE, JSON.stringify(skip))
    console.log('year', y, 'done, cumulative rows', meta.length, 'total', total)
    if (meta.length > 30000) flush()
  }
  flush()
  console.log('ALL YEARS DONE, rows =', totalRows)
  finalize()
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })