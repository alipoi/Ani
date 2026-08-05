export function esc(s) {
  if (!s && s !== 0) return ''
  const d = document.createElement('div')
  d.textContent = s
  return d.innerHTML
}

export function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const CN_OFFSET = 8 * 3600000
export function toCN(d) { return new Date(d.getTime() + CN_OFFSET) }
export function pad2(n) { return (n < 10 ? '0' : '') + n }

export function fmtTime(t) {
  if (!t) return ''
  const d = new Date(t)
  if (isNaN(d.getTime())) return t
  const c = toCN(d)
  return c.getUTCFullYear() + '/' + pad2(c.getUTCMonth() + 1) + '/' + pad2(c.getUTCDate()) + ' ' + pad2(c.getUTCHours()) + ':' + pad2(c.getUTCMinutes())
}

export function fmtRel(t, tFn) {
  if (!t) return ''
  const d = new Date(t)
  if (isNaN(d.getTime())) return t
  const c = toCN(d)
  const now = toCN(new Date())
  const sameDay = c.getUTCFullYear() === now.getUTCFullYear() && c.getUTCMonth() === now.getUTCMonth() && c.getUTCDate() === now.getUTCDate()
  if (sameDay) return tFn('today') + ' ' + pad2(c.getUTCHours()) + ':' + pad2(c.getUTCMinutes())
  const yest = new Date(now.getTime() - 86400000)
  const isYest = c.getUTCFullYear() === yest.getUTCFullYear() && c.getUTCMonth() === yest.getUTCMonth() && c.getUTCDate() === yest.getUTCDate()
  if (isYest) return tFn('yesterday') + ' ' + pad2(c.getUTCHours()) + ':' + pad2(c.getUTCMinutes())
  const sameYear = c.getUTCFullYear() === now.getUTCFullYear()
  return (sameYear ? '' : c.getUTCFullYear() + '/') + pad2(c.getUTCMonth() + 1) + '/' + pad2(c.getUTCDate())
}

export function imgName(t) {
  return t.replace(/:/g, '\uFF1A').replace(/[/]/g, '%2F').replace(/[\?\*"<>\|']/g, '')
}
export function imgPath(a) {
  if (!a || !a.title) return ''
  return '/images/' + a.seasonKey + '/' + encodeURI(imgName(a.title)) + '.jpg'
}

export const NON_GROUP_TAGS = /^(?:搬运|转载|分流|更新|重压|合集|全集|完结合集|1080p|2160p|4k|720p|1080i|bdrip|bdr\.?ip|webr?ip|webdl|bluray|hd|hdtv|hevc|avc|aac|flac|opus|h\.?264|h\.?265|10bit|8bit|x264|x265|chs|cht|gb|big5|简|繁|简繁|简体内嵌|繁体内嵌|简繁内封|简繁中字|中字|字幕|内嵌|内封|外挂|多国字幕|无字幕|mp4|mkv|ts|wmv|web|tv|sp|ova|ona|bd|dvd|新番|旧番|国漫|日漫|剧场版|真|修正|v\d|ep\d+|第\d+话|第\d+集|s\d+e?\d+|season\d+|vol\.?\d+|part\d+)$/i

export function groupTagHTML(r) {
  const field = r.subtitle_group || ''
  const title = r.title || ''
  let tag = null, tagStart = 0, tagEnd = 0
  if (field) {
    const re = new RegExp('(?:\\[' + escRe(field) + '\\]|【' + escRe(field) + '】)')
    const m = title.match(re)
    if (m) { tag = field; tagStart = m.index; tagEnd = m.index + m[0].length }
  }
  if (!tag) {
    const m2 = title.match(/^(?:\[([^\]]{1,60})\]|【([^】]{1,60})】)/)
    if (m2) {
      const cand = m2[1] !== undefined ? m2[1] : m2[2]
      if (cand && !NON_GROUP_TAGS.test(cand)) { tag = cand; tagStart = m2.index; tagEnd = m2.index + m2[0].length }
    }
  }
  if (!tag) return null
  return { tag, before: title.substring(0, tagStart), after: title.substring(tagEnd) }
}
