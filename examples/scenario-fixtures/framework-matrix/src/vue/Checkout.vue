<template>
  <main>
    <button :aria-label="'Close cart'">
      <span aria-hidden="true">x</span>
    </button>
    <div @click="openPanel">Open panel</div>
  </main>
</template>

<script setup lang="ts">
function openPanel() {}
</script>
