﻿﻿﻿﻿﻿﻿# 光明顶 5v5 游戏设定汇总

版本：V5.2.0  
整理日期：2026-07-20  

> 本文件汇总了光明顶 5v5 对战游戏的所有设定，按"重要程度从高到低"排序。  
> 包含：已确认实现的基础设定、代码层面的逻辑设定、以及部分备注/遗留设定。

---

## 一、核心战斗公式（最重要）

### 1.1 单位基础属性生成

每个单位有一个 **M 值**（强度值），所有属性由 M 值随机拆分：

```
hp  = rand(ceil(m × 0.4), floor(m × 0.6))
rem = m - hp
```

- `hp` 是"生命基数"，不是最终血量。
- 最终 `maxHp = hp × 2.5`。

**攻击/防御分配**：

| 职业 | 防御分配 | 攻击分配 | 约束条件 |
|------|----------|----------|----------|
| 防战 | def = rand(ceil(rem×0.5), rem-1) | atk = rem - def | def - atk ≤ 20（若超出则重 roll） |
| 其他 | def = rand(ceil(rem×0.3), floor(rem×0.5)) | atk = rem - def | 3 ≤ atk - def ≤ 13（若超出则重 roll） |

### 1.2 职业属性加成（Unit.applyBonus）

```
战士：atk +3, def +2, maxHp +25
防战：atk -7, def +0, maxHp +30
远程：atk +6, def -2, maxHp -25
飞行：atk +2, def -2, maxHp -25
```

### 1.3 基础伤害公式

```javascript
calcDamage(atk, def) = atk × (atk / (atk + def))
```

- 若 `def ≤ 0`，伤害 = `atk`。
- 保底伤害 = `atk × 0.1`。

### 1.4 实际攻击伤害计算流程

一次攻击的完整伤害计算：

```
atkBase = floor(unit.atk)
defBase = floor(target.def)
atkVar = rand(0, 6)          // 攻击波动
defVar = rand(0, 4)          // 防御波动
hpBonus = rand(0, 5)         // 血量波动（加给目标当前血量）

// Buff 加成
attackerBuffStats = computeBuffStats(unit, activeBuffs, allyTeam)
defenderBuffStats = computeBuffStats(target, activeBuffs, allyTeam)

displayAtk = atkBase + floor(unit.atk × attackerBuffStats.atkBonus)
displayDef = defBase + floor(target.def × defenderBuffStats.defBonus)

atkAct = displayAtk + atkVar
defAct = displayDef + defVar

// 目标先加血量波动
target.hp += hpBonus
```

#### 1.4.1 非防战伤害

```
raw = calcDamage(atkAct, defAct)
```

#### 1.4.2 防战伤害（带 K 值破防）

```
displayDef = floor(unit.def + unit.def × attackerBuffStats.defBonus)
lv = getFangLevel(displayDef, unit.m)   // 根据防御/M值比例查表
k  = C.FANG_K[lv]                       // K 值

penPart = calcDamage(atkAct, defAct)
raw = penPart + displayDef × k + unit.maxHp × 0.02
```

**FANG_LEVELS 阈值表**（防御/M 比例）：

| 等级 | 比例阈值 | K 值 |
|------|----------|------|
| 0 | < 0.244 | 0 |
| 1 | ≥ 0.244 | 0.01 |
| 2 | ≥ 0.264 | 0.03 |
| 3 | ≥ 0.279 | 0.06 |
| 4 | ≥ 0.292 | 0.10 |
| 5 | ≥ 0.306 | 0.15 |
| 6 | ≥ 0.322 | 0.21 |
| 7 | ≥ 0.342 | 0.30 |
| 8 | ≥ 0.373 | 0.42 |
| 9 | ≥ 0.445 | 0.60 |
| 10 | ≥ 0.520 | 0.86 |
| 11 | — | 1.20 |

### 1.5 伤害波动事件

当随机数取到极值时触发特殊台词：

- `atkVar === 6`：攻击者触发 **暴击台词**，`critCount++`。
- `defVar === 4`：防御者触发 **防御嘲讽台词**。
- `hpBonus === 5`：防御者触发 **血量嘲讽台词**。

### 1.6 精英技能对伤害的修正

以上 `raw` 还会叠加以下精英技能效果：

| 技能 | 触发条件 | 效果 |
|------|----------|------|
| 混元霹雳劲 | 成昆攻击 | `raw += (maxHp - hp) × 0.3` |
| 叛逆突袭 | 宋青书攻击 | `raw += target.hp × 0.15`（当前生命 15% 真实伤害） |
| 鹿角杖法 | 鹤笔翁攻击 | 忽略目标 30% 防御；若目标已中玄冥毒，伤害 ×1.5 |

