// ui/format.js — tiny presentation helpers shared by the popup and the
// history page. No product rules here (those live in core/recorder.js).

export function timeAgo(ms, now = Date.now()) {
  const s = Math.round((now - ms) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ms).toLocaleDateString();
}

export function sizeLabel(meta) {
  return `${meta.words} word${meta.words === 1 ? '' : 's'} · ${meta.chars} chars`;
}
