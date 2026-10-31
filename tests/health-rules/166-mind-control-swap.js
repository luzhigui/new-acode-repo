// 回归规则：惑人心智（mindControl）换位链路 — 矩阵「剩余待攻」pos/状态类最后一项。
// 机制源（core/14buff-effects.js applyMindControlCore，core/04buff-system.js L254-268 注册 AFTER_ATTACK）：
//   - 门控：unit.alive + 队伍带 MIND_CONTROL buff + unit 是己方最前排（pos 最小、非拒马存活单位）
//     —— AFTER_ATTACK 每次攻击都跑 handler，但非最前排单位在 core 内被 return，不产生任何条目；
//   - 一次完整执行 = 「敌方一条 + 己方一条」（SWAP 或 FAIL），中间夹两条恒空的 MIND_CONTROL_BANNER
//     （render/35 L99 renderMindControlBannerFact 恒返回 null——有意设计，横幅在 stageAction 显示），
//     故文本流里 ENEMY 结果与 ALLY 结果必然相邻；
//   - 敌方概率 = CONFIG.BUFFS.mindControl.enemySwapProb×100（0.8→80；小昭·姊在场走 hexEnhance 0.95→95），
//     己方概率 = allySwapProb×100（0.4→40；增强 0.50→50）；
//   - 实际换位由 shuffleThreeSlots 对「最前排 3 槽」洗牌，swaps 为变长数组（长度 0~3），
//     core 逐单位 swapUnitPositions + SWAP fact；roll 超 → FAIL(未触发)；可用单位 <2 → FAIL(可用单位不足)。
// 为什么值得盯：
//   1) 换位直接改写双方站位，而站位决定行动序/carry/圣火令行列——一次错换静默改变整局节奏；
//   2) BANNER 恒空 ⇒ 文本通道只剩 SWAP/FAIL 两条，配对断链（如一侧分支被误删）在战报上完全看不出来；
//   3) swapUnitPositions 与实际 pos 写入曾经分家过（V6.1.3 参数三源收敛那一轮改过 core/14 多处），
//     需要「宣告位置 vs 后续真实站位」对账——与 138 乘风击退同款病灶。
// 五条复发信号：
//   1) 配对断链：一条「敌方」惑心条目之后紧邻的惑心条目不是「己方」（或首条惑心条目就是「己方」）
//      —— 一侧分支漏 push / 两侧顺序被改写；
//   2) SWAP 自洽破坏：任一条 swap 的 fromPos===toPos（自己换自己）、位置越界 1~9、
//      或同一条目内两条 swap 共用来源位/目标位（洗牌退化）；
//   3) FAIL 理由越界：不在 {未触发, 可用单位不足, 无变化}（main 当前合法理由集；无变化 = roll 命中但洗牌净位移为 0）—— 渲染/机制漂移；
//   4) 文本格式漂移：渲染模板改动导致字段解析不到（判据 1/2/5 的前提失效，显式报出而非静默 skip）；
//   5) 宣告位置未生效：每条 swap 宣告 fromPos→toPos，被下一次换位打断前，该单位后续出场快照
//      从未落到 toPos（复用 138 V6.1.12 口径：一拍时滞内任一快照命中即算生效；无后续快照不报）。
// 误报规避：本场没有惑心条目直接 skip（仅在抽到「惑人心智」团队 Buff 时产生）。
export const VER = 'tests/health-rules/166-mind-control-swap.js V6.1.8';
// V6.1.8（2026-10-31 第 145 轮续）：补静默位移白名单第 6 类——圣火不熄复活落格被占时的静默改位。
//   core/04buff-system.js reviveHolyFireUnit 在复活落格被活人占时走 u.pos=findFreePos（≠原格）直接赋值，
//   而 SKILL_ANNOUNCE.note 写「原地复活」掩盖了这次改位；原 isSilentRelocate ①②③④⑤ 全认不出，
//   导致判据5 把「惑心换到 toPos→阵亡→圣火不熄静默挪走」误判成「换位没生效」（实证 明教弟子1→5号位）。
//   今在 122health-utils.js isSilentRelocate 加 ⑥：SKILL_ANNOUNCE 且 skillName='圣火不熄' 且点名该单位
//   ⇒ 视为合法改写、放弃本条归因（宁漏勿误）。swap 真实失效的 render/机制漂移极罕见，且本分支仅在
//   "单位从未在 toPos 被观测到"时触发，不掩盖真 bug。机制清单见 122health-utils.js 调用点登记。
// V6.1.7（2026-10-30 第 144 轮续）：适配 main 渲染模板漂移 —— 惑心换位由「2 单位互换位置」
//   升级为「0~3 单位位置重排」（core/14 shuffleThreeSlots，fact.data.swaps 为变长数组）。
//   渲染文本由 `🌀 惑人心智敌方：A号位X与B号位Y互换位置！` 变为
//   `<span class="gold">🌀 惑人心智敌方：A号位X→C号位、B号位Y→D号位 位置重排！</span>`（外包 HTML + 箭头）。
//   旧正则只认 2 单位 `与…互换位置`，遇新格式直接判据4「格式无法解析」误报。
//   今重写：① 先 strip HTML；② 同时兼容新（位置重排/箭头）与旧（互换位置）两种文本；
//   ③ 落地/自洽判据从「固定 uidA/uidB/oldPosA/oldPosB」改为遍历 swaps 数组（每单位 fromPos→toPos），
//      uid 优先取 entry.swaps[i].uid，回退按名在对应阵营快照定位；同名不唯一则跳过该单位落位（宁漏勿误）。
//   机制本体未改（仍是 AFTER_ATTACK 每次攻击跑 handler、非最前排静默 return），故 5 条信号语义不变。

