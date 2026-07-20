# CasaFlux brand assets

Primary color: `#0f766e`

## Marks

| File | Proposal | Role |
|------|----------|------|
| `mark-compact.svg` | B — Tile teal | **Official compact mark** (favicon, app icon, icon-only UI) |
| `mark-institutional.svg` | A — Monoline | **Institutional mark** (login, sidebar, onboarding, headers) |
| `mark-experimental.svg` | C — Frame | Exploration only — **not a product default** |

Runtime rules live in `lib/brand.ts`. UI uses `components/brand/brand-mark.tsx`.

## App icons (compact / B)

| File | Use |
|------|-----|
| `app/favicon.ico` | Browser tab |
| `app/icon.svg` | Next.js app icon (same artwork as `mark-compact.svg`) |
| `app/apple-icon.png` | Apple touch icon |
| `icon-compact-32.png` / `180` / `512` | Raster exports of compact mark |

Do not replace favicon/app icons with mark A or C.
