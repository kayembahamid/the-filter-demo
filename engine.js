/* =========================================================================
   THE FILTER AI · engine.js
   Game logic for the Mimo-style units/steps model.

   Reads UNITS (and helpers) from content.js.
   Reads certificateRank / buildCertificateSVG / downloadCertificatePNG from
   certificate.js. No inline scripts, no server, no build step.

   Each unit is an ordered `steps` array that interleaves:
     "teach"          read-only micro-lesson (no XP, Continue only)
     "allow-block"    Allow or Block
     "tap-injection"  tap the malicious span
     "name-technique" pick the OWASP category (two tries)

   Every exercise carries its own `xp`, a `difficulty`, and an `impact` block
   ({ headline, detail }) rendered after the answer as the "stakes" footnote.
   ========================================================================= */

(function () {
  "use strict";

  /* ---------- config (editable in index.html via data-* on #app) ---------- */
  var appEl = document.getElementById("app");
  var CONFIG = {
    purchaseKey: (appEl && appEl.dataset.purchaseKey) || "",
    gumroadUrl:  (appEl && appEl.dataset.gumroadUrl)  || "https://hamcodes.gumroad.com/l/jxdjnw"
  };

  var STORAGE_KEY  = "thefilter_state";
  var PURCHASE_KEY = "thefilter_purchase_key";

  // Free-only build: the public deploy ships Unit 1 plus locked placeholders
  // for the paid units. In this mode paid units never unlock and the gate has
  // no key box (there is no paid content on the page to unlock).
  var FREE_ONLY = !!(appEl && appEl.dataset.freeOnly === "true");

  /* ---------- flatten UNITS -> ordered step list with context ----------
     FLAT[i] = { unit, unitIndex, step, stepIndexInUnit,
                 isFirstStepInUnit, isLastStepInUnit, isExercise, exerciseNo } */
  var FLAT = [];
  var UNIT_META = [];              // per-unit { unit, firstPos, lastPos }
  (function buildIndex() {
    var exCount = 0;
    UNITS.forEach(function (u, ui) {
      var firstPos = FLAT.length;
      u.steps.forEach(function (s, si) {
        var isEx = s.type !== "teach";
        if (isEx) exCount++;
        FLAT.push({
          unit: u, unitIndex: ui, step: s,
          stepIndexInUnit: si,
          isFirstStepInUnit: si === 0,
          isLastStepInUnit: si === u.steps.length - 1,
          isExercise: isEx,
          exerciseNo: isEx ? exCount : null
        });
      });
      UNIT_META.push({ unit: u, firstPos: firstPos, lastPos: FLAT.length - 1 });
    });
  })();

  var N_STEPS = FLAT.length;                 // 54
  var N_EX    = ALL_EXERCISES.length;        // 35 (from content.js)
  var N_UNITS = UNITS.length;                // 7
  var FREE_EX = FREE_UNITS.reduce(function (n, u) {
    return n + u.steps.filter(function (s) { return s.type !== "teach"; }).length;
  }, 0);                                     // 5

  var $ = function (id) { return document.getElementById(id); };
  var screenEl = $("screen");

  /* ---------- state ---------- */
  function defaultState() {
    return {
      xp: 0, streak: 0, bestStreak: 0,
      pos: 0,
      falseAlarms: 0, breaches: 0, caughtAttacks: 0,
      correctTotal: 0, totalAnswered: 0,
      awardedBonuses: [],   // unit ids that have paid out their bonus
      unitStart: null       // snapshot at current unit's first step
    };
  }
  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return Object.assign(defaultState(), JSON.parse(raw));
    } catch (e) { return defaultState(); }
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  var state = loadState();

  /* ---------- purchase / unlock ---------- */
  function normKey(k) { return String(k || "").trim().toLowerCase(); }
  function isPurchased() {
    return normKey(localStorage.getItem(PURCHASE_KEY)) === normKey(CONFIG.purchaseKey);
  }
  function isUnitUnlocked(unit) {
    if (unit.free) return true;
    if (FREE_ONLY) return false;      // paid units are not on the page at all
    return isPurchased();
  }
  function tryUnlock(input) {
    if (normKey(input) === normKey(CONFIG.purchaseKey)) {
      try { localStorage.setItem(PURCHASE_KEY, String(input).trim()); } catch (e) {}
      return true;
    }
    return false;
  }

  /* ---------- HUD + progress + unit map ---------- */
  function currentUnitIndex() {
    if (state.pos >= N_STEPS) return N_UNITS - 1;
    return FLAT[state.pos].unitIndex;
  }
  function renderHUD() {
    $("hudXp").textContent = state.xp + " XP";
    $("hudStreak").textContent = "🔥 " + state.streak;
    $("hudLevel").textContent = "Unit " + (currentUnitIndex() + 1) + " / " + N_UNITS;
    var pct = Math.round(state.totalAnswered / N_EX * 100);
    if (pct > 100) pct = 100;
    $("progressFill").style.width = pct + "%";
  }

  function renderUnitMap() {
    var el = $("levelmap");
    if (!el) return;
    var html = "<div class='lm-title'>Units</div>";
    UNIT_META.forEach(function (m, ui) {
      var done    = state.pos > m.lastPos;
      var current = state.pos >= m.firstPos && state.pos <= m.lastPos;
      var locked  = !isUnitUnlocked(m.unit) && !done;
      var cls = "lm-item";
      if (done) cls += " done";
      if (current) cls += " current";
      if (locked) cls += " locked";
      html += "<div class='" + cls + "'>" +
                "<span class='n'>" + (ui + 1) + "</span>" +
                "<span class='tier'>" + (m.unit.free ? "free" : "pro") + "</span>" +
              "</div>";
    });
    el.innerHTML = html;
  }

  /* Main nav. Practice Range is a paid bonus, so the nav only appears once the
     purchase key is in. Locked players still reach the teaser from the
     completion and certificate screens. */
  function renderTopNav(active) {
    // The Range is a directory, not a lesson, so it breaks out of the 620px
    // reading column into a wide grid. Every other render clears the class.
    document.body.classList.toggle("range-view", active === "range");
    var el = $("topnav");
    if (!el) return;
    el.hidden = !isPurchased() || FREE_ONLY;
    var t = $("navTraining"), r = $("navRange");
    if (!t || !r) return;
    t.classList.toggle("on", active !== "range");
    r.classList.toggle("on", active === "range");
  }

  function refreshChrome(active) { renderHUD(); renderUnitMap(); renderTopNav(active); }

  /* ---------- scoring ---------- */
  // Returns { gained, bonus }. Streak bonus of +10 every 5 correct in a row.
  function applyResult(correct, baseXp) {
    state.totalAnswered++;
    var gained = 0, bonus = 0;
    if (correct) {
      state.correctTotal++;
      state.streak++;
      if (state.streak > state.bestStreak) state.bestStreak = state.streak;
      gained = baseXp;
      if (state.streak % 5 === 0) { bonus = 10; gained += 10; }
      state.xp += gained;
    } else {
      state.streak = 0;
    }
    saveState();
    refreshChrome();
    return { gained: gained, bonus: bonus };
  }

  function xpChipHTML(res) {
    var base = res.gained - res.bonus;
    var h = "<span class='chip xp'>+" + base + " XP</span>";
    if (res.bonus) h += "<span class='chip xp'>+" + res.bonus + " streak</span>";
    return h;
  }

  /* ---------- feedback building blocks ---------- */
  // The "Why" block: how to spot it next time.
  function whyHTML(item) {
    return "<div class='fb-why'><div class='fb-label'>Why</div>" +
           "<div class='fb-text'>" + esc(item.why) + "</div></div>";
  }
  // The "stakes" footnote. isThreat picks the label + accent.
  function impactHTML(item, isThreat) {
    if (!item.impact) return "";
    var label = isThreat ? "If you miss this" : "The cost of blocking this";
    var cls   = isThreat ? "threat" : "benign";
    return "<div class='impact " + cls + "'>" +
             "<div class='impact-label'>" + label + "</div>" +
             "<div class='impact-headline'>" + esc(item.impact.headline) + "</div>" +
             "<div class='impact-detail'>" + esc(item.impact.detail) + "</div>" +
           "</div>";
  }

  /* ---------- shared: exercise topline + continue ---------- */
  function exTopline(entry) {
    var d = entry.step.difficulty || "";
    var diff = d ? "<span class='ex-diff " + d + "'>" + esc(d) + "</span>" : "";
    return "<div class='ex-topline'>" +
             "<span class='ex-count'>Exercise " + entry.exerciseNo + " / " + N_EX + "</span>" +
             diff +
           "</div>";
  }
  function continueBtn() {
    var label = (state.pos >= N_STEPS - 1) ? "See your result →" : "Continue →";
    return "<button class='btn full' id='next'>" + label + "</button>";
  }
  function wireContinue() {
    $("next").onclick = advance;
    $("next").focus();
  }

  /* ---------- advance through the flattened list ---------- */
  function advance() {
    var cur = FLAT[state.pos];
    state.pos++;
    saveState();

    if (cur.isLastStepInUnit) {
      awardBonus(cur.unit);
      if (state.pos >= N_STEPS) { renderComplete(); return; }      // finished everything
      var nextUnit = FLAT[state.pos].unit;
      if (!isUnitUnlocked(nextUnit)) { renderCurrent(); return; }   // -> gate
      renderUnitComplete(cur.unit); return;                        // paid unit summary
    }
    renderCurrent();
  }

  function awardBonus(unit) {
    if (state.awardedBonuses.indexOf(unit.id) !== -1) return;
    state.awardedBonuses.push(unit.id);
    state.xp += unit.bonusXp || 0;
    saveState();
    refreshChrome();
  }

  /* ---------- routing ---------- */
  function renderCurrent() {
    refreshChrome();
    if (state.pos >= N_STEPS) return renderComplete();
    var entry = FLAT[state.pos];

    if (entry.isFirstStepInUnit && !isUnitUnlocked(entry.unit)) return renderGate();
    if (entry.isFirstStepInUnit) {
      state.unitStart = { unitId: entry.unit.id, xp: state.xp,
                          correct: state.correctTotal, answered: state.totalAnswered };
      saveState();
    }

    if (entry.step.type === "teach") return renderConceptCard(entry);
    return renderExercise(entry);
  }

  function renderExercise(entry) {
    var t = entry.step.type;
    if (t === "allow-block")    return renderAllowBlock(entry);
    if (t === "tap-injection")  return renderTapInjection(entry);
    if (t === "name-technique") return renderNameTechnique(entry);
    screenEl.innerHTML = "<div class='panel'><p>Unknown exercise type.</p></div>";
  }

  /* ---------- TEACH: concept card (no XP) ---------- */
  function renderConceptCard(entry) {
    var s = entry.step, u = entry.unit;
    var paras = String(s.body || "").split(/\n\s*\n/).map(function (p) {
      return "<p>" + esc(p) + "</p>";
    }).join("");
    var example = s.example
      ? "<div class='teach-example'>" +
          "<div class='ex-label'>" + esc(s.example.label) + "</div>" +
          "<div class='ex-body'>" + esc(s.example.text) + "</div>" +
        "</div>"
      : "";
    var keyIdea = s.keyIdea
      ? "<div class='teach-key'>" + esc(s.keyIdea) + "</div>"
      : "";

    screenEl.innerHTML =
      "<div class='unit-tag'>Unit " + (entry.unitIndex + 1) + " · " +
        esc(u.owasp) + " · " + esc(u.title) + "</div>" +
      "<div class='teach'>" +
        "<div class='teach-label'>Concept</div>" +
        "<h2 class='teach-heading'>" + esc(s.heading) + "</h2>" +
        "<div class='teach-body'>" + paras + "</div>" +
        example +
        keyIdea +
      "</div>" +
      "<button class='btn full' id='next'>Continue →</button>";
    wireContinue();
  }

  /* ---------- TYPE 1: allow / block ---------- */
  function renderAllowBlock(entry) {
    var item = entry.step;
    var cardHTML = item.card
      ? "<div class='card'><div class='from'>" + esc(item.card.from) + "</div>" +
        "<div class='body'>" + esc(item.card.body) + "</div></div>"
      : "";
    screenEl.innerHTML =
      exTopline(entry) +
      "<p class='prompt-line'>Incoming prompt. Allow it through, or block it?</p>" +
      "<div class='inbox'>" +
        "<div class='inbox-head'><span class='live'></span>" +
          esc(item.tag || "Incoming prompt") + " · awaiting your call</div>" +
        "<div class='inbox-body'>" +
          "<div class='meta'>" + esc(item.meta || "") + "</div>" +
          "<div class='ptext'>" + esc(item.text) + "</div>" +
          cardHTML +
          "<div class='verdict-row'>" +
            "<button class='vbtn allow' id='bAllow'>Allow<span class='kbd'>A</span></button>" +
            "<button class='vbtn block' id='bBlock'>Block<span class='kbd'>B</span></button>" +
          "</div>" +
        "</div>" +
      "</div>";
    $("bAllow").onclick = function () { decideAllowBlock(entry, false); };
    $("bBlock").onclick = function () { decideAllowBlock(entry, true); };
  }

  function decideAllowBlock(entry, blocked) {
    var item = entry.step;
    var correct = blocked === item.attack;
    if (item.attack && blocked)  state.caughtAttacks++;
    if (item.attack && !blocked) state.breaches++;
    if (!item.attack && blocked) state.falseAlarms++;

    var res = applyResult(correct, item.xp || 20);

    var btns = document.querySelectorAll(".vbtn");
    for (var i = 0; i < btns.length; i++) { btns[i].disabled = true; btns[i].onclick = null; }

    var head;
    if (item.attack) head = blocked ? "Attack blocked" : "Breach, this attack got through";
    else             head = blocked ? "False alarm, you blocked a real user" : "Allowed, correct";

    var chip = item.attack
      ? "<span class='chip tech'>" + esc(item.tech) + "</span>"
      : "<span class='chip safe'>" + esc(item.tech) + "</span>";

    screenEl.insertAdjacentHTML("beforeend",
      "<div class='fb " + (correct ? "right" : "wrong") + "'>" +
        "<div class='head'><span class='res'>" + head + "</span>" + chip +
          (correct ? xpChipHTML(res) : "") + "</div>" +
        whyHTML(item) +
        impactHTML(item, item.attack) +
      "</div>" + continueBtn());
    wireContinue();
  }

  /* ---------- TYPE 2: tap the injection ---------- */
  function renderTapInjection(entry) {
    var item = entry.step;
    var segs = "";
    item.segments.forEach(function (s, idx) {
      segs += "<span class='seg' data-i='" + idx + "'>" + esc(s.t) + "</span>";
    });
    screenEl.innerHTML =
      exTopline(entry) +
      "<p class='prompt-line'>" + esc(item.prompt) + "</p>" +
      "<p class='hint'>Tap the one span that's an instruction, not content.</p>" +
      "<div class='doc'>" +
        "<div class='doc-head'><span class='dot'></span>" + esc(item.source) + "</div>" +
        "<div class='doc-body' id='docBody'>" + segs + "</div>" +
      "</div>";
    document.querySelectorAll(".seg").forEach(function (el) {
      el.onclick = function () { pickInjection(entry, parseInt(el.dataset.i, 10), el); };
    });
  }

  function pickInjection(entry, idx, el) {
    var item = entry.step;
    var correct = !!item.segments[idx].injection;
    $("docBody").classList.add("locked");
    document.querySelectorAll(".seg").forEach(function (s) { s.onclick = null; });

    if (correct) {
      el.classList.add("pick-right");
      state.caughtAttacks++;
    } else {
      el.classList.add("pick-wrong");
      state.breaches++;
      var realIdx = item.segments.findIndex(function (s) { return s.injection; });
      var realEl = document.querySelector(".seg[data-i='" + realIdx + "']");
      if (realEl) realEl.classList.add("reveal");
    }

    var res = applyResult(correct, item.xp || 25);
    var head = correct ? "Found it" : "Not quite. The highlighted line was the attack";

    screenEl.insertAdjacentHTML("beforeend",
      "<div class='fb " + (correct ? "right" : "wrong") + "'>" +
        "<div class='head'><span class='res'>" + head + "</span>" +
          (correct ? xpChipHTML(res) : "") + "</div>" +
        whyHTML(item) +
        impactHTML(item, true) +
      "</div>" + continueBtn());
    wireContinue();
  }

  /* ---------- TYPE 3: name the technique (two attempts, then reveal) ---------- */
  function renderNameTechnique(entry) {
    var item = entry.step;
    var opts = "";
    item.options.forEach(function (o, idx) {
      opts += "<button type='button' class='opt' data-o='" + idx + "'>" +
                "<span class='radio'></span><span class='lbl'>" + esc(o) + "</span>" +
              "</button>";
    });
    screenEl.innerHTML =
      exTopline(entry) +
      "<p class='prompt-line'>Name the technique.</p>" +
      "<div class='scenario'>" + esc(item.scenario) + "</div>" +
      "<div class='opts' id='opts'>" + opts + "</div>" +
      "<div class='retry-note' id='retryNote'></div>" +
      "<button class='btn full' id='submitTech' disabled>Submit</button>";

    var st = { attempts: 0, selected: null };
    document.querySelectorAll(".opt").forEach(function (btn) {
      btn.onclick = function () {
        if (btn.disabled) return;
        document.querySelectorAll(".opt").forEach(function (b) { b.classList.remove("sel"); });
        btn.classList.add("sel");
        st.selected = parseInt(btn.dataset.o, 10);
        $("submitTech").disabled = false;
      };
    });
    $("submitTech").onclick = function () { submitTech(entry, st); };
  }

  function submitTech(entry, st) {
    var item = entry.step;
    if (st.selected == null) return;
    var isCorrect = item.options[st.selected] === item.correct;
    st.attempts++;
    var selBtn = document.querySelector(".opt[data-o='" + st.selected + "']");

    if (isCorrect) {
      selBtn.classList.remove("sel");
      selBtn.classList.add("correct");
      finishTech(entry, true, st.attempts === 1 ? (item.xp || 15) : 5);
      return;
    }

    // wrong pick
    selBtn.classList.remove("sel");
    selBtn.classList.add("wrong", "dim");
    selBtn.disabled = true;

    if (st.attempts >= 2) {
      var correctIdx = item.options.indexOf(item.correct);
      var cBtn = document.querySelector(".opt[data-o='" + correctIdx + "']");
      if (cBtn) cBtn.classList.add("correct");
      finishTech(entry, false, 0);
    } else {
      $("retryNote").textContent = "Not quite. One more try, no penalty.";
      $("submitTech").disabled = true;
      st.selected = null;
    }
  }

  function finishTech(entry, correct, xp) {
    var item = entry.step;
    document.querySelectorAll(".opt").forEach(function (b) { b.disabled = true; b.onclick = null; });
    var submit = $("submitTech"); if (submit) submit.remove();
    var note = $("retryNote"); if (note) note.textContent = "";

    if (correct) state.caughtAttacks++;   // correctly identified a vulnerability
    var res = applyResult(correct, xp);
    var head = correct ? "Correct" : "Revealed: " + item.correct;

    screenEl.insertAdjacentHTML("beforeend",
      "<div class='fb " + (correct ? "right" : "wrong") + "'>" +
        "<div class='head'><span class='res'>" + esc(head) + "</span>" +
          (correct ? xpChipHTML(res) : "") + "</div>" +
        whyHTML(item) +
        impactHTML(item, true) +
      "</div>" + continueBtn());
    wireContinue();
  }

  /* ---------- unit complete (paid units) ---------- */
  function renderUnitComplete(unit) {
    refreshChrome();
    var base = state.unitStart && state.unitStart.unitId === unit.id
      ? state.unitStart
      : { xp: state.xp, correct: state.correctTotal, answered: state.totalAnswered };
    var xpEarned = state.xp - base.xp;
    var answered = state.totalAnswered - base.answered;
    var correct  = state.correctTotal - base.correct;
    var pct = answered ? Math.round(correct / answered * 100) : 100;
    var uNum = UNITS.indexOf(unit) + 1;

    screenEl.innerHTML =
      "<div class='unit-complete'>" +
        "<div class='uc-badge'>Unit " + uNum + " complete</div>" +
        "<h2>" + esc(unit.title) + "</h2>" +
        "<p class='uc-sub'>" + esc(unit.subtitle) + "</p>" +
        "<div class='stat-grid'>" +
          "<div class='stat-cell caught'><div class='v'>+" + xpEarned + "</div><div class='k'>XP this unit</div></div>" +
          "<div class='stat-cell false'><div class='v'>" + pct + "%</div><div class='k'>Accuracy</div></div>" +
          "<div class='stat-cell'><div class='v'>" + state.bestStreak + "</div><div class='k'>Best streak</div></div>" +
        "</div>" +
        "<button class='btn full' id='next'>Continue →</button>" +
      "</div>";
    $("next").onclick = function () { renderCurrent(); };
    $("next").focus();
  }

  /* ---------- intro ---------- */
  function showIntro() {
    refreshChrome();
    var hasProgress = state.totalAnswered > 0 || state.pos > 0;
    screenEl.innerHTML =
      "<div class='panel'>" +
        "<h1>THE <span class='b'>FILTER</span></h1>" +
        "<p class='tagline'>You are the guardrail · OWASP LLM Top 10 for Applications 2025</p>" +
        "<p class='lede'>You sit in the seat of an AI guardrail. Your job: let real users through, and catch the attacks before they reach the model.</p>" +
        "<ul class='howto'>" +
          "<li><span class='ic'>1</span><div>Every prompt could be legitimate, or a <b>prompt injection</b>, a jailbreak, an encoded payload, or an instruction hidden inside a document.</div></li>" +
          "<li><span class='ic'>2</span><div>You score on two numbers: <b>threats caught</b> AND <b>false alarms</b>. A filter that blocks everything is as useless as one that blocks nothing.</div></li>" +
          "<li><span class='ic'>3</span><div>Short lessons, then drills. <b>Allow / Block</b>, <b>Tap the injection</b>, <b>Name the technique</b>. Earn XP, build streaks, finish with a certificate.</div></li>" +
        "</ul>" +
        "<button class='btn full' id='start'>" + (hasProgress ? "Resume training" : "Start Training") + "</button>" +
        (hasProgress ? "<button class='btn ghost full' id='restart'>Restart from the beginning</button>" : "") +
      "</div>";
    $("start").onclick = startTraining;
    if (hasProgress) $("restart").onclick = function () { resetProgress(); showIntro(); };
  }

  function startTraining() {
    if (state.pos >= N_STEPS) state.pos = 0;   // finished; a fresh start
    saveState();
    renderCurrent();
  }

  function resetProgress() {
    state = defaultState();
    saveState();
    refreshChrome();
  }

  /* ---------- paid gate ---------- */
  function renderGate() {
    refreshChrome();
    var covers = PAID_UNITS.map(function (u) {
      return "<span class='t'>" + esc(u.title) + "</span>";
    }).join("");
    var freeUnit = FREE_UNITS[0] || { title: "Prompt Injection" };

    // The key box only exists in the full build, where paid units are present.
    var keyRow = FREE_ONLY ? "" :
      "<div class='key-row'>" +
        "<input id='keyInput' type='text' autocomplete='off' autocapitalize='off' spellcheck='false' placeholder='Paste your purchase key' />" +
        "<button class='btn ghost full' id='unlock'>Enter purchase key</button>" +
        "<div class='key-msg' id='keyMsg'></div>" +
      "</div>";

    screenEl.innerHTML =
      "<div class='panel'>" +
        "<span class='gate-badge'>Free training complete</span>" +
        "<h2>You finished Unit 1: " + esc(freeUnit.title) + ".</h2>" +
        "<p>You've seen direct injection, narrative jailbreaks, indirect injection hidden in content, and the precision-versus-recall tension every real filter lives with.</p>" +
        "<p>Units 2 to " + N_UNITS + " cover evasion techniques, system prompt leakage, excessive agency, RAG and vector poisoning, output handling and supply chain, and a boss unit of combined attacks, all mapped to the OWASP LLM Top 10 for Applications 2025.</p>" +
        "<div class='covers'>" + covers + "</div>" +
        "<div class='btn-stack'>" +
          "<button class='btn full' id='buy'>Get full access for $39.90 on Gumroad</button>" +
        "</div>" +
        keyRow +
        "<button class='btn ghost full' id='freeCert'>See your Free Defender certificate →</button>" +
      "</div>";

    $("buy").onclick = function () { window.open(CONFIG.gumroadUrl, "_blank", "noopener"); };
    if (!FREE_ONLY) {
      $("unlock").onclick = doUnlock;
      $("keyInput").addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); doUnlock(); }
      });
    }
    $("freeCert").onclick = function () { showCertificate("free"); };
  }

  function doUnlock() {
    var val = $("keyInput").value;
    var msg = $("keyMsg");
    if (tryUnlock(val)) {
      msg.className = "key-msg ok";
      msg.textContent = "Unlocked. All units are open, loading the next lesson…";
      refreshChrome();
      window.setTimeout(renderCurrent, 450);
    } else {
      msg.className = "key-msg err";
      msg.textContent = "That key didn't match. Check your confirmation email and try again.";
    }
  }

  /* ---------- complete (full finish) ---------- */
  function renderComplete() {
    refreshChrome();
    var pct = state.totalAnswered ? Math.round(state.correctTotal / state.totalAnswered * 100) : 0;
    var cls, label, note;
    if (state.breaches === 0 && state.falseAlarms <= 1) {
      cls = "good"; label = "Production-ready filter";
      note = "You caught the attacks without slamming the door on real users. That balance, high recall without wrecking precision, is the whole job of a real guardrail.";
    } else if (pct >= 70) {
      cls = "mid"; label = "Solid, with gaps";
      note = "A decent instinct, but each breach is an attacker who got through and each false alarm is a real user you turned away. Real filters are judged on both at once.";
    } else {
      cls = "bad"; label = "Leaky filter";
      note = "Too many got past you, or you blocked too many real people. The good news: every technique here has an obvious tell once you've named it. Run it back.";
    }

    screenEl.innerHTML =
      "<div class='end'>" +
        "<div class='rating " + cls + "'>" + label + "</div>" +
        "<div class='line'><b>" + state.correctTotal + "/" + state.totalAnswered + "</b> calls correct · " +
          pct + "% · <b>" + state.xp + "</b> XP · best streak <b>" + state.bestStreak + "</b></div>" +
        statGrid() +
        "<p>" + note + "</p>" +
        "<button class='btn full' id='cert'>Get your certificate →</button>" +
        "<button class='btn ghost full' id='range'>You can spot them. Now go break real ones →</button>" +
        "<button class='btn ghost full' id='again'>Play again</button>" +
      "</div>";
    $("cert").onclick = function () { showCertificate(isPurchased() ? "full" : "free"); };
    $("range").onclick = function () { showRange(renderComplete); };
    $("again").onclick = function () { resetProgress(); showIntro(); };
  }

  function statGrid() {
    return "<div class='stat-grid'>" +
      "<div class='stat-cell caught'><div class='v'>" + state.caughtAttacks + "</div><div class='k'>Threats caught</div></div>" +
      "<div class='stat-cell false'><div class='v'>" + state.falseAlarms + "</div><div class='k'>False alarms</div></div>" +
      "<div class='stat-cell breach'><div class='v'>" + state.breaches + "</div><div class='k'>Breaches</div></div>" +
    "</div>";
  }

  /* ---------- practice range (paid bonus) ----------
     A curated directory of free and self-hostable labs, tools and bounties,
     ordered as a route rather than a list. Data lives in range.js, which only
     ships in the full build, so everything here guards on it being present. */
  var HAS_RANGE = (typeof RANGE !== "undefined") && RANGE && RANGE.sections;
  var rangeReturn = null;                 // where the Back button goes

  function showRange(back) {
    rangeReturn = back || showIntro;
    if (!isPurchased() || FREE_ONLY || !HAS_RANGE) return renderRangeLocked();
    return renderRange();
  }

  // The free build has no range.js, so the teaser falls back to these constants.
  // The attribution has to appear on the locked screen too.
  var RANGE_CREDIT_FALLBACK = {
    text: "Resource universe curated by Arcanum Information Security",
    url: "https://arcanum-sec.com",
    indexUrl: "https://arcanum-sec.github.io/ai-sec-resources/",
    note: "The selection, ordering and notes on this page are ours. The underlying directory of resources is theirs, and it is worth reading in full."
  };

  function rangeCredit() {
    var c = (HAS_RANGE && RANGE.credit) ? RANGE.credit : RANGE_CREDIT_FALLBACK;
    return "<div class='range-credit'>" +
             "<p>" + esc(c.text) + " (" +
               "<a href='" + esc(c.url) + "' target='_blank' rel='noopener'>arcanum-sec.com</a>" +
             ").</p>" +
             "<p>" + esc(c.note) + " " +
               "<a href='" + esc(c.indexUrl) + "' target='_blank' rel='noopener'>Read the full index</a>." +
             "</p>" +
           "</div>";
  }

  // Bucket an item by its host string, for the counters and the host filter.
  function rangeHostKind(host) {
    var h = String(host || "").toLowerCase();
    if (h.indexOf("bounty") !== -1) return "bounty";
    if (h.indexOf("self-hosted") === 0) return "self";
    return "online";
  }

  function renderRange() {
    refreshChrome("range");

    var nOnline = 0, nSelf = 0, nBounty = 0;
    RANGE_ITEMS.forEach(function (it) {
      var k = rangeHostKind(it.host);
      if (k === "online") nOnline++;
      else if (k === "self") nSelf++;
      else nBounty++;
    });

    /* ---- header + counters ---- */
    var html =
      "<div class='range-head'>" +
        "<div class='range-label'>Bonus</div>" +
        "<h2>The Practice Range</h2>" +
        "<p class='range-intro'>" + esc(RANGE.intro) + "</p>" +
        "<div class='range-stats'>" +
          statTile(RANGE_COUNT, "Resources", "cyan") +
          statTile(RANGE.sections.length, "Stages", "violet") +
          statTile(nOnline, "No setup", "safe") +
          statTile(nSelf, "Self-hosted", "amber") +
          statTile(nBounty, "Bounties", "threat") +
        "</div>" +
      "</div>";

    /* ---- filter bar: search + one pill per stage ---- */
    var pills = "<button type='button' class='r-pill on' data-sec='all'>All" +
                  "<span class='n'>" + RANGE_COUNT + "</span></button>";
    RANGE.sections.forEach(function (sec) {
      pills += "<button type='button' class='r-pill' data-sec='" + esc(sec.id) + "'>" +
                 esc(sec.title) + "<span class='n'>" + sec.items.length + "</span>" +
               "</button>";
    });

    html +=
      "<div class='range-filter' id='rangeFilter'>" +
        "<div class='rf-search'>" +
          "<span class='rf-icon' aria-hidden='true'>⌕</span>" +
          "<input type='search' id='rangeSearch' autocomplete='off' spellcheck='false' " +
            "placeholder='Search 45 resources by name, level or topic' " +
            "aria-label='Search the Practice Range' />" +
        "</div>" +
        "<div class='rf-pills' id='rangePills'>" + pills + "</div>" +
      "</div>" +
      "<div class='r-empty' id='rangeEmpty' hidden>" +
        "<p>Nothing matches that.</p>" +
        "<button type='button' class='btn ghost' id='rangeClear'>Clear the filters</button>" +
      "</div>";

    /* ---- sections as card grids ---- */
    RANGE.sections.forEach(function (sec, i) {
      var cards = sec.items.map(function (it) {
        // One lowercase haystack per card so search stays a cheap substring test.
        var hay = (it.title + " " + it.level + " " + it.host + " " +
                   (it.status || "") + " " + it.note + " " + sec.title).toLowerCase();
        var flag = it.status
          ? "<div class='r-foot'><span class='r-flag'>" + esc(it.status) + "</span></div>"
          : "";
        return "<li class='r-item" + (it.status ? " flagged" : "") + "' " +
                    "data-sec='" + esc(sec.id) + "' data-hay=\"" + esc(hay) + "\">" +
                 "<a class='r-title' href='" + esc(it.url) + "' target='_blank' rel='noopener'>" +
                   "<span>" + esc(it.title) + "</span>" +
                 "</a>" +
                 "<div class='r-tags'>" +
                   "<span class='r-tag level'>" + esc(it.level) + "</span>" +
                   "<span class='r-tag host'>" + esc(it.host) + "</span>" +
                 "</div>" +
                 "<p class='r-note'>" + esc(it.note) + "</p>" +
                 flag +
               "</li>";
      }).join("");

      html +=
        "<section class='range-sec' data-sec='" + esc(sec.id) + "'>" +
          "<div class='rs-head'>" +
            "<span class='rs-n'>" + (i + 1) + "</span>" +
            "<h3>" + esc(sec.title) + "</h3>" +
            "<span class='rs-count'><b class='shown'>" + sec.items.length + "</b> / " +
              sec.items.length + "</span>" +
          "</div>" +
          "<p class='rs-intro'>" + esc(sec.intro) + "</p>" +
          "<ul class='r-list'>" + cards + "</ul>" +
        "</section>";
    });

    html += rangeCredit() +
            "<button class='btn ghost full' id='rangeBack'>Back to training</button>";

    screenEl.innerHTML = html;
    wireRangeFilters();
    $("rangeBack").onclick = function () { (rangeReturn || showIntro)(); };
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) {}
  }

  function statTile(n, label, tone) {
    return "<div class='r-stat " + tone + "'>" +
             "<div class='v'>" + n + "</div>" +
             "<div class='k'>" + esc(label) + "</div>" +
           "</div>";
  }

  /* Live filtering. Search is a substring test over a prebuilt haystack; the
     stage pills are an equality test. Sections with nothing left are hidden so
     the page never shows an empty heading. */
  function wireRangeFilters() {
    var input   = $("rangeSearch");
    var pillBox = $("rangePills");
    var empty   = $("rangeEmpty");
    if (!input || !pillBox) return;

    var state2 = { q: "", sec: "all" };

    function apply() {
      var q = state2.q, sec = state2.sec, total = 0;
      var sections = document.querySelectorAll(".range-sec");
      for (var s = 0; s < sections.length; s++) {
        var secEl = sections[s], shown = 0;
        var items = secEl.querySelectorAll(".r-item");
        for (var i = 0; i < items.length; i++) {
          var el = items[i];
          var ok = (sec === "all" || el.dataset.sec === sec) &&
                   (!q || el.dataset.hay.indexOf(q) !== -1);
          el.hidden = !ok;
          if (ok) shown++;
        }
        secEl.hidden = shown === 0;
        var c = secEl.querySelector(".rs-count .shown");
        if (c) c.textContent = shown;
        total += shown;
      }
      empty.hidden = total !== 0;
    }

    input.addEventListener("input", function () {
      state2.q = input.value.trim().toLowerCase();
      apply();
    });

    pillBox.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".r-pill") : null;
      if (!btn) return;
      var all = pillBox.querySelectorAll(".r-pill");
      for (var i = 0; i < all.length; i++) all[i].classList.remove("on");
      btn.classList.add("on");
      state2.sec = btn.dataset.sec;
      apply();
    });

    $("rangeClear").onclick = function () {
      input.value = "";
      state2.q = "";
      state2.sec = "all";
      var all = pillBox.querySelectorAll(".r-pill");
      for (var i = 0; i < all.length; i++) all[i].classList.remove("on");
      pillBox.querySelector("[data-sec='all']").classList.add("on");
      apply();
      input.focus();
    };
  }

  function renderRangeLocked() {
    refreshChrome("range");
    screenEl.innerHTML =
      "<div class='panel'>" +
        "<span class='gate-badge'>Included with full access</span>" +
        "<h2>The Practice Range</h2>" +
        "<p>You can spot these attacks now. The next step is running them against " +
          "something that is meant to break.</p>" +
        "<p>The Practice Range is a curated route through the best free and " +
          "self-hostable AI security labs, CTFs, tools and bug bounty programmes. " +
          "Browser games to start, then indirect injection, RAG poisoning, agents " +
          "and MCP, the self-hosted Docker ranges worth an afternoon, the scanners " +
          "to point at a real system, and the programmes that pay for findings. " +
          "No subscriptions, nothing paywalled.</p>" +
        "<div class='covers'>" +
          "<span class='t'>Start here</span><span class='t'>Indirect injection</span>" +
          "<span class='t'>RAG poisoning</span><span class='t'>Agents and MCP</span>" +
          "<span class='t'>Self-hosted ranges</span><span class='t'>Tools</span>" +
          "<span class='t'>Bounties</span>" +
        "</div>" +
        "<div class='btn-stack'>" +
          "<button class='btn full' id='rangeBuy'>Get full access for $39.90 on Gumroad</button>" +
          "<button class='btn ghost full' id='rangeBack'>Back</button>" +
        "</div>" +
        rangeCredit() +
      "</div>";
    $("rangeBuy").onclick = function () { window.open(CONFIG.gumroadUrl, "_blank", "noopener"); };
    $("rangeBack").onclick = function () { (rangeReturn || showIntro)(); };
  }

  /* ---------- certificate ---------- */
  function showCertificate(tier) {
    refreshChrome();
    var data = {
      xp: state.xp,
      rank: (typeof certificateRank === "function") ? certificateRank(state.xp) : "Defender",
      caught: state.caughtAttacks,
      falseAlarms: state.falseAlarms,
      breaches: state.breaches,
      levels: tier === "full" ? N_EX : FREE_EX,
      tier: tier,
      date: new Date()
    };
    var svg = buildCertificateSVG(data);
    screenEl.innerHTML =
      "<div class='cert-wrap' id='certWrap'>" + svg + "</div>" +
      "<div class='cert-actions'>" +
        "<button class='btn full' id='dl'>Download PNG</button>" +
        "<button class='btn ghost full' id='back'>Back</button>" +
      "</div>" +
      "<div class='next-step'>" +
        "<div class='ns-label'>Next step</div>" +
        "<p>You can spot them. Now go break real ones.</p>" +
        "<button class='btn ghost full' id='certRange'>Open the Practice Range →</button>" +
      "</div>";
    $("certRange").onclick = function () {
      showRange(function () { showCertificate(tier); });
    };
    $("dl").onclick = function () {
      var svgEl = $("certWrap").querySelector("svg");
      downloadCertificatePNG(svgEl, "the-filter-certificate.png");
    };
    $("back").onclick = function () {
      if (isPurchased() && state.pos >= N_STEPS) renderComplete();
      else renderGate();
    };
    try { $("certWrap").scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {}
  }

  /* ---------- util ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c];
    });
  }

  /* ---------- keyboard: A / B on allow-block, Enter/Space to continue ---------- */
  document.addEventListener("keydown", function (e) {
    var a = $("bAllow"), b = $("bBlock"), n = $("next");
    var k = e.key.toLowerCase();
    if (a && b && !a.disabled) {
      if (k === "a") { e.preventDefault(); a.click(); }
      else if (k === "b") { e.preventDefault(); b.click(); }
    } else if (n && (k === "enter" || k === " ")) {
      e.preventDefault();
      n.click();
    }
  });

  /* ---------- boot ---------- */
  if ($("navTraining")) {
    $("navTraining").onclick = function () {
      if (state.pos >= N_STEPS) renderComplete(); else renderCurrent();
    };
  }
  if ($("navRange")) {
    $("navRange").onclick = function () {
      showRange(function () {
        if (state.pos >= N_STEPS) renderComplete(); else renderCurrent();
      });
    };
  }

  refreshChrome();
  showIntro();
})();
