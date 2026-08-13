import { reactive } from 'vue'

const BGMAPI = 'https://bgmapi.072139.xyz'
const STORE = 'bgmeta_v1'
const TTL_CURRENT = 6 * 3600000
const TTL_OLD = 30 * 86400000
const TTL_MISS = 3600000
const MAX_CONC = 4
const START_GAP = 160
const MAX_TRY = 3
const MONTH = { winter: '01', spring: '04', summer: '07', fall: '10' }

export const bgMeta = reactive(new Map())

const inflight = new Map()
let calMap = null
let calAt = 0

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

const CNUM = '一二三四五六七八九十百千'

function norm(s) {
  return String(s || '')
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0))
    .replace(new RegExp('[' + CNUM + ']', 'g'), (c) => CNUM.indexOf(c) + 1)
    .replace(/[\s\u3000・~〜ー—\-–_~!！?？:：;；,，.。、'"“”‘’（）()【】\[\]「」『』《》〈〉◆◇※]/g, '')
    .toLowerCase()
}

function quarterOf(dateStr) {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  const m = d.getMonth() + 1
  return { y: d.getFullYear(), sn: m <= 3 ? 'winter' : m <= 6 ? 'spring' : m <= 9 ? 'summer' : 'fall' }
}

const QOFF = { winter: 0, spring: 1, summer: 2, fall: 3 }
function gap(a, b) {
  return (a.y - b.y) * 4 + QOFF[a.sn] - QOFF[b.sn]
}

function seasonKeyOfNow() {
  const d = new Date()
  const m = d.getMonth() + 1
  const sn = m <= 3 ? 'winter' : m <= 6 ? 'spring' : m <= 9 ? 'summer' : 'fall'
  return String(d.getFullYear()) + MONTH[sn]
}

function isCurrent(sk) { return sk === seasonKeyOfNow() }

function statusOf(dateStr, total) {
  if (!dateStr) return ''
  const start = new Date(dateStr + 'T00:00:00Z').getTime()
  if (isNaN(start)) return ''
  const now = Date.now()
  if (now < start) return 'upcoming'
  if (!total) return ''
  const released = Math.floor((now - start) / 604800000) + 1
  return released >= total ? 'done' : 'airing'
}

function readCache(key, sk) {
  try {
    const raw = localStorage.getItem(STORE + ':' + key)
    if (!raw) return null
    const rec = JSON.parse(raw)
    const ttl = rec.meta ? (isCurrent(sk) ? TTL_CURRENT : TTL_OLD) : TTL_MISS
    if (Date.now() - rec.ts < ttl) return rec
    localStorage.removeItem(STORE + ':' + key)
  } catch (e) {}
  return null
}

function writeCache(key, meta) {
  try { localStorage.setItem(STORE + ':' + key, JSON.stringify({ ts: Date.now(), meta })) } catch (e) {}
}

function fetchJSON(url, ms) {
  const ctl = new AbortController()
  const to = setTimeout(() => ctl.abort(), ms || 15000)
  return fetch(url, { signal: ctl.signal })
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() })
    .finally(() => clearTimeout(to))
}

async function calendarMap() {
  if (calMap && Date.now() - calAt < 1800000) return calMap
  const j = await fetchJSON(BGMAPI + '/calendar')
  const map = new Map()
  ;(Array.isArray(j) ? j : []).forEach((day) =>
    (day.items || []).forEach((it) => {
      const cn = norm(it.name_cn)
      if (cn) map.set(cn, it.id)
      const jp = norm(it.name)
      if (jp) map.set(jp, it.id)
    }))
  calMap = map
  calAt = Date.now()
  return map
}

function stripSeason(s) {
  return String(s || '').replace(/[~〜～\-–—]+\s*$/g, '').replace(/\s*[（(][^）)]*[）)]\s*$/g, '')
    .replace(/\s*(?:第[\d一二三四五六七八九十百千]+(?:季|期|话|部|弹)|season\s*\d+|s\d+)\s*$/i, '')
}

