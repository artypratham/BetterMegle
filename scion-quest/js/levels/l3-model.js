/* Level 3 — Snapshot vs. Changeset: git's object model (blobs/trees/commits, gc) vs. Scion changesets + derived data. */
(function () {
  const { h, hash } = SQ;

  const d = (name, children) => ({ name, dir: true, children });
  const f = (name) => ({ name });
  function makeTree() {
    const root = d("", [
      f("README.md"),
      d("services", [
        d("billing", [
          d("api", [d("v2", [d("handlers", [f("invoice.py"), f("refund.py")]), f("routes.py")])]),
          f("README.md"),
        ]),
        d("auth", [f("login.go")]),
      ]),
      d("docs", [f("guide.md")]),
    ]);
    (function annotate(n, parent, depth) {
      n.parent = parent; n.depth = depth;
      n.path = parent && parent.path ? parent.path + "/" + n.name : n.name;
      if (n.dir) n.children.forEach((c) => annotate(c, n, depth + 1));
    })(root, null, 0);
    return root;
  }
  function renderTree(root, onClick) {
    const els = new Map(), box = h("div", { class: "tree" });
    (function walk(n) {
      const el = h("div", { class: "item", style: "padding-left:" + (6 + n.depth * 16) + "px", onclick: () => !n.dir && onClick(n) },
        (n.dir ? "📁 " : "✏️ ") + (n.path === "" ? "repo/" : n.name + (n.dir ? "/" : "")));
      els.set(n, el); box.append(el);
      if (n.dir) n.children.forEach(walk);
    })(root);
    return { box, els };
  }
  const pathUp = (n) => { const out = []; for (let p = n.parent; p; p = p.parent) out.push(p); return out; };

  // ------------------------------------------------------------------ GIT LAND
  function git(stage, api) {
    const sc = api.scope;
    api.say("gitbert", "Time for a lesson in my <b>beautiful object model</b>. A git commit is a <b>snapshot</b>: it points to a root <b>tree</b>. Trees list sub-trees and <b>blobs</b> (file contents). " +
      "Everything is named by the hash of its content.");
    api.say("bolt", "Click any ✏️ file to edit it and commit. Watch what git has to write. Try the deep one: <code>services/billing/api/v2/handlers/invoice.py</code>.");

    const repo = makeTree();
    let commits = 0, loose = 0, packs = 0, busy = false, gcDone = false;
    const tree = renderTree(repo, edit);
    const objs = h("div", { class: "objs" });
    const mLoose = h("div", { class: "bar git" }, h("i"));
    const looseLbl = h("b", null, "0");
    const packLbl = h("b", null, "0");
    const commitLbl = h("b", null, "0");
    const lastLbl = h("p", { class: "muted" }, "No commits yet.");
    const gcBtn = h("button", { class: "btn git", disabled: true, onclick: gc }, "🧹 git gc");
    const after = h("div");
    stage.append(h("div", { class: "grid2" },
      h("div", { class: "panel git" }, h("h3", null, "🗂 Working tree"), tree.box),
      h("div", { class: "panel git" },
        h("h3", null, "🧱 Objects written by the last commit"), lastLbl, objs,
        h("hr", { style: "border-color:var(--line);margin:14px 0" }),
        h("p", null, "Commits: ", commitLbl, " · Loose objects: ", looseLbl, " · Packfiles: ", packLbl),
        mLoose, h("div", { class: "row", style: "margin-top:10px" }, gcBtn))), after);

    async function edit(file) {
      if (busy) return;
      busy = true;
      tree.els.forEach((el) => el.classList.remove("hot"));
      objs.replaceChildren();
      commits++;
      const v = commits;
      const items = [["blob", file.path, "blob " + hash(file.path + v)]];
      pathUp(file).forEach((t) => items.push(["tree", t.path || "/", "tree " + hash((t.path || "/") + v)]));
      items.push(["commit-o", "commit", "commit " + hash("c" + v) + " → tree " + hash("/" + v)]);
      tree.els.get(file).classList.add("hot");
      for (const [cls, where, label] of items) {
        await sc.sleep(260);
        objs.append(h("span", { class: "obj " + (cls === "commit-o" ? "commit-o" : cls) }, label + (cls === "tree" ? "  (" + where + ")" : "")));
        const node = [...tree.els.keys()].find((n) => (n.path || "/") === where && n.dir);
        if (node) tree.els.get(node).classList.add("hot");
      }
      loose += items.length;
      lastLbl.textContent = "1 blob + " + (items.length - 2) + " trees + 1 commit = " + items.length + " new objects. Sibling folders were reused (same content means same hash).";
      commitLbl.textContent = commits; looseLbl.textContent = loose; packLbl.textContent = packs;
      mLoose.firstChild.style.width = Math.min(100, (loose / 30) * 100) + "%";
      if (commits === 1) api.card("l3-git-objects");
      if (loose >= 30) {
        gcBtn.disabled = false; gcBtn.classList.add("wiggle");
        if (!api._nag) {
          api._nag = true;
          api.say("bolt", "<code>Auto packing the repository in background for optimum performance.</code> Uh, git just said that. Should I… clean up?", after);
        }
      } else if (commits === 2) {
        api.say("gitbert", "See? Edit one file 5 folders deep and I write a new tree for <b>every folder on the path</b>, all the way up to the root. Keep committing until things get… cluttered.", after);
      }
      busy = false;
    }

    async function gc() {
      gcBtn.disabled = true; gcBtn.classList.remove("wiggle");
      gcBtn.textContent = "🧹 compressing…";
      for (let i = 0; i <= 10; i++) { await sc.sleep(120); mLoose.firstChild.style.width = Math.max(0, 100 - i * 10) + "%"; }
      packs++; loose = 0; looseLbl.textContent = 0; packLbl.textContent = packs;
      gcBtn.textContent = "🧹 git gc";
      api.card("l3-git-packs");
      if (!gcDone) {
        gcDone = true;
        api.say("gitbert", "Loose objects are now squished into a <b>packfile</b>. On a giant monorepo, someone has to run this kind of maintenance forever. That someone is usually a tired human. 😴", after);
        api.complete("git", 50);
        after.append(h("button", { class: "btn scion big", style: "margin-top:12px", onclick: () => api.next("scion") }, "🌱 See Scion's data model →"));
      }
    }
  }

  // ------------------------------------------------------------------ SCION LAND
  function scion(stage, api) {
    const sc = api.scope;
    api.say("sprout", "In Scion, the unit of work is a <b>changeset</b>: an entry in a write-ahead log. Instead of pointing to a whole tree, it lists the <b>files that changed</b> " +
      "relative to its first parent, plus content-addressed pointers to the compressed contents in blob storage.");
    api.say("bolt", "Edit some files. The scoreboard shows what git <i>would</i> write versus what Scion writes. After 3 edits, ask for some <b>derived data</b>.");

    const repo = makeTree();
    const log = []; // {id, parent, path}
    let gitObjs = 0, scionObjs = 0, busy = false;
    const tree = renderTree(repo, edit);
    const wal = h("div", { class: "wal" }, h("div", { class: "muted" }, "(empty log)"));
    const gStat = h("div", { class: "v" }, "0"), sStat = h("div", { class: "v" }, "0");
    const derivedBox = h("div");
    const after = h("div");
    stage.append(
      h("div", { class: "row", style: "margin-bottom:14px" },
        h("div", { class: "stat git" }, h("div", { class: "k" }, "git objects written"), gStat),
        h("div", { class: "stat scion" }, h("div", { class: "k" }, "Scion log rows + blobs"), sStat),
        h("div", { class: "stat scion" }, h("div", { class: "k" }, "Packfiles to maintain"), h("div", { class: "v" }, "none"))),
      h("div", { class: "grid2" },
        h("div", { class: "panel scion" }, h("h3", null, "🗂 Working tree"), tree.box),
        h("div", { class: "panel scion" }, h("h3", null, "📜 Changeset log"), wal)),
      derivedBox, after);

    async function edit(file) {
      if (busy) return;
      busy = true;
      tree.els.forEach((el) => el.classList.remove("sel"));
      tree.els.get(file).classList.add("sel");
      const id = log.length + 1;
      log.push({ id, parent: id - 1, path: file.path });
      if (id === 1) wal.replaceChildren();
      await sc.sleep(200);
      wal.prepend(h("div", { class: "entry" },
        "cs" + id + "  parent=cs" + (id - 1) + "\n  changed: " + file.path + "  →  blob:" + hash(file.path + id)));
      gitObjs += 2 + pathUp(file).length; scionObjs += 2;
      gStat.textContent = gitObjs; sStat.textContent = scionObjs;
      if (id === 1) api.card("l3-art-changeset");
      if (id === 3) showDerived();
      busy = false;
    }

    function showDerived() {
      const files = [...new Set(log.map((e) => e.path))];
      const pick = h("select", { class: "btn small" }, ...files.map((p) => h("option", { value: p }, p)));
      const out = h("div", { class: "term", style: "margin-top:10px" });
      derivedBox.append(h("div", { class: "panel scion", style: "margin-top:14px" },
        h("h3", null, "🧮 Derived data: path history"),
        h("p", { class: "muted" }, "History isn't stored in the changeset. It's derived data, computed recursively from each changeset's parent, then cached."),
        h("div", { class: "row" }, pick, h("button", { class: "btn scion", onclick: () => compute(pick.value, out) }, "Compute history at latest changeset")),
        out));
    }

    async function compute(path, out) {
      out.replaceChildren();
      const line = (t, c) => { out.append(h("div", { class: c }, t)); out.scrollTop = out.scrollHeight; };
      const top = log.length;
      line("history(" + path + ", cs" + top + ")", "cmd");
      for (let i = top; i >= 1; i--) {
        await sc.sleep(220);
        const e = log[i - 1];
        line("  cs" + i + ": " + (e.path === path ? "touches it → include cs" + i + ", then ask parent" : "doesn't touch it → same as parent cs" + (i - 1)), e.path === path ? "ok" : "dim");
      }
      await sc.sleep(220);
      line("  cs0: base case → []", "dim");
      const hist = log.filter((e) => e.path === path).map((e) => "cs" + e.id).reverse();
      line("= [" + hist.join(", ") + "]   (result cached, so the next query starts from here)", "ok");
      if (!api._done) {
        api._done = true;
        api.card("l3-art-derived");
        api.card("l3-art-nopack");
        api.card("l3-sim-model");
        api.say("sprout", "That's the generic recipe for derived data: <b>value(changeset) = f(value(parent), changeset)</b>. Blame, path history, and commit-graph skip lists all work this way. " +
          "And notice: no packfiles, so no <code>git gc</code>, ever.", after);
        api.complete("scion", 50);
        after.append(h("button", { class: "btn gold big", style: "margin-top:12px", onclick: () => api.next("debrief") }, "📜 Debrief →"));
      }
    }
  }

  SQ.registerLevel({
    id: "model", num: 3, emoji: "🧱", title: "Snapshot vs. Changeset",
    tagline: "Edit one file five folders deep. Count the bricks each system lays.",
    intro: "Under the hood, git stores <b>snapshots</b> (a Merkle tree of folders) and Scion stores <b>changesets</b> (what changed since the parent). Same edits, very different bookkeeping.",
    summary: "Git commits point to a full tree snapshot, so an edit writes new tree objects for every folder on the path up to the root, and objects get packed by periodic maintenance. " +
      "A Scion changeset just lists the changed files relative to its first parent, with pointers to blob storage. Everything else (blame, path history, graph indices) is derived data, " +
      "computed recursively from parents' values. There are no packfiles, so there is no repository maintenance.",
    cards: {
      "l3-git-objects": { src: "git", title: "Commits are snapshots (Merkle trees)",
        text: "A git commit points to a root tree, and trees point to sub-trees and blobs, each named by its content hash. Changing one deep file creates a new blob, a new tree for every ancestor folder, and a new commit. Unchanged siblings are reused." },
      "l3-git-packs": { src: "git", title: "Packfiles & gc",
        text: "Git writes new objects as individual “loose” files and periodically compresses them into packfiles (<code>git gc</code>, auto-gc, repack). It's routine maintenance that grows with the repository." },
      "l3-art-changeset": { src: "article", title: "The changeset",
        text: "Scion's unit of work is an entry in a write-ahead log, created on the server. It lists the files changed relative to its first parent, plus content-addressed pointers to compressed file contents in blob storage.",
        quote: "where a git commit stores a pointer to the tree, a changeset stores a list of the files that changed" },
      "l3-art-derived": { src: "article", title: "Derived data",
        text: "Anything not in the changeset, such as file blame, path history, and commit-graph skip lists, is derived data. It's computed through one generic mechanism, recursively, from the parents' values, and each type can be computed eagerly or deferred. New types (like copy-detection indices) are easy to add." },
      "l3-art-nopack": { src: "article", title: "No packfiles, no maintenance",
        text: "Repository data is spread horizontally; no fully materialized copy exists, even on the server.",
        quote: "There is no equivalent of packfiles (git’s compressed bundles of objects), so no repository maintenance is needed." },
      "l3-sim-model": { src: "sim", title: "How this level simplifies things",
        text: "The git object counts are accurate for a single-file commit. The Scion log format and the “+2” cost per edit are illustrative; the article doesn't publish Scion's on-disk format. Real git only nags about gc at much larger object counts." },
    },
    modes: { git, scion },
  });
})();
