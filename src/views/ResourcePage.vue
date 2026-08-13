<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { API, apiGet } from '../api'
import { fmtTime, esc } from '../utils'
import { useCopy } from '../useCopy'
import { lightboxOpen, lightboxSrc } from '../globals'
import ResourceRow from '../components/ResourceRow.vue'

function linkify(text) {
  return esc(text).replace(/(https?:\/\/[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%.]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
}

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { copied, copyText } = useCopy()

const res = ref(null)
const related = ref(null)
const err = ref(false)
const loading = ref(true)

function load() {
  res.value = null
  related.value = null
  err.value = false
  loading.value = true
  apiGet(API.hash(route.params.hash))
    .then((r) => {
      res.value = r
      related.value = Array.isArray(r.related) && r.related.length ? r.related : null
      document.title = r.title || 'Ani'
    })
    .catch(() => { err.value = true })
    .finally(() => { loading.value = false })
}

watch(() => route.params.hash, load, { immediate: true })

function openImg(src) {
  if (!src) return
  lightboxSrc.value = src
  lightboxOpen.value = true
}

function openRelated(r) {
  router.push('/res/' + r.info_hash)
}

function goBack() {
  const ret = route.query.ret
  if (typeof ret === 'string' && ret.startsWith('/')) { router.push(ret); return }
  if (window.history.length > 1) router.back()
  else router.push('/classic')
}
</script>

<template>
  <div class="res-page">
    <div class="res-page-head">
      <button class="btn-secondary res-page-back" @click="goBack">← {{ t('backRes') }}</button>
    </div>
    <div class="res-page-body">
      <div v-if="loading" class="res-loading">{{ t('loading') }}</div>
      <div v-else-if="err" class="res-empty">{{ t('resGone') }}</div>
      <template v-else-if="res">
        <div class="res-layout">
          <div class="res-poster">
            <img v-if="res.images && res.images.length" :src="res.images[0]" :alt="res.title" @click="openImg(res.images[0])">
            <div v-if="res.images && res.images.length > 1" class="res-thumbs">
              <img v-for="src in res.images.slice(1)" :key="src" :src="src" loading="lazy" @click="openImg(src)">
            </div>
          </div>
          <div class="res-main">
            <div class="res-detail-top">
              <div class="res-detail-title" :title="res.title">{{ res.title }}</div>
              <button class="res-title-copy" :title="t('copyTitle')" @click="copyText(res.title, 'title')"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg></button>
            </div>
            <div class="res-meta">
              <span v-if="res.subtitle_group" class="detail-badge badge-web"><a :href="'/group/' + encodeURIComponent(res.subtitle_group)">{{ res.subtitle_group }}</a></span>
              <span v-if="res.size" class="detail-badge badge-air">{{ res.size }}</span>
              <span v-if="res.publish_time" class="detail-badge badge-night">{{ fmtTime(res.publish_time) }}</span>
            </div>
            <div class="res-actions">
              <a v-if="res.magnet" class="btn-primary" :href="res.magnet"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 15 4 4"></path><path d="M2.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.029-6.029a1 1 0 1 1 3 3l-6.029 6.029a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.365-6.367A1 1 0 0 0 8.716 4.282z"></path><path d="m5 8 4 4"></path></svg>{{ t('openMagnet') }}</a>
              <button v-if="res.magnet" class="btn-secondary" @click="copyText(res.magnet, 'magnet')"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>{{ copied === 'magnet' ? t('copied') : t('copyMagnet') }}</button>
              <a v-if="res.torrent_url" class="btn-secondary" :href="'/api/resources/torrent/' + res.info_hash" target="_blank"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"></path><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="m7 10 5 5 5-5"></path></svg>{{ t('dlTorrent') }}</a>
            </div>
            <div v-if="res.description" class="detail-body res-desc">
              <template v-for="(line, i) in res.description.split('\n')" :key="i">
                <div v-if="line" v-html="linkify(line)"></div>
                <div v-else class="detail-spacer"></div>
              </template>
            </div>
          </div>
        </div>
        <div v-if="related && related.length" class="res-page-related">
          <div class="res-page-h">{{ t('sameSeries', { n: related.length }) }}</div>
          <ResourceRow v-for="r in related" :key="r.info_hash" :r="r" mini @open="openRelated" />
        </div>
      </template>
    </div>
  </div>
</template>
