# 封面新增「本地双人对战（PVP）」按钮 — 实施方案（收窄版）

## 背景（Context）

当前游戏只有单人模式：玩家只能调整明教（ally）一方站位，六大派（enemy）站位由
[29battle-init.js](file:///d:/LXB/new-acode-repo/modules/29battle-init.js#L339-L340) 随机分配；网格点击只在
[68ui-controls.js](file:///d:/LXB/new-acode-repo/ui/68ui-controls.js#L447-L487) 绑定了 `#allyGrid`，
渲染层 [32-grid-render.js](file:///d:/LXB/new-acode-repo/render/32-grid-render.js#L251-L252) 也只为 ALLY 加 `adjustable` 样式。

需求：在封面开始页新增 PVP 入口，进入本地双人同屏对战——两名玩家各自调整本方站位后开战。

已确认规则：
1. 按钮位置：`#coverOverlay` 封面层，与「⚔️ 开始游戏」并列。
2. 双方**同屏同时**调整：进入 PVP 后直接处于调整态，明教/六大派两个网格都可点交换；点主按钮「开战」即开战。
3. 跳过「你看好哪边」投票弹窗。
4. 跳过开场 CG、精英图鉴选人、新手引导。
5. 跳过海克斯 Buff 选择（双方都不选，保证对等）。
6. 战斗结束（GAMEOVER）后主按钮变「🏠 返回封面」，回到封面并复位到普通模式。

**改动范围已收窄为 4 个文件。** 为控制改动面，以下外围改动一律不做：
- 不给 `infra/54-global-store.js` 加 `pvpMode` 访问器、不给 `ui/63main-state.js` 加初始化——
  统一用 `GlobalStore.get('pvpMode')` / `GlobalStore.set('pvpMode', v)` 直接读写（`undefined` 即 falsy，
  与现有 `GlobalStore.get('crashMode')` 用法完全一致）。
- 不导出 `ui/71tutorial.js` 的引导清理函数——PVP 入口从不调用 `setGuide`，不会产生 `#tutorialPanel` /
  `body.tut-active` 残留（封面层隐藏后才可能触发引导，且无法中途退回封面），无需清理。

注：`web/` 是 APK 打包产物（`.gitignore` 已忽略，由 `scripts/prepare-web.mjs` + `npm run build:web` 生成），**只改根目录，不改 `web/`**。

## 交互流程（PVP）

```
封面「👥 本地双人对战」
  → 隐藏封面 / 初始化音频 / pvpMode=true / autoLevel='auto' / gs=IDLE / adjustMode=true
  → 两网格同时可交换（主按钮文案「▶ 开战」）
  → 点「开战」：adjustMode=false → 不弹投票、不选 Buff → startBattle
  → 战斗播放（可调速/暂停/快进）
  → GAMEOVER：主按钮「🏠 返回封面」（原班再战/随机重开禁用）
  → 点返回：复位 pvpMode=false、关卡回 1、重建阵容 → 封面重现 → 可选普通模式
```

## 改动清单（4 个文件）

### 1. `index.html`
- `#coverOverlay` 内、`#coverStartBtn`（L236）之后新增：
  ```html
  <button class="cover-start-btn cover-pvp-btn" id="coverPvpBtn">👥 本地双人对战</button>
  ```
- `.cover-start-btn`（L161）之后新增区分样式：
  ```css
  .cover-pvp-btn { background: linear-gradient(135deg,#4aa3ff,#1e6bb8); color:#fff; border-color:#0d4f8b; box-shadow:0 4px 20px rgba(30,107,184,0.45); margin-top:14px; animation:none; }
  ```

### 2. `render/32-grid-render.js`（`renderGrid`）
- L186-188 附近加：
  ```js
  let isPvp = !!GlobalStore.get('pvpMode');
  let renderAdjust = isAdjustMode && (camp === CAMP_TYPES.ALLY || isPvp);
  ```
- 空位分支（L251-252）改用 `renderAdjust` 判断 `adjustable` / `adjust-selected`。
- 占用位分支（L335）`if (camp === CAMP_TYPES.ALLY && isAdjustMode)` 改为 `if (renderAdjust)`。
  enemy 单位无 `fixed` 标记，`fixed-unit` 分支自然不触发。
- `GlobalStore` 该文件已导入（L6）并已用于 `GlobalStore.get('crashMode')`，无需新增 import。

### 3. `ui/68ui-controls.js`
- `bindGridClick` 重构为内部 `bindGrid(gridId, camp)`，同时绑定 `#allyGrid`(ALLY) 与 `#enemyGrid`(ENEMY)：
  - 守门：`if (!getState.adjustMode()) return;`；`if (camp === CAMP_TYPES.ENEMY && !GlobalStore.get('pvpMode')) return;`
  - 取队：按 `camp` 取 `getState.UI().allyTeam / enemyTeam`（同数组引用，交换直接改 `unit.pos`）
  - 「张无忌在 5 号位则 2 号位不可空」保护块加 `camp === CAMP_TYPES.ALLY &&` 条件（敌方不适用）
  - 保留原导出名 `bindGridClick` 与签名，调用方无需改
- `updateButtons`（L183-L205）：
  - IDLE + adjustMode：`mainBtn.innerHTML = GlobalStore.get('pvpMode') ? '▶ 开战' : '▶ 开始<br><span style="font-size:8px;">(投票)</span>'`
  - GAMEOVER 分支：`pvpMode` 时 `mainBtn.innerHTML = '🏠 返回<br>封面'`，且 `nextBtn.disabled = true`、`settleBtn.disabled = true`
- 新增导出 `bindCoverPvp(onStartPvp)`：仿 `bindCoverStart`（L214-L225），负责隐藏 `#coverOverlay` +
  `AudioManager` 初始化（init/resumeAudioContext/play/setVolume），然后调用 `onStartPvp()`；
  **不触发** CG/图鉴/引导。

### 4. `ui/61main-5v5-test.js`（核心编排）
- 把 `bindCoverStart({ val: gameStarted }, ...)`（L189）改为先用模块级引用：
  ```js
  const coverRef = { val: gameStarted };
  bindCoverStart(coverRef, updateSpeedButtons, () => { ...原有 CG→图鉴→引导... });
  ```
- 注册 PVP 入口（紧跟 `bindCoverStart` 之后）：
  ```js
  bindCoverPvp(() => {
      gameStarted = true; coverRef.val = true;
      GlobalStore.set('pvpMode', true);
      setState.autoLevel('auto'); setState.autoMode(true);   // 强制退出全自动，防自走串关
      setState.gs(S.IDLE); setState.isPaused(false);
      setState.adjustMode(true); setState.selectedAdjustPos(null);
      setState.activeBuffs([]); currentDoubleStrikeUid = null;
      isBattleStarting = false; hasLoggedTeam = false;
      updateButtons(); updateUI(); updateSpeedButtons();
  });
  ```
- 新增 `goBackToCover()`（复用现成的 `resetBattleRuntime` / `forceStopGame` / `doInitBattle`）：
  ```js
  resetBattleRuntime();
  forceStopGame();                       // abort 战斗、gs=IDLE、复位按钮
  GlobalStore.set('pvpMode', false);
  setState.adjustMode(false); setState.selectedAdjustPos(null);
  setState.activeBuffs([]); currentDoubleStrikeUid = null;
  isBattleStarting = false; hasLoggedTeam = false;
  setStage(1); GlobalStore.set('_hasPlayedFair', false);
  doInitBattle(currentStage, getState.UI(), getState.snapshot(), getState.activeBuffs(), -1, null);
  updateUI(); renderGrid('allyGrid', CAMP_TYPES.ALLY); renderGrid('enemyGrid', CAMP_TYPES.ENEMY);
  updateScoreBadge();
  document.getElementById('log').innerHTML = '<div class="separator">' + LOG_LINE1 + '</div>';
  gameStarted = false; coverRef.val = false;
  document.getElementById('coverOverlay').style.display = 'flex';
  updateButtons(); enableAllButtons(); updateSpeedButtons();
  ```
- `#btnMain` click 处理：
  - GAMEOVER 分支（L306）最上方插入：`if (GlobalStore.get('pvpMode')) { goBackToCover(); return; }`
  - IDLE + adjustMode 分支（L358-L365）：在 `showVoteDialog` 之前插入 PVP 直通：
    ```js
    if (GlobalStore.get('pvpMode')) {
        setState.adjustMode(false); setState.selectedAdjustPos(null);
        isBattleStarting = true; updateButtons(); updateUI();
        startBattle('明教'); return;
    }
    ```
- `startBattle` 内 Buff 选择改为三分支（PVP 跳过）：
  ```js
  if (GlobalStore.get('pvpMode')) {
      // PVP：不选 Buff，直接进入倒计时/开战
  } else if (getState.autoLevel() === 'full-auto') {
      ...原有自动选 Buff...
  } else {
      await new Promise(resolve => { showBuffSelection(...); });
  }
  ```
- `startBattle` 内两处全自动自走加 `pvpMode` 守门：L298-302 自动进下一关、L340-344 GAMEOVER 后自动点击。

## 风险与边界

- **全自动冲突**：PVP 入口强制 `autoLevel='auto'`；另在自动选 Buff / 自动进关 / 自动点击三处加 `!pvpMode` 守门，防止玩家中途切「全自动」把 PVP 带进串关。
- **敌人 `state._originalPos` 陈旧**：交换只改 `.pos`，不改 `_originalPos`。日志仅在 `pos === -1` 时才回退用 `_originalPos`，交换后 `pos` 有效，无影响；返回封面时 `doInitBattle` 重建，无残留。
- **固定位规则**：明教 3 个 `fixed=true` 单位仍不可动、张无忌 5 号位保护保留；敌方张三丰仅由 init 固定在 1 号位、无 `fixed` 标记，PVP 下可被交换（符合"双方自由排兵"预期）。
- **返回封面后再次普通开局**：`goBackToCover` 已置 `pvpMode=false`、关卡回 1 并重建阵容，普通模式不会带 PVP 残留；`coverRef.val` 复位保证封面按钮语义正常。
- **选关按钮**：PVP 调整态下 `updateButtons` 已禁用 `btnStageSelect`；封面层 `z-index:99999` 覆盖，返回封面后不会误触。
- **无 pvpMode 初始化**：`GlobalStore.get('pvpMode')` 在未设置时为 `undefined`（falsy），行为等同 `false`，不会误入 PVP 分支。

## 验证方式

1. 用本地 HTTP 服务打开根目录 `index.html`（ES module 不能用 `file://` 直开）。
2. 封面点「👥 本地双人对战」→ 确认直接进入调整态、无 CG/图鉴/引导、主按钮显示「▶ 开战」。
3. 明教网格与六大派网格**同时**可点交换；明教灰色固定位不可动、张无忌 5 号位保护生效。
4. 点「开战」→ 确认无投票弹窗、无海克斯三选一，直接倒计时并开战；双方站位与调整一致。
5. 战斗中调速/暂停/快进正常；GAMEOVER 后主按钮为「🏠 返回封面」且原班再战/随机重开禁用。
6. 点「🏠 返回封面」→ 封面重现；再点普通「⚔️ 开始游戏」→ 验证为普通单人流程、无 PVP 残留（敌方站位恢复系统生成、投票弹窗恢复）。
7. 回归：普通模式（不点 PVP）开局流程不变——CG/图鉴/引导、明教调整、投票、Buff 三选一全部照旧。
