// 回归规则：mechanics 数据 ↔ core/18 注册表 ↔ 字段 schema 的安装期通用对账。
// 背景：mechanics 的 type 字符串散在 content JSON、core/01 DESC_TRUTH、modules/25、modules/26、modules/30 五处，
//   JSON 是数据、枚举是 JS，枚举管不住数据侧拼写；字段缺失（ratio/chance/partnerNames…）则会让机制
//   静默算出 NaN 或永不触发。core/15 V6.5.0 起安装期 validateMechanicDeclarations 同时校验 type 与字段，
//   本规则直接复用**引擎真实校验代码**对 content 全量 mechanics 跑一遍：
//   漏注册、type 改名漏跟、字段缺失/类型错、未知 targetRule，体检立即报红。
// 与战局无关：不读战报、每场均跑、只读 content（同 156）。node 侧 rules-replay 开局已 loadGameData；
//   浏览器体检页是独立模块域，这里异步预热一次 loadGameData（core/01 有缓存，只拉一次）。
export const VER = 'tests/health-rules/157-mechanic-install-reconcile.js V1.2.0';

import { getGameData, loadGameData } from '../../core/201-config-5v5-test.js';
import { buildMechanicDeclarations, validateMechanicDeclarations } from '../../core/216-skill-mechanisms.js';
// 注册副作用：全部顶层 type 的 handler 由 modules 模块顶层副作用注册进 core/18。
//   宿主（体检页/回放器）若没装它们，hasMechanicHandler 会误判"未注册"，故本规则显式 import 自足。
//   2026-11-03 由手工罗列模块改为 import 生产总入口 _mech-handler-bundle（→ modules/301-reg-mechanics.js），
//   与 ui/702 用同一套模块图：今后 301 增机制注册模块自动同步，不再逐条手维护，
//   根除「漏导某模块 ⇒ 误报未注册」一族假阳（第 132 轮 dotTick 漏 331、第 177 轮 bagTrap 漏 317 同族；
//   后者已靠本改法永久消除，无需再为单个模块补 import）。
import './_mech-handler-bundle.mjs';

// 浏览器体检域异步预热（node 回放器在跑规则前已同步加载过，这里 catch 防未捕获 rejection）
loadGameData().catch(() => {});

// 供 node 侧/其他工具直接调用：返回问题消息数组，空数组 = 全量对账通过
export function checkMechanicInstall() {
    const gd = getGameData();
    if (!gd || !gd.characters) return []; // 数据尚未加载完成，本场不判（同 156 口径）
    const problems = [];
    try {
        validateMechanicDeclarations(buildMechanicDeclarations(gd));
    } catch (e) {
        problems.push(e.message);
    }
    return problems;
}

export const rule104 = {
    group: '数值回归',
    name: 'mechanics安装对账(类型↔注册表↔字段)',
    test: function () {
        const problems = checkMechanicInstall();
        if (problems.length === 0) return { fail: false };
        // ★ 第 132 轮：同上，原 msg 取 problems[0] 无静态前缀，现已补可定位前缀
        return { fail: true, msg: '复发：mechanics安装对账失败：' + problems[0] };
    }
};
