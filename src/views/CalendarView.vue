<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { API, apiGet } from '../api'
import { calYear, calSeason, seasonKey, currentSeasonNow } from '../calendar'
import { searchQuery } from '../search'
import { overlayOpen, overlayData } from '../globals'
import { thumbPath } from '../utils'
import { loadSeasonMeta, bgMeta } from '../bgmeta'
import ResourceRow from '../components/ResourceRow.vue'

const { t, tm } = useI18n()
const route = useRoute()
const router = useRouter()

const data = ref(null)
const loading = ref(false)
const err = ref('')

const seasonMenu = ref(false)
const SEASONS = ['winter', 'spring', 'summer', 'fall']
const years = computed(() => {
  const out = []
  for (let y = new Date().getFullYear(); y >= 2016; y--) out.push(y)
  return out
})

function pickSeason(s) {
  calSeason.value = s
  router.push('/' + seasonKey(calYear.value, s) + '/')
  seasonMenu.value = false
}
function pickYear(y) {
  calYear.value = y
  router.push('/' + seasonKey(y, calSeason.value) + '/')
  seasonMenu.value = false
}
function onDocClick() {
  seasonMenu.value = false
}

function load() {
  const key = seasonKey(calYear.value, calSeason.value)
  loading.value = true
  err.value = ''
  apiGet(API.season(key, calSeason.value))
    .then((d) => {
      data.value = Array.isArray(d) ? d : []
      data.value.forEach((a) => { a.seasonKey = key })
      loadSeasonMeta(data.value, key)
    })
    .catch(() => { err.value = t('noSeason') })
    .finally(() => { loading.value = false })
}

const filtered = computed(() => {
  if (!data.value) return []
  const term = searchQuery.value.trim().toLowerCase()
  if (!term) return data.value
  return data.value.filter((a) =>
    (a.title && a.title.toLowerCase().indexOf(term) >= 0) ||
    (a.titleJp && a.titleJp.toLowerCase().indexOf(term) >= 0) ||
    (a.content && a.content.toLowerCase().indexOf(term) >= 0))
})

const weekdays = computed(() => {
  const out = []
  for (let i = 0; i < 7; i++) out.push({ label: tm('days')[i], items: [], date: dayInfo[i].date, isToday: dayInfo[i].isToday })
  const WK = ['周一','周二','周三','周四','周五','周六','周日']
  filtered.value.forEach((a) => {
    let wi = WK.indexOf(a.weekday || WK[0])
    if (wi < 0) wi = 0
    out[wi].items.push(a)
  })
  return out
})

const today = new Date()
const todayWi = (today.getDay() + 6) % 7

const dayInfo = (() => {
  const out = {}
  for (let k = 0; k < 7; k++) {
    const wi = (todayWi + k) % 7
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + k)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    out[wi] = { date: mm + '/' + dd, isToday: k === 0 }
  }
  return out
})()

const navDays = computed(() => {
  const out = []
  for (let k = 0; k < 7; k++) {
    const wi = (todayWi + k) % 7
    out.push({ wi, label: tm('days')[wi], date: dayInfo[wi].date, isToday: dayInfo[wi].isToday })
  }
  return out
})

const activeDay = ref(todayWi)

const isCurrentSeason = computed(() => {
  const now = currentSeasonNow()
  return seasonKey(calYear.value, calSeason.value) === seasonKey(now.y, now.s)
})

