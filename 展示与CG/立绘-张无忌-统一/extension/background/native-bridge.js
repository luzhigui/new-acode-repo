/**
 * Native Messaging Bridge
 * 
 * 负责与 Native Host 通信，接收来自沙箱服务的 JSON-RPC 请求，
 * 通过 chrome.debugger API 执行 CDP 命令并返回结果。
 */

const NATIVE_HOST_NAME = 'com.solo.browser_bridge';
const MAX_CONSOLE_LOGS_PER_TAB = 2000;
const CDP_COMMAND_TIMEOUT = 60000;

class NativeBridge {
  static GROUP_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

  static _randomColor() {
    return NativeBridge.GROUP_COLORS[Math.floor(Math.random() * NativeBridge.GROUP_COLORS.length)];
  }

  constructor() {
    this.port = null;
    this.connected = false;
    this.pendingRequests = new Map(); // id -> { resolve, reject, timer }
    this.tabSessions = new Map(); // tabId -> attached
    this.tabQueues = new Map(); // tabId -> Promise chain (串行化)
    this.sessions = new Map(); // sessionId -> { name, tabs: Set<tabId>, groupId }
    this.consoleLogs = new Map(); // tabId -> [{level, text, timestamp}]
    this.consoleEnabled = new Set(); // 已启用 console 监听的 tab
    this.cdpSubscriptions = new Map(); // tabId -> Set<eventPrefix> (如 'Network', 'Page')
    this._cdpEventListenerInstalled = false;
    this._idleDetachTimers = new Map(); // tabId -> timerId
    this._idleDetachDelay = 30000; // 30 秒无活动自动 detach
  }

  /**
   * 获取或创建 session 状态
   */
  _getSession(sessionId) {
    const id = sessionId || '__default__';
    if (!this.sessions.has(id)) {
      this.sessions.set(id, { name: '', tabs: new Set(), groupId: null });
    }
    return this.sessions.get(id);
  }

  /**
   * 确保 tab 归属当前会话工作分组（如果 tab 被归档则自动恢复）
   */
  async _ensureTabInSession(tabId, sessionId) {
    if (!tabId || !sessionId) return;
    const session = this._getSession(sessionId);
    if (!session.tabs.has(tabId)) {
      session.tabs.add(tabId);
      await this._addToGroup(tabId, sessionId);
    }
  }

  /**
   * 连接到 Native Host
   */
  connect() {
    if (this.port) {
      this.disconnect();
    }

    try {
      this.port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
      this.connected = true;

      this.port.onMessage.addListener((msg) => this._onMessage(msg));
      this.port.onDisconnect.addListener(() => this._onDisconnect());

      console.log('[NativeBridge] Connected to native host');
    } catch (err) {
      console.error('[NativeBridge] Connection failed:', err);
      this.connected = false;
    }
  }

  disconnect() {
    if (this.port) {
      this.port.disconnect();
      this.port = null;
    }
    this.connected = false;
    this._clearPendingRequests('Disconnected');
  }

  _onDisconnect() {
    const error = chrome.runtime.lastError?.message || 'Unknown';
    console.warn('[NativeBridge] Disconnected:', error);
    this.port = null;
    this.connected = false;
    this._clearPendingRequests('Native host disconnected: ' + error);

    // 自动重连（5秒后）
    setTimeout(() => this.connect(), 5000);
  }

  _clearPendingRequests(reason) {
    for (const [id, req] of this.pendingRequests) {
      clearTimeout(req.timer);
      req.reject(new Error(reason));
    }
    this.pendingRequests.clear();
  }

