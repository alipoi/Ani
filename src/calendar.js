import { ref } from 'vue'

export function currentSeasonNow() {
  const d = new Date()
  const m = d.getMonth() + 1
  return { y: d.getFullYear(), s: m <= 3 ? 'winter' : m <= 6 ? 'spring' : m <= 9 ? 'summer' : 'fall' }
}

const now = new Date()
const m = now.getMonth() + 1
const curYear = now.getFullYear()
const curSeason = m <= 3 ? 'winter' : m <= 6 ? 'spring' : m <= 9 ? 'summer' : 'fall'
const MONTH = { winter: '01', spring: '04', summer: '07', fall: '10' }
const SEASON_ORDER = ['winter', 'spring', 'summer', 'fall']

export const calYear = ref(curYear)
export const calSeason = ref(curSeason)

export function seasonKey(y, s) { return String(y) + MONTH[s] }

export function goSeason(d) {
  let i = SEASON_ORDER.indexOf(calSeason.value)
  if (d > 0) {
    if (i < 3) calSeason.value = SEASON_ORDER[i + 1]
    else { calYear.value++; calSeason.value = 'winter' }
  } else {
    if (i > 0) calSeason.value = SEASON_ORDER[i - 1]
    else { calYear.value--; calSeason.value = 'fall' }
  }
  if (calYear.value > now.getFullYear()) calYear.value = now.getFullYear()
  if (calYear.value < 2016) calYear.value = 2016
}
