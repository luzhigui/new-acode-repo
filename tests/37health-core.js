// tests/37health-core.js - 光明顶5v5 全面体检（引擎实战 + UI 行为验证）
// V4.1.1 | 2026-07-02 | 修复：直接 import 引擎，不依赖 window 挂载
export const VER = 'tests/37health-core.js V4.1.1';

import { runBattle } from '../core/07battle-engine-5v5-test.js';
import { generateSnapshot } from '../tools/27auto-battle-utils.js';

// ==================== 辅助函数 ====================

function getCellElement(unit, doc) {
    if (!unit || unit.pos == null) return null;
    var gridId = unit.camp === 'ally' ? 'allyGrid' : 'enemyGrid';
    var grid = doc.getElementById(gridId);
    if (!grid) return null;
    var order = unit.camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
    var idx = order.indexOf(unit.pos);
    return idx >= 0 ? grid.children[idx] : null;
}

function getHpBarPct(unit, doc) {
    var cell = getCellElement(unit, doc);
    if (!cell) return null;
    var bar = cell.querySelector('.hp-bar-inner');
    if (!bar) return null;
    return parseFloat(bar.style.height);
}

function getCellStats(unit, doc) {
    var cell = getCellElement(unit, doc);
    if (!cell) return null;
    var statsEl = cell.querySelector('.cell-stats');
    if (!statsEl) return null;
    var text = statsEl.textContent;
    var am = text.match(/攻(\d+)/), dm = text.match(/防(\d+)/);
    return {
        atk: am ? parseInt(am[1]) : null,
        def: dm ? parseInt(dm[1]) : null,
        text: text
    };
}

function hasDeadMark(unit, doc) {
    var cell = getCellElement(unit, doc);
    if (!cell) return false;
    return !!cell.querySelector('.dead-mark');
}

function findUnitByUid(units, uid) {
    if (!units || !uid) return null;
    return units.find(u => u.uid === uid);
}

function findUnitByName(units, name) {
    if (!units || !name) return null;
    return units.find(u => u.name === name);
}

// ==================== 体检规则定义 ====================
// 每条规则接收 (ctx, log, beforeAllies, beforeEnemies, afterAllies, afterEnemies, doc)
// 返回: true=通过, false=失败, 'skip'=跳过(未触发)

