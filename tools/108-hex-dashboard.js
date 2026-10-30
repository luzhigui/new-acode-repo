// ===== ../tools/108-hex-dashboard.js =====
import { CONFIG, getSkillParams } from '../core/01config-5v5-test.js';
import { runParallel, getPoolSize } from './117-shared-worker-runner.js';

export const VER = 'tools/108-hex-dashboard.js V6.6.6';
// V6.6.6 | 2026-10-30 脏榜根治（V6.6.5 只挡住读，旧代码仍在手机缓存里炸）：
//           ① 模块加载时一次性清扫 localStorage 里 KEY/_KEY 开头的榜，把 null/非对象条目删掉并写回
//              ——自愈后即便旧版代码读到同一批数据也不会再崩；② 三处 .buffs 取值全部补 l 空值守卫
//              （读侧过滤之外的第二道保险，任何来源的 null 都伤不到 render）；
//           ③ 配 102 V6.4.5：108 改带时间戳动态加载，穿手机浏览器缓存。
// V6.6.5 | 2026-10-30 读侧容错（修「跑批中断：Cannot read properties of null (reading 'buffs')」）：
//           存量榜数组里混进的 null 条目让 render 在 l.buffs 上抛 TypeError、跑完的批次一渲染就整场报错。
//           过滤收口在 readLogs 一处（只挑 Array 里的真对象），render/统计/模式对比/跨关表全部免疫；
//           非 Array 的坏值按空榜处理（原样返回会把 JSON.parse 出的字符串/数字当数组用，同样炸）。

(function(){
const KEY = 'ming_hex_battle_log';
// 2026-10-14 阵容模式：战绩按模式分键存储（常规沿用旧键，历史数据不丢），切换即换榜。
// 消费端在 116 runHexStageJob：四模式统一「拒绝采样重掷自然阵容」（sister=含姊 / brother=含妹 / none=无小昭），不设 force、同一把尺子。
const MODE_LABEL = { normal: '常规', sister: '仅姐姐', brother: '仅妹妹', none: '不带姐姐妹妹' };
const CMP_MODES = ['normal', 'sister', 'brother', 'none'];
const ALL_STAGES = [1, 2, 3, 4, 5, 6, 7];

// 2026-10-25 V6.3.0：存储键加关卡维——七关沿用旧键（历史数据不丢），单关加 _stageN 后缀，
// 各关/各模式互不污染。单关结果也落盘（老板定：切到该关就能看到历史，不必重跑）。
const keyFor = (mode, stage) => {
  const base = mode === 'normal' ? KEY : `${KEY}_${mode}`;
  return (stage === 'all' || stage == null) ? base : `${base}_stage${stage}`;
};
const readLogs = (mode, stage) => { try { const a = JSON.parse(localStorage.getItem(keyFor(mode, stage)) || '[]'); return Array.isArray(a) ? a.filter(l => l && typeof l === 'object') : []; } catch(e) { return []; } };
let curMode = 'normal';
let curStage = 'all';
let logs = [];

// V6.6.6 脏数据自愈：历史榜里一旦混进 null/非对象条目，旧版 render 会在 l.buffs 上崩。
//   加载时把所有相关键扫一遍、剔掉脏条目并写回——治本，不依赖「用户手动清空数据」。
(function sanitizeStoredLogs(){
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k === KEY || k.startsWith(KEY + '_'))) keys.push(k);
    }
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      let a; try { a = JSON.parse(raw); } catch (e) { continue; }
      if (!Array.isArray(a)) continue;
      const clean = a.filter(l => l && typeof l === 'object');
      if (clean.length !== a.length) localStorage.setItem(k, JSON.stringify(clean));
    }
  } catch (e) {}
})();

// 样式（一次性注入，带 hex-hex- 前缀避免污染宿主页）
if (!document.getElementById('hexDashStyle')) {
  const style = document.createElement('style');
  style.id = 'hexDashStyle';
  style.textContent = `
.hex-hex-mask{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:flex;align-items:center;justify-content:center}
.hex-hex-box{background:#1a1a2e;color:#eee;font-family:monospace;border:1px solid #444;border-radius:12px;width:min(900px,94vw);max-height:88vh;max-height:88dvh;display:flex;flex-direction:column;padding:16px}
.hex-hex-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.hex-hex-head h1{color:#ffd700;font-size:20px;margin:0}
.hex-hex-close{background:#444;color:#ccc;border:none;border-radius:8px;padding:6px 14px;font-weight:bold;cursor:pointer;font-family:monospace}
.hex-hex-tip{color:#888;font-size:12px;margin-bottom:12px;line-height:1.5}
.hex-hex-box button{padding:10px 20px;border:none;border-radius:8px;font-weight:bold;cursor:pointer;font-family:monospace;font-size:13px}
.hex-hex-load{background:#ffd700;color:#1a1a2e}
.hex-hex-clear{background:#f44336;color:#fff;margin-left:8px}
.hex-hex-box table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}
.hex-hex-box th{background:#2a2a4e;color:#ffd700;padding:8px;text-align:left}
.hex-hex-box td{padding:6px 8px;border-bottom:1px solid #333;color:#ccc}
.hex-hex-bar-wrap{background:#0a0a14;border-radius:6px;height:22px;overflow:hidden;position:relative;border:1px solid #2a2a4e}
.hex-hex-bar-center{position:absolute;left:50%;top:0;width:2px;height:100%;background:#fff;opacity:0.45;z-index:2}
.hex-hex-bar-pos{position:absolute;left:50%;top:0;height:100%;background:linear-gradient(90deg,#ffe600,#ff3d00);box-shadow:0 0 14px rgba(255,140,0,0.95);border-radius:0 5px 5px 0}
.hex-hex-bar-neg{position:absolute;right:50%;top:0;height:100%;background:linear-gradient(270deg,#29e3ff,#666688);box-shadow:0 0 14px rgba(41,227,255,0.9);border-radius:5px 0 0 5px}
.hex-hex-op{color:#f44336;font-weight:bold}
.hex-hex-weak{color:#888}
/* 2026-10-15 V6.2.6 模式对比表用小字副行显示场次（原先引用了未定义的 class） */
.hex-hex-box .cell-sub{color:#888;font-size:11px}
/* 2026-10-14 V6.2.3：第一列（海克斯名）收窄固定，别让「你就是carry」这类长名把列撑开 */
.hex-hex-box th:first-child,.hex-hex-box td:first-child{width:92px;white-space:nowrap;padding-right:4px}
.hex-hex-body{overflow:auto;flex:1}
.hex-hex-link{color:#ffd700;cursor:pointer;text-decoration:underline;font-weight:bold}
.hex-hex-detail-mask{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:10001;display:flex;align-items:center;justify-content:center}
.hex-hex-detail-box{background:#1a1a2e;color:#eee;font-family:monospace;border:1px solid #444;border-radius:12px;width:min(560px,92vw);max-height:86vh;max-height:86dvh;display:flex;flex-direction:column;padding:16px}
.hex-hex-detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.hex-hex-hero{display:flex;align-items:center;gap:12px}
.hex-hex-hero .icon{font-size:40px}
.hex-hex-hero h2{color:#ffd700;font-size:20px;margin:0}
.hex-hex-hero .sub{color:#aaa;font-size:12px;margin-top:4px;line-height:1.5}
.hex-hex-detail-body{overflow:auto;margin-top:12px}
.hex-hex-ver{background:#0f0f1a;border:1px solid #333;border-left:3px solid #666;border-radius:8px;padding:10px 12px;margin-top:10px}
.hex-hex-ver-a{border-left-color:#ffd700}
.hex-hex-ver-b{border-left-color:#ff6ec7}
.hex-hex-ver-c{border-left-color:#4fc3f7}
.hex-hex-ver h3{color:#eee;font-size:13px;margin:0 0 6px}
.hex-hex-ver h3 .tag{color:#888;font-size:11px;font-weight:normal}
.hex-hex-ver ul{margin:0;padding-left:18px}
.hex-hex-ver li{font-size:12px;color:#ccc;line-height:1.8}
.hex-hex-hint{background:rgba(255,215,0,.08);border:1px dashed #ffd700;border-radius:8px;padding:10px 12px;margin-top:12px;font-size:12px;color:#ddd;line-height:1.7}
`;
  document.head.appendChild(style);
}

// 海克斯详情文案（2026-10-21 V6.2.19 全量重写，老板指出详情卡「一大堆奇奇怪怪不对」）：
//   不再把 content 参数逐条机翻成英文键名，改为每个海克斯按 普通/姐姐/妹妹 三档写人话；
//   数字全部实时读 CONFIG.BUFFS / 小昭 hexEnhance / spiderFly / CONFIG 常量，文案与数值同源，改配置即同步。
const pct = v => Math.round(v * 100) + '%';
const pct1 = v => (Math.round(v * 1000) / 10) + '%';

