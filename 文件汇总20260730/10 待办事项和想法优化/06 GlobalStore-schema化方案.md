# 06 GlobalStore schema 化方案

> 版本 V1.0.0 ｜ 2026-11-07 ｜ 状态：可执行方案（本阶段不改生产代码）
> 口径：沿用 2026-11-06 产出的 **65 键类型对照表**；本文只定义其中 **12 个集合/动态结构键**，其余 53 个标量/布尔/枚举键按同一 DSL 顺带声明，不重列。
> 适用：`new-acode-repo` 主仓 `infra/102-core-utils.js`、`infra/104-global-store.js`。

---

## 0. 现状判定（先给三行）

- **根因**：GlobalStore 只有「键名」没有「形状」，`set` 直接落值，任何调用点写错类型都不会被发现。
- **证据**：`infra/104-global-store.js:54-65` 的 `set()` 无校验；`infra/102-core-utils.js:108-121` 的 `setBattleState()` 无校验；`core/218-state-keys.js` 已有成熟 DSL（type/default/scope），但只覆盖 `Unit.state`。
- **影响面**：65 键中 12 个是集合/动态结构（数组、活对象、可空对象、带 `Infinity`/frozen 语义），错写会直接炸渲染或污染跨局数据。

四条关键事实：

1. **双桶存储**：`_state`（104:15-25）+ `_battleState`（102:108-109，4 键：`currentStage`/`holyToken`/`chestCount`/`currentBattleState`）；`GlobalStore.set` 先经 `isBattleStateKey` 分流（104:55-57）。
2. **活引用，不是 JSON**：`battleStore`、`activeBuffs`、`UI.allyTeam` 存的是可变对象；`snapshot.ally/enemy` 元素被 `Object.freeze`（`ui/706-main-battle.js:38-39`）；妹账本 `remaining: Infinity`（`modules/329-buff-tools.js:126`）。schema 只能「只读校验」，**禁止 clone / freeze / JSON 往返**。
3. **已有死副本**：104:21 `_state.currentBattleState` 与 102 `_battleState.currentBattleState` 双存，真值只在后者（`core/210-battle-round.js:57,101`）。
4. **已知缺口（P1）**：`battleFacts` 新局不清——`ui/706-main-battle.js:44` 只清 `battleLog`，只有 `ui/702-main-5v5-test.js:257` 清 facts，主路径会跨局累积。

---

## 1. 类型定义放哪一层（结论：`infra/107`，不放 core/2xx）

**结论**：新建 `infra/107-store-schema.js`，与 `infra/106-battle-enums.js` 同层；**不在 `core/2xx` 新建 store 类型文件**。

理由（依赖方向铁律）：

- 依赖方向是 `ui/fx → player → render/modules → core → infra`，**core 可 import infra，infra 不能 import core**。
- 校验执行点在 `infra/104`（`set`）和 `infra/102`（`setBattleState`）。若 schema 放 `core/2xx`，infra 必须反向 import core → 直接违反架构铁律。
- `core/218-state-keys.js` 继续做 `Unit.state` 的**唯一真源**；store schema 对 Unit 只做 duck-type（`uid/name/pos/hp/alive/state` 存在），**不下钻 state 字段**，避免第二真源。
- `infra/107` 只允许 import `infra/106`（枚举），禁止 import `core/`，避免 102↔107 成环。

DSL（对齐 `core/218` 的 `STATE_FIELD_TYPES`，扩展 null/item/fields）：

```js
export const STORE_VALUE_TYPES = Object.freeze({
    BOOLEAN: 'boolean', NUMBER: 'number', STRING: 'string',
    ARRAY: 'array', OBJECT: 'object', FUNCTION: 'function', NULL: 'null', ANY: 'any'
});

// 每个键：type 必填；nullable 默认 false；default 用于初始化与缺键读取
export const STORE_SCHEMA = Object.freeze({
    snapshot: {
        type: 'OBJECT', nullable: false, default: { ally: [], enemy: [] },
        fields: {
            ally:    { type: 'ARRAY', item: 'UNIT', required: true },
            enemy:   { type: 'ARRAY', item: 'UNIT', required: true },
            _rngSeed:{ type: 'NUMBER', required: false }
        },
        frozen: 'deep'            // 允许 frozen，不写入
    },
    // …其余 11 键见第四节
});

export function validateStoreValue(key, value, { mode = 'warn' } = {}) { /* … */ }
export function assertStoreSchema() { /* 自检：每个 schema 键必须命中 65 键白名单，防裸字符串漏注册 */ }
```

