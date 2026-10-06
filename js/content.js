/* =========================================================================
   Plan Your Weekend, Survive the Chaos! — GAME CONTENT
   Grammar follows the S3E worksheet (Section 5: Future Tenses):
     Future simple   will + inf      : instant decisions, offers, promises, guesses (I think...)
                     shall I/we ...? : offers in questions
     be going to     am/is/are going to + inf : plans & intentions, predictions from present evidence
     Present continuous  am/is/are + -ing      : fixed arrangements
     Present simple      inf / inf+s/es        : timetables and schedules
   Tile format:  a = correct tiles in order, separated by |
                 d = distractor tiles (wrong forms), separated by |
   The correct sentence = the 'a' tiles joined with spaces.
   ========================================================================= */
(function () {
  'use strict';

  var TENSES = {
    will:  { name: 'Future simple (will)', short: 'will + verb', form: 'will / won\'t + verb', color: '#ff6b6b' },
    going: { name: 'be going to', short: 'be going to + verb', form: 'am / is / are going to + verb', color: '#4dabf7' },
    pcont: { name: 'Present continuous', short: 'am/is/are + -ing', form: 'am / is / are + verb-ing', color: '#40c057' },
    psimp: { name: 'Present simple', short: 'verb / verb + s', form: 'verb / verb + s / es', color: '#fab005' }
  };

  // Clue badges (shown when "hints" are on)
  var USES = {
    offer:       { clue: '🙋 Offer',               tense: 'will' },
    offerq:      { clue: '🙋 Offer (question)',    tense: 'will' },
    instant:     { clue: '⚡ Decide NOW',           tense: 'will' },
    promise:     { clue: '🤞 Promise',             tense: 'will' },
    guess:       { clue: '🔮 Guess (I think…)',    tense: 'will' },
    evidence:    { clue: '👀 You can SEE it',      tense: 'going' },
    plan:        { clue: '💭 Plan (decided before)', tense: 'going' },
    arrangement: { clue: '💬 Arranged with people', tense: 'pcont' },
    timetable:   { clue: '🎟️ Timetable',           tense: 'psimp' }
  };

  /* ---------------- PHASE 1: weekend plan cards ---------------- */
  var PLAN_CARDS = [
    // Timetables -> present simple
    { id: 'p-movie',   use: 'timetable', emoji: '🎬', label: 'Movie',               cue: 'the movie / start / 10:00',      a: 'The movie|starts|at 10:00.',            d: 'is starting|will start|start' },
    { id: 'p-bus',     use: 'timetable', emoji: '🚌', label: 'Bus to Tai Po',       cue: 'the bus / leave / 9:30',         a: 'The bus|leaves|at 9:30.',               d: 'is leaving|will leave|leave' },
    { id: 'p-ferry',   use: 'timetable', emoji: '⛴️', label: 'Ferry to Cheung Chau', cue: 'the ferry / leave / 11:15',      a: 'The ferry|leaves|at 11:15.',            d: 'is leaving|will leave|leave' },
    { id: 'p-swim',    use: 'timetable', emoji: '🏊', label: 'Swimming class',      cue: 'my swimming class / start / 4:00', a: 'My swimming class|starts|at 4:00.',   d: 'is starting|will start|start' },
    { id: 'p-concert', use: 'timetable', emoji: '🎤', label: 'Concert',             cue: 'the concert / begin / 8:00',     a: 'The concert|begins|at 8:00.',           d: 'is beginning|will begin|begin' },
    { id: 'p-park',    use: 'timetable', emoji: '🎢', label: 'Ocean Park',          cue: 'Ocean Park / open / 10:00',      a: 'Ocean Park|opens|at 10:00.',            d: 'is opening|will open|open' },
    // Arrangements -> present continuous
    { id: 'p-amy',     use: 'arrangement', emoji: '👭', label: 'Meet Amy',          cue: 'I / meet / Amy / at 2:00',       a: 'I\'m|meeting|Amy|at 2:00.',             d: 'will meet|meets|to meet' },
    { id: 'p-badm',    use: 'arrangement', emoji: '🏸', label: 'Badminton with Ken', cue: 'I / play / badminton / with Ken', a: 'I\'m|playing|badminton|with Ken.',     d: 'will play|play|plays' },
    { id: 'p-dimsum',  use: 'arrangement', emoji: '🥟', label: 'Dim sum with Grandpa', cue: 'we / have / dim sum / with Grandpa', a: 'We\'re|having|dim sum|with Grandpa.', d: 'will have|have|has' },
    { id: 'p-dentist', use: 'arrangement', emoji: '🦷', label: 'Dentist',           cue: 'I / see / the dentist / at 11:00', a: 'I\'m|seeing|the dentist|at 11:00.',   d: 'will see|see|sees' },
    { id: 'p-bbq',     use: 'arrangement', emoji: '🍖', label: 'Barbecue in Sai Kung', cue: 'we / have / a barbecue / in Sai Kung', a: 'We\'re|having|a barbecue|in Sai Kung.', d: 'will have|have|has' },
    { id: 'p-film',    use: 'arrangement', emoji: '🍿', label: 'Film with Jason',   cue: 'I / watch / a film / with Jason', a: 'I\'m|watching|a film|with Jason.',     d: 'will watch|watch|watches' },
    // Intentions -> be going to
    { id: 'p-grandma', use: 'plan', emoji: '👵', label: 'Visit Grandma',            cue: 'I / visit / Grandma',            a: 'I\'m|going to|visit|Grandma.',          d: 'will|visiting|visits' },
    { id: 'p-clean',   use: 'plan', emoji: '🧹', label: 'Clean my room',            cue: 'I / clean / my room',            a: 'I\'m|going to|clean|my room.',          d: 'will|cleaning|cleans' },
    { id: 'p-comics',  use: 'plan', emoji: '📖', label: 'Read comics',              cue: 'I / read / some comics',         a: 'I\'m|going to|read|some comics.',       d: 'will|reading|reads' },
    { id: 'p-games',   use: 'plan', emoji: '🎮', label: 'Play video games',         cue: 'I / play / video games',         a: 'I\'m|going to|play|video games.',       d: 'will|playing|plays' },
    { id: 'p-cookies', use: 'plan', emoji: '🍪', label: 'Bake cookies',             cue: 'I / bake / cookies',             a: 'I\'m|going to|bake|cookies.',           d: 'will|baking|bakes' },
    { id: 'p-hw',      use: 'plan', emoji: '📝', label: 'Do my homework',           cue: 'I / do / my homework',           a: 'I\'m|going to|do|my homework.',         d: 'will|doing|does' }
  ];

  var PLAN_WHY = {
    timetable:   'It\'s a TIMETABLE → present simple (starts / leaves / opens).',
    arrangement: 'You ARRANGED it with people → present continuous (I\'m meeting…).',
    plan:        'It\'s your PLAN (you decided before) → be going to.'
  };

  /* ---------------- PHASE 2: chaos situations (8 = 2 per tense; teacher's list, Oct 2026) ---------------- */
  var SITUATIONS = [
    // ---- will: promise / decide now ----
    { id: 'c01', use: 'promise',     emoji: '🐶', title: 'Your dog eats your concert ticket!', text: 'Oh no! Make a promise.',           cue: 'Promise: I / buy / a new one',                 a: 'I\'ll|buy|a new one.',                         d: 'I\'m buying|I buy|I\'m going to',       why: 'A promise → will. I\'ll buy a new one.' },
    { id: 'c02', use: 'instant',     emoji: '🌀', title: 'Typhoon signal 8! Ocean Park is closed.', text: 'What now? Decide now!',      cue: 'Decide now: I / stay home / and play games',   a: 'I\'ll|stay home|and play games.',              d: 'I\'m staying home|I stay home|I\'m going to', why: 'You decide at this moment → will. I\'ll stay home.' },
    // ---- be going to: evidence ----
    { id: 'c03', use: 'evidence',    emoji: '⛈️', title: 'Black clouds over your barbecue!', text: 'Look at the sky!',                  cue: 'Predict: it / rain',                           a: 'It\'s|going to|rain!',                         d: 'It\'ll|raining|rains',                  why: 'You can SEE the clouds → be going to.' },
    { id: 'c04', use: 'evidence',    emoji: '🚌', title: 'The bus doors are closing!', text: 'You are still running!',                  cue: 'Predict: I / miss / the bus',                  a: 'I\'m|going to|miss|the bus!',                  d: 'I\'ll|missing|misses',                  why: 'You can SEE the doors closing → be going to.' },
    // ---- present continuous: arrangement clash ----
    { id: 'c05', use: 'arrangement', emoji: '😱', title: 'Teacher: "Extra lesson on Saturday at 2:00!"', text: 'But you have plans. Say sorry!', cue: 'Sorry, I / meet / Amy / at 2:00',        a: 'Sorry,|I\'m|meeting|Amy|at 2:00.',             d: 'I\'ll|meet|I meet',                     why: 'You ARRANGED it with Amy → present continuous: I\'m meeting.' },
    { id: 'c06', use: 'arrangement', emoji: '🎉', title: 'Grandma wants you at her party on Sunday!', text: 'But your family has plans. Say sorry!', cue: 'Sorry, we / have / a barbecue / in Sai Kung', a: 'Sorry,|we\'re|having|a barbecue|in Sai Kung.', d: 'we\'ll|have|we have',                why: 'Your family ARRANGED it → present continuous: we\'re having.' },
    // ---- present simple: timetables ----
    { id: 'c07', use: 'timetable',   emoji: '🚇', title: 'The MTR breaks down!', text: 'When is the next train?',                       cue: 'the next train / leave / 3:15',                a: 'The next train|leaves|at 3:15.',               d: 'is leaving|will leave|leave',           why: 'A train TIMETABLE → present simple: leaves.' },
    { id: 'c08', use: 'timetable',   emoji: '⛴️', title: 'It\'s 11:25 p.m. on Cheung Chau!', text: 'When is the last ferry?',          cue: 'the last ferry / leave / 11:30',               a: 'The last ferry|leaves|at 11:30!',              d: 'is leaving|will leave|leave',           why: 'A ferry TIMETABLE → present simple: leaves.' }
  ];

  function split(s) { return s ? s.split('|') : []; }
  function answerOf(item) { return split(item.a).join(' '); }
  function norm(s) {
    return String(s).replace(/[’‘]/g, '\'').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  /* tiles: array of tile texts chosen by the player, in order */
  function check(item, tiles) {
    return norm((tiles || []).join(' ')) === norm(answerOf(item));
  }
  function tileSet(item) {
    var t = split(item.a).concat(split(item.d));
    return t.map(function (text, i) { return { id: item.id + '-' + i, text: text }; });
  }
  function tenseOf(item) { return USES[item.use].tense; }

  var byId = {};
  PLAN_CARDS.concat(SITUATIONS).forEach(function (x) { byId[x.id] = x; });

  window.FTG_CONTENT = {
    TENSES: TENSES, USES: USES, PLAN_CARDS: PLAN_CARDS, PLAN_WHY: PLAN_WHY,
    SITUATIONS: SITUATIONS,
    get: function (id) { return byId[id]; },
    answerOf: answerOf, check: check, tileSet: tileSet, tenseOf: tenseOf, split: split
  };
})();
