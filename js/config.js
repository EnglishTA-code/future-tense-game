/* =========================================================================
   CONFIG — edit here if needed.
   PRODUCTION uses the free public PeerJS cloud broker (0.peerjs.com),
   which is PeerJS's default when no host is given.
   For LOCAL TESTING ONLY you can add ?peer=local to the host URL
   (expects `npm run peer` from the dev/ folder: localhost:9000, path /ftg).
   The host page passes the same option on to the player link / QR code.
   ========================================================================= */
(function () {
  'use strict';
  var CONFIG = {
    peerPrefix: 'flss-ftg-',          // room code ABCD -> PeerJS id "flss-ftg-abcd"
    codeLength: 4,
    codeAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ', // no I / O (look like 1 / 0)
    maxPlayers: 40,
    slots: 6,                          // Sat/Sun x morning/afternoon/evening
    defaults: { rounds: 8, roundSecs: 20, buildSecs: 120, pickSecs: 15, hints: true },
    peerDebug: 1                       // 0 = silent, 1 = errors, 2 = warnings, 3 = all
  };

  // Returns { options for new Peer(), query string to pass on to players }
  CONFIG.peerSetup = function () {
    var q = new URLSearchParams(location.search);
    var opts = { debug: CONFIG.peerDebug };
    var pass = new URLSearchParams();
    if (q.get('peer') === 'local') {
      opts.host = q.get('peerHost') || location.hostname || 'localhost';
      opts.port = parseInt(q.get('peerPort') || '9000', 10);
      opts.path = q.get('peerPath') || '/ftg';
      opts.secure = location.protocol === 'https:' && q.get('peerSecure') !== '0';
      // Local test mode: no STUN/TURN needed on one machine / LAN.
      opts.config = { iceServers: [] };
      pass.set('peer', 'local');
      ['peerHost', 'peerPort', 'peerPath', 'peerSecure'].forEach(function (k) { if (q.get(k)) pass.set(k, q.get(k)); });
    }
    // else: PeerJS defaults = public cloud broker 0.peerjs.com:443 + its STUN/TURN servers
    return { options: opts, passOn: pass.toString() };
  };

  window.FTG_CONFIG = CONFIG;
})();
