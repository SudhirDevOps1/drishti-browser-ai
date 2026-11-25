export class ElementFinder {
  static findBySelector(selector: string): Element | null {
    if (typeof document === 'undefined') return null;
    try {
      return document.querySelector(selector);
    } catch {
      return null;
    }
  }

  static findByText(text: string, tagNames?: string[]): Element | null {
    if (typeof document === 'undefined') return null;
    const tags = tagNames || ['button', 'a', 'label', 'span', 'div', 'p', 'h1', 'h2', 'h3', 'li'];
    const lower = text.toLowerCase();
    for (const tag of tags) {
      const els = Array.from(document.querySelectorAll(tag));
      for (const el of els) {
        if (el.textContent?.toLowerCase().includes(lower)) return el;
      }
    }
    return null;
  }

  static findByAriaLabel(label: string): Element | null {
    if (typeof document === 'undefined') return null;
    const lower = label.toLowerCase();
    const els = Array.from(document.querySelectorAll('[aria-label]'));
    for (const el of els) {
      if (el.getAttribute('aria-label')?.toLowerCase().includes(lower)) return el;
    }
    return null;
  }

  static findByPlaceholder(placeholder: string): Element | null {
    if (typeof document === 'undefined') return null;
    const lower = placeholder.toLowerCase();
    const els = Array.from(document.querySelectorAll('[placeholder]'));
    for (const el of els) {
      if (el.getAttribute('placeholder')?.toLowerCase().includes(lower)) return el;
    }
    return null;
  }

  static findByRole(role: string, name?: string): Element | null {
    if (typeof document === 'undefined') return null;
    const els = Array.from(document.querySelectorAll(`[role="${role}"]`));
    if (!name) return els[0] || null;
    const lower = name.toLowerCase();
    for (const el of els) {
      const aLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
      const text = (el.textContent || '').toLowerCase();
      if (aLabel.includes(lower) || text.includes(lower)) return el;
    }
    return null;
  }

  static smartFind(query: string): Element | null {
    return (
      ElementFinder.findBySelector(query) ||
      ElementFinder.findByAriaLabel(query) ||
      ElementFinder.findByText(query) ||
      ElementFinder.findByPlaceholder(query) ||
      null
    );
  }
}
