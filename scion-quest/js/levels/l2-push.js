/* Level 2 — Rush Hour on main: push races and merge queues vs. server-side changesets. */
(function () {
  const { h, rand } = SQ;
  const FACES = ["🤖", "👾", "🦾", "🛸", "🐙", "🦊", "🐝", "🦄", "🐸", "🐼"];
  const FILES = ["billing.py", "auth.go", "ranker.rs", "app.tsx", "main.tf", "README.md", "tax.py", "cache.rs", "api.ts", "db.sql"];

  function stat(label, cls) {
    const v = h("div", { class: "v" }, "0");
    return { el: h("div", { class: "stat " + cls }, h("div", { class: "k" }, label), v), set: (x) => (v.textContent = x) };
  }

  // ------------------------------------------------------------------ GIT LAND
  function git(stage, api) {
    const sc = api.scope;
    api.say("gitbert", "Rush hour! Every agent committed <b>locally</b> on top of <code>main</code>. Now they all <code>git push</code> at once. " +
      "Only a push whose parent is the <i>current</i> tip of main is a fast-forward. Everyone else gets bounced.");
    api.say("bolt", "When I'm rejected (🟥), <b>click me</b> and I'll <code>fetch</code> + <code>rebase</code> and try again. Please hurry. 🥺");

    const lane = h("div", { class: "lane" });
    const term = h("div", { class: "term", style: "min-height:90px;max-height:150px" });
    const merged = stat("Merged", "git"), rejected = stat("Rejected pushes", "git"), backlog = stat("Waiting", "git"), clock = stat("Tick", "git");
    const startBtn = h("button", { class: "btn git big", onclick: () => race() }, "▶ Start push race (25 ticks)");
    const rebaseAll = h("button", { class: "btn git", disabled: true, onclick: () => agents.forEach((a) => a.state === "rejected" && rebase(a)) }, "🔁 Rebase everyone");
    const after = h("div");
    stage.append(h("div", { class: "panel git" },
      h("div", { class: "row", style: "margin-bottom:12px" }, startBtn, rebaseAll),
      h("div", { class: "row", style: "margin-bottom:12px" }, merged.el, rejected.el, backlog.el, clock.el),
      lane, h("div", { style: "margin-top:12px" }, term)), after);

    let agents = [], main = 0, nMerged = 0, nRej = 0, seq = 0;
    const rnd = rand(42);
    const log = (t, cls) => { term.append(h("div", { class: cls }, t)); term.scrollTop = term.scrollHeight; };

    function draw() {
      // keep each agent's button alive across ticks so clicks aren't lost to a re-render
      const live = new Set(agents);
      [...lane.children].forEach((el) => { if (!live.has(el._agent)) el.remove(); });
      agents.forEach((a) => {
        if (!a.el) {
          a.el = h("button", { onclick: () => a.state === "rejected" && rebase(a) });
          a.el._agent = a;
          lane.append(a.el);
        }
        const cls = { ready: "wait", rejected: "bad", rebasing: "wait", merged: "ok" }[a.state];
        const label = { ready: "pushing…", rejected: "rejected! click", rebasing: "rebasing…", merged: "merged ✓" }[a.state];
        if (a.el.className !== "agent " + cls) a.el.className = "agent " + cls;
        a.el.replaceChildren(h("span", { class: "face" }, a.face), "#" + a.id, h("br"), label);
      });
      merged.set(nMerged); rejected.set(nRej);
      backlog.set(agents.filter((a) => a.state !== "merged").length);
    }
    function rebase(a) { a.state = "rebasing"; draw(); }

    function race() {
      startBtn.disabled = true; rebaseAll.disabled = false;
      let tick = 0;
      const iv = sc.interval(() => {
        tick++; clock.set(tick + "/25");
        agents = agents.filter((a) => a.state !== "merged");
        agents.forEach((a) => { if (a.state === "rebasing") { a.state = "ready"; a.base = main; } });
        for (let i = 0; i < 2; i++) agents.push({ id: ++seq, face: FACES[seq % FACES.length], state: "ready", base: main });
        const pushers = agents.filter((a) => a.state === "ready");
        const eligible = pushers.filter((a) => a.base === main);
        const winner = eligible.length ? eligible[Math.floor(rnd() * eligible.length)] : null;
        pushers.forEach((a) => {
          if (a === winner) { a.state = "merged"; nMerged++; main++; log("#" + a.id + "  main: " + (main - 1) + " → " + main + "  ✓", "ok"); }
          else { a.state = "rejected"; nRej++; log("#" + a.id + "  ! [rejected] main -> main (non-fast-forward)", "err"); }
        });
        draw();
        if (tick >= 25) { sc.clear(iv); raceOver(); }
      }, 650);
    }

    function raceOver() {
      rebaseAll.disabled = true;
      api.card("l2-git-ff");
      const waiting = agents.filter((a) => a.state !== "merged").length;
      api.say("bolt", "Final score: <b>" + nMerged + "</b> merged, <b>" + nRej + "</b> rejected pushes, <b>" + waiting + "</b> still waiting. " +
        "However fast you click, only <b>one</b> push can win each tick, and two new agents show up every tick. 📉", after);
      api.say("gitbert", "Bah! Then we'll use a <b>MERGE QUEUE</b>. Everyone lines up, one at a time, and each change runs CI before it lands. Orderly! Civilized!", after);
      after.append(h("button", { class: "btn git big", onclick: queue }, "🚦 Try the merge queue"));
    }

    function queue() {
      after.querySelector("button").disabled = true;
      const qLane = h("div", { class: "lane" });
      const qLen = stat("Queue length", "git"), qDone = stat("Landed", "git"), qTick = stat("Tick", "git");
      const panel = h("div", { class: "panel git", style: "margin-top:14px" },
        h("h3", null, "🚦 Merge queue: CI takes 3 ticks per change, strictly one at a time"),
        h("div", { class: "row", style: "margin-bottom:12px" }, qLen.el, qDone.el, qTick.el), qLane);
      after.append(panel);
      const q = []; let landed = 0, tick = 0, ci = 0;
      const iv = sc.interval(() => {
        tick++; qTick.set(tick + "/18");
        for (let i = 0; i < 2; i++) q.push({ id: ++seq, face: FACES[seq % FACES.length] });
        if (q.length && ++ci >= 3) { q.shift(); landed++; ci = 0; }
        qLen.set(q.length); qDone.set(landed);
        qLane.replaceChildren(...q.slice(0, 30).map((a, i) => h("div", { class: "agent " + (i === 0 ? "ok" : "wait") },
          h("span", { class: "face" }, a.face), i === 0 ? "in CI " + "▮".repeat(ci) + "▯".repeat(3 - ci) : "#" + (i + 1) + " in line")));
        if (q.length > 30) qLane.append(h("div", { class: "agent bad" }, h("span", { class: "face" }, "😱"), "+" + (q.length - 30) + " more"));
        if (tick >= 18) {
          sc.clear(iv);
          api.card("l2-art-queue");
          api.say("bolt", "The queue is <b>" + q.length + "</b> agents long and growing. I'll be retired before I merge. 🧓", after);
          api.say("gitbert", "...Perhaps the problem is not that you push <i>too slowly</i>. Perhaps it's that you push at all. Go see what the green folks do.", after);
          api.complete("git", 50);
          after.append(h("button", { class: "btn scion big", style: "margin-top:12px", onclick: () => api.next("scion") }, "🌱 To Scion Land →"));
        }
      }, 450);
    }
    draw();
  }

  // ------------------------------------------------------------------ SCION LAND
  function scion(stage, api) {
    const sc = api.scope;
    api.say("sprout", "Same rush hour, Scion rules. Agents don't build commits locally and push them. " +
      "<b>Every commit, rebase and merge happens on the server</b>, so there's nothing to push. Each change becomes a <b>changeset</b> in a write-ahead log, " +
      "and moving <code>main</code> is a single <b>compare-and-swap</b>, done separately from creating changesets.");
    api.say("sprout", "No global merge queue either: tests run <b>after</b> merge. When two agents touch the same file at once, a conflict pops up (⚠). " +
      "<b>Click it to fix it</b>, but Claude is racing you. 😏");

    let rate = 2;
    const rateLabel = h("b", null, "2");
    const slider = h("input", { type: "range", min: 1, max: 20, value: 2, class: "slider", oninput: (e) => { rate = +e.target.value; rateLabel.textContent = rate; } });
    const merged = stat("Changesets", "scion"), pushes = stat("Pushes needed", "scion"), you = stat("You fixed", "scion"), claude = stat("Claude fixed", "scion"), clock = stat("Tick", "scion");
    const wal = h("div", { class: "wal" });
    const conflictLane = h("div", { class: "lane" });
    const startBtn = h("button", { class: "btn scion big", onclick: run }, "▶ Start rush hour (25 ticks)");
    const after = h("div");
    stage.append(
      h("div", { class: "panel scion" },
        h("p", null, "New agents per tick: ", rateLabel, h("span", { class: "muted" }, " (Git Land got 2. Go wild.)")), slider,
        h("div", { class: "row", style: "margin:12px 0" }, startBtn),
        h("div", { class: "row" }, merged.el, pushes.el, clock.el)),
      h("div", { class: "grid2", style: "margin-top:14px" },
        h("div", { class: "panel scion" }, h("h3", null, "📜 Write-ahead log (server)"), wal),
        h("div", { class: "panel scion" }, h("h3", null, "⚠ Post-merge conflicts: beat Claude!"),
          h("div", { class: "row", style: "margin-bottom:10px" }, you.el, claude.el), conflictLane)),
      after);
    pushes.set("0 🙌");

    let main = 0, nYou = 0, nClaude = 0, seq = 0;
    const rnd = rand(7);
    function addWal(text) {
      wal.prepend(h("div", { class: "entry" }, text));
      while (wal.childElementCount > 40) wal.lastChild.remove();
    }

    function run() {
      startBtn.disabled = true; slider.disabled = true;
      api.card("l2-art-server");
      let tick = 0;
      const iv = sc.interval(() => {
        tick++; clock.set(tick + "/25");
        const touched = new Map();
        for (let i = 0; i < rate; i++) {
          const id = ++seq, file = FILES[Math.floor(rnd() * FILES.length)];
          addWal("cs" + id + "  parent=main@" + main + "  changed=[" + file + "]  · CAS main " + main + "→" + (main + 1) + " ✓");
          main++;
          if (touched.has(file)) spawnConflict(id, touched.get(file), file);
          else touched.set(file, id);
        }
        merged.set(main);
        if (tick >= 25) { sc.clear(iv); sc.timeout(done, 1500); }
      }, 700);
    }

    function spawnConflict(a, b, file) {
      let fixed = false;
      const tile = h("button", {
        class: "agent bad",
        onclick: () => { if (fixed) return; fixed = true; nYou++; you.set(nYou); resolve("you"); },
      }, h("span", { class: "face" }, "⚠️"), "cs" + b + " × cs" + a, h("br"), file);
      conflictLane.append(tile);
      const resolve = (who) => {
        tile.classList.remove("bad"); tile.classList.add("ok");
        tile.lastChild.textContent = who === "you" ? "fixed by YOU" : "fixed by Claude";
        tile.firstChild.textContent = who === "you" ? "🏆" : "⚡";
        addWal("cs" + ++seq + "  fix-up for " + file + " (" + (who === "you" ? "you" : "Claude") + ")  · CAS main " + main + "→" + (main + 1) + " ✓");
        main++; merged.set(main);
        sc.timeout(() => tile.remove(), 900);
      };
      sc.timeout(() => { if (fixed) return; fixed = true; nClaude++; claude.set(nClaude); resolve("claude"); }, 1100 + rnd() * 600);
    }

    function done() {
      api.card("l2-art-conflicts");
      api.card("l2-sim-ordering");
      api.say("bolt", "<b>" + main + "</b> changesets landed, <b>zero</b> pushes, <b>zero</b> rejections, and nobody waited in a queue. " +
        (nYou > nClaude ? "And you out-fixed Claude! 🏆" : "Claude fixed most conflicts before you could even blink. ⚡"), after);
      api.say("sprout", "This works because <b>no client holds the source of truth</b>. The server builds each changeset at a cost that scales with the size of the change, not the size of the repo.", after);
      api.complete("scion", 50);
      after.append(h("button", { class: "btn gold big", style: "margin-top:12px", onclick: () => api.next("debrief") }, "📜 Debrief →"));
    }
  }

  SQ.registerLevel({
    id: "push", num: 2, emoji: "🚗", title: "Rush Hour on main",
    tagline: "A swarm of agents all want to merge right now. Push, get rejected, rebase, repeat.",
    intro: "In git, a commit is built on <i>your</i> machine and then <b>pushed</b>. The server accepts it only if it fast-forwards the branch. " +
      "With thousands of agents merging a day, how does that scale?",
    summary: "Git updates a branch by pushing locally-built commits, and a push that isn't a fast-forward is rejected, so concurrent pushers end up retrying. " +
      "A serial merge queue avoids the races but caps throughput. Scion builds changesets on the server (nothing to push), moves refs with a compare-and-swap, " +
      "and tests after merging instead of using a global queue. Concurrent changes can still conflict; Claude fixes them quickly.",
    cards: {
      "l2-git-ff": { src: "git", title: "Non-fast-forward pushes get rejected",
        text: "A push updates a branch only if the new commit descends from the branch's current tip. If someone else pushed first, git rejects yours: you fetch, rebase or merge, then try again. Many simultaneous pushers means many retries." },
      "l2-art-queue": { src: "article", title: "No global merge queue",
        text: "Anthropic leans on post-merge and pre-deploy automated testing instead of a global merge-queue lock.",
        quote: "A proper merge queue, for example, doesn’t make much sense at agent scale." },
      "l2-art-server": { src: "article", title: "Nothing to push",
        text: "Commits, rebases and merges run on the server, and their cost scales with the size of the change, not the repo. Moving a ref is a compare-and-swap on a single database row, separate from creating changesets. Refs are discouraged except for main and release branches.",
        quote: "every commit, rebase, or merge happens on the server, so there’s nothing to push" },
      "l2-art-conflicts": { src: "article", title: "Conflicts happen, and get fixed fast",
        text: "Without a queue, concurrent changes can conflict. The article says that's acceptable because Claude fixes them quickly.",
        quote: "Claude can typically fix these conflicts faster than humans can even identify them." },
      "l2-sim-ordering": { src: "sim", title: "How this level simplifies things",
        text: "The article doesn't describe how the server orders concurrent changesets, or what happens when a ref compare-and-swap loses a race. Here every CAS succeeds and “conflict” just means two changes touched the same file in the same tick. The arrival rates and CI timings are invented." },
    },
    modes: { git, scion },
  });
})();
