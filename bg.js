/* =========================================================================
   THE FILTER AI · bg.js
   The drifting node field behind the game.

   Same treatment as the field on the Hamcodes portfolio, retuned to this
   product's palette and pulled back in density so it never competes with an
   exercise. Pairs with the graph-paper grid in styles.css.

   Separate file rather than an inline script, so the page stays
   CSP-compatible. Does nothing if the canvas is absent, and draws a single
   static frame when the visitor asks for reduced motion.
   ========================================================================= */

(function () {
  "use strict";

  var canvas = document.getElementById("bgCanvas");
  if (!canvas || !canvas.getContext) return;

  var ctx = canvas.getContext("2d");
  var reduceMotion = window.matchMedia &&
                     window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var NODE  = "rgba(46,230,168,";     // --brand
  var LINK  = "rgba(176,114,255,";    // --violet
  var LINK_DIST = 130;

  var w = 0, h = 0, dpr = 1, nodes = [], raf = null;

  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function seed() {
    // Density scales with area but stays modest, and phones get fewer still.
    var target = Math.floor((w * h) / 26000);
    var cap = w < 640 ? 26 : 58;
    var count = Math.max(12, Math.min(cap, target));
    nodes = [];
    for (var i = 0; i < count; i++) {
      nodes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: Math.random() * 1.4 + 0.5
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);

    // links first, so nodes sit on top
    for (var a = 0; a < nodes.length; a++) {
      for (var b = a + 1; b < nodes.length; b++) {
        var dx = nodes[a].x - nodes[b].x;
        var dy = nodes[a].y - nodes[b].y;
        var d2 = dx * dx + dy * dy;
        if (d2 > LINK_DIST * LINK_DIST) continue;
        var fade = (1 - Math.sqrt(d2) / LINK_DIST) * 0.16;
        ctx.strokeStyle = LINK + fade.toFixed(3) + ")";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(nodes[a].x, nodes[a].y);
        ctx.lineTo(nodes[b].x, nodes[b].y);
        ctx.stroke();
      }
    }

    ctx.fillStyle = NODE + "0.5)";
    for (var i = 0; i < nodes.length; i++) {
      var p = nodes[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function step() {
    for (var i = 0; i < nodes.length; i++) {
      var p = nodes[i];
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
    }
    draw();
    raf = window.requestAnimationFrame(step);
  }

  function start() {
    if (raf) window.cancelAnimationFrame(raf);
    size();
    seed();
    if (reduceMotion) draw();          // one static frame, no loop
    else raf = window.requestAnimationFrame(step);
  }

  // Debounced, so a drag-resize does not reseed on every frame.
  var t = null;
  window.addEventListener("resize", function () {
    window.clearTimeout(t);
    t = window.setTimeout(start, 180);
  });

  // Stop burning frames while the tab is hidden.
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      if (raf) { window.cancelAnimationFrame(raf); raf = null; }
    } else if (!reduceMotion && !raf) {
      raf = window.requestAnimationFrame(step);
    }
  });

  start();
})();