辅助 typedef（只写进 `infra/107` 注释，不 import core）：

- `Unit`：`{ uid:string, name:string, m:number, role:ROLE_TYPES, camp:CAMP_TYPES, pos:number|null, hp:number, maxHp:number, atk:number, def:number, alive:boolean, state:object }`，允许 `Unit` 实例或 clone/`toJSON()` 后的 plain object。
- `Buff`：`{ key:BUFF_TYPES, target:CAMP_TYPES, remaining:number, name:string, permanent?:true, cols?:number[], rows?:number[] }`
- `Fact`：`{ factType:FACT_TYPES, data:object }`（允许额外字段）
- `LogEntry`：`{ type:string, text:string, ...optional }`
- `ReportUnit`：Unit 统计顶层字段 + `_isDead:boolean`，plain object。

---

## 2. 运行时校验怎么接

**唯一入口，读路径零成本**：

| 接入点 | 文件 | 做法 |
| --- | --- | --- |
| `GlobalStore.set(key,value)` | `infra/104-global-store.js:54` | 函数第一行 `validateStoreValue(key,value)`；`isBattleStateKey` 分流前后都走同一校验 |
| `GlobalStore.setState(partial)` | `infra/104-global-store.js:37` | 遍历 `partial` 逐键校验，再 `Object.assign` |
| `GlobalStore.dispatch(action)` | `infra/104-global-store.js:93` | 只校验 `action.payload` 中命中 65 键白名单的项 |
| `setBattleState(key,value)` | `infra/102-core-utils.js:115` | 改为委托 `validateStoreValue`（102/104 都 import 107，不产生反向依赖） |
| `updateBattleState(state)` | `infra/104-global-store.js:110` | 改为 `GlobalStore.set('currentBattleState', state)`，不再绕过 |
| `get / getState` | 104 | **不加校验**（热路径） |

**模式与失败策略**：

- `_schemaMode` 三档：`off`（仅调试）/ `warn`（`console.error` + 违规计数）/ `strict`（抛 `TypeError`）。
- 落地顺序：B1–B3 走 `warn`，B4 默认 `strict`；`off` 只留给性能排查。
- `strict` 行为：`throw new TypeError('[GlobalStore] key=… 期望 … 实际 …')`；**不修正、不补默认、不克隆**（禁止兜底，状态源唯一）。
- 暴露 `GlobalStore.getSchemaViolations()` 供体检/回归断言「违规数 = 0」。

**性能约束**：

- 顶层 `type/nullable` O(1)；`item` 只查首元素形状；`battleStore` 只查 3 个函数；`activeBuffs` 不遍历全数组。
- 深校验（逐元素逐字段）只在 `?schema=1` 调试开关下开启。
- 不校验业务不变量（如 `remaining > 0`、`round` 递增），那是体检规则的职责。

---

## 3. 旧数据怎么兼容

这 12 键**全部只在内存**，不落 localStorage；因此「旧数据」是下面四类，不是持久化迁移：

1. **启动缺省**：键可能 `undefined`（如 `xiaoZhaoPermanentBuffs` 首局前未写）。→ 初始化与 `GlobalStore.get` 缺键时返回 schema `default`；**只把 `undefined`/缺键替换为默认，`null` 不替换**（`null` 是合法业务值）。
2. **旧版结构**：`battleHistory` 条目已带 `version: 1`（`player/503-player-core.js:125,188-198`）。→ 保留版本号，新增 `upgradeHistory(entry)` 映射表；只在回放/生涯读取入口升级，**不在 set 时静默改结构**。
3. **跨环境 plain object**：联网从机/回放/工具传入的是 `clone()` 或 spread 后的 plain object（`ui/717-replay-entry.js:81-83`、`ui/716-net-session.js:130-132`）。→ Unit 判定用 duck-type，**禁止 `instanceof Unit`**（Worker/工具链反序列化必失败）。
4. **非 JSON 语义**：`snapshot` 元素 frozen、妹账本 `Infinity`。→ 校验器只读；禁止任何 `JSON.stringify/parse` 往返做校验；允许 `Infinity`。

**不做兼容层**：不写「旧字段自动纠正」「新旧字段并存」。warn 期把违规写点列清、逐条改调用点，B4 翻 strict 前要求 violations=0。

