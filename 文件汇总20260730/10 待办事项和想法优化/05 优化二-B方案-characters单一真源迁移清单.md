# 优化二 · B 方案：`characters` 单一真源迁移清单

> 目标：`content/001-game-data.json` 的 `characters` 成为角色唯一真源，所有角色池由它运行时推导。
> 本轮范围：**只出清单，不动 `content/001`、不改代码**（另一条线正在该文件新增 4 个角色，避免撞车）。
> 对账脚本：`tools/829-verify-pools.mjs`（现有硬编码池 vs tags 推导，当前 3/11 组一致）。

---

## 一、字段模型（给 `characters[name]` 新增 7 个字段）

| 字段 | 类型 | 含义 | 取值来源 | 是否可省 |
|---|---|---|---|---|
| `m` | number | **基准 M**（常规阵容值） | `roster.mingM` / `roster.enemyM` / `roster.eliteConfigs` / `encounters` 具名项 | 否 |
| `flag` | string\|null | 精英身份标记（等价现 `HERO_FLAGS`） | `core/202-unit.js` `HERO_FLAGS` | 否 |
| `tier` | `'boss'\|'strong'\|'weak'\|'normal'\|'summon'` | 强度档位 | `eliteConfigs.tier` + 注释口径（弱精英=杨逍/殷天正/何太冲/唐文亮/空见） | 否 |
| `camp` | `'明教'\|'六大派'` | 阵营（池归属第一键） | 现有 `tags` 首项 | 否 |
| `sect` | `'明教'\|'少林'\|'武当'\|'峨眉'\|'昆仑'\|'崆峒'\|'朝廷'` | 门派（细分池用） | `tags` 门派项 + `roster.enemyTitles` 反查 | 否 |
| `summon` | boolean | 是否进「众志成城」召唤池 | `buffs.unity.recruitPool` | 否 |
| `everyday` | boolean | 是否进常规全员 M 表（`mingM`/`enemyM`） | 现 `mingM`/`enemyM` 的键 | 否 |
| `encounter` | boolean | 是否出现在 `encounters` 具名阵容 | `encounters.elitePool`/`enemySquads`/`squadVariants` | 否 |
| `stdPos` | number\|null | 固定站位（工具与 330 用） | `roster.enemyElitePos` + 330 硬编码锚点（张5/韦6/昭4/谢7/寒2） | 是（工具需要） |
| `unitFlags` | string[] | 额外单位标记（不进 `HERO_FLAGS`） | `applyHeroFlags` 内的硬编码（`isReflectDisciple`、三狮形态） | 是（可省） |
| `forms` | object\|null | 形态别名与职业/标记覆盖 | 仅 `小昭` | 是（仅小昭） |

**为什么 `camp` 与 `sect` 拆开**：`成昆` 在 `enemyM`（camp=六大派）但属「朝廷」，只靠门派无法同时满足 P8 与 P4 推导。

---

## 二、旧→新：现有 23 条逐条取值

