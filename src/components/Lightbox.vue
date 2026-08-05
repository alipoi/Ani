<script setup>
import { lightboxOpen, lightboxSrc } from '../globals'

function close() { lightboxOpen.value = false }
</script>

<template>
  <div class="lightbox" id="lightbox" :class="{ open: lightboxOpen }" @click="close">
    <button class="lightbox-close" @click.stop="close">✕</button>
    <img :src="lightboxSrc" alt="">
  </div>
</template>
