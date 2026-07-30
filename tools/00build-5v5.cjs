﻿﻿﻿﻿﻿﻿﻿// tools/00build-5v5.cjs - 光明顶5v5 构建脚本
// V5.2.1 | 更新：2026-07-21 合并新模块

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const MODULES = [
    'core/01config-5v5-test.js',
    'core/03battle-utils.js',
    'core/02unit.js',
    'modules/23elite-skills.js',
    'core/04buff-system.js',
    'core/05battle-horse.js',
    'core/06battle-engine-core.js',
    'core/07battle-engine-5v5-test.js',
    'core/47battle-attack.js',
    'core/48battle-round.js',
    'core/49battle-attack-steps.js',
    'core/50battle-shared.js',
    'player/08player-text.js',
    'fx/15fx-common-5v5-test.js',
    'fx/16fx-arrows-5v5-test.js',
    'fx/17fx-crash-5v5-test.js',
    'fx/18fx-position-swap.js',
    'fx/19fx-push-back.js',
    'fx/20fx-dodge-bullet.js',
    'fx/21fx-butterfly-spider.js',
    'player/09player-buff-ui.js',
    'player/10player-core.js',
    'player/11battle-player-5v5-test.js',
    'ui/14ui-render-5v5-test.js',
    'ui/12main-utils.js',
    'modules/24error-capture.js',
    'modules/28audio-manager.js',
    'modules/46global-store.js',
    'tools/27auto-battle-utils.js',
    'ui/39main-state.js',
    'ui/40main-dialogs.js',
    'ui/41main-battle.js',
    'ui/42audio-control.js',
    'ui/43fx-trigger.js',
    'ui/44ui-controls.js',
    'ui/13main-5v5-test.js'
];

const VER_GLOBAL_MAP = {
    '01config-5v5-test.js':           'VER_CONFIG',
    '02unit.js':                      'VER_UNIT',
    '03battle-utils.js':              'VER_UTILS',
    '04buff-system.js':               'VER_BUFF',
    '05battle-horse.js':              'VER_HORSE',
    '06battle-engine-core.js':        'VER_CORE',
    '07battle-engine-5v5-test.js':    'VER_ENGINE',
    '47battle-attack.js':             'VER_ATTACK',
    '48battle-round.js':              'VER_ROUND',
    '49battle-attack-steps.js':       'VER_ATTACK_STEPS',
    '50battle-shared.js':             'VER_SHARED',
    '08player-text.js':               'VER_TEXT',
    '09player-buff-ui.js':            'VER_BUFF_UI',
    '10player-core.js':               'VER_PLAYER_CORE',
    '11battle-player-5v5-test.js':    'VER_PLAYER',
    '12main-utils.js':                'VER_MAIN_UTILS',
    '14ui-render-5v5-test.js':        'VER_UI',
    '15fx-common-5v5-test.js':        'VER_FX_COMMON',
    '16fx-arrows-5v5-test.js':        'VER_FX_ARROWS',
    '17fx-crash-5v5-test.js':         'VER_FX_CRASH',
    '18fx-position-swap.js':          'VER_FX_SWAP',
    '19fx-push-back.js':              'VER_FX_PUSH',
    '20fx-dodge-bullet.js':           'VER_FX_DODGE',
    '21fx-butterfly-spider.js':       'VER_FX_BUTTERFLY',
    '23elite-skills.js':              'VER_ELITE_SKILLS',
    '24error-capture.js':             'VER_ERROR_CAPTURE',
    '28audio-manager.js':             'VER_AUDIO',
    '46global-store.js':              'VER_GLOBAL_STORE',
    '27auto-battle-utils.js':         'VER_AUTO_BATTLE_UTILS',
    '39main-state.js':                'VER_MAIN_STATE',
    '40main-dialogs.js':              'VER_MAIN_DIALOGS',
    '41main-battle.js':               'VER_MAIN_BATTLE',
    '42audio-control.js':             'VER_AUDIO_CTRL',
    '43fx-trigger.js':                'VER_FX_TRIGGER',
    '44ui-controls.js':               'VER_UI_CTRL',
    '13main-5v5-test.js':             'VER_MAIN'
};

const HTML_TEMPLATE = 'mode-5v5-test.html';

function parseImports(code) {
    const imports = [];
    const regex = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?/g;
    let m;
    while ((m = regex.exec(code)) !== null) {
        const items = m[1].split(',');
        const source = path.basename(m[2]);
        items.forEach(item => {
            const trimmed = item.trim();
            const asMatch = trimmed.match(/^(.+?)\s+as\s+(.+)$/);
            if (asMatch) {
                imports.push({ localName: asMatch[2].trim(), sourceFile: source });
            } else {
                imports.push({ localName: trimmed, sourceFile: source });
            }
        });
    }
    // Also handle side-effect imports: import '../path.js';
    const sideRegex = /import\s+['"]([^'"]+)['"];?/g;
    while ((m = sideRegex.exec(code)) !== null) {
        const source = path.basename(m[1]);
        imports.push({ localName: null, sourceFile: source });
    }
    return imports;
}

function removeImportsExports(code) {
    code = code.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, '');
    code = code.replace(/import\s+['"][^'"]+['"];?/g, '');
    code = code.replace(/export\s*\{[\s\S]*?\};?/g, '');
    code = code.replace(/export\s+default\s+/g, '');
    code = code.replace(/export\s+(const|let|var|function|class|async\s+function)\s+/g, '$1 ');
    code = code.replace(/\bexport\b\s*/g, '');
    return code;
}