### 1.7 眩晕机制（V5.1.0 新增）

- **触发条件**：攻击被闪避反击时，攻击者被眩晕。
- **眩晕效果**：本回合内无法行动、无法闪避、无法触发被动（乾坤大挪移、小昭衍生技等）。
- **标记字段**：`_stunned = true`。
- **清除时机**：回合开始时统一重置为 `false`。
- **视觉反馈**：格子显示 😵‍💫 图标，日志显示 `💫 被反击眩晕，本回合无法行动！`

### 1.8 最终伤害

```
dmg = floor(raw)
hpAfter = target.hp - dmg
if hpAfter ≤ 0: target 阵亡
```

---

## 二、单位系统与特殊角色

### 2.1 职业

| 职业 | 攻击类型 | 被遮挡时行为 | 备注 |
|------|----------|--------------|------|
| 战士 | 近战 | 被遮挡则"休息"，回血 20 | 斩杀阈值 15%（小昭在场 20%） |
| 防战 | 近战 | 被遮挡则"休息"，回血 20 | 有 K 值破防机制，可反弹伤害 |
| 远程 | 远程 | 不会被遮挡 | 3% 未命中率 |
| 飞行 | 近战/飞行 | 不会被遮挡 | 6% 未命中率，基础闪避 15% |

### 2.2 特殊角色

#### 张无忌（明教）

- 默认职业：**远程**，固定站位 **5 号位**。
- 九阳神功：每回合攻击后回复 `maxHp × 5%` 生命。
- 乾坤大挪移：当己方 4/6 号位队友被攻击时，反弹 15% 伤害给攻击者，张无忌自伤 10%。
  - 仅远程形态生效，且无忌未被眩晕。
- 形态切换：若张无忌所在列前排无友军（1/4/7 号位），切换为近战形态：
  - `atk +3, def +2, maxHp +50, hp +50`
  - 职业变为 **战士**
  - 切换后前 3 次近战攻击有特殊台词
  - 第 3 次近战攻击触发"融会贯通"：额外造成 `target.atk × 15%` 伤害

#### 韦一笑（明教）

- 默认职业：**飞行**，固定站位 **6 号位**。
- 基础闪避：**20%**（其他飞行 15%，非飞行 0%）。
- 闪避反击：闪避时对攻击者造成 `(atk + def) × 0.5` 真实伤害，同时攻击者被眩晕。
- 吸血：每次造成伤害后，恢复 `dmg × 18%`，并提升 `maxHp` 同数值（满血时仍加上限但保持满血）。

#### 小昭·姐（明教·V5.2.0 蝶蛛双生）

- 初始属性生成使用 `initXiaoZhao()`，与普通单位不同。
- 固定站位 **4 号位**，标记 `isXiaoZhaoSister = true`。
- **蝶变附身**（`butterflyAttach`）：每回合开始化为蝴蝶附身到随机队友，转移攻/防/血上限给宿主。附身期间自身不可选中、不可攻击，面板显示 `_flyMode = 'butterfly'`。
- **蝶变飞回**（`butterflyReturn`）：回合结束飞回原位，恢复原属性，宿主返还一半附身期间获得的生命上限。
- **蝶变强化**：小昭姐在场时，部分团队海克斯有强化效果（详见海克斯强化对比表）。

#### 小昭·妹（明教·V5.2.0 蝶蛛双生）

- 固定站位 **4 号位**（与姐姐互斥），标记 `isXiaoZhaoBrother = true`。
- **蛛变**（`spiderTransform`）：每回合随机变职业（不与上回合重复），记录精通，每次变身 +5 生命上限。精通加成同姐姐。
- **飞天免疫**（`spiderFlyCheck`）：受致命伤时化为蜘蛛飞天，免疫本次伤害（每场限 2 次），标记 `_spiderFlying = true`。原因分「闪避」和「防御」两种。
- **蛛落**（`spiderLand`）：回合结束落下，攻击最近敌人，附带穿透伤害（忽略 30% 防御）+ 精通加成（每精通一个职业 +2 伤害）。
- **永久海克斯**：团队海克斯消失后，妹妹单独续上效果（仅限职业匹配的 Buff）。

### 2.3 单位状态字段

