// Synthesized sound effects via WebAudio. No audio assets; every blip is an
// oscillator envelope. Audio context is created lazily on first user input
// (browser autoplay policy) and the whole thing degrades silently if blocked.

let ctx = null;
let muted = false;

function ac() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function setMuted(m) { muted = m; }
export function isMuted() { return muted; }

function tone({ freq = 440, end = freq, time = 0.1, type = 'square', gain = 0.06, delay = 0 }) {
  const a = ac();
  if (!a || muted) return;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, end), t0 + time);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + time);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + time + 0.02);
}

function noise({ time = 0.08, gain = 0.05, delay = 0 }) {
  const a = ac();
  if (!a || muted) return;
  const t0 = a.currentTime + delay;
  const len = Math.floor(a.sampleRate * time);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + time);
  src.connect(g).connect(a.destination);
  src.start(t0);
}

const FX = {
  step: () => tone({ freq: 90, end: 70, time: 0.03, type: 'triangle', gain: 0.02 }),
  attack: () => { tone({ freq: 220, end: 90, time: 0.07 }); noise({ time: 0.05, gain: 0.03 }); },
  hurt: () => tone({ freq: 130, end: 60, time: 0.12, type: 'sawtooth', gain: 0.05 }),
  kill: () => { tone({ freq: 300, end: 60, time: 0.18, type: 'sawtooth', gain: 0.05 }); noise({ time: 0.12, gain: 0.04 }); },
  touch: () => tone({ freq: 880, end: 1200, time: 0.08, type: 'sine', gain: 0.04 }),
  shift: () => {
    tone({ freq: 200, end: 700, time: 0.18, type: 'sine', gain: 0.06 });
    tone({ freq: 400, end: 1100, time: 0.22, type: 'triangle', gain: 0.04, delay: 0.05 });
  },
  soul: () => {
    tone({ freq: 700, end: 200, time: 0.3, type: 'sine', gain: 0.06 });
    tone({ freq: 1050, end: 300, time: 0.3, type: 'sine', gain: 0.03, delay: 0.04 });
  },
  death: () => {
    tone({ freq: 400, end: 40, time: 0.7, type: 'sawtooth', gain: 0.07 });
    noise({ time: 0.4, gain: 0.05, delay: 0.1 });
  },
  win: () => {
    [392, 494, 587, 784].forEach((f, i) => tone({ freq: f, time: 0.22, type: 'triangle', gain: 0.06, delay: i * 0.12 }));
  },
  stairs: () => { tone({ freq: 160, end: 80, time: 0.2, type: 'triangle', gain: 0.05 }); tone({ freq: 120, end: 60, time: 0.2, type: 'triangle', gain: 0.05, delay: 0.12 }); },
  shrine: () => [523, 659, 784].forEach((f, i) => tone({ freq: f, time: 0.15, type: 'sine', gain: 0.05, delay: i * 0.07 })),
  pickup: () => tone({ freq: 660, end: 990, time: 0.09, type: 'square', gain: 0.04 }),
  ability: () => tone({ freq: 500, end: 900, time: 0.12, type: 'square', gain: 0.05 }),
  alert: () => tone({ freq: 240, end: 320, time: 0.08, type: 'square', gain: 0.03 }),
  crumble: () => noise({ time: 0.15, gain: 0.025 }),
  summon: () => { tone({ freq: 110, end: 55, time: 0.5, type: 'sawtooth', gain: 0.06 }); tone({ freq: 165, end: 80, time: 0.5, type: 'sawtooth', gain: 0.04, delay: 0.05 }); },
  boss: () => { tone({ freq: 80, end: 40, time: 0.8, type: 'sawtooth', gain: 0.08 }); tone({ freq: 120, end: 60, time: 0.8, type: 'sawtooth', gain: 0.05, delay: 0.2 }); },
};

export function playSound(id) {
  const fn = FX[id];
  if (fn) {
    try { fn(); } catch { /* audio is decorative; never crash the game */ }
  }
}
