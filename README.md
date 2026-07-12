```markdown

光明顶 5v5 对战

版本: V5.0.2 | 更新: 2026-07-09 12:10

类型: 5v5 回合制自走棋对战（明教 vs 六大派）| 九宫格站位、自动战斗、海克斯 Buff、精英技能

---

改代码展示规则（给 AI 助手用）

AI 助手在展示代码改动时必须遵守以下规则：

1. 严禁凭记忆重写代码

所有"旧代码"必须从用户提供的真实文件中逐字提取，不允许自行组织或格式化。
换行、空格、缩进必须与用户文件逐字节一致，确保用户可以直接搜索定位。
如果用户尚未提供相关代码，先请用户发函数或文件原文，不要自行编造。

旧代码片段必须包含足够的上下文（前后各保留 1~2 行），确保用户能直接搜索定位。禁止只截取中间半行，导致用户搜不到。

发代码前必须先说明原因和目的，再发新旧对比。禁止先发代码再解释。

2. 小改动（≤3 处）

必须优先发前后对比。按以下格式展示：
- 文件名
- 函数名（方便用户搜索定位）
- 旧代码（从用户原文中逐字提取）
- 新代码

如果有多处改动，必须按「一组一旧一新」的格式：
· ✅ 正确：旧A → 新A，旧B → 新B，旧C → 新C
· ❌ 错误：旧A + 旧B + 旧C → 新A + 新B + 新C

发旧代码前必须先在原文中搜索确认匹配次数。若匹配到多处，必须在代码块前注明"此段匹配到 N 处，全部替换"。

3. 改动超过 3 处

先询问用户要不要发完整代码。询问时须告知完整代码的大概字节数。

4. 发完整文件必须完整，严禁省略

如果用户同意发完整文件，必须发出文件的全部内容，不允许有任何省略表述。

5. 高效协作流程（实战验证）

当 AI 给出的"旧代码"用户搜不到时，说明格式有偏差。此时应立即切换方式：
· 用户直接贴出目标函数的完整代码
· AI 基于用户刚贴的原文，逐字提取旧代码片段做前后对比
· 这种方式准确率接近 100%，是经过多次实战验证的最可靠方法
· 禁止 AI 凭上一轮的修改记忆推测当前文件内容，必须以用户最新贴出的原文为唯一依据。

6. 诊断代码走控制台，不污染源文件

特效/动画/位置等 Bug 排查时，AI 应给出可直接粘贴到 F12 控制台的诊断脚本：
· 劫持目标函数（appendChild / dispatch / MutationObserver）
· 打印坐标、参数、元素引用
· 刷新页面即恢复，不留下任何代码改动
严禁在源代码文件中插入 `debugDot` 等临时调试元素。

7. 一次最多发 3 处改动

每次发送前后对比时，最多包含 3 处改动。发完等用户确认成功后，再继续下一批。
这样可以避免一次性信息量过大导致遗漏或混乱。

7. 错误处理双轨制

模块 import 语法错误发生在静态分析阶段，此时模块内 import 的错误捕获脚本尚未执行。
因此项目采用双轨制错误捕获：
· HTML 内联极简脚本：同步执行，捕获模块加载阶段的语法错误和 Promise 异常。
· 模块化 `modules/24error-capture.js`：加载后拦截运行时 `console.error`/`console.warn`、全局 error、Promise 异常。
两者分工明确，不可合并。

---

核心铁律 (10条)

1. 发代码必须经总座确认
   - 任何代码修改，发送前必须等总座确认，禁止擅自改动。
   - 优先发前后对比（旧代码块必须准确 → 新代码块），不要动不动发整个文件。
   - 旧代码来源铁律：必须从用户提供的真实文件中逐字提取，禁止凭记忆重写。
     如果用户搜不到 AI 给的旧代码 → 用户直接贴函数原文 → AI 基于原文做替换。
     这是经过多次实战验证的唯一可靠方式。

2. 错误可见，不靠瞎猜
   - 异常必须在页面底部红色面板显示（24error-capture.js），手机端也能看。

3. 找全链条根因，不兜底
   - Bug 修复必须先找到问题发生的全链条真正原因，从源头解决。
   - 实在找不到根因，经用户确认后才可以实施兜底方案。
   - 禁止没找到原因就直接绕过去、掩盖问题、或用"看起来修好了"的方式交差。

4. 定位优先，修复滞后
   - 先找到根因再动手。同一问题连续两次修不好，立刻停手回最小单元排查。

5. 禁止凭感觉改代码
   - 凡涉战斗规则、数值、Buff，不确定就问，严禁"猜测式修改"。

6. 函数职责单一，看动分离
   - 纯计算、纯判定、纯渲染必须隔离。播放器只消费日志，不参与计算。

7. 数据驱动视图
   - 特效走数据标记（_flash、_blocked、_flyMode 等），renderGrid 统一读取渲染。
   - 禁止特效函数直接操作 DOM。

8. 实验室代码逐行复刻
   - 验证通过的函数原样搬入，不做"等价改写"。特效参数提到文件顶部可调。

9. 交付前自审完整性
   - 所有导出函数有实际实现、文件末尾完整、无注释占位符。
   - 禁止"和之前一样"之类的省略。

10. 精英技能完全配置化
    - 参数全在 core/01config-5v5-test.js 的 ELITE_SKILLS，逻辑在 modules/23elite-skills.js。
    - UI 只读取配置，不硬编码。

---

代码交付标准 (4条)

1. 版本号统一
   格式 VX.X.X，发版前全文件对齐。当前统一 V5.0.2。

2. 大文件分片规范
   超 40000 字符自动分片，头部注明 [第 N/M 片]，结尾附确认提示。

3. 发完整文件必须更新版本号
   发完整文件时必须同步更新文件头部版本号注释和 `export const VER`，不允许出现"文件内容是新版但版本号是旧版"的情况。

---

快速开始

直接用浏览器打开 mode-5v5-test.html 即可开始游戏。

---

目录结构

```