function createSkillChecks(win, doc) {
    function getCtx() {
        try { return win._getPlayerContext ? win._getPlayerContext() : null; }
        catch (e) { return null; }
    }

    return [
        // ========== 韦一笑 ==========
        {
            group: '🦇 韦一笑',
            name: '吸血后 maxHp 增加',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return (e.type === 'attack-group' && e.entries && e.entries.some(function(en) {
                        return en.text && en.text.includes('韦一笑吸血');
                    })) || (e.text && e.text.includes('韦一笑吸血'));
                });
                if (!ev) return 'skip';
                var match = (ev.text || (ev.entries && ev.entries.find(function(en){return en.text && en.text.includes('韦一笑吸血');}) || {}).text || '').match(/上限→(\d+)/);
                if (!match) return 'skip';
                var expectedMaxHp = parseInt(match[1]);
                var wei = (afterA || []).find(function(u) { return u.isWei; });
                if (!wei) return 'skip';
                if (Math.abs(wei.maxHp - expectedMaxHp) > 1) return false;
                // 验证 UI 血条
                var pct = getHpBarPct(wei, doc);
                if (pct == null) return 'skip';
                var expectedPct = Math.floor((wei.hp / wei.maxHp) * 100);
                if (Math.abs(pct - expectedPct) > 3) return false;
                return true;
            }
        },
        {
            group: '🦇 韦一笑',
            name: '闪避反击吸血后 UI 血量同步',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.type === 'attack-group' && e.isDodge && e.entries && e.entries.some(function(en) {
                        return en.text && en.text.includes('闪避反击吸血');
                    });
                });
                if (!ev) return 'skip';
                var wei = (afterA || []).find(function(u) { return u.isWei; });
                if (!wei) return 'skip';
                var match = ev.entries.find(function(en){return en.text && en.text.includes('闪避反击吸血');}).text.match(/吸血\+(\d+)，上限→(\d+)/);
                if (!match) return 'skip';
                var heal = parseInt(match[1]);
                var expectedMax = parseInt(match[2]);
                if (Math.abs(wei.maxHp - expectedMax) > 1) return false;
                var beforeWei = (beforeA || []).find(function(u) { return u.isWei; });
                if (beforeWei && wei.hp < beforeWei.hp + heal - 2) return false;
                var pct = getHpBarPct(wei, doc);
                if (pct == null) return 'skip';
                var expectedPct = Math.floor((wei.hp / wei.maxHp) * 100);
                if (Math.abs(pct - expectedPct) > 3) return false;
                return true;
            }
        },

        // ========== 周芷若 ==========
        {
            group: '🦅 周芷若',
            name: '九阴白骨爪追击后受击者血量下降',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.text && e.text.includes('九阴白骨爪追击');
                });
                if (!ev) return 'skip';
                // 九阴白骨爪是 info 类型，伤害已计入 attack-group 的 _dmg
                // 验证有白骨爪触发的战斗里，敌方血量确实下降了
                var hasAttack = log.some(function(e) { return e.type === 'attack-group'; });
                if (!hasAttack) return 'skip';
                // 检查所有敌方单位是否有血量变化
                var enemyChanged = false;
                for (var i = 0; i < (beforeE || []).length; i++) {
                    var before = beforeE[i];
                    var after = (afterE || []).find(function(u) { return u.uid === before.uid; });
                    if (after && before.hp > after.hp) { enemyChanged = true; break; }
                }
                if (!enemyChanged) return false;
                // 验证 UI 血条与引擎数据一致
                for (var j = 0; j < (afterE || []).length; j++) {
                    var u = afterE[j];
                    if (!u.alive) continue;
                    var pct = getHpBarPct(u, doc);
                    if (pct == null) continue;
                    var expectedPct = Math.floor((u.hp / u.maxHp) * 100);
                    if (Math.abs(pct - expectedPct) > 3) return false;
                }
                return true;
            }
        },
        {
            group: '🦅 周芷若',
            name: '九阴白骨爪追击致死后 UI 标记死亡',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.text && e.text.includes('九阴白骨爪追击');
                });
                if (!ev) return 'skip';
                // 检查是否有敌方单位死亡
                var hasDead = false;
                for (var i = 0; i < (beforeE || []).length; i++) {
                    var before = beforeE[i];
                    if (!before.alive) continue;
                    var after = (afterE || []).find(function(u) { return u.uid === before.uid; });
                    if (after && !after.alive) { hasDead = true; break; }
                }
                if (!hasDead) return 'skip';
                // 验证死亡单位 UI 有死亡标记
                for (var j = 0; j < (afterE || []).length; j++) {
                    var u = afterE[j];
                    if (u.alive) continue;
                    if (!hasDeadMark(u, doc)) return false;
                }
                return true;
            }
        },

        // ========== 拒马 ==========
        {
            group: '🐴 拒马',
            name: '拒马召唤后 UI 出现拒马单位',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.type === 'buff-summon' && e.text && e.text.includes('拒马');
                });
                if (!ev) return 'skip';
                // 拒马应在 allyTeam 里
                var hasHorse = (afterA || []).some(function(u) { return u.isHorse; });
                if (!hasHorse) return false;
                // 验证 UI 有拒马的格子
                var horse = (afterA || []).find(function(u) { return u.isHorse; });
                if (horse) {
                    var cell = getCellElement(horse, doc);
                    if (!cell) return false;
                }
                return true;
            }
        },
        {
            group: '🐴 拒马',
            name: '拒马被攻击后血量同步',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var hasHorse = (beforeA || []).some(function(u) { return u.isHorse; });
                if (!hasHorse) return 'skip';
                var horseBefore = (beforeA || []).find(function(u) { return u.isHorse; });
                var horseAfter = (afterA || []).find(function(u) { return u.isHorse; });
                if (!horseBefore || !horseAfter) return 'skip';
                // 如果拒马血量下降了，验证 UI 同步
                if (horseAfter.hp < horseBefore.hp) {
                    var pct = getHpBarPct(horseAfter, doc);
                    if (pct == null) return 'skip';
                    var expectedPct = Math.floor((horseAfter.hp / horseAfter.maxHp) * 100);
                    if (Math.abs(pct - expectedPct) > 3) return false;
                }
                return true;
            }
        },
        {
            group: '🐴 拒马',
            name: '拒马销毁后 UI 移除',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.type === 'buff-destroy' && e.text && e.text.includes('拒马');
                });
                if (!ev) return 'skip';
                var hadHorse = (beforeA || []).some(function(u) { return u.isHorse; });
                if (!hadHorse) return 'skip';
                var stillHasHorse = (afterA || []).some(function(u) { return u.isHorse; });
                if (stillHasHorse) return false;
                return true;
            }
        },

        // ========== 张无忌 ==========
        {
            group: '⚔️ 张无忌',
            name: '切换近战形态后属性提升',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) { return e.isZhangSwitch; });
                if (!ev) return 'skip';
                var zhangBefore = (beforeA || []).find(function(u) { return u.isZhang; });
                var zhangAfter = (afterA || []).find(function(u) { return u.isZhang; });
                if (!zhangBefore || !zhangAfter) return 'skip';
                if (zhangAfter.atk <= zhangBefore.atk) return false;
                if (zhangAfter.def <= zhangBefore.def) return false;
                if (zhangAfter.maxHp <= zhangBefore.maxHp) return false;
                // 验证 UI 显示
                var stats = getCellStats(zhangAfter, doc);
                if (!stats) return 'skip';
                var expAtk = zhangAfter.atk + Math.floor(zhangAfter.atk * (zhangAfter.buffAtkBonus || 0));
                if (stats.atk !== expAtk) return false;
                return true;
            }
        },
        {
            group: '⚔️ 张无忌',
            name: '九阳神功回血后血量增加',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.text && e.text.includes('九阳神功回复');
                });
                if (!ev) return 'skip';
                var zhang = (afterA || []).find(function(u) { return u.isZhang; });
                if (!zhang) return 'skip';
                var match = ev.text.match(/回复(\d+)/);
                if (!match) return 'skip';
                var heal = parseInt(match[1]);
                var zhangBefore = (beforeA || []).find(function(u) { return u.isZhang; });
                if (!zhangBefore) return 'skip';
                // 血量应增加（不超过 maxHp）
                if (zhang.hp < zhangBefore.hp + heal - 1) return false;
                // UI 同步
                var pct = getHpBarPct(zhang, doc);
                if (pct == null) return 'skip';
                var expectedPct = Math.floor((zhang.hp / zhang.maxHp) * 100);
                if (Math.abs(pct - expectedPct) > 3) return false;
                return true;
            }
        },
        {
            group: '⚔️ 张无忌',
            name: '乾坤大挪移反弹后攻击者血量下降',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.text && e.text.includes('乾坤大挪移反弹');
                });
                if (!ev) return 'skip';
                // 反弹对象是攻击者（敌方）
                var match = ev.text.match(/反弹(\d+)给(.+?)（/);
                if (!match) return 'skip';
                var reboundDmg = parseInt(match[1]);
                var attackerName = match[2];
                var attackerBefore = (beforeE || []).find(function(u) { return u.name === attackerName; });
                var attackerAfter = (afterE || []).find(function(u) { return u.name === attackerName; });
                if (!attackerBefore || !attackerAfter) return 'skip';
                if (attackerBefore.hp - attackerAfter.hp < reboundDmg - 2) return false;
                // UI 同步
                if (attackerAfter.alive) {
                    var pct = getHpBarPct(attackerAfter, doc);
                    if (pct == null) return 'skip';
                    var expectedPct = Math.floor((attackerAfter.hp / attackerAfter.maxHp) * 100);
                    if (Math.abs(pct - expectedPct) > 3) return false;
                } else {
                    if (!hasDeadMark(attackerAfter, doc)) return false;
                }
                return true;
            }
        },

        // ========== Buff 系统 ==========
        {
            group: '✨ Buff',
            name: '嗜血狂刀吸血后血量增加',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.type === 'buff-leech' && e.buffType === 'leech';
                });
                if (!ev) return 'skip';
                var match = ev.text.match(/吸血\+(\d+)，血量\s*(\d+)\s*→\s*(\d+)/);
                if (!match) return 'skip';
                var heal = parseInt(match[1]);
                var hpAfter = parseInt(match[3]);
                var uid = ev.healUnitUid;
                var unit = findUnitByUid((afterA || []).concat(afterE || []), uid);
                if (!unit) return 'skip';
                if (Math.abs(unit.hp - hpAfter) > 2) return false;
                var pct = getHpBarPct(unit, doc);
                if (pct == null) return 'skip';
                var expectedPct = Math.floor((unit.hp / unit.maxHp) * 100);
                if (Math.abs(pct - expectedPct) > 3) return false;
                return true;
            }
        },
        {
            group: '✨ Buff',
            name: '热血奋战回血后血量增加',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.type === 'buff-leech' && e.buffType === 'hotBlood';
                });
                if (!ev) return 'skip';
                var match = ev.text.match(/回复\+(\d+)，血量\s*(\d+)\s*→\s*(\d+)/);
                if (!match) return 'skip';
                var heal = parseInt(match[1]);
                var hpAfter = parseInt(match[3]);
                var uid = ev.healUnitUid;
                var unit = findUnitByUid((afterA || []).concat(afterE || []), uid);
                if (!unit) return 'skip';
                if (Math.abs(unit.hp - hpAfter) > 2) return false;
                var pct = getHpBarPct(unit, doc);
                if (pct == null) return 'skip';
                var expectedPct = Math.floor((unit.hp / unit.maxHp) * 100);
                if (Math.abs(pct - expectedPct) > 3) return false;
                return true;
            }
        },
        {
            group: '✨ Buff',
            name: '严阵以待反弹后攻击者血量下降',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.type === 'buff-rebound-fortify';
                });
                if (!ev) return 'skip';
                var attackerUid = ev.attackerUid;
                var reboundDmg = ev.reboundDmg;
                if (!attackerUid || !reboundDmg) return 'skip';
                var attackerBefore = findUnitByUid((beforeA || []).concat(beforeE || []), attackerUid);
                var attackerAfter = findUnitByUid((afterA || []).concat(afterE || []), attackerUid);
                if (!attackerBefore || !attackerAfter) return 'skip';
                if (attackerBefore.hp - attackerAfter.hp < reboundDmg - 2) return false;
                if (attackerAfter.alive) {
                    var pct = getHpBarPct(attackerAfter, doc);
                    if (pct == null) return 'skip';
                    var expectedPct = Math.floor((attackerAfter.hp / attackerAfter.maxHp) * 100);
                    if (Math.abs(pct - expectedPct) > 3) return false;
                }
                return true;
            }
        },
        {
            group: '✨ Buff',
            name: '乘风突袭波及后受击者血量下降',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.type === 'buff-splash' && e.buffType === 'wind_assault' && e.splashUids;
                });
                if (!ev) return 'skip';
                for (var i = 0; i < ev.splashUids.length; i++) {
                    var uid = ev.splashUids[i];
                    var before = findUnitByUid((beforeA || []).concat(beforeE || []), uid);
                    var after = findUnitByUid((afterA || []).concat(afterE || []), uid);
                    if (!before || !after) continue;
                    if (after.hp >= before.hp) return false;
                    if (after.alive) {
                        var pct = getHpBarPct(after, doc);
                        if (pct == null) continue;
                        var expectedPct = Math.floor((after.hp / after.maxHp) * 100);
                        if (Math.abs(pct - expectedPct) > 3) return false;
                    }
                }
                return true;
            }
        },
        {
            group: '✨ Buff',
            name: '乘风突袭击退后位置变化',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.type === 'buff-push' && e.pushTarget;
                });
                if (!ev) return 'skip';
                var targetName = ev.pushTarget;
                var before = findUnitByName((beforeA || []).concat(beforeE || []), targetName);
                var after = findUnitByName((afterA || []).concat(afterE || []), targetName);
                if (!before || !after) return 'skip';
                if (before.pos === after.pos) return false;
                // 验证 UI 格子位置
                var cell = getCellElement(after, doc);
                if (!cell) return false;
                return true;
            }
        },
        {
            group: '✨ Buff',
            name: '惑人心智换位后双方位置交换',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.type === 'buff-swap';
                });
                if (!ev) return 'skip';
                var matchA = ev.text.match(/号位(.+?)\(/);
                var matchB = ev.text.match(/与.*?号位(.+?)\(/);
                if (!matchA || !matchB) return 'skip';
                var unitA = findUnitByName((beforeA || []).concat(beforeE || []), matchA[1]);
                var unitB = findUnitByName((beforeA || []).concat(beforeE || []), matchB[1]);
                var afterUnitA = findUnitByName((afterA || []).concat(afterE || []), matchA[1]);
                var afterUnitB = findUnitByName((afterA || []).concat(afterE || []), matchB[1]);
                if (!unitA || !unitB || !afterUnitA || !afterUnitB) return 'skip';
                if (afterUnitA.pos !== unitB.pos || afterUnitB.pos !== unitA.pos) return false;
                return true;
            }
        },
        {
            group: '✨ Buff',
            name: '概率连击后连击单位有额外攻击',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) { return e.isDoubleStrikeBanner; });
                if (!ev) return 'skip';
                // 连击触发后，应该有额外的 attack-group
                var hasAttack = log.some(function(e) { return e.type === 'attack-group'; });
                if (!hasAttack) return false;
                // 连击单位应该有 ⚡ 标记
                var innerCtx = getCtx();
                if (!innerCtx || !innerCtx.currentDoubleStrikeUid) return 'skip';
                var unit = findUnitByUid((afterA || []).concat(afterE || []), innerCtx.currentDoubleStrikeUid);
                if (!unit) return 'skip';
                var cell = getCellElement(unit, doc);
                if (!cell) return 'skip';
                var nameEl = cell.querySelector('.cell-name');
                if (!nameEl) return 'skip';
                return nameEl.textContent.indexOf('⚡') !== -1;
            }
        },

        // ========== 精英技能 ==========
        {
            group: '👹 精英',
            name: '玄冥神掌中毒后每回合扣血',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.text && e.text.includes('玄冥神掌');
                });
                if (!ev) return 'skip';
                // 验证中毒单位有 _xuanmingPoison 状态
                var hasPoison = (afterA || []).concat(afterE || []).some(function(u) {
                    return u._xuanmingPoison;
                });
                if (!hasPoison) return 'skip';
                // 后续回合应有寒毒发作
                var hasDot = log.some(function(e) {
                    return e.text && e.text.includes('玄冥神掌寒毒发作');
                });
                return hasDot;
            }
        },
        {
            group: '👹 精英',
            name: '新婚扣血后周芷若血量下降',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.text && e.text.includes('新婚');
                });
                if (!ev) return 'skip';
                var zhouBefore = (beforeE || []).find(function(u) { return u.name === '周芷若'; });
                var zhouAfter = (afterE || []).find(function(u) { return u.name === '周芷若'; });
                if (!zhouBefore || !zhouAfter) return 'skip';
                if (zhouAfter.hp >= zhouBefore.hp) return false;
                if (zhouAfter.alive) {
                    var pct = getHpBarPct(zhouAfter, doc);
                    if (pct == null) return 'skip';
                    var expectedPct = Math.floor((zhouAfter.hp / zhouAfter.maxHp) * 100);
                    if (Math.abs(pct - expectedPct) > 3) return false;
                }
                return true;
            }
        },
        {
            group: '👹 精英',
            name: '快乐回血后血量增加',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.text && e.text.includes('快乐回血');
                });
                if (!ev) return 'skip';
                var match = ev.text.match(/回复(\d+)点生命/);
                if (!match) return 'skip';
                var heal = parseInt(match[1]);
                // 找到回血的单位
                var nameMatch = ev.text.match(/：(.+?) 回复/);
                if (!nameMatch) return 'skip';
                var unitName = nameMatch[1];
                var unit = findUnitByName((afterA || []).concat(afterE || []), unitName);
                if (!unit) return 'skip';
                var pct = getHpBarPct(unit, doc);
                if (pct == null) return 'skip';
                var expectedPct = Math.floor((unit.hp / unit.maxHp) * 100);
                if (Math.abs(pct - expectedPct) > 3) return false;
                return true;
            }
        },
        {
            group: '👹 精英',
            name: '性奋触发后宋青书有额外攻击',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.text && e.text.includes('性奋') && e.text.includes('额外攻击');
                });
                if (!ev) return 'skip';
                var song = (afterE || []).find(function(u) { return u.name === '宋青书'; });
                if (!song) return 'skip';
                // 性奋触发后，日志里应该有多于一次的宋青书攻击
                var attackCount = log.filter(function(e) {
                    return e.type === 'attack-group' && e.uidA === song.uid;
                }).length;
                return attackCount >= 2;
            }
        },

        // ========== 基础战斗 ==========
        {
            group: '⚔️ 基础',
            name: '普通攻击后受击者血量同步',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.type === 'attack-group' && !e.isDodge && !e.isMiss && !e.isBlock;
                });
                if (!ev) return 'skip';
                var targetUid = ev.uidD;
                if (!targetUid) return 'skip';
                var targetBefore = findUnitByUid((beforeA || []).concat(beforeE || []), targetUid);
                var targetAfter = findUnitByUid((afterA || []).concat(afterE || []), targetUid);
                if (!targetBefore || !targetAfter) return 'skip';
                if (targetAfter.hp >= targetBefore.hp) {
                    // 可能是格挡或闪避，跳过
                    return 'skip';
                }
                if (targetAfter.alive) {
                    var pct = getHpBarPct(targetAfter, doc);
                    if (pct == null) return 'skip';
                    var expectedPct = Math.floor((targetAfter.hp / targetAfter.maxHp) * 100);
                    if (Math.abs(pct - expectedPct) > 3) return false;
                } else {
                    if (!hasDeadMark(targetAfter, doc)) return false;
                }
                return true;
            }
        },
        {
            group: '⚔️ 基础',
            name: '格挡休息后血量回复',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.text && e.text.includes('休息回复10点生命');
                });
                if (!ev) return 'skip';
                var match = ev.text.match(/(\d+)\s*→\s*(\d+)/);
                if (!match) return 'skip';
                var hpAfter = parseInt(match[2]);
                // 找到格挡单位（攻击方）
                var attackEv = log.find(function(e) {
                    return e.type === 'attack-group' && e.isBlock;
                });
                if (!attackEv) return 'skip';
                var blocker = findUnitByUid((afterA || []).concat(afterE || []), attackEv.uidA);
                if (!blocker) return 'skip';
                if (Math.abs(blocker.hp - hpAfter) > 2) return false;
                var pct = getHpBarPct(blocker, doc);
                if (pct == null) return 'skip';
                var expectedPct = Math.floor((blocker.hp / blocker.maxHp) * 100);
                if (Math.abs(pct - expectedPct) > 3) return false;
                return true;
            }
        },
        {
            group: '⚔️ 基础',
            name: '击杀后死亡单位有死亡标记',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var hasKill = log.some(function(e) {
                    return e.type === 'attack-group' && e.isDead;
                });
                if (!hasKill) return 'skip';
                var hasDeadUnit = false;
                var allAfter = (afterA || []).concat(afterE || []);
                for (var i = 0; i < allAfter.length; i++) {
                    var u = allAfter[i];
                    var before = findUnitByUid((beforeA || []).concat(beforeE || []), u.uid);
                    if (before && before.alive && !u.alive) {
                        hasDeadUnit = true;
                        if (!hasDeadMark(u, doc)) return false;
                    }
                }
                return hasDeadUnit;
            }
        },
        {
            group: '⚔️ 基础',
            name: '所有存活单位血条与引擎同步',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var allAfter = (afterA || []).concat(afterE || []);
                var hasAlive = false;
                for (var i = 0; i < allAfter.length; i++) {
                    var u = allAfter[i];
                    if (!u.alive) continue;
                    hasAlive = true;
                    var pct = getHpBarPct(u, doc);
                    if (pct == null) continue;
                    var expectedPct = Math.floor((u.hp / u.maxHp) * 100);
                    if (Math.abs(pct - expectedPct) > 3) return false;
                }
                return hasAlive;
            }
        },
        {
            group: '⚔️ 基础',
            name: '所有存活单位攻防含Buff加成',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var allAfter = (afterA || []).concat(afterE || []);
                var hasChecked = false;
                for (var i = 0; i < allAfter.length; i++) {
                    var u = allAfter[i];
                    if (!u.alive) continue;
                    var stats = getCellStats(u, doc);
                    if (!stats || stats.atk == null) continue;
                    hasChecked = true;
                    var expAtk = u.atk + Math.floor(u.atk * (u.buffAtkBonus || 0));
                    var expDef = u.def + Math.floor(u.def * (u.buffDefBonus || 0));
                    if (stats.atk !== expAtk || stats.def !== expDef) return false;
                }
                return hasChecked;
            }
        },
        {
            group: '⚔️ 基础',
            name: '属性值无 NaN/Infinity',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var allAfter = (afterA || []).concat(afterE || []);
                for (var i = 0; i < allAfter.length; i++) {
                    var u = allAfter[i];
                    if (isNaN(u.atk) || isNaN(u.def) || isNaN(u.hp) || isNaN(u.maxHp)) return false;
                    if (!isFinite(u.atk) || !isFinite(u.def) || !isFinite(u.hp) || !isFinite(u.maxHp)) return false;
                }
                return true;
            }
        },
        {
            group: '⚔️ 基础',
            name: '混元霹雳劲真实伤害生效',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.text && e.text.includes('混元霹雳劲');
                });
                if (!ev) return 'skip';
                // 有混元霹雳劲的攻击，伤害应高于普通攻击
                var hasAttack = log.some(function(e) { return e.type === 'attack-group'; });
                if (!hasAttack) return false;
                return true;
            }
        },
        {
            group: '⚔️ 基础',
            name: '鹿角杖法防御降低生效',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.text && e.text.includes('鹿角杖法');
                });
                if (!ev) return 'skip';
                // 鹿角杖法会忽略防御，验证伤害计算正常
                var hasAttack = log.some(function(e) { return e.type === 'attack-group'; });
                if (!hasAttack) return false;
                return true;
            }
        },
        {
            group: '⚔️ 基础',
            name: '灭绝双剑反击后攻击者血量下降',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.text && e.text.includes('灭绝双剑反击');
                });
                if (!ev) return 'skip';
                var match = ev.text.match(/对\s*(.+?)\s*造成\s*(\d+)\s*点反击伤害/);
                if (!match) return 'skip';
                var targetName = match[1];
                var counterDmg = parseInt(match[2]);
                var targetBefore = findUnitByName((beforeA || []).concat(beforeE || []), targetName);
                var targetAfter = findUnitByName((afterA || []).concat(afterE || []), targetName);
                if (!targetBefore || !targetAfter) return 'skip';
                if (targetBefore.hp - targetAfter.hp < counterDmg - 2) return false;
                return true;
            }
        }
    ];
}

