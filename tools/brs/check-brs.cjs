const { lexParseSync } = require('brs');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', 'roku');
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith('.brs')) files.push(p);
  }
}
walk(root);

let fail = 0;
for (const f of files) {
  const out = lexParseSync([f]);
  const errs = (out.lexErrors || []).concat(out.parseErrors || []);
  if (errs.length) {
    fail = 1;
    console.log('ERR', path.relative(root, f));
    for (const e of errs) console.log('   ', e.message);
  } else {
    console.log('OK ', path.relative(root, f));
  }
}
process.exit(fail);