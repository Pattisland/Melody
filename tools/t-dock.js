(async () => {
  await new Promise((r) => setTimeout(r, 2400));
  const dock = document.querySelector('.dock__inner');
  const fab = document.querySelector('.fab');
  const page = document.querySelector('.page');
  return {
    dockPadL: dock ? getComputedStyle(dock).paddingLeft : null,
    dockMaxW: dock ? getComputedStyle(dock).maxWidth : null,
    fabRight: fab ? getComputedStyle(fab).right : null,
    pagePadL: getComputedStyle(page).paddingLeft,
    gutter: getComputedStyle(document.documentElement).getPropertyValue('--gutter').trim(),
  };
})()