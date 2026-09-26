/**
 * Agent Tools - Chrome DevTools MCP 工具集
 * 
 * 通过 externally_connectable 接收 SOLO Web 的工具调用，
 * 所有 CDP 命令通过 self.nativeBridge.cdpSend() 执行（复用串行队列）。
 */

// ========================= 子模块：SnapshotEngine =========================

const SnapshotEngine = {
  uidCounter: 0,
  uidMap: new Map(), // uid -> { tabId, backendNodeId }

  async takeSnapshot(verbose) {
    const tabId = await AgentTabManager.getActiveTabId();
    const bridge = self.nativeBridge;
    await bridge.ensureAttached(tabId);

    await bridge.cdpSend(tabId, 'Accessibility.enable');
    const { nodes } = await bridge.cdpSend(tabId, 'Accessibility.getFullAXTree');

    this.uidCounter = 0;
    this.uidMap.clear();

    return this.formatTree(tabId, nodes || [], verbose);
  },

  formatTree(tabId, nodes, verbose) {
    const lines = [];
    const nodeMap = new Map();
    for (const node of nodes) {
      nodeMap.set(node.nodeId, node);
    }
    const rootNode = nodes[0];
    if (!rootNode) return '(empty page)';
    this.walkNode(tabId, rootNode, nodeMap, lines, 0, verbose);
    return lines.join('\n');
  },

  walkNode(tabId, node, nodeMap, lines, depth, verbose) {
    if (node.ignored) {
      for (const childId of node.childIds || []) {
        const child = nodeMap.get(childId);
        if (child) this.walkNode(tabId, child, nodeMap, lines, depth, verbose);
      }
      return;
    }

    const role = node.role?.value || 'none';
    const name = node.name?.value || '';

    if ((role === 'none' || role === 'generic') && !name && !verbose) {
      for (const childId of node.childIds || []) {
        const child = nodeMap.get(childId);
        if (child) this.walkNode(tabId, child, nodeMap, lines, depth, verbose);
      }
      return;
    }

    const uid = `e${++this.uidCounter}`;
    if (node.backendDOMNodeId) {
      this.uidMap.set(uid, { tabId, backendNodeId: node.backendDOMNodeId });
    }

    const indent = '  '.repeat(depth);
    let line = `${indent}[${uid}] ${role}`;
    if (name) line += ` "${name}"`;
    if (node.value?.value) line += ` value="${node.value.value}"`;
    if (verbose && node.description?.value) line += ` desc="${node.description.value}"`;
    if (verbose && node.properties) {
      for (const prop of node.properties) {
        if (prop.name === 'focused' && prop.value.value) line += ' [focused]';
        if (prop.name === 'disabled' && prop.value.value) line += ' [disabled]';
        if (prop.name === 'required' && prop.value.value) line += ' [required]';
        if (prop.name === 'checked') line += ` [checked=${prop.value.value}]`;
      }
    }
    lines.push(line);

    for (const childId of node.childIds || []) {
      const child = nodeMap.get(childId);
      if (child) this.walkNode(tabId, child, nodeMap, lines, depth + 1, verbose);
    }
  },

  resolveUid(uid) {
    return this.uidMap.get(uid) || null;
  },

  clearForTab(tabId) {
    for (const [uid, mapping] of this.uidMap) {
      if (mapping.tabId === tabId) {
        this.uidMap.delete(uid);
      }
    }
  },
};

// ========================= 子模块：AgentConsoleCollector =========================

const AgentConsoleCollector = {
  messages: new Map(), // tabId -> [{ msgid, type, text, timestamp, url, lineNumber }]
  msgIdCounter: 0,
  listening: new Set(),

  async startCollecting(tabId) {
    if (this.listening.has(tabId)) return;
    this.listening.add(tabId);
    this.messages.set(tabId, []);
    await self.nativeBridge.cdpSend(tabId, 'Runtime.enable');
  },

  handleEvent(tabId, method, params) {
    if (method !== 'Runtime.consoleAPICalled') return;
    if (!this.listening.has(tabId)) return;
    const messages = this.messages.get(tabId);
    if (!messages) return;

    messages.push({
      msgid: ++this.msgIdCounter,
      type: params.type || 'log',
      text: (params.args || []).map(a => a.value ?? a.description ?? '').join(' '),
      timestamp: params.timestamp || Date.now(),
      url: params.stackTrace?.callFrames?.[0]?.url,
      lineNumber: params.stackTrace?.callFrames?.[0]?.lineNumber,
    });
  },

  listMessages(tabId, options) {
    let msgs = this.messages.get(tabId) || [];
    if (options?.types?.length) {
      msgs = msgs.filter(m => options.types.includes(m.type));
    }
    const pageSize = options?.pageSize || msgs.length;
    const pageIdx = options?.pageIdx || 0;
    return msgs.slice(pageIdx * pageSize, (pageIdx + 1) * pageSize);
  },

  getMessage(msgid) {
    for (const msgs of this.messages.values()) {
      const found = msgs.find(m => m.msgid === msgid);
      if (found) return found;
    }
    return null;
  },

  clear(tabId) {
    this.messages.set(tabId, []);
  },
};

// ========================= 子模块：AgentNetworkCollector =========================