| 姓名 | m | flag | tier | camp | sect | summon | everyday | encounter | 备注 |
|---|---|---|---|---|---|---|---|---|---|
| 张无忌 | 115 | isZhang | boss | 明教 | 明教 | ✓ | ✓ | ✗ | stdPos 5 |
| 韦一笑 | 107 | isWei | strong | 明教 | 明教 | ✓ | ✓ | ✗ | stdPos 6 |
| 小昭 | 107 | isXiaoZhao | strong | 明教 | 明教 | ✗ | ✗ | ✗ | 见「形态名」；stdPos 4 |
| 金毛狮王谢逊 | 107 | isXieXun | strong | 明教 | 明教 | ✓ | ✓ | ✗ | stdPos 7 |
| 寒离飒 | 107 | isHanLiSa | strong | 明教 | 明教 | ✗ | ✓ | ✗ | stdPos 2 |
| 杨逍 | 104 | isYangXiao | weak | 明教 | 明教 | ✓ | ✓ | ✗ | |
| 殷天正 | 104 | isYinTianZheng | weak | 明教 | 明教 | ✓ | ✓ | ✗ | |
| 反伤弟子 | 97 | null | normal | 明教 | 明教 | ✗ | ✓ | ✗ | `unitFlags:['isReflectDisciple']` |
| 周颠 | 100 | null | normal | 明教 | 明教 | ✗ | ✓ | ✗ | |
| 说不得 | 100 | null | normal | 明教 | 明教 | ✗ | ✓ | ✗ | |
| 张三丰 | 107 | isZhangSanfeng | strong | 六大派 | 武当 | ✓ | ✗ | ✓ | m 仅 `encounters.elitePool` 有（107） |
| 宋青书 | 107 | isSongQingshu | strong | 六大派 | 武当 | ✗ | ✓ | ✓ | |
| 胖远桥 | 107 | isPangYuanQiao | strong | 六大派 | 武当 | ✗ | ✓ | ✓ | |
| 周芷若 | 107 | isZhouZhiruo | strong | 六大派 | 峨眉 | ✓ | ✓ | ✓ | |
| 灭绝师太 | 115 | isMieJueShiTai | strong | 六大派 | 峨眉 | ✓ | ✓ | ✓ | |
| 空见 | 104 | isKongJian | weak | 六大派 | 少林 | ✗ | ✓ | ✗ | |
| 唐文亮 | 104 | isTangWenLiang | weak | 六大派 | 崆峒 | ✗ | ✓ | ✗ | 与杂兵「崆峒唐文亮」(97) 是两人 |
| 何太冲 | 104 | isHeTaichong | weak | 六大派 | 昆仑 | ✗ | ✓ | ✗ | |
| 成昆 | 112 | isChengKun | strong | 六大派 | 朝廷 | ✓ | ✓ | ✓ | tags 现写「六大派」，需补 camp/sect 拆分 |
| 鹿杖客 | 112 | isLuZhangKe | strong | 六大派 | 朝廷 | ✓ | ✓ | ✓ | |
| 鹤笔翁 | 112 | isHeBiWeng | strong | 六大派 | 朝廷 | ✓ | ✓ | ✓ | |
| 俞莲舟 | 100 | null | normal | 六大派 | 武当 | ✗ | ✓ | ✓ | 关卡变体内 m 覆盖为 104 |
| 素问 | 100 | null | normal | 六大派 | 峨眉 | ✗ | ✓ | ✗ | |

---

## 三、杂兵反向生成（56 条，规则化，不手抄）

**生成规则**（一次性脚本或人工照表，之后由 `characters` 正向推导）：

- 来源 A：`roster.mingM` 中不在 `characters` 的键 → `{ tags:['明教','普通'], m:mingM[name], camp:'明教', sect:'明教', tier:'normal', flag:null, summon:false, everyday:true, encounter:false }`
- 来源 B：`roster.enemyM` 中不在 `characters` 的键 → `camp='六大派'`，`sect = roster.enemyTitles 反查门派`，其余同上
- 来源 C：`encounters` 具名项中不在上述两表者 → 仅 `殷梨亭`，`m=97`（取自 `squadVariants` 第 3 关），`everyday:false`、`encounter:true`

### A. 明教杂兵（13）

| 姓名 | m |
|---|---|
| 范遥 | 104 |
| 庄铮 / 颜垣 / 吴劲草 / 张中 / 冷谦 / 彭莹玉 | 100 |
| 明教洪午 / 明教岳山 / 明教石虎 | 97 |
| 明教弟子1 / 明教弟子2 / 明教弟子3 | 95 |

### B. 六大派杂兵（42）

| 门派 | 姓名（m） |
|---|---|
| 少林 | 空闻104 / 空智104 / 空性104；少林圆真 / 圆音 / 圆业 / 慧轮 / 慧净 / 虚竹 / 虚清 均97；少林弟子95 |
| 武当 | 清虚104 / 清风104 / 明月104；凌云 / 张松溪 / 俞岱岩 / 莫声谷 均97；武当弟子95 |
| 峨眉 | 静玄104 / 静虚104 / 静照104；峨眉慧静 / 慧心 / 慧明 / 妙清 / 妙音 / 灵枢 均97；峨眉弟子95 |
| 昆仑 | 班淑娴104；昆仑白鹿子 / 灵宝 / 玉清 / 紫阳 均97；昆仑弟子95 |
| 崆峒 | 宗维侠104 / 常敬之104；崆峒唐文亮 / 胡豹 / 简捷 / 赵明 均97；崆峒弟子95 |

### C. 仅关卡出场（1）

| 姓名 | m | sect | everyday | encounter |
|---|---|---|---|---|
| 殷梨亭 | 97 | 武当 | ✗ | ✓ |

合计 23 + 56 + 3（三狮）= **82 条**。

---

## 四、`HERO_FLAGS` 三狮怎么补

现状：`HERO_FLAGS` 把 `雄狮/幼狮/母狮` 统一映射 `isXieXunLion`，`applyHeroFlags` 再按名字补 `isLionMale/isLioness/isLionCub`（三份映射散在代码里）。

