<script lang="ts">
  const ignoredMarkup = "<img src='/ignored.png'>";
  function openPanel() {}
</script>

<main>
  <button>
    <span aria-hidden="true">x</span>
  </button>
  <a>Continue</a>
  <div on:click={openPanel}>Open panel</div>
</main>