| 字段 | 含义 |
|------|------|
| `_acted` | 本回合是否已行动 |
| `_blocked` | 是否被同列前排遮挡 |
| `_resting` | 是否处于休息状态（被遮挡回血） |
| `_flash` | 当前特效标记（attack/defend/dead/cheer） |
| `_isDead` | 是否已死亡（用于 UI） |
| `_flyMode` | 飞撞特效模式（ghost/fly） |
| `fixed` | 是否锁定不可调整站位 |
| `_originalPos` | 原始站位（阵亡/调整后恢复用） |
| `_hotBloodCount` | 热血奋战累计攻击次数 |
| `_doubleStriked` | 本回合是否已触发概率连击 |
| `_xiaoZhaoDoubleStriked` | 本回合是否已触发小昭蝶击 |
| `_zhangSwitched` | 张无忌是否已切换近战 |
| `_kuaiLeStack` | 周芷若"快乐"层数数组 |
| `_xingFenActive` | 宋青书"性奋"是否可用 |
| `_kuLianActive` | 宋青书"苦练"本回合是否已行动 |
| `_xuanmingPoison` | 玄冥神掌中毒状态 |
| `_extinctionUsed` | 灭绝双剑本回合是否已反击 |
| `_stunned` | 本回合是否被闪避反击眩晕（V5.1.0 新增） |
| `_bloodthirstStriked` | 本回合是否已触发嗜血狂刀额外砍（V5.1.0 新增） |
| `_fortifyStacks` | 防战坚盾层数（每受击 +0.5，上限 6） |
| `_masteredRoles` | 小昭已精通的职业列表（V5.1.0 新增） |
| `_permanentBuffs` | 小昭永久海克斯列表（V5.1.0 新增） |
| `_phantomTarget` | 成昆当前模仿的目标 uid |
| `_butterflyHost` | 小昭姐附身的宿主 uid（V5.2.0 新增） |
| `_butterflyAtk/Def/Hp` | 小昭姐附身前的属性备份（V5.2.0 新增） |
| `_butterflyAtkBonus/DefBonus` | 宿主从小昭姐获得的属性加成（V5.2.0 新增） |
| `_spiderFlying` | 小昭妹是否处于飞天免疫状态（V5.2.0 新增） |
| `_spiderRemaining` | 小昭妹剩余飞天次数（V5.2.0 新增） |
| `isXiaoZhaoSister` | 是否为小昭姐姐（V5.2.0 新增） |
| `isXiaoZhaoBrother` | 是否为小昭妹妹（V5.2.0 新增） |

---

## 三、战斗流程与行动顺序

### 3.1 回合流程

1. **回合开始**
   - 输出 `———— 第 N 回合开始 ————`
   - 触发"快乐回血"（tickKuaiLeHeal）
   - 触发玄冥毒（tickXuanmingPoison）
   - 双方召唤拒马（horseFormation）
   - 小昭蝶变（变换职业）
   - 敌方宋青书获"性奋"状态（applyXingFenGrant）
   - 宋青书苦练判定
   - 若 Buff 含 `doubleStrike`，随机选择一名己方单位为连击单位
   - 输出 Buff 摘要
   - 重置所有单位 `_acted = false`、`_stunned = false`，计算遮挡状态

2. **苦练优先行动**
   - 若敌方宋青书在场且己方（敌方阵营）无周芷若，宋青书最先行动一次。

3. **交替行动**
   - 默认从 **敌方** 开始。
   - 双方按"当前可行动单位中站位最靠前"轮流行动。
   - 眩晕单位跳过行动。
   - 每次行动后切换阵营。
   - 若某阵营无可用单位，则换另一方继续。
   - 直到双方均无可用单位。

4. **行动规则**
   - 若单位为拒马且 `atk ≤ 0`：跳过。
   - 若近战单位被遮挡：休息回血 20，跳过。
   - 若单位被眩晕：跳过，日志输出 `💫 被眩晕，无法行动`。
   - 否则执行一次攻击。

5. **回合结束**
   - 销毁拒马（50% 概率）
   - 清除休息状态和定时器
   - 双方 activeBuffs 剩余回合 -1，移除到期的
   - 判断胜负：若一方全灭则决出胜者；若达到 `MAX_ROUND(35)` 则为平局。

### 3.2 行动单位选择

```javascript
getNextAvailableUnit(team) = team 中 alive 且 !_acted 且 !_stunned 的单位，按 pos 升序取第一个
```

### 3.3 攻击流程

1. 选择目标（selectTarget）
2. 判定未命中（远程 3%、飞行 6%）
3. 计算 Buff 加成
4. 判定闪避（含眩晕检查）
5. 计算伤害
6. 应用伤害
7. 应用攻击后效果（Buff、精英技能）
8. 触发概率连击/小昭蝶击
9. 触发性奋额外攻击

