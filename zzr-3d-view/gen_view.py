"""生成自包含的 GLB 单文件查看页（内嵌 three.js + 模型，断网 file:// 可开）
用法: python gen_view.py model.glb out.html ["标题"] ["副标题"]

模型加载后自动按包围盒归一化（身高 1.7）、脚底贴地、水平居中，
因此对任意尺寸的 GLB 都能得到一致的取景与预设机位。
"""
import base64, os, sys

GLB = sys.argv[1]
OUT = sys.argv[2]
TITLE = sys.argv[3] if len(sys.argv) > 3 else '周芷若 · 3D'
SUB = sys.argv[4] if len(sys.argv) > 4 else '拖拽旋转 · 滚轮缩放 · 双击复位'

HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.path.join(HERE, '_lib')


def read(p):
    with open(p, 'r', encoding='utf-8') as f:
        return f.read()


three_js = read(os.path.join(LIB, 'three.min.js'))
orbit_js = read(os.path.join(LIB, 'OrbitControls.js'))
loader_js = read(os.path.join(LIB, 'GLTFLoader.js'))
with open(GLB, 'rb') as f:
    glb_b64 = base64.b64encode(f.read()).decode('ascii')

SCENE = r"""
var PED = 0;
var FACE_Y = 1.51;
var scene, camera, renderer, controls, character;

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1014);
  scene.fog = new THREE.FogExp2(0x0d1014, 0.035);

  camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.02, 400);
  camera.position.set(0, 1.6, 5.0);

  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('c').appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.05, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.35;
  controls.maxDistance = 26;
  controls.maxPolarAngle = Math.PI * 0.96;

  var hemi = new THREE.HemisphereLight(0xbcd2ff, 0x2a2622, 0.75);
  scene.add(hemi);
  var key = new THREE.DirectionalLight(0xfff2df, 2.1);
  key.position.set(3.4, 5.4, 3.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  var d = 3.2;
  key.shadow.camera.left = -d; key.shadow.camera.right = d;
  key.shadow.camera.top = d; key.shadow.camera.bottom = -d;
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 22;
  key.shadow.bias = -0.0012;
  scene.add(key);
  var fill = new THREE.DirectionalLight(0x9fc0ff, 0.5);
  fill.position.set(-4.2, 2.6, -3.4);
  scene.add(fill);
  var rim = new THREE.PointLight(0xffd9a8, 0.7, 22);
  rim.position.set(0, 2.8, -3.6);
  scene.add(rim);

  var ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64),
    new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.95, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  var grid = new THREE.GridHelper(60, 60, 0x223044, 0x1a2029);
  grid.position.y = 0.002;
  scene.add(grid);

  var loader = new THREE.GLTFLoader();
  var bin = atob(GLB_DATA);
  var buf = new ArrayBuffer(bin.length);
  var arr = new Uint8Array(buf);
  for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  loader.parse(buf, '', function (gltf) {
    character = gltf.scene;
    var box = new THREE.Box3().setFromObject(character);
    var size = new THREE.Vector3(); box.getSize(size);
    var ctr = new THREE.Vector3(); box.getCenter(ctr);
    // 归一化：身高 1.7，水平居中，脚底贴地
    var k = size.y > 0.0001 ? (1.7 / size.y) : 1;
    character.scale.multiplyScalar(k);
    character.position.set(-ctr.x * k, -box.min.y * k, -ctr.z * k);
    character.traverse(function (o) {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material) {
          o.material.side = THREE.FrontSide;
          if (o.material.metalness !== undefined && o.material.metalness > 0.85) o.material.metalness = 0.85;
        }
      }
    });
    scene.add(character);
    FACE_Y = 1.7 * 0.89;
    document.getElementById('loading').style.display = 'none';
    setCam('body');
  }, function (e) {
    document.getElementById('lt').textContent = '模型解析失败：' + e;
  });

  addEventListener('resize', function () {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  document.querySelectorAll('[data-k]').forEach(function (b) {
    b.onclick = function () { setCam(b.dataset.k); };
  });
  renderer.domElement.addEventListener('dblclick', function () { setCam('body'); });
  animate();
}

function setCam(k) {
  var t = new THREE.Vector3(0, 1.7 * 0.53, 0), p, look = t.y;
  if (k === 'all') { p = new THREE.Vector3(0, 1.9, 6.6); look = 0.9; }
  else if (k === 'body') { p = new THREE.Vector3(0, 1.2, 4.5); look = 1.02; }
  else if (k === 'half') { p = new THREE.Vector3(0, 1.45, 2.2); look = 1.30; }
  else if (k === 'face') { p = new THREE.Vector3(0.16, FACE_Y + 0.06, 0.92); look = FACE_Y - 0.02; }
  else if (k === 'back') { p = new THREE.Vector3(0, 1.4, -3.0); look = 1.1; }
  else if (k === 'top') { p = new THREE.Vector3(0, 3.2, 1.1); look = 1.0; }
  else if (k === 'spin') { spinOn = !spinOn; return; }
  camera.position.copy(p);
  controls.target.set(0, look, 0);
  controls.update();
}

var spinOn = true, t0 = 0;
function animate(t) {
  requestAnimationFrame(animate);
  if (spinOn) {
    t0 = (t0 + 1) % 100000;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.9;
  } else {
    controls.autoRotate = false;
  }
  controls.update();
  renderer.render(scene, camera);
}
init();
"""

