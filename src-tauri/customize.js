// ShokadoPDF desktop customization — injected as a Tauri initialization script
// (runs before page scripts on every navigation). It does NOT edit the bundled
// BentoPDF content; it removes/relabels DOM nodes at runtime so the upstream
// `core/` (git subtree) stays untouched.
//
// Scope:
//   - All pages: rebrand to "ShokadoPDF"; nav keeps only Home + an "About"
//     entry relabeled "ShokadoPDFについて" (Contact and everything after it,
//     GitHub buttons, the donation ribbon and the "Back to Tools" button are
//     removed).
//   - Home page (detected by #tool-grid): keep only the tool grid (#grid-view);
//     drop hero/features/tools-header/compliance/FAQ/testimonials/footer.
//   - About page (about.html): replace the body with ShokadoPDF's own about
//     content (keeps the app shell/nav so it isn't a dead end).
(function () {
  "use strict";
  if (window.top !== window) return; // top frame only

  var ABOUT_HTML =
    '<section id="shokado-about" class="max-w-3xl mx-auto py-12 px-4 text-gray-200">' +
    '<h1 class="text-3xl md:text-4xl font-bold text-white mb-6">ShokadoPDFについて</h1>' +
    '<p class="mb-4 leading-relaxed">ShokadoPDF は、オープンソースの <strong>BentoPDF</strong>（AGPL-3.0）をベースにした、Windows / macOS 向けのスタンドアロン PDF ツールです。</p>' +
    '<p class="mb-4 leading-relaxed">すべての処理はお使いの端末内で完結し、ファイルが外部へ送信されることはありません。インターネットに接続していなくても、主要な PDF 機能をご利用いただけます。</p>' +
    '<p class="mb-4 leading-relaxed">結合・分割・変換・圧縮・抽出など、日常的な PDF 作業をこのアプリひとつで行えます。</p>' +
    '<p class="text-sm text-gray-500 mt-8">本ソフトウェアは AGPL-3.0 ライセンスのもとで提供されています。</p>' +
    '<a href="index.html" class="inline-block mt-6 text-indigo-400 hover:text-indigo-300 font-semibold">← ツール一覧へ</a>' +
    "</section>";

  function isAboutPage() {
    var p = location.pathname.replace(/\/+$/, "");
    return /(^|\/)about(\.html)?$/.test(p);
  }

  function rebrandAndTrimNav(doc) {
    // Brand text -> ShokadoPDF
    var brand =
      doc.querySelector("#nav-brand a") || doc.querySelector("#nav-brand");
    if (brand && brand.textContent.trim() !== "ShokadoPDF") {
      brand.textContent = "ShokadoPDF";
    }
    var logo = doc.querySelector("#nav-logo");
    if (logo) logo.setAttribute("alt", "ShokadoPDF Logo");
    if (!isAboutPage()) doc.title = "ShokadoPDF";

    // Relabel the "About" nav links to "ShokadoPDFについて". Drop data-i18n so
    // the app's translation pass cannot overwrite our label.
    doc.querySelectorAll('[data-i18n="nav.about"]').forEach(function (a) {
      a.removeAttribute("data-i18n");
      a.textContent = "ShokadoPDFについて";
    });

    // Remove "Contact" and everything after it in every nav list.
    doc.querySelectorAll('[data-i18n="nav.contact"]').forEach(function (c) {
      var node = c;
      while (node) {
        var next = node.nextElementSibling;
        node.remove();
        node = next;
      }
    });

    // Stand-alone GitHub buttons live outside the link list — remove them too.
    doc.querySelectorAll('nav a[href*="github.com"]').forEach(function (a) {
      a.remove();
    });

    // Donation ribbon (ko-fi / GitHub Sponsor), which sits above #app.
    var ribbon = doc.getElementById("donation-ribbon");
    if (ribbon) ribbon.remove();

    // "Back to Tools" button present on every tool page.
    var back = doc.getElementById("back-to-tools");
    if (back) back.remove();
  }

  function stripHomeMarketing(doc) {
    // Home page only, identified by the dynamically-filled tool grid.
    if (!doc.getElementById("tool-grid")) return;
    var app = doc.getElementById("app");
    if (app) {
      var keep = { "grid-view": 1 };
      Array.prototype.slice.call(app.children).forEach(function (child) {
        if (!keep[child.id]) child.remove();
      });
    }
    doc.querySelectorAll("footer").forEach(function (f) {
      f.remove();
    });
  }

  function replaceAbout(doc) {
    if (!isAboutPage()) return;
    var app = doc.getElementById("app");
    if (!app || doc.getElementById("shokado-about")) return;
    app.innerHTML = ABOUT_HTML;
    doc.title = "ShokadoPDFについて";
  }

  function apply() {
    try {
      rebrandAndTrimNav(document);
      stripHomeMarketing(document);
      replaceAbout(document);
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
