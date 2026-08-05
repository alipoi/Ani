<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { overlayOpen, overlayData, lightboxOpen, lightboxSrc } from '../globals'
import { API, apiGet } from '../api'
import { esc, imgPath } from '../utils'
import ResourceRow from './ResourceRow.vue'

const { t } = useI18n()

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

const badges = computed(() => {
  const list = []
  const at = overlayData.value && overlayData.value.a ? overlayData.value.a.airTime : ''
  if (!at) return list
  if (at.indexOf('网络') >= 0) list.push({ cls: 'badge-web', text: t('badgeWeb') })
  else if (at.indexOf('深夜') >= 0) list.push({ cls: 'badge-night', text: t('badgeNight') })
  else list.push({ cls: 'badge-air', text: t('badgeAir') })
  if (at.indexOf('泡面') >= 0) list.push({ cls: 'badge-short', text: t('badgeShort') })
  return list
})

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
  window.open(window.location.origin + '/res/' + r.info_hash, '_blank')
}

function close() {
  overlayOpen.value = false
}

watch(overlayOpen, (open) => {
  if (!open) return
  const a = overlayData.value
  if (!a) return
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
          </div>
          <div class="detail-info">
            <div class="detail-title">{{ overlayData.a.title }}</div>
            <div v-if="overlayData.a.titleJp" class="detail-title-jp">{{ overlayData.a.titleJp }}</div>
            <span v-for="b in badges" :key="b.cls" class="detail-badge" :class="b.cls">{{ b.text }}</span>
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
              <a class="rss-link" :href="'/rss/bangumi/' + encodeURIComponent(overlayData.seasonKey) + '/' + encodeURIComponent(overlayData.a.id)" target="_blank">📡 {{ t('rss') }}</a>
              <span v-if="resources.total" class="res-total" v-html="t('resCount', { n: resources.total })"></span>
            </div>          </template>
        </div>
      </div>
    </div>
  </div>
</template>
