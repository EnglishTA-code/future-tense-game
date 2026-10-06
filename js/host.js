/* =========================================================================
   HOST — runs on the teacher's computer (projector). This browser tab IS the
   game server: it owns the whole game state and talks to every phone over
   PeerJS (WebRTC data channels). Keep this tab open during the game!
   ========================================================================= */
(function () {
  'use strict';
  var C = window.FTG_CONTENT, CFG = window.FTG_CONFIG, U = window.FTG, SND = window.FTG_SOUND;
  var esc = U.esc, $ = U.$;
  var SAVE_KEY = 'ftg-host-v1';
  var setup = CFG.peerSetup();
  var peer = null, peerReady = false, peerOpenAt = 0, conns = {}, S = null;
  var stageKey = '', saveTimer = null, lastTickSec = -1, pendingTimers = {};

  /* ---------------- state ---------------- */
  function makeCode() {
    var s = '';
    for (var i = 0; i < CFG.codeLength; i++) s += CFG.codeAlphabet[Math.floor(Math.random() * CFG.codeAlphabet.length)];
    return s;
  }
  function newState(code) {
    return {
      v: 1, code: code, createdAt: Date.now(), savedAt: 0, phase: 'lobby',
      settings: Object.assign({}, CFG.defaults),
      players: {}, order: [], roundList: [], roundIdx: -1, round: null, buildEndsAt: 0,
      sab: null, sabNum: 0, fx: 0
    };
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      S.savedAt = Date.now();
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* storage full / private mode */ }
    }, 200);
  }
  function now() { return Date.now(); }
  function P(pid) { return S.players[pid]; }
  function players() { return S.order.map(P).filter(Boolean); }
  function aliveCount(p) { return p.slots.filter(function (s) { return s && s.alive; }).length; }
  function roundOptions() { return CFG.roundOptions || [3, 4, 5, 6]; }
  function builtCount(p) { return p.slots.filter(function (s) { return s && !s.auto; }).length; }
  function isOnline(p) { var c = conns[p.pid]; return !!(c && c.open && now() - p.lastSeen < 9000); }
  function onlinePlayers() { return players().filter(isOnline); }

  /* Pick N chaos situations with a good mix of tenses, no repeats */
  function pickRounds(n) {
    var pools = { will: [], going: [], pcont: [], psimp: [] };
    U.shuffle(C.SITUATIONS).forEach(function (s) { pools[C.tenseOf(s)].push(s.id); });
    var out = [], last = null, order;
    while (out.length < n) {
      order = U.shuffle(['will', 'going', 'pcont', 'psimp']);
      if (order[0] === last) order.push(order.shift());
      for (var i = 0; i < order.length && out.length < n; i++) {
        var t = order[i];
        if (!pools[t].length) continue;
        out.push(pools[t].shift()); last = t;
      }
      if (!pools.will.length && !pools.going.length && !pools.pcont.length && !pools.psimp.length) break;
    }
    return out;
  }

  function autoFill(p) {
    var used = p.slots.filter(Boolean).map(function (s) { return s.card; });
    var free = U.shuffle(C.PLAN_CARDS.filter(function (c) { return used.indexOf(c.id) < 0; }));
    for (var i = 0; i < CFG.slots; i++) {
      if (!p.slots[i]) p.slots[i] = { card: free.shift().id, auto: true, alive: true, lostTo: null };
    }
  }
  function crackedCount(p) { return p.slots.filter(function (s) { return s && s.alive && s.cracked; }).length; }
  /* A FULL loss (wrong answer, chaos card): destroys an UNCRACKED plan if there is one, so a pending
     crack (= half a plan already lost) stays pending. Only when the cracked plan is the last one left
     is it the one destroyed (and the crack goes with it). */
  function destroy(p, emoji) {
    var alive = [];
    p.slots.forEach(function (s, i) { if (s && s.alive) alive.push(i); });
    if (!alive.length) return -1;
    var pool = alive.filter(function (i) { return !p.slots[i].cracked; });
    if (!pool.length) pool = alive;
    var i = pool[Math.floor(Math.random() * pool.length)];
    p.slots[i].alive = false; p.slots[i].cracked = false; p.slots[i].lostTo = emoji || '💥';
    return i;
  }
  /* v2 balance: a TIMEOUT (too slow / no answer) costs HALF a plan. The first timeout cracks a plan;
     the next timeout destroys that cracked plan (−1) and the crack counter starts again.
     Returns { lost: slot index or -1, cracked: slot index or -1 }. */
  function crack(p, emoji) {
    var c = -1, alive = [];
    p.slots.forEach(function (s, i) { if (s && s.alive) { alive.push(i); if (s.cracked && c < 0) c = i; } });
    if (c >= 0) { p.slots[c].alive = false; p.slots[c].cracked = false; p.slots[c].lostTo = emoji || '💥'; return { lost: c, cracked: -1 }; }
    if (!alive.length) return { lost: -1, cracked: -1 };
    var i = alive[Math.floor(Math.random() * alive.length)];
    p.slots[i].cracked = true;
    return { lost: -1, cracked: i };
  }
  /* v2 balance: COMEBACK. A correct answer while on 0 or 1 plans rebuilds one destroyed plan,
     at most CFG.maxRebuilds (2) times per student per game. The host is authoritative (p.rebuilds). */
  function comeback(p) {
    if (aliveCount(p) > 1 || (p.rebuilds || 0) >= (CFG.maxRebuilds == null ? 2 : CFG.maxRebuilds)) return -1;
    var dead = [], empty = [];
    p.slots.forEach(function (s, i) { if (!s || s.late) empty.push(i); else if (!s.alive) dead.push(i); });
    var i;
    if (dead.length) { // bring back one of their own destroyed plans
      i = dead[Math.floor(Math.random() * dead.length)];
    } else if (empty.length) { // never built (no auto-fill) or a "joined late" slot: a new auto plan
      i = empty[0];
      var used = p.slots.filter(function (s) { return s && s.card; }).map(function (s) { return s.card; });
      var free = U.shuffle(C.PLAN_CARDS.filter(function (c) { return used.indexOf(c.id) < 0; }));
      p.slots[i] = { card: free[0].id, auto: true, alive: false, lostTo: null };
    } else return -1;
    var s = p.slots[i];
    s.alive = true; s.cracked = false; s.lostTo = null; s.rebuilt = true;
    p.rebuilds = (p.rebuilds || 0) + 1;
    return i;
  }
  /* v2 balance: chaos cards per round scale with the class: min(3, max(1, round(N / 10))), where N = ALL
     players in the game (online or not), so a Wi-Fi blip doesn't change the rule mid-game.
     1 card for 1–14 players, 2 for 15–24, 3 for 25+. */
  function attackerCount(n) { if (n == null) n = players().length; return Math.min(3, Math.max(1, Math.round(n / 10))); }
  /* N2: a NEW player who joins once planning is over (the "planning is over" screen or any chaos phase)
     gets the class median of plans left (rounded down), but never fewer than CFG.lateJoinMin (3) and never
     more than a full weekend (6). Lobby / Phase 1 joiners build their own plans (no auto-fill). Reconnecting players never
     come through here (onHello finds them by pid or name), so they keep their own plans. */
  // "late" = planning is over: the "planning is over" screen (they can't build any more) or any chaos phase
  function chaosStarted() { return ['ready', 'round', 'reveal', 'sab_pick', 'sab_result'].indexOf(S.phase) >= 0 || (S.phase === 'final' && S.roundIdx >= 0); }
  function lateStartPlans() {
    var counts = players().map(aliveCount).sort(function (a, b) { return a - b; }), n = counts.length;
    if (!n) return CFG.slots;
    var median = n % 2 ? counts[(n - 1) / 2] : (counts[n / 2 - 1] + counts[n / 2]) / 2;
    return Math.max(Math.min(CFG.lateJoinMin || 3, CFG.slots), Math.min(CFG.slots, Math.floor(median)));
  }
  function addPlayer(pid, name, avatar) {
    var late = chaosStarted(), startPlans = late ? lateStartPlans() : CFG.slots; // measured BEFORE this player is added
    var p = {
      pid: pid || U.rid(12), name: name, avatar: avatar, joinedAt: now(), lastSeen: now(), score: 0,
      slots: [null, null, null, null, null, null], rebuilds: 0,
      stats: { right: 0, wrong: 0, late: 0, tense: {} }
    };
    S.players[p.pid] = p; S.order.push(p.pid);
    if (late) {
      // the missing plans are greyed "joined late" slots at the end of Sunday; autoFill then fills the first startPlans slots
      for (var i = startPlans; i < CFG.slots; i++) p.slots[i] = { card: null, auto: true, alive: false, lostTo: '⏳', late: true };
      p.lateStart = startPlans;
      if (peerReady) U.toast('⏳ ' + name + ' joined late → starts with ' + startPlans + (startPlans === 1 ? ' plan' : ' plans') + ' (class middle)', 4000);
    }
    if (late) autoFill(p); // v2: nobody else is auto-filled — students start the chaos with the plans they built
    if (S.phase === 'round' && S.round) { S.round.participants[p.pid] = true; S.round.seen[p.pid] = true; }
    SND.play('join');
    return p;
  }
  function stat(p, tense, ok, late) {
    if (ok) p.stats.right++; else if (late) p.stats.late++; else p.stats.wrong++;
    var t = p.stats.tense[tense] || (p.stats.tense[tense] = { right: 0, total: 0 });
    t.total++; if (ok) t.right++;
  }
  function ranking() {
    return players().slice().sort(function (a, b) {
      return aliveCount(b) - aliveCount(a) || b.score - a.score || a.name.localeCompare(b.name);
    });
  }

  /* ---------------- networking ---------------- */
  function bootMsg(t) { var b = $('#bootMsg'); if (b) b.textContent = t; }

  function startPeer(code, resume, attempt) {
    attempt = attempt || 0;
    peerReady = false;
    if (peer && !peer.destroyed) { try { peer.destroy(); } catch (e) { /* */ } }
    var p = new Peer(CFG.peerPrefix + code.toLowerCase(), setup.options);
    peer = p;
    p.on('open', function () {
      if (p !== peer) return;
      peerReady = true; peerOpenAt = now(); stageKey = ''; render();
    });
    p.on('connection', onConnection);
    p.on('disconnected', function () {
      // lost the broker (signalling) — existing phone connections keep working
      setTimeout(function () { if (p === peer && !p.destroyed && p.disconnected) { try { p.reconnect(); } catch (e) { /* */ } } }, 1500);
    });
    p.on('error', function (err) {
      if (p !== peer) return;
      var type = err && err.type;
      if (type === 'unavailable-id') {
        if (resume && attempt < 15) {
          bootMsg('Getting room ' + code + ' back… (' + (attempt + 1) + ')');
          setTimeout(function () { startPeer(code, true, attempt + 1); }, 2000);
        } else {
          S.code = makeCode(); save(); startPeer(S.code, false, 0);
        }
      } else if (type === 'peer-unavailable') {
        /* not relevant for host */
      } else if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed' || type === 'browser-incompatible') {
        if (!peerReady) {
          bootMsg('Cannot reach the PeerJS server (' + type + '). Check the internet connection. Retrying…');
          setTimeout(function () { if (p === peer) startPeer(S.code, true, attempt + 1); }, 4000);
        } else {
          U.toast('⚠️ Connection problem (' + type + '). Trying again…');
          setTimeout(function () { if (p === peer && !p.destroyed && p.disconnected) { try { p.reconnect(); } catch (e) { /* */ } } }, 3000);
        }
      } else {
        console.warn('Peer error', type, err);
      }
    });
  }

  function onConnection(conn) {
    conn.on('data', function (msg) {
      try { handle(conn, msg); } catch (e) { console.error('handle error', e); }
    });
    var gone = function () {
      var pid = conn._pid;
      if (pid && conns[pid] === conn) { delete conns[pid]; renderLive(); }
    };
    conn.on('close', gone);
    conn.on('error', gone);
  }
  function send(conn, msg) { try { if (conn && conn.open) conn.send(msg); } catch (e) { /* */ } }
  function sendView(pid) { var p = P(pid); if (p && conns[pid]) send(conns[pid], viewFor(p)); }
  function broadcast() { S.order.forEach(sendView); }

  function handle(conn, m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') return onHello(conn, m);
    var pid = conn._pid, p = pid && P(pid);
    if (!p) { send(conn, { t: 'rejoin' }); return; }
    p.lastSeen = now();
    if (S.round && S.phase === 'round') S.round.seen[pid] = true;
    switch (m.t) {
      case 'ping': send(conn, { t: 'pong', ts: m.ts }); break;
      case 'plan': onPlan(p, m); break;
      case 'answer': onAnswer(p, m); break;
      case 'pick': onPick(p, m); break;
      case 'sync': sendView(pid); break;
    }
  }

  function findByName(name) {
    var n = name.toLowerCase();
    return players().filter(function (p) { return p.name.toLowerCase() === n; })[0];
  }
  function onHello(conn, m) {
    var name = Array.from(String(m.name || '').replace(/\s+/g, ' ').trim()).slice(0, 12).join('');
    var avatar = U.AVATARS.indexOf(m.avatar) >= 0 ? m.avatar : U.AVATARS[0];
    var p = m.pid && P(m.pid);
    if (!p) {
      if (!name) { send(conn, { t: 'reject', reason: 'Please type your name.' }); return; }
      var same = findByName(name);
      if (same) {
        if (isOnline(same) && !(conns[same.pid] === conn)) {
          send(conn, { t: 'reject', reason: 'The name "' + name + '" is taken. Please choose another name.', field: 'name' });
          return;
        }
        p = same; // same name, old phone is gone -> take over that player
      } else {
        if (S.order.length >= CFG.maxPlayers) { send(conn, { t: 'reject', reason: 'Sorry, the room is full.' }); return; }
        p = addPlayer(m.pid, name, avatar);
      }
    }
    var old = conns[p.pid];
    if (old && old !== conn) {
      // same player connected from a second tab/window: tell the old one to stop (otherwise the two tabs keep kicking each other off)
      old._pid = null; send(old, { t: 'replaced' });
      setTimeout(function () { try { old.close(); } catch (e) { /* */ } }, 300);
    }
    conn._pid = p.pid; conns[p.pid] = conn; p.lastSeen = now();
    if (S.round && S.phase === 'round') S.round.seen[p.pid] = true;
    send(conn, { t: 'welcome', pid: p.pid, name: p.name, avatar: p.avatar, code: S.code });
    sendView(p.pid);
    save(); renderLive();
  }

  function kick(pid) {
    var p = P(pid); if (!p) return;
    if (conns[pid]) { send(conns[pid], { t: 'kicked' }); var c = conns[pid]; c._pid = null; setTimeout(function () { try { c.close(); } catch (e) { /* */ } }, 300); delete conns[pid]; }
    delete S.players[pid]; S.order = S.order.filter(function (x) { return x !== pid; });
    save(); stageKey = ''; render();
  }

  /* ---------------- phase: build ---------------- */
  function startBuild() {
    if (!players().length) { U.toast('Wait for students to join first!'); return; }
    S.roundList = pickRounds(S.settings.rounds);
    S.phase = 'build'; S.buildEndsAt = now() + S.settings.buildSecs * 1000;
    SND.play('whoosh'); commit();
  }
  function onPlan(p, m) {
    if (S.phase !== 'build') { sendView(p.pid); return; }
    var card = C.get(m.cardId), i = m.slot | 0;
    if (!card || card.id.indexOf('p-') !== 0 || i < 0 || i >= CFG.slots || p.slots[i]) { sendView(p.pid); return; }
    if (p.slots.some(function (s) { return s && s.card === card.id; })) { sendView(p.pid); return; }
    p.slots[i] = { card: card.id, auto: false, alive: true, lostTo: null };
    p.score += 50;
    save(); sendView(p.pid); renderLive();
  }
  /* v2: NO auto-fill when planning ends. Each student starts the chaos rounds with exactly the plans they
     built (0 is possible: they keep playing and can earn plans back with the comeback rule). */
  function endBuild() {
    S.phase = 'ready'; SND.play('pop'); commit();
  }

  /* ---------------- phase: chaos rounds ---------------- */
  function startRound() {
    S.roundIdx++;
    var parts = {}, seen = {};
    players().forEach(function (p) { parts[p.pid] = true; if (isOnline(p)) seen[p.pid] = true; });
    S.round = { idx: S.roundIdx, sid: S.roundList[S.roundIdx], startedAt: now(), endsAt: now() + S.settings.roundSecs * 1000, answers: {}, participants: parts, seen: seen };
    S.phase = 'round'; lastTickSec = -1;
    SND.play('whoosh'); commit();
  }
  function onAnswer(p, m) {
    if (S.phase === 'round' && m.key === 'r' + S.round.idx) return answerRound(p, m);
    sendView(p.pid); // too late / old question -> just resync
  }
  function answerRound(p, m) {
    var R = S.round;
    if (R.answers[p.pid]) { sendView(p.pid); return; }
    var item = C.get(R.sid), t = now(), late = t > R.endsAt + 1500;
    var ok = !late && C.check(item, m.tiles);
    var left = Math.max(0, R.endsAt - t), total = S.settings.roundSecs * 1000;
    var a = { ok: ok, late: late, ms: t - R.startedAt, pts: ok ? 100 + Math.round(100 * left / total) : 0, lost: -1, cracked: -1, rebuilt: -1, fx: ++S.fx };
    if (ok) a.rebuilt = comeback(p);                                            // 🔨 on 0–1 plans
    else if (late) { var ck = crack(p, item.emoji); a.lost = ck.lost; a.cracked = ck.cracked; } // ⏰ half a plan
    else a.lost = destroy(p, item.emoji);                                       // ❌ a full plan
    p.score += a.pts; stat(p, C.tenseOf(item), ok, late);
    R.answers[p.pid] = a; R.participants[p.pid] = true;
    save(); sendView(p.pid); renderLive();
    checkAllAnswered();
  }
  function checkAllAnswered() {
    // after a host refresh the phones need a few seconds to reconnect: "nobody online" must not end the round early
    if (!peerReady || now() - peerOpenAt < 8000) return;
    if (S.phase === 'round') {
      var R = S.round;
      var waiting = players().filter(function (p) { return R.participants[p.pid] && !R.answers[p.pid] && isOnline(p); });
      if (!waiting.length && Object.keys(R.answers).length) later('endRound', 900, function () { if (S.phase === 'round' && S.round === R) endRound(); });
    }
  }
  // run fn once after ms; repeated calls while pending do NOT postpone it
  function later(key, ms, fn) {
    if (pendingTimers[key]) return;
    if (document.hidden) ms = 0; // background tabs throttle timers — don't wait
    pendingTimers[key] = setTimeout(function () { pendingTimers[key] = null; fn(); }, ms);
  }

  function endRound() {
    var R = S.round, item = C.get(R.sid);
    players().forEach(function (p) {
      if (R.answers[p.pid] || !R.participants[p.pid]) return;
      if (R.seen[p.pid]) {
        var ck = crack(p, item.emoji); // no answer = too slow = half a plan
        var a = { ok: false, late: true, none: true, pts: 0, lost: ck.lost, cracked: ck.cracked, rebuilt: -1, fx: ++S.fx, ms: 0 };
        stat(p, C.tenseOf(item), false, true);
        R.answers[p.pid] = a;
      } else {
        R.answers[p.pid] = { absent: true, ok: false, pts: 0, lost: -1, cracked: -1, rebuilt: -1, fx: ++S.fx };
      }
    });
    S.phase = 'reveal';
    var right = Object.keys(R.answers).filter(function (k) { return R.answers[k].ok; }).length;
    SND.play(right ? 'good' : 'bad'); setTimeout(function () { SND.play('boom'); }, 500);
    commit();
  }
  function fastest(R, n) {
    return Object.keys(R.answers).filter(function (k) { return R.answers[k].ok && P(k); })
      .sort(function (a, b) { return R.answers[a].ms - R.answers[b].ms; }).slice(0, n || 1);
  }

  /* ---------------- phase: sabotage (chaos cards) ---------------- */
  /* Chaos cards come after EVERY round: the attackerCount() fastest correct players who are still online attack
     (1 for up to 14 players, 2 for 15–24, 3 for 25+). Skipped when nobody was correct or nobody is left to hit. */
  function sabAttackers() {
    return fastest(S.round, 99).filter(function (pid) { return P(pid) && isOnline(P(pid)); }).slice(0, attackerCount());
  }
  function sabDue() {
    if (S.phase !== 'reveal' || (S.sab && S.sab.afterRound === S.roundIdx)) return false;
    var att = sabAttackers();
    if (!att.length) return false;
    return players().some(function (p) { return aliveCount(p) > 0 && att.some(function (a) { return a !== p.pid; }); });
  }
  function validTargets(attackerPid) {
    var B = S.sab, taken = Object.keys(B.picks).map(function (k) { return B.picks[k]; });
    return players().filter(function (p) { return p.pid !== attackerPid && aliveCount(p) > 0 && taken.indexOf(p.pid) < 0; });
  }
  function startSabotage() {
    var attackers = sabAttackers();
    S.sab = { num: ++S.sabNum, afterRound: S.roundIdx, attackers: attackers, picks: {}, endsAt: now() + S.settings.pickSecs * 1000, hits: {}, targets: [] };
    if (!attackers.length) { S.sab.none = 'nobody'; S.phase = 'sab_result'; commit(); return; }
    S.phase = 'sab_pick'; SND.play('alarm'); commit();
  }
  function onPick(p, m) {
    var B = S.sab;
    if (S.phase !== 'sab_pick' || !B || B.attackers.indexOf(p.pid) < 0 || B.picks[p.pid]) { sendView(p.pid); return; }
    var ok = validTargets(p.pid).some(function (t) { return t.pid === m.target; });
    if (!ok) { sendView(p.pid); return; } // already taken by another attacker -> phone refreshes its list
    B.picks[p.pid] = m.target; SND.play('whoosh');
    save(); broadcast(); renderLive();
    var waiting = B.attackers.filter(function (a) { return !B.picks[a] && validTargets(a).length; });
    if (!waiting.length) later('resolveAttacks', 700, function () { if (S.phase === 'sab_pick' && S.sab === B) resolveAttacks(); });
  }
  function autoPicks() {
    var B = S.sab;
    B.attackers.forEach(function (a) {
      if (B.picks[a]) return;
      var vt = validTargets(a);
      if (!vt.length) return;
      vt.sort(function (x, y) { return aliveCount(y) - aliveCount(x) || Math.random() - .5; });
      B.picks[a] = vt[0].pid; B.auto = true;
    });
  }
  /* Every chaos card ALWAYS hits: the target loses one plan. There is no defence. */
  function resolveAttacks() {
    var B = S.sab;
    autoPicks();
    B.targets = B.attackers.map(function (a) { return B.picks[a]; }).filter(Boolean);
    if (!B.targets.length) { B.none = 'notargets'; S.phase = 'sab_result'; commit(); return; }
    B.attackers.forEach(function (a) {
      var t = B.picks[a], p = t && P(t);
      if (!p) return;
      B.hits[t] = { by: a, lost: destroy(p, '🃏'), fx: ++S.fx };
      if (P(a)) P(a).score += 100;
    });
    S.phase = 'sab_result';
    SND.play('whoosh'); setTimeout(function () { SND.play('boom'); }, 350);
    commit();
  }
  function attackersOf(pid) { var B = S.sab; return B.attackers.filter(function (a) { return B.picks[a] === pid; }); }

  /* ---------------- final ---------------- */
  function finish() {
    if (S.phase === 'round') endRound();
    S.phase = 'final'; SND.play('fanfare'); commit();
    setTimeout(function () { U.confetti(180); }, 300);
  }
  function playAgain() {
    var keep = players();
    var code = S.code, settings = S.settings;
    var fx = S.fx;
    S = newState(code); S.settings = settings; S.fx = fx; // keep fx ids unique so phones still animate
    keep.forEach(function (p) {
      p.score = 0; p.slots = [null, null, null, null, null, null]; p.stats = { right: 0, wrong: 0, late: 0, tense: {} }; delete p.lateStart; p.rebuilds = 0;
      S.players[p.pid] = p; S.order.push(p.pid);
    });
    commit();
  }

  function next() {
    switch (S.phase) {
      case 'lobby': startBuild(); break;
      case 'build': endBuild(); break;
      case 'ready': startRound(); break;
      case 'round': endRound(); break;
      case 'reveal':
        if (sabDue()) startSabotage();
        else if (S.roundIdx + 1 < S.roundList.length) startRound();
        else finish();
        break;
      case 'sab_pick': resolveAttacks(); break;
      case 'sab_result':
        if (S.roundIdx + 1 < S.roundList.length) startRound(); else finish();
        break;
      case 'final': if (confirm('Play again with the same players?')) playAgain(); break;
    }
  }
  function commit() { save(); broadcast(); stageKey = ''; render(); }

  /* ---------------- views sent to phones ---------------- */
  function qView(item, key) {
    return { key: key, id: item.id, emoji: item.emoji, title: item.title, text: item.text, cue: item.cue, clue: C.USES[item.use].clue, tiles: C.tileSet(item) };
  }
  function fb(a, item) {
    if (!a) return null;
    return { ok: a.ok, late: !!a.late, none: !!a.none, absent: !!a.absent, pts: a.pts, lost: a.lost, fx: a.fx,
      cracked: a.cracked == null ? -1 : a.cracked, rebuilt: a.rebuilt == null ? -1 : a.rebuilt, rebuilds: 0,
      answer: C.answerOf(item), why: item.why, tense: C.tenseOf(item), clue: C.USES[item.use].clue };
  }
  function mini(p) { return { pid: p.pid, name: p.name, avatar: p.avatar, alive: aliveCount(p) }; }
  function viewFor(p) {
    var t = now();
    var v = { t: 'view', phase: S.phase, maxRebuilds: CFG.maxRebuilds == null ? 2 : CFG.maxRebuilds, code: S.code, hints: S.settings.hints, roundNum: S.roundIdx + 1, total: S.roundList.length,
      you: { pid: p.pid, name: p.name, avatar: p.avatar, score: p.score, slots: p.slots, alive: aliveCount(p), cracked: crackedCount(p), rebuilds: p.rebuilds || 0, lateStart: p.lateStart || 0 } };
    var item;
    if (S.phase === 'build') { v.endsIn = S.buildEndsAt - t; v.dur = S.settings.buildSecs * 1000; }
    if (S.phase === 'round' || S.phase === 'reveal') {
      item = C.get(S.round.sid);
      v.q = qView(item, 'r' + S.round.idx);
      v.endsIn = S.round.endsAt - t; v.dur = S.settings.roundSecs * 1000;
      v.ans = fb(S.round.answers[p.pid], item);
      if (v.ans) v.ans.rebuilds = p.rebuilds || 0;
      if (S.phase === 'reveal') v.reveal = { answer: C.answerOf(item), why: item.why, tense: C.tenseOf(item), clue: C.USES[item.use].clue };
    }
    if (S.phase === 'sab_pick' || S.phase === 'sab_result') {
      var B = S.sab;
      var taken = {};
      Object.keys(B.picks).forEach(function (a) { taken[B.picks[a]] = a; });
      v.sab = {
        num: B.num, none: B.none || null,
        attackers: B.attackers.map(function (a) { var x = mini(P(a) || { pid: a, name: '?', avatar: '❔', slots: [] }); x.pick = B.picks[a] || null; return x; }),
        amAttacker: B.attackers.indexOf(p.pid) >= 0, myPick: B.picks[p.pid] || null,
        hits: Object.keys(B.hits).map(function (t) { var h = B.hits[t]; return { from: P(h.by) ? mini(P(h.by)) : null, to: P(t) ? mini(P(t)) : null, lost: h.lost }; }),
        endsIn: B.endsAt - t
      };
      v.dur = S.settings.pickSecs * 1000;
      var mine = B.hits[p.pid];
      if (mine) v.sab.hitMe = { by: P(mine.by) ? mini(P(mine.by)) : { name: '?', avatar: '❔' }, lost: mine.lost, fx: mine.fx };
      if (S.phase === 'sab_pick' && v.sab.amAttacker) {
        v.sab.targets = players().filter(function (x) { return x.pid !== p.pid; }).map(function (x) {
          var m = mini(x);
          m.taken = !!taken[x.pid]; m.takenBy = taken[x.pid] && P(taken[x.pid]) ? P(taken[x.pid]).name : null;
          m.ruined = m.alive === 0;
          return m;
        });
      }
    }
    if (S.phase === 'final') {
      var r = ranking();
      v.final = { rank: r.indexOf(p) + 1, of: r.length, top: r.slice(0, 3).map(function (x) { var m = mini(x); m.score = x.score; return m; }), stats: p.stats };
    }
    return v;
  }

  /* ---------------- HOST RENDERING ---------------- */
  function joinUrl() {
    var u = new URL('play.html', location.href); // relative -> works on any static host / sub-path
    u.search = '';
    var q = new URLSearchParams(setup.passOn);
    q.set('code', S.code);
    u.search = q.toString();
    u.hash = '';
    return u.toString();
  }
  function shortUrl() { var u = new URL('play.html', location.href); return u.host + u.pathname; }

  function qrSvg(text) {
    var qr = qrcode(0, 'M'); qr.addData(text); qr.make();
    return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  }

  function tenseRefHtml(includeWill) {
    var I = function (use) { return C.USES[use].clue.split(' ')[0]; }; // the picture hint = first word of the clue badge (content.js USES)
    var cards = [
      ['psimp', I('timetable') + ' Timetables', 'The movie <span class="verb-hl">starts</span> at 10:00.'],
      ['pcont', I('arrangement') + ' Arrangements', 'I<span class="verb-hl">\'m meeting</span> Amy at 2:00.'],
      ['going', I('plan') + ' Plans · ' + I('evidence') + ' Evidence', 'I<span class="verb-hl">\'m going to</span> visit Grandma.<br>It<span class="verb-hl">\'s going to</span> rain!']
    ];
    if (includeWill) cards.push(['will', I('instant') + ' Decide now · ' + I('offer') + ' Offers · ' + I('promise') + ' Promises · ' + I('guess') + ' Guesses',
      'I<span class="verb-hl">\'ll</span> help you!<br><span class="verb-hl">Shall</span> I carry it?<br>I think we<span class="verb-hl">\'ll</span> win.']);
    return '<div class="tense-ref" style="grid-template-columns:repeat(' + cards.length + ',1fr)">' + cards.map(function (c) {
      return '<div class="card"><h3>' + c[1] + '</h3><p><span class="tense ' + c[0] + '">' + esc(C.TENSES[c[0]].name) + '</span></p><p>' + esc(C.TENSES[c[0]].form) + '</p><p>' + c[2] + '</p></div>';
    }).join('') + '</div>';
  }
  function hlSentence(s) {
    return esc(s).replace(/(&#39;ll|&#39;m|&#39;re|&#39;s|\bShall\b|\bwill\b|\bwon&#39;t\b|\baren&#39;t\b|\bdoesn&#39;t\b|\bdoes\b|\bis\b|\bare\b|\bgoing to\b|\b[a-z]+ing\b|\b(starts|leaves|opens|closes|arrives|begins)\b)/g, function (m) {
      if (/^(something|anything|morning|evening|thing)$/i.test(m)) return m;
      return '<span class="verb-hl">' + m + '</span>';
    });
  }
  function timerHtml(id) { return '<div class="big-timer" id="' + (id || 'bigTimer') + '" data-testid="host-timer">–</div>'; }
  function roundLabel() { return '<span class="round-label">🌪️ Chaos round ' + (S.roundIdx + 1) + ' / ' + S.roundList.length + '</span>'; }

  function controls() {
    var nb = $('#btnNext'), sk = $('#btnSkip'), en = $('#btnEnd');
    var label = null;
    switch (S.phase) {
      case 'lobby': label = null; break;
      case 'build': label = 'Start the chaos! 🌪️'; break;
      case 'ready': label = 'Chaos round 1 ▶'; break;
      case 'reveal':
        label = sabDue() ? '⚡ Chaos cards! ▶' : (S.roundIdx + 1 < S.roundList.length ? 'Round ' + (S.roundIdx + 2) + ' ▶' : '🏆 Results ▶'); break;
      case 'sab_result': label = S.roundIdx + 1 < S.roundList.length ? 'Round ' + (S.roundIdx + 2) + ' ▶' : '🏆 Results ▶'; break;
      case 'final': label = '🔁 Play again'; break;
    }
    nb.classList.toggle('hidden', !label); if (label) nb.textContent = label;
    var skipLabel = { round: '⏭ Stop timer', sab_pick: '⏭ Skip (auto-pick)' }[S.phase];
    sk.classList.toggle('hidden', !skipLabel); if (skipLabel) sk.textContent = skipLabel;
    en.classList.toggle('hidden', S.phase === 'lobby' || S.phase === 'final');
    $('#roomPill').classList.toggle('hidden', S.phase === 'lobby' || !peerReady);
    $('#roomPillCode').textContent = S.code;
    $('#roomPillCount').textContent = players().length;
  }

  function render() {
    if (!S) return;
    if (!peerReady) { controls(); return; }
    var key = S.phase + ':' + S.roundIdx + ':' + (S.sab ? S.sab.num : 0) + ':' + S.code;
    if (key !== stageKey) {
      stageKey = key;
      var st = $('#stage');
      st.innerHTML = stageHtml();
      afterStage();
    }
    controls();
    renderLive();
  }

  function stageHtml() {
    var item, B = S.sab;
    switch (S.phase) {
      case 'lobby':
        return '<div class="lobby">' +
          '<div class="lobby-join card">' +
            '<div class="how">📱 Scan to join!</div>' +
            '<div class="qr" id="qr" data-testid="qr"></div>' +
            '<div class="how">or open <b>' + esc(shortUrl()) + '</b><br>and type the code:</div>' +
            '<div class="room-code" data-testid="room-code">' + esc(S.code) + '</div>' +
            '<div class="url" data-testid="join-url">' + esc(joinUrl()) + '</div>' +
          '</div>' +
          '<div class="lobby-right">' +
            '<h1 class="lobby-title">Who\'s planning a weekend? 🗓️</h1>' +
            '<div class="lobby-count" id="lobbyCount" data-testid="lobby-count"></div>' +
            '<div class="chips" id="chips" data-testid="chips"></div>' +
            '<div class="empty-lobby" id="emptyLobby"><span class="emo bob">📱</span>Waiting for players…</div>' +
            '<div style="margin-top:auto;display:flex;flex-direction:column;gap:1vw">' +
              '<div class="settings">' +
                '<label>Answer time <select id="setSecs">' + [15, 20, 30, 45].map(function (n) { return '<option value="' + n + '"' + (n === S.settings.roundSecs ? ' selected' : '') + '>' + n + 's</option>'; }).join('') + '</select></label>' +
                '<label>Planning time <select id="setBuild">' + [60, 90, 120, 180, 240].map(function (n) { return '<option value="' + n + '"' + (n === S.settings.buildSecs ? ' selected' : '') + '>' + (n / 60) + ' min</option>'; }).join('') + '</select></label>' +
                '<label><input type="checkbox" id="setHints"' + (S.settings.hints ? ' checked' : '') + '> Show clues</label>' +
                '<span style="opacity:.8">Tip: click a name to remove it.</span>' +
              '</div>' +
              '<div class="round-picker" id="roundPicker" data-testid="round-picker" role="radiogroup" aria-label="Chaos rounds"><span class="rp-label">🌪️ Chaos rounds:</span>' +
                roundOptions().map(function (n, k) { var on = n === S.settings.rounds; return '<button type="button" class="rp-btn' + (on ? ' on' : '') + '" role="radio" aria-checked="' + on + '" data-rounds="' + n + '" data-testid="rounds-' + n + '">' + (k ? n : n + ' rounds') + '</button>'; }).join('') +
              '</div>' +
              '<button class="btn btn-go btn-big pulse" id="btnStart" data-testid="host-start" style="font-size:2.2vw">▶ Start the game!</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      case 'build':
        return '<div class="phase-head"><h1>📅 Build your weekend!</h1><div class="sub">On your phone: tap a time ➜ choose a plan ➜ build the sentence.</div>' + timerHtml() + '</div>' +
          tenseRefHtml(false) +
          '<div class="answered-count" id="buildCount"></div>' +
          '<div class="chips h-chips-wrap" id="chips"></div>';
      case 'ready':
        return '<div class="center-col">' +
          '<h1 class="mega zoom-bang" style="font-size:4.2vw">Planning is over! 🎉</h1>' +
          '<div class="card" style="font-size:2vw;text-align:left;max-width:70vw">' +
            '🌪️ <b>CHAOS</b> is coming! Build the right sentence in <b>' + S.settings.roundSecs + ' seconds</b>.<br>' +
            '✅ Right = your plans are <b>safe</b> 🛡️<br>' +
            '❌ Wrong = 💥 a plan is <b>destroyed</b>!<br>' +
            '⏰ Too slow = 🩹 a plan is <b>cracked</b>. Two cracks = 💥 destroyed!<br>' +
            '🔨 On 0 or 1 plans? A right answer <b>rebuilds</b> a plan (max ' + (CFG.maxRebuilds == null ? 2 : CFG.maxRebuilds) + ' times)!<br>' +
            (attackerCount() === 1 ?
              '⚡ After <b>every</b> round, the <b>fastest</b> right answer wins a <b>CHAOS CARD</b> to throw at a friend — it <b>always hits</b>! 🃏' :
              '⚡ After <b>every</b> round, the <b>' + attackerCount() + ' fastest</b> right answers win <b>CHAOS CARDS</b> to throw at friends — they <b>always hit</b>! 🃏') +
          '</div>' +
          '<div class="answered-count" id="readyCount" data-testid="ready-count"></div>' +
          '<div class="chips small h-chips-wrap" id="chips" data-testid="chips"></div>' + tenseRefHtml(true) + '</div>';
      case 'round':
        item = C.get(S.round.sid);
        return '<div class="phase-head">' + roundLabel() + '<div class="answered-count" id="answeredCount" data-testid="answered-count"></div>' + timerHtml() + '</div>' +
          '<div class="chaos-main">' +
            '<div class="chaos-emo"><span class="zoom-bang" style="display:inline-block"><span class="wobble" style="display:inline-block">' + item.emoji + '</span></span></div>' +
            '<div>' +
              '<h1 class="chaos-title slide-up" data-testid="chaos-title">' + esc(item.title) + '</h1>' +
              '<p class="chaos-text">' + esc(item.text) + '</p>' +
              '<div class="card chaos-cue" data-testid="chaos-cue">👉 ' + esc(item.cue) + '</div>' +
              (S.settings.hints ? '<p style="font-size:1.8vw;margin-top:1vw"><span class="clue" data-testid="chaos-clue">' + esc(C.USES[item.use].clue) + '</span></p>' : '') +
            '</div>' +
          '</div>' +
          '<div class="chips small h-chips-wrap" id="chips"></div>';
      case 'reveal':
        item = C.get(S.round.sid);
        var R = S.round, keys = Object.keys(R.answers);
        var nR = keys.filter(function (k) { return R.answers[k].ok; }).length;
        var nW = keys.filter(function (k) { return !R.answers[k].ok && !R.answers[k].late && !R.answers[k].absent; }).length;
        var nL = keys.filter(function (k) { return R.answers[k].late && !R.answers[k].absent; }).length;
        var nC = keys.filter(function (k) { return R.answers[k].cracked >= 0; }).length;
        var f = fastest(R, attackerCount());
        var cb = keys.filter(function (k) { return R.answers[k].rebuilt >= 0 && P(k); });
        var tense = C.tenseOf(item);
        return '<div class="phase-head">' + roundLabel() + '<h1 style="font-size:2.6vw">' + item.emoji + ' ' + esc(item.title) + '</h1></div>' +
          '<div class="center-col" style="flex:0 0 auto">' +
            '<div class="card answer-reveal zoom-bang" data-testid="reveal-answer">' + hlSentence(C.answerOf(item)) + '</div>' +
            '<div style="font-size:2vw"><span class="clue" data-testid="reveal-clue">' + esc(C.USES[item.use].clue) + '</span> ➜ <span class="tense ' + tense + '">' + esc(C.TENSES[tense].name) + '</span></div>' +
            '<div class="reveal-why">💡 ' + esc(item.why) + '</div>' +
            '<div class="stats"><div class="card">✅ ' + nR + ' right</div><div class="card">❌ ' + nW + ' wrong</div><div class="card" data-testid="reveal-slow">⏰ ' + nL + ' too slow' + (nC ? ' (🩹 ' + nC + ' cracked)' : '') + '</div>' +
              (f.length ? '<div class="card">⚡ Fastest: ' + f.map(function (k) { return esc(P(k).avatar + ' ' + P(k).name) + ' (' + (R.answers[k].ms / 1000).toFixed(1) + 's)'; }).join(', ') + '</div>' : '') +
              (cb.length ? '<div class="card" data-testid="reveal-comeback">🔨 Comeback: ' + cb.map(function (k) { return esc(P(k).avatar + ' ' + P(k).name); }).join(', ') + '</div>' : '') +
            '</div>' +
          '</div>' +
          '<div class="chips small h-chips-wrap" id="chips"></div>';
      case 'sab_pick':
        return '<div class="phase-head"><h1>⚡ CHAOS CARDS!</h1><div class="sub">' + (B.attackers.length === 1 ? 'The fastest player throws' : 'The ' + B.attackers.length + ' fastest players throw') + ' chaos at a friend!<br>Each player can only be hit <b>once</b>.</div>' + timerHtml() + '</div>' +
          '<div class="center-col"><div class="mega wobble" style="font-size:10vw">🃏</div>' +
          '<div class="attack-list" id="attackList"></div>' +
          '<p class="chaos-text">Attackers: choose a victim on your phone! 😈</p></div>';
      case 'sab_result':
        if (B.none) {
          return '<div class="center-col"><div class="mega">🤷</div><h1 class="mega" style="font-size:4vw">No chaos cards this time!</h1>' +
            '<p class="chaos-text">' + (B.none === 'nobody' ? 'Nobody answered correctly last round.' : 'There was nobody left to hit.') + '</p></div>';
        }
        return '<div class="center-col">' +
          '<h1 class="mega zoom-bang">💥 CHAOS!</h1>' +
          '<p class="chaos-text">Every chaos card hits — each target loses a plan! 🃏</p>' +
          '<div class="attack-list" id="attackList" data-testid="attack-list"></div></div>';
      case 'final':
        var r = ranking();
        var pod = function (p, n) {
          if (!p) return '<div class="pod p' + n + '"></div>';
          return '<div class="pod p' + n + '" data-testid="podium-' + n + '"><div class="av">' + p.avatar + '</div><div class="nm">' + esc(p.name) + '</div>' +
            '<div class="info">📅 ' + aliveCount(p) + (aliveCount(p) === 1 ? ' plan' : ' plans') + ' · ⭐ ' + p.score + '</div><div class="stand">' + n + '</div></div>';
        };
        var tot = { will: [0, 0], going: [0, 0], pcont: [0, 0], psimp: [0, 0] };
        players().forEach(function (p) { Object.keys(p.stats.tense).forEach(function (t) { tot[t][0] += p.stats.tense[t].right; tot[t][1] += p.stats.tense[t].total; }); });
        return '<div class="final">' +
          '<div style="display:flex;flex-direction:column">' +
            '<h1 class="mega" style="text-align:center;font-size:4.4vw">🏆 Who survived the weekend?</h1>' +
            '<div class="podium">' + pod(r[1], 2) + pod(r[0], 1) + pod(r[2], 3) + '</div>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:1vw;min-height:0">' +
            '<div class="rank-list" data-testid="rank-list">' + r.slice(0, 15).map(function (p, i) {
              return '<div class="rank-row"><span class="r">#' + (i + 1) + '</span><span class="av">' + p.avatar + '</span><span class="nm">' + esc(p.name) + '</span><span>📅' + aliveCount(p) + '</span><span>⭐' + p.score + '</span></div>';
            }).join('') + (r.length > 15 ? '<div class="rank-row">…and ' + (r.length - 15) + ' more</div>' : '') + '</div>' +
            '<div class="card class-stats"><b style="font-size:1.3vw">📊 Class results</b>' + ['will', 'going', 'pcont', 'psimp'].map(function (t) {
              var pc = tot[t][1] ? Math.round(100 * tot[t][0] / tot[t][1]) : 0;
              return '<div class="bar-row"><span class="lab">' + esc(C.TENSES[t].name) + '</span><span class="bar"><i style="width:' + pc + '%;background:' + C.TENSES[t].color + '"></i></span><span>' + (tot[t][1] ? pc + '%' : '–') + '</span></div>';
            }).join('') + '</div>' +
          '</div>' +
        '</div>';
    }
    return '';
  }

  function afterStage() {
    if (S.phase === 'lobby') {
      $('#qr').innerHTML = qrSvg(joinUrl());
      $('#btnStart').addEventListener('click', next);
      $('#roundPicker').addEventListener('click', function (e) {
        var b = e.target.closest('.rp-btn'); if (!b) return;
        S.settings.rounds = +b.getAttribute('data-rounds'); save();
        [].forEach.call(document.querySelectorAll('#roundPicker .rp-btn'), function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); });
        SND.play('pop');
      });
      $('#setSecs').addEventListener('change', function (e) { S.settings.roundSecs = +e.target.value; save(); });
      $('#setBuild').addEventListener('change', function (e) { S.settings.buildSecs = +e.target.value; save(); });
      $('#setHints').addEventListener('change', function (e) { S.settings.hints = e.target.checked; save(); });
      $('#chips').addEventListener('click', function (e) {
        var c = e.target.closest('.chip'); if (!c) return;
        var p = P(c.getAttribute('data-pid'));
        if (p && confirm('Remove "' + p.name + '" from the game?')) kick(p.pid);
      });
    }
    if (S.phase === 'final') setTimeout(function () { U.confetti(160); }, 200);
  }

  /* chips are updated in place (keyed by player id) so animations don't restart */
  function renderChips() {
    var box = $('#chips'); if (!box) return;
    var list = players(), seen = {};
    list.forEach(function (p) {
      seen[p.pid] = true;
      var c = box.querySelector('[data-pid="' + p.pid + '"]');
      if (!c) {
        c = document.createElement('div'); c.className = 'chip'; c.setAttribute('data-pid', p.pid); box.appendChild(c);
        if (box.getAttribute('data-init')) { c.classList.add('new'); setTimeout(function () { c.classList.remove('new'); }, 500); }
      }
      var cls = 'chip', inner = '<span class="av">' + p.avatar + '</span><span class="nm">' + esc(p.name) + '</span>';
      var alive = aliveCount(p);
      if (!isOnline(p)) cls += ' off';
      if (S.phase === 'build') {
        var n = builtCount(p);
        inner += '<span class="bar"><i style="width:' + Math.round(100 * n / CFG.slots) + '%"></i></span><span class="plans">' + n + '/6</span>';
      } else if (S.phase === 'ready') { // v2: how many plans each student built (no auto-fill)
        var nb = aliveCount(p);
        inner += '<span class="plans" data-built="' + nb + '">' + (nb ? '📅×' + nb : '0 plans') + '</span>';
        if (!nb) cls += ' ruined';
      } else if (S.phase === 'round') {
        var a = S.round.answers[p.pid];
        if (a) { cls += ' answered'; inner += '<span class="badge">✅</span>'; }
        if (alive === 0) { cls += ' ruined'; inner += '<span class="plans">😱 Weekend ruined!</span>'; }
      } else if (S.phase === 'reveal') {
        var b = S.round.answers[p.pid];
        if (b && b.ok) cls += ' right'; else if (b && !b.absent) cls += ' wrong';
        if (b && b.lost >= 0) inner += '<span class="badge">💥</span>';
        else if (b && b.cracked >= 0) inner += '<span class="badge">🩹</span>';
        else if (b && b.rebuilt >= 0) inner += '<span class="badge">🔨</span>';
        inner += alive ? '<span class="plans">📅×' + alive + (crackedCount(p) ? ' 🩹' : '') + '</span>' : '<span class="plans">😱 Weekend ruined!</span>';
        if (alive === 0) cls += ' ruined';
      }
      if (c.classList.contains('new')) cls += ' new';
      if (c.className !== cls) c.className = cls;
      if (c.innerHTML !== inner) c.innerHTML = inner;
    });
    U.$all('.chip', box).forEach(function (c) { if (!seen[c.getAttribute('data-pid')]) c.remove(); });
    box.setAttribute('data-init', '1');
  }

  function renderAttackList() {
    var box = $('#attackList'); if (!box || !S.sab) return;
    var B = S.sab;
    box.innerHTML = B.attackers.map(function (a) {
      var pa = P(a), t = B.picks[a] && P(B.picks[a]);
      if (!pa) return '';
      var res = t && B.hits && B.hits[t.pid] ? 'hit' : null;
      return '<div class="attack ' + (res || '') + '"><span class="av">' + pa.avatar + '</span>' + esc(pa.name) + ' <span style="font-size:2.6vw">➜🌪️➜</span> ' +
        (t ? '<span class="av">' + t.avatar + '</span>' + esc(t.name) + (res === 'hit' ? ' 💥 HIT' + (B.hits[t.pid].lost < 0 ? '' : ' (−1 plan)') : '') :
          (S.phase === 'sab_result' || !validTargets(a).length ? '🤷 nobody left to hit' : '<span class="pulse" style="display:inline-block">🤔 choosing…</span>')) +
        '</div>';
    }).join('');
  }

  function renderLive() {
    if (!S || !peerReady) return;
    renderChips();
    var n = players().length;
    if (S.phase === 'lobby' && $('#chips')) $('#chips').classList.toggle('small', n > 18);
    if ($('#lobbyCount')) $('#lobbyCount').textContent = n + (n === 1 ? ' player' : ' players') + ' joined';
    if ($('#emptyLobby')) $('#emptyLobby').classList.toggle('hidden', n > 0);
    if ($('#buildCount')) {
      var done = players().filter(function (p) { return builtCount(p) >= CFG.slots; }).length;
      $('#buildCount').textContent = '🗓️ ' + done + ' / ' + n + ' weekends full';
    }
    if ($('#readyCount')) {
      var zero = players().filter(function (p) { return !aliveCount(p); }).length;
      $('#readyCount').textContent = '🗓️ Plans built: ' + players().reduce(function (t, p) { return t + aliveCount(p); }, 0) + (zero ? ' · ' + zero + ' with 0 plans (a right answer rebuilds one 🔨)' : '');
    }
    if ($('#answeredCount')) {
      var ans = S.phase === 'round' ? Object.keys(S.round.answers).length : 0;
      $('#answeredCount').textContent = '✋ ' + ans + ' / ' + n + ' answered';
    }
    renderAttackList();
    if ($('#roomPillCount')) $('#roomPillCount').textContent = n;
  }

  /* ---------------- clock ---------------- */
  function tick() {
    if (!S) return;
    var t = now(), endsAt = 0;
    if (S.phase === 'build') endsAt = S.buildEndsAt;
    else if (S.phase === 'round') endsAt = S.round.endsAt;
    else if (S.phase === 'sab_pick' && S.sab) endsAt = S.sab.endsAt;
    var el = $('#bigTimer');
    if (endsAt) {
      var left = Math.max(0, Math.ceil((endsAt - t) / 1000));
      if (el) {
        var txt = S.phase === 'build' && left >= 60 ? Math.floor(left / 60) + ':' + ('0' + left % 60).slice(-2) : String(left);
        if (el.textContent !== txt) el.textContent = txt;
        el.classList.toggle('low', left <= 5);
      }
      if (left <= 5 && left > 0 && left !== lastTickSec && S.phase !== 'build') { lastTickSec = left; SND.play('tick'); }
      if (t >= endsAt) {
        if (S.phase === 'build') endBuild();
        else if (S.phase === 'round' && t >= endsAt + 1500) endRound();
        else if (S.phase === 'sab_pick') resolveAttacks();
      }
    }
    // presence: refresh chips every second (online / offline)
    if (t % 1000 < 260) { renderLive(); if (S.phase === 'round') checkAllAnswered(); }
  }

  /* ---------------- boot ---------------- */
  function boot() {
    U.muteButton($('#btnMute'));
    $('#btnFull').addEventListener('click', function () {
      if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
    });
    $('#btnNext').addEventListener('click', next);
    $('#btnSkip').addEventListener('click', function () {
      if (S.phase === 'round') endRound(); else if (S.phase === 'sab_pick') resolveAttacks();
    });
    $('#btnEnd').addEventListener('click', function () { if (confirm('End the game now and show the leaderboard?')) finish(); });
    document.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if ((e.key === 'n' || e.key === 'ArrowRight') && !$('#btnNext').classList.contains('hidden')) { e.preventDefault(); next(); }
    });
    window.addEventListener('beforeunload', function () { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* */ } });

    if (typeof Peer === 'undefined') { bootMsg('PeerJS failed to load.'); return; }

    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { saved = null; }
    var q = new URLSearchParams(location.search);
    var fresh = q.get('new') === '1';
    if (saved && saved.v === 1 && !fresh && saved.phase !== 'final' && now() - (saved.savedAt || 0) < 3 * 3600 * 1000 && saved.order && saved.order.length) {
      var m = U.el('<div class="modal-host"><div class="card"><h2>Resume your game?</h2>' +
        '<p>Room <b>' + esc(saved.code) + '</b> · ' + saved.order.length + ' players · ' + esc(saved.phase === 'lobby' ? 'in the lobby' : 'round ' + (saved.roundIdx + 1)) + '</p>' +
        '<p style="display:flex;gap:1vw;justify-content:center"><button class="btn btn-go" id="mResume">▶ Resume</button><button class="btn" id="mNew">✨ New game</button></p></div></div>');
      document.body.appendChild(m);
      $('#mResume').addEventListener('click', function () { m.remove(); S = saved; if (S.phase === 'lobby' && roundOptions().indexOf(S.settings.rounds) < 0) S.settings.rounds = CFG.defaults.rounds; start(true); });
      $('#mNew').addEventListener('click', function () { m.remove(); S = newState(makeCode()); start(false); });
    } else {
      S = newState(makeCode()); start(false);
    }
  }
  function start(resume) {
    // phones are re-attached when they reconnect
    render();
    startPeer(S.code, resume, 0);
    setInterval(tick, 250);
  }

  // for automated tests / debugging in the console
  window.__FTG_HOST = { get state() { return S; }, onlineCount: function () { return onlinePlayers().length; }, attackerCount: attackerCount, next: next, kick: kick, viewFor: function (pid) { return viewFor(P(pid)); } };
  boot();
})();
