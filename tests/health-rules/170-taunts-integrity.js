// 回归规则：台词池双向一致性（taunts integrity）—— 防「配了台词但引擎读不到」运行时崩
// 背景（2026-10-16 线上事故）：tools/116 平衡 worker 报「台词池缺失: 唐文亮」崩进程。
//   根因：引擎 getRandomTaunt（core/03 L146-154）只读**顶层 taunts**（按角色名查专用池 →
//   回退职业池 taunts[role]）；而唐文亮的 taunts 配在 characters['唐文亮'].taunts（引擎不读该层），
//   其 role='标枪' 是自定义职业、四大职业池（战士/防战/远程/飞行）兜底不到 ⇒ 两层皆空直接 throw。
//   同款未爆雷排查：何太冲/杨逍/殷天正/反伤弟子的 taunts 同样只配在 characters 里、顶层没有，
//   靠职业池兜底没崩——一旦兜底链变化（改 role/删职业池/新自定义职业）就会炸，已同批补齐顶层。
// 判据（双向，宁严勿漏）：
//   ① characters[name].taunts.attack 非空 ⇒ 顶层 taunts[name].attack 必须非空
//      （角色配了台词，引擎就必须读得到——这是唐文亮事故的精确形态）；
//   ② 顶层 taunts[name] 存在但 attack 为空数组 ⇒ 报（配了空池 = 引擎查得到也抛错）。
// 不查的（防误报）：characters 里没配 taunts 的角色（张三丰/小昭）——靠职业池兜底是合法路径，
//   其 role 解析在引擎侧（29battle-init/encounters），本规则不反推；普通弟子（少林圆真等）
//   不进 characters，同样只走职业池，不在本规则范围。
// 与战局无关：不读战报、每场均跑、只读 content（同 157）。node 侧 rules-replay 开局已 loadGameData；
//   浏览器体检页是独立模块域，这里异步预热一次 loadGameData（core/01 有缓存，只拉一次）。
//   ③ 职业池覆盖（2026-10-27 夜间第 140 轮补，P0 取证后立）：ROLE_TYPES 的每个职业值 ∪
//      content.roles 的每个键，顶层 taunts 都必须有非空 attack 与 kill 池 —— 任何单位 role 落到
//      该职业、又无同名专用池时，引擎就回退职业池；池不存在即当场 throw「台词池缺失」崩进程。
//      立这条的由头：上游 5818419a 把小昭·姊身份职业改成「蝴蝶」，content 只补了 roles.蝴蝶，
//      **漏补 taunts.蝴蝶**，于是小昭·姊一开口就 throw（fuzz 2100 场实测 3 类硬伤全是这一条，
//      账本对照器也因此整体崩掉）。而①②都盯的是"角色名"这一层，职业层完全没人守 —— 覆盖面有洞。
//      同款未爆雷一并照出：content.roles 里的「标枪」同样没有顶层池，只因唐文亮有专用池才没炸。
// V1.1.0 | 2026-10-27 夜间第 140 轮新增判据③（职业池覆盖：ROLE_TYPES ∪ content.roles → 顶层 taunts
//   attack+kill 双向非空）+ 自证断言（职业清单 ≥5 种，抽取器腐烂则报，不许恒绿）
// V1.0.0 | 2026-10-16 第 97 轮新建（唐文亮线上事故 + 4 个同款雷同批排后立此规则长效盯守）
export const VER = 'tests/health-rules/170-taunts-integrity.js V1.1.0';

import { getGameData, loadGameData } from '../../core/01config-5v5-test.js';
// 职业清单的唯一来源：infra/56 的 ROLE_TYPES 本体（不另抄一份；谁加职业这里自动跟着长）
import { ROLE_TYPES } from '../../infra/56-battle-enums.js';

// 浏览器体检域异步预热（node 回放器在跑规则前已同步加载过，这里 catch 防未捕获 rejection）
loadGameData().catch(() => { });

