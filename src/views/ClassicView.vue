<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { API, apiGet } from '../api'
import { esc } from '../utils'
import ResourceRow from '../components/ResourceRow.vue'
import Pager from '../components/Pager.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const list = ref([])
const total = ref(0)
const size = 30
const loading = ref(false)
const err = ref(false)

const term = computed(() => (route.query.q || '').toString())
const page = computed(() => {
  const p = parseInt(route.query.p) || 1
  return p > 0 ? p : 1
})
const pages = computed(() => Math.ceil(total.value / size))

function go(p) {
  const query = { ...route.query }
  if (p > 1) query.p = p
  else delete query.p
  router.push({ path: '/classic', query })
}

function openDetail(r) {
  try { sessionStorage.setItem('aniscroll:' + route.fullPath, String(window.scrollY)) } catch (e) {}
  router.push({ path: '/res/' + r.info_hash })
}

function restoreScroll() {
  try {
    const key = 'aniscroll:' + route.fullPath
    const y = parseInt(sessionStorage.getItem(key), 10)
    if (!(y > 0)) return
    sessionStorage.removeItem(key)
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)))
  } catch (e) {}
}

function load() {
  loading.value = true
  err.value = false
  apiGet(API.latest(page.value, size, term.value))
    .then((d) => {
      list.value = d.list || []
      total.value = d.total || 0
      if (page.value > pages.value && pages.value > 0) { go(pages.value); return }
    })
    .catch(() => { err.value = true })
    .finally(() => {
      loading.value = false
      restoreScroll()
    })
}

const statsHtml = computed(() =>
  '<span class="stats-icon"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg></span> ' +
  (term.value ? t('statsSearch', { q: esc(term.value) }) : '') +
  t('resCount', { n: total.value }))

watch(() => route.fullPath, load, { immediate: true })
</script>

<template>
  <div>
    <main class="main classic-main">
      <div class="stats-bar" v-html="statsHtml"></div>
      <div v-if="loading" class="loading"><span class="spinner"></span>{{ t('loading') }}</div>
      <div v-else-if="err" class="empty show">{{ t('loadErr') }}</div>
      <div v-else-if="!list.length" class="empty show">{{ t('noRes') }}</div>
      <div v-else>
        <div class="res-table">
          <div class="res-table-head"><span>{{ t('headTitle') }}</span><span>{{ t('headSize') }}</span><span>{{ t('headTime') }}</span><span>{{ t('headMagnet') }}</span></div>
          <ResourceRow v-for="r in list" :key="r.info_hash" :r="r" @open="openDetail" />
        </div>
        <Pager v-if="pages > 1" :page="page" :pages="pages" @go="go" />
      </div>
    </main>
  </div>
</template>
