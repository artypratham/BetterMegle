# 🌱 Scion Quest: git vs. Scion, the game

A playable explainer of how **git** works, where it strains when the clients are always-online **AI agent swarms**,
and how **Scion** (described in Anthropic's post [“Redesigning source control”](https://www.anthropic.com/engineering/redesigning-source-control))
handles things differently.

Each level is played twice, once in 🦖 **Git Land** and once in 🌱 **Scion Land**, then summarized in a debrief of fact cards.

| Level | You learn |
|---|---|
| 1 · Clone Wars | full / shallow / partial clones vs. lazy root-down tree fetch |
| 2 · Rush Hour on main | push races & merge queues vs. server-side changesets + ref CAS |
| 3 · Snapshot vs. Changeset | git's Merkle tree & gc vs. changesets + derived data |
| 4 · Whodunit | bisect over local history vs. bisect over an API |
| 5 · Cache Tower | mirror babysitting vs. daemon → cache → server tiers |
| 6 · The Big Merge | side-by-side comparison and caveats |

## Run it

No build step and no dependencies. Open `index.html` in a browser, or serve the folder:

```bash
cd scion-quest && python3 -m http.server 8000   # then open http://localhost:8000
```

## Accuracy

Every fact card has a source badge: **📰 Article** (stated in the post), **🛠 Git fact** (standard git behaviour),
or **🎮 Simplification** (game modelling the article doesn't specify). Sizes and timings inside the mini-games are toy values.
Scion is an internal Anthropic system, so this is a learning toy, not documentation.

See [`PLAN.md`](PLAN.md) for the full product plan and module breakdown.