HTML = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<title>__TITLE__</title>
<style>
  html,body{margin:0;height:100%;background:#0d1014;overflow:hidden;
    font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#e8eaf0}
  #c{position:fixed;inset:0}
  header{position:fixed;left:14px;top:12px;z-index:5;pointer-events:none}
  h1{margin:0;font-size:17px;letter-spacing:.5px;text-shadow:0 2px 10px rgba(0,0,0,.7)}
  header p{margin:5px 0 0;font-size:12px;color:#9aa3b2;text-shadow:0 2px 10px rgba(0,0,0,.7)}
  #bar{position:fixed;left:0;right:0;bottom:14px;z-index:5;display:flex;gap:8px;
    justify-content:center;flex-wrap:wrap;padding:0 10px}
  #bar button{border:1px solid rgba(255,255,255,.14);background:rgba(25,28,35,.82);
    color:#e8eaf0;font-size:13px;padding:8px 14px;border-radius:9px;cursor:pointer;
    backdrop-filter:blur(6px)}
  #bar button:hover{border-color:#d4af6a;color:#f0cd8e}
  #loading{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
    flex-direction:column;gap:10px;background:#0d1014;z-index:9;font-size:14px;color:#9aa3b2}
  #loading b{color:#e8eaf0;font-weight:600}
  #lt{font-size:12px}
  .sp{width:34px;height:34px;border:3px solid rgba(255,255,255,.15);
    border-top-color:#d4af6a;border-radius:50%;animation:s 1s linear infinite}
  @keyframes s{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div id="c"></div>
<header><h1>__TITLE__</h1><p>__SUB__</p></header>
<div id="bar">
  <button data-k="all">全景</button>
  <button data-k="body">全身</button>
  <button data-k="half">半身</button>
  <button data-k="face">脸部特写</button>
  <button data-k="back">背面</button>
  <button data-k="top">俯视</button>
  <button data-k="spin">停/转</button>
</div>
<div id="loading"><div class="sp"></div><div><b>正在解析模型</b>（已内嵌，无需联网）</div><div id="lt"></div></div>
<script>__THREE__</script>
<script>__ORBIT__</script>
<script>__LOADER__</script>
<script>
var GLB_DATA = "__GLB__";
__SCENE__
</script>
</body>
</html>
"""

html = (HTML.replace('__TITLE__', TITLE).replace('__SUB__', SUB)
        .replace('__THREE__', three_js).replace('__ORBIT__', orbit_js)
        .replace('__LOADER__', loader_js).replace('__SCENE__', SCENE)
        .replace('__GLB__', glb_b64))
with open(OUT, 'w', encoding='utf-8') as f:
    f.write(html)
print('已生成 %s  %.1f MB  模型原始 %.1f MB'
      % (OUT, os.path.getsize(OUT) / 1048576, os.path.getsize(GLB) / 1048576))