const HEX_DETAIL = {
  bloodthirst: {
    normal: b => [`己方战士攻击时，按造成伤害的 ${pct(b.leechRatio)} 吸血回复生命`],
    sister: b => [`吸血 ${pct(b.leechRatio)} 不变；战士每回合首次攻击命中后，额外追加 1 次攻击`],
    brother: b => [`团队效果结束后，小昭·妹永久保留：她作为战士攻击时按 ${pct(b.leechRatio)} 吸血`]
  },
  hotBlood: {
    normal: b => [`己方单位攻击时，回复自身已损失生命的 ${pct(b.leechRatio)}；每第 ${b.critInterval} 次攻击回血翻倍`],
    sister: (b, e) => {
      const out = [];
      const lp = e.leechPct != null ? e.leechPct : b.leechRatio;
      if (Math.round(lp * 1000) !== Math.round(b.leechRatio * 1000)) out.push(`每次回复比例 ${pct(b.leechRatio)} → ${pct(lp)}`);
      out.push(`翻倍间隔 第 ${b.critInterval} 次 → 第 ${e.critInterval} 次（翻倍那次按 ${pct(lp * 2)} 回）`);
      return out;
    },
    brother: b => [`团队效果结束后，小昭·妹永久保留：她攻击时按 ${pct(b.leechRatio)} 回复已损失生命，每第 ${b.critInterval} 次翻倍`]
  },
  fortify: {
    normal: b => [`己方防战防御 +${pct(b.defBonus)}；受到伤害时，反弹 ${pct(b.reboundRatio)} 伤害差值给攻击者`],
    sister: b => [`新增：反弹时，己方防战回复等量生命`],
    brother: b => [`团队效果结束后，小昭·妹永久保留：她作为防战时防御 +${pct(b.defBonus)}，受击反弹 ${pct(b.reboundRatio)} 伤害差值`]
  },
  cloudBody: {
    normal: b => [`己方全体闪避概率 +${pct(b.dodgeBonus)}`],
    sister: (b, e) => [`闪避加成 ${pct(b.dodgeBonus)} → ${pct(e.dodgeBonus)}`],
    brother: b => [`团队效果结束后，小昭·妹永久保留：自身闪避 +${pct1(b.dodgeBonus * b.brotherRatio)}（团队版 ${pct(b.dodgeBonus)} 的 ${pct(b.brotherRatio)}）`]
  },
  windAssault: {
    normal: b => [`己方飞行单位攻击时，${pct(b.hitProb)} 概率对同行敌人追加 100% 伤害，${pct(b.pushProb)} 概率将其击退 1 格`],
    sister: (b, e) => [`追加伤害概率 ${pct(b.hitProb)} → ${pct(e.hitProb)}；击退概率 ${pct(b.pushProb)} → ${pct(e.pushProb)}`],
    brother: b => [`团队效果结束后，小昭·妹永久保留：她作为飞行单位时，按 ${pct(b.hitProb)} / ${pct(b.pushProb)} 概率追加伤害与击退`]
  },
  meteorShower: {
    normal: b => [`己方远程攻击时：对目标追加 ${pct(b.bonusRatio)} 伤害并降低其 ${b.mainDefReduce} 点防御；对目标周围单位溅射 ${pct(b.splashRatio)} 伤害并降低 ${b.splashDefReduce} 点防御`],
    sister: (b, e) => [`每次溅射命中 1 名存活目标，己方远程攻击力永久 +${e.atkPerSplash}（命中多名可叠加）`],
    brother: b => [`团队效果结束后，小昭·妹永久保留：她作为远程单位时，按 ${pct(b.bonusRatio)} 追加伤害、${pct(b.splashRatio)} 溅射并降防`]
  },
  carry: {
    normal: b => {
      const eg = (b.params && b.params.eagle) || {};
      const st = (eg.atk != null) ? `攻 ${eg.atk}／防 ${eg.def}／血 ${eg.maxHp}` : '属性随内容表';
      return [`5 号位按每名队友的基础属性分别累加：攻击 +${pct(b.atkBonus)}、防御 +${pct(b.defBonus)}、生命 +${pct(b.hpBonus)}`,
        `已阵亡队友按 ${b.deathMultiplier} 倍计入`,
        `5 号位空缺时召唤雄鹰顶位（${st}）：雄鹰命中后让一名已行动过的队友恢复行动力；若无人可恢复，改召白板雌鹰永久在场`];
    },
    sister: (b, e) => [`受益位从仅 5 号位，扩大到 ${e.targetPositions.join(' / ')} 号位（多目标）`],
    brother: b => [`团队效果结束后，小昭·妹永久保留：每回合按近期阵亡队友数重新计算加成（阵亡越多加成越高，每层取精通参数）`]
  },
  holyFlame: {
    normal: b => [`随机 ${b.atkCols} 列己方攻击 +${pct(b.atkBonus)}；随机 ${b.defRows} 行己方防御 +${pct(b.defBonus)}`],
    sister: (b, e) => [`加攻列数 ${b.atkCols} → ${e.atkCols} 列；加防行数 ${b.defRows} → ${e.defRows} 行`],
    brother: b => [`团队效果结束后，小昭·妹永久保留：每回合重新抽 ${b.atkCols} 列 ${b.defRows} 行，她站到命中列攻击 +${pct(b.atkBonus)}、命中行防御 +${pct(b.defBonus)}`]
  },
  doubleStrike: {
    normal: b => [`己方随机 2 人：各自攻击后有 ${pct(b.prob)} 概率额外再攻击 1 次（持续 ${b.duration} 回合；存活不足 2 人时只点 1 人）`],
    sister: (b, e) => [`额外攻击概率 ${pct(b.prob)} → ${pct(e.chance != null ? e.chance : 1)}（每击必追）`],
    brother: b => {
      const s = getSkillParams('小昭', 'spiderFly') || {};
      return [`团队效果结束后，小昭·妹永久保留：她攻击后有 ${pct(s.xiaoZhaoDoubleStrikeChance ?? 0.5)} 概率额外再攻击 1 次`];
    }
  },
  horseFormation: {
    normal: b => [`每回合开始召唤 1 只巨马：生命 ${b.horseHp}、防御 ${b.horseDef}、攻击 ${b.horseAtk}（基础不攻击，吃到 carry 加攻后可出手）`,
      `回合结束时 ${pct(b.destroyProb)} 概率消散；连续消散概率逐次减半，失败一次即恢复原概率`],
    sister: (b, e) => [`巨马生命 ${b.horseHp} → ${e.horseHp}；巨马防御 ${b.horseDef} → ${e.horseDef}`,
      `新增：巨马被攻击时，反弹 ${e.reboundDmg} 点伤害给攻击者`],
    brother: b => [`团队效果结束后，小昭·妹永久保留：每回合开始 ${pct(b.brotherSpawnChance)} 概率额外召唤 1 只巨马（属性同普通版）`]
  },
  mindControl: {
    normal: b => [`每回合己方最前排行动时：${pct(b.enemySwapProb)} 概率打乱敌方站位；${pct(b.allySwapProb)} 概率打乱己方站位（副作用）`],
    sister: (b, e) => {
      const out = [`扰乱敌方概率 ${pct(b.enemySwapProb)} → ${pct(e.enemySwapProb)}；扰乱己方概率 ${pct(b.allySwapProb)} → ${pct(e.allySwapProb)}`];
      if (e.dmgOnSwap) out.push(`新增：被扰乱换位的 2 名敌方各扣 ${e.dmgOnSwap} 血${e.stunOnSwap ? '，并眩晕 1 回合' : ''}`);
      if (e.healOnSwap) out.push(`新增：被我方扰乱换位的 2 人各回复 ${e.healOnSwap} 血（副作用反成收益）`);
      return out;
    },
    brother: b => [`团队效果结束后，小昭·妹永久保留：她在场时，敌方攻击有 ${pct(CONFIG.SPIDER_MIND_CONTROL_CHANCE)} 概率误伤自己人（幻象迷惑）`]
  },
  soulDrain: {
    normal: b => [`敌方全体攻击力 ${pct(b.atkBonus)}（持续 ${b.duration || CONFIG.BUFF_DURATION} 回合、每回合刷新）；敌方每比我方多 1 个存活单位，再额外 ${pct(b.perUnitBonus)}（人数不少于敌方时保底 ${pct(b.atkBonus)}）`,
      `敌方防御首次 ×${(1 + b.defBonus).toFixed(2)}，此后每回合再 ×${(1 + b.perRoundBonus).toFixed(2)}（乘法累积，越拖越脆）`],
    sister: (b, e) => [`敌方减攻 ${pct(b.atkBonus)} → ${pct(e.atkBonus)}；逆风每多 1 人 ${pct(b.perUnitBonus)} → ${pct(e.perUnitBonus)}`],
    brother: b => [`团队效果结束后，小昭·妹永久保留：每回合 ${pct(b.brotherPointChance)} 概率随机点名 1 名敌方（非巨马、非召唤物），按普通版数值继续削 2 回合（可重复点名刷新）`]
  },
  holyFire: {
    normal: b => [`每局首次有己方非巨马、非召唤物单位阵亡时，该单位在下一个行动步原地复活并回复 ${pct(b.reviveRatio)} 生命（复活即可行动），每局仅 1 次`],
    sister: (b, e) => [`复活回复生命 ${pct(b.reviveRatio)} → ${pct(e.reviveRatio)}`],
    brother: b => [`团队效果结束后，小昭·妹永久保留：她阵亡时原地复活并回复 ${pct(b.brotherReviveRatio)} 生命（每局 1 次）`]
  },
  lastStand: {
    normal: b => [`己方单位当前生命低于 ${pct(b.hpThreshold)} 时，攻击力 +${pct(b.atkBonus)}（每回合开始按当前血量重判，血回上去即失效）`],
    sister: (b, e) => {
      const out = [`触发血量阈值 ${pct(b.hpThreshold)} → ${pct(e.hpThreshold)}（团队版生效时）`];
      if (e.leechRatio) out.push(`新增：触发者造成伤害的 ${pct(e.leechRatio)} 转化为吸血回血`);
      return out;
    },
    brother: b => [`团队效果结束后，小昭·妹永久保留：任一队友生命低于 ${pct(b.hpThreshold)} 时，她也获得攻击力 +${pct(b.atkBonus)}`]
  },
  unity: {
    normal: b => {
      const ue = getSkillParams('小昭', 'hexEnhance').unity || {};
      const t0 = b.recruitTarget ?? 4;
      const t1 = ue.recruitTarget ?? t0;
      const m1 = ue.recruitM ?? b.recruitM;
      const sisterNote = t1 > t0 ? `姐姐强化补满到 ${t1} 人、M${m1}；` : '';
      return [`按己方在场存活人数取档：${b.tiers.map(t => `${t.count} 人 攻+${pct(t.atkBonus)}/防+${pct(t.defBonus)}`).join('；')}`,
        `获得当回合若不足 ${t0} 人，一次补满到 ${t0} 人（${sisterNote}M${b.recruitM}、含精英、技能全开；召唤落地钳属性下限：攻<1 归 0、防<5 补 5、血<25 补 25），此后每回合再补 1 人；补员永久存活`];
    },
    sister: (b, e) => [`补员 M 值 ${b.recruitM} → ${e.recruitM}；首回合补满人数 ${b.recruitTarget ?? 4} → ${e.recruitTarget ?? 5}`],
    brother: b => [`团队效果结束后，小昭·妹永久保留：每回合开始 ${pct(b.brotherSummonChance)} 概率召唤 1 名 M${b.recruitM} 明教英雄（技能全开）`]
  }
};

