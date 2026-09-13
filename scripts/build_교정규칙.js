const fs = require('fs');
const path = require('path');
const dir = path.resolve(__dirname, '../panels/panel8');
const md = fs.readFileSync(path.join(dir, '교정규칙.md'), 'utf8').replace(/\r\n/g, '\n');
fs.writeFileSync(path.join(dir, '교정규칙.js'), 'window.FULL_RULES_MD = ' + JSON.stringify(md) + ';\n', 'utf8');
console.log('Built proofreading rules:', md.length, 'characters');
