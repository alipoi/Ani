<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { theme, setTheme } from '../theme'
import i18n from '../i18n'
import { searchQuery } from '../search'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const themeMenu = ref(false)
const langMenu = ref(false)

const THEME_ICON = {
  light: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
  dark: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/></svg>',
  auto: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>'
}
const themeIcon = computed(() => THEME_ICON[theme.value === 'dark' ? 'dark' : (theme.value === 'light' ? 'light' : 'auto')])

const searchValue = ref(searchQuery.value)
let searchTimer = null

function onSearchInput() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    const q = searchValue.value.trim()
    searchQuery.value = q
    router.push(q ? { path: '/classic', query: { q } } : '/classic')
  }, 250)
}

watch(() => route.query.q, (q) => {
  searchValue.value = typeof q === 'string' ? q : ''
})

const themeTitle = computed(() => {
  if (theme.value === 'dark') return t('themeDark')
  if (theme.value === 'light') return t('themeLight')
  return t('themeAuto')
})

function pickTheme(th) {
  setTheme(th)
  themeMenu.value = false
}
function pickLang(l) {
  i18n.global.locale.value = l
  localStorage.setItem('nekomiLang', l)
  document.documentElement.lang = l === 'en' ? 'en' : (l === 'zh-Hant' ? 'zh-Hant' : 'zh-CN')
  langMenu.value = false
}

function onClickOutside() {
  themeMenu.value = false
  langMenu.value = false
}

onMounted(() => document.addEventListener('click', onClickOutside))
onUnmounted(() => document.removeEventListener('click', onClickOutside))
</script>

<template>
  <header class="header">
    <div class="header-inner">
      <a class="logo" href="/">
        <img class="logo-icon" src="/favicon.png" alt="Nekomi">
        <span class="font-display font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-primary to-accent pr-1 py-1 drop-shadow-sm hover:brightness-110 transition-all duration-300">Nekomi</span>
      </a>
      <nav class="nav-tabs">
        <RouterLink to="/" data-mode="calendar">{{ t('navCalendar') }}</RouterLink>
        <RouterLink to="/classic" data-mode="classic">{{ t('navClassic') }}</RouterLink>
        <RouterLink to="/groups" data-mode="groups">{{ t('navGroups') }}</RouterLink>
      </nav>
      <nav class="nav-row">
        <input type="search" class="search-input" id="searchInput" :placeholder="t('searchPh')" v-model="searchValue" @input="onSearchInput">
        <div class="dd" @click.stop>
          <button class="theme-btn" :title="themeTitle" aria-haspopup="menu" :aria-expanded="themeMenu" @click="themeMenu = !themeMenu; langMenu = false" v-html="themeIcon"></button>
          <div class="dd-menu" role="menu" :hidden="!themeMenu">
            <button class="dd-item" role="menuitem" :class="{ active: theme === 'light' }" @click="pickTheme('light')">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg><span>{{ t('themeLight') }}</span>
            </button>
            <button class="dd-item" role="menuitem" :class="{ active: theme === 'dark' }" @click="pickTheme('dark')">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/></svg><span>{{ t('themeDark') }}</span>
            </button>
            <button class="dd-item" role="menuitem" :class="{ active: theme === 'auto' }" @click="pickTheme('auto')">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg><span>{{ t('themeAuto') }}</span>
            </button>
          </div>
        </div>
        <div class="dd" @click.stop>
          <button class="theme-btn lang-btn" :title="t('langZh' + (i18n.global.locale.value === 'zh-Hant' ? 'Hant' : 'Hans'))" aria-haspopup="menu" :aria-expanded="langMenu" @click="langMenu = !langMenu; themeMenu = false">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
          </button>
          <div class="dd-menu" role="menu" :hidden="!langMenu">
            <button class="dd-item" role="menuitem" :class="{ active: i18n.global.locale.value === 'zh-Hans' }" @click="pickLang('zh-Hans')">{{ t('langZhHans') }}</button>
            <button class="dd-item" role="menuitem" :class="{ active: i18n.global.locale.value === 'zh-Hant' }" @click="pickLang('zh-Hant')">{{ t('langZhHant') }}</button>
            <button class="dd-item" role="menuitem" :class="{ active: i18n.global.locale.value === 'en' }" @click="pickLang('en')">{{ t('langEn') }}</button>
          </div>
        </div>
      </nav>
    </div>
  </header>
</template>
