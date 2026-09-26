// i18n
document.getElementById('titleText').textContent = chrome.i18n.getMessage('extName');
const descEl = document.getElementById('descriptionText');
descEl.innerHTML = `${chrome.i18n.getMessage('popupDescription')} <a href="https://www.trae.cn/" id="learnMore" target="_blank">${chrome.i18n.getMessage('popupLearnMore')}</a>`;

const manifest = chrome.runtime.getManifest();
document.getElementById('versionText').textContent = `Version v${manifest.version}`;

// 检查 Native Host 连接状态
async function checkConnection() {
  const badge = document.getElementById('statusBadge');
  const text = document.getElementById('statusText');

  badge.className = 'status-badge checking';
  text.textContent = chrome.i18n.getMessage('statusChecking');

  try {
    const response = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timeout')), 3000);
      chrome.runtime.sendMessage({ type: 'ping' }, (res) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(res);
        }
      });
    });

    if (response && response.connected) {
      badge.className = 'status-badge connected';
      text.textContent = chrome.i18n.getMessage('statusConnected');
    } else {
      badge.className = 'status-badge disconnected';
      text.textContent = chrome.i18n.getMessage('statusDisconnected');
    }
  } catch (e) {
    badge.className = 'status-badge disconnected';
    text.textContent = chrome.i18n.getMessage('statusDisconnected');
  }
}

// 设置按钮 — 打开扩展管理页
document.getElementById('settingsBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
});

// 初始化检查
checkConnection();
