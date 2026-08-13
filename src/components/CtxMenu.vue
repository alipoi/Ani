<script setup>
import { watch, onMounted, onUnmounted, nextTick } from 'vue'
import { ctxOpen, ctxMenu } from '../globals'
import { useCopy } from '../useCopy'

const { t, copied, copyText } = useCopy()

function close() { ctxOpen.value = false }

function onClick(e) {
  if (ctxOpen.value && !e.target.closest('#ctxMenu')) close()
}
function onScroll() { close() }
function onKey(e) { if (e.key === 'Escape' && ctxOpen.value) close() }

watch(ctxOpen, async (open) => {
  if (open) {
    await nextTick()
    const el = document.getElementById('ctxMenu')
    if (!el) return
    const mw = el.offsetWidth, mh = el.offsetHeight
    const x = Math.min(ctxMenu.value.x, window.innerWidth - mw - 8)
    const y = Math.min(ctxMenu.value.y, window.innerHeight - mh - 8)
    el.style.left = Math.max(8, x) + 'px'
    el.style.top = Math.max(8, y) + 'px'
  }
})

onMounted(() => {
  document.addEventListener('click', onClick)
  document.addEventListener('scroll', onScroll, true)
  document.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  document.removeEventListener('click', onClick)
  document.removeEventListener('scroll', onScroll, true)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="ctx-menu" id="ctxMenu" v-show="ctxOpen">
    <button class="ctx-item" @click="copyText(ctxMenu.magnet, 'magnet'); close()"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>{{ t('copyMagnet') }}</button>
    <a class="ctx-item" :href="ctxMenu.magnet"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 15 4 4"></path><path d="M2.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.029-6.029a1 1 0 1 1 3 3l-6.029 6.029a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.365-6.367A1 1 0 0 0 8.716 4.282z"></path><path d="m5 8 4 4"></path></svg>{{ t('openMagnet') }}</a>
    <a v-if="ctxMenu.torrentUrl" class="ctx-item" :href="ctxMenu.torrentUrl" target="_blank" rel="noopener"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"></path><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="m7 10 5 5 5-5"></path></svg>{{ t('dlTorrent') }}</a>
    <button v-else-if="ctxMenu.title" class="ctx-item" @click="copyText(ctxMenu.title, 'title'); close()"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>{{ t('copyTitle') }}</button>
  </div>
</template>
