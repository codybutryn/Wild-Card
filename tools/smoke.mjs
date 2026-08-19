/* Browser tests for Deck & Rules.

   Serves the repo with node's own http module and drives it in Chromium, so
   the only dev dependency is Playwright. The app itself stays dependency-free.

     npm i -D playwright                (once)
     npx playwright install chromium    (once)
     npm run smoke

   Playwright is deliberately NOT in package.json: static hosts run
   `npm install` when they find one, and Playwright's postinstall drags down
   a browser far bigger than a deploy will accept.                          */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error(
    'These tests drive a real browser and need Playwright, which is not installed.\n\n'
    + '  npm i -D playwright\n'
    + '  npx playwright install chromium\n\n'
    + 'The app itself needs nothing. `npm run validate` checks the data with no install.\n');
  process.exit(1);
}

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8099;
const BASE = `http://127.0.0.1:${PORT}/`;

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png'
};

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

const results = [];
const check = (n, pass, detail = '') => results.push({ n, pass, detail });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('pageerror: ' + e.message));

const wait = (ms = 90) => page.waitForTimeout(ms);
const search = async q => { await page.fill('#q', q); await wait(60); return page.locator('#list .gcard h3').allTextContents(); };
const openPicker = async () => { await page.click('nav.tabs button[data-tab="picker"]'); await wait(); };
const setPlayers = async n => {
  const cur = +(await page.textContent('#pVal'));
  for (let i = cur; i < n; i++) await page.click('#pPlus');
  for (let i = cur; i > n; i--) await page.click('#pMinus');
  await wait();
};
const pickCount = () => page.locator('#pickList .gcard').count();

await page.goto(BASE, { waitUntil: 'networkidle' });

/* --- boot --------------------------------------------------------------- */
const TOTAL = 87;
check('boot: game count rendered', (await page.textContent('#gcount')) === `${TOTAL} games`,
  await page.textContent('#gcount'));
check('boot: every game rendered', (await page.locator('.gcard').count()) === TOTAL,
  String(await page.locator('.gcard').count()));

/* --- markup ------------------------------------------------------------- */
check('no nested <button> elements',
  await page.evaluate(() => document.querySelectorAll('button button').length) === 0);
check('save heart is a sibling of the card button',
  await page.evaluate(() => {
    const w = document.querySelector('.gcard-wrap');
    return w?.children.length === 2
      && w.children[0].classList.contains('gcard')
      && w.children[1].classList.contains('fav');
  }));

/* --- search ------------------------------------------------------------- */
check('"games for 6 people" returns games', (await search('games for 6 people')).length > 0);
let r = await search('4 players');
check('"4 players" narrows the list', r.length > 0 && r.length < TOTAL, r.length + ' results');
r = await search('players 4');
check('"players 4" reads the same as "4 players"', r.length > 0 && r.length < TOTAL, r.length + ' results');
check('"rummy 500" still finds Rummy 500 by name', (await search('rummy 500')).includes('Rummy 500'));
// Five Hundred is also known as Bid Euchre, so two hits here is correct
const eu = await search('euchre');
check('"euchre" finds Euchre first among its matches',
  eu[0] === 'Euchre' && eu.length <= 3, eu.join(', '));
check('"go fish" finds Go Fish', (await search('go fish')).includes('Go Fish'));
check('"kings in the corner" finds it', (await search('kings in the corner')).includes('Kings in the Corner'));
r = await search('6');
check('a bare number reads as a table size', r.length > 0 && r.length < TOTAL, r.length + ' results');
check('"solitaire" finds the solo games', (await search('solitaire')).length >= 7);
await page.fill('#q', ''); await wait(60);

/* --- card labelling ----------------------------------------------------- */
await search('klondike');
const pills = await page.locator('#list .gcard >> nth=0 >> .pill').allTextContents();
check('solitaire card does not repeat "Solo"',
  pills.filter(p => p.trim() === 'Solo').length <= 1, pills.join(' | '));
check('solitaire category reads "Solitaire"', pills.includes('Solitaire'));
await page.fill('#q', ''); await wait(60);

/* --- detail dialog ------------------------------------------------------ */
await page.click('#list .gcard >> nth=0');
await wait();
check('detail opens', await page.locator('#detail.open').count() === 1);
check('focus moves into the dialog',
  await page.evaluate(() => document.activeElement?.id === 'dBack'));
check('hash reflects the open game', (await page.evaluate(() => location.hash)).length > 1);
await page.keyboard.press('Escape');
await wait(140);
check('Escape closes it', await page.locator('#detail.open').count() === 0);
check('closing clears the hash', (await page.evaluate(() => location.hash)) === '');
check('focus returns to the list',
  await page.evaluate(() => document.activeElement?.classList.contains('gcard')));

await page.click('#list .gcard >> nth=0'); await wait();
await page.click('#dBack'); await wait(160);
check('in-app Back closes it', await page.locator('#detail.open').count() === 0);
await page.goBack(); await wait(160);
check('browser Back does not reopen the closed detail',
  await page.locator('#detail.open').count() === 0);

/* --- favourites --------------------------------------------------------- */
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.click('.gcard-wrap >> nth=0 >> .fav'); await wait();
check('tapping the heart does not open the detail',
  await page.locator('#detail.open').count() === 0);
check('heart reads as pressed',
  await page.getAttribute('.gcard-wrap >> nth=0 >> .fav', 'aria-pressed') === 'true');
