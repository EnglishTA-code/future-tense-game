# 🗓️🌪️ Plan Your Weekend, Survive the Chaos!

A whole-class multiplayer game for practising **future tenses** (S3 ESL). It joins like Kahoot, but it plays as a real game.
The teacher's browser runs the game. Phones talk to it through **free public relays over secure WebSockets (wss://, port 443)**, like Kahoot: no WebRTC, no device-to-device traffic. Every message goes through 3 independent relays at once (Nostr relay.primal.net and relay.snort.social, MQTT public.cloud.shiftr.io) and the first copy wins. Before class, open **check.html** on a student iPad on the school Wi-Fi to check the relays.
**No server to keep running**: the game is a folder of static files.

| Tense (from the S3E worksheet, Section 5) | Use in the game |
|---|---|
| **Future simple** will + inf (shall I…? for offers in questions) | instant decisions, offers, promises, guesses with *I think* |
| **be going to** + inf | plans and intentions, predictions from evidence you can see |
| **Present continuous** am/is/are + -ing | fixed arrangements with people |
| **Present simple** | timetables and schedules |

## How a game runs (about 15–20 minutes)
**Timing with the default settings** (8 rounds, 20 s answers, 2 min planning, 15 s chaos-card pick): lobby/joining about 2–3 min, rules about 30 s, planning 2 min, then each round takes about 60–75 s (up to 20 s answering, about 15–20 s reveal/explanation, up to 15 s to pick targets, about 10 s for the hit results). That is about 8–10 min for 8 rounds, plus 1–2 min for the podium: **about 14–18 minutes in total**. To make it shorter, use 6 rounds or 15 s answers. Phones that pick quickly end the 15 s early, and the teacher can press *Skip (auto-pick)*.

1. **Lobby:** open `host.html` on the projector. It shows a 4-letter room code and a QR code. Students scan the QR code (or open `play.html` and type the code), then type a name and pick an animal. Names pop up on the big screen. To remove a name, click it.
   Settings: chaos rounds (4–12, default 8), answer time (15/20/30/45 s), planning time, and whether to show clues.
2. **Build your weekend (about 2 min):** each phone shows a Saturday/Sunday planner with 6 slots. A student taps a slot, picks one of 3 plan cards (🕒 timetable / 📅 arrangement / 💭 plan), and builds the sentence by **tapping word tiles in order**. The tiles include distractors in the wrong forms. A wrong answer gives a hint. After 2 wrong tries, the student sees the sentence to copy. When planning ends, any empty slots are filled automatically ("auto" plans that earn no points), so everyone starts with 6 plans.
3. **Chaos rounds:** the big screen shows a chaos event with a giant emoji, a short situation, and a cue (e.g. *Predict: it / rain*). Students build the sentence on their phones before the timer runs out.
   ✅ Right answer: plans are safe, plus points (faster answers score more).
   ❌ Wrong answer or ⏰ too slow: a plan is destroyed (💥 animation, marked CANCELLED).
   The phone shows the reason straight away (e.g. *You can SEE the clouds → be going to*). The round ends by itself once everyone has answered. Then the big screen reveals the answer, the tense, the reason, and right/wrong/slow counts.
4. **⚡ Chaos cards (sabotage):** after **every** round's reveal (including the last one, as a final twist before the podium), the **3 fastest correct players** of that round each get a chaos card 🃏. They choose a victim on their phone. If only 1 or 2 players were correct, only they attack. If **nobody** was correct (or there is nobody left with plans to hit), the chaos cards are skipped and *Next* goes straight to the next round.
   - **Every chaos card hits. There is no way to defend.** The target loses 1 plan (💥 animation) and the attacker gets +100. The target's phone shows who hit them ("🐵 Fiona hit you! 💥 You lost a plan!"), and the big screen shows every attacker ➜ target with **HIT (−1 plan)**.
   - A player can be **hit only once** per round. Once someone is targeted, they are greyed out ("Already hit by …") for the other attackers.
   - Players with **0 plans are not eliminated**. They show "😱 Weekend ruined!", keep answering, and can still win chaos cards. They can't be targeted, because they have nothing left to lose.
   - If an attacker doesn't choose within **15 s** (or the teacher presses *Skip*), a target is picked automatically (the player with the most plans left).
5. **Final:** "🏆 Who survived the weekend?" A podium shows the top 3, ranked by **most plans left**, with **points** as the tie-break. Below it is the full ranking and a 📊 class result for each tense, which is useful for planning the next lesson. Each phone shows its own rank. "Play again" keeps the same players and room.

**Teacher controls (top bar):** `Next ▶` (its label changes, e.g. *Start the chaos!*, *Round 4 ▶*, *⚡ Chaos cards! ▶*, *🏆 Results ▶*), `⏭ Stop timer`, `⏹ End` (jump to the leaderboard), 🔊 mute, ⛶ full screen. Keyboard: **N** or **→** = Next.

## Folder structure
```
future-tense-game/
├── site/                  ← THE GAME. Deploy only this folder's contents (static files).
│   ├── index.html         landing page (Join / Host buttons)
│   ├── host.html          teacher / projector page (the game "server")
│   ├── play.html          student phone page
│   ├── css/style.css      cartoon theme, phone and 1920×1080 projector layouts
│   ├── js/config.js       PeerJS settings (production = public PeerJS cloud), room-code prefix "flss-ftg-"
│   ├── js/content.js      ALL the English: 18 plan cards, 33 chaos situations
│   ├── js/host.js         game state machine, scoring, sabotage, reconnects, host screens
│   ├── js/player.js       phone screens, tile builder, auto-reconnect
│   ├── js/common.js       shared helpers (tile builder, confetti, avatars)
│   ├── js/sound.js        synthesised sound effects (no audio files), mute toggle
│   └── vendor/            peerjs.min.js 1.5.5, qrcode.js (qrcode-generator), both stored locally, so no CDN
├── dev/                   testing tools only (NOT needed for hosting)
│   ├── package.json       npm scripts: serve, peer, test, test:public
│   ├── test-game.mjs      full-game Playwright test (1 host + 6 phones)
│   ├── test-class.mjs     whole-class load test (1 host + 30 phones, host refresh, chaos cards)
│   └── test-webkit-ui.mjs Safari-engine (WebKit, iPhone 13) phone UI test
├── screenshots/           screenshots from the test runs
└── README.md
```
All paths are **relative**, so the game works at a sub-path such as `https://englishta-code.github.io/future-tense-game/`. The join link and QR code are built from the host page's real address (`new URL('play.html', location.href)`), never from `localhost`.

