export interface ExtractedLink {
  text: string;
  href: string;
  type: 'internal' | 'external' | 'anchor' | 'mailto' | 'tel';
  title?: string;
  ariaLabel?: string;
}

export function extractLinks(filterPattern?: string): ExtractedLink[] {
  if (typeof document === 'undefined') return [];
  const links = Array.from(document.querySelectorAll('a[href]'));
  const baseHost = window.location.hostname;

  return links
    .map((link) => {
      const href = (link as HTMLAnchorElement).href;
      const text = (link.textContent || '').trim().slice(0, 200);

      let type: ExtractedLink['type'] = 'external';
      if (href.startsWith('#')) type = 'anchor';
      else if (href.startsWith('mailto:')) type = 'mailto';
      else if (href.startsWith('tel:')) type = 'tel';
      else {
        try {
          if (new URL(href, window.location.href).hostname === baseHost) {
            type = 'internal';
          }
        } catch {
          // keep external
        }
      }

      return {
        text,
        href,
        type,
        title: link.getAttribute('title') || undefined,
        ariaLabel: link.getAttribute('aria-label') || undefined,
      };
    })
    .filter(
      (l) =>
        !filterPattern ||
        l.text.toLowerCase().includes(filterPattern.toLowerCase()) ||
        l.href.toLowerCase().includes(filterPattern.toLowerCase())
    )
    .slice(0, 500);
}
