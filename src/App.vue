<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import SiteHeader from './components/SiteHeader.vue'
import CtxMenu from './components/CtxMenu.vue'
import DetailOverlay from './components/DetailOverlay.vue'
import Lightbox from './components/Lightbox.vue'
import { searchQuery } from './search'
import { goSeason, seasonKey, calYear, calSeason } from './calendar'
import { overlayOpen, lightboxOpen, kbdHintClosed, closeKbdHint } from './globals'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const showGoTop = ref(false)

function onScroll() { showGoTop.value = window.scrollY > 400 }
function goTop() { window.scrollTo({ top: 0, behavior: 'smooth' }) }

function onKeydown(e) {
  if (overlayOpen.value) { if (e.key === 'Escape') overlayOpen.value = false; return }
  if (lightboxOpen.value) { if (e.key === 'Escape') lightboxOpen.value = false; return }
  if (e.key === 'Escape' && searchQuery.value) {
    searchQuery.value = ''
    const query = { ...route.query }
    delete query.q
    router.replace({ query })
    if (document.activeElement) document.activeElement.blur()
    return
  }
  if (!searchQuery.value && /^\/(\d{4})(\d{2})?\/?$/.test(route.path)) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); goSeason(-1) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); goSeason(1) }
    else return
    router.push('/' + seasonKey(calYear.value, calSeason.value) + '/')
  }
}

onMounted(() => {
  window.addEventListener('scroll', onScroll)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  document.removeEventListener('keydown', onKeydown)
})

watch(() => overlayOpen.value, (v) => {
  if (v) document.body.style.overflow = 'hidden'
  else document.body.style.overflow = ''
})
</script>

<template>
  <div>
    <SiteHeader />
    <router-view />
    <CtxMenu />
    <DetailOverlay />
    <Lightbox />
    <button class="gotop" :class="{ show: showGoTop }" @click="goTop">↑</button>
    <div v-if="!kbdHintClosed" class="kbd-hint" @click="closeKbdHint">{{ t('kbdHint') }}</div>
  </div>
</template>
