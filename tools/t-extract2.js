(async () => {
  const mcu = await import('./vendor/mcu.js');
  const url = 'https://api.qijieya.cn/meting/?server=netease&type=pic&id=109951166033212116';
  const img = await new Promise((resolve) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => resolve(i);
    i.onerror = () => resolve(null);
    i.src = url;
  });
  if (!img) return { error: 'img load fail' };
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  let pixels;
  try { pixels = ctx.getImageData(0, 0, 1, 1).data; } catch (e) { return { error: 'tainted', msg: String(e.message) }; }
  const raw = mcu.sourceColorFromImage(img, { maxImageSize: 64 });
  const isPromise = raw && typeof raw.then === 'function';
  const value = isPromise ? await raw : raw;
  return {
    size: [img.naturalWidth, img.naturalHeight],
    topLeftPixel: Array.from(pixels),
    isPromise,
    argb: value,
    hex: typeof value === 'number' ? mcu.hexFromArgb(value) : String(value),
  };
})()