(async () => {
  const { store } = await import('./js/core/store.js');
  const reg = await import('./js/sources/registry.js');
  const p = store.state.player;
  const out = { track: p.track && p.track.title, loading: p.loading, error: p.error, srcSet: !!document.getElementById('audio').src, queue: p.queue.length };
  if (p.track) {
    try {
      const t0 = Date.now();
      const r = await reg.resolveTrack(p.track, store.state.settings);
      out.resolve = { ms: Date.now() - t0, sourceKey: r.sourceKey, url: r.url.slice(0, 90) };
      const res = await fetch(r.url, { method: 'GET', headers: { Range: 'bytes=0-1024' } });
      out.fetch = { status: res.status, type: res.headers.get('content-type'), acao: res.headers.get('access-control-allow-origin') };
    } catch (e) { out.resolveError = String(e && e.message); }
  }
  return out;
})()