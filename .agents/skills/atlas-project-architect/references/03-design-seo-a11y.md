# 03 — Design, SEO & Accessibility

## Anti-generic rules

- Style follows product identity, not fashion. A finance dashboard and a game HUD should not look the same.
- No default purple-gradient glassmorphism.
- Every screen has hierarchy: one primary action, clear reading order, real spacing rhythm.
- Real content in mocks, not lorem ipsum, when the layout depends on text length.

## Tokens

Define once, in code:

```
color: bg, surface, surface-2, border, text, muted, primary, primary-hover,
       danger, warning, success, focus
space: 4, 8, 12, 16, 24, 32, 48, 64
radius: sm, md, lg, full
type:  xs, sm, base, lg, xl, 2xl  (+ line-height + weight per role)
shadow: sm, md, lg
motion: fast 120ms, base 200ms, slow 320ms (+ easing)
```

Dark and light from the same tokens. No flash of wrong theme on load.

## Mandatory states

Every interactive surface needs: **loading** (skeleton, not just a spinner), **empty**, **error**, **success**, **disabled**, **focus-visible**, **hover/press**, **offline** (if relevant), **permission denied**, **long content**, **first use**.

A screen without an empty state is unfinished.

## Accessibility baseline

- Semantic HTML first; ARIA only to fill gaps.
- Every interactive element reachable and operable by keyboard.
- Visible focus ring (never `outline: none` without a replacement).
- Labels bound to inputs; errors announced, not just coloured.
- Contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text and UI edges.
- Dialogs: trap focus, close on Escape, restore focus.
- `prefers-reduced-motion` respected.
- Meaning never conveyed by colour alone.
- 200% zoom without horizontal scroll or clipping.

## Responsive

Mobile-first. Check 360 / 768 / 1024 / 1440. No horizontal overflow. Touch targets ≥ 44px. Test with a real device or device emulation, not just a resized window.

## Icons

One family (Lucide / Tabler / Phosphor / Heroicons / Material Symbols). Consistent stroke and size. Icon-only buttons get `aria-label`. No emoji as UI icons. Check the licence.

## Motion

Purposeful only: orient, confirm, or explain. Prefer `transform`/`opacity`. Never block input. No animation hiding a broken feature.

## Metadata

Per page: unique title, meta description, canonical, OG (`og:title/description/type/url/image/width/height`), Twitter card, robots directive. Site: `sitemap.xml`, `robots.txt`, favicon (`svg` + `ico`), apple-touch-icon, web manifest, theme-color.

Metadata must be in the **initial HTML** — client-only JS metadata is invisible to many crawlers. Verify with a real validator.

## SEO

Semantic HTML · correct heading order (one `h1`) · meaningful URLs · internal links · alt text · sized/optimised images (WebP/AVIF) · Core Web Vitals budget (LCP < 2.5s, CLS < 0.1, INP < 200ms) · mobile usability · real 404 · no keyword stuffing · no fake reviews/ratings/schema.

## AEO (AI search visibility)

Clear product description · structured docs · descriptive headings · FAQ · accurate schema.org (`SoftwareApplication`, `WebSite`, `Organization` only if true) · crawlable public content. Never promise rankings.

## Private surfaces

Dashboards, admin, user data: `noindex`, no sitemap entries, no public caching. Auth pages too.

## Deliverables

`docs/DESIGN-SYSTEM.md` · `docs/COMPONENTS.md` · `docs/ICON-USAGE.md` · `docs/SEO.md` · `docs/BRANDING.md`
