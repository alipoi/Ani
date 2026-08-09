<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { API, apiGet } from '../api'
import Pager from '../components/Pager.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const list = ref([])
const size = 90
const loading = ref(false)
const err = ref(false)

const term = computed(() => (route.query.q || '').toString())
const page = computed(() => {
  const p = parseInt(route.query.p) || 1
  return p > 0 ? p : 1
})
const pages = computed(() => Math.ceil(list.value.length / size))
const slice = computed(() => list.value.slice((page.value - 1) * size, page.value * size))

function initial(name) {
  if (!name) return '?'
  const ch = name.trim().charAt(0)
  return /[A-Za-z0-9]/.test(ch) ? ch.toUpperCase() : '#'
}

function go(p) {
  const query = { ...route.query }
  if (p > 1) query.p = p
  else delete query.p
  router.push({ path: '/groups', query })
}

function openGroup(name) {
  router.push('/group/' + encodeURIComponent(name))
}

function load() {
  loading.value = true
  err.value = false
  apiGet(API.groups(term.value))
    .then((d) => {
      list.value = (d.list || []).slice()
      if (page.value > pages.value && pages.value > 0) { go(pages.value); return }
    })
    .catch(() => { err.value = true })
    .finally(() => { loading.value = false })
}

watch(() => route.fullPath, load, { immediate: true })
</script>

<template>
  <div>
    <main class="main">
      <div v-if="loading" class="loading"><span class="spinner"></span>{{ t('loading') }}</div>
      <div v-else-if="err" class="empty show">{{ t('loadErr') }}</div>
      <div v-else-if="!slice.length" class="empty show">{{ t('noGroups') }}</div>
      <div v-else>
        <div class="group-grid">
          <div v-for="g in slice" :key="g.name" class="group-card" @click="openGroup(g.name)">
            <div class="group-avatar">{{ initial(g.name) }}</div>
            <div class="group-body">
              <div class="group-name" :title="g.name">{{ g.name }}</div>
              <div class="group-count" v-html="t('groupRes', { n: g.count })"></div>
              <a class="rss-icon rss-float" :href="'/rss/group/' + encodeURIComponent(g.name)" :aria-label="t('subscribeGroup')" :title="t('subscribeGroup')" target="_blank" @click.stop>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11a9 9 0 0 1 9 9"></path><path d="M4 4a16 16 0 0 1 16 16"></path><circle cx="5" cy="19" r="1"></circle></svg>
              </a>
            </div>
          </div>
        </div>
        <Pager v-if="pages > 1" :page="page" :pages="pages" @go="go" />
      </div>
    </main>
  </div>
</template>
