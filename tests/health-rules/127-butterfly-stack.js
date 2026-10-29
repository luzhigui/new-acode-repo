// 回归规则：姐姐附身属性叠加 — 修复后基于 _baseAtk/_baseDef 转移，不重复计算 Buff
// 复发信号：附身转移值 atkTransfer/defTransfer != 方向对应基础值份额（含 Buff 加成，回退到直接操作 atk/def）
// 对应已修 Bug：姐姐附身属性叠加（直接操作 atk/def 导致 Buff 重复计算）
import { getSkillParams } from '../../core/01config-5v5-test.js';

export const VER = 'tests/health-rules/127-butterfly-stack.js V6.1.12';

export const rule74 = {
    group: '精英技能回归',
    name: '姐姐附身叠加(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        // 找附身日志："🦋 蝶变：{sister} 化为蝴蝶附身于 {host}！攻+X 防+Y 血上限+Z"
        var possessText = null;
        for (var j = 0; j < log.length; j++) {
            var e = log[j];
            if (!e) continue;
            if (e.type === 'info' && (e.text || '').indexOf('化为蝴蝶附身') !== -1) {
                possessText = e.text;
                break;
            }
        }
        if (!possessText) return 'skip';

        // 解析"攻+X"/"防+Y"（附身文本恒含两项，方向由"←左"/"右→"决定）
        var am = possessText.match(/攻\+(\d+)/);
        var dm = possessText.match(/防\+(\d+)/);
        if (!am) return 'skip';
        var atkTransfer = parseInt(am[1], 10);
        var defTransfer = dm ? parseInt(dm[1], 10) : 0;

        // 找姐姐的基础值（before 优先，附身发生在战斗开始）
        var sister = null;
        var allBefore = (beforeA || []).concat(beforeE || []);
        for (var i = 0; i < allBefore.length; i++) {
            if (allBefore[i] && allBefore[i].isXiaoZhaoSister) { sister = allBefore[i]; break; }
        }
        if (!sister) {
            var allAfter = (afterA || []).concat(afterE || []);
            for (var i2 = 0; i2 < allAfter.length; i2++) {
                if (allAfter[i2] && allAfter[i2].isXiaoZhaoSister) { sister = allAfter[i2]; break; }
            }
        }
        if (!sister) return 'skip';
        // 字段路径修正（第 22 轮）：_baseAtk/_baseDef **不在单位顶层**，在 `unit.state` 下 ——
        //   core/02unit.js:177 `this.state._baseAtk = this.atk`；core/13:89 取用时写的也是 unit.state._baseAtk。
        //   原写法读顶层 → 恒 undefined → 本规则 120 场**全部**卡在这条 skip（恒 skip 空转）。
        var st = sister.state || {};
        var baseAtk = st._baseAtk, baseDef = st._baseDef;
        if (baseAtk === undefined || baseDef === undefined) return 'skip';

        // 比例从 content 读（V6.1.12）：与引擎 modules/27elite-mingjiao-xiaozhao-sister executeAttach 同源，
        //   引擎 `atkTransfer = floor(_baseAtk * bp.atkRatioRight)` / `defTransfer = floor(_baseDef * bp.defRatioLeft)`。
        //   单一真源：content 调参本规则自动跟随；引擎若回退成直接操作 atk/def（含 Buff）则份额越界会被抓。
        var bp = getSkillParams('小昭', 'butterflyAttach');
        if (!bp || typeof bp.atkRatioRight !== 'number' || typeof bp.defRatioLeft !== 'number') return 'skip';

        // 方向（"←左" / "右→"）从文本自解析。
        var dirLeft = possessText.indexOf('←左') !== -1;
        if (dirLeft) {
            // 左向：只转防，攻应为 0
            var expDef = Math.floor(baseDef * bp.defRatioLeft);
            if (defTransfer !== expDef) {
                return { fail: true, msg: '复发：左向附身防转移值' + defTransfer + ' != floor(_baseDef*' + bp.defRatioLeft + ')=' + expDef + '，可能直接操作 def 导致 Buff 重复计算' };
            }
            if (atkTransfer !== 0) {
                return { fail: true, msg: '复发：左向附身攻转移值' + atkTransfer + ' 应为0（左向只转防），疑似含 Buff 加成' };
            }
        } else {
            // 右向：只转攻，防应为 0
            var expAtk = Math.floor(baseAtk * bp.atkRatioRight);
            if (atkTransfer !== expAtk) {
                return { fail: true, msg: '复发：右向附身攻转移值' + atkTransfer + ' != floor(_baseAtk*' + bp.atkRatioRight + ')=' + expAtk + '，可能直接操作 atk 导致 Buff 重复计算' };
            }
            if (defTransfer !== 0) {
                return { fail: true, msg: '复发：右向附身防转移值' + defTransfer + ' 应为0（右向只转攻），疑似含 Buff 加成' };
            }
        }
        return { fail: false };
    }
};