const AgentNetworkCollector = {
  requests: new Map(), // tabId -> [{ reqid, url, method, resourceType, ... }]
  reqIdCounter: 0,
  listening: new Set(),
  cdpIdMap: new Map(), // cdpRequestId -> request

  async startCollecting(tabId) {
    if (this.listening.has(tabId)) return;
    this.listening.add(tabId);
    this.requests.set(tabId, []);
    await self.nativeBridge.cdpSend(tabId, 'Network.enable');
  },

  handleEvent(tabId, method, params) {
    if (!this.listening.has(tabId)) return;
    const requests = this.requests.get(tabId);
    if (!requests) return;

    if (method === 'Network.requestWillBeSent') {
      const req = {
        reqid: ++this.reqIdCounter,
        url: params.request?.url || '',
        method: params.request?.method || 'GET',
        resourceType: (params.type || 'other').toLowerCase(),
        requestHeaders: params.request?.headers,
        cdpRequestId: params.requestId,
      };
      requests.push(req);
      this.cdpIdMap.set(params.requestId, req);
    }

    if (method === 'Network.responseReceived') {
      const req = this.cdpIdMap.get(params.requestId);
      if (req) {
        req.status = params.response?.status;
        req.statusText = params.response?.statusText;
        req.responseHeaders = params.response?.headers;
        req.timing = params.response?.timing;
      }
    }
  },

  listRequests(tabId, options) {
    let reqs = this.requests.get(tabId) || [];
    if (options?.resourceTypes?.length) {
      reqs = reqs.filter(r => options.resourceTypes.includes(r.resourceType));
    }
    const pageSize = options?.pageSize || reqs.length;
    const pageIdx = options?.pageIdx || 0;
    return reqs.slice(pageIdx * pageSize, (pageIdx + 1) * pageSize);
  },

  getRequest(reqid) {
    for (const reqs of this.requests.values()) {
      const found = reqs.find(r => r.reqid === reqid);
      if (found) return found;
    }
    return null;
  },

  async getRequestBody(tabId, cdpRequestId) {
    try {
      const { body, base64Encoded } = await self.nativeBridge.cdpSend(tabId, 'Network.getResponseBody', { requestId: cdpRequestId });
      return base64Encoded ? `[base64] ${body.substring(0, 200)}...` : body;
    } catch {
      return '[body not available]';
    }
  },

  clear(tabId) {
    const reqs = this.requests.get(tabId) || [];
    for (const req of reqs) {
      if (req.cdpRequestId) this.cdpIdMap.delete(req.cdpRequestId);
    }
    this.requests.set(tabId, []);
  },
};

// ========================= 子模块：AgentTabManager =========================

const AgentTabManager = {
  selectedPageId: null,
  groupId: null,
  managedTabIds: new Set(),
  soloWindowId: null,

  setSoloWindowId(windowId) {
    this.soloWindowId = windowId;
  },

  async listPages() {
    const tabs = await chrome.tabs.query({});
    const groups = await chrome.tabGroups.query({});
    const groupMap = new Map(groups.map(g => [g.id, g.title]));
    return tabs
      .filter(tab => tab.id !== undefined)
      .map(tab => ({
        pageId: tab.id,
        url: tab.url || '',
        title: tab.title || '',
        selected: tab.id === this.selectedPageId,
        groupId: tab.groupId !== -1 ? tab.groupId : undefined,
        groupTitle: tab.groupId !== -1 ? groupMap.get(tab.groupId) : undefined,
      }));
  },

  selectPage(pageId) {
    this.selectedPageId = pageId;
  },

  hasSelectedPage() {
    return this.selectedPageId !== null;
  },

  async getActiveTabId() {
    if (this.selectedPageId !== null) return this.selectedPageId;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found');
    return tab.id;
  },

  async createPage(url) {
    const bridge = self.nativeBridge;
    const tab = await bridge.createTabInWindow(url, {
      active: false,
      windowId: this.soloWindowId,
      group: true,
    });
    if (!tab.id) throw new Error('Failed to create tab');
    this.selectedPageId = tab.id;
    this.managedTabIds.add(tab.id);
    return tab.id;
  },

  async closePage(pageId) {
    await chrome.tabs.remove(pageId);
    this.managedTabIds.delete(pageId);
    if (this.selectedPageId === pageId) {
      this.selectedPageId = null;
    }
  },

  async bringToFront(pageId) {
    await chrome.tabs.update(pageId, { active: true });
    const tab = await chrome.tabs.get(pageId);
    if (tab.windowId) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
  },

  async resizePage(pageId, width, height) {
    const tab = await chrome.tabs.get(pageId);
    if (tab.windowId) {
      await chrome.windows.update(tab.windowId, { width, height });
    }
  },
};

// ========================= 辅助函数 =========================

function getCenterPoint(quad) {
  const x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;
  const y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;
  return [x, y];
}

async function getElementCenter(tabId, backendNodeId) {
  const bridge = self.nativeBridge;
  await bridge.cdpSend(tabId, 'DOM.getDocument', { depth: 0 });
  const { nodeIds } = await bridge.cdpSend(tabId, 'DOM.pushNodesByBackendIdsToFrontend', {
    backendNodeIds: [backendNodeId],
  });
  const nodeId = nodeIds[0];
  await bridge.cdpSend(tabId, 'DOM.scrollIntoViewIfNeeded', { nodeId });
  const { model } = await bridge.cdpSend(tabId, 'DOM.getBoxModel', { nodeId });
  return getCenterPoint(model.content);
}

function waitForNavigation(tabId, timeout) {
  timeout = timeout || 30000;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Navigation timeout'));
    }, timeout);
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// ========================= 工具实现 =========================

// --- Navigation ---

