# 光明顶 5v5 - 更改履历

## V4.0.0 — 2026-06-27
### 重大重构：38 JS → 17 JS，7 HTML → 4 HTML
- **文件合并**：核心模块合并为 core/engine.js、player/player-core.js、ui/main.js、fx/fx-swap-push.js、tests/test-utils.js、tests/health-check.js
- **新增通用工具**：common/utils.js（rand、clamp、getCellElement 等）
- **文件重命名**：所有旧编号前缀文件名改为语义化名称（如 01config-5v5-test.js → core/config.js）
- **入口文件**：game.html（主游戏）、health-check.html（全面体检）、dev-tools.html（开发工具箱）、index.html（封面）

### Bug 修复
- **闪避反击黑幕遮挡**：克隆格子移除 data-flash 属性防止 !important 覆盖 z-index；禁用 CSS transition 防止火焰不同步
- **飞走模式残留**：改为 display:none 彻底隐藏；虚影模式加蓝色半透明滤镜
- **血量剧透**：syncAllyBuffFields 不再同步 hp；Carry 加血改为日志驱动；张无忌切换 HP 同步到日志播放
- **海克斯弹窗超时**：取消 30 秒自动 resolve，改为弹提示等待玩家选择
- **拒马 UI 异常**：随血量剧透修复同步解决

### 功能优化
- **初始速度 2x**：speed 默认 500，默认激活 2x 按钮
- **角色详情补全**：宋青书、周芷若、玄冥二老技能描述完整化
- **封面版本**：更新为 10 个新模块名
- **00index**：开发准则按钮文字修正，工具箱排序调整
- **文件复制器**：更新为 17 个新文件，按模块分组
- **体检报告**：新增模拟战斗回合，规则返回 null 计为"跳过"
- **战报系统**：战斗结束后弹出战报弹窗，支持属性切换、复制战报、导出 JSON

## V3.1.6 — 2026-06-26
- **封面卡住修复**：`mode-5v5-test.html` 封面按钮增加 inline 兜底点击直接隐藏，JS 增加防护性 null 检查
- **全面体检超时修复**：`37health-core.js` 修正检查顺序，先加载模块 → 点封面 → 等阵容；增加 doManualReset 兜底选关
- **文件复制器修复**：`34file-copier.html` 修正文件路径（从 `core/` → `../core/`），移除 mp3/m4a 格式
- **开发急救包修复**：`33first-aid-kit.html` 修正文件路径，增加两个新检查规则：空值检查、var 警告
- **开发工具箱新增开发准则区**：`00index.html` 开发工具箱内新增独立区域，可直接打开 README、CHANGELOG、测试运行器
- **index 绿色文字更新**：记录当前一轮所有修改内容

## V3.1.5 — 2026-06-25
- **封面黑幕加深**：`mode-5v5-test.html` cover-overlay 从 `rgba(20,15,10,0.92)` 改为 `rgba(0,0,0,0.95)`
- **封面版本显示修复**：`12main-utils.js` 动态 import 路径从 `./core/` 改为 `../core/`（相对路径基准是 JS 文件所在目录）
- **飞撞去掉灰色底座**：`17fx-crash-5v5-test.js` 克隆体背景改为透明，边框改为蓝色半透明
- **虚影加蓝色调**：`14ui-render-5v5-test.js` 和 `17fx-crash-5v5-test.js` 虚影模式从灰度改为蓝色调（sepia+hue-rotate）
- **子弹时间攻击者 z-index 修复**：`20fx-dodge-bullet.js` 攻击者克隆从 10010 提升到 10020，确保在黑幕之上
- **子弹时间暂停按钮恢复**：`20fx-dodge-bullet.js` finally 块中调用 `ctx.updateButtons()` 恢复按钮状态
- **Carry 血量 UI 同步**：`10player-core.js` syncAllyBuffFields 同步 maxHp 和 hp 到 UI 单位
- **Carry 加成排除拒马**：`04buff-system.js` computeBuffStats 中 allAllies 过滤增加 `!u.isHorse`
- **后台切回暂停**：`13main-5v5-test.js` 添加 visibilitychange 监听，页面隐藏时自动暂停游戏

