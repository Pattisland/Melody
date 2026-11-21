(async () => {
  await new Promise((r) => setTimeout(r, 2400));
  const tb = document.querySelector('.topbar');
  const page = document.querySelector('.page');
  const view = document.querySelector('.page-view');
  const box = document.querySelector('[data-search-form]');
  return {
    topbarPadL: getComputedStyle(tb).paddingLeft,
    pagePadL: getComputedStyle(page).paddingLeft,
    viewMaxW: view ? getComputedStyle(view).maxWidth : null,
    formLeft: box ? Math.round(box.getBoundingClientRect().left) : null,
    pageLeft: Math.round(page.getBoundingClientRect().left),
  };
})()