#!/usr/bin/env node
/**
 * ATLAS SSOT version tool — zero dependencies, Node 18+.
 *
 * Usage:
 *   node scripts/version.mjs bump <patch|minor|major|prerelease|alpha|beta|rc|stable>
 *   node scripts/version.mjs set <x.y.z[-channel.n]>
 *   node scripts/version.mjs sync
 *   node scripts/version.mjs verify
 *   node scripts/version.mjs show
 *
 * Flags: --dry-run  --json  --no-changelog  --allow-downgrade
 *
 * Exit: 0 ok | 1 invalid/drift | 2 usage | 3 write failure
 *
 * Contract:
 *  - package.json#version (or root version.json) is the ONLY hand-edited version.
 *  - Every other surface is derived and marked AUTO-GENERATED.
 *  - bump/set are transactional: on any write failure the SSOT and every
 *    already-written derived file are restored to their previous bytes.
 *  - sync is idempotent; verify exits 1 on drift (used as a CI gate).
 *  - Missing project structure is skipped, never invented.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const positional = argv.filter((a) => !a.startsWith('--'));
const cmd = positional[0];
const args = positional.slice(1);

const DRY = flags.has('--dry-run');
const AS_JSON = flags.has('--json');
const NO_CHANGELOG = flags.has('--no-changelog');
const ALLOW_DOWNGRADE = flags.has('--allow-downgrade');

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$/;
const RANK = { alpha: 0, beta: 1, rc: 2, stable: 3 };
const MAX_PRERELEASE = 99;

class Exit extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const die = (code, message) => {
  throw new Exit(code, message);
};

/* ------------------------------------------------------------------ */
/* text IO (BOM-safe, Windows-rename-safe, atomic)                    */
/* ------------------------------------------------------------------ */

function readText(abs) {
  const buf = fs.readFileSync(abs);
  const hasBom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const text = buf.toString('utf8');
  return { text: hasBom ? text.slice(1) : text, bom: hasBom };
}

const sleep = (ms) => {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    /* ignore */
  }
};

function writeAtomic(abs, text, bom) {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, (bom ? '\ufeff' : '') + text, 'utf8');
  let lastErr;
  for (let i = 0; i < 5; i++) {
    try {
      fs.renameSync(tmp, abs);
      return;
    } catch (e) {
      lastErr = e;
      sleep(20);
    }
  }
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }
  throw lastErr;
}

const readIf = (rel) => {
  try {
    return readText(path.join(ROOT, rel));
  } catch {
    return null;
  }
};

/* ------------------------------------------------------------------ */
/* semver                                                             */
/* ------------------------------------------------------------------ */

function parse(v) {
  const m = SEMVER.exec(String(v || '').trim());
  if (!m) return null;
  const n = m[4] ? Number(m[5]) : 0;
  if (m[4] && n > MAX_PRERELEASE) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    channel: m[4] || 'stable',
    n,
  };
}

const fmt = (p) => {
  const core = `${p.major}.${p.minor}.${p.patch}`;
  return p.channel === 'stable' ? core : `${core}-${p.channel}.${p.n}`;
};

function cmp(a, b) {
  const core = (x, y) => x.major - y.major || x.minor - y.minor || x.patch - y.patch;
  return core(a, b) || RANK[a.channel] - RANK[b.channel] || a.n - b.n;
}

function versionCode(p) {
  const base = (p.major * 10000 + p.minor * 100 + p.patch) * 1000;
  const ch = p.channel === 'stable' ? 900 : { alpha: 0, beta: 100, rc: 200 }[p.channel];
  return base + ch + (p.channel === 'stable' ? 0 : p.n);
}

function bump(p, type) {
  const next = (major, minor, patch, channel, n) => ({ major, minor, patch, channel, n });
  switch (type) {
    case 'major':
      return next(p.major + 1, 0, 0, 'stable', 0);
    case 'minor':
      return next(p.major, p.minor + 1, 0, 'stable', 0);
    case 'patch':
      return p.channel === 'stable'
        ? next(p.major, p.minor, p.patch + 1, 'stable', 0)
        : next(p.major, p.minor, p.patch, 'stable', 0);
    case 'prerelease':
      if (p.channel === 'stable') die(2, 'Cannot bump prerelease from a stable version.');
      if (p.n >= MAX_PRERELEASE) die(1, `Prerelease number exceeds ${MAX_PRERELEASE}. Bump minor instead.`);
      return next(p.major, p.minor, p.patch, p.channel, p.n + 1);
    case 'alpha':
    case 'beta':
    case 'rc': {
      if (p.channel === 'stable') return next(p.major, p.minor + 1, 0, type, 1);
      if (RANK[type] > RANK[p.channel]) return next(p.major, p.minor, p.patch, type, 1);
      return next(p.major, p.minor + 1, 0, type, 1);
    }
    case 'stable':
      if (p.channel === 'stable') die(2, 'Already stable.');
      return next(p.major, p.minor, p.patch, 'stable', 0);
    default:
      die(2, `Unknown bump type "${type}". Use patch|minor|major|prerelease|alpha|beta|rc|stable.`);
  }
}

