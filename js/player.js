/* =========================================================================
   PLAYER — runs on each student's phone. Talks to the host over PeerJS.
   ========================================================================= */
(function () {
  'use strict';
  var C = window.FTG_CONTENT, CFG = window.FTG_CONFIG, U = window.FTG, SND = window.FTG_SOUND;
  var esc = U.esc, $ = U.$;
  var SESSION_KEY = 'ftg-player-v1';
  var setup = CFG.peerSetup();
  var app = $('#app');

  var session = loadSession();
  var peer = null, conn = null, connected = false, wantConnected = false, joinedOnce = false;
  var lastPong = 0, retryTimer = null, pending = null, retries = 0;
  var view = null, viewAt = 0, renderedKey = '', builder = null, animatedFx = {}, modal = null;
  var deadline = 0;

  function loadSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') || {}; } catch (e) { return {}; } }
  function saveSession() { try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) { /* */ } }
  function banner(on, text) { var b = $('#connBanner'); b.classList.toggle('hidden', !on); if (text) b.textContent = text; }

  /* ---------------- connection ---------------- */
  function hostId() { return CFG.peerPrefix + String(session.code).toLowerCase(); }

  function connect() {
    wantConnected = true;
    clearTimeout(retryTimer);
    if (!peer || peer.destroyed) {
      peer = new Peer(setup.options);
      var p = peer;
      p.on('open', function () { if (p === peer) openConn(); });
      p.on('error', function (err) { if (p === peer) onPeerError(err); });
      p.on('disconnected', function () {
        setTimeout(function () { if (p === peer && !p.destroyed && p.disconnected && wantConnected) { try { p.reconnect(); } catch (e) { /* */ } } }, 1000);
      });
      p.on('close', function () { if (p === peer) { connected = false; scheduleRetry(); } });
    } else if (peer.disconnected) {
      try { peer.reconnect(); } catch (e) { peer.destroy(); peer = null; scheduleRetry(200); }
    } else if (peer.open) {
      openConn();
    }
  }
  function openConn() {
    if (!wantConnected) return;
    if (conn && conn.open && connected) return;
    if (conn) { try { conn.close(); } catch (e) { /* */ } }
    var c = peer.connect(hostId(), { reliable: true, serialization: 'json' });
    conn = c;
    c.on('open', function () {
      if (c !== conn) return;
      connected = true; retries = 0; lastPong = Date.now();
      c.send({ t: 'hello', pid: session.pid, name: session.name, avatar: session.avatar });
    });
    c.on('data', function (m) { if (c === conn) onMsg(m); });
    var lost = function () { if (c === conn) { connected = false; conn = null; scheduleRetry(); } };
    c.on('close', lost);
    c.on('error', lost);
    setTimeout(function () { if (c === conn && !c.open) { try { c.close(); } catch (e) { /* */ } conn = null; scheduleRetry(); } }, 9000);
  }
  function onPeerError(err) {
    var type = err && err.type;
    if (type === 'peer-unavailable') {
      if (!joinedOnce) {
        wantConnected = false;
        showJoin('Room "' + session.code + '" was not found. Check the code on the big screen. 🔍');
        return;
      }
      scheduleRetry(2500); // host is probably refreshing
      return;
    }
    if (!joinedOnce && retries > 3) {
      showJoin('Cannot connect (' + type + '). Check your internet and try again. Ask your teacher if school Wi-Fi blocks the game.');
      wantConnected = false;
      return;
    }
    if (peer && (peer.destroyed || type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed')) {
      // start over with a fresh Peer next time
      try { peer.destroy(); } catch (e) { /* */ }
      peer = null;
    }
    scheduleRetry();
  }
  function scheduleRetry(ms) {
    if (!wantConnected) return;
    if (joinedOnce) banner(true, '📡 Reconnecting…');
    clearTimeout(retryTimer);
    retries++;
    retryTimer = setTimeout(connect, ms || Math.min(1500 + retries * 500, 5000));
  }
  function send(m) {
    if (conn && conn.open && connected) { try { conn.send(m); return true; } catch (e) { /* */ } }
    return false;
  }
  function forceReconnect() {
    connected = false;
    if (conn) { var c = conn; conn = null; try { c.close(); } catch (e) { /* */ } }
    connect();
  }
  // heartbeat — detects dead connections (e.g. phone was locked)
  setInterval(function () {
    if (!wantConnected) return;
    if (connected) {
      send({ t: 'ping', ts: Date.now() });
      if (Date.now() - lastPong > 10000) forceReconnect();
    }
  }, 3000);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || !wantConnected) return;
    if (!connected || Date.now() - lastPong > 4500) forceReconnect();
    else send({ t: 'sync' });
  });
  window.addEventListener('pageshow', function (e) { if (e.persisted && wantConnected) forceReconnect(); });
  window.addEventListener('online', function () { if (wantConnected) forceReconnect(); });

  function onMsg(m) {
    if (!m || typeof m !== 'object') return;
    lastPong = Date.now();
    switch (m.t) {
      case 'welcome':
        session.pid = m.pid; session.name = m.name; session.avatar = m.avatar; session.joined = true; saveSession();
        joinedOnce = true; banner(false);
        if (pending) { send(pending); }
        break;
      case 'reject':
        wantConnected = false; disconnect();
        showJoin(m.reason, m.field);
        break;
      case 'kicked':
        wantConnected = false; disconnect();
        session.joined = false; session.pid = null; saveSession();
        showJoin('You were removed by the teacher. You can join again with a different name.', 'name');
        break;
      case 'replaced': // this player was opened in another tab / window -> stop here instead of fighting over the connection
        wantConnected = false; disconnect(); showReplaced();
        break;
      case 'rejoin':
        send({ t: 'hello', pid: session.pid, name: session.name, avatar: session.avatar });
        break;
      case 'view':
        onView(m);
        break;
      case 'pong': break;
    }
  }
  function disconnect() {
    clearTimeout(retryTimer);
    if (conn) { var c = conn; conn = null; try { c.close(); } catch (e) { /* */ } }
    connected = false; banner(false);
  }

  /* ---------------- JOIN SCREEN ---------------- */
  function showJoin(err, field) {
    closeModal();
    renderedKey = 'join'; view = null;
    var q = new URLSearchParams(location.search);
    var code = (session.code || q.get('code') || '').toUpperCase();
    if (q.get('code')) code = q.get('code').toUpperCase();
    var avatar = session.avatar || U.AVATARS[Math.floor(Math.random() * U.AVATARS.length)];
    app.innerHTML =
      '<h1 class="logo" style="text-align:center;font-size:1.9rem;margin:8px 0 0">Plan Your Weekend,<br><span class="accent">Survive the Chaos!</span></h1>' +
      '<form class="card join-card" id="joinForm" autocomplete="off">' +
        (err ? '<div class="err" data-testid="join-error">' + esc(err) + '</div>' : '') +
        '<div class="field"><label for="inCode">🔑 Room code</label><input id="inCode" class="code" maxlength="' + CFG.codeLength + '" inputmode="text" autocapitalize="characters" value="' + esc(code) + '" placeholder="ABCD" data-testid="code-input"></div>' +
        '<div class="field"><label for="inName">😎 Your name</label><input id="inName" maxlength="12" value="' + esc(session.name || '') + '" placeholder="e.g. Kelly" data-testid="name-input"' + (field === 'name' ? ' style="border-color:#c92a2a"' : '') + '></div>' +
        '<div class="field"><label>🎭 Pick your character</label><div class="avatar-grid" id="avGrid">' +
          U.AVATARS.map(function (a) { return '<button type="button" data-av="' + a + '"' + (a === avatar ? ' class="sel"' : '') + '>' + a + '</button>'; }).join('') +
        '</div></div>' +
        '<button type="submit" class="btn btn-go btn-big" style="width:100%" id="btnJoin" data-testid="join-btn">Let\'s go! 🚀</button>' +
      '</form>' +
      '<div style="text-align:center"><button class="btn icon-btn" id="btnMute"></button></div>';
    U.muteButton($('#btnMute'));
    $('#avGrid').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      U.$all('#avGrid button').forEach(function (x) { x.classList.remove('sel'); });
      b.classList.add('sel'); avatar = b.getAttribute('data-av'); SND.play('pop');
    });
    $('#joinForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var c = $('#inCode').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      var n = Array.from($('#inName').value.replace(/\s+/g, ' ').trim()).slice(0, 12).join('');
      if (c.length !== CFG.codeLength) { U.toast('Type the ' + CFG.codeLength + '-letter code from the big screen.'); return; }
      if (!n) { U.toast('Type your name!'); $('#inName').focus(); return; }
      if (session.code !== c) { session.pid = null; joinedOnce = false; }
      if (session.name && session.name.toLowerCase() !== n.toLowerCase()) session.pid = null;
      session.code = c; session.name = n; session.avatar = avatar;
      if (!session.pid) session.pid = U.rid(12);
      saveSession();
      $('#btnJoin').disabled = true; $('#btnJoin').textContent = 'Joining… ⏳';
      retries = 0;
      if (peer && !peer.destroyed && peer.open) { forceReconnect(); } else connect();
    });
    if (!code) $('#inCode').focus();
  }

  function showConnecting() {
    renderedKey = 'connecting';
    app.innerHTML = '<div class="big-msg" style="margin-top:20vh"><div class="emo bob">' + esc(session.avatar || '📱') + '</div><h2>Joining room ' + esc(session.code) + '…</h2>' +
      '<p>Hi ' + esc(session.name) + '! 👋</p><p><button class="btn" id="notMe">Not you? Change</button></p></div>';
    $('#notMe').addEventListener('click', function () { wantConnected = false; disconnect(); session.pid = null; session.joined = false; saveSession(); showJoin(); });
  }

  function showReplaced() {
    closeModal();
    renderedKey = 'replaced';
    app.innerHTML = '<div class="big-msg" style="margin-top:16vh" data-testid="replaced"><div class="emo">📱</div><h2>The game is open in another tab</h2>' +
      '<p>Use only one tab, please.</p><p><button class="btn btn-go btn-big" id="playHere">▶ Play here</button></p></div>';
    $('#playHere').addEventListener('click', function () { showConnecting(); retries = 0; forceReconnect(); });
  }

  /* ---------------- GAME RENDERING ---------------- */
  function onView(v) {
    view = v; viewAt = performance.now();
    if (typeof v.endsIn === 'number') deadline = viewAt + v.endsIn;
    else if (v.sab && typeof v.sab.endsIn === 'number') deadline = viewAt + v.sab.endsIn;
    render();
  }

  function keyOf(v) {
    var k = v.phase + '|' + v.roundNum;
    if (v.q) k += '|' + v.q.key + '|' + (v.ans ? 'a' + v.ans.fx : 'q');
    if (v.sab) {
      k += '|s' + v.sab.num + '|' + (v.sab.myPick || '');
      if (v.sab.targets) k += '|' + v.sab.targets.map(function (t) { return t.taken ? 1 : 0; }).join('');
      if (v.phase === 'sab_pick') k += '|' + v.sab.attackers.map(function (a) { return a.pick || '-'; }).join(',');
    }
    return k;
  }

  function topBar(v) {
    return '<div class="p-top"><div class="me"><span class="av">' + v.you.avatar + '</span><span class="nm" data-testid="my-name">' + esc(v.you.name) + '</span></div>' +
      '<span class="score" data-testid="my-score">⭐ <span id="scoreNum">' + v.you.score + '</span></span><button class="btn icon-btn" id="btnMute"></button></div>';
  }

  function render() {
    if (!view) return;
    var v = view, key = keyOf(v);
    if (v.phase !== 'build') closeModal();
    if (key === renderedKey) { liveUpdate(); return; }
    var prevKey = renderedKey;
    renderedKey = key;
    builder = null;
    var h = topBar(v) + '<div id="phaseBox" data-phase="' + v.phase + '" data-testid="phase-' + v.phase + '"></div>';
    app.innerHTML = h;
    U.muteButton($('#btnMute'));
    var box = $('#phaseBox');
    switch (v.phase) {
      case 'lobby': renderLobby(box, v); break;
      case 'build': renderBuild(box, v); break;
      case 'ready': renderReady(box, v); break;
      case 'round': case 'reveal': renderRound(box, v); break;
      case 'sab_pick': renderPick(box, v); break;
      case 'sab_result': renderSabResult(box, v); break;
      case 'final': renderFinal(box, v); break;
    }
    if (prevKey.split('|')[0] !== v.phase) { window.scrollTo(0, 0); if (v.phase === 'round') SND.play('whoosh'); }
    liveUpdate();
  }

  function timerHtml() { return '<div class="timerbar" id="tbar"><i></i></div><div class="timer-text" id="ttext"></div>'; }
  function liveUpdate() {
    if (!view) return;
    var s = $('#scoreNum'); if (s) s.textContent = view.you.score;
    if (view.phase === 'build') updatePlanner();
  }
  setInterval(function () {
    var bar = $('#tbar'); if (!bar || !view) return;
    var left = Math.max(0, deadline - performance.now());
    var full = view.dur || 20000;
    if (view._full == null) view._full = Math.max(full, left);
    var pct = Math.max(0, Math.min(1, left / view._full));
    bar.firstChild.style.transform = 'scaleX(' + pct + ')';
    bar.classList.toggle('low', left < 5000);
    var sec = Math.ceil(left / 1000);
    var t = $('#ttext'); if (t) t.textContent = view.phase === 'build' ? '⏱️ ' + Math.floor(sec / 60) + ':' + ('0' + sec % 60).slice(-2) : '⏱️ ' + sec + 's';
  }, 200);

  function renderLobby(box, v) {
    box.innerHTML = '<div class="big-msg" style="margin-top:6vh"><div class="emo bob">' + v.you.avatar + '</div>' +
      '<h2 data-testid="lobby-welcome">You\'re in, ' + esc(v.you.name) + '! 🎉</h2>' +
      '<p>Can you see your name on the big screen? 👀</p><p>Wait for your teacher to start…</p></div>' +
      '<div class="card" style="font-size:1.05rem"><b>Quick reminder 🧠</b><br>🕒 Timetable → <b>The bus leaves at 9:00.</b><br>📅 Arrangement → <b>I\'m meeting Amy.</b><br>💭 Plan / 👀 evidence → <b>I\'m going to…</b><br>⚡ Decide now / offer / promise → <b>I\'ll…</b></div>';
    SND.play('join');
  }

  /* ----- planner ----- */
  function slotHtml(s, i, opts) {
    var info = U.SLOTS[i];
    if (!s) return '<button type="button" class="slot" data-slot="' + i + '" data-testid="slot-' + i + '"><span class="plus">＋</span><span class="when">' + info.icon + ' ' + info.part + '</span></button>';
    var card = C.get(s.card);
    var dying = opts && opts.dying === i;
    var cls = 'slot filled' + (s.auto ? ' auto' : '') + (!s.alive && !dying ? ' dead' : '') + (dying ? ' dying' : '');
    return '<div class="' + cls + '" data-slot="' + i + '" data-testid="slot-' + i + '">' +
      '<span class="emo">' + (s.alive || dying ? card.emoji : (s.lostTo || '💥')) + '</span>' +
      '<span class="when">' + info.icon + ' ' + info.part + '</span>' +
      '<span class="sent">' + esc(s.auto ? card.label + ' (auto)' : C.answerOf(card)) + '</span>' +
      (dying ? '<span class="boom">' + esc(s.lostTo || '💥') + '</span>' : '') +
    '</div>';
  }
  function plannerHtml(slots, opts) {
    return '<div class="planner" id="planner"><div class="day"><h3>Saturday</h3>' + [0, 1, 2].map(function (i) { return slotHtml(slots[i], i, opts); }).join('') + '</div>' +
      '<div class="day"><h3>Sunday</h3>' + [3, 4, 5].map(function (i) { return slotHtml(slots[i], i, opts); }).join('') + '</div></div>';
  }
  function miniHtml(slots, opts) {
    return '<div class="mini-planner" id="mini" data-testid="mini-planner">' + slots.map(function (s, i) { return slotHtml(s, i, opts); }).join('') + '</div>';
  }
  function aliveOf(slots) { return slots.filter(function (s) { return s && s.alive; }).length; }
  function plansLeftHtml(v) {
    var n = aliveOf(v.you.slots);
    return '<div class="plans-left" data-testid="plans-left" data-alive="' + n + '">' + (n ? '📅 Plans left: <b>' + n + ' / 6</b>' : '<span class="ruined">😱 Weekend ruined!</span> Keep playing — you can still win chaos cards!') + '</div>';
  }

  function renderBuild(box, v) {
    box.innerHTML = timerHtml() +
      '<div class="big-msg" style="padding:4px"><h2 style="font-size:1.6rem">📅 Build your weekend!</h2><p id="buildTip">Tap ＋ to add a plan.</p></div>' +
      '<div id="plannerBox"></div>';
    updatePlanner(true);
  }
  function updatePlanner(force) {
    var pb = $('#plannerBox'); if (!pb) return;
    var sig = JSON.stringify(view.you.slots);
    if (!force && pb.getAttribute('data-sig') === sig) return;
    pb.setAttribute('data-sig', sig);
    pb.innerHTML = plannerHtml(view.you.slots);
    var full = view.you.slots.every(Boolean);
    var tip = $('#buildTip');
    if (tip) tip.innerHTML = full ? '🎉 <b data-testid="weekend-full">Weekend full!</b> Wait for the chaos… 🌪️' : 'Tap ＋ to add a plan.';
    U.$all('#planner button.slot').forEach(function (b) {
      b.addEventListener('click', function () { openCardChooser(+b.getAttribute('data-slot')); });
    });
  }

  function closeModal() { if (modal) { modal.remove(); modal = null; } }
  function openModal(html) {
    closeModal();
    modal = U.el('<div class="modal-back"><div class="card modal">' + html + '</div></div>');
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    return modal;
  }
  function openCardChooser(slot) {
    if (!view || view.phase !== 'build' || view.you.slots[slot]) return;
    SND.play('pop');
    var used = view.you.slots.filter(Boolean).map(function (s) { return s.card; });
    var pick = function () {
      return ['timetable', 'arrangement', 'plan'].map(function (use) {
        var pool = C.PLAN_CARDS.filter(function (c) { return c.use === use && used.indexOf(c.id) < 0; });
        return pool[Math.floor(Math.random() * pool.length)];
      }).filter(Boolean);
    };
    var draw = function () {
      var cards = U.shuffle(pick());
      var info = U.SLOTS[slot];
      var m = openModal('<h2>' + info.icon + ' ' + info.day + ' ' + info.part.toLowerCase() + '</h2><p style="margin:0 0 10px">Choose a plan:</p>' +
        '<div class="card-choices">' + cards.map(function (c) {
          return '<button type="button" class="plan-card" data-card="' + c.id + '" data-testid="card-choice"><span class="emo">' + c.emoji + '</span><span><span class="lbl">' + esc(c.label) + '</span><br><span class="tag clue">' + esc(C.USES[c.use].clue) + '</span></span></button>';
        }).join('') + '</div>' +
        '<div style="display:flex;gap:10px;margin-top:12px"><button type="button" class="btn btn-ghost" id="mReroll" style="flex:1">🔄 Other plans</button><button type="button" class="btn" id="mClose">✖ Close</button></div>');
      U.$all('.plan-card', m).forEach(function (b) { b.addEventListener('click', function () { openBuilder(slot, C.get(b.getAttribute('data-card'))); }); });
      $('#mReroll', m).addEventListener('click', draw);
      $('#mClose', m).addEventListener('click', closeModal);
    };
    draw();
  }
  function openBuilder(slot, card) {
    var tries = 0;
    var m = openModal('<div class="q-card"><div class="q-emo">' + card.emoji + '</div><div class="q-title">' + esc(card.label) + '</div>' +
      '<div class="q-clue"><span class="clue">' + esc(C.USES[card.use].clue) + '</span></div>' +
      '<div class="q-cue">💬 ' + esc(card.cue) + '</div></div>' +
      '<div id="mHint"></div><div id="mBuilder" data-card="' + card.id + '"></div>' +
      '<div style="margin-top:10px"><button type="button" class="btn" id="mBack" style="width:100%">⬅ Back</button></div>');
    $('#mBack', m).addEventListener('click', function () { openCardChooser(slot); });
    new U.TileBuilder($('#mBuilder', m), {
      tiles: C.tileSet(card), submitLabel: 'Add to my weekend ✔',
      onSubmit: function (tiles, tb) {
        if (C.check(card, tiles)) {
          SND.play('good');
          tb.disable();
          view.you.slots[slot] = { card: card.id, auto: false, alive: true };
          send({ t: 'plan', slot: slot, cardId: card.id });
          closeModal();
          updatePlanner(true);
          var s = $('[data-slot="' + slot + '"]'); if (s) s.classList.add('pop-in');
        } else {
          tries++;
          SND.play('bad'); tb.shake();
          setTimeout(function () { tb.reset(); }, 450);
          $('#mHint', m).innerHTML = '<div class="hint-box" data-testid="build-hint">💡 ' + esc(C.PLAN_WHY[card.use]) +
            (tries >= 2 ? '<br>✍️ Build: <b>' + esc(C.answerOf(card)) + '</b>' : '') + '</div>';
        }
      }
    });
  }

  function renderReady(box, v) {
    box.innerHTML = '<div class="big-msg"><div class="emo bob">🌪️</div><h2>Your weekend is ready!</h2><p>Now… survive the CHAOS! 😱</p></div>' + plannerHtml(v.you.slots);
  }

  /* ----- question card + builder ----- */
  function qCardHtml(q, hints) {
    return '<div class="card q-card"><div class="q-emo"><span class="zoom-bang" style="display:inline-block">' + q.emoji + '</span></div>' +
      '<div class="q-title" data-testid="q-title">' + esc(q.title) + '</div><div class="q-text">' + esc(q.text) + '</div>' +
      '<div class="q-cue">💬 ' + esc(q.cue) + '</div>' + (hints ? '<div class="q-clue"><span class="clue">' + esc(q.clue) + '</span></div>' : '') +
      '<div id="qBuilder" data-qid="' + q.id + '" data-qkey="' + q.key + '"></div></div>';
  }
  function mountBuilder(q) {
    builder = new U.TileBuilder($('#qBuilder'), {
      tiles: q.tiles, submitLabel: 'Send ✔',
      onSubmit: function (tiles, tb) {
        tb.disable();
        var msg = { t: 'answer', key: q.key, tiles: tiles };
        pending = msg;
        send(msg);
        SND.play('pop');
        var b = $('.btn-check', tb.root); if (b) b.textContent = 'Sent! ⏳';
      }
    });
  }
  function feedbackHtml(a, v, opts) {
    opts = opts || {};
    var tense = a.tense, T = C.TENSES[tense];
    var head, emo, cls;
    if (a.absent) { emo = '👀'; head = 'Watch this one!'; cls = ''; }
    else if (a.ok) { emo = '✅'; head = 'Correct!'; cls = 'good'; }
    else if (a.late) { emo = '⏰'; head = 'Too slow!'; cls = 'bad'; }
    else { emo = '❌'; head = 'Oops!'; cls = 'bad'; }
    var sub = '';
    if (a.ok && a.pts) sub = '<div class="fb-pts">+' + a.pts + ' points</div>';
    if (a.ok) sub += '<div>Your plans are safe 😎</div>';
    if (a.lost >= 0) sub += '<div>💥 You lost a plan!</div>';
    else if (!a.ok && !a.absent && aliveOf(v.you.slots) === 0) sub += '<div>Your weekend is already ruined 😱</div>';
    return '<div class="card feedback ' + cls + ' slide-up" data-testid="feedback" data-ok="' + (a.ok ? 1 : 0) + '">' +
      '<div class="fb-emo pop-in">' + emo + '</div><div class="fb-head">' + head + '</div>' + sub +
      '<div class="fb-ans">' + esc(a.answer) + '</div>' +
      '<div class="fb-why" data-testid="feedback-why">💡 ' + esc(a.why) + '</div>' +
      '<div style="margin-top:8px"><span class="tense ' + tense + '">' + esc(T.name) + '</span></div></div>';
  }
  function animateLoss(a, v) {
    if (!a || a.lost < 0 || animatedFx[a.fx]) return null;
    animatedFx[a.fx] = true;
    setTimeout(function () { SND.play('boom'); if (navigator.vibrate) navigator.vibrate([80, 40, 120]); }, 120);
    setTimeout(function () {
      var s = $('#mini [data-slot="' + a.lost + '"]');
      if (s) { s.classList.remove('dying'); s.classList.add('dead'); var bm = s.querySelector('.boom'); if (bm) bm.remove(); var e = s.querySelector('.emo'); if (e) e.textContent = v.you.slots[a.lost].lostTo || '💥'; }
    }, 800);
    return a.lost;
  }

  function renderRound(box, v) {
    var a = v.ans, q = v.q;
    var label = '<div class="big-msg" style="padding:0"><p>🌪️ Chaos round <b>' + v.roundNum + '</b> / ' + v.total + '</p></div>';
    if (v.phase === 'round' && !a) {
      // timer + plan count stay on screen (sticky) while a small phone scrolls down to the tiles
      box.innerHTML = '<div class="p-sticky">' + label + timerHtml() + plansLeftHtml(v) + '</div>' + qCardHtml(q, v.hints) + miniHtml(v.you.slots);
      mountBuilder(q);
      return;
    }
    if (!a) a = { absent: true, answer: v.reveal.answer, why: v.reveal.why, tense: v.reveal.tense, lost: -1 };
    window.scrollTo(0, 0); // the student was scrolled down to the Send button
    if (a.ok) SND.play('good'); else if (!a.absent) SND.play('bad');
    var dying = animateLoss(a, v);
    box.innerHTML = label + feedbackHtml(a, v) + miniHtml(v.you.slots, { dying: dying }) + plansLeftHtml(v) +
      '<div class="big-msg" style="padding:0"><p>' + (v.phase === 'reveal' ? '👀 Look at the big screen!' : '⏳ Wait for the others…') + '</p></div>';
  }

  function renderPick(box, v) {
    var S = v.sab;
    var names = S.attackers.map(function (x) { return x.avatar + ' ' + esc(x.name); }).join(', ');
    if (S.amAttacker && !S.myPick) {
      var any = S.targets.some(function (t) { return !t.taken && !t.ruined; });
      box.innerHTML = timerHtml() + '<div class="big-msg" style="padding:4px"><div class="emo wobble" style="font-size:4rem">🃏</div><h2 style="font-size:1.6rem">You\'re one of the fastest! ⚡</h2><p>Throw a CHAOS CARD at…</p></div>' +
        '<div class="target-grid" data-testid="target-grid">' + S.targets.map(function (t) {
          var dis = t.taken || t.ruined;
          return '<button type="button" data-target="' + t.pid + '" data-testid="target"' + (dis ? ' disabled class="taken"' : '') + '><span class="av">' + t.avatar + '</span><span class="nm">' + esc(t.name) + '</span>' +
            '<span class="pl">' + (t.taken ? '🎯 Already hit by ' + esc(t.takenBy || '?') : t.ruined ? '😱 Weekend ruined!' : '📅 ' + t.alive + ' plans') + '</span></button>';
        }).join('') + '</div>' + (any ? '' : '<p class="big-msg">Nobody left to hit! 🤷</p>');
      U.$all('[data-target]:not([disabled])', box).forEach(function (b) {
        b.addEventListener('click', function () {
          SND.play('whoosh');
          U.$all('[data-target]', box).forEach(function (x) { x.disabled = true; });
          b.classList.add('mine');
          send({ t: 'pick', target: b.getAttribute('data-target') });
        });
      });
      SND.play('alarm');
      return;
    }
    if (S.amAttacker) {
      var t = S.myPick && (S.attackers.filter(function (x) { return x.pid === v.you.pid; })[0] || {}).pick;
      box.innerHTML = '<div class="big-msg" style="margin-top:8vh"><div class="emo bob">😈</div><h2>Chaos card thrown! 🃏</h2><p>It will hit for sure! 💥 Look at the big screen!</p></div>';
      void t;
      return;
    }
    box.innerHTML = timerHtml() + '<div class="big-msg" style="margin-top:4vh"><div class="emo wobble">🃏</div><h2>CHAOS CARDS!</h2><p>' + names + (S.attackers.length > 1 ? ' are' : ' is') + ' choosing a victim…</p><p>🙏 Hope it\'s not you!</p></div>' +
      miniHtml(v.you.slots) + plansLeftHtml(v);
  }

  /* Chaos cards always hit — show who hit whom, and animate my lost plan if I was a target */
  function renderSabResult(box, v) {
    var S = v.sab;
    if (S.none) {
      box.innerHTML = '<div class="big-msg" style="margin-top:8vh"><div class="emo">🤷</div><h2>No chaos cards this time!</h2><p>Get ready for the next round…</p></div>' + miniHtml(v.you.slots) + plansLeftHtml(v);
      return;
    }
    var head, me = S.hitMe;
    var myHit = S.hits.filter(function (h) { return h.from && h.from.pid === v.you.pid; })[0];
    if (me) {
      head = '<div class="card feedback bad slide-up" data-testid="hit-by"><div class="fb-emo shake">🃏💥</div>' +
        '<div class="fb-head">' + me.by.avatar + ' ' + esc(me.by.name) + ' hit you!</div>' +
        '<div>' + (me.lost >= 0 ? '💥 You lost a plan!' : 'Your weekend was already ruined 😱') + '</div></div>';
      SND.play('bad');
      if (navigator.vibrate) navigator.vibrate([80, 40, 160]);
    } else if (myHit && myHit.to) {
      head = '<div class="card feedback good slide-up" data-testid="my-hit"><div class="fb-emo pop-in">😈🃏</div>' +
        '<div class="fb-head">You hit ' + myHit.to.avatar + ' ' + esc(myHit.to.name) + '!</div><div class="fb-pts">+100 points</div></div>';
      SND.play('good');
    } else {
      head = '<div class="big-msg" style="padding:4px"><div class="emo">😅</div><h2>Phew! Not you this time!</h2></div>';
    }
    var list = '<div class="card" data-testid="attack-results"><b>🃏 Chaos cards</b>' + S.hits.map(function (h) {
      return '<div style="font-size:1.1rem">' + (h.from ? h.from.avatar + ' ' + esc(h.from.name) : '?') + ' ➜ ' + (h.to ? h.to.avatar + ' ' + esc(h.to.name) : '?') + ' 💥</div>';
    }).join('') + '</div>';
    var dying = me ? animateLoss({ lost: me.lost, fx: me.fx }, v) : null;
    box.innerHTML = head + list + miniHtml(v.you.slots, { dying: dying }) + plansLeftHtml(v);
  }

  function renderFinal(box, v) {
    var F = v.final, n = aliveOf(v.you.slots);
    var medal = ['🥇', '🥈', '🥉'][F.rank - 1] || '🎉';
    box.innerHTML = '<div class="big-msg" style="padding:4px"><div class="emo bob">' + medal + '</div></div>' +
      '<div class="rank-big" data-testid="final-rank">#' + F.rank + '</div>' +
      '<div class="big-msg" style="padding:0"><p>of ' + F.of + ' players</p><h2>' + (n ? 'You survived the weekend with ' + n + ' plan' + (n > 1 ? 's' : '') + '!' : 'Weekend ruined… but great try! 💪') + '</h2></div>' +
      '<div class="card" style="font-size:1.1rem;text-align:center">⭐ ' + v.you.score + ' points · ✅ ' + F.stats.right + ' right · ❌ ' + F.stats.wrong + ' wrong · ⏰ ' + F.stats.late + ' slow</div>' +
      '<div class="card"><b>🏆 Top 3</b>' + F.top.map(function (t, i) { return '<div style="font-size:1.2rem">' + ['🥇', '🥈', '🥉'][i] + ' ' + t.avatar + ' ' + esc(t.name) + ' — 📅' + t.alive + ' · ⭐' + t.score + '</div>'; }).join('') + '</div>' +
      plannerHtml(v.you.slots);
    if (F.rank <= 3) { SND.play('fanfare'); U.confetti(120); } else SND.play('good');
  }

  /* ---------------- boot ---------------- */
  (function boot() {
    if (typeof Peer === 'undefined') { app.innerHTML = '<div class="card">Could not load the game (PeerJS). Check your internet.</div>'; return; }
    var q = new URLSearchParams(location.search);
    var urlCode = (q.get('code') || '').toUpperCase();
    if (session.joined && session.pid && session.name && session.code && (!urlCode || urlCode === session.code)) {
      joinedOnce = true; // rejoin after refresh / phone lock
      showConnecting();
      connect();
    } else {
      showJoin();
    }
  })();

  // test hooks (used by dev/test-webkit-ui.mjs to render screens without a network)
  window.__FTG_PLAYER = { get view() { return view; }, get session() { return session; }, get connected() { return connected; }, debugView: function (v) { onView(v); } };
})();