function keywords(title, titleJp) {
  const out = []
  const push = (s) => { if (s && s.length >= 2 && out.indexOf(s) < 0) out.push(s) }
  push(title)
  push(stripSeason(title))
  push(String(title).replace(/[～~〜\-–—!！?？,，.。、'":：;；（）()【】\[\]「」『』《》〈〉・\s]/g, ''))
  for (let len = 12; len >= 5; len -= 2) push(String(title).substring(0, len))
  push(stripSeason(titleJp))
  return out
}

function isSubseq(t, s) {
  if (!t || !s) return false
  let i = 0
  for (let j = 0; j < s.length && i < t.length; j++) if (t[i] === s[j]) i++
  return i === t.length
}

function scoreCandidate(c, a) {
  const cn = norm(c.name_cn), jp = norm(c.name)
  const t = norm(a.title), tj = norm(a.titleJp)
  const cn2 = norm(stripSeason(c.name_cn)), jp2 = norm(stripSeason(c.name))
  const t2 = norm(stripSeason(a.title)), tj2 = norm(stripSeason(a.titleJp))
  if (cn && t && cn === t) return 100
  if (jp && t && jp === t) return 98
  if (jp && tj && jp === tj) return 95
  if (cn && tj && cn === tj) return 92
  if (t2 && cn2 && cn2 === t2) return 84
  if (tj2 && jp2 && jp2 === tj2) return 82
  if (t && cn) {
    if (cn.includes(t) || t.includes(cn)) return Math.min(80, 60 + Math.min(cn.length, t.length) * 2)
    if (t.length >= 6 && isSubseq(t, cn)) return 62
  }
  if (tj && jp && tj.length >= 4) {
    if (jp.includes(tj) || tj.includes(jp)) return Math.min(75, 55 + Math.min(jp.length, tj.length))
    if (tj.length >= 6 && isSubseq(tj, jp)) return 58
  }
  return 0
}

function cleanTags(list) {
  const out = []
  const seen = new Set()
  ;(list || []).forEach((tg) => {
    const t = String(tg).trim()
    if (!t || seen.has(t) || t.length === 1) return
    if (/^\d{4}/.test(t) || /^[A-Za-z0-9_\-.]{5,}$/.test(t) || t.length > 14) return
    seen.add(t)
    if (out.length < 6) out.push(t)
  })
  return out
}

function computeMeta(s) {
  const q = quarterOf(s.date)
  const total = s.total_episodes || s.eps || 0
  const tags = s.meta_tags && s.meta_tags.length
    ? s.meta_tags
    : (s.tags || []).slice().sort((x, y) => (y.count || 0) - (x.count || 0)).map((x) => x.name)
  return {
    status: statusOf(s.date, total),
    platform: s.platform || '',
    quarter: q ? { y: q.y, sn: q.sn } : null,
    eps: total,
    score: s.rating && s.rating.score ? Number(s.rating.score.toFixed(1)) : 0,
    tags: cleanTags(tags)
  }
}

async function resolveMeta(a, sk) {
  const m = /^(\d{4})(\d{2})$/.exec(sk)
  const target = m ? quarterOf(m[1] + '-' + m[2] + '-01') : null
  if (isCurrent(sk)) {
    try {
      const map = await calendarMap()
      const id = map.get(norm(a.title)) || map.get(norm(a.titleJp))
      if (id) {
        const s = await fetchJSON(BGMAPI + '/v0/subjects/' + id)
        if (s && s.id) return computeMeta(s)
      }
    } catch (e) {}
  }
  const kws = keywords(a.title, a.titleJp)
  for (const kw of kws) {
    let list = []
    try {
      const j = await fetchJSON(BGMAPI + '/search/subject/' + encodeURIComponent(kw) + '?type=2&responseGroup=small&max_results=10')
      list = (j && j.list) ? j.list : []
    } catch (e) { continue }
    if (!list.length) continue
    const scored = list
      .map((c) => ({ c, s: scoreCandidate(c, a) }))
      .filter((x) => x.s >= 50)
      .sort((x, y) => y.s - x.s)
    if (!scored.length) continue
    let tried = 0
    for (const cand of scored) {
      if (tried >= MAX_TRY) break
      tried++
      let s = null
      try { s = await fetchJSON(BGMAPI + '/v0/subjects/' + cand.c.id) } catch (e) { continue }
      if (!s || !s.id) continue
      if (cand.s >= 85) return computeMeta(s)
      const q = quarterOf(s.date)
      if (q && target && Math.abs(gap(q, target)) <= 1) return computeMeta(s)
    }
  }
  return null
}

export async function loadMetaFor(a, sk) {
  const key = sk + ':' + a.id
  if (bgMeta.has(key)) return bgMeta.get(key)
  const running = inflight.get(key)
  if (running) return running
  const cached = readCache(key, sk)
  if (cached) {
    if (cached.meta) bgMeta.set(key, cached.meta)
    return cached.meta
  }
  const p = resolveMeta(a, sk)
    .then((meta) => {
      if (meta) bgMeta.set(key, meta)
      writeCache(key, meta)
      return meta
    })
    .catch(() => { writeCache(key, null); return null })
    .finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

export function searchMeta(x) {
  return computeMeta({
    date: x.date || '',
    total_episodes: x.eps || 0,
    platform: x.platform || '',
    rating: x.score ? { score: x.score } : null,
    meta_tags: null,
    tags: (x.tags || []).map((t) => ({ name: t, count: 0 }))
  })
}

export function loadSeasonMeta(items, sk) {
  const queue = items.slice()
  let cursor = 0
  const worker = async () => {
    while (cursor < queue.length) {
      const a = queue[cursor++]
      await sleep(START_GAP)
      if (bgMeta.has(sk + ':' + a.id)) continue
      loadMetaFor(a, sk)
    }
  }
  for (let i = 0; i < MAX_CONC; i++) worker()
}
