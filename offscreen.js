"use strict";

// 在 Offscreen Document 中运行本地 OCR（tesseract.js v5），完全离线、图片不上传。
// 仅使用 chrome.runtime 进行消息收发（offscreen 文档只暴露 runtime API）。

let workerPromise = null;

function getWorker() {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    if (typeof Tesseract === "undefined" || typeof Tesseract.createWorker !== "function") {
      throw new Error("Tesseract 引擎未加载（tesseract.min.js 未成功执行）");
    }
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
    // 整体超时保护：避免 tesseract 初始化/识别卡死导致前台永远“识别中”
    const watchdog = new Promise((_, rej) =>
      setTimeout(() => rej(new Error("OCR 引擎初始化或识别超时（30s）。可点“重新加载”重试；若反复失败请到 edge://extensions 重新加载扩展")), 30000)
    );
    try {
      const worker = await Promise.race([getWorker(), watchdog]);
      const res = await Promise.race([worker.recognize(msg.image), watchdog]);
      text = (res.data.text || "").replace(/\s+/g, " ").trim();
    } catch (e) {
      // 保留堆栈前几行，便于在“复制错误”里定位根因
      error = (e && e.message ? e.message : String(e));
      if (e && e.stack) error += " :: " + e.stack.split("\n").slice(0, 3).join(" ").slice(0, 300);
    }
    // 通过独立的 runtime 消息把结果回传给后台 Service Worker（按 reqId 关联）
    chrome.runtime.sendMessage({ type: "ocrResult", reqId: msg.reqId, text: text, error: error });
  })();

  return false; // 结果通过上面的 sendMessage 异步回传，此处无需 sendResponse
});
