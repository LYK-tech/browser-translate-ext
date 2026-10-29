(function () {
  "use strict";

  const CSS = `
.wb-trans-panel{position:absolute;z-index:2147483647;width:340px;max-width:90vw;background:#fff;color:#1f2329;border:1px solid #e5e6eb;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.18);font:14px/1.5 -apple-system,Segoe UI,Roboto,'PingFang SC','Microsoft YaHei',sans-serif;overflow:hidden}
.wb-trans-head{display:flex;align-items:center;gap:8px;padding:10px 12px;background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff}
.wb-word{font-weight:700;font-size:15px;word-break:break-word}
.wb-phon{opacity:.92;font-size:13px}
.wb-close{margin-left:auto;background:rgba(255,255,255,.2);border:0;color:#fff;width:22px;height:22px;border-radius:6px;cursor:pointer;font-size:16px;line-height:1}
.wb-close:hover{background:rgba(255,255,255,.38)}
.wb-body{padding:10px 12px;max-height:300px;overflow:auto}
.wb-trans-text{font-size:15px;line-height:1.7;word-break:break-word}
.wb-note{color:#888;font-size:12px;margin-bottom:6px}
.wb-pos{margin:8px 0}
.wb-tag{display:inline-block;background:#eef2ff;color:#4338ca;font-size:12px;font-weight:600;padding:1px 8px;border-radius:6px;margin-bottom:4px}
.wb-pos ul{margin:4px 0 0;padding-left:18px}
.wb-pos li{margin:4px 0}
.wb-ex{color:#7a8290;font-size:12px;margin-top:2px;font-style:italic;word-break:break-word}
.wb-err{color:#d4380d}
.wb-trans-loading{padding:14px;color:#888}
`;

  function injectCSS() {
    if (document.getElementById("wb-trans-style")) return;
    const s = document.createElement("style");
    s.id = "wb-trans-style";
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  let panel = null;
  function removePanel() {
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    panel = null;
  }

  function isEnglish(t) { return /[A-Za-z]/.test(t); }
  function isCJK(t) { return /[一-鿿]/.test(t); }
  function isWord(t) {
    const s = t.trim();
    return /^[A-Za-z][A-Za-z'’\-\.]*$/.test(s);
  }

  function getSelRect() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const r = sel.getRangeAt(0).getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return r;
  }

  function position(rect) {
    if (!panel) return;
    const sx = window.scrollX, sy = window.scrollY;
    panel.style.position = "absolute";
    let left = rect.left + sx;
    let top = rect.bottom + sy + 8;
    panel.style.left = left + "px";
    panel.style.top = top + "px";
    let pr = panel.getBoundingClientRect();
    if (pr.right > window.innerWidth - 8) {
      let nl = window.innerWidth - 8 - pr.width + sx;
      panel.style.left = Math.max(8 + sx, nl) + "px";
    }
    pr = panel.getBoundingClientRect();
    if (pr.bottom > window.innerHeight - 8) {
      panel.style.top = (rect.top + sy - pr.height - 8) + "px";
    }
  }

  function showLoading(rect) {
    removePanel();
    panel = document.createElement("div");
    panel.className = "wb-trans-panel";
    panel.innerHTML = '<div class="wb-trans-loading">⟳ 查询中…</div>';
    document.body.appendChild(panel);
    position(rect);
  }

  function esc(s) {
    return (s || "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  }

  function renderWord(data) {
    let html = '<div class="wb-trans-head"><span class="wb-word">' + esc(data.word) + "</span>";
    if (data.phonetic) html += ' <span class="wb-phon">/' + esc(data.phonetic) + "/</span>";
    html += '<button class="wb-close" title="关闭">×</button></div><div class="wb-body">';
    if (data.notFound) {
      html += '<div class="wb-note">未找到词典释义，已为你翻译：</div>';
      html += '<div class="wb-trans-text">' + esc(data.translation || "") + "</div>";
    } else {
      for (const m of data.meanings) {
        html += '<div class="wb-pos"><span class="wb-tag">' + esc(m.pos) + "</span><ul>";
        for (const d of m.defs) {
          html += "<li>" + esc(d.def);
          if (d.ex) html += '<div class="wb-ex">' + esc(d.ex) + "</div>";
          html += "</li>";
        }
        html += "</ul></div>";
      }
    }
    html += "</div>";
    return html;
  }

  function renderSentence(data) {
    return '<div class="wb-trans-head"><span class="wb-word">译文</span><button class="wb-close" title="关闭">×</button></div><div class="wb-body"><div class="wb-trans-text">' + esc(data.translation || "") + "</div></div>";
  }

  function renderError(msg) {
    return '<div class="wb-trans-head"><span class="wb-word">提示</span><button class="wb-close" title="关闭">×</button></div><div class="wb-body"><div class="wb-err">' + esc(msg) + "</div></div>";
  }

  function render(text, data, word) {
    removePanel();
    panel = document.createElement("div");
    panel.className = "wb-trans-panel";
    panel.innerHTML = word ? renderWord(data) : renderSentence(data);
    document.body.appendChild(panel);
    const btn = panel.querySelector(".wb-close");
    if (btn) btn.addEventListener("click", removePanel);
    return panel;
  }

  // 来自右键菜单的请求
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "showTranslation") {
      const rect = getSelRect();
      if (!rect) return;
      if (msg.data && msg.data.ok) {
        const p = render(msg.text, msg.data.data || {}, msg.word);
        position(rect);
      } else {
        const p = render(msg.text, {}, msg.word);
        p.querySelector(".wb-body").innerHTML = renderError((msg.data && msg.data.error) || "翻译失败");
        position(rect);
      }
    }
  });

  async function onSelect() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    let node = sel.anchorNode;
    if (node && node.nodeType === 3) node = node.parentNode;
    if (node && (node.tagName === "INPUT" || node.tagName === "TEXTAREA" || node.isContentEditable)) return;
    const text = sel.toString().trim();
    if (!text || text.length > 2000) return;
    const cjk = isCJK(text), eng = isEnglish(text);
    if (!cjk && !eng) return; // 只处理英文或中文
    const rect = getSelRect();
    if (!rect) return;
    const word = isWord(text) && eng;
    showLoading(rect);
    chrome.runtime.sendMessage({ type: "translate", text: text, word: word, hasCJK: cjk }, (resp) => {
      if (chrome.runtime.lastError || !resp) { removePanel(); return; }
      if (resp.ok) {
        const p = render(text, resp.data, word);
        position(rect);
      } else {
        const p = render(text, {}, word);
        p.querySelector(".wb-body").innerHTML = renderError(resp.error || "翻译失败");
        position(rect);
      }
    });
  }

  document.addEventListener("mouseup", (e) => {
    if (panel && panel.contains(e.target)) return;
    setTimeout(onSelect, 10);
  });
  document.addEventListener("mousedown", (e) => {
    if (panel && !panel.contains(e.target)) removePanel();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") removePanel(); });

  injectCSS();
})();
