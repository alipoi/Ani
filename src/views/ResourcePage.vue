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
  if (window.history.state && window.history.state.back) router.back()
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
              <button class="res-title-copy" :title="t('copyTitle')" @click="copyText(res.title, 'title')">📋</button>
            </div>
            <div class="res-meta">
              <span v-if="res.subtitle_group" class="detail-badge badge-web"><a :href="'/group/' + encodeURIComponent(res.subtitle_group)">{{ res.subtitle_group }}</a></span>
              <span v-if="res.size" class="detail-badge badge-air">{{ res.size }}</span>
              <span v-if="res.publish_time" class="detail-badge badge-night">{{ fmtTime(res.publish_time) }}</span>
            </div>
            <div class="res-actions">
              <button v-if="res.magnet" class="btn-primary" @click="copyText(res.magnet, 'magnet')">🧲 {{ copied === 'magnet' ? t('copied') : t('copyMagnet') }}</button>
              <a v-if="res.magnet" class="btn-secondary" :href="res.magnet">{{ t('openMagnet') }}</a>
              <a v-if="res.torrent_url" class="btn-secondary" :href="res.torrent_url" target="_blank">⬇ {{ t('dlTorrent') }}</a>
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
