/* 我的：资料卡 + 主题 + 来源 + 其它设置入口 */
import { esc, icon, uid } from '../../core/util.js';
import { router } from '../../core/router.js';
import { store } from '../../core/store.js';
import { applyTheme, SEED_PRESETS, VARIANTS, isValidSeed, normalizeSeed } from '../../core/theme.js';
import {
  getProfile, updateProfile, listProfiles, createProfile, deleteProfile,
  saveSettings, saveSetting, ensureActiveProfile, cacheStats,
} from '../../data/repo.js';
import { SOURCES, DEFAULT_ORDER, sourceHealth } from '../../sources/registry.js';
import * as idb from '../../data/db.js';
import { mountTasks } from './tasks.js';
import { saveBlob } from '../../download/download.js';
import { openDialog, toast, emptyState } from '../components.js';

/* 设置项之间互相跳转：半透明分组 + 主题色文字链接，不做外链 */
const SETTINGS_PAGES = [
  { path: '/me/prefs', label: '偏好设置' },
  { path: '/me/theme', label: '主题配色' },
  { path: '/me/sources', label: '来源设置' },
  { path: '/me/data', label: '数据管理' },
  { path: '/me/profile', label: '档案管理' },
  { path: '/me/cache', label: '缓存管理' },
];

function mountLookElsewhere(root, currentPath) {
  if (!root) return;
  const items = SETTINGS_PAGES.filter((item) => item.path !== currentPath);
  if (!items.length) return;
  const host = document.createElement('section');
  host.className = 'lookalike';
  host.setAttribute('aria-label', '您是否在找');
  host.innerHTML = '<div class="lookalike__title">您是否在找？</div>' +
    '<div class="lookalike__links">' + items.map((item) =>
      '<button class="lookalike__link" type="button" data-goto="' + esc(item.path) + '">' + esc(item.label) + '</button>').join('') +
    '</div>';
  host.querySelectorAll('[data-goto]').forEach((button) => {
    button.addEventListener('click', () => router.go(button.dataset.goto));
  });
  root.appendChild(host);
}

function avatarHtml(profile, large) {
  const size = large ? 'avatar avatar--lg' : 'avatar';
  if (profile && profile.avatar) return '<div class="' + size + '"><img src="' + esc(profile.avatar) + '" alt=""></div>';
  const name = (profile && profile.name) || '我';
  return '<div class="' + size + '">' + esc(name.slice(0, 1).toUpperCase()) + '</div>';
}

function navRow(iconName, title, hint, route, trailing) {
  return '<div class="list-item" data-route="' + esc(route) + '" role="button" tabindex="0">' +
    '<div class="list-item__art list-item__art--icon">' + icon(iconName) + '</div>' +
    '<div class="list-item__body"><div class="list-item__title">' + esc(title) + '</div>' +
    (hint ? '<div class="list-item__sub">' + esc(hint) + '</div>' : '') + '</div>' +
    '<div class="list-item__trail">' + (trailing || icon('chevron_right')) + '</div></div>';
}

async function renderMe(root) {
  const profile = await getProfile(store.state.profileId);
  const profiles = await listProfiles();
  const cached = await cacheStats(store.state.profileId);
  root.innerHTML =
    '<h1 class="page-title">设置</h1>' +
    '<div class="section" style="margin-top:16px"><div class="group">' +
      navRow('palette', '主题配色', '莫奈取色 · 深浅色', '/me/theme') +
      navRow('tune', '偏好设置', '播放与界面细节', '/me/prefs') +
      navRow('link', '来源设置', '启用与回退顺序', '/me/sources') +
      navRow('sync', '任务进度', '缓存与解析队列', '/me/tasks') +
    '</div>' +
    '<div class="group">' +
      navRow('download_done', '缓存管理', cached.count + ' 首 · 存在本地', '/me/cache') +
      navRow('storage', '数据管理', '档案、导入导出与清理', '/me/data') +
      navRow('info', '关于 Melody', '版本与技术说明', '/me/about') +
    '</div></div>';

  root.querySelectorAll('[data-route]').forEach((row) => row.addEventListener('click', () => router.go(row.dataset.route)));
}

