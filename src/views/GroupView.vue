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

const gname = computed(() => route.params.name || '')
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

const statsHtml = computed(() =>
  '<span class="stats-icon">🏷</span> ' + esc(gname.value) +
  (term.value ? t('statsSearch', { q: esc(term.value) }) : '') +
  t('statsCount', { n: total.value }) +
  t('statsSubscribe', { u: '/rss/group/' + encodeURIComponent(gname.value) }))

function go(p) {
  const query = { ...route.query }
  if (p > 1) query.p = p
  else delete query.p
  router.push({ path: '/group/' + encodeURIComponent(gname.value), query })
}

function load() {
  loading.value = true
  err.value = false
  apiGet(API.group(gname.value, page.value, size, term.value))
    .then((d) => {
      list.value = d.list || []
      total.value = d.total || 0
      if (page.value > pages.value && pages.value > 0) { go(pages.value); return }
    })
    .catch(() => { err.value = true })
    .finally(() => { loading.value = false })
}

watch(() => route.fullPath, load, { immediate: true })
</script>

<template>
  <div>
    <div class="stats-bar" v-html="statsHtml"></div>
    <main class="main">
      <div v-if="loading" class="loading"><span class="spinner"></span>{{ t('loading') }}</div>
      <div v-else-if="err" class="empty show">{{ t('loadErr') }}</div>
      <div v-else-if="!list.length" class="empty show">{{ t('noRes') }}</div>
      <div v-else>
        <div class="res-table">
          <div class="res-table-head"><span>{{ t('headEp') }}</span><span>{{ t('headTitle') }}</span><span>{{ t('headSize') }}</span><span>{{ t('headTime') }}</span><span>{{ t('headMagnet') }}</span></div>
          <ResourceRow v-for="r in list" :key="r.info_hash" :r="r" />
        </div>
        <Pager v-if="pages > 1" :page="page" :pages="pages" @go="go" />
      </div>
    </main>
  </div>
</template>
