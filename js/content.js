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
    guess:       { clue: '🤔 Guess (I think…)',    tense: 'will' },
    evidence:    { clue: '👀 You can SEE it',      tense: 'going' },
    plan:        { clue: '💭 Plan (decided before)', tense: 'going' },
    arrangement: { clue: '📅 Arranged with people', tense: 'pcont' },
    timetable:   { clue: '🕒 Timetable',           tense: 'psimp' }
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

  /* ---------------- PHASE 2: chaos situations (33) ---------------- */
  var SITUATIONS = [
    // ---- will: offers, instant decisions, promises, guesses ----
    { id: 'c01', use: 'offer',   emoji: '🛍️', title: 'Bags everywhere!',   text: 'Your friend drops her shopping bags.',  cue: 'Offer: I / help / you',                 a: 'I\'ll|help|you.',                 d: 'I\'m going to|I help|helping',      why: 'You offer help NOW → will. I\'ll help you.' },
    { id: 'c02', use: 'instant', emoji: '🪫', title: 'Battery 1%!',        text: 'Your phone is dying!',                   cue: 'Decide now: I / charge / it / now',     a: 'I\'ll|charge|it|now.',            d: 'I\'m charging|I charge|am going to', why: 'You decide at this moment → will.' },
    { id: 'c03', use: 'offer',   emoji: '🥶', title: 'Brrr! So cold!',     text: 'Your little brother is cold.',           cue: 'Offer: I / close / the window',         a: 'I\'ll|close|the window.',         d: 'I\'m closing|I close|going to',     why: 'An offer you decide now → will.' },
    { id: 'c04', use: 'promise', emoji: '📕', title: 'You lost her book!', text: 'Your friend is sad. You lost her book.', cue: 'Promise: I / buy / you / a new one',    a: 'I\'ll|buy|you|a new one.',        d: 'I\'m buying|I buy|going to',        why: 'A promise → will. I\'ll buy you a new one.' },
    { id: 'c05', use: 'guess',   emoji: '🏆', title: 'Big match tomorrow!', text: 'Your team plays tomorrow. Make a guess.', cue: 'Guess: I think / we / win',            a: 'I think|we\'ll|win.',             d: 'we\'re winning|we win|are going to', why: 'A guess with "I think" → will.' },
    { id: 'c06', use: 'offerq',  emoji: '📦', title: 'Heavy box!',         text: 'Your teacher has a very heavy box.',     cue: 'Offer as a question: I / carry / it?',  a: 'Shall|I|carry|it?',               d: 'Am|Will|carrying|Do',               why: 'An offer as a question → Shall I…?' },
    { id: 'c07', use: 'instant', emoji: '🍕', title: 'Pizza or noodles?',  text: 'The waiter is waiting. Choose now!',     cue: 'Decide now: I / have / the pizza',      a: 'I\'ll|have|the pizza.',           d: 'I\'m going to|I have|having',       why: 'You decide right now → will.' },
    { id: 'c08', use: 'offer',   emoji: '🔔', title: 'Ding dong!',         text: 'Someone is at the door. Mum is busy.',   cue: 'Offer: I / open / the door',            a: 'I\'ll|open|the door.',            d: 'I\'m opening|I open|am going to',   why: 'An offer you decide now → will.' },
    { id: 'c09', use: 'offer',   emoji: '☔', title: 'No umbrella!',       text: 'It\'s raining. Your friend has no umbrella.', cue: 'Offer: I / lend / you / my umbrella', a: 'I\'ll|lend|you|my umbrella.',   d: 'I\'m lending|I lend|going to',      why: 'An offer → will. I\'ll lend you my umbrella.' },
    { id: 'c10', use: 'promise', emoji: '📚', title: 'Homework!',          text: 'Teacher: Don\'t forget your homework!',  cue: 'Promise: I / not / forget',             a: 'I|won\'t|forget.',                d: 'don\'t|am not|forgets',             why: 'A promise → will. Negative: won\'t (= will not).' },
    { id: 'c11', use: 'offer',   emoji: '🥵', title: 'So hot!',            text: 'Mum says: It\'s so hot in here!',        cue: 'Offer: I / turn on / the fan',          a: 'I\'ll|turn on|the fan.',          d: 'I\'m turning on|I turn on|going to', why: 'An offer you decide now → will.' },
    // ---- be going to: predictions from evidence ----
    { id: 'c12', use: 'evidence', emoji: '⛈️', title: 'Look at those dark clouds!', text: 'The sky is black.',             cue: 'Predict: it / rain',                    a: 'It\'s|going to|rain.',            d: 'will|raining|rains',                why: 'You can SEE the clouds → be going to.' },
    { id: 'c13', use: 'evidence', emoji: '⚽', title: 'GOAL?!',            text: 'The goalkeeper falls. The ball is flying!', cue: 'Predict: they / score',               a: 'They\'re|going to|score!',        d: 'will|scoring|scores',               why: 'You can SEE it happening → be going to.' },
    { id: 'c14', use: 'evidence', emoji: '🥤', title: 'Watch out!',        text: 'Tom is carrying ten cups. He trips!',    cue: 'Predict: he / drop / them',             a: 'He\'s|going to|drop|them!',       d: 'will|dropping|drops',               why: 'You can SEE him trip → be going to.' },
    { id: 'c15', use: 'evidence', emoji: '🚪', title: 'The doors are closing!', text: 'You are running. The bus doors are closing.', cue: 'Predict: I / miss / the bus',    a: 'I\'m|going to|miss|the bus!',     d: 'will|missing|misses',               why: 'You can SEE the doors closing → be going to.' },
    { id: 'c16', use: 'evidence', emoji: '🍳', title: 'Smoke!',            text: 'Smoke is coming from the pan!',          cue: 'Predict: the eggs / burn',              a: 'The eggs|are|going to|burn!',     d: 'will|burning|burns|is',             why: 'You can SEE the smoke → be going to.' },
    { id: 'c17', use: 'evidence', emoji: '⏰', title: 'It\'s 9:58!',        text: 'School starts at 10:00. You are still at home!', cue: 'Predict: I / be / late',        a: 'I\'m|going to|be|late!',          d: 'will|being|was',                    why: 'You can SEE the clock → be going to.' },
    { id: 'c18', use: 'evidence', emoji: '🤢', title: 'Uh-oh…',            text: 'Your friend is very pale. She holds her stomach.', cue: 'Predict: she / be sick',      a: 'She\'s|going to|be sick.',        d: 'will|being|is',                     why: 'You can SEE she looks ill → be going to.' },
    // ---- be going to: plans & intentions ----
    { id: 'c19', use: 'plan', emoji: '💰', title: '$500 from Grandma!',   text: 'Grandma gives you $500. What\'s your plan?', cue: 'Plan: I / buy / new shoes',          a: 'I\'m|going to|buy|new shoes.',    d: 'will|buying|buys',                  why: 'Your PLAN (decided before) → be going to.' },
    { id: 'c20', use: 'plan', emoji: '🎂', title: 'Mum\'s birthday!',     text: 'Mum\'s birthday is next week. What\'s your plan?', cue: 'Plan: I / bake / a cake',       a: 'I\'m|going to|bake|a cake.',      d: 'will|baking|bakes',                 why: 'Your PLAN (decided before) → be going to.' },
    { id: 'c21', use: 'plan', emoji: '📝', title: 'Test on Monday!',      text: 'Dad asks about your weekend plan.',      cue: 'Plan: I / study / all weekend',         a: 'I\'m|going to|study|all weekend.', d: 'will|studying|studies',            why: 'Your PLAN (decided before) → be going to.' },
    // ---- present continuous: arrangements ----
    { id: 'c22', use: 'arrangement', emoji: '👩', title: 'Mum asks about your plans', text: 'Mum: What are you doing on Saturday?', cue: 'I / meet / Amy / at 2:00',        a: 'I\'m|meeting|Amy|at 2:00.',       d: 'will meet|meets|to meet',           why: 'You ARRANGED to meet Amy → present continuous.' },
    { id: 'c23', use: 'arrangement', emoji: '🦷', title: 'Football at 4?', text: 'Your friend: Let\'s play football at 4:00!', cue: 'Say no: Sorry, I / see / the dentist / at 4:00', a: 'Sorry,|I\'m|seeing|the dentist|at 4:00.', d: 'I\'ll see|I see|sees', why: 'A fixed appointment → present continuous.' },
    { id: 'c24', use: 'arrangement', emoji: '🏖️', title: 'Free on Sunday?', text: 'Your cousin asks: Are you free on Sunday?', cue: 'we / have / a barbecue / in Sai Kung', a: 'We\'re|having|a barbecue|in Sai Kung.', d: 'will have|have|has', why: 'The barbecue is ARRANGED → present continuous.' },
    { id: 'c25', use: 'arrangement', emoji: '🏸', title: 'Where are you going?', text: 'Dad: Why are you taking your racket?', cue: 'I / play / badminton / with Ken / at 7:00', a: 'I\'m|playing|badminton|with Ken|at 7:00.', d: 'will play|play|plays', why: 'You ARRANGED it with Ken → present continuous.' },
    { id: 'c26', use: 'arrangement', emoji: '☎️', title: 'Grandpa calls!',  text: 'Grandpa: Is anyone coming on Sunday?',   cue: 'Aunt May / visit / us / on Sunday',     a: 'Aunt May|is|visiting|us|on Sunday.', d: 'will visit|visit|are',            why: 'The visit is ARRANGED → present continuous.' },
    { id: 'c27', use: 'arrangement', emoji: '💇', title: 'Shopping at 10?', text: 'Your friend: Let\'s go shopping at 10:00!', cue: 'Say no: Sorry, I / get / a haircut / at 10:00', a: 'Sorry,|I\'m|getting|a haircut|at 10:00.', d: 'I\'ll get|I get|gets', why: 'A fixed appointment → present continuous.' },
    // ---- present simple: timetables ----
    { id: 'c28', use: 'timetable', emoji: '🚇', title: 'The MTR is delayed!', text: 'Your friend is worried. When is the next train?', cue: 'the next train / leave / 3:15', a: 'The next train|leaves|at 3:15.', d: 'is leaving|will leave|leave', why: 'A train TIMETABLE → present simple: leaves.' },
    { id: 'c29', use: 'timetable', emoji: '🎬', title: 'Hurry up!',        text: 'Your friend is so slow! Movie time!',    cue: 'the movie / start / 7:30',              a: 'The movie|starts|at 7:30.',       d: 'is starting|will start|start',      why: 'Cinema TIMETABLE → present simple: starts.' },
    { id: 'c30', use: 'timetable', emoji: '⛴️', title: 'Trip to Cheung Chau!', text: 'When is the ferry?',                  cue: 'the ferry / leave / 11:00',             a: 'The ferry|leaves|at 11:00.',      d: 'is leaving|will leave|leave',       why: 'Ferry TIMETABLE → present simple: leaves.' },
    { id: 'c31', use: 'timetable', emoji: '🏊', title: 'Swim time?',       text: 'It\'s 8:30. Is the pool open?',           cue: 'the pool / open / 9:00',                a: 'The pool|opens|at 9:00.',         d: 'is opening|will open|open',         why: 'Opening hours are a SCHEDULE → present simple.' },
    { id: 'c32', use: 'timetable', emoji: '🍔', title: 'Midnight snack?',  text: 'You want to go to the shop at midnight.', cue: 'the shop / close / 11:00',              a: 'The shop|closes|at 11:00.',       d: 'is closing|will close|close',       why: 'Opening hours are a SCHEDULE → present simple.' },
    { id: 'c33', use: 'timetable', emoji: '🚌', title: 'Where is the bus?', text: 'Your friend asks: When does the bus come?', cue: 'the bus / arrive / 4:20',            a: 'The bus|arrives|at 4:20.',        d: 'is arriving|will arrive|arrive',    why: 'Bus TIMETABLE → present simple: arrives.' }
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
