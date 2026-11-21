(async () => {
  await new Promise((r) => setTimeout(r, 3500));
  const rows = Array.from(document.querySelectorAll('[data-track-id]'));
  const target = rows.find((row) => row.querySelector('.list-item__title').textContent.includes('不曾忘记')) || rows.find((row) => row.querySelector('.list-item__art img'));
  if (!target) return { error: 'no row' };
  const listSrc = target.querySelector('.list-item__art img')?.getAttribute('data-src') || target.querySelector('.list-item__art img')?.getAttribute('src') || '';
  target.click();
  await new Promise((r) => setTimeout(r, 2800));
  document.querySelector('[data-dock-open]').click();
  await new Promise((r) => setTimeout(r, 2500));
  const img = document.querySelector('.player__cover img');
  return {
    title: target.querySelector('.list-item__title').textContent.trim().slice(0, 20),
    listSrc: listSrc.slice(-46),
    playerDataSrc: img ? (img.dataset.src || '').slice(-46) : null,
    playerSrc: img ? (img.getAttribute('src') || '').slice(0, 30) : null,
    loaded: img ? img.classList.contains('is-loaded') : false,
    nat: img ? img.naturalWidth : 0,
  };
})()