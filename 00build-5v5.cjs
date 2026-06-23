// 00build-5v5.cjs —— 光明顶 5v5 单文件构建脚本 V2.9
// 用法：node 00build-5v5.cjs
// 输出：mode-5v5-combined.html
// 更新：补全 23/24/27 模块及其 VER 映射，确保所有新功能可用

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

const MODULES = [
    '01config-5v5-test.js',
    '03battle-utils.js',
    '02unit.js',
    '23elite-skills.js',
    '04buff-system.js',
    '05battle-horse.js',
    '06battle-engine-core.js',
    '07battle-engine-5v5-test.js',
    '08player-text.js',
    '15fx-common-5v5-test.js',
    '16fx-arrows-5v5-test.js',
    '17fx-crash-5v5-test.js',
    '18fx-position-swap.js',
    '19fx-push-back.js',
    '20fx-dodge-bullet.js',
    '21fx-blood-slash.js',
    '22fx-fortify-counter.js',
    '09player-buff-ui.js',
    '10player-core.js',
    '11battle-player-5v5-test.js',
    '14ui-render-5v5-test.js',
    '12main-utils.js',
    '24error-capture.js',
    '27auto-battle-utils.js',
    '13main-5v5-test.js'
];

const VER_GLOBAL_MAP = {
    '01config-5v5-test.js':           'VER_CONFIG',
    '02unit.js':                      'VER_UNIT',
    '03battle-utils.js':              'VER_UTILS',
    '04buff-system.js':               'VER_BUFF',
    '05battle-horse.js':              'VER_HORSE',
    '06battle-engine-core.js':        'VER_CORE',
    '07battle-engine-5v5-test.js':    'VER_ENGINE',
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
    '21fx-blood-slash.js':            'VER_FX_BLOOD',
    '22fx-fortify-counter.js':        'VER_FX_FORTIFY',
    '23elite-skills.js':              'VER_ELITE_SKILLS',
    '24error-capture.js':             'VER_ERROR_CAPTURE',
    '27auto-battle-utils.js':         'VER_AUTO_BATTLE_UTILS'
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
    return imports;
}

function removeImportsExports(code) {
    code = code.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, '');
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
            // 将 const/let/var VER = ... 改为 var 全局名 = ...
            code = code.replace(/\b(const|let|var)\s+VER\b/g, `var ${ownGlobalVer}`);
            // 将代码中所有独立的 VER 替换为全局名（注意不替换类似 VER_UNIT 这样的单词）
            code = code.replace(/\bVER\b/g, ownGlobalVer);
        }

        // 构建 IIFE 头部：为导入变量创建局部绑定
        let iifeHead = '';
        for (const imp of imports) {
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
        // 确保自己的 VER 被挂载
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
        'BP_VER': 'VER_PLAYER'
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

    const scriptTagRegex = /<script\s+type="module"\s+src="\.\/13main-5v5-test\.js"><\/script>/;
    if (!scriptTagRegex.test(html)) {
        console.error('❌ 在 HTML 模板中未找到入口 script 标签');
        process.exit(1);
    }
    html = html.replace(
        scriptTagRegex,
        `<script>\n${combinedJS}\n</script>`
    );

    const outPath = path.join(ROOT, 'mode-5v5-combined.html');
    fs.writeFileSync(outPath, html, 'utf-8');

    const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(1);
    console.log(`✅ 构建成功：${outPath} (${sizeKB} KB)`);
    console.log('📌 可直接用浏览器打开，或通过 Live Server 获得最佳体验');
}

build();