/* 我的：资料卡 + 主题 + 来源 + 其它设置入口 */
import { esc, icon, uid } from '../../core/util.js';
import { router } from '../../core/router.js';
import { store } from '../../core/store.js';
import { applyTheme, SEED_PRESETS, VARIANTS, isValidSeed, normalizeSeed } from '../../core/theme.js';
import {
  getProfile, updateProfile, listProfiles, createProfile, deleteProfile,
  saveSettings, saveSetting, ensureActiveProfile, cacheStats,
} from '../../data/repo.js';
import { SOURCES, DEFAULT_ORDER } from '../../sources/registry.js';
import { openDialog, toast, emptyState } from '../components.js';

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
    '<div class="section" style="margin-top:10px">' +
      '<div class="card card--elev" data-open-profile role="button" tabindex="0">' +
        '<div class="row gap-16">' + avatarHtml(profile, true) +
          '<div class="grow"><div class="t-title-l">' + esc((profile && profile.name) || '我的档案') + '</div>' +
          '<div class="t-body-m muted">' + esc(store.state.theme.seed) + ' · ' + profiles.length + ' 个档案</div></div>' +
          icon('edit') +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="section" style="margin-top:14px"><div class="group">' +
      navRow('palette', '主题配色', '莫奈取色 · 深浅色', '/me/theme') +
      navRow('tune', '偏好设置', '播放与界面细节', '/me/prefs') +
      navRow('link', '来源设置', '启用与回退顺序', '/me/sources') +
      navRow('sync', '任务进度', '缓存与解析队列', '/me/tasks') +
    '</div>' +
    '<div class="group">' +
      navRow('download_done', '缓存管理', cached.count + ' 首 · 存在本地', '/me/cache') +
      navRow('storage', '数据管理', '导入导出与清理', '/me/data') +
      navRow('info', '关于 Melody', '版本与技术说明', '/me/about') +
    '</div></div>';

  root.querySelector('[data-open-profile]').addEventListener('click', () => router.go('/me/profile'));
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
    '<div class="stack gap-16" style="align-items:center;padding:16px 0 8px">' +
      '<label data-avatar style="cursor:pointer">' + avatarHtml(profile, true) + '</label>' +
      '<input type="file" accept="image/*" hidden data-avatar-input>' +
      '<div class="t-label-m muted">点击头像更换</div>' +
    '</div>' +
    '<div class="stack gap-16 mt-16">' +
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

  const input = root.querySelector('[data-avatar-input]');
  root.querySelector('[data-avatar]').addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const dataUrl = await readImage(file, 256);
      await updateProfile(profile.id, { avatar: dataUrl });
      const next = await getProfile(profile.id);
      root.querySelector('[data-avatar]').innerHTML = avatarHtml(next, true);
      toast('头像已更新');
    } catch (err) { toast(err.message); }
  });

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
  root.innerHTML =
    '<div class="stack gap-16">' +
      '<div class="section__title">外观模式</div>' +
      '<div class="segmented" data-mode>' +
        ['system', 'light', 'dark'].map((mode) =>
          '<button class="segmented__item" data-value="' + mode + '" aria-selected="' + (theme.mode === mode) + '">' +
          esc({ system: '跟随系统', light: '浅色', dark: '深色' }[mode]) + '</button>').join('') +
      '</div>' +
      '<div class="section__title mt-16">配色方案</div>' +
      '<div class="chip-row" data-variant>' + VARIANTS.map((variant) =>
        '<button class="chip' + (theme.variant === variant.key ? ' chip--selected' : '') + '" data-value="' + variant.key + '" title="' + esc(variant.desc) + '">' + esc(variant.name) + '</button>').join('') + '</div>' +
      '<div class="section__title mt-16">种子色</div>' +
      '<div class="tile-grid" style="grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:12px" data-presets>' +
        SEED_PRESETS.map((preset) =>
          '<button class="preset" data-hex="' + preset.hex + '" title="' + esc(preset.name) + '" style="display:flex;flex-direction:column;align-items:center;gap:6px;background:none;border:0;cursor:pointer">' +
            '<span style="width:48px;height:48px;border-radius:var(--shape-full);background:' + preset.hex + ';box-shadow:' + (theme.seed === preset.hex ? '0 0 0 3px var(--md-sys-color-primary)' : 'none') + '"></span>' +
            '<span class="t-label-s muted">' + esc(preset.name) + '</span>' +
          '</button>').join('') +
      '</div>' +
      '<div class="row gap-8 mt-8">' +
        '<input type="color" data-color value="' + esc(theme.seed) + '" aria-label="自定义颜色" style="width:56px;height:48px;border:0;background:none;padding:0;border-radius:var(--shape-sm)">' +
        '<input class="input" data-hex-input value="' + esc(theme.seed) + '" style="height:48px;flex:1" aria-label="十六进制颜色">' +
        '<button class="btn btn--tonal" data-apply-hex>应用</button>' +
      '</div>' +
      '<p class="t-body-s muted" style="padding:4px 20px 0">封面取色需要封面允许跨源读取。网易云封面通常可以；QQ/酷狗封面偶尔取不到，此时保持你选的颜色。</p>' +
      '<div class="divider"></div>' +
      '<div class="list-item" style="cursor:default"><div class="list-item__art list-item__art--icon">' + icon('palette') + '</div>' +
        '<div class="list-item__body"><div class="list-item__title">跟随封面取色</div>' +
        '<div class="list-item__sub">全局生效：每次切歌都用封面主色重算整套配色' +
        (theme.fromCover && theme.coverSeed ? ' · 当前 ' + esc(theme.coverSeed) : '') + '</div></div>' +
        '<label class="switch"><input type="checkbox" data-cover ' + (theme.fromCover ? 'checked' : '') + '><span class="switch__track"></span><span class="switch__thumb"></span></label>' +
      '</div>' +
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
  root.querySelector('[data-cover]').addEventListener('change', (event) => {
    setTheme({ fromCover: event.target.checked });
  });
}

