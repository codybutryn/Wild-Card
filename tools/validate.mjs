/* Data checks for the GAMES table in index.html.

   Two of the three content bugs this repo opened with were arithmetic that
   nobody had multiplied out: a 6-player Hearts deal that could not divide,
   and a Speed setup that named three different splits in one sentence. The
   deal check below multiplies them out, so that class of bug fails here
   instead of at somebody's kitchen table.

   Run with: node tools/validate.mjs                                        */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const line = src.split('\n').find(l => l.startsWith('const GAMES = '));
if (!line) fail('could not find the GAMES table in index.html');
const GAMES = JSON.parse(line.replace(/^const GAMES = /, '').replace(/;\s*$/, ''));

const CATS = ['trick', 'rummy', 'shedding', 'speed', 'casino', 'party', 'kids', 'solitaire'];
const DECK = 52;

const errors = [];
const err = m => errors.push(m);
function fail(m) { console.error('validate: ' + m); process.exit(1); }

/* --- structure ---------------------------------------------------------- */
const seenId = new Map(), seenName = new Map();
for (const g of GAMES) {
  const at = g.id || g.name || '(unnamed)';
  for (const k of ['id', 'name', 'cat', 'best', 'age', 'diff', 'needs', 'blurb'])
    if (g[k] === undefined || g[k] === '') err(`${at}: missing ${k}`);

  if (seenId.has(g.id)) err(`${at}: duplicate id`);
  seenId.set(g.id, true);
  const n = String(g.name).toLowerCase();
  if (seenName.has(n)) err(`${at}: duplicate name`);
  seenName.set(n, true);

  if (!CATS.includes(g.cat)) err(`${at}: unknown category "${g.cat}"`);
  if (![1, 2, 3].includes(g.diff)) err(`${at}: diff must be 1-3, got ${g.diff}`);
  if (!(g.age >= 3 && g.age <= 21)) err(`${at}: implausible age ${g.age}`);

  for (const k of ['players', 'time']) {
    const r = g[k];
    if (!Array.isArray(r) || r.length !== 2 || r.some(v => typeof v !== 'number'))
      err(`${at}: ${k} must be a [min, max] pair`);
    else if (r[0] > r[1]) err(`${at}: ${k} range is inverted (${r[0]}-${r[1]})`);
    else if (r[0] < 1) err(`${at}: ${k} minimum must be at least 1`);
  }

  if (!Array.isArray(g.sections) || !g.sections.length) err(`${at}: no rule sections`);
  else for (const s of g.sections)
    if (!s.h || !s.b) err(`${at}: a section is missing its heading or body`);

  if (!Array.isArray(g.tags) || !g.tags.length) err(`${at}: no tags`);
}

/* --- deal arithmetic ----------------------------------------------------
   Matches prose of the shape "With 6, remove the 2 of diamonds, 3 of
   diamonds, 2 of clubs, and 2 of spades (8 each)" and checks that the cards
   left actually divide evenly into the hands claimed.                     */
const DEAL = /With (\d+)[^.]*?remove ([^()]*?)\((\d+) each\)/g;

for (const g of GAMES) {
  for (const s of g.sections) {
    for (const m of s.b.matchAll(DEAL)) {
      const players = +m[1], perHand = +m[3];
      const removed = m[2].split(/,\s*|\s+and\s+/).filter(p => /\d/.test(p)).length;
      const left = DECK - removed;
      if (left !== players * perHand)
        err(`${g.name} [${s.h}]: removing ${removed} card(s) leaves ${left}, `
          + `which is not ${players} x ${perHand}`);
    }
  }
}

/* --- tableau + stock ----------------------------------------------------
   A layout that deals N cards and calls the rest "the remaining M" has to
   add up to the deck. TriPeaks shipped claiming 23 in the stock behind a
   28-card tableau, which is 51 cards. Deliberately narrow: only single
   52-card-deck games that state exactly one of each number, which is why it
   has no false positives to suppress. */
for (const g of GAMES) {
  if (!/^1 standard 52-card deck/.test(g.needs)) continue;
  const prose = g.sections.map(s => s.b).join(' ');
  const deal = [...prose.matchAll(/\bDeal (\d+) cards\b/g)].map(m => +m[1]);
  const rest = [...prose.matchAll(/\bremaining (\d+) cards\b/g)].map(m => +m[1]);
  if (deal.length !== 1 || rest.length !== 1) continue;
  if (deal[0] + rest[0] !== DECK)
    err(`${g.id}: deals ${deal[0]} and calls ${rest[0]} the remainder, `
      + `which is ${deal[0] + rest[0]} cards, not ${DECK}`);
}

/* --- score config -------------------------------------------------------
   The pad drives off these, so a wrong target silently mis-scores a real
   game. Cross-check it against the number the rules text already states. */
const DIRS = ['low', 'high'], UNITS = ['player', 'team'];

for (const g of GAMES) {
  const sc = g.score;
  if (!sc) continue;
  const at = g.id;

  if (!Number.isInteger(sc.to) || sc.to < 1)
    err(`${at}: score.to must be a positive whole number, got ${sc.to}`);
  if (sc.dir !== undefined && !DIRS.includes(sc.dir))
    err(`${at}: score.dir must be one of ${DIRS.join('/')}, got "${sc.dir}"`);
  if (sc.unit !== undefined && !UNITS.includes(sc.unit))
    err(`${at}: score.unit must be one of ${UNITS.join('/')}, got "${sc.unit}"`);
  if (sc.note !== undefined && (typeof sc.note !== 'string' || !sc.note.trim()))
    err(`${at}: score.note is present but empty`);

  // does the target match what the rules actually say?
  const prose = g.sections.map(s => s.h + ' ' + s.b).join(' ');
  const m = prose.match(/(?:first(?:\s+(?:team|player|partnership))?\s+to|reach(?:es)?|hits)\s+(\d{2,3})\b/i);
  if (m && +m[1] !== sc.to)
    err(`${at}: score.to is ${sc.to} but the rules say ${m[1]}`);

  if (sc.unit === 'team' && g.players[1] < 2)
    err(`${at}: scored by teams but seats fewer than 2`);
}

/* --- cross-references ---------------------------------------------------
   A rule that names a specific card must not name one the setup removed.  */
const hearts = GAMES.find(g => g.id === 'hearts');
if (hearts) {
  const setup = hearts.sections.find(s => s.h === 'Setup')?.b || '';
  const play = hearts.sections.find(s => s.h === 'Play')?.b || '';
  if (/remove[^.]*2 of clubs/.test(setup) && /holds the 2 of clubs leads/.test(play))
    err('Hearts: Setup strips the 2 of clubs but Play still names it as the lead');
}

/* --- report ------------------------------------------------------------- */
if (errors.length) {
  console.error(`validate: ${errors.length} problem(s) in ${GAMES.length} games\n`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(`validate: ${GAMES.length} games OK `
  + `(${GAMES.reduce((a, g) => a + g.sections.length, 0)} rule sections)`);
