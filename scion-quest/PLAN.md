# Scion Quest — product plan

An arcade-style, browser-playable explainer of **Scion**, the source-control system described in
Anthropic's engineering post *"Redesigning source control"*
(<https://www.anthropic.com/engineering/redesigning-source-control>).

Players learn **how git works**, **where git's design strains when the clients are always-online AI
agent swarms on a giant monorepo**, and **what Scion does differently**, by playing each scenario
twice: once in 🦖 *Git Land*, once in 🌱 *Scion Land*.

## Honesty rules (baked into the product)

Every fact card in the game carries one of three badges:

| Badge | Meaning |
|---|---|
| 📰 **Article** | Stated in the Anthropic post (numbers are quoted as written there). |
| 🛠 **Git fact** | Standard git behaviour, not taken from the article. |
| 🎮 **Simplification** | Something the game models that the article does **not** specify. Treat as illustrative. |

Sizes and timings inside the mini-games are **toy, scaled numbers** and are labelled as such.
Scion is not open source and the article gives no CLI syntax beyond the client's name (`scn`), so the game
never invents `scn` commands; it animates concepts instead.

## Cast

- 🦖 **Gitbert**, a grumpy old Packfile-saurus who narrates Git Land. He thinks every problem can be solved with one more mirror.
- 🌱 **Sprout**, a calm, always-online narrator for Scion Land.
- 🤖 **Bolt & the swarm**, impatient agents who just want to ship a one-line fix.

## Core loop

`World map → Level intro → Play Git mode → Play Scion mode → Debrief (fact cards) → stars + Merge Coins`

The journal (📓) collects every fact card you unlock, so it doubles as a study sheet.
Progress is kept in `localStorage`. If storage is blocked, the game still works.

## Modules

| # | Module | File | What the player does | Concept learned |
|---|---|---|---|---|
| 0 | **Engine** | `js/core.js`, `css/style.css`, `index.html` | Map, HUD, narrator bubbles, mode tabs, journal, toasts, save/load | — |
| 1 | **Clone Wars** | `js/levels/l1-clone.js` | Bolt needs one file. Git: `git clone` a (toy) 100 GB repo, then try `--depth=1` / sparse workarounds and see what breaks. Scion: tick only the folders you need and watch the client walk trees root-down and request only what's missing. Then crank a "checkouts per day" slider to 25 M. | Full clone vs. lazy, recursive tree fetch; sparse/virtualized checkouts; the article's 25 M checkouts → >600 PB figure |
| 2 | **Rush Hour on `main`** | `js/levels/l2-push.js` | An agent swarm commits at once. Git: local commits, push, `! [rejected] (non-fast-forward)`, fetch/rebase/retry; mash *Retry* while the clock runs. Scion: changes are created server-side, *nothing to push*; `main` moves by compare-and-swap; conflicting pairs get patched post-merge by a fixer bot. | Distributed push model vs. server-side commits; refs as CAS; no global merge-queue lock |
| 3 | **Snapshot vs. Changeset** | `js/levels/l3-model.js` | Edit a deeply nested file. Git panel lights up the new blob, every new tree up to the root, and the commit. Scion panel appends one changeset (files changed vs. first parent + blob pointers) to a write-ahead log. A "loose objects / packfiles" meter forces `git gc`; Scion has no packfiles. | Git's Merkle-tree object model; Scion's changeset model; no repository maintenance |
| 4 | **Whodunit: Bisect the Bug** | `js/levels/l4-bisect.js` | Find the change that broke the build. Git: a shallow clone has no history, so you deepen it (download cost) and check out every probe. Scion: ask the server (derived data: path history, blame, commit-graph skip lists) through an API, no local repo needed. | History queries need local history in git; Scion computes derived data server-side; automated bisect/revert over API |
| 5 | **Cache Tower** | `js/levels/l5-cache.js` | Requests flow node → regional cache → server. Git Land: hundreds of mirrors and drifting seeds you must keep refreshing. Scion: daemon / cache / server tiers answer identical RPCs; *break* a regional cache and toggle strict tiering to see whether the server melts. | Content-addressed caching; three tiers; failure-domain isolation |
| 6 | **Finale** | `js/levels/l6-finale.js` | Report card, side-by-side comparison table, and a "what git could borrow" section. Ends with the article's own caveat that Scion is **not** a general git replacement. | Trade-offs and when each model fits |

## Tech choices

- **Vanilla HTML/CSS/JS, no build step.** Open `index.html` directly, or serve the folder statically.
  Scripts attach to a single `window.SQ` namespace (no ES modules), so `file://` works.
- Each level is a self-contained module registered with `SQ.registerLevel({...})` and exposes `mount(root, api)`.
- The UI works at phone width. Animations use CSS and `requestAnimationFrame`.

## Build order

1. Engine + map + journal (module 0)
2. Levels 1 → 5, one commit per module
3. Finale + polish + headless smoke test (Playwright, checking for JS errors on every level)

## Possible later work

- Multiplayer "race" mode (two players, one per land)
- Sound effects
- Localisation
