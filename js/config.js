/* =========================================================================
   CONFIG: edit here if needed.
   NETWORK: the host and the phones talk through public relays over wss:// on port 443
   (see js/net.js). No account, no server of our own. Each message goes out on ALL the
   relays below at once and the first copy wins, so one relay being down or blocked
   doesn't stop the game.
   URL options (the host page passes them on to the player link / QR code):
     ?relay=local                   LOCAL TESTING ONLY (`npm run relay` in dev/: ws://localhost:7447)
     ?relay=primal | snort | shiftr  use only these relays (comma-separated), e.g. to test one
                                     relay on the school Wi-Fi
   ========================================================================= */
(function () {
  'use strict';
  var CONFIG = {
    codeLength: 4,
    codeAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ', // no I / O (look like 1 / 0)
    maxPlayers: 40,
    slots: 6,                          // Sat/Sun x morning/afternoon/evening
    maxRebuilds: 2,                    // comeback: a right answer on 0-1 plans rebuilds a plan, at most this many times per game
    lateJoinMin: 3,                    // a NEW player joining after chaos round 1 has started gets the class median of plans left (rounded down), at least this many
    roundOptions: [3, 4, 5, 6], // big round picker on the host lobby (teacher's choice; default 4)
    defaults: { rounds: 4, roundSecs: 20, buildSecs: 120, pickSecs: 15, hints: true },
    netDebug: 0,                       // 1 = log relay up/down in the console
    // Three independent, free, no-signup relays (3 different organisations, all wss:// on port 443).
    relays: [
      { name: 'primal', type: 'nostr', url: 'wss://relay.primal.net' },        // Nostr relay run by Primal (behind Cloudflare)
      { name: 'snort', type: 'nostr', url: 'wss://relay.snort.social' },       // Nostr relay run by Snort
      { name: 'shiftr', type: 'mqtt', url: 'wss://public.cloud.shiftr.io', username: 'public', password: 'public' } // shiftr.io public MQTT broker
    ]
  };

  // Returns { relays: [...], passOn: query string to pass on to players }
  CONFIG.relaySetup = function () {
    var q = new URLSearchParams(location.search), r = (q.get('relay') || '').trim(), pass = new URLSearchParams();
    var relays = CONFIG.relays;
    if (r === 'local') {
      var h = location.hostname || 'localhost', port = q.get('relayPort') || '7447';
      relays = [{ name: 'local-nostr', type: 'nostr', url: 'ws://' + h + ':' + port + '/' }, { name: 'local-mqtt', type: 'mqtt', url: 'ws://' + h + ':' + port + '/mqtt' }];
      pass.set('relay', 'local'); if (q.get('relayPort')) pass.set('relayPort', port);
    } else if (r) {
      var names = r.toLowerCase().split(','), pick = CONFIG.relays.filter(function (x) { return names.indexOf(x.name) >= 0; });
      if (pick.length) { relays = pick; pass.set('relay', r); }
    }
    return { relays: relays, passOn: pass.toString() };
  };

  window.FTG_CONFIG = CONFIG;
})();
