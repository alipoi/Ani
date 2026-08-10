<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { overlayOpen, overlayData, lightboxOpen, lightboxSrc } from '../globals'
import { API, apiGet } from '../api'
import { esc, imgPath } from '../utils'
import { bgMeta, loadMetaFor } from '../bgmeta'
import ResourceRow from './ResourceRow.vue'

const { t } = useI18n()
const router = useRouter()

const resources = ref(null)
const err = ref(false)

function fmtFields(content) {
  let out = ''
  content.split('\n').forEach((line) => {
    if (!line.trim()) { out += '<div class="detail-spacer"></div>'; return }
    const ci = line.indexOf('：')
    if (ci > 0 && ci < 8) {
      const label = line.substring(0, ci + 1)
      const val = line.substring(ci + 1)
      if (label === t('fieldGenre') || label === t('fieldTags')) {
        out += '<div class="detail-field"><span class="field-label">' + esc(label) + '</span>'
        val.split('/').forEach((tag) => { if (tag.trim()) out += '<span class="field-tag">' + esc(tag.trim()) + '</span>' })
        out += '</div>'
      } else if (label === t('fieldSite')) {
        let url = val.trim()
        if (url.indexOf('http') !== 0) url = 'https://' + url
        out += '<div class="detail-field"><span class="field-label">' + esc(label) + '</span><a href="' + esc(url) + '" target="_blank" rel="noopener" class="field-link">' + esc(val.trim()) + '</a></div>'
      } else {
        out += '<div class="detail-field"><span class="field-label">' + esc(label) + '</span><span class="field-value">' + esc(val) + '</span></div>'
      }
    } else {
      out += '<div class="detail-text">' + esc(line) + '</div>'
    }
  })
  return out
}

const meta = computed(() => {
  const d = overlayData.value
  return d && d.a ? bgMeta.get(d.seasonKey + ':' + d.a.id) || null : null
})

function fmtPlatform(p) {
  if (!p) return ''
  const map = { TV: 'calFmtTv', 剧场版: 'calFmtMovie', OVA: 'calFmtOva', ONA: 'calFmtOna', WEB: 'calFmtWeb' }
  return t(map[p] || 'calFmtOther')
}

function fmtQuarter(q) {
  return q ? q.y + t('yearSep') + t('season.' + q.sn) : ''
}

function fmtStatus(s) {
  if (!s) return ''
  return t('calStatus' + s.charAt(0).toUpperCase() + s.slice(1))
}

const imgSrc = computed(() => {
  const a = overlayData.value && overlayData.value.a
  return a ? imgPath(a, overlayData.value.seasonKey) : ''
})
const showImg = computed(() => imgSrc.value && overlayData.value.a.coverImage)

function onImgError(e) {
  e.target.src = overlayData.value.a.coverImage
}

function openImg() {
  if (!showImg.value) return
  lightboxSrc.value = imgSrc.value
  lightboxOpen.value = true
}

function openRes(r) {
  router.push('/res/' + r.info_hash)
}

function close() {
  overlayOpen.value = false
}

watch(overlayOpen, (open) => {
  if (!open) return
  const a = overlayData.value
  if (!a) return
  loadMetaFor(a.a, a.seasonKey)
  resources.value = null
  err.value = false
  apiGet(API.bangumi(a.seasonKey, a.a.id))
    .then((d) => { resources.value = d })
    .catch(() => { err.value = true })
})
</script>

<template>
  <div class="overlay" :class="{ open: overlayOpen }" @click.self="close">
    <div class="overlay-inner">
      <button class="overlay-close" @click="close">✕</button>
      <div v-if="overlayData" class="overlay-content">
        <div class="detail-top">
          <div class="detail-img" @click="openImg">
            <img v-if="showImg" :src="imgSrc" :alt="overlayData.a.title" @error="onImgError">
            <a class="rss-icon rss-float" :href="'/rss/bangumi/' + encodeURIComponent(overlayData.seasonKey) + '/' + encodeURIComponent(overlayData.a.id)" target="_blank" :aria-label="t('rssSubscribe')" :title="t('rssSubscribe')" @click.stop>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11a9 9 0 0 1 9 9"></path><path d="M4 4a16 16 0 0 1 16 16"></path><circle cx="5" cy="19" r="1"></circle></svg>
            </a>
          </div>
          <div class="detail-info">
            <div class="detail-title">{{ overlayData.a.title }}</div>
            <div v-if="overlayData.a.titleJp" class="detail-title-jp">{{ overlayData.a.titleJp }}</div>
            <div v-if="meta" class="detail-meta">
              <div class="detail-meta-line">
                <span v-if="meta.score > 0" class="detail-score">{{ meta.score }}<i>{{ t('calScore') }}</i></span>
                <span v-if="fmtPlatform(meta.platform)" class="detail-fmt">{{ fmtPlatform(meta.platform) }}</span>
                <span v-if="meta.status" class="meta-status" :class="meta.status">{{ fmtStatus(meta.status) }}</span>
                <span v-if="meta.quarter" class="detail-qt">{{ fmtQuarter(meta.quarter) }}</span>
                <span v-if="meta.eps" class="detail-eps">{{ meta.eps }}{{ t('calEp') }}</span>
              </div>
              <div v-if="meta.tags.length" class="detail-tags">
                <span v-for="(tg, ti) in meta.tags" :key="ti">{{ tg }}</span>
              </div>
            </div>
          </div>
        </div>
        <div v-if="overlayData.a.content" class="detail-body" v-html="fmtFields(overlayData.a.content)"></div>
        <div class="detail-res">
          <div class="detail-res-h">{{ t('resUpdate') }}</div>
          <div v-if="err" class="res-empty">{{ t('noRes') }}</div>
          <div v-else-if="!resources" class="res-loading">{{ t('loading') }}</div>
          <template v-else>
            <div v-if="!resources.total" class="res-empty">{{ t('noRes') }}</div>
            <div v-else class="res-list">
              <ResourceRow v-for="r in resources.list" :key="r.info_hash" :r="r" mini @open="openRes" />
            </div>
            <div class="res-more">
              <span v-if="resources.total" class="res-total" v-html="t('resCount', { n: resources.total })"></span>
            </div>          </template>
        </div>
      </div>
    </div>
  </div>
</template>