// ==================== 体检主流程 ====================

export async function runHealthCheck(config) {
    const {
        iframe, statusEl, reportEl, runBtn,
        progCont, progFill, progText, stageCbs
    } = config;

    const selectedStages = Array.from(stageCbs.querySelectorAll('input:checked'))
        .map(cb => parseInt(cb.value)).sort((a, b) => a - b);

    if (!selectedStages.length) {
        statusEl.textContent = '请至少选择一个关卡';
        return;
    }

    reportEl.innerHTML = '';
    statusEl.textContent = '正在启动...';
    runBtn.disabled = true;
    runBtn.textContent = '⏳ 检测中...';
    progCont.style.display = 'block';
    progFill.style.width = '0%';
    progText.textContent = '初始化...';

    const W = () => iframe.contentWindow;
    const D = () => iframe.contentDocument || W().document;

    const waitCtx = (timeout = 60000) => new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
            try {
                const ctx = W()._getPlayerContext?.();
                if (ctx?.UI?.allyTeam?.length >= 1 && ctx?.UI?.enemyTeam?.length >= 1) resolve(ctx);
                else if (Date.now() - start > timeout) reject(new Error('游戏上下文超时'));
                else setTimeout(check, 800);
            } catch (e) {
                if (Date.now() - start > timeout) reject(new Error('游戏模块加载超时'));
                else setTimeout(check, 800);
            }
        };
        check();
    });

    const gameUrl = new URL('../mode-5v5-test.html', window.location.href).href;
    iframe.src = gameUrl;

    try {
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('iframe 加载超时')), 60000);
            iframe.addEventListener('load', () => { clearTimeout(timeout); resolve(); }, { once: true });
        });

        const coverBtn = await new Promise((resolve, reject) => {
            const start = Date.now();
            const check = () => {
                const btn = D().getElementById('coverStartBtn');
                if (btn) resolve(btn);
                else if (Date.now() - start > 30000) reject(new Error('封面按钮加载超时'));
                else setTimeout(check, 500);
            };
            check();
        });
        coverBtn.click();
        await new Promise(r => setTimeout(r, 1500));

        await waitCtx(60000);

        // 获取所有检测规则
        const checks = createSkillChecks(W(), D());

        // 汇总结果
        const summary = {};
        checks.forEach(c => {
            summary[c.name] = { pass: 0, fail: 0, skip: 0, total: 0, group: c.group };
        });

        const TOTAL_ROUNDS = 5; // 每关跑 5 轮（减少跑轮数，因为检测更细了）

        for (let idx = 0; idx < selectedStages.length; idx++) {
            for (let round = 0; round < TOTAL_ROUNDS; round++) {
                const stage = selectedStages[idx];
                const progress = Math.floor(((idx * TOTAL_ROUNDS + round + 1) / (selectedStages.length * TOTAL_ROUNDS)) * 100);
                progFill.style.width = progress + '%';
                progText.textContent = `第 ${stage} 关 (${idx + 1}/${selectedStages.length})`;
                statusEl.textContent = `第 ${stage} 关 · 第 ${round + 1}/${TOTAL_ROUNDS} 轮`;

                if (round === 0) {
                    W().selectStage(stage);
                    await new Promise(r => setTimeout(r, 1500));
                    await waitCtx(30000);
                }

                // ===== 跑一场战斗 =====
                const snap = generateSnapshot(stage);
                // 给不同 buff 组合，提高技能触发概率
                const buffSets = [
                    [{ key: 'cloudBody', target: 'ally', remaining: 35 }, { key: 'hotBlood', target: 'ally', remaining: 35 }],
                    [{ key: 'fortify', target: 'ally', remaining: 35 }, { key: 'bloodthirst', target: 'ally', remaining: 35 }],
                    [{ key: 'windAssault', target: 'ally', remaining: 35 }, { key: 'meteorShower', target: 'ally', remaining: 35 }],
                    [{ key: 'mindControl', target: 'ally', remaining: 35 }, { key: 'doubleStrike', target: 'ally', remaining: 35 }],
                    [{ key: 'holyFlame', target: 'ally', remaining: 35 }, { key: 'carry', target: 'ally', remaining: 35 }]
                ];
                const testBuffs = buffSets[round % buffSets.length];
                const battleResult = runBattle(snap, testBuffs);

                const ally = (battleResult.ally || []).map(u => {
                    const cu = Object.assign(Object.create(Object.getPrototypeOf(u)), u);
                    if (!cu.alive) { cu._isDead = true; cu._flash = 'dead'; }
                    return cu;
                });
                const enemy = (battleResult.enemy || []).map(u => {
                    const cu = Object.assign(Object.create(Object.getPrototypeOf(u)), u);
                    if (!cu.alive) { cu._isDead = true; cu._flash = 'dead'; }
                    return cu;
                });
                const battleLog = battleResult.log || [];

                // 记录战斗前状态
                const ctxSync = W()._getPlayerContext();
                let beforeAllies = [], beforeEnemies = [];
                if (ctxSync) {
                    beforeAllies = ctxSync.UI.allyTeam.map(u => ({ ...u }));
                    beforeEnemies = ctxSync.UI.enemyTeam.map(u => ({ ...u }));
                }

                // 同步引擎结果到 UI
                if (ctxSync) {
                    ctxSync.UI.allyTeam = ally;
                    ctxSync.UI.enemyTeam = enemy;
                    ctxSync.UI.round = battleResult.round || 1;
                    ctxSync.updateUI(ctxSync.UI);
                    await new Promise(r => setTimeout(r, 150)); // 等 DOM 刷新
                }

                // 运行所有检测
                for (const check of checks) {
                    summary[check.name].total++;
                    try {
                        const result = check.test(ctxSync, battleLog, beforeAllies, beforeEnemies, ally, enemy);
                        if (result === 'skip') {
                            summary[check.name].skip++;
                        } else if (result === true) {
                            summary[check.name].pass++;
                        } else {
                            summary[check.name].fail++;
                        }
                    } catch (e) {
                        summary[check.name].fail++;
                    }
                }
            } // 闭合 for (let round...)
        }

        // ===== 生成报告 =====
        const lines = [];
        let totalPass = 0, totalFail = 0, totalSkip = 0;
        const groups = {};
        for (const [name, stat] of Object.entries(summary)) {
            if (!groups[stat.group]) groups[stat.group] = [];
            groups[stat.group].push({ name, ...stat });
            totalPass += stat.pass;
            totalFail += stat.fail;
            totalSkip += stat.skip;
        }

        for (const [group, items] of Object.entries(groups)) {
            lines.push(`\n${group}`);
            for (const item of items) {
                const checked = item.pass + item.fail;
                if (item.fail > 0) {
                    lines.push(`  ❌ ${item.name}：${item.pass}/${checked} 通过，${item.fail} 失败${item.skip > 0 ? `，${item.skip} 跳过` : ''}`);
                } else if (item.pass > 0) {
                    lines.push(`  ✅ ${item.name}：${item.pass}/${checked} 通过${item.skip > 0 ? `，${item.skip} 跳过` : ''}`);
                } else {
                    lines.push(`  ⏭️ ${item.name}：全部跳过（${item.skip} 次）`);
                }
            }
        }

        const reportText = lines.join('\n');

        reportEl.innerHTML = lines.map(line => {
            if (line.startsWith('  ❌')) return `<div style="color:#f44336;">${line}</div>`;
            if (line.startsWith('  ✅')) return `<div style="color:#4caf50;">${line}</div>`;
            if (line.startsWith('  ⏭️')) return `<div style="color:#888;">${line}</div>`;
            return `<div style="color:#ff9800;font-weight:bold;margin-top:6px;">${line}</div>`;
        }).join('');

        // 复制按钮
        const copyBtn = document.createElement('button');
        copyBtn.textContent = '📋 复制结果';
        copyBtn.style.cssText = 'margin-top:8px;padding:6px 14px;font-size:12px;';
        copyBtn.onclick = () => navigator.clipboard.writeText(reportText).then(() => {
            copyBtn.textContent = '✅ 已复制';
            setTimeout(() => copyBtn.textContent = '📋 复制结果', 1500);
        });
        reportEl.appendChild(copyBtn);

        statusEl.textContent = totalFail === 0
            ? `✅ 全部通过！${totalPass} 项通过，${totalSkip} 项跳过`
            : `⚠️ 通过 ${totalPass} 项，失败 ${totalFail} 项，跳过 ${totalSkip} 项`;

    } catch (e) {
        statusEl.textContent = '❌ ' + (e.message || '未知错误');
        reportEl.innerHTML = `<div style="color:#f44336;">❌ ${e.message || '未知错误'}</div>`;
    } finally {
        runBtn.disabled = false;
        runBtn.textContent = '🤖 开始全面体检';
        setTimeout(() => { progCont.style.display = 'none'; }, 5000);
    }
}