export const rule170 = {
    group: '内容数据对账',
    name: '台词池双向一致性(taunts)',
    test: function (ctx, log) {
        var data;
        try {
            data = getGameData();
        } catch (e) {
            return { fail: false, skip: true, msg: 'loadGameData 未就绪，跳过' };
        }
        var chars = data.characters || {};
        var taunts = data.taunts || {};
        var issues = [];

        for (var name in chars) {
            if (!Object.prototype.hasOwnProperty.call(chars, name)) continue;
            var c = chars[name];
            if (!c || typeof c !== 'object') continue;
            var charTaunts = c.taunts;
            if (!charTaunts || !Array.isArray(charTaunts.attack) || charTaunts.attack.length === 0) continue;
            // 判据①：角色配了台词 ⇒ 顶层必须有同名专用池且 attack 非空
            var topEntry = taunts[name];
            if (!topEntry || !Array.isArray(topEntry.attack) || topEntry.attack.length === 0) {
                issues.push(name + '：taunts 配在 characters 里但顶层 taunts 无对应 attack 池'
                    + '（引擎只读顶层，按名查→回退职业池；自定义职业或职业池缺失即运行时 throw）');
            }
        }

        // 判据②：顶层有 key 但 attack 是空数组（查得到也抛错）
        for (var tName in taunts) {
            if (!Object.prototype.hasOwnProperty.call(taunts, tName)) continue;
            var t = taunts[tName];
            if (!t || typeof t !== 'object') continue;
            if (tName === 'zhangNear' || tName === 'def' || tName === 'hp') continue; // 特殊结构键，非角色/职业池
            if (!Array.isArray(t.attack) || t.attack.length === 0) {
                issues.push(tName + '：顶层 taunts 池存在但 attack 为空数组（getRandomTaunt 取到空池仍抛「台词池缺失」）');
            }
        }

        // 判据③：职业池覆盖 —— ROLE_TYPES 值 ∪ content.roles 键，顶层必须有非空 attack 与 kill 池
        var roleNames = [];
        try {
            for (var rk in ROLE_TYPES) {
                if (!Object.prototype.hasOwnProperty.call(ROLE_TYPES, rk)) continue;
                if (ROLE_TYPES[rk] && roleNames.indexOf(ROLE_TYPES[rk]) < 0) roleNames.push(ROLE_TYPES[rk]);
            }
        } catch (e) { /* ROLE_TYPES 取不到由自证断言接管 */ }
        var rolesData = data.roles || {};
        for (var rname in rolesData) {
            if (!Object.prototype.hasOwnProperty.call(rolesData, rname)) continue;
            if (roleNames.indexOf(rname) < 0) roleNames.push(rname);
        }
        // 自证：职业清单解析不到 5 种 ⇒ 抽取器已腐烂，判据③会恒绿放过新职业，先把自己报红
        if (roleNames.length < 5) {
            issues.push('（自证）职业清单只解析到 ' + roleNames.length + ' 种（下限 5）'
                + ' —— 判据③抽取器已腐烂，新加职业无台词池将查不出');
        }
        for (var ri = 0; ri < roleNames.length; ri++) {
            var rn = roleNames[ri];
            var rp = taunts[rn];
            if (!rp) {
                issues.push(rn + '：职业「' + rn + '」在顶层 taunts 无池'
                    + '（单位 role 为该职业且无同名专用池 ⇒ getRandomTaunt/getKillTaunt 直接 throw「台词池缺失」崩进程）');
                continue;
            }
            if (!Array.isArray(rp.attack) || rp.attack.length === 0) {
                issues.push(rn + '：职业「' + rn + '」顶层 taunts 的 attack 为空（getRandomTaunt 取到空池仍抛）');
            }
            if (!Array.isArray(rp.kill) || rp.kill.length === 0) {
                issues.push(rn + '：职业「' + rn + '」顶层 taunts 的 kill 为空（getKillTaunt 取到空池仍抛）');
            }
        }

        if (issues.length > 0) {
            return { fail: true, msg: '台词池不可达 ' + issues.length + ' 项：' + issues.join('；') };
        }
        return { fail: false, msg: '台词池双向一致（characters 配了台词的 ' + Object.keys(chars).filter(function (n) {
            var ct = chars[n] && chars[n].taunts;
            return ct && Array.isArray(ct.attack) && ct.attack.length > 0;
        }).length + ' 个角色顶层全部可达）' };
    }
};