const HEX_HINTS = {
  doubleStrike: '适合阵容里有持续高输出的主 C（张无忌/韦一笑）：现在每回合随机点名 2 名宿主，触发机会比单人版明显变多；收益仍随机，对位前排密集时更稳。',
  carry: '5 号位（张无忌常驻位）越强收益越高，队友阵亡越多加成越猛——偏保核打法，张无忌在场且被集火时收益最高。',
  cloudBody: '对高频率多段攻击（普攻/连击多）的阵容克制明显；但对抗必中技能（如九阴白骨爪）无效。',
  horseFormation: '稳定的前排肉盾：每回合白给一只巨马替队伍挡刀，姐姐强化后巨马还会反弹 5 点伤害；对面战士/防战突脸多时收益最大，巨马也能吃 carry 加攻后出手。',
  meteorShower: '己方远程越多收益越高，溅射可顺带压低多目标血线；对面后排站位密集时效果拔群。',
  bloodthirst: '战士越多收益越高，提供续航；适合需要顶住多回合拉锯的阵容。',
  fortify: '防战是承伤核心时收益最高，反弹反制高攻脆皮输出；若己方无防战则几乎无用。',
  windAssault: '己方飞行单位越多越强，击退可拆散敌方阵型、打乱换位；无飞行单位时无收益。',
  holyFlame: '攻防兼备的万金油，覆盖到关键单位（张无忌/小昭）时收益最大；覆盖差时收益一般。',
  hotBlood: '站得住才赚，适合高血量或被集火的单位；每第 3/6/9 次攻击回血翻倍，爆发可观。',
  mindControl: '打乱敌方站位收益高，克制依赖站位集火的阵容；姐姐强化后换位额外扣血并眩晕 1 回合、我方被换位反而回血，副作用变收益；但己方仍有 40% 被打乱的风险，站位紧密的阵容慎选。',
  soulDrain: '目前唯一削弱型海克斯：敌方全体攻击力-30%（持续 4 回合，每回合刷新），且我方每比敌方少 1 个存活单位再 -5%（越逆风削得越狠）；敌方全体防御首次乘 0.9、此后每回合再乘 0.95（第 N 回合 = 防御×0.9×0.95^(N-1)，乘法累积越拖越脆）。姐姐强化：减攻 -45%、逆风每多 1 人 -10%；妹妹永久：团队效果结束后每回合 60% 点名 1 名敌方续削 2 回合。对面攻击手越多、越依赖普攻收益越高；对不吃攻击力的阵容（如张三丰纯续航、召唤物）收益低。',
  holyFire: '死亡交互型：每局首次有己方单位（非巨马、非召唤物）阵亡时，该单位原地复活并回复 40% 生命（复活即可行动），每局仅 1 次。反制斩杀/清场（周芷若白骨爪、灭绝三击），与小昭·妹飞天/结茧互补——她防死，这张死后回场；己方阵亡越早收益越高。',
  lastStand: '残血增伤型：己方单位血量低于 25% 时攻击力 +30%，每回合开始按当前血量重判（血回上去即失效），整局持有。适合换血流/带自损技能的角色（唐文亮七伤拳、嗜血狂刀），越到残局收益越高；纯续航阵容（张三丰）几乎吃不到。姐姐在场：阈值提到 40%，触发者造成伤害的 15% 转成吸血；妹妹永久：任一队友残血她也吃加成。',
  unity: '滚雪球人数型：随在场人数阶梯加成（5 人攻+10%/防+20%，6 人 20%/30%，7 人 30%/40%，8 人 50%/60%，9 人彩蛋 100%/100%），存活单位含召唤物/巨马都算人。获得当回合若不足 4 人则一次补满到 4（姐姐强化补满到 5、M25；M15、含精英、技能全开；到手已达标则该回合不召；召唤落地即钳属性下限：攻<1 归 0、防<5 补到 5、血<25 补到 25），此后每回合再补 1 个、持续 3 回合（唯一上限是 9 格站位）；补员永久存活，不随 buff 到期消失。适合铺场/召唤流，人越多越猛；单位少的斩杀阵容收益低。',
};

// 海克斯中文名映射（2026-10-15 V6.2.5 从 render 内部提到模块级：模式对比视图共用）
const HEX_NAME_MAP = {
  doubleStrike: '概率连击',
  horseFormation: '巨马阵',
  carry: '你就是carry',
  windAssault: '乘风突袭',
  cloudBody: '流云身法',
  mindControl: '惑人心智',
  fortify: '严阵以待',
  hotBlood: '热血奋战',
  meteorShower: '流星赶月',
  bloodthirst: '嗜血狂刀',
  holyFlame: '圣火令',
  soulDrain: '摄魂',
  holyFire: '圣火不熄',
  lastStand: '背水一战',
  unity: '众志成城'
};

// V6.6.4：上面是手工表，漏登一个新海克斯就退化成英文 key（表里出现 mindControl）。
//   补一层 content 官名兜底，与 52 的 hexLabel / 126 的 nameOf 走同一条链：
//   content 官名 → 本表 → 兜底 key。126 那边「表里会直接显示英文 key」的告警仍看本表完整性，
//   所以这层兜底不会把「忘记登记」这个信号藏掉。
function hexLabel(k) {
  if (!k) return '';
  if (HEX_NAME_MAP[k]) return HEX_NAME_MAP[k];
  try { return (CONFIG.BUFFS && CONFIG.BUFFS[k] && CONFIG.BUFFS[k].name) || k; } catch (e) { return k; }
}

// 版本卡片：kind 0=普通版 / 1=姐姐强化版 / 2=妹妹永久版
//   文案统一由 HEX_DETAIL 按档给出；未登记的新海克斯退回 content 官方描述，绝不显示英文键名。
function renderVersion(title, key, base, enhance, kind, cls) {
  const tag = kind === 0 ? '选海克斯后生效' : kind === 1 ? '自带强化' : '永久生效 ∞';
  const d = HEX_DETAIL[key];
  let lines = '';
  if (!d) {
    lines = `<li>${base.desc || '该海克斯暂无说明'}</li>`;
  } else if (kind === 1) {
    // 防御：新海克斯可能只写了 normal/brother，缺 sister 时不能直接调用
    lines = (enhance && typeof d.sister === 'function') ? (d.sister(base, enhance) || []).map(t => `<li>${t}</li>`).join('') : '';
  } else {
    // 防御：缺 brother/normal 时退回 base.desc，不让整张详情卡抛 TypeError
    const fn = kind === 2 ? d.brother : d.normal;
    const arr = (typeof fn === 'function') ? fn.call(d, base, enhance) : null;
    lines = (arr || []).map(t => `<li>${t}</li>`).join('');
    if (!lines && base.desc) lines = `<li>${base.desc}</li>`;
    lines += `<li><b>持续</b>：${kind === 2 ? '永久（无回合限制）' : (base.permanent ? '整局' : (base.duration || CONFIG.BUFF_DURATION) + ' 回合')}</li>`;
  }
  if (!lines) lines = '<li style="color:#888">该海克斯无额外强化，效果同普通版</li>';
  return `<div class="hex-hex-ver hex-hex-ver-${cls}"><h3>${title} <span class="tag">${tag}</span></h3><ul>${lines}</ul></div>`;
}

