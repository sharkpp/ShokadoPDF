// ShokadoPDF desktop customization for the simple-mode build.
// Injected as a Tauri initialization script (runs before page scripts). It does
// NOT edit the bundled BentoPDF content; it adjusts the DOM at runtime so the
// upstream core/ (git subtree) stays untouched. Brand text itself is set
// natively via VITE_BRAND_NAME — not here.
(function () {
  "use strict";
  if (window.top !== window) return; // top frame only

  var APP_VERSION = window.__SHOKADO_VERSION__ || "0.1.0";

  // Shokado-bento motif logo (matches the desktop app icon).
  var LOGO_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' +
    '<rect x="44" y="44" width="424" height="424" rx="76" fill="#0f172a"/>' +
    '<rect x="44" y="44" width="424" height="424" rx="76" fill="none" stroke="#6366f1" stroke-width="22"/>' +
    '<rect x="92" y="92" width="150" height="150" rx="22" fill="#f8fafc"/>' +
    '<rect x="270" y="92" width="150" height="150" rx="22" fill="#fb7185"/>' +
    '<rect x="92" y="270" width="150" height="150" rx="22" fill="#34d399"/>' +
    '<rect x="270" y="270" width="150" height="150" rx="22" fill="#fbbf24"/>' +
    "</svg>";
  var LOGO_URI = "data:image/svg+xml," + encodeURIComponent(LOGO_SVG);

  var ABOUT_HTML =
    '<section id="shokado-about" class="max-w-3xl mx-auto py-12 px-4 text-gray-200">' +
    '<h1 class="text-3xl md:text-4xl font-bold text-white mb-6">ShokadoPDFについて</h1>' +
    '<p class="mb-4 leading-relaxed">ShokadoPDF は、オープンソースの <strong>BentoPDF</strong>（AGPL-3.0）をベースにした、Windows / macOS 向けのスタンドアロン PDF ツールです。</p>' +
    '<p class="mb-4 leading-relaxed">すべての処理はお使いの端末内で完結し、ファイルが外部へ送信されることはありません。インターネットに接続していなくても、主要な PDF 機能をご利用いただけます。</p>' +
    '<p class="mb-4 leading-relaxed">結合・分割・変換・圧縮・抽出など、日常的な PDF 作業をこのアプリひとつで行えます。</p>' +
    '<p class="text-sm text-gray-500 mt-8">本ソフトウェアは AGPL-3.0 ライセンスのもとで提供されています。</p>' +
    '<a href="index.html" class="inline-block mt-6 text-indigo-400 hover:text-indigo-300 font-semibold">← ツール一覧へ</a>' +
    "</section>";

  function path() {
    return location.pathname.replace(/\/+$/, "");
  }
  function isHome() {
    var p = path();
    return p === "" || /(^|\/)index(\.html)?$/.test(p);
  }
  function isAbout() {
    return /(^|\/)about(\.html)?$/.test(path());
  }
  function isMultiTool() {
    return /(^|\/)pdf-multi-tool(\.html)?$/.test(path());
  }
  function baseUrl() {
    var b = document.querySelector("#nav-brand a, nav a");
    var h = (b && b.getAttribute("href")) || "/";
    return h.endsWith("/") ? h : h + "/";
  }
  function slug() {
    var p = path().split("/").pop() || "index";
    return p.replace(/\.html$/, "") || "index";
  }

  // (Icon) Swap the brand logo (nav/footer) and favicon to the Shokado motif.
  function applyLogo(doc) {
    doc.querySelectorAll("nav img, footer img").forEach(function (img) {
      if (img.getAttribute("src") !== LOGO_URI)
        img.setAttribute("src", LOGO_URI);
    });
    doc.querySelectorAll('link[rel~="icon"]').forEach(function (l) {
      l.setAttribute("href", LOGO_URI);
      l.setAttribute("type", "image/svg+xml");
    });
  }

  // (2)(3) Minimize the gap between the header and the tool card on pages whose
  // wrapper vertically-centers the card (big top gap) or has extra top padding;
  // for form-creator also widen the card to cut the left/right gap.
  function fixToolGaps(doc) {
    var T2 = {
      "table-of-contents": 1,
      bookmark: 1,
      "json-to-pdf": 1,
      "markdown-to-pdf": 1,
      "pdf-to-json": 1,
    };
    var s = slug();
    var isForm = s === "form-creator";
    if (!T2[s] && !isForm) return;
    var wrap = doc.querySelector(".min-h-screen");
    if (!wrap) return;
    var cs = getComputedStyle(wrap);
    if (cs.display.indexOf("flex") >= 0) wrap.style.alignItems = "flex-start";
    wrap.style.paddingTop = cs.paddingLeft; // top gap == side gap
    if (isForm) {
      var card = wrap.firstElementChild;
      if (card) card.style.maxWidth = "none"; // cut left/right gap
    }
  }

  // (1) Remove the "Used by companies and people…" banner if present.
  function removeUsedByBanner(doc) {
    var el = doc.querySelector('[data-i18n="usedBy.title"]');
    if (el) {
      var sec = el.closest("section, div");
      (sec || el).remove();
    }
  }

  // (2) Footer copyright + (3) version.
  function fixFooter(doc) {
    var COPY = "© 2026 sharkpp. All rights reserved.";
    // Tool pages expose #footer-copyright; the home's inline footer has no id,
    // so also match any footer paragraph containing the copyright line.
    var c = doc.getElementById("footer-copyright");
    if (c) c.textContent = COPY;
    doc
      .querySelectorAll("footer p, [data-simple-footer] p")
      .forEach(function (p) {
        if (/rights reserved/i.test(p.textContent)) p.textContent = COPY;
      });
    var v = doc.getElementById("app-version");
    if (v) v.textContent = APP_VERSION;
  }

  // (4) Remove the "Back to Tools" button on tool pages.
  function removeBackToTools(doc) {
    var b = doc.getElementById("back-to-tools");
    if (b) b.remove();
  }

  // (5) Shrink the gap above #uploader to match its horizontal gap.
  function tightenUploaderGap(doc) {
    var up = doc.getElementById("uploader");
    if (up) {
      var side = getComputedStyle(up).paddingLeft;
      if (side) up.style.paddingTop = side;
    }
  }

  // (6) Add "ホーム" (hidden on home) + "ShokadoPDFについて" nav links.
  function addNavLinks(doc) {
    var base = baseUrl();
    doc.querySelectorAll("nav").forEach(function (nav) {
      if (nav.querySelector(".shokado-navlinks")) return;
      var row =
        nav.querySelector(".h-16") ||
        nav.querySelector(".container > div") ||
        nav.firstElementChild;
      if (!row) return;
      var grp = doc.createElement("div");
      grp.className = "shokado-navlinks";
      grp.setAttribute(
        "style",
        "margin-left:auto;display:flex;gap:0.5rem;align-items:center;",
      );
      var mk = function (href, label) {
        var a = doc.createElement("a");
        a.href = href;
        a.textContent = label;
        a.className = "nav-link";
        a.style.whiteSpace = "nowrap";
        return a;
      };
      if (!isHome()) grp.appendChild(mk(base, "ホーム"));
      grp.appendChild(mk(base + "about.html", "ShokadoPDFについて"));
      row.appendChild(grp);
    });
  }

  // (6b) On the About page, show ShokadoPDF's own about content.
  function replaceAbout(doc) {
    if (!isAbout()) return;
    var app = doc.getElementById("app");
    if (!app || doc.getElementById("shokado-about")) return;
    app.innerHTML = ABOUT_HTML;
    doc.title = "ShokadoPDFについて";
  }

  // (8) Give pdf-multi-tool a visible title+subtitle header like other tools.
  function injectMultiToolHeader(doc) {
    if (!isMultiTool() || doc.getElementById("shokado-mt-header")) return;
    var toolbar = doc.querySelector(".toolbar-container");
    var main = toolbar ? toolbar.parentElement : null;
    if (!main || !main.parentElement) return;
    var hdr = doc.createElement("div");
    hdr.id = "shokado-mt-header";
    hdr.className =
      "flex-none text-center bg-gray-900 border-b border-gray-800 px-4 pt-4 pb-3";
    hdr.innerHTML =
      '<h1 class="text-2xl font-bold text-white mb-1">PDF Multi Tool</h1>' +
      '<p class="text-gray-400 text-sm">Merge, Split, Organize, Delete, Rotate, Add Blank Pages, Extract and Duplicate in a unified interface.</p>';
    main.parentElement.insertBefore(hdr, main);
  }

  // (8b) Strip the pdf-multi-tool nav's "PDF Multi Tool" label and Close button
  // so its header matches the other pages (brand + nav links only).
  function stripMultiToolNav(doc) {
    if (!isMultiTool()) return;
    doc.querySelectorAll("nav span").forEach(function (s) {
      if (s.textContent.trim() === "PDF Multi Tool") s.remove();
    });
    var close = doc.getElementById("close-tool-btn");
    if (close) close.remove();
  }

  function apply() {
    try {
      applyLogo(document);
      removeUsedByBanner(document);
      fixFooter(document);
      removeBackToTools(document);
      tightenUploaderGap(document);
      fixToolGaps(document);
      addNavLinks(document);
      replaceAbout(document);
      injectMultiToolHeader(document);
      stripMultiToolNav(document);
    } catch (e) {
      console.warn("[ShokadoPDF] customize error:", e);
    }
  }

  function start() {
    apply();
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
