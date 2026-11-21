<script lang="ts">
  /**
   * The one sign a core rule carries (Mike, November 21). It replaces the owner label and
   * the hint lines: the text beside it belongs to the engine, so an edit there reaches
   * every game built on it.
   */
  let { engineName }: { engineName: string } = $props();
  const says = $derived(`A core rule. An edit here changes every game built on ${engineName}.`);
</script>

<span class="core" title={says} aria-label={says}>Core</span>

<style>
  .core {
    flex: none;
    font-family: var(--font-label);
    font-size: calc(10.5px * var(--type));
    font-weight: 500;
    line-height: 1.7;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--structure);
    border: 1px solid var(--structure);
    border-radius: 999px;
    padding: 0 7px;
    cursor: help;
  }
</style>
