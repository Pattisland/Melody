(async () => {
  await new Promise((r) => setTimeout(r, 3000));
  const rows = Array.from(document.querySelectorAll('[data-track-id]'));
  const withArt = rows.find((row) => row.querySelector('.list-item__art img'));
  (withArt || rows[0]).click();
  await new Promise((r) => setTimeout(r, 2600));
  document.querySelector('[data-dock-open]').click();
  await new Promise((r) => setTimeout(r, 6000));
  const img = document.querySelector('.player__cover img');
  return img ? { src: (img.getAttribute('src') || '').slice(0, 50), complete: img.complete, nat: img.naturalWidth, loaded: img.classList.contains('is-loaded'), ready: img.dataset.ready || null } : 'no-img';
})()