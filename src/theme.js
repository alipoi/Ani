import { ref } from 'vue'

export const theme = ref(localStorage.getItem('nekomiTheme') || 'auto')
export const dark = ref(false)

const mq = window.matchMedia('(prefers-color-scheme: dark)')

export function applyTheme() {
  const isDark = theme.value === 'dark' || (theme.value === 'auto' && mq.matches)
  dark.value = isDark
  document.documentElement.classList.toggle('dark', isDark)
}

export function setTheme(t) {
  theme.value = t
  localStorage.setItem('nekomiTheme', t)
  applyTheme()
}

mq.addEventListener('change', () => {
  if (theme.value === 'auto') applyTheme()
})

applyTheme()
