/* Scion Quest — engine (module 0).
 * Plain script, no build step: everything hangs off window.SQ so the game runs from file://.
 */
window.SQ = (function () {
  const STORE_KEY = "scion-quest-v1";
  const levels = [];
  const CAST = {
    gitbert: { face: "🦖", name: "Gitbert the Packfile-saurus" },
    sprout: { face: "🌱", name: "Sprout (Scion Land)" },
    bolt: { face: "🤖", name: "Bolt the agent" },
  };
  const SOURCES = {
    article: { cls: "src-article", label: "📰 Article" },
    git: { cls: "src-git", label: "🛠 Git fact" },
    sim: { cls: "src-sim", label: "🎮 Simplification" },
  };

  // ---------- persistence (best effort) ----------
  let state = { coins: 0, stars: {}, cards: [], unlockAll: false };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) state = Object.assign(state, JSON.parse(raw));
  } catch (e) { /* storage blocked: play without saving */ }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
    renderHud();
  }

  // ---------- tiny DOM helper ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "html") el.innerHTML = v;
        else if (k === "style") el.style.cssText = v;
        else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? "" : v);
      }
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const $ = (sel, root = document) => root.querySelector(sel);

  function fmtBytes(b) {
    const u = ["B", "KB", "MB", "GB", "TB", "PB", "EB"];
    let i = 0;
    while (b >= 1000 && i < u.length - 1) { b /= 1000; i++; }
    return (b >= 100 || i === 0 ? Math.round(b) : b.toFixed(1)) + " " + u[i];
  }
  function fmtNum(n) { return Math.round(n).toLocaleString("en-US"); }
  function hash(s) {
    let x = 2166136261;
    for (const c of String(s)) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619); }
    return (x >>> 0).toString(16).padStart(8, "0").slice(0, 7);
  }
  function rand(seed) { // deterministic PRNG (mulberry32) so levels replay the same way
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- toasts & narrator ----------
  function toast(msg, kind = "") {
    const t = h("div", { class: "toast " + kind }, msg);
    $("#toasts").append(t);
    setTimeout(() => t.remove(), 3200);
  }
  function say(container, who, text) {
    const c = CAST[who];
    const el = h("div", { class: "say " + who },
      h("div", { class: "who" }, c.face),
      h("div", { class: "bubble" }, h("b", { class: "name" }, c.name), h("span", { html: text })));
    container.append(el);
    return el;
  }

  // ---------- fact cards ----------
  const cardIndex = {}; // id -> {card, level}
  function renderCard(card) {
    const src = SOURCES[card.src];
    return h("div", { class: "card" },
      h("span", { class: "badge " + src.cls }, src.label),
      h("h4", null, card.title),
      h("p", { html: card.text }),
      card.quote ? h("blockquote", null, "“" + card.quote + "”") : null);
  }
  function unlockCard(id) {
    if (!cardIndex[id]) { console.warn("unknown card", id); return; }
    if (state.cards.includes(id)) return;
    state.cards.push(id);
    save();
    toast("📓 New fact card: " + cardIndex[id].card.title, "");
  }

  // ---------- levels ----------
  function registerLevel(def) {
    levels.push(def);
    levels.sort((a, b) => a.num - b.num);
    for (const [id, card] of Object.entries(def.cards || {})) cardIndex[id] = { card, level: def };
  }
  function starsOf(id) { return (state.stars[id] || []).length; }
  function isUnlocked(i) {
    if (state.unlockAll || i === 0) return true;
    const prev = levels[i - 1];
    return starsOf(prev.id) >= (prev.modes.git ? 2 : 1);
  }
  function award(levelId, mode, coins) {
    const got = state.stars[levelId] || (state.stars[levelId] = []);
    if (got.includes(mode)) return false;
    got.push(mode);
    state.coins += coins;
    save();
    toast("⭐ +" + coins + " Merge Coins", mode === "git" ? "git" : "scion");
    return true;
  }

  // ---------- scopes: timers that die when you leave a screen ----------
  let scope = null;
  function newScope() {
    if (scope) scope.dispose();
    const timers = new Set();
    const s = {
      alive: true,
      timeout(fn, ms) { const t = setTimeout(() => { timers.delete(t); if (s.alive) fn(); }, ms); timers.add(t); return t; },
      interval(fn, ms) { const t = setInterval(() => { if (s.alive) fn(); }, ms); timers.add(t); return t; },
      clear(t) { clearTimeout(t); clearInterval(t); timers.delete(t); },
      sleep(ms) { return new Promise((res) => s.timeout(res, ms)); }, // never resolves once disposed
      dispose() { s.alive = false; timers.forEach((t) => { clearTimeout(t); clearInterval(t); }); timers.clear(); },
    };
    scope = s;
    return s;
  }

  // ---------- screens ----------
  const app = () => $("#app");

  function showMap() {
    newScope();
    location.hash = "";
    const root = app();
    root.replaceChildren();
    root.append(
      h("section", { class: "hero" },
        h("h1", null, "git ", h("em", null, "vs"), " SCION"),
        h("p", null, "Anthropic's merge rate went from about 2,500 changes a day to over 30,000, and most of the clients were AI agents. " +
          "Git's design started to strain, so they built Scion. Play each level twice, once in 🦖 Git Land and once in 🌱 Scion Land, " +
          "and see what changed and why."),
        h("p", { class: "muted", style: "font-size:13px" },
          "Based on Anthropic's engineering post “Redesigning source control”. Numbers marked 📰 are quoted from it; in-game sizes are toy, scaled values."),
        h("div", { class: "cast" },
          ...Object.values(CAST).map((c) => h("div", null, c.face + " " + c.name)))),
      h("div", { class: "map" },
        ...levels.map((lv, i) => {
          const unlocked = isUnlocked(i);
          const total = lv.modes.git ? 3 : 1;
          const n = starsOf(lv.id);
          return h("button", {
            class: "node" + (unlocked ? "" : " locked"),
            disabled: !unlocked,
            onclick: () => openLevel(lv.id),
          },
            h("span", { class: "num" }, "LEVEL " + lv.num),
            h("span", { class: "stars" }, "★".repeat(n) + "☆".repeat(Math.max(0, total - n))),
            h("span", { class: "emoji" }, lv.emoji),
            h("h3", null, lv.title),
            h("p", null, lv.tagline));
        })),
      h("p", { class: "muted", style: "text-align:center;margin-top:24px;font-size:13px" },
        state.unlockAll ? "All levels unlocked." : h("button", {
          class: "btn small", onclick: () => { state.unlockAll = true; save(); showMap(); },
        }, "🔓 Just reading? Unlock all levels")));
  }

  function openLevel(id, startMode) {
    const lv = levels.find((l) => l.id === id);
    if (!lv) return showMap();
    location.hash = id;
    const root = app();
    root.replaceChildren();
    const stage = h("div");
    const modeNames = lv.modes.git
      ? [["git", "🦖 Git Land"], ["scion", "🌱 Scion Land"], ["debrief", "📜 Debrief"]]
      : [["debrief", "🏁 Finale"]];
    const tabs = h("div", { class: "tabs" });
    function renderTabs(active) {
      tabs.replaceChildren(...modeNames.map(([m, label]) =>
        h("button", { class: "tab " + m + (m === active ? " active" : ""), onclick: () => mount(m) },
          label, (state.stars[lv.id] || []).includes(m) ? h("span", { class: "tick" }, "✅") : null)));
    }
    function mount(mode) {
      const sc = newScope();
      renderTabs(mode);
      stage.replaceChildren();
      const api = {
        scope: sc,
        say: (who, text, where) => say(where || stage, who, text),
        card: unlockCard,
        complete(m, coins = 50) { award(lv.id, m, coins); renderTabs(mode); },
        next(m) { mount(m); window.scrollTo({ top: 0, behavior: "smooth" }); },
        level: lv,
      };
      if (mode === "debrief" && !lv.modes.debrief) defaultDebrief(stage, lv, api);
      else lv.modes[mode](stage, api);
    }
    const idx = levels.indexOf(lv);
    root.append(
      h("div", { class: "level-head" },
        h("button", { class: "btn small", onclick: showMap }, "← Map"),
        h("h2", null, lv.emoji + " " + lv.num + ". " + lv.title),
        levels[idx + 1] ? h("button", { class: "btn small", onclick: () => openLevel(levels[idx + 1].id) }, "Next level →") : null),
      lv.intro ? h("p", { class: "muted", html: lv.intro }) : null,
      tabs, stage);
    mount(startMode || modeNames[0][0]);
  }

  function defaultDebrief(stage, lv, api) {
    const ids = Object.keys(lv.cards || {});
    const have = ids.filter((id) => state.cards.includes(id));
    // Finishing a mode unlocks its cards; the debrief unlocks the rest as a reward for reading.
    ids.forEach(unlockCard);
    stage.append(
      h("div", { class: "panel" },
        h("h3", null, "📜 What you just learned"),
        lv.summary ? h("p", { html: lv.summary }) : null,
        have.length < ids.length ? h("p", { class: "muted" }, "Cards you hadn't earned in play were added to your journal too.") : null),
      h("div", { class: "cards", style: "margin-top:14px" }, ...ids.map((id) => renderCard(lv.cards[id]))));
    api.complete("debrief", 20);
  }

  // ---------- journal ----------
  function openJournal() {
    const list = $("#journal-list");
    list.replaceChildren();
    if (!state.cards.length) list.append(h("p", { class: "muted" }, "No cards yet. Play a level!"));
    for (const lv of levels) {
      const mine = Object.keys(lv.cards || {}).filter((id) => state.cards.includes(id));
      if (!mine.length) continue;
      list.append(h("h3", null, lv.emoji + " " + lv.title),
        h("div", { class: "cards" }, ...mine.map((id) => renderCard(lv.cards[id]))));
    }
    $("#journal").showModal();
  }

  function renderHud() {
    const c = $("#coins"); if (c) c.textContent = state.coins;
    const n = $("#card-count"); if (n) n.textContent = state.cards.length;
  }

  function boot() {
    $("#journal-btn").addEventListener("click", openJournal);
    $("#journal-close").addEventListener("click", () => $("#journal").close());
    document.querySelectorAll("[data-nav=map]").forEach((b) => b.addEventListener("click", showMap));
    renderHud();
    const id = location.hash.slice(1);
    if (id && levels.some((l) => l.id === id)) openLevel(id); else showMap();
  }

  return { h, $, fmtBytes, fmtNum, hash, rand, toast, say, renderCard, registerLevel, boot, state: () => state, SOURCES };
})();
