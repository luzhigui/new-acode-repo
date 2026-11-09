// tests/health-rules/247-target-selectable-state.js
// 体检规则：目标可选性统一口径（跨机制一条规则）
//
// 统一口径 = 「能不能被选中」只看事实流能否证明该单位当时在候选池外：
//   ① 即时状态：目标 alive=true、非 _isDead、非蝶/蛛飞行、非蛛飞天、非附身（快照直接可读）
//   ② 女装窗口：彭莹玉「女装上阵/延长」期间，敌方候选池剔除她本人（modules/338 过滤器），
//      敌方直接选她＝违规；声明层改打队友走 phantomConfuse，不进本条。
//   ③ 布袋窗口：说不得「装进布袋」到「放生/憋死」之间目标 state._untargetable=true，
//      期间任何攻击指向它＝违规（快照不带 _untargetable，只能用宣布窗口记账）。
//   已阵亡/自伤/误伤归 182；本规则不重复，只判「候选池出池后仍被选中」。
//   免疫 fact 的精简快照无 state，跳过（宁漏勿误）。
// V2.0.1 | 2026-11-08 定位残余 3 例：声明的 targetRule（宋青书 highestHpPct / lowestHp 族）
//   在 core/212 selectAttackTarget 的 BEFORE_SELECT_TARGET 阶段从**未过滤**的 validTargets 直接
//   挑人，runTargetFilters 只在「声明未给 targetResult」的 if(!target) 分支里跑 ⇒ 女装过滤器被
//   声明层整段绕过（core/207 注释只说了「策略表不进」，没覆盖过滤器）。属主代码缺陷，
//   已登记 tests/known-transfers.md（转交态不染红）；规则判据保持硬判、不复位、不放宽。
// 窗口记账全用原始 fact：
//   女装：skillAnnounce{skillName:'双面观音'} 的 note「上阵（N 回合）」/「延长 1 回合」，按回合推算窗口尾；
//   布袋：skillAnnounce{skillName:'布袋'} 的 note「装进布袋」+ floatUid → 记到本回合+1（下回合末放出）。
export const VER = 'tests/health-rules/247-target-selectable-state.js V2.0.1';

var FULL_SNAPSHOT_FACTS = { attack: true, miss: true, dodge: true };

function badState(t) {
    var st = (t && t.state) || {};
    if (t.alive !== true) return '目标快照 alive=false';
    if (st._isDead === true) return '目标快照 _isDead=true';
    if (st._flyMode === 'butterfly') return '目标处于蝶附身态(flyMode=butterfly)';
    if (st._flyMode === 'spider') return '目标处于蛛飞态(flyMode=spider)';
    if (st._spiderFlying === true) return '目标处于蛛飞天(spiderFlying)';
    if (st._butterflyHost) return '目标处于附身态(butterflyHost)';
    return null;
}

export const rule247 = {
    group: '选靶与站位回归',
    name: '目标可选性统一口径(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        var fs = facts || [];
        if (!fs.length) return 'skip';

        var round = null;
        var crossdressEnd = Object.create(null);   // uid → 最后一个仍受女装保护的回合
        var baggedUntil = Object.create(null);     // uid → 最后一个不可选回合
        var checked = 0;
        var crossChecked = 0;
        var bagChecked = 0;
        var errs = [];

        for (var i = 0; i < fs.length; i++) {
            var f = fs[i];
            if (!f || !f.factType) continue;
            var d = f.data || {};

            if (f.factType === 'roundStart') { round = d.round; continue; }

            if (f.factType === 'skillAnnounce') {
                var note = d.note || '';
                if (d.skillName === '双面观音' && d.unitUid) {
                    if (note.indexOf('女装上阵') >= 0) {
                        var m = note.match(/（(\d+)\s*回合/);
                        var n = m ? parseInt(m[1], 10) : 1;
                        // 上阵当回合 R 记 D 回合；每回合开始先递减，R+D 回合开始时才褪装
                        //   ⇒ 最后受保护回合 = R + D - 1（不是 R + D）。
                        crossdressEnd[d.unitUid] = (round == null ? 0 : round) + n - 1;
                    }
                    // 「女装延长」只是把本回合开始的递减补回来（剩余回到 N），窗口尾不变，不改 end
                }
                if (d.skillName === '布袋' && d.floatUid) {
                    if (note.indexOf('装进布袋') >= 0) {
                        baggedUntil[d.floatUid] = (round == null ? 0 : round) + 1;
                    } else if (note.indexOf('布袋放生') >= 0 || note.indexOf('布袋憋死') >= 0) {
                        delete baggedUntil[d.floatUid];
                    }
                }
                continue;
            }

            if (!FULL_SNAPSHOT_FACTS[f.factType]) continue;
            var a = d.attacker;
            var t = d.target || d.dodger;
            if (!a || !t) continue;   // 字段缺失归 246
            checked++;

            var why = badState(t);
            if (why) {
                // 第 199 轮（夜间）合入：msg 开头补稳定中文静态前缀，供分支指纹抽取器取到可区分指纹。
                // 白天版此处是「第N回合：」动态开头 ⇒ 抽取器拿不到 ≥4 字静态前缀，分支恒「无法裁定」。
                errs.push('攻击目标不可选：' + (a.name || a.uid) + ' 的 ' + f.factType + ' 指向了 ' + (t.name || t.uid) + '：' + why);
            }

            if (t.uid != null && crossdressEnd[t.uid] != null && round != null && round <= crossdressEnd[t.uid]) {
                if (a.camp && t.camp && a.camp !== t.camp) {
                    crossChecked++;
                    errs.push('第' + round + '回合：' + (a.name || a.uid) + ' 在 ' + (t.name || t.uid) + ' 女装期直接选中了她（候选池本应剔除；声明层 targetRule 绕过过滤器，见 known-transfers）');
                }
            }

            if (t.uid != null && baggedUntil[t.uid] != null && round != null && round <= baggedUntil[t.uid]) {
                bagChecked++;
                errs.push('第' + round + '回合：' + (a.name || a.uid) + ' 攻击了仍在布袋中的 ' + (t.name || t.uid) + '（_untargetable 期间）');
            }
        }

        if (checked === 0) return 'skip';
        if (errs.length) {
            return {
                fail: true,
                msg: errs.slice(0, 3).join('；') + (errs.length > 3 ? '（共 ' + errs.length + ' 次选中不可选目标）' : '') +
                    '；女装窗口核对 ' + crossChecked + ' 次 / 布袋窗口核对 ' + bagChecked + ' 次'
            };
        }
        return { fail: false, msg: '目标可选性统一口径成立：核对 ' + checked + ' 条攻击事实（女装窗口 ' + crossChecked + ' 次 / 布袋窗口 ' + bagChecked + ' 次）' };
    }
};
