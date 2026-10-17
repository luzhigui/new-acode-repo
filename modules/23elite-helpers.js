// modules/23elite-helpers.js — 精英组件公共小工具
// V1.0.0 | ~450 bytes | 2026-10-17 新建：收敛 5 份同形 pushInfo
//   （27elite-mingjiao-yintianzheng / -xiexun / -hanlisa、26elite-sixsects-pangyuanqiao / -miejueshitai）
export const VER = 'modules/23elite-helpers.js V1.0.0';

// 往本击攻击组（ATTACK fact 的 data）里追加一行文本。
//   攻击组不存在（技能在组外触发）时静默跳过——行为与抽离前 5 份内联实现一致。
export function pushInfo(data, text) {
    if (data && data.group && data.group.data && data.group.data.entries) {
        data.group.data.entries.push({ type: 'info', text });
    }
}