`localStorage` 遗留标量（`voteScore`/`holyToken`/`chestCount`）不在这 12 键内，仍按 `player/511-battle-report.js` 读写，本次不动。

---

## 4. 12 个键的形状（逐键定稿）

> 通用：`Unit` 见 §1 typedef；`Buff`/`Fact`/`LogEntry` 见 §1。`required` 缺省 true，`nullable` 缺省 false。

### 4.1 `snapshot`

- **形状**：`{ ally: Unit[]; enemy: Unit[]; _rngSeed?: number }`
- **可空**：否（开局前不写该键；写入即完整）
- **缺省**：`{ ally: [], enemy: [] }`
- **写点**：`ui/706-main-battle.js:38-46`；`ui/709-ui-controls.js:160-166`（原班再战复用+新种子）；`player/503-player-core.js:373,439`（从机/回放）
- **迁移**：无历史结构。`ally/enemy` 元素是 `Object.freeze(u.clone())`，schema 标 `frozen:'deep'` 只读放行；`_rngSeed` 为可选 `number`（xorshift32 uint32），`freshSeed` 会 `delete` 它，缺省合法。

### 4.2 `UI`

- **形状**：`{ allyTeam: Unit[]; enemyTeam: Unit[]; currentResult: null; round: number }`
- **可空**：否
- **缺省**：同形状（`ui/704-main-state.js:42`）
- **写点**：`ui/704-main-state.js:42`；`ui/706-main-battle.js:40-43`；`ui/716-net-session.js:130-132`；`ui/717-replay-entry.js:81-83`；`ui/709-ui-controls.js:212`
- **迁移**：`currentResult` 全仓只写 `null`（死字段，`tests/121health-monitor.js:543` 依赖），本轮类型定为 `null` 并标 `deprecated`；`round` 恒 0、真回合数在 `battleStore.round`，保留 `number` 但标 `deprecated`，不夹带改读点（B4 单独评估）。UI 是「set 后原地改字段」的活对象，校验只在 `set` 时执行。

### 4.3 `activeBuffs`

- **形状**：`Buff[]`
- **可空**：否
- **缺省**：`[]`
- **写点**：`modules/329-buff-tools.js:32-45`（创建）；`player/503-player-core.js:145,156-157`（每回合减 `remaining` 并过滤）；`ui/715-reset-runtime.js:42`（清空）；`player/512-battle-flow.js`（选 buff 合并）
- **迁移**：历史 buff 可能缺 `target`（`modules/329-buff-tools.js:49-52` 按「无 target 归明教」），schema 把 `target` 设 optional；`remaining` 恒为有限数（永久 buff 用 `CONFIG.MAX_ROUND`，不是 `Infinity`）；`cols/rows` 仅 `HOLY_FLAME` 可有，`number[]`、1 或 2 个元素。

### 4.4 `battleHistory`

- **形状**：`RoundSnapshot[] | null`；`RoundSnapshot = { version: 1, round: number, ally: Unit[], enemy: Unit[], activeBuffs: Buff[] }`
- **可空**：是（未打完/重置后 `null`）
- **缺省**：`null`
- **写点**：`player/503-player-core.js:188-198`（每回合 push）、`:307`（收尾落库）；`ui/715-reset-runtime.js:32`（清空）
- **迁移**：`version` 已存在，直接作为升级锚点；v1 即上面形状，`ally/enemy` 是 `clone()` 快照（非活引用，可 JSON）；新增 `STORE_MIGRATIONS.battleHistory[1] = identity`，后续版本只加表不改 set。

### 4.5 `battleLog`

- **形状**：`LogEntry[]`；`LogEntry = { type: string, text: string, fx?: any[], unitUid?: string, isHealEntry?: boolean, ...任意渲染字段 }`
- **可空**：否
- **缺省**：`[]`
- **写点**：`ui/706-main-battle.js:44`（新局清）；`ui/702-main-5v5-test.js:256`（重开清）；`player/504-player-play-step.js:83-84`（push `prepareLogEntry` 输出）
- **迁移**：条目由 `render/401-fact-renderer.js` 产出，字段随 fact 类型变化 → schema 只硬校验 `type`/`text`，其余 `additionalProperties: true`，**不做字段白名单**，避免每次加渲染字段都要改 schema。

### 4.6 `battleFacts`

