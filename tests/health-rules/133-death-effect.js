// 回归规则：死亡特效缺失 —— 目标被斩杀/白骨爪/闪避反击杀死时，日志必须带 isDead/deadFlag 死亡标记，
// 否则播放器不渲染死亡特效（刷子红色底 + 尸体不消失）。
// 已定位的三条复发路径：
//   1. 战士斩杀：core/10battle-attack.js 补丁条件 `!target.alive` 在斩杀瞬间不成立（alive 要等 resolveDeaths 才置 false），
//      导致攻击组 isDead 未标记、damage-text 无 brush-red。
//   2. 周芷若白骨爪斩杀：modules/26elite-sixsects.js 日志 `isDead:!target.alive` 在斩杀瞬间 alive 仍为 true → isDead 恒为 false。
//   3. 闪避反击击杀：player/46attack-group.js 死亡特效渲染条件带 `!entry.isDodge`，而反击组 isDodge+isDead 并存 → 特效被拦截。
// 对应已修 Bug：战士斩杀/白骨爪斩杀/闪避反击击杀 无死亡特效回归
//
// 优化（V6.1.15，第 6 趟）：修「整条规则恒空转 + 两条判据过时」—— 数据源部分与 130/134/143 同源同病。
//   实测（120 场 = 20 种子 × 1~6 关）：
//     - render/30 里 attack-group 自身**全部不带 .text**（8479/8479），而「⚔️ 战士斩杀」「🐾 九阴白骨爪斩杀」
//       这两条 info 是作为 **entries 子条目**挂在攻击组里的（共 130 条，顶层 0 条）；
//       旧写法首行 `if (!e || !e.text) continue;` 会把所有攻击组直接跳过 → 路径1 一次都跑不到。
//     - 更致命的是 `saw` 只在三条 return fail 之前被置 true，走到末尾时 saw 恒为 false
//       → 即便扫到了东西，结尾 `if (!saw) return 'skip'` 也必然返回 skip，规则**永远不会 pass**。
//   两处过时判据（不改就会在新扫描范围下天天误报，实测 57/120）：
//     - 路径2 的 `clawTargetHpAfter` 字段在现行 render/30 里**已经不存在**了（现字段是 `hpAfter` /
//       `clawTargetUid`，而「九阴白骨爪斩杀」条目只带 `isExecute` + `clawTargetUid`，实测 120 场 0 命中）
//       → 判据改为校验斩杀条目必须带 isExecute 与 clawTargetUid（播放器靠它定位尸体）。
//     - 路径3 的「isDodge + isDead 并存即报错」是**反向**的：V6.1.5 起死亡 flash 由 stage action 统一
//       （attack/dot/execute/spiderStrike/**dodge** 的 dead 都会 SET_FLASH dead + _isDead），player/46
//       的拦截条件也已从 `!entry.isDodge` 换成 `!entry.isDead`，所以「反击击杀时二者并存」正是正确状态。
//       → 判据改为校验 render/30 renderDodgeFact 的不变量：isDead 必须等价于 attackerHpAfter <= 0。
//       实测 69 次闪避反击致死全部符合，改后 0 误报。
export const VER = 'tests/health-rules/133-death-effect.js V6.1.15';
import { collectNodes } from '../122health-utils.js';

// 战报节点收集：数组元素（render/30 少数渲染函数返回数组）→ 顶层条目 → attack-group 的 entries 子条目。
// 只摊一层子条目：孙层没有 isDead/isDodge 语义，再深会重复计数。


