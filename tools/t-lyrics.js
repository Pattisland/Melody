(async () => {
  await new Promise((r) => setTimeout(r, 4000));
  const holder = document.querySelector('[data-lyrics]');
  const track = holder && holder.querySelector('.lyrics-track');
  const title = (document.querySelector('.page-title') || {}).textContent;
  return { title, hasTrack: !!track, lines: track ? track.children.length : 0, transform: track ? track.style.transform : null, activeIdx: track ? Array.from(track.children).findIndex((n) => n.classList.contains('is-active')) : -1 };
})()