function openHexDetail(key) {
  const b = CONFIG.BUFFS[key];
  if (!b) return;
  const enhance = getSkillParams('小昭', 'hexEnhance')[key] || null;
  const mask = document.createElement('div');
  mask.className = 'hex-hex-detail-mask';
  mask.innerHTML = `
    <div class="hex-hex-detail-box">
      <div class="hex-hex-detail-head">
        <div class="hex-hex-hero"><span class="icon">${b.icon || '🎯'}</span>
          <div><h2>${b.name}</h2><div class="sub">效果按 普通版 / 姐姐强化 / 妹妹永久 三档列出（数值实时读 content 配置）</div></div>
        </div>
        <button class="hex-hex-close">关闭</button>
      </div>
      <div class="hex-hex-detail-body">
        ${renderVersion('普通版', key, b, null, 0, 'a')}
        ${renderVersion('姐姐强化版（小昭·姊）', key, b, enhance, 1, 'b')}
        ${renderVersion('妹妹永久版（小昭·妹）', key, b, null, 2, 'c')}
        ${HEX_HINTS[key] ? `<div class="hex-hex-hint">💡 判断：${HEX_HINTS[key]}</div>` : ''}
      </div>
    </div>`;
  document.body.appendChild(mask);
  mask.querySelector('.hex-hex-close').addEventListener('click', () => mask.remove());
  mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });
}

