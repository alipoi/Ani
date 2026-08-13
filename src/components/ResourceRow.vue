<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { groupTagHTML, fmtRel, fmtTime } from '../utils'
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
  <div class="res-row" :class="{ mini }" :data-hash="r.info_hash">
    <span class="res-main">
      <span v-if="gt" class="res-title" :title="r.title" @click="emit('open', r)">{{ gt.before }}<a class="res-title-tag" :href="'/group/' + encodeURIComponent(gt.tag)" :title="t('titleTagView', { g: gt.tag })" @click.stop>[{{ gt.tag }}]</a>{{ gt.after }}</span>
      <span v-else class="res-title" :title="r.title" @click="emit('open', r)">{{ r.title }}</span>
      <span class="res-sub">
        <span v-if="r.subtitle_group && !(gt && gt.tag === r.subtitle_group)" class="res-sub-group">{{ r.subtitle_group }}</span>
        <span v-if="r.size" class="res-sub-item">{{ r.size }}</span>
        <span class="res-sub-item">{{ relTime }}</span>
      </span>
    </span>
    <span class="res-size">{{ r.size || '' }}</span>
    <span class="res-time" :title="fmtTime(r.publish_time)">{{ relTime }}</span>
    <span class="res-actions" v-if="r.magnet" @contextmenu.stop.prevent="showCtx($event)">
      <a
        class="res-magnet"
        :href="r.magnet"
        rel="noopener noreferrer"
        :title="t('openMagnet')"
        :aria-label="t('openMagnet')"
        @click.stop
      ><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 15 4 4"></path><path d="M2.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.029-6.029a1 1 0 1 1 3 3l-6.029 6.029a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.365-6.367A1 1 0 0 0 8.716 4.282z"></path><path d="m5 8 4 4"></path></svg></a>
      <button
        class="res-magnet"
        :title="t('copyMagnet')"
        :aria-label="t('copyMagnet')"
        @click.stop.prevent="copyText(r.magnet, 'magnet')"
      ><svg v-if="copied !== 'magnet'" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg><span v-else class="res-copied">✓</span></button>
      <a
        v-if="r.torrent_url"
        class="res-magnet"
        :href="r.torrent_url"
        target="_blank"
        rel="noopener noreferrer"
        :title="t('dlTorrent')"
        :aria-label="t('dlTorrent')"
        @click.stop
      ><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"></path><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="m7 10 5 5 5-5"></path></svg></a>
    </span>
  </div>
</template>
