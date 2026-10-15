/* Level 1 — Clone Wars: full/shallow/partial git clones vs. Scion's lazy, root-down tree fetch. */
(function () {
  const { h, fmtBytes, fmtNum } = SQ;
  const KB = 1e3, MB = 1e6, GB = 1e9;

  const d = (name, children) => ({ name, dir: true, children });
  const f = (name, size, target) => ({ name, size, target: !!target });

  // Toy monorepo. Sizes are invented, scaled so the working copy is ~25 GB like the article's.
  function makeRepo() {
    const root = d("", [
      d("services", [
        d("billing", [f("README.md", 4 * KB, true), f("invoice.py", 30 * KB), f("tax_rules.py", 50 * KB)]),
        d("search", [f("index.rs", 200 * KB), f("ranker.rs", 150 * KB)]),
        d("auth", [f("login.go", 40 * KB), f("tokens.go", 25 * KB)]),
      ]),
      d("research", [
        d("datasets", [f("cats_v7.parquet", 9 * GB), f("tokens_shard_001.bin", 6 * GB)]),
        d("models", [f("checkpoint_notes.md", 20 * KB), f("eval_results.json", 2 * GB)]),
      ]),
      d("frontend", [f("app.tsx", 80 * KB), f("styles.css", 40 * KB), f("vendored_node_modules.tar", 3 * GB)]),
      d("infra", [d("terraform", [f("main.tf", 30 * KB)]), f("k8s.yaml", 20 * KB)]),
      d("third_party", [f("llvm_fork.tar", 4.9 * GB)]),
      d("docs", [f("onboarding.md", 15 * KB)]),
    ]);
    (function annotate(node, parentPath, depth) {
      node.path = parentPath ? parentPath + "/" + node.name : node.name;
      node.depth = depth;
      if (node.dir) {
        node.size = node.children.reduce((s, c) => s + annotate(c, node.path, depth + 1), 0);
        node.treeBytes = 150 * node.children.length; // a tree object is just a listing
      }
      return node.size;
    })(root, "", 0);
    return root;
  }
  function walk(node, fn) { fn(node); if (node.dir) node.children.forEach((c) => walk(c, fn)); }

  function renderTree(root, onClick) {
    const els = new Map();
    const box = h("div", { class: "tree" });
    walk(root, (n) => {
      const el = h("div", {
        class: "item" + (n.target ? " target" : ""),
        style: "padding-left:" + (6 + n.depth * 16) + "px",
        onclick: () => onClick && onClick(n),
      }, (n.dir ? "📁 " : "📄 ") + (n.path === "" ? "monorepo/" : n.name + (n.dir ? "/" : "")),
        h("span", { class: "size" }, fmtBytes(n.size)));
      els.set(n, el);
      box.append(el);
    });
    return { box, els };
  }

  function termLine(term, text, cls) {
    term.append(h("div", { class: cls || "" }, text));
    term.scrollTop = term.scrollHeight;
  }

  // ------------------------------------------------------------------ GIT LAND
  const STRATEGIES = [
    {
      id: "full", label: "git clone", card: "l1-git-clone",
      cmd: "git clone git@example.internal:monorepo.git",
      bytes: 100 * GB, ms: 7000,
      lands: (n) => true,
      after: [
        ["cmd", "git blame services/billing/README.md"],
        ["ok", "a91f3c2 (Ada   2025-11-02) # Billing service"],
        ["ok", "77be019 (Grace 2026-03-14) Invoices are generated nightly."],
        ["warn", "✅ blame works, because all history is on disk."],
        ["err", "❌ ...but you downloaded the entire history to fix one typo."],
      ],
    },
    {
      id: "shallow", label: "git clone --depth=1", card: "l1-git-shallow",
      cmd: "git clone --depth=1 git@example.internal:monorepo.git",
      bytes: 25 * GB, ms: 3500,
      lands: (n) => true,
      after: [
        ["cmd", "git log --oneline | wc -l"],
        ["warn", "1"],
        ["cmd", "git blame services/billing/README.md"],
        ["err", "^e4d2b10 (Bolt 2026-10-15) # Billing service"],
        ["err", "^e4d2b10 (Bolt 2026-10-15) Invoices are genreated nightly."],
        ["warn", "🤔 blame pins every line on the shallow boundary commit (^). The past is gone."],
        ["err", "❌ and you still downloaded the whole ~25 GB working copy."],
      ],
    },
    {
      id: "partial", label: "--filter=blob:none --sparse", card: "l1-git-partial",
      cmd: "git clone --filter=blob:none --sparse git@example.internal:monorepo.git\n$ git sparse-checkout set services/billing",
      bytes: 3 * GB, ms: 2500,
      lands: (n) => n.dir || n.path.startsWith("services/billing"),
      after: [
        ["dim", "(every commit and tree in history came down; file contents only for services/billing)"],
        ["cmd", "git blame services/billing/README.md"],
        ["warn", "remote: fetching missing blob 1/38 from promisor remote…"],
        ["warn", "remote: fetching missing blob 2/38 from promisor remote…"],
        ["warn", "…  (one lazy fetch after another for old versions)"],
        ["ok", "a91f3c2 (Ada   2025-11-02) # Billing service"],
        ["warn", "🐢 It works, eventually. History commands on partial clones need care and patience."],
      ],
    },
  ];

  const BOLT_QUIPS = [
    "Receiving objects… I have started a novel while I wait.",
    "Is it done? I could have fixed the typo 400 times by now.",
    "My sandbox disk is sweating. 🥵",
    "Fun fact: I only need 4 KB of this.",
  ];

  function git(stage, api) {
    const sc = api.scope;
    api.say("bolt", "Assignment: fix <b>one typo</b> in <code>services/billing/README.md</code> 🎯. Let's grab the repo!");
    api.say("gitbert", "Hrrmph. In MY day we cloned <i>the whole thing</i> and we liked it. Pick a clone strategy, whippersnapper. Try all three. Each one teaches you something.");

    const repo = makeRepo();
    const tree = renderTree(repo);
    const term = h("div", { class: "term" }, h("div", { class: "dim" }, "# Pick a strategy below ↓"));
    const bar = h("div", { class: "bar git" }, h("i"));
    const statBytes = h("div", { class: "v" }, "0 B");
    const statTime = h("div", { class: "v" }, "0 s");
    const done = new Set();
    const btns = STRATEGIES.map((s) => h("button", { class: "btn git", onclick: () => run(s) }, s.label));
    const scaleBox = h("div");

    stage.append(
      h("div", { class: "grid2" },
        h("div", { class: "panel git" }, h("h3", null, "🗂 The monorepo (toy sizes)"), tree.box),
        h("div", { class: "panel git" },
          h("h3", null, "💻 Bolt's sandbox"),
          h("div", { class: "row", style: "margin-bottom:10px" }, ...btns),
          bar,
          h("div", { class: "row", style: "margin:10px 0" },
            h("div", { class: "stat git" }, h("div", { class: "k" }, "Downloaded"), statBytes),
            h("div", { class: "stat git" }, h("div", { class: "k" }, "Wall clock (toy)"), statTime)),
          term)),
      scaleBox);

    async function run(s) {
      btns.forEach((b) => (b.disabled = true));
      tree.els.forEach((el) => el.classList.remove("hot"));
      term.replaceChildren();
      termLine(term, s.cmd, "cmd");
      const t0 = performance.now();
      const nodes = [...tree.els.keys()].filter(s.lands);
      let quip = 0;
      await new Promise((resolve) => {
        const iv = sc.interval(() => {
          const p = Math.min(1, (performance.now() - t0) / s.ms);
          bar.firstChild.style.width = p * 100 + "%";
          statBytes.textContent = fmtBytes(p * s.bytes);
          // toy clock: pretend 1 real second = 6 simulated minutes for the full clone
          statTime.textContent = Math.round((p * s.bytes) / GB * 0.42) + " min";
          nodes.slice(0, Math.ceil(p * nodes.length)).forEach((n) => tree.els.get(n).classList.add("hot"));
          if (p > (quip + 1) * 0.28 && quip < BOLT_QUIPS.length && s.id === "full") {
            termLine(term, "🤖 " + BOLT_QUIPS[quip++], "dim");
          }
          if (p >= 1) { sc.clear(iv); resolve(); }
        }, 100);
      });
      termLine(term, "Receiving objects: 100%, done.", "ok");
      for (const [cls, text] of s.after) { await sc.sleep(450); termLine(term, text, cls); }
      api.card(s.card);
      done.add(s.id);
      btns.forEach((b, i) => { b.disabled = false; if (done.has(STRATEGIES[i].id)) b.textContent = "✓ " + STRATEGIES[i].label; });
      if (done.size === STRATEGIES.length && !scaleBox.childElementCount) showScale();
      else if (done.size === 1) api.say("gitbert", "Try another one. They're all tradeoffs. That's the git way!", stage);
    }

    function showScale() {
      const steps = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 2.5e7];
      const out = h("div", { class: "stat git" }, h("div", { class: "k" }, "Naive git traffic / day"), h("div", { class: "v" }, ""));
      const label = h("b");
      const note = h("p", { class: "muted", style: "font-size:13px" });
      const slider = h("input", { type: "range", min: 0, max: steps.length - 1, value: 0, class: "slider", oninput: update });
      function update() {
        const n = steps[+slider.value];
        label.textContent = fmtNum(n);
        out.lastChild.textContent = fmtBytes(n * 25 * GB);
        note.innerHTML = n >= 2.5e7
          ? "📰 The article says Anthropic runs about <b>25 million CI checkouts a day</b>, and that “fetched naively, that would be over 600 PB of git traffic per day.” " +
            "(25 M × ~25 GB = 625 PB is our own back-of-envelope; the article doesn't show its math.)"
          : "That's " + fmtNum(n) + " Blu-ray discs' worth of data (≈25 GB each). Keep sliding →";
        if (n >= 2.5e7 && !api._scaled) {
          api._scaled = true;
          api.card("l1-art-scale");
          api.say("gitbert", "...Six hundred PETABYTES? Fine. FINE. Maybe a couple more mirrors would help. 😰", stage);
          api.complete("git", 50);
          stage.append(h("div", { class: "row", style: "margin-top:12px" },
            h("button", { class: "btn scion big", onclick: () => api.next("scion") }, "🌱 Now try Scion Land →")));
        }
      }
      scaleBox.append(h("div", { class: "panel git", style: "margin-top:14px" },
        h("h3", null, "📈 Now multiply by an agent swarm"),
        h("p", null, "Checkouts per day: ", label),
        slider, h("div", { class: "row", style: "margin-top:10px" }, out), note));
      update();
      api.say("bolt", "Now imagine <i>every CI job and every agent sandbox</i> doing that. Drag the slider all the way →", stage);
    }
  }

  // ------------------------------------------------------------------ SCION LAND
  function scion(stage, api) {
    const sc = api.scope;
    api.say("sprout", "Welcome to Scion Land. Here <b>clients are always online</b>, so nobody needs a full copy. " +
      "Click the folders Bolt needs (that's your <b>sparse set</b>), then fetch. I only send trees and files you actually ask for.");

    const repo = makeRepo();
    const selected = new Set();
    const store = new Set(); // the node's local object store survives between fetches
    let virtual = false;
    let busy = false;
    const tree = renderTree(repo, onClick);
    const term = h("div", { class: "term" }, h("div", { class: "dim" }, "# Select folders, then press Fetch"));
    const sBytes = h("div", { class: "v" }, "0 B");
    const sReq = h("div", { class: "v" }, "0");
    const sSkip = h("div", { class: "v" }, "0");
    const fetchBtn = h("button", { class: "btn scion", onclick: fetch }, "🌱 Fetch my checkout");
    const vToggle = h("label", { class: "row", style: "gap:6px;font-size:14px" },
      h("input", { type: "checkbox", onchange: (e) => { virtual = e.target.checked; } }),
      "Virtualized checkout (files materialize when opened)");

    stage.append(h("div", { class: "grid2" },
      h("div", { class: "panel scion" }, h("h3", null, "🗂 Same monorepo. Click folders to select."), tree.box),
      h("div", { class: "panel scion" },
        h("h3", null, "💻 Bolt's sandbox, with a Scion client"),
        h("div", { class: "row", style: "margin-bottom:10px" }, fetchBtn, vToggle),
        h("div", { class: "row", style: "margin-bottom:10px" },
          h("div", { class: "stat scion" }, h("div", { class: "k" }, "Downloaded"), sBytes),
          h("div", { class: "stat scion" }, h("div", { class: "k" }, "Requests"), sReq),
          h("div", { class: "stat scion" }, h("div", { class: "k" }, "Never asked for"), sSkip)),
        term)));

    function inSel(n) { return [...selected].some((s) => n.path === s.path || n.path.startsWith(s.path + "/")); }
    function aboveSel(n) { return n.path === "" || [...selected].some((s) => s.path.startsWith(n.path + "/")); }

    function onClick(n) {
      if (busy) return;
      if (n.dir && n.path !== "") {
        if (selected.has(n)) selected.delete(n); else selected.add(n);
        tree.els.forEach((el, node) => el.classList.toggle("sel", selected.has(node)));
        return;
      }
      // opening a file in a virtualized checkout fetches its blob on demand
      if (!n.dir && virtual && inSel(n) && !store.has(n.path)) {
        store.add(n.path);
        tree.els.get(n).classList.add("fetched");
        termLine(term, "open " + n.path + " → blob fetched on demand (" + fmtBytes(n.size) + ")", "ok");
        if (n.target) finish(0);
      }
    }

    async function fetch() {
      if (!selected.size) { api.say("sprout", "Pick at least one folder first. Hint: where does the 🎯 live?", stage); return; }
      busy = true; fetchBtn.disabled = true;
      term.replaceChildren();
      termLine(term, "# start at the root tree; recurse only into what you asked for", "dim");
      let bytes = 0, reqs = 0, skipped = 0;
      const step = async (n) => {
        const el = tree.els.get(n);
        if (n.dir) {
          if (!inSel(n) && !aboveSel(n)) {
            skipped++;
            termLine(term, "skip  " + n.path + "/  (not in your sparse set, never requested)", "dim");
            return;
          }
          if (store.has(n.path)) termLine(term, "have  tree " + (n.path || "/") + "  (already in local store)", "dim");
          else {
            el.classList.add("fetching"); await sc.sleep(140);
            store.add(n.path); bytes += n.treeBytes; reqs++;
            el.classList.remove("fetching"); el.classList.add("fetched");
            termLine(term, "need  tree " + (n.path || "/") + "  → requested", "ok");
          }
          for (const c of n.children) await step(c);
        } else if (inSel(n)) {
          if (virtual) { termLine(term, "lazy  " + n.path + "  (placeholder until opened)", "warn"); return; }
          if (store.has(n.path)) { termLine(term, "have  " + n.path, "dim"); return; }
          el.classList.add("fetching"); await sc.sleep(90);
          store.add(n.path); bytes += n.size; reqs++;
          el.classList.remove("fetching"); el.classList.add("fetched");
          termLine(term, "need  blob " + n.path + "  → requested (" + fmtBytes(n.size) + ")", "ok");
        }
        sBytes.textContent = fmtBytes(bytes); sReq.textContent = reqs; sSkip.textContent = skipped;
      };
      await step(repo);
      sBytes.textContent = fmtBytes(bytes); sReq.textContent = reqs; sSkip.textContent = skipped;
      busy = false; fetchBtn.disabled = false; fetchBtn.textContent = "🔁 Fetch again";
      api.card("l1-art-negotiation");
      if (reqs === 0) {
        api.card("l1-art-online");
        api.say("sprout", "Zero requests! The client checked its <b>local store</b> first and everything was already there. " +
          "Notice it never told the server what it <i>has</i>. It only asked for what it <i>needs</i>.", stage);
        return;
      }
      if (bytes > 1 * GB) {
        api.say("bolt", "I now own " + fmtBytes(bytes) + " of " + ([...selected].some((s) => s.path.startsWith("research")) ? "cat pictures 🐈" : "stuff I don't need") +
          ". Maybe un-select the giant folders? Then press Fetch again.", stage);
        return;
      }
      const target = [...tree.els.keys()].find((n) => n.target);
      if (!inSel(target)) { api.say("bolt", "Nice and small... but my 🎯 file isn't in there! Select its folder.", stage); return; }
      if (virtual) { api.say("sprout", "Virtualized! Files are placeholders. Click <code>README.md</code> to open it, and only then is its blob fetched.", stage); return; }
      finish(bytes);
    }

    function finish(bytes) {
      if (api._won) return;
      api._won = true;
      api.say("bolt", "Typo fixed! 🎉 " + (bytes ? "Only " + fmtBytes(bytes) + " moved, instead of 100 GB." : "And the file only came down when I opened it."), stage);
      api.say("sprout", "Bonus: press <b>Fetch again</b> without changing anything to see what a warm local store does.", stage);
      api.complete("scion", 50);
      stage.append(h("div", { class: "row", style: "margin-top:12px" },
        h("button", { class: "btn gold big", onclick: () => api.next("debrief") }, "📜 Debrief →")));
    }
  }

  SQ.registerLevel({
    id: "clone", num: 1, emoji: "🧬", title: "Clone Wars",
    tagline: "Bolt needs one 4 KB file from a 100 GB repo. How hard can it be?",
    intro: "Git is <b>distributed</b>: every clone is a full, offline-capable copy. Lovely for humans on planes. " +
      "Less lovely for millions of short-lived agent sandboxes.",
    summary: "Git's clone model assumes each client wants its own complete copy. Shallow and partial clones trim the download, " +
      "but break or slow down history-based commands. Scion assumes the client is always online. It walks from the root tree, " +
      "asks only for missing trees and blobs it wants, and never needs one giant download.",
    cards: {
      "l1-git-clone": { src: "git", title: "A git clone copies everything",
        text: "A normal <code>git clone</code> downloads every commit, tree and file version in history, so the copy works fully offline. Great on a plane; overkill for an agent that needs one file." },
      "l1-git-shallow": { src: "git", title: "Shallow clones forget the past",
        text: "<code>--depth=1</code> fetches only the latest commit. Commands that need history, like <code>log</code> and <code>blame</code>, only see what was fetched. Blame marks the shallow boundary commit with <code>^</code>." },
      "l1-git-partial": { src: "git", title: "Partial clone + sparse checkout",
        text: "<code>--filter=blob:none</code> downloads all commits and trees but fetches file contents lazily from a “promisor” remote; <code>sparse-checkout</code> limits which folders appear on disk. History-heavy commands may trigger many on-demand fetches." },
      "l1-art-scale": { src: "article", title: "Monorepo at Anthropic scale",
        text: "The article says main's history is almost 100 GB, a compressed working copy is over 25 GB, and CI does about 25 million checkouts a day.",
        quote: "Fetched naively, that would be over 600 PB of git traffic per day." },
      "l1-art-online": { src: "article", title: "Clients are always online",
        text: "Scion's first design principle: since almost every client is an always-online agent or job, the client fetches data when it needs it instead of holding a full copy. CI can even ask the server for diffs with no checkout at all." },
      "l1-art-negotiation": { src: "article", title: "Fetch only what you want",
        text: "Scion's fetch walks down from the root tree and requests missing trees, then blobs. Requests are resumable, with no single multi-gigabyte packfile. Sparse and virtualized checkouts need no special support: the client just doesn't ask for trees it doesn't want.",
        quote: "Scion’s negotiation doesn’t tell the server what the client already has" },
      "l1-sim-sizes": { src: "sim", title: "About this level's numbers",
        text: "Folder names, file sizes, download times, and the 3 GB partial-clone figure are invented for the game. Only the 📰 figures come from the article." },
    },
    modes: { git, scion },
  });
})();