// 界面
function openHexDashboard() {
  const mask = document.createElement('div');
  mask.className = 'hex-hex-mask';
  mask.innerHTML = `
    <div class="hex-hex-box">
      <div class="hex-hex-head">
        <h1>📊 海克斯平衡性仪表盘</h1>
        <button class="hex-hex-close">关闭</button>
      </div>
      <div class="hex-hex-body">
        <p class="hex-hex-tip">点「自动跑」直接在弹窗里批量战斗（不再依赖工具箱的自动批量战斗），跑完自动出表。统计每个海克斯的：出场次数、胜率、以及与「所有海克斯的平均胜率」的差值。<br>三个选择器：① 关卡 —— 默认「七关一起」，也可单跑某一关（单关结果单独存，切到该关即自动显示历史）；② 场次 —— 每关跑多少场；③ 阵容 —— 默认「全部4种（一起跑）」：一次把 常规/仅姐姐/仅妹妹/不带姐姐妹妹 四种模式都跑完（各模式分键存储、共用同一批 seed，便于横向配对比较），跑完自动展开「模式对比」；也可只选某一种单跑。「清空数据」一次清掉四种模式 ×（七关 + 7 个单关）。</p>
        <select class="hex-hex-stage" title="关卡：七关一起 = 长期榜；单关 = 只看这一关（单独存，切到该关即显示）" style="background:#333;color:#eee;border:1px solid #555;border-radius:4px;padding:4px 6px">
          <option value="all">关卡：七关一起</option>
          <option value="1">关卡：第1关</option>
          <option value="2">关卡：第2关</option>
          <option value="3">关卡：第3关</option>
          <option value="4">关卡：第4关</option>
          <option value="5">关卡：第5关</option>
          <option value="6">关卡：第6关</option>
          <option value="7">关卡：第7关</option>
        </select>
        <select class="hex-hex-runsel" title="每关跑多少场（七关一起时每关各跑这么多；单关时就是这一关跑这么多）" style="background:#333;color:#eee;border:1px solid #555;border-radius:4px;padding:4px 6px;margin-left:6px">
          <option value="500">每关 500 场</option>
          <option value="1000">每关 1000 场</option>
          <option value="2000">每关 2000 场</option>
        </select>
        <select class="hex-hex-lineup" title="阵容模式：决定跑批时明教侧小昭的出现方式" style="background:#333;color:#eee;border:1px solid #555;border-radius:4px;padding:4px 6px;margin-left:6px">
          <option value="all" selected>阵容：全部4种（一起跑）</option>
          <option value="normal">阵容：常规</option>
          <option value="sister">阵容：仅姐姐（小昭·姊必出）</option>
          <option value="brother">阵容：仅妹妹（小昭·妹必出）</option>
          <option value="none">阵容：不带姐姐妹妹</option>
        </select>
        <button class="hex-hex-load hex-hex-run" style="margin-left:10px">⚡ 自动跑</button>
        <button class="hex-hex-cmp" title="四种阵容模式并排比同一批海克斯的胜率（按当前关卡读各模式已存榜，不重跑）" style="background:#4fc3f7;color:#1a1a2e;margin-left:6px">🔀 模式对比</button>
        <button class="hex-hex-cross" title="选一个海克斯，看它在 1–7 关 × 四种阵容模式的表现（跨关读全部已存榜，不重跑）" style="background:#81c784;color:#1a1a2e;margin-left:6px">📈 跨关对比</button>
        <button class="hex-hex-clear" style="margin-left:6px">清空数据</button>
        <span id="hexDashRunStatus" style="margin-left:10px;color:#8bc34a;font-size:12px"></span>
        <div id="hexDashSummary"></div>
        <div id="hexDashCompare"></div>
        <div id="hexDashCross"></div>
        <div id="hexDashStats"></div>
      </div>
    </div>`;
  document.body.appendChild(mask);

  // 打开即按当前关卡/模式加载对应榜单（模式记忆在模块级 curMode/curStage，弹窗重开不丢）；
  // 阵容下拉默认停在「全部4种（一起跑）」——只是跑批范围，不切榜
  const lineupSel = mask.querySelector('.hex-hex-lineup');
  const stageSel = mask.querySelector('.hex-hex-stage');
  lineupSel.value = 'all';
  stageSel.value = String(curStage);
  logs = readLogs(curMode, curStage);

  const summaryEl = mask.querySelector('#hexDashSummary');
  const statsEl = mask.querySelector('#hexDashStats');
  const compareEl = mask.querySelector('#hexDashCompare');
  const cmpBtn = mask.querySelector('.hex-hex-cmp');
  const crossEl = mask.querySelector('#hexDashCross');
  const crossBtn = mask.querySelector('.hex-hex-cross');

  // 模式对比按当前关卡读各模式榜（单关也有四模式榜），始终可用，只更新 title
  function syncCmpBtn() {
    const stageLabel = curStage === 'all' ? '七关合计' : `第${curStage}关`;
    cmpBtn.disabled = false;
    cmpBtn.style.opacity = '1';
    cmpBtn.style.cursor = 'pointer';
    cmpBtn.title = `四种阵容模式并排比同一批海克斯的胜率（按当前【${stageLabel}】读各模式已存榜，不重跑）`;
  }

  // 换关卡：自动重读对应榜（单关榜独立存储，切过去即显示历史）
  stageSel.addEventListener('change', () => {
    curStage = stageSel.value === 'all' ? 'all' : parseInt(stageSel.value, 10);
    logs = readLogs(curMode, curStage);
    compareEl.innerHTML = '';   // 换榜则收起对比视图，避免拿到旧数据
    syncCmpBtn();
    render(summaryEl, statsEl);
  });

  lineupSel.addEventListener('change', () => {
    if (lineupSel.value === 'all') return;   // 「全部4种」只是跑批范围，不切榜（看表仍按 curMode）
    curMode = lineupSel.value;
    logs = readLogs(curMode, curStage);
    compareEl.innerHTML = '';   // 换榜则收起对比视图，避免拿到旧模式的数据
    render(summaryEl, statsEl);
  });

  mask.querySelector('.hex-hex-close').addEventListener('click', () => mask.remove());
  mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });

  // 2026-10-15 V6.2.5 模式对比：展开 / 收起（内容非空即视为展开）
  cmpBtn.addEventListener('click', () => {
    if (compareEl.innerHTML) { compareEl.innerHTML = ''; return; }
    renderModeCompare(compareEl);
  });

  // 2026-10-25 V6.3.1 跨关对比：展开 / 收起（内容非空即视为展开）
  crossBtn.addEventListener('click', () => {
    if (crossEl.innerHTML) { crossEl.innerHTML = ''; return; }
    renderCrossStage(crossEl);
  });

  mask.querySelector('.hex-hex-clear').addEventListener('click', () => {
    if (!confirm('确认清空全部海克斯战斗记录？（四种阵容模式 × 七关合计 + 7 个单关，共 32 份榜）')) return;
    // V6.3.0：清空扩到全部键（4 模式 × 七关+7 单关）
    for (const m of CMP_MODES) {
      for (const s of ['all', ...ALL_STAGES]) localStorage.removeItem(keyFor(m, s));
    }
    logs = [];
    compareEl.innerHTML = '';
    crossEl.innerHTML = '';
    render(summaryEl, statsEl);
  });

  // 2026-09-27 弹窗内自带批量战斗：走 117 runParallel（kind:'hex'，细粒度分片）+ 116 Worker 池并行，
  // 主线程不再被战斗计算占死（此前串行版在移动端会弹「网页暂无响应」）。
  // 池大小 = getPoolSize()（默认吃满核心；localStorage 'battle_pool_size' 可覆盖）。
  mask.querySelector('.hex-hex-run').addEventListener('click', async () => {
    const runBtn = mask.querySelector('.hex-hex-run');
    const sel = mask.querySelector('.hex-hex-runsel');
    const status = mask.querySelector('#hexDashRunStatus');
    const per = parseInt(sel.value, 10) || 500;
    // V6.3.0 关卡选择 = 跑批范围：'all' 跑七关、数字跑单关；阵容同前（all = 四模式一起跑）
    const stageVal = stageSel.value;
    const stages = stageVal === 'all' ? ALL_STAGES : [parseInt(stageVal, 10)];
    const modeSel = lineupSel.value;
    const modes = modeSel === 'all' ? CMP_MODES : [modeSel];
    if (modes.length === 1) curMode = modes[0]; else curMode = 'normal';   // 四种一起跑时上方表显示常规
    curStage = stageVal === 'all' ? 'all' : parseInt(stageVal, 10);
    const stageLabel = curStage === 'all' ? '七关' : `第${curStage}关`;

    runBtn.disabled = true;
    { const old = document.getElementById('hexRunErrBox'); if (old) old.remove(); }   // V6.3.6 清上轮报错块
    sel.disabled = true;
    lineupSel.disabled = true;
    stageSel.disabled = true;
    cmpBtn.disabled = true;
    status.textContent = '加载战斗引擎…';
    const t0 = performance.now();
    const fmtSec = ms => (ms / 1000).toFixed(0) + 's';
    let timer = null;   // V6.3.6 提前声明：finally 也要能清（报错路径原来不清 → ❌ 被 tick 盖住成「卡死」）
    try {
      const { loadGameData } = await import('../core/01config-5v5-test.js');
      if (!CONFIG.BUFFS) { status.textContent = '加载游戏数据…'; await loadGameData(); }
      let doneRuns = 0;
      const t0run = performance.now();
      const masterSeed = Date.now();
      const total = stages.length * per * modes.length;
      // 细粒度分片：每片 25 场。原来「一整关一个 job」只有 7 个 job——喂不满 worker 池，
      // 且各关时长不一，关间负载不均会拖长尾。分片后 worker 空一片接一片，负载自然拉平。
      // seed 逐场不变：片内 seed = 关基准 + (startIndex + i) * 7919，关基准 = masterSeed + stage*131。
      // 多模式一起跑时四种模式共用同一套 seed（同关同场号对齐），方便横向做配对比较。
      const CHUNK = 25;
      const jobs = [];
      for (const m of modes) {
        for (const stage of stages) {
          const base = masterSeed + stage * 131;
          for (let s = 0; s < per; s += CHUNK) {
            jobs.push({ stage, mode: m, seed: base, startIndex: s, runs: Math.min(CHUNK, per - s), label: `${MODE_LABEL[m]}·第${stage}关#${s / CHUNK + 1}` });
          }
        }
      }
      // 2026-10-27 V6.3.5：池大小留 2 核给主线程——手机满核跑批会把刷进度行的主线程饿死，
      //   进度数字冻在半路像卡死（8 核手机 8 worker 全占是元凶）。8 核 → 6 worker，吞吐损失约两成。
      const poolSize = Math.max(2, getPoolSize() - 2);
      // ---- 落盘基建（必须在 runParallel 之前定义：onJobDone 跑批期间就会回调 queueChunk）----
      // 结果按模式分别追加进各自存储键（V6.3.0：七关沿用旧键、单关加 _stageN，互不污染）
      // 2026-10-14 V6.2.2：写入失败不再静默吞——配额满时原 catch(e){} 会让「跑完 ✅」却读回空榜显示「暂无数据」，
      //   症状与「跑不出结果」完全一样，且无从判断。现改为显式报错并提示清理；状态行同时给出实得/应有场次。
      // 2026-10-25 V6.3.3 修：七关一起跑时原实现把四模式全部记录写进了「七关合计」键，单关键一根没写
      //   → 切到单关一片空、跨关对比 1-7 行全「—」。现按每条记录自带的 rec.stage 拆写到各单关键；
      //   七关批次（stages.length>1）额外合并一份 all 键，保证「七关合计」始终是完整七关的数据
      //   （单关补跑只进单关键，不破坏 all 的每关等量假设）。
      const saveErrs = [];
      let savedRuns = 0;
      // 返回 true = 数据已落地（含「配额满但截断后写成功」）；false = 彻底写不进，留给下轮重试。
      //   不能再用 saveErrs.length 判断成功——截断提示也要进 saveErrs，那样会被误判成失败而反复重写同一批。
      const saveTo = (k, arr) => {
        if (!arr.length) return true;
        try {
          const cur = JSON.parse(localStorage.getItem(k) || '[]');
          localStorage.setItem(k, JSON.stringify(cur.concat(arr)));
          return true;
        } catch (e) {
          // V6.5.0 配额满兜底：原实现直接记错误就放弃 → 那一整片结果白跑（跑一小时全丢）。
          //   现在保留「最近一半」重试一次，并明确告诉用户丢了多少条最早的。
          //   配额约 5MB，反复跑批不做上限迟早撞上，这一步是防丢数据而不是省空间。
          try {
            const cur = JSON.parse(localStorage.getItem(k) || '[]');
            const merged = cur.concat(arr);
            const keep = merged.slice(-Math.max(1000, Math.floor(merged.length / 2)));
            localStorage.setItem(k, JSON.stringify(keep));
            saveErrs.push(`${k}:配额满，已丢弃最早 ${merged.length - keep.length} 条（保留最近 ${keep.length} 条）`);
            return true;
          } catch (e2) {
            saveErrs.push(`${k}:${(e2 && e2.name) || e2}（配额完全写不进去，本片结果丢失）`);
            return false;
          }
        }
      };
      // V6.3.5 增量落盘：片结果先攒内存（pending），tick 每 2 秒刷一次盘，跑完再补刷一次。
      //   原实现攒到全部跑完才一次性写——跑批全程 0 条落盘，中途关页/手机卡死全部白跑，
      //   且表格一直「暂无数据」，观感就是「绿色跳一下然后卡住」。拆键规则与 V6.3.3 一致：
      //   按 rec.stage 拆单关键，七关批次额外合并 all 键；写失败显式记入 saveErrs（V6.2.2）。
      const pending = {};   // key -> 待刷记录
      const queueChunk = (mode, records) => {
        if (!records || !records.length) return;
        // V6.4.0：给每条记录打「落盘时间」。以前 log 只有 {stage,buffs,winner}，下游
        //   （126 平衡告警的「数据健康」）完全无法判断这份榜是三小时前还是三周前跑的——
        //   主代码改过数值后还拿旧榜判读，就会得出错误结论。
        //   只加字段、不改结构：旧的没 ts 的记录照样能读，下游会把它们标成「无时间戳的旧数据」。
        const now = Date.now();
        for (const rec of records) if (rec && !rec.ts) rec.ts = now;
        const byStage = {};
        for (const rec of records) (byStage[rec.stage] || (byStage[rec.stage] = [])).push(rec);
        for (const stStr of Object.keys(byStage)) {
          const k = keyFor(mode, parseInt(stStr, 10));
          (pending[k] || (pending[k] = [])).push(...byStage[stStr]);
          savedRuns += byStage[stStr].length;
        }
        if (stages.length > 1) (pending[keyFor(mode, 'all')] || (pending[keyFor(mode, 'all')] = [])).push(...records);
      };
      const flushPending = () => {
        for (const k of Object.keys(pending)) {
          // V6.5.0：改用 saveTo 的返回值判断，不再看 saveErrs.length
          //   （配额截断也会 push 一条提示，用长度判断会把已落地的批次误判成失败而反复重写）
          if (saveTo(k, pending[k])) delete pending[k];
        }
      };
      let lastFlush = 0;
      const tick = () => {
        const el = performance.now() - t0run;
        const eta = doneRuns > 0 && doneRuns < total ? (el / doneRuns) * (total - doneRuns) : 0;
        status.textContent = `⏳ ${doneRuns}/${total} 场完成（${jobs.length} 片｜${poolSize} 线程并行）｜已用 ${fmtSec(el)}${doneRuns < total && doneRuns > 0 ? '｜预计还要 ' + fmtSec(eta) : ''}`;
        // V6.3.5 增量落盘：每 2 秒把攒着的片结果刷进 localStorage（每片直接全量读写是 O(片数²) 字符串开销）
        if (doneRuns < total && performance.now() - lastFlush > 2000) { lastFlush = performance.now(); flushPending(); }
      };
      timer = setInterval(tick, 500);
      await runParallel({
        jobs,
        kind: 'hex',
        poolSize,
        nextJobMsg: (job, id) => ({ jobId: id, kind: 'hex', stage: job.stage, seed: job.seed, startIndex: job.startIndex, runs: job.runs, lineupMode: job.mode }),
        onJobDone: (finished, jobTotal, job, result) => {
          doneRuns += job.runs;
          if (result && result.hexLog) queueChunk(job.mode, result.hexLog);   // V6.3.5 攒片等刷盘
        }
      });
      clearInterval(timer);
      flushPending();   // V6.3.5 跑完补刷剩余攒批（定义已上移到 runParallel 之前，规避 TDZ）
      const dt = ((performance.now() - t0) / 1000).toFixed(1);
      const scope = (modes.length > 1 ? '全部4种阵容' : MODE_LABEL[modes[0]]) + ' · ' + stageLabel;
      if (saveErrs.length) {
        status.textContent = `⚠️ 【${scope}】跑了 ${total} 场、已存 ${savedRuns} 场，写入失败（${saveErrs.join(' / ')}）——多半是存储配额已满。请点「清空数据」清掉旧榜后重跑。`;
      } else {
        const lost = total - savedRuns;
        status.textContent = `✅ 完成【${scope}】：${savedRuns}/${total} 场记录，总耗时 ${dt}s（${poolSize} 线程并行）${lost > 0 ? '｜⚠️ 有丢场' : ''}`;
      }
      logs = readLogs(curMode, curStage);
      render(summaryEl, statsEl);
      if (curStage === 'all' && modes.length > 1) {
        // 七关 + 四模式一起跑完：上方表显示 curMode（常规），并自动展开四模式对比
        compareEl.innerHTML = '';
        renderModeCompare(compareEl);
      }
      crossEl.innerHTML = '';   // 新数据已写入，收起跨关表（再点会读到最新）
    } catch (e) {
      const _msg = (e && e.message) ? e.message : String(e);
      status.textContent = '❌ 失败：' + _msg;
      // V6.3.6 页内显著报错块：红底白字摊在面板上，不受状态行刷新影响（TA 令：报错必须页面直接可见）
      try {
        const old = document.getElementById('hexRunErrBox'); if (old) old.remove();
        const box = document.createElement('div');
        box.id = 'hexRunErrBox';
        box.style.cssText = 'background:#c0392b;color:#fff;padding:12px 16px;border-radius:8px;font-weight:700;font-size:14px;margin:10px 0;white-space:pre-wrap;word-break:break-all;line-height:1.5';
        box.textContent = '⚠️ 跑批中断：' + _msg;
        status.insertAdjacentElement('afterend', box);
      } catch (e2) {}
      console.error('[108] 跑批失败（全栈）：', e);
    } finally {
      if (timer) { clearInterval(timer); timer = null; }   // V6.3.6：报错路径也清 tick——否则 ❌ 上屏 500ms 就被冻住的 ⏳ 盖回去
      runBtn.disabled = false;
      sel.disabled = false;
      lineupSel.disabled = false;
      stageSel.disabled = false;
      syncCmpBtn();
    }
  });

  syncCmpBtn();
  render(summaryEl, statsEl);
}

