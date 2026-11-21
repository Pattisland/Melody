(async () => {
  await new Promise((r) => setTimeout(r, 2400));
  const page = document.querySelector('.page');
  const parent = page.parentElement;
  const cs = getComputedStyle(page);
  return {
    vw: window.innerWidth,
    pageLeft: Math.round(page.getBoundingClientRect().left),
    pageW: Math.round(page.getBoundingClientRect().width),
    padL: cs.paddingLeft, padR: cs.paddingRight,
    maxW: cs.maxWidth, margin: cs.marginLeft,
    parentClass: parent.className,
    parentPadL: getComputedStyle(parent).paddingLeft,
    gutter: getComputedStyle(document.documentElement).getPropertyValue('--gutter').trim(),
  };
})()