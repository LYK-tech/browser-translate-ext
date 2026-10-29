"use strict";

const el = id => document.getElementById(id);

chrome.storage.local.get(["enabled", "mode", "apiBase", "apiKey", "model"], s => {
  el("enabled").checked = s.enabled !== false;
  el("mode").value = s.mode || "free";
  el("apiBase").value = s.apiBase || "";
  el("apiKey").value = s.apiKey || "";
  el("model").value = s.model || "";
});

el("save").onclick = () => {
  chrome.storage.local.set({
    enabled: el("enabled").checked,
    mode: el("mode").value,
    apiBase: el("apiBase").value.trim(),
    apiKey: el("apiKey").value.trim(),
    model: el("model").value.trim()
  }, () => {
    const m = el("msg");
    m.textContent = "已保存 ✓";
    setTimeout(() => { m.textContent = ""; }, 1600);
  });
};
