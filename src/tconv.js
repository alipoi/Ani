import { ref, watch } from 'vue'
import i18n from './i18n'

const ready = ref(false)
let conv = null
let pending = null

function load() {
  if (conv || pending) return
  pending = import('opencc-js/cn2t')
    .then((m) => {
      conv = m.Converter({ from: 'cn', to: 'tw' })
      ready.value = true
    })
    .catch(() => { pending = null })
}

watch(() => i18n.global.locale.value, (l) => { if (l === 'zh-Hant') load() }, { immediate: true })

export function tt(s) {
  if (s == null) return s
  s = String(s)
  return ready.value && conv ? conv(s) : s
}
