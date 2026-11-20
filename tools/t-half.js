(async () => {
  document.querySelectorAll('[data-track-id]')[0].click();
  await new Promise((r) => setTimeout(r, 3200));
  document.querySelector('[data-dock-open]').click();
  await new Promise((r) => setTimeout(r, 1000));
  return { mode: document.getElementById('player').className };
})()