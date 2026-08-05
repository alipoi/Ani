import { ref } from 'vue'

export const drawerOpen = ref(false)
export const drawerHash = ref('')

export const overlayOpen = ref(false)
export const overlayData = ref(null)

export const lightboxOpen = ref(false)
export const lightboxSrc = ref('')

export const ctxOpen = ref(false)
export const ctxMenu = ref({ x: 0, y: 0, magnet: '', title: '', torrentUrl: '' })

export const kbdHintClosed = ref(!!localStorage.getItem('kbdHintClosed'))
export function closeKbdHint() {
  kbdHintClosed.value = true
  localStorage.setItem('kbdHintClosed', '1')
}
