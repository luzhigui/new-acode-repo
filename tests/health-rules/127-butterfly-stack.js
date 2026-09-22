// 回归规则：姐姐附身属性叠加 — 修复后基于 _baseAtk/_baseDef 转移，不重复计算 Buff
// 复发信号：附身转移值 atkTransfer/defTransfer != 方向对应基础值份额（含 Buff 加成，回退到直接操作 atk/def）
// 对应已修 Bug：姐姐附身属性叠加（直接操作 atk/def 导致 Buff 重复计算）
// 优化（V6.1.x 复核）：原规则只校验「右向攻转移 == floor(_baseAtk/2)」，漏检左向防转移回归。
//   现按 modules/27elite-mingjiao _executeAttach 口径做双向对称校验，方向由文本"←左"/"右→"自解析：
//     右向：atkRatio=1/2（攻=floor(_baseAtk/2)）、defRatio=0（防=0）
//     左向：atkRatio=0（攻=0）、defRatio=1/2（防=floor(_baseDef/2)）
//   任一方向转移值含 Buff 加成（或越基础份额）即判回归，覆盖原右向-only 漏掉的左向 def 路径。
// 修复（V6.1.20）：基础值路径错误导致恒空转。旧代码读 sister._baseAtk/_baseDef，
//   但业务口径里基础值在 unit.state._baseAtk/_baseDef（core/02unit.js L157、
//   modules/29battle-init.js L116/L178 初始化），单位根上从无此字段 → 守卫恒真、
//   120 场 skip=120（同批"化为蝴蝶附身"文本命中 445 次、128 pass=48 佐证数据源在）。
//   改读 state._baseAtk/_baseDef，本规则自登记以来首次可真实断言。
export const VER = 'tests/health-rules/127-butterfly-stack.js V6.1.20';

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
        // 基础值在 unit.state 上（V6.1.20 修正路径：根上无 _baseAtk，旧代码因此恒 skip）
        if (sister.state === undefined) return 'skip';
        if (sister.state._baseAtk === undefined || sister.state._baseDef === undefined) return 'skip';

        // 引擎口径（27elite-mingjiao _executeAttach）：飞行方向决定转移项——
        //   右向：攻转移 floor(_baseAtk/2)、防 0；左向：攻 0、防转移 floor(_baseDef/2)。
        //   方向已渲染进附身文本（"←左" / "右→"），从文本自解析。
        var dirLeft = possessText.indexOf('←左') !== -1;
        if (dirLeft) {
            // 左向：只转防，攻应为 0
            var expDef = Math.floor(sister.state._baseDef / 2);
            if (defTransfer !== expDef) {
                return { fail: true, msg: '复发：左向附身防转移值' + defTransfer + ' != floor(state._baseDef/2)=' + expDef + '，可能直接操作 def 导致 Buff 重复计算' };
            }
            if (atkTransfer !== 0) {
                return { fail: true, msg: '复发：左向附身攻转移值' + atkTransfer + ' 应为0（左向只转防），疑似含 Buff 加成' };
            }
        } else {
            // 右向：只转攻，防应为 0
            var expAtk = Math.floor(sister.state._baseAtk / 2);
            if (atkTransfer !== expAtk) {
                return { fail: true, msg: '复发：右向附身攻转移值' + atkTransfer + ' != floor(state._baseAtk/2)=' + expAtk + '，可能直接操作 atk 导致 Buff 重复计算' };
            }
            if (defTransfer !== 0) {
                return { fail: true, msg: '复发：右向附身防转移值' + defTransfer + ' 应为0（右向只转攻），疑似含 Buff 加成' };
            }
        }
        return { fail: false };
    }
};
