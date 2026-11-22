/* 播放引擎：单 audio 元素 + 队列 + 来源回退 */
import { store } from '../core/store.js';
import { resolveTrack, lyricsFor, artworkFor } from '../sources/registry.js';
import { recordPlay, recordListen, updateListenMs, removeCache } from '../data/repo.js';
import { parseLrc } from './lyrics.js';
import { cacheGet, looksLikeAudio } from './cache.js';

const PLAY_MODES = ['off', 'all', 'one'];

class Player {
  constructor() {
    this.audio = null;
    this.queue = [];
    this.index = -1;
    this.repeat = 'off';
    this.shuffle = false;
    this.shuffleOrder = [];
    this.settings = {};
    this.profileId = null;
    this.lyrics = { trackId: '', text: '', lines: [], loading: false, error: '' };
    this._lastTimeUpdate = 0;
    this._recorded = '';
    this._abort = null;
    this.listenId = null;
    this.listenMs = 0;
    this.listenTimer = 0;
  }

  /** 用播放位置的增量累计真实收听时长：拖动进度条（delta 过大）不计入 */
  accumulateListen() {
    if (!this.audio || this.audio.paused) { this._prevTime = this.audio ? this.audio.currentTime : 0; return; }
    const position = this.audio.currentTime;
    const delta = position - (this._prevTime || 0);
    this._prevTime = position;
    if (delta > 0 && delta < 2) this.listenMs += delta * 1000;
    if (Math.floor(this.listenMs / 20000) > Math.floor((this._prevFlush || 0) / 20000)) {
      this._prevFlush = this.listenMs;
      this.flushListen();
    }
  }

  startListenClock() { this._prevTime = this.audio ? this.audio.currentTime : 0; this._prevFlush = 0; }

  flushListen() {
    if (!this.listenId) return;
    updateListenMs(this.listenId, this.listenMs).catch(() => {});
  }

  stopListenClock() {
    this.flushListen();
  }