core/
01config-5v5-test.js       - 全量配置（数值、角色、技能、BGM路径）
02unit.js                   - 战斗单位类
03battle-utils.js           - 战斗工具函数（伤害公式、站位判定等）
04buff-system.js            - Buff系统（计算加成、触发效果）
05battle-horse.js           - 拒马逻辑（生成、销毁）
06battle-engine-core.js     - 战斗核心循环（回合推进、攻击处理）
07battle-engine-5v5-test.js - 战斗引擎入口（全局函数挂载、导出）

player/
08player-text.js            - 文字播放器（逐字显示日志）
09player-buff-ui.js         - Buff弹窗与横幅
10player-core.js            - 战斗播放器核心（日志解析、动画调度）
11battle-player-5v5-test.js - 播放器入口（导出汇总）

ui/
12main-utils.js             - 主控工具函数（弹窗、版本号）
13main-5v5-test.js          - 主控模块（初始化、事件绑定）
14ui-render-5v5-test.js     - UI渲染模块（九宫格、血条、Buff图标）
39main-state.js             - 状态管理模块（全局状态读写、播放器上下文）
40main-dialogs.js           - 弹窗模块（战报弹窗、音乐设置、投票、倒计时）
41main-battle.js            - 战斗初始化模块（阵容生成、Buff选择、战斗日志）
42audio-control.js          - 音频控制模块（BGM切换、音效按钮）
43fx-trigger.js             - 特效触发模块（攻击特效调度）
44ui-controls.js            - UI控制模块（倍速系统、按钮状态）

fx/
15fx-common-5v5-test.js     - 基础特效池（飘字、弹幕、横幅）
16fx-arrows-5v5-test.js     - 飞箭特效（远程攻击、流星溅射）
17fx-crash-5v5-test.js      - 飞撞与格挡特效（近战攻击、闪避、未命中）
18fx-position-swap.js       - 换位闪烁特效
19fx-push-back.js           - 击退特效
20fx-dodge-bullet.js        - 闪避反击子弹时间特效

modules/
23elite-skills.js           - 精英技能系统（灭绝、周芷若、宋青书、成昆、玄冥二老）
24error-capture.js          - 全局错误捕获面板
28audio-manager.js          - 音频管理器（BGM切换、音效播放）

tests/
25unit-tests.js             - 核心函数单元测试
29health-rules.js           - 体检规则库
30test-runner.html          - 测试与诊断中心页面
35quiz-bank.js              - 题库
36runtime-sampler.js        - 运行时采样器
37health-core.js            - 体检核心逻辑
37health-rules/             - 细分体检规则
  60-separator.js           - 分隔线规则
  61-boneclaw.js            - 骨爪规则
  62-speed-button.js        - 倍速按钮规则
  63-carry-hp.js            - 血量承载规则
  64-horse.js               - 拒马规则
  65-swap.js                - 换位规则
  66-victory.js             - 胜利规则
  67-cloud-dodge.js         - 云体闪避规则
  68-dodge-rebound.js       - 闪避反击规则
38health-auto.js            - 自动体检
38health-monitor.js         - 体检监控
38health-ui.js              - 体检UI交互

tools/
00build-5v5.cjs             - 构建脚本（打包为单文件）
27auto-battle-utils.js      - 自动批量战斗工具（快照生成、批量战斗）
31-toolkit.html             - 开发工具箱页面
32-toolkit.js               - 工具箱主逻辑（文件复制器）
33-toolkit-more.js          - 工具箱附加工具（函数搜索、防战计算器、自动战斗）

assets/
sfx_arrow.mp3               - 远程攻击音效
sfx_fly.mp3                 - 飞行攻击音效
sfx_melee.mp3               - 近战攻击音效
sfx_xinai.mp3               - 背景音乐

根目录
00index.html                - 开发集成入口
mode-5v5-test.html          - 主游戏页面
README.md                   - 项目说明（本文件）
CHANGELOG.md                - 变更履历
kaifazhunze.md              - 开发准则
game-design.md              - 游戏设计文档

```

---

测试与体检

打开 tests/30test-runner.html 进入测试与诊断中心。

---

控制台调试

当需要诊断动画、定位、DOM 元素等问题时，直接在 F12 控制台粘贴诊断脚本运行：

```javascript
// 示例：劫持 appendChild 捕获特定元素
(function() {
  const orig = document.body.appendChild.bind(document.body);
  document.body.appendChild = function(el) {
    if (el.classList && el.classList.contains('目标类名')) {
      console.log('元素已插入:', el.getBoundingClientRect());
    }
    return orig(el);
  };
  console.log('诊断脚本已注入，触发对应操作查看输出');
})();
```
