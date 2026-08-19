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
npx http-server -p 8099 -c-1 .
# then open http://127.0.0.1:8099/
```

## What's in here

```
index.html               the entire app — markup, CSS, GAMES data, logic
sw.js                    offline shell: network-first document, cache-first assets
manifest.webmanifest     PWA metadata
icons/                   generated PNGs (do not hand-edit)
tools/validate.mjs       data checks — run before every commit
tools/make-icons.mjs     regenerates icons/
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
node tools/validate.mjs
```

This checks the structure (unique ids, sane ranges, no empty sections) and
multiplies out the deal arithmetic. Two of the three content bugs this repo
opened with were sums nobody had checked — a 6-player Hearts deal that could
not divide evenly, and a Speed setup naming three different splits in one
sentence. The validator now fails on that class of error, and on a rule that
names a card the setup removed.

Rules text is the product here. A game that plays wrong at a real table is a
worse bug than a layout glitch, so changes to `sections` deserve the same
scrutiny as changes to code.

## Icons

`icons/` is generated. To change the mark, edit the shape functions in
`tools/make-icons.mjs` and re-run it:

```sh
node tools/make-icons.mjs
```

It rasterises and writes the PNGs itself, so the repo stays dependency-free.

## Deploying

Static hosting, no build. Point GitHub Pages, Netlify, or Cloudflare Pages at
the repo root. Service workers need https (or localhost) to register, which
every one of those provides.

After deploying an update, bump `CACHE` in `sw.js` so returning visitors get
the new document rather than the cached one.

## Open questions

Deliberately left alone, because they're product calls rather than defects:

- **The picker's time filter** tests each game's *minimum* time, so choosing
  "15 min" still surfaces a game listed at 15–90 minutes. Filtering on the
  midpoint would match what people probably mean.
- **The player stepper goes to 20**, but only two games go that high, and at
  12 players the "Real strategy" and "Chill & quiet" vibes return nothing.
  Either cap the stepper lower or have the empty state name which control to
  loosen.
- **Picker results don't refresh** when you change a control — you have to
  press the button again, so the list can sit stale under changed inputs.
- **Mafia and Werewolf are tagged `no-deck-needed`** but their `needs` says
  one card per player.
- **Solo games show "Solo" twice** on the card, once as the category pill and
  once as the player count.