// ============ 2026-10-15 V6.2.5 模式对比：常规 / 仅姐姐 / 仅妹妹 / 不带姐姐妹妹 并排 ============
// 数据来源：四个模式各自分键已存的 raw 战绩（V6.2.1 起分键），现场聚合，不需要重跑批。
// 用途：本表主视图一次只能看一个模式（切下拉换榜），这张表把同一批海克斯横向摆一起。
// V6.6.3 两把尺子（别改回单尺子）：
//   ① 判强弱用「常规模式海克斯平均」——拿过海克斯的局活得更久、天生更容易赢，只有同口径能比；
//   ② 判姐姐/妹妹强化到位没，用「净」=（本模式胜率 − 常规胜率）−（本模式总胜率 − 常规总胜率）。
//   拿全场总胜率当 ① 的尺子会出现「15 张全部虚高」（V6.6.2 的错误），别重犯。
// V6.3.0：只读七关榜（stage='all'）——单关数据不参与模式对比。

function hexStatsOf(logs) {
  const per = {};
  let allyWins = 0;
  for (const l of logs) {
    if (l && l.winner === '明教') allyWins++;
    for (const k of ((l && l.buffs) || [])) {
      if (!per[k]) per[k] = { count: 0, wins: 0 };
      per[k].count++;
      if (l.winner === '明教') per[k].wins++;
    }
  }
  return { total: logs.length, allyWins, per };
}

// V6.6.0：模式对比表四项优化（都是这张表本身的毛病，不动数据结构）
//   ① 补「Δ 不带」——原来 4 个模式列只给 3 个 Δ，最右边那列没有 Δ，不对称也不好横向比。
//   ② Δ 改成按统计显著性着色——原来 |Δ|≥1pp 就上色，于是 332 场的 ±1pp 噪声和 874 场的 +6.6pp
//      一样显眼，满屏黄蓝等于没重点。现在只有超过 1.96×标准误才上色并标 ▲/▼，否则灰显。
//   ③ 表头可点排序——原来写死按「常规胜率」，想看「谁最吃姐姐」得自己横着扫 Δ 列。
//   ④ 每格 title 给出该格的噪声线（±1.96×SE），让「这个数能不能当真」随手可查。
let cmpSortMode = 'netSister';

