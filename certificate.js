/* =========================================================================
   THE FILTER AI · certificate.js
   Builds an inline SVG completion certificate and converts it to a PNG
   download via the Canvas API. Self-contained: no external resources inside
   the SVG (so the canvas never taints and toDataURL/toBlob work in Safari).

   Exposes three globals used by engine.js:
     certificateRank(xp)                 -> rank string
     buildCertificateSVG(data)           -> SVG markup string
     downloadCertificatePNG(svgEl, name) -> triggers a PNG download
   ========================================================================= */

/* Rank table (from CLAUDE.md). */
function certificateRank(xp) {
  if (xp >= 400) return "Elite Guardrail";
  if (xp >= 300) return "Senior Analyst";
  if (xp >= 200) return "Active Defender";
  if (xp >= 100) return "Trainee";
  return "Compromised";
}

function _certEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c];
  });
}

/* Build the certificate as a viewBox-based SVG string that scales to its
   container. Colours are literal hex (SVG has no access to CSS variables). */
function buildCertificateSVG(data) {
  var W = 800, H = 560;
  var xp = (data && data.xp) || 0;
  var rank = _certEsc((data && data.rank) || certificateRank(xp));
  var caught = (data && data.caught) || 0;
  var falseAlarms = (data && data.falseAlarms) || 0;
  var breaches = (data && data.breaches) || 0;
  var levels = (data && data.levels) || 20;
  var d = (data && data.date) || new Date();
  var dateStr = _certEsc(d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }));

  var mono = "'IBM Plex Mono','Courier New',monospace";
  var display = "'IBM Plex Sans','Trebuchet MS',system-ui,sans-serif";
  var body = "'IBM Plex Sans',system-ui,sans-serif";

  return '' +
