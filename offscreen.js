"use strict";

// 在 Offscreen Document 中运行本地 OCR（tesseract.js v5），完全离线、图片不上传。
// 仅使用 chrome.runtime 进行消息收发（offscreen 文档只暴露 runtime API）。

let workerPromise = null;

function getWorker() {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    const { createWorker } = Tesseract;
    const worker = await createWorker("eng", 1, {
      workerPath: chrome.runtime.getURL("ocr/worker.min.js"),
      corePath: chrome.runtime.getURL("ocr/tesseract-core.wasm.js"),
      langPath: chrome.runtime.getURL("ocr/"),
      workerBlobURL: false,           // 直接使用扩展内 worker 脚本（同源，可访问扩展资源）
      logger: () => {}
    });
    await worker.setParameters({ tessedit_pageseg_mode: 6 });
    return worker;
  })();
  return workerPromise;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 后台握手：确认 offscreen 已就绪
  if (msg.type === "ocrPing") { sendResponse({ ready: true }); return false; }
  if (msg.type !== "doOCR") return false;

  (async () => {
    let text = "";
    let error = "";
    // 整体超时保护：避免 tesseract 初始化/识别卡死导致前台永远“识别中”
    const watchdog = new Promise((_, rej) =>
      setTimeout(() => rej(new Error("OCR 引擎初始化或识别超时（请到 edge://extensions 重载扩展后重试）")), 30000)
    );
    try {
      const worker = await Promise.race([getWorker(), watchdog]);
      const res = await Promise.race([worker.recognize(msg.image), watchdog]);
      text = (res.data.text || "").replace(/\s+/g, " ").trim();
    } catch (e) {
      error = e && e.message ? e.message : String(e);
    }
    // 通过独立的 runtime 消息把结果回传给后台 Service Worker（按 reqId 关联）
    chrome.runtime.sendMessage({ type: "ocrResult", reqId: msg.reqId, text: text, error: error });
  })();

  return false; // 结果通过上面的 sendMessage 异步回传，此处无需 sendResponse
});