function renderModeCompare(box) {
  const data = {};
  let any = false;
  for (const m of CMP_MODES) {
    const lg = readLogs(m, curStage);   // 按当前关卡读各模式榜（单关也有各自的榜）
    if (lg.length) any = true;
    data[m] = hexStatsOf(lg);
  }
  const stageLabel = curStage === 'all' ? '七关合计' : `第${curStage}关`;
  if (!any) {
    box.innerHTML = `<p style="color:#888;margin-top:12px">四个模式都还没有【${stageLabel}】数据。用上面的「阵容」下拉切到某个模式 → ⚡ 自动跑，跑完换下一个模式再跑；四个都跑过就能在这里并排比。</p>`;
    return;
  }

  // V6.6.3 两把尺子，各管各的问：
  //   ① modeHexAvg[m] = 该模式各海克斯胜率的简单平均 —— 判「这枚海克斯本身强不强」（Δ常规）。
  //      只能拿「同样拿过海克斯的局」当尺子：拿过海克斯的局活得久、天生更容易赢，全场总胜率
  //      当尺子会让 15 张全部虚高（V6.6.2 就是这么错的，满屏 +）。
  //   ② modeTotal[m] = 该模式真实总胜率（明教胜/总场）—— 判「姐姐/妹妹本人」带来的整体涨跌，
  //      只在「净」列里当减项用。
  const modeTotal = {}, modeHexAvg = {};
  for (const m of CMP_MODES) {
    modeTotal[m] = data[m].total ? (data[m].allyWins / data[m].total) * 100 : null;
    const ks = Object.keys(data[m].per).filter(k => data[m].per[k].count > 0);
    modeHexAvg[m] = ks.length ? ks.reduce((a, k) => a + data[m].per[k].wins / data[m].per[k].count, 0) / ks.length * 100 : null;
  }
  // 姐姐/妹妹本人带来的整体胜率变化 = 该模式总胜率 − 常规总胜率（净列要扣掉的就是这个）
  const offOf = m => (modeTotal[m] !== null && modeTotal.normal !== null) ? modeTotal[m] - modeTotal.normal : null;
  const OFF = { sister: offOf('sister'), brother: offOf('brother'), none: offOf('none') };

  const keys = new Set();
  CMP_MODES.forEach(m => Object.keys(data[m].per).forEach(k => keys.add(k)));
  const rows = [...keys].map(k => {
    const cell = {};
    for (const m of CMP_MODES) {
      const d = data[m].per[k];
      cell[m] = (d && d.count) ? { rate: d.wins / d.count * 100, count: d.count } : null;
    }
    const c0 = cell.normal;
    // 强弱：常规模式下这枚海克斯相对「常规海克斯平均」高多少
    const dNormal = (c0 && modeHexAvg.normal !== null) ? c0.rate - modeHexAvg.normal : null;
    // 净 =（本模式胜率 − 常规胜率）−（本模式总胜率 − 常规总胜率）
    const net = {};
    for (const m of ['sister', 'brother', 'none']) {
      const c = cell[m];
      net[m] = (c && c0 && OFF[m] !== null) ? (c.rate - c0.rate) - OFF[m] : null;
    }
    return { key: k, cell, dNormal, net };
  });
  // 排序（V6.6.3）：默认按「姐姐净」降序——「姐姐强化到这枚海克斯到底有没有跑赢姐姐本人」是主问题
  const SORT_KEYS = new Set([...CMP_MODES, 'deltaNormal', 'netSister', 'netBrother', 'netNone']);
  const sortVal = (r, k) => {
    if (k === 'deltaNormal') return r.dNormal !== null ? r.dNormal : -9999;
    if (k === 'netSister') return r.net.sister !== null ? r.net.sister : -9999;
    if (k === 'netBrother') return r.net.brother !== null ? r.net.brother : -9999;
    if (k === 'netNone') return r.net.none !== null ? r.net.none : -9999;
    return r.cell[k] ? r.cell[k].rate : -9999;
  };
  const curSort = SORT_KEYS.has(cmpSortMode) ? cmpSortMode : 'netSister';
  rows.sort((a, b) => (sortVal(b, curSort) - sortVal(a, curSort)) || a.key.localeCompare(b.key));

  const rateTd = c => c
    ? `<td>${c.rate.toFixed(1)}%<div class="cell-sub">${c.count} 场</div></td>`
    : '<td style="color:#666">—</td>';
  // Δ 格（V6.6.0）：只有超过 1.96×标准误才算真差异，否则灰显、不标箭头。
  //   332 场和 874 场的噪声线差一倍多，只看数字正负会被噪声牵着改数值。
  const paint = (dv, band, tip) => {
    const sig = Math.abs(dv) >= band;
    const col = sig ? (dv > 0 ? '#ffd700' : '#4fc3f7') : '#666';
    const mark = sig ? (dv > 0 ? '▲' : '▼') : '';
    return `<td style="color:${col}" title="${tip}｜噪声线 ±${band.toFixed(1)}%，${sig ? '超出 → 可信' : '未超出 → 可能只是随机波动'}">`
      + `${mark}${dv > 0 ? '+' : ''}${dv.toFixed(1)}%</td>`;
  };
  const deltaTd = (c, base) => {
    if (!c || base === null) return '<td style="color:#666">—</td>';
    const dv = c.rate - base;
    const se = Math.sqrt((c.rate / 100) * (1 - c.rate / 100) / c.count) * 100;
    return paint(dv, 1.96 * se, `${c.count} 场`);
  };
  // 净格：两个比例之差，噪声 = 两格各自标准误合成（模式总胜率那半截是全场次共享常数，行间不影响排序）
  const netTd = (c, c0, off, label) => {
    if (!c || !c0 || off === null) return '<td style="color:#666">—</td>';
    const dv = (c.rate - c0.rate) - off;
    const se = Math.sqrt((c.rate / 100) * (1 - c.rate / 100) / c.count + (c0.rate / 100) * (1 - c0.rate / 100) / c0.count) * 100;
    return paint(dv, 1.96 * se, `${label} ${c.rate.toFixed(1)}% − 常规 ${c0.rate.toFixed(1)}% = ${(c.rate - c0.rate >= 0 ? '+' : '')}${(c.rate - c0.rate).toFixed(1)}pp，再扣${label}本人 ${(off >= 0 ? '+' : '')}${off.toFixed(1)}pp`);
  };

  let html = `<div style="color:#ffd700;font-weight:bold;margin:16px 0 6px">🔀 模式对比：同一批海克斯在四种阵容模式下的胜率（${stageLabel}）</div>`;
  html += `<p style="color:#999;font-size:12px;margin:0 0 8px">取自各模式已存的【${stageLabel}】榜（不重跑）。`
    + `① 判「这枚海克斯本身强不强」看 <b>强弱Δ常规</b> = 常规胜率 − 常规模式海克斯平均（拿过海克斯的局活得更久、天生更容易赢，只能拿同口径的局当尺子）。<br>`
    + `② 判「姐姐/妹妹的强化到没到位」看 <b>净</b>列 = （本模式胜率 − 常规胜率）−（本模式总胜率 − 常规总胜率）——后半截就是姐姐/妹妹本人带来的整体涨跌，扣掉它，剩下的才是这枚海克斯额外吃到的。`
    + `<b style="color:#ffd700">净 &gt; 0 = 吃到了红利</b>，<b style="color:#4fc3f7">净 &lt; 0 = 增益没跑赢姐姐/妹妹本人</b>。<br>`
    + `③ 自带校验：<b>不带净</b> 该 ≈ 0（没姐姐没妹妹，扣完就不该有变化）；这一列满屏 ±3% 就说明数据有别的偏差。`
    + `<b style="color:#ffd700">▲ 黄</b>/<b style="color:#4fc3f7">▼ 蓝</b> = 超 ±1.96×标准误，<span style="color:#666">灰 = 噪声内别当真</span>。点表头排序。</p>`;
  html += '<table><tr><th>海克斯</th>';
  for (const m of CMP_MODES) {
    const active = m === curSort;
    html += `<th data-sort="${m}" style="cursor:pointer;${active ? 'color:#4fc3f7' : ''}" title="点击按「${MODE_LABEL[m]}」胜率排序">${MODE_LABEL[m]}${active ? ' ▼' : ''}</th>`;
  }
  const netHead = (k, label, off, active) => `<th data-sort="${k}" style="cursor:pointer;${active ? 'color:#4fc3f7' : ''}" title="点击按此列排序；扣掉${label}本人 ${off !== null ? (off >= 0 ? '+' : '') + off.toFixed(1) + 'pp' : '（无常规数据）'}">${label}${active ? ' ▼' : ''}</th>`;
  html += `<th data-sort="deltaNormal" style="cursor:pointer;${curSort === 'deltaNormal' ? 'color:#4fc3f7' : ''}" title="点击按此列排序：常规模式胜率 − 常规海克斯平均">强弱Δ常规${curSort === 'deltaNormal' ? ' ▼' : ''}</th>`;
  html += netHead('netSister', '姐姐净', OFF.sister, curSort === 'netSister');
  html += netHead('netBrother', '妹妹净', OFF.brother, curSort === 'netBrother');
  html += netHead('netNone', '不带净', OFF.none, curSort === 'netNone');
  html += '</tr>';
  // 基准行：各模式真实总胜率（净列要扣的那截）+ 常规的海克斯平均（强弱Δ的尺子）
  html += '<tr><td style="color:#888">本模式总胜率</td>'
    + CMP_MODES.map(m => {
      const off = (m !== 'normal' && OFF[m] !== null) ? `｜较常规 ${OFF[m] >= 0 ? '+' : ''}${OFF[m].toFixed(1)}pp` : '';
      return `<td style="color:#ccc">${data[m].total} 场<div class="cell-sub">明教胜 ${modeTotal[m] !== null ? modeTotal[m].toFixed(1) + '%' : '—'}${off}</div></td>`;
    }).join('')
    + `<td style="color:#888">尺子<div class="cell-sub">常规海克斯平均 ${modeHexAvg.normal !== null ? modeHexAvg.normal.toFixed(1) + '%' : '—'}</div></td>`
    + '<td style="color:#666">—</td><td style="color:#666">—</td><td style="color:#666">—</td></tr>';
  for (const r of rows) {
    html += `<tr><td class="hex-hex-link" data-key="${r.key}" title="点击查看详情">${hexLabel(r.key)}</td>`
      + CMP_MODES.map(m => rateTd(r.cell[m])).join('')
      + deltaTd(r.cell.normal, modeHexAvg.normal)
      + netTd(r.cell.sister, r.cell.normal, OFF.sister, '仅姐姐')
      + netTd(r.cell.brother, r.cell.normal, OFF.brother, '仅妹妹')
      + netTd(r.cell.none, r.cell.normal, OFF.none, '不带')
      + '</tr>';
  }
  html += '</table>';
  box.innerHTML = html;
  box.querySelectorAll('.hex-hex-link').forEach(td => td.addEventListener('click', () => openHexDetail(td.dataset.key)));
  // 点表头换排序（V6.6.0）
  box.querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', () => {
    cmpSortMode = th.dataset.sort;
    renderModeCompare(box);
  }));
  // 2026-10-15 V6.2.6：对比表插在统计表上方仍可能被统计表的滚动位置挤到视野外，渲染后主动滚进视口
  box.scrollIntoView({ block: 'nearest' });
}

// ============ 2026-10-25 V6.3.1 跨关对比：单个海克斯在 1–7 关 × 四种阵容模式的表现 ============
// 数据全部来自各关各模式已存的榜（不重跑）。Δ = 该海克斯胜率 − 同关同模式全海克斯平均（与 108 主表同口径）。
function renderCrossStage(box, keepKey) {
  const stageList = ['all', 1, 2, 3, 4, 5, 6, 7];
  const stageLabel = st => st === 'all' ? '七关合计' : `第${st}关`;
  const data = {};   // data[stage][mode] = { total, allyWins, per, avg }
  let any = false;
  const allKeys = new Set();
  for (const st of stageList) {
    data[st] = {};
    for (const m of CMP_MODES) {
      const lg = readLogs(m, st);
      if (lg.length) any = true;
      const s = hexStatsOf(lg);
      const ks = Object.keys(s.per).filter(k => s.per[k].count > 0);
      s.avg = ks.length ? ks.reduce((a, k) => a + s.per[k].wins / s.per[k].count, 0) / ks.length * 100 : null;
      data[st][m] = s;
      for (const k of ks) allKeys.add(k);
    }
  }
  if (!any) {
    box.innerHTML = '<p style="color:#888;margin-top:12px">还没有任何关卡/模式的榜数据。先跑一批再来。</p>';
    return;
  }
  const name = hexLabel;
  const keysArr = [...allKeys].sort((a, b) => name(a).localeCompare(name(b), 'zh'));
  const selKey = (keepKey && keysArr.includes(keepKey)) ? keepKey : keysArr[0];

  let html = '<div style="color:#ffd700;font-weight:bold;margin:16px 0 6px">📈 跨关对比：单个海克斯在 1–7 关 × 四种阵容模式的表现</div>';
  html += '<p style="color:#999;font-size:12px;margin:0 0 8px">行 = 关卡（含七关合计）；列 = 四种阵容模式。每格「胜率% / 场次」，下方 Δ = 该海克斯胜率 − <b>同关同模式全海克斯平均</b>（净增益，已排除模式整体强度差），正数=本关本模式偏强、负数=偏弱。某关某模式没数据就显示「—」。</p>';
  html += '<div style="margin-bottom:10px">海克斯：<select class="hex-hex-crosskey" style="background:#333;color:#eee;border:1px solid #555;border-radius:4px;padding:4px 6px">';
  for (const k of keysArr) html += `<option value="${k}"${k === selKey ? ' selected' : ''}>${name(k)}</option>`;
  html += '</select></div>';

  html += '<table><tr><th>关卡</th>' + CMP_MODES.map(m => `<th>${MODE_LABEL[m]}</th>`).join('') + '</tr>';
  for (const st of stageList) {
    // 每关都出一行；没跑过的关各格显示「—」，别整行跳过（跳了会让人误以为被挡住）
    html += `<tr><td style="color:#ffd700;font-weight:bold;white-space:nowrap;padding:6px 8px">${stageLabel(st)}</td>`;
    // Δ 基准 = 本关本模式全海克斯平均（净增益，已排除模式整体强度差）
    for (const m of CMP_MODES) {
      const s = data[st][m];
      const d = s.per[selKey];
      if (!d || !d.count) { html += '<td style="color:#666">—</td>'; continue; }
      const rate = d.wins / d.count * 100;
      const rcol = rate >= 50 ? '#4caf50' : rate >= 25 ? '#ffd700' : '#ff5252';
      html += `<td style="color:${rcol};font-weight:bold">${rate.toFixed(1)}%<div class="cell-sub">${d.count} 场</div>`;
      if (s.avg !== null) {
        const delta = rate - s.avg;
        const dcol = Math.abs(delta) < 1 ? '#888' : (delta > 0 ? '#ffd700' : '#4fc3f7');
        html += `<div class="cell-sub" style="color:${dcol}">Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}</div>`;
      }
      html += '</td>';
    }
    html += '</tr>';
  }
  html += '</table>';
  box.innerHTML = html;
  box.querySelector('.hex-hex-crosskey').addEventListener('change', e => {
    renderCrossStage(box, e.target.value);
  });
  box.scrollIntoView({ block: 'nearest' });
}

