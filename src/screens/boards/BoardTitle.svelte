<script lang="ts">
  /**
   * A board's name, renamed where it stands (Mike, October 27): click it, type, and press
   * Enter or click away. Escape puts the old name back.
   */
  let { name, label, onRename }: { name: string; label: string; onRename: (name: string) => Promise<void> } = $props();

  let problem = $state('');

  async function commit(input: HTMLInputElement) {
    const value = input.value.trim();
    if (!value || value === name) {
      input.value = name;
      return;
    }
    problem = '';
    try {
      await onRename(value);
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
      input.value = name;
    }
  }
</script>

<input
  class="board-title"
  type="text"
  aria-label={label}
  title="Click to rename"
  value={name}
  autocomplete="off"
  onkeydown={(e) => {
    const input = e.currentTarget as HTMLInputElement;
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') {
      input.value = name;
      input.blur();
    }
  }}
  onblur={(e) => commit(e.currentTarget as HTMLInputElement)} />
{#if problem}<p class="problem" role="alert">{problem}</p>{/if}

<style>
  .board-title {
    display: block;
    width: 100%;
    box-sizing: border-box;
    margin: 4px 0 8px;
    padding: 0;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 60px;
    letter-spacing: 0.02em;
    line-height: 1;
    color: var(--title);
    background: none;
    border: 0;
    border-bottom: 1px solid transparent;
  }
  .board-title:hover {
    border-bottom-color: var(--rule);
  }
  .board-title:focus {
    outline: none;
    border-bottom-color: var(--rule-strong);
  }
  .problem {
    margin: 0 0 8px;
    font-size: 13px;
    color: var(--danger);
  }
</style>
