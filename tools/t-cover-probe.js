(async () => {
  const mcu = await import('./vendor/mcu.js');
  const urls = Array.from(document.querySelectorAll('.list-item__art img')).slice(0, 5).map((i) => i.src);
  const out = [];
  for (const url of urls) {
    const host = (() => { try { return new URL(url).host; } catch (e) { return url.slice(0, 40); } })();
    const res = await new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const t = setTimeout(() => resolve({ host, status: 'timeout' }), 9000);
      img.onload = () => {
        clearTimeout(t);
        try { const argb = mcu.sourceColorFromImage(img, { maxImageSize: 64 }); resolve({ host, status: 'ok', color: mcu.hexFromArgb(argb) }); }
        catch (e) { resolve({ host, status: 'tainted', err: String(e && e.message).slice(0, 60) }); }
      };
      img.onerror = () => { clearTimeout(t); resolve({ host, status: 'load-fail' }); };
      img.src = url;
    });
    out.push(res);
  }
  return out;
})()