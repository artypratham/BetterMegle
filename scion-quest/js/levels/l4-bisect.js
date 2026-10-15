/* Level 4 — Whodunit: bisecting with a shallow git clone vs. asking Scion's server over an API. */
(function () {
  const { h, fmtBytes } = SQ;
  const N = 32, CULPRIT = 21;
  const BILLING = new Set([4, 9, 15, 21, 27]); // changes that touched services/billing (incl. the culprit)
  const GB = 1e9;
  const isGood = (i) => i < CULPRIT;

  function chain(onClick) {
    const els = [];
    const box = h("div", { class: "chain" });
    for (let i = 1; i <= N; i++) {
      const el = h("button", { class: "commit", title: "cs" + i, onclick: () => onClick(i) }, String(i));
      els[i] = el; box.append(el);
    }
    return { box, els };
  }
  function findCulprit(tested) {
    for (let i = 1; i < N; i++) if (tested[i] === "good" && tested[i + 1] === "bad") return i + 1;
    return 0;
  }
  // Like findCulprit, but in Scion we may only test billing changes, so "adjacent" means adjacent among candidates.
  function findCulpritAmong(tested, cands) {
    for (let k = 0; k < cands.length - 1; k++) if (tested[cands[k]] === "good" && tested[cands[k + 1]] === "bad") return cands[k + 1];
    return tested[cands[0]] === "bad" ? cands[0] : 0;
  }

  // ------------------------------------------------------------------ GIT LAND
  function git(stage, api) {
    const sc = api.scope;
    api.say("bolt", "🚨 The billing build is red at HEAD (change 32). Somebody broke it in the last 32 changes. I have my trusty <b>shallow clone</b> from Level 1…");
    api.say("gitbert", "Classic bisect! Check out a commit, build, test, and halve the range. Oh, but your clone only has <b>one commit</b> of history. " +
      "Faded circles aren't on your disk. You'll need to <code>git fetch --deepen</code> first. 💸");

    const local = new Set([N]);
    const tested = { [N]: "bad" };
    let bytes = 0, checkouts = 0, busy = false, won = false;
    const ch = chain(test);
    const term = h("div", { class: "term" });
    const sBytes = h("div", { class: "v" }, "0 B"), sCo = h("div", { class: "v" }, "0");
    const deepen = h("button", { class: "btn git", onclick: doDeepen }, "📥 git fetch --deepen=8");
    const after = h("div");
    stage.append(h("div", { class: "panel git" },
      h("p", null, "Click a commit to <checkout + build + test> it. 🟢 good · 🔴 bad · faded = not in your clone."),
      ch.box,
      h("div", { class: "row", style: "margin:14px 0" }, deepen,
        h("div", { class: "stat git" }, h("div", { class: "k" }, "Downloaded for history"), sBytes),
        h("div", { class: "stat git" }, h("div", { class: "k" }, "Checkouts + builds"), sCo)),
      term), after);
    const log = (t, c) => { term.append(h("div", { class: c }, t)); term.scrollTop = term.scrollHeight; };

    function draw() {
      for (let i = 1; i <= N; i++) {
        const el = ch.els[i];
        el.className = "commit" + (local.has(i) ? "" : " unknown-local") + (tested[i] ? " " + tested[i] : "");
      }
    }

    async function doDeepen() {
      if (busy) return;
      busy = true; deepen.disabled = true;
      const oldest = Math.min(...local);
      if (oldest <= 1) { log("Already have the full history.", "dim"); busy = false; deepen.disabled = false; return; }
      log("git fetch --deepen=8", "cmd");
      for (let k = 0; k < 8; k++) {
        await sc.sleep(120);
        const i = oldest - 1 - k;
        if (i >= 1) local.add(i);
        bytes += 3 * GB / 8; sBytes.textContent = fmtBytes(bytes); draw();
      }
      log("remote: Enumerating objects… Receiving objects: 100% (toy: +3 GB)", "warn");
      busy = false; deepen.disabled = false;
      api.card("l4-git-history");
    }

    async function test(i) {
      if (busy || won || tested[i]) return;
      if (!local.has(i)) {
        log("git checkout cs" + i, "cmd");
        log("fatal: reference is not a tree: that commit isn't in your shallow clone. Deepen first.", "err");
        api.say("bolt", "I can't see that one. My memory only goes back " + (N - Math.min(...local) + 1) + " commits. 🫠", after);
        return;
      }
      busy = true;
      log("git checkout cs" + i + " && make test", "cmd");
      checkouts++; sCo.textContent = checkouts;
      ch.els[i].classList.add("probe");
      log("Updating working tree… building… testing…", "dim");
      await sc.sleep(700);
      tested[i] = isGood(i) ? "good" : "bad";
      log(tested[i] === "good" ? "✓ tests pass" : "✗ tests FAIL", tested[i] === "good" ? "ok" : "err");
      draw();
      busy = false;
      if (tested[i] === "good" && !api._bisectHint) {
        api._bisectHint = true;
        api.say("gitbert", "Found a good one! <code>git bisect</code> could automate the halving from here, but only over history you've <b>already downloaded</b>.", after);
      }
      const c = findCulprit(tested);
      if (c) win(c);
    }

    function win(c) {
      won = true;
      ch.els[c].classList.add("culprit");
      api.card("l4-git-bisect");
      api.say("bolt", "Got it! <b>Change " + c + "</b> broke billing. Cost: <b>" + fmtBytes(bytes) + "</b> of history downloaded and <b>" + checkouts + "</b> full checkouts. " +
        "Now a human writes a revert, commits it locally, and pushes it… (see Level 2 for how that goes). 😅", after);
      api.complete("git", 50);
      after.append(h("button", { class: "btn scion big", style: "margin-top:12px", onclick: () => api.next("scion") }, "🌱 Bisect the Scion way →"));
    }
    draw();
  }

  // ------------------------------------------------------------------ SCION LAND
  function scion(stage, api) {
    const sc = api.scope;
    api.say("sprout", "Same crime, but Bolt has <b>no local repository at all</b>. Source-control queries are an <b>API</b>: the server holds history and derived data. " +
      "Start by asking which changes touched <code>services/billing</code>.");

    const tested = { [N]: "bad" };
    let rpcs = 0, cands = null, busy = false, culprit = 0;
    const ch = chain(test);
    const term = h("div", { class: "term" });
    const sRpc = h("div", { class: "v" }, "0");
    const histBtn = h("button", { class: "btn scion", onclick: history }, "📡 pathHistory('services/billing')");
    const autoBtn = h("button", { class: "btn scion", onclick: auto, disabled: true }, "🤖 Run automated bisect pipeline");
    const revertBtn = h("button", { class: "btn gold", onclick: revert, disabled: true }, "↩ revert(culprit)");
    const after = h("div");
    stage.append(h("div", { class: "panel scion" },
      h("p", null, "After the path query, click a highlighted change to have CI <b>test it from a server diff</b> (no checkout), or let the pipeline do it."),
      ch.box,
      h("div", { class: "row", style: "margin:14px 0" }, histBtn, autoBtn, revertBtn),
      h("div", { class: "row", style: "margin-bottom:14px" },
        h("div", { class: "stat scion" }, h("div", { class: "k" }, "Repo bytes cloned"), h("div", { class: "v" }, "0 B")),
        h("div", { class: "stat scion" }, h("div", { class: "k" }, "API calls"), sRpc)),
      term), after);
    const log = (t, c) => { term.append(h("div", { class: c }, t)); term.scrollTop = term.scrollHeight; };
    const rpc = () => { rpcs++; sRpc.textContent = rpcs; };

    function draw() {
      for (let i = 1; i <= N; i++) {
        ch.els[i].className = "commit" + (cands && !cands.includes(i) && i !== N ? " unknown-local" : "") + (tested[i] ? " " + tested[i] : "") + (i === culprit ? " culprit" : "");
      }
    }

    async function history() {
      if (cands) return;
      histBtn.disabled = true;
      rpc();
      log("rpc pathHistory(path='services/billing', at=main)", "cmd");
      await sc.sleep(400);
      cands = [...BILLING].sort((a, b) => a - b);
      log("→ [" + cands.map((c) => "cs" + c).join(", ") + "]   (derived data, already cached on the server)", "ok");
      api.card("l4-art-api");
      autoBtn.disabled = false;
      draw();
      api.say("sprout", "Only 5 suspects instead of 32. Test them yourself, or hit the 🤖 pipeline button.", after);
    }

    async function test(i) {
      if (!cands || busy || culprit || tested[i] || !cands.includes(i)) return;
      busy = true;
      rpc();
      log("rpc diff(cs" + (i - 1) + " → cs" + i + ")  + run billing tests in CI", "cmd");
      ch.els[i].classList.add("probe");
      await sc.sleep(350);
      tested[i] = isGood(i) ? "good" : "bad";
      log(tested[i] === "good" ? "✓ pass" : "✗ FAIL", tested[i] === "good" ? "ok" : "err");
      busy = false;
      const c = findCulpritAmong(tested, cands);
      if (c) found(c); else draw();
    }

    async function auto() {
      if (!cands || busy || culprit) return;
      autoBtn.disabled = true;
      log("# automated bisect pipeline: binary search over candidates, via API only", "dim");
      let lo = 0, hi = cands.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        await test(cands[mid]);
        if (culprit) return;
        if (tested[cands[mid]] === "good") lo = mid + 1; else hi = mid;
      }
      if (!culprit) {
        if (!tested[cands[lo]]) await test(cands[lo]);
        if (!culprit) found(cands[lo]);
      }
    }

    function found(c) {
      culprit = c; draw();
      autoBtn.disabled = true; revertBtn.disabled = false; revertBtn.classList.add("wiggle");
      log("culprit: cs" + c, "warn");
      api.say("bolt", "Change " + c + " did it! And I never downloaded the repo. Hit <b>revert</b>.", after);
    }

    async function revert() {
      revertBtn.disabled = true; revertBtn.classList.remove("wiggle");
      rpc();
      log("rpc revert(cs" + culprit + ")  → server creates cs" + (N + 1) + "; CAS main " + N + "→" + (N + 1) + " ✓", "ok");
      await sc.sleep(300);
      api.card("l4-art-agents");
      api.card("l4-sim-narrow");
      api.say("sprout", "Found and reverted with <b>" + rpcs + "</b> API calls and <b>0 bytes</b> cloned. The revert was built server-side, so there was nothing to push.", after);
      api.complete("scion", 50);
      after.append(h("button", { class: "btn gold big", style: "margin-top:12px", onclick: () => api.next("debrief") }, "📜 Debrief →"));
    }
    draw();
  }

  SQ.registerLevel({
    id: "bisect", num: 4, emoji: "🔍", title: "Whodunit: Bisect the Bug",
    tagline: "The build is red. 32 suspects. Your clone remembers exactly one of them.",
    intro: "Commands like <code>log</code>, <code>blame</code> and <code>bisect</code> need <b>history</b>. In git, history has to be on your disk. In Scion, you ask the server.",
    summary: "In git, history queries run against your local object store, so a slimmed-down clone has to download more history before it can bisect, and every probe is a full checkout. " +
      "Scion exposes source-control queries through an API backed by server-side derived data (path history, blame, commit-graph skip lists), so jobs like automated bisect and revert need no local repository.",
    cards: {
      "l4-git-history": { src: "git", title: "Git history lives on your disk",
        text: "<code>git log</code>, <code>blame</code> and <code>bisect</code> read your local object store. A shallow clone must be deepened (<code>git fetch --deepen</code> / <code>--unshallow</code>) before you can go further back." },
      "l4-git-bisect": { src: "git", title: "git bisect",
        text: "Given one good and one bad commit, <code>git bisect</code> binary-searches the commits between them, checking each probe out into your working tree so you can test it." },
      "l4-art-api": { src: "article", title: "Source control as an API",
        text: "Scion exposes source-control queries through an API, so many jobs need no local repository. The server keeps dedicated derived data for file blame and path history, plus skip lists for the commit graph." },
      "l4-art-agents": { src: "article", title: "Built for automation",
        text: "The article says automated bisect and revert pipelines depend on that programmatic access. It also mentions Claude “superfans” that monitor individual components through telemetry and logs." },
      "l4-sim-narrow": { src: "sim", title: "How this level simplifies things",
        text: "Narrowing suspects with a path-history query, then testing per-changeset diffs, is our illustration. The article says these APIs and pipelines exist but doesn't describe how its bisect pipeline is implemented. The 3 GB per deepen is invented." },
    },
    modes: { git, scion },
  });
})();
