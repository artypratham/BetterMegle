/* Level 5 — Cache Tower: babysitting git mirrors vs. Scion's daemon → regional cache → server tiers. */
(function () {
  const { h, rand, fmtNum } = SQ;

  // ------------------------------------------------------------------ GIT LAND
  function git(stage, api) {
    const sc = api.scope;
    api.say("gitbert", "Too many clones hammering the main server? Easy: <b>mirrors</b>! Each mirror serves clones. But <code>main</code> keeps moving, so mirrors (and the pre-baked repo <b>seeds</b>) drift out of date. " +
      "Click a mirror to <b>resync</b> it (it goes offline for a moment). Add mirrors when demand outgrows you.");
    api.say("bolt", "Demand rises every tick as the merge rate climbs. Keep me fed and keep me fresh! 🍽️");

    const TICKS = 30, CAP = 2;
    let mirrors = Array.from({ length: 6 }, () => ({ stale: 0, down: 0 }));
    let tick = 0, served = 0, dropped = 0, staleServes = 0, toil = 0, running = false;
    const grid = h("div", { class: "mirror-grid" });
    const s = (k) => { const v = h("div", { class: "v" }, "0"); return { v, el: h("div", { class: "stat git" }, h("div", { class: "k" }, k), v) }; };
    const sMerge = s("Merges/day (📰 range)"), sServed = s("Clones served"), sDrop = s("Dropped (overloaded)"), sStale = s("Served stale seeds"), sMir = s("Mirrors"), sToil = s("Your toil clicks");
    const addBtn = h("button", { class: "btn git", onclick: () => { mirrors.push({ stale: 0, down: 0 }); toil++; draw(); } }, "➕ Spin up a mirror");
    const startBtn = h("button", { class: "btn git big", onclick: start }, "▶ Open for business (30 ticks)");
    const after = h("div");
    stage.append(h("div", { class: "panel git" },
      h("div", { class: "row", style: "margin-bottom:12px" }, startBtn, addBtn),
      h("div", { class: "row", style: "margin-bottom:12px" }, sMerge.el, sMir.el, sToil.el),
      h("div", { class: "row", style: "margin-bottom:12px" }, sServed.el, sDrop.el, sStale.el),
      h("p", { class: "muted", style: "font-size:13px" }, "🪞 fresh · 🟨 drifting · 🟧 stale · 🟥 ancient · 💤 resyncing"),
      grid), after);

    function draw() {
      // update buttons in place so a click isn't lost to a re-render mid-tick
      mirrors.forEach((m) => {
        if (!m.el) {
          m.el = h("button", { onclick: () => { if (!m.down) { m.stale = 0; m.down = 2; toil++; draw(); } } });
          grid.append(m.el);
        }
        const lvl = m.down ? 0 : m.stale >= 10 ? 3 : m.stale >= 7 ? 2 : m.stale >= 4 ? 1 : 0;
        m.el.className = "mirror" + (lvl ? " stale" + lvl : "");
        m.el.title = "stale for " + m.stale + " ticks";
        m.el.textContent = m.down ? "💤" : "🪞";
      });
      sMir.v.textContent = mirrors.length; sToil.v.textContent = toil;
      sServed.v.textContent = fmtNum(served); sDrop.v.textContent = fmtNum(dropped); sStale.v.textContent = fmtNum(staleServes);
    }

    function start() {
      if (running) return;
      running = true; startBtn.disabled = true;
      const iv = sc.interval(() => {
        tick++;
        // article: ~2,500 merges/day in May 2026 → over 30,000/day by September
        sMerge.v.textContent = fmtNum(2500 + (27500 * tick) / TICKS);
        const demand = Math.round(4 + tick * 0.9);
        let cap = 0;
        mirrors.forEach((m) => {
          if (m.down) { m.down--; return; }
          m.stale++;
          cap += CAP;
        });
        const live = mirrors.filter((m) => !m.down);
        const got = Math.min(demand, cap);
        served += got; dropped += demand - got;
        // share served clones across live mirrors; anything from a stale mirror is a stale seed
        if (live.length) {
          const per = got / live.length;
          live.forEach((m) => { if (m.stale >= 7) staleServes += per; });
        }
        draw();
        if (tick >= TICKS) { sc.clear(iv); over(); }
      }, 600);
    }

    function over() {
      api.card("l5-art-mirrors");
      api.card("l5-git-mirrors");
      api.say("bolt", "You ended with <b>" + mirrors.length + "</b> mirrors and <b>" + toil + "</b> toil clicks; <b>" + fmtNum(dropped) + "</b> clones dropped and <b>" + fmtNum(staleServes) + "</b> served from stale seeds. " +
        "The article says that at peak Anthropic ran <b>several hundred</b> internal git mirrors. 🫡", after);
      api.say("gitbert", "Every mirror is another full copy that has to be kept in sync. More load → more copies → more drift → more toil. I'm going to lie down. 🦖💤", after);
      api.complete("git", 50);
      after.append(h("button", { class: "btn scion big", style: "margin-top:12px", onclick: () => api.next("scion") }, "🌱 Climb the Scion tower →"));
    }
    draw();
  }

  // ------------------------------------------------------------------ SCION LAND
  class LRU {
    constructor(size) { this.size = size; this.m = new Map(); }
    has(k) { if (!this.m.has(k)) return false; this.m.delete(k); this.m.set(k, 1); return true; }
    add(k) { this.m.set(k, 1); if (this.m.size > this.size) this.m.delete(this.m.keys().next().value); }
  }

  function scion(stage, api) {
    const sc = api.scope;
    api.say("sprout", "Scion has three tiers, and they all answer the <b>same RPCs</b>, so the client doesn't know or care which one it's talking to: " +
      "<b>scion-daemon</b> on each node, a regional <b>scion-cache</b>, and the authoritative <b>scion-server</b>. Objects are content-addressed, so any tier can cache them safely.");
    api.say("bolt", "Experiment! 💥 <b>Break Region A's cache</b>, then flip <b>strict tiering</b> off and on. Who gets hurt each time?");

    const OBJECTS = 600, NODES_PER_REGION = 3, REQ_PER_NODE = 30, SERVER_CAP = 12;
    const rnd = rand(99);
    const cdf = []; let acc = 0;
    for (let k = 0; k < OBJECTS; k++) { acc += 1 / Math.pow(k + 1, 1.15); cdf.push(acc); }
    const sample = () => { const x = rnd() * acc; let lo = 0, hi = OBJECTS - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < x) lo = m + 1; else hi = m; } return lo; };
    // warm start: load the most popular objects (oldest-first so the hottest end up most recent)
    const snapshot = (lru, n = 120) => { for (let k = n; k >= 0; k--) lru.add(k); };

    const regions = ["A", "B"].map((name) => ({
      name, down: false,
      daemons: Array.from({ length: NODES_PER_REGION }, () => { const l = new LRU(150); snapshot(l); return l; }),
      cache: (() => { const l = new LRU(450); snapshot(l, 440); return l; })(),
      st: { dHit: 0, dTot: 0, cHit: 0, cTot: 0, fail: 0, ok: 0 },
    }));
    let strict = true, sawMelt = false, isolatedTicks = 0, finished = false;
    const hist = [];

    const ui = {};
    const meter = (cls) => { const b = h("div", { class: "bar " + cls }, h("i")); return b; };
    const setMeter = (b, p) => (b.firstChild.style.width = Math.max(0, Math.min(100, p * 100)) + "%");
    ui.serverMeter = meter("scion"); ui.serverTxt = h("span", { class: "mono" });
    ui.serverTier = h("div", { class: "tier" }, h("div", { class: "label" }, "🏛 scion-server"), h("div", { class: "meter" }, ui.serverMeter), ui.serverTxt);
    const regionRows = regions.map((r) => {
      const cm = meter("scion"), dm = meter("scion"), ct = h("span", { class: "mono" }), dt = h("span", { class: "mono" }), ft = h("span", { class: "mono" });
      const brk = h("button", { class: "btn small", onclick: () => { r.down = !r.down; brk.textContent = r.down ? "🔧 Repair" : "💥 Break"; } }, "💥 Break");
      const cacheRow = h("div", { class: "tier" }, h("div", { class: "label" }, "🗄 cache · region " + r.name), h("div", { class: "meter" }, cm), ct, brk);
      const dRow = h("div", { class: "tier" }, h("div", { class: "label" }, "🖥 daemons · region " + r.name), h("div", { class: "meter" }, dm), dt, ft);
      return { r, cm, dm, ct, dt, ft, cacheRow, dRow };
    });
    const strictBox = h("input", { type: "checkbox", checked: true, onchange: (e) => (strict = e.target.checked) });
    const restartBtn = h("button", { class: "btn scion small", onclick: () => regions.forEach((r) => r.daemons.forEach((d) => { d.m.clear(); snapshot(d); })) }, "🔄 Restart daemons from snapshot");
    const after = h("div");

    stage.append(
      h("div", { class: "panel scion" },
        h("div", { class: "row", style: "margin-bottom:12px" },
          h("label", { class: "row", style: "gap:6px" }, strictBox, h("b", null, "Strict tiering"), h("span", { class: "muted" }, "(daemons may only talk to their regional cache)")),
          restartBtn),
        h("div", { class: "tower" },
          ui.serverTier,
          h("div", { class: "grid2" }, regionRows[0].cacheRow, regionRows[1].cacheRow),
          h("div", { class: "grid2" }, regionRows[0].dRow, regionRows[1].dRow)),
        h("p", { class: "muted", style: "font-size:13px;margin-top:10px" },
          "Meters show each tier's hit rate over the last few ticks. The server meter shows load against its capacity. Mirrors to babysit: 0.")),
      after);

    sc.interval(() => {
      let serverLoad = 0;
      const pending = []; // {region, fromBypass}
      for (const r of regions) {
        for (const d of r.daemons) {
          for (let i = 0; i < REQ_PER_NODE; i++) {
            const k = sample();
            r.st.dTot++;
            if (d.has(k)) { r.st.dHit++; r.st.ok++; continue; }
            if (!r.down) {
              r.st.cTot++;
              if (r.cache.has(k)) { r.st.cHit++; r.st.ok++; d.add(k); continue; }
              pending.push({ r, d, k, viaCache: true });
            } else if (strict) {
              r.st.fail++; // fail fast inside the broken region; upstream is protected
            } else {
              pending.push({ r, d, k, viaCache: false }); // bypass straight to the server
            }
          }
        }
      }
      // Regional caches coalesce duplicate misses before going upstream; bypassing daemons can't.
      const seen = new Set();
      const upstream = pending.filter((p) => {
        if (!p.viaCache) return true;
        const key = p.r.name + ":" + p.k;
        if (seen.has(key)) return false;
        seen.add(key); return true;
      });
      serverLoad = upstream.length;
      const melt = serverLoad > SERVER_CAP;
      const keep = melt ? SERVER_CAP / serverLoad : 1;
      for (const p of pending) {
        if (rnd() < keep) { p.r.st.ok++; if (p.viaCache) p.r.cache.add(p.k); p.d.add(p.k); }
        else p.r.st.fail++;
      }

      hist.push(regions.map((r) => ({ ...r.st })));
      regions.forEach((r) => Object.keys(r.st).forEach((k) => (r.st[k] = 0)));
      if (hist.length > 6) hist.shift();
      const sum = (i, k) => hist.reduce((s, w) => s + w[i][k], 0);

      setMeter(ui.serverMeter, serverLoad / SERVER_CAP);
      ui.serverTxt.textContent = "load " + serverLoad + "/" + SERVER_CAP + (melt ? " 🔥 OVERLOADED" : " ✓");
      ui.serverTier.classList.toggle("melt", melt);
      regionRows.forEach((row, i) => {
        const dRate = sum(i, "dHit") / Math.max(1, sum(i, "dTot"));
        const cRate = sum(i, "cHit") / Math.max(1, sum(i, "cTot"));
        const fails = sum(i, "fail"), total = fails + sum(i, "ok");
        setMeter(row.dm, dRate); setMeter(row.cm, row.r.down ? 0 : cRate);
        row.dt.textContent = "hit " + (dRate * 100).toFixed(0) + "%";
        row.ct.textContent = row.r.down ? "DOWN" : "hit " + (cRate * 100).toFixed(0) + "%";
        row.ft.textContent = "failed " + ((fails / Math.max(1, total)) * 100).toFixed(1) + "%";
        row.cacheRow.classList.toggle("down", row.r.down);
        row.dRow.classList.toggle("down", fails > 0);
      });

      const anyDown = regions.some((r) => r.down);
      if (anyDown && !strict && melt && !sawMelt) {
        sawMelt = true;
        api.card("l5-sim-tower");
        api.say("bolt", "🔥 Without strict tiering, the broken region's daemons stampeded the server, and now <b>the healthy region is failing too</b>! Turn strict tiering back on.", after);
      }
      if (anyDown && strict) isolatedTicks++; else isolatedTicks = 0;
      if (sawMelt && isolatedTicks >= 3 && !finished) {
        finished = true;
        api.card("l5-art-tiers");
        api.card("l5-art-results");
        api.say("sprout", "With strict tiering on, the damage stays <b>inside the broken region</b>: its daemons still serve what they hold, but nothing floods the server, so the other region doesn't notice. " +
          "That's a failure domain. Tiers keep no long-lived state, so a restarted daemon just reloads its snapshot.", after);
        api.complete("scion", 50);
        after.append(h("button", { class: "btn gold big", style: "margin-top:12px", onclick: () => api.next("debrief") }, "📜 Debrief →"));
      }
    }, 500);
  }

  SQ.registerLevel({
    id: "cache", num: 5, emoji: "🗼", title: "Cache Tower",
    tagline: "Hundreds of mirrors to babysit, or three tiers that answer the same RPCs.",
    intro: "Millions of fetches a day have to be served by <i>something</i>. Git Land answers with more full copies. Scion Land answers with layered, content-addressed caches.",
    summary: "Scaling git reads meant running more mirrors and pre-built seeds, which are full copies that drift behind main and need constant care (the article says that at peak there were several hundred mirrors). " +
      "Scion uses a per-node daemon, a regional cache, and an authoritative server that all speak the same RPCs. Content addressing makes caching safe, " +
      "and strictly enforced tiering keeps a regional failure from overwhelming the servers.",
    cards: {
      "l5-git-mirrors": { src: "git", title: "Mirrors are full copies",
        text: "A git mirror is a complete clone kept in sync with the origin. Every mirror and every pre-baked seed is another copy that lags behind until it's refreshed." },
      "l5-art-mirrors": { src: "article", title: "The pre-Scion workarounds",
        text: "The article lists shallow clones, sparse checkouts, promisor remotes, internal mirrors, and blob-stored seeds. It says merges grew from about 2,500 a day in May 2026 to over 30,000 a day by September.",
        quote: "At our peak, we operated several hundred internal git mirrors to deal with the load." },
      "l5-art-tiers": { src: "article", title: "Three tiers, one protocol",
        text: "scion-daemon (per node, reached over a socket, starts from a periodically refreshed snapshot) → scion-cache (regional, streams objects from memory) → scion-server (authoritative, reads Spanner or cloud storage on a miss). All three answer identical RPCs, and tiering is strictly enforced so that a regional cache failure can't overwhelm upstream servers." },
      "l5-art-results": { src: "article", title: "Reported results",
        text: "Per the article: each tier keeps a cache hit rate above 99% and holds no long-lived state; the infrastructure is 200x smaller in CPU and memory than the old git mirroring setup; CI and research checkouts are about two orders of magnitude faster (seconds rather than minutes); CI gained a 25% CPU capacity win. Please verify these figures against the post." },
      "l5-sim-tower": { src: "sim", title: "How this level simplifies things",
        text: "Hit rates here come from a toy LRU and a Zipf-shaped request mix, so they're lower than the article's >99%. The article doesn't say what clients see when their regional cache is down. Here they fail fast, and the “no strict tiering” mode is invented to show why isolation matters." },
    },
    modes: { git, scion },
  });
})();
