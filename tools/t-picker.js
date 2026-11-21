(async () => {
  await new Promise((r) => setTimeout(r, 3000));
  const row = document.querySelector('[data-track-id]');
  const rect = row.getBoundingClientRect();
  row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: rect.left + 80, clientY: rect.top + 40 }));
  await new Promise((r) => setTimeout(r, 400));
  const menu = document.querySelector('.menu--popover');
  const addItem = Array.from(document.querySelectorAll('.menu__item')).find((b) => /加入歌单/.test(b.textContent));
  if (addItem) addItem.click();
  await new Promise((r) => setTimeout(r, 600));
  const second = document.querySelector('.menu--popover');
  return { firstMenu: !!menu, secondMenu: !!second, items: second ? Array.from(second.querySelectorAll('.menu__label')).map((n) => n.textContent) : [] };
})()