### 3.4 目标选择规则

| 攻击者 | 目标选择 |
|--------|----------|
| 宋青书 | 敌方血量百分比最高单位 |
| 韦一笑 | 敌方血量最低单位 |
| 近战/拒马 | 敌方前排单位中随机 |
| 远程/飞行 | 敌方存活单位中随机 |

---

## 四、站位系统与遮挡

### 4.1 九宫格站位

```
7 8 9   // 后排
4 5 6   // 中排
1 2 3   // 前排
```

### 4.2 前排判定

```javascript
getFronts(units):
  对每一列（1/4/7、2/5/8、3/6/9）
  取该列最靠前的存活单位
```

### 4.3 遮挡判定

```javascript
isBlocked(unit, allies):
  if unit.role === '飞行': return false
  col = (unit.pos - 1) % 3
  poses = [1+col, 4+col, 7+col]
  front = poses 中最靠前的存活友军（不含拒马）
  if front 不存在: return false
  if unit.pos === front: return false
  return unit.pos > front
```

- 只有**近战职业**（战士/防战）会被遮挡。
- 被遮挡时不能攻击，改为休息回血 20。

### 4.4 相邻位置

```javascript
getAdjacentPositions(pos): 返回 pos 周围 8 格（含对角）
```

用于流星赶月溅射范围。

---

## 五、海克斯 Buff 系统

### 5.1 Buff 通用规则

- 每关开始时弹窗选择 1 个 Buff。
- Buff 默认持续 **4 回合**（`BUFF_DURATION`）。
- 最多同时存在 **2 个 Buff**，超出时移除剩余回合最少的。
- 小昭在场时，部分 Buff 有强化效果（详见强化对比表）。

### 5.2 Buff 列表

| Buff 键 | 名称 | 基础效果 |
|--------|------|------|
| `doubleStrike` | 概率连击 | 己方随机一人 80% 概率本回合额外攻击一次 |
| `carry` | 你就是 carry | 5 号位获得队友加成：atk+8%、def+8%、hp+10%；队友阵亡时加成 ×3 |
| `cloudBody` | 流云身法 | 己方全体闪避 +25% |
| `horseFormation` | 巨马阵 | 每回合开始召唤拒马（25 血/0 攻/5 防）；回合结束 50% 销毁 |
| `meteorShower` | 流星赶月 | 远程伤害 +50%，并对目标周围 8 格溅射 50% |
| `bloodthirst` | 嗜血狂刀 | 战士攻击吸血 80% 伤害值 |
| `fortify` | 严阵以待 | 防战防御 +50%，反弹 50% 伤害差值 |
| `windAssault` | 乘风突袭 | 飞行单位 80% 波及同行，60% 击退一格（持续 3 回合） |
| `holyFlame` | 圣火令 | 随机两列攻击 +30%，随机两行防御 +30% |
| `hotBlood` | 热血奋战 | 攻击回复已损失生命 15%，每 3 次翻倍 |
| `mindControl` | 惑人心智 | 最前排单位攻击时：80% 概率扰乱敌方换位，40% 概率扰乱己方换位（持续 2 回合） |

### 5.3 小昭海克斯强化对比表（V5.1.0）

| 海克斯 | 普通版（无小昭） | 小昭强化版（团队生效时） | 小昭永久版（团队过期后） |
|--------|-----------------|------------------------|------------------------|
| 概率连击 | 己方随机一人 80% 额外攻击 | **100%** 必连击 + 被遮挡单位**无视遮挡**进行攻击 | 小昭自己 80% 概率连击 |
| 你就是carry | 5 号位获得队友供养 | **4、5、6 号位同步享受** carry 效果 | 小昭自己固定**两层精通加成** |
| 流云身法 | 全体闪避 +25%（已行动单位不触发） | 全体**无视行动状态**均有 25% 闪避 | 小昭自己永久 25% 闪避，**无视行动状态、无视职业** |
| 圣火令 | 随机两列 +30%攻、两行 +30%防 | 小昭额外**攻+30%且防+30%** | 每回合只给**自己**加攻+30%、防+30%，持续 1 回合 |
| 巨马阵 | 每回合召唤 0/5/25 巨马，50% 销毁 | 巨马属性提升为 **0/30/30** + 攻击巨马的单位受到**5 点反伤** | 小昭每回合自己招一匹普通巨马（0/5/25） |
| 流星赶月 | 远程伤害 +50%，溅射 50% | 溅射命中后攻击者**额外 +2 攻/人** | 小昭自己是远程时，拥有普通流星赶月效果 |
| 嗜血狂刀 | 战士攻击吸血 80% | 吸血后**额外再砍一刀**；斩杀线从 15% 提升至 **20%** | 小昭自己是战士时，拥有普通嗜血狂刀效果 |
| 严阵以待 | 防战防御 +50%，反弹 50% 伤害差 | 反弹伤害差值的同时**回复等量血量** | 小昭自己是防战时，拥有普通严阵以待效果 |
| 乘风突袭 | 飞行 80% 波及同行、60% 击退 | 波及概率 **100%**、击退概率 **80%** | 小昭自己是飞行时，拥有普通乘风突袭效果 |
| 热血奋战 | 回复已损失生命 15%，每 3 次翻倍 | 回复比例 **20%**，每 **2 次**翻倍 | 小昭自己单独拥有强化版效果（20%、每 2 次翻倍） |
| 惑人心智 | 己方最前排 80% 扰乱敌方换位、40% 扰乱己方换位 | 敌方换位 **95%**、己方换位 **50%**，持续 **3 回合** | 小昭自己独立拥有 **15%** 概率永久惑心（迷惑敌人攻击其队友） |