export const rule80 = {
    group: '特效回归',
    name: '死亡特效缺失(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var saw = false; // 本场是否真扫到「斩杀」这类需要死亡特效的条目
        var nodes = collectNodes(log);
        for (var j = 0; j < nodes.length; j++) {
            var e = nodes[j];
            if (!e) continue;
            // ---- 路径1：战士斩杀 ----
            // 斩杀声明日志会作为 info 条目塞进攻击组，文本含"战士斩杀"；此时攻击组应标记 isDead。
            // 只认「战士斩杀」：它走 EFFECT_TYPES.EXECUTE，core/10 L210~214 会把 dmgResult.executeKill 置 true
            // → attack-group.isDead 必须为 true，否则 fx/88 近战撞击里的 DEAD flash 与 player/46 的
            //   战斗结束判定（entry.isDead）都不触发，尸体赖在格子上。
            // 「🐾 九阴白骨爪斩杀」**不能**一并算进来：它走的是 EFFECT_TYPES.CLAW_CHAIN（core/15 L373），
            //   而 executeKill 只认 EXECUTE 类型，所以白骨爪斩杀时攻击组 isDead 恒为 false 是设计使然 ——
            //   它的死亡特效由 render/31 独立的 CLAW_EXECUTE stage action（dead:true）保障，不复用攻击组通道。
            //   混判会天天误报（实测 120 场 11 场假红）。白骨爪那条归路径2 单独校验。
            if (e.type === 'attack-group' && !e.isDead) {
                var entries = e.entries || [];
                for (var k = 0; k < entries.length; k++) {
                    var en = entries[k];
                    if (en && typeof en.text === 'string' && en.text.indexOf('战士斩杀') !== -1) {
                        saw = true;
                        return { fail: true, msg: '复发：攻击组内出现战士斩杀但isDead未标记（战士斩杀缺死亡特效）' };
                    }
                }
            }
            // 扫到战士斩杀条目且攻击组已标记 isDead → 这条防线真正验证过一次，记 pass
            if (e.type === 'attack-group' && e.isDead) {
                var es = e.entries || [];
                for (var k2 = 0; k2 < es.length; k2++) {
                    if (es[k2] && typeof es[k2].text === 'string' && es[k2].text.indexOf('战士斩杀') !== -1) { saw = true; break; }
                }
            }
            // ---- 路径2：周芷若白骨爪斩杀 ----
            // 现行 render/30 renderClawExecuteFact 的条目形状是 { type:'info', isClawHit, clawAttackerUid,
            // clawTargetUid, isExecute }（旧字段 clawTargetHpAfter 已不存在，实测 120 场 0 命中 → 旧判据恒空转）。
            // 播放器靠 clawTargetUid 定位尸体、靠 isExecute 判定斩杀，任一缺失 → 死亡特效/尸体清理失效。
            if (typeof e.text === 'string' && e.text.indexOf('九阴白骨爪斩杀') !== -1) {
                saw = true;
                if (e.isExecute !== true) {
                    return { fail: true, msg: '复发：九阴白骨爪斩杀条目缺少 isExecute 标记（播放器判不出斩杀，死亡特效缺失）' };
                }
                if (!e.clawTargetUid) {
                    return { fail: true, msg: '复发：九阴白骨爪斩杀条目缺少 clawTargetUid（播放器定位不到尸体，尸体不消失）' };
                }
            }
            // ---- 路径3：闪避反击击杀 ----
            // render/30 renderDodgeFact 的不变量：isDead === (attackerHpAfter <= 0)，命中时 hpAfter 被强制写 0。
            // 注：不要写成「isDodge+isDead 并存即报错」—— V6.1.5 起死亡 flash 走 stage action（含 dodge 的 dead），
            // player/46 的门控也已改成 `!entry.isDead`，二者并存是现行设计的正确状态，那样写会天天误报。
            if (e.isDodge === true && typeof e.hpAfter === 'number') {
                var shouldDead = e.hpAfter <= 0;
                if (shouldDead !== (e.isDead === true)) {
                    saw = true;
                    return { fail: true, msg: '复发：闪避反击组 isDead=' + e.isDead + ' 与攻击者剩余血量 ' + e.hpAfter
                        + ' 不一致（renderDodgeFact 的 isDead 必须等价于 attackerHpAfter<=0，否则尸体不消失）' };
                }
                if (shouldDead) saw = true; // 真发生过反击击杀，这条防线本场验证过一次
            }
        }
        if (!saw) return 'skip'; // 本场没有斩杀类条目，机制未出场
        return { fail: false };
    }
};
