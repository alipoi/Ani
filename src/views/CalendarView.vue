<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { API, apiGet } from '../api'
import { calYear, calSeason, seasonKey } from '../calendar'
import { searchQuery } from '../search'
import { dayNameSun } from '../i18n'
import { overlayOpen, overlayData } from '../globals'
import { imgPath } from '../utils'
import { favs, isFav, toggleFav } from '../favs'

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
  for (let i = 0; i < 7; i++) out.push({ label: tm('days')[i], items: [] })
  const WK = ['周一','周二','周三','周四','周五','周六','周日']
  filtered.value.forEach((a) => {
    let wi = WK.indexOf(a.weekday || WK[0])
    if (wi < 0) wi = 0
    out[wi].items.push(a)
  })
  return out
})

const statsHtml = computed(() => {
  const term = searchQuery.value.trim()
  return term
    ? t('statsFound', { q: term, n: filtered.value.length })
    : t('statsTotal', { n: filtered.value.length })
})

function openDetail(a) {
  overlayData.value = { a, seasonKey: seasonKey(calYear.value, calSeason.value) }
  overlayOpen.value = true
}

function onFav(e, id) {
  e.stopPropagation()
  toggleFav(id)
}

function scrollToToday() {
  if (searchQuery.value.trim()) return
  const today = dayNameSun(new Date().getDay())
  const sections = document.querySelectorAll('.day-section')
  for (let i = 0; i < sections.length; i++) {
    const dh = sections[i].querySelector('.day-h')
    if (dh && dh.textContent.trim() === today) {
      sections[i].classList.add('current')
      setTimeout((el) => { el.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, 100, sections[i])
      break
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
  document.addEventListener('click', onDocClick)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
})
</script>

<template>
  <div>
    <div class="stats-bar">
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
      <span v-html="statsHtml"></span>
    </div>
    <main class="main" id="listWrap">
      <div v-if="loading" class="loading"><span class="spinner"></span>{{ t('loading') }}</div>
      <div v-else-if="err" class="empty show">{{ err }}</div>
      <div v-else-if="!filtered.length" class="empty show">{{ searchQuery.trim() ? t('emptyBangumi') : t('empty') }}</div>
      <div v-else id="list">
        <div v-for="day in weekdays" :key="day.label" class="day-section">
          <template v-if="day.items.length">
            <div class="day-h">{{ day.label }}<span class="day-count">{{ day.items.length }}</span></div>
            <div class="card-list">
              <div v-for="a in day.items" :key="a.id" class="card" :data-id="a.id" @click="openDetail(a)">
                <div class="card-img" :style="imgPath(a, seasonKey(calYear.value, calSeason.value)) ? { '--img': 'url(' + imgPath(a, seasonKey(calYear.value, calSeason.value)) + ')' } : {}"></div>
                <button class="fav-btn" :class="{ on: isFav(a.id) }" :data-id="a.id" @click="onFav($event, a.id)">{{ isFav(a.id) ? '★' : '☆' }}</button>
                <div class="card-title">{{ a.title }}</div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </main>
  </div>
</template>
