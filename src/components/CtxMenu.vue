<script setup>
import { watch, onMounted, onUnmounted } from 'vue'
import { ctxOpen, ctxMenu } from '../globals'
import { useCopy } from '../useCopy'

const { t, copied, copyText } = useCopy()

function close() { ctxOpen.value = false }

function onClick(e) {
  if (ctxOpen.value && !e.target.closest('#ctxMenu')) close()
}
function onScroll() { close() }
function onKey(e) { if (e.key === 'Escape' && ctxOpen.value) close() }

watch(ctxOpen, (open) => {
  if (open) {
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
    <button class="ctx-item" @click="copyText(ctxMenu.magnet, 'magnet'); close()">📋 {{ t('copyMagnet') }}</button>
    <a class="ctx-item" :href="ctxMenu.magnet">🧲 {{ t('openMagnet') }}</a>
    <a v-if="ctxMenu.torrentUrl" class="ctx-item" :href="ctxMenu.torrentUrl" target="_blank" rel="noopener">⬇ {{ t('dlTorrent') }}</a>
    <button v-else-if="ctxMenu.title" class="ctx-item" @click="copyText(ctxMenu.title, 'title'); close()">✂️ {{ t('copyTitle') }}</button>
  </div>
</template>
