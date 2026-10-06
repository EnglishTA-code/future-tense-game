/* Tiny synthesised sound effects + ORIGINAL background music (Web Audio) — no audio files, works offline.
   Music is HOST-ONLY: it does nothing until FTG_SOUND.enableMusic() is called (host.js does; player.js never does). */
(function () {
  'use strict';
  var ctx = null, sfxBus = null, musicBus = null, duckGain = null;
  var muted = localStorage.getItem('ftg-muted') === '1';
  var MUSIC_VOL = 0.16;          // quiet bed under the teacher's voice (SFX stay at their old level)
  var unlockCbs = [];

  function buildGraph(c) {
    sfxBus = c.createGain(); sfxBus.gain.value = 1; sfxBus.connect(c.destination);
    duckGain = c.createGain(); duckGain.gain.value = 1; duckGain.connect(c.destination);
    musicBus = c.createGain(); musicBus.gain.value = MUSIC_VOL; musicBus.connect(duckGain);
  }
  function ac() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      buildGraph(ctx);
      ctx.onstatechange = onCtxState;
    }
    if (ctx.state === 'suspended' && !M.hidden) { var p = ctx.resume(); if (p && p.then) p.then(onCtxState, function () {}); }
    return ctx;
  }
  function onCtxState() {
    if (!ctx || ctx.state !== 'running') return;
    if (unlockCbs.length) { var cbs = unlockCbs; unlockCbs = []; cbs.forEach(function (f) { try { f(); } catch (e) { /* */ } }); }
    M.refresh();
  }
  // browsers (and iOS) need a user gesture to unlock audio
  ['pointerdown', 'touchend', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, function () { ac(); }, { passive: true });
  });

  function tone(freq, start, dur, type, vol, slideTo) {
    var c = ac(); if (!c || muted) return;
    var t0 = c.currentTime + (start || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(start, dur, vol) {
    var c = ac(); if (!c || muted) return;
    var len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    var s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900;
    s.buffer = buf; g.gain.value = vol || 0.4;
    s.connect(f); f.connect(g); g.connect(sfxBus);
    s.start(c.currentTime + (start || 0));
  }

  var SFX = {
    tap:     function () { tone(660, 0, 0.06, 'triangle', 0.12); },
    pop:     function () { tone(500, 0, 0.12, 'sine', 0.25, 1100); },
    join:    function () { tone(523, 0, 0.1, 'triangle', 0.2); tone(784, 0.08, 0.15, 'triangle', 0.2); },
    good:    function () { tone(659, 0, 0.12, 'triangle', 0.25); tone(880, 0.1, 0.12, 'triangle', 0.25); tone(1319, 0.2, 0.25, 'triangle', 0.22); },
    bad:     function () { tone(220, 0, 0.25, 'sawtooth', 0.15, 140); tone(160, 0.2, 0.3, 'sawtooth', 0.15, 90); },
    boom:    function () { noise(0, 0.6, 0.5); tone(120, 0, 0.4, 'sine', 0.4, 40); },
    tick:    function () { tone(1000, 0, 0.04, 'square', 0.06); },
    alarm:   function () { tone(880, 0, 0.15, 'square', 0.12); tone(660, 0.18, 0.15, 'square', 0.12); tone(880, 0.36, 0.15, 'square', 0.12); },
    whoosh:  function () { tone(300, 0, 0.35, 'sawtooth', 0.08, 1200); noise(0, 0.3, 0.15); },
    fanfare: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.14, 0.22, 'triangle', 0.22); }); tone(1047, 0.6, 0.6, 'triangle', 0.25); tone(1319, 0.6, 0.6, 'triangle', 0.18); }
  };
  var NO_DUCK = { tap: 1, tick: 1 };
  // music dips under sound effects, then comes back
  function duck() {
    if (!ctx || !duckGain) return;
    var t = ctx.currentTime, g = duckGain.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.3, t + 0.04); g.setTargetAtTime(1, t + 0.45, 0.18);
    M.ducks++;
  }

  /* ======================= MUSIC ======================= */
  /* All melodies below are original (written for this game): simple chord progressions + own motifs. */
  var NOISE = null; // one shared white-noise buffer per context (hats / claps), never re-created per note
  function noiseBuf(c) {
    if (NOISE && NOISE.c === c) return NOISE.b;
    var len = Math.floor(c.sampleRate * 0.5), b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    NOISE = { c: c, b: b }; return b;
  }
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function env(c, dest, t, a, peak, dec) { // gain node with a quick attack + exponential decay
    var g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
    g.connect(dest); return g;
  }
  function osc(c, type, f, t, end, dest) { var o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.connect(dest); o.start(t); o.stop(end); M.nodes++; return o; }
  var INST = {
    marimba: function (c, d, t, m, v) { var f = hz(m), g = env(c, d, t, 0.004, 0.5 * v, 0.32), g2 = env(c, d, t, 0.002, 0.12 * v, 0.06); osc(c, 'sine', f, t, t + 0.4, g); osc(c, 'sine', f * 4, t, t + 0.1, g2); },
    pluck:   function (c, d, t, m, v) { var g = env(c, d, t, 0.004, 0.22 * v, 0.16); osc(c, 'triangle', hz(m), t, t + 0.2, g); },
    chip:    function (c, d, t, m, v) { var g = env(c, d, t, 0.003, 0.09 * v, 0.11); osc(c, 'square', hz(m), t, t + 0.14, g); },
    bass:    function (c, d, t, m, v, len) { var g = env(c, d, t, 0.006, 0.5 * v, Math.max(0.1, len * 0.9)); osc(c, 'triangle', hz(m), t, t + len + 0.1, g); },
    kick:    function (c, d, t, m, v) { var g = env(c, d, t, 0.002, 0.7 * v, 0.16); var o = osc(c, 'sine', 140, t, t + 0.2, g); o.frequency.exponentialRampToValueAtTime(45, t + 0.12); },
    hat:     function (c, d, t, m, v) { var g = env(c, d, t, 0.001, 0.12 * v, 0.035), f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; f.connect(g); var s = c.createBufferSource(); s.buffer = noiseBuf(c); s.connect(f); s.start(t, Math.random() * 0.4, 0.06); M.nodes++; },
    clap:    function (c, d, t, m, v) { var g = env(c, d, t, 0.002, 0.25 * v, 0.1), f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1600; f.Q.value = 0.8; f.connect(g); var s = c.createBufferSource(); s.buffer = noiseBuf(c); s.connect(f); s.start(t, Math.random() * 0.3, 0.14); M.nodes++; },
    tick:    function (c, d, t, m, v) { var g = env(c, d, t, 0.001, 0.22 * v, 0.03); osc(c, 'sine', m ? hz(m) : 1900, t, t + 0.05, g); },
    brass:   function (c, d, t, m, v, len) { var g = c.createGain(), f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.linearRampToValueAtTime(2600, t + 0.06); f.connect(g); g.connect(d);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22 * v, t + 0.03); g.gain.setValueAtTime(0.22 * v, t + Math.max(0.04, len - 0.06)); g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.12);
      osc(c, 'sawtooth', hz(m), t, t + len + 0.15, f); osc(c, 'sawtooth', hz(m) * 1.004, t, t + len + 0.15, f); }
  };

  // chord progressions (MIDI roots + chord tones) → note lanes per 16th step
  function lanesFrom(spec) {
    var steps = spec.bars * 16, L = {}, k;
    for (k in spec.lanes) L[k] = new Array(steps);
    for (var b = 0; b < spec.bars; b++) {
      var ch = spec.chords[b % spec.chords.length];
      for (k in spec.lanes) {
        var pat = spec.lanes[k], row = typeof pat === 'function' ? pat(b, ch) : pat;
        for (var s = 0; s < 16; s++) { var x = row[s]; if (x == null || x === '.') continue; L[k][b * 16 + s] = typeof x === 'number' ? (k === 'drum' || k === 'tick' ? x : ch[x] + (spec.oct[k] || 0)) : x; }
      }
    }
    return L;
  }
  // chord = [root, third, fifth, octave, 10th] in MIDI (around C4)
  var C_ = [60, 64, 67, 72, 76], Am = [57, 60, 64, 69, 72], F_ = [53, 57, 60, 65, 69], G_ = [55, 59, 62, 67, 71], Dm = [50, 53, 57, 62, 65], Bb = [58, 62, 65, 70, 74], E_ = [52, 56, 59, 64, 68];
  var _ = null;
  var TRACKS = {
    // LOBBY — 126 BPM, C major, bouncy marimba + chip counter-line, triangle bass, kick/clap/hats
    lobby: { bpm: 126, bars: 4, chords: [C_, Am, F_, G_], inst: { lead: 'marimba', chip: 'chip', bass: 'bass' }, oct: { lead: 12, chip: 24, bass: -24 }, vol: { lead: 1, chip: 0.7, bass: 0.9, drum: 0.8 },
      lanes: {
        lead: function (b) { return b % 2 ? [3, _, _, 2, _, _, 3, _, 4, _, 3, _, 2, _, 0, _] : [2, _, 3, _, 2, _, 1, _, 0, _, 1, 2, _, _, 1, _]; },
        chip: [_, _, _, _, _, _, _, _, _, _, _, _, 2, 1, 0, _],
        bass: [0, _, _, 0, _, _, 2, _, 0, _, _, 0, _, _, 2, _],
        drum: ['k', _, 'h', _, 'c', _, 'h', _, 'k', _, 'h', 'k', 'c', _, 'h', _]
      } },
    // PLANNING — 112 BPM, F major, light & busy: non-stop 16th pluck arpeggio, soft bass, shaker hats, no clap
    planning: { bpm: 112, bars: 4, chords: [F_, Dm, Bb, C_], inst: { arp: 'pluck', lead: 'marimba', bass: 'bass' }, oct: { arp: 12, lead: 12, bass: -24 }, vol: { arp: 0.75, lead: 0.55, bass: 0.7, drum: 0.5 },
      lanes: {
        arp: [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 1],
        lead: function (b) { return b === 3 ? [_, _, _, _, _, _, _, _, 4, _, 3, _, 2, _, _, _] : [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _]; },
        bass: [0, _, _, _, 2, _, _, _, 0, _, _, _, 2, _, 1, _],
        drum: ['k', 'h', 'h', 'h', _, 'h', 'h', 'h', _, 'h', 'h', 'h', _, 'h', 'h', 'h']
      } },
    // ROUND — 148 BPM, A minor (tense but fun), driving 8th bass, four-on-the-floor, chip stabs, clock tick every beat
    round: { bpm: 148, bars: 4, chords: [Am, F_, G_, E_], inst: { stab: 'chip', lead: 'marimba', bass: 'bass' }, oct: { stab: 12, lead: 12, bass: -24 }, vol: { stab: 0.9, lead: 0.7, bass: 0.9, drum: 0.85, tick: 0.8 },
      lanes: {
        stab: [_, _, 0, _, _, 1, _, _, 2, _, _, 1, _, _, 0, _],
        lead: function (b) { return b % 2 ? [_, _, _, _, _, _, _, _, 3, _, 2, _, 1, _, 2, _] : [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _]; },
        bass: [0, _, 0, _, 0, _, 3, _, 0, _, 0, _, 2, _, 3, _],
        drum: ['k', 'h', 'h', 'h', 'k', 'h', 'c', 'h', 'k', 'h', 'h', 'h', 'k', 'h', 'c', 'h'],
        tick: [96, _, _, _, 91, _, _, _, 96, _, _, _, 91, _, _, _]
      },
      urgent: { tempo: 1.25, tick: [96, _, 91, _, 96, _, 91, _, 96, _, 91, _, 96, _, 91, _] } }
  };
  for (var tn in TRACKS) TRACKS[tn].L = lanesFrom(TRACKS[tn]);
  TRACKS.round.Lu = lanesFrom({ bars: 4, chords: TRACKS.round.chords, oct: {}, lanes: { tick: TRACKS.round.urgent.tick } });

  // one-shot stingers: [time in beats, instrument, midi, length in beats, vol]
  var STINGERS = {
    reveal: { bpm: 150, notes: [[0, 'marimba', 72, .5, 1], [.5, 'marimba', 76, .5, 1], [1, 'marimba', 79, .5, 1], [1.5, 'marimba', 84, 1, 1.1], [1.5, 'chip', 88, .5, .8], [0, 'kick', 0, .5, 1], [1.5, 'kick', 0, .5, 1], [1.5, 'clap', 0, .5, 1], [1.5, 'bass', 36, 1.5, 1]] },
    hit: { bpm: 150, notes: [[0, 'chip', 79, .25, 1], [.25, 'chip', 74, .25, 1], [.5, 'chip', 70, .25, 1], [.75, 'chip', 67, .25, 1], [1, 'kick', 0, .5, 1.2], [1, 'clap', 0, .5, 1.2], [1, 'bass', 31, 1, 1], [1.5, 'marimba', 79, .5, .9], [1.75, 'marimba', 84, .5, .9]] },
    fanfare: { bpm: 120, notes: [
      [0, 'brass', 67, .3, 1], [.33, 'brass', 67, .3, 1], [.66, 'brass', 67, .3, 1], [1, 'brass', 72, 1.4, 1.1], [1, 'brass', 64, 1.4, .7], [1, 'kick', 0, .5, 1],
      [2.5, 'brass', 69, .45, 1], [3, 'brass', 71, .45, 1], [3, 'brass', 65, .45, .7], [3.5, 'brass', 74, 2.2, 1.1], [3.5, 'brass', 67, 2.2, .7], [3.5, 'brass', 79, 2.2, .6],
      [3.5, 'kick', 0, .5, 1], [3.5, 'clap', 0, .5, 1], [3.5, 'bass', 43, 2, 1], [1, 'bass', 48, 1.4, 1],
      [6, 'marimba', 72, .5, 1], [6.25, 'marimba', 76, .5, 1], [6.5, 'marimba', 79, .5, 1], [6.75, 'marimba', 84, 1.5, 1.1], [6.75, 'brass', 72, 1.6, 1], [6.75, 'brass', 76, 1.6, .7], [6.75, 'bass', 36, 1.6, 1], [6.75, 'kick', 0, .5, 1.1], [6.75, 'clap', 0, .5, 1.1]] }
  };

  function playStep(c, dest, tr, step, t, stepDur, urgent) {
    var L = tr.L, n = step % (tr.bars * 16), k, x;
    for (k in L) {
      x = L[k][n]; if (x == null) continue;
      if (k === 'tick') { if (!urgent) INST.tick(c, dest, t, x, tr.vol.tick || 0.7); continue; }
      if (k === 'drum') { INST[x === 'k' ? 'kick' : x === 'c' ? 'clap' : 'hat'](c, dest, t, 0, tr.vol.drum || 0.8); continue; }
      INST[tr.inst[k]](c, dest, t, x, tr.vol[k] || 0.8, stepDur * 2);
    }
    if (urgent && tr.Lu) { x = tr.Lu.tick[n]; if (x != null) INST.tick(c, dest, t, x, 1); }
  }
  function playStinger(c, dest, name, t0) {
    var s = STINGERS[name]; if (!s) return 0; var beat = 60 / s.bpm, end = 0;
    s.notes.forEach(function (n) { INST[n[1]](c, dest, t0 + n[0] * beat, n[2], n[4], n[3] * beat); end = Math.max(end, (n[0] + n[3]) * beat); });
    return end + 0.5;
  }

  /* ---- look-ahead scheduler: ONE setTimeout loop (25 ms) that schedules ~100 ms ahead; never two loops ---- */
  var LOOKAHEAD = 0.1, TICK_MS = 25;
  var M = {
    enabled: false, want: null, track: null, playing: false, urgent: false, hidden: false,
    step: 0, nextT: 0, timer: null, trackGain: null, nodes: 0, ducks: 0, switches: 0, loops: 0, stingers: 0, lastStinger: null,
    refresh: function () { // (re)start / stop according to want + mute + visibility + context state
      var ok = M.enabled && M.want && !muted && !M.hidden && ctx && ctx.state === 'running';
      if (ok && (M.track !== M.want || !M.playing)) startTrack(M.want);
      else if (!ok && M.playing) stopTrack(0.25);
    }
  };
  function startTrack(name) {
    var c = ctx, tr = TRACKS[name];
    stopTrack(0.3); // crossfade out whatever is playing — never stack two loops
    if (!tr) { M.track = name; return; } // one-shot "tracks" (podium) have no loop
    M.trackGain = c.createGain(); M.trackGain.gain.setValueAtTime(0.0001, c.currentTime); M.trackGain.gain.exponentialRampToValueAtTime(1, c.currentTime + 0.25); M.trackGain.connect(musicBus);
    M.track = name; M.playing = true; M.step = 0; M.nextT = c.currentTime + 0.06; M.switches++;
    schedule();
  }
  function stopTrack(fade) {
    if (M.timer) { clearTimeout(M.timer); M.timer = null; }
    M.loops = 0;
    if (M.trackGain && ctx) { var g = M.trackGain, t = ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0.0001, t + (fade || 0.2)); setTimeout(function () { try { g.disconnect(); } catch (e) { /* */ } }, (fade || 0.2) * 1000 + 200); }
    M.trackGain = null; M.playing = false;
  }
  function schedule() {
    M.timer = null;
    if (!M.playing || !ctx) return;
    M.loops = 1;
    var tr = TRACKS[M.track], c = ctx;
    if (M.nextT < c.currentTime - 0.2) M.nextT = c.currentTime + 0.05; // after a stall, don't machine-gun the backlog
    var tempo = tr.bpm * (M.urgent && tr.urgent ? tr.urgent.tempo : 1), stepDur = 60 / tempo / 4;
    while (M.nextT < c.currentTime + LOOKAHEAD) {
      playStep(c, M.trackGain, tr, M.step, M.nextT, stepDur, M.urgent);
      M.nextT += stepDur; M.step++;
    }
    M.timer = setTimeout(schedule, TICK_MS);
  }
  document.addEventListener('visibilitychange', function () {
    if (!M.enabled) return;
    M.hidden = document.hidden;
    if (M.hidden) { stopTrack(0.05); if (ctx && ctx.state === 'running') ctx.suspend(); }
    else if (ctx) { var p = ctx.resume(); if (p && p.then) p.then(M.refresh, function () {}); else M.refresh(); }
  });

  // offline preview: renders a loop / stinger into an OfflineAudioContext → 16-bit WAV (ArrayBuffer). Not used by the game.
  function renderPreview(name, secs, opts) {
    opts = opts || {};
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext, sr = 44100;
    var c = new OAC(2, Math.ceil(sr * secs), sr), bus = c.createGain(); bus.gain.value = opts.vol || 0.6; bus.connect(c.destination);
    if (STINGERS[name]) playStinger(c, bus, name, 0.05);
    else {
      var tr = TRACKS[name], t = 0.05, step = 0;
      while (t < secs) { var u = opts.urgentAt != null && t >= opts.urgentAt, sd = 60 / (tr.bpm * (u && tr.urgent ? tr.urgent.tempo : 1)) / 4; playStep(c, bus, tr, step, t, sd, u); t += sd; step++; }
    }
    return c.startRendering().then(function (buf) { return wav(buf); });
  }
  function wav(buf) {
    var ch = buf.numberOfChannels, len = buf.length, out = new DataView(new ArrayBuffer(44 + len * ch * 2)), p = 0;
    function s(str) { for (var i = 0; i < str.length; i++) out.setUint8(p++, str.charCodeAt(i)); }
    function u32(v) { out.setUint32(p, v, true); p += 4; } function u16(v) { out.setUint16(p, v, true); p += 2; }
    s('RIFF'); u32(36 + len * ch * 2); s('WAVE'); s('fmt '); u32(16); u16(1); u16(ch); u32(buf.sampleRate); u32(buf.sampleRate * ch * 2); u16(ch * 2); u16(16); s('data'); u32(len * ch * 2);
    var data = []; for (var k = 0; k < ch; k++) data.push(buf.getChannelData(k));
    for (var i = 0; i < len; i++) for (k = 0; k < ch; k++) { var v = Math.max(-1, Math.min(1, data[k][i])); out.setInt16(p, v < 0 ? v * 0x8000 : v * 0x7fff, true); p += 2; }
    return out.buffer;
  }

  window.FTG_SOUND = {
    play: function (name) { try { if (SFX[name]) { SFX[name](); if (!NO_DUCK[name] && M.playing && !muted) duck(); } } catch (e) { /* ignore */ } },
    isMuted: function () { return muted; },
    setMuted: function (m) { muted = !!m; localStorage.setItem('ftg-muted', muted ? '1' : '0'); M.refresh(); },
    toggle: function () { this.setMuted(!muted); return muted; },
    /* ---- music (host only) ---- */
    enableMusic: function () { M.enabled = true; M.hidden = !!document.hidden; },
    music: function (name) { // name: 'lobby' | 'planning' | 'round' | 'podium' | null (silence)
      if (!M.enabled) return;
      if (name === M.want) return;
      var was = M.want; M.want = name || null; M.urgent = false;
      if (name === 'podium' && was !== 'podium') this.stinger('fanfare');
      if (!M.want) { stopTrack(0.3); M.track = null; return; }
      if (ctx) M.refresh(); else ac();
    },
    urgent: function (on) { if (M.enabled) M.urgent = !!on; }, // round: last 5 s → faster + double ticks
    stinger: function (name) {
      if (!M.enabled || muted || M.hidden || !ctx || ctx.state !== 'running') return;
      var t = ctx.currentTime + 0.03, g = ctx.createGain(); g.gain.value = 1.15; g.connect(musicBus);
      var len = playStinger(ctx, g, name, t); M.stingers++; M.lastStinger = name;
      setTimeout(function () { try { g.disconnect(); } catch (e) { /* */ } }, len * 1000 + 300);
    },
    unlocked: function () { return !!(ctx && ctx.state === 'running'); },
    supported: function () { return !!(window.AudioContext || window.webkitAudioContext); },
    onUnlock: function (f) { if (ctx && ctx.state === 'running') f(); else unlockCbs.push(f); },
    musicState: function () { return { enabled: M.enabled, want: M.want, track: M.track, playing: M.playing, urgent: M.urgent, hidden: M.hidden, muted: muted, ctx: ctx ? ctx.state : 'none', nodes: M.nodes, loops: M.loops, switches: M.switches, ducks: M.ducks, stingers: M.stingers, lastStinger: M.lastStinger, timer: !!M.timer }; },
    renderPreview: renderPreview,
    tracks: function () { var o = {}; for (var k in TRACKS) o[k] = { bpm: TRACKS[k].bpm, bars: TRACKS[k].bars }; return o; }
  };
})();
