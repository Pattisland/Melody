(async () => {
  const mod = await import('./js/sources/registry.js');
  const t0 = Date.now();
  try {
    const r = await mod.searchAll('周杰伦', { settings: {}, page: 1, limit: 20 });
    return { ms: Date.now() - t0, tracks: r.tracks.length, okCount: r.okCount, failed: r.failed, first: r.tracks[0] && { t: r.tracks[0].title, a: r.tracks[0].artist, art: r.tracks[0].artwork } };
  } catch (e) { return { error: String(e && e.message), ms: Date.now() - t0 }; }
})()