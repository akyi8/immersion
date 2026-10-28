<script lang="ts">
  import { sync } from '../lib/sync.svelte';
  import { ui } from '../lib/ui.svelte';
  import SyncCount from './SyncCount.svelte';

  // The open world's Git sync in the header (Mike, October 26): what waits to go out and
  // come in, with a button to sync now (Mike, October 28). The count opens This computer
  // in Settings, where the last sync is explained in full.
  const NOTES: Record<string, string> = { local: 'Saved here', waiting: 'Waiting', problem: 'Problem' };
  const tone = $derived(sync.state === 'problem' ? 'problem' : sync.state === 'waiting' || sync.state === 'local' ? 'quiet' : 'calm');
</script>

<SyncCount
  counts={sync.counts}
  busy={sync.state === 'syncing'}
  {tone}
  note={NOTES[sync.state] ?? ''}
  onSync={() => sync.retry()}
  onDetails={() => (ui.settings = 'computer')} />
