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
.wb-retry{margin-top:10px;background:#3b82f6;color:#fff;border:0;border-radius:6px;padding:5px 14px;cursor:pointer;font-size:13px}
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
    } else if (msg.type === "startScreenshot") {
      startScreenshot();
    } else if (msg.type === "toast") {
      showToast(msg.text);
    }
  });

  async function onSelect() {
    if (shotLayer) return;
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
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { removePanel(); exitShot(); } });

  // ===== 截图翻译 =====
  let shotLayer = null, shotImg = null, selBox = null, startX = 0, startY = 0;

  function exitShot() {
    if (shotLayer && shotLayer.parentNode) shotLayer.parentNode.removeChild(shotLayer);
    shotLayer = null; shotImg = null; selBox = null;
  }

  function showShotLayer() {
    shotLayer = document.createElement("div");
    shotLayer.style.cssText = "position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:#000;overflow:hidden";
    const img = document.createElement("img");
    img.src = shotImg.src;
    img.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;object-fit:fill;pointer-events:none;opacity:1";
    shotLayer.appendChild(img);
    const tint = document.createElement("div");
    tint.style.cssText = "position:absolute;inset:0;background:rgba(0,0,0,.3);pointer-events:none";
    shotLayer.appendChild(tint);
    selBox = document.createElement("div");
    selBox.style.cssText = "position:absolute;border:2px dashed #3b82f6;background:rgba(59,130,246,.12);display:none";
    shotLayer.appendChild(selBox);
    const tip = document.createElement("div");
    tip.textContent = "框选要翻译的英文区域，松开即识别（Esc 取消）";
    tip.style.cssText = "position:absolute;top:12px;left:50%;transform:translateX(-50%);background:#1f2329;color:#fff;padding:6px 12px;border-radius:8px;font-size:13px;z-index:2;white-space:nowrap";
    shotLayer.appendChild(tip);
    document.body.appendChild(shotLayer);

    shotLayer.addEventListener("mousedown", (e) => {
      if (e.target !== shotLayer && e.target !== img) return;
      startX = e.clientX; startY = e.clientY;
      selBox.style.display = "block";
      selBox.style.left = startX + "px"; selBox.style.top = startY + "px";
      selBox.style.width = "0px"; selBox.style.height = "0px";
      e.preventDefault();
    });
    shotLayer.addEventListener("mousemove", (e) => {
      if (selBox.style.display !== "block") return;
      const x = Math.min(e.clientX, startX), y = Math.min(e.clientY, startY);
      selBox.style.left = x + "px"; selBox.style.top = y + "px";
      selBox.style.width = Math.abs(e.clientX - startX) + "px";
      selBox.style.height = Math.abs(e.clientY - startY) + "px";
    });
    shotLayer.addEventListener("mouseup", () => {
      if (selBox.style.display !== "block") return;
      const rect = selBox.getBoundingClientRect();
      selBox.style.display = "none";
      if (rect.width < 8 || rect.height < 8) return;
      doOCR(rect);
    });
  }

  function startScreenshot() {
    if (shotLayer) return;
    chrome.runtime.sendMessage({ type: "captureScreenshot" }, (resp) => {
      if (chrome.runtime.lastError || !resp || !resp.ok) {
        showToast("截图失败：" + ((resp && resp.error) || "未知错误"));
        return;
      }
      shotImg = new Image();
      shotImg.onload = showShotLayer;
      shotImg.onerror = () => showToast("截图加载失败");
      shotImg.src = resp.dataUrl;
    });
  }

  async function doOCR(rect) {
    try {
      const natW = shotImg.naturalWidth, natH = shotImg.naturalHeight;
      const dispW = shotImg.clientWidth || shotLayer.clientWidth;
      const dispH = shotImg.clientHeight || shotLayer.clientHeight;
      const scaleX = natW / dispW, scaleY = natH / dispH;
      const sx = Math.max(0, Math.round(rect.left * scaleX));
      const sy = Math.max(0, Math.round(rect.top * scaleY));
      const sw = Math.max(1, Math.round(rect.width * scaleX));
      const sh = Math.max(1, Math.round(rect.height * scaleY));
      const canvas = document.createElement("canvas");
      canvas.width = sw; canvas.height = sh;
      canvas.getContext("2d").drawImage(shotImg, sx, sy, sw, sh, 0, 0, sw, sh);
      const cropUrl = canvas.toDataURL("image/png");

      showFloatAt(rect, "⟳ OCR 识别中…");
      // 加超时保护：后台若一直不回，35s 后给出可重试的错误，而不是永远“识别中”
      const resp = await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("OCR 请求超时（请到 edge://extensions 重载扩展后重试）")), 35000);
        chrome.runtime.sendMessage({ type: "ocrTranslate", image: cropUrl }, (r) => {
          clearTimeout(t);
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(r);
        });
      });
      removePanel();
      if (!resp || !resp.ok) {
        showOCRError(rect, (resp && resp.error) || "OCR/翻译失败");
        return;
      }
      const word = isWord(resp.text);
      const p = render(resp.text, resp.data, word);
      positionRect(p, rect);
    } catch (err) {
      removePanel();
      showOCRError(rect, "OCR 失败：" + err.message);
    } finally {
      exitShot();
    }
  }

  function showOCRError(rect, msg) {
    const p = showFloatAt(rect, "");
    const box = p.querySelector(".wb-trans-loading");
    box.innerHTML = '<div class="wb-err">' + esc(msg) + '</div><button class="wb-retry" type="button">重试</button>';
    box.querySelector(".wb-retry").addEventListener("click", () => { removePanel(); startScreenshot(); });
    return p;
  }

  function showFloatAt(rect, txt) {
    removePanel();
    panel = document.createElement("div");
    panel.className = "wb-trans-panel";
    panel.innerHTML = '<div class="wb-trans-loading">' + esc(txt) + "</div>";
    document.body.appendChild(panel);
    positionRect(panel, rect);
    return panel;
  }

  function positionRect(p, rect) {
    if (!p) return;
    const sx = window.scrollX, sy = window.scrollY;
    let left = rect.left + sx;
    let top = rect.bottom + sy + 8;
    p.style.position = "absolute";
    p.style.left = left + "px";
    p.style.top = top + "px";
    const pr = p.getBoundingClientRect();
    if (pr.right > window.innerWidth - 8) p.style.left = Math.max(8 + sx, window.innerWidth - 8 - pr.width + sx) + "px";
    if (pr.bottom > window.innerHeight - 8) p.style.top = (rect.top + sy - pr.height - 8) + "px";
  }

  function showToast(txt) {
    const t = document.createElement("div");
    t.textContent = txt;
    t.style.cssText = "position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#1f2329;color:#fff;padding:8px 16px;border-radius:8px;font-size:13px;box-shadow:0 6px 20px rgba(0,0,0,.25)";
    document.body.appendChild(t);
    setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 2600);
  }

  injectCSS();
})();
