# archive/ — 下线存档层

> **这个目录是干什么的**：主代码里**已经不再用了**、但**将来可能要捡回来**的东西，搬到这里存档。
> 搬进来 = 两件事同时发生：① 从主代码链上断开（不再被 import）；② 不在文件复制器的「引擎/UI/工具/体检」四个组里，
> 而是单独进「📦 存档（不随包）」组，**默认不勾选**，所以给网页端 DeepSeek 发复制包时不会带上它，包不会变大。
>
> **和 `tools/` 的区别**（这条最容易混）：
> - `tools/` = **还在用的工具**，会进复制包的「工具」组。工具组本来就很大（442 个文件里占一大块），
>   再往里塞不用的东西，以后发工具包只会更大更没必要。
> - `archive/` = **不用的存档**，独立一层、独立一组、默认不勾。要用的时候勾上，不用的时候当它不存在。

---

## 一、存档清单

| 文件 | 原位置 | 下线日期 | 为什么下线 | 怎么捡回来 |
|---|---|---|---|---|
| `712-tutorial.js` | `ui/712-tutorial.js` | 2026-11-10 | 新手引导已很少用（老板：图鉴现在不怎么用了，连带引导一起下线） | 移回 `ui/`，按下面「二」补回 6 处 import |
| `713-opening-cg.js` | `ui/713-opening-cg.js` | 2026-11-10 | 开场 CG（三幕黑屏文字）同上，属于纯演出层 | 移回 `ui/`，按下面「二」补回 1 处 import |
| `tutorial-styles.css` | `index.html` 的 `<style>` 第 351-357 行 | 2026-11-10 | 配套引导的 7 行样式，引导下线后成死样式 | 贴回 `index.html` 的 `<style>` 末尾 |
| `702-showEliteGallery.snippet.js` | `ui/702-main-5v5-test.js` 内的函数 | 2026-11-10 | 精英图鉴选人弹层原实现（含嵌页路径） | 见该文件头部「恢复步骤」 |
| `展示与CG/精英展示-04-圣火单卡旋转-GLM5.3.html` | `展示与CG/` | 2026-11-10 | 图鉴那个 524 KB 嵌页，**本次省下空间的大头** | 移回 `展示与CG/`，配合上一条 |

## 二、捡回来时要改哪些地方（**别忘，这就是你担心的那件事**）

### `712-tutorial.js`（新手引导）—— 曾被 6 处 import

| 改回哪里 | 补什么 |
|---|---|
| `ui/702-main-5v5-test.js` | `import { stepAdjustStart, stepAdjustMove, stepVoteOpen, stepCountdown, stepBuff, stepBattleStart, initTutorial, resetTutorialDone } from './712-tutorial.js'` |
| `ui/705-main-dialogs.js` | `import { stepVoteOpen, stepCountdown } from './712-tutorial.js'` |
| `ui/706-main-battle.js` | `import { stepBuff } from './712-tutorial.js'` |
| `ui/711-buff-dialog.js` | `import { stepBattleBuff } from './712-tutorial.js'` |
| `ui/716-net-session.js` | `import { stepBattleStart } from './712-tutorial.js'` |
| `ui/717-replay-entry.js` | `import { stepBattleStart } from './712-tutorial.js'` |
| **`index.html`** | 头部把「❓」按钮贴回：`<button id="btnTutorial" class="debug-toggle-btn" title="新手引导">❓</button>`（放在 `#debugToggle` 之前）。**这条最容易漏**——按钮删了但 JS 不恢复，只是少个按钮；JS 恢复但按钮没贴回，等于教程没有入口。 |
| `index.html` | 样式贴回：见 `archive/tutorial-styles.css` |

另外 `702` 的 `coverStartFlow`（开场流程）里的 `toGuide()` 要改回调用 `stepAdjustStart()`；
以及 `702` 里 `bindGridClick` 之后那段「下线存档」注释要换回：
```js
initTutorial(() => {
    resetTutorialDone();
    stepAdjustStart();
});
```
> 注意：`712` 里每个 `step*()` 函数开头都有 `if (isTutorialDone()) return;` 守卫，
> 恢复后老玩家（localStorage 里有 `ming_tutorial_done_5v5_test=1`）不会被打扰，不需要额外处理。

### `713-opening-cg.js`（开场 CG）—— 曾被 1 处 import

| 改回哪里 | 补什么 |
|---|---|
| `ui/702-main-5v5-test.js` | `import { isOpeningCgDone, showOpeningCg } from './713-opening-cg.js'` |

并把 `coverStartFlow` 改回：
```js
const toGuide = () => showEliteGallery(() => stepAdjustStart());
if (isOpeningCgDone()) { toGuide(); return; }
showOpeningCg(() => toGuide());
```

## 三、断链时用的「空实现」长什么样

为了让调用方一行都不用改（降低改错风险），主代码里原来 import 这些文件的地方，改成**就地空实现**：

```js
// 2026-11-10 下线存档：原 ui/712-tutorial.js 已搬 archive/，此处保留空实现
//   恢复方式见 archive/README.md「二」；调用点一行都不用改。
function stepAdjustStart() {}
```

这么做的理由：**调用点比 import 行多得多**（`stepBuff` 在 3 个文件里被调用 5 次），
逐个删调用要改十几处、还容易漏；换成空实现只改 import 那一行，且恢复时也只改一行。

## 四、纪律

1. **不要**把这个目录加进 `tools/`——那会让工具复制包重新变大，正是老板明确不要的。
2. **不要**在 `archive/` 里放还在用的文件。这里是「不用了」的地方，不是「先扔这」的垃圾堆。
3. 新增存档项时：① 搬文件 → ② 上表加一行（写清下线日期/原因/捡回方法）→ ③ 在 `tools/806-ai-pack-config.js` 的 `ARCHIVE_FILES` 登记 → ④ 跑 `node tests/123static-scan.js` 确认没断链。
4. 如果某个存档件**确定永久不要了**，直接删，并把上表那一行改成「已删」——不要让它在这里长毛。
