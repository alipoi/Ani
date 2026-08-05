<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { groupTagHTML, fmtRel, fmtTime, esc } from '../utils'
import { useCopy } from '../useCopy'
import { ctxMenu, ctxOpen } from '../globals'

const props = defineProps({
  r: { type: Object, required: true },
  mini: { type: Boolean, default: false }
})
const emit = defineEmits(['open'])

const { t } = useI18n()
const { copied, copyText } = useCopy()

const gt = computed(() => groupTagHTML(props.r))
const titleHtml = computed(() => {
  if (!gt.value) return esc(props.r.title)
  return esc(gt.value.before) +
    '<a class="res-title-tag" href="/group/' + encodeURIComponent(gt.value.tag) + '" title="' + esc(t('titleTagView', { g: gt.value.tag })) + '">[' + esc(gt.value.tag) + ']</a>' +
    esc(gt.value.after)
})
const relTime = computed(() => fmtRel(props.r.publish_time, t))

function showCtx(e) {
  ctxOpen.value = true
  ctxMenu.value = {
    x: e.clientX, y: e.clientY,
    magnet: props.r.magnet || '',
    title: props.r.title || '',
    torrentUrl: props.r.torrent_url || ''
  }
}
</script>

<template>
  <div class="res-row" :class="{ mini }" :data-hash="r.info_hash" @click="emit('open', r)">
    <span class="res-ep">{{ r.episode || '?' }}</span>
    <span class="res-title" :title="r.title" v-html="titleHtml"></span>
    <span class="res-size">{{ r.size || '' }}</span>
    <span class="res-time" :title="fmtTime(r.publish_time)">{{ relTime }}</span>
    <button
      v-if="r.magnet"
      class="res-magnet"
      :data-copy="r.magnet"
      :data-torrent="r.torrent_url || ''"
      :title="t('copyMagnet')"
      :aria-label="t('copyMagnet')"
      @click.stop.prevent="copyText(r.magnet, 'magnet')"
      @contextmenu.stop.prevent="showCtx($event)"
    >{{ copied === 'magnet' ? '✓' : '🧲' }}</button>
  </div>
</template>
