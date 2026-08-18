# Home Page Override

> This page override takes precedence over `../MASTER.md`. It reflects the user's supplied
> Liquid Glass reference and the refined UI UX Pro Max searches for premium fashion e-commerce.

## Pattern

- Hero-Centric Design: the campaign image occupies 60–80% of the first viewport.
- Use one primary action: natural-language product search.
- Keep copy minimal and place the search control in the lower hero region.
- Preserve the same information hierarchy on mobile.

## Style

- Primary style: Liquid Glass over a full-bleed editorial fashion photograph.
- Supporting style: Exaggerated Minimalism and fashion editorial typography.
- Glass surfaces use 15–20px blur, 15–30% translucent white, a 1px light border, and one
  consistent depth shadow.
- Do not add unrelated dashboard cards, purple AI gradients, or decorative glass panels.

## Color Tokens

| Role           | Value                       |
| -------------- | --------------------------- |
| Primary cyan   | `#0284C7`                   |
| Secondary cyan | `#06B6D4`                   |
| Accent orange  | `#EA580C`                   |
| Foreground ink | `#0F172A`                   |
| On dark        | `#FFFFFF`                   |
| Glass surface  | `rgba(255, 255, 255, 0.20)` |
| Glass border   | `rgba(255, 255, 255, 0.62)` |

## Typography

- Display: Archivo 800–900 for a bold fashion-campaign voice.
- Korean fallback: system Korean sans-serif; do not force Latin-only display fonts on Korean copy.
- Body: Inter/system sans-serif, 16px minimum on mobile.
- Metadata: IBM Plex Mono, never below 10px and never used for long-form copy.

## Interaction and Accessibility

- Minimum touch target: 44×44px with at least 8px separation.
- Search input always has a programmatic and visible label.
- Display a pending state after submission and disable repeated submission.
- Maintain 4.5:1 body-text contrast and visible 2px focus rings.
- Use SVG icons with a consistent 1.8–2px stroke; no emoji icons.
- Motion uses opacity/transform only, 150–300ms, and respects `prefers-reduced-motion`.
- Validate at 375px, 768px, 1024px, and 1440px without main-page horizontal overflow.

## Next.js Rules

- Keep the page as a Server Component and isolate router/state logic in a small Client Component.
- Use `next/image` for the hero and provide `sizes`, intrinsic layout reservation, and alt text.
- Use `next/link` for internal route navigation.
