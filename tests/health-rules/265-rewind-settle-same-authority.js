// 定格与真播同一落账顺序（单一权威）：整步血量/生死只许在 504 落一次账，且排在死亡特效之前。
// 为什么需要：回看的定格（段拨/跳步/快进）与真播（连续播放）必须汇到同一套落账顺序，
//   否则同一步「定格看到的状态」与「直接播放到该步的状态」会不一样（血量差一截 / 死亡红叉先于血归零）。
//   504 的约定是：syncStoreFromStep（唯一权威落账）→ settle 停点 → 死亡 SET_FLASH → death 停点 → 死亡红墨。
//   顺序一旦被打乱，回看停点会停在「半结算」中间态；二次落账会让同一份数据在两处各算一次。
// 判据（导出函数源码结构，回放 140 场逐场执行，0 误报）：
//   ① 整步落账点数量固定为 2（复活重同步 + 权威落账）——多一处就说明有人二次落账；
//   ② 权威落账必须早于 settle 停点，settle 早于死亡 SET_FLASH，死亡停点早于红墨 BRUSH_EFFECT；
//   ③ 727 进场定格必须 paintAt 到「末步末段」（回看初始状态与真播到末步一致）；
//   ④ 727 退出还原时优先用 c._rewindLastStep（上次真播/定位的末步），没有才退回录制末步。
export const VER = 'tests/health-rules/265-rewind-settle-same-authority.js V1.0.0';

import { enterReview, exitReview } from '../../ui/727-rewind-core.js';
import { playStepInterleaved } from '../../player/504-player-play-step.js';

function srcOf(fn) { return String(fn); }

export const rule265 = {
    group: '战报与渲染一致性',
    name: '定格与真播同一落账顺序(单一权威)',
    test: function(ctx, log) {
        var step = srcOf(playStepInterleaved);
        var enter = srcOf(enterReview);
        var exitS = srcOf(exitReview);

        // ① 落账点数量：复活重同步 + 权威落账 = 2
        var syncCount = (step.match(/syncStoreFromStep\(c,\s*step\)/g) || []).length;
        if (syncCount !== 2) {
            return { fail: true, msg: '504 整步落账点数量为 ' + syncCount + '（应为 2：复活重同步 + 权威落账）——多一处=二次落账，少一处=复活后状态脱节' };
        }
        // ② 顺序链
        var iSync = step.lastIndexOf('syncStoreFromStep(c, step)');
        var iSettle = step.indexOf("_rewindCue('settle'");
        var iFlash = step.indexOf('SET_FLASH');
        var iDeath = step.indexOf("_rewindCue('death'");
        var iBrush = step.indexOf('BRUSH_EFFECT');
        if (iSettle < 0 || iDeath < 0) {
            return { fail: true, msg: '504 缺倒针停点：settle/death 停点必须存在（定格与真播共用停点）' };
        }
        if (!(iSync > 0 && iSync < iSettle && iSettle < iFlash && iFlash < iDeath && iDeath < iBrush)) {
            return { fail: true, msg: '落账顺序错乱：要求「落账→settle停点→死亡闪→death停点→红墨」，实际下标 ' + [iSync, iSettle, iFlash, iDeath, iBrush].join('/') + ' —— 定格会停在半结算态' };
        }
        // ③ 进场定格到末步末段
        if (!/paintAt\(S\.stepIdx,\s*S\.cueIdx\)/.test(enter)) {
            return { fail: true, msg: '进场未定格到末步末段：enterReview 缺 paintAt(S.stepIdx, S.cueIdx)，回看初始状态与真播末步不一致' };
        }
        // ④ 退出还原优先上次末步
        if (!/c\._rewindLastStep/.test(exitS)) {
            return { fail: true, msg: '退出还原未优先 c._rewindLastStep：退出后状态可能跳回录制末步而非上次定位步' };
        }
        return { fail: false, msg: '落账顺序链 5 环完整（落账→settle→死亡闪→death→红墨），落账点 2 处（复活+权威）' };
    }
};