  init({ settings, profileId }) {
    this.audio = document.getElementById('audio');
    this.settings = settings;
    this.profileId = profileId;
    const audio = this.audio;

    audio.addEventListener('play', () => {
      store.patch('player', { playing: true });
      this.startListenClock();
      this.syncMediaState('playing');
    });
    audio.addEventListener('pause', () => {
      store.patch('player', { playing: false });
      this.stopListenClock();
      this.syncMediaState('paused');
    });
    audio.addEventListener('waiting', () => store.patch('player', { loading: true }));
    audio.addEventListener('canplay', () => store.patch('player', { loading: false }));
    audio.addEventListener('playing', () => store.patch('player', { loading: false, error: null }));
    audio.addEventListener('durationchange', () => {
      if (Number.isFinite(audio.duration)) store.patch('player', { duration: audio.duration });
    });
    audio.addEventListener('timeupdate', () => {
      const now = performance.now();
      if (now - this._lastTimeUpdate < 200) return;
      this._lastTimeUpdate = now;
      this.syncMediaState(null);
      store.patch('player', { current: audio.currentTime });
      this.accumulateListen();
      if (this.profileId && store.state.player.track && this._recorded !== store.state.player.track.id + ':' + Math.floor(audio.currentTime / 20)) {
        this._recorded = store.state.player.track.id + ':' + Math.floor(audio.currentTime / 20);
        recordPlay(this.profileId, store.state.player.track).catch(() => {});
      }
    });
    audio.addEventListener('ended', () => { this.stopListenClock(); this.handleEnded(); });
    audio.addEventListener('error', () => {
      // 缓存文件坏了：删掉它并用网络重放一次，而不是一直卡在错误上
      if (this._fromCache && this.track) {
        const track = this.track;
        this._fromCache = false;
        removeCache(this.profileId, track.id).catch(() => {});
        store.patch('player', { error: null, loading: true });
        this.playTrack(track, { ignoreCache: true, queue: this.queue }).catch(() => {});
        return;
      }
      const code = audio.error ? audio.error.code : 0;
      const message = code === 4
        ? '这个来源取不到能播放的地址'
        : code === 3
          ? '音源解码失败，换一个来源试试'
          : code === 2
            ? '网络中断，音频没下下来'
            : '音频加载失败';
      store.patch('player', { error: message, playing: false, loading: false });
    });
    this.bindKeys();
    window.addEventListener('pagehide', () => this.flushListen());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.flushListen(); });
    this.bindMediaSession();
    store.patch('player', { repeat: this.repeat, shuffle: this.shuffle });
  }

  /** 全局快捷键：空格播放/暂停，←→ ±5s，↑↓ 音量，M 静音，F 收藏 */
  bindKeys() {
    if (this._keysBound) return;
    this._keysBound = true;
    document.addEventListener('keydown', (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      if (!this.track || !this.audio) return;
      switch (event.key) {
        case ' ':
        case 'Spacebar':
          event.preventDefault();
          this.toggle();
          break;
        case 'ArrowRight':
          if (this.audio.duration) {
            event.preventDefault();
            this.audio.currentTime = Math.min(this.audio.duration - 0.2, this.audio.currentTime + 5);
          }
          break;
        case 'ArrowLeft':
          event.preventDefault();
          this.audio.currentTime = Math.max(0, this.audio.currentTime - 5);
          break;
        case 'ArrowUp':
          event.preventDefault();
          this.setVolume(Math.min(1, (this.audio.volume || 0) + 0.05));
          break;
        case 'ArrowDown':
          event.preventDefault();
          this.setVolume(Math.max(0, (this.audio.volume || 0) - 0.05));
          break;
        case 'm':
        case 'M':
          this.audio.muted = !this.audio.muted;
          break;
        case 'f':
        case 'F': {
          const fav = document.querySelector('.player.is-open [data-fav]');
          if (fav) fav.click();
          break;
        }
        default:
          break;
      }
    });
  }

  bindMediaSession() {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler('play', () => this.resume());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.prev());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (typeof details.seekTime === 'number') this.seekTo(details.seekTime);
      });
    } catch (_) { /* 部分浏览器不支持 */ }
  }

  updateMediaSession(track) {
    if (!('mediaSession' in navigator) || !track) return;
    try {
      // 多个尺寸的封面，锁屏/通知栏会自己挑合适的一张
      const artwork = [];
      [96, 240, 480].forEach((size) => {
        const url = artworkFor(track, size);
        if (url && !artwork.some((item) => item.src === url)) artwork.push({ src: url, sizes: size + 'x' + size });
      });
      if (!artwork.length) {
        const url = artworkFor(track);
        if (url) artwork.push({ src: url, sizes: '480x480' });
      }
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album || '',
        artwork,
      });
      this.syncMediaState(this.audio && this.audio.paused ? 'paused' : 'playing');
    } catch (_) { /* ignore */ }
  }

  /** 锁屏/通知栏的播放状态与进度 */
  syncMediaState(state) {
    if (!('mediaSession' in navigator)) return;
    try { if (state) navigator.mediaSession.playbackState = state; } catch (_) { /* ignore */ }
    try {
      if (!navigator.mediaSession.setPositionState || !this.audio) return;
      const duration = this.audio.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;
      navigator.mediaSession.setPositionState({
        duration,
        position: Math.min(Math.max(this.audio.currentTime || 0, 0), duration),
        playbackRate: this.audio.playbackRate || 1,
      });
    } catch (_) { /* 部分浏览器不支持 */ }
  }

  async playTrack(track, options = {}) {
    this.track = track;
    if (!track) return;
    if (options.queue) {
      this.queue = options.queue.slice();
      this.index = this.queue.findIndex((item) => item.id === track.id);
      if (this.index < 0) { this.queue.unshift(track); this.index = 0; }
      this.rebuildShuffle();
      store.patch('player', { queue: this.queue.slice(), index: this.index });
    } else if (!this.queue.length) {
      this.queue = [track];
      this.index = 0;
      store.patch('player', { queue: this.queue.slice(), index: 0 });
    }
    store.patch('player', { track, loading: true, error: null, current: 0, duration: track.duration || 0 });
    this.stopListenClock();
    this.listenId = null;
    this.listenMs = 0;
    if (this.profileId) {
      recordListen(this.profileId, track)
        .then((id) => { this.listenId = id; })
        .catch(() => {});
    }
    this.updateMediaSession(track);
    this.lyrics = { trackId: track.id, text: '', lines: [], loading: true, error: '' };

    if (this._abort) this._abort.abort();
    this._abort = new AbortController();

    try {
      let cached = options.ignoreCache || options.forceSource ? null : await cacheGet(this.profileId, track.id);
      // 旧版本可能把错误页存成了音频：发现不像音频就丢掉，改走网络
      if (cached && !(await looksLikeAudio(cached))) {
        removeCache(this.profileId, track.id).catch(() => {});
        cached = null;
      }
      this._fromCache = Boolean(cached);
      if (!cached && typeof navigator !== 'undefined' && navigator.onLine === false) {
        store.patch('player', { error: '离线中，这首还没有缓存', loading: false, playing: false });
        return;
      }
      let url = '';
      let sourceKey = 'cache';
      let sourceLabel = '本地缓存';
      let fallback = false;
      if (cached) {
        url = URL.createObjectURL(cached);
        sourceKey = 'cache';
      } else {
        const resolved = await resolveTrack(track, this.settings, { signal: this._abort.signal, prefer: options.forceSource });
        url = resolved.url;
        sourceKey = resolved.sourceKey;
        sourceLabel = resolved.label || resolved.sourceKey;
        fallback = (resolved.attempt || 0) > 0;
      }
      if (store.state.player.track !== track) return;
      store.patch('player', { sourceKey, sourceLabel, fallback });
      this.audio.src = url;
      this.audio.load();
      await this.audio.play().catch((err) => {
        if (!err || err.name === 'AbortError') return;
        if (err.name === 'NotAllowedError') { store.patch('player', { error: '需要点击后才能播放', loading: false }); return; }
        const unsupported = err.name === 'NotSupportedError' || /no supported source/i.test(err.message || '');
        store.patch('player', {
          error: unsupported ? '这个来源取不到能播放的地址' : (err.message || '播放失败'),
          loading: false,
        });
      });
      store.patch('player', { playing: true });
      this.loadLyrics(track);
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      store.patch('player', { error: err.message || '取流失败', loading: false, playing: false });
    }
  }

  /** 换歌词源或重新拉一次歌词 */
  async reloadLyrics(track) {
    const target = track || this.track;
    if (!target) return;
    this.lyrics = { trackId: target.id, text: '', lines: [], loading: true, error: '' };
    store.set({ player: { ...store.state.player } }, 'lyrics');
    await this.loadLyrics(target);
  }

  async loadLyrics(track) {
    try {
      const text = await lyricsFor(track, this.settings);
      if (!store.state.player.track || store.state.player.track.id !== track.id) return;
      this.lyrics = { trackId: track.id, text: text || '', lines: parseLrc(text), loading: false, error: text ? '' : '暂无歌词' };
    } catch (_) {
      this.lyrics = { trackId: track.id, text: '', lines: [], loading: false, error: '歌词加载失败' };
    }
    store.set({ player: { ...store.state.player } }, 'lyrics');
  }

  toggle(track) {
    if (track && (!store.state.player.track || store.state.player.track.id !== track.id)) {
      return this.playTrack(track);
    }
    if (!this.audio || !this.audio.src) return;
    if (this.audio.paused) this.resume();
    else this.pause();
  }

  resume() { if (this.audio) this.audio.play().catch(() => {}); }
  pause() { if (this.audio) this.audio.pause(); }

  seekTo(seconds) {
    if (!this.audio || !Number.isFinite(seconds)) return;
    this.audio.currentTime = Math.max(0, Math.min(seconds, this.audio.duration || 0));
    store.patch('player', { current: this.audio.currentTime });
  }

  setVolume(value) {
    if (!this.audio) return;
    this.audio.volume = Math.max(0, Math.min(1, value));
    store.patch('player', { volume: this.audio.volume });
  }

  setRepeat(mode) {
    this.repeat = PLAY_MODES.includes(mode) ? mode : 'off';
    store.patch('player', { repeat: this.repeat });
  }

  cycleRepeat() {
    const next = PLAY_MODES[(PLAY_MODES.indexOf(this.repeat) + 1) % PLAY_MODES.length];
    this.setRepeat(next);
    return next;
  }

  toggleShuffle() {
    this.shuffle = !this.shuffle;
    this.rebuildShuffle();
    store.patch('player', { shuffle: this.shuffle });
    return this.shuffle;
  }

  rebuildShuffle() {
    this.shuffleOrder = this.queue.map((_, i) => i);
    if (!this.shuffle) return;
    for (let i = this.shuffleOrder.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = this.shuffleOrder[i];
      this.shuffleOrder[i] = this.shuffleOrder[j];
      this.shuffleOrder[j] = tmp;
    }
  }

  nextIndex() {
    if (!this.queue.length) return -1;
    if (this.shuffle) {
      const pos = this.shuffleOrder.indexOf(this.index);
      if (pos >= 0 && pos < this.shuffleOrder.length - 1) return this.shuffleOrder[pos + 1];
      if (this.repeat === 'all') return this.shuffleOrder[0];
      return -1;
    }
    if (this.index < this.queue.length - 1) return this.index + 1;
    if (this.repeat === 'all') return 0;
    return -1;
  }

  prevIndex() {
    if (!this.queue.length) return -1;
    if (this.shuffle) {
      const pos = this.shuffleOrder.indexOf(this.index);
      if (pos > 0) return this.shuffleOrder[pos - 1];
      if (this.repeat === 'all') return this.shuffleOrder[this.shuffleOrder.length - 1];
      return -1;
    }
    if (this.index > 0) return this.index - 1;
    if (this.repeat === 'all') return this.queue.length - 1;
    return -1;
  }

  next(auto = false) {
    if (auto && this.repeat === 'one') {
      this.seekTo(0);
      this.resume();
      return;
    }
    const target = this.nextIndex();
    if (target < 0) { store.patch('player', { playing: false }); return; }
    this.index = target;
    store.patch('player', { index: target, queue: this.queue.slice() });
    this.playTrack(this.queue[target], { queue: this.queue });
  }

  prev() {
    if (this.audio && this.audio.currentTime > 3) { this.seekTo(0); return; }
    const target = this.prevIndex();
    if (target < 0) { this.seekTo(0); return; }
    this.index = target;
    store.patch('player', { index: target });
    this.playTrack(this.queue[target], { queue: this.queue });
  }

  handleEnded() {
    if (this.repeat === 'one') { this.seekTo(0); this.resume(); return; }
    this.next(true);
  }

  playAt(index) {
    if (index < 0 || index >= this.queue.length) return;
    this.index = index;
    this.playTrack(this.queue[index], { queue: this.queue });
  }

  /** 从队列里删掉一首（不动正在播放的那首） */
  removeFromQueue(trackId) {
    const target = this.queue.findIndex((item) => item.id === trackId);
    if (target < 0 || target === this.index) return false;
    const currentId = this.queue[this.index] ? this.queue[this.index].id : '';
    this.queue.splice(target, 1);
    this.index = this.queue.findIndex((item) => item.id === currentId);
    this.rebuildShuffle();
    store.patch('player', { queue: this.queue.slice(), index: this.index });
    return true;
  }

  /** 清空接下来：只保留当前这首 */
  clearUpcoming() {
    const current = this.queue[this.index];
    this.queue = current ? [current] : [];
    this.index = current ? 0 : -1;
    this.rebuildShuffle();
    store.patch('player', { queue: this.queue.slice(), index: this.index });
  }

  setMode(mode) { store.patch('player', { mode }); }

  setSettings(settings) { this.settings = settings; }
}
export const player = new Player();
