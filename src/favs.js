import { ref } from 'vue'

export const favs = ref(load())

function load() {
  try { return JSON.parse(localStorage.getItem('favs') || '[]') } catch (e) { return [] }
}

function save() { localStorage.setItem('favs', JSON.stringify(favs.value)) }

export function isFav(id) { return favs.value.indexOf(id) >= 0 }
export function toggleFav(id) {
  const i = favs.value.indexOf(id)
  if (i < 0) favs.value.push(id); else favs.value.splice(i, 1)
  save()
}
