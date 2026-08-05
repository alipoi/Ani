export async function apiGet(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res.json()
}

export const API = {
  season: (key, season) => '/api/data/' + key + '/' + season,
  latest: (page, size, q) => '/api/resources/latest?page=' + page + '&size=' + size + (q ? '&q=' + encodeURIComponent(q) : ''),
  groups: (q) => '/api/groups?q=' + encodeURIComponent(q || ''),
  group: (name, page, size, q) => '/api/group/' + encodeURIComponent(name) + '?page=' + page + '&size=' + (size || 30) + (q ? '&q=' + encodeURIComponent(q) : ''),
  bangumi: (key, id) => '/api/resources/bangumi?key=' + encodeURIComponent(key) + '&id=' + encodeURIComponent(id) + '&size=10',
  hash: (h) => '/api/resources/hash/' + h,
  search: (q) => '/api/search?q=' + encodeURIComponent(q)
}
