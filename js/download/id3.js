/* 纯 JS 写 ID3v2.4 标签（标题/歌手/专辑/封面/歌词） */

function syncsafe(value) {
  return new Uint8Array([
    (value >> 21) & 0x7f,
    (value >> 14) & 0x7f,
    (value >> 7) & 0x7f,
    value & 0x7f,
  ]);
}

function utf8(text) { return new TextEncoder().encode(String(text == null ? '' : text)); }

function textFrame(id, text) {
  if (!text) return null;
  const body = new Uint8Array(1 + utf8(text).length);
  body[0] = 0x03; // UTF-8
  body.set(utf8(text), 1);
  return frame(id, body);
}

function frame(id, body) {
  const head = new Uint8Array(10);
  for (let i = 0; i < 4; i += 1) head[i] = id.charCodeAt(i);
  head.set(syncsafe(body.length), 4);
  const out = new Uint8Array(10 + body.length);
  out.set(head, 0);
  out.set(body, 10);
  return out;
}

function pictureFrame(bytes, mime) {
  if (!bytes || !bytes.length) return null;
  const mimeBytes = utf8(mime || 'image/jpeg');
  const desc = new Uint8Array(0);
  const body = new Uint8Array(1 + mimeBytes.length + 1 + 1 + desc.length + 1 + bytes.length);
  let offset = 0;
  body[offset++] = 0x03; // UTF-8
  body.set(mimeBytes, offset); offset += mimeBytes.length;
  body[offset++] = 0x00;
  body[offset++] = 0x03; // 封面（正面）
  body[offset++] = 0x00; // 空描述
  body.set(bytes, offset);
  return frame('APIC', body);
}

function lyricFrame(text) {
  if (!text) return null;
  const lang = utf8('eng');
  const body = new Uint8Array(1 + lang.length + 1 + utf8(text).length);
  let offset = 0;
  body[offset++] = 0x03;
  body.set(lang, offset); offset += 3;
  body[offset++] = 0x00;
  body.set(utf8(text), offset);
  return frame('USLT', body);
}

function concat(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
}

/** 去掉文件开头已有的 ID3v2 与结尾的 ID3v1，避免重复标签 */
export async function stripTags(blob) {
  let start = 0;
  const head = new Uint8Array(await blob.slice(0, 10).arrayBuffer());
  if (head.length >= 10 && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
    const size = ((head[6] & 0x7f) << 21) | ((head[7] & 0x7f) << 14) | ((head[8] & 0x7f) << 7) | (head[9] & 0x7f);
    start = 10 + size;
  }
  let end = blob.size;
  if (blob.size > 128) {
    const tail = new Uint8Array(await blob.slice(blob.size - 128).arrayBuffer());
    if (tail[0] === 0x54 && tail[1] === 0x41 && tail[2] === 0x47) end = blob.size - 128;
  }
  if (start === 0 && end === blob.size) return blob;
  return blob.slice(start, end);
}

/**
 * @param {Blob} blob 原始音频
 * @param {{title?:string, artist?:string, album?:string, cover?:{bytes:Uint8Array,mime:string}|null, lyrics?:string}} meta
 * @returns {Blob}
 */
export async function writeId3(blob, meta) {
  const audio = await stripTags(blob);
  const frames = [
    textFrame('TIT2', meta.title),
    textFrame('TPE1', meta.artist),
    textFrame('TALB', meta.album),
    textFrame('TSSE', 'Melody'),
    meta.cover ? pictureFrame(meta.cover.bytes, meta.cover.mime) : null,
    meta.lyrics ? lyricFrame(meta.lyrics) : null,
  ].filter(Boolean);

  const body = concat(frames);
  const header = new Uint8Array(10);
  header[0] = 0x49; header[1] = 0x44; header[2] = 0x33;
  header[3] = 0x04; header[4] = 0x00; header[5] = 0x00;
  header.set(syncsafe(body.length), 6);

  return new Blob([header, body, audio], { type: blob.type || 'audio/mpeg' });
}