// 渲染
function render(summary, stats) {
  if (logs.length === 0) {
    summary.innerHTML = '';
    const stageLabel = curStage === 'all' ? '七关合计' : `第${curStage}关`;
    stats.innerHTML = `<p style="color:#888;margin-top:16px">【${MODE_LABEL[curMode]} · ${stageLabel}】暂无数据。点上方「⚡ 自动跑」跑一批，或换关卡/阵容看别的榜。</p>`;
    return;
  }

  const total = logs.length;
  const allyWins = logs.filter(l => l && l.winner === '明教').length;
  const enemyWins = logs.filter(l => l && l.winner === '六大派').length;
  const draws = total - allyWins - enemyWins;
  const stageLabel = curStage === 'all' ? '七关合计' : `第${curStage}关`;

  // V6.4.1：显示这批榜是什么时候跑的。V6.4.0 起每条记录带 ts，更早的数据没有 ts。
  //   没有这行的话，跑完隔几天再打开，完全分不清看到的是新数据还是旧数据。
  let timeLine = '';
  {
    let newest = 0, oldest = 0, withTs = 0;
    for (const l of logs) {
      const t = l && l.ts;
      if (typeof t === 'number' && t > 0) {
        withTs++;
        if (newest === 0 || t > newest) newest = t;
        if (oldest === 0 || t < oldest) oldest = t;
      }
    }
    if (withTs > 0) {
      const dNew = (Date.now() - newest) / 86400000;
      const fmtD = t => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
      const ageTxt = dNew < 1 / 24 ? '刚刚' : (dNew < 1 ? Math.round(dNew * 24) + ' 小时前' : dNew.toFixed(1) + ' 天前');
      timeLine = `<p style="margin:2px 0 0;color:#888;font-size:12px">数据时间：${fmtD(oldest)} ~ ${fmtD(newest)}，最近一批 ${ageTxt}`
        + (withTs < total ? `（其中 ${total - withTs} 条是加时间戳之前的旧数据）` : '')
        + (dNew > 14 ? '　<b style="color:#ffb74d">⚠️ 超过 14 天，改过数值请重跑</b>' : '') + '</p>';
    } else {
      timeLine = `<p style="margin:2px 0 0;color:#888;font-size:12px">数据时间：无记录（这批是 108 V6.4.0 之前跑的，重跑一次就会带上时间）</p>`;
    }
  }
  summary.innerHTML = `<p style="margin-top:12px;color:#ccc">阵容【<b style="color:#ff6ec7">${MODE_LABEL[curMode]}</b>】｜${stageLabel}｜共 <b style="color:#ffd700">${total}</b> 场：明教胜 ${allyWins}，六大派胜 ${enemyWins}，平局 ${draws}</p>` + timeLine;

  const hexKeys = new Set();
  logs.forEach(l => ((l && l.buffs) || []).forEach(b => hexKeys.add(b)));

  // 第一遍：先算出每个海克斯各自的胜率
  const perKey = [];
  for (const key of hexKeys) {
    const withHex = logs.filter(l => (l && (l.buffs || [])).includes(key));
    const winRate = (withHex.filter(l => l && l.winner === '明教').length / withHex.length) * 100;
    perKey.push({ key, withHex, winRate });
  }

  // 2026-09-20 基准 =「所有海克斯各自胜率的平均」（用户拍板，合并时保留此口径）：
  // buff 数≈这局打了多久，"海克斯多"的局本来就更容易赢 → 任何海克斯的样本都偏向这些局。
  // 注意：全场次平均胜率（含任意海克斯的场次的胜率）当尺子时人人虚高、差值仍全为正——
  // 只有拿"参赛者平均水平"当尺子，共同虚高才会在相减时抵消，剩下的才是海克斯之间的相对强弱。
  const avgRate = perKey.length > 0
    ? perKey.reduce((s, x) => s + x.winRate, 0) / perKey.length
    : null;

  // 2026-09-20 判定线自适应：不再定死 ±8，而是跟着差值的离散程度（标准差 σ）走——
  // 大家挤在一起（σ ≤ 2）→ 底线 2% 以内不判 OP/WEAK；排名拉开了 → 超出 σ 才算离群。
  // 效果：整体平衡时表里干干净净没有标签，真有 outlier 时才浮出来。
  const allDiffs = perKey.map(x => (avgRate !== null ? x.winRate - avgRate : 0));
  const sigma = allDiffs.length > 1
    ? Math.sqrt(allDiffs.reduce((s, d) => s + d * d, 0) / allDiffs.length)
    : 0;
  const tagLine = Math.max(2, sigma);
  if (avgRate !== null) {
    summary.innerHTML += `<p style="color:#999;font-size:12px;margin-top:2px">海克斯平均基准 ${avgRate.toFixed(1)}%｜判定线 ±${tagLine.toFixed(1)}%（自适应：差距大线就宽，都挤在一起就不判）</p>`;
  }

  const rows = [];
  for (const { key, withHex, winRate } of perKey) {
    const diff = avgRate !== null ? winRate - avgRate : null;

    let tag = '';
    if (withHex.length >= 10 && diff !== null) {
      if (diff > tagLine) tag = '<span class="hex-hex-op">OP</span>';
      else if (diff < -tagLine) tag = '<span class="hex-hex-weak">WEAK</span>';
    }

    const baseText = avgRate !== null ? `${avgRate.toFixed(1)}%` : '无样本';
    const diffText = diff !== null ? (diff > 0 ? `+${diff.toFixed(1)}%` : diff.toFixed(1) + '%') : '-';
    const diffScale = 6; // 差值刻度：越小条越长（6 → 差 6% 即顶满半幅，视觉更夸张）
    const posPct = diff !== null && diff > 0 ? Math.min(diff / diffScale * 50, 50) : 0;
    const negPct = diff !== null && diff < 0 ? Math.min(Math.abs(diff) / diffScale * 50, 50) : 0;

    rows.push({ key, name: hexLabel(key), count: withHex.length, winRate, baseRate: avgRate, diff, diffText, baseText, posPct, negPct, tag });
  }

  // 2026-10-14 按胜率从高到低排（同率时出场多的在前，次序稳定）
  rows.sort((a, b) => (b.winRate - a.winRate) || (b.count - a.count));

  let html = '<table><tr><th>海克斯</th><th>出场</th><th>胜率</th><th>海克斯平均</th><th>差值</th><th>判定</th><th>差值可视化</th></tr>';
  for (const r of rows) {
    html += `<tr>
      <td class="hex-hex-link" data-key="${r.key}" title="点击查看详情">${r.name}</td>
      <td>${r.count}</td>
      <td>${r.winRate.toFixed(1)}%</td>
      <td>${r.baseText}</td>
      <td>${r.diffText}</td>
      <td>${r.tag || '-'}</td>
      <td><div class="hex-hex-bar-wrap"><div class="hex-hex-bar-center"></div><div class="hex-hex-bar-pos" style="width:${r.posPct}%"></div><div class="hex-hex-bar-neg" style="width:${r.negPct}%"></div></div></td>
    </tr>`;
  }
  html += '</table>';
  stats.innerHTML = html;
  stats.querySelectorAll('.hex-hex-link').forEach(td => td.addEventListener('click', () => openHexDetail(td.dataset.key)));
}

// 2026-10-18 暴露文案登记表的 key 清单，供 126 平衡告警查「新增海克斯漏登记」
//   （HEX_HINTS / HEX_NAME_MAP 是手工表，漏登则表里只显示 key、点开也没有判断提示）
window.__hexDocKeys = { hints: Object.keys(HEX_HINTS), names: Object.keys(HEX_NAME_MAP) };
window.openHexDashboard = openHexDashboard;
})();