(async () => {
  await new Promise((r) => setTimeout(r, 2600));
  const page = document.querySelector('.page');
  const title = document.querySelector('.search-page > .page-title');
  const form = document.querySelector('[data-search-form]');
  return {
    gutter: getComputedStyle(document.documentElement).getPropertyValue('--gutter').trim(),
    pageW: Math.round(page.getBoundingClientRect().width),
    maxW: getComputedStyle(page).maxWidth,
    gapTitleToForm: title && form ? Math.round(form.getBoundingClientRect().top - title.getBoundingClientRect().bottom) : null,
  };
})()