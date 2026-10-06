/* Tiny synthesised sound effects (Web Audio) — no audio files needed. */
(function () {
  'use strict';
  var ctx = null;
  var muted = localStorage.getItem('ftg-muted') === '1';

  function ac() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  // iOS needs a user gesture to unlock audio
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
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(start, dur, vol) {
    var c = ac(); if (!c || muted) return;
    var len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    var s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900;
    s.buffer = buf; g.gain.value = vol || 0.4;
    s.connect(f); f.connect(g); g.connect(c.destination);
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

  window.FTG_SOUND = {
    play: function (name) { try { if (SFX[name]) SFX[name](); } catch (e) { /* ignore */ } },
    isMuted: function () { return muted; },
    setMuted: function (m) { muted = !!m; localStorage.setItem('ftg-muted', muted ? '1' : '0'); },
    toggle: function () { this.setMuted(!muted); return muted; }
  };
})();
