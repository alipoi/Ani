<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import SiteHeader from './components/SiteHeader.vue'
import CtxMenu from './components/CtxMenu.vue'
import DetailOverlay from './components/DetailOverlay.vue'
import Lightbox from './components/Lightbox.vue'
import { searchQuery } from './search'
import { goSeason, seasonKey, calYear, calSeason, currentSeasonNow } from './calendar'
import { overlayOpen, lightboxOpen } from './globals'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const showGoTop = ref(false)

function onScroll() { showGoTop.value = window.scrollY > 400 }
function goTop() { window.scrollTo({ top: 0, behavior: 'smooth' }) }

function onVisibility() {
  if (document.visibilityState !== 'visible' || route.path !== '/') return
  const def = currentSeasonNow()
  if (def.y !== calYear.value || def.s !== calSeason.value) {
    calYear.value = def.y
    calSeason.value = def.s
  }
}

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
  document.addEventListener('visibilitychange', onVisibility)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  document.removeEventListener('keydown', onKeydown)
  document.removeEventListener('visibilitychange', onVisibility)
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
    <footer class="site-footer">
      <span>
        <a target="_blank" rel="noopener" href="https://beian.miit.gov.cn">粤ICP备2026014899号</a>
        <span class="sep">|</span>
        <a target="_blank" rel="noopener" href="https://beian.mps.gov.cn/#/query/webSearch?code=44011802001279">粤公网安备44011802001279号</a>
      </span>
    </footer>
    <CtxMenu />
    <DetailOverlay />
    <Lightbox />
    <button class="gotop" :class="{ show: showGoTop }" @click="goTop">↑</button>
  </div>
</template>
