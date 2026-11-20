# Melody

> 在线音乐搜索、播放、收藏与下载。纯静态、零构建、托管于 GitHub Pages。

应用本身**不提供任何内容**：搜索与播放直连第三方公开接口，音频只在你点开时流式取回；
收藏、歌单、历史与缓存在浏览器本地（IndexedDB）持久保存。

## 现在能做什么（P1）

- 搜索：标题 + 搜索框 + 只记录「点开听过」的历史 chips
- 结果：歌曲 / 歌手分栏、跨来源同名同歌手合并、封面懒加载、分页加载更多
- 播放：来源按你设定的顺序回退、迷你条 / 半屏 / 全屏三档、逐句歌词（不滚动）
- 收藏、缓存、下载（mp3 写 ID3v2.4 标签 + 封面 + 歌词，另存 .lrc）
- 多档案切换、主题配色（8 组预设 + 自定义色 + 3 种 M3 变体 + 跟随封面取色）、来源启停与排序
- 深浅色跟随系统、移动端底栏 / 桌面端侧栏

P2/P3 见 [docs/PLAN.md](docs/PLAN.md)。

## 本地运行

```bash
node tools/serve.mjs 5199     # http://127.0.0.1:5199
```

零构建：改完刷新即可。SW 只在非 localhost 注册，本地调试不会被缓存拦。

## 部署

推到 `main` 分支，`.github/workflows/pages.yml` 自动发布到 GitHub Pages。
路由用 hash、资源用相对路径，子路径（`user.github.io/repo/`）和根域都能跑。

## 目录

```
index.html     外壳      css/  令牌与样式      js/  core · data · sources · player · ui · download
vendor/mcu.js  Material Color Utilities（HCT 取色，本地自带）
tools/         本地服务与 CDP 验证脚本（不是产品的一部分）
```

## 音源与现实约束

CORS 是纯静态方案的生死线。内置来源（可在「我的 → 来源设置」启停与排序）：

| key | 曲库 | 接口 |
| --- | --- | --- |
| gd-netease | 网易云 | music-api.gdstudio.xyz |
| qj-tencent | QQ 音乐 | api.qijieya.cn/meting |
| qj-kugou | 酷狗 | 同上 |
| qj-migu | 咪咕 | 同上 |
| audius | Audius（合法全曲） | api.audius.co |

- 音频直链带签名，**从不入库**；只存 `来源 + 曲目 id`，播放时现场解析。
- 公共服务可能临时失效：单个来源失败不影响其它来源，结果页会标明。
- 本项目不含音频内容，也不托管任何音频文件。