- **形状**：`Fact[]`；`Fact = { factType: FACT_TYPES, data: object }`
- **可空**：否
- **缺省**：`[]`
- **写点**：`player/504-player-play-step.js:48-49`（原始 fact 累积）；`ui/702-main-5v5-test.js:257`（重开清）；**主路径 `ui/706-main-battle.js:44` 未清 → 本批补**
- **迁移**：`factType` 必须命中 `infra/106` 的 `FACT_TYPES`（禁止裸字符串）；补新局清空，否则跨局累积是既有 P1 缺陷。

### 4.7 `usedBuffKeys`

- **形状**：`string[]`（元素为 `BUFF_TYPES` 值，当前只有 `carry`）
- **可空**：否
- **缺省**：`[]`
- **写点**：`ui/715-reset-runtime.js:33`（清空）；`ui/711-buff-dialog.js:98-99`（追加 `carry`）
- **迁移**：无历史形态；元素做枚举校验，非法值 warn（历史只有 `carry`，风险低）。

### 4.8 `xiaoZhaoPermanentBuffs`

- **形状**：`PermanentBuff[]`；`PermanentBuff = { key: BUFF_TYPES, name: string, target: 'ALLY', remaining: Infinity }`
- **可空**：否
- **缺省**：`[]`
- **写点**：`modules/329-buff-tools.js:120-127`（幂等追加）；`ui/715-reset-runtime.js:45`（每局清空）
- **迁移**：`remaining` 是 `Infinity`，**禁止 JSON 往返校验/深拷贝**；`target` 恒 `CAMP_TYPES.ALLY`，类型收窄为字面量；`name` 必须非空字符串。

### 4.9 `xiaoZhaoBackup`

- **形状**：`{ form: 'sister' | 'brother', unit: Unit } | null`
- **可空**：是（取出备份后立即置 `null`，防同一对象两处引用）
- **缺省**：`null`
- **写点**：`ui/706-main-battle.js:176,205-219`（切换形态写入/取出）；`ui/715-reset-runtime.js:53`（清空）
- **迁移**：无；`unit` 是活 Unit 引用，**禁止 clone/序列化**校验；`form` 只允许两个字面量。

### 4.10 `battleStore`

- **形状**：`null | { getState: Function, dispatch: Function, subscribe: Function }`；其 state 为 `{ units: Unit[], round: number }`
- **可空**：是（开局前 `null`）
- **缺省**：`null`
- **写点**：`ui/714-session-common.js:25-31`（`rebuildSessionStore`）；`player/503-player-core.js`（开战创建）；工厂 `modules/306-battle-store.js:20-35`
- **迁移**：只校验三个函数存在，**不校验内部 state**（高频 `dispatch`、活对象）；`round` 是回合数唯一真源（`modules/306-battle-store.js:52-55`），禁止再写 `UI.round`。

### 4.11 `currentBattleState`

- **形状**：`{ ally: Unit[]; enemy: Unit[] } | null`
- **可空**：是
- **缺省**：`null`
- **写点**：`core/210-battle-round.js:57`（清 `null`）、`:101`（`{ ally: state.allAllies, enemy: state.enemy }`）
- **迁移**：真值在 `_battleState`（102:108-109）；`infra/104-global-store.js:21` 的 `_state.currentBattleState` 是死副本 → **B2 删除该字段**，消除双真源；元素是引擎活数组引用，只读放行。

### 4.12 `battleResultForInfo`

- **形状**：`{ winner: '明教' | '六大派', ally: ReportUnit[], enemy: ReportUnit[] } | null`
- **可空**：是（平局/无胜者时 `buildBattleReportData` 返回 `null`）
- **缺省**：`null`
- **写点**：`player/503-player-core.js:239`；构造 `player/511-battle-report.js:19-34`
- **迁移**：`ReportUnit` 是 spread 后的 plain object（不是 Unit 实例），duck-type 校验 Unit 统计字段 + `_isDead` 必须 boolean；召唤物从结束态补入（`511:11-16`）；`winner` 只允许两个字面量，其他值必须是 `null`。

---

## 5. 分几批落地

### B1 基建（不改行为）

- 新建 `infra/107-store-schema.js`：DSL + 65 键白名单 + 53 标量键声明 + 12 结构键声明（先 `warn`）。
- `infra/104` 的 `set/setState` 接入校验；`infra/102` 的 `setBattleState` 委托校验；`updateBattleState` 改走 `set`。
- 默认值单点：`704:42`、`104:15-25` 的初始化改由 schema `default` 生成。
- 验收：`node --check` 全过；启动无报错；跑一局记录 warn 违规基线（预期非 0）。