/* ------------------------------------------------------------------ */
/* SSOT                                                               */
/* ------------------------------------------------------------------ */

const pkgPath = path.join(ROOT, 'package.json');
const vjsonPath = path.join(ROOT, 'version.json');
const isPkg = fs.existsSync(pkgPath);
const ssotPath = isPkg ? pkgPath : vjsonPath;
const ssotLabel = isPkg ? 'package.json#version' : 'version.json';

if (!fs.existsSync(ssotPath)) {
  console.error(`No package.json or version.json found in ${ROOT}`);
  process.exit(1);
}

function readSSOT() {
  const { text } = readText(ssotPath);
  const m = /"version"\s*:\s*"([^"]*)"/.exec(text);
  if (!m) die(1, `Cannot read "version" from ${ssotLabel}`);
  return m[1];
}

function setSSOT(v) {
  if (DRY) return;
  const { text, bom } = readText(ssotPath);
  const re = /("version"\s*:\s*")[^"]*(")/;
  if (!re.test(text)) die(3, `Cannot find "version" in ${ssotLabel}`);
  writeAtomic(ssotPath, text.replace(re, `$1${v}$2`), bom);
}

/* ------------------------------------------------------------------ */
/* derived surfaces                                                   */
/* ------------------------------------------------------------------ */

const parentExists = (rel) => fs.existsSync(path.join(ROOT, rel.split('/')[0]));

const targets = [
  {
    name: 'app-constant',
    file: 'src/generated/version.ts',
    create: true,
    render: (v, p) =>
      [
        '// AUTO-GENERATED by scripts/version.mjs - DO NOT EDIT',
        `// Source of truth: ${ssotLabel}`,
        `export const APP_VERSION = "${v}";`,
        `export const APP_CHANNEL = "${p.channel}";`,
        `export const APP_VERSION_CODE = ${versionCode(p)};`,
        '',
      ].join('\n'),
  },
  {
    name: 'runtime-manifest',
    file: 'public/version.json',
    create: true,
    render: (v, p) =>
      JSON.stringify({ version: v, channel: p.channel, versionCode: versionCode(p) }, null, 2) + '\n',
  },
  {
    name: 'readme',
    file: 'README.md',
    render: (v, p, text) => {
      const next = text
        .replace(/(badge\/version-)\d+\.\d+\.\d+(?:--?(?:alpha|beta|rc)\.\d+)?/g, `$1${v}`)
        .replace(/(\*\*Version:\*\*\s*)[0-9A-Za-z.-]+/g, `$1${v}`);
      return next === text ? null : next;
    },
  },
  {
    name: 'web-meta',
    file: 'index.html',
    render: (v, p, text) => {
      const next = text.replace(/(<meta\s+name="app-version"\s+content=")[^"]*(")/, `$1${v}$2`);
      return next === text ? null : next;
    },
  },
  {
    name: 'openapi-yaml',
    file: 'openapi.yaml',
    render: (v, p, text) => {
      if (!/^info:/m.test(text)) return null;
      const next = text.replace(/^(\s+version:\s*).+$/m, `$1${v}`);
      return next === text ? null : next;
    },
  },
  {
    name: 'openapi-json',
    file: 'openapi.json',
    render: (v, p, text) => {
      let obj;
      try {
        obj = JSON.parse(text);
      } catch {
        return null;
      }
      if (!obj.info || obj.info.version === v) return null;
      obj.info.version = v;
      return JSON.stringify(obj, null, 2) + '\n';
    },
  },
  {
    name: 'android',
    file: 'android/app/build.gradle',
    render: (v, p, text) => {
      const next = text
        .replace(/(versionName\s+")[^"]*(")/, `$1${v}$2`)
        .replace(/(versionCode\s+)\d+/, `$1${versionCode(p)}`);
      return next === text ? null : next;
    },
  },
  {
    name: 'tauri',
    file: 'src-tauri/tauri.conf.json',
    render: (v, p, text) => {
      const next = text.replace(/("version"\s*:\s*")[^"]*(")/, `$1${v}$2`);
      return next === text ? null : next;
    },
  },
  {
    name: 'expo',
    file: 'app.json',
    render: (v, p, text) => {
      const next = text.replace(/("version"\s*:\s*")[^"]*(")/, `$1${v}$2`);
      return next === text ? null : next;
    },
  },
  {
    name: 'docker',
    file: 'Dockerfile',
    render: (v, p, text) => {
      const next = text.replace(/(LABEL\s+org\.opencontainers\.image\.version=")[^"]*(")/, `$1${v}$2`);
      return next === text ? null : next;
    },
  },
  {
    name: 'memory',
    file: 'MEMORY.md',
    render: (v, p, text) => {
      const next = text.replace(/(Current version:\s*)[0-9A-Za-z.-]+/, `$1${v}`);
      return next === text ? null : next;
    },
  },
  {
    name: 'handoff',
    file: 'HANDOFF.md',
    render: (v, p, text) => {
      const next = text.replace(/(Current version:\s*)[0-9A-Za-z.-]+/, `$1${v}`);
      return next === text ? null : next;
    },
  },
  {
    name: 'status',
    file: 'docs/PROJECT-STATUS.md',
    render: (v, p, text) => {
      const next = text.replace(/(^|\n)(Version:\s*)[0-9A-Za-z.-]+/, `$1$2${v}`);
      return next === text ? null : next;
    },
  },
];

const FM = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function renderFrontMatter(v, text) {
  const m = FM.exec(text);
  if (!m) return null;
  if (!/^version:\s*/m.test(m[1])) return null;
  const block = m[0];
  const nextBlock = block.replace(/^version:\s*.*$/m, `version: ${v}`);
  return nextBlock === block ? null : nextBlock + text.slice(block.length);
}

function changelogNext(v, cur) {
  if (!cur || NO_CHANGELOG) return null;
  if (cur.text.includes(`## [${v}]`)) return null;
  const lines = cur.text.split(/\r?\n/);
  const entry = [`## [${v}] - ${new Date().toISOString().slice(0, 10)}`, '', '- ', ''];
  const unreleased = lines.findIndex((l) => /^##\s+\[?unreleased\]?/i.test(l));
  let idx;
  if (unreleased !== -1) {
    const after = lines.findIndex((l, i) => i > unreleased && /^##\s/.test(l));
    idx = after === -1 ? lines.length : after;
  } else {
    idx = lines.findIndex((l) => /^##\s/.test(l));
    if (idx === -1) idx = lines.length;
  }
  if (idx === lines.length) {
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    lines.push('', ...entry);
  } else {
    lines.splice(idx, 0, ...entry);
  }
  return lines.join('\n');
}

function walkDocs() {
  const dir = path.join(ROOT, 'docs');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith('.md')) out.push(full);
    }
  };
  walk(dir);
  return out;
}

/* ------------------------------------------------------------------ */
/* planning + transactional apply                                     */
/* ------------------------------------------------------------------ */

function plan(v) {
  const p = parse(v);
  if (!p) die(1, `Invalid version "${v}". Expected MAJOR.MINOR.PATCH[-alpha|beta|rc.N]`);

  const changes = [];

  for (const t of targets) {
    const cur = readIf(t.file);
    if (cur === null) {
      if (!t.create || !parentExists(t.file)) continue;
      const next = t.render(v, p, '');
      if (next !== null) changes.push({ file: t.file, name: t.name, next, bom: false });
      continue;
    }
    const next = t.render(v, p, cur.text);
    if (next !== null && next !== cur.text) {
      changes.push({ file: t.file, name: t.name, next, bom: cur.bom });
    }
  }

  for (const full of walkDocs()) {
    const cur = readText(full);
    const next = renderFrontMatter(v, cur.text);
    if (next !== null) {
      changes.push({ file: path.relative(ROOT, full), name: 'docs-frontmatter', next, bom: cur.bom });
    }
  }

  const cl = changelogNext(v, readIf('CHANGELOG.md'));
  if (cl !== null) changes.push({ file: 'CHANGELOG.md', name: 'changelog', next: cl, bom: false });

  return { parsed: p, changes };
}

function apply(changes) {
  if (DRY) return [];
  const written = [];
  try {
    for (const c of changes) {
      const abs = path.join(ROOT, c.file);
      const existed = fs.existsSync(abs);
      const prev = existed ? fs.readFileSync(abs) : null;
      writeAtomic(abs, c.next, c.bom);
      written.push({ abs, prev, existed });
    }
    return written;
  } catch (e) {
    rollback(written);
    throw e;
  }
}

function rollback(written) {
  for (const w of [...written].reverse()) {
    try {
      if (w.existed) fs.writeFileSync(w.abs, w.prev);
      else fs.unlinkSync(w.abs);
    } catch {
      /* best effort */
    }
  }
}

function commit(next, extra) {
  const ssotBefore = fs.readFileSync(ssotPath);
  const { changes } = plan(next);

  if (DRY) {
    report(next, changes, extra);
    return;
  }

  let written = [];
  try {
    setSSOT(next);
    written = apply(changes);
  } catch (e) {
    rollback(written);
    try {
      fs.writeFileSync(ssotPath, ssotBefore);
    } catch {
      /* ignore */
    }
    if (e instanceof Exit) throw e;
    die(3, `Write failed: ${e.message}`);
  }

  const check = readSSOT();
  if (check !== next) {
    rollback(written);
    try {
      fs.writeFileSync(ssotPath, ssotBefore);
    } catch {
      /* ignore */
    }
    die(3, `SSOT verification failed: expected ${next}, found ${check}. Restored previous state.`);
  }

  report(next, changes, extra);
}

function report(v, changes, extra = {}) {
  if (AS_JSON) {
    console.log(
      JSON.stringify({ version: v, dryRun: DRY, changed: changes.map((c) => c.file), ...extra }, null, 2)
    );
    return;
  }
  console.log(`${DRY ? '[dry-run] ' : ''}version ${v}`);
  if (!changes.length) console.log('  no surface changes');
  for (const c of changes) console.log(`  ${c.file} (${c.name})`);
}

/* ------------------------------------------------------------------ */
/* commands                                                           */
/* ------------------------------------------------------------------ */

function runBump(type) {
  const cur = readSSOT();
  const p = parse(cur);
  if (!p) die(1, `Current version "${cur}" is not valid SemVer.`);
  commit(fmt(bump(p, type)), { from: cur, type });
}

function runSet(v) {
  const nextP = parse(v);
  if (!nextP) die(1, `Invalid version "${v}".`);
  const cur = readSSOT();
  const curP = parse(cur);
  if (curP && cmp(nextP, curP) < 0 && !ALLOW_DOWNGRADE) {
    die(1, `Refusing downgrade ${cur} -> ${fmt(nextP)}. Pass --allow-downgrade to override.`);
  }
  commit(fmt(nextP), { from: cur });
}

function runSync() {
  const v = readSSOT();
  if (!parse(v)) die(1, `SSOT version "${v}" is not valid SemVer.`);
  const { changes } = plan(v);
  if (DRY) return report(v, changes);
  apply(changes);
  report(v, changes);
}

function runVerify() {
  const v = readSSOT();
  const p = parse(v);
  if (!p) die(1, `SSOT version "${v}" is not valid SemVer.`);
  const { changes } = plan(v);
  const drift = changes.filter((c) => c.name !== 'changelog');
  if (AS_JSON) {
    console.log(JSON.stringify({ version: v, ok: drift.length === 0, drift: drift.map((c) => c.file) }, null, 2));
  } else if (drift.length) {
    console.error(`Version drift detected (SSOT ${v}):`);
    for (const c of drift) console.error(`  ${c.file}`);
    console.error('Run: node scripts/version.mjs sync');
  } else {
    console.log(`OK — ${v} in sync (${p.channel}, code ${versionCode(p)})`);
  }
  if (drift.length) process.exitCode = 1;
}

function runShow() {
  const v = readSSOT();
  const p = parse(v);
  if (!p) die(1, `Invalid SSOT version "${v}".`);
  const next = (t) => fmt(bump(p, t));
  const data = {
    version: v,
    channel: p.channel,
    versionCode: versionCode(p),
    next: {
      patch: next('patch'),
      minor: next('minor'),
      major: next('major'),
      ...(p.channel !== 'stable'
        ? { prerelease: next('prerelease'), stable: next('stable') }
        : { alpha: next('alpha'), beta: next('beta'), rc: next('rc') }),
    },
  };
  if (AS_JSON) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  console.log(`version: ${data.version}`);
  console.log(`channel: ${data.channel}`);
  console.log(`versionCode: ${data.versionCode}`);
  console.log('next:');
  for (const [k, val] of Object.entries(data.next)) console.log(`  ${k.padEnd(11)} ${val}`);
}

/* ------------------------------------------------------------------ */
/* main                                                               */
/* ------------------------------------------------------------------ */

try {
  switch (cmd) {
    case 'bump':
      if (!args[0]) die(2, 'Usage: bump <patch|minor|major|prerelease|alpha|beta|rc|stable>');
      runBump(args[0]);
      break;
    case 'set':
      if (!args[0]) die(2, 'Usage: set <x.y.z[-channel.n]>');
      runSet(args[0]);
      break;
    case 'sync':
      runSync();
      break;
    case 'verify':
      runVerify();
      break;
    case 'show':
      runShow();
      break;
    default:
      die(2, 'Usage: version.mjs <bump|set|sync|verify|show> [arg] [--dry-run] [--json]');
  }
} catch (e) {
  if (e instanceof Exit) {
    console.error(e.message);
    process.exit(e.code);
  }
  console.error(e?.stack || String(e));
  process.exit(3);
}
