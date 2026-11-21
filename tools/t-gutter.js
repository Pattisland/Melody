(async () => {
  await new Promise((r) => setTimeout(r, 3000));
  const handle = document.querySelector('.gutter-handle[data-side="left"]');
  if (!handle) return { desktop: false };
  const before = getComputedStyle(document.documentElement).getPropertyValue('--gutter').trim();
  const box = handle.getBoundingClientRect();
  handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: box.left + 8, clientY: 300 }));
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: box.left + 68, clientY: 300 }));
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  const after = getComputedStyle(document.documentElement).getPropertyValue('--gutter').trim();
  const page = document.querySelector('.page').getBoundingClientRect();
  return { before, after, pageLeft: Math.round(page.left), padLeft: getComputedStyle(document.querySelector('.page')).paddingLeft };
})()