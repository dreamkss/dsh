// Verify this project's preset composition: that it differs from the shipped
// `standard` preset in exactly one field, and that the YAML folded scalar
// resolves to the intended paragraph.
//
// The `standard` source is located through the DSH install, so the comparison
// works from any checkout of this project. Override with DSH_INSTALL.
//
// Uses a hand-written reader for exactly the subset this file needs (a sequence
// of maps, one nested map, one folded block scalar) instead of pulling a YAML
// dependency, so the check runs on a tree with no install.
// Run: node verify-preset.cjs
const fs = require('fs');
const path = require('path');

const presetDir = path.join(__dirname, 'preset');
const install = process.env.DSH_INSTALL
  || 'C:\\Users\\dream\\AppData\\Local\\npm-cache\\_npx\\1e7f6d9597241db0\\node_modules\\@deepseek-ai\\dsh-agent-presets';
const stdFile = path.join(install, 'presets', 'standard', 'agent.cordis.yml');

if (!fs.existsSync(stdFile)) {
  console.error('Cannot find the shipped standard preset at:\n  ' + stdFile);
  console.error('Set DSH_INSTALL to the @deepseek-ai/dsh-agent-presets directory.');
  process.exit(2);
}

let failures = 0;
function check(label, ok, detail) {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? '  -- ' + detail : ''}`);
  if (!ok) failures++;
}

// --- minimal YAML reader -----------------------------------------------------
// Returns { rows: [...], persona: {config} , raw: text }
function readComposition(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const lines = raw.split('\n');
  const rows = [];
  let cur = null;
  let curKey = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*#/.test(line) || line.trim() === '') continue;

    // top-level sequence entry: "- id: x" at column 0
    let m = /^- id:\s*(.+?)\s*$/.exec(line);
    if (m) {
      cur = { id: m[1], name: null, config: {} };
      rows.push(cur);
      curKey = null;
      continue;
    }
    if (/^-\s/.test(line)) { // a row without an id (e.g. a group row)
      cur = { id: null, name: null, config: {} };
      rows.push(cur);
      curKey = null;
      continue;
    }
    if (!cur) continue;

    m = /^\s{2}name:\s*(.+?)\s*$/.exec(line);
    if (m) { cur.name = m[1].replace(/^['"]|['"]$/g, ''); curKey = null; continue; }

    m = /^\s{2}config:\s*$/.exec(line);
    if (m) { curKey = null; continue; }

    // map key under config
    m = /^\s{4}([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if (m) {
      const key = m[1];
      const rest = m[2];
      if (rest === '>-' || rest === '>' || rest === '|' || rest === '|-') {
        // block scalar: consume the following more-indented lines
        const indent = 6;
        const buf = [];
        let j = i + 1;
        for (; j < lines.length; j++) {
          const l = lines[j];
          if (l.trim() === '') { buf.push(''); continue; }
          const lead = l.match(/^\s*/)[0].length;
          if (lead < indent) break;
          buf.push(l.slice(indent));
        }
        i = j - 1;
        let value;
        if (rest.startsWith('>')) {
          // folded: single newlines become spaces, blank line becomes newline
          value = buf.join('\n').replace(/\n(?!\n)/g, ' ').replace(/\n{2,}/g, '\n').trim();
        } else {
          value = buf.join('\n');
        }
        cur.config[key] = value;
      } else {
        cur.config[key] = rest.replace(/^['"]|['"]$/g, '');
      }
    }
  }
  return { rows, raw };
}

function personaConfig(rows) {
  const r = rows.find((x) => x.id === 'persona');
  return r ? r.config : null;
}

console.log('=== 1. composition files are present and parse as UTF-8 ===');
for (const f of ['agent.cordis.yml', 'preset.yml']) {
  const p = path.join(presetDir, f);
  const buf = fs.readFileSync(p);
  check(f, buf.length > 0, `${buf.length} bytes`);
}

console.log('\n=== 2. composition is structurally intact ===');
const ver = readComposition(path.join(presetDir, 'agent.cordis.yml'));
const ids = ver.rows.map((r) => r.id || '(no-id row)');
check('rows parsed', ver.rows.length > 10, `${ver.rows.length} rows`);
check('persona row present', ids.includes('persona'));
check('persona is the first row', ids[0] === 'persona', `first = ${ids[0]}`);
check('agent-instructions still present', ids.includes('agent-instructions'));

console.log('\n=== 3. the ONLY change vs standard is persona.config.prefix ===');
const std = readComposition(stdFile);
const pStd = personaConfig(std.rows);
const pVer = personaConfig(ver.rows);
console.log('  standard persona keys:', JSON.stringify(Object.keys(pStd)));
console.log('  verified persona keys:', JSON.stringify(Object.keys(pVer)));
check('suffix unchanged', pStd.suffix === pVer.suffix, JSON.stringify(pVer.suffix));
check('prefix CHANGED', pStd.prefix !== pVer.prefix);
check('prefix still starts with the original sentence',
  pVer.prefix.startsWith('You are a coding agent powered by the {{model}} model.'));

const stripPersona = (rows) => JSON.stringify(rows.filter((r) => r.id !== 'persona'));
check('every other row identical to standard', stripPersona(std.rows) === stripPersona(ver.rows),
  `standard ${std.rows.length} rows vs verified ${ver.rows.length} rows`);
check('same row count', std.rows.length === ver.rows.length);

console.log('\n=== 4. the text the model will actually receive (after YAML folding) ===');
console.log('  --- resolved persona.prefix ---');
console.log(pVer.prefix.split('\n').map((l) => '  | ' + l).join('\n'));
const required = [
  'You are a coding agent powered by the {{model}} model.',
  'Distinguish what you actually ran or read from what you assert from memory.',
  'verify it in this session',
  'unverified',
  'cannot obtain evidence',
];
for (const r of required) {
  check(`contains "${r.length > 44 ? r.slice(0, 44) + '...' : r}"`, pVer.prefix.includes(r));
}
check('{{model}} placeholder preserved', pVer.prefix.includes('{{model}}'));
check('no stray newline inside the paragraph', !pVer.prefix.includes('\n'));

console.log('\n=== 5. metadata ===');
const metaRaw = fs.readFileSync(path.join(presetDir, 'preset.yml'), 'utf8');
const nameM = /^name:\s*(.+)$/m.exec(metaRaw);
const descM = /^description:\s*(.+)$/m.exec(metaRaw);
const name = nameM ? nameM[1].trim() : '';
const desc = descM ? descM[1].trim() : '';
console.log('  name       :', name);
console.log('  description:', desc);
check('name is the authored one', name === '核实模式');
check('description mentions verification', /核实/.test(desc));
check('no BOM', fs.readFileSync(path.join(presetDir, 'preset.yml'))[0] !== 0xef);

console.log(`\n=== RESULT: ${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'} ===`);
process.exit(failures === 0 ? 0 : 1);
