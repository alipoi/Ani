import { ref } from 'vue'

export const overlayOpen = ref(false)
export const overlayData = ref(null)

export const lightboxOpen = ref(false)
export const lightboxSrc = ref('')

export const ctxOpen = ref(false)
export const ctxMenu = ref({ x: 0, y: 0, magnet: '', title: '', torrentUrl: '' })
