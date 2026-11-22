/* 播放失败时选来源：居中模态框，列出这首先前记录的来源与健康度 */
import { esc, icon } from '../core/util.js';
import { openDialog, toast } from './components.js';
import { SOURCE_BY_KEY, sourceHealth } from '../sources/registry.js';
import { player } from '../player/player.js';

function healthText(key) {
  const row = sourceHealth(key);
  if (!row.ok && !row.fails) return '还没试过';
  const label = row.fails >= 3 && row.ok === 0 ? '最近一直失败' : row.fails > row.ok ? '不太稳定' : '正常';
  return label + ' · 成功 ' + row.ok + ' / 失败 ' + row.fails;
}

export function openSourcePicker(track) {
  if (!track) return null;
  const refs = (track.sources || []).slice();
  const rows = refs.map((ref) => {
    const source = SOURCE_BY_KEY.get(ref.source);
    const label = source ? source.label : ref.source;
    const accent = source ? source.accent : 'currentColor';
    return '<div class="list-item" style="cursor:default">' +
      '<div class="list-item__art list-item__art--icon" style="color:' + accent + '">' + icon('graphic_eq') + '</div>' +
      '<div class="list-item__body"><div class="list-item__title">' + esc(label) + '</div>' +
      '<div class="list-item__sub">' + esc(healthText(ref.source)) + '</div></div>' +
      '<div class="list-item__trail"><button class="btn btn--tonal btn--sm" data-use="' + esc(ref.source) + '">用这个</button></div>' +
      '</div>';
  }).join('');

  const dialog = openDialog({
    title: '换个来源试试',
    description: refs.length ? '这首先前没取到可播放的地址。挑一个来源重新取流，或者让它自动再试一次。' : '这首先没有任何可用来源记录，可以回到搜索页换一个版本。',
    body: rows ? '<div class="list">' + rows + '</div>' : '',
    actions: [
      { label: '关闭', variant: 'text' },
      { label: '自动重试', variant: 'filled', onClick: () => {
        player.playTrack(track, { forceSource: '' });
        toast('正在重新取流…');
      } },
    ],
  });

  dialog.element.querySelectorAll('[data-use]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.use;
      dialog.close();
      toast('正在用 ' + ((SOURCE_BY_KEY.get(key) || {}).label || key) + ' 重新取流…');
      player.playTrack(track, { forceSource: key });
    });
  });
  return dialog;
}
