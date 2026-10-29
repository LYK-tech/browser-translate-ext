"use strict";

const DICT = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const GT = "https://translate.googleapis.com/translate_a/single?client=gtx";

function isWordLocal(t) {
  const s = (t || "").trim();
  return /^[A-Za-z][A-Za-z'’\-\.]*$/.test(s);
}

async function gtranslate(text, sl, tl) {
  const url = `${GT}&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("翻译服务不可用");
  const data = await r.json();
  let out = "";
  if (data && data[0]) {
    for (const seg of data[0]) if (seg && seg[0]) out += seg[0];
  }
  return out.trim();
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
  }

  const tr = await gtranslate(text, sl, tl);
  return { ok: true, data: { translation: tr } };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "translate") {
    handleTranslate(msg).then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
});

// 右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "wb-translate", title: "翻译选中内容", contexts: ["selection"] });
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "wb-translate" || !info.selectionText) return;
  const word = isWordLocal(info.selectionText);
  const hasCJK = /[一-鿿]/.test(info.selectionText);
  handleTranslate({ text: info.selectionText, word, hasCJK }).then(data => {
    chrome.tabs.sendMessage(tab.id, { type: "showTranslation", text: info.selectionText, word, data: { ok: true, data } });
  }).catch(e => {
    chrome.tabs.sendMessage(tab.id, { type: "showTranslation", text: info.selectionText, word, data: { ok: false, error: e.message } });
  });
});