async function handleNavigatePage(args) {
  const timeout = args.timeout || 30000;

  if ((args.type === 'url' || (!args.type && args.url)) && !AgentTabManager.hasSelectedPage()) {
    const tabId = await AgentTabManager.createPage(args.url);
    await waitForNavigation(tabId, timeout).catch(() => {});
    const tab = await chrome.tabs.get(tabId);
    return JSON.stringify({ url: tab.url, title: tab.title, pageId: tabId, created: true });
  }

  const tabId = await AgentTabManager.getActiveTabId();
  const bridge = self.nativeBridge;

  switch (args.type) {
    case 'url':
      if (!args.url) return JSON.stringify({ error: 'url is required for type=url' });
      await chrome.tabs.update(tabId, { url: args.url });
      await waitForNavigation(tabId, timeout);
      break;
    case 'back':
      try {
        const history = await bridge.cdpSend(tabId, 'Page.getNavigationHistory');
        if (history.currentIndex > 0) {
          await bridge.cdpSend(tabId, 'Page.navigateToHistoryEntry', { entryId: history.entries[history.currentIndex - 1].id });
        }
      } catch { await chrome.tabs.goBack(tabId); }
      await waitForNavigation(tabId, timeout);
      break;
    case 'forward':
      try {
        const history = await bridge.cdpSend(tabId, 'Page.getNavigationHistory');
        if (history.currentIndex < history.entries.length - 1) {
          await bridge.cdpSend(tabId, 'Page.navigateToHistoryEntry', { entryId: history.entries[history.currentIndex + 1].id });
        }
      } catch { await chrome.tabs.goForward(tabId); }
      await waitForNavigation(tabId, timeout);
      break;
    case 'reload':
      if (args.ignoreCache) {
        await bridge.cdpSend(tabId, 'Page.reload', { ignoreCache: true });
      } else {
        await chrome.tabs.reload(tabId);
      }
      await waitForNavigation(tabId, timeout);
      break;
    default:
      if (args.url) {
        await chrome.tabs.update(tabId, { url: args.url });
        await waitForNavigation(tabId, timeout);
      } else {
        return JSON.stringify({ error: 'type or url is required' });
      }
  }

  AgentConsoleCollector.clear(tabId);
  AgentNetworkCollector.clear(tabId);
  SnapshotEngine.clearForTab(tabId);

  const tab = await chrome.tabs.get(tabId);
  return JSON.stringify({ url: tab.url, title: tab.title });
}

async function handleNewPage(args) {
  const tabId = await AgentTabManager.createPage(args.url);
  await waitForNavigation(tabId, 30000).catch(() => {});
  await self.nativeBridge.ensureAttached(tabId);
  await AgentConsoleCollector.startCollecting(tabId);
  await AgentNetworkCollector.startCollecting(tabId);
  const tab = await chrome.tabs.get(tabId);
  return JSON.stringify({ pageId: tabId, url: tab.url, title: tab.title });
}

async function handleClosePage(args) {
  await AgentTabManager.closePage(args.pageId);
  return JSON.stringify({ success: true });
}

async function handleSelectPage(args) {
  AgentTabManager.selectPage(args.pageId);
  if (args.bringToFront) {
    await AgentTabManager.bringToFront(args.pageId);
  }
  await self.nativeBridge.ensureAttached(args.pageId);
  await AgentConsoleCollector.startCollecting(args.pageId);
  await AgentNetworkCollector.startCollecting(args.pageId);
  return JSON.stringify({ success: true, pageId: args.pageId });
}

async function handleListPages() {
  const pages = await AgentTabManager.listPages();
  return JSON.stringify(pages);
}

async function handleResizePage(args) {
  const tabId = await AgentTabManager.getActiveTabId();
  await AgentTabManager.resizePage(tabId, args.width, args.height);
  return JSON.stringify({ success: true });
}

// --- Interaction ---

async function handleClick(args) {
  const mapping = SnapshotEngine.resolveUid(args.uid);
  if (!mapping) return JSON.stringify({ error: `uid "${args.uid}" not found. Please take_snapshot first.` });

  const { tabId, backendNodeId } = mapping;
  const [x, y] = await getElementCenter(tabId, backendNodeId);
  const clickCount = args.dblClick ? 2 : 1;
  const bridge = self.nativeBridge;

  await bridge.cdpSend(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount });
  await bridge.cdpSend(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount });

  let snapshot;
  if (args.includeSnapshot) snapshot = await SnapshotEngine.takeSnapshot(false);
  return JSON.stringify({ success: true, ...(snapshot ? { snapshot } : {}) });
}

async function handleHover(args) {
  const mapping = SnapshotEngine.resolveUid(args.uid);
  if (!mapping) return JSON.stringify({ error: `uid "${args.uid}" not found. Please take_snapshot first.` });

  const { tabId, backendNodeId } = mapping;
  const [x, y] = await getElementCenter(tabId, backendNodeId);
  await self.nativeBridge.cdpSend(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });

  let snapshot;
  if (args.includeSnapshot) snapshot = await SnapshotEngine.takeSnapshot(false);
  return JSON.stringify({ success: true, ...(snapshot ? { snapshot } : {}) });
}