  /**
   * 处理来自 Native Host 的消息（JSON-RPC 2.0）
   */
  async _onMessage(msg) {
    // 如果是响应（有 id 且无 method），处理 pending request
    if (msg.id && !msg.method) {
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(msg.error.message));
        } else {
          pending.resolve(msg.result);
        }
      }
      return;
    }

    // 如果是请求（有 method），执行对应操作
    if (msg.method) {
      let result = null;
      let error = null;

      try {
        result = await this._handleRequest(msg.method, msg.params || {});
      } catch (err) {
        error = { code: -32000, message: err.message };
      }

      // 发送响应
      if (msg.id) {
        this._send({
          jsonrpc: '2.0',
          id: msg.id,
          ...(error ? { error } : { result }),
        });
      }
    }
  }

  /**
   * 路由请求到对应处理器
   */
  async _handleRequest(method, params) {
    // 统一前置：如果请求携带 tabId + sessionId，确保 tab 归属当前会话分组
    if (params.tabId && params.sessionId) {
      await this._ensureTabInSession(params.tabId, params.sessionId);
    }

    switch (method) {
      // ==================== 原有方法 ====================
      case 'cdp.send':
        return this._cdpSend(params);
      case 'tab.list':
        return this._tabList();
      case 'tab.create':
        return this._tabCreate(params);
      case 'tab.close':
        return this._tabClose(params);
      case 'tab.navigate':
        return this._tabNavigate(params);
      case 'debugger.attach':
        return this._debuggerAttach(params);
      case 'debugger.detach':
        return this._debuggerDetach(params);
      case 'page.content':
        return this._getPageContent(params);
      case 'page.extract':
        return this._getPageExtract(params);
      case 'ping':
        return { pong: true, timestamp: Date.now() };

      // ==================== Tab 管理扩展 ====================
      case 'tab.back':
        return this._tabBack(params);
      case 'tab.forward':
        return this._tabForward(params);
      case 'tab.reload':
        return this._tabReload(params);
      case 'tab.activate':
        return this._tabActivate(params);
      case 'tab.focus':
        return this._tabFocus(params);
      case 'name_session':
        return this._nameSession(params);
      case 'finalize_tabs':
        return this._finalizeTabs(params);

      // ==================== CDP 事件订阅 ====================
      case 'cdp.subscribe':
        return this._cdpSubscribe(params);
      case 'cdp.unsubscribe':
        return this._cdpUnsubscribe(params);

      // ==================== 开发者工具 ====================
      case 'dev.logs':
        return this._devLogs(params);

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  // ========================= 原有方法实现 =========================

  /**
   * 发送 CDP 命令（Per-tab 串行化，按需自动 attach，由 session 生命周期管理 detach）
   */
  async _cdpSend({ tabId, method, params }) {
    if (!tabId || !method) {
      throw new Error('tabId and method are required');
    }

    return this._enqueueForTab(tabId, async () => {
      if (!this.tabSessions.has(tabId)) {
        await this._debuggerAttach({ tabId });
      }

      try {
        return await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`CDP timeout: ${method} on tab ${tabId}`));
          }, CDP_COMMAND_TIMEOUT);

          chrome.debugger.sendCommand(
            { tabId },
            method,
            params || {},
            (res) => {
              clearTimeout(timeout);
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(res);
              }
            }
          );
        });
      } finally {
        this._resetIdleDetach(tabId);
      }
    });
  }

  /**
   * Per-tab Promise 链串行执行器
   * 对同一 tab 的操作串行执行，不同 tab 之间完全并发
   */
  _enqueueForTab(tabId, fn) {
    const prev = this.tabQueues.get(tabId) || Promise.resolve();
    const next = prev.then(fn, fn); // 即使前一个失败，也继续执行
    this.tabQueues.set(tabId, next);
    return next;
  }

  /**
   * Attach debugger 到 tab
   */
  async _debuggerAttach({ tabId }) {
    if (this.tabSessions.has(tabId)) {
      return { already: true };
    }

    return new Promise((resolve, reject) => {
      chrome.debugger.attach({ tabId }, '1.3', () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          this.tabSessions.set(tabId, true);
          resolve({ attached: true, tabId });
        }
      });
    });
  }

  /**
   * Detach debugger
   */
  async _debuggerDetach({ tabId }) {
    if (!this.tabSessions.has(tabId)) {
      return { already: true };
    }

    return new Promise((resolve, reject) => {
      chrome.debugger.detach({ tabId }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          this.tabSessions.delete(tabId);
          resolve({ detached: true, tabId });
        }
      });
    });
  }

  /**
   * 获取所有 tab 列表
   */
  async _tabList() {
    const tabs = await chrome.tabs.query({});
    return tabs.map(t => ({
      id: t.id,
      url: t.url,
      title: t.title,
      active: t.active,
      windowId: t.windowId,
    }));
  }

  /**
   * 创建新 tab（默认后台打开，并归入专属分组）
   */
  async _tabCreate({ url, active = false, group = true, sessionId }) {
    const tab = await chrome.tabs.create({ url, active });
    const session = this._getSession(sessionId);

    // 归入专属 tab group
    if (group) {
      await this._addToGroup(tab.id, sessionId);
    }

    // 记录到会话 tabs
    session.tabs.add(tab.id);

    return { id: tab.id, tabId: tab.id, url: tab.url, title: tab.title };
  }

  /**
   * 将 tab 加入会话专属分组
   */
  async _addToGroup(tabId, sessionId) {
    try {
      const session = this._getSession(sessionId);
      const groupTitle = session.name || 'TRAE';

      // 复用 name_session 已找到的 groupId
      if (session.groupId) {
        try {
          await chrome.tabs.group({ tabIds: tabId, groupId: session.groupId });
          return;
        } catch {
          // groupId 可能已失效，fallback 到按名称查找
          session.groupId = null;
        }
      }

      const groups = await chrome.tabGroups.query({ title: groupTitle });
      let groupId;

      if (groups.length > 0) {
        groupId = groups[0].id;
        await chrome.tabs.group({ tabIds: tabId, groupId });
      } else {
        groupId = await chrome.tabs.group({ tabIds: tabId });
        await chrome.tabGroups.update(groupId, {
          title: groupTitle,
          color: NativeBridge._randomColor(),
          collapsed: true,
        });
      }

      session.groupId = groupId;
    } catch (err) {
      console.warn('[NativeBridge] Failed to group tab:', err.message);
    }
  }

  /**
   * 关闭 tab
   */
  async _tabClose({ tabId, sessionId }) {
    this._clearIdleDetach(tabId);
    await this._debuggerDetach({ tabId }).catch(() => {});
    await chrome.tabs.remove(tabId);
    this.consoleLogs.delete(tabId);
    this.consoleEnabled.delete(tabId);
    this.cdpSubscriptions.delete(tabId);
    this.tabQueues.delete(tabId);
    if (sessionId) {
      const session = this._getSession(sessionId);
      session.tabs.delete(tabId);
    } else {
      for (const session of this.sessions.values()) {
        session.tabs.delete(tabId);
      }
    }
    return { closed: true };
  }

  /**
   * 导航到 URL
   */
  async _tabNavigate({ tabId, url, timeout_ms = 5000 }) {
    await this._cdpSend({
      tabId,
      method: 'Page.navigate',
      params: { url },
    });
    if (timeout_ms) {
      await this._waitForNavigation(tabId, timeout_ms);
    }
    const tab = await chrome.tabs.get(tabId);
    return { id: tab.id, url: tab.url };
  }

  /**
   * 获取页面内容（通过 CDP Runtime.evaluate）
   */
  async _getPageContent({ tabId }) {
    const result = await this._cdpSend({
      tabId,
      method: 'Runtime.evaluate',
      params: {
        expression: `({
          title: document.title,
          url: location.href,
          html: document.documentElement.outerHTML,
          text: document.body.innerText,
        })`,
        returnByValue: true,
      },
    });
    return result?.result?.value || null;
  }

  /**
   * 智能提取页面内容（根据站点选择定制提取规则）
   */
  async _getPageExtract({ tabId }) {
    // 先获取页面 hostname
    const hostResult = await this._cdpSend({
      tabId,
      method: 'Runtime.evaluate',
      params: { expression: 'location.hostname', returnByValue: true },
    });
    const hostname = hostResult?.result?.value || '';

    // 根据 hostname 匹配提取器
    let script = self.genericExtractor;
    if (self.pageExtractors) {
      for (const [key, extractor] of Object.entries(self.pageExtractors)) {
        if (hostname.includes(key)) {
          script = extractor;
          break;
        }
      }
    }

    // 注入执行
    const result = await this._cdpSend({
      tabId,
      method: 'Runtime.evaluate',
      params: { expression: script, returnByValue: true, awaitPromise: false },
    });
    return result?.result?.value || null;
  }

  // ========================= Tab 管理扩展 =========================

  /**
   * 后退
   */
  async _tabBack({ tabId, timeout_ms }) {
    // 使用 CDP 获取导航历史并回退
    const history = await this._cdpSend({
      tabId,
      method: 'Page.getNavigationHistory',
      params: {},
    });
    const { currentIndex, entries } = history || {};
    if (!entries || currentIndex <= 0) {
      throw new Error('Cannot find a previous page in history.');
    }
    await this._cdpSend({
      tabId,
      method: 'Page.navigateToHistoryEntry',
      params: { entryId: entries[currentIndex - 1].id },
    });
    if (timeout_ms) {
      await this._waitForNavigation(tabId, timeout_ms);
    }
    return { ok: true };
  }

  /**
   * 前进
   */
  async _tabForward({ tabId, timeout_ms }) {
    const history = await this._cdpSend({
      tabId,
      method: 'Page.getNavigationHistory',
      params: {},
    });
    const { currentIndex, entries } = history || {};
    if (!entries || currentIndex >= entries.length - 1) {
      throw new Error('Cannot find a next page in history.');
    }
    await this._cdpSend({
      tabId,
      method: 'Page.navigateToHistoryEntry',
      params: { entryId: entries[currentIndex + 1].id },
    });
    if (timeout_ms) {
      await this._waitForNavigation(tabId, timeout_ms);
    }
    return { ok: true };
  }

  /**
   * 刷新
   */
  async _tabReload({ tabId, timeout_ms }) {
    await chrome.tabs.reload(tabId);
    if (timeout_ms) {
      await this._waitForNavigation(tabId, timeout_ms);
    }
    return { ok: true };
  }

  /**
   * 激活 tab（切换到前台）
   */
  async _tabActivate({ tabId }) {
    await chrome.tabs.update(tabId, { active: true });
    return { ok: true };
  }

  /**
   * 聚焦 tab 并将浏览器窗口置于前台
   */
  async _tabFocus({ tabId }) {
    if (tabId) {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.windowId) {
          await chrome.windows.update(tab.windowId, { focused: true });
        }
        await chrome.tabs.update(tabId, { active: true });
        return { ok: true };
      } catch (e) {
        console.log('[tab.focus] tab not found:', tabId, e.message);
      }
    }
  return { ok: false };
  }
  

  /**
   * 存储会话名
   */
  async _nameSession({ name, sessionId }) {
    const session = this._getSession(sessionId);
    session.name = name;

    const color = NativeBridge._randomColor();

    try {
      // Check if a group with this name already exists
      const existing = await chrome.tabGroups.query({ title: name });
      if (existing.length > 0) {
        session.groupId = existing[0].id;
        // Update color
        await chrome.tabGroups.update(session.groupId, { color });
      }
      // Group will be created when first tab is added
    } catch (err) {
      console.warn('[NativeBridge] Failed to query tab groups:', err.message);
    }

    return { name: session.name, color };
  }

  /**
   * 结束会话，关闭非 keep 列表中的会话 tab
   */
  async _finalizeTabs({ keep, sessionId }) {
    const session = this._getSession(sessionId);
    // keep === undefined  → archive ALL session tabs (default finalize)
    // keep === []         → close ALL session tabs (nothing to keep)
    // keep === [id, ...]  → archive those IDs, close the rest
    const toArchive = [];
    const toClose = [];

    if (keep === undefined) {
      // Not passed — archive everything
      for (const tabId of session.tabs) {
        toArchive.push(tabId);
      }
    } else {
      const keepIds = new Set(
        (keep || []).map(k => typeof k === 'object' ? k.tab_id : k),
      );
      for (const tabId of session.tabs) {
        if (keepIds.has(tabId)) {
          toArchive.push(tabId);
        } else {
          toClose.push(tabId);
        }
      }
    }

    // Detach debugger from all session tabs before closing/archiving
    for (const id of [...toArchive, ...toClose]) {
      await this._debuggerDetach({ tabId: id }).catch(() => {});
    }

    // Close tabs not in keep list
    if (toClose.length > 0) {
      await chrome.tabs.remove(toClose);
    }

    // Move kept tabs to "✅ TRAE" archive group
    if (toArchive.length > 0) {
      const ARCHIVE_GROUP_NAME = '✅ TRAE';
      let archiveGroupId = null;

      // Find existing archive group
      try {
        const existing = await chrome.tabGroups.query({ title: ARCHIVE_GROUP_NAME });
        if (existing.length > 0) {
          archiveGroupId = existing[0].id;
        }
      } catch (e) {
        // tabGroups API error, proceed to create new group
      }

      if (archiveGroupId) {
        await chrome.tabs.group({ tabIds: toArchive, groupId: archiveGroupId });
      } else {
        archiveGroupId = await chrome.tabs.group({ tabIds: toArchive });
        await chrome.tabGroups.update(archiveGroupId, {
          title: ARCHIVE_GROUP_NAME,
          color: 'green',
          collapsed: true,
        });
      }

      // Collapse the archive group
      try {
        await chrome.tabGroups.update(archiveGroupId, { collapsed: true });
      } catch (e) {
        // ignore
      }
    }

    // Clean up session tab tracking
    for (const id of [...toArchive, ...toClose]) {
      this._clearIdleDetach(id);
      this.consoleLogs.delete(id);
      this.consoleEnabled.delete(id);
      this.cdpSubscriptions.delete(id);
      session.tabs.delete(id);
    }

    // 保留 session.name 和 session.groupId 以便复用：
    // - name 保留，下次操作自动创建同名分组
    // - groupId 保留，_addToGroup 有 try-catch 处理失效的 groupId

    return { archived: toArchive, closed: toClose };
  }

  /**
   * 等待导航完成（辅助方法）
   */
  _waitForNavigation(tabId, timeoutMs = 5000) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, timeoutMs);

      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  // ========================= CDP 事件订阅 =========================

  /**
   * 订阅指定 tab 的 CDP 事件
   * params: { tabId, events: ['Network', 'Page', ...] }
   * 订阅后，匹配的 CDP 事件会作为 notification 推送回 Native Host：
   *   { "jsonrpc": "2.0", "method": "cdp.event", "params": { tabId, method, params } }
   */
  async _cdpSubscribe({ tabId, events }) {
    if (!tabId || !events?.length) {
      throw new Error('tabId and events[] are required');
    }

    // 确保 debugger 已 attach
    if (!this.tabSessions.has(tabId)) {
      await this._debuggerAttach({ tabId });
    }

    // 注册订阅
    let subs = this.cdpSubscriptions.get(tabId);
    if (!subs) {
      subs = new Set();
      this.cdpSubscriptions.set(tabId, subs);
    }
    for (const prefix of events) {
      subs.add(prefix);
    }

    // 安装全局 CDP 事件监听器（只安装一次）
    this._installCdpEventForwarder();

    return { subscribed: events, tabId };
  }

  /**
   * 取消订阅指定 tab 的 CDP 事件
   * params: { tabId, events?: ['Network', ...] }
   * 不传 events 则取消该 tab 所有订阅
   */
  async _cdpUnsubscribe({ tabId, events }) {
    if (!tabId) {
      throw new Error('tabId is required');
    }

    const subs = this.cdpSubscriptions.get(tabId);
    if (!subs) {
      return { unsubscribed: [], tabId };
    }

    if (!events?.length) {
      const removed = [...subs];
      this.cdpSubscriptions.delete(tabId);
      return { unsubscribed: removed, tabId };
    }

    for (const prefix of events) {
      subs.delete(prefix);
    }
    if (subs.size === 0) {
      this.cdpSubscriptions.delete(tabId);
    }
    return { unsubscribed: events, tabId };
  }

  /**
   * 安装全局 chrome.debugger.onEvent 监听器，
   * 将订阅的 CDP 事件转发为 notification，并收集 console 日志
   */
  _installCdpEventForwarder() {
    if (this._cdpEventListenerInstalled) return;
    this._cdpEventListenerInstalled = true;

    chrome.debugger.onEvent.addListener((source, method, params) => {
      const tabId = source.tabId;
      if (!tabId) return;

      // Console 日志收集
      if (method === 'Runtime.consoleAPICalled' && this.consoleEnabled.has(tabId)) {
        const logs = this.consoleLogs.get(tabId) || [];
        logs.push({
          level: params.type,
          text: params.args.map(a => a.value || a.description || '').join(' '),
          timestamp: params.timestamp || Date.now(),
        });
        if (logs.length > MAX_CONSOLE_LOGS_PER_TAB) logs.splice(0, logs.length - MAX_CONSOLE_LOGS_PER_TAB);
        this.consoleLogs.set(tabId, logs);
      }

      // CDP 事件转发
      const subs = this.cdpSubscriptions.get(tabId);
      if (!subs) return;

      const prefix = method.split('.')[0];
      if (!subs.has(prefix)) return;

      this._send({
        jsonrpc: '2.0',
        method: 'cdp.event',
        params: { tabId, method, params },
      });
    });
  }

  // ========================= 开发者工具 =========================

  /**
   * 获取控制台日志（启用 Runtime 域监听 console 事件）
   */
  async _devLogs({ tabId, filter, levels, limit = 100 }) {
    // 确保 console 监听已启用
    if (!this.consoleEnabled.has(tabId)) {
      await this._enableConsoleLogs(tabId);
    }

    let logs = this.consoleLogs.get(tabId) || [];

    // 按 level 过滤
    if (levels && levels.length > 0) {
      logs = logs.filter(l => levels.includes(l.level));
    }

    // 按关键字过滤
    if (filter) {
      const regex = new RegExp(filter, 'i');
      logs = logs.filter(l => regex.test(l.text));
    }

    // 限制数量（取最新的）
    if (logs.length > limit) {
      logs = logs.slice(-limit);
    }

    return { logs, total: logs.length };
  }

  /**
   * 启用控制台日志收集
   */
  async _enableConsoleLogs(tabId) {
    if (this.consoleEnabled.has(tabId)) return;

    // attach 并启用 Runtime 域
    await this._debuggerAttach({ tabId });
    await this._cdpSend({
      tabId,
      method: 'Runtime.enable',
      params: {},
    });

    this.consoleEnabled.add(tabId);
    if (!this.consoleLogs.has(tabId)) {
      this.consoleLogs.set(tabId, []);
    }

    // 复用全局 CDP 事件监听器收集 console 日志
    this._installCdpEventForwarder();
  }

  // ========================= 辅助方法 =========================

  /**
   * 重置 tab 的 idle auto-detach 计时器。
   * 30 秒无 CDP 活动后自动 detach，移除 Chrome 调试横幅。
   */
  _resetIdleDetach(tabId) {
    this._clearIdleDetach(tabId);

    const timer = setTimeout(() => {
      this._idleDetachTimers.delete(tabId);
      if (this.tabSessions.has(tabId)) {
        this._debuggerDetach({ tabId }).catch(() => {});
      }
    }, this._idleDetachDelay);
    this._idleDetachTimers.set(tabId, timer);
  }

  _clearIdleDetach(tabId) {
    const existing = this._idleDetachTimers.get(tabId);
    if (existing) {
      clearTimeout(existing);
      this._idleDetachTimers.delete(tabId);
    }
  }

  /**
   * 发送消息到 Native Host
   */
  _send(msg) {
    if (this.port && this.connected) {
      this.port.postMessage(msg);
    }
  }
}

