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
import time

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print('[错误] 缺少 playwright，请先安装：pip3 install playwright && python3 -m playwright install chromium')
    sys.exit(1)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8000
URL = f'http://localhost:{PORT}/tests/120test-runner.html'

BUDGET = int(sys.argv[1]) if len(sys.argv) > 1 else 180   # 脚本最多等多久(秒)
STAGES = int(sys.argv[2]) if len(sys.argv) > 2 else 7      # 目标关
SPEED = int(sys.argv[3]) if len(sys.argv) > 3 else 100     # 游戏速度 100=8x
ROUNDS = int(sys.argv[4]) if len(sys.argv) > 4 else 1      # 轮数：每轮重载=新随机阵容


def port_busy(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0


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
    server = None
    if not port_busy(PORT):
        print(f'[起服务器] python3 -m http.server {PORT} (cwd={ROOT})', flush=True)
        server = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'],
                                  cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1.2)

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
        try:
            page.goto(target_url, wait_until='domcontentloaded', timeout=20000)
        except Exception as e:
            print('[错误] 打开页面失败:', str(e)[:200], flush=True)
            browser.close()
            if server:
                server.terminate()
            sys.exit(1)

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
            return s.split('；')[0].strip()[:80]

        groups, order = {}, []
        for it in all_issues:
            k = (it.get('type'), _sig(it))
            if k not in groups:
                groups[k] = {'type': it.get('type'), 'detail': it.get('detail'),
                             'source': it.get('source'), 'stages': []}
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
                    print(f"   · [{_stage_tag(g)} · {g['type']}] {g['detail']}（来源:{g['source']}）", flush=True)
            if yellow:
                print('【黄 · 配置缺项/覆盖不足，先核对再决定】', flush=True)
                for g in yellow:
                    print(f"   · [{_stage_tag(g)} · {g['type']}] {g['detail']}（来源:{g['source']}）", flush=True)

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
        server.terminate()
        print('[关服务器] 完成', flush=True)


if __name__ == '__main__':
    main()
