export interface A11yNode {
  role: string;
  name: string;
  value?: string;
  description?: string;
  level?: number;
  children: A11yNode[];
}

export function extractAccessibilityTree(maxDepth = 4): A11yNode {
  if (typeof document === 'undefined' || !document.body) {
    return { role: 'root', name: '', children: [] };
  }
  return extractNode(document.body, 0, maxDepth);
}

function extractNode(el: Element, depth: number, maxDepth: number): A11yNode {
  const role = el.getAttribute('role') || inferRole(el);
  const name = getAccessibleName(el);
  const value = getAccessibleValue(el);

  const node: A11yNode = {
    role,
    name,
    value,
    description: el.getAttribute('aria-description') || undefined,
    children: [],
  };

  if (el.tagName.match(/^H[1-6]$/)) {
    node.level = parseInt(el.tagName[1], 10);
  }

  if (depth < maxDepth) {
    const children = Array.from(el.children).slice(0, 15);
    for (const child of children) {
      const childRole = child.getAttribute('role') || inferRole(child);
      if (childRole !== 'none' && childRole !== 'presentation') {
        node.children.push(extractNode(child, depth + 1, maxDepth));
      }
    }
  }

  return node;
}

function inferRole(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const roleMap: Record<string, string> = {
    a: 'link',
    button: 'button',
    input: 'textbox',
    select: 'listbox',
    textarea: 'textbox',
    nav: 'navigation',
    main: 'main',
    aside: 'complementary',
    header: 'banner',
    footer: 'contentinfo',
    form: 'form',
    table: 'table',
    h1: 'heading',
    h2: 'heading',
    h3: 'heading',
    h4: 'heading',
    h5: 'heading',
    h6: 'heading',
    ul: 'list',
    ol: 'list',
    li: 'listitem',
    img: 'img',
    article: 'article',
    section: 'region',
    dialog: 'dialog',
  };
  return roleMap[tag] || 'generic';
}

function getAccessibleName(el: Element): string {
  return (
    el.getAttribute('aria-label') ||
    el.getAttribute('aria-labelledby') ||
    (el as HTMLInputElement).placeholder ||
    el.getAttribute('title') ||
    el.getAttribute('alt') ||
    (el.textContent || '').trim().slice(0, 80)
  );
}

function getAccessibleValue(el: Element): string | undefined {
  if (el instanceof HTMLInputElement && el.type !== 'password') return el.value;
  if (el instanceof HTMLSelectElement) return el.options[el.selectedIndex]?.text;
  if (el instanceof HTMLTextAreaElement) return el.value;
  return el.getAttribute('aria-valuenow') || undefined;
}