'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="The Filter AI completion certificate, ' + rank + '">' +
  '<defs>' +
    '<linearGradient id="tfBg" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#0c1a17"/>' +
      '<stop offset="0.55" stop-color="#070b0f"/>' +
      '<stop offset="1" stop-color="#070b0f"/>' +
    '</linearGradient>' +
    '<linearGradient id="tfAccent" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#2ee6a8"/>' +
      '<stop offset="1" stop-color="#39ff88"/>' +
    '</linearGradient>' +
    '<pattern id="tfGrid" width="40" height="40" patternUnits="userSpaceOnUse">' +
      '<path d="M40 0 L0 0 0 40" fill="none" stroke="#161f27" stroke-width="1"/>' +
    '</pattern>' +
  '</defs>' +

  '<rect width="' + W + '" height="' + H + '" fill="url(#tfBg)"/>' +
  '<rect width="' + W + '" height="' + H + '" fill="url(#tfGrid)" opacity="0.45"/>' +
  '<rect x="16" y="16" width="' + (W - 32) + '" height="' + (H - 32) + '" rx="18" fill="none" stroke="#263340" stroke-width="1.5"/>' +
  '<rect x="16" y="16" width="' + (W - 32) + '" height="6" rx="3" fill="url(#tfAccent)"/>' +

  // decorative corner ticks
  '<circle cx="60" cy="512" r="3" fill="#263340"/>' +
  '<circle cx="740" cy="512" r="3" fill="#263340"/>' +

  // eyebrow
  '<text x="' + (W / 2) + '" y="84" text-anchor="middle" font-family="' + mono + '" font-size="14" letter-spacing="4" fill="#b072ff">THE FILTER AI · AI SECURITY TRAINING</text>' +

  // title
  '<text x="' + (W / 2) + '" y="172" text-anchor="middle" font-family="' + display + '" font-weight="700" font-size="52" fill="#e8f2ee">Prompt Injection</text>' +
  '<text x="' + (W / 2) + '" y="228" text-anchor="middle" font-family="' + display + '" font-weight="700" font-size="52" fill="#e8f2ee">Defender</text>' +

  // subtitle
  '<text x="' + (W / 2) + '" y="278" text-anchor="middle" font-family="' + body + '" font-size="17" fill="#8497a0">Completed The Filter AI · ' + levels + ' exercises of AI security training</text>' +

  // rank pill
  '<rect x="' + (W / 2 - 135) + '" y="306" width="270" height="46" rx="23" fill="#0f1519" stroke="#2ee6a8" stroke-opacity="0.5"/>' +
  '<text x="' + (W / 2) + '" y="335" text-anchor="middle" font-family="' + mono + '" font-weight="700" font-size="19" fill="#2ee6a8">' + rank + '</text>' +

  // score
  '<text x="' + (W / 2) + '" y="398" text-anchor="middle" font-family="' + mono + '" font-size="13" letter-spacing="3" fill="#8497a0">FINAL SCORE</text>' +
  '<text x="' + (W / 2) + '" y="440" text-anchor="middle" font-family="' + mono + '" font-weight="700" font-size="38" fill="#ffc233">' + xp + ' XP</text>' +

  // three stats
  '<text x="200" y="490" text-anchor="middle" font-family="' + mono + '" font-weight="700" font-size="24" fill="#39ff88">' + caught + '</text>' +
  '<text x="200" y="510" text-anchor="middle" font-family="' + mono + '" font-size="10.5" letter-spacing="1.5" fill="#8497a0">THREATS CAUGHT</text>' +
  '<text x="400" y="490" text-anchor="middle" font-family="' + mono + '" font-weight="700" font-size="24" fill="#ffc233">' + falseAlarms + '</text>' +
  '<text x="400" y="510" text-anchor="middle" font-family="' + mono + '" font-size="10.5" letter-spacing="1.5" fill="#8497a0">FALSE ALARMS</text>' +
  '<text x="600" y="490" text-anchor="middle" font-family="' + mono + '" font-weight="700" font-size="24" fill="#ff3b5c">' + breaches + '</text>' +
  '<text x="600" y="510" text-anchor="middle" font-family="' + mono + '" font-size="10.5" letter-spacing="1.5" fill="#8497a0">BREACHES</text>' +

  // footer
  '<text x="40" y="' + (H - 24) + '" font-family="' + mono + '" font-size="11.5" fill="#8497a0">The Filter AI by Hamcodes · hamcodes.com</text>' +
  '<text x="' + (W - 40) + '" y="' + (H - 24) + '" text-anchor="end" font-family="' + mono + '" font-size="11.5" fill="#8497a0">' + dateStr + '</text>' +
'</svg>';
}

/* Convert the on-page SVG element to a PNG and trigger a download. */
function downloadCertificatePNG(svgEl, filename) {
  if (!svgEl) return;
  var xml = new XMLSerializer().serializeToString(svgEl);
  var svgUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);

  var vb = svgEl.viewBox && svgEl.viewBox.baseVal;
  var w = (vb && vb.width) || 800;
  var h = (vb && vb.height) || 560;

  var img = new Image();
  img.onload = function () {
    var scale = 2; // export at 2x for crispness
    var canvas = document.createElement("canvas");
    canvas.width = w * scale;
    canvas.height = h * scale;
    var ctx = canvas.getContext("2d");
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(img, 0, 0, w, h);

    var finish = function (url, revoke) {
      var a = document.createElement("a");
      a.href = url;
      a.download = filename || "the-filter-certificate.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (revoke) window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    };

    if (canvas.toBlob) {
      canvas.toBlob(function (blob) {
        if (blob) finish(URL.createObjectURL(blob), true);
        else finish(canvas.toDataURL("image/png"), false);
      }, "image/png");
    } else {
      finish(canvas.toDataURL("image/png"), false);
    }
  };
  img.onerror = function () {
    // Last-resort fallback: open the SVG itself in a new tab so the user can save it.
    window.open(svgUrl, "_blank", "noopener");
  };
  img.src = svgUrl;
}

/* CommonJS export (harmless in the browser). */
if (typeof module !== "undefined") {
  module.exports = { certificateRank: certificateRank, buildCertificateSVG: buildCertificateSVG };
}
