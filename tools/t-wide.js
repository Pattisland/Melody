(async () => {
  await new Promise((r) => setTimeout(r, 2600));
  const page = document.querySelector('.page').getBoundingClientRect();
  const recs = document.querySelector('[data-recs]').getBoundingClientRect();
  const main = document.querySelector('.home-main').getBoundingClientRect();
  return {
    pageW: Math.round(page.width), pageLeft: Math.round(page.left),
    mainLeft: Math.round(main.left), mainRight: Math.round(main.right),
    recsW: Math.round(recs.width),
    viewport: window.innerWidth,
  };
})()