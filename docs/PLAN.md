# Melody · 方案与决策

> 纯静态、零构建、托管在 GitHub Pages 的在线音乐客户端。
> 本文是**唯一事实来源**：设计稿里没写死的地方，以这里为准；改了这里再改代码。

## 一、已定决策

| 项 | 决定 | 理由 |
| --- | --- | --- |
| 技术底座 | 原生 ES Module + 手写 CSS，**零构建** | 上一个 Melody 死于构建摩擦；改完刷新即见效 |
| 路由 | hash（`#/xxx`），资源全用相对路径 | GH Pages 子路径/根域都能跑，无需 404 重写 |
| 用户数据 | 纯 IndexedDB，`navigator.storage.persist()` | 离线应用，数据留在浏览器，持久保存 |
| 档案 | **多档案可切换**，每档案独立收藏/歌单/历史/缓存 | 用户明确要求 |
| 下载 | 缓存原样导出 + 纯 JS 写 ID3v2.4 标签/封面/歌词 | 零体积、瞬间完成；不引入 ffmpeg.wasm |
| 主题 | MCU（HCT/CAM16）算全量 MD3 角色，亮/暗两套；3 种变体 | 与官方配色自洽，非「换变量」 |
| 命名 | 产品名 Melody；代码无框架、无运行时依赖 | — |

## 二、技术事实（2026-11 实测，非推测）

CORS 是纯静态方案的生死线，下面每条都实测过：

| 端点 | 用途 | ACAO | 实测 |
| --- | --- | --- | --- |
| `music-api.gdstudio.xyz/api.php` | 聚合：search/url/lyric/pic | `*` | netease 2.2s ✓，joox ✓，kugou 503，其余 source 不支持 |
| `api.qijieya.cn/meting/` | 聚合：search/url/lrc/pic | `*` | tencent 4.9s ✓、kugou ✓、migu ✓；**netease 搜索已失效**（返回空）；url 仍 302 |
| `api.audius.co/v1` | 合法免费全曲 | `*` | trending/search/stream ✓ |
| 网易云音频 CDN | 取流+缓存 | `*` | 206 + Content-Range ✓，不校验 Referer/UA |
| `itunes.apple.com/search` | 元数据/封面兜底 | 未确认 | 仅 30s 试听，暂不入主链路 |

**结论：** 浏览器可直接搜索→取流→fetch 缓存，不需要任何后端。
来源层必须是**可插拔注册表**，某个实例挂了只影响自己那一路。

## 三、来源模型

```
SourceAdapter { key, label, kind, search(q,page) -> {items,isEnd}, resolve(track) -> url, lyric(track) -> lrc }
```

内置来源（可在「来源设置」里单独启停、拖拽回退顺序）：

1. `gd-netease` 网易云（GDStudio）—— 中文曲库主力
2. `qj-tencent` QQ 音乐（qijieya）—— 网易云缺歌时的回退
3. `qj-kugou` / `qj-migu` —— 补充
4. `audius` —— 合法全曲，英文/电子

**合并去重**：规范化（去 `(Live)`/`[feat.]`/全角括号/大小写/空格/标点）后的 `title|primaryArtist`
相同即视为同一首，合成一个 `TrackGroup`，播放时按用户回退顺序挑第一个解析成功的来源。
**绝不持久化播放直链**——CDN 直链带签名，几小时失效；只存 `sourceKey + sourceId`。

## 四、路由表

| 路由 | 页面 | 层级 | 底栏 |
| --- | --- | --- | --- |
| `#/search` | 搜索（首页）：标题 + 搜索框 + 历史 chips | 1 | 显示 |
| `#/search?q=` | 搜索结果：歌曲/歌手分栏 | 2 | 移动端隐藏（桌面常驻） |
| `#/library` | 曲库：系统歌单 + 自定义歌单 | 1 | 显示 |
| `#/library/recent\|favorites\|cache` | 系统歌单详情 | 2 | 同上 |
| `#/library/p/:id` | 自定义歌单 | 2 | 同上 |
| `#/me` | 我的：资料卡 + 设置入口 | 1 | 显示 |
| `#/me/profile\|theme\|prefs\|sources\|tasks\|data\|about` | 二级设置页 | 2 | 同上 |

播放器不是路由，是**三档抽屉**（mini / half / full），mini 常驻浮于底栏之上，展开盖住底栏。

## 五、数据模型（IndexedDB `melody`）

| store | key | 内容 |
| --- | --- | --- |
| `profiles` | id | 名字、头像 blob、创建时间 |
| `tracks` | trackId | 规范化标题/歌手/专辑/时长/封面/各来源条目 |
| `favorites` | `${profileId}:${trackId}` | 收藏 |
| `playlists` | id | 自定义歌单（归属档案） |
| `playlistItems` | `${playlistId}:${trackId}` | 歌单项 + 顺序 |
| `history` | 自增 | 播放历史 |
| `searches` | `${profileId}:${term}` | **只有点过的**搜索词 |
| `cached` | `${profileId}:${trackId}` | 缓存元数据 |
| `blobs` | 同上 | 音频二进制（单独 store，避免列表查询扛 blob） |
| `settings` | key | 主题/偏好/来源顺序（全局或按档案） |

`trackId` = 规范化 `title|artist` 的稳定哈希 → 天然跨来源同一首歌。

## 六、目录

```
index.html            应用外壳（不渲染业务内容）
manifest.webmanifest  PWA
sw.js                 离线壳（网络优先 + 缓存兜底）
css/tokens.css        M3 令牌（形状/字阶/高度/动效/状态层）
css/tokens.generated.css  颜色角色，由 tools/gen-tokens.mjs 生成
css/app.css           布局与组件
js/core/              router / store / theme / util
js/data/              db（IndexedDB 封装）/ repo（领域操作）
js/sources/           注册表 + 各适配器 + 跨源合并
js/player/            播放器、队列、歌词
js/ui/                shell / pages / components / icons
js/download/          ID3v2.4 写入
tools/                生成脚本与验证脚本（不是产品的一部分）
```

## 七、阶段

- **P1（当前）** 外壳 + M3 设计系统 + 搜索首页 + 结果页 + 跨源合并 + 播放 + mini bar
- **P2** 曲库、收藏、歌单、缓存（IndexedDB + 进度）、下载（ID3）
- **P3** 我的：多档案、主题、偏好、来源设置、任务、数据管理、关于
- **P4** 离线、动画打磨、无障碍、性能
