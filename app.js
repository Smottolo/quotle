(() => {
  "use strict";

  const DATA = [...window.QUOTLE_DATA].sort((a, b) => a.name.localeCompare(b.name));
  const I18N = window.QUOTLE_I18N;
  const SECTORS = window.QUOTLE_SECTORS;
  const MAX = 6;
  const EPOCH = new Date(2026, 10, 10); // giorno #1 = 10 novembre 2026
  const SEED = 20261110;
  const HINTS = ["sector", "country", "crash", "initial", "logo"];
  const LANG_NAMES = { it: "Italiano", en: "English", es: "Español", fr: "Français", de: "Deutsch" };

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- storage (può non essere disponibile: tutto è opzionale) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignora */ } },
  };

  // ---------- lingua ----------
  function detectLang() {
    const saved = store.get("quotle.lang");
    if (saved && I18N[saved]) return saved;
    for (const l of navigator.languages || [navigator.language || "en"]) {
      const code = (l || "").slice(0, 2).toLowerCase();
      if (I18N[code]) return code;
    }
    return "en";
  }
  let lang = detectLang();
  const t = (k, vars = {}) => (I18N[lang][k] ?? I18N.en[k] ?? k).replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? "");

  // ---------- scelta dell'azienda del giorno ----------
  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let r = Math.imul(a ^ (a >>> 15), 1 | a);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  const ORDER = (() => {
    const idx = DATA.map((_, i) => i), rnd = mulberry32(SEED);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    return idx;
  })();
  function todayIndex() {
    const n = new Date();
    return Math.max(0, Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - EPOCH) / 86400000));
  }
  const dailyCompany = (day) => DATA[ORDER[day % DATA.length]];

  // ---------- ricerca nomi ----------
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const keysOf = (c) => [c.name, c.ticker, ...c.aliases].map(norm);
  const findExact = (q) => { const n = norm(q); return n ? DATA.find((c) => keysOf(c).includes(n)) : undefined; };
  function search(q) {
    const n = norm(q);
    if (!n) return [];
    const starts = [], contains = [];
    for (const c of DATA) {
      const keys = keysOf(c);
      if (keys.some((k) => k.startsWith(n))) starts.push(c);
      else if (keys.some((k) => k.includes(n))) contains.push(c);
    }
    return [...starts, ...contains].slice(0, 8);
  }

  // ---------- analisi del grafico ----------
  function monthAt(c, i) {
    const [y, m] = c.start.split("-").map(Number);
    const tot = y * 12 + (m - 1) + i;
    return { year: Math.floor(tot / 12), month: tot % 12 };
  }
  function crashOf(c) {
    const s = c.series;
    let peak = 0, best = 0, peakIdx = 0, troughIdx = 0, bestPeak = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] > s[peak]) peak = i;
      const dd = 1 - s[i] / s[peak];
      if (dd > best) { best = dd; troughIdx = i; bestPeak = peak; }
    }
    peakIdx = bestPeak;
    return { peakIdx, troughIdx, depth: Math.round(best * 100), year: monthAt(c, troughIdx).year };
  }

  // ---------- stato ----------
  let mode = "daily";
  let day = todayIndex();
  let game; // { company, guesses: [name], done, won }

  function loadDaily() {
    day = todayIndex();
    const company = dailyCompany(day);
    const saved = store.get("quotle.daily");
    const guesses = saved && saved.day === day ? saved.guesses : [];
    game = makeGame(company, guesses);
  }
  function loadPractice(forceNew) {
    const saved = store.get("quotle.practice");
    let company = !forceNew && saved && DATA.find((c) => c.name === saved.name);
    if (!company) {
      const avoid = new Set([dailyCompany(todayIndex()).name, saved && saved.name]);
      const pool = DATA.filter((c) => !avoid.has(c.name));
      company = pool[Math.floor(Math.random() * pool.length)];
      store.set("quotle.practice", { name: company.name, guesses: [] });
    }
    game = makeGame(company, company && saved && saved.name === company.name && !forceNew ? saved.guesses : []);
  }
  function makeGame(company, guesses) {
    const won = guesses.includes(company.name);
    return { company, guesses: [...guesses], won, done: won || guesses.length >= MAX };
  }
  function save() {
    if (mode === "daily") store.set("quotle.daily", { day, guesses: game.guesses });
    else store.set("quotle.practice", { name: game.company.name, guesses: game.guesses });
  }
  function recordStats() {
    const st = store.get("quotle.stats", { played: 0, wins: 0, streak: 0, best: 0, lastWinDay: null, dist: [0, 0, 0, 0, 0, 0] });
    st.played++;
    if (game.won) {
      st.wins++;
      st.streak = st.lastWinDay === day - 1 ? st.streak + 1 : 1;
      st.best = Math.max(st.best, st.streak);
      st.lastWinDay = day;
      st.dist[game.guesses.length - 1]++;
    } else {
      st.streak = 0;
    }
    store.set("quotle.stats", st);
  }

  // ---------- azioni ----------
  function submitGuess(company) {
    if (game.done) return;
    if (!company) return toast(t("notInList"));
    if (game.guesses.includes(company.name)) return toast(t("already"));
    game.guesses.push(company.name);
    game.won = company.name === game.company.name;
    game.done = game.won || game.guesses.length >= MAX;
    save();
    if (game.done && mode === "daily") recordStats();
    $("#guessInput").value = "";
    closeSuggestions();
    render();
  }

  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg; el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
  }

  // ---------- autocompletamento ----------
  let sugg = [], active = -1;
  function renderSuggestions() {
    const ul = $("#suggestions");
    ul.innerHTML = sugg.map((c, i) =>
      `<li role="option" data-i="${i}" class="${i === active ? "active" : ""} ${game.guesses.includes(c.name) ? "used" : ""}">
        <span>${esc(c.name)}</span><small>${esc(c.ticker)}</small></li>`).join("");
  }
  function closeSuggestions() { sugg = []; active = -1; renderSuggestions(); }

  // ---------- grafico ----------
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function drawChart() {
    const canvas = $("#chart");
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const c = game.company, s = c.series;
    const misses = game.guesses.filter((g) => g !== c.name).length;
    const showCrash = game.done || misses > HINTS.indexOf("crash");
    const padL = 6, padR = 10, padT = 14, padB = game.done ? 26 : 10;
    const min = Math.min(...s), max = Math.max(...s);
    const x = (i) => padL + (i / (s.length - 1)) * (w - padL - padR);
    const y = (v) => padT + (1 - (v - min) / (max - min || 1)) * (h - padT - padB);
    const accent = css("--accent"), muted = css("--muted"), gold = css("--gold");

    // griglia
    ctx.strokeStyle = "rgba(255,255,255,.05)"; ctx.lineWidth = 1;
    for (let k = 0; k <= 4; k++) {
      const yy = padT + (k / 4) * (h - padT - padB);
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w - padR, yy); ctx.stroke();
    }
    // linea base 100
    if (min < 100 && max > 100) {
      ctx.setLineDash([4, 5]); ctx.strokeStyle = "rgba(255,255,255,.18)";
      ctx.beginPath(); ctx.moveTo(padL, y(100)); ctx.lineTo(w - padR, y(100)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = muted; ctx.font = "500 10px 'JetBrains Mono', monospace";
      ctx.fillText("100", padL + 2, y(100) - 5);
    }
    // area
    const grad = ctx.createLinearGradient(0, padT, 0, h - padB);
    grad.addColorStop(0, "rgba(94,230,168,.28)"); grad.addColorStop(1, "rgba(94,230,168,0)");
    ctx.beginPath();
    s.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.lineTo(x(s.length - 1), h - padB); ctx.lineTo(x(0), h - padB); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    // linea
    ctx.beginPath();
    s.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.strokeStyle = accent; ctx.lineWidth = 2.2; ctx.lineJoin = "round"; ctx.stroke();

    // crollo più grosso
    if (showCrash) {
      const cr = crashOf(c);
      ctx.fillStyle = "rgba(255,207,92,.08)";
      ctx.fillRect(x(cr.peakIdx), padT, x(cr.troughIdx) - x(cr.peakIdx), h - padT - padB);
      ctx.fillStyle = gold;
      ctx.beginPath(); ctx.arc(x(cr.troughIdx), y(s[cr.troughIdx]), 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.font = "600 12px 'JetBrains Mono', monospace";
      const label = `${cr.year}  −${cr.depth}%`;
      const tw = ctx.measureText(label).width;
      let lx = x(cr.troughIdx) - tw / 2;
      lx = Math.max(padL, Math.min(lx, w - padR - tw));
      let ly = y(s[cr.troughIdx]) + 20;
      if (ly > h - padB - 2) ly = y(s[cr.troughIdx]) - 12;
      ctx.fillText(label, lx, ly);
    }
    // punto finale
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(x(s.length - 1), y(s[s.length - 1]), 4, 0, Math.PI * 2); ctx.fill();

    // anni sull'asse (solo a partita finita)
    if (game.done) {
      ctx.fillStyle = muted; ctx.font = "500 10px 'JetBrains Mono', monospace";
      const years = Math.ceil(s.length / 12);
      const step = years > 6 ? 2 : 1;
      for (let i = 0; i < s.length; i++) {
        const m = monthAt(c, i);
        if (m.month === 0 && m.year % step === 0) {
          const lbl = String(m.year), tw = ctx.measureText(lbl).width;
          const xx = Math.max(padL, Math.min(x(i) - tw / 2, w - padR - tw));
          ctx.fillText(lbl, xx, h - 8);
        }
      }
    }
  }

  // ---------- testi degli indizi ----------
  function flag(code) { return code.toUpperCase().replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0))); }
  function countryName(code) {
    try { return new Intl.DisplayNames([lang], { type: "region" }).of(code); } catch { return code; }
  }
  const logoUrl = (c) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(c.domain)}&sz=128`;
  function hintValue(key, c) {
    switch (key) {
      case "sector": return esc((SECTORS[c.sector] || {})[lang] || (SECTORS[c.sector] || {}).en || c.sector);
      case "country": return `${flag(c.country)} ${esc(countryName(c.country))}`;
      case "crash": { const cr = crashOf(c); return esc(t("hint_crashText", { depth: cr.depth, year: cr.year })); }
      case "initial": return `<span class="initial">${esc([...c.name][0].toUpperCase())}</span>`;
      case "logo": return `<img class="logo" src="${logoUrl(c)}" alt="" referrerpolicy="no-referrer">`;
    }
  }

  // ---------- rendering ----------
  function applyStaticTexts() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $("#guessInput").placeholder = t("placeholder");
  }

  function render() {
    const c = game.company;
    const misses = game.guesses.filter((g) => g !== c.name).length;

    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    $("#dayNum").textContent = `#${day + 1}`;

    // input
    $("#playArea").classList.toggle("hidden", game.done);
    $("#attemptLabel").textContent = t("attempt", { n: game.guesses.length + 1, max: MAX });

    // tentativi
    $("#guesses").innerHTML = game.guesses.map((name) => {
      const g = DATA.find((d) => d.name === name);
      const correct = name === c.name;
      const chips = correct || !g ? "" : [
        g.sector === c.sector ? `<span class="chip match">${esc(t("sameSector"))}</span>` : "",
        g.country === c.country ? `<span class="chip match">${esc(t("sameCountry"))}</span>` : "",
      ].join("");
      return `<li class="guess-row ${correct ? "correct" : ""}"><span class="name">${esc(name)}</span><span class="chips">${chips}</span></li>`;
    }).join("");

    // indizi
    $("#hintList").innerHTML = HINTS.map((key, i) => {
      const open = game.done || misses > i;
      const lockText = i === 0 ? t("hintLocked1") : t("hintLocked", { n: i + 1 });
      return `<div class="hint ${open ? "open" : "locked"}">
        <div class="label"><span>${esc(t("hint_" + key))}</span><span>${i + 1}</span></div>
        <div class="value">${open ? hintValue(key, c) : esc(lockText)}</div></div>`;
    }).join("");
    if (game.done) document.querySelectorAll(".hint img.logo").forEach((img) => (img.style.filter = "none"));

    renderResult();
    renderStats();
    drawChart();
  }

  function fmtMonth(c, i) {
    const m = monthAt(c, i);
    return new Intl.DateTimeFormat(lang, { month: "short", year: "numeric" }).format(new Date(m.year, m.month, 1));
  }

  function renderResult() {
    const box = $("#result");
    if (!game.done) { box.classList.add("hidden"); box.innerHTML = ""; return; }
    const c = game.company, s = c.series;
    const ret = Math.round((s[s.length - 1] / s[0] - 1) * 100);
    const score = game.won ? `${game.guesses.length}/${MAX}` : `X/${MAX}`;
    box.classList.remove("hidden");
    box.innerHTML = `
      <div class="head">
        <img src="${logoUrl(c)}" alt="" referrerpolicy="no-referrer">
        <div>
          <div class="verdict">${esc(game.won ? t("win") : t("lose"))} · ${score}</div>
          <div class="company">${esc(c.name)}</div>
        </div>
      </div>
      <div class="facts">
        <div><span class="muted">${esc(t("totalReturn"))}</span><b class="${ret >= 0 ? "up" : "down"}">${ret >= 0 ? "+" : ""}${ret}%</b></div>
        <div><span class="muted">Ticker</span><b class="mono">${esc(c.ticker)}</b></div>
        <div><span class="muted">${flag(c.country)}</span><b>${esc(t("period", { start: fmtMonth(c, 0), end: fmtMonth(c, s.length - 1) }))}</b></div>
      </div>
      <div class="actions">
        <button class="btn primary" id="shareBtn">${esc(t("share"))}</button>
        ${mode === "daily"
          ? `<span class="countdown">${esc(t("next"))} <span id="countdown" class="mono"></span></span>`
          : `<button class="btn" id="againBtn">${esc(t("playAgain"))}</button>`}
      </div>`;
    $("#shareBtn").onclick = share;
    if ($("#againBtn")) $("#againBtn").onclick = () => { loadPractice(true); render(); };
    tickCountdown();
  }

  function renderStats() {
    const st = store.get("quotle.stats", { played: 0, wins: 0, streak: 0, best: 0 });
    const pct = st.played ? Math.round((st.wins / st.played) * 100) : 0;
    $("#stats").innerHTML = [
      [st.played, t("statsPlayed")], [pct, t("statsWin")], [st.streak, t("statsStreak")], [st.best, t("statsBest")],
    ].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${esc(l)}</span></div>`).join("");
  }

  // ---------- condivisione ----------
  function share() {
    const c = game.company;
    const squares = game.guesses.map((g) => (g === c.name ? "🟩" : "🟥")).join("") + "⬜".repeat(MAX - game.guesses.length);
    const title = mode === "daily" ? `Quotle #${day + 1}` : "Quotle";
    const score = game.won ? `${game.guesses.length}/${MAX}` : `X/${MAX}`;
    let text = `📈 ${title} — ${score}\n${squares}`;
    if (/^https?:/.test(location.href)) text += `\n${location.origin}${location.pathname}`;
    const done = () => toast(t("copied"));
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } else fallbackCopy(text, done);
  }
  function fallbackCopy(text, cb) {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); cb(); } catch { /* niente */ }
    ta.remove();
  }
  // il toast sta nell'area di gioco, nascosta a fine partita: lo spostiamo nel risultato
  const _toast = toast;
  toast = function (msg) {
    if (game.done) {
      const btn = $("#shareBtn");
      if (btn) { const old = btn.textContent; btn.textContent = "✓ " + msg; setTimeout(() => (btn.textContent = old), 1600); }
      return;
    }
    _toast(msg);
  };

  // ---------- conto alla rovescia ----------
  function tickCountdown() {
    const el = $("#countdown");
    if (!el) return;
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const sec = Math.max(0, Math.floor((next - now) / 1000));
    const p = (n) => String(n).padStart(2, "0");
    el.textContent = `${p(Math.floor(sec / 3600))}:${p(Math.floor((sec % 3600) / 60))}:${p(sec % 60)}`;
  }
  setInterval(() => {
    if (mode === "daily" && todayIndex() !== day) { loadDaily(); render(); return; }
    tickCountdown();
  }, 1000);

  // ---------- eventi ----------
  const input = $("#guessInput");
  input.addEventListener("input", () => { sugg = search(input.value); active = sugg.length ? 0 : -1; renderSuggestions(); });
  input.addEventListener("keydown", (e) => {
    if (!sugg.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); active = (active + 1) % sugg.length; renderSuggestions(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = (active - 1 + sugg.length) % sugg.length; renderSuggestions(); }
    else if (e.key === "Escape") closeSuggestions();
  });
  input.addEventListener("blur", () => setTimeout(closeSuggestions, 150));
  $("#suggestions").addEventListener("mousedown", (e) => {
    const li = e.target.closest("li");
    if (li) { e.preventDefault(); submitGuess(sugg[+li.dataset.i]); }
  });
  $("#guessForm").addEventListener("submit", (e) => {
    e.preventDefault();
    // corrispondenza esatta prima, a meno che l'utente non abbia scelto con le frecce
    const pick = (active > 0 ? sugg[active] : null) || findExact(input.value) || sugg[active];
    submitGuess(pick);
  });

  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => {
    mode = b.dataset.mode;
    mode === "daily" ? loadDaily() : loadPractice(false);
    closeSuggestions(); input.value = "";
    render();
  }));

  const sel = $("#lang");
  sel.innerHTML = Object.keys(I18N).map((l) => `<option value="${l}">${LANG_NAMES[l] || l}</option>`).join("");
  sel.value = lang;
  sel.addEventListener("change", () => { lang = sel.value; store.set("quotle.lang", lang); applyStaticTexts(); render(); });

  $("#helpBtn").addEventListener("click", () => $("#help").showModal());
  let resizeTimer;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(drawChart, 100); });

  // ---------- avvio ----------
  applyStaticTexts();
  loadDaily();
  render();
  if (document.fonts) document.fonts.ready.then(drawChart);
  if (!store.get("quotle.seenHelp")) { $("#help").showModal(); store.set("quotle.seenHelp", true); }
})();