### 5.4 闪避计算

```javascript
finalHit = (1 - baseDodge) × (1 - buffDodge)
totalDodge = 1 - finalHit
```

- 基础闪避：韦一笑 20%，其他飞行 15%，非飞行 0%。
- Buff 闪避：仅 `cloudBody` 提供 25%。

### 5.5 严阵以待反弹公式

```javascript
reboundDmg = floor((atkAct - calcDamage(atkAct, defAct)) / 2)
```

- 仅对防战生效。
- 反弹伤害直接扣攻击者血量。

---

## 六、精英技能与特殊机制

### 6.1 精英怪配置

| 关卡 | 精英怪 | 职业 | M | 技能 | 默认站位 |
|------|--------|------|---|------|----------|
| 3 | 宋青书 | 飞行 | 107 | rebelStrike | 5 |
| 4 | 宋青书 | 飞行 | 107 | rebelStrike | 5 |
| 4 | 周芷若 | 战士 | 107 | nineYinClaw | 2 |
| 5 | 鹿杖客 | 远程 | 112 | xuanmingPalm | 7 |
| 5 | 鹤笔翁 | 飞行 | 112 | hornStrike | 4 |
| 6 | 成昆 | 防战 | 112 | phantomThunder | 1 |

### 6.2 精英技能详情

| 技能 | 持有者 | 效果 |
|------|--------|------|
| 灭绝双剑 | 灭绝师太 | HP < 50% 时，受到攻击有 80% 概率反击 `atk × 0.8`，每回合限 1 次 |
| 九阴白骨爪 | 周芷若 | 首次必触发，后续 80% 概率追击，可连锁；张无忌在场时伤害提升 |
| 叛逆突袭 | 宋青书 | 锁定血量百分比最高目标，附加目标当前生命 15% 真实伤害 |
| 混元霹雳劲 | 成昆 | 附加已损失生命 × 30% 的真实伤害 |
| 玄冥神掌 | 鹿杖客 | 使目标中毒：每回合损失 4%→2%→1%→消失，持续 3 回合 |
| 鹿角杖法 | 鹤笔翁 | 忽略 30% 防御；目标已中毒时伤害 +50% |
| 苦练 | 宋青书 | 场上无周芷若时，每回合最先行动；行动前给全体队友 +1.5 攻 +0.5 防 +2 血上限，自身翻倍 |
| 新婚 | 宋青书 | 每次攻击扣除周芷若 1 血，并给她叠加"快乐"层（首层 16%，后续降级） |
| 性奋 | 宋青书 | 周芷若在场时，宋青书每次攻击后可再次攻击（每回合限 1 次） |
| 幻影伪装 | 成昆 | 攻击后模仿对方单位并回复已损失 30% 生命；对方攻击时 30% 概率混乱攻击队友；被模仿者免疫混乱；攻击前清除旧模仿状态 |

### 6.3 宋周联动机制
- 苦练：场上无周芷若时，宋青书每回合最先行动。
- 新婚：宋青书每次攻击扣除周芷若 1 点血量，并给她叠加"快乐"层。
- 性奋：周芷若在场时，宋青书每次攻击后可再次行动（每回合限 1 次）。
- 嫉妒：张无忌在场时，周芷若九阴白骨爪伤害比例提升。

### 6.4 快乐回血机制

- 宋青书攻击时，周芷若叠加一层"快乐"。
- 每回合开始时，每层快乐按当前百分比回血，然后降级：
  - 层数百分比序列：`[0.16, 0.10, 0.06, 0.03]`
  - 例如第一层回 16% maxHp，下一回合降为 10%，再下回合 6%……
