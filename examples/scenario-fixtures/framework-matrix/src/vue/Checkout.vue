<template>
  <main>
    <button :aria-label="'Close cart'">
      <span aria-hidden="true">x</span>
    </button>
    <template #actions>
      <div @click="openPanel">Open panel</div>
    </template>
    <label :for="'email'">Email</label>
    <input :id="'email'" name="email" autocomplete="email">
  </main>
</template>

<script setup lang="ts">
const ignoredMarkup = "<button></button>";
function openPanel() {}
</script>
