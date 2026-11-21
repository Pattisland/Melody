(async () => {
  await new Promise((r) => setTimeout(r, 3000));
  const rows = Array.from(document.querySelectorAll('[data-track-id]'));
  const withArt = rows.find((row) => row.querySelector('.list-item__art img'));
  (withArt || rows[0]).click();
  await new Promise((r) => setTimeout(r, 2600));
  document.querySelector('[data-dock-open]').click();
  await new Promise((r) => setTimeout(r, 1800));
  const { store } = await import('./js/core/store.js');
  const reg = await import('./js/sources/registry.js');
  const track = store.state.player.track;
  const box = document.querySelector('.player__cover');
  return {
    title: track && track.title,
    artwork: track ? track.artwork : null,
    candidates: track ? reg.artworkCandidates(track, 200) : [],
    boxHTML: box ? box.innerHTML.slice(0, 240) : null,
    tint: document.getElementById('player').style.getPropertyValue('--md-sys-color-primary'),
    listImg: withArt ? withArt.querySelector('.list-item__art img').getAttribute('src') : null,
  };
})()