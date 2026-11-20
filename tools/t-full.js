(async () => {
  const rows = document.querySelectorAll('[data-track-id]');
  rows[0].click();
  await new Promise((r) => setTimeout(r, 2500));
  document.querySelector('[data-dock-open]').click();
  await new Promise((r) => setTimeout(r, 700));
  document.querySelector('[data-expand]').click();
  await new Promise((r) => setTimeout(r, 900));
  return { mode: document.getElementById('player').className };
})()