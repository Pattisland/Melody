(async () => {
  await new Promise((r) => setTimeout(r, 3500));
  const rows = Array.from(document.querySelectorAll('[data-track-id]'));
  const target = rows.find((row) => row.querySelector('.list-item__title').textContent.includes('不曾忘记'));
  if (!target) return { error: 'no row' };
  target.click();
  await new Promise((r) => setTimeout(r, 2800));
  document.querySelector('[data-dock-open]').click();
  await new Promise((r) => setTimeout(r, 2000));
  const { store } = await import('./js/core/store.js');
  const reg = await import('./js/sources/registry.js');
  const track = store.state.player.track;
  const box = document.querySelector('.player__cover');
  return {
    title: track && track.title,
    artwork: track && track.artwork,
    refs: track && track.sources.map((s) => ({ s: s.source, art: s.artwork || null })),
    candidates120: track ? reg.artworkCandidates(track, 120) : [],
    candidatesRaw: track ? reg.artworkCandidates(track) : [],
    boxHTML: box ? box.innerHTML.slice(0, 320) : null,
  };
})()