/* ------------------------------ 个人资料 ------------------------------ */

function readImage(file, max) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.onerror = () => reject(new Error('图片读取失败'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

async function renderProfile(root) {
  const profile = await getProfile(store.state.profileId);
  const profiles = await listProfiles();
  root.innerHTML =
    '<div class="stack gap-16">' +
      '<label class="field"><span class="field__label">档案名称</span>' +
      '<input class="input" data-name value="' + esc((profile && profile.name) || '') + '" maxlength="24" placeholder="给这个档案起个名字"></label>' +
      '<button class="btn btn--filled btn--block" data-save>保存</button>' +
    '</div>' +
    '<div class="section"><div class="section__head"><span class="section__title">全部档案</span>' +
      '<button class="btn btn--text btn--sm" data-new>' + icon('add') + '新建</button></div>' +
      '<div class="list">' + profiles.map((row) =>
        '<div class="list-item" data-switch="' + esc(row.id) + '" role="button" tabindex="0">' +
          avatarHtml(row, false) +
          '<div class="list-item__body"><div class="list-item__title">' + esc(row.name) + '</div>' +
          '<div class="list-item__sub">' + (row.id === store.state.profileId ? '当前档案' : '点击切换') + '</div></div>' +
          (row.id === store.state.profileId ? '<div class="list-item__trail">' + icon('check') + '</div>' : '') +
        '</div>').join('') + '</div>' +
      (profiles.length > 1 ? '<div class="mt-16"><button class="btn btn--text" data-delete style="color:var(--md-sys-color-error)">删除当前档案</button></div>' : '') +
    '</div>';

  root.querySelector('[data-save]').addEventListener('click', async () => {
    const name = root.querySelector('[data-name]').value.trim();
    if (!name) { toast('名字不能为空'); return; }
    await updateProfile(profile.id, { name });
    const profilesNext = await listProfiles();
    store.set({ profiles: profilesNext });
    toast('已保存');
  });

  root.querySelectorAll('[data-switch]').forEach((row) => {
    row.addEventListener('click', async () => {
      const id = row.dataset.switch;
      if (id === store.state.profileId) return;
      await saveSetting('profile.active', id);
      const result = await ensureActiveProfile();
      store.set({ profileId: result.profile.id, profiles: result.profiles });
      toast('已切换到「' + result.profile.name + '」');
      router.go('/me');
    });
  });

  root.querySelector('[data-new]').addEventListener('click', () => {
    openDialog({
      title: '新建档案',
      body: '<label class="field"><span class="field__label">档案名称</span><input class="input" data-new-name placeholder="例如：我的、同桌的"></label>',
      actions: [
        { label: '取消', variant: 'text' },
        { label: '创建', variant: 'filled', onClick: async (dialog) => {
          const name = dialog.querySelector('[data-new-name]').value.trim();
          if (!name) { toast('名字不能为空'); return false; }
          const created = await createProfile(name);
          await saveSetting('profile.active', created.id);
          const result = await ensureActiveProfile();
          store.set({ profileId: result.profile.id, profiles: result.profiles });
          toast('已创建并切换');
          router.go('/me');
        } },
      ],
    });
  });

  const del = root.querySelector('[data-delete]');
  if (del) del.addEventListener('click', () => {
    openDialog({
      title: '删除当前档案？',
      description: '这个档案的收藏、歌单、历史与缓存都会一起删除，且不可恢复。',
      actions: [
        { label: '取消', variant: 'text' },
        { label: '删除', variant: 'danger', onClick: async () => {
          await deleteProfile(store.state.profileId);
          const result = await ensureActiveProfile();
          store.set({ profileId: result.profile.id, profiles: result.profiles });
          toast('已删除');
          router.go('/me');
        } },
      ],
    });
  });
}

/* ------------------------------ 主题配色 ------------------------------ */

async function setTheme(patch) {
  const next = { ...store.state.theme, ...patch };
  store.set({ theme: next });
  applyTheme(next);
  await saveSettings({
    'theme.seed': next.seed,
    'theme.mode': next.mode,
    'theme.variant': next.variant,
    'theme.fromCover': next.fromCover,
  });
}

async function renderTheme(root) {
  const theme = store.state.theme;
  const settings = store.state.settings;
  root.innerHTML =
    '<div class="group">' +
      '<div class="group__label">外观</div>' +
      '<div class="theme-block">' +
        '<div class="segmented" data-mode style="width:100%">' +
          [['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']].map(([mode, label]) =>
            '<button class="segmented__item" data-value="' + mode + '" aria-selected="' + (theme.mode === mode) + '">' + label + '</button>').join('') +
        '</div>' +
        '<div class="theme-row"><span class="theme-row__label">配色方案</span>' +
          '<div class="chip-row" data-variant>' + VARIANTS.map((variant) =>
            '<button class="chip' + (theme.variant === variant.key ? ' chip--selected' : '') + '" data-value="' + variant.key + '" title="' + esc(variant.desc) + '">' + esc(variant.name) + '</button>').join('') +
          '</div></div>' +
      '</div>' +
    '</div>' +
    '<div class="group">' +
      '<div class="group__label">种子色</div>' +
      '<div class="theme-block">' +
        '<div class="swatches" data-presets>' + SEED_PRESETS.map((preset) =>
          '<button class="swatch' + (theme.seed === preset.hex ? ' is-active' : '') + '" data-hex="' + preset.hex + '" title="' + esc(preset.name) + '">' +
            '<span class="swatch__dot" style="background:' + preset.hex + '"></span>' +
            '<span class="swatch__name">' + esc(preset.name) + '</span>' +
          '</button>').join('') + '</div>' +
        '<div class="theme-row">' +
          '<input type="color" class="theme-color" data-color value="' + esc(theme.seed) + '" aria-label="自定义颜色">' +
          '<input class="input theme-hex" data-hex-input value="' + esc(theme.seed) + '" aria-label="十六进制颜色">' +
          '<button class="btn btn--tonal btn--sm" data-apply-hex>应用</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="group">' +
      '<div class="group__label">封面取色</div>' +
      prefSwitch('prefs.playerTint', '播放器跟随封面取色', '展开播放器时用封面主色重算整套配色，收起后恢复', settings['prefs.playerTint'] !== false) +
      prefSwitch('prefs.tintGlobal', '全局跟随封面取色', '整个应用跟着当前封面换色（不只是播放器）；开启后播放器强制取色', Boolean(settings['prefs.tintGlobal'])) +
      '<p class="t-body-s muted" style="padding:4px 20px 14px">封面没有取到主色时沿用上面的种子色。更多动作与外观选项在「偏好设置」。</p>' +
      '<div class="list-item" data-goto-prefs role="button" tabindex="0">' +
        '<div class="list-item__art list-item__art--icon">' + icon('tune') + '</div>' +
        '<div class="list-item__body"><div class="list-item__title">偏好设置</div>' +
        '<div class="list-item__sub">列表密度、动效、模糊背景、缓存并发</div></div>' +
        '<div class="list-item__trail">' + icon('chevron_right') + '</div></div>' +
    '</div>';

  root.querySelectorAll('[data-mode] .segmented__item').forEach((button) => {
    button.addEventListener('click', () => { setTheme({ mode: button.dataset.value }); renderTheme(root); });
  });
  root.querySelectorAll('[data-variant] .chip').forEach((button) => {
    button.addEventListener('click', () => { setTheme({ variant: button.dataset.value }); renderTheme(root); });
  });
  root.querySelectorAll('[data-presets] [data-hex]').forEach((button) => {
    button.addEventListener('click', () => { setTheme({ seed: button.dataset.hex }); renderTheme(root); });
  });
  const color = root.querySelector('[data-color]');
  const hexInput = root.querySelector('[data-hex-input]');
  color.addEventListener('input', () => { hexInput.value = color.value; });
  color.addEventListener('change', () => { setTheme({ seed: normalizeSeed(color.value) }); renderTheme(root); });
  root.querySelector('[data-apply-hex]').addEventListener('click', () => {
    if (!isValidSeed(hexInput.value)) { toast('颜色格式应为 #rrggbb'); return; }
    setTheme({ seed: normalizeSeed(hexInput.value) });
    renderTheme(root);
  });
  root.querySelectorAll('[data-pref]').forEach((input) => {
    input.addEventListener('change', async () => {
      await saveSettings({ [input.dataset.pref]: input.checked });
      store.set({ settings: { ...store.state.settings, [input.dataset.pref]: input.checked } });
    });
  });
  const goPrefs = root.querySelector('[data-goto-prefs]');
  if (goPrefs) goPrefs.addEventListener('click', () => router.go('/me/prefs'));
  mountLookElsewhere(root, '/me/theme');
}

/* ------------------------------ 来源设置 ------------------------------ */

async function renderSources(root) {
  const settings = store.state.settings;
  const order = (settings['sources.order'] || DEFAULT_ORDER).filter((key) => SOURCES.some((s) => s.key === key));
  for (const source of SOURCES) if (!order.includes(source.key)) order.push(source.key);
  const disabled = new Set(settings['sources.disabled'] || []);

  const healthText = (key) => {
    const row = sourceHealth(key);
    if (!row.ok && !row.fails) return '还没试过';
    if (row.fails >= 3 && row.ok === 0) return '最近一直失败';
    if (row.fails > row.ok) return '不太稳定';
    return '正常';
  };

  root.innerHTML =
    '<p class="t-body-m muted" style="padding:0 4px 12px">播放时按下面的顺序回退：某个来源解析失败就换下一个。关闭的来源既不会被搜索，也不会被用于播放。</p>' +
    '<div class="group"><div class="group__label">来源顺序</div>' +
      '<div class="list" data-source-list>' + order.map((key, index) => {
        const source = SOURCES.find((s) => s.key === key);
        if (!source) return '';
        const off = disabled.has(key);
        return '<div class="list-item source-row" style="cursor:default" data-source="' + esc(key) + '">' +
          '<div class="list-item__art list-item__art--icon source-row__art" style="color:' + source.accent + '">' + icon('graphic_eq') + '</div>' +
          '<div class="list-item__body"><div class="list-item__title">' + esc(source.label) +
            (index === 0 && !off ? '<span class="chip chip--xs">首选</span>' : '') +
            (off ? '<span class="chip chip--xs chip--muted">已停用</span>' : '') + '</div>' +
          '<div class="list-item__sub">' + healthText(key) + ' · ' + esc(source.key) + '</div></div>' +
          '<div class="list-item__trail source-row__actions">' +
            '<button class="icon-btn" data-up="' + esc(key) + '" aria-label="上移" ' + (index === 0 ? 'disabled' : '') + '>' + icon('arrow_upward', 'icon--20') + '</button>' +
            '<button class="icon-btn" data-down="' + esc(key) + '" aria-label="下移" ' + (index === order.length - 1 ? 'disabled' : '') + '>' + icon('arrow_downward', 'icon--20') + '</button>' +
            '<label class="switch"><input type="checkbox" data-toggle="' + esc(key) + '" ' + (off ? '' : 'checked') + ' aria-label="启用 ' + esc(source.label) + '"><span class="switch__track"></span><span class="switch__thumb"></span></label>' +
          '</div></div>';
      }).join('') + '</div>' +
    '</div>';

  async function persist(nextOrder, nextDisabled) {
    store.patch('sources', { order: nextOrder, disabled: nextDisabled });
    store.patch('settings', { 'sources.order': nextOrder, 'sources.disabled': nextDisabled });
    await saveSettings({ 'sources.order': nextOrder, 'sources.disabled': nextDisabled });
    renderSources(root);
  }

  root.querySelectorAll('[data-up]').forEach((button) => button.addEventListener('click', () => {
    const key = button.dataset.up;
    const index = order.indexOf(key);
    if (index <= 0) return;
    const next = order.slice();
    next.splice(index - 1, 0, next.splice(index, 1)[0]);
    persist(next, Array.from(disabled));
  }));
  root.querySelectorAll('[data-down]').forEach((button) => button.addEventListener('click', () => {
    const key = button.dataset.down;
    const index = order.indexOf(key);
    if (index < 0 || index >= order.length - 1) return;
    const next = order.slice();
    next.splice(index + 1, 0, next.splice(index, 1)[0]);
    persist(next, Array.from(disabled));
  }));
  root.querySelectorAll('[data-toggle]').forEach((input) => input.addEventListener('change', () => {
    const key = input.dataset.toggle;
    const next = new Set(disabled);
    if (input.checked) next.delete(key); else next.add(key);
    if (next.size === order.length) { toast('至少保留一个来源'); input.checked = true; return; }
    persist(order, Array.from(next));
  }));
  mountLookElsewhere(root, '/me/sources');
}

/* ------------------------------ 偏好设置 ------------------------------ */

function prefSwitch(key, label, hint, value) {
  return '<div class="list-item" style="cursor:default">' +
    '<div class="list-item__body"><div class="list-item__title">' + esc(label) + '</div>' +
    '<div class="list-item__sub">' + esc(hint) + '</div></div>' +
    '<label class="switch"><input type="checkbox" data-pref="' + esc(key) + '"' + (value ? ' checked' : '') + '>' +
    '<span class="switch__track"></span><span class="switch__thumb"></span></label></div>';
}

async function renderPrefs(root) {
  const settings = store.state.settings;
  const density = settings['prefs.density'] || 'comfortable';
  root.innerHTML =
    '<div class="group">' +
      '<div class="group__label">播放器</div>' +
      prefSwitch('prefs.blurBg', '模糊封面背景', '用当前封面的模糊图垫在全屏播放器后面', settings['prefs.blurBg'] !== false) +
      prefSwitch('prefs.notifyCache', '完成提示', '缓存与下载结束时提示一条', settings['prefs.notifyCache'] !== false) +
    '</div>' +
    '<div class="group">' +
      '<div class="list-item" data-goto-theme role="button" tabindex="0">' +
        '<div class="list-item__art list-item__art--icon">' + icon('palette') + '</div>' +
        '<div class="list-item__body"><div class="list-item__title">配色与主题</div>' +
        '<div class="list-item__sub">深色模式、配色方案、种子色、封面取色</div></div>' +
        '<div class="list-item__trail">' + icon('chevron_right') + '</div></div>' +
      '<div class="group__label">外观</div>' +
      '<div class="list-item" style="cursor:default"><div class="list-item__body">' +
        '<div class="list-item__title">列表密度</div><div class="list-item__sub">紧凑会缩小行高与封面</div></div></div>' +
      '<div style="padding:0 20px 12px"><div class="segmented" data-density>' +
        [['comfortable', '舒适'], ['compact', '紧凑']].map(([key, label]) =>
          '<button class="segmented__item" data-value="' + key + '" aria-selected="' + (density === key) + '">' + label + '</button>').join('') +
      '</div></div>' +
      prefSwitch('prefs.reduceMotion', '减少动画', '关掉页面切换与过渡动效', Boolean(settings['prefs.reduceMotion'])) +
    '</div>' +
    '<div class="group">' +
      '<div class="group__label">缓存</div>' +
      '<div class="list-item" style="cursor:default"><div class="list-item__body">' +
        '<div class="list-item__title">同时缓存数量</div>' +
        '<div class="list-item__sub">网络不稳时调小，越大多占带宽</div></div></div>' +
      '<div style="padding:0 20px 14px"><div class="segmented" data-concurrency style="width:100%">' +
        [1, 2, 3, 4].map((n) =>
          '<button class="segmented__item" data-value="' + n + '" aria-selected="' + (Number(settings['prefs.cacheConcurrency'] || 2) === n) + '">' + n + '</button>').join('') +
      '</div></div>' +
    '</div>';

  async function set(key, value) {
    await saveSettings({ [key]: value });
    store.set({ settings: { ...store.state.settings, [key]: value } });
  }

  root.querySelectorAll('[data-pref]').forEach((input) => {
    input.addEventListener('change', () => set(input.dataset.pref, input.checked));
  });
  root.querySelectorAll('[data-density] .segmented__item').forEach((button) => {
    button.addEventListener('click', async () => { await set('prefs.density', button.dataset.value); renderPrefs(root); });
  });
  const goTheme = root.querySelector('[data-goto-theme]');
  if (goTheme) goTheme.addEventListener('click', () => router.go('/me/theme'));
  root.querySelectorAll('[data-concurrency] .segmented__item').forEach((button) => {
    button.addEventListener('click', async () => { await set('prefs.cacheConcurrency', Number(button.dataset.value)); renderPrefs(root); });
  });
  mountLookElsewhere(root, '/me/prefs');
}

/* ------------------------------ 数据管理 ------------------------------ */

async function renderData(root) {
  const profileId = store.state.profileId;
  const profiles = await listProfiles();
  const current = profiles.find((row) => row.id === profileId);
  const currentName = (current && current.name) || '我的档案';
  root.innerHTML =
    '<div class="group">' +
      '<div class="group__label">档案</div>' +
      navRow('person', '档案管理', profiles.length + ' 个档案 · 新建 / 切换 / 重命名', '/me/profile') +
      '<div class="list-item" data-act="rename-profile" role="button" tabindex="0">' +
        '<div class="list-item__art list-item__art--icon">' + icon('edit') + '</div>' +
        '<div class="list-item__body"><div class="list-item__title">重命名当前档案</div>' +
        '<div class="list-item__sub">' + esc(currentName) + '</div></div></div>' +
    '</div>' +
    '<div class="group">' +
      '<div class="group__label">数据</div>' +
      '<div class="list-item" data-act="export" role="button" tabindex="0">' +
        '<div class="list-item__art list-item__art--icon">' + icon('file_download') + '</div>' +
        '<div class="list-item__body"><div class="list-item__title">导出配置</div>' +
        '<div class="list-item__sub">档案、设置、收藏与歌单（不含音频）</div></div>' +
        '<div class="list-item__trail">' + icon('chevron_right') + '</div></div>' +
      '<div class="list-item" data-act="import" role="button" tabindex="0">' +
        '<div class="list-item__art list-item__art--icon">' + icon('file_upload') + '</div>' +
        '<div class="list-item__body"><div class="list-item__title">导入配置</div>' +
        '<div class="list-item__sub">用之前导出的 JSON 覆盖档案、设置、收藏与歌单</div></div>' +
        '<div class="list-item__trail">' + icon('chevron_right') + '</div></div>' +
      '<div class="list-item" data-act="cleanthumbs" role="button" tabindex="0">' +
        '<div class="list-item__art list-item__art--icon">' + icon('cleaning_services') + '</div>' +
        '<div class="list-item__body"><div class="list-item__title">清理临时缓存</div>' +
        '<div class="list-item__sub">封面缩略图与取色结果（不影响已缓存的歌曲）</div></div>' +
        '<div class="list-item__trail">' + icon('chevron_right') + '</div></div>' +
      '<div class="list-item" data-act="reset" role="button" tabindex="0">' +
        '<div class="list-item__art list-item__art--icon">' + icon('restart_alt') + '</div>' +
        '<div class="list-item__body"><div class="list-item__title">恢复默认设置</div>' +
        '<div class="list-item__sub">保留档案与歌曲数据，只重置设置项</div></div>' +
        '<div class="list-item__trail">' + icon('chevron_right') + '</div></div>' +
    '</div>' +
    '<input type="file" accept="application/json,.json" hidden data-import-file>' +
    '<div class="group group--danger">' +
      '<div class="group__label">危险操作</div>' +
      '<div class="list-item" data-act="wipe" role="button" tabindex="0">' +
        '<div class="list-item__art list-item__art--icon" style="color:var(--md-sys-color-error)">' + icon('delete_forever') + '</div>' +
        '<div class="list-item__body"><div class="list-item__title" style="color:var(--md-sys-color-error)">清空全部数据</div>' +
        '<div class="list-item__sub">档案、收藏、歌单、历史、缓存全部删除，不可恢复</div></div>' +
        '<div class="list-item__trail">' + icon('chevron_right') + '</div></div>' +
    '</div>';

  root.querySelectorAll('[data-route]').forEach((row) => row.addEventListener('click', () => router.go(row.dataset.route)));
  const importInput = root.querySelector('[data-import-file]');
  importInput.addEventListener('change', async () => {
    const file = importInput.files && importInput.files[0];
    importInput.value = '';
    if (!file) return;
    let payload;
    try {
      payload = JSON.parse(await file.text());
    } catch (err) {
      toast('不是有效的 JSON 文件');
      return;
    }
    if (!payload || payload.app !== 'Melody') {
      toast('不是 Melody 的备份文件');
      return;
    }
    const counts = [
      (payload.profiles || []).length + ' 个档案',
      (payload.favorites || []).length + ' 条收藏',
      (payload.playlists || []).length + ' 个歌单',
    ].join(' · ');
    openDialog({
      title: '导入配置？',
      description: '会覆盖当前的档案、设置、收藏与歌单（已缓存的音频不受影响）。导入内容：' + counts,
      actions: [
        { label: '取消', variant: 'text' },
        { label: '覆盖导入', variant: 'filled', onClick: async () => {
          try {
            const names = ['profiles', 'favorites', 'playlists', 'playlistItems'];
            await Promise.all(names.map((name) => idb.clear(name)));
            await idb.clear('settings');
            for (const name of names) {
              if (Array.isArray(payload[name]) && payload[name].length) await idb.putAll(name, payload[name]);
            }
            if (Array.isArray(payload.settings) && payload.settings.length) await idb.putAll('settings', payload.settings);
            toast('导入完成，正在刷新…');
            setTimeout(() => location.reload(), 700);
          } catch (err) {
            toast('导入失败：' + err.message);
          }
        } },
      ],
    });
  });

  root.querySelectorAll('[data-act]').forEach((row) => row.addEventListener('click', async () => {
    const act = row.dataset.act;
    if (act === 'import') { importInput.click(); return; }
    if (act === 'rename-profile') {
      openDialog({
        title: '重命名档案',
        body: '<label class="field"><span class="field__label">档案名称</span>' +
          '<input class="input" data-name value="' + esc(currentName) + '" maxlength="24"></label>',
        actions: [
          { label: '取消', variant: 'text' },
          { label: '保存', variant: 'filled', onClick: async (dialog) => {
            const name = dialog.querySelector('[data-name]').value.trim();
            if (!name) { toast('名字不能为空'); return false; }
            await updateProfile(profileId, { name });
            store.set({ profiles: await listProfiles() });
            toast('已重命名');
            router.render();
          } },
        ],
      });
      return;
    }
    if (act === 'export') {
      const [allProfiles, settingsRows, favorites, playlists, items] = await Promise.all([
        listProfiles(),
        idb.all('settings'),
        idb.all('favorites'),
        idb.all('playlists'),
        idb.all('playlistItems'),
      ]);
      const payload = { app: 'Melody', version: 1, exportedAt: new Date().toISOString(), profiles: allProfiles, settings: settingsRows, favorites, playlists, playlistItems: items };
      saveBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), 'melody-backup-' + new Date().toISOString().slice(0, 10) + '.json');
      toast('已导出配置');
      return;
    }
    if (act === 'cleanthumbs') {
      await Promise.all([idb.clear('thumbs'), idb.clear('colors')]);
      toast('临时缓存已清理');
      return;
    }
    if (act === 'reset') {
      openDialog({
        title: '恢复默认设置？',
        description: '档案、收藏、歌单与缓存都会保留，只把主题、偏好与来源设置恢复默认。',
        actions: [
          { label: '取消', variant: 'text' },
          { label: '恢复', variant: 'filled', onClick: async () => {
            await idb.clear('settings');
            toast('设置已恢复默认，正在刷新…');
            setTimeout(() => location.reload(), 600);
          } },
        ],
      });
      return;
    }
    if (act === 'wipe') {
      openDialog({
        title: '清空全部数据？',
        description: '包括所有档案、收藏、歌单、历史与已缓存的音频，且无法恢复。',
        actions: [
          { label: '取消', variant: 'text' },
          { label: '永久删除', variant: 'danger', onClick: async () => {
            await idb.destroyDb();
            toast('已清空，正在刷新…');
            setTimeout(() => location.reload(), 600);
          } },
        ],
      });
    }
  }));
  mountLookElsewhere(root, '/me/data');
}

