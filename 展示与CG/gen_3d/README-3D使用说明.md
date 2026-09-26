# 光明顶 · 精英 3D 模型使用说明

十个角色的 3D 模型。前四个（zw/wy/xz/xm）由 `展示与CG/精英展示-04-圣火单卡旋转-GLM5.3.html` 里的立绘做图生 3D；后六个（谢逊/周芷若·露肩/周芷若·黑化/宋青书/宋远桥/灭绝师太）项目内**无源图**，由 ImageGen 生成国风写实立绘（`立绘/`，已裁掉右下角水印）后再图生 3D。
生成参数：图生 3D + 写实 + PBR 材质 + GLB/OBJ。

## 一、文件清单

| 角色 | 原始高模 | 网页压缩版 | 预览页 |
| --- | --- | --- | --- |
| 张无忌 (zw) | `zw/zw.glb`（49MB） | `zw/zw_web.glb`（1.3MB） | `zw/zw_viewer.html` |
| 韦一笑 (wy) | `wy/wy.glb`（58MB） | `wy/wy_web.glb`（1.2MB） | `wy/wy_viewer.html` |
| 小昭·姊 (xz) | `xz/xz.glb`（49MB） | `xz/xz_web.glb`（1.1MB） | `xz/xz_viewer.html` |
| 小昭·妹 (xm) | `xm/xm.glb`（54MB） | `xm/xm_web.glb`（1.5MB） | `xm/xm_viewer.html` |
| 谢逊 (xx) | `xx/xx.glb`（54MB） | `xx/xx_web.glb`（1.9MB） | `xx/xx_viewer.html` |
| 周芷若 · 露肩 (zzr) | `zzr/zzr.glb`（50MB） | `zzr/zzr_web.glb`（1.5MB） | `zzr/zzr_viewer.html` |
| 周芷若 · 黑化 (zzr_dark) | `zzr/zzr_dark.glb`（51MB） | `zzr/zzr_dark_web.glb`（1.6MB） | `zzr/zzr_dark_viewer.html` |
| 宋青书 (sqs) | `sqs/sqs.glb`（46MB） | `sqs/sqs_web.glb`（1.5MB） | `sqs/sqs_viewer.html` |
| 宋远桥 (syq) | `syq/syq.glb`（50MB） | `syq/syq_web.glb`（1.4MB） | `syq/syq_viewer.html` |
| 灭绝师太 (mjs) | `mjs/mjs.glb`（48MB） | `mjs/mjs_web.glb`（1.5MB） | `mjs/mjs_viewer.html` |
| 张三丰 (zf) | `zf/zf.glb`（47MB） | `zf/zf_web.glb`（1.6MB） | `zf/zf_viewer.html` |

- 每个目录里还有 `*_obj.zip`（官方发的 OBJ 包，**是压缩包**，解压后是 .obj + .mtl + 贴图）和 `*_preview.png`（官方渲染的正视图）。
- `立绘/`：新角色的最终立绘（谢逊/宋青书/周芷若两版新旧/宋远桥/灭绝师太），从原资料库 `_src/` 精选留存。
- `3d-gallery.html`：十合一画廊（多文件版），用压缩版，秒开。
- `_jobs/`：每次生成的任务号与日志（下载链接约 24h 有效，过期可凭 JobId 重新取）。
- `xm_full.jpg`：小昭·妹的**补全全身图**（原图在膝盖处被裁断，这张补出了完整双腿），用于重做 3D。

## 二、怎么看

### 方式 A：双击单文件版（最省事，推荐）
`gen_3d/gallery-standalone.html` 是**专为双击设计的单文件版**：查看器库和 10 个模型全部内联进这一个 HTML，
直接双击就能在浏览器里看，**不需要服务器**。库已内联所以不依赖 CDN；首次加载 Draco 解码器需联网（之后浏览器缓存，再开就全自动离线）。
文件较大（约 20.7MB），好处是拷到任何地方、双击即开。

### 方式 B：本地 HTTP 服务（轻量多文件版）
如果你看的是多文件版 `3d-gallery.html` / `<角色>_viewer.html`，**不要直接双击**——浏览器在 `file://` 下会拦截 ES 模块与本地 `.glb` 请求。
在 `gen_3d/` 目录起静态服务器，再用 `http://` 打开：

```bash
# 先 cd 到 gen_3d 目录，然后二选一
python -m http.server 8088          # Python 自带，零依赖
# 或
npx serve .                         # Node 环境
```

浏览器打开：
- 四合一画廊：`http://localhost:8088/3d-gallery.html`
- 单角色：`http://localhost:8088/zw/zw_viewer.html`（zw / wy / xz / xm 同理）