B 方案落法：

```json
"雄狮": { "tags":["明教","召唤"], "m":null, "flag":"isXieXunLion",
          "tier":"summon", "camp":"明教", "sect":"明教",
          "summon":false, "everyday":false, "encounter":false,
          "unitFlags":["isLionMale"], "summonOf":"金毛狮王谢逊" },
"幼狮": { ... "unitFlags":["isLionCub"],  "summonOf":"金毛狮王谢逊" },
"母狮": { ... "unitFlags":["isLioness"],  "summonOf":"金毛狮王谢逊" }
```

- `flag` 仍取 `isXieXunLion`（保证 330 的「HERO_FLAGS ∩ mingM」过滤行为不变，三狮不在 mingM，无副作用）。
- 形态标记挪到 `unitFlags`，`applyHeroFlags` 改为读 `characters[name].unitFlags`，删掉 3 条 `if (name === '母狮')`。
- `m:null`：三狮属性由谢逊组件内固定值产生，不进 `mingM`，不参与 M 池。

---

## 五、形态名（`小昭·姊/妹`）怎么处理

- `characters` 只保留 **1 条 `小昭`**，新增：

```json
"forms": {
  "sister":  { "name":"小昭·姊", "role":"蝴蝶", "flag":"isXiaoZhaoSister" },
  "brother": { "name":"小昭·妹", "role":"远程", "flag":"isXiaoZhaoBrother" }
}
```

- 运行期显示名（日志/名片/工具）仍用 `小昭·姊`/`小昭·妹`，由 `forms` 生成，不写进 `characters` 键。
- 已存在 `baseHeroName()`（`core/202-unit.js`）做 `·` 后缀归一化 → 工具侧（827/805/828）改为「按基础名查 characters，再取 forms」。
- `roster.eliteConfigs` 里小昭的 `flag:"isXiaoZhaoBrother"` 由 `forms.brother.flag` 提供（保留现行为：默认按妹初始化后再掷姊/妹）。

---

## 六、第二份清单的处置映射

| 旧位置 | 处置 | 替代来源 |
|---|---|---|
| `roster.eliteConfigs`（5 条，name/m/role/flag/tier） | **删除** | `characters` camp=明教 && tier∈{boss,strong} |
| `roster.mingM`（22） | **删除** | `characters` camp=明教 && everyday |
| `roster.enemyM`（54） | **删除** | `characters` camp=六大派 && everyday |
| `roster.mingAll`（20） | **删除（已死代码）** | 全仓仅 `core/201` getter 定义，无任何消费方 |
| `roster.enemyTitles`（门派→名单） | **删除** | `characters` sect 分组 |
| `roster.enemySects`（5 门派名） | 保留（纯枚举，非角色清单） | — |
| `buffs.unity.recruitPool` | **删除** | `characters.summon === true`（按 camp 分组，role 取 tags） |
| `core/202-unit.js` `HERO_FLAGS` 字面量 | **改为派生** | `characters.flag` |
| `applyHeroFlags` 内 3 条形态 if | **改为派生** | `characters.unitFlags` / `forms` |
| `tools/827-tool-registry.js` 各名单 + `ELITE_UNIT_META` | **改为派生** | `characters` flag/tier/stdPos/forms |
| `tools/805-shop.html` `HERO_META`（baseM/role/camp） | **改为运行时读 content** | `characters` m/tags/camp |
| `roster.eliteRate` / `elitePower` / `normalPower` / `enemyElitePos` | **保留**（按键属性表，非角色清单） | 建议后续第 4 批并入 `characters`，本轮不动 |

---

## 七、切换顺序与回滚点

> 前置：等另一条线的 4 个新角色在 `content/001` 落地并合入后，再开工第 1 步，避免重复 rebase。

| 步骤 | 动作 | 验收 Gate | 回滚点 |
|---|---|---|---|
| **0（本轮）** | 只出本清单；`829` 保持只读对账 | — | — |
| **1 补数据** | 给 `characters` 加 7 字段、补 56 杂兵 + 3 三狮；`roster` 原表**先不动** | 升级 `829` 为双模式（`--legacy` / `--characters`），两套输出逐池差集 **全部为 0** | R1：revert 该次 `content/001` 提交 |
| **2 切读取** | `core/201` 的 `MING_M`/`ENEMY_M`/`ELITE_CONFIGS`/`ELITE_POOL` 等 getter 改调新导出函数；330 改用新函数；202 `HERO_FLAGS` 改派生 | ① `829` 旧池 vs 新池全零；② `node tests/smoke-headless.mjs 30`；③ 体检基线无新增红 | R2：revert 代码提交（数据已就位，回退安全） |
| **3 删旧表** | 删 `eliteConfigs`/`mingM`/`enemyM`/`mingAll`/`enemyTitles`/`recruitPool`，删 827/805 名单字面量 | 全仓 grep 无任何旧表读取；`829 --legacy` 改为「断言旧表不存在」；再跑 ①②③ | R3：revert 删除提交 |

