/* 页面级数据订阅：根节点被替换后自动解绑，避免监听泄漏 */
const EVENT = 'melody:data';

/**
 * @param {HTMLElement} root 页面根节点
 * @param {() => void} render 重新渲染
 * @param {{kinds?: string[], wait?: number}} options 只关心某些 kind
 */
export function onDataChange(root, render, options = {}) {
  const kinds = options.kinds && options.kinds.length ? options.kinds : null;
  const wait = options.wait || 90;
  let timer = 0;
  const detach = () => {
    clearTimeout(timer);
    document.removeEventListener(EVENT, handler);
  };
  const run = () => {
    timer = 0;
    if (!root.isConnected) { detach(); return; }
    try { render(); } catch (err) { console.error('[live]', err); }
  };
  const handler = (event) => {
    const kind = event.detail && event.detail.kind;
    if (kinds && kind && !kinds.includes(kind)) return;
    clearTimeout(timer);
    timer = setTimeout(run, wait);
  };
  document.addEventListener(EVENT, handler);
  return detach;
}
