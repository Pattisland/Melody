(async () => {
  await new Promise((r) => setTimeout(r, 2600));
  const rows = Array.from(document.querySelectorAll('[data-track-id]'));
  const withArt = rows.find((row) => row.querySelector('.list-item__art img'));
  (withArt || rows[0]).click();
  await new Promise((r) => setTimeout(r, 3000));
  const dock = document.querySelector('[data-dock-open]');
  if (dock) dock.click();
  await new Promise((r) => setTimeout(r, 1800));
  const img = document.querySelector('.player__cover img');
  return {
    mode: document.getElementById('player').className,
    hadArtInList: !!withArt,
    cover: img ? { loaded: img.classList.contains('is-loaded'), hasSrc: !!img.getAttribute('src'), src: (img.getAttribute('src') || '').slice(-30) } : null,
  };
})()