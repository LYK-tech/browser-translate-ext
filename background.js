"use strict";

const DICT = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const GT = "https://translate.googleapis.com/translate_a/single?client=gtx";

function isWordLocal(t) {
  const s = (t || "").trim();
  return /^[A-Za-z][A-Za-z'’\-\.]*$/.test(s);
}

async function gtranslate(text, sl, tl) {
  // 依次尝试官方域名与国内镜像，提升在受限网络下的可用性
  const hosts = [
    "https://translate.googleapis.com/translate_a/single?client=gtx",
    "https://translate.google.cn/translate_a/single?client=gtx"
  ];
  let lastErr = null;
  for (const host of hosts) {
    try {
      const url = `${host}&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`;
      const r = await fetch(url);
      if (!r.ok) { lastErr = new Error("HTTP " + r.status); continue; }
      const data = await r.json();
      let out = "";
      if (data && data[0]) for (const seg of data[0]) if (seg && seg[0]) out += seg[0];
      if (out.trim()) return out.trim();
    } catch (e) { lastErr = e; }
  }
  throw new Error("翻译服务不可用（请检查网络，或在选项中改用大模型翻译）");
}

async function dictWord(word) {
  const url = `${DICT}${encodeURIComponent(word.toLowerCase())}`;
  const r = await fetch(url);
  if (r.status === 404) return { notFound: true };
  if (!r.ok) throw new Error("词典请求失败");
  const arr = await r.json();
  let phonetic = "";
  const meanings = [];
  for (const entry of arr) {
    if (!phonetic) {
      if (entry.phonetic) phonetic = entry.phonetic;
      else if (entry.phonetics) {
        const p = entry.phonetics.find(x => x.text);
        if (p) phonetic = p.text;
      }
    }
    for (const m of entry.meanings || []) {
      meanings.push({
        pos: m.partOfSpeech,
        defs: (m.definitions || []).slice(0, 3).map(d => ({ def: d.definition, ex: d.example || "" }))
      });
    }
  }
  return { phonetic, meanings };
}

async function llmTranslate(msg, settings) {
  const { text, word } = msg;
  const base = settings.apiBase || "https://api.deepseek.com/v1";
  const model = settings.model || "deepseek-chat";
  const sys = word
    ? 'You are a bilingual lexicographer. Given an English word, respond with STRICT JSON only: {"phonetic":"...","meanings":[{"pos":"noun","defs":[{"def":"中文释义","ex":"English example sentence"}]}]}. Provide the 2-4 most common meanings, label part of speech (noun/verb/adjective/adverb/preposition/conjunction/interjection), give a concise Simplified Chinese definition for each, and one natural English example. No extra text, no markdown.'
    : 'You are a professional translator. Translate the following English text into fluent, natural Simplified Chinese. Output ONLY the translation, no explanations or quotation marks.';
  const body = {
    model,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: text }
    ],
    temperature: 0.2
  };
  if (word) body.response_format = { type: "json_object" };
  const r = await fetch(base.replace(/\/$/, "") + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + settings.apiKey },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error("大模型请求失败: " + r.status);
  const data = await r.json();
  const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
  if (word) {
    try {
      const j = JSON.parse(content);
      return { ok: true, data: { word: text, phonetic: j.phonetic || "", meanings: j.meanings || [], source: "llm" } };
    } catch (e) {
      return { ok: true, data: { word: text, notFound: true, translation: content, source: "llm" } };
    }
  }
  return { ok: true, data: { translation: content.trim(), source: "llm" } };
}

async function handleTranslate(msg) {
  const { text, word, hasCJK } = msg;
  const settings = await chrome.storage.local.get(["mode", "apiBase", "apiKey", "model", "enabled"]);
  if (settings.enabled === false) return { ok: false, error: "扩展已关闭（可在选项中开启）" };

  if (settings.mode === "llm" && settings.apiKey) {
    try { return await llmTranslate(msg, settings); }
    catch (e) { /* 大模型失败则回退免费引擎 */ }
  }

  // 免费引擎
  const onlyCJK = hasCJK && !isWordLocal(text) && !/[A-Za-z]/.test(text);
  const sl = onlyCJK ? "zh-CN" : "en";
  const tl = onlyCJK ? "en" : "zh-CN";

  if (word && !onlyCJK) {
    try {
      const d = await dictWord(text);
      if (d.notFound) {
        const tr = await gtranslate(text, "en", "zh-CN");
        return { ok: true, data: { word: text, notFound: true, translation: tr } };
      }
      // 把每组释义翻译成中文
      await Promise.all(d.meanings.map(async (m) => {
        const joined = m.defs.map(x => x.def).join("\n");
        try {
          const zh = await gtranslate(joined, "en", "zh-CN");
          const parts = zh.split("\n").map(s => s.trim()).filter(Boolean);
          if (parts.length) {
            m.defs.forEach((x, i) => { if (parts[i]) x.def = parts[i]; });
          }
        } catch (e) { /* 保留英文原释义 */ }
      }));
      return { ok: true, data: { word: text, phonetic: d.phonetic, meanings: d.meanings } };
    } catch (e) {
      // 词典接口不可用（如网络受限）则退化为直接翻译单词
      const tr = await gtranslate(text, "en", "zh-CN");
      return { ok: true, data: { word: text, notFound: true, translation: tr } };
    }
  }

  const tr = await gtranslate(text, sl, tl);
  return { ok: true, data: { translation: tr } };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "translate") {
    handleTranslate(msg).then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg.type === "captureScreenshot") {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        sendResponse({ ok: false, error: (chrome.runtime.lastError && chrome.runtime.lastError.message) || "截图失败" });
      } else {
        sendResponse({ ok: true, dataUrl });
      }
    });
    return true;
  }
  if (msg.type === "ocrTranslate") {
    handleOCR(msg).then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg.type === "ocrResult") {  // 来自 offscreen 文档：OCR 文本回传
    const resolve = ocrPending.get(msg.reqId);
    if (resolve) { ocrPending.delete(msg.reqId); resolve(msg); }
    return false;  // 无需回复
  }
});

