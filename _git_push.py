import subprocess, os, sys

os.chdir(r'd:\003 5V5 only one rukou 20260628\003 github newsest 20260628\new-acode-repo')

def run(cmd):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return f"CMD: {cmd}\nEXIT: {result.returncode}\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}\n{'='*40}\n"

out = ""
out += run('git rev-parse HEAD')
out += run('git rev-parse origin/main')
out += run('git status --short')
out += run('git push --force origin main')
out += run('git rev-parse origin/main')

with open('_git_push_result.txt', 'w', encoding='utf-8') as f:
    f.write(out)

print('done')