function extractExports(code) {
    const exportsSet = new Set();
    const singleRegex = /export\s+(const|let|var|function|class|async\s+function)\s+(\w+)/g;
    let m;
    while ((m = singleRegex.exec(code)) !== null) {
        exportsSet.add(m[2]);
    }
    const listRegex = /export\s*\{([^}]+)\}/g;
    while ((m = listRegex.exec(code)) !== null) {
        const items = m[1].split(',');
        items.forEach(item => {
            const trimmed = item.trim();
            const asMatch = trimmed.match(/^(.+?)\s+as\s+(.+)$/);
            if (asMatch) {
                exportsSet.add(asMatch[2].trim());
            } else {
                exportsSet.add(trimmed);
            }
        });
    }
    return Array.from(exportsSet);
}

// 预扫描导出列表
const moduleExports = {};
for (const mod of MODULES) {
    const filePath = path.join(ROOT, mod);
    if (fs.existsSync(filePath)) {
        const code = fs.readFileSync(filePath, 'utf-8');
        moduleExports[mod] = extractExports(code);
    }
}

function build() {
    console.log('🔨 开始构建 5v5 单文件……\n');

    let combinedJS = '';

    for (const mod of MODULES) {
        const filePath = path.join(ROOT, mod);
        if (!fs.existsSync(filePath)) {
            console.error(`❌ 文件不存在：${mod}`);
            process.exit(1);
        }

        let code = fs.readFileSync(filePath, 'utf-8');
        const lines = code.split('\n').length;

        const imports = parseImports(code);

        // 移除 import/export
        code = removeImportsExports(code);

        // 处理自己的 VER：重命名声明并替换所有引用
        const ownGlobalVer = VER_GLOBAL_MAP[mod];
        if (ownGlobalVer) {
            code = code.replace(/\b(const|let|var)\s+VER\b/g, `var ${ownGlobalVer}`);
            code = code.replace(/\bVER\b/g, ownGlobalVer);
        }

        // 构建 IIFE 头部：为导入变量创建局部绑定
        let iifeHead = '';
        for (const imp of imports) {
            if (!imp.localName) continue; // side-effect import
            if (imp.localName === 'VER' && VER_GLOBAL_MAP[imp.sourceFile]) {
                iifeHead += `  var VER = window.${VER_GLOBAL_MAP[imp.sourceFile]};\n`;
            } else {
                iifeHead += `  var ${imp.localName} = window.${imp.localName};\n`;
            }
        }

        // 构建 IIFE 尾部：将自己导出的变量挂载到 window
        let iifeTail = '';
        const exportsList = moduleExports[mod] || [];
        for (const expVar of exportsList) {
            if (expVar === 'VER' && ownGlobalVer) {
                iifeTail += `  window.${ownGlobalVer} = ${ownGlobalVer};\n`;
            } else if (expVar !== 'VER') {
                iifeTail += `  window.${expVar} = ${expVar};\n`;
            }
        }
        if (ownGlobalVer) {
            iifeTail += `  window.${ownGlobalVer} = ${ownGlobalVer};\n`;
        }

        const iife = `(function() {\n${iifeHead}\n${code}\n${iifeTail}})();`;

        combinedJS += `\n// ===== ${mod} (${lines} lines) =====\n`;
        combinedJS += iife + '\n';
    }

    // 全局替换别名引用
    const ALIAS_MAP = {
        'CFG_VER': 'VER_CONFIG',
        'BE_VER': 'VER_ENGINE',
        'UI_VER': 'VER_UI',
        'FX_VER': 'VER_FX_COMMON',
        'FA_VER': 'VER_FX_ARROWS',
        'FC_VER': 'VER_FX_CRASH',
        'BP_VER': 'VER_PLAYER',
        'AGS_VER': 'VER_GLOBAL_STORE'
    };
    for (const [oldName, newName] of Object.entries(ALIAS_MAP)) {
        combinedJS = combinedJS.replace(new RegExp(`\\b${oldName}\\b`, 'g'), newName);
    }

    console.log('✅ JS 模块合并完成');

    const htmlPath = path.join(ROOT, HTML_TEMPLATE);
    if (!fs.existsSync(htmlPath)) {
        console.error(`❌ HTML 模板不存在：${HTML_TEMPLATE}`);
        process.exit(1);
    }
    let html = fs.readFileSync(htmlPath, 'utf-8');

    // 替换两个 module script 标签为合并后的内联脚本
    const moduleRegex = /<script\s+type="module"\s+src="[^"]+"><\/script>/g;
    let first = true;
    html = html.replace(moduleRegex, (match) => {
        if (first) {
            first = false;
            return `<script>\n${combinedJS}\n</script>`;
        }
        return ''; // 移除后续的 module script 标签
    });

    const outPath = path.join(ROOT, 'mode-5v5-combined.html');
    fs.writeFileSync(outPath, html, 'utf-8');

    const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(1);
    console.log(`✅ 构建成功：${outPath} (${sizeKB} KB)`);
    console.log('📌 可直接用浏览器打开，或上传到在线 APK 打包工具');
}

build();