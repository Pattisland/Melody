(async () => {
  location.hash = '#/artist/' + encodeURIComponent('周杰伦');
  await new Promise((r) => setTimeout(r, 5200));
  return { hash: location.hash, title: (document.querySelector('.page-title') || {}).textContent, rows: document.querySelectorAll('[data-track-id]').length, status: (document.querySelector('[data-status]') || {}).textContent };
})()