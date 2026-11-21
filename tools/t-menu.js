(async () => {
  await new Promise((r) => setTimeout(r, 3000));
  const more = document.querySelector('[data-more]');
  if (more) more.click();
  await new Promise((r) => setTimeout(r, 600));
  const pop = document.querySelector('.menu--popover');
  return { popover: !!pop, items: pop ? pop.querySelectorAll('.menu__item').length : 0 };
})()