// 监听 debugger detach 事件，清理 session
chrome.debugger.onDetach.addListener((source, reason) => {
  if (source.tabId && globalBridge) {
    globalBridge.tabSessions.delete(source.tabId);
    globalBridge.consoleEnabled.delete(source.tabId);
    globalBridge.cdpSubscriptions.delete(source.tabId);
    console.log(`[NativeBridge] Tab ${source.tabId} detached: ${reason}`);
  }
});

// 全局实例
const globalBridge = new NativeBridge();

// 启动连接
globalBridge.connect();

// 保活：每 25 秒发心跳，防止 MV3 Service Worker 休眠
chrome.alarms.create('native-bridge-keepalive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'native-bridge-keepalive') {
    if (globalBridge.connected) {
      globalBridge._send({ jsonrpc: '2.0', method: 'heartbeat', params: {} });
    } else {
      globalBridge.connect();
    }
  }
});

// ========================= 公共接口（供 agent-tools.js 使用）=========================

/**
 * CDP 命令
 */
NativeBridge.prototype.cdpSend = function(tabId, method, params) {
  return this._cdpSend({ tabId, method, params });
};

/**
 * 确保 tab 已 attach
 */
NativeBridge.prototype.ensureAttached = function(tabId) {
  return this._debuggerAttach({ tabId });
};

/**
 * 主动 detach
 */
NativeBridge.prototype.detachTab = function(tabId) {
  return this._debuggerDetach({ tabId });
};

/**
 * 是否已 attach
 */
NativeBridge.prototype.isAttached = function(tabId) {
  return this.tabSessions.has(tabId);
};

/**
 * 等待导航完成
 */
NativeBridge.prototype.waitForNav = function(tabId, timeoutMs) {
  return this._waitForNavigation(tabId, timeoutMs);
};

/**
 * 创建 tab（支持指定 windowId + 自动归组）
 */
NativeBridge.prototype.createTabInWindow = async function(url, opts = {}) {
  const { active = false, windowId = null, group = true, sessionId = null } = opts;
  const createOpts = { url, active };
  if (windowId) createOpts.windowId = windowId;
  const tab = await chrome.tabs.create(createOpts);
  if (group) await this._addToGroup(tab.id, sessionId);
  const session = this._getSession(sessionId);
  session.tabs.add(tab.id);
  return tab;
};

// 导出给 background.js 使用
self.nativeBridge = globalBridge;