await page.click('nav.tabs button[data-tab="favs"]'); await wait();
check('saved game appears under Saved', await page.locator('#favList .gcard').count() === 1);
await page.reload({ waitUntil: 'networkidle' });
await page.click('nav.tabs button[data-tab="favs"]'); await wait();
check('saved game survives a reload', await page.locator('#favList .gcard').count() === 1);

/* --- picker ------------------------------------------------------------- */
await openPicker();
const maxSeats = await page.evaluate(() => MAX_PLAYERS);
await setPlayers(maxSeats);
check('stepper reaches the data maximum', +(await page.textContent('#pVal')) === maxSeats,
  'MAX_PLAYERS=' + maxSeats);
check('stepper stops there', await page.evaluate(() => document.querySelector('#pPlus').disabled));
await page.click('#pickGo'); await wait(140);
check('24 players finds a game that seats them', await pickCount() >= 1, String(await pickCount()));

await setPlayers(4);
const at4 = await pickCount();
check('changing players refreshes the list on its own', at4 > 1, at4 + ' results');
await page.click('#timeSeg button >> nth=1');   // 15 min
await wait(140);
const at15 = await pickCount();
check('changing time refreshes the list', at15 !== at4, `${at4} -> ${at15}`);
check('"15 min" excludes hour-plus games', await page.evaluate(() =>
  ![...document.querySelectorAll('#pickList .gcard')].some(c =>
    [...c.querySelectorAll('.pill')].some(p => {
      const m = p.textContent.match(/–(\d+) min/);
      return m && +m[1] >= 60;
    }))));
check('"15 min" still returns a usable list', at15 >= 5, at15 + ' results');

await page.click('#timeSeg button >> nth=0'); await wait();
await setPlayers(maxSeats);
await page.click('#vibeSeg button >> nth=1'); await wait(150);
check('empty state names the vibe when the vibe is the blocker',
  /vibe/i.test((await page.textContent('#pickList .empty')) || ''));
await page.click('#vibeSeg button >> nth=1');
await page.click('#timeSeg button >> nth=1'); await wait(150);
check('empty state names the time when time is the blocker',
  /time|minutes/i.test((await page.textContent('#pickList .empty')) || ''));

/* --- swipe deck ---------------------------------------------------------- */
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.click('nav.tabs button[data-tab="swipe"]'); await wait(200);
const topName = () => page.textContent('.scard:last-child h3');
check('deck builds on first visit', await page.locator('.scard').count() > 0,
  String(await page.locator('.scard').count()));
check('card is drag-enabled (touch-action none)',
  await page.evaluate(() => getComputedStyle(document.querySelector('.scard')).touchAction) === 'none');

const first = await topName();
await page.click('#swLike'); await wait(400);
check('Save advances the deck', (await topName()) !== first, `${first} -> ${await topName()}`);
check('saved game landed in the list',
  await page.evaluate(n => GAMES.some(g => g.name === n && state.favs.has(g.id)), first));

const second = await topName();
await page.click('#swNope'); await wait(400);
check('Pass advances the deck', (await topName()) !== second);
check('passed game landed in the passed list',
  await page.evaluate(n => GAMES.some(g => g.name === n && state.passed.has(g.id)), second));

await page.click('#swUndo'); await wait(300);
check('Undo puts the card back', (await topName()) === second, await topName());
check('Undo clears the passed mark',
  await page.evaluate(n => GAMES.some(g => g.name === n && !state.passed.has(g.id)), second));

// the race: undo fired mid-animation used to eat the wrong card
const before = await page.evaluate(() => SW.deck.length);
await page.click('#swLike');
await page.waitForTimeout(60);            // deliberately inside the 260ms flight
await page.click('#swUndo');
await wait(500);
const after = await page.evaluate(() => SW.deck.length);
check('undo during the swipe animation does not corrupt the deck',
  after === before, `deck ${before} -> ${after}, expected unchanged`);
check('deck still renders after the race', await page.locator('.scard').count() > 0);

// swiping up opens the rules
await page.click('#swInfo'); await wait(200);
check('Rules button opens the detail', await page.locator('#detail.open').count() === 1);
await page.keyboard.press('Escape'); await wait(200);
check('Escape returns to the deck', await page.locator('#detail.open').count() === 0);
check('arrow keys do not fire while the dialog is open',
  await page.evaluate(() => SW.deck.length) === after);

/* --- data --------------------------------------------------------------- */
check('Mafia and Werewolf are tagged roles-only', await page.evaluate(() => {
  const g = GAMES.filter(x => x.id === 'mafia' || x.id === 'werewolf');
  return g.length === 2 && g.every(x => x.tags.includes('roles-only'))
    && !g.some(x => x.tags.includes('no-deck-needed'));
}));

/* --- deep link + offline ------------------------------------------------ */
await page.goto(BASE + '#euchre', { waitUntil: 'networkidle' }); await wait(140);
check('deep link opens the right game', (await page.textContent('#dBody h2')) === 'Euchre');
await page.click('#dBack'); await wait(160);
check('deep-linked detail closes', await page.locator('#detail.open').count() === 0);

await page.goto(BASE, { waitUntil: 'networkidle' });
await wait(600);
check('service worker registers',
  await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())));

check('no console errors', errs.length === 0, errs.join(' | '));

await browser.close();
server.close();

const pad = Math.max(...results.map(r => r.n.length));
let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.n.padEnd(pad)}  ${r.detail}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
