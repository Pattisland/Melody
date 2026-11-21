/* 任务进度：缓存队列 */
import { esc, icon, fmtBytes } from '../../core/util.js';
import { store } from '../../core/store.js';
import { listTasks, pauseAll, resumeAll, cancelTask, retryTask, removeTask, clearFinished } from '../../player/queue.js';
import { coverMarkup } from '../cover.js';
import { emptyState } from '../components.js';

const LABEL = { running: '缓存中', waiting: '等待中', done: '已完成', failed: '失败', cancelled: '已取消' };
let unsub = null;

function speedOf(task) {
  if (task.status !== 'running' || !task.startedAt || !task.received) return '';
  const seconds = (Date.now() - task.startedAt) / 1000;
  if (seconds < 0.6) return '';
  return fmtBytes(task.received / seconds) + '/s';
}

function sizeText(task) {
  if (task.total) return fmtBytes(task.received) + ' / ' + fmtBytes(task.total);
  if (task.received) return fmtBytes(task.received);
  return '';
}

function rowHTML(task) {
  const percent = task.total ? Math.min(100, Math.round((task.received / task.total) * 100)) : 0;
  const actions = [];
  if (task.status === 'running' || task.status === 'waiting') {
    actions.push('<button class="icon-btn" data-act="cancel" data-id="' + esc(task.id) + '" aria-label="取消">' + icon('close') + '</button>');
  }
  if (task.status === 'failed' || task.status === 'cancelled') {
    actions.push('<button class="icon-btn" data-act="retry" data-id="' + esc(task.id) + '" aria-label="重试">' + icon('refresh') + '</button>');
  }
  if (task.status !== 'running') {
    actions.push('<button class="icon-btn" data-act="remove" data-id="' + esc(task.id) + '" aria-label="移除">' + icon('delete') + '</button>');
  }
  const sub = [LABEL[task.status] || '', sizeText(task), speedOf(task), task.error || ''].filter(Boolean).join(' · ');
  const indeterminate = !task.total;
  const bar = task.status === 'running' || task.status === 'waiting'
    ? '<div class="task-row__progress' + (indeterminate ? ' is-indet' : '') + '"><span data-bar style="width:' + (indeterminate ? 40 : percent) + '%"></span></div>'
    : '';
  return '<div class="list-item task-row" data-task="' + esc(task.id) + '" data-status="' + task.status + '">' +
    '<div class="list-item__art">' + icon('music_note') + coverMarkup(task.track, { size: 120 }) + '</div>' +
    '<div class="list-item__body">' +
      '<div class="list-item__title">' + esc(task.track.title) + '</div>' +
      '<div class="list-item__sub" data-sub>' + esc(sub) + '</div>' +
      bar +
    '</div>' +
    '<div class="list-item__trail" data-pct>' + (task.total && task.status === 'running' ? percent + '%' : '') + actions.join('') + '</div>' +
  '</div>';
}

function render(root) {
  const tasks = listTasks();
  const running = tasks.filter((task) => task.status === 'running' || task.status === 'waiting');
  const failed = tasks.filter((task) => task.status === 'failed' || task.status === 'cancelled');
  const done = tasks.filter((task) => task.status === 'done');
  const paused = store.state.tasks.paused;

  root.innerHTML =
    '<div class="row gap-8" style="justify-content:flex-end;padding:4px 4px 12px">' +
      (running.length ? '<button class="btn btn--text btn--sm" data-pause>' + icon(paused ? 'play_arrow' : 'pause') + (paused ? '继续' : '全部暂停') + '</button>' : '') +
      (tasks.some((task) => task.status !== 'running' && task.status !== 'waiting') ? '<button class="btn btn--text btn--sm" data-clear>清理已结束</button>' : '') +
    '</div>' +
    (tasks.length === 0
      ? emptyState('download_done', '队列是空的', '在曲目菜单里点「加入缓存队列」，这里有进度和重试')
      : '<div class="group">' +
          '<div class="group__label">进行中 · ' + running.length + '</div>' +
          (running.length ? '<div class="list">' + running.map(rowHTML).join('') + '</div>' : '<div class="state-hint">没有进行中的任务</div>') +
        '</div>' +
        (failed.length ? '<div class="group"><div class="group__label">失败 · ' + failed.length + '</div><div class="list">' + failed.map(rowHTML).join('') + '</div></div>' : '') +
        (done.length ? '<div class="group"><div class="group__label">已完成 · ' + done.length + '</div><div class="list">' + done.map(rowHTML).join('') + '</div></div>' : ''));

  root.querySelector('[data-pause]')?.addEventListener('click', () => {
    if (store.state.tasks.paused) resumeAll(); else pauseAll();
    render(root);
  });
  root.querySelector('[data-clear]')?.addEventListener('click', () => { clearFinished(); render(root); });
  root.querySelectorAll('[data-act]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.id;
      if (button.dataset.act === 'cancel') cancelTask(id);
      else if (button.dataset.act === 'retry') retryTask(id);
      else if (button.dataset.act === 'remove') removeTask(id);
      render(root);
    });
  });
}

function update(root) {
  const tasks = listTasks();
  const key = tasks.map((task) => task.id + ':' + task.status).join('|') + '|' + (store.state.tasks.paused ? 'p' : '');
  if (root.dataset.key !== key) {
    root.dataset.key = key;
    render(root);
    return;
  }
  for (const task of tasks) {
    const row = root.querySelector('[data-task="' + CSS.escape(task.id) + '"]');
    if (!row) continue;
    const percent = task.total ? Math.min(100, Math.round((task.received / task.total) * 100)) : 0;
    const track = row.querySelector('.task-row__progress');
    const bar = row.querySelector('[data-bar]');
    if (track) track.classList.toggle('is-indet', !task.total);
    if (bar) bar.style.width = (!task.total ? 40 : percent) + '%';
    const pct = row.querySelector('[data-pct]');
    if (pct && task.status === 'running' && task.total) {
      const first = pct.firstChild;
      if (first && first.nodeType === 3) first.textContent = percent + '%';
    }
    const sub = row.querySelector('[data-sub]');
    if (sub) {
      sub.textContent = [LABEL[task.status] || '', sizeText(task), speedOf(task), task.error || ''].filter(Boolean).join(' · ');
    }
  }
}

export async function mountTasks(root) {
  render(root);
  if (unsub) unsub();
  unsub = store.subscribe((state, changed) => {
    if (!changed.includes('tasks')) return;
    update(root);
  });
}

export const tasksRoute = { path: '/me/tasks', level: 2, title: '任务进度', mount: mountTasks };
