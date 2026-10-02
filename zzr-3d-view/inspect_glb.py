import json, struct, sys

def load_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, ver, total = struct.unpack('<III', data[:12])
    assert magic == 0x46546C67, 'not glb'
    off = 12
    js = None
    binchunk = None
    while off < total:
        clen, ctype = struct.unpack('<II', data[off:off+8])
        body = data[off+8:off+8+clen]
        if ctype == 0x4E4F534A:
            js = json.loads(body.decode('utf-8'))
        else:
            binchunk = body
        off += 8 + clen
    return js, binchunk

path = sys.argv[1]
g, b = load_glb(path)
print('=== file', path, 'bin bytes', len(b))
print('asset', g.get('asset'))
print('extensionsUsed', g.get('extensionsUsed'))
print('extensionsRequired', g.get('extensionsRequired'))
print('scenes', len(g.get('scenes', [])), 'nodes', len(g.get('nodes', [])),
      'meshes', len(g.get('meshes', [])), 'materials', len(g.get('materials', [])),
      'images', len(g.get('images', [])), 'textures', len(g.get('textures', [])),
      'skins', len(g.get('skins', [])), 'animations', len(g.get('animations', [])))
tot_tri = 0
for i, m in enumerate(g.get('meshes', [])):
    for p in m.get('primitives', []):
        mode = p.get('mode', 4)
        acc = g['accessors'][p['indices']] if 'indices' in p else None
        n = acc['count'] if acc else g['accessors'][p['attributes']['POSITION']]['count']
        tri = (n // 3) if mode == 4 else 0
        tot_tri += tri
        print(f'  mesh{i} prim attrs={list(p["attributes"].keys())} mode={mode} verts_or_idx={n} tri={tri} mat={p.get("material")} targets={len(p.get("targets", []) or [])}')
print('TOTAL TRI', tot_tri)
for i, mt in enumerate(g.get('materials', [])):
    pbr = mt.get('pbrMetallicRoughness', {})
    bt = pbr.get('baseColorTexture')
    print(f'  mat{i} name={mt.get("name")} base={bt.get("index") if bt else None} '
          f'factor={pbr.get("baseColorFactor")} metallic={pbr.get("metallicFactor")}')
for i, im in enumerate(g.get('images', [])):
    print(f'  img{i} mime={im.get("mimeType")} bv={im.get("bufferView")} uri={str(im.get("uri"))[:40]} name={im.get("name")}')
# node transforms
for i, n in enumerate(g.get('nodes', [])):
    if n.get('mesh') is not None:
        print(f'  node{i} mesh={n["mesh"]} T={n.get("translation")} R={n.get("rotation")} S={n.get("scale")} matrix={"yes" if "matrix" in n else "no"} skin={n.get("skin")} children={n.get("children")}')
