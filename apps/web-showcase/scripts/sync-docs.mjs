import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appDir, '../..');
const outDir = path.join(appDir, 'src', 'generated');
const publicIconsDir = path.join(appDir, 'public', 'icons');
const extIconsDir = path.join(repoRoot, 'apps', 'chrome-extension', 'public', 'icons');

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(publicIconsDir, { recursive: true });

// Sync official extension icons into web-showcase/public/icons
if (fs.existsSync(extIconsDir)) {
  for (const file of fs.readdirSync(extIconsDir)) {
    fs.copyFileSync(path.join(extIconsDir, file), path.join(publicIconsDir, file));
  }
}

const rootPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

const docFiles = [
  { id: 'windows-install', title: 'Windows Install Guide', category: 'Setup', file: 'docs/windows-install.md' },
  { id: 'architecture', title: 'System Architecture', category: 'Core', file: 'docs/architecture.md' },
  { id: 'mcp-tools', title: '37 MCP Tools Reference', category: 'API', file: 'docs/mcp-tools-reference.md' },
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

// Parse MCP tools from docs/mcp-tools-reference.md
function parseMcpTools(markdown) {
  const tools = [];
  let currentCategory = 'General';
  let currentTool = null;

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim();
    const catMatch = line.match(/^##\s+\d+\.\s+(.+)$/);
    if (catMatch) {
      currentCategory = catMatch[1].replace(/\s*Tools$/, '').trim();
      continue;
    }
    const toolMatch = line.match(/^###\s+`([^`]+)`/);
    if (toolMatch) {
      if (currentTool) tools.push(currentTool);
      currentTool = {
        name: toolMatch[1],
        category: currentCategory,
        description: '',
      };
      continue;
    }
    const descMatch = line.match(/^-\s+\*\*Description:\*\*\s*(.+)$/);
    if (descMatch && currentTool && !currentTool.description) {
      currentTool.description = descMatch[1].trim();
    }
  }
  if (currentTool) tools.push(currentTool);
  return tools;
}

const mcpDoc = docs.find((d) => d.id === 'mcp-tools');
const mcpTools = mcpDoc ? parseMcpTools(mcpDoc.content) : [];

// Read CHANGELOG
const changelogPath = path.join(repoRoot, 'CHANGELOG.md');
const changelog = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : '';

const payload = {
  version: rootPkg.version || '0.1.1',
  repoUrl: 'https://github.com/SudhirDevOps1/drishti-browser-ai',
  docs,
  mcpTools,
  changelog,
  generatedAt: new Date().toISOString(),
};

fs.writeFileSync(path.join(outDir, 'site-data.json'), JSON.stringify(payload, null, 2));
console.log(`[sync-docs] Synced v${payload.version}, ${docs.length} docs, and ${mcpTools.length} MCP tools into src/generated/site-data.json`);
