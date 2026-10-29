"use strict";

// 在 Offscreen Document 中运行本地 OCR（tesseract.js v5），完全离线、图片不上传。
// 关键：tesseract 会按设备能力从 corePath 目录挑选合适的核心（SIMD / LSTM 变体），
// 因此 corePath 目录方式最稳；但目录需要全套变体文件。若变体文件缺失，则退回“单文件”核心
// （通用非 SIMD 核心，所有设备都能跑，只是稍慢），以最大化可用性。

let workerPromise = null;
let lastStatus = "(未开始)";

function withTimeout(p, ms, label) {
  let t;
  const to = new Promise((_, rej) =>
    t = setTimeout(() => rej(new Error(label + " 超时(" + (ms / 1000) + "s)")), ms)
  );
  return Promise.race([p, to]).finally(() => clearTimeout(t));
}

async function tryCreateWorker(corePath) {
  const { createWorker } = Tesseract;
  const mode = corePath.endsWith("/") ? "目录" : "单文件";
  lastStatus = "正在创建 Worker / 加载 tesseract 核心(wasm) [" + mode + "]";
  const worker = await createWorker("eng", 1, {
    workerPath: chrome.runtime.getURL("ocr/worker.min.js"),
    corePath: corePath,
    langPath: chrome.runtime.getURL("ocr/"),
    workerBlobURL: false,           // 直接使用扩展内 worker 脚本（同源，避免 blob: 被 CSP 拦截）
    logger: (m) => { if (m && m.status) lastStatus = m.status; }
  });
  await worker.setParameters({ tessedit_pageseg_mode: 6 });
  return worker;
}

function getWorker() {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    if (typeof Tesseract === "undefined" || typeof Tesseract.createWorker !== "function") {
      throw new Error("Tesseract 引擎未加载（tesseract.min.js 未成功执行）");
    }
    const dir = chrome.runtime.getURL("ocr/");
    const file = chrome.runtime.getURL("ocr/tesseract-core.wasm.js");
    // 先试“目录方式”（按需选 SIMD/LSTM 变体）；若变体缺失/失败，退回“单文件”通用核心
    try {
      return await withTimeout(tryCreateWorker(dir), 15000, "①目录方式创建核心");
    } catch (e) {
      lastStatus = "目录方式失败，改用单文件核心：" + (e && e.message ? e.message : e);
      return await tryCreateWorker(file);   // 单文件：交给外层 watchdog 兜底
    }
  })();
  // 失败时重置：否则 workerPromise 会永久保持 rejected，导致之后每次重试都以同样错误瞬间失败
  workerPromise.catch(() => { workerPromise = null; });
  return workerPromise;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 后台握手：确认 offscreen 已就绪
  if (msg.type === "ocrPing") { sendResponse({ ready: true }); return false; }
  if (msg.type !== "doOCR") return false;

  (async () => {
    let text = "";
    let error = "";
    // 整体超时保护：避免 tesseract 初始化/识别卡死导致前台永远“识别中”。
    // 超时报错里带上 lastStatus，方便定位到底卡在“加载核心 / 加载语言包 / 初始化 / 识别”哪一步。
    const watchdog = new Promise((_, rej) =>
      setTimeout(() => rej(new Error("OCR 超时(40s)，最后状态：" + lastStatus)), 40000)
    );
    try {
      const worker = await Promise.race([getWorker(), watchdog]);
      lastStatus = "核心已就绪，正在识别图像";
      const res = await Promise.race([worker.recognize(msg.image), watchdog]);
      text = (res.data.text || "").replace(/\s+/g, " ").trim();
    } catch (e) {
      // 保留堆栈前几行，便于在“复制错误”里定位根因
      error = (e && e.message ? e.message : String(e));
      if (e && e.stack) error += " :: " + e.stack.split("\n").slice(0, 2).join(" ").slice(0, 200);
    }
    // 通过独立的 runtime 消息把结果回传给后台 Service Worker（按 reqId 关联）
    chrome.runtime.sendMessage({ type: "ocrResult", reqId: msg.reqId, text: text, error: error });
  })();

  return false; // 结果通过上面的 sendMessage 异步回传，此处无需 sendResponse
});