- 到 0.03% 后该层消失。

---

## 七、蝶蛛双生系统（V5.2.0）

### 7.1 系统概述

小昭在 V5.2.0 拆分为**姐妹双形态**，每局随机出现姐姐或妹妹（互斥），各自拥有不同的战斗机制。

### 7.2 姐姐·蝶变附身

**回合开始**（`butterflyAttach`）：
- 随机选择一名存活的非满血队友作为宿主
- 若无可用队友，姐姐直接阵亡
- 转移自身 100% 攻击、100% 防御、50% 生命上限给宿主
- 姐姐备份当前属性到 `_butterflyAtk/Def/Hp`
- 姐姐标记 `_flyMode = 'butterfly'`、`_butterflyHost = host.uid`
- 宿主获得 `_butterflyAtkBonus` / `_butterflyDefBonus`

**回合结束**（`butterflyReturn`）：
- 恢复原属性
- 宿主返还一半附身期间获得的生命上限
- 姐姐落在原站位，生命 = 原生命 + 宿主返还
- 若返还后生命 ≤ 0，姐姐阵亡

**特效**：
- 飞出：`showButterflyFlyOut` — 🦋 波浪轨迹飞向宿主，命中粉色闪烁
- 飞回：`showButterflyFlyBack` — 🦋 正弦波动飞回原位

### 7.3 妹妹·蛛变飞天

**蛛变**（`spiderTransform`）：
- 每回合随机变换职业（战士/防战/远程/飞行），不与上回合重复
- 记录精通职业（去重），每次变身 +5 生命上限
- 精通加成：每精通一个职业 +1.5 攻 +2 防 +10 血上限；四职业全精通额外 +1 次

**飞天免疫**（`spiderFlyCheck`）：
- 受致命伤时触发，每场战斗限 2 次
- 触发原因分两种：当前 HP 低于伤害值（闪避触发）、防御过低无法承受（防御触发）
- 免疫本次伤害，化为蜘蛛飞走，标记 `_spiderFlying = true`
- **特效**：`showSpiderAscend` — 🕷️ 格子变紫 + 克隆体缩小 + 蜘蛛丝 + 蜘蛛图标上升消失

**蛛落**（`spiderLand`）：
- 回合结束落下，攻击最近敌人
- 伤害：穿透伤害（忽略 30% 防御）+ 精通加成（每精通一个职业 +2 伤害）
- **特效**：`showSpiderDescend` — 🕷️ 蜘蛛沿丝线降下，落地紫色闪烁

### 7.4 永久海克斯

- 团队海克斯还存在时：用团队的。
- 团队消失后：
  - 姐姐：无永久海克斯（附身期间不单独生效）。
  - 妹妹：单独续上职业匹配的 Buff（流云身法、惑人心智无职业限制）。
- 效果函数统一收敛到 `core/50buff-effects.js`，按 `_Normal` / `_Sister` / `_Brother` 三分支。

### 7.5 海克斯强化对比表

同 V5.1.0 的表（详见五.3），姐姐强化对应 `_Sister` 列，妹妹永久对应 `_Brother` 列。

### 7.6 蝶蛛特效模块

`fx/21fx-butterfly-spider.js` 提供四段独立特效函数，播放器 `player/10player-core.js` 通过 `getButterflyFx()` 动态加载（兼容单文件构建），识别日志中的「🦋 蝶变」「🦋 飞回」「🕷️ 飞天」「🕷️ 蛛落」自动触发。

---

## 八、全局状态管理（V5.1.0）

### 8.1 GlobalStore

项目采用统一的全局状态管理模块 `modules/46global-store.js`，取代之前散落在 `window._*` 上的 15 个全局变量。

- **读取**：`GlobalStore.get('key')`
- **写入**：`GlobalStore.set('key', value)`
- **订阅**：`GlobalStore.on('key', callback)` 返回取消订阅函数
- **副作用**：`GlobalStore.effect('key', fn)` 当 key 变更时自动执行 fn

### 8.2 管理变量

| 变量 | 用途 |
|------|------|
| `fastForwardActive` | 快进到底标志 |
| `voteScore` | 投票积分 |
| `voteChoice` | 当前投票选择 |
| `battleHasZhang` | 张无忌是否在场 |
| `bugMode` | Bug 模式标志 |
| `crashMode` | 飞撞模式（fly/ghost） |
| `currentBattleState` | 当前战场快照 |
| `battleStore` | 播放器 Store 引用 |
| `forceXiaoZhao` | 强制小昭模式 |
| `skipBuffPopup` | 跳过 Buff 弹窗 |
| `battleEvents` | 战斗事件队列 |

