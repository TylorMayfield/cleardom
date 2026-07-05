<template>
  <main>
    <button>
      <span aria-hidden="true">x</span>
    </button>
    <img :src="avatarUrl">
    <div @click="openPanel">Open panel</div>
    <input name="email" placeholder="Email">
  </main>
</template>

<script setup lang="ts">
const ignoredMarkup = "<button></button>";
const avatarUrl = "/avatar.png";
function openPanel() {}
</script>
