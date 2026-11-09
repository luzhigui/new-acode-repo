const { execFileSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const W = 'D:/_hc_merge_20261109';
const R = 'D:/003 5V5 only one rukou 20260628/003 github newsest 20260628/new-acode-repo';
const raw = execFileSync('git', ['-C', W, 'status', '--porcelain', '-z', '-uall'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const files = raw.split('\0').filter(Boolean).map(s => s.slice(3))
  .filter(f => !/^\.(nightly|merge121|finish-merge)/.test(f));
for (const f of files) {
  const src = path.join(W, f), dst = path.join(R, f);
  if (!fs.existsSync(src)) { console.log('跳过(源不存在) ' + f); continue; }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}
console.log('灌回文件', files.length, '个');
for (let i = 0; i < files.length; i += 20) {
  execFileSync('git', ['-C', R, 'add', '--', ...files.slice(i, i + 20)], { stdio: 'inherit' });
}
const st = execFileSync('git', ['-C', R, 'status', '--short'], { encoding: 'utf8' });
console.log('主仓已暂存条目', st.split('\n').filter(l => /^[MA]/.test(l)).length);
console.log('主仓未暂存改动(应只有别人的 .tmp)', st.split('\n').filter(l => /^ [M?]/.test(l)).slice(0, 6).join(' | '));
