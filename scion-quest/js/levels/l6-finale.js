/* Level 6 — Finale: report card, side-by-side comparison, and the article's own caveats. */
(function () {
  const { h } = SQ;

  const ROWS = [
    ["Who holds the repo?", "Every clone is a full, offline-capable copy.", "Always-online clients fetch on demand; no full copy exists anywhere, even on the server."],
    ["Getting files", "<code>clone</code>/<code>fetch</code> negotiate what you <i>have</i>, then ship packfiles.", "Walk from the root tree; request only missing trees, then blobs. Resumable, no giant packfile."],
    ["Making a commit", "Built locally, then pushed; non-fast-forward pushes are rejected.", "Created on the server as a changeset. Nothing to push."],
    ["Unit of history", "Commit → snapshot (tree of trees and blobs).", "Changeset → files changed vs. first parent + blob pointers, in a write-ahead log."],
    ["Branches / refs", "Cheap and everywhere.", "Supported but discouraged beyond main and release branches; moving one is a compare-and-swap on a single row."],
    ["log / blame / bisect", "Need history in your local object store.", "API queries over server-side derived data (blame, path history, graph skip lists)."],
    ["Maintenance", "Loose objects, packfiles, gc/repack.", "No packfiles, so no repository maintenance."],
    ["Scaling reads", "Mirrors and seeds (full copies that drift).", "daemon → regional cache → server, identical RPCs, strict tiering."],
    ["Merging under load", "Retry races or a serial merge queue.", "Server-side merges, post-merge testing, conflicts fixed quickly by Claude."],
    ["Best for", "Almost everyone: offline work, open source, small-to-large repos.", "Enormous monorepos with tens of thousands of engineers or large agent swarms."],
  ];

  function finale(stage, api) {
    const st = SQ.state();
    const lvIds = ["clone", "push", "model", "bisect", "cache"];
    const stars = lvIds.reduce((s, id) => s + (st.stars[id] || []).length, 0);
    const max = lvIds.length * 3;
    const grade = stars >= max ? "S" : stars >= max * 0.8 ? "A" : stars >= max * 0.5 ? "B" : "C";
    const quips = {
      S: "Gitbert has formally applied for a job in Scion Land. 🦖➡️🌱",
      A: "Bolt shipped the typo fix and is now bisecting things for fun.",
      B: "Solid! A few levels are still waiting for you on the map.",
      C: "Gitbert says: “See, kids? Not everyone needs Scion.” Play a few more levels!",
    };

    stage.append(
      h("div", { class: "panel big-result" },
        h("div", { class: "stars" }, "🏆"),
        h("h3", { style: "font-family:var(--pixel);font-size:16px" }, "Grade " + grade + " · " + stars + "/" + max + " ★ · 🪙 " + st.coins),
        h("p", null, quips[grade]),
        h("p", { class: "muted" }, "Fact cards collected: " + st.cards.length + ". Open 📓 Journal for your study sheet.")),
      h("div", { class: "panel" },
        h("h3", null, "🦖 vs 🌱 Side by side"),
        h("div", { class: "table-wrap" }, h("table", { class: "compare" },
          h("thead", null, h("tr", null, h("th", null, ""), h("th", null, "git"), h("th", null, "Scion (per the article)"))),
          h("tbody", null, ...ROWS.map(([k, g, s]) => h("tr", null, h("td", null, h("b", null, k)), h("td", { html: g }), h("td", { html: s }))))))),
      h("div", { class: "grid2", style: "margin-top:14px" },
        h("div", { class: "panel" },
          h("h3", null, "🤝 What git could borrow"),
          h("p", null, "The article frames Scion as a design for a specific scale, not a git killer. It suggests git platforms and clients could adopt pieces of the model without abandoning git's overall design:"),
          h("ul", null,
            h("li", null, "server-side RPCs for history queries,"),
            h("li", null, "a reworked fetch negotiation protocol,"),
            h("li", null, "composable sparse and shallow features.")),
          h("p", { class: "muted" }, "Prior art named in the post: Google's Piper and Meta's Sapling.")),
        h("div", { class: "panel" },
          h("h3", null, "🛠 How it was built (per the article)"),
          h("ul", null,
            h("li", null, "A seven-person team built Scion, the Antique code-review tool, and about half a dozen related systems, and migrated in five months while merge volume grew about 10x."),
            h("li", null, "Engineers spent more time setting design constraints and reviewing intent. Claude sometimes broke the constraints (for example, scanning the commit log linearly instead of querying Antique)."),
            h("li", null, "Antique supports semantic approval rules, and Scion adds per-directory permissions on top of repository-level access control.")),
          h("p", { class: "muted", style: "font-size:13px" }, "These are summaries of the post. Please check the original for exact wording and figures."))),
      h("div", { class: "panel", style: "margin-top:14px" },
        h("h3", null, "⚠ Honesty corner"),
        h("p", null, "Scion is an internal Anthropic system. Everything in this game about Scion comes from one public blog post, and every mechanic the post doesn't spell out is marked " +
          "🎮 Simplification in your journal. Scion may have changed since that post was written, so treat this as a learning toy, not documentation."),
        h("div", { class: "row" },
          h("a", { class: "btn gold", href: "https://www.anthropic.com/engineering/redesigning-source-control", target: "_blank", rel: "noopener" }, "📰 Read the original article"),
          h("button", { class: "btn", onclick: () => document.querySelector("[data-nav=map]").click() }, "🗺 Back to map"))));

    api.complete("debrief", 100);
  }

  SQ.registerLevel({
    id: "finale", num: 6, emoji: "🏁", title: "The Big Merge",
    tagline: "Your report card, the full side-by-side, and what git could borrow.",
    summary: "",
    cards: {},
    modes: { debrief: finale },
  });
})();
