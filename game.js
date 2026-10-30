(() => {
  'use strict';

  /* ------------------------------------------------------------------ *
   *  Neon Dash — a tiny Geometry Dash-inspired one-button runner.
   *  Canvas 2D, zero dependencies, touch / keyboard / tilt controls.
   * ------------------------------------------------------------------ */

  const TAU = Math.PI * 2;
  const FIXED_DT = 1 / 120;
  const GRAVITY = 62;
  const JUMP_V = 18.6;
  const PAD_BOOST = 1.34;
  const ORB_BOOST = 1.16;
  const ROT_SPEED = 560;
  const SAVE_KEY = 'neon-dash-save-v1';

  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const shortestAngle = (deg) => ((deg + 180) % 360 + 360) % 360 - 180;
  const fmtPct = (n) => `${Math.floor(clamp(n, 0, 100))}%`;

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rng) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function hash1(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  /* ------------------------------------------------------------------ *
   *  Levels
   * ------------------------------------------------------------------ */

  const PALETTES = {
    prisma: {
      sky1: '#050a20', sky2: '#1a0a3c', sun: '#ff5edb', sun2: '#ffb347',
      primary: '#38f6ff', secondary: '#7a5cff', accent: '#ff4fd8',
      grid: 'rgba(56,246,255,0.16)', ground1: '#071a36', ground2: '#030712',
      block: '#123a6b', blockEdge: '#38f6ff', spike: '#38f6ff',
      player: '#e9ffff', player2: '#38f6ff', mountain1: '#0a1130',
      mountain2: '#0e1a44', city: '#0b1738', star: '#c9fbff',
    },
    magenta: {
      sky1: '#160522', sky2: '#3a0a2e', sun: '#ffb347', sun2: '#ff5e7a',
      primary: '#ff4fd8', secondary: '#ff7a5c', accent: '#ffd166',
      grid: 'rgba(255,79,216,0.18)', ground1: '#240b2e', ground2: '#08020c',
      block: '#4a1248', blockEdge: '#ff4fd8', spike: '#ff4fd8',
      player: '#fff0ff', player2: '#ff4fd8', mountain1: '#1b0726',
      mountain2: '#2a0b3a', city: '#2a0b3a', star: '#ffd9f7',
    },
    solar: {
      sky1: '#1a0805', sky2: '#3d1205', sun: '#ffd166', sun2: '#ff5e3a',
      primary: '#ffb347', secondary: '#ff5e3a', accent: '#ffe066',
      grid: 'rgba(255,179,71,0.18)', ground1: '#2a0c05', ground2: '#080301',
      block: '#5a2108', blockEdge: '#ffb347', spike: '#ffb347',
      player: '#fff8e7', player2: '#ffb347', mountain1: '#200806',
      mountain2: '#331009', city: '#331009', star: '#ffe8bd',
    },
  };

  const LEVELS = [
    {
      id: 'prisma', name: 'PRISMA', diff: 1, difficulty: 'Fácil',
      speed: 7.8, target: 185, seed: 0x51a7c3, accent: '#38f6ff',
      palette: PALETTES.prisma,
      deck: ['rest', 'single', 'double', 'block1', 'pitS', 'single', 'saw', 'rest',
        'double', 'pitS', 'block1', 'single', 'pitM', 'rest', 'double', 'padPit',
        'single', 'saw'],
    },
    {
      id: 'magenta', name: 'MAGENTA', diff: 2, difficulty: 'Medio',
      speed: 8.8, target: 235, seed: 0x7e3b11, accent: '#ff4fd8',
      palette: PALETTES.magenta,
      deck: ['single', 'double', 'triple', 'block1', 'block2', 'pitS', 'pitM',
        'saw', 'rest', 'double', 'block1', 'padPit', 'single', 'saw', 'pitM',
        'block2', 'rest', 'triple', 'doubleSaw', 'pitS'],
    },
    {
      id: 'solar', name: 'SOLAR', diff: 3, difficulty: 'Difícil',
      speed: 9.8, target: 285, seed: 0x2d9e77, accent: '#ffb347',
      palette: PALETTES.solar,
      deck: ['double', 'triple', 'block1', 'block2', 'blockWide', 'pitM', 'saw',
        'doubleSaw', 'padPit', 'orbPit', 'rest', 'single', 'triple', 'pitM',
        'block2', 'saw', 'double', 'orbPit', 'blockWide', 'pitS'],
    },
  ];

  class LevelBuilder {
    constructor(rng) {
      this.rng = rng;
      this.x = 0;
      this.spikes = [];
      this.blocks = [];
      this.holes = [];
      this.saws = [];
      this.pads = [];
      this.orbs = [];
      this.coins = [];
    }

    advance(n) { this.x += n; }
    spike(dx = 0, dy = 0, w = 1, h = 1) {
      this.spikes.push({ x: this.x + dx, y: dy, w, h });
    }
    block(dx = 0, w = 1, h = 1, dy = 0) {
      this.blocks.push({ x: this.x + dx, y: dy, w, h });
    }
    pit(dx = 0, w = 1) {
      this.holes.push({ x: this.x + dx, w });
    }
    saw(dx = 0, y = 1.1, r = 0.52) {
      this.saws.push({ x: this.x + dx, y, r, rot: 0 });
    }
    pad(dx = 0, y = 0) {
      this.pads.push({ x: this.x + dx, y, cool: 0 });
    }
    orb(dx = 0, y = 2.2) {
      this.orbs.push({ x: this.x + dx, y, r: 0.55, used: false });
    }
  }

  const PATTERNS = {
    rest(b) { b.advance(4.2); },
    single(b) { b.spike(0.9); b.advance(8.8); },
    double(b) { b.spike(0.9); b.spike(1.9); b.advance(9.2); },
    triple(b) { b.spike(0.9); b.spike(1.9); b.spike(2.9); b.advance(9.6); },
    block1(b) { b.block(0.9, 1, 1); b.advance(8.8); },
    block2(b) { b.block(0.9, 1, 2); b.advance(9.6); },
    blockWide(b) { b.block(0.9, 2, 1); b.advance(9.6); },
    pitS(b) { b.pit(0.9, 2); b.advance(8.8); },
    pitM(b) { b.pit(0.9, 3); b.advance(9.6); },
    saw(b) { b.saw(1.1, 1.15, 0.52); b.advance(8.8); },
    doubleSaw(b) { b.saw(1.0, 1.15, 0.48); b.saw(2.4, 1.15, 0.48); b.advance(9.2); },
    padPit(b) { b.pad(0.8); b.pit(2.3, 3.8); b.advance(11.5); },
    orbPit(b) { b.pit(0.9, 4.4); b.orb(2.6, 2.3); b.advance(12); },
  };

  function coinSpotClear(b, x) {
    for (const hole of b.holes) {
      if (x > hole.x - 0.4 && x < hole.x + hole.w + 0.4) return false;
    }
    for (const block of b.blocks) {
      if (x > block.x - 1.2 && x < block.x + block.w + 1.2) return false;
    }
    for (const spike of b.spikes) {
      if (x > spike.x - 1.4 && x < spike.x + spike.w + 1.4) return false;
    }
    for (const saw of b.saws) {
      if (Math.abs(x - saw.x) < saw.r + 1.3) return false;
    }
    return true;
  }

  function placeCoins(b, finishX) {
    const fractions = [0.22, 0.52, 0.82];
    for (const fraction of fractions) {
      const target = finishX * fraction;
      let found = null;
      for (let radius = 0; radius <= 14 && found === null; radius += 0.5) {
        for (const sign of [1, -1]) {
          const x = target + radius * sign;
          if (x < 4 || x > finishX - 4) continue;
          if (!coinSpotClear(b, x)) continue;
          found = x;
          break;
        }
      }
      if (found === null) {
        for (let x = 5; x < finishX - 4; x += 0.5) {
          if (coinSpotClear(b, x)) { found = x; break; }
        }
      }
      if (found !== null) {
        b.coins.push({ x: found, y: 2.05, r: 0.34, taken: false, phase: b.rng() * TAU });
      }
    }
  }

  function generateLevel(def) {
    const rng = mulberry32(def.seed);
    const b = new LevelBuilder(rng);
    b.advance(7);

    let bag = shuffle(def.deck, rng);
    let last = '';
    let guard = 0;
    while (b.x < def.target && guard < 300) {
      guard += 1;
      if (!bag.length) bag = shuffle(def.deck, rng);
      let name = bag.pop();
      if (name === last && bag.length) {
        const alternate = bag.pop();
        bag.push(name);
        name = alternate;
      }
      (PATTERNS[name] || PATTERNS.rest)(b);
      last = name;
    }

    b.advance(12);
    const finishX = b.x - 4;

    const holes = b.holes.slice().sort((a, c) => a.x - c.x);
    const ground = [];
    let cursor = 0;
    for (const hole of holes) {
      if (hole.x > cursor) ground.push({ x: cursor, w: hole.x - cursor });
      cursor = Math.max(cursor, hole.x + hole.w);
    }
    ground.push({ x: cursor, w: finishX + 34 - cursor });

    placeCoins(b, finishX);

    return {
      ...def,
      finishX,
      holes,
      ground,
      spikes: b.spikes,
      blocks: b.blocks,
      saws: b.saws,
      pads: b.pads,
      orbs: b.orbs,
      coins: b.coins,
      stars: makeStars(def.seed),
    };
  }

  function makeStars(seed) {
    const rng = mulberry32(seed ^ 0x9e3779b9);
    const stars = [];
    for (let i = 0; i < 74; i += 1) {
      stars.push({
        x: rng(),
        y: rng() * 0.66,
        size: 0.7 + rng() * 1.7,
        phase: rng() * TAU,
        speed: 0.4 + rng() * 0.8,
      });
    }
    return stars;
  }

  const levels = LEVELS.map(generateLevel);

  /* ------------------------------------------------------------------ *
   *  Persistence
   * ------------------------------------------------------------------ */

  const DEFAULT_SETTINGS = {
    sound: true,
    music: true,
    haptics: true,
    tilt: false,
    sensitivity: 3,
    reduceMotion: false,
  };

  function freshLevelStats() {
    return { best: 0, attempts: 0, coins: 0, complete: false };
  }

  function loadSave() {
    let raw = null;
    try {
      raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    } catch (error) {
      raw = null;
    }
    const data = raw && typeof raw === 'object' ? raw : {};
    const settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    const stats = {};
    for (const level of levels) {
      stats[level.id] = { ...freshLevelStats(), ...(data.levels && data.levels[level.id] ? data.levels[level.id] : {}) };
    }
    return {
      settings,
      levels: stats,
      selected: clamp(Number(data.selected) || 0, 0, levels.length - 1),
    };
  }

  const save = loadSave();
  const settings = save.settings;

  function persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch (error) {
      /* Storage can be unavailable in private mode. */
    }
  }

  function statsFor(id) {
    if (!save.levels[id]) save.levels[id] = freshLevelStats();
    return save.levels[id];
  }

  /* ------------------------------------------------------------------ *
   *  Generated audio (no external assets)
   * ------------------------------------------------------------------ */

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.musicGain = null;
      this.sfxGain = null;
      this.noiseBuffer = null;
      this.timer = null;
      this.step = 0;
      this.nextTime = 0;
      this.failed = false;
    }

    init() {
      if (this.ctx) {
        this.resume();
        return;
      }
      if (this.failed) return;
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) { this.failed = true; return; }
      try {
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.7;
        this.master.connect(this.ctx.destination);

        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = settings.music ? 0.16 : 0;
        this.musicGain.connect(this.master);

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = settings.sound ? 0.5 : 0;
        this.sfxGain.connect(this.master);

        const length = Math.floor(this.ctx.sampleRate * 0.5);
        const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
        this.noiseBuffer = buffer;
      } catch (error) {
        this.failed = true;
        this.ctx = null;
      }
    }

    resume() {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    }

    setSound(on) {
      if (this.sfxGain) this.sfxGain.gain.value = on ? 0.5 : 0;
    }

    setMusic(on) {
      if (this.musicGain) this.musicGain.gain.value = on ? 0.16 : 0;
      if (!on) this.stopMusic();
    }

    startMusic() {
      if (!settings.music) return;
      this.init();
      if (!this.ctx) return;
      this.resume();
      if (this.timer) return;
      this.step = 0;
      this.nextTime = this.ctx.currentTime + 0.06;
      this.timer = window.setInterval(() => this.schedule(), 25);
    }

    stopMusic() {
      if (this.timer) {
        window.clearInterval(this.timer);
        this.timer = null;
      }
    }

    schedule() {
      if (!this.ctx || !this.musicGain) return;
      if (this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      if (this.nextTime < now - 0.5) this.nextTime = now + 0.05;
      while (this.nextTime < now + 0.12) {
        this.playStep(this.step, this.nextTime);
        this.nextTime += 60 / 128 / 4;
        this.step = (this.step + 1) % 64;
      }
    }

    tone(freq, duration, type, volume, when, destination, endFreq) {
      if (!this.ctx) return;
      const t = when || this.ctx.currentTime;
      const dest = destination || this.sfxGain;
      if (!dest) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(Math.max(20, freq), t);
      if (endFreq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + duration);
      }
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + duration + 0.02);
    }

    noise(duration, volume, when, filterType, frequency) {
      if (!this.ctx || !this.noiseBuffer) return;
      const t = when || this.ctx.currentTime;
      const source = this.ctx.createBufferSource();
      source.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = filterType || 'highpass';
      filter.frequency.value = frequency || 1200;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(Math.max(0.0002, volume), t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain || this.master);
      source.start(t);
      source.stop(t + duration + 0.02);
    }

    playStep(step, when) {
      if (!this.musicGain) return;
      const bar = Math.floor(step / 16) % 4;
      const roots = [110, 87.31, 130.81, 98];
      const root = roots[bar];
      const inBar = step % 16;
      if (inBar % 4 === 0) {
        this.tone(root, 0.19, 'triangle', 0.17, when, this.musicGain);
        this.tone(root * 0.5, 0.22, 'sine', 0.08, when, this.musicGain);
      }
      if (inBar % 2 === 0) {
        const arp = [0, 7, 12, 15, 19, 15, 12, 7][(inBar / 2) % 8];
        this.tone(root * 2 * Math.pow(2, arp / 12), 0.11, 'square', 0.026, when, this.musicGain);
      }
      if (inBar === 0 || inBar === 8) this.kick(when);
      if (inBar === 4 || inBar === 12) this.snare(when);
      if (inBar % 2 === 0) this.hat(when);
    }

    kick(when) {
      if (!this.ctx || !this.musicGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, when);
      osc.frequency.exponentialRampToValueAtTime(44, when + 0.16);
      gain.gain.setValueAtTime(0.34, when);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.2);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(when);
      osc.stop(when + 0.22);
    }

    snare(when) {
      if (!this.ctx || !this.noiseBuffer || !this.musicGain) return;
      const source = this.ctx.createBufferSource();
      source.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 1100;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.1, when);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.09);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);
      source.start(when);
      source.stop(when + 0.11);
    }

    hat(when) {
      if (!this.ctx || !this.noiseBuffer || !this.musicGain) return;
      const source = this.ctx.createBufferSource();
      source.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 7200;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.032, when);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.035);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);
      source.start(when);
      source.stop(when + 0.05);
    }

    sfxJump() {
      if (!this.ctx || !settings.sound) return;
      this.tone(430, 0.09, 'sine', 0.12, null, this.sfxGain, 780);
    }

    sfxLand() {
      if (!this.ctx || !settings.sound) return;
      this.noise(0.06, 0.06, null, 'lowpass', 420);
    }

    sfxCoin() {
      if (!this.ctx || !settings.sound) return;
      this.tone(880, 0.08, 'triangle', 0.11, null, this.sfxGain, 990);
      this.tone(1320, 0.12, 'triangle', 0.09, this.ctx.currentTime + 0.065, this.sfxGain);
    }

    sfxOrb() {
      if (!this.ctx || !settings.sound) return;
      this.tone(320, 0.17, 'sine', 0.12, null, this.sfxGain, 980);
    }

    sfxPad() {
      if (!this.ctx || !settings.sound) return;
      this.tone(220, 0.12, 'square', 0.07, null, this.sfxGain, 680);
    }

    sfxDeath() {
      if (!this.ctx || !settings.sound) return;
      this.tone(190, 0.34, 'sawtooth', 0.15, null, this.sfxGain, 38);
      this.noise(0.26, 0.1, null, 'lowpass', 900);
    }

    sfxWin() {
      if (!this.ctx || !settings.sound) return;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((note, index) => {
        this.tone(note, 0.16, 'triangle', 0.1, this.ctx.currentTime + index * 0.1, this.sfxGain);
      });
    }
  }

  const audio = new AudioEngine();

  /* ------------------------------------------------------------------ *
   *  DOM
   * ------------------------------------------------------------------ */

  const app = $('app');
  const canvas = $('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const hud = $('hud');
  const menuScreen = $('menuScreen');
  const levelStrip = $('levelStrip');
  const playBtn = $('playBtn');
  const playLevelLabel = $('playLevelLabel');
  const hudLevelName = $('hudLevelName');
  const hudAttempt = $('hudAttempt');
  const progressTrack = $('progressTrack');
  const progressFill = $('progressFill');
  const progressPct = $('progressPct');
  const hudCoins = $('hudCoins');
  const hudBest = $('hudBest');
  const tapHint = $('tapHint');
  const tiltMeter = $('tiltMeter');
  const tiltDot = $('tiltDot');
  const pauseScreen = $('pauseScreen');
  const deathScreen = $('deathScreen');
  const deathStats = $('deathStats');
  const resultScreen = $('resultScreen');
  const resultTitle = $('resultTitle');
  const resultStats = $('resultStats');
  const resultCoins = $('resultCoins');
  const settingsScreen = $('settingsScreen');
  const howScreen = $('howScreen');
  const toastEl = $('toast');
  const soundToggle = $('soundToggle');
  const musicToggle = $('musicToggle');
  const tiltToggle = $('tiltToggle');
  const tiltOptions = $('tiltOptions');
  const tiltStatus = $('tiltStatus');
  const tiltSensitivity = $('tiltSensitivity');
  const tiltSensitivityOut = $('tiltSensitivityOut');
  const calibrateBtn = $('calibrateBtn');
  const hapticsToggle = $('hapticsToggle');
  const motionToggle = $('motionToggle');
  const resetProgressBtn = $('resetProgress');
  const quickSound = $('quickSound');
  const nextBtn = $('nextBtn');

  /* ------------------------------------------------------------------ *
   *  Runtime state
   * ------------------------------------------------------------------ */

  const game = {
    state: 'menu',
    levelIndex: save.selected,
    level: levels[save.selected],
    attempts: 0,
    runCoins: 0,
    time: 0,
    menuTime: 0,
    player: { x: 0, y: 0, vy: 0, onGround: true, rot: 0, alive: true, squash: 0 },
    camX: 0,
    particles: [],
    trail: [],
    trailTimer: 0,
    shake: 0,
    input: { held: false, buffer: 0 },
    hudTimer: 0,
    hintTimer: 0,
    hintDismissed: false,
    deathTimer: 0,
    winTimer: 0,
    autoplay: new URLSearchParams(window.location.search).has('autoplay'),
  };

  const tilt = {
    supported: typeof window.DeviceOrientationEvent !== 'undefined',
    permission: 'unknown',
    listening: false,
    baseline: null,
    filtered: null,
    delta: 0,
    armed: false,
    threshold: 13,
  };

  let W = 1;
  let H = 1;
  let DPR = 1;
  let S = 32;
  let groundY = 1;
  let viewTiles = 16;
  let toastTimer = null;
  let starting = false;
  let settingsReturn = 'menu';
  let lastFocus = null;
  let resetArmed = false;
  let resetTimer = null;

  function currentTiltThreshold() {
    return 18 - (settings.sensitivity - 1) * 2.5;
  }

  function reducedMotion() {
    return settings.reduceMotion || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function haptic(pattern) {
    if (!settings.haptics || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (error) { /* no-op */ }
  }

  function showToast(message, duration = 2600) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), duration);
  }

  function dismissHint() {
    if (game.hintDismissed) return;
    game.hintDismissed = true;
    tapHint.classList.add('hidden');
  }

  /* ------------------------------------------------------------------ *
   *  Geometry helpers
   * ------------------------------------------------------------------ */

  function leadTiles() {
    return clamp(viewTiles * 0.31, 4.0, 7.2);
  }

  function isGroundAt(x, level) {
    for (const segment of level.ground) {
      if (x >= segment.x && x <= segment.x + segment.w) return true;
    }
    return false;
  }

  function overlapX(player, block) {
    return player.x + 1 > block.x + 0.02 && player.x < block.x + block.w - 0.02;
  }

  function aabbOverlap(player, box) {
    return player.x + 1 > box.x + 0.001 && player.x < box.x + box.w - 0.001 &&
      player.y + 1 > box.y + 0.001 && player.y < box.y + box.h - 0.001;
  }

  function spikeHit(player, spike) {
    return aabbOverlap(player, {
      x: spike.x + 0.26,
      y: spike.y,
      w: spike.w - 0.52,
      h: spike.h * 0.66,
    });
  }

  function circleAabb(cx, cy, radius, player) {
    const nx = clamp(cx, player.x, player.x + 1);
    const ny = clamp(cy, player.y, player.y + 1);
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy < radius * radius;
  }

  function isSupported(player, level) {
    if (player.y <= 0.02 && isGroundAt(player.x + 0.5, level)) return true;
    for (const block of level.blocks) {
      if (Math.abs(player.y - (block.y + block.h)) < 0.035 &&
        player.x + 1 > block.x + 0.04 && player.x < block.x + block.w - 0.04) return true;
    }
    return false;
  }

  /* ------------------------------------------------------------------ *
   *  Player physics
   * ------------------------------------------------------------------ */

  function doJump(vy) {
    const p = game.player;
    p.vy = vy;
    p.onGround = false;
    p.squash = -0.8;
    game.input.buffer = 0;
    emitJump();
    audio.sfxJump();
    haptic(7);
  }

  function stepPlayer(dt) {
    const p = game.player;
    const level = game.level;

    if ((game.input.buffer > 0 || game.input.held) && p.onGround) {
      doJump(JUMP_V);
    }
    game.input.buffer = Math.max(0, game.input.buffer - dt);

    p.vy -= GRAVITY * dt;
    const prevY = p.y;
    p.y += p.vy * dt;

    let landed = false;

    if (p.y <= 0) {
      if (isGroundAt(p.x + 0.5, level)) {
        if (p.vy <= 0) {
          p.y = 0;
          p.vy = 0;
          if (!p.onGround) landed = true;
          p.onGround = true;
        }
      } else {
        p.onGround = false;
        if (p.y < -2.5) {
          die('pit');
          return;
        }
      }
    }

    for (const block of level.blocks) {
      if (!overlapX(p, block)) continue;
      const top = block.y + block.h;
      if (p.vy <= 0 && prevY >= top - 0.025 && p.y < top) {
        p.y = top;
        p.vy = 0;
        if (!p.onGround) landed = true;
        p.onGround = true;
      } else if (aabbOverlap(p, block)) {
        die('block');
        return;
      }
    }

    p.x += level.speed * dt;
    game.camX = p.x - leadTiles();

    for (const block of level.blocks) {
      if (aabbOverlap(p, block)) {
        die('block');
        return;
      }
    }

    if (p.onGround && !isSupported(p, level)) {
      p.onGround = false;
    }

    if (!p.onGround) {
      p.rot += ROT_SPEED * dt;
      if (p.rot >= 360) p.rot -= 360;
    } else if (landed) {
      p.rot = Math.round(p.rot / 90) * 90;
    }

    for (const spike of level.spikes) {
      if (spikeHit(p, spike)) {
        die('spike');
        return;
      }
    }

    for (const saw of level.saws) {
      if (circleAabb(saw.x, saw.y, saw.r * 0.88, p)) {
        die('saw');
        return;
      }
    }

    for (const pad of level.pads) {
      if (pad.cool > 0) {
        pad.cool = Math.max(0, pad.cool - dt);
        continue;
      }
      if (p.vy <= 0 && p.y < 0.32 && p.y > -0.1 &&
        p.x + 1 > pad.x + 0.06 && p.x < pad.x + 0.94) {
        p.y = Math.max(p.y, pad.y + 0.3);
        p.vy = JUMP_V * PAD_BOOST;
        p.onGround = false;
        pad.cool = 0.22;
        p.squash = -0.5;
        emitPad();
        audio.sfxPad();
        haptic(10);
      }
    }

    for (const orb of level.orbs) {
      if (orb.used || (game.input.buffer <= 0 && !game.input.held)) continue;
      const dx = orb.x - (p.x + 0.5);
      const dy = orb.y - (p.y + 0.5);
      if (dx * dx + dy * dy < 1.15 * 1.15) {
        orb.used = true;
        p.vy = JUMP_V * ORB_BOOST;
        p.onGround = false;
        p.squash = -0.6;
        game.input.buffer = 0;
        emitOrb();
        audio.sfxOrb();
        haptic(12);
      }
    }

    for (const coin of level.coins) {
      if (coin.taken) continue;
      const dx = coin.x - (p.x + 0.5);
      const dy = coin.y - (p.y + 0.5);
      if (dx * dx + dy * dy < 1.08 * 1.08) {
        coin.taken = true;
        game.runCoins += 1;
        emitCoin();
        audio.sfxCoin();
        haptic(9);
        game.hudTimer = 1;
      }
    }

    if (p.x >= level.finishX) {
      win();
      return;
    }

    if (landed) {
      p.squash = 1;
      p.rot = Math.round(p.rot / 90) * 90;
      emitLand();
      audio.sfxLand();
      haptic(5);
    }

    p.squash *= Math.exp(-10 * dt);
    if (Math.abs(p.squash) < 0.01) p.squash = 0;

    game.trailTimer += dt;
    if (game.trailTimer > 0.035 && p.alive) {
      game.trailTimer = 0;
      game.trail.push({ x: p.x + 0.5, y: p.y + 0.5, rot: p.rot, life: 1 });
      if (game.trail.length > 28) game.trail.shift();
    }
    for (let i = game.trail.length - 1; i >= 0; i -= 1) {
      game.trail[i].life -= dt * 1.9;
      if (game.trail[i].life <= 0) game.trail.splice(i, 1);
    }
  }

  function updateParticles(dt) {
    for (let i = game.particles.length - 1; i >= 0; i -= 1) {
      const p = game.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        game.particles.splice(i, 1);
        continue;
      }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  /* ------------------------------------------------------------------ *
   *  Autoplay (used by the optional ?autoplay=1 demo and verification)
   * ------------------------------------------------------------------ */

  function autoPlay() {
    if (!game.autoplay || game.state !== 'playing') return;
    const p = game.player;
    const level = game.level;

    if (!p.onGround) {
      for (const orb of level.orbs) {
        if (orb.used) continue;
        const dx = orb.x - (p.x + 0.5);
        const dy = orb.y - (p.y + 0.5);
        if (dx > -0.2 && dx < 0.95 && Math.abs(dy) < 1.3) {
          game.input.buffer = Math.max(game.input.buffer, 0.14);
          return;
        }
      }
      return;
    }

    const front = p.x + 1;
    let threat = null;
    let bestDistance = Infinity;

    for (const spike of level.spikes) {
      const distance = spike.x - front;
      if (distance >= -0.3 && distance < 7 && distance < bestDistance) {
        bestDistance = distance;
        threat = { type: 'spike', distance };
      }
    }
    for (const saw of level.saws) {
      const distance = saw.x - saw.r - front;
      if (distance >= -0.3 && distance < 7 && distance < bestDistance) {
        bestDistance = distance;
        threat = { type: 'saw', distance };
      }
    }
    for (const block of level.blocks) {
      const distance = block.x - front;
      if (distance >= -0.3 && distance < 7 && distance < bestDistance) {
        bestDistance = distance;
        threat = { type: 'block', distance, height: block.h };
      }
    }
    for (const hole of level.holes) {
      const distance = hole.x - front;
      if (distance >= -0.3 && distance < 7 && distance < bestDistance) {
        bestDistance = distance;
        threat = { type: 'pit', distance };
      }
    }
    for (const pad of level.pads) {
      const distance = pad.x - front;
      if (distance >= -0.3 && distance < 6 && distance < bestDistance) {
        bestDistance = distance;
        threat = { type: 'pad', distance };
      }
    }

    if (!threat || threat.type === 'pad') return;

    let threshold = 1.35;
    if (threat.type === 'spike') threshold = 0.95;
    if (threat.type === 'saw') threshold = 1.1;
    if (threat.type === 'pit') threshold = 0.8;
    if (threat.type === 'block') threshold = threat.height >= 2 ? 2.1 : 1.7;

    if (threat.distance <= threshold && threat.distance >= -0.2) {
      game.input.buffer = Math.max(game.input.buffer, 0.14);
      game.input.held = false;
    }
  }

  /* ------------------------------------------------------------------ *
   *  Run lifecycle
   * ------------------------------------------------------------------ */

  function resetRun(level) {
    const p = game.player;
    p.x = 0;
    p.y = 0;
    p.vy = 0;
    p.onGround = true;
    p.rot = 0;
    p.alive = true;
    p.squash = 0;

    game.runCoins = 0;
    game.time = 0;
    game.particles.length = 0;
    game.trail.length = 0;
    game.trailTimer = 0;
    game.shake = 0;
    game.deathTimer = 0;
    game.winTimer = 0;
    game.deathReason = null;
    game.deathX = 0;
    game.deathY = 0;
    game.deathVy = 0;
    game.input.held = false;
    game.input.buffer = 0;
    game.hudTimer = 1;
    game.hintTimer = 0;
    game.hintDismissed = false;
    tapHint.classList.remove('hidden');

    level.coins.forEach((coin) => { coin.taken = false; });
    level.orbs.forEach((orb) => { orb.used = false; });
    level.pads.forEach((pad) => { pad.cool = 0; });
    level.saws.forEach((saw) => { saw.rot = 0; });

    game.camX = p.x - leadTiles();
    updateHUD(true);
  }

  function hideAllScreens() {
    const screens = [menuScreen, pauseScreen, deathScreen, resultScreen, settingsScreen, howScreen];
    for (const screen of screens) {
      screen.classList.add('hidden');
      screen.setAttribute('aria-hidden', 'true');
    }
  }

  function startRun(level) {
    audio.init();
    audio.resume();
    game.level = level;
    game.state = 'playing';
    game.attempts = statsFor(level.id).attempts + 1;
    statsFor(level.id).attempts = game.attempts;
    persist();

    hideAllScreens();
    hud.classList.remove('hidden');
    hud.setAttribute('aria-hidden', 'false');
    app.style.setProperty('--accent', level.accent);
    hud.style.setProperty('--accent', level.accent);
    hudLevelName.textContent = level.name;

    resetRun(level);
    audio.startMusic();

    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
  }

  function startSelected() {
    startRun(levels[game.levelIndex]);
  }

  function requestStart() {
    if (starting) return;
    starting = true;
    playBtn.disabled = true;
    (async () => {
      audio.init();
      audio.resume();
      if (settings.tilt) await prepareTiltForRun();
      startSelected();
    })().finally(() => {
      starting = false;
      playBtn.disabled = false;
    });
  }

  function die(reason) {
    if (game.state !== 'playing') return;
    dismissHint();
    const level = game.level;
    const p = game.player;
    game.state = 'dead';
    game.deathTimer = 0;
    game.deathReason = reason;
    game.deathX = p.x;
    game.deathY = p.y;
    game.deathVy = p.vy;
    p.alive = false;
    game.shake = reducedMotion() ? 0.25 : 1;

    const pct = Math.floor(clamp((p.x / level.finishX) * 100, 0, 100));
    const stats = statsFor(level.id);
    stats.best = Math.max(stats.best, pct);
    stats.coins = Math.max(stats.coins, game.runCoins);
    persist();

    emitDeath();
    audio.stopMusic();
    audio.sfxDeath();
    haptic([18, 35, 28]);

    deathStats.textContent = `Llegaste al ${pct}% · Mejor ${stats.best}%`;
    deathScreen.classList.remove('hidden');
    deathScreen.setAttribute('aria-hidden', 'false');
    updateHUD(true);
    updateMenuStats();

    window.setTimeout(() => {
      if (game.state === 'dead') {
        const retryBtn = $('retryBtn');
        if (retryBtn) retryBtn.focus({ preventScroll: true });
      }
    }, 320);
  }

  function win() {
    if (game.state !== 'playing') return;
    dismissHint();
    const level = game.level;
    game.state = 'won';
    game.winTimer = 0;
    game.shake = reducedMotion() ? 0.15 : 0.5;

    const stats = statsFor(level.id);
    stats.best = 100;
    stats.complete = true;
    stats.coins = Math.max(stats.coins, game.runCoins);
    persist();

    audio.stopMusic();
    audio.sfxWin();
    haptic([18, 45, 18, 45, 60]);
    emitConfetti();
    updateHUD(true);
    updateMenuStats();

    resultTitle.textContent = level.name;
    resultStats.textContent = `100% · ${game.runCoins}/3 monedas · ${game.attempts} intentos`;
    resultCoins.innerHTML = [0, 1, 2]
      .map((index) => `<i class="${index < game.runCoins ? 'on' : ''}"></i>`)
      .join('');
    nextBtn.textContent = game.levelIndex < levels.length - 1 ? 'SIGUIENTE NIVEL' : 'VOLVER AL MENÚ';
    resultScreen.classList.remove('hidden');
    resultScreen.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => {
      if (game.state === 'won') nextBtn.focus({ preventScroll: true });
    }, 300);
  }

  function retry() {
    if (game.state !== 'dead') return;
    deathScreen.classList.add('hidden');
    startRun(game.level);
  }

  function pauseGame() {
    if (game.state !== 'playing') return;
    dismissHint();
    game.state = 'paused';
    game.input.held = false;
    game.input.buffer = 0;
    audio.stopMusic();
    pauseScreen.classList.remove('hidden');
    pauseScreen.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => {
      if (game.state === 'paused') $('resumeBtn').focus({ preventScroll: true });
    }, 80);
  }

  function resumeGame() {
    if (game.state !== 'paused') return;
    game.state = 'playing';
    pauseScreen.classList.add('hidden');
    pauseScreen.setAttribute('aria-hidden', 'true');
    audio.startMusic();
  }

  function quitToMenu() {
    game.state = 'menu';
    game.input.held = false;
    game.input.buffer = 0;
    audio.stopMusic();
    hideAllScreens();
    hud.classList.add('hidden');
    hud.setAttribute('aria-hidden', 'true');
    menuScreen.classList.remove('hidden');
    game.camX = game.menuTime * 2.2;
    updateMenuStats();
  }

  function nextLevel() {
    if (game.state !== 'won') return;
    if (game.levelIndex < levels.length - 1) {
      game.levelIndex += 1;
      save.selected = game.levelIndex;
      persist();
      startRun(levels[game.levelIndex]);
    } else {
      quitToMenu();
    }
  }

  /* ------------------------------------------------------------------ *
   *  Tilt control
   * ------------------------------------------------------------------ */

  function screenAngle() {
    if (window.screen && window.screen.orientation && typeof window.screen.orientation.angle === 'number') {
      return window.screen.orientation.angle;
    }
    return typeof window.orientation === 'number' ? window.orientation : 0;
  }

  function paintTiltMeter() {
    if (!tiltDot) return;
    const normalized = clamp(tilt.delta / (currentTiltThreshold() * 1.5), -1, 1);
    tiltDot.style.transform = `translate(calc(-50% + ${normalized * 30}px), -50%)`;
  }

  function onDeviceOrientation(event) {
    if (!settings.tilt) return;
    const angle = Math.abs(screenAngle());
    let value = angle === 90 || angle === 270 ? event.gamma : event.beta;
    if (value === null || value === undefined || Number.isNaN(value)) return;

    if (tilt.filtered === null) tilt.filtered = value;
    else tilt.filtered = lerp(tilt.filtered, value, 0.22);

    if (tilt.baseline === null) {
      tilt.baseline = tilt.filtered;
      tilt.armed = false;
    }

    tilt.delta = shortestAngle(tilt.filtered - tilt.baseline);
    tilt.threshold = currentTiltThreshold();

    if (!tilt.armed && Math.abs(tilt.delta) < tilt.threshold * 0.62) {
      tilt.armed = true;
    }
    if (tilt.armed && Math.abs(tilt.delta) > tilt.threshold) {
      tilt.armed = false;
      if (game.state === 'playing') {
        game.input.buffer = Math.max(game.input.buffer, 0.14);
        dismissHint();
      }
    }
    paintTiltMeter();
  }

  function attachTilt() {
    if (tilt.listening) return;
    window.addEventListener('deviceorientation', onDeviceOrientation, true);
    tilt.listening = true;
  }

  function detachTilt() {
    if (!tilt.listening) return;
    window.removeEventListener('deviceorientation', onDeviceOrientation, true);
    tilt.listening = false;
    tilt.filtered = null;
    tilt.baseline = null;
    tilt.delta = 0;
    tilt.armed = false;
    paintTiltMeter();
  }

  async function enableTilt() {
    if (!tilt.supported) {
      tilt.permission = 'unsupported';
      showToast('Este dispositivo no tiene sensor de inclinación. Usa la pantalla para saltar.');
      return false;
    }
    const RequestPermission = window.DeviceOrientationEvent && window.DeviceOrientationEvent.requestPermission;
    if (typeof RequestPermission === 'function') {
      try {
        const result = await RequestPermission.call(window.DeviceOrientationEvent);
        if (result !== 'granted') {
          tilt.permission = 'denied';
          showToast('Permiso de movimiento denegado. Actívalo en Ajustes de Safari y vuelve a intentarlo.', 3800);
          return false;
        }
      } catch (error) {
        tilt.permission = 'denied';
        showToast('No se pudo pedir permiso de movimiento. En iOS debe aceptarse desde un toque y con HTTPS.', 3800);
        return false;
      }
    }
    tilt.permission = 'granted';
    attachTilt();
    tilt.filtered = null;
    tilt.baseline = null;
    tilt.delta = 0;
    tilt.armed = false;
    showToast('Inclinación activa. Mantén el móvil cómodo y pulsa Calibrar.', 3000);
    return true;
  }

  async function prepareTiltForRun() {
    if (!settings.tilt) return;
    if (tilt.permission === 'granted' && tilt.listening) return;
    const ok = await enableTilt();
    if (!ok) {
      settings.tilt = false;
      persist();
      syncSettingsUI();
    }
  }

  async function toggleTilt() {
    if (tiltToggle.disabled) return;
    tiltToggle.disabled = true;
    try {
      if (!settings.tilt) {
        const ok = await enableTilt();
        if (ok) {
          settings.tilt = true;
          persist();
        }
      } else {
        settings.tilt = false;
        detachTilt();
        persist();
      }
    } finally {
      tiltToggle.disabled = false;
      syncSettingsUI();
      updateHUD(true);
    }
  }

  function calibrateTilt() {
    if (!settings.tilt) {
      showToast('Activa primero la inclinación.');
      return;
    }
    if (tilt.filtered === null) {
      showToast('Mueve un poco el dispositivo y vuelve a tocar Calibrar.');
      return;
    }
    tilt.baseline = tilt.filtered;
    tilt.delta = 0;
    tilt.armed = false;
    paintTiltMeter();
    showToast('Posición calibrada. Inclina para saltar.');
    haptic(8);
  }

  /* ------------------------------------------------------------------ *
   *  Input
   * ------------------------------------------------------------------ */

  const activePointers = new Set();

  function pressJump() {
    if (game.state === 'playing') {
      game.input.buffer = Math.max(game.input.buffer, 0.14);
      game.input.held = true;
      dismissHint();
    } else if (game.state === 'dead' && game.deathTimer > 0.2) {
      retry();
    }
  }

  function releaseJump() {
    game.input.held = false;
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    activePointers.add(event.pointerId);
    if (activePointers.size === 1) pressJump();
  });

  window.addEventListener('pointerup', (event) => {
    if (!activePointers.has(event.pointerId)) return;
    activePointers.delete(event.pointerId);
    if (activePointers.size === 0) releaseJump();
  });

  window.addEventListener('pointercancel', (event) => {
    if (!activePointers.has(event.pointerId)) return;
    activePointers.delete(event.pointerId);
    if (activePointers.size === 0) releaseJump();
  });

  window.addEventListener('keydown', (event) => {
    const code = event.code;
    const modalOpen = !settingsScreen.classList.contains('hidden') || !howScreen.classList.contains('hidden');

    if (code === 'Escape') {
      if (!settingsScreen.classList.contains('hidden')) { closeSettings(); event.preventDefault(); return; }
      if (!howScreen.classList.contains('hidden')) { closeHow(); event.preventDefault(); return; }
      if (game.state === 'playing') { pauseGame(); event.preventDefault(); return; }
      if (game.state === 'paused') { resumeGame(); event.preventDefault(); return; }
      return;
    }

    if (code === 'KeyR' && !modalOpen) {
      if (game.state === 'playing' || game.state === 'paused' || game.state === 'dead') {
        startRun(game.level);
        event.preventDefault();
      }
      return;
    }

    if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW') {
      if (modalOpen) return;
      if (game.state === 'menu') {
        requestStart();
        event.preventDefault();
        return;
      }
      if (game.state === 'dead') {
        if (game.deathTimer > 0.2) retry();
        event.preventDefault();
        return;
      }
      if (event.repeat) {
        if (game.state === 'playing') game.input.held = true;
      } else {
        pressJump();
      }
      event.preventDefault();
    }
  });

  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') {
      releaseJump();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === 'playing') pauseGame();
  });

  window.addEventListener('pagehide', persist);

  document.addEventListener('gesturestart', (event) => event.preventDefault(), { passive: false });

  if (window.screen && window.screen.orientation && window.screen.orientation.addEventListener) {
    window.screen.orientation.addEventListener('change', () => {
      tilt.filtered = null;
      tilt.baseline = null;
      tilt.armed = false;
    });
  }

  /* ------------------------------------------------------------------ *
   *  Particles
   * ------------------------------------------------------------------ */

  function burst(x, y, count, colors, power, gravity, size, life, shape) {
    const amount = reducedMotion() ? Math.max(3, Math.round(count * 0.45)) : count;
    for (let i = 0; i < amount; i += 1) {
      const angle = Math.random() * TAU;
      const speed = power * (0.28 + Math.random() * 0.72);
      const totalLife = life * (0.55 + Math.random() * 0.7);
      game.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + Math.random() * 1.6,
        gravity,
        size: size * (0.55 + Math.random() * 0.9),
        life: totalLife,
        maxLife: totalLife,
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: shape || 'square',
      });
    }
  }

  function emitJump() {
    const p = game.player;
    const pal = game.level.palette;
    burst(p.x + 0.5, p.y + 0.05, 6, [pal.player2, '#ffffff'], 3.2, 12, 0.055, 0.38, 'square');
  }

  function emitLand() {
    const p = game.player;
    const pal = game.level.palette;
    burst(p.x + 0.5, p.y + 0.04, 8, [pal.primary, '#ffffff', pal.accent], 4.2, 18, 0.07, 0.42, 'square');
  }

  function emitDeath() {
    const p = game.player;
    const pal = game.level.palette;
    burst(p.x + 0.5, p.y + 0.5, 38, [pal.player, pal.player2, pal.accent, '#ffffff'], 13, 26, 0.11, 1.05, 'square');
    burst(p.x + 0.5, p.y + 0.5, 10, [pal.accent, '#ffffff'], 6, 10, 0.07, 0.7, 'circle');
  }

  function emitCoin() {
    const p = game.player;
    burst(p.x + 0.5, p.y + 0.65, 15, ['#ffd166', '#fff4bd', '#ffffff'], 5.2, 8, 0.06, 0.62, 'circle');
  }

  function emitOrb() {
    const p = game.player;
    const pal = game.level.palette;
    burst(p.x + 0.5, p.y + 0.5, 16, [pal.accent, pal.player2, '#ffffff'], 7, 10, 0.07, 0.7, 'circle');
  }

  function emitPad() {
    const p = game.player;
    burst(p.x + 0.5, p.y + 0.08, 14, ['#ffd166', '#ffb347', '#ffffff'], 5.5, 12, 0.07, 0.55, 'square');
  }

  function emitConfetti() {
    const pal = game.level.palette;
    const colors = [pal.primary, pal.accent, pal.player, '#ffd166', '#ffffff'];
    const cam = game.camX;
    const count = reducedMotion() ? 30 : 90;
    for (let i = 0; i < count; i += 1) {
      const x = cam + Math.random() * viewTiles;
      const life = 1.4 + Math.random() * 1.2;
      game.particles.push({
        x,
        y: 6 + Math.random() * 3,
        vx: (Math.random() - 0.5) * 5,
        vy: -Math.random() * 2,
        gravity: 7,
        size: 0.07 + Math.random() * 0.09,
        life,
        maxLife: life,
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: Math.random() > 0.4 ? 'square' : 'circle',
      });
    }
  }

  /* ------------------------------------------------------------------ *
   *  Canvas rendering
   * ------------------------------------------------------------------ */

  function resize() {
    const rect = app.getBoundingClientRect();
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    DPR = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    S = clamp(Math.min(W / 16, H / 10), 22, 70);
    viewTiles = W / S;
    groundY = H * (H > W ? 0.79 : 0.8);
  }

  function sx(x) { return (x - game.camX) * S; }
  function sy(y) { return groundY - y * S; }

  function roundRectPath(x, y, w, h, radius) {
    const r = Math.min(radius, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    if (game.state === 'menu') game.camX = game.menuTime * 2.2;

    drawBackground();

    ctx.save();
    if (game.shake > 0.001 && !reducedMotion()) {
      ctx.translate((Math.random() * 2 - 1) * game.shake * 9, (Math.random() * 2 - 1) * game.shake * 7);
    }
    if (game.state === 'menu') {
      drawMenuFloor();
      drawMenuAttract();
    } else {
      drawWorld();
    }
    ctx.restore();
  }

  function drawBackground() {
    const pal = game.level.palette;
    const sky = ctx.createLinearGradient(0, 0, 0, groundY + 2);
    sky.addColorStop(0, pal.sky1);
    sky.addColorStop(0.68, pal.sky2);
    sky.addColorStop(1, pal.sky1);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    drawStars(pal);
    drawSun(pal);
    drawRidge(groundY * 0.74, H * 0.17, pal.mountain2, 0.12, 0.6);
    drawRidge(groundY * 0.86, H * 0.12, pal.mountain1, 0.24, 2.1);
    drawCity(pal);

    const horizon = ctx.createLinearGradient(0, groundY - S * 2, 0, groundY);
    horizon.addColorStop(0, 'rgba(0,0,0,0)');
    horizon.addColorStop(1, 'rgba(255,255,255,0.035)');
    ctx.fillStyle = horizon;
    ctx.fillRect(0, groundY - S * 2, W, S * 2);
  }

  function drawStars(pal) {
    const offset = (game.camX * S * 0.025) % W;
    ctx.save();
    for (const star of game.level.stars) {
      const x = ((star.x * W - offset) % W + W) % W;
      const y = star.y * H * 0.66;
      const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(game.menuTime * star.speed + star.phase));
      ctx.globalAlpha = twinkle;
      ctx.fillStyle = pal.star;
      ctx.fillRect(x, y, star.size, star.size);
    }
    ctx.restore();
  }

  function drawSun(pal) {
    const radius = Math.min(W, H) * 0.19;
    const cx = W * 0.73;
    const cy = groundY * 0.39;

    const glow = ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, radius * 2.3);
    glow.addColorStop(0, pal.sun);
    glow.addColorStop(0.35, 'rgba(255,94,219,0.16)');
    glow.addColorStop(1, 'rgba(255,94,219,0)');
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 2.3, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.clip();
    const sun = ctx.createLinearGradient(cx, cy - radius, cx, cy + radius);
    sun.addColorStop(0, pal.sun);
    sun.addColorStop(1, pal.sun2);
    ctx.fillStyle = sun;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.fillStyle = pal.sky1;
    for (let i = 0; i < 9; i += 1) {
      const yy = cy - radius * 0.05 + i * radius * 0.13;
      ctx.globalAlpha = 0.3 + i * 0.055;
      ctx.fillRect(cx - radius, yy, radius * 2, radius * 0.038);
    }
    ctx.restore();

    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = pal.sun;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 1, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawRidge(baseY, amplitude, color, parallax, phase) {
    const offset = game.camX * S * parallax;
    const step = Math.max(16, S * 0.7);
    ctx.beginPath();
    ctx.moveTo(-step, groundY + 3);
    for (let x = -step; x <= W + step; x += step) {
      const wx = (x + offset) * 0.0045;
      const height = (Math.sin(wx + phase) * 0.52 + Math.sin(wx * 2.31 + phase * 1.7) * 0.29 + Math.sin(wx * 0.63 + phase * 0.4) * 0.2 + 1);
      ctx.lineTo(x, baseY - height * amplitude);
    }
    ctx.lineTo(W + step, groundY + 3);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawCity(pal) {
    const spacing = Math.max(30, S * 1.55);
    const offset = (game.camX * S * 0.42) % spacing;
    const baseIndex = Math.floor((game.camX * S * 0.42) / spacing);
    for (let i = -1; i < W / spacing + 2; i += 1) {
      const index = baseIndex + i;
      const seed = index * 1.73 + game.level.seed * 0.001;
      const height = (0.65 + hash1(seed) * 2.6) * S;
      const width = spacing * (0.38 + hash1(seed + 4.1) * 0.28);
      const x = i * spacing - offset;
      ctx.fillStyle = pal.city;
      ctx.fillRect(x, groundY - height, width, height);
      ctx.fillStyle = pal.grid;
      ctx.fillRect(x, groundY - height, width, 1.6);
      if (hash1(seed + 9.3) > 0.45) {
        ctx.fillStyle = 'rgba(255,255,255,0.045)';
        for (let wy = groundY - height + S * 0.45; wy < groundY - S * 0.25; wy += S * 0.55) {
          ctx.fillRect(x + width * 0.22, wy, width * 0.18, 2);
          ctx.fillRect(x + width * 0.6, wy, width * 0.18, 2);
        }
      }
    }
  }

  function drawGround() {
    const pal = game.level.palette;
    const level = game.level;
    const abyss = ctx.createLinearGradient(0, groundY, 0, H);
    abyss.addColorStop(0, pal.ground2);
    abyss.addColorStop(0.25, pal.ground1);
    abyss.addColorStop(1, '#010104');
    ctx.fillStyle = abyss;
    ctx.fillRect(0, groundY, W, H - groundY);

    const startTile = Math.floor(game.camX) - 1;
    const endTile = Math.ceil(game.camX + viewTiles) + 1;

    for (const segment of level.ground) {
      const x1 = sx(segment.x);
      const x2 = sx(segment.x + segment.w);
      if (x2 < -30 || x1 > W + 30) continue;

      ctx.fillStyle = pal.ground1;
      ctx.fillRect(x1, groundY, x2 - x1, H - groundY);

      ctx.strokeStyle = pal.grid;
      ctx.lineWidth = 1;
      const from = Math.max(startTile, Math.ceil(segment.x));
      const to = Math.min(endTile, Math.floor(segment.x + segment.w));
      for (let tile = from; tile <= to; tile += 1) {
        const x = sx(tile);
        ctx.beginPath();
        ctx.moveTo(x, groundY + 3);
        ctx.lineTo(x, H);
        ctx.stroke();
      }

      const surface = ctx.createLinearGradient(0, groundY, 0, groundY + S * 1.6);
      surface.addColorStop(0, 'rgba(255,255,255,0.08)');
      surface.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = surface;
      ctx.fillRect(x1, groundY, x2 - x1, S * 1.6);
    }

    for (const hole of level.holes) {
      const x1 = sx(hole.x);
      const x2 = sx(hole.x + hole.w);
      if (x2 < -20 || x1 > W + 20) continue;
      const edge = ctx.createLinearGradient(0, groundY, 0, groundY + S * 1.4);
      edge.addColorStop(0, pal.accent);
      edge.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = edge;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x1 - 1.5, groundY, 3, S * 1.4);
      ctx.fillRect(x2 - 1.5, groundY, 3, S * 1.4);
      ctx.globalAlpha = 1;
    }

    for (const segment of level.ground) {
      const x1 = sx(segment.x);
      const x2 = sx(segment.x + segment.w);
      if (x2 < -30 || x1 > W + 30) continue;
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = pal.primary;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(x1, groundY);
      ctx.lineTo(x2, groundY);
      ctx.stroke();
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x1, groundY);
      ctx.lineTo(x2, groundY);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawMenuFloor() {
    const pal = game.level.palette;
    const floor = ctx.createLinearGradient(0, groundY, 0, H);
    floor.addColorStop(0, pal.ground1);
    floor.addColorStop(1, '#010104');
    ctx.fillStyle = floor;
    ctx.fillRect(0, groundY, W, H - groundY);

    const offset = (game.menuTime * 2.2 * S) % S;
    ctx.strokeStyle = pal.grid;
    ctx.lineWidth = 1;
    for (let x = -offset; x < W + S; x += S) {
      ctx.beginPath();
      ctx.moveTo(x, groundY + 3);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = pal.primary;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(W, groundY);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawMenuAttract() {
    const pal = game.level.palette;
    const size = S * 1.35;
    const cx = W * (W > 760 ? 0.16 : 0.5);
    const cy = groundY - (2.35 + Math.sin(game.menuTime * 1.7) * 0.2) * S;

    for (let i = 4; i >= 1; i -= 1) {
      ctx.globalAlpha = 0.08 + (4 - i) * 0.025;
      drawCubeShape(cx - i * size * 0.52, cy + i * size * 0.09, size * 0.82, game.menuTime * 22 - i * 7, pal, false, 0, true);
    }
    ctx.globalAlpha = 1;
    drawCubeShape(cx, cy, size, game.menuTime * 22, pal, true, 0, false);

    for (let i = 0; i < 3; i += 1) {
      const angle = game.menuTime * 1.2 + i * (TAU / 3);
      const x = cx + Math.cos(angle) * S * 2.15;
      const y = cy + Math.sin(angle) * S * 0.72 - S * 0.1;
      drawCoinShape(x, y, S * 0.19, i * 2.1, 0.7);
    }
  }

  function drawWorld() {
    const level = game.level;
    drawGround();
    drawFinish(level);
    for (const pad of level.pads) drawPad(pad);
    for (const block of level.blocks) drawBlock(block);
    for (const spike of level.spikes) drawSpike(spike);
    for (const saw of level.saws) drawSaw(saw);
    for (const coin of level.coins) drawCoin(coin);
    for (const orb of level.orbs) drawOrb(orb);
    drawTrail();
    drawPlayer();
    drawParticles();
  }

  function drawFinish(level) {
    const x = sx(level.finishX);
    if (x < -S * 3 || x > W + S * 3) return;
    const pal = game.level.palette;
    const top = sy(5.3);
    const bottom = sy(0);
    const half = S * 0.55;

    const beam = ctx.createLinearGradient(x - half, 0, x + half, 0);
    beam.addColorStop(0, 'rgba(255,255,255,0)');
    beam.addColorStop(0.5, pal.accent);
    beam.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = beam;
    ctx.fillRect(x - half, top, half * 2, bottom - top);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(x - half, top);
    ctx.lineTo(x - half, bottom);
    ctx.moveTo(x + half, top);
    ctx.lineTo(x + half, bottom);
    ctx.stroke();

    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    ctx.setLineDash([7, 9]);
    ctx.lineDashOffset = -game.time * 34;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    ctx.fillStyle = pal.accent;
    ctx.font = `800 ${Math.max(10, S * 0.24)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('META', x, top - S * 0.25);

    for (let i = 0; i < 3; i += 1) {
      const yy = bottom - S * 0.8 - i * S * 0.8;
      ctx.globalAlpha = 0.55 - i * 0.1;
      ctx.beginPath();
      ctx.moveTo(x - S * 0.2, yy - S * 0.12);
      ctx.lineTo(x + S * 0.06, yy);
      ctx.lineTo(x - S * 0.2, yy + S * 0.12);
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawBlock(block) {
    const x = sx(block.x);
    const y = sy(block.y + block.h);
    const w = block.w * S;
    const h = block.h * S;
    if (x + w < -20 || x > W + 20) return;
    const pal = game.level.palette;

    const fill = ctx.createLinearGradient(0, y, 0, y + h);
    fill.addColorStop(0, pal.block);
    fill.addColorStop(1, 'rgba(3,7,18,0.96)');
    roundRectPath(x, y, w, h, Math.min(7, S * 0.12));
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = pal.blockEdge;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let gx = x + w / 2; gx < x + w; gx += w / 2) {
      ctx.beginPath();
      ctx.moveTo(gx, y + 3);
      ctx.lineTo(gx, y + h - 3);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x + 3, y + h / 2);
    ctx.lineTo(x + w - 3, y + h / 2);
    ctx.stroke();

    ctx.fillStyle = pal.blockEdge;
    ctx.globalAlpha = 0.65;
    ctx.fillRect(x + 3, y, Math.max(0, w - 6), 2);
    ctx.globalAlpha = 1;
  }

  function drawSpike(spike) {
    const x = sx(spike.x);
    const base = sy(spike.y);
    const w = spike.w * S;
    const h = spike.h * S;
    if (x + w < -20 || x > W + 20) return;
    const pal = game.level.palette;

    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = pal.spike;
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, base);
    ctx.lineTo(x + w / 2, base - h);
    ctx.lineTo(x + w, base);
    ctx.closePath();
    ctx.stroke();
    ctx.globalAlpha = 1;

    const fill = ctx.createLinearGradient(0, base - h, 0, base);
    fill.addColorStop(0, pal.spike);
    fill.addColorStop(0.7, pal.spike);
    fill.addColorStop(1, 'rgba(8,4,24,0.18)');
    ctx.beginPath();
    ctx.moveTo(x, base);
    ctx.lineTo(x + w / 2, base - h);
    ctx.lineTo(x + w, base);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.78)';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + w * 0.28, base);
    ctx.lineTo(x + w / 2, base - h * 0.6);
    ctx.lineTo(x + w * 0.72, base);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fill();
  }

  function drawSaw(saw) {
    const x = sx(saw.x);
    const y = sy(saw.y);
    const r = saw.r * S;
    if (x + r < -20 || x - r > W + 20) return;
    const pal = game.level.palette;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(game.time * 3.4 + saw.rot);
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = pal.spike;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = pal.spike;
    ctx.lineWidth = Math.max(1.5, S * 0.06);
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * TAU;
      ctx.moveTo(Math.cos(angle) * r * 0.55, Math.sin(angle) * r * 0.55);
      ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, r * 0.48, 0, TAU);
    ctx.fillStyle = 'rgba(5,3,16,0.85)';
    ctx.fill();
    ctx.strokeStyle = pal.spike;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, r * 0.12, 0, TAU);
    ctx.fillStyle = pal.spike;
    ctx.fill();
    ctx.restore();
  }

  function drawPad(pad) {
    const x = sx(pad.x);
    const y = sy(pad.y);
    if (x + S < -20 || x > W + 20) return;
    const pulse = 0.5 + 0.5 * Math.sin(game.time * 6 + pad.x);
    ctx.globalAlpha = 0.25 + pulse * 0.2;
    ctx.fillStyle = '#ffb347';
    roundRectPath(x + S * 0.08, y - S * 0.16, S * 0.84, S * 0.18, S * 0.09);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    roundRectPath(x + S * 0.08, y - S * 0.16, S * 0.84, S * 0.18, S * 0.09);
    ctx.stroke();

    ctx.strokeStyle = '#fff0b8';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.55 + pulse * 0.4;
    for (let i = 0; i < 2; i += 1) {
      const yy = y - S * 0.38 - i * S * 0.16;
      ctx.beginPath();
      ctx.moveTo(x + S * 0.34, yy + S * 0.08);
      ctx.lineTo(x + S * 0.5, yy - S * 0.04);
      ctx.lineTo(x + S * 0.66, yy + S * 0.08);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawOrb(orb) {
    const x = sx(orb.x);
    const y = sy(orb.y);
    const r = orb.r * S;
    if (x + r < -20 || x - r > W + 20) return;
    const pal = game.level.palette;
    const pulse = 0.5 + 0.5 * Math.sin(game.time * 4 + orb.x);
    const alpha = orb.used ? 0.22 : 0.55 + pulse * 0.35;

    ctx.globalAlpha = orb.used ? 0.18 : 0.2;
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.25, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.18, 0, TAU);
    ctx.fillStyle = pal.accent;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawCoin(coin) {
    if (coin.taken) return;
    const x = sx(coin.x);
    const y = sy(coin.y);
    if (x < -30 || x > W + 30) return;
    drawCoinShape(x, y, coin.r * S, coin.phase, game.time);
  }

  function drawCoinShape(x, y, r, phase, time) {
    const spin = Math.abs(Math.cos(time * 2.8 + phase));
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(0.22 + 0.78 * spin, 1);
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.6, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    const fill = ctx.createLinearGradient(-r, -r, r, r);
    fill.addColorStop(0, '#fff4bd');
    fill.addColorStop(0.45, '#ffd166');
    fill.addColorStop(1, '#ff9f1c');
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = '#fff4bd';
    ctx.lineWidth = Math.max(1, r * 0.16);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.45, 0, TAU);
    ctx.strokeStyle = 'rgba(120,60,0,0.35)';
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.stroke();
    ctx.restore();
  }

  function drawTrail() {
    if (!game.player.alive) return;
    const pal = game.level.palette;
    for (const item of game.trail) {
      ctx.globalAlpha = clamp(item.life, 0, 1) * 0.16;
      drawCubeShape(sx(item.x), sy(item.y), S * 0.8, item.rot, pal, false, 0, true);
    }
    ctx.globalAlpha = 1;
  }

  function drawPlayer() {
    const p = game.player;
    if (!p.alive) return;
    const pal = game.level.palette;
    const cx = sx(p.x + 0.5);
    const cy = sy(p.y + 0.5);

    const halo = ctx.createRadialGradient(cx, cy, S * 0.1, cx, cy, S * 1.8);
    halo.addColorStop(0, pal.player2);
    halo.addColorStop(0.35, 'rgba(56,246,255,0.18)');
    halo.addColorStop(1, 'rgba(56,246,255,0)');
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, S * 1.8, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    drawCubeShape(cx, cy, S * 0.92, p.rot, pal, true, p.squash, false);
  }

  function drawCubeShape(cx, cy, size, rotation, pal, face, squash, simple) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((rotation * Math.PI) / 180);
    if (squash) ctx.scale(1 + 0.18 * squash, 1 - 0.18 * squash);
    const half = size / 2;
    roundRectPath(-half, -half, size, size, size * 0.18);

    if (simple) {
      ctx.fillStyle = pal.player2;
      ctx.globalAlpha = ctx.globalAlpha;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = Math.max(1, size * 0.025);
      ctx.stroke();
      ctx.restore();
      return;
    }

    const fill = ctx.createLinearGradient(-half, -half, half, half);
    fill.addColorStop(0, pal.player);
    fill.addColorStop(0.58, pal.player2);
    fill.addColorStop(1, pal.secondary);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(1.5, size * 0.045);
    ctx.stroke();

    if (face) {
      const eyeW = size * 0.15;
      const eyeH = size * 0.2;
      const eyeY = -size * 0.1;
      ctx.fillStyle = 'rgba(3,7,20,0.8)';
      roundRectPath(-size * 0.25, eyeY, eyeW, eyeH, eyeW * 0.4);
      ctx.fill();
      roundRectPath(size * 0.1, eyeY, eyeW, eyeH, eyeW * 0.4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(3,7,20,0.62)';
      ctx.lineWidth = Math.max(1.2, size * 0.045);
      ctx.beginPath();
      ctx.arc(0, size * 0.13, size * 0.13, 0.18 * Math.PI, 0.82 * Math.PI);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(-half * 0.7, -half * 0.72, size * 0.24, size * 0.06);
    }
    ctx.restore();
  }

  function drawParticles() {
    for (const p of game.particles) {
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      const size = Math.max(1, p.size * S);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(sx(p.x), sy(p.y), size * 0.5, 0, TAU);
        ctx.fill();
      } else {
        ctx.fillRect(sx(p.x) - size / 2, sy(p.y) - size / 2, size, size);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------ *
   *  HUD and menu UI
   * ------------------------------------------------------------------ */

  function updateHUD() {
    if (game.state === 'menu') return;
    const level = game.level;
    const pct = clamp((game.player.x / level.finishX) * 100, 0, 100);
    progressFill.style.transform = `scaleX(${pct / 100})`;
    progressPct.textContent = fmtPct(pct);
    progressTrack.setAttribute('aria-valuenow', String(Math.floor(pct)));
    hudAttempt.textContent = `Intento ${game.attempts}`;
    hudCoins.textContent = `◈ ${game.runCoins}/3`;
    hudBest.textContent = `Mejor ${statsFor(level.id).best}%`;
    hudLevelName.textContent = level.name;
    hud.style.setProperty('--accent', level.accent);

    if (settings.tilt && tilt.permission === 'granted' && game.state === 'playing') {
      tiltMeter.classList.remove('hidden');
      paintTiltMeter();
    } else {
      tiltMeter.classList.add('hidden');
    }

    if (!game.hintDismissed && game.hintTimer > 3) dismissHint();
  }

  function setSwitch(element, on) {
    element.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  function updateMenuStats() {
    let best = 0;
    let attempts = 0;

    levels.forEach((level, index) => {
      const stats = statsFor(level.id);
      best = Math.max(best, stats.best);
      attempts += stats.attempts;
      const card = levelStrip.children[index];
      if (!card) return;
      card.setAttribute('aria-checked', index === game.levelIndex ? 'true' : 'false');
      card.setAttribute('aria-label', `${level.name}, dificultad ${level.difficulty}, mejor ${stats.best}%, ${stats.coins} de 3 monedas${stats.complete ? ', completado' : ''}`);
      const bestEl = card.querySelector('.level-best');
      const coinsEl = card.querySelector('.level-coins');
      const completeEl = card.querySelector('.level-complete');
      if (bestEl) bestEl.textContent = `Mejor ${stats.best}%`;
      if (coinsEl) {
        coinsEl.textContent = [0, 1, 2].map((i) => (i < stats.coins ? '●' : '○')).join(' ');
        coinsEl.setAttribute('aria-label', `${stats.coins} de 3 monedas`);
      }
      if (completeEl) completeEl.classList.toggle('hidden', !stats.complete);
    });

    $('globalBest').textContent = `Mejor global ${best}%`;
    $('globalAttempts').textContent = `${attempts} ${attempts === 1 ? 'intento' : 'intentos'}`;
    playLevelLabel.textContent = levels[game.levelIndex].name;
    app.style.setProperty('--accent', levels[game.levelIndex].accent);
    quickSound.setAttribute('aria-pressed', String(!settings.sound && !settings.music));
  }

  function buildLevelCards() {
    levelStrip.innerHTML = '';
    levels.forEach((level, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'level-card';
      card.setAttribute('role', 'radio');
      card.setAttribute('aria-checked', 'false');
      card.dataset.index = String(index);
      card.style.setProperty('--accent', level.accent);
      card.innerHTML = `
        <span class="level-top">
          <span class="level-index">${String(index + 1).padStart(2, '0')}</span>
          <span class="level-diff" aria-hidden="true">${[0, 1, 2].map((dot) => `<i class="${dot < level.diff ? 'on' : ''}"></i>`).join('')}</span>
        </span>
        <span class="level-name">${level.name}</span>
        <span class="level-meta">
          <span class="level-best">Mejor 0%</span>
          <span class="level-coins">○ ○ ○</span>
        </span>
        <span class="level-complete hidden" aria-hidden="true">✓</span>`;
      card.addEventListener('click', () => selectLevel(index));
      levelStrip.appendChild(card);
    });
  }

  function selectLevel(index) {
    game.levelIndex = clamp(index, 0, levels.length - 1);
    game.level = levels[game.levelIndex];
    save.selected = game.levelIndex;
    persist();
    updateMenuStats();
    haptic(5);
  }

  function syncSettingsUI() {
    setSwitch(soundToggle, settings.sound);
    setSwitch(musicToggle, settings.music);
    setSwitch(hapticsToggle, settings.haptics);
    setSwitch(motionToggle, settings.reduceMotion);
    setSwitch(tiltToggle, settings.tilt);
    tiltOptions.classList.toggle('hidden', !settings.tilt);
    tiltSensitivity.value = String(settings.sensitivity);
    tiltSensitivityOut.textContent = String(settings.sensitivity);
    tilt.threshold = currentTiltThreshold();

    if (!settings.tilt) {
      tiltStatus.textContent = 'Inclina el dispositivo para saltar';
    } else if (tilt.permission === 'denied') {
      tiltStatus.textContent = 'Permiso denegado · revisa Ajustes de Safari';
    } else if (tilt.permission === 'granted') {
      tiltStatus.textContent = 'Activa · inclina hacia delante o atrás';
    } else {
      tiltStatus.textContent = 'Activa · pide permiso al empezar';
    }

    const requestPermission = window.DeviceOrientationEvent && window.DeviceOrientationEvent.requestPermission;
    if (tilt.permission === 'denied') {
      $('motionHint').textContent = 'Permiso denegado. En iPhone/iPad abre Ajustes de Safari y permite el movimiento para este sitio.';
    } else if (typeof requestPermission === 'function') {
      $('motionHint').textContent = 'En iPhone/iPad se pedirá permiso al activar. Mantén el dispositivo cómodo y pulsa Calibrar.';
    } else {
      $('motionHint').textContent = 'Mantén el dispositivo cómodo y pulsa Calibrar. En Android el sensor funciona sin permiso.';
    }

    quickSound.setAttribute('aria-pressed', String(!settings.sound && !settings.music));
  }

  function openSettings(from) {
    settingsReturn = from;
    lastFocus = document.activeElement;
    if (from === 'menu') menuScreen.classList.add('hidden');
    if (from === 'pause') pauseScreen.classList.add('hidden');
    settingsScreen.classList.remove('hidden');
    settingsScreen.setAttribute('aria-hidden', 'false');
    syncSettingsUI();
    window.setTimeout(() => $('settingsClose').focus({ preventScroll: true }), 80);
  }

  function closeSettings() {
    settingsScreen.classList.add('hidden');
    settingsScreen.setAttribute('aria-hidden', 'true');
    if (settingsReturn === 'pause' && game.state === 'paused') {
      pauseScreen.classList.remove('hidden');
      pauseScreen.setAttribute('aria-hidden', 'false');
      window.setTimeout(() => $('resumeBtn').focus({ preventScroll: true }), 80);
    } else {
      menuScreen.classList.remove('hidden');
      if (lastFocus && lastFocus.isConnected) {
        window.setTimeout(() => lastFocus.focus({ preventScroll: true }), 80);
      }
    }
  }

  function openHow() {
    lastFocus = document.activeElement;
    menuScreen.classList.add('hidden');
    howScreen.classList.remove('hidden');
    howScreen.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => $('howClose').focus({ preventScroll: true }), 80);
  }

  function closeHow() {
    howScreen.classList.add('hidden');
    howScreen.setAttribute('aria-hidden', 'true');
    menuScreen.classList.remove('hidden');
    if (lastFocus && lastFocus.isConnected) {
      window.setTimeout(() => lastFocus.focus({ preventScroll: true }), 80);
    }
  }

  /* ------------------------------------------------------------------ *
   *  Settings events
   * ------------------------------------------------------------------ */

  soundToggle.addEventListener('click', () => {
    settings.sound = !settings.sound;
    audio.init();
    audio.setSound(settings.sound);
    persist();
    syncSettingsUI();
  });

  musicToggle.addEventListener('click', () => {
    settings.music = !settings.music;
    audio.init();
    audio.setMusic(settings.music);
    if (settings.music && game.state === 'playing') audio.startMusic();
    persist();
    syncSettingsUI();
  });

  quickSound.addEventListener('click', () => {
    const turnOn = !(settings.sound && settings.music);
    settings.sound = turnOn;
    settings.music = turnOn;
    audio.init();
    audio.setSound(settings.sound);
    audio.setMusic(settings.music);
    if (turnOn && game.state === 'playing') audio.startMusic();
    persist();
    syncSettingsUI();
    showToast(turnOn ? 'Sonido activado.' : 'Sonido silenciado.');
  });

  hapticsToggle.addEventListener('click', () => {
    settings.haptics = !settings.haptics;
    persist();
    syncSettingsUI();
    if (settings.haptics) haptic(8);
  });

  motionToggle.addEventListener('click', () => {
    settings.reduceMotion = !settings.reduceMotion;
    persist();
    syncSettingsUI();
  });

  tiltToggle.addEventListener('click', toggleTilt);

  tiltSensitivity.addEventListener('input', () => {
    settings.sensitivity = clamp(Number(tiltSensitivity.value) || 3, 1, 5);
    tilt.threshold = currentTiltThreshold();
    tiltSensitivityOut.textContent = String(settings.sensitivity);
    persist();
    paintTiltMeter();
  });

  calibrateBtn.addEventListener('click', calibrateTilt);

  resetProgressBtn.addEventListener('click', () => {
    if (!resetArmed) {
      resetArmed = true;
      resetProgressBtn.textContent = '¿Seguro? Toca otra vez';
      if (resetTimer) window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        resetArmed = false;
        resetProgressBtn.textContent = 'Borrar progreso';
      }, 3200);
      return;
    }

    resetArmed = false;
    if (resetTimer) window.clearTimeout(resetTimer);
    for (const level of levels) save.levels[level.id] = freshLevelStats();
    save.selected = 0;
    game.levelIndex = 0;
    game.level = levels[0];
    persist();
    updateMenuStats();
    syncSettingsUI();
    resetProgressBtn.textContent = 'Progreso borrado';
    window.setTimeout(() => { resetProgressBtn.textContent = 'Borrar progreso'; }, 2200);
    showToast('Progreso borrado. Empieza de cero.');
  });

  /* ------------------------------------------------------------------ *
   *  Screens and buttons
   * ------------------------------------------------------------------ */

  playBtn.addEventListener('click', requestStart);
  $('pauseBtn').addEventListener('click', pauseGame);
  $('resumeBtn').addEventListener('click', resumeGame);
  $('restartBtn').addEventListener('click', () => startRun(levels[game.levelIndex]));
  $('pauseSettingsBtn').addEventListener('click', () => openSettings('pause'));
  $('quitBtn').addEventListener('click', quitToMenu);
  $('settingsBtn').addEventListener('click', () => openSettings('menu'));
  $('howBtn').addEventListener('click', openHow);
  $('settingsClose').addEventListener('click', closeSettings);
  $('howClose').addEventListener('click', closeHow);
  $('howUnderstood').addEventListener('click', closeHow);
  $('replayBtn').addEventListener('click', () => startRun(levels[game.levelIndex]));
  $('resultMenuBtn').addEventListener('click', quitToMenu);
  nextBtn.addEventListener('click', nextLevel);
  $('deathMenuBtn').addEventListener('click', quitToMenu);
  $('retryBtn').addEventListener('click', retry);

  deathScreen.addEventListener('pointerdown', (event) => {
    if (event.target.closest('#deathMenuBtn')) return;
    if (game.deathTimer < 0.2) return;
    event.preventDefault();
    retry();
  });

  settingsScreen.addEventListener('click', (event) => {
    if (event.target === settingsScreen) closeSettings();
  });

  howScreen.addEventListener('click', (event) => {
    if (event.target === howScreen) closeHow();
  });

  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  /* ------------------------------------------------------------------ *
   *  Main loop
   * ------------------------------------------------------------------ */

  let lastTime = performance.now();
  let accumulator = 0;

  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    game.menuTime += dt;

    if (game.state === 'playing') {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= FIXED_DT && steps < 8 && game.state === 'playing') {
        game.time += FIXED_DT;
        autoPlay();
        stepPlayer(FIXED_DT);
        updateParticles(FIXED_DT);
        game.hintTimer += FIXED_DT;
        game.hudTimer += FIXED_DT;
        accumulator -= FIXED_DT;
        steps += 1;
      }
      if (game.state !== 'playing') accumulator = 0;
      if (game.hudTimer > 0.07) {
        game.hudTimer = 0;
        updateHUD();
      }
      if (game.shake > 0) game.shake = Math.max(0, game.shake - dt * 2.2);
    } else if (game.state === 'dead') {
      game.deathTimer += dt;
      updateParticles(dt * 0.65);
      game.shake = Math.max(0, game.shake - dt * 2.4);
    } else if (game.state === 'won') {
      game.winTimer += dt;
      updateParticles(dt * 0.8);
      game.shake = Math.max(0, game.shake - dt * 2.6);
    } else if (game.state === 'menu') {
      updateParticles(dt);
    }

    draw();
    window.requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------ *
   *  Init
   * ------------------------------------------------------------------ */

  function init() {
    buildLevelCards();
    resize();
    game.level = levels[game.levelIndex];
    game.camX = 0;
    hud.classList.add('hidden');
    hud.setAttribute('aria-hidden', 'true');
    hideAllScreens();
    menuScreen.classList.remove('hidden');
    updateMenuStats();
    syncSettingsUI();

    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', resize);
    }

    if (game.autoplay) {
      game.levelIndex = 0;
      save.selected = 0;
      startRun(levels[0]);
    }

    window.requestAnimationFrame(frame);
  }

  window.__neon = {
    levels,
    game,
    save,
    tilt,
    start(index = game.levelIndex) {
      game.levelIndex = clamp(Number(index) || 0, 0, levels.length - 1);
      save.selected = game.levelIndex;
      persist();
      startRun(levels[game.levelIndex]);
    },
    simulate(seconds = 60) {
      const total = Math.min(120, Math.max(0.01, Number(seconds) || 60));
      const steps = Math.ceil(total / FIXED_DT);
      for (let i = 0; i < steps && game.state === 'playing'; i += 1) {
        game.time += FIXED_DT;
        autoPlay();
        stepPlayer(FIXED_DT);
        updateParticles(FIXED_DT);
      }
      const pct = clamp((game.player.x / game.level.finishX) * 100, 0, 100);
      return { state: game.state, pct, coins: game.runCoins, attempts: game.attempts, reason: game.deathReason || null, x: game.player.x, y: game.deathY || 0, vy: game.deathVy || 0 };
    },
    setAutoplay(value) { game.autoplay = Boolean(value); },
    get state() { return game.state; },
  };

  init();
})();
