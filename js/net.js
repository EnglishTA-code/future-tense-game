/* =========================================================================
   NET: how the host and the phones talk.
   Everything goes through public RELAYS over secure WebSockets (wss://, port 443),
   the same kind of traffic as Kahoot or any website. Phones never connect to each other
   or to the teacher's computer directly, so school Wi-Fi "client isolation" and UDP or
   WebRTC blocking don't matter.

   Every message is sent on ALL relays at once (config.js -> relays): 2 Nostr relays
   plus 1 MQTT broker, run by 3 different organisations. The first copy to arrive wins
   and the duplicates are dropped, so if one relay is slow, blocked or down, the game
   keeps going on the others with no switch-over delay.

   Privacy and namespacing: topic names are SHA-256 hashes of (room code + random session
   salt + random device id), so they can't be guessed. Payloads are AES-GCM encrypted with
   a key made from the room code, so the relays only see random-looking bytes.
   ========================================================================= */
(function () {
  'use strict';
  var CFG = window.FTG_CONFIG;
  var SIGN = window.FTG_NOSTR_SIGN; // vendor/nostr-sign.min.js (missing on very old browsers -> Nostr relays are skipped, MQTT still works)
  var KIND = 25913; // Nostr "ephemeral" kind (20000-29999): relays pass these on but never store them
  var subtle = window.crypto && window.crypto.subtle;

  function now() { return Date.now(); }
  function rid(n) {
    var abc = 'abcdefghijkmnpqrstuvwxyz23456789', s = '', r = new Uint8Array(n || 12);
    window.crypto.getRandomValues(r);
    for (var i = 0; i < r.length; i++) s += abc[r[i] % abc.length];
    return s;
  }
  var DEBUG = +(new URLSearchParams(location.search).get('netdebug') || CFG.netDebug || 0);
  function log() { if (DEBUG > 0 && window.console) console.log.apply(console, ['[net]'].concat([].slice.call(arguments))); }
  function warn() { if (window.console) console.warn.apply(console, ['[net]'].concat([].slice.call(arguments))); }
  var enc = new TextEncoder(), dec = new TextDecoder();

  /* ---------- tiny synchronous SHA-256 (for topic names and the key) ---------- */
  var K256 = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function sha256(str) {
    var m = enc.encode(str), l = m.length, n = ((l + 9 + 63) >> 6) << 6, b = new Uint8Array(n);
    b.set(m); b[l] = 0x80;
    var bits = l * 8; b[n - 4] = bits >>> 24; b[n - 3] = bits >>> 16; b[n - 2] = bits >>> 8; b[n - 1] = bits; b[n - 5] = Math.floor(l / 0x20000000);
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], w = new Array(64), i, j;
    for (i = 0; i < n; i += 64) {
      for (j = 0; j < 16; j++) w[j] = (b[i + 4 * j] << 24) | (b[i + 4 * j + 1] << 16) | (b[i + 4 * j + 2] << 8) | b[i + 4 * j + 3];
      for (j = 16; j < 64; j++) {
        var x = w[j - 15], y = w[j - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }
      var a = H[0], bb = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (j = 0; j < 64; j++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var t1 = (h + S1 + ((e & f) ^ (~e & g)) + K256[j] + w[j]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var t2 = (S0 + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + bb) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    var out = new Uint8Array(32);
    for (i = 0; i < 8; i++) { out[4 * i] = H[i] >>> 24; out[4 * i + 1] = H[i] >>> 16; out[4 * i + 2] = H[i] >>> 8; out[4 * i + 3] = H[i]; }
    return out;
  }
  function hex(bytes) { var s = ''; for (var i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16); return s; }
  function topic(s) { return hex(sha256('ftg1|' + s)).slice(0, 32); }
  function b64(bytes) { var s = ''; for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(s) { var bin = atob(s), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }

  /* Topics for one room code */
  function Topics(code) {
    code = String(code).toUpperCase();
    this.D = topic('d|' + code);                                                // discovery ("who hosts ABCD?")
    this.host = function (salt) { return topic('h|' + code + '|' + salt); };    // host inbox for one session
    this.inbox = function (id) { return topic('i|' + code + '|' + id); };       // one device's inbox
  }

  /* ---------- payload codec: AES-GCM with a key from the room code ---------- */
  function Codec(code) {
    var raw = sha256('ftg1|k|' + String(code).toUpperCase()).subarray(0, 16);
    this.key = subtle ? subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']).then(null, function () { return null; }) : Promise.resolve(null);
  }
  Codec.prototype.encode = function (obj, plain) {
    var s = JSON.stringify(obj);
    return this.key.then(function (key) {
      if (!key || plain) return '0' + s;
      var iv = window.crypto.getRandomValues(new Uint8Array(12));
      return subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc.encode(s)).then(function (ct) {
        var out = new Uint8Array(12 + ct.byteLength); out.set(iv); out.set(new Uint8Array(ct), 12);
        return '1' + b64(out);
      });
    });
  };
  Codec.prototype.decode = function (str) {
    var c = str.charAt(0);
    if (c === '0') { try { return Promise.resolve({ o: JSON.parse(str.slice(1)), plain: true }); } catch (e) { return Promise.resolve(null); } }
    if (c !== '1') return Promise.resolve(null);
    return this.key.then(function (key) {
      if (!key) return null;
      var b = unb64(str.slice(1));
      return subtle.decrypt({ name: 'AES-GCM', iv: b.subarray(0, 12) }, key, b.subarray(12)).then(function (pt) { return { o: JSON.parse(dec.decode(pt)), plain: false }; });
    }).then(null, function () { return null; });
  };

  /* ---------- one WebSocket to one relay (common part) ---------- */
  function Sock(spec, net) {
    this.spec = spec; this.net = net; this.ws = null; this.up = false; this.fails = 0; this.timer = null; this.lastRx = 0; this.dead = false;
    try { this.name = spec.name || new URL(spec.url).hostname; } catch (e) { this.name = spec.url; }
    this.kind = spec.type;
  }
  Sock.prototype.start = function () {
    var self = this, ws;
    clearTimeout(self.timer); self.timer = null;
    if (self.dead) return;
    if (self.ws) { var old = self.ws; self.ws = null; old.onopen = old.onmessage = old.onerror = old.onclose = null; try { old.close(); } catch (e) { /* */ } }
    try { ws = self.kind === 'mqtt' ? new WebSocket(self.spec.url, ['mqtt']) : new WebSocket(self.spec.url); } catch (e) { self.down(null); return; }
    self.ws = ws; self.up = false; self.connectingSince = now();
    if (self.kind === 'mqtt') { ws.binaryType = 'arraybuffer'; self.buf = new Uint8Array(0); }
    var openTimer = setTimeout(function () { if (self.ws === ws && !self.up) self.kill(); }, 9000);
    ws.onopen = function () { if (self.ws === ws) self.onOpen(); };
    ws.onmessage = function (e) { if (self.ws !== ws) return; self.lastRx = now(); self.onData(e.data); };
    ws.onerror = ws.onclose = function () { clearTimeout(openTimer); if (self.ws === ws) self.down(ws); };
  };
  Sock.prototype.setUp = function () {
    this.up = true; this.fails = 0; this.lastRx = now(); this.subd = {};
    this.resub();
    this.net._sockChange(this);
  };
  Sock.prototype.down = function () {
    var was = this.up;
    if (this.ws) { var w = this.ws; this.ws = null; w.onopen = w.onmessage = w.onerror = w.onclose = null; try { w.close(); } catch (e) { /* */ } }
    this.up = false;
    if (was) this.net._sockChange(this);
    if (this.dead) return;
    this.fails++;
    // back off (with jitter so 40 iPads don't all retry in the same instant)
    var ms = Math.min(15000, 700 * Math.pow(2, Math.min(this.fails - 1, 5))) * (0.7 + Math.random() * 0.6);
    clearTimeout(this.timer);
    var self = this; this.timer = setTimeout(function () { self.start(); }, ms);
  };
  Sock.prototype.kill = function () { this.down(this.ws); };
  Sock.prototype.poke = function () { // "try again now" (e.g. the iPad just woke up)
    if (this.dead || this.up || (this.ws && now() - this.connectingSince < 9000)) return;
    this.fails = 0; this.start();
  };
  Sock.prototype.stop = function () { this.dead = true; clearTimeout(this.timer); if (this.ws) { try { if (this.kind === 'mqtt' && this.up) this.ws.send(new Uint8Array([0xE0, 0])); } catch (e) { /* */ } } this.down(this.ws); };
  Sock.prototype.keepAlive = function () {
    if (!this.up) return;
    var idle = now() - this.lastRx;
    if (idle > 35000) { warn(this.name + ' silent for 35 s, reconnecting'); this.kill(); return; }
    if (idle > 14000) this.ping();
  };

  /* ---------- Nostr relay (NIP-01): EVENT to publish, REQ with a '#t' filter to subscribe ---------- */
  function nostrOpen() { this.setUp(); }
  function nostrData(data) {
    var m; try { m = JSON.parse(data); } catch (e) { return; }
    if (m[0] === 'EVENT' && m[2] && typeof m[2].content === 'string') {
      var tg = (m[2].tags || []).filter(function (t) { return t[0] === 't'; })[0];
      if (tg) this.net._rx(this, tg[1], m[2].content);
    } else if (m[0] === 'OK' && m[2] === false) {
      warn(this.name + ' refused a message: ' + m[3]);
    } else if (m[0] === 'CLOSED') {
      warn(this.name + ' closed our subscription: ' + m[2]);
      var self = this; setTimeout(function () { if (self.up) self.resub(); }, 3000);
    } else if (m[0] === 'NOTICE') {
      warn(this.name + ' notice: ' + m[1]);
    }
  }
  function nostrResub() {
    var t = Object.keys(this.net.subs);
    if (!this.subId) this.subId = 'f' + rid(8);
    if (t.length) this.send(JSON.stringify(['REQ', this.subId, { kinds: [KIND], '#t': t }]));
  }
  function nostrPing() { this.resub(); } // the relay answers with EOSE = proof the line is alive

  /* ---------- MQTT 3.1.1 over WebSocket (minimal: QoS 0, clean session) ---------- */
  function mStr(s) { var b = enc.encode(s), o = new Uint8Array(2 + b.length); o[0] = b.length >> 8; o[1] = b.length & 255; o.set(b, 2); return o; }
  function mPkt(head, parts) {
    var len = 0, i; for (i = 0; i < parts.length; i++) len += parts[i].length;
    var lb = [], x = len; do { var d = x % 128; x = Math.floor(x / 128); if (x > 0) d |= 128; lb.push(d); } while (x > 0);
    var out = new Uint8Array(1 + lb.length + len); out[0] = head; out.set(lb, 1);
    var off = 1 + lb.length; for (i = 0; i < parts.length; i++) { out.set(parts[i], off); off += parts[i].length; }
    return out;
  }
  function mqttOpen() {
    var s = this.spec, flags = 0x02 | (s.username ? 0x80 : 0) | (s.password ? 0x40 : 0);
    var parts = [mStr('MQTT'), new Uint8Array([4, flags, 0, 30]), mStr('ftg' + rid(12))];
    if (s.username) parts.push(mStr(s.username));
    if (s.password) parts.push(mStr(s.password));
    this.send(mPkt(0x10, parts));
  }
  function mqttData(data) {
    var chunk = new Uint8Array(data), b = new Uint8Array(this.buf.length + chunk.length);
    b.set(this.buf); b.set(chunk, this.buf.length);
    for (;;) {
      if (b.length < 2) break;
      var mult = 1, rem = 0, i = 1, byte;
      do { if (i >= b.length) { i = -1; break; } byte = b[i++]; rem += (byte & 127) * mult; mult *= 128; } while (byte & 128);
      if (i < 0 || b.length < i + rem) break;
      this.mqttPacket(b[0], b.subarray(i, i + rem));
      b = b.subarray(i + rem);
    }
    this.buf = b.length ? new Uint8Array(b) : new Uint8Array(0);
  }
  function mqttPacket(head, body) {
    var type = head >> 4;
    if (type === 2) { // CONNACK
      if (body[1] === 0) this.setUp(); else { warn(this.name + ' refused the connection (' + body[1] + ')'); this.kill(); }
    } else if (type === 3) { // PUBLISH
      var qos = (head >> 1) & 3, tl = (body[0] << 8) | body[1];
      var t = dec.decode(body.subarray(2, 2 + tl)), off = 2 + tl;
      if (qos) { this.send(new Uint8Array([0x40, 2, body[off], body[off + 1]])); off += 2; }
      if (t.indexOf('ftg1/') === 0) this.net._rx(this, t.slice(5), dec.decode(body.subarray(off)));
    }
  }
  function mqttResub() {
    var want = this.net.subs, have = this.subd, add = [], del = [], k;
    for (k in want) if (!have[k]) add.push(k);
    for (k in have) if (!want[k]) del.push(k);
    this.pid = ((this.pid || 0) % 65000) + 1;
    if (add.length) { var p = [new Uint8Array([this.pid >> 8, this.pid & 255])]; add.forEach(function (t) { p.push(mStr('ftg1/' + t), new Uint8Array([0])); have[t] = true; }); this.send(mPkt(0x82, p)); }
    this.pid++;
    if (del.length) { var q = [new Uint8Array([this.pid >> 8, this.pid & 255])]; del.forEach(function (t) { q.push(mStr('ftg1/' + t)); delete have[t]; }); this.send(mPkt(0xA2, q)); }
  }
  function mqttPing() { this.send(new Uint8Array([0xC0, 0])); }

  Sock.prototype.send = function (data) { try { if (this.ws && this.ws.readyState === 1) { this.ws.send(data); return true; } } catch (e) { /* */ } return false; };
  Sock.prototype.onOpen = function () { return (this.kind === 'mqtt' ? mqttOpen : nostrOpen).call(this); };
  Sock.prototype.onData = function (d) { return (this.kind === 'mqtt' ? mqttData : nostrData).call(this, d); };
  Sock.prototype.mqttPacket = mqttPacket;
  Sock.prototype.resub = function () { if (this.up) return (this.kind === 'mqtt' ? mqttResub : nostrResub).call(this); };
  Sock.prototype.ping = function () { return (this.kind === 'mqtt' ? mqttPing : nostrPing).call(this); };

  /* ---------- Net: all relays together + exactly-once, in-order delivery ---------- */
  function Net(code, opts) {
    var self = this;
    this.codec = new Codec(code);
    this.subs = {}; this.seq = {}; this.rx = {}; this.seen = {}; this.seenList = [];
    this.inQ = Promise.resolve(); this.outQ = Promise.resolve(); this.outbox = [];
    this.onMessage = opts.onMessage; this.onStatus = opts.onStatus;
    this.sk = null;
    if (SIGN) { try { this.sk = SIGN.newKey(); this.pk = SIGN.pubkey(this.sk); } catch (e) { this.sk = null; } }
    this.socks = (opts.relays || CFG.relaySetup().relays).filter(function (r) { return r.type === 'mqtt' || (r.type === 'nostr' && self.sk); })
      .map(function (r) { return new Sock(r, self); });
    this.lastUp = -1;
    this.timer = setInterval(function () {
      self.socks.forEach(function (s) { s.keepAlive(); });
      var t = now(); // forget old duplicate-check entries
      while (self.seenList.length && t - self.seenList[0][1] > 120000) delete self.seen[self.seenList.shift()[0]];
    }, 5000);
    this.socks.forEach(function (s) { s.start(); });
  }
  Net.prototype.upCount = function () { return this.socks.filter(function (s) { return s.up; }).length; };
  Net.prototype.status = function () {
    return { up: this.upCount(), total: this.socks.length, relays: this.socks.map(function (s) { return { name: s.name, type: s.kind, up: s.up }; }) };
  };
  Net.prototype._sockChange = function (s) {
    log(s.name + (s.up ? ' up' : ' down'));
    var n = this.upCount();
    if (s.up && this.outbox.length) { // messages written while every relay was down
      var box = this.outbox; this.outbox = [];
      var self = this; box.forEach(function (x) { if (now() - x[2] < 30000) self._publish(x[0], x[1]); });
    }
    if (n !== this.lastUp) { this.lastUp = n; if (this.onStatus) this.onStatus(this.status()); }
  };
  Net.prototype.subscribe = function (topics) {
    var self = this; this.subs = {};
    topics.forEach(function (t) { self.subs[t] = true; });
    this.socks.forEach(function (s) { if (s.up) s.resub(); });
  };
  Net.prototype._publish = function (t, payload) {
    var ev = null, sent = 0, self = this;
    this.socks.forEach(function (s) {
      if (!s.up) return;
      if (s.kind === 'nostr') {
        if (!ev) ev = JSON.stringify(['EVENT', SIGN.finalize({ kind: KIND, created_at: Math.floor(now() / 1000), tags: [['t', t]], content: payload }, self.sk, self.pk)]);
        if (s.send(ev)) sent++;
      } else if (s.send(mPkt(0x30, [mStr('ftg1/' + t), enc.encode(payload)]))) sent++;
    });
    if (!sent) { this.outbox.push([t, payload, now()]); if (this.outbox.length > 30) this.outbox.shift(); }
  };
  // obj gets a per-topic sequence number (n) unless noSeq
  Net.prototype.send = function (t, obj, plain, noSeq) {
    var self = this;
    if (!noSeq) obj.n = this.seq[t] = (this.seq[t] || 0) + 1;
    this.outQ = this.outQ.then(function () { return self.codec.encode(obj, plain); }).then(function (s) { if (!self.closed) self._publish(t, s); }, function (e) { warn('send failed', e); });
  };
  Net.prototype._rx = function (sock, t, content) {
    if (!this.subs[t] || this.closed) return;
    var k = content.slice(0, 40); // the same encrypted message arrives once per relay: decode only the first copy
    if (this.seen[k]) return;
    this.seen[k] = 1; this.seenList.push([k, now()]);
    var self = this;
    this.inQ = this.inQ.then(function () { return self.codec.decode(content); }).then(function (r) { if (r && r.o && !self.closed) self._order(t, r.o, r.plain); }, function (e) { warn('receive failed', e); });
  };
  // deliver messages from each sender exactly once and in order; a gap is waited for at most 400 ms
  Net.prototype._order = function (t, o, plain) {
    if (DEBUG > 1) log('rx', t.slice(0, 6), o.f, 'n=' + o.n, JSON.stringify(o.m || o).slice(0, 120));
    if (o.n == null || !o.f) { this.onMessage(o, plain, t); return; }
    var key = o.f + '>' + t, st = this.rx[key] || (this.rx[key] = { next: 1, buf: {}, timer: null });
    if (o.n < st.next || st.buf[o.n]) return;
    st.buf[o.n] = [o, plain];
    this._drain(st, t);
    var self = this;
    if (Object.keys(st.buf).length && !st.timer) {
      st.timer = setTimeout(function () {
        st.timer = null;
        var ks = Object.keys(st.buf).map(Number).sort(function (a, b) { return a - b; });
        while (ks.length) { st.next = ks[0]; self._drain(st, t); ks = Object.keys(st.buf).map(Number).sort(function (a, b) { return a - b; }); }
      }, 400);
    }
  };
  Net.prototype._drain = function (st, t) {
    while (st.buf[st.next]) { var x = st.buf[st.next]; delete st.buf[st.next]; st.next++; if (!this.closed) this.onMessage(x[0], x[1], t); }
  };
  Net.prototype.poke = function () { this.socks.forEach(function (s) { s.poke(); }); };
  Net.prototype.close = function () {
    var self = this;
    // let queued messages (e.g. "bye") go out first
    this.outQ.then(function () {
      self.closed = true; clearInterval(self.timer);
      setTimeout(function () { self.socks.forEach(function (s) { s.stop(); }); }, 150);
    });
  };

  /* =====================================================================
     HOST side. Emulates the small part of the PeerJS API that host.js uses:
     onConnection(conn) with conn.on('data'|'close'|'error'), conn.send, conn.close,
     conn.open. One "connection" = one phone tab (its random device id).
     ===================================================================== */
  function VConn(id, out) { this.peer = id; this.open = true; this._h = {}; this._out = out; this.lastIn = now(); this.plain = false; }
  VConn.prototype.on = function (e, f) { (this._h[e] = this._h[e] || []).push(f); };
  VConn.prototype._emit = function (e, a) { (this._h[e] || []).forEach(function (f) { try { f(a); } catch (x) { if (window.console) console.error(x); } }); };
  VConn.prototype.send = function (m) { if (this.open) this._out(this, { m: m }); };
  VConn.prototype.close = function () { if (!this.open) return; this._out(this, { c: 'close' }); this._gone(); };
  VConn.prototype._gone = function () { if (!this.open) return; this.open = false; this._emit('close'); };

  function host(code, salt, h) {
    var T = new Topics(code), inst = 'h' + rid(10), H = T.host(salt), conns = {};
    var probing = true, probeStarted = false, probeTimer = null, ready = false, net;
    function out(c, body) {
      body.f = inst; body.s = salt;
      net.send(T.inbox(c.peer), body, c.plain);
    }
    net = new Net(code, {
      onStatus: function (st) {
        if (st.up && !probeStarted) {
          // is somebody else already hosting this room code? (another teacher, or this game in another tab)
          probeStarted = true;
          net.send(T.D, { f: inst, q: 1, host: 1 }, false, true);
          probeTimer = setTimeout(function () { probing = false; ready = true; if (h.onOpen) h.onOpen(); }, 1800);
        }
        if (h.onStatus) h.onStatus(st);
      },
      onMessage: function (o, plain, t) {
        if (!o || o.f === inst) return;
        if (t === T.D) { // someone asks "who hosts this code?" -> tell them where to find this session
          if (o.q && !probing) net.send(T.inbox(o.f), { f: inst, a: 1, s: salt }, plain, true);
          return;
        }
        if (t === T.inbox(inst)) { // an answer to my probe: the code is taken
          if (o.a && probing) { probing = false; clearTimeout(probeTimer); api.destroy(); if (h.onTaken) h.onTaken(o.s === salt); }
          return;
        }
        if (t !== H || o.s !== salt || !o.f) return;
        var c = conns[o.f];
        if (o.c === 'bye') { if (c) { c._gone(); delete conns[o.f]; } return; }
        if (!c || !c.open) { c = conns[o.f] = new VConn(o.f, out); c.plain = plain; if (h.onConnection) h.onConnection(c); }
        c.lastIn = now();
        if (o.m !== undefined) c._emit('data', o.m);
      }
    });
    net.subscribe([T.D, H, T.inbox(inst)]);
    var sweep = setInterval(function () { // a phone that says nothing for 20 s is gone (it pings every 3 s)
      Object.keys(conns).forEach(function (k) { var c = conns[k]; if (now() - c.lastIn > 20000) { c._gone(); delete conns[k]; } });
    }, 5000);
    var api = {
      destroyed: false,
      status: function () { return net.status(); },
      poke: function () { net.poke(); },
      destroy: function () { if (api.destroyed) return; api.destroyed = true; clearInterval(sweep); clearTimeout(probeTimer); net.close(); },
      get ready() { return ready; }
    };
    return api;
  }

  /* =====================================================================
     PLAYER side: find the host of a room code, then exchange messages.
     ===================================================================== */
  function client(code, h) {
    var T = new Topics(code), cid = 'c' + rid(12), I = T.inbox(cid), plainMode = !subtle;
    var bound = null, discovering = false, discTimer = null, asks = 0, notFoundSent = false, closed = false;
    var net = new Net(code, {
      onStatus: function (st) { if (st.up && discovering && !bound) ask(true); if (h.onStatus) h.onStatus(st); },
      onMessage: function (o) {
        if (closed || !o) return;
        if (o.a) { // "this room is at session <salt>"
          if (!discovering || !o.s) return;
          discovering = false; clearTimeout(discTimer);
          bound = { salt: o.s, H: T.host(o.s) };
          if (h.onOpen) h.onOpen();
          return;
        }
        if (!bound || o.s !== bound.salt) return;
        if (o.c === 'close') { bound = null; if (h.onClose) h.onClose(); return; }
        if (o.m !== undefined && h.onData) h.onData(o.m);
      }
    });
    net.subscribe([I]);
    function ask(now_) {
      clearTimeout(discTimer);
      if (!discovering || closed) return;
      if (net.upCount()) {
        net.send(T.D, { f: cid, q: 1 }, plainMode, true);
        asks++;
        // 5 questions (~9 s) on a working relay and no host answered -> the code is probably wrong
        if (asks >= 5 && !notFoundSent) { notFoundSent = true; if (h.onNotFound) h.onNotFound(); }
      }
      discTimer = setTimeout(ask, asks < 3 ? 1500 : 2500);
    }
    function discover() { bound = null; discovering = true; asks = 0; notFoundSent = false; ask(); }
    discover();
    return {
      id: cid,
      send: function (m) { if (!bound || closed) return false; net.send(bound.H, { f: cid, s: bound.salt, m: m }, plainMode); return true; },
      reconnect: function () { if (closed) return; net.poke(); discover(); },
      poke: function () { net.poke(); },
      isBound: function () { return !!bound; },
      status: function () { return net.status(); },
      close: function () {
        if (closed) return;
        if (bound) net.send(bound.H, { f: cid, s: bound.salt, c: 'bye' }, plainMode);
        closed = true; discovering = false; clearTimeout(discTimer); bound = null; net.close();
      }
    };
  }

  /* Network check (check.html): can this device reach one relay, and how fast is a message there and back? */
  function selfTest(spec, done) {
    var t0 = now(), tp = topic('t|' + rid(12)), sent = 0, sentAt = {}, got = [], finished = false, connectMs = null;
    if (spec.type === 'nostr' && !SIGN) { done({ name: spec.name, ok: false, error: 'this browser is too old for this relay' }); return; }
    var net = new Net('CHECK', {
      relays: [spec],
      onStatus: function (st) { if (st.up && connectMs == null) { connectMs = now() - t0; ping(); } },
      onMessage: function (o) {
        if (!o || o.f !== 'check' || !sentAt[o.k] || o.got) return;
        o.got = 1; got.push(now() - sentAt[o.k]);
        if (got.length >= 3) finish(true); else setTimeout(ping, 150);
      }
    });
    net.subscribe([tp]);
    function ping() { sent++; sentAt[sent] = now(); net.send(tp, { f: 'check', k: sent }, false, true); }
    var to = setTimeout(function () { finish(false); }, 15000);
    function finish(ok) {
      if (finished) return; finished = true; clearTimeout(to); net.close();
      got.sort(function (a, b) { return a - b; });
      done({ name: spec.name, url: spec.url, ok: ok, connectMs: connectMs, rttMs: got.length ? got[Math.floor(got.length / 2)] : null,
        error: ok ? null : connectMs == null ? 'could not connect (blocked or down)' : 'connected, but messages did not come back' });
    }
  }

  window.FTG_NET = { host: host, client: client, selfTest: selfTest, _sha256hex: function (s) { return hex(sha256(s)); } };
})();
