const fs = require('fs');
const md = fs.readFileSync(__dirname + '/교정규칙.md', 'utf8');
const escaped = md
  .replace(/\r\n/g, '\n')
  .replace(/\\/g, '\\\\')
  .replace(/'/g, "\\'")
  .replace(/\n/g, '\\n');
const out = "window.FULL_RULES_MD = '" + escaped + "';\n";
fs.writeFileSync(__dirname + '/교정규칙.js', out, 'utf8');
console.log('Done. Length:', escaped.length, 'bytes');