// V6.1.5（2026-10-23 第 124 轮）：位置改写白名单收口为 tests/122health-utils.js 的 isSilentRelocate
//   （138 与 166 此前各写一份，重复即埋雷）。同时把「落位号证据」从唐文亮冲刺专属扩成通用判据——
//   合并上游 main 后复现实证 seed=19 stage=3：第 144 条惑心把何太冲（u7）从 1 号位换到 8 号位
//   （对照方静照 u8 后续快照 @1 证明换位确已落地），第 165 条「☯ 两仪互换：昆仑弟子 ⇄ 何太冲
//   （互换职业与位置）」走 swapUnitPositions 把他挪到 2 号位，此后 4 次出场全在 2 号位 ⇒ 旧白名单
//   只认「冲刺·七伤齐发」，把上游新机制误判成「惑心换位没生效」。今后再有「改站位却不发位移事件」
//   的机制，一律登记到 122health-utils.js 的调用点清单与判据里。
// 位置改写白名单（V6.1.3 立）：战报里能改写站位、但**不发** buff-push/buff-swap 的机制。
//   命中即视为该单位位置被合法改写，放弃本条判据 5（宁漏勿误）。机制清单与判据见 122health-utils.js。
//     - 冲刺·七伤齐发：唐文亮强推挤压（moveUnitPosition，tangwenliang.js L115 区）
//     - 红血：撤退至  ：何太冲低血撤退（moveUnitPosition，hetaichong.js L128）
//     - 蓄意轰拳     ：寒离飒崩飞/轰飞（moveUnitPosition + WIND_ASSAULT_PUSH fact，hanlisa.js L294/305）
//     - 两仪互换     ：何太冲/昆仑弟子红血互换职业+位置（swapUnitPositions + SKILL_ANNOUNCE，hetaichong.js L156）
//     - 标枪前压     ：（core/10battle-attack.js L52）
//     - 压进         ：远程够不着目标向前压（core/10battle-attack.js L55，skillName '突进'）
//     - 圣火不熄     ：复活落格被占静默改位（core/04:624 直接 u.pos=findFreePos，note 写「原地复活」掩盖；第 145 轮续补 ⑥）
import { isSilentRelocate } from '../122health-utils.js';

