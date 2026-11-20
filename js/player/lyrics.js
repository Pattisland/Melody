/* LRC 解析 */
export function parseLrc(text) {
  if (!text) return [];
  const lines = String(text).split(/\r?\n/);
  const out = [];
  let offset = 0;
  const tag = /^\[(ti|ar|al|by|offset):(.*)\]$/i;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const meta = trimmed.match(tag);
    if (meta) {
      if (meta[1].toLowerCase() === 'offset') offset = parseInt(meta[2], 10) || 0;
      continue;
    }
    const stamps = trimmed.match(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g);
    if (!stamps) continue;
    const content = trimmed.replace(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g, '').trim();
    for (const stamp of stamps) {
      const nums = stamp.slice(1, -1).match(/(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?/);
      if (!nums) continue;
      const minutes = parseInt(nums[1], 10);
      const seconds = parseInt(nums[2], 10);
      const fraction = nums[3] ? parseInt(nums[3].padEnd(3, '0'), 10) : 0;
      out.push({ time: minutes * 60 + seconds + fraction / 1000 + offset / 1000, text: content });
    }
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}

export function activeLineIndex(lines, time) {
  if (!lines.length) return -1;
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid].time <= time + 0.15) { found = mid; low = mid + 1; }
    else high = mid - 1;
  }
  return found;
}
