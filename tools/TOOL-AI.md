# TOOL-AI — 给 AI 的工具借用索引

> **写给后续 AI 助手**：本目录的工具有两类受众——给人用的浏览器页面、给你（AI）用的 node 直跑工具。
> 动手造轮子之前，**先查这张表**；多数「跑一批战斗看数据」的需求都有现成口径可借，别自写骨架。
> 借用原则：**口径必须与既有工具逐字对齐**（清场、种子公式、海克斯开关、归因方式），跑出来的数字才和已有报表可比。
> 最后核对：2026-10-08 V7.5.16（表内命令均在仓库根目录执行）。

---

## 一、AI 直接可跑（node，无需浏览器）

| 工具 | 干什么 | 怎么跑 | 借用注意 |
|---|---|---|---|
| `118-import-export-check.mjs` | 静态对账：每个 `import { 名字 }` 的具名绑定，目标文件是否真的导出 | `node tools/118-import-export-check.mjs` | 改完 import/export 后必跑，秒级 |
| `119-auto-tuner.mjs` | 平衡参数敏感度分析（单参数扰动排行榜） | `node tools/119-auto-tuner.mjs` | 动 content 数值前后跑，看敏感度方向 |
| `121-param-lab.mjs` | 参数对照实验台（固定关×固定阵容×固定海克斯×配对 seed） | `node tools/121-param-lab.mjs` | 逻辑核心在 `122-param-lab-core.js`（浏览器/node 共用），CLI 只是薄壳 |
| `106-ai-pack-config.js` | 生成给 AI 的代码包（文件清单登记处） | 由 `103-toolkit.js` 消费 | **新加/改文件号后要同步登记**，否则 AI 包漏文件 |
| `106b-server.js` | 工具链本地静态服务器 | `node tools/106b-server.js` | 浏览器工具页的本地宿主 |

## 二、AI 写探针时的标准骨架（抄这三处，别从零写）

1. **跑一整场战斗**：抄 `tools/116-role-balance-worker.js` 的 `runWholeBattle`（清场 `clearBattleGlobals` → `initBattleTeams` → `runBattle`，海克斯开关参数化）。
2. **单英雄/强制上场口径**：`GlobalStore.set('forceZhang'/'forceWei'/'forceXieXun', true)`；小昭传 `forceXiaoZhao = 'sister' | 'brother'`（不是 true！）。V7.5.16 起四路 force 全部抑制随机轮盘 = 真·单精英局。
3. **确定性回放/断言**：抄 `tests/rules-replay.mjs` 头部的环境垫片（fetch/localStorage/window mock），以及 `tests/140-baseline.js` 的 buff 注入口径（tickAndPickBuffs 本地版）。
   - 已验证示例：`node tests/140-baseline.js --check`（18 场二分红线）、`node tests/rules-replay.mjs`（120 场规则+不变量）。

## 三、浏览器页面（人用，AI 只读逻辑别执行）

`102-toolkit.html`（工具箱主页，含文件复制器 103/104、精英评测 112）、`105-shop.html`、`107-battle-log-viewer`（战报查看）、`108-hex-dashboard`（海克斯看板）、`109-role-balance`（职业平衡）、`110-role-balance-random.html`、`120-param-lab.html`（参数实验室 UI）。
- 这些页面背后的**战斗引擎逻辑在 116/122/123 worker 里**，node 侧可直接 import 复用，不用起浏览器。
- 112 的「⚔ 单英雄胜率」按钮（2026-10-08 新增）走的 `kind:'soloElite'` 就是第一节单英雄口径的 worker 版。

## 四、给 AI 的三条纪律（沿用项目总纲）

1. **数字口径先对齐再跑**：胜率类统计默认「海克斯开、胜=明教、种子公式 `seed + i*7919`」，与 112/116 一致；改口径必须在汇报里说明。
2. **样本量要够**：N<200 的胜率只能当方向参考（112 界面同款「样本少」提示）。
3. **跑完清场**：`clearBattleGlobals()` 每场之间必调（force 标志、事件总线），否则上一场的监听器会污染下一场。

---

*本文件由 AI 助手维护（冯罗伊曼，2026-10-08 建）。工具增删后请同步更新本表；表与实物不符时以实物为准并随手修正。*
