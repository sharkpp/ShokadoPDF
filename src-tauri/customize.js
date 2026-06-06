// ShokadoPDF desktop customization — injected as a Tauri initialization script
// (runs before page scripts on every navigation). It does NOT edit the bundled
// BentoPDF content; it removes/relabels DOM nodes at runtime so the upstream
// `core/` (git subtree) stays untouched.
//
// Scope:
//   - All pages: rebrand to "ShokadoPDF", trim nav to everything up to "Contact".
//   - Home page only (detected by #tool-grid): keep only the tools area
//     (#tools-header + #grid-view); remove hero/features/compliance/FAQ/
//     testimonials/footer — i.e. everything above and below the tools.
(function () {
  "use strict";
  if (window.top !== window) return; // top frame only

  function rebrandAndTrimNav(doc) {
    // 1) Brand text -> ShokadoPDF
    var brand =
      doc.querySelector("#nav-brand a") || doc.querySelector("#nav-brand");
    if (brand && brand.textContent.trim() !== "ShokadoPDF") {
      brand.textContent = "ShokadoPDF";
    }
    var logo = doc.querySelector("#nav-logo");
    if (logo) logo.setAttribute("alt", "ShokadoPDF Logo");
    doc.title = "ShokadoPDF";

    // 2) Remove everything to the right of "Contact" in every nav list
    //    (desktop + mobile menu): drop all siblings after the Contact link.
    doc.querySelectorAll('[data-i18n="nav.contact"]').forEach(function (c) {
      var sib = c.nextElementSibling;
      while (sib) {
        var next = sib.nextElementSibling;
        sib.remove();
        sib = next;
      }
    });
    // Stand-alone GitHub buttons live outside the link list — remove them too.
    doc.querySelectorAll('nav a[href*="github.com"]').forEach(function (a) {
      a.remove();
    });
  }

  function stripHomeMarketing(doc) {
    // Only on the home page, identified by the dynamically-filled tool grid.
    if (!doc.getElementById("tool-grid")) return;
    var app = doc.getElementById("app");
    if (app) {
      var keep = { "tools-header": 1, "grid-view": 1 };
      Array.prototype.slice.call(app.children).forEach(function (child) {
        if (!keep[child.id]) child.remove();
      });
    }
    doc.querySelectorAll("footer").forEach(function (f) {
      f.remove();
    });
  }

  function apply() {
    try {
      rebrandAndTrimNav(document);
      stripHomeMarketing(document);
    } catch (e) {
      // Never let customization break the app.
      console.warn("[ShokadoPDF] customize error:", e);
    }
  }

  function start() {
    apply();
    // The app applies i18n / re-renders parts of the header after load;
    // re-assert a few times so our changes win, then stop.
    var tries = 0;
    var iv = setInterval(function () {
      apply();
      if (++tries >= 8) clearInterval(iv);
    }, 250);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