拖拽旋转、滚轮缩放。`model-viewer` 库已下载到本地 `./model-viewer.min.js`，**完全离线可用、不依赖 CDN**。
（本次会话已帮你起好 8088 端口的服务，直接打开上面的链接即可；服务停了就自己跑上面那条命令重启。）

## 三、怎么用起来

### 1. 网页/项目里最省事：`<model-viewer>` 组件
无需构建工具，一行标签即可，跟预览页用的是同一套：

```html
<script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>
<model-viewer src="./gen_3d/zw/zw_web.glb" camera-controls auto-rotate shadow-intensity="1"></model-viewer>
```

光明顶项目是纯 H5（无构建、无 three.js），这个组件是最低成本的接入方式，可以放在选人界面、图鉴、战报结算页做 3D 立绘。

### 2. three.js 场景里加载（要做战斗内 3D 才需要）

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
const draco = new DRACOLoader().setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/');
const loader = new GLTFLoader().setDRACOLoader(draco);
loader.load('./gen_3d/zw/zw_web.glb', g => scene.add(g.scene));
```

压缩版用了 `KHR_draco_mesh_compression` + `EXT_texture_webp`，两个 loader 都要挂。

### 3. 引擎（Unity / UE）
用原始高模的 OBJ 包，或让我再跑一次 `--result-format FBX` 出 FBX（更友好，但 3D 服务每天限额 5 次提交）。

### 4. 压缩（自己重做时用）

```bash
node <node_modules>/@gltf-transform/cli/bin/cli.js optimize in.glb out_web.glb \
  --compress draco --texture-compress webp --texture-size 1024
```

实测：49MB → 1.3MB，面数 50 万 → 30 万。需要原始细节就保持不带 `_web` 的高模，展示场景建议用压缩版。

## 四、注意

- 3D 服务每天**限 5 次提交**（账号级，按 **UTC 自然日 00:00 = 北京时间 08:00** 刷新；与模型复杂度无关），且**同时最多 2 个任务**。实测：2026-09-26 北京 08:01 提交灭绝师太即成功，证明刷新点在北京 08:00（非北京 0 点）。
- 图生 3D **提示词与图片不能同时传**（二选一）：喂图就不要再给文字描述，否则报"Prompt 和 ImageBase64/ImageUrl 不能同时存在"。
- 图生 3D 只能重建「图里看得见的部分」：原图裁断 → 模型就缺；缺的部位要先补图再生成。
- 小昭·妹已于 2026-09-24 用补全全身图 `xm_full.jpg` 重做替换（原版膝盖处截断，新版完整双腿双脚站姿）。旧的高模/OBJ 已被覆盖。
- 2026-09-24：新增谢逊/周芷若·露肩/宋青书/宋远桥四角色（ImageGen 立绘→图生 3D），当天 5 次额度用满。
- 2026-09-26 北京 00:40–00:51（UTC 09-25 日额度内）：重绘周芷若两版（露肩加料·赤足 / 黑化黑金·露背）并各出 3D；重做谢逊/宋青书/宋远桥（新立绘→图生 3D），5 次额度用满。
  对应 JobId：谢逊 `1495100748882395136`、宋青书 `1495100747666161664`、周芷若·露肩 `1495102354927599616`、周芷若·黑化 `1495102356030750720`、宋远桥 `1495103595208392704`。
- 2026-09-26 北京 08:01（UTC 09-26 日额度刚刷新）：灭绝师太 3D 提交成功并生成完毕，高模 `mjs/mjs.glb`（48MB）+ 压缩版 `mjs/mjs_web.glb`（1.5MB）+ 预览 + 查看页 + OBJ 包；JobId `1495213823908331520`。
- 2026-09-26 北京 17:12（UTC 09-26 日额度）：张三丰 3D 提交成功并生成完毕（3 分 03 秒，30 积分），高模 `zf/zf.glb`（47MB）+ 压缩版 `zf/zf_web.glb`（1.6MB）+ 预览 + 查看页 + OBJ 包；JobId `1495351759874293760`。双击版画廊随之重建为 11 模型（22.8MB）。
  **当前额度**：UTC 09-26 日已用 2 次（灭绝、张三丰），**还剩 3 次**（下次刷新：北京 09-27 08:00）。
  **待办**：宋青书 3D 需按新「武当苦练玉面版」立绘重做（现 `sqs.glb` 仍是旧黑化版）；玄冥二老（鹿杖客/鹤笔翁，占 2 次）、成昆、周芷若新写实版的 3D 待用户从 2D 中挑选后提交。
- `gallery-standalone.html` 已重建：内联 10 个模型（含周芷若·黑化），双击即开（约 20.7MB）；`3d-gallery.html` 为多文件版，需本地 HTTP 服务。
