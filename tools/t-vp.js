(async () => {
  const out = { innerWidth: window.innerWidth, mq: window.matchMedia('(min-width: 840px)').matches };
  const res = await fetch('https://api.qijieya.cn/meting/?server=tencent&type=search&id=%E5%91%A8%E6%9D%B0%E4%BC%A6&limit=2');
  const json = await res.json();
  out.sample = json && json[0];
  return out;
})()