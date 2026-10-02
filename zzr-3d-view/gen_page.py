"""把任意 GLB 包成「光明顶演武场」单文件 3D 网页（three.js + 模型全内嵌，断网可看）。
用法: python gen_page.py model.glb 输出.html 标题 副标题 脸高(米) [高台高(米)]
"""
import base64, os, sys

BASE = os.path.dirname(os.path.abspath(__file__))
LIB = os.path.join(BASE, '_lib')

GLB = sys.argv[1]
OUT = sys.argv[2]
TITLE = sys.argv[3] if len(sys.argv) > 3 else '光明顶演武场'
SUBTITLE = sys.argv[4] if len(sys.argv) > 4 else '拖拽旋转，滚轮缩放'
FACE_Y = float(sys.argv[5]) if len(sys.argv) > 5 else 1.514
PED = float(sys.argv[6]) if len(sys.argv) > 6 else 0.40

three = open(os.path.join(LIB, 'three.min.js'), 'r', encoding='utf-8').read()
orbit = open(os.path.join(LIB, 'OrbitControls.js'), 'r', encoding='utf-8').read()
gltf = open(os.path.join(LIB, 'GLTFLoader.js'), 'r', encoding='utf-8').read()
b64 = base64.b64encode(open(GLB, 'rb').read()).decode('ascii')

