// Builds a nicely laid-out A4 PDF of a recipe, for sharing (e.g. on WhatsApp).
// The pages are laid out as HTML (so Hebrew renders exactly like in the app),
// photographed with html2canvas and placed into a PDF with jsPDF.
// Both libraries live in js/vendor and are loaded only when first needed.
(() => {
  "use strict";

  const BOOK = "ספר המתכונים של כרמלה";
  const PAGE_W = 794, PAGE_H = 1123; // A4 at 96dpi

  const scripts = {};
  function loadScript(src) {
    if (!scripts[src]) {
      scripts[src] = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = resolve;
        s.onerror = () => { delete scripts[src]; s.remove(); reject(new Error("load failed: " + src)); };
        document.head.appendChild(s);
      });
    }
    return scripts[src];
  }
  const loadLibs = () => Promise.all([
    loadScript("js/vendor/html2canvas.min.js"),
    loadScript("js/vendor/jspdf.umd.min.js")
  ]);

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);

  const STYLE = `
    .pdf-root { position: fixed; top: 0; left: -20000px; z-index: -1; }
    .pdf-page {
      width: ${PAGE_W}px; height: ${PAGE_H}px; position: relative; overflow: hidden;
      background: #fffdfc; color: #2e2427; direction: rtl; text-align: right;
      font-family: "Assistant", Arial, sans-serif; font-size: 15px; line-height: 1.55;
      box-sizing: border-box; padding: 54px 60px 0;
    }
    .pdf-page * { box-sizing: border-box; }
    .pdf-band { position: absolute; top: 0; left: 0; right: 0; height: 10px; background: #a3566a; }
    .pdf-body { height: ${PAGE_H - 54 - 78}px; overflow: hidden; }
    .pdf-foot {
      position: absolute; left: 60px; right: 60px; bottom: 30px; height: 24px;
      display: flex; justify-content: space-between; align-items: center;
      border-top: 1px solid #ecdcd8; padding-top: 8px; font-size: 12px; color: #76636a;
    }
    .pdf-foot b { font-family: "Frank Ruhl Libre", Georgia, serif; font-weight: 700; color: #a3566a; font-size: 13px; }
    .pdf-cat { color: #a3566a; font-weight: 700; font-size: 13px; letter-spacing: .02em; }
    .pdf-title { font-family: "Frank Ruhl Libre", Georgia, serif; font-weight: 700; font-size: 38px; line-height: 1.2; margin: 2px 0 6px; }
    .pdf-desc { color: #76636a; margin: 0 0 12px; font-size: 15.5px; }
    .pdf-meta { color: #a3566a; font-weight: 600; margin: 0 0 10px; }
    .pdf-stats { display: flex; flex-wrap: wrap; gap: 8px 28px; padding: 10px 0 12px; border-top: 1px solid #ecdcd8; border-bottom: 1px solid #ecdcd8; margin-bottom: 18px; }
    .pdf-stat .l { font-size: 12px; color: #76636a; }
    .pdf-stat .v { font-weight: 700; font-size: 15px; }
    .pdf-photo { height: 220px; border-radius: 14px; background-size: cover; background-position: center; margin-bottom: 20px; }
    .pdf-h2 { font-family: "Frank Ruhl Libre", Georgia, serif; font-weight: 700; font-size: 24px; margin: 8px 0 4px; color: #2e2427; }
    .pdf-h2 span { display: inline-block; border-bottom: 3px solid #f0d4db; padding-bottom: 2px; }
    .pdf-h3 { font-weight: 700; font-size: 15.5px; color: #a3566a; margin: 12px 0 4px; }
    .pdf-ing-row { display: flex; gap: 28px; }
    .pdf-ing-row > div { flex: 1 1 0; min-width: 0; }
    .pdf-ing { display: flex; gap: 9px; padding: 2px 0; }
    .pdf-ing .dot { flex: 0 0 6px; height: 6px; margin-top: 14px; border-radius: 50%; background: #c98f9d; }
    .pdf-ing .ing-amount { font-weight: 700; }
    .pdf-ing .ing-note { color: #76636a; }
    .pdf-ing .num { unicode-bidi: isolate; direction: ltr; display: inline-block; }
    .pdf-step { display: flex; gap: 12px; padding: 4px 0; }
    .pdf-step .n {
      flex: 0 0 26px; height: 26px; border-radius: 50%; background: #f5e3e6; color: #a3566a;
      font-weight: 700; font-size: 13px; line-height: 18px; text-align: center; margin-top: 7px;
    }
    .pdf-step .t { flex: 1; }
    .pdf-notes { background: #eef2ea; border-radius: 12px; padding: 12px 16px; margin-top: 14px; }
    .pdf-notes b { color: #4f5f47; }
    .pdf-notes p { margin: 4px 0 0; white-space: pre-line; }
    .pdf-source { color: #76636a; font-size: 13px; margin-top: 12px; }
    .pdf-cont { color: #76636a; font-size: 12px; margin-bottom: 8px; }
  `;

  // Turns the recipe into a list of small blocks that can be flowed across pages.
  // `keepNext` keeps a heading together with the block after it.
  function buildBlocks({ recipe: r, stats, meta, ingsEl, stepsEl }) {
    const blocks = [];
    const add = (html, keepNext = false) => blocks.push({ html, keepNext });

    add(`${r.category ? `<div class="pdf-cat">${esc([r.category, r.subcategory].filter(Boolean).join(" · "))}</div>` : ""}
      <div class="pdf-title">${esc(r.title)}</div>
      ${r.description ? `<p class="pdf-desc">${esc(r.description)}</p>` : ""}
      ${meta ? `<p class="pdf-meta">${esc(meta)}</p>` : ""}
      ${stats.length ? `<div class="pdf-stats">${stats.map(([l, v]) =>
        `<div class="pdf-stat"><div class="l">${esc(l)}</div><div class="v">${esc(v)}</div></div>`).join("")}</div>` : ""}`);
    if (r.image) add(`<div class="pdf-photo" style="background-image:url('${encodeURI(r.image)}')"></div>`);

    add(`<div class="pdf-h2"><span>מצרכים</span></div>`, true);
    for (const el of ingsEl.children) {
      if (el.tagName === "H3") add(`<div class="pdf-h3">${esc(el.textContent)}</div>`, true);
      else {
        // Two ingredients per row, so short recipes fit on a single page
        const items = [...el.querySelectorAll("li .ing-text")].map((t) =>
          `<div class="pdf-ing"><span class="dot"></span><span>${t.innerHTML}</span></div>`);
        for (let k = 0; k < items.length; k += 2) add(`<div class="pdf-ing-row">${items[k]}${items[k + 1] || "<div></div>"}</div>`);
      }
    }

    add(`<div class="pdf-h2" style="margin-top:18px"><span>אופן ההכנה</span></div>`, true);
    let n = 0;
    for (const el of stepsEl.children) {
      if (el.tagName === "H3") add(`<div class="pdf-h3">${esc(el.textContent)}</div>`, true);
      else el.querySelectorAll("li").forEach((li) =>
        add(`<div class="pdf-step"><span class="n">${++n}</span><span class="t">${esc(li.textContent)}</span></div>`));
    }

    if (r.notes) add(`<div class="pdf-notes"><b>💡 טיפים והערות</b><p>${esc(r.notes)}</p></div>`);
    if (r.source && (r.source.name || r.source.url)) add(`<div class="pdf-source">מקור: ${esc(r.source.name || r.source.url)}</div>`);
    return blocks;
  }

  function newPage(root, title, index) {
    const page = document.createElement("div");
    page.className = "pdf-page";
    page.innerHTML = `<div class="pdf-band"></div><div class="pdf-body">${index ? `<div class="pdf-cont">${esc(title)} (המשך)</div>` : ""}</div><div class="pdf-foot"></div>`;
    root.appendChild(page);
    return page;
  }

  // Flow blocks into pages, starting a new page whenever the next block doesn't fit
  function paginate(root, blocks, title) {
    const pages = [newPage(root, title, 0)];
    let body = pages[0].querySelector(".pdf-body");
    const overflow = () => body.scrollHeight > body.clientHeight + 1;

    for (let i = 0; i < blocks.length; i++) {
      // A heading is placed together with the block that follows it
      const group = [blocks[i]];
      while (group[group.length - 1].keepNext && i + 1 < blocks.length) group.push(blocks[++i]);

      const nodes = group.map((b) => {
        const wrap = document.createElement("div");
        wrap.innerHTML = b.html;
        return wrap;
      });
      nodes.forEach((nd) => body.appendChild(nd));
      const onlyContent = body.children.length === nodes.length + (pages.length > 1 ? 1 : 0);
      if (overflow() && !onlyContent) {
        nodes.forEach((nd) => nd.remove());
        pages.push(newPage(root, title, pages.length));
        body = pages[pages.length - 1].querySelector(".pdf-body");
        nodes.forEach((nd) => body.appendChild(nd));
      }
    }

    pages.forEach((p, i) => {
      p.querySelector(".pdf-foot").innerHTML =
        `<b>${BOOK}</b><span>${pages.length > 1 ? `עמוד ${i + 1} מתוך ${pages.length}` : ""}</span>`;
    });
    return pages;
  }

  function imagesLoaded(root) {
    const urls = [...root.querySelectorAll(".pdf-photo")].map((el) =>
      el.style.backgroundImage.replace(/^url\(["']?|["']?\)$/g, ""));
    return Promise.all(urls.map((u) => new Promise((res) => {
      const img = new Image();
      img.onload = img.onerror = res;
      img.src = u;
    })));
  }

  async function make(data) {
    await loadLibs();
    const style = document.createElement("style");
    style.textContent = STYLE;
    const root = document.createElement("div");
    root.className = "pdf-root";
    root.setAttribute("aria-hidden", "true");
    document.head.appendChild(style);
    document.body.appendChild(root);
    try {
      if (document.fonts && document.fonts.load) {
        await Promise.all([
          document.fonts.load('700 38px "Frank Ruhl Libre"', "אבג"),
          document.fonts.load('400 15px "Assistant"', "אבג"),
          document.fonts.load('700 15px "Assistant"', "אבג")
        ]).catch(() => {});
      }
      const pages = paginate(root, buildBlocks(data), data.recipe.title);
      await imagesLoaded(root);

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
      const w = pdf.internal.pageSize.getWidth(), h = pdf.internal.pageSize.getHeight();
      for (let i = 0; i < pages.length; i++) {
        const canvas = await window.html2canvas(pages[i], {
          scale: 2, backgroundColor: "#fffdfc", useCORS: true, logging: false,
          width: PAGE_W, height: PAGE_H, windowWidth: PAGE_W
        });
        if (i) pdf.addPage();
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, w, h);
      }
      pdf.setProperties({ title: data.recipe.title, author: BOOK });
      return pdf.output("blob");
    } finally {
      root.remove();
      style.remove();
    }
  }

  window.RecipePdf = { make, preload: () => loadLibs().catch(() => {}) };
})();
