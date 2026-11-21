(async () => {
  await new Promise((r) => setTimeout(r, 3200));
  const { player } = await import('./js/player/player.js');
  document.querySelectorAll('[data-track-id]')[0].click();
  await new Promise((r) => setTimeout(r, 4500));
  const audio = document.getElementById('audio');
  const mid = { listenMs: player.listenMs, listenId: player.listenId, paused: audio.paused, current: audio.currentTime, timer: !!player.listenTimer };
  audio.pause();
  await new Promise((r) => setTimeout(r, 1200));
  const { store } = await import('./js/core/store.js');
  const repo = await import('./js/data/repo.js');
  const plays = await repo.listPlays(store.state.profileId, 0);
  const last = plays.sort((a, b) => (a.id || 0) - (b.id || 0)).slice(-1)[0];
  return { mid, afterListenMs: player.listenMs, lastRowMs: last ? last.ms : null };
})()