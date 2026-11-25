export interface InteractiveElement {
  index: number;
  selector: string;
  xpathSimple: string;
  tagName: string;
  type?: string;
  text?: string;
  value?: string;
  placeholder?: string;
  href?: string;
  role?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  id?: string;
  name?: string;
  classes: string[];
  bounds: { x: number; y: number; width: number; height: number };
  visible: boolean;
  disabled: boolean;
  readonly: boolean;
  required: boolean;
  checked?: boolean;
  multiple?: boolean;
  options?: string[];
}

export interface ExtractedDOM {
  url: string;
  title: string;
  timestamp: number;
  elements: InteractiveElement[];
  headings: { level: string; text: string }[];
  metaDescription?: string;
  language: string;
  bodyTextSample: string;
  scrollPosition: { x: number; y: number };
  viewportSize: { width: number; height: number };
}

export function extractInteractiveElements(): InteractiveElement[] {
  if (typeof document === 'undefined') return [];

  const INTERACTIVE_SELECTOR = [
    'a[href]',
    'button',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    '[role="button"]',
    '[role="link"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="option"]',
    '[role="switch"]',
    '[tabindex]:not([tabindex="-1"])',
    'label[for]',
  ].join(', ');

  const elements = Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR));
  const result: InteractiveElement[] = [];

  elements.forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const isVisible =
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      rect.top < window.innerHeight + 300 &&
      rect.bottom > -300;

    let selector = el.tagName.toLowerCase();
    if ((el as HTMLElement).id) {
      selector = `#${CSS.escape((el as HTMLElement).id)}`;
    } else if (el.className && typeof el.className === 'string') {
      const cls = el.className
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .filter(Boolean)
        .map((c) => `.${CSS.escape(c)}`)
        .join('');
      if (cls) selector = el.tagName.toLowerCase() + cls;
    }

    const item: InteractiveElement = {
      index: i,
      selector,
      xpathSimple: getSimpleXPath(el),
      tagName: el.tagName.toLowerCase(),
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 250),
      role: el.getAttribute('role') || undefined,
      ariaLabel: el.getAttribute('aria-label') || undefined,
      ariaDescription:
        el.getAttribute('aria-description') ||
        el.getAttribute('aria-describedby') ||
        undefined,
      id: (el as HTMLElement).id || undefined,
      name: (el as HTMLInputElement).name || undefined,
      classes: el.className ? String(el.className).split(/\s+/).filter(Boolean) : [],
      bounds: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      visible: isVisible,
      disabled: !!(el as HTMLInputElement).disabled,
      readonly: !!(el as HTMLInputElement).readOnly,
      required: !!(el as HTMLInputElement).required,
    };

    if (el instanceof HTMLInputElement) {
      item.type = el.type;
      item.placeholder = el.placeholder || undefined;
      if (el.type !== 'password') item.value = el.value;
      if (el.type === 'checkbox' || el.type === 'radio') item.checked = el.checked;
    }
    if (el instanceof HTMLSelectElement) {
      item.value = el.value;
      item.multiple = el.multiple;
      item.options = Array.from(el.options)
        .map((o) => o.text)
        .slice(0, 20);
    }
    if (el instanceof HTMLTextAreaElement) {
      item.value = el.value;
      item.placeholder = el.placeholder || undefined;
    }
    if (el instanceof HTMLAnchorElement) {
      item.href = el.href;
    }

    result.push(item);
  });

  return result.slice(0, 300);
}

function getSimpleXPath(el: Element): string {
  if (el.id) return `//*[@id="${el.id}"]`;
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur.nodeType === Node.ELEMENT_NODE) {
    let idx = 1;
    let sib = cur.previousElementSibling;
    while (sib) {
      if (sib.tagName === cur.tagName) idx++;
      sib = sib.previousElementSibling;
    }
    parts.unshift(`${cur.tagName.toLowerCase()}[${idx}]`);
    cur = cur.parentElement;
    if (parts.length > 5) break;
  }
  return '/' + parts.join('/');
}
