<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { drawerOpen, drawerHash, lightboxOpen, lightboxSrc } from '../globals'
import { API, apiGet } from '../api'
import { fmtTime } from '../utils'
import { useCopy } from '../useCopy'

const { t, copied, copyText } = useCopy()

const res = ref(null)
const err = ref(false)
const loading = ref(false)

function close() { drawerOpen.value = false }

function openImg(src) {
  if (!src) return
  lightboxSrc.value = src
  lightboxOpen.value = true
}

watch(drawerOpen, (open) => {
  if (!open) return
  res.value = null
  err.value = false
  loading.value = true
  apiGet(API.hash(drawerHash.value))
    .then((r) => { res.value = r })
    .catch(() => { err.value = true })
    .finally(() => { loading.value = false })
})
</script>

<template>
  <div class="drawer" :class="{ open: drawerOpen }" @click.self="close">
    <div class="drawer-panel">
      <button class="drawer-close" @click="close">✕</button>
      <div class="drawer-content">
        <div v-if="loading" class="res-loading">{{ t('loading') }}</div>
        <div v-else-if="err" class="res-empty">{{ t('resGone') }}</div>
        <template v-else-if="res">
          <div class="res-detail-top">
            <div class="res-detail-title" :title="res.title">{{ res.title }}</div>
            <button class="res-title-copy" :title="t('copyTitle')" @click="copyText(res.title, 'title')">📋</button>
          </div>
          <div class="res-meta">
            <span v-if="res.subtitle_group" class="detail-badge badge-web" style="margin-top:6px">{{ res.subtitle_group }}</span>
            <span v-if="res.size" class="detail-badge badge-air" style="margin-top:6px">{{ res.size }}</span>
            <span v-if="res.publish_time" class="detail-badge badge-night" style="margin-top:6px">{{ fmtTime(res.publish_time) }}</span>
          </div>
          <div class="res-actions">
            <button v-if="res.magnet" class="btn-primary" @click="copyText(res.magnet, 'magnet')">🧲 {{ copied === 'magnet' ? t('copied') : t('copyMagnet') }}</button>
            <a v-if="res.magnet" class="btn-secondary" :href="res.magnet">{{ t('openMagnet') }}</a>
            <a v-if="res.torrent_url" class="btn-secondary" :href="res.torrent_url" target="_blank">⬇ {{ t('dlTorrent') }}</a>
          </div>
          <div v-if="res.images && res.images.length" class="res-images">
            <img v-for="src in res.images" :key="src" :src="src" loading="lazy" @click="openImg(src)">
          </div>
          <div v-if="res.description" class="detail-body res-desc">
            <template v-for="(line, i) in res.description.split('\n')" :key="i">
              <div v-if="line">{{ line }}</div>
              <div v-else class="detail-spacer"></div>
            </template>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
