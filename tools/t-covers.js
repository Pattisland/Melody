(async () => {
  await new Promise((r) => setTimeout(r, 3500));
  const rows = Array.from(document.querySelectorAll('[data-track-id]')).slice(0, 6);
  return rows.map((row) => {
    const img = row.querySelector('.list-item__art img');
    return {
      title: row.querySelector('.list-item__title').textContent.trim().slice(0, 12),
      hasImg: !!img,
      src: img ? (img.getAttribute('src') || '').slice(0, 42) : '',
      dataSrc: img ? (img.dataset.src || '').slice(0, 42) : '',
      loaded: img ? img.classList.contains('is-loaded') : false,
      complete: img ? img.complete : false,
      nat: img ? img.naturalWidth : 0,
    };
  });
})()