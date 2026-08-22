import { ref, computed, watch } from 'vue'
import i18n from './i18n'

const ready = ref(false)
const isHant = computed(() => i18n.global.locale.value === 'zh-Hant')
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

watch(isHant, (v) => { if (v) load() }, { immediate: true })

export function tt(s) {
  if (s == null || !isHant.value || !ready.value || !conv) return s == null ? s : String(s)
  return conv(String(s))
}