SCENE_JS = r"""
var scene, camera, renderer, controls, character, clock;
var PED = __PED__;
var FACE_Y = __FACE__ + PED;

function b64ToArrayBuffer(b64) {
  var len = b64.length, bytes = new Uint8Array(Math.floor(len * 3 / 4));
  var p = 0, CH = 65536;
  for (var i = 0; i < len; i += CH) {
    var chunk = b64.substr(i, CH);
    var bin = atob(chunk);
    for (var j = 0; j < bin.length; j++) bytes[p++] = bin.charCodeAt(j);
  }
  return bytes.buffer;
}

function makeSky() {
  var c = document.createElement('canvas'); c.width = 4; c.height = 512;
  var g = c.getContext('2d');
  var grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0.00, '#05070f');
  grd.addColorStop(0.35, '#0b1226');
  grd.addColorStop(0.68, '#1b2748');
  grd.addColorStop(0.88, '#33406b');
  grd.addColorStop(1.00, '#4a5170');
  g.fillStyle = grd; g.fillRect(0, 0, 4, 512);
  var t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

function makeArenaTexture() {
  var S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
  var g = c.getContext('2d');
  g.fillStyle = '#3a3630'; g.fillRect(0, 0, S, S);
  for (var r = 40; r < S / 2; r += 46) {
    g.beginPath(); g.arc(S/2, S/2, r, 0, Math.PI*2);
    g.lineWidth = 3; g.strokeStyle = 'rgba(20,18,16,0.55)'; g.stroke();
    g.beginPath(); g.arc(S/2, S/2, r + 3, 0, Math.PI*2);
    g.lineWidth = 1; g.strokeStyle = 'rgba(255,240,210,0.07)'; g.stroke();
  }
  for (var i = 0; i < 24; i++) {
    var a = i / 24 * Math.PI * 2;
    g.beginPath(); g.moveTo(S/2 + Math.cos(a)*46, S/2 + Math.sin(a)*46);
    g.lineTo(S/2 + Math.cos(a)*S/2, S/2 + Math.sin(a)*S/2);
    g.lineWidth = 2; g.strokeStyle = 'rgba(20,18,16,0.40)'; g.stroke();
  }
  for (var k = 0; k < 26000; k++) {
    var x = Math.random()*S, y = Math.random()*S;
    var v = 120 + Math.random()*70;
    g.fillStyle = 'rgba('+v+','+(v-8)+','+(v-22)+','+(0.05+Math.random()*0.10)+')';
    g.fillRect(x, y, 2, 2);
  }
  var rg = g.createRadialGradient(S/2, S/2, 10, S/2, S/2, S/2);
  rg.addColorStop(0, 'rgba(255,236,200,0.16)');
  rg.addColorStop(1, 'rgba(255,236,200,0)');
  g.fillStyle = rg; g.fillRect(0, 0, S, S);
  var t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
  return t;
}

function buildArena() {
  var g = new THREE.Group();
  var floorMat = new THREE.MeshStandardMaterial({
    map: makeArenaTexture(), roughness: 0.92, metalness: 0.02, color: 0xffffff });
  var floor = new THREE.Mesh(new THREE.CircleGeometry(16, 128), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
  var baseMat = new THREE.MeshStandardMaterial({ color: 0x2a2721, roughness: 0.95 });
  var base = new THREE.Mesh(new THREE.CylinderGeometry(16.3, 17.2, 1.8, 128), baseMat);
  base.position.y = -0.9; base.receiveShadow = true; g.add(base);
  var ring = new THREE.Mesh(new THREE.CylinderGeometry(17.4, 17.9, 0.35, 128), baseMat);
  ring.position.y = -1.9; ring.receiveShadow = true; g.add(ring);
  var colMat = new THREE.MeshStandardMaterial({ color: 0x4a4438, roughness: 0.88 });
  var capMat = new THREE.MeshStandardMaterial({ color: 0x584f3f, roughness: 0.8 });
  var N = 10, R = 15.0;
  for (var i = 0; i < N; i++) {
    var a = i / N * Math.PI * 2;
    var x = Math.cos(a) * R, z = Math.sin(a) * R;
    var col = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.62, 9.5, 24), colMat);
    col.position.set(x, 4.75, z); col.castShadow = true; col.receiveShadow = true; g.add(col);
    var cap = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 1.7), capMat);
    cap.position.set(x, 9.7, z); cap.castShadow = true; g.add(cap);
    var foot = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.45, 1.8), capMat);
    foot.position.set(x, 0.22, z); foot.castShadow = true; g.add(foot);
    var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffb257 }));
    lamp.position.set(x * 0.93, 9.45, z * 0.93); g.add(lamp);
  }
  var arch = new THREE.Mesh(new THREE.TorusGeometry(R, 0.34, 6, 128), capMat);
  arch.rotation.x = Math.PI / 2; arch.position.y = 10.05; arch.castShadow = true; g.add(arch);
  var pedMat = new THREE.MeshStandardMaterial({ color: 0x6b6355, roughness: 0.7, metalness: 0.05 });
  var ped = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.45, PED, 64), pedMat);
  ped.position.y = PED / 2; ped.castShadow = true; ped.receiveShadow = true; g.add(ped);
  return g;
}

function buildMotes() {
  var n = 420, pos = new Float32Array(n * 3);
  for (var i = 0; i < n; i++) {
    var r = 3 + Math.random() * 22, a = Math.random() * Math.PI * 2;
    pos[i*3]   = Math.cos(a) * r;
    pos[i*3+1] = 0.4 + Math.random() * 11;
    pos[i*3+2] = Math.sin(a) * r;
  }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  var mat = new THREE.PointsMaterial({ color: 0xffd9a0, size: 0.06,
    transparent: true, opacity: 0.55, depthWrite: false });
  return new THREE.Points(geo, mat);
}

function init() {
  var host = document.getElementById('stage');
  scene = new THREE.Scene();
  scene.background = makeSky();
  scene.fog = new THREE.FogExp2(0x121a30, 0.0092);
  camera = new THREE.PerspectiveCamera(45, host.clientWidth / host.clientHeight, 0.1, 500);
  camera.position.set(0, 1.7, 5.2);
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, FACE_Y - 0.25, 0);
  controls.enableDamping = true; controls.dampingFactor = 0.06;
  controls.minDistance = 0.9; controls.maxDistance = 80;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.autoRotate = true; controls.autoRotateSpeed = 0.55;
  scene.add(new THREE.HemisphereLight(0x9db8ff, 0x241f18, 0.55));
  var moon = new THREE.DirectionalLight(0xdce8ff, 1.75);
  moon.position.set(9, 16, 7);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.near = 1; moon.shadow.camera.far = 60;
  moon.shadow.camera.left = -14; moon.shadow.camera.right = 14;
  moon.shadow.camera.top = 14; moon.shadow.camera.bottom = -14;
  moon.shadow.bias = -0.0008;
  scene.add(moon);
  var rim = new THREE.DirectionalLight(0x4f74c8, 0.5);
  rim.position.set(-11, 7, -9); scene.add(rim);
  for (var i = 0; i < 4; i++) {
    var a = i / 4 * Math.PI * 2 + 0.4;
    var pl = new THREE.PointLight(0xffa659, 1.1, 16, 2);
    pl.position.set(Math.cos(a) * 13.5, 8.6, Math.sin(a) * 13.5);
    scene.add(pl);
  }
  scene.add(buildArena());
  scene.add(buildMotes());
  document.getElementById('lt').textContent = '正在解码模型…';
  var glbBuf = b64ToArrayBuffer(GLB_DATA);
  var loader = new THREE.GLTFLoader();
  loader.parse(glbBuf, '', function (gltf) {
    character = gltf.scene;
    character.position.y = PED;
    character.traverse(function (o) {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true;
        if (o.material) { o.material.side = THREE.FrontSide; } }
    });
    scene.add(character);
    document.getElementById('loading').style.display = 'none';
    setCam('full');
  }, function (e) {
    document.getElementById('lt').textContent = '模型解析失败：' + (e && e.message ? e.message : e);
  });
  window.addEventListener('resize', function () {
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight);
  });
  clock = new THREE.Clock();
  animate();
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

function setCam(k) {
  var y = FACE_Y, t = PED + 0.85;
  if (k === 'pano')  fly(0, 13, 36, 0, 3, 0);
  if (k === 'full')  fly(0, t + 0.35, 4.6, 0, t, 0);
  if (k === 'half')  fly(0, y - 0.05, 2.35, 0, y - 0.1, 0);
  if (k === 'face')  fly(0, y + 0.02, 0.92, 0, y, 0);
  var ids = { pano: 'b1', full: 'b2', half: 'b3', face: 'b4' };
  for (var kk in ids) {
    var el = document.getElementById(ids[kk]);
    if (el) el.classList.toggle('on', kk === k);
  }
}

function fly(px, py, pz, tx, ty, tz) {
  var from = camera.position.clone();
  var to = new THREE.Vector3(px, py, pz);
  var tf = controls.target.clone();
  var tt = new THREE.Vector3(tx, ty, tz);
  var t0 = performance.now(), dur = 900;
  (function step() {
    var k = Math.min(1, (performance.now() - t0) / dur);
    var e = k < 0.5 ? 2*k*k : 1 - Math.pow(-2*k + 2, 2) / 2;
    camera.position.lerpVectors(from, to, e);
    controls.target.lerpVectors(tf, tt, e);
    if (k < 1) requestAnimationFrame(step);
  })();
}
"""
SCENE_JS = SCENE_JS.replace('__PED__', repr(PED)).replace('__FACE__', repr(FACE_Y))