---

## 九、海克斯效果函数库（V5.2.0）

### 9.1 模块概述

`core/50buff-effects.js` 将海克斯的效果执行逻辑从 `core/04buff-system.js` 中提取为独立模块，按身份三分支：

| 分支 | 命名 | 生效条件 |
|------|------|----------|
| 普通团队版 | `_Normal` | 无小昭在场时 |
| 姐姐强化版 | `_Sister` | 小昭姐在场时 |
| 妹妹永久版 | `_Brother` | 团队海克斯过期后，小昭妹单独续上 |

### 9.2 涵盖海克斯

- 嗜血狂刀（`applyBloodthirst_*`）：吸血 + 姐姐额外砍一刀
- 热血奋战（`applyHotBlood_*`）：回复已损失生命，妹妹版 20%/每 2 次翻倍
- 乘风突袭（`applyWindAssault_*`）：波及 + 击退，姐姐版 100%/80% 概率
- 流星赶月（`applyMeteorShower_*`）：远程伤害加深 + 溅射 + 减防
- 严阵以待（`applyFortifyRebound_*`）：反弹伤害，姐姐版反弹同时回复等量
- 流云身法（`applyCloudBodyDodge_*`）：闪避加成
- 圣火令（`applyHolyFlame_*`）：列攻行防 + 妹妹永久自加成
- Carry 加成（`calcCarryBonus_*`）：5 号位（姐姐版 4/5/6 号位）供养加成
- 惑人心智（`applyMindControl_*`）：换位扰乱，姐姐版 95%/50%

### 9.3 解耦设计

- `core/04buff-system.js` 负责数值计算（`computeBuffStats`），不再包含效果触发逻辑。
- `core/50buff-effects.js` 负责效果执行（造成伤害、回血、换位、溅射等），从 `04` 中提取。
- 两者通过 `applyBuffEffectsAfterAttack` 桥接。

---

## 十、回放系统（V5.2.0）

### 10.1 模块概述

`modules/100-replay.js` 提供完整的战斗回放功能，挂载到 `window.ReplayManager`。

### 10.2 API

| 方法 | 说明 |
|------|------|
| `startRecording(snapshot)` | 记录战斗初始快照（双方单位序列化） |
| `pushStep(step, round, ally, enemy)` | 每步推进时记录日志 + 事件 + 双方状态 |
| `finishRecording(winner)` | 标记胜者，触发下载按钮 |
| `download(filename)` | 导出 JSON 回放文件到本地 |
| `importFile(file)` | 导入回放文件（File 对象），自动开始重放 |
| `startReplay(data)` | 创建 `ReplayPlayer` 逐帧播放日志 |

### 10.3 回放播放器

- 逐步渲染日志到 `#log` 面板
- 显示回合分隔符
- 支持速度控制（默认 800ms/步）
- 回放结束显示胜者
- 可随时 `stop()` 中断

---

## 十一、攻防显示（V5.1.0）

- **战场格子**：直接显示加成后的最终值，有加成时高亮金色。基础值和加成拆解仅在弹窗中展示。
- **攻击加成**：`atkBonusVal = floor(unit._baseAtk × buffStats.atkBonus)`
- **防御加成**：`defBonusVal = floor(unit._baseDef × buffStats.defBonus)`
- **详细弹窗**：点击格子展示基础值 + Buff 加成 + 坚盾层数 = 最终值的完整拆解。

---

## 十二、测试与体检

### 12.1 测试入口

`tests/30test-runner.html`

### 12.2 体检分组

- 启动与加载
- 九宫格基础
- 血条与属性
- Buff 系统
- 状态样式
- 音效
- 特效
- 精英
- 数据一致性
- 核心参数/公式
- 战斗引擎
- 日志与 UI

约 70 条规则，覆盖 6 个关卡。

### 12.3 单元测试

`tests/25unit-tests.js` 包含核心函数测试。

---

## 十三、备注与可能未实现的设定

### 13.1 已删除/下线的功能

- 网络 BGM 源已删除，仅保留本地 `assets/sfx_xinai.mp3`。
- 环境诊断页签已移除。

### 13.2 代码中保留但未完全验证的设定

- `ronghui`字段：张无忌近战第 3 次攻击后标记为 true，触发"融会贯通"额外伤害和特殊台词。
第二次近战攻击的特殊台词也已实现（"糟糕，只记得一两层了"）。
- `_zhangTauntDone`：张无忌第一次近战台词只触发一次。
- 拒马 `atk` 固定为 0，仅作为肉盾存在。