### B2 低风险容器键（结构简单、写点少）

- 落地 5 键：`usedBuffKeys`、`xiaoZhaoPermanentBuffs`、`xiaoZhaoBackup`、`activeBuffs`、`snapshot`。
- 顺手删 `104:21` 的 `_state.currentBattleState` 死副本。
- 验收：单机跑到 3 回合 + 选一次海克斯 + 切一次小昭形态，5 键违规=0。

### B3 战斗链路键

- 落地 5 键：`battleHistory`、`battleLog`、`battleFacts`、`currentBattleState`、`battleResultForInfo`。
- 补 `ui/706-main-battle.js` 新局清 `battleFacts`；`battleHistory` 读口接 `upgradeHistory`。
- 验收：单机整局 + 联网从机 + 战报回放各一遍，5 键违规=0；`battleFacts` 不跨局累积。

### B4 收口 strict + 重键

- 落地 2 键：`battleStore`、`UI`（活引用，放最后）；`UI.currentResult/round` 标 `deprecated`。
- `_schemaMode` 默认切 `strict`；`off` 仅调试保留。
- 体检加一条「Store 写点 schema 违规=0」；同步 `02 事项待办.md`、`00 总览.md`。
- 验收：全链路违规=0；strict 下故意写错一次必须抛 `TypeError`（负向自测）。

---

## 6. 不做 / 禁止

- 不引入 zod/ajv 等运行时库（体积 + Worker 兼容）。
- 不做深拷贝、freeze、默认值自动修正（破坏「状态源唯一」与活引用语义）。
- 不把 schema 放 `core/2xx`（反向依赖）。
- 不在 `get/getState` 热路径加校验。
- 不顺手改 65 键以外的 tools/tests 专属键。
- 本阶段不修改任何生产代码。

## 7. 待确认（需拍板）

1. `UI.currentResult` / `UI.round` 是否随 B4 删除：`tests/121health-monitor.js:541-560` 仍读，建议先 `deprecated` 保留一轮。
2. `battleEvents` 事件缓冲是否纳入 schema：目前只在 102 内部、非 GlobalStore 键，本方案暂不纳入。
3. 2 个只读键（`careerLogSuppress`、`forceSoloWeakElite`）是否需要保留：保留则进白名单只读，删除则单独列清理项。

---

## 8. 落盘实施结果（2026-11-07）

状态：**B1–B4 已全部落盘**，`_schemaMode` 默认 `strict`。

| 批次 | 内容 | 改前 | 改后 |
| --- | --- | --- | --- |
| B1 | `infra/107-store-schema.js` + 104/102 接校验 | schema 覆盖 0/65；可检出违规 0（无校验） | 65/65 键、12 结构键、4 个写入口；12 键脏样本检出 **12** |
| B2 | 5 键（activeBuffs/usedBuffKeys/xiaoZhaoPermanentBuffs/xiaoZhaoBackup/snapshot） | 脏样本违规 **5** | **0** |
| B3 | 5 键（battleHistory/battleLog/battleFacts/currentBattleState/battleResultForInfo） | 脏样本违规 **5** | **0** |
| B4 | UI/battleStore + 切 strict | 脏样本违规 **2** | **0**；strict 负向自测抛 `TypeError` 通过 |

附：`GlobalStore.getState()` 初始 8 键 strict 校验 0 违规；`modules/306 createStore()` 真实 store 校验通过。

本次实际修改：

- 新增 `infra/107-store-schema.js`（65 键白名单 + DSL + 校验器 + 缺省值 + 装配自检）。
- `infra/104-global-store.js`：`set/setState/dispatch` 接校验；`updateBattleState` 改走 `setBattleState`；删除 `_state.currentBattleState` 死副本。
- `infra/102-core-utils.js`：`setBattleState` 成为 battle 桶唯一校验点。
- `ui/704-main-state.js`：结构键缺省值改取 `getStoreDefault()`。
- `ui/706-main-battle.js`：新局补清 `battleFacts`（修原 P1 跨局累积）。

未做项：`battleHistory` 全仓无读取方（只写），升级器留到首个读取方出现再建；`UI.currentResult/round` 按第 7 节建议保留 deprecated。
