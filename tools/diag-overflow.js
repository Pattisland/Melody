(() => {
  const vw = document.documentElement.clientWidth;
  const bad = [];
  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.right > vw + 1) bad.push(el.tagName + '.' + String(el.className || '').slice(0, 30) + ' w=' + Math.round(r.width) + ' r=' + Math.round(r.right));
  });
  const page = document.getElementById('page');
  return { vw, sw: document.documentElement.scrollWidth, pageW: page ? Math.round(page.getBoundingClientRect().width) : null, bad: bad.slice(0, 12) };
})()