/* ------------------------------ 其它 ------------------------------ */

function renderStub(root, ctx) {
  root.innerHTML =
    '<div class="group">' +
      '<div class="group__label">任务</div>' +
      '<div class="state-hint" style="padding:28px 20px">缓存队列还没开始做，下一版会给出真正的任务列表（并发、暂停、重试）。</div>' +
    '</div>';
}

function renderAbout(root) {
  root.innerHTML =
    '<div class="stack gap-16" style="align-items:center;text-align:center;padding:32px 0">' +
      '<span class="icon about-mark" aria-hidden="true">music_note</span>' +
      '<div class="t-headline-s">Melody</div>' +
      '<div class="t-body-m muted">在线音乐搜索 · 播放 · 收藏<br>纯静态，托管于 GitHub Pages</div>' +
    '</div>' +
    '<div class="group">' +
      '<div class="list-item" style="cursor:default"><div class="list-item__body"><div class="list-item__title">数据存放</div><div class="list-item__sub">全部保存在你的浏览器（IndexedDB）</div></div></div>' +
      '<div class="list-item" style="cursor:default"><div class="list-item__body"><div class="list-item__title">内容来源</div><div class="list-item__sub">应用不存储任何音频，播放与缓存均直连第三方公开接口</div></div></div>' +
      '<div class="list-item" style="cursor:default"><div class="list-item__body"><div class="list-item__title">版本</div><div class="list-item__sub">0.1.0 · P1</div></div></div>' +
    '</div>';
}

export const meRoutes = [
  { path: '/me', level: 1, title: '我的', mount: renderMe },
  { path: '/me/profile', level: 2, title: '档案管理', mount: renderProfile },
  { path: '/me/theme', level: 2, title: '主题配色', mount: renderTheme },
  { path: '/me/sources', level: 2, title: '来源设置', mount: renderSources },
  { path: '/me/prefs', level: 2, title: '偏好设置', mount: renderPrefs },
  { path: '/me/tasks', level: 2, title: '任务进度', mount: mountTasks },
  { path: '/me/data', level: 2, title: '数据管理', mount: renderData },
  { path: '/me/about', level: 2, title: '关于', mount: renderAbout },
];