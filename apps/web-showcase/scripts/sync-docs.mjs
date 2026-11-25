import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appDir, '../..');
const outDir = path.join(appDir, 'src', 'generated');
fs.mkdirSync(outDir, { recursive: true });

const rootPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

const docFiles = [
  { id: 'windows-install', title: 'Windows Install Guide', category: 'Setup', file: 'docs/windows-install.md' },
  { id: 'architecture', title: 'System Architecture', category: 'Core', file: 'docs/architecture.md' },
  { id: 'mcp-tools', title: '35 MCP Tools Reference', category: 'API', file: 'docs/mcp-tools-reference.md' },
  { id: 'agent-integrations', title: 'Agent Integrations', category: 'Clients', file: 'docs/agent-integrations.md' },
  { id: 'privacy-security', title: 'Privacy & Security', category: 'Security', file: 'docs/privacy-and-security.md' },
  { id: 'security-policy', title: 'Security Policy', category: 'Security', file: 'SECURITY.md' },
  { id: 'developer-setup', title: 'Developer Setup', category: 'Dev', file: 'docs/developer-setup.md' },
  { id: 'troubleshooting', title: 'Troubleshooting', category: 'Help', file: 'docs/troubleshooting.md' },
  { id: 'limitations', title: 'Known Limitations', category: 'Scope', file: 'docs/limitations.md' },
  { id: 'project-status', title: 'Project Status', category: 'Status', file: 'docs/PROJECT-STATUS.md' },
];

const docs = docFiles
  .map((entry) => {
    const abs = path.join(repoRoot, entry.file);
    if (!fs.existsSync(abs)) return null;
    return {
      ...entry,
      content: fs.readFileSync(abs, 'utf8'),
    };
  })
  .filter(Boolean);

// Read CHANGELOG
const changelogPath = path.join(repoRoot, 'CHANGELOG.md');
const changelog = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : '';

const payload = {
  version: rootPkg.version || '0.1.0',
  repoUrl: 'https://github.com/SudhirDevOps1/drishti-browser-ai',
  docs,
  changelog,
  generatedAt: new Date().toISOString(),
};

fs.writeFileSync(path.join(outDir, 'site-data.json'), JSON.stringify(payload, null, 2));
console.log(`[sync-docs] Synced v${payload.version} and ${docs.length} docs into src/generated/site-data.json`);