function scrollToDay(wi) {
  activeDay.value = wi
  const sections = document.querySelectorAll('.day-section')
  for (const s of sections) {
    if (s.dataset.wi === String(wi)) {
      s.classList.add('current')
      s.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
  }
}

let rafId = 0
function onScroll() {
  cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(() => {
    const mid = 140
    const sections = document.querySelectorAll('.day-section')
    let cur = activeDay.value
    for (const s of sections) {
      if (s.getBoundingClientRect().top <= mid) cur = parseInt(s.dataset.wi, 10)
    }
    activeDay.value = cur
  })
}

function openDetail(a) {
  overlayData.value = { a, seasonKey: seasonKey(calYear.value, calSeason.value) }
  overlayOpen.value = true
}

const expandedId = ref(null)
const resCache = new Map()

function onCover(a) {
  if (window.matchMedia('(min-width: 641px)').matches) toggleExpand(a)
  else openDetail(a)
}

function toggleExpand(a) {
  if (expandedId.value === a.id) { expandedId.value = null; return }
  expandedId.value = a.id
  const key = a.seasonKey + ':' + a.id
  if (resCache.has(key)) return
  const st = reactive({ list: null, total: 0, err: false })
  resCache.set(key, st)
  apiGet(API.bangumi(a.seasonKey, a.id))
    .then((d) => { st.list = d.list || []; st.total = d.total || 0 })
    .catch(() => { st.err = true })
}

function panelOf(a) {
  return resCache.get(a.seasonKey + ':' + a.id) || null
}

function panelCoverStyle(a) {
  const p = thumbPath(a)
  return p ? { '--img': 'url(' + p + ')' } : {}
}

function fmtPlatform(p) {
  if (!p) return ''
  const map = { TV: 'calFmtTv', 剧场版: 'calFmtMovie', OVA: 'calFmtOva', ONA: 'calFmtOna', WEB: 'calFmtWeb' }
  return t(map[p] || 'calFmtOther')
}

function openRes(r) {
  router.push('/res/' + r.info_hash)
}

function metaOf(a) {
  return bgMeta.get(seasonKey(calYear.value, calSeason.value) + ':' + a.id)
}

const now = ref(Date.now())
let tickTimer = 0
function startTick() {
  tickTimer = setInterval(() => { now.value = Date.now() }, 30000)
}

const WEEK_MAP = { '一': 0, '二': 1, '三': 2, '四': 3, '五': 4, '六': 5, '日': 6, '天': 6 }

function airOf(a) {
  if (!a || !a.content) return null
  let m = a.content.match(/播出[：:][^\n]*?每[週周]([一二三四五六日天])[^\d]*?(\d{1,2})[時时](\d{1,2})分/)
  if (!m) m = a.content.match(/播出[：:][^\n]*?(\d{1,2})[時时](\d{1,2})分/)
  if (!m) return null
  let h = parseInt(m[2], 10)
  if (h >= 24) h -= 24
  return { wd: m[1] ? WEEK_MAP[m[1]] : null, deep: m[0].includes('深夜'), h, mm: parseInt(m[3], 10) }
}

function airTimeOf(a) {
  const air = airOf(a)
  if (!air) return ''
  const hh = air.h < 10 ? '0' + air.h : air.h
  const mm = air.mm < 10 ? '0' + air.mm : air.mm
  return hh + ':' + mm
}

function airLiveOf(a) {
  const air = airOf(a)
  if (!air || air.wd == null) return false
  const t = new Date(now.value)
  const wi = (t.getDay() + 6) % 7
  const airWi = air.deep ? (air.wd + 1) % 7 : air.wd
  if (airWi !== wi) return false
  const start = new Date(t.getFullYear(), t.getMonth(), t.getDate(), air.h, air.mm, 0)
  return t.getTime() >= start.getTime() && t.getTime() < start.getTime() + 35 * 60000
}

function scrollToToday() {
  if (searchQuery.value.trim()) return
  if (!isCurrentSeason.value) { activeDay.value = 0; return }
  activeDay.value = todayWi
  const sections = document.querySelectorAll('.day-section')
  for (const s of sections) {
    if (s.dataset.wi === String(todayWi)) {
      s.classList.add('current')
      setTimeout((el) => { el.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, 100, s)
      return
    }
  }
}

watch([calYear, calSeason], load)
watch(filtered, () => { requestAnimationFrame(scrollToToday) }, { flush: 'post' })
watch(() => route.path, (p) => {
  const m = p.match(/^\/(\d{4})(\d{2})\/?$/)
  if (m) {
    const y = parseInt(m[1])
    const mm = m[2]
    const sm = { '01':'winter','02':'winter','03':'winter','04':'spring','05':'spring','06':'spring','07':'summer','08':'summer','09':'summer','10':'fall','11':'fall','12':'fall' }
    calYear.value = y
    calSeason.value = sm[mm] || calSeason.value
  }
})

onMounted(() => {
  load()
  startTick()
  document.addEventListener('click', onDocClick)
  window.addEventListener('scroll', onScroll, { passive: true })
})
onBeforeUnmount(() => {
  clearInterval(tickTimer)
  document.removeEventListener('click', onDocClick)
  window.removeEventListener('scroll', onScroll)
})
</script>

<template>
  <div>
    <div class="cal-toolbar">
      <div class="dd" @click.stop>
        <button class="season-picker" @click="seasonMenu = !seasonMenu" :aria-expanded="seasonMenu">
          📅 {{ calYear }}年{{ t('season.' + calSeason) }} <span class="sp-arrow">▾</span>
        </button>
        <div class="dd-menu season-menu" :hidden="!seasonMenu">
          <div class="sm-label">年份</div>
          <div class="sm-years">
            <button v-for="y in years" :key="y" :class="{ on: y === calYear }" @click="pickYear(y)">{{ y }}</button>
          </div>
          <div class="sm-label">季度</div>
          <div class="sm-seasons">
            <button v-for="s in SEASONS" :key="s" :class="{ on: s === calSeason }" @click="pickSeason(s)">{{ t('season.' + s) }}</button>
          </div>
        </div>
      </div>
    </div>
    <div class="day-layout">
        <nav class="day-nav" aria-label="weekly day navigation">
          <button v-for="d in navDays" :key="d.wi" type="button" class="day-nav-btn" :class="{ on: activeDay === d.wi }" :aria-current="activeDay === d.wi ? 'true' : undefined" @click="scrollToDay(d.wi)">
            <span class="day-nav-dot" aria-hidden="true"></span>
            <span class="day-nav-name">{{ d.label }}</span>
          </button>
        </nav>
        <main class="main" id="listWrap">
      <div v-if="loading" class="loading"><span class="spinner"></span>{{ t('loading') }}</div>
      <div v-else-if="err" class="empty show">{{ err }}</div>
      <div v-else-if="!filtered.length" class="empty show">{{ searchQuery.trim() ? t('emptyBangumi') : t('empty') }}</div>
      <div v-else id="list">
        <div v-for="(day, i) in weekdays" :key="day.label" class="day-section" :data-wi="i">
          <template v-if="day.items.length">
            <div class="day-h">{{ day.label }}<span class="day-count">{{ day.items.length }}</span><span v-if="isCurrentSeason" class="day-date">{{ day.date }}<b v-if="day.isToday">（今天）</b></span></div>
            <div class="card-list">
              <template v-for="a in day.items" :key="a.id">
                <div class="card" :data-id="a.id" :class="{ on: expandedId === a.id }">
                  <div class="card-img" :style="thumbPath(a, seasonKey(calYear.value, calSeason.value)) ? { '--img': 'url(' + thumbPath(a, seasonKey(calYear.value, calSeason.value)) + ')' } : {}" @click="onCover(a)">
                    <template v-if="metaOf(a)">
                      <span v-if="metaOf(a).score > 0" class="card-score">{{ metaOf(a).score }}<i>{{ t('calScore') }}</i></span>
                    </template>
                    <span v-if="isCurrentSeason && airTimeOf(a)" class="air-badge" :class="{ live: airLiveOf(a) }">
                      {{ airTimeOf(a) }}
                      <b v-if="airLiveOf(a)" class="air-live">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16.247 7.761a6 6 0 0 1 0 8.478"></path><path d="M19.075 4.933a10 10 0 0 1 0 14.134"></path><path d="M4.925 19.067a10 10 0 0 1 0-14.134"></path><path d="M7.753 16.239a6 6 0 0 1 0-8.478"></path><circle cx="12" cy="12" r="2"></circle></svg>
                        {{ t('airLive') }}
                      </b>
                    </span>
                  </div>
                  <div class="card-title" @click="openDetail(a)">{{ a.title }}</div>
                </div>
                <div v-if="expandedId === a.id" class="expand-panel" data-testid="anime-expansion-panel">
                  <button class="expand-close" :aria-label="t('collapse')" :title="t('collapse')" @click="expandedId = null">✕</button>
                  <a class="rss-icon expand-rss" :href="'/rss/bangumi/' + encodeURIComponent(a.seasonKey) + '/' + encodeURIComponent(a.id)" target="_blank" :aria-label="t('rssSubscribe')" :title="t('rssSubscribe')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11a9 9 0 0 1 9 9"></path><path d="M4 4a16 16 0 0 1 16 16"></path><circle cx="5" cy="19" r="1"></circle></svg>
                  </a>
                  <div class="expand-head">
                    <div class="expand-cover" :style="panelCoverStyle(a)"></div>
                    <div class="expand-info">
                      <div class="expand-title" :title="a.title">{{ a.title }}</div>
                      <div v-if="a.titleJp" class="expand-title-jp">{{ a.titleJp }}</div>
                      <div v-if="metaOf(a)" class="expand-badges">
                        <span v-if="fmtPlatform(metaOf(a).platform)" class="expand-badge">{{ fmtPlatform(metaOf(a).platform) }}</span>
                        <span v-if="metaOf(a).eps" class="expand-badge">{{ t('expandEps', { n: metaOf(a).eps }) }}</span>
                      </div>
                    </div>
                  </div>
                  <div class="expand-res-h">
                    <span class="expand-res-label">{{ t('resources') }}</span>
                    <span v-if="panelOf(a)" class="expand-res-count">{{ panelOf(a).total }}</span>
                  </div>
                  <div class="expand-res">
                    <div v-if="panelOf(a) && panelOf(a).err" class="res-empty">{{ t('noRes') }}</div>
                    <div v-else-if="!panelOf(a) || !panelOf(a).list" class="res-loading">{{ t('loading') }}</div>
                    <div v-else-if="!panelOf(a).list.length" class="res-empty">{{ t('noRes') }}</div>
                    <div v-else class="res-list">
                      <ResourceRow v-for="r in panelOf(a).list" :key="r.info_hash" :r="r" mini @open="openRes" />
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </template>
        </div>
        </div>
      </main>
    </div>
  </div>
</template>
