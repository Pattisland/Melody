(async () => {
  await new Promise((r) => setTimeout(r, 3000));
  document.querySelectorAll('[data-track-id]')[0].click();
  await new Promise((r) => setTimeout(r, 2200));
  const { player } = await import('./js/player/player.js');
  const before = { muted: player.audio.muted, volume: Number(player.audio.volume.toFixed(2)), live: (document.querySelector('[data-live]') || {}).textContent };
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  return { before, after: { muted: player.audio.muted, volume: Number(player.audio.volume.toFixed(2)) } };
})()