## V3.1.4 — 2026-06-25
- **00index 开发工具箱默认收起**：工具箱按钮网格默认折叠，点击标题展开/收起
- **封面页模块版本显示修复**：`12main-utils.js` 动态导入路径补充子目录前缀，显示全部 25 个模块
- **防战攻击音效修复**：`28audio-manager.js` BGM 加载失败不再禁用所有音效，`sfxEnabled` 独立开关
- **Carry 日志显示加成数值**：`04buff-system.js` 日志摘要显示实际攻/防/血加成数值
- **Carry UI 立即更新**：`10player-core.js` carry buff-summary 处理时立即更新 UI 中 carry 单位属性
- **Buff 跑马灯效果修复**：`13main-5v5-test.js` 实现 drawLight/animate 函数，修复 lightsOn 永不激活的 bug
- **子弹时间多项修复**：黑幕加深至 0.92、攻击者/被攻击者增加光晕、跳过按钮定位右下角、超时延长至 30s、漫画气泡中文字体
- **胜利后格子台词**：`10player-core.js` 存活单位依次说出胜利台词
- **虚影/飞走模式修复**：飞走模式不留"空"字、虚影模式留下半透明虚影
- **日志滑动灵敏度提高**：`13main-5v5-test.js` 手动滚动阈值从 10px 降至 2px

## V3.1.3 — 2026-06-25
- **修复 Carry Buff 两大 Bug**：
  - 敌方吃到 Carry 加成：`01config-5v5-test.js` carry 配置加 `target: 'ally'`，仅己方可用
  - 张无忌血量无限叠加：`06battle-engine-core.js` Carry HP 加成改为基于 `_baseMaxHp` 计算，防止每回合膨胀
  - `06battle-engine-core.js` `allyTeamWithDead` 去重改为兼容写法（`findIndex` → `seen` 对象）
  - `04buff-system.js` `computeBuffStats` 中 carry 增加 `unit.camp === 'ally'` 防御性检查
- **修复体检路径**：`30test-runner.html` 移入 `tools/` 后，`37health-core.js` 游戏页面路径从 `tools/` 往根目录找

## V3.1.2 — 2026-06-25
- **第五关玄冥二老拆分**：鹿杖客（远程/玄冥神掌）+ 鹤笔翁（飞行/鹿角杖法）两个独立单位
- ENEMY_SQUADS[5] 人数 5→6，站位模板 random 2→3
- 新增体检规则：第五关敌方单位=6
- **修复新婚扣血 bug**：`applyXinHunDeduction` 传入 `enemySide`→`allySide`，宋青书攻击时能正确找到周芷若
- **精英怪技能描述补充**：鹿杖客/鹤笔翁/成昆详情弹窗改为双行描述
- 确认 `_kuaiLeStack` 在 `02unit.js` 构造函数和 `clone()` 中均已初始化
- 代码复制器更新：路径适配新文件夹结构，加入 35/37/38 新文件

## V3.1 — 2026-06-25
- **项目结构重组**：JS/HTML/资源文件按功能分入 `core/` `player/` `ui/` `fx/` `modules/` `tests/` `tools/` `assets/` 子文件夹
- **优化体检等待逻辑**：取消模拟 btnMain/投票/Buff 流程，改用 `doManualReset`/`window.selectStage` + `waitCtx`，解决超时
- **清空历史记录弹窗修复**：浏览器原生 `confirm` 替换为页面内自定义确认弹窗
- **下掉环境诊断页签**：游戏运行时已有内置报错弹窗，`30test-runner` 中的环境诊断页签移除（代码保留）
- **版本号统一升级**：`00index.html` → V3.1，`30test-runner.html` → V4.3，`37health-core.js` → V2.2，`38health-ui.js` → V2.2

## V3.0 — 2026-06-23
- 修复 `showDanmaku` 安全调用
- 修复 carry 阵亡加成计算
- 修复闪避血量显示

## V3.0 之前 (2026-06-20 ~ 2026-06-22)
- 体检功能上线：全面体检 + 历史记录 + 答题
- 流云身法闪避从 30% 调整为 25%，同步配置/测试/题库
- 环境诊断页签上线（后在 V3.1 下掉）
- 暴露 `window.selectStage`/`window.forceStopGame`/`window.doManualReset` 供 test runner 调用
- 单元测试扩展至 25 条
- 30test-runner 内联 JS 全部移入 38health-ui.js