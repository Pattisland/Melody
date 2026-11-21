(async () => {
  await new Promise((r) => setTimeout(r, 3000));
  document.querySelector('[data-tab="albums"]')?.click();
  await new Promise((r) => setTimeout(r, 600));
  const names = Array.from(document.querySelectorAll('[data-album] .tile__title')).map((n) => n.textContent.trim());
  return { count: names.length, bad: names.filter((n) => n.includes('object')), first: names.slice(0, 4) };
})()