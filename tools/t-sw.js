(async () => {
  const out = { secure: window.isSecureContext, hasSW: 'serviceWorker' in navigator, search: location.search };
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    out.registered = !!reg;
    out.scope = reg.scope;
    out.state = reg.active ? 'active' : reg.installing ? 'installing' : reg.waiting ? 'waiting' : 'unknown';
  } catch (err) {
    out.error = String(err && err.message);
  }
  return out;
})()