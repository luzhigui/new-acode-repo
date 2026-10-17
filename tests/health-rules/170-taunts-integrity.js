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
// V1.0.0 | 2026-10-16 第 97 轮新建（唐文亮线上事故 + 4 个同款雷同批排后立此规则长效盯守）
export const VER = 'tests/health-rules/170-taunts-integrity.js V1.0.0';

import { getGameData, loadGameData } from '../../core/01config-5v5-test.js';

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

        if (issues.length > 0) {
            return { fail: true, msg: '台词池不可达 ' + issues.length + ' 项：' + issues.join('；') };
        }
        return { fail: false, msg: '台词池双向一致（characters 配了台词的 ' + Object.keys(chars).filter(function (n) {
            var ct = chars[n] && chars[n].taunts;
            return ct && Array.isArray(ct.attack) && ct.attack.length > 0;
        }).length + ' 个角色顶层全部可达）' };
    }
};
