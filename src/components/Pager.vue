<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  page: { type: Number, required: true },
  pages: { type: Number, required: true }
})
const emit = defineEmits(['go'])

const { t } = useI18n()

const items = computed(() => {
  const out = []
  const MAX = 10
  let start = Math.max(1, props.page - Math.floor((MAX - 1) / 2))
  if (start + MAX - 1 > props.pages) start = Math.max(1, props.pages - MAX + 1)
  for (let p = start; p <= Math.min(props.pages, start + MAX - 1); p++) out.push(p)
  return out
})
</script>

<template>
  <div class="pager">
    <ul class="pagination bootpag">
      <li v-if="page <= 1" class="first disabled"><a href="javascript:void(0)">{{ t('pageFirst') }}</a></li>
      <li v-else class="first"><a href="javascript:void(0)" @click="emit('go', 1)">{{ t('pageFirst') }}</a></li>
      <li v-if="page <= 1" class="prev disabled"><a href="javascript:void(0)">«</a></li>
      <li v-else class="prev"><a href="javascript:void(0)" @click="emit('go', page - 1)">«</a></li>
      <li v-for="p in items" :key="p" :class="{ active: p === page }">
        <a href="javascript:void(0)" @click="emit('go', p)">{{ p }}</a>
      </li>
      <li v-if="page >= pages" class="next disabled"><a href="javascript:void(0)">»</a></li>
      <li v-else class="next"><a href="javascript:void(0)" @click="emit('go', page + 1)">»</a></li>
      <li v-if="page >= pages" class="last disabled"><a href="javascript:void(0)">{{ t('pageLast') }}</a></li>
      <li v-else class="last"><a href="javascript:void(0)" @click="emit('go', pages)">{{ t('pageLast') }}</a></li>
    </ul>
  </div>
</template>