## Running it
**On a real web host (the plan: GitHub Pages).** Put the *contents* of `site/` at the root of the `future-tense-game` repo, or in `/docs`, and turn on Pages for that folder. Then:
- Teacher: `https://englishta-code.github.io/future-tense-game/host.html`
- Students: scan the QR code (it opens `…/play.html?code=ABCD`)

*(Nothing has been deployed or pushed.)*

**Locally on one computer (for trying it out):**
```bash
cd future-tense-game/dev && npm install      # one-off
npm run serve                                # http://localhost:8080/host.html
```
Open `host.html` in one window and `play.html` in other windows or private windows. This still uses the public PeerJS broker, so it needs internet.

**Fully offline test mode (local PeerJS server):**
```bash
cd future-tense-game/dev
npm run peer      # local PeerJS broker on :9000 (path /ftg)
npm run serve
# open http://localhost:8080/host.html?peer=local   (the QR/join link passes ?peer=local on to phones)
```
Production always uses the public broker. `?peer=local` is only a test switch: with it, the join link points to `localhost:9000` instead of the public PeerJS broker. Optional: `&peerHost=192.168.x.x&peerPort=9000` to test with phones on the same LAN.

## Tests (Playwright, headless)
```bash
cd dev
npm test              # full game, local PeerJS server, 1 host + 6 phones (Chromium, Pixel 7)
npm run test:public   # the same full game through the REAL public PeerJS cloud broker (production config)
npm run test:class    # 30 phones + host refresh + chaos cards (incl. the 15 s auto-pick)
npm run test:webkit   # Safari engine (WebKit) phone screens, iPhone 13
```
What `test-game.mjs` checks (152 checks): joining from the QR URL with the code prefilled, duplicate name rejected, wrong code says "not found", planning with tile taps (including a wrong try that shows a hint), a phone **reloading mid-planning** and keeping its plans, auto-fill, 8 chaos rounds with right/wrong/no answer (timer ends the round), a **late joiner** in round 2 who gets an auto weekend, a phone **tab killed and reopened** mid-round that rejoins by itself, a player **rejoining from a fresh browser with the same name** (takes over the old player, no duplicate), chaos cards after every round (7 of the 8 rounds; the round where nobody is correct is skipped automatically; a round with only 2 correct gives only 2 attackers; 3 fastest attackers, "Already hit" greying, a ruined player winning a chaos card, ruined targets greyed, **every card hits** with −1 plan, +100 for the attacker, "X hit you!" on the target's phone, and no blocking state or wording anywhere), plan counts matching on every phone after every round, leaderboard order, each phone's final rank, "Play again", and no JS errors.

## Editing the English
Everything is in `site/js/content.js`. Each item looks like this:
```js
{ id: 'c12', use: 'evidence', emoji: '⛈️', title: 'Look at those dark clouds!', text: 'The sky is black.',
  cue: 'Predict: it / rain', a: "It's|going to|rain.", d: 'will|raining|rains', why: 'You can SEE the clouds → be going to.' }
```
`a` = correct tiles in order, separated by `|`. `d` = distractor tiles. `use` is one of `offer, offerq, instant, promise, guess, evidence, plan, arrangement, timetable`, and it sets the clue badge and the tense.

## Limitations / things to know
- **Keep the host tab open and visible.** The host tab *is* the server. If it is refreshed or closed by accident, reopen `host.html` and click **Resume**: the game state is saved in that browser, and phones reconnect by themselves (tested: 30 phones back in about 2 s). Browsers slow down timers in background tabs, so put PowerPoint on a second screen rather than switching tabs.
- **Public PeerJS broker:** this is a free, shared service with no uptime guarantee. It is only needed for *connecting*. Once connected, the game data goes phone ↔ teacher PC directly. If the broker is down, nobody can join. Fallback: run your own PeerJS server (`npm run peer`, or a free hosted one) and set the host in `js/config.js`.
- **School Wi-Fi / firewalls:** WebRTC needs UDP or TURN. Networks with *client isolation* (phones can't see each other or the teacher PC) or UDP blocking will fall back to PeerJS's free TURN relay servers, if those are reachable. If students get stuck on "Joining…", try phones on mobile data, or ask IT to allow WebRTC (STUN/TURN on UDP 3478 / 19302). **Test once in the actual classroom before the lesson.**
- iOS Safari freezes pages when the phone is locked. When the phone wakes, the page reconnects with the same name and plans. If a student is away during a whole round, they are not punished. If they were connected during the round but didn't answer, they lose a plan.
- **Plans run out faster** now that chaos cards come every round (up to 3 hits per round). In a small group, many players may reach 0 plans by the end, and then **points decide the ranking**. With a full class of 25–30, the hits are spread out, so most players keep some plans. Use fewer rounds if too many weekends get ruined.
- Names are capped at 12 characters, with no profanity filter (the teacher can click a name to remove it). Maximum 40 players (`config.js`).