// ===== 截图翻译：把裁剪图交给后台的 Offscreen Document 做本地 OCR，再翻译 =====
// 重要：tesseract.js 必须在“真正的文档”里运行——Service Worker 没有 DOM、也不能创建子 Worker，
// 因此无法承载 tesseract。MV3 正确做法是用 chrome.offscreen 开一个隐藏文档跑 OCR
// （offscreen 文档以扩展源站运行、支持 DOM 与 Worker，可正常加载本地 wasm 与语言包）。
let offscreenCreating = null;
// 握手：offscreen 文档加载并注册监听需要时间，createDocument 返回并不代表它已可收消息。
// 因此反复 ping，直到 offscreen 回应 ready，再发 doOCR，避免消息丢失导致永久“识别中”。
function waitForOffscreenReady(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const ping = () => {
      try {
        chrome.runtime.sendMessage({ type: "ocrPing" }, (resp) => {
          if (resp && resp.ready) return resolve();
          if (Date.now() - start > timeoutMs) return reject(new Error("OCR 后台未就绪（请到 edge://extensions 重载扩展）"));
          setTimeout(ping, 150);
        });
      } catch (e) {
        setTimeout(ping, 150);
      }
    };
    ping();
  });
}
async function ensureOffscreen() {
  if (!chrome.offscreen) throw new Error("当前浏览器不支持 Offscreen Document（请升级 Edge/Chrome 至 109+）");
  if (offscreenCreating) { await offscreenCreating; }
  else {
    let exists = false;
    try {
      if (chrome.runtime.getContexts) {
        const ctx = await chrome.runtime.getContexts({
          contextTypes: ["OFFSCREEN_DOCUMENT"],
          documentUrls: [chrome.runtime.getURL("offscreen.html")]
        });
        exists = ctx.length > 0;
      }
    } catch (e) { /* 旧版本无 getContexts，跳过检查即可 */ }
    if (!exists) {
      offscreenCreating = chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["WORKERS"],
        justification: "运行本地 OCR 引擎（tesseract.js）以识别截图中无法选中复制的英文文字"
      }).catch(() => {});
      await offscreenCreating;
      offscreenCreating = null;
    }
  }
  await waitForOffscreenReady();   // 关键：确认 offscreen 已就绪再继续
}

// ocrTranslate(来自 content) -> 交给 offscreen 做 OCR -> ocrResult(来自 offscreen) -> 翻译
const ocrPending = new Map();
let ocrReqId = 0;

async function handleOCR(msg) {
  const reqId = ++ocrReqId;
  const done = new Promise((resolve) => ocrPending.set(reqId, resolve));
  try {
    await ensureOffscreen();
  } catch (e) {
    return { ok: false, error: "OCR 后台未就绪：" + e.message };
  }
  chrome.runtime.sendMessage({ type: "doOCR", reqId, image: msg.image });
  const result = await done;          // offscreen 通过 ocrResult 回传 {text, error, stage}
  ocrPending.delete(reqId);
  if (result && result.error) return { ok: false, error: "OCR 识别失败：" + result.error };
  const text = (result && result.text || "").trim();
  if (!text) return { ok: false, error: "OCR 未识别到文字（选区可能无文字或太模糊）" };
  const word = isWordLocal(text);
  try {
    const tr = await handleTranslate({ text: text, word: word, hasCJK: false });
    return { ok: true, text: text, data: tr.data };
  } catch (e) {
    return { ok: false, error: "翻译失败：" + e.message };
  }
}

// 右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "wb-translate", title: "翻译选中内容", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "wb-screenshot", title: "截图翻译（框选识别）", contexts: ["page", "image"] });
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "wb-screenshot") { sendStartScreenshot(tab); return; }
  if (info.menuItemId !== "wb-translate" || !info.selectionText) return;
  const word = isWordLocal(info.selectionText);
  const hasCJK = /[一-鿿]/.test(info.selectionText);
  handleTranslate({ text: info.selectionText, word, hasCJK }).then(data => {
    chrome.tabs.sendMessage(tab.id, { type: "showTranslation", text: info.selectionText, word, data: { ok: true, data } });
  }).catch(e => {
    chrome.tabs.sendMessage(tab.id, { type: "showTranslation", text: info.selectionText, word, data: { ok: false, error: e.message } });
  });
});

// ===== 截图翻译触发 =====
async function sendStartScreenshot(tab) {
  if (!tab || !tab.id) return;
  const s = await chrome.storage.local.get(["enabled", "screenshotEnabled"]);
  if (s.enabled === false) {
    chrome.tabs.sendMessage(tab.id, { type: "toast", text: "扩展已关闭（可在选项中开启）" });
    return;
  }
  if (s.screenshotEnabled === false) {
    chrome.tabs.sendMessage(tab.id, { type: "toast", text: "截图翻译已关闭（可在选项中开启）" });
    return;
  }
  chrome.tabs.sendMessage(tab.id, { type: "startScreenshot" });
}

function activeTab(cb) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => { if (tabs[0]) cb(tabs[0]); });
}

chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === "start-screenshot") activeTab(sendStartScreenshot);
});

chrome.action.onClicked.addListener((tab) => sendStartScreenshot(tab));
