(async () => {
  await new Promise((r) => setTimeout(r, 3200));
  document.querySelectorAll('[data-track-id]')[0].click();
  await new Promise((r) => setTimeout(r, 2600));
  const dock = document.querySelector('.dock');
  const r = dock.getBoundingClientRect();
  return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), vw: window.innerWidth };
})()