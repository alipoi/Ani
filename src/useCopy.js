import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

export function useCopy() {
  const { t } = useI18n()
  const copied = ref('')
  let timer = null

  function doCopy(txt) {
    if (!txt) return false
    const ta = document.createElement('textarea')
    ta.value = txt
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch (e) {}
    document.body.removeChild(ta)
    return true
  }

  function copyText(txt, key) {
    if (!doCopy(txt)) return
    copied.value = key
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { copied.value = '' }, 1500)
  }

  return { copied, copyText, doCopy, t }
}
