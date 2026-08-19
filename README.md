# Card Explorer

**Deck & Rules** — rules and directions for 57 card and party games, in one
page that works on a phone with no signal.

The whole app is a single `index.html`: markup, styles, the game data, and
about 250 lines of plain DOM code. No framework, no build step, no
dependencies. Open the file and it runs.

## Running it

Any static server will do — a `file://` open works too, except that service
workers only register over http(s), so offline mode won't engage.

```sh
npm start          # or: npx http-server -p 8099 -c-1 .
# then open http://127.0.0.1:8099/
```

## What's in here

```
index.html               the entire app — markup, CSS, GAMES data, logic
sw.js                    offline shell: network-first document, cache-first assets
manifest.webmanifest     PWA metadata
icons/                   generated PNGs (do not hand-edit)
tools/validate.mjs       data checks — run before every commit
tools/smoke.mjs          browser tests, serves the repo itself
tools/make-icons.mjs     regenerates icons/
package.json             scripts only — no dependencies, see Checks
.nojekyll                tells GitHub Pages to serve files as-is
```

## The game data

Every game is one object in the `GAMES` array in `index.html`. The shape:

| field | meaning |
| --- | --- |
| `id` | slug, and the URL hash — `#euchre` deep-links to the game |
| `name` / `aka` | display name, plus alternate names (both are searchable) |
| `cat` | one of `trick` `rummy` `shedding` `speed` `casino` `party` `kids` `solitaire` |
| `players` | `[min, max]` — drives search and the picker |
| `best` | free text, e.g. `"4-8"` |
| `time` | `[min, max]` minutes |
| `age` | suggested minimum age |
| `diff` | `1` easy, `2` medium, `3` involved |
| `needs` | what's required beyond a deck |
| `tags` | free-form; feeds search and the picker's vibe filters |
| `blurb` | one or two sentences, shown on the card |
| `sections` | `[{h, b}]` — the actual rules, rendered in order |
| `variants` | optional list of house rules |

To add a game, append an object and run the validator. Nothing else needs
touching — categories, counts, and search pick it up automatically.

## Checks

```sh
npm run validate   # data checks — no dependencies, runs anywhere
npm run smoke      # drives the real app in a browser
npm test           # both
```

`validate` checks the structure (unique ids, sane ranges, no empty sections) and
multiplies out the deal arithmetic. Two of the three content bugs this repo
opened with were sums nobody had checked — a 6-player Hearts deal that could
not divide evenly, and a Speed setup naming three different splits in one
sentence. The validator now fails on that class of error, and on a rule that
names a card the setup removed.

Rules text is the product here. A game that plays wrong at a real table is a
worse bug than a layout glitch, so changes to `sections` deserve the same
scrutiny as changes to code.

`smoke` starts a server on its own and drives the app in Chromium — search,
favourites, dialog focus, the Back button, the picker, deep links, offline
registration. It needs Playwright, which is deliberately **not** listed in
`package.json`: static hosts run `npm install` when they find one, and
Playwright's postinstall pulls down a browser far larger than a deploy will
accept. Install it yourself when you want to run the tests:

```sh
npm i -D playwright
npx playwright install chromium
npm run smoke
```

## Icons

`icons/` is generated. To change the mark, edit the shape functions in
`tools/make-icons.mjs` and re-run it:

```sh
node tools/make-icons.mjs
```

It rasterises and writes the PNGs itself, so icon generation needs nothing
installed.

## Deploying

Static hosting, **no build step**. That last part matters: this repo has a
`package.json` for its scripts, and hosts tend to see one and assume a Node
build. Tell them not to.

**Cloudflare Pages** — Framework preset `None`, build command **empty**,
build output directory `/`.

**GitHub Pages** — Settings → Pages → Source: *Deploy from a branch*, branch
`main`, folder `/ (root)`. No build runs at all, which makes this the least
surprising option.

**Netlify** — build command empty, publish directory `.`.

Service workers need https (or localhost) to register; all three provide it.

After deploying an update, bump `CACHE` in `sw.js` so returning visitors get
the new document rather than the cached one.

## Design decisions

Five judgement calls, and why they went the way they did:

**The picker filters time on a game's typical length**, the midpoint of its
range, not its fastest possible hand. Filtering on the low end let a game
listed at 15–90 minutes answer "15 min", which is technically true and
useless at a table. Across the whole book the stricter rule takes the
15-minute shortlist from 31 games to 17 — a real shortlist rather than half
of everything.

**The player stepper's ceiling is read from the data** rather than
hard-coded, so it reaches 24 (Werewolf) and stops. A fixed cap either hides
the big-group games — exactly what someone with fifteen people wants — or
points somewhere with nothing in it. Deriving it means adding a game with a
wider range just works.

**Results refresh as you change the controls**, once a list is on screen. The
button stays for the first run, but a list that sits stale under changed
inputs reads as the app ignoring you.

**The empty state names the one control that is blocking.** It distinguishes
"nothing seats 24" from "nothing that short for 24 — the quickest runs about
45 minutes" from "none of them fit every vibe you picked". A generic "try
something else" makes the reader guess which knob to turn.

**Mafia and Werewolf are tagged `roles-only`**, not `no-deck-needed` — both
need one card per player, and the cards only assign roles.

**The solitaire category label reads "Solitaire"**, not "Solo". Solo games
were showing "Solo" twice, once as the category and once as the player count.
Renaming the category fixed the repetition and says more than the pill it
sat beside.
