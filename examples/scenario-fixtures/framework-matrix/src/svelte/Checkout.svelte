<script lang="ts">
  const ignoredMarkup = "<img src='/missing-alt.png'>";
  function openPanel() {}
</script>

<main>
  {#if true}
    <button aria-label="Close cart">
      <span aria-hidden="true">x</span>
    </button>
    <div on:click={openPanel}>Open panel</div>
  {/if}
</main>