**不可跳步**：第 2 步必须等第 1 步差集归零；第 3 步必须等第 2 步验证通过。

---

## 八、`829` 的验收口径改造（每池推导规则）

| 组 | 旧池 | 新推导规则 |
|---|---|---|
| P1/P2/P3 | `eliteConfigs` ∪ 弱精英 | `camp=明教 && tier∈{boss,strong,weak}`，按 tier 再分档 |
| P4 | `encounters` 具名敌方 12 | `camp=六大派 && encounter` |
| P5 | `recruitPool.ally` 5 | `camp=明教 && summon` |
| P6 | `recruitPool.enemy` 6 | `camp=六大派 && summon` |
| P7 | `mingM` 22 | `camp=明教 && everyday` |
| P8 | `enemyM` 54 | `camp=六大派 && everyday` |
| P9 | `mingAll` 20 | **改为断言「该键已不存在」** |
| P10 | `HERO_FLAGS` 20 | `flag != null` 的角色名 |
| P11 | `827` 各名单 | `flag != null` + `stdPos` + `forms` |
| P12 | role 一致性 | `tags` 职业项（`蝴蝶`/`标枪` 为身份职业，跳过） |

---

## 九、风险与已知冲突（迁移时必须处理）

1. **M 值双口径**：`张松溪/俞岱岩/俞莲舟` 在 `enemyM` 是 97/97/100，在 `squadVariants` 第 3 关是 104/100/104。`characters.m` 只存**基准 M**，关卡覆盖值继续留在 `encounters`，不可合并。
2. **张三丰不在 `enemyM`**：M 只能从 `encounters.elitePool` 取 107；`everyday=false`、`encounter=true`。
3. **成昆 tags 与阵营不符**：现 tags 写「六大派」，实为朝廷身份；需 `camp:'六大派'` + `sect:'朝廷'` 两字段并存，不可只改 tags。
4. **反伤弟子不能进 `HERO_FLAGS`**：330 用 `HERO_FLAGS[name]` 过滤明教普通兵候选池，进表会被踢出；必须用 `unitFlags` 而非 `flag`。
5. **小昭默认 flag**：`eliteConfigs` 现写 `isXiaoZhaoBrother`（妹），`applyHeroFlags` 又按名字补 `isXiaoZhao`；迁移后由 `flag` + `forms` 双轨表达，需在 330 逐位对齐掷点顺序不变。
6. **新增角色撞车**：另一条线正在 `content/001` 加 4 个角色；第 1 步必须在其合入后做，且新增角色同样要补齐 7 字段（否则 `everyday`/`tier` 缺失会让池子少人）。

---

## 十、落地记录（2026-11-07）

- **数据**：`characters` 由 27 条扩到 82 条（补 52 杂兵 + 3 三狮），全部补齐 `m/flag/tier/camp/sect/summon/everyday/encounter` 及顺序键（`mingOrder/enemyOrder/titleOrder/eliteOrder/recruitOrder/mingAll`）；`content` 版本 5.16.9 → 5.17.0。
- **对账**：`node tools/829-verify-pools.mjs` → **11/11 一致**；另用临时顺序比对确认 `ELITE_CONFIGS / ENEMY_TITLES / MING_M / ENEMY_M / recruitPool` 与旧表逐位（含顺序）相同。
- **读取路径**：`core/201` 新增 `getHeroPools()`；`MING_M/ENEMY_M/MING_ALL/ELITE_CONFIGS/ENEMY_TITLES/BUFFS.unity.recruitPool` 全部改为推导。`core/202` `HERO_FLAGS` 字面量删除，改 proxy 读 `characters[name].flag`；小昭/三狮/反伤标记统一走 `unitFlags`。
- **验证**：`node tests/smoke-headless.mjs 8` → 8/8 分胜负，冒烟全通过。
- **废弃**：`roster` 与 `buffs.unity.recruitPool` 已加 `_deprecated` 说明，运行期不再读取，仅留作 829 对账快照；**下一轮删除这些旧表**并把 829 改为「断言旧键不存在」。
