// Browser Bridge - Background Service Worker
// 加载页面提取规则、Native Messaging Bridge 和 Agent Tools
try {
  importScripts(
    '../extractors/xiaohongshu.js',
    '../extractors/twitter.js',
    '../extractors/zhihu.js',
    '../extractors/github.js',
    '../extractors/juejin.js',
    '../extractors/wechat.js',
    '../extractors/generic.js'
  );
} catch(e) { console.warn('[BrowserBridge] extractors load failed:', e); }
importScripts('./native-bridge.js');
importScripts('./agent-tools.js');

// 响应 popup 的状态查询
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'ping') {
    sendResponse({ connected: typeof globalBridge !== 'undefined' && globalBridge.connected });
    return false;
  }
});
