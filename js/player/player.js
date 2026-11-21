/* 播放引擎：单 audio 元素 + 队列 + 来源回退 */
import { store } from '../core/store.js';
import { resolveTrack, lyricsFor, artworkFor } from '../sources/registry.js';
import { recordPlay, recordListen } from '../data/repo.js';
import { parseLrc } from './lyrics.js';
import { cacheGet } from './cache.js';

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
    this.lyrics = { trackId: '', lines: [], loading: false, error: '' };
    this._lastTimeUpdate = 0;
    this._recorded = '';
    this._abort = null;
  }

  init({ settings, profileId }) {
    this.audio = document.getElementById('audio');
    this.settings = settings;
    this.profileId = profileId;
    const audio = this.audio;

    audio.addEventListener('play', () => store.patch('player', { playing: true }));
    audio.addEventListener('pause', () => store.patch('player', { playing: false }));
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
      store.patch('player', { current: audio.currentTime });
      if (this.profileId && store.state.player.track && this._recorded !== store.state.player.track.id + ':' + Math.floor(audio.currentTime / 20)) {
        this._recorded = store.state.player.track.id + ':' + Math.floor(audio.currentTime / 20);
        recordPlay(this.profileId, store.state.player.track).catch(() => {});
      }
    });
    audio.addEventListener('ended', () => this.handleEnded());
    audio.addEventListener('error', () => {
      const message = audio.error ? '播放失败（' + (audio.error.code || '?') + '）' : '播放失败';
      store.patch('player', { error: message, playing: false, loading: false });
    });
    this.bindMediaSession();
    store.patch('player', { repeat: this.repeat, shuffle: this.shuffle });
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
      const artwork = artworkFor(track);
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album || '',
        artwork: artwork ? [{ src: artwork, sizes: '480x480', type: 'image/jpeg' }] : [],
      });
    } catch (_) { /* ignore */ }
  }

  async playTrack(track, options = {}) {
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
    if (this.profileId) recordListen(this.profileId, track).catch(() => {});
    this.updateMediaSession(track);
    this.lyrics = { trackId: track.id, lines: [], loading: true, error: '' };

    if (this._abort) this._abort.abort();
    this._abort = new AbortController();

    try {
      const cached = await cacheGet(this.profileId, track.id);
      let url = '';
      let sourceKey = 'cache';
      if (cached) {
        url = URL.createObjectURL(cached);
        sourceKey = 'cache';
      } else {
        const resolved = await resolveTrack(track, this.settings, { signal: this._abort.signal });
        url = resolved.url;
        sourceKey = resolved.sourceKey;
      }
      if (store.state.player.track !== track) return;
      this.audio.src = url;
      this.audio.load();
      await this.audio.play().catch((err) => {
        if (err && err.name === 'NotAllowedError') store.patch('player', { error: '需要点击后才能播放', loading: false });
        else if (err && err.name !== 'AbortError') store.patch('player', { error: err.message, loading: false });
      });
      store.patch('player', { playing: true });
      this.loadLyrics(track);
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      store.patch('player', { error: err.message || '取流失败', loading: false, playing: false });
    }
  }

  async loadLyrics(track) {
    try {
      const text = await lyricsFor(track, this.settings);
      if (!store.state.player.track || store.state.player.track.id !== track.id) return;
      this.lyrics = { trackId: track.id, lines: parseLrc(text), loading: false, error: text ? '' : '暂无歌词' };
    } catch (_) {
      this.lyrics = { trackId: track.id, lines: [], loading: false, error: '歌词加载失败' };
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

  setMode(mode) { store.patch('player', { mode }); }

  setSettings(settings) { this.settings = settings; }
}
export const player = new Player();
