/* Shared helpers for host and player pages. */
(function () {
  'use strict';

  var AVATARS = ['🐶', '🐱', '🐼', '🦊', '🐸', '🐵', '🐯', '🐨', '🐰', '🦄', '🐧', '🐙'];
  var SLOTS = [
    { day: 'Saturday', short: 'Sat', part: 'Morning', icon: '🌅' },
    { day: 'Saturday', short: 'Sat', part: 'Afternoon', icon: '☀️' },
    { day: 'Saturday', short: 'Sat', part: 'Evening', icon: '🌙' },
    { day: 'Sunday', short: 'Sun', part: 'Morning', icon: '🌅' },
    { day: 'Sunday', short: 'Sun', part: 'Afternoon', icon: '☀️' },
    { day: 'Sunday', short: 'Sun', part: 'Evening', icon: '🌙' }
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c];
    });
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function rid(n) {
    var s = '', abc = 'abcdefghijkmnpqrstuvwxyz23456789';
    for (var i = 0; i < (n || 10); i++) s += abc[Math.floor(Math.random() * abc.length)];
    return s;
  }
  function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }

  /* Highlight the verb part of a sentence for reveals */
  var VERB_RX = /\b(shall|will|won't|'ll|am|is|are|aren't|isn't|'m|'re|'s|going to|doesn't|does|[a-z]+ing|starts|leaves|opens|closes|arrives|begins)\b/gi;

  /* ---------------- Tile builder ---------------- */
  function TileBuilder(container, opts) {
    var self = this;
    this.opts = opts || {};
    this.tiles = shuffle(opts.tiles || []);
    this.placed = [];
    this.disabled = false;
    container.innerHTML =
      '<div class="builder">' +
        '<div class="answer-line" data-testid="answer-line"><span class="answer-ph">Tap the words in order 👇</span></div>' +
        '<div class="tile-bank" data-testid="tile-bank"></div>' +
        '<div class="builder-actions">' +
          '<button type="button" class="btn btn-ghost btn-clear" data-testid="clear">↺ Clear</button>' +
          '<button type="button" class="btn btn-go btn-check" data-testid="submit" disabled>' + esc(opts.submitLabel || 'Check ✔') + '</button>' +
        '</div>' +
      '</div>';
    this.root = container.firstChild;
    this.line = $('.answer-line', this.root);
    this.bank = $('.tile-bank', this.root);
    this.btnCheck = $('.btn-check', this.root);
    this.tiles.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'tile'; b.textContent = t.text;
      b.setAttribute('data-text', t.text); b.setAttribute('data-id', t.id);
      b.addEventListener('click', function () { self.place(t, b); });
      self.bank.appendChild(b);
    });
    $('.btn-clear', this.root).addEventListener('click', function () { if (!self.disabled) { self.reset(); window.FTG_SOUND && FTG_SOUND.play('tap'); } });
    this.btnCheck.addEventListener('click', function () {
      if (self.disabled || !self.placed.length) return;
      if (self.opts.onSubmit) self.opts.onSubmit(self.getTiles(), self);
    });
  }
  TileBuilder.prototype.place = function (t, bankBtn) {
    if (this.disabled || bankBtn.classList.contains('used')) return;
    var self = this;
    window.FTG_SOUND && FTG_SOUND.play('tap');
    bankBtn.classList.add('used');
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'tile placed pop-in'; b.textContent = t.text;
    b.setAttribute('data-text', t.text);
    b.addEventListener('click', function () {
      if (self.disabled) return;
      self.placed = self.placed.filter(function (p) { return p.t !== t; });
      b.remove(); bankBtn.classList.remove('used');
      self.refresh();
    });
    this.placed.push({ t: t, b: b });
    this.line.appendChild(b);
    this.refresh();
  };
  TileBuilder.prototype.refresh = function () {
    $('.answer-ph', this.line) && ($('.answer-ph', this.line).style.display = this.placed.length ? 'none' : '');
    this.btnCheck.disabled = this.disabled || !this.placed.length;
  };
  TileBuilder.prototype.getTiles = function () { return this.placed.map(function (p) { return p.t.text; }); };
  TileBuilder.prototype.reset = function () {
    this.placed.forEach(function (p) { p.b.remove(); });
    this.placed = [];
    $all('.tile.used', this.bank).forEach(function (b) { b.classList.remove('used'); });
    this.refresh();
  };
  TileBuilder.prototype.disable = function () {
    this.disabled = true; this.root.classList.add('disabled'); this.refresh();
  };
  TileBuilder.prototype.enable = function () {
    this.disabled = false; this.root.classList.remove('disabled'); this.refresh();
  };
  TileBuilder.prototype.shake = function () {
    var r = this.line; r.classList.remove('shake'); void r.offsetWidth; r.classList.add('shake');
  };

  /* ---------------- Confetti ---------------- */
  function confetti(n, host) {
    host = host || document.body;
    var colors = ['#ff6b6b', '#ffd43b', '#51cf66', '#4dabf7', '#cc5de8', '#ff922b', '#ffffff'];
    var box = document.createElement('div'); box.className = 'confetti-box';
    for (var i = 0; i < (n || 120); i++) {
      var c = document.createElement('i');
      c.style.left = (Math.random() * 100) + '%';
      c.style.background = colors[i % colors.length];
      c.style.animationDelay = (Math.random() * 1.2) + 's';
      c.style.animationDuration = (2.5 + Math.random() * 2) + 's';
      c.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
      if (i % 3 === 0) c.style.borderRadius = '50%';
      box.appendChild(c);
    }
    host.appendChild(box);
    setTimeout(function () { box.remove(); }, 6000);
  }

  function toast(msg, ms) {
    var t = el('<div class="toast">' + esc(msg) + '</div>');
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('out'); }, ms || 2500);
    setTimeout(function () { t.remove(); }, (ms || 2500) + 500);
  }

  function muteButton(btn) {
    function upd() { btn.textContent = FTG_SOUND.isMuted() ? '🔇' : '🔊'; btn.title = FTG_SOUND.isMuted() ? 'Sound off' : 'Sound on'; }
    btn.addEventListener('click', function () { FTG_SOUND.toggle(); upd(); FTG_SOUND.play('pop'); });
    upd();
  }

  window.FTG = {
    AVATARS: AVATARS, SLOTS: SLOTS, esc: esc, shuffle: shuffle, $: $, $all: $all, rid: rid, el: el,
    TileBuilder: TileBuilder, confetti: confetti, toast: toast, muteButton: muteButton, VERB_RX: VERB_RX
  };
})();