HTML = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<title>__TITLE__</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:100%; height:100%; overflow:hidden; background:#05070f;
    font-family:"Microsoft YaHei","PingFang SC",system-ui,sans-serif; }
  #stage { position:absolute; inset:0; }
  #stage canvas { display:block; }
  #hud { position:absolute; left:0; right:0; top:0; padding:18px 22px;
    background:linear-gradient(180deg,rgba(0,0,0,.55),rgba(0,0,0,0));
    color:#eef2ff; pointer-events:none; }
  #hud h1 { font-size:19px; font-weight:600; letter-spacing:2px; }
  #hud p { font-size:12px; opacity:.65; margin-top:5px; letter-spacing:.5px; }
  #bar { position:absolute; left:0; right:0; bottom:0; padding:16px 22px 20px;
    display:flex; gap:10px; justify-content:center; flex-wrap:wrap;
    background:linear-gradient(0deg,rgba(0,0,0,.55),rgba(0,0,0,0)); }
  button { pointer-events:auto; background:rgba(255,255,255,.09); color:#eef2ff;
    border:1px solid rgba(255,255,255,.18); border-radius:20px; padding:9px 20px;
    font-size:13px; letter-spacing:1px; cursor:pointer; backdrop-filter:blur(6px);
    transition:.18s; font-family:inherit; }
  button:hover { background:rgba(255,255,255,.2); border-color:rgba(255,255,255,.4); }
  button.on { background:rgba(255,178,87,.28); border-color:rgba(255,178,87,.6); }
  #loading { position:absolute; inset:0; display:flex; align-items:center;
    justify-content:center; flex-direction:column; gap:12px; color:#cfd8ff;
    background:#05070f; font-size:13px; letter-spacing:1px; }
  .spin { width:34px; height:34px; border:2px solid rgba(255,255,255,.18);
    border-top-color:#ffb257; border-radius:50%; animation:s 1s linear infinite; }
  @keyframes s { to { transform:rotate(360deg); } }
  #tip { position:absolute; right:18px; bottom:76px; color:rgba(230,238,255,.45);
    font-size:11px; letter-spacing:.5px; pointer-events:none; }
</style>
</head>
<body>
<div id="stage"></div>
<div id="hud">
  <h1>__TITLE__</h1>
  <p>__SUB__</p>
</div>
<div id="tip">左键拖拽旋转　·　滚轮推拉　·　右键平移</div>
<div id="loading"><div class="spin"></div><span id="lt">正在装载模型…</span></div>
<div id="bar">
  <button id="b1" onclick="setCam('pano')">全景</button>
  <button id="b2" class="on" onclick="setCam('full')">全身</button>
  <button id="b3" onclick="setCam('half')">半身</button>
  <button id="b4" onclick="setCam('face')">脸部特写</button>
  <button id="ar" class="on" onclick="toggleAR(this)">自动环绕</button>
</div>

<script>__THREE__</script>
<script>__ORBIT__</script>
<script>__GLTF__</script>
<script>var GLB_DATA="__GLB__";</script>
<script>__SCENE__</script>
<script>
function toggleAR(b){
  controls.autoRotate = !controls.autoRotate;
  b.classList.toggle('on', controls.autoRotate);
}
init();
</script>
</body>
</html>
"""

html = (HTML
        .replace('__TITLE__', TITLE)
        .replace('__SUB__', SUBTITLE)
        .replace('__THREE__', three)
        .replace('__ORBIT__', orbit)
        .replace('__GLTF__', gltf)
        .replace('__SCENE__', SCENE_JS)
        .replace('__GLB__', b64))

with open(OUT, 'w', encoding='utf-8') as f:
    f.write(html)
print('写出', OUT, round(len(html.encode('utf-8')) / 1048576, 2), 'MB')
