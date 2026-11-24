#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
自动体检一键脚本（自动后台线）
用法：
    python3 tools/health_auto_check.py [预算秒] [目标关] [速度值] [轮数]
    python3 tools/health_auto_check.py 180 7 100 1
    python3 tools/health_auto_check.py 600 7 100 3      # 扫 3 轮不同随机阵容，累计覆盖率

功能：
    1. 自动起本地静态服务器（若 8000 端口未占用）
    2. 用无头 Chromium 打开 tests/120test-runner.html?auto=1&budget=&stages=&speed=
    3. 后台自动跑完目标关卡，轮询 window.__healthResult 并打印完整 JSON
    4. 轮数>1 时每轮重载页面（新随机阵容），合并跨轮异常并累计「去重后覆盖规则数」，
       解决单轮只触发约 1/3 规则、稀有机制随 RNG 没出现就一直跳过导致的覆盖盲区。
"""
import json
import os
import re
import socket
import subprocess
import sys
import tempfile
import time

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import threading

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print('[错误] 缺少 playwright，请先安装：pip3 install playwright && python3 -m playwright install chromium')
    sys.exit(1)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8000          # 实际端口在 main() 里按空闲端口重选
URL = f'http://localhost:{PORT}/tests/120test-runner.html'

BUDGET = int(sys.argv[1]) if len(sys.argv) > 1 else 180   # 脚本最多等多久(秒)
STAGES = int(sys.argv[2]) if len(sys.argv) > 2 else 7      # 目标关
SPEED = int(sys.argv[3]) if len(sys.argv) > 3 else 100     # 游戏速度 100=8x
ROUNDS = int(sys.argv[4]) if len(sys.argv) > 4 else 1      # 轮数：每轮重载=新随机阵容


def port_busy(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0


def pick_port(start=8000, tries=50):
    """V1.2：上一轮残留服务占了 8000 会导致页面 ERR_FAILED/no-result，这里主动换空闲端口。"""
    for p in range(start, start + tries):
        if not port_busy(p):
            return p
    return start


def load_rule_tags():
    """规则名 → 机制 tag（读 tests/124rule-recipes.js），用于把 skip 规则排成定向局。"""
    try:
        txt = open(os.path.join(ROOT, 'tests', '124rule-recipes.js'), encoding='utf-8').read()
        raw = dict(re.findall(r"'([^']{2,60})':\s*\{\s*tag:\s*'([^']+)'", txt))
    except Exception:
        return {}
    m = {}
    for k, v in raw.items():
        m[k] = v
        m[re.sub(r'[（(][^）)]*[）)]', '', k).strip()] = v
    return m


def tags_for(names):
    m = load_rule_tags()
    out = {}
    for n in names:
        t = m.get(n) or m.get(re.sub(r'[（(][^）)]*[）)]', '', n).strip())
        if t:
            out.setdefault(t, []).append(n)
    return out


def run_targeted(page, tag, budget):
    """跑一场定向局（?rules=<tag>），返回结果 dict 或 None。"""
    from urllib.parse import quote
    url = f'{URL}?auto=1&budget={budget}&stages={STAGES}&speed={SPEED}&rules={quote(tag)}'
    print(f'\n[定向] ?rules={tag} | 预算{budget}s', flush=True)
    try:
        page.goto(url, wait_until='domcontentloaded', timeout=20000)
    except Exception as e:
        print('[定向] 打开失败:', str(e)[:120], flush=True)
        return None
    deadline = time.time() + budget + 15
    while time.time() < deadline:
        try:
            r = page.evaluate("() => window.__healthResult ? window.__healthResult : null")
            if r:
                return r
            pr = page.evaluate("() => window.__healthProgress ? window.__healthProgress : null")
            if pr:
                print('\r' + render_progress(pr), end='', flush=True)
        except Exception:
            pass
        page.wait_for_timeout(2000)
    print()
    return None


def render_progress(pr):
    """生成单行进度条文本"""
    stage = pr.get('stage', 0)
    target = pr.get('target', STAGES)
    elapsed = pr.get('elapsed', 0)
    issues = pr.get('issues', '?')
    pct = min(100, int(elapsed / max(BUDGET, 1) * 100))
    bar_len = 20
    filled = int(bar_len * pct / 100)
    bar = '█' * filled + '░' * (bar_len - filled)
    return f'[体检中] 第{stage}关/共{target}关 | 耗时{elapsed}s | 异常{issues} | {bar} {pct}%'


def run_one_round(page, round_idx, total_rounds):
    """跑一轮：首轮已 goto，后续轮重载页面（新随机阵容）。返回体检结果 dict 或 None。"""
    if round_idx > 1:
        target_url = f'{URL}?auto=1&budget={BUDGET}&stages={STAGES}&speed={SPEED}'
        print(f'\n[第{round_idx}/{total_rounds}轮] 重载页面（新随机阵容）…', flush=True)
        try:
            page.goto(target_url, wait_until='domcontentloaded', timeout=20000)
        except Exception as e:
            print('[错误] 重载页面失败:', str(e)[:200], flush=True)
            return None
    deadline = time.time() + BUDGET + 20
    result = None
    last_render = ''
    while time.time() < deadline:
        try:
            r = page.evaluate("() => window.__healthResult ? window.__healthResult : null")
            if r:
                result = r
                break
            pr = page.evaluate("() => window.__healthProgress ? window.__healthProgress : null")
            if pr:
                line = render_progress(pr)
                # 单行原地刷新：内容变化才重绘，绝不逐行刷屏
                if line != last_render:
                    print('\r' + line, end='', flush=True)
                    last_render = line
        except Exception:
            pass
        page.wait_for_timeout(2000)
    print()
    return result


def main():
    global PORT, URL
    PORT = pick_port()
    URL = f'http://localhost:{PORT}/tests/120test-runner.html'
    server = None
    if not port_busy(PORT):
        # V1.3：单线程 python -m http.server 在并发 import 时会卡死，浏览器随即 ERR_CONNECTION_REFUSED →
        #   页面 0 关 no-result。改成同进程多线程服务器（也避免孤儿服务占端口）。
        print(f'[起服务器] ThreadingHTTPServer {PORT} (cwd={ROOT})', flush=True)

        class _Quiet(SimpleHTTPRequestHandler):
            def log_message(self, *args):
                pass

        class _Srv(ThreadingHTTPServer):
            daemon_threads = True
            allow_reuse_address = True
            request_queue_size = 256   # 默认 5：浏览器并发拉 169 个规则模块会被拒连 → 页面半初始化

        server = _Srv(('127.0.0.1', PORT), partial(_Quiet, directory=ROOT))
        server.daemon_threads = True
        threading.Thread(target=server.serve_forever, daemon=True).start()
        time.sleep(0.5)

    target_url = f'{URL}?auto=1&budget={BUDGET}&stages={STAGES}&speed={SPEED}'
    print(f'[打开] {target_url}', flush=True)
    print(f'[轮数] 共 {ROUNDS} 轮，每轮目标关{STAGES}、预算{BUDGET}s', flush=True)

    with sync_playwright() as p:
        # 优先用系统 Edge（免下载 chromium）；失败再退回 playwright 自带 chromium
        try:
            browser = p.chromium.launch(headless=True, channel='msedge')
        except Exception:
            browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.on('console', lambda m: print('[console]', m.text[:200], flush=True) if '[AUTO-HEALTH' in m.text else None)
        for _try in range(2):
            try:
                page.goto(target_url, wait_until='domcontentloaded', timeout=20000)
                break
            except Exception as e:
                print(f'[错误] 打开页面失败(第{_try + 1}次):', str(e)[:200], flush=True)
                if _try == 1:
                    browser.close()
                    if server:
                        server.shutdown(); server.server_close()
                    sys.exit(1)
                time.sleep(1)

        # 跨轮累计
        all_issues = []                                   # 异常（按 关/类型/详情 去重）
        seen_issue_keys = set()
        all_pass_names = set()                            # 去重后「通过」规则名
        all_skip_names = set()                            # 去重后「跳过」规则名
        rounds_meta = []                                  # 每轮摘要

        for i in range(1, ROUNDS + 1):
            if i > 1:
                time.sleep(1.0)  # 给上一轮收尾/页面卸载留点时间
            res = run_one_round(page, i, ROUNDS)
            if res:
                for it in res.get('issues', []):
                    key = (it.get('stage'), it.get('type'), it.get('detail'))
                    if key not in seen_issue_keys:
                        seen_issue_keys.add(key)
                        all_issues.append(it)
                all_pass_names.update(res.get('rulePassNames', []))
                all_skip_names.update(res.get('ruleSkippedNames', []))
                rounds_meta.append({
                    'idx': i, 'elapsed': res.get('elapsed', 0), 'max': res.get('maxStageSeen', 0),
                    'reason': res.get('reason'), 'pass': res.get('rulePass', 0), 'skip': res.get('ruleSkip', 0),
                })
            else:
                rounds_meta.append({'idx': i, 'elapsed': None, 'max': 0, 'reason': 'no-result', 'pass': 0, 'skip': 0})

        # V1.3：首轮 no-result 自动重载一次（页面偶发初始化失败，旧版直接判无效收工）
        if len(rounds_meta) == 1 and rounds_meta[0].get('reason') == 'no-result':
            print('[重试] 首轮 no-result，重载页面再跑一次…', flush=True)
            _r = run_one_round(page, 2, 2)
            if _r:
                for _it in _r.get('issues', []):
                    _key = (_it.get('stage'), _it.get('type'), _it.get('detail'))
                    if _key not in seen_issue_keys:
                        seen_issue_keys.add(_key)
                        all_issues.append(_it)
                all_pass_names.update(_r.get('rulePassNames', []))
                all_skip_names.update(_r.get('ruleSkippedNames', []))
                rounds_meta[0] = {'idx': 1, 'elapsed': _r.get('elapsed', 0), 'max': _r.get('maxStageSeen', 0),
                                  'reason': _r.get('reason'), 'pass': _r.get('rulePass', 0),
                                  'skip': _r.get('ruleSkip', 0)}

        # V1.3：定向补跑——按 tag 把「机制没触发」的规则排成最多 3 场定向局（默认 30s/场，可用 env 关掉）
        targeted_meta = []
        if os.environ.get('HEALTH_TARGETED', '1') != '0' and all_skip_names:
            _tb = int(os.environ.get('HEALTH_TARGET_BUDGET', '50'))
            _cand = tags_for(all_skip_names)
            for _tag, _ns in sorted(_cand.items(), key=lambda kv: -len(kv[1]))[:2]:
                _r = run_targeted(page, _tag, _tb)
                if not _r:
                    targeted_meta.append({'tag': _tag, 'reason': 'no-result', 'pass': 0, 'skip': 0, 'max': 0})
                    continue
                for _it in _r.get('issues', []):
                    _key = (_it.get('stage'), _it.get('type'), _it.get('detail'))
                    if _key not in seen_issue_keys:
                        seen_issue_keys.add(_key)
                        all_issues.append(_it)
                _p = set(_r.get('rulePassNames', [])) | set(_r.get('ruleFailNames', []))
                all_pass_names.update(_p)
                all_skip_names.update(_r.get('ruleSkippedNames', []))
                all_skip_names -= _p
                targeted_meta.append({'tag': _tag, 'reason': _r.get('reason'), 'pass': _r.get('rulePass', 0),
                                      'skip': _r.get('ruleSkip', 0), 'max': _r.get('maxStageSeen', 0)})

        # V1.1：无结果 / 0 关 = 本轮无效，不是通过（页面初始化失败、端口冲突都会被旧版当成 ✅）
        invalid_rounds = [m for m in rounds_meta if m['reason'] == 'no-result' or (m['max'] or 0) == 0]
        for m in invalid_rounds:
            all_issues.append({
                'stage': '-', 'type': '体检有效性', 'source': 'runner',
                'detail': f"第{m['idx']}轮无结果（页面未初始化/端口冲突），本轮判无效，不算通过",
            })

        # V1.1：跨关去重——同一现象换个关号就重复 4 条，按「类型 + 去数字签名」合并，保留全部关号
        def _sig(it):
            s = str(it.get('detail') or '')
            s = re.sub(r'第\d+关', '第N关', s)
            s = re.sub(r'（共 \d+ 处）', '', s)
            s = re.sub(r'u\d+', 'u#', s)
            s = re.sub(r'\d+(\.\d+)?', '#', s)
            if '终局名单里消失了' in s:
                return '开局单位在终局名单里消失'
            if '血量轨迹断点' in s:
                return '同回合相邻两击血量接不上'
            return s.split('；')[0].strip()[:80]

        groups, order = {}, []
        for it in all_issues:
            k = (it.get('type'), _sig(it))
            if k not in groups:
                _st = it.get('sliceText') or ''
                _m = re.search(r'seed=(\d+)', _st)
                groups[k] = {'type': it.get('type'), 'detail': it.get('detail'),
                             'source': it.get('source'), 'stages': [], 'seed': _m.group(1) if _m else None}
                order.append(k)
            st = it.get('stage')
            if st not in groups[k]['stages']:
                groups[k]['stages'].append(st)

        RED_KEYS = ('声明与账本', '血量轨迹', '血条实落', '终局名单', '随机重开',
                    '隐藏渲染器', '倒针', 'isRewinding', '存活率', '体检有效性')
        def _red(g):
            blob = f"{g['type']} {g['detail']}"
            return any(k in blob for k in RED_KEYS)

        red = [groups[k] for k in order if _red(groups[k])]
        yellow = [groups[k] for k in order if not _red(groups[k])]
        def _stage_tag(g):
            sts = [s for s in g['stages'] if s not in (None, '-')]
            if not sts:
                return '全局'
            if len(sts) == 1:
                return f'第{sts[0]}关'
            return f"第{'/'.join(str(s) for s in sts)}关"

        print('══════════ 体检报告（多轮累计） ══════════', flush=True)
        total_groups = len(groups)
        if not groups:
            print('✅ 全部通过，未发现异常', flush=True)
        else:
            print(f'❌ 红 {len(red)} 类 / 黄 {len(yellow)} 类（原始 {len(all_issues)} 条 → 跨关去重 {total_groups} 类）', flush=True)
            if red:
                print('【红 · 账本/名单/状态不一致，需主代码处理】', flush=True)
                for g in red:
                    _seed = f"，seed={g['seed']}" if g.get('seed') else ''
                    print(f"   · [{_stage_tag(g)} · {g['type']}] {g['detail']}（来源:{g['source']}{_seed}）", flush=True)
            if yellow:
                print('【黄 · 配置缺项/覆盖不足，先核对再决定】', flush=True)
                for g in yellow:
                    print(f"   · [{_stage_tag(g)} · {g['type']}] {g['detail']}（来源:{g['source']}）", flush=True)

        # V1.2：跨次存档 + diff —— 只看「这次新红了什么 / 上轮红消了什么」，避免每轮从零判读
        _ledger = os.path.join(tempfile.gettempdir(), 'gmtd_health_ledger.json')
        try:
            _prev = json.load(open(_ledger, encoding='utf-8')) if os.path.exists(_ledger) else {}
        except Exception:
            _prev = {}
        _cur_red = sorted({re.sub(r'[（(][^）)]*[）)]', '', str(g['type'])).split('：')[0][:26] for g in red})
        _prev_red = _prev.get('red', [])
        _new_red = [t for t in _cur_red if t not in _prev_red]
        _fixed = [t for t in _prev_red if t not in _cur_red]
        if _prev:
            if _new_red:
                print(f'🆕 比上次新增红 {len(_new_red)} 类：' + '、'.join(_new_red), flush=True)
            else:
                print('🆕 比上次没有新增红类', flush=True)
            if _fixed:
                print(f'✅ 上轮红已消失 {len(_fixed)} 类：' + '、'.join(_fixed), flush=True)
        try:
            json.dump({'red': _cur_red, 'uncovered': sorted(all_skip_names),
                       'ts': time.strftime('%Y-%m-%d %H:%M')}, open(_ledger, 'w', encoding='utf-8'),
                      ensure_ascii=False, indent=1)
        except Exception:
            pass

        if targeted_meta:
            _tp = sum(m.get('pass', 0) for m in targeted_meta)
            print(f'🎯 定向轮 {len(targeted_meta)} 场：新增判决 {_tp} 条', flush=True)
            for m in targeted_meta:
                print(f"   ↳ ?rules={m['tag']}：{m.get('reason')} | 最远第{m.get('max', 0)}关 | "
                      f"通过{m.get('pass', 0)}/跳过{m.get('skip', 0)}", flush=True)

        # V1.2：还没触发的规则 → 下一轮可直接用的定向命令
        _tags = tags_for(all_skip_names)
        if _tags:
            print('🎯 仍未触发，下一轮可补：', flush=True)
            for _t, _ns in sorted(_tags.items(), key=lambda kv: -len(kv[1]))[:5]:
                print(f"   · ?rules={_t} —— 可补 {len(_ns)} 条：{'、'.join(_ns[:3])}", flush=True)
        _map = load_rule_tags()
        _no_tag = [n for n in all_skip_names
                   if n not in _map and re.sub(r'[（(][^）)]*[）)]', '', n).strip() not in _map]
        if _no_tag:
            print(f'   · 另有 {len(_no_tag)} 条没登记机制 tag，补 124 才能定向', flush=True)

        # 每轮摘要
        tot_elapsed = 0
        for m in rounds_meta:
            if m['elapsed'] is not None:
                tot_elapsed += m['elapsed']
            e = f"{m['elapsed']}s" if m['elapsed'] is not None else '—'
            print(f'   ↳ 第{m["idx"]}轮：{e} | 最远第{m["max"]}关 | 通过{m["pass"]}/跳过{m["skip"]} | {m["reason"]}', flush=True)
        print(f'⏱ 累计耗时约 {tot_elapsed} 秒（{ROUNDS} 轮）', flush=True)

        # 累计覆盖
        exercised = len(all_pass_names) + len(all_skip_names)
        print(f'📊 累计覆盖规则（去重）：通过 {len(all_pass_names)} + 跳过 {len(all_skip_names)} = {exercised} 条', flush=True)
        if exercised:
            judged = len(all_pass_names)
            print(f'🔍 覆盖口径：真正给出判决的只有 {judged}/{exercised} 条（{int(judged / exercised * 100)}%），'
                  f'其余 {len(all_skip_names)} 条是「机制没触发」，不等于通过', flush=True)
        valid = len(rounds_meta) - len(invalid_rounds)
        if invalid_rounds:
            print(f'⚠️ 无效轮次 {len(invalid_rounds)}/{len(rounds_meta)}（no-result 或 0 关），已按红计入，不算通过', flush=True)
        if valid == 0:
            print('❌ 结论：本轮无效（没有任何一轮真正跑起来）', flush=True)
        elif red:
            print(f'❌ 结论：红 {len(red)} 类待主代码处理', flush=True)
        elif yellow:
            print(f'⚠️ 结论：无红项，但有黄 {len(yellow)} 类需核对', flush=True)
        if all_skip_names:
            print(f'⏭️ 累计未覆盖规则 {len(all_skip_names)} 条（多轮仍没出现的稀有机制，不代表通过）：', flush=True)
            # 每行约 6 个，避免超长单行
            names = sorted(all_skip_names)
            for k in range(0, len(names), 6):
                print('   ' + '、'.join(names[k:k + 6]), flush=True)
        print('══════════════════════════════', flush=True)
        browser.close()

    if server:
        server.shutdown(); server.server_close()
        print('[关服务器] 完成', flush=True)


if __name__ == '__main__':
    main()
