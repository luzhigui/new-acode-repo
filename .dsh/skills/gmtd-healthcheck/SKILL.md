---
name: gmtd-healthcheck
description: 光明顶 5v5 体检迭代判据手册：五件套跑法、账本对照器口径铁律（round 续期 / 乘法乘率 / factType 守卫）、CONTRACTS 扩契约四步法、变异牙齿写法与锚点唯一性坑、版本头同步、提交纪律。要改 tests/ 下体检代码、加 fact 数值声明契约、补变异牙齿、判断"这个机制体检盯没盯上"、或体检报红/报绿要定位时加载。
whenToUse: 用户说"继续迭代体检""体检有没有盯上这个""补契约""加变异牙齿""体检报红了"，或要动 tests/stat-decl-vs-actual-check.mjs、tests/mutation-teeth.mjs、tests/rules-replay.mjs、tests/health-rules/*，或给主代码 fact 补增量字段之前。
---

# 光明顶 5v5 · 体检迭代判据手册

体检不是"跑测试"，是**给引擎装仪表盘**。核心只有一个问题：**机制改了数值，体检能不能报红？**
pass=120 / fail=0 不等于有牙——规则可能因判据写错、字段路径错而恒绿。本手册记录 55 轮攒下的判据，动手前先查，别重新踩一遍。

## 一、动手前必知（用户已明确要求的纪律）

1. **转发给主代码的需求不要落 md**，直接在对话里描述，用户自己复制转发。体检自用留痕才写 `tests/体检迭代日志.md`。
2. **主动验证是助手的事**，禁止"你去测一下"式交付；禁止边跑边修、新旧并存。
3. **零主代码是硬约束**：体检不能为了让测试过而改引擎。确实需要主代码补 fact 的，写清楚要哪个字段、哪个值、哪个位置，转给用户。
4. **主代码的 fact 字段方案要先对齐再改**：字段名 / 与现有绝对值字段的并存方式 / extract 签名，三方对齐后一次改对（出过 FLYER_REGEN"改了枚举忘改契约"的半套改动）。
5. **每次答复 2-4 条信息点**；改动量用"X 个完整文件 + Y 组前后对比"，禁"大中小"；每轮报整体完成度。

## 二、五件套（改动后必跑）

| 命令 | 作用 | 备注 |
|---|---|---|
| `node tests/123static-scan.js` | import / 注册静态扫描 | 被 `121health-monitor.js` 调用 |
| `node tests/registration-check.mjs` | 精英注册完整性 | |
| `node tests/rules-replay.mjs` | 规则回放，默认 20 种子 × 1~6 关 = **120 场** | `SEEDS=1,2 STAGES=2,4` 可缩范围 |
| `node tests/140-baseline.js --check` | 18 场种子回归闸门 | 牙齿测试里作为兜底闸门 |
| `node tests/smoke-headless.mjs` | 冒烟 | |

辅助：`node tests/stat-decl-vs-actual-check.mjs`（账本对照器）、`--scan-groups`（覆盖率权威数字）、`--fingerprint`（战斗指纹）；`node tests/mutation-teeth.mjs` + `--verify`。

## 三、账本对照器口径铁律（最容易踩的地方）

对照器走**账本模式**：读 `unit._mods[stat]` 按引用 diff，隔离某group **自身**的贡献，不受同属性其他来源（坚盾/八卦阵/苦练/破防）干扰。`groupDelta` 是核心，口径有四条硬规则：

1. **`ttl:'round'` 词条的到期不参与净贡献相减。** 词条每回合"到期 + 同值续加"跨在相邻步，旧口径把续期算成净 -V，与 fact 声明的稳态 +V 错位 → carry 曾有 **198 处假阳性（74%）**。修法：续期不参与相减，只取"当前生效(added)"。修好后 `CARRY_APPLY` 已从 `LOOSE_IDS` 移出走严格判据。
2. **乘法词条（`op:'mul'`）走 `mulSum`，不能用加法 `sum`。** 乘区共享 `(1+mulSum)`、无"加法增量"语义，`sum` 恒为 0会全判少加。契约加 `mul:true`，主循环改取 `gd.mulSum` 与 fact 声明的 ratio 比对（圣火令 `holyFlame` 是范例）。
3. **新契约必须用 `factType` 守卫，禁止靠字段形状签名区分。** `SPIDER_TRANSFORM` 发 `unitUid + atkDelta/defDelta/maxHpDelta` 与 `LION_GROW`（乃至 `BAGUA_DEF`）**形状撞车**，曾致 59 处假红。写法：`if (f.factType !== FACT_TYPES.X) continue;`。
4. **`uid` 精确归因优先于名字。** 召唤物会中途改名（幼狮→雄狮）、同场多只同名（雄狮 ×3），用名字会归错。

另：`LOOSE_IDS` 只给真跨步错位的（现为 `BREAK_DEF`、`RIGHTEOUS_FACE`）；其余走默认严格判据 `actual !== sum`，覆盖"多加 / 少加 / 完全没加"三种失效形态。降防等负值声明的契约加 `allowNeg: true` 放开 `sum>0` 闸门。

## 四、加一条契约的四步法

1. **先确认 fact 真实结构**（别猜字段名/嵌套路径）。WEI_LEECH fact 嵌在 `attack.data.entries` 里、不在 step.log 顶层；韦一笑吸血只有 dodge fact 嵌套的 `data.weiHeal`。必要时写一次性诊断脚本 dump，跑完删掉。
2. **对照 `--scan-groups` 的差集**确认这个 group 真没被盯上，看它的词条数（决定优先级）。
3. **写 CONTRACT**：`id / label / group / dir / extract(stepLog)`；加注释写明 fact 出处（文件:行号）、为什么是这个 `dir`、以及踩过的坑。
4. **先跑干净树看偏差**（诊断只观测不判定）。偏差 0 才敢开严格判据；非 0 要先想清是跨步错位还是真 bug，再决定进 `LOOSE_IDS` 还是修口径。

**判定是否值得加**：值不值得为它改对照器口径。乘法/跨步这类要先想清，否则会把假阳性引进干净树。

## 五、变异牙齿（证明契约有牙）

回答"规则到底有没有牙"。在 `tests/.mut` 临时树注入一处**已知人工缺陷**，看体检能不能报红。**没牙的契约等于装饰品。**

写法（`kind: 'ATTR'`）:
```js
{ id: 'A24', kind: 'ATTR', desc: '空列光环 atk 增量翻倍（AURA 严格判据）',
  file: 'core/11battle-round.js',
  from: "value: auraBonuses.emptyCol, ttl: 'round', group: 'aura', op: 'add' });",
  to:   "value: auraBonuses.emptyCol * 2, ttl: 'round', group: 'aura', op: 'add' });",
  multi: true },
```
**只改实际侧 addMod 的 value，fact 声明不动** —— 两边同翻就没有偏差，查不出来。

跑法（三步，别直接 `node tests/mutation-teeth.mjs`）：
```bash
node tests/mutation-teeth.mjs --verify                    # 先验锚点
node tests/mutation-teeth.mjs --emit-prep > tests/.mut/prep.sh && bash tests/.mut/prep.sh
node tests/mutation-teeth.mjs --emit-run  > tests/.mut/run.sh  && bash tests/.mut/run.sh  # 约 8 分钟，放后台
node tests/mutation-teeth.mjs --report
```

### 锚点唯一性（今天连踩两次）
- **harness 逐行匹配，多行锚点无效**（含 `\n` 的 from 一律 0 处）。
- 同文本多处时：① 用缩进差异区分（`_Normal` 分支 8 空格 vs `_Brother` 4 空格）；② 或 `multi: true`（两处同改，"普遍翻倍"也是合法变异）。
- 变异前必须 `git diff --stat core/ modules/` 确认为空；**验完立刻 `git checkout --` 回滚**，不留残留。

### harness 的统计正则坑
`parseBlock` 用正则数stat-decl 汇总行的命中数。曾与实际文案「✗ 检出重复应用 N 处」不匹配，导致**所有严格命中契约被错判「仅基线兜底」**。改了 stat-decl 汇总文案要同步这里，否则牙口结论失真。

## 六、覆盖率

`node tests/stat-decl-vs-actual-check.mjs --scan-groups` → 权威数字 `已绑定 N 个 / 未覆盖 M 个`。
- 账本里真实出现过（改 atk/def/maxHp）的 group 都要有契约。**第 54 轮达成 22/22 零盲区。**
- 结构性稀有（`xiaoZhaoCarry` 需特定海克斯、560 场零触发）可维持基线兜底，但要在日志里写明是"暂不处理"还是"待补"。

## 七、版本头与提交纪律

1. 改测试文件必须**同步两处**：文件头注释 `// V2.x.0 | 日期 第 N 轮：...` + `export const VER = '...'`。只改一处会导致下次迭代找不到基准。
2. **`tests/体检给主代码的需求.md` 已被删**（用户要求转发不落md）。
3. **提交要显式指定文件**：`git commit tests/xxx.mjs tests/yyy.mjs -m "..."`。工作树常有主代码开发者/用户在改的混入文件，用路径式提交避免夹带。
4. 提交信息用中文，正文分条写清「改了什么 / 为什么 / 验证结论」。
5. 迭代日志 `tests/体检迭代日志.md` 追加每轮：改了什么、覆盖率变化、牙口结论、遗留盲区。

## 八、常见故障速查

| 现象 | 根因 | 处理 |
|---|---|---|
| 大量假红 | 新契约靠字段形状区分，与别的 fact 撞车 | 加 `factType` 守卫 |
| 声明>0 实际 0 / 少加 | round 续期被算成净 -V | 修 `groupDelta` 续期口径 |
| 全判少加（乘法词条） | 用了加法 `sum`，乘区恒 0 | 加 `mulSum` + 契约 `mul:true` |
| fact 明明发了却抽不到 | 嵌在 `attack.data.entries` 等嵌套里 | extract 递归扫 `f.data.entries` / `f.entries` |
| 同名多单位归错 | 用名字归因 | 改 `uid` 归因 |
| 契约恒绿、变异抓不到 | 变异锚点静默失效（树=干净树） | `--verify` 看命中处数 |
| 牙齿全判「仅基线兜底」 | harness 正则与 stat-decl 文案不匹配 | 对齐 `parseBlock` 正则 |
| 多行锚点 0 处 | harness 只逐行匹配 | 缩进区分 或 `multi:true` |