async function handleFill(args) {
  const mapping = SnapshotEngine.resolveUid(args.uid);
  if (!mapping) return JSON.stringify({ error: `uid "${args.uid}" not found. Please take_snapshot first.` });

  const { tabId, backendNodeId } = mapping;
  const bridge = self.nativeBridge;

  await bridge.cdpSend(tabId, 'DOM.focus', { backendNodeId });
  await bridge.cdpSend(tabId, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
  await bridge.cdpSend(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
  await bridge.cdpSend(tabId, 'Input.insertText', { text: args.value });

  let snapshot;
  if (args.includeSnapshot) snapshot = await SnapshotEngine.takeSnapshot(false);
  return JSON.stringify({ success: true, ...(snapshot ? { snapshot } : {}) });
}

async function handleFillForm(args) {
  const results = [];
  const bridge = self.nativeBridge;

  for (const el of args.elements) {
    const mapping = SnapshotEngine.resolveUid(el.uid);
    if (!mapping) {
      results.push({ uid: el.uid, success: false, error: 'uid not found' });
      continue;
    }
    const { tabId, backendNodeId } = mapping;
    try {
      await bridge.cdpSend(tabId, 'DOM.focus', { backendNodeId });
      await bridge.cdpSend(tabId, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
      await bridge.cdpSend(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
      await bridge.cdpSend(tabId, 'Input.insertText', { text: el.value });
      results.push({ uid: el.uid, success: true });
    } catch (e) {
      results.push({ uid: el.uid, success: false, error: e.message });
    }
  }

  let snapshot;
  if (args.includeSnapshot) snapshot = await SnapshotEngine.takeSnapshot(false);
  return JSON.stringify({ results, ...(snapshot ? { snapshot } : {}) });
}

async function handleTypeText(args) {
  const tabId = await AgentTabManager.getActiveTabId();
  const bridge = self.nativeBridge;
  await bridge.cdpSend(tabId, 'Input.insertText', { text: args.text });

  if (args.submitKey) {
    await bridge.cdpSend(tabId, 'Input.dispatchKeyEvent', { type: 'keyDown', key: args.submitKey, code: args.submitKey });
    await bridge.cdpSend(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', key: args.submitKey, code: args.submitKey });
  }
  return JSON.stringify({ success: true });
}

async function handlePressKey(args) {
  const tabId = await AgentTabManager.getActiveTabId();
  const parts = args.key.split('+');
  const mainKey = parts.pop();
  let modifiers = 0;
  for (const mod of parts) {
    switch (mod.toLowerCase()) {
      case 'control': case 'ctrl': modifiers |= 2; break;
      case 'shift': modifiers |= 8; break;
      case 'alt': modifiers |= 1; break;
      case 'meta': case 'command': modifiers |= 4; break;
    }
  }

  const bridge = self.nativeBridge;
  await bridge.cdpSend(tabId, 'Input.dispatchKeyEvent', { type: 'keyDown', key: mainKey, code: mainKey, modifiers });
  await bridge.cdpSend(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', key: mainKey, code: mainKey, modifiers });

  let snapshot;
  if (args.includeSnapshot) snapshot = await SnapshotEngine.takeSnapshot(false);
  return JSON.stringify({ success: true, ...(snapshot ? { snapshot } : {}) });
}

async function handleDrag(args) {
  const fromMapping = SnapshotEngine.resolveUid(args.from_uid);
  const toMapping = SnapshotEngine.resolveUid(args.to_uid);
  if (!fromMapping) return JSON.stringify({ error: `from_uid "${args.from_uid}" not found` });
  if (!toMapping) return JSON.stringify({ error: `to_uid "${args.to_uid}" not found` });

  const tabId = fromMapping.tabId;
  const bridge = self.nativeBridge;
  const [fromX, fromY] = await getElementCenter(tabId, fromMapping.backendNodeId);
  const [toX, toY] = await getElementCenter(tabId, toMapping.backendNodeId);

  await bridge.cdpSend(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: fromX, y: fromY, button: 'left' });
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const x = fromX + (toX - fromX) * (i / steps);
    const y = fromY + (toY - fromY) * (i / steps);
    await bridge.cdpSend(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left' });
  }
  await bridge.cdpSend(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: toX, y: toY, button: 'left' });

  let snapshot;
  if (args.includeSnapshot) snapshot = await SnapshotEngine.takeSnapshot(false);
  return JSON.stringify({ success: true, ...(snapshot ? { snapshot } : {}) });
}

async function handleUploadFile(args) {
  const mapping = SnapshotEngine.resolveUid(args.uid);
  if (!mapping) return JSON.stringify({ error: `uid "${args.uid}" not found` });

  const { tabId, backendNodeId } = mapping;
  const bridge = self.nativeBridge;
  await bridge.cdpSend(tabId, 'DOM.getDocument', { depth: 0 });
  const { nodeIds } = await bridge.cdpSend(tabId, 'DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: [backendNodeId] });
  await bridge.cdpSend(tabId, 'DOM.setFileInputFiles', { nodeId: nodeIds[0], files: [args.filePath] });

  let snapshot;
  if (args.includeSnapshot) snapshot = await SnapshotEngine.takeSnapshot(false);
  return JSON.stringify({ success: true, ...(snapshot ? { snapshot } : {}) });
}

// --- Snapshot / Screenshot ---

async function handleTakeSnapshot(args) {
  return SnapshotEngine.takeSnapshot(args.verbose || false);
}

async function handleTakeScreenshot(args) {
  const tabId = await AgentTabManager.getActiveTabId();
  const bridge = self.nativeBridge;
  await bridge.ensureAttached(tabId);

  let clip;
  if (args.uid) {
    const mapping = SnapshotEngine.resolveUid(args.uid);
    if (!mapping) return JSON.stringify({ error: `uid "${args.uid}" not found` });
    await bridge.cdpSend(tabId, 'DOM.getDocument', { depth: 0 });
    const { nodeIds } = await bridge.cdpSend(tabId, 'DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: [mapping.backendNodeId] });
    const { model } = await bridge.cdpSend(tabId, 'DOM.getBoxModel', { nodeId: nodeIds[0] });
    const quad = model.border;
    const x = Math.min(quad[0], quad[2], quad[4], quad[6]);
    const y = Math.min(quad[1], quad[3], quad[5], quad[7]);
    const w = Math.max(quad[0], quad[2], quad[4], quad[6]) - x;
    const h = Math.max(quad[1], quad[3], quad[5], quad[7]) - y;
    clip = { x, y, width: w, height: h, scale: 1 };
  }

  if (args.fullPage && !clip) {
    const metrics = await bridge.cdpSend(tabId, 'Page.getLayoutMetrics');
    const { width, height } = metrics.contentSize || metrics.cssContentSize;
    await bridge.cdpSend(tabId, 'Emulation.setDeviceMetricsOverride', {
      width: Math.ceil(width), height: Math.ceil(height), deviceScaleFactor: 1, mobile: false,
    });
    clip = { x: 0, y: 0, width, height, scale: 1 };
  }

  const format = args.format || 'png';
  const { data } = await bridge.cdpSend(tabId, 'Page.captureScreenshot', { format, quality: args.quality, clip });

  if (args.fullPage && !args.uid) {
    await bridge.cdpSend(tabId, 'Emulation.clearDeviceMetricsOverride');
  }

  const imageSizeKB = Math.round(data.length * 3 / 4 / 1024);
  return `Screenshot captured successfully (format: ${format}, size: ${imageSizeKB}KB${clip ? `, region: ${Math.round(clip.width)}x${Math.round(clip.height)}` : ''}, fullPage: ${!!args.fullPage}). The image data is too large to include inline. Use take_snapshot to get the page structure as text for analysis.`;
}

async function handleWaitFor(args) {
  const tabId = await AgentTabManager.getActiveTabId();
  const timeout = args.timeout || 30000;
  const startTime = Date.now();
  const bridge = self.nativeBridge;

  while (Date.now() - startTime < timeout) {
    const { result } = await bridge.cdpSend(tabId, 'Runtime.evaluate', {
      expression: 'document.body.innerText',
      returnByValue: true,
    });
    const pageText = result?.value || '';
    for (const text of args.text) {
      if (pageText.includes(text)) {
        return JSON.stringify({ success: true, matchedText: text });
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return JSON.stringify({ error: `Timeout: none of the texts appeared within ${timeout}ms`, texts: args.text });
}

// --- Script ---

async function handleEvaluateScript(args) {
  const tabId = await AgentTabManager.getActiveTabId();
  const bridge = self.nativeBridge;

  if (args.dialogAction) {
    const dialogListener = (source, method, params) => {
      if (source.tabId === tabId && method === 'Page.javascriptDialogOpening') {
        const accept = args.dialogAction !== 'dismiss';
        bridge.cdpSend(tabId, 'Page.handleJavaScriptDialog', {
          accept,
          promptText: (typeof args.dialogAction === 'string' && args.dialogAction !== 'accept' && args.dialogAction !== 'dismiss') ? args.dialogAction : undefined,
        });
      }
    };
    chrome.debugger.onEvent.addListener(dialogListener);
    await bridge.cdpSend(tabId, 'Page.enable');
    const result = await executeFunction(tabId, args.function, args.args);
    chrome.debugger.onEvent.removeListener(dialogListener);
    return result;
  }

  return executeFunction(tabId, args.function, args.args);
}

async function executeFunction(tabId, fn, fnArgs) {
  const bridge = self.nativeBridge;
  let expression;

  if (fnArgs?.length) {
    const resolvedArgs = [];
    for (const arg of fnArgs) {
      const mapping = SnapshotEngine.resolveUid(arg);
      if (mapping) {
        await bridge.cdpSend(tabId, 'DOM.getDocument', { depth: 0 });
        const { nodeIds } = await bridge.cdpSend(tabId, 'DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: [mapping.backendNodeId] });
        const { object } = await bridge.cdpSend(tabId, 'DOM.resolveNode', { nodeId: nodeIds[0] });
        resolvedArgs.push(object.objectId);
      }
    }
    if (resolvedArgs.length > 0) {
      const { result } = await bridge.cdpSend(tabId, 'Runtime.callFunctionOn', {
        functionDeclaration: fn,
        arguments: resolvedArgs.map(id => ({ objectId: id })),
        returnByValue: true,
        awaitPromise: true,
      });
      return JSON.stringify(result?.value ?? result?.description ?? null);
    }
    expression = `(${fn})()`;
  } else {
    expression = `(${fn})()`;
  }

  const { result, exceptionDetails } = await bridge.cdpSend(tabId, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });

  if (exceptionDetails) {
    return JSON.stringify({ error: exceptionDetails.text || exceptionDetails.exception?.description });
  }
  return JSON.stringify(result?.value ?? result?.description ?? null);
}

async function handleDialog(args) {
  const tabId = await AgentTabManager.getActiveTabId();
  const accept = args.action !== 'dismiss';
  await self.nativeBridge.cdpSend(tabId, 'Page.handleJavaScriptDialog', { accept, promptText: args.promptText });
  return JSON.stringify({ success: true });
}

// --- DevTools ---

async function handleListConsoleMessages(args) {
  const tabId = await AgentTabManager.getActiveTabId();
  const messages = AgentConsoleCollector.listMessages(tabId, {
    types: args.types,
    pageSize: args.pageSize,
    pageIdx: args.pageIdx,
  });
  return JSON.stringify({ messages, total: messages.length });
}

async function handleGetConsoleMessage(args) {
  const msg = AgentConsoleCollector.getMessage(args.msgid);
  if (!msg) return JSON.stringify({ error: `Message ${args.msgid} not found` });
  return JSON.stringify(msg);
}

async function handleListNetworkRequests(args) {
  const tabId = await AgentTabManager.getActiveTabId();
  const requests = AgentNetworkCollector.listRequests(tabId, {
    resourceTypes: args.resourceTypes,
    pageSize: args.pageSize,
    pageIdx: args.pageIdx,
  });
  return JSON.stringify({ requests, total: requests.length });
}

async function handleGetNetworkRequest(args) {
  if (!args.reqid) return JSON.stringify({ error: 'reqid is required' });
  const req = AgentNetworkCollector.getRequest(args.reqid);
  if (!req) return JSON.stringify({ error: `Request ${args.reqid} not found` });

  if (req.cdpRequestId) {
    const tabId = await AgentTabManager.getActiveTabId();
    const body = await AgentNetworkCollector.getRequestBody(tabId, req.cdpRequestId);
    return JSON.stringify({ ...req, responseBody: body });
  }
  return JSON.stringify(req);
}

// --- Emulation ---

async function handleEmulate(args) {
  const tabId = await AgentTabManager.getActiveTabId();
  const bridge = self.nativeBridge;
  await bridge.ensureAttached(tabId);
  const results = [];

  if (args.viewport) {
    const parts = args.viewport.split(',');
    const dims = parts[0].split('x');
    const width = parseInt(dims[0]);
    const height = parseInt(dims[1]);
    const deviceScaleFactor = dims[2] ? parseFloat(dims[2]) : 1;
    const mobile = parts.includes('mobile');
    const screenOrientation = parts.includes('landscape')
      ? { angle: 90, type: 'landscapePrimary' }
      : { angle: 0, type: 'portraitPrimary' };
    await bridge.cdpSend(tabId, 'Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile, screenOrientation });
    results.push(`viewport: ${width}x${height}`);
  }

  if (args.userAgent !== undefined) {
    await bridge.cdpSend(tabId, 'Emulation.setUserAgentOverride', { userAgent: args.userAgent || '' });
    results.push(args.userAgent ? `userAgent: ${args.userAgent.substring(0, 50)}...` : 'userAgent: cleared');
  }

  if (args.colorScheme) {
    if (args.colorScheme === 'auto') {
      await bridge.cdpSend(tabId, 'Emulation.setEmulatedMedia', { features: [] });
    } else {
      await bridge.cdpSend(tabId, 'Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: args.colorScheme }] });
    }
    results.push(`colorScheme: ${args.colorScheme}`);
  }

  if (args.geolocation !== undefined) {
    if (args.geolocation) {
      const [lat, lng] = args.geolocation.split('x').map(Number);
      await bridge.cdpSend(tabId, 'Emulation.setGeolocationOverride', { latitude: lat, longitude: lng, accuracy: 1 });
      results.push(`geolocation: ${lat},${lng}`);
    } else {
      await bridge.cdpSend(tabId, 'Emulation.clearGeolocationOverride');
      results.push('geolocation: cleared');
    }
  }

  if (args.networkConditions) {
    const presets = {
      'Offline': { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 },
      'Slow 3G': { offline: false, latency: 2000, downloadThroughput: 50000, uploadThroughput: 50000 },
      'Fast 3G': { offline: false, latency: 562, downloadThroughput: 180000, uploadThroughput: 84375 },
      'Slow 4G': { offline: false, latency: 170, downloadThroughput: 400000, uploadThroughput: 400000 },
      'Fast 4G': { offline: false, latency: 28, downloadThroughput: 1500000, uploadThroughput: 750000 },
    };
    const preset = presets[args.networkConditions];
    if (preset) {
      await bridge.cdpSend(tabId, 'Network.emulateNetworkConditions', preset);
      results.push(`network: ${args.networkConditions}`);
    }
  }

  if (args.cpuThrottlingRate !== undefined) {
    await bridge.cdpSend(tabId, 'Emulation.setCPUThrottlingRate', { rate: args.cpuThrottlingRate });
    results.push(`cpu throttling: ${args.cpuThrottlingRate}x`);
  }

  return JSON.stringify({ success: true, applied: results });
}

// --- Performance ---

let activeTraceTabId = null;

async function handleLighthouseAudit(args) {
  return JSON.stringify({
    error: 'Lighthouse audit is not directly available in Chrome Extension context. Use the Chrome DevTools Lighthouse panel or the lighthouse CLI tool instead.',
    suggestion: 'You can use evaluate_script to check basic performance metrics via the Performance API.',
  });
}

async function handlePerformanceStartTrace(args) {
  const tabId = await AgentTabManager.getActiveTabId();
  const bridge = self.nativeBridge;
  await bridge.ensureAttached(tabId);

  await bridge.cdpSend(tabId, 'Tracing.start', {
    categories: '-*,devtools.timeline,v8.execute,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,toplevel,blink.console,blink.user_timing,latencyInfo,disabled-by-default-v8.cpu_profiler',
    options: 'sampling-frequency=10000',
  });

  activeTraceTabId = tabId;

  if (args.reload) {
    await chrome.tabs.reload(tabId);
  }

  if (args.autoStop) {
    await new Promise(resolve => {
      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(resolve, 2000);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      setTimeout(resolve, 30000);
    });
    return handlePerformanceStopTrace({});
  }

  return JSON.stringify({ success: true, message: 'Trace started. Call performance_stop_trace when ready.' });
}

async function handlePerformanceStopTrace(args) {
  if (!activeTraceTabId) {
    return JSON.stringify({ error: 'No active trace recording. Call performance_start_trace first.' });
  }

  const tabId = activeTraceTabId;
  const traceEvents = [];

  await new Promise(resolve => {
    const listener = (source, method, params) => {
      if (source.tabId !== tabId) return;
      if (method === 'Tracing.dataCollected') {
        traceEvents.push(...(params.value || []));
      }
      if (method === 'Tracing.tracingComplete') {
        chrome.debugger.onEvent.removeListener(listener);
        resolve();
      }
    };
    chrome.debugger.onEvent.addListener(listener);
    self.nativeBridge.cdpSend(tabId, 'Tracing.end');
  });

  activeTraceTabId = null;

  const summary = {
    totalEvents: traceEvents.length,
    categories: [...new Set(traceEvents.map(e => e.cat).filter(Boolean))].slice(0, 20),
    durationMs: traceEvents.length > 0 ? (traceEvents[traceEvents.length - 1]?.ts - traceEvents[0]?.ts) / 1000 : 0,
  };

  return JSON.stringify({ success: true, summary });
}

async function handlePerformanceAnalyzeInsight(args) {
  return JSON.stringify({
    error: 'Performance insight analysis requires the Chrome DevTools Performance panel. Use performance_start_trace and performance_stop_trace for basic tracing.',
  });
}

async function handleTakeMemorySnapshot(args) {
  const tabId = await AgentTabManager.getActiveTabId();
  const bridge = self.nativeBridge;
  await bridge.ensureAttached(tabId);

  const chunks = [];
  await new Promise(resolve => {
    const listener = (source, method, params) => {
      if (source.tabId !== tabId) return;
      if (method === 'HeapProfiler.addHeapSnapshotChunk') {
        chunks.push(params.chunk);
      }
      if (method === 'HeapProfiler.reportHeapSnapshotProgress' && params.finished) {
        chrome.debugger.onEvent.removeListener(listener);
        resolve();
      }
    };
    chrome.debugger.onEvent.addListener(listener);
    bridge.cdpSend(tabId, 'HeapProfiler.takeHeapSnapshot', { reportProgress: true });
  });

  const totalSize = chunks.reduce((sum, c) => sum + c.length, 0);
  return JSON.stringify({
    success: true,
    snapshotSize: totalSize,
    message: `Heap snapshot captured (${(totalSize / 1024 / 1024).toFixed(2)} MB). Note: raw data not returned due to size.`,
  });
}

// --- Tab Groups ---

async function handleGroupTabs(args) {
  const strategy = args.strategy || 'site';
  const collapse = args.collapse || false;

  let tabs;
  if (args.tabs?.length) {
    tabs = await Promise.all(args.tabs.map(id => chrome.tabs.get(id)));
  } else {
    tabs = await chrome.tabs.query({});
  }

  if (strategy === 'site') {
    const siteMap = new Map();
    for (const tab of tabs) {
      try {
        const hostname = new URL(tab.url).hostname;
        const site = hostname.replace(/^www\./, '');
        if (!siteMap.has(site)) siteMap.set(site, []);
        siteMap.get(site).push(tab.id);
      } catch { /* chrome:// 等特殊 URL 跳过 */ }
    }

    const colors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange', 'grey'];
    let colorIdx = 0;
    const results = [];

    for (const [site, tabIds] of siteMap) {
      if (tabIds.length < 2) continue;
      const groupId = await chrome.tabs.group({ tabIds });
      await chrome.tabGroups.update(groupId, {
        title: site,
        color: colors[colorIdx % colors.length],
        collapsed: collapse,
      });
      colorIdx++;
      results.push({ site, groupId, tabCount: tabIds.length });
    }
    return JSON.stringify({ success: true, groups: results });

  } else if (strategy === 'custom') {
    if (!args.tabs?.length) return JSON.stringify({ error: 'tabs[] required for custom strategy' });
    const groupId = await chrome.tabs.group({ tabIds: args.tabs });
    await chrome.tabGroups.update(groupId, {
      title: args.title || 'Group',
      color: args.color || 'blue',
      collapsed: collapse,
    });
    return JSON.stringify({ success: true, groupId, tabCount: args.tabs.length });
  }

  return JSON.stringify({ error: `Unknown strategy: ${strategy}` });
}

async function handleUngroupTabs(args) {
  if (args.groupId) {
    const tabs = await chrome.tabs.query({ groupId: args.groupId });
    await chrome.tabs.ungroup(tabs.map(t => t.id));
    return JSON.stringify({ success: true, ungrouped: tabs.length });
  }
  if (args.tabs?.length) {
    await chrome.tabs.ungroup(args.tabs);
    return JSON.stringify({ success: true, ungrouped: args.tabs.length });
  }
  return JSON.stringify({ error: 'groupId or tabs[] required' });
}

async function handleListTabGroups() {
  const groups = await chrome.tabGroups.query({});
  const result = [];
  for (const group of groups) {
    const tabs = await chrome.tabs.query({ groupId: group.id });
    result.push({
      groupId: group.id,
      title: group.title,
      color: group.color,
      collapsed: group.collapsed,
      tabs: tabs.map(t => ({ pageId: t.id, url: t.url, title: t.title })),
    });
  }
  return JSON.stringify(result);
}

// ========================= CDP 事件转发 =========================

// 注册全局 debugger 事件监听器，转发 console/network 事件到 collector
chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId = source.tabId;
  if (!tabId) return;
  AgentConsoleCollector.handleEvent(tabId, method, params);
  AgentNetworkCollector.handleEvent(tabId, method, params);
});

// ========================= Browser Script 执行器 (Sandbox Architecture) =========================

let offscreenCreated = false;
let scriptIdCounter = 0;
const pendingScripts = new Map();

async function ensureOffscreen() {
  if (offscreenCreated) return;
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['DOM_PARSER'],
      justification: 'Execute browser automation scripts in sandbox',
    });
    offscreenCreated = true;
  } catch (e) {
    if (e.message?.includes('already exists') || e.message?.includes('Only a single offscreen')) {
      offscreenCreated = true;
    } else {
      throw e;
    }
  }
}

async function handleExecuteBrowserScript(args) {
  const { code, timeout = 30000 } = args;
  if (!code) throw new Error('code is required');

  await ensureOffscreen();

  const id = ++scriptIdCounter;

  return new Promise((resolve, reject) => {
    pendingScripts.set(id, { resolve, reject });
    chrome.runtime.sendMessage({ type: 'execute_browser_script', id, code, timeout });
    setTimeout(() => {
      if (pendingScripts.has(id)) {
        pendingScripts.delete(id);
        reject(new Error(`Script timeout after ${timeout}ms`));
      }
    }, timeout + 5000);
  });
}

// 监听来自 offscreen 的消息（脚本结果 & browser API 调用）
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'script_result') {
    const pending = pendingScripts.get(message.id);
    if (pending) {
      pendingScripts.delete(message.id);
      if (message.success) {
        // 直接透传 AI 脚本的 return 值，不做额外序列化
        pending.resolve(message.result);
      } else {
        pending.reject(new Error(message.error || 'Script execution failed'));
      }
    }
    return false;
  }

  if (message.type === 'browser_call') {
    const { callId, method, args: callArgs } = message;
    const methodMap = {
      listPages: handleListPages,
      selectPage: handleSelectPage,
      navigatePage: handleNavigatePage,
      newPage: handleNewPage,
      closePage: handleClosePage,
      resizePage: handleResizePage,
      click: handleClick,
      hover: handleHover,
      fill: handleFill,
      fillForm: handleFillForm,
      typeText: handleTypeText,
      pressKey: handlePressKey,
      drag: handleDrag,
      uploadFile: handleUploadFile,
      takeSnapshot: handleTakeSnapshot,
      waitFor: handleWaitFor,
      evaluateScript: handleEvaluateScript,
      handleDialog: handleDialog,
      listConsoleMessages: handleListConsoleMessages,
      getConsoleMessage: handleGetConsoleMessage,
      listNetworkRequests: handleListNetworkRequests,
      getNetworkRequest: handleGetNetworkRequest,
      emulate: handleEmulate,
      performanceStartTrace: handlePerformanceStartTrace,
      performanceStopTrace: handlePerformanceStopTrace,
      takeMemorySnapshot: handleTakeMemorySnapshot,
      groupTabs: handleGroupTabs,
      ungroupTabs: handleUngroupTabs,
      listTabGroups: handleListTabGroups,
    };

    const handler = methodMap[method];
    if (!handler) {
      sendResponse({ callId, error: `Unknown method: ${method}` });
      return false;
    }

    const parseSafe = (str) => { try { return JSON.parse(str); } catch { return str; } };
    handler(callArgs || {})
      .then(result => sendResponse({ callId, result: parseSafe(result) }))
      .catch(err => sendResponse({ callId, error: err.message }));
    return true;
  }
});

// ========================= 工具路由表 =========================

const AGENT_TOOL_HANDLERS = {
  // Navigation
  navigate_page: handleNavigatePage,
  new_page: handleNewPage,
  close_page: handleClosePage,
  select_page: handleSelectPage,
  list_pages: handleListPages,
  resize_page: handleResizePage,
  // Interaction
  click: handleClick,
  hover: handleHover,
  fill: handleFill,
  fill_form: handleFillForm,
  type_text: handleTypeText,
  press_key: handlePressKey,
  drag: handleDrag,
  upload_file: handleUploadFile,
  // Snapshot
  take_snapshot: handleTakeSnapshot,
  take_screenshot: handleTakeScreenshot,
  wait_for: handleWaitFor,
  // Script
  evaluate_script: handleEvaluateScript,
  handle_dialog: handleDialog,
  // DevTools
  list_console_messages: handleListConsoleMessages,
  get_console_message: handleGetConsoleMessage,
  list_network_requests: handleListNetworkRequests,
  get_network_request: handleGetNetworkRequest,
  // Emulation
  emulate: handleEmulate,
  // Performance
  lighthouse_audit: handleLighthouseAudit,
  performance_start_trace: handlePerformanceStartTrace,
  performance_stop_trace: handlePerformanceStopTrace,
  performance_analyze_insight: handlePerformanceAnalyzeInsight,
  take_memory_snapshot: handleTakeMemorySnapshot,
  // Tab Groups
  group_tabs: handleGroupTabs,
  ungroup_tabs: handleUngroupTabs,
  list_tab_groups: handleListTabGroups,
  // Browser Script
  execute_browser_script: handleExecuteBrowserScript,
};

// ========================= 通道入口：externally_connectable =========================

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  // 记住 SOLO Web 所在窗口
  if (sender.tab?.windowId) {
    AgentTabManager.setSoloWindowId(sender.tab.windowId);
  }

  // 内部消息：ping / test_tool
  if (message.type === 'ping') {
    sendResponse({ success: true, agent: true });
    return false;
  }

  if (message.type === 'test_tool') {
    const handler = AGENT_TOOL_HANDLERS[message.tool];
    if (!handler) {
      sendResponse({ success: false, error: `Unknown tool: ${message.tool}` });
      return false;
    }
    handler(message.arguments || {})
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // 标准工具调用
  const handler = AGENT_TOOL_HANDLERS[message.tool];
  if (!handler) {
    sendResponse({ success: false, error: `Unknown tool: ${message.tool}` });
    return false;
  }

  handler(message.arguments || {})
    .then(data => sendResponse({ success: true, data }))
    .catch(err => sendResponse({ success: false, error: err.message }));
  return true; // keep sendResponse alive for async
});

console.log('[AgentTools] Loaded. Tools:', Object.keys(AGENT_TOOL_HANDLERS).length);
