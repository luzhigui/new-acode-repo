const pendingCalls = new Map();

window.addEventListener('message', (event) => {
  const msg = event.data;

  if (msg.type === 'browser_call_result') {
    const resolver = pendingCalls.get(msg.callId);
    if (resolver) {
      pendingCalls.delete(msg.callId);
      if (msg.error) {
        resolver.reject(new Error(msg.error));
      } else {
        resolver.resolve(msg.result);
      }
    }
    return;
  }

  if (msg.type === 'execute') {
    executeScript(msg.id, msg.code, msg.timeout || 30000);
  }
});

let callIdCounter = 0;

function createBrowserProxy() {
  const methods = [
    'listPages', 'selectPage', 'navigatePage', 'newPage', 'closePage', 'resizePage',
    'click', 'hover', 'fill', 'fillForm', 'typeText', 'pressKey', 'drag', 'uploadFile',
    'takeSnapshot', 'waitFor',
    'evaluateScript', 'handleDialog',
    'listConsoleMessages', 'getConsoleMessage', 'listNetworkRequests', 'getNetworkRequest',
    'emulate',
    'performanceStartTrace', 'performanceStopTrace', 'takeMemorySnapshot',
    'groupTabs', 'ungroupTabs', 'listTabGroups',
  ];

  const browser = {};
  for (const method of methods) {
    browser[method] = (args) => {
      const callId = ++callIdCounter;
      return new Promise((resolve, reject) => {
        pendingCalls.set(callId, { resolve, reject });
        window.parent.postMessage({ type: 'browser_call', callId, method, args: args || {} }, '*');
      });
    };
  }
  browser.sleep = (ms) => new Promise(r => setTimeout(r, ms));
  return browser;
}

async function executeScript(id, code, timeout) {
  const browser = createBrowserProxy();
  try {
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const fn = new AsyncFunction('browser', code);
    const result = await Promise.race([
      fn(browser),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Script timeout after ${timeout}ms`)), timeout)),
    ]);
    window.parent.postMessage({ type: 'result', id, success: true, result: result ?? null }, '*');
  } catch (e) {
    window.parent.postMessage({ type: 'result', id, success: false, error: e.message, stack: e.stack?.split('\n').slice(0, 5).join('\n') }, '*');
  }
}
