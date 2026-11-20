(async () => {
  const rows = document.querySelectorAll('[data-track-id]');
  if (!rows.length) return { error: 'no rows' };
  rows[0].click();
  await new Promise((r) => setTimeout(r, 3500));
  const audio = document.getElementById('audio');
  const dock = document.getElementById('dock');
  return {
    rows: rows.length,
    src: (audio.src || '').slice(0, 120),
    paused: audio.paused,
    ready: audio.readyState,
    duration: audio.duration,
    err: audio.error ? audio.error.code : null,
    dockHidden: dock.hidden,
    dockText: dock.innerText.replace(/\n/g, ' | ').slice(0, 120),
  };
})()