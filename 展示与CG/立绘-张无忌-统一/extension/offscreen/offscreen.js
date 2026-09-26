const sandbox = document.getElementById('sandbox');

// 从 background 接收执行请求
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'execute_browser_script') {
    const { id, code, timeout } = message;
    sandbox.contentWindow.postMessage({ type: 'execute', id, code, timeout }, '*');
  }
  return false;
});

// 从 sandbox iframe 接收消息
window.addEventListener('message', (event) => {
  const msg = event.data;

  if (msg.type === 'result') {
    chrome.runtime.sendMessage({
      type: 'script_result',
      id: msg.id,
      success: msg.success,
      result: msg.result,
      error: msg.error,
      stack: msg.stack,
    });
    return;
  }

  if (msg.type === 'browser_call') {
    chrome.runtime.sendMessage(
      { type: 'browser_call', callId: msg.callId, method: msg.method, args: msg.args },
      (response) => {
        sandbox.contentWindow.postMessage(
          { type: 'browser_call_result', callId: msg.callId, result: response?.result, error: response?.error },
          '*'
        );
      }
    );
  }
});