/* ------------------------------ 来源设置 ------------------------------ */

async function renderSources(root) {
  const settings = store.state.settings;
  const order = (settings['sources.order'] || DEFAULT_ORDER).filter((key) => SOURCES.some((s) => s.key === key));
  for (const source of SOURCES) if (!order.includes(source.key)) order.push(source.key);
  const disabled = new Set(settings['sources.disabled'] || []);

  root.innerHTML =
    '<p class="t-body-m muted" style="padding:0 4px 12px">播放时按下面的顺序回退：某个来源解析失败就换下一个。关闭的来源既不会被搜索，也不会被用于播放。</p>' +
    '<div class="list" data-source-list>' + order.map((key, index) => {
      const source = SOURCES.find((s) => s.key === key);
      if (!source) return '';
      const off = disabled.has(key);
      return '<div class="list-item" style="cursor:default" data-source="' + esc(key) + '">' +
        '<div class="list-item__art list-item__art--icon" style="color:' + source.accent + '">' + icon('album') + '</div>' +
        '<div class="list-item__body"><div class="list-item__title">' + esc(source.label) + (index === 0 ? ' <span class="t-label-s muted">首选</span>' : '') + '</div>' +
        '<div class="list-item__sub">' + esc(source.key) + (off ? ' · 已停用' : '') + '</div></div>' +
        '<div class="list-item__trail">' +
          '<button class="icon-btn" data-up="' + esc(key) + '" aria-label="上移" ' + (index === 0 ? 'disabled' : '') + '>' + icon('arrow_upward', 'icon--20') + '</button>' +
          '<button class="icon-btn" data-down="' + esc(key) + '" aria-label="下移" ' + (index === order.length - 1 ? 'disabled' : '') + '>' + icon('arrow_downward', 'icon--20') + '</button>' +
          '<label class="switch"><input type="checkbox" data-toggle="' + esc(key) + '" ' + (off ? '' : 'checked') + '><span class="switch__track"></span><span class="switch__thumb"></span></label>' +
        '</div></div>';
    }).join('') + '</div>';

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
      '<div class="group__label">外观</div>' +
      '<div class="list-item" style="cursor:default"><div class="list-item__body">' +
        '<div class="list-item__title">列表密度</div><div class="list-item__sub">紧凑会缩小行高与封面</div></div></div>' +
      '<div style="padding:0 20px 12px"><div class="segmented" data-density>' +
        [['comfortable', '舒适'], ['compact', '紧凑']].map(([key, label]) =>
          '<button class="segmented__item" data-value="' + key + '" aria-selected="' + (density === key) + '">' + label + '</button>').join('') +
      '</div></div>' +
      prefSwitch('prefs.reduceMotion', '减少动画', '关掉页面切换与过渡动效', Boolean(settings['prefs.reduceMotion'])) +
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
}

/* ------------------------------ 其它 ------------------------------ */

function renderStub(root, ctx) {
  root.innerHTML = emptyState('construction', '正在施工', '这个页面在下一阶段补上：' + (ctx && ctx.path ? ctx.path : ''));
}

function renderAbout(root) {
  root.innerHTML =
    '<div class="stack gap-16" style="align-items:center;text-align:center;padding:32px 0">' +
      '<img src="./assets/icon.svg" width="72" height="72" alt="">' +
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
  { path: '/me/profile', level: 2, title: '个人资料', mount: renderProfile },
  { path: '/me/theme', level: 2, title: '主题配色', mount: renderTheme },
  { path: '/me/sources', level: 2, title: '来源设置', mount: renderSources },
  { path: '/me/prefs', level: 2, title: '偏好设置', mount: renderPrefs },
  { path: '/me/tasks', level: 2, title: '任务进度', mount: renderStub },
  { path: '/me/data', level: 2, title: '数据管理', mount: renderStub },
  { path: '/me/about', level: 2, title: '关于', mount: renderAbout },
];
