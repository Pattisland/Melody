(async () => {
  const { store } = await import('./js/core/store.js');
  const rows = document.querySelectorAll('[data-track-id]');
  rows[0].click();
  await new Promise((r) => setTimeout(r, 2200));
  const out = { modeBefore: store.state.player.mode, hasDockOpen: !!document.querySelector('[data-dock-open]'), clsBefore: document.getElementById('player').className };
  const el = document.querySelector('[data-dock-open]');
  if (el) el.click();
  await new Promise((r) => setTimeout(r, 500));
  out.modeAfter = store.state.player.mode;
  out.clsAfter = document.getElementById('player').className;
  out.bodyPlayer = document.body.dataset.player || null;
  return out;
})()