### 13.3 数值备注

- `MAX_ROUND = 35`，超过即平局。
- `ATK_VAR = 6`, `DEF_VAR = 4`, `HP_BONUS_MIN = 0`, `HP_BONUS_MAX = 5`。
- 防战 K 值表在 V5.0.0 修复后使用 Buff 后防御计算。

### 13.4 文件路径规范

所有 JS/HTML 文件按功能分入：

```
core/      核心配置、单位、工具、Buff、马、战斗引擎
player/    播放器、Buff UI、文本、玩家核心
ui/        主控、渲染、工具函数
fx/        特效
modules/   精英技能、错误捕获、音频、全局状态管理
tests/     测试、体检、题库、运行时采样
tools/     工具箱、自动战斗、构建脚本
assets/    音效
```

---

## 十四、版本号汇总

当前各模块版本号（以代码内 `export const VER` 为准）：

| 模块 | 版本 |
|------|------|
| core/01config-5v5-test.js | V5.2.0 |
| core/02unit.js | V5.2.0 |
| core/03battle-utils.js | V5.2.0 |
| core/04buff-system.js | V5.2.0 |
| core/05battle-horse.js | V5.2.0 |
| core/06battle-engine-core.js | V5.2.0 |
| core/07battle-engine-5v5-test.js | V5.2.0 |
| core/47battle-attack.js | V5.2.0 |
| core/48battle-round.js | V5.2.0 |
| core/49battle-attack-steps.js | V5.2.0 |
| core/50battle-shared.js | V5.2.0 |
| core/50buff-effects.js | V5.2.0 |
| player/08player-text.js | V5.2.0 |
| player/09player-buff-ui.js | V5.2.0 |
| player/10player-core.js | V5.2.0 |
| player/11battle-player-5v5-test.js | V5.2.0 |
| ui/12main-utils.js | V5.2.0 |
| ui/13main-5v5-test.js | V5.2.0 |
| ui/14ui-render-5v5-test.js | V5.2.0 |
| ui/39main-state.js | V5.2.0 |
| ui/40main-dialogs.js | V5.2.0 |
| ui/41main-battle.js | V5.2.0 |
| ui/42audio-control.js | V5.2.0 |
| ui/43fx-trigger.js | V5.2.0 |
| ui/44ui-controls.js | V5.2.0 |
| fx/15fx-common-5v5-test.js | V5.2.0 |
| fx/16fx-arrows-5v5-test.js | V5.2.0 |
| fx/17fx-crash-5v5-test.js | V5.2.0 |
| fx/18fx-position-swap.js | V5.2.0 |
| fx/19fx-push-back.js | V5.2.0 |
| fx/20fx-dodge-bullet.js | V5.2.0 |
| fx/21fx-butterfly-spider.js | V5.2.0 |
| modules/23elite-skills.js | V5.2.0 |
| modules/24error-capture.js | V5.2.0 |
| modules/28audio-manager.js | V5.2.0 |
| modules/46global-store.js | V5.2.0 |
| modules/100-replay.js | V5.2.0 |
| tests/25unit-tests.js | V5.2.0 |
| tests/30test-runner.html | V5.2.0 |
| tests/35quiz-bank.js | V5.2.0 |
| tests/37health-core.js | V5.2.0 |
| tests/37health-rules/60-separator.js | V5.2.0 |
| tests/37health-rules/61-boneclaw.js | V5.2.0 |
| tests/37health-rules/62-speed-button.js | V5.2.0 |
| tests/37health-rules/63-carry-hp.js | V5.2.0 |
| tests/37health-rules/64-horse.js | V5.2.0 |
| tests/37health-rules/65-swap.js | V5.2.0 |
| tests/37health-rules/66-victory.js | V5.2.0 |
| tests/37health-rules/67-cloud-dodge.js | V5.2.0 |
| tests/37health-rules/68-dodge-rebound.js | V5.2.0 |
| tests/38health-monitor.js | V5.2.0 |
| tests/45health-auto.js | V5.2.0 |
| tests/46health-utils.js | V5.2.0 |
| tools/00build-5v5.cjs | V5.2.0 |
| tools/27auto-battle-utils.js | V5.2.0 |
| tools/31-toolkit.html | V5.2.0 |
| tools/32-toolkit.js | V5.2.0 |
| tools/33-toolkit-more.js | V5.2.0 |
| tools/34-shop.html | V5.2.0 |
| index.html | V5.2.0 |
| mode-5v5-test.html | V5.2.0 |