function stripTags(s) { return (s == null ? '' : String(s)).replace(/<[^>]+>/g, ''); }

function uidByName(name, pools) {
    if (!name) return null;
    var found = null, cnt = 0;
    for (var p = 0; p < pools.length; p++) {
        var arr = pools[p] || [];
        for (var k = 0; k < arr.length; k++) {
            if (arr[k] && arr[k].name === name) { found = arr[k].uid; cnt++; }
        }
    }
    return cnt === 1 ? found : null;
}

function isImmune(uid, pools) {
    if (uid == null) return false;
    for (var p = 0; p < pools.length; p++) {
        var arr = pools[p] || [];
        for (var k = 0; k < arr.length; k++) {
            var u = arr[k];
            if (u && u.uid === uid && u.state && u.state._ctrlImmune) return true;
        }
    }
    return false;
}

export const rule113 = {
    group: '技能效果回归',
    name: '惑心换位配对与落地(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE) {
        var n = log ? log.length : 0;
        if (n === 0) return 'skip';

        // 按阵营取快照池（惑心 swap 单位必在该 side 的队伍里）
        var poolsForSide = function (side) {
            return side === '敌方' ? [beforeE || [], afterE || []] : [beforeA || [], afterA || []];
        };
        var immPools = [beforeA || [], beforeE || [], afterA || [], afterE || []];

        var mc = [];
        for (var i = 0; i < n; i++) {
            var e = log[i];
            if (!e || typeof e.text !== 'string') continue;
            if (e.text.indexOf('惑人心智') === -1) continue;
            if (e.text.indexOf('惑人心智：') !== -1 && e.text.indexOf('扰乱') !== -1) continue; // 宣告横幅

            var txt = stripTags(e.text);
            var swaps = [], isSwap = false, failReason = null, side = null;

            // 新格式：位置重排（变长，箭头连接，可能多单位）
            var mNew = txt.match(/🌀\s*惑人心智(敌方|己方)：(.+?) 位置重排！/);
            // 旧格式：2 单位互换位置 / 换位失败（reason）
            var mOld = txt.match(/🌀\s*惑人心智(敌方|己方)：(?:(\d+)号位(\S+)与(\d+)号位(\S+)互换位置！|换位失败（(\S+)）)/);

            if (mNew) {
                side = mNew[1];
                var body = mNew[2];
                var re = /(\d+)号位(\S+?)→(\d+)号位/g, mm;
                while ((mm = re.exec(body)) !== null) {
                    swaps.push({ fromPos: parseInt(mm[1], 10), name: mm[2], toPos: parseInt(mm[3], 10) });
                }
                isSwap = swaps.length > 0;
            } else if (mOld) {
                side = mOld[1];
                if (mOld[2]) { // 旧 2 单位互换：A↔B
                    swaps.push({ fromPos: parseInt(mOld[2], 10), name: mOld[3], toPos: parseInt(mOld[4], 10) });
                    swaps.push({ fromPos: parseInt(mOld[4], 10), name: mOld[5], toPos: parseInt(mOld[2], 10) });
                    isSwap = true;
                } else { failReason = mOld[6]; isSwap = false; }
            } else {
                // 判据 4：惑心条目存在但格式解析不了（渲染模板漂移）——显式报出
                return { fail: true, msg: '复发：惑心条目文本格式无法解析（渲染模板漂移）：' + e.text.slice(0, 80) };
            }

            // uid 解析：优先 entry.swaps[i].uid（渲染原样带回 fact.data.swaps），回退按名在对应阵营定位
            var entrySwaps = (e.swaps && Array.isArray(e.swaps)) ? e.swaps : null;
            for (var si = 0; si < swaps.length; si++) {
                if (entrySwaps && entrySwaps[si] && entrySwaps[si].uid) swaps[si].uid = entrySwaps[si].uid;
                else swaps[si].uid = uidByName(swaps[si].name, poolsForSide(side));
            }
            mc.push({ idx: i, entry: e, side: side, isSwap: isSwap, failReason: failReason, swaps: swaps });
        }
        if (mc.length === 0) return 'skip'; // 本场没抽到「惑人心智」团队 Buff

        var problems = [];

        // 判据 1：配对完整性 —— 一次执行 = 敌方一条 + 己方一条，两条必然相邻
        for (var k = 0; k < mc.length; k++) {
            if (mc[k].side === '敌方') {
                if (k + 1 >= mc.length || mc[k + 1].side !== '己方') {
                    problems.push('第' + (k + 1) + '条惑心（敌方）之后未紧跟己方条目（一次执行被截断/两侧顺序改写）');
                }
            } else { // 己方
                if (k === 0 || mc[k - 1].side !== '敌方') {
                    problems.push('第' + (k + 1) + '条惑心（己方）之前不是敌方条目（首条即为己方/敌方条目丢失）');
                }
            }
        }

        for (var k2 = 0; k2 < mc.length; k2++) {
            var it = mc[k2];
            var tag = '第' + (k2 + 1) + '条惑心(' + it.side + ')';
            if (!it.isSwap) {
                // 判据 3：FAIL 理由合法性。main 当前合法理由 = {未触发, 无变化}（2026-10-30 第 144 轮续确认：
                //   core/14 applyMindControlCore 当 roll 命中但 shuffleThreeSlots 净位移为 0 时发 '无变化'，
                //   取代旧注释里的 '可用单位不足'；后者保留以兼容旧回放）。其它任何理由一律判越界。
                if (it.failReason !== '未触发' && it.failReason !== '可用单位不足' && it.failReason !== '无变化') {
                    problems.push(tag + ' FAIL 理由越界：「' + it.failReason + '」（应为 未触发/可用单位不足/无变化）');
                }
                continue;
            }

            // 判据 2：每条 swap 自洽 + 同条目内来源/目标位不冲突
            var seenFrom = {}, seenTo = {};
            for (var w = 0; w < it.swaps.length; w++) {
                var sw = it.swaps[w];
                if (!sw.name) problems.push(tag + ' SWAP 单位名为空');
                if (!(sw.fromPos >= 1 && sw.fromPos <= 9) || !(sw.toPos >= 1 && sw.toPos <= 9)) {
                    problems.push(tag + ' SWAP 位置越界：' + sw.fromPos + '→' + sw.toPos + '（应在 1~9）');
                }
                // 注：fromPos===toPos 不再是缺陷 —— 3 格随机重排允许「不动点」（某单位恰好停在原位），
                //   属随机置换的正常结果（core/14 shuffleThreeSlots 在洗牌净位移为 0 时返回 0 变化；单槽
                //   不动点也合法）。真正的错位（单位被宣告到 toPos 却落到别处）由判据5 落地核查捕获。
                //   （2026-10-30 第 144 轮续：实测 小昭·妹 4→4 即此不动点，旧判据误报自己换自己。）
                if (sw.fromPos != null) { if (seenFrom[sw.fromPos]) problems.push(tag + ' 多条 swap 共用来源位 ' + sw.fromPos + '号位'); else seenFrom[sw.fromPos] = 1; }
                if (sw.toPos != null) { if (seenTo[sw.toPos]) problems.push(tag + ' 多条 swap 共用目标位 ' + sw.toPos + '号位'); else seenTo[sw.toPos] = 1; }
            }

            // 判据 5：宣告位置真实生效（复用 138 V6.1.12 口径，逐单位 fromPos→toPos）
            //   控制位移免疫方参与的换位不落地——swapUnitPositions（core/13battle-shared.js L135）任一方
            //   state._ctrlImmune 即静默 return（不动、不发 buff-swap），而 core/14 仍发 SWAP 宣告 ⇒
            //   「宣告换了但没换」是该免疫的**设计后果**（寒离飒·开局常驻，modules/27 L30-31；引擎侧
            //   宣告未跟上免疫的问题已上报主代码）。免疫状态在开局快照里可查，规则侧精确识别后跳过。
            for (var w3 = 0; w3 < it.swaps.length; w3++) {
                var swp = it.swaps[w3];
                if (swp.uid == null) continue; // 同名不唯一/定位不到 ⇒ 宁漏勿误
                if (isImmune(swp.uid, immPools)) continue; // 免疫方不落地，跳过判据5

                var exp = { uid: swp.uid, pos: swp.toPos, name: swp.name };
                var seen = 0, hit = false;
                for (var r = it.idx + 1; r < n; r++) {
                    var a = log[r];
                    if (!a || a.type !== 'attack-group' || !a._fxSnapshot) continue;
                    var actual = null;
                    if (a.uidA === exp.uid) actual = a._fxSnapshot.attackerPos;
                    else if (a.uidD === exp.uid) actual = a._fxSnapshot.defenderPos;
                    if (actual == null) continue;
                    // 被下一次换位（含乘风击退 buff-push / 惑心 buff-swap / 其它静默改写站位机制）打断则放弃本条
                    var interrupted = false;
                    for (var s = it.idx + 1; s < r; s++) {
                        var mid = log[s];
                        if (!mid) continue;
                        if (isSilentRelocate(mid, exp)) { interrupted = true; break; }
                        if (mid.type === 'buff-push' || mid.type === 'buff-swap') {
                            if (mid.pushTargetUid === exp.uid || mid.behindUid === exp.uid ||
                                mid.uidA === exp.uid || mid.uidB === exp.uid) { interrupted = true; break; }
                        }
                    }
                    if (interrupted) break;
                    seen++;
                    if (actual === exp.pos) { hit = true; break; }
                }
                if (seen > 0 && !hit) {
                    problems.push(tag + ' ' + exp.name + ' 换位后位置未生效：预期' + exp.pos + '号位（' + seen + '次出场均未落到该位）');
                }
                // 终局快照兜底 —— 原口径只认「后续 attack-group 的 _fxSnapshot」，换位单位若此后再没有带快照的
                //   出场（战斗即终 / 未再出手），seen=0 不报 ⇒ 「宣告位置造假」类变异恒哑火。补：无后续快照、
                //   且自换位起全程无 buff-push/buff-swap/静默改写打断记录时，终局站位应等于宣告目标位；不等即报。
                if (seen === 0) {
                    var interruptedAll = false;
                    for (var s2 = it.idx + 1; s2 < n; s2++) {
                        var mid2 = log[s2];
                        if (!mid2) continue;
                        if (isSilentRelocate(mid2, exp)) { interruptedAll = true; break; }
                        if (mid2.type === 'buff-push' || mid2.type === 'buff-swap') {
                            if (mid2.pushTargetUid === exp.uid || mid2.behindUid === exp.uid ||
                                mid2.uidA === exp.uid || mid2.uidB === exp.uid) { interruptedAll = true; break; }
                        }
                    }
                    if (!interruptedAll) {
                        var endU = null;
                        var pools93 = [afterA || [], afterE || []];
                        for (var p93 = 0; p93 < pools93.length && !endU; p93++) {
                            var arr93 = pools93[p93] || [];
                            for (var u93 = 0; u93 < arr93.length; u93++) {
                                if (arr93[u93] && arr93[u93].uid === exp.uid) { endU = arr93[u93]; break; }
                            }
                        }
                        if (endU && typeof endU.pos === 'number' && endU.pos !== exp.pos) {
                            problems.push(tag + ' ' + exp.name + ' 换位后位置未生效：预期' + exp.pos
                                + '号位（无后续出场快照，终局站位为 ' + endU.pos + '）');
                        }
                    }
                }
            }
        }

        if (problems.length > 0) return { fail: true, msg: '复发：惑心换位异常 — ' + problems.slice(0, 3).join(' | ') };
        return { fail: false };
    }
};
