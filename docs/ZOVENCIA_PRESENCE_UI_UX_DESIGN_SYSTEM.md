# Zovencia Presence — UI/UX Design System Documentation

> **What this document is.** A reverse-engineered specification of the UI that exists in this
> repository today, written so a second developer can build the **Projects** module without the new
> screens drifting away from the rest of the application.
>
> **What it is not.** A design proposal. Nothing here is invented. Every colour, radius, shadow,
> duration and class string below was read out of the codebase. Where a value could not be found,
> it is marked **Not explicitly defined** rather than guessed, and anything concluded from a
> repeated pattern rather than a declaration is labelled **Inferred**.
>
> Confidence labels used throughout:
> - **[Confirmed]** — read directly from a source file, quoted or cited.
> - **[Inferred]** — a pattern observed repeatedly across files but never declared in one place.
> - **[Not defined]** — searched for and absent.

---

## 1. Executive Summary

| Aspect | What Zovencia Presence actually does |
| --- | --- |
| **Overall visual style** | "Liquid Glass" — translucent panels floating over a fixed, very low-opacity green aurora wash. Apple-adjacent: large corner radii, tight negative letter-spacing on headings, specular top-edge highlights, spring easing on entry. |
| **Primary colour** | `#0AEA0A` brand green, stored as `oklch(0.812 0.275 142.5)`. Never darkened as a *fill*. |
| **Secondary colours** | `#023506` deep green (`--brand-deep`), used as foreground-on-green, containment rings, chart hairlines and email header bands. |
| **Background** | Light `#F5F9F5` · Dark `#070F09`. Both are near-neutrals pulled toward hue 150 so white reads as *Zovencia* white. |
| **Typography** | System-first stack: SF Pro on Apple, **Geist** (`next/font/google`) everywhere else. Two weights in practice — 500 `font-medium` and 600 `font-semibold`. Headings carry negative tracking. |
| **Glass style** | Four variants (`glass`, `glass-strong`, `glass-subtle`, `glass-inset`) plus `glass-sidebar`. Depth is `box-shadow` only — one inset highlight, one inset hairline, stacked green-cast drop shadows. Base blur `20px` + `saturate(180%)`. |
| **Border style** | Almost no real `border` properties. Borders are drawn as `inset 0 0 0 1px` box-shadows so they survive `position: sticky`. `--border` is used for table dividers and separators. |
| **Radius style** | One anchor `--radius: 1.5rem` (24px); the whole scale derives from it. sm 10 · md 14 · lg 18 · xl 24 · 2xl 30 · 3xl 36. |
| **Shadow style** | Green-cast, multi-layer, low-opacity. Buttons and progress bars add a *coloured glow* rather than a darker shadow. |
| **Animation style** | CSS only. Three durations (150/220/300ms) and three curves (`standard`, `spring`, `exit`). No Framer Motion, no GSAP. |
| **Theme support** | Light / Dark / System via `next-themes`, `attribute="class"`. Dark is a **re-tuned** palette, not an inversion. The sidebar ignores the theme entirely. |
| **Responsive strategy** | Mobile-first Tailwind defaults. Effectively a two-breakpoint system: `sm` (640px) and `lg` (1024px), with `xl` for 4-up stat grids. |

---

## 2. Design Philosophy

Read out of `src/app/globals.css`, which is unusually well-commented and states its own intent.

1. **Translucency and light carry the design, not hue.** Surfaces are white or near-black glass. Colour appears in three places only: the brand green, the three status colours, and the aurora behind everything.

2. **The FILL vs INK rule is the organising principle.** `#0AEA0A` is 12.78:1 on black but **1.64:1 on white** (verified by conversion; the CSS comment claims 1.64 and 12.8). So every semantic colour ships as a pair — a *fill* (`--primary`) and an *ink* (`--primary-ink`) — and using the wrong half is the single most likely way for new work to look wrong or fail accessibility.

3. **Depth is light, not pigment.** The primary button is flat `#0AEA0A`; its "gradient" is a white inset sheen falling from the top edge. Nothing darkens the brand colour to make it readable — the *surface* changes instead.

4. **Density is moderate, not compact.** 4px-grid spacing with `gap-2`/`gap-3`/`gap-4` dominating, 24px card padding, 44px table rows. This is an enterprise tool that has chosen legibility over information density.

5. **Motion is short and physical.** Nothing runs longer than 500ms. Entries overshoot (`ease-spring`), exits do not (`ease-exit`), because "a dismissal that bounces reads as indecisive."

6. **Accessibility and environment are first-class.** `prefers-reduced-transparency`, `prefers-reduced-motion` and `@media print` all have real, considered implementations — not afterthoughts. New work is expected to inherit them by using the utilities rather than hand-rolling glass.

7. **Components own their tokens; screens own their layout.** Colour literals do not appear in components — verified: the only hex strings anywhere in `src/**/*.tsx` are the two `viewport.themeColor` values in `src/app/layout.tsx` and two in code comments.

---

## 3. Technology & UI Stack

### 3.1 Confirmed in use

| Technology | Version | Where | Visual contribution | Projects module should reuse? |
| --- | --- | --- | --- | --- |
| **Next.js (App Router)** | 15.5.22 | `src/app/**` | Route groups `(admin)`, `(employee)`, `(auth)`, `(onboarding)` each own a layout | **Yes** — add `src/app/(admin)/admin/projects/` |
| **React** | 19.1.0 | everywhere | Server Components by default; `"use client"` only where state/hooks are needed | **Yes** |
| **Tailwind CSS** | v4 | `src/app/globals.css` | **CSS-first config — there is no `tailwind.config.ts`** (verified absent). Tokens live in `@theme` / `@theme inline`; custom utilities in `@utility` blocks | **Yes** |
| **shadcn/ui** | style `new-york` | `src/components/ui/**` (26 files) | Component skeletons, heavily restyled | **Yes — reuse, do not re-add via CLI** |
| **Radix UI** | 13 packages | under `src/components/ui/` | Behaviour + `data-[state=*]` hooks that all the animation keys off | **Yes** |
| **lucide-react** | ^1.28.0 | 69 files | The only icon set | **Yes** |
| **next-themes** | ^0.4.6 | `src/components/providers/theme-provider.tsx` | Adds `.dark` to `<html>` | **Yes** |
| **sonner** | ^2.0.7 | 30 files | All toasts | **Yes** |
| **recharts** | ^3.10.1 | `src/components/charts/*` (2 files) | The only charting library | **Yes** |
| **class-variance-authority** | ^0.7.1 | **only** `button.tsx`, `badge.tsx` | Variant APIs | Only if a genuinely multi-variant primitive is needed |
| **clsx + tailwind-merge** | — | `src/lib/utils.ts` → `cn()` | Class merging | **Yes — always use `cn()`** |
| **tw-animate-css** | ^1.4.0 | imported in `globals.css` | Supplies `animate-in`/`animate-out`, `fade-in-0`, `zoom-in-95`, `slide-in-from-*` | **Yes** |
| **react-hook-form + @hookform/resolvers + zod** | — | every form | Form state and validation | **Yes** |

### 3.2 Installed but NOT used — do not reach for these

Verified by searching all of `src/`:

| Package | Occurrences in `src/` | Note |
| --- | --- | --- |
| **zustand** ^5.0.14 | **0** | No global client store exists. State is local `useState` plus the `useApiResource` fetch hook. **Do not introduce a store for Projects** without a deliberate decision. |
| **date-fns** ^4.4.0 | **0** | All date work goes through the hand-rolled `src/lib/date.ts` (UTC-midnight normalisation + `Intl`). **Use `src/lib/date.ts`.** |

### 3.3 Absent entirely

**[Not defined]** — searched `package.json` and all source:

- No **Framer Motion**, no **GSAP**, no **react-spring**. All motion is CSS.
- No **CSS Modules**, no styled-components, no emotion. Zero `.module.css` files.
- No **tailwind.config.ts / .js**. Tailwind v4 is configured entirely in CSS.
- No icon library other than Lucide. No custom SVG icon components.
- No `@tanstack/react-table` — tables are hand-composed from `src/components/ui/table.tsx`.
- No `cmdk` — the global search is hand-built (`global-search.tsx`).

---

## 4. Global Color System

**Source of truth: `src/app/globals.css`.** All colours are authored in **OKLCH**. The hex/RGB
columns below were computed from those OKLCH values using the standard Ottosson conversion; the
computation was validated against the contrast ratios the file itself claims in comments (it says
brand-on-white 1.64 and brand-on-black 12.8 → computed 1.64 and 12.78; it says `--primary-ink` is
5.14:1 on white → computed 5.13; it says brand is 10.8:1 on a dark card → computed 10.74).

### 4.1 Brand constants — identical in both themes

| Token | OKLCH (authored) | HEX | RGB | Usage |
| --- | --- | --- | --- | --- |
| `--brand` | `oklch(0.812 0.275 142.5)` | **#0AEA0A** | 10, 234, 10 | Every fill, active pill, badge, progress, toggle, chart-1, focus ring |
| `--brand-deep` | `oklch(0.286 0.091 143.9)` | **#023506** | 2, 53, 6 | Text on green fills, `--ring-edge`, chart bar hairline, email band |

> **Precision note [Confirmed].** The canonical brand hex is `#0AEA0A` — that literal appears in
> `src/lib/brand.ts` (`BRAND_COLORS.green`) and is what exported PDFs/XLSX/emails use. The CSS
> token is a 3-decimal rounding of it (`#0AEA0A` → `oklch(0.8124 0.2745 142.52)` → written as
> `0.812 0.275 142.5`), which rasterises to ≈`#07EA06` — a drift of 3/255 in red. This is
> imperceptible and **not a defect**; quote `#0AEA0A` in any document or email, and use
> `var(--brand)` / `bg-primary` on screen. Never write either literal into a component.

### 4.2 Light theme — complete token table

| Token | OKLCH | HEX | RGB | Usage / example component |
| --- | --- | --- | --- | --- |
| `--background` | `0.978 0.007 150` | **#F5F9F5** | 245,249,245 | App background (`body`), matches `viewport.themeColor` light |
| `--foreground` | `0.205 0.024 152` | **#0F1A12** | 15,26,18 | Primary text. 16.78:1 on background |
| `--card` | `1 0 0` | **#FFFFFF** | 255,255,255 | Opaque card fallback; base of `glass-inset` |
| `--card-foreground` | `0.205 0.024 152` | **#0F1A12** | 15,26,18 | Text inside cards |
| `--popover` | `1 0 0` | **#FFFFFF** | 255,255,255 | Popover fallback |
| `--popover-foreground` | `0.205 0.024 152` | **#0F1A12** | 15,26,18 | Menu/select/tooltip text |
| `--primary` | `var(--brand)` | **#0AEA0A** | 10,234,10 | `Button` default, `Badge` default, `Switch` checked, `Progress` |
| `--primary-foreground` | `var(--brand-deep)` | **#023506** | 2,53,6 | Label on a green fill |
| `--primary-ink` | `0.52 0.175 142.5` | **#058004** | 5,128,4 | **Green text / bare green icons only.** 5.13:1 on white |
| `--secondary` | `0.955 0.012 150` | **#EBF3EC** | 235,243,236 | `Button variant="secondary"`, `Badge variant="secondary"` |
| `--secondary-foreground` | `0.3 0.03 150` | **#233226** | 35,50,38 | Text on secondary |
| `--muted` | `0.958 0.01 150` | **#EDF3EE** | 237,243,238 | `Skeleton` base (`bg-muted/70`), toggle tracks |
| `--muted-foreground` | `0.505 0.02 152` | **#5D685F** | 93,104,95 | Descriptions, table headers, hints. 5.82:1 on white |
| `--accent` | `0.955 0.03 150` | **#E3F6E6** | 227,246,230 | **Every hover in the app** — table rows, menu items, ghost buttons |
| `--accent-foreground` | `0.3 0.05 150` | **#1A3520** | 26,53,32 | Text on a hovered surface |
| `--destructive` | `0.585 0.19 25` | **#D53C3D** | 213,60,61 | Destructive button fill, badge wash |
| `--destructive-foreground` | `0.99 0 0` | **#FCFCFC** | 252,252,252 | Text on destructive fill |
| `--destructive-ink` | `0.505 0.195 26` | **#BB151F** | 187,21,31 | Red text — form errors, destructive menu items |
| `--success` | `var(--brand)` | **#0AEA0A** | 10,234,10 | Success *is* the brand green |
| `--success-foreground` | `var(--brand-deep)` | **#023506** | 2,53,6 | Text on success fill |
| `--success-ink` | `var(--primary-ink)` | **#058004** | 5,128,4 | Success badge text |
| `--warning` | `0.76 0.15 70` | **#ED9E2F** | 237,158,47 | Warning badge wash, chart "pending" series |
| `--warning-foreground` | `0.24 0.04 72` | **#2B1C08** | 43,28,8 | Text on warning fill |
| `--warning-ink` | `0.52 0.112 62` | **#965813** | 150,88,19 | Amber text |
| `--border` | `0.878 0.016 150` | **#D0DAD1** | 208,218,209 | Table cell dividers, `Separator`, sidebar footer rule |
| `--input` | `0.895 0.016 150` | **#D5E0D7** | 213,224,215 | Unchecked `Switch` track |
| `--ring` | `var(--brand)` | **#0AEA0A** | 10,234,10 | Focus ring — exact brand green, never darkened |
| `--ring-edge` | `color-mix(in oklab, var(--brand-deep) 42%, transparent)` | ≈ #023506 @42% | — | Deep-green containment line *outside* the ring so the neon reads on white |

### 4.3 Dark theme — complete token table

Dark is **not an inversion**. Backgrounds are re-tuned dark greens; `-ink` tokens collapse back to
the pure brand colour because `#0AEA0A` already clears AA on a dark panel.

| Token | OKLCH | HEX | RGB | Note vs light |
| --- | --- | --- | --- | --- |
| `--background` | `0.158 0.018 152` | **#070F09** | 7,15,9 | Matches `viewport.themeColor` dark |
| `--foreground` | `0.962 0.008 150` | **#EFF4F0** | 239,244,240 | |
| `--card` | `0.208 0.02 152` | **#111B13** | 17,27,19 | Cards are *lighter* than the background |
| `--popover` | `0.218 0.022 152` | **#121D15** | 18,29,21 | Slightly lighter than card |
| `--primary` | `var(--brand)` | **#0AEA0A** | 10,234,10 | **Deliberately not lightened** |
| `--primary-ink` | `var(--brand)` | **#0AEA0A** | 10,234,10 | **Collapses to brand** — 10.74:1 on card |
| `--secondary` / `--muted` | `0.265 0.022 152` | **#1D2820** | 29,40,32 | |
| `--muted-foreground` | `0.72 0.018 150` | **#9DA89F** | 157,168,159 | |
| `--accent` | `0.305 0.038 150` | **#213525** | 33,53,37 | Hover wash |
| `--accent-foreground` | `0.962 0.008 150` | **#EFF4F0** | 239,244,240 | |
| `--destructive` | `0.66 0.17 25` | **#E8605B** | 232,96,91 | Lifted for dark ground |
| `--destructive-ink` | `0.7 0.17 25` | **#F66D67** | 246,109,103 | |
| `--warning` | `0.8 0.14 72` | **#F5AE4B** | 245,174,75 | |
| `--warning-ink` | `0.82 0.135 74` | **#F8B656** | 248,182,86 | |
| `--border` | `oklch(1 0 0 / 11%)` | white @11% | — | **Alpha, not a solid colour** |
| `--input` | `oklch(1 0 0 / 14%)` | white @14% | — | Alpha |
| `--ring-edge` | `brand-deep 60%` | — | — | Stronger than light's 42% |

### 4.4 The sidebar palette — theme-independent

`--sidebar*` tokens are declared **once, in `:root`**, and only `--sidebar` itself is overridden in
`.dark` (opacity 90% → 72%). The panel is the same dark green slab in both themes.

| Token | Value | HEX (opaque base) | Usage |
| --- | --- | --- | --- |
| `--sidebar` | `oklch(0.235 0.05 150 / 90%)` light · `/ 72%` dark | **#092411** @ 90/72% | Sidebar fill |
| `--sidebar-foreground` | `oklch(0.968 0.01 150)` | **#F0F6F1** | Sidebar text |
| `--sidebar-muted-foreground` | `oklch(0.775 0.022 150)` | **#ACBAAF** | Inactive nav labels, group headings |
| `--sidebar-border` | `oklch(1 0 0 / 12%)` | white @12% | Footer rule |
| `--sidebar-accent` | `oklch(1 0 0 / 8%)` | white @8% | Nav hover |

Reduced-transparency fallback flattens it to opaque `oklch(0.235 0.05 150)` = **#092411**.

### 4.5 Chart ramp

A **single-hue luminance ramp**, deliberately monochrome so series separate by lightness.

| Token | Light OKLCH | Light HEX | Dark OKLCH | Dark HEX |
| --- | --- | --- | --- | --- |
| `--chart-1` | `var(--brand)` | **#0AEA0A** | `var(--brand)` | **#0AEA0A** |
| `--chart-2` | `0.68 0.2 145` | **#26B63D** | `0.7 0.21 146` | **#11BE41** |
| `--chart-3` | `0.55 0.16 147` | **#0B8932** | `0.58 0.152 148` | **#249242** |
| `--chart-4` | `0.42 0.12 148` | **#035E23** | `0.46 0.112 150` | **#1B6934** |
| `--chart-5` | `0.3 0.09 144` | **#06390A** | `0.36 0.1 145` | **#104A17** |

### 4.6 Status colour mapping — as actually used

| Meaning | Badge variant | Fill | Ink | Icon (Lucide) | Defined in |
| --- | --- | --- | --- | --- | --- |
| Approved / Present / Resolved | `success` | `bg-success/12` | `text-success-ink` | `CheckCircle2` | `leave-status-badge.tsx`, `attendance-status-badge.tsx`, `complaint-status-badge.tsx` |
| Pending / Under review / On leave (chart) | `warning` | `bg-warning/15` | `text-warning-ink` | `Clock` | same |
| Rejected / Absent | `destructive` | `bg-destructive/12` | `text-destructive-ink` | `XCircle` | same |
| Neutral / informational (`ON_LEAVE`, `CLOSED`, `NON_WORKING`, `NO_RECORD`, `UPCOMING`) | `secondary` | `bg-secondary/80` | `text-secondary-foreground` | `Palmtree`, `CalendarOff`, `Coffee`, `CircleDashed`, `Clock` | `attendance-status-badge.tsx` |
| "Nobody has looked yet" (`PENDING` complaint) | `outline` | transparent | `text-foreground` | none | `complaint-status-badge.tsx` |
| Emphatic / branded | `default` | `bg-primary` | `text-primary-foreground` | — | `badge.tsx` |

**Two documented judgements you should copy:**
- `NO_RECORD` is `secondary`, **not** `destructive` — "colouring it like a missed day would be the accusation the status exists to withhold."
- Complaint `PENDING` is `outline`, **not** a hue — "giving it a hue would make an untouched queue look like something was wrong."

### 4.7 Border colours

| Purpose | Implementation | Where |
| --- | --- | --- |
| Global default | `@layer base { * { border-color: var(--border) } }` | `globals.css` |
| Table row divider | `border-border/60 border-b` on `<td>` (not `<tr>`) | `table.tsx` |
| Card / panel "border" | `inset 0 0 0 1px var(--glass-hairline)` box-shadow | `@utility glass*` |
| Menu separator | `bg-border/70 h-px` | `dropdown-menu.tsx`, `select.tsx` |
| Sidebar footer rule | `border-border/50 border-t` (resolves to `--sidebar-border`) | `app-shell.tsx` |
| Pagination top rule | `border-border/60 border-t` | `pagination-controls.tsx` |
| Activity list dividers | `divide-border/60 divide-y` | `admin-dashboard.tsx` |
| Input border | **None.** `border-0` + `glass-inset` box-shadow | `input.tsx`, `textarea.tsx`, `select.tsx` |

> **Pattern to copy:** real CSS `border` is used almost nowhere. Rims are inset box-shadows,
> because `globals.css` explains a pseudo-element border trick "would fight with" `position: sticky`
> — which the table header and topbar both rely on.

---

## 5. Gradient System

Gradients are **rare and deliberate**. A full search of `src/**/*.tsx` returns exactly **two**
`bg-gradient-*` usages, and zero inline `linear-gradient`/`radial-gradient` in components.

### 5.1 The aurora — the only large gradient in the product

`@utility app-aurora` in `globals.css`. A `position: fixed` pseudo-element at `z-index: -1`, so it
stays put while content scrolls — which is what makes glass read as glass.

```css
@utility app-aurora {
  position: relative;
  isolation: isolate;

  &::before {
    content: "";
    position: fixed;
    inset: 0;
    z-index: -1;
    background:
      radial-gradient(58rem 38rem at  8% -12%, var(--aurora-1), transparent 62%),
      radial-gradient(48rem 34rem at 98%   2%, var(--aurora-2), transparent 60%),
      radial-gradient(44rem 38rem at 46% 112%, var(--aurora-3), transparent 64%);
  }
}
```

| Stop | Light | Dark |
| --- | --- | --- |
| `--aurora-1` (top-left, brand) | `brand 17%` | `brand 14%` |
| `--aurora-2` (top-right, deep) | `brand-deep 15%` | `brand-deep 60%` |
| `--aurora-3` (below fold, brand) | `brand 11%` | `brand 9%` |

- **Type:** three stacked radial gradients. **Static** — no animation, no hover.
- **Theme-dependent:** yes, via the `--aurora-*` tokens only; the three geometries never change.
- **Applied at:** `app-shell.tsx` (root `div`), `(auth)/layout.tsx`, `app/page.tsx`, `app/loading.tsx`, `app/error.tsx`, `app/not-found.tsx` — 7 sites.
- **Print:** hidden (`.app-aurora::before { display: none }`).

### 5.2 Stat-card accent wash

`src/components/shared/stat-card.tsx` — a tone-tinted corner wash under the content.

```tsx
<div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent", styles.accent)} aria-hidden />
```

| Tone | `accent` class |
| --- | --- |
| `primary` | `from-primary/10` |
| `success` | `from-success/10` |
| `warning` | `from-warning/12` |
| `destructive` | `from-destructive/10` |
| `neutral` | `from-muted/60` |

Direction `to-br`, ends at `transparent`. Static, not theme-branched (the tokens handle that).

### 5.3 Avatar fallback

`src/components/ui/avatar.tsx`:

```tsx
"from-primary/18 to-primary/8 text-primary-ink ... bg-gradient-to-br"
```

### 5.4 Chart area fills

`src/components/charts/leave-trend-chart.tsx` — SVG `<linearGradient>` per series, vertical:

```tsx
<linearGradient id={`fill-${series.key}`} x1="0" y1="0" x2="0" y2="1">
  <stop offset="5%"  stopColor={series.color} stopOpacity={0.45} />
  <stop offset="95%" stopColor={series.color} stopOpacity={0.04} />
</linearGradient>
```

### 5.5 The specular sheen on solid buttons — a gradient built from shadow

The primary button has **no gradient**. The "lit from within" read comes from two inset shadows:

```
inset 0 1px  0  0 oklch(1 0 0 / 38%)     ← hard specular top edge
inset 0 7px 14px -8px oklch(1 0 0 / 30%) ← soft sheen falling from the top
```

> **Rule for Projects:** the brand fill is flat. Do **not** make a two-stop green gradient button.
> The lighting is white-on-top; the pigment underneath is never altered.

### 5.6 The shimmer sweep

`@keyframes glass-shimmer` + `@utility shimmer` — a travelling 90° linear gradient used by
`Skeleton`. Covered in §21 and §27.

**Summary for the Projects developer:** there is essentially **no decorative gradient vocabulary**
to extend. Use `app-aurora` on a full-page shell if you build one; use `StatCard`'s existing tones
for KPI washes. **Do not invent gradients.**

---

## 6. Glassmorphism System

This is the defining visual of the application. Five utilities in `src/app/globals.css`, all built
the same way: **background colour + `backdrop-filter` + a `box-shadow` stack that supplies the rim,
the specular highlight, and the depth.**

### 6.1 The shared ingredient tokens

| Token | Light | Dark |
| --- | --- | --- |
| `--glass-bg` | `oklch(1 0 0 / 62%)` — white @62% | `oklch(0.235 0.024 150 / 55%)` — #162118 @55% |
| `--glass-bg-strong` | `oklch(1 0 0 / 78%)` | `oklch(0.225 0.024 150 / 78%)` — #141F16 @78% |
| `--glass-bg-subtle` | `oklch(1 0 0 / 42%)` | `oklch(0.27 0.024 150 / 34%)` — #1E2A20 @34% |
| `--glass-border` | `oklch(1 0 0 / 70%)` | `oklch(1 0 0 / 10%)` |
| `--glass-hairline` | `oklch(0.45 0.03 150 / 12%)` | `oklch(1 0 0 / 8%)` |
| `--glass-highlight` | `oklch(1 0 0 / 90%)` | `oklch(1 0 0 / 14%)` |
| `--glass-shadow` | `oklch(0.35 0.06 150 / 10%)` ≈ #214329 @10% | `oklch(0.06 0.03 150 / 45%)` ≈ #000100 @45% |
| `--glass-shadow-strong` | `oklch(0.3 0.07 150 / 16%)` ≈ #0D371A @16% | `oklch(0.04 0.03 150 / 60%)` ≈ #000000 @60% |
| `--glass-blur` | `20px` | `20px` |
| `--glass-saturation` | `180%` | `180%` |

> **Note the shadow colour.** Shadows carry a *green cast* (hue 150) rather than being neutral grey,
> "so cards sit **in** the wash, not on top of it." A neutral `rgba(0,0,0,…)` shadow will look wrong.

> **`--glass-border` is declared but never referenced** by any utility or component
> (verified). Treat it as vestigial — see §33 / "Existing UI Inconsistencies".

### 6.2 Variant A — `glass` (the baseline surface)

```css
@utility glass {
  background-color: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturation));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturation));
  box-shadow:
    inset 0 1px 0 0 var(--glass-highlight),   /* specular top edge   */
    inset 0 0 0 1px var(--glass-hairline),    /* rim                 */
    0  1px  2px  -1px var(--glass-shadow),    /* contact shadow      */
    0  8px 24px -10px var(--glass-shadow),    /* mid                 */
    0 20px 44px -24px var(--glass-shadow);    /* ambient             */
}
```

- **Background:** white @62% (light) / #162118 @55% (dark)
- **Blur:** 20px · **Saturation:** 180%
- **Border:** 1px inset hairline, `oklch(0.45 0.03 150 / 12%)` light
- **Shadow:** 3 stacked drop shadows, green-cast
- **Radius:** set by the caller — `Card` uses `rounded-xl` (24px), topbar `rounded-xl`
- **Hover:** none by default; opt in with `hover-lift`
- **Used by:** `<Card>` (default), the topbar `<header>` in `app-shell.tsx`, `Button variant="glass"`
- **Count:** 14 sites

### 6.3 Variant B — `glass-strong` (dense content: dialogs, menus, popovers)

```css
@utility glass-strong {
  background-color: var(--glass-bg-strong);           /* white @78% */
  backdrop-filter: blur(calc(var(--glass-blur) * 1.4)) saturate(var(--glass-saturation));
  /* = blur(28px) saturate(180%) */
  box-shadow:
    inset 0 1px 0 0 var(--glass-highlight),
    inset 0 0 0 1px var(--glass-hairline),
    0  2px  4px  -2px var(--glass-shadow),
    0 20px 48px -16px var(--glass-shadow-strong),
    0 48px 96px -40px var(--glass-shadow-strong);
}
```

- **Blur:** 28px (1.4×). **Why:** "where text legibility outranks translucency."
- **Used by:** `DialogContent`, `AlertDialogContent`, `DropdownMenuContent`, `DropdownMenuSubContent`, `SelectContent`, `PopoverContent`, the Sonner toast, the global-search results panel, `<Card glass>`
- **Count:** 9 sites

### 6.4 Variant C — `glass-subtle` (a surface on top of another glass surface)

```css
@utility glass-subtle {
  background-color: var(--glass-bg-subtle);          /* white @42% */
  backdrop-filter: blur(calc(var(--glass-blur) * 0.6)) saturate(140%);
  /* = blur(12px) saturate(140%) */
  box-shadow:
    inset 0 1px 0 0 var(--glass-highlight),
    inset 0 0 0 1px var(--glass-hairline);
  /* NOTE: no drop shadow — it is nested, so it must not cast */
}
```

- **Used by:** `TableHeader` (sticky), `TableFooter`
- **Count:** 8 sites

### 6.5 Variant D — `glass-inset` (recessed well — all form controls)

```css
@utility glass-inset {
  background-color: color-mix(in oklab, var(--card) 55%, transparent);
  box-shadow:
    inset 0 1px 2px 0 var(--glass-shadow),   /* light from inside the well */
    inset 0 0 0 1px var(--glass-hairline);
}
```

- **No `backdrop-filter`** — this is the only glass variant without one.
- **Used by:** `Input`, `Textarea`, `SelectTrigger`, `TabsList`, `Progress` track, `Button variant="outline"`, `EmptyState` (when `inset`)
- **Count:** 16 sites — the most-used glass variant

### 6.6 Variant E — `glass-sidebar` (the navigation slab)

The one surface that **ignores light/dark**, "because it is branding rather than chrome."

```css
@utility glass-sidebar {
  /* Re-declares text tokens ONTO the panel so children recolour by inheritance */
  --foreground: var(--sidebar-foreground);
  --card-foreground: var(--sidebar-foreground);
  --muted-foreground: var(--sidebar-muted-foreground);
  --border: var(--sidebar-border);
  --accent: var(--sidebar-accent);
  --accent-foreground: var(--sidebar-foreground);
  --secondary: oklch(1 0 0 / 12%);
  --secondary-foreground: oklch(0.94 0.012 150);
  --primary-ink: var(--brand);          /* no ink substitute needed on dark ground */
  --glass-hairline: oklch(1 0 0 / 9%);
  --glass-highlight: oklch(1 0 0 / 12%);

  color: var(--sidebar-foreground);
  background-color: var(--sidebar);
  backdrop-filter: blur(calc(var(--glass-blur) * 1.3)) saturate(160%);   /* 26px */
  box-shadow:
    inset 0 1px 0 0 oklch(1 0 0 / 12%),
    inset 0 0 0 1px oklch(1 0 0 / 8%),
    0  2px  4px  -2px var(--glass-shadow),
    0 20px 48px -16px var(--glass-shadow-strong),
    0 48px 96px -40px var(--glass-shadow-strong);
}
```

> **This is the single most important architectural idea in the CSS.** The sidebar recolours its
> children by **re-scoping custom properties onto itself** — not by restyling components. So
> `Badge`, `Button variant="ghost"`, `text-muted-foreground` and the nav links all just work on dark
> ground. **If Projects adds anything to the sidebar, style it with tokens and it will inherit
> correctly. Never hard-code a light colour for a sidebar child.**

### 6.7 Variant F — `glass-hairline` (rim only)

```css
@utility glass-hairline { box-shadow: inset 0 0 0 1px var(--glass-hairline); }
```

**[Confirmed] — defined but never used as a class anywhere in `src/`.** Available if you need a
bare rim.

### 6.8 Chart tooltip — glass replicated inline

Recharts only accepts inline styles, so `src/components/charts/chart-theme.ts` restates
`glass-strong` by hand:

```ts
export const tooltipContentStyle: CSSProperties = {
  background: "var(--glass-bg-strong)",
  backdropFilter: "blur(28px) saturate(180%)",
  WebkitBackdropFilter: "blur(28px) saturate(180%)",
  border: "none",
  borderRadius: "14px",
  boxShadow:
    "inset 0 1px 0 0 var(--glass-highlight), inset 0 0 0 1px var(--glass-hairline), 0 12px 32px -12px var(--glass-shadow-strong)",
  color: "var(--color-popover-foreground)",
  fontSize: "0.8125rem",
  padding: "0.5rem 0.75rem",
};
```

**If Projects adds a chart, import these from `chart-theme.ts` — do not re-derive them.**

### 6.9 Environment fallback — reduced transparency

```css
@media (prefers-reduced-transparency: reduce) {
  .glass, .glass-strong, .glass-subtle {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background-color: var(--card);
  }
  .glass-sidebar {
    backdrop-filter: none;
    background-color: oklch(0.235 0.05 150);   /* #092411 opaque */
  }
}
```

The layout is identical either way — cost is paid back as opaque fills. **Anything you hand-roll
with `backdrop-blur-*` will silently opt out of this.** Use the utilities.

### 6.10 Print flattening

```css
@media print {
  .glass, .glass-strong, .glass-inset {
    background: #fff !important;
    box-shadow: none !important;
    border: 1px solid #d4d4d4 !important;
    backdrop-filter: none !important;
  }
}
```

Note `glass-subtle` and `glass-sidebar` are **not** in that list — the sidebar is handled by
`.no-print` instead. See §33.

### 6.11 Quick-reference: which glass for which surface

| Surface | Utility | Blur | Radius |
| --- | --- | --- | --- |
| Page card, topbar | `glass` | 20px | `rounded-xl` (24px) |
| Dialog, dropdown, popover, select, toast, search panel | `glass-strong` | 28px | `rounded-2xl` (30px) dialogs, `rounded-lg` (18px) menus, `rounded-xl` popovers/toasts |
| Table header, table footer | `glass-subtle` | 12px | — |
| Input, textarea, select trigger, tabs track, progress track, outline button, empty state | `glass-inset` | none | `rounded-lg` (18px) mostly |
| Sidebar | `glass-sidebar` | 26px | `rounded-2xl` (30px) |

---

## 7. Typography System

### 7.1 Font families

`src/app/layout.tsx`:

```tsx
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
```

`src/app/globals.css` (`@theme inline`):

```css
--font-sans:
  -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display",
  var(--font-geist-sans), "Segoe UI Variable Text", "Segoe UI", ui-sans-serif,
  system-ui, sans-serif;
--font-mono: "SF Mono", var(--font-geist-mono), ui-monospace, monospace;
```

> **System-first, Geist as the carrier.** SF Pro renders natively on Apple; Geist carries Windows
> and Linux "so the type colour stays close." **Do not add a font for Projects.**

Base rendering (`@layer base`):

```css
body {
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
h1, h2, h3 { letter-spacing: -0.021em; }
h1          { letter-spacing: -0.026em; }
```

### 7.2 Weights actually used

Only **three**, counted across all `.tsx`:

| Class | Occurrences | Where |
| --- | --- | --- |
| `font-medium` (500) | 85 | Labels, nav items, buttons, table cell emphasis, badges |
| `font-semibold` (600) | 33 | Headings, card titles, stat values, table headers, uppercase eyebrows |
| `font-normal` (400) | 5 | Explicit resets (e.g. the `/ 4` denominator on the balance figure) |

**There is no bold (700) anywhere.** Do not introduce one.

### 7.3 Type scale — as measured

| Element | Class | Computed | Weight | Line height | Tracking | Colour | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Landing H1** | `text-[2rem] md:text-[2.75rem]` | 32 → 44px | 600 | `leading-[1.1]` | `-0.03em` | `--foreground` | `app/page.tsx` |
| **Page H1** | `text-[1.75rem]` | 28px | 600 | `leading-tight` | `-0.028em` | `--foreground` | `layout/page-header.tsx` |
| **Balance figure** | `text-5xl` | 48px | 600 | default | `tracking-tight` | `--foreground` | `employee-dashboard.tsx` |
| **Auth card title** | `text-2xl` | 24px | 600 | — | inherits h-rules | `--foreground` | all `(auth)/*` pages |
| **Stat value** | `text-[2rem]` | 32px | 600 | `leading-none` | `-0.03em` | `--foreground` | `shared/stat-card.tsx` |
| **Section H2** | `text-xl` | 20px | 600 | — | `-0.02em` | `--foreground` | `app/page.tsx`, `error.tsx`, `not-found.tsx` |
| **Dialog title** | `text-lg` | 18px | 600 | `leading-tight` | `-0.018em` | `--foreground` | `ui/dialog.tsx`, `ui/alert-dialog.tsx` |
| **Card title (default)** | `text-[0.9375rem]` | 15px | 600 | `leading-none` | `-0.012em` | `--card-foreground` | `ui/card.tsx` |
| **Card title (dashboard override)** | `text-base` | 16px | 600 | — | — | — | `admin-dashboard.tsx` — passes `className="text-base"` |
| **Body / default** | `text-sm` | 14px | 400 | `leading-relaxed` where prose | `--foreground` / `--muted-foreground` | 135 uses | everywhere |
| **Input text** | `text-base md:text-sm` | 16 → 14px | 400 | — | — | — | `ui/input.tsx` |
| **Button label** | `text-sm` | 14px | 500 (600 on `default`/`success`) | — | — | — | `ui/button.tsx` |
| **Button label (lg)** | `text-[0.9375rem]` | 15px | 600 | — | — | — | `ui/button.tsx` |
| **Caption / hint / meta** | `text-xs` | 12px | 400–500 | — | — | `--muted-foreground` | 103 uses |
| **Table header / eyebrow** | `text-[0.6875rem]` | **11px** | 600 | — | **`0.06em`, UPPERCASE** | `--muted-foreground` | `ui/table.tsx`, `ui/sort-button.tsx`, `global-search.tsx` |
| **Sidebar group heading** | `text-[0.6875rem]` | 11px | 600 | — | **`0.08em`, UPPERCASE** | `--muted-foreground/80` | `layout/app-shell.tsx` |
| **Sidebar nav item** | `text-sm` | 14px | 500 | — | — | see §14 | `layout/app-shell.tsx` |
| **Sidebar logo suffix** | `text-[0.9375rem]` | 15px | 600 | — | `-0.015em` | `--sidebar-foreground` | `layout/app-shell.tsx` |
| **Toast title** | `text-sm` | 14px | 600 | — | `-0.01em` | `--foreground` | `ui/sonner.tsx` |
| **Tooltip** | `text-xs` | 12px | 500 | `text-balance` | — | `--background` on `--foreground/92` | `ui/tooltip.tsx` |
| **Badge** | `text-xs` | 12px | 500 | `whitespace-nowrap` | — | per variant | `ui/badge.tsx` |
| **Form message (error)** | `text-xs` | 12px | 500 | — | — | `--destructive-ink` | `ui/form.tsx` |
| **Form description** | `text-xs` | 12px | 400 | — | — | `--muted-foreground` | `ui/form.tsx` |
| **Error digest / code** | `text-xs font-mono` | 12px | 400 | — | — | `--muted-foreground` | `app/error.tsx` |

### 7.4 The tracking ladder

Negative tracking **scales with size** — Apple's convention, stated in a `globals.css` comment as
"mirror that so headings read as one family with the body copy."

| Size | Tracking |
| --- | --- |
| 44 / 32px | `-0.03em` |
| 28px | `-0.028em` |
| 24px | `-0.024em` |
| 20px | `-0.02em` |
| 18px | `-0.018em` |
| 15px (lockup / title) | `-0.015em` / `-0.012em` |
| 14px body | 0 |
| 11px uppercase | **+0.06em / +0.08em** |

### 7.5 Numeric text

Any figure a reader compares vertically carries **`tabular-nums`**: `StatCard` value, the leave
balance, pagination counts, the mark-attendance countdown, complaint tiles.

**Rule:** every number in a Projects table column or KPI tile gets `tabular-nums`.

---

## 8. Spacing System

**[Confirmed]** Tailwind's default 4px scale, unmodified — there is no `--spacing` override in
`globals.css` and no config file.

### 8.1 Measured frequency

| Class | Uses | Meaning in practice |
| --- | --- | --- |
| `gap-2` (8px) | 88 | Icon↔label, button rows, badge rows, filter chips |
| `gap-4` (16px) | 54 | **The grid gap.** Stat grids, card grids, dialog sections |
| `gap-3` (12px) | 43 | Nav item internals, list rows, tight filter bars |
| `gap-1.5` (6px) | 20 | Card header title↔description |
| `space-y-1.5` | 45 | Title + description pairs |
| `space-y-4` (16px) | 29 | Stacked sections inside a card |
| `space-y-3` (12px) | 23 | Skeleton stacks, dense lists |
| `p-4` (16px) | 16 | Table cell, compact card content |
| `p-3` (12px) | 16 | Inline wells, notices |
| `p-6` (24px) | 10 | **Dialog padding, card padding** |

### 8.2 Canonical spacing per component

| Component | Padding / spacing | Source |
| --- | --- | --- |
| `Card` root | `py-6` + `gap-6` between slots | `ui/card.tsx` |
| `CardHeader` / `CardContent` / `CardFooter` | `px-6` | `ui/card.tsx` |
| `CardHeader` internal | `gap-1.5` | `ui/card.tsx` |
| Dialog / AlertDialog | `p-6`, `gap-4` | `ui/dialog.tsx` |
| Dialog header | `gap-2 pr-8` (clears the close button) | `ui/dialog.tsx` |
| Dialog footer | `gap-2 pt-1` | `ui/dialog.tsx` |
| Dropdown / Select content | `p-1.5` | `ui/dropdown-menu.tsx`, `ui/select.tsx` |
| Menu item | `px-2 py-1.5` | `ui/dropdown-menu.tsx` |
| Popover | `p-4` | `ui/popover.tsx` |
| Toast | `!p-4 !gap-3` | `ui/sonner.tsx` |
| Input / Select trigger | `px-3.5 py-1` / `px-3.5 py-2` | `ui/input.tsx`, `ui/select.tsx` |
| Textarea | `px-3.5 py-2.5` | `ui/textarea.tsx` |
| Button (default) | `px-4 py-2`, `has-[>svg]:px-3` | `ui/button.tsx` |
| Badge | `px-2.5 py-0.5` | `ui/badge.tsx` |
| Table cell | `p-4` | `ui/table.tsx` |
| Table head | `h-11 px-4` | `ui/table.tsx` |
| Pagination bar | `px-6 py-4`, `gap-3` | `ui/pagination-controls.tsx` |
| Empty state | `px-6 py-14`, `gap-3` | `shared/empty-state.tsx` |
| Nav item | `px-3 py-2.5`, `gap-3` | `layout/app-shell.tsx` |
| Nav list | `px-3 py-2`, `space-y-0.5` | `layout/app-shell.tsx` |
| Sidebar header | `h-16 px-4` | `layout/app-shell.tsx` |
| Sidebar footer | `px-4 py-3.5` | `layout/app-shell.tsx` |
| Topbar inner | `px-2 sm:px-3`, `gap-2` | `layout/app-shell.tsx` |
| `<main>` | `px-3 py-6 sm:px-4 lg:pr-4` | `layout/app-shell.tsx` |
| `PageHeader` bottom margin | `mb-7` (28px) | `layout/page-header.tsx` |

### 8.3 The "bleed" idiom for full-width tables inside cards

A recurring pattern worth copying — a table inside a padded card breaks out of the padding so rows
run edge to edge, then re-pads its first/last columns:

```tsx
<CardContent className="space-y-4 p-4 sm:p-6">
  ...filters...
  <div className="-mx-4 sm:-mx-6">
    <Table>
      <TableHead className="pl-4 sm:pl-6">…</TableHead>
      …
      <TableCell className="pr-4 text-right sm:pr-6">…</TableCell>
```

Source: `src/components/leaves/leave-table.tsx`.

---

## 9. Border & Radius System

### 9.1 The scale — one anchor, everything derived

`src/app/globals.css`:

```css
:root { --radius: 1.5rem; }          /* 24px — the card/panel anchor */

@theme inline {
  --radius-sm:  calc(var(--radius) - 14px);  /* 10px */
  --radius-md:  calc(var(--radius) - 10px);  /* 14px */
  --radius-lg:  calc(var(--radius) -  6px);  /* 18px */
  --radius-xl:  var(--radius);               /* 24px */
  --radius-2xl: calc(var(--radius) +  6px);  /* 30px */
  --radius-3xl: calc(var(--radius) + 12px);  /* 36px */
}
```

The file names the intent: *"sm 10 · md 14 (buttons) · lg 18 (inputs) · xl 24 (cards) · 2xl 30
(dialogs) · 3xl 36 (hero panels)."*

> These are **not** Tailwind's defaults (which are 2/6/8/12/16px). A hard-coded `rounded-lg`
> is 18px here, not 8px. Never substitute an arbitrary `rounded-[Npx]`.

### 9.2 Component → radius map

| Component | Class | Computed | Source |
| --- | --- | --- | --- |
| Button (default, icon) | `rounded-md` | **14px** | `ui/button.tsx` |
| Button (`size="sm"`, `icon-sm`) | `rounded-sm` | **10px** | `ui/button.tsx` |
| Button (`size="lg"`) | `rounded-lg` | **18px** | `ui/button.tsx` |
| Input, Textarea, Select trigger | `rounded-lg` | **18px** | `ui/input.tsx` etc. |
| Card | `rounded-xl` | **24px** | `ui/card.tsx` |
| Dialog, AlertDialog | `rounded-2xl` | **30px** | `ui/dialog.tsx` |
| Sidebar panel | `rounded-2xl` | **30px** | `layout/app-shell.tsx` |
| Topbar | `rounded-xl` | **24px** | `layout/app-shell.tsx` |
| Dropdown/Select content | `rounded-lg` | **18px** | `ui/dropdown-menu.tsx` |
| Popover | `rounded-xl` | **24px** | `ui/popover.tsx` |
| Toast | `!rounded-xl` | **24px** | `ui/sonner.tsx` |
| Tooltip | `rounded-sm` | **10px** | `ui/tooltip.tsx` |
| Menu item, Select item, search result row | `rounded-sm` / `rounded-md` | 10 / 14px | menus use `rounded-sm`; search rows `rounded-md` |
| Tabs list (track) | `rounded-lg` | **18px** | `ui/tabs.tsx` |
| Tabs trigger (pill) | `rounded-md` | **14px** | `ui/tabs.tsx` |
| Nav item | `rounded-md` | **14px** | `layout/app-shell.tsx` |
| **Badge** | `rounded-full` | pill | `ui/badge.tsx` |
| **Avatar** | `rounded-full` | circle | `ui/avatar.tsx` |
| **Switch** track + thumb | `rounded-full` | pill / circle | `ui/switch.tsx` |
| **Progress** track + indicator | `rounded-full` | pill | `ui/progress.tsx` |
| Skeleton | `rounded-md` | 14px (callers override with `rounded-xl`/`rounded-full`) | `ui/skeleton.tsx` |
| Empty state well | `rounded-xl` | **24px** | `shared/empty-state.tsx` |
| Stat-card icon tile | `rounded-md` | **14px** | `shared/stat-card.tsx` |
| Empty-state / error icon disc | `rounded-full` | circle | `empty-state.tsx`, `error.tsx` |
| Active-nav rail | `rounded-r-full` | — | `layout/app-shell.tsx` |
| Chart bar | `radius={[0, 6, 6, 0]}` | 6px (SVG) | `department-chart.tsx` |
| Chart tooltip | `borderRadius: "14px"` | 14px (inline) | `chart-theme.ts` |

**`rounded-3xl` (36px) is declared but never used.** **`rounded-none` never appears.**

### 9.3 Radius frequency

`rounded-xl` 30 · `rounded-full` 29 · `rounded-lg` 23 · `rounded-md` 14 · `rounded-sm` 13 ·
`rounded-2xl` 5.

### 9.4 Borders

See §4.7. The operative rule: **rims are `inset 0 0 0 1px` box-shadows, not `border`.** Real borders
appear only as dividers (`border-b`, `border-t`, `divide-y`) and are always alpha-reduced
(`border-border/60`, `/50`, `/70`).

---

## 10. Shadow System

### 10.1 Declared tokens

`@theme inline` in `globals.css`:

```css
--shadow-glass-sm: 0 1px 2px -1px var(--glass-shadow), 0 4px 12px -6px var(--glass-shadow);
--shadow-glass:    0 1px 2px -1px var(--glass-shadow), 0 8px 24px -10px var(--glass-shadow),
                   0 20px 44px -24px var(--glass-shadow);
--shadow-glass-lg: 0 1px 2px -1px var(--glass-shadow), 0 12px 32px -12px var(--glass-shadow-strong),
                   0 32px 64px -32px var(--glass-shadow-strong);
--shadow-glass-xl: 0 2px 4px -2px var(--glass-shadow), 0 20px 48px -16px var(--glass-shadow-strong),
                   0 48px 96px -40px var(--glass-shadow-strong);
```

> **[Confirmed] None of the four `shadow-glass-*` utilities is used anywhere in `src/`** (0 matches).
> The `@utility glass*` blocks inline equivalent stacks instead. See §33. They remain valid Tailwind
> utilities (`shadow-glass`, `shadow-glass-lg`, …) if you want a shadow **without** the blur and rim.

### 10.2 Shadows as actually applied

| Element | Shadow | Colour source |
| --- | --- | --- |
| `glass` card / topbar | `inset 0 1px 0 highlight`, `inset 0 0 0 1px hairline`, `0 1px 2px -1px`, `0 8px 24px -10px`, `0 20px 44px -24px` | `--glass-shadow` (green-cast) |
| `glass-strong` dialog / menu | + `0 2px 4px -2px`, `0 20px 48px -16px`, `0 48px 96px -40px` | `--glass-shadow-strong` |
| `glass-subtle` table header | inset highlight + hairline **only, no drop** | — |
| `glass-inset` input | `inset 0 1px 2px 0 glass-shadow`, `inset 0 0 0 1px hairline` | recessed |
| **Primary button (rest)** | `inset 0 1px 0 0 oklch(1 0 0/38%)`, `inset 0 7px 14px -8px oklch(1 0 0/30%)`, `0 1px 2px -1px var(--glass-shadow)`, `0 6px 18px -8px color-mix(in oklab, var(--brand) 60%, transparent)` | **brand glow** |
| **Primary button (hover)** | highlight → 45%, sheen → 38%, `0 2px 4px -2px`, glow → `0 12px 30px -8px brand 78%` | brand glow intensifies |
| Destructive button | `inset 0 1px 0 0 oklch(1 0 0/25%)`, `0 1px 2px -1px`, `0 6px 16px -8px destructive 55%` → hover `65%` | destructive glow |
| Success button | identical to primary but `--success` | brand glow |
| Secondary button | `inset 0 1px 0 0 var(--glass-highlight)`, `inset 0 0 0 1px var(--glass-hairline)` | no drop |
| Badge `default` | `inset 0 1px 0 0 oklch(1 0 0/20%)` | sheen only |
| Badge tinted variants | `inset 0 0 0 1px color-mix(in oklab, var(--COLOR) 28–32%, transparent)` | same-hue rim |
| Badge `outline` | `inset 0 0 0 1px var(--border)` | |
| Switch (checked) | `inset 0 1px 0 0 oklch(1 0 0/20%)`, `0 2px 8px -3px primary 60%` | brand glow |
| Switch (unchecked) | `inset 0 1px 2px 0 var(--glass-shadow)` | recessed |
| Switch thumb | `0 1px 2px 0 oklch(0 0 0/16%)`, `0 2px 6px -1px oklch(0 0 0/12%)` | **neutral black** (physical object) |
| Progress indicator | `inset 0 1px 0 0 oklch(1 0 0/35%)`, `0 0 10px 0 brand 55%` | brand bloom |
| Tabs active pill | `inset 0 1px 0 0 highlight`, `inset 0 0 0 1px brand 30%`, `0 1px 2px -1px`, `0 4px 10px -6px brand 35%` | brand rim + glow |
| Active nav rail | `0 0 12px 0 color-mix(in oklab, var(--brand) 70%, transparent)` | brand glow |
| Avatar | `inset 0 0 0 1px var(--glass-hairline)`, `0 1px 3px -1px var(--glass-shadow)` | |
| Tooltip | `0 4px 12px -4px var(--glass-shadow-strong)` | |
| **`hover-lift`** | see §21.2 — adds `0 20px 48px -28px brand 38%` | **brand halo on hover** |

### 10.3 Theme behaviour

Shadows change with the theme automatically because `--glass-shadow` / `--glass-shadow-strong` are
themed: light is `#214329 @10%` / `#0D371A @16%` (a *green* shadow); dark is near-black at
`45%` / `60%`. **Dark-mode shadows are ~4–5× more opaque** — do not assume the same opacity works.

### 10.4 The rule to carry into Projects

> **Elevation is expressed as brand glow, not as darker grey.** A raised, branded, or active element
> gets a low-alpha *coloured* shadow beneath it. Copy the exact glow strings from `button.tsx` /
> `tabs.tsx` rather than approximating with `shadow-lg`.

---

## 11. Button System

Source: **`src/components/ui/button.tsx`** (CVA).

### 11.1 Base classes (every variant)

```
relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap
rounded-md text-sm font-medium
transition-[background-color,box-shadow,transform,color,opacity] duration-200 ease-standard
outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35
disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none
active:scale-[0.97] active:duration-100
[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4
```

Key facts: **220ms**-family transition at `duration-200`; focus is a **3px ring at 35% alpha**;
press is **scale 0.97 at 100ms**; disabled is **opacity 45% with shadow removed**; any bare SVG
child is auto-sized to **16px**.

### 11.2 Variants

| Variant | Background | Text | Rim / shadow | Hover | Use for |
| --- | --- | --- | --- | --- | --- |
| **`default`** | `bg-primary` (#0AEA0A) | `text-primary-foreground` (#023506), **`font-semibold`** | white inset sheen + brand glow `0 6px 18px -8px brand 60%` | glow → `brand 78%`, sheen 38→45% | The one primary action per screen |
| **`destructive`** | `bg-destructive` | `text-destructive-foreground` | `inset 0 1px 0 white/25%` + destructive glow 55% | `bg-destructive/92`, glow 65%; ring → `destructive/35` | Delete, remove |
| **`success`** | `bg-success` (= brand) | `text-success-foreground` | same as default with `--success` | glow 78%; ring `success/35` | Confirm/approve |
| **`outline`** | `glass-inset` | `text-foreground` | recessed well | `hover:bg-accent/60 hover:text-accent-foreground` | **The default secondary action** — Export CSV, View roster, pagination |
| **`secondary`** | `bg-secondary` | `text-secondary-foreground` | `inset highlight` + `inset hairline` | `hover:bg-secondary/70` | Quiet alternative |
| **`glass`** | `glass` utility | `text-foreground` | full glass | `hover:bg-accent/45` | Floating chrome over content |
| **`ghost`** | none | `text-foreground/80` | none | `hover:bg-accent/70 hover:text-accent-foreground` | Icon buttons in the topbar, "Clear filters", menu triggers |
| **`link`** | none | `text-primary-ink` | none | `hover:underline`, `active:scale-100` (press cancelled) | Inline navigation |

### 11.3 Sizes

| Size | Classes | Height | Radius |
| --- | --- | --- | --- |
| `default` | `h-9 px-4 py-2 has-[>svg]:px-3` | **36px** | 14px |
| `sm` | `h-8 gap-1.5 rounded-sm px-3 has-[>svg]:px-2.5` | **32px** | 10px |
| `lg` | `h-11 rounded-lg px-6 text-[0.9375rem] has-[>svg]:px-4` | **44px** | 18px |
| `icon` | `size-9` | 36×36 | 14px |
| `icon-sm` | `size-8 rounded-sm` | 32×32 | 10px |

> `has-[>svg]:px-*` trims horizontal padding when the button contains an icon, so an icon+label
> button is not visually wider than a label-only one. It is automatic — do not override padding.

### 11.4 Loading

`loading` is a first-class prop, not a caller concern:

```tsx
<Button loading={saving}>Save project</Button>
```

It sets `disabled`, sets `aria-busy`, and prepends `<Loader2 className="size-4 animate-spin" />`
before the children. **Use this rather than swapping the label to "Saving…".** (Some screens do
also swap copy — e.g. `ConfirmDialog` renders `"Working…"` — see §33.)

### 11.5 `asChild`

Every navigational button wraps a `<Link>`:

```tsx
<Button asChild>
  <Link href={ROUTES.adminProjects}>
    <FolderKanban className="size-4" />
    New project
  </Link>
</Button>
```

Note: `loading` is ignored when `asChild` is set (by design — a `Slot` takes one child).

### 11.6 Copy conventions [Inferred, but consistent]

Sentence case, verb-first, no trailing punctuation: "Request leave", "View roster", "Export CSV",
"Clear", "Mark present", "Try again", "Back to home". Icon **before** the label except for
"forward" affordances, where it follows (`Next <ChevronRight/>`, `View roster <ArrowRight/>`).

---

## 12. Form & Input System

### 12.1 `Input` — `src/components/ui/input.tsx`

```
glass-inset file:text-foreground placeholder:text-muted-foreground/80
selection:bg-primary selection:text-primary-foreground
flex h-10 w-full min-w-0 rounded-lg border-0 px-3.5 py-1 text-base outline-none md:text-sm
transition-[box-shadow,background-color] duration-200 ease-standard
hover:bg-card/70
focus-visible:bg-card/80
focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_1px_var(--ring-edge),0_0_0_4px_color-mix(in_oklab,var(--ring)_30%,transparent)]
aria-invalid:shadow-[inset_0_0_0_1px_var(--destructive),0_0_0_3px_color-mix(in_oklab,var(--destructive)_22%,transparent)]
disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50
```

| Property | Value |
| --- | --- |
| Height | **40px** (`h-10`) |
| Width | `w-full min-w-0` — always fills its container |
| Padding | `px-3.5 py-1` (14px horizontal) |
| Radius | **18px** (`rounded-lg`) |
| Border | **none** — `border-0`; the well is `glass-inset` |
| Background | `color-mix(in oklab, var(--card) 55%, transparent)` |
| Placeholder | `text-muted-foreground/80` |
| Hover | `bg-card/70` |
| **Focus** | The inset well is **replaced entirely** by a three-layer ring: 1px inset brand + 1px `--ring-edge` (deep green) + 4px brand @30%. "The control reads as lifting out of the surface rather than gaining a second border." |
| Error | `aria-invalid:` 1px inset destructive + 3px destructive @22% |
| Disabled | `pointer-events-none cursor-not-allowed opacity-50` |
| Text size | `text-base` on mobile → `md:text-sm` — **16px on mobile prevents iOS zoom-on-focus.** Keep it. |

### 12.2 Search input idiom — repeated verbatim in 4+ places

```tsx
<div className="relative flex-1">
  <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
  <Input value={…} onChange={…} placeholder="Search…" className="pl-9" aria-label="Search projects" />
</div>
```

Loading spinner variant (global search) adds:

```tsx
<Loader2 className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" />
```

Sources: `leave-table.tsx`, `employee-manager.tsx`, `attendance-manager.tsx`, `global-search.tsx`.

### 12.3 `Textarea`

Same treatment as `Input` with: `min-h-20` (80px), `px-3.5 py-2.5`, `leading-relaxed`, and
**`field-sizing-content`** — it grows with its content natively. Focus ring is `0 0 0 3px @28%`
(3px, no `--ring-edge` layer) — a minor divergence from `Input`; see §33.

### 12.4 `SelectTrigger`

`glass-inset`, `rounded-lg`, `border-0`, `px-3.5 py-2`, `text-sm`,
`data-[size=default]:h-10` / `data-[size=sm]:h-8`, chevron at `opacity-45`. Focus ring matches
`Textarea` (3px @28%). Placeholder via `data-[placeholder]:text-muted-foreground/80`.

**Fixed widths on filter selects are the convention:** `w-36` (status), `w-40` (population),
`w-44` (department) — see `leave-table.tsx`.

### 12.5 `Switch`

`h-6 w-11` (24×44), thumb `size-5` (20px) translating `translate-x-5`.
Unchecked `bg-input` + inset shadow; checked `bg-primary` + brand glow.
Thumb is `bg-white` with a **neutral** black shadow, 300ms `ease-spring`.

### 12.6 `Label` and `Form`

`Label`: `flex items-center gap-2 text-sm leading-none font-medium select-none`, with
`peer-disabled:` and `group-data-[disabled=true]:` opacity handling.

`src/components/ui/form.tsx` is the standard react-hook-form bridge:

```tsx
<Form {...form}>
  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
    <FormField control={form.control} name="name" render={({ field }) => (
      <FormItem>                        {/* grid gap-2 */}
        <FormLabel>Project name</FormLabel>   {/* data-[error=true]:text-destructive-ink */}
        <FormControl><Input {...field} /></FormControl>  {/* wires aria-invalid + aria-describedby */}
        <FormDescription>…</FormDescription>  {/* text-xs text-muted-foreground */}
        <FormMessage />                       {/* text-xs font-medium text-destructive-ink */}
      </FormItem>
    )} />
  </form>
</Form>
```

`FormControl` sets `aria-invalid` automatically, which is what triggers the input's red ring.
**Never style an error state by hand.**

### 12.7 Not present in the codebase

**[Not defined]** — searched `src/components/ui/`:

- **No `Checkbox` component.** `DropdownMenuCheckboxItem` exists but there is no standalone checkbox
  primitive. Multi-select (report people picker, admin recipient picker) is implemented as
  **selectable rows** using the brand-selection idiom (§13.5), not checkboxes.
- **No `RadioGroup`.** `DropdownMenuRadioItem` exists; standalone radios do not. Mutually exclusive
  choice is done with `Tabs`, `Select`, or a segmented `Button` group.
- **No `DatePicker` / `Calendar` component.** Dates are native `<input type="date">` / `type="time"`
  passed through `Input`. See `attendance-manager.tsx`, `holiday-manager.tsx`, `report-builder.tsx`.
- **No `Command` palette.** Global search is hand-built.
- **No generic file-upload primitive** — there are two purpose-built ones
  (`email-attachments-field.tsx`, `complaint-attachments-field.tsx`) plus `avatar-upload.tsx`.

> **For Projects:** if you need a checkbox or a date picker, **prefer the existing idioms**
> (selectable rows; native `type="date"` inside `Input`) over adding a new shadcn primitive. If you
> genuinely must add one, install it into `src/components/ui/` and restyle it to `glass-inset` +
> `rounded-lg` + the standard focus ring so it matches.

---

## 13. Card System

Source: **`src/components/ui/card.tsx`**.

### 13.1 The component

```tsx
function Card({ className, glass = false, interactive = false, ...props }) {
  return (
    <div
      data-slot="card"
      className={cn(
        "text-card-foreground flex min-w-0 flex-col gap-6 rounded-xl py-6",
        glass ? "glass-strong" : "glass",
        interactive && "hover-lift",
        className,
      )}
      {...props}
    />
  );
}
```

Two booleans, and both matter:

| Prop | Effect | When to use |
| --- | --- | --- |
| `glass` (default `false`) | `glass` → `glass-strong` | When a card floats **directly over the aurora** with no other surface behind it — auth screens, `error.tsx`, `not-found.tsx`, landing role cards. Inside the app shell, leave it off. |
| `interactive` (default `false`) | adds `hover-lift` | Only when the whole card is a click target or a summary tile. Used by `StatCard` and the landing role cards. |

> **`min-w-0` is load-bearing.** The comment explains: without it "a wide table inside would push its
> intrinsic minimum onto the track and overflow the page horizontally on narrow viewports." **Never
> remove it, and never replace `Card` with a plain `div` for a table container.**

### 13.2 Slots

| Slot | Classes |
| --- | --- |
| `CardHeader` | `@container/card-header grid auto-rows-min items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto]` |
| `CardTitle` | `text-[0.9375rem] leading-none font-semibold tracking-[-0.012em]` |
| `CardDescription` | `text-muted-foreground text-sm leading-relaxed` |
| `CardAction` | `col-start-2 row-span-2 row-start-1 self-start justify-self-end` |
| `CardContent` | `px-6` |
| `CardFooter` | `flex items-center px-6 [.border-t]:pt-6` |

`CardHeader` auto-switches to a two-column grid when a `CardAction` is present — no layout work
needed for a header with a trailing button.

### 13.3 The three card recipes actually in use

**A — Standard content card (the default; use this for Projects).**

```tsx
<Card>
  <CardHeader>
    <CardTitle className="flex items-center gap-2 text-base">
      <FolderKanban className="text-primary-ink size-4" aria-hidden />
      Active projects
    </CardTitle>
    <CardDescription>Everything currently in flight.</CardDescription>
  </CardHeader>
  <CardContent>…</CardContent>
</Card>
```

Note the dashboard convention: `CardTitle` is overridden to `text-base` (16px) and carries a
**16px `text-primary-ink` Lucide icon** with `gap-2`. Source: `admin-dashboard.tsx`.

**B — Table/filter card (`py-0` + inner padding + bleed).**

```tsx
<Card className="py-0">
  <CardContent className="space-y-4 p-4 sm:p-6">
    …filter bar…
    <div className="-mx-4 sm:-mx-6"><Table>…</Table><PaginationControls … /></div>
  </CardContent>
</Card>
```

Source: `leaves/leave-table.tsx`, `admin/employee-manager.tsx`.

**C — Floating card over the aurora (auth / full-screen states).**

```tsx
<Card glass className="animate-in fade-in-0 zoom-in-95 w-full max-w-md text-center duration-500 ease-standard">
  <CardContent className="space-y-4">…</CardContent>
</Card>
```

Source: `error.tsx`, `not-found.tsx`; auth pages use `<Card glass>` with a header.

### 13.4 `StatCard` — the KPI tile

`src/components/shared/stat-card.tsx`. **Reuse this verbatim for Projects KPIs.**

```tsx
<StatCard label="Active projects" value={12} icon={FolderKanban} tone="primary" hint="In flight" />
```

| Prop | Type | Notes |
| --- | --- | --- |
| `label` | `string` | `text-sm font-medium text-muted-foreground truncate` |
| `value` | `number \| string` | `text-[2rem] leading-none font-semibold tracking-[-0.03em] tabular-nums` |
| `icon` | `LucideIcon` | rendered `size-5` inside a `size-10 rounded-md` tinted tile |
| `tone` | `primary \| success \| warning \| destructive \| neutral` | drives both the icon tile and the corner wash |
| `hint` | `string?` | `text-xs text-muted-foreground truncate` |
| `className` | `string?` | |

Structure: `<Card interactive className="relative overflow-hidden py-0">` → absolutely-positioned
gradient wash → `<CardContent className="relative flex items-start justify-between gap-4 p-5">`.

`StatCardSkeleton` is exported alongside — **use it for the loading state**, not a bare `Skeleton`.

### 13.5 The brand-selection idiom — the reusable "selected row/card" pattern

Repeated identically in five places (nav active item, `report-people-picker`,
`admin-recipient-picker`, `invitation-gate`, table row `data-[state=selected]`):

```tsx
className={cn(
  "…",
  selected
    ? "bg-brand/12 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--brand)_30%,transparent)]"
    : "hover:bg-accent",
)}
```

Alpha varies slightly by surface: `bg-brand/12` (pickers, table selection), `bg-brand/15` (nav),
`bg-brand/8` (informational notice); rim 28–30%.

> **This is the pattern for a selected project card or a selected task row.** Use it rather than a
> solid green fill — a solid `bg-primary` row would be unreadable at scale and is reserved for
> buttons and `Badge variant="default"`.

---

## 14. Sidebar & Navigation

Source: **`src/components/layout/app-shell.tsx`** + **`src/components/layout/nav-config.ts`**.

### 14.1 Geometry

| Property | Value |
| --- | --- |
| Sidebar width | **`16.5rem` (264px)** |
| Position | `fixed`, `inset-y-3 left-3` — **inset 12px from every viewport edge** |
| Radius | `rounded-2xl` (30px) — a floating slab, not a full-height column |
| z-index | `50` (drawer overlay is `40`, topbar `30`) |
| Content offset | `lg:pl-[17.5rem]` (280px = 264 + 12 left + 4 gap) |
| Surface | `glass-sidebar` — dark green in **both** themes |
| Logo row | `h-16` (64px), `px-4`, `justify-between` |
| Nav area | `flex-1 overflow-y-auto scrollbar-thin px-3 py-2 space-y-0.5` |
| Footer | `border-border/50 border-t px-4 py-3.5 text-xs` → `{appName} · v1.0` |
| Print | `no-print`, and `.app-shell-body { padding-left: 0 !important }` reclaims the gutter |

### 14.2 The logo lockup

```tsx
<Link href={nav[0]?.href ?? "/"} className="focus-visible:ring-ring/35 flex min-w-0 items-center gap-2 rounded-md font-semibold tracking-[-0.015em] outline-none focus-visible:ring-[3px]">
  <ZovenciaLogo variant="full" surface="dark" size="xs" priority className="-top-0.5" />
  <span className="truncate text-[0.9375rem]">{productSuffix(appName)}</span>
</Link>
```

Three non-obvious, documented decisions:
- **`surface="dark"`** because `--sidebar` is the same dark slab in the light palette; a theme-aware logo would go black-on-black.
- **`size="xs"`** (16px artwork) is the only size the full wordmark + suffix fits 264px at.
- **`-top-0.5`** (2px up) is a *measured* optical correction, applied at the call site, not in the component.

### 14.3 Nav item — the exact specification

```tsx
<Link
  href={item.href}
  aria-current={active ? "page" : undefined}
  className={cn(
    "group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium",
    "transition-[background-color,color,transform] duration-200 ease-standard active:scale-[0.98]",
    active
      ? "text-primary-ink bg-brand/15 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--brand)_28%,transparent)]"
      : "text-muted-foreground hover:bg-accent hover:text-foreground",
  )}
>
  {/* the rail */}
  <span
    className={cn(
      "bg-brand absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full",
      "shadow-[0_0_12px_0_color-mix(in_oklab,var(--brand)_70%,transparent)]",
      "origin-center transition-transform duration-300 ease-spring",
      active ? "scale-y-100" : "scale-y-0",
    )}
    aria-hidden
  />
  <item.icon className={cn("size-4 shrink-0 transition-colors duration-200",
    active ? "text-brand" : "text-muted-foreground group-hover:text-foreground")} aria-hidden />
  {item.label}
</Link>
```

**The active pill, precisely:**

| Aspect | Value |
| --- | --- |
| Background | `bg-brand/15` — brand green at 15% |
| Border | `inset 0 0 0 1px color-mix(in oklab, var(--brand) 28%, transparent)` |
| Text | `text-primary-ink` → resolves to **pure `--brand`** on the sidebar (re-scoped by `glass-sidebar`) |
| Icon | `text-brand`, `size-4` (16px) |
| Radius | `rounded-md` (14px) |
| Rail | 3px × 20px, `bg-brand`, `rounded-r-full`, glow `0 0 12px brand 70%`, flush left |
| Rail motion | `scaleY` 0 → 1 from `origin-center`, **300ms `ease-spring`** — "lets it grow out of the row rather than blink" |
| Padding | `px-3 py-2.5` (12 / 10px) |
| Gap | `gap-3` (12px) icon↔label |
| Press | `active:scale-[0.98]` |
| Hover (inactive) | `hover:bg-accent` (→ `--sidebar-accent`, white @8%) + `hover:text-foreground` |
| No gradient | the pill is a flat tint |

### 14.4 Group headings

```tsx
<p className={cn(
  "text-muted-foreground/80 px-3 pb-1.5 text-[0.6875rem] font-semibold tracking-[0.08em] uppercase",
  index === 0 ? "pt-1" : "pt-4",
)}>{heading}</p>
```

Printed **once**, when `item.group !== nav[index - 1]?.group`. The nav config stays a flat list, so
"the heading cannot drift out of step with its items."

### 14.5 Nav config contract

```ts
export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;   // false ⇒ /projects also highlights on /projects/123
  group?: string;    // "Manage" | "Personal"
};
```

Three lists: `EMPLOYEE_NAV` (flat, 6 items), `ADMIN_NAV` (`Manage` + `Personal`),
`SUPER_ADMIN_NAV` (= `ADMIN_NAV` with `Access` spliced in, split on *"not personal"* so a new
ungrouped item still reaches the super admin).

Active matching:

```ts
export function isActiveRoute(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
```

`visibleNav(nav, grants)` filters permission-hidden items via a `GRANTED_ITEMS` map.

> **Adding "Projects" to the sidebar:** append to `ADMIN_NAV` with `group: "Manage"` and **omit
> `exact`** so `/admin/projects/[id]` keeps the parent highlighted. Pick a Lucide icon. If it is
> permission-gated, follow the documented default: **keep the item visible and let the screen
> explain the grant** (as Reports / Send email / Working days do) unless reading *is* the privilege
> (as with Complaints), in which case add it to `GRANTED_ITEMS`.

### 14.6 Mobile drawer

- Below `lg`: `-translate-x-[calc(100%+1rem)]`; open: `translate-x-0`.
- Transition: `transition-transform duration-300 ease-standard`.
- Overlay: a `<button aria-label="Close navigation">` — `fixed inset-0 z-40 bg-black/25 backdrop-blur-md animate-in fade-in-0 duration-200 lg:hidden dark:bg-black/45`.
- A `ghost` `icon-sm` X button sits in the sidebar header (`lg:hidden`).
- Every nav `Link` calls `setDrawerOpen(false)` on click.

### 14.7 Collapsed (icon-only) state

**[Not defined].** There is no collapse/expand affordance, no width toggle, and no persisted
sidebar state. The only two states are desktop-fixed and mobile-drawer. **Do not invent one for
Projects.**

### 14.8 Submenus

**[Not defined] in the sidebar.** Hierarchy is expressed by flat groups with uppercase headings.
`DropdownMenuSub` exists in `dropdown-menu.tsx` but is unused. If Projects needs sub-navigation
(Overview / Tasks / Members), use **`Tabs`** inside the page — which is what `staff-manager.tsx`
does — not a nested sidebar tree.

---

## 15. Header / Topbar

Source: `src/components/layout/app-shell.tsx`.

```tsx
<div className="no-print sticky top-0 z-30 px-3 pt-3 sm:px-4 lg:pr-4">
  <header className="glass flex h-14 items-center gap-2 rounded-xl px-2 sm:px-3">
    <Button variant="ghost" size="icon" className="lg:hidden" onClick={…} aria-label="Open navigation">
      <Menu className="size-4" />
    </Button>
    <ZovenciaLogo size="sm" className="ml-0.5 lg:hidden" />
    <GlobalSearch isAdmin={isAdmin} />
    <div className="ml-auto flex items-center gap-1">
      <ThemeToggle />
      <UserMenu name={user.name} email={user.email} image={user.image} isAdmin={isAdmin} />
    </div>
  </header>
</div>
```

| Property | Value |
| --- | --- |
| Height | **`h-14` (56px)** |
| Surface | `glass` (20px blur) — **not** `glass-strong` |
| Radius | `rounded-xl` (24px) — a floating bar, not a full-bleed strip |
| Sticky | on the **wrapper**, `top-0 z-30`, with `px-3 pt-3 sm:px-4 lg:pr-4` so the gap stays while scrolling |
| Inner padding | `px-2 sm:px-3` |
| Gap | `gap-2`; right cluster `gap-1` |
| Print | `no-print` |

**Contents, left → right:** hamburger (`lg:hidden`) · compact `ZovenciaLogo size="sm"`
(`lg:hidden` — because below `lg` the sidebar is off-canvas and nothing else is branded) ·
`GlobalSearch` (`w-full max-w-md`) · `ml-auto` → `ThemeToggle` · `UserMenu`.

`UserMenu` trigger: `<Button variant="ghost" className="h-9 gap-2 px-1.5">` containing
`<Avatar className="size-7">` and a `hidden max-w-28 truncate text-sm font-medium sm:inline` name.

**No notification bell exists.** **[Not defined]** — if Projects needs one, it belongs in the
`ml-auto` cluster as a `ghost` `icon` button, before `ThemeToggle`, and its panel should be a
`Popover` (`glass-strong`, `rounded-xl`, `p-4`).

---

## 16. Tables

Source: **`src/components/ui/table.tsx`**. This section matters most for Projects.

### 16.1 The primitives

| Part | Classes | Notes |
| --- | --- | --- |
| `Table` | wrapper `div.scrollbar-thin.relative.w-full.overflow-x-auto`; table `w-full caption-bottom border-separate border-spacing-0 text-sm` | **`border-separate`** is required for the sticky header to keep its own rims |
| `TableHeader` | `glass-subtle sticky top-0 z-10 [&_tr]:border-0` | **Sticky by default** |
| `TableHead` | `text-muted-foreground h-11 px-4 text-left align-middle text-[0.6875rem] font-semibold tracking-[0.06em] uppercase whitespace-nowrap` | **44px, 11px uppercase** |
| `TableRow` | `group/row transition-colors duration-150 ease-standard hover:bg-accent/60 data-[state=selected]:bg-brand/12` | Hover is the mint accent; selection is brand green |
| `TableCell` | `border-border/60 border-b p-4 align-middle group-last/row:border-0` | **The divider lives on the cell**, not the row |
| `TableFooter` | `glass-subtle font-medium [&>tr:last-child>td]:border-0` | |
| `TableCaption` | `text-muted-foreground mt-4 text-sm` | |

### 16.2 Measurements

| Aspect | Value |
| --- | --- |
| Header height | 44px (`h-11`) |
| Header background | `glass-subtle` (white @42% / #1E2A20 @34%, 12px blur) |
| Header type | 11px, 600, `tracking-[0.06em]`, UPPERCASE, `--muted-foreground` |
| Row height | content-driven; cell `p-4` ⇒ **~52px** for single-line text, ~64px for an avatar row (`size-8` avatar + `gap-2.5`) |
| Cell padding | 16px all round |
| Divider | `border-b` on `<td>`, `--border` @60%, removed on the last row |
| Row hover | `bg-accent/60`, 150ms `ease-standard` |
| Row selected | `data-[state=selected]:bg-brand/12` |
| Horizontal overflow | wrapper scrolls with `scrollbar-thin` |
| Print | `thead { display: table-header-group }`, `tr { break-inside: avoid }` |

### 16.3 Sorting — `SortButton`

`src/components/ui/sort-button.tsx`. Lives **inside** `TableHead` (which supplies the uppercase
type; the button restates it so it matches).

```tsx
<TableHead>
  <SortButton label="Due date" active={filters.sortBy === "dueDate"} direction={filters.sortDir}
              onClick={() => toggleSort("dueDate")} />
</TableHead>
```

Icon logic: inactive → `ChevronsUpDown` at `opacity-40`; active → `ArrowUp`/`ArrowDown` at
`opacity-100 text-primary-ink`. Active label goes `text-foreground`. `aria-label` is written for
you. Negative margins (`-mx-1.5`) keep the button flush with the column edge.

### 16.4 Pagination — `PaginationControls`

`src/components/ui/pagination-controls.tsx`.

```tsx
<PaginationControls pagination={data.pagination} onPageChange={(page) => update({ page })} label="projects" />
```

- Returns `null` when `total === 0`.
- Bar: `border-border/60 flex flex-col items-center justify-between gap-3 border-t px-6 py-4 sm:flex-row`.
- Left: `Showing 1–10 of 42 projects` with each number `text-foreground font-medium tabular-nums`.
- Right: two `variant="outline" size="sm"` buttons with `ChevronLeft`/`ChevronRight`, and `{page} / {totalPages}` between them in `text-muted-foreground tabular-nums`.
- `Pagination` type: `{ page, pageSize, total, totalPages }` from `src/types/index.ts`.

### 16.5 The complete table screen recipe

This is the pattern the Projects list, task list and member list should follow. Condensed from
`src/components/leaves/leave-table.tsx`:

```tsx
<Card className="py-0">
  <CardContent className="space-y-4 p-4 sm:p-6">

    {/* 1. Filter bar */}
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="relative flex-1">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input value={filters.search} onChange={…} placeholder="Search projects, owners…" className="pl-9" aria-label="Search projects" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select …><SelectTrigger className="w-36" aria-label="Filter by status"><SelectValue /></SelectTrigger>…</Select>
        {hasActiveFilters && <Button variant="ghost" size="sm" onClick={reset}><SlidersHorizontal className="size-4" />Clear</Button>}
        <Button variant="outline" size="sm" asChild><a href={exportUrl} download><Download className="size-4" />Export CSV</a></Button>
      </div>
    </div>

    {/* 2. Loading */}
    {loading && <TableSkeleton />}

    {/* 3. Error */}
    {!loading && error && <EmptyState icon={FolderKanban} title="Couldn't load projects" description={error} />}

    {/* 4. Empty — two different messages */}
    {!loading && !error && rows.length === 0 && (
      <EmptyState
        icon={FolderKanban}
        title={hasActiveFilters ? "No matching projects" : "No projects yet"}
        description={hasActiveFilters
          ? "Try adjusting your search or filters to widen the results."
          : "Projects will appear here once they are created."}
        action={hasActiveFilters ? <Button variant="outline" size="sm" onClick={reset}>Clear filters</Button> : undefined}
      />
    )}

    {/* 5. Data + pagination, bled to the card edge */}
    {!loading && !error && rows.length > 0 && (
      <div className="-mx-4 sm:-mx-6">
        <Table>
          <TableHeader><TableRow>
            <TableHead className="pl-4 sm:pl-6"><SortButton … /></TableHead>
            …
            <TableHead className="pr-4 text-right sm:pr-6">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>{rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="pl-4 font-medium whitespace-nowrap sm:pl-6">…</TableCell>
              …
              <TableCell className="pr-4 text-right sm:pr-6">{renderActions(row)}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
        <PaginationControls pagination={data.pagination} onPageChange={(page) => update({ page })} label="projects" />
      </div>
    )}
  </CardContent>
</Card>
```

**Cell conventions [Confirmed across `leave-table.tsx` and `employee-manager.tsx`]:**

| Cell kind | Classes |
| --- | --- |
| Primary identifier | `font-medium whitespace-nowrap` |
| Person cell | `flex items-center gap-2.5` → `<Avatar className="size-8">` + stacked `text-sm font-medium` name / `text-muted-foreground text-xs` subtitle, both `truncate`, inside `min-w-0` |
| Long free text | `max-w-64` on the cell, `line-clamp-2 text-sm` on the span |
| Status | `<StatusBadge status={…} />` — no wrapper |
| Relative time / meta | `text-muted-foreground text-sm whitespace-nowrap` |
| Row actions | `text-right`, a `ghost` `icon-sm` `MoreHorizontal` trigger opening a `DropdownMenu` |

### 16.6 Row-action menu

From `employee-manager.tsx`:

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon-sm" aria-label="Actions"><MoreHorizontal className="size-4" /></Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem asChild><Link href={…}><Eye className="size-4" />View</Link></DropdownMenuItem>
    <DropdownMenuItem onSelect={…}><Pencil className="size-4" />Edit</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem variant="destructive" onSelect={…}><Trash2 className="size-4" />Delete</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

> **Destructive items use `variant="destructive"`**, which yields `text-destructive-ink` and
> `focus:bg-destructive/12`. A confirmation must be a **controlled** `ConfirmDialog` — an
> uncontrolled trigger inside a menu is unmounted on select and the dialog goes with it (documented
> in `confirm-dialog.tsx`).

### 16.7 Table state hook

`src/hooks/use-employee-table.ts` and `use-leave-table.ts` are the template. Copy the shape:

```ts
export function useProjectTable(pageSize = 10) {
  const [filters, setFilters] = useState<ProjectFilters>(INITIAL);
  const debouncedSearch = useDebouncedValue(filters.search.trim(), 350);
  const path = useMemo(() => `/api/admin/projects${toQueryString({ … })}`, [ … ]);
  const resource = useApiResource<PaginatedProjects>(path);

  const update = useCallback((patch: Partial<ProjectFilters>) =>
    setFilters((c) => ({ ...c, ...patch, page: "page" in patch ? (patch.page ?? 1) : 1 })), []);
  const toggleSort = useCallback((column) => setFilters((c) => ({
    ...c, sortBy: column,
    sortDir: c.sortBy === column && c.sortDir === "desc" ? "asc" : "desc", page: 1 })), []);
  const reset = useCallback(() => setFilters(INITIAL), []);
  const hasActiveFilters = /* any filter !== its initial */;

  return { filters, update, toggleSort, reset, hasActiveFilters, ...resource };
}
```

Conventions to preserve: **search debounce 350ms** (300ms for global search), `"ALL"` as the
"no filter" sentinel, `sortDir` defaults `"desc"`, **any filter change resets to page 1**.

---

## 17. Badges & Status Indicators

Source: **`src/components/ui/badge.tsx`**.

### 17.1 Base

```
inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-full px-2.5 py-0.5
text-xs font-medium whitespace-nowrap
transition-colors duration-200 ease-standard
[&>svg]:size-3
```

Pill, 12px text, weight 500, **12px icons** (smaller than the 16px used elsewhere), `gap-1`.

### 17.2 Variants — exact values

| Variant | Background | Text | Rim |
| --- | --- | --- | --- |
| `default` | `bg-primary` (solid #0AEA0A) | `text-primary-foreground` (#023506) | `inset 0 1px 0 0 oklch(1 0 0/20%)` |
| `secondary` | `bg-secondary/80` | `text-secondary-foreground` | `inset 0 0 0 1px var(--glass-hairline)` |
| `success` | `bg-success/12` | `text-success-ink` | `inset 0 0 0 1px color-mix(in oklab, var(--success) 28%, transparent)` |
| `warning` | `bg-warning/15` | `text-warning-ink` | `… var(--warning) 32% …` |
| `destructive` | `bg-destructive/12` | `text-destructive-ink` | `… var(--destructive) 28% …` |
| `outline` | none | `text-foreground` | `inset 0 0 0 1px var(--border)` |

> **The design intent, quoted:** *"Status badges use a tinted wash plus a same-hue rim rather than a
> solid fill, so a row of them reads as quiet metadata instead of competing for attention."*
> `default` is the loud one — reserve it (it is used for the sidebar "Administrator" chip, not for
> row status).

### 17.3 The status-badge component pattern

Three exist, all built the same way. **Build a `ProjectStatusBadge` exactly like this:**

```tsx
// src/components/projects/project-status-badge.tsx
import { Archive, CheckCircle2, CircleDashed, PauseCircle, PlayCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ProjectStatusView } from "@/types";

const CONFIG = {
  DRAFT:     { label: "Draft",     variant: "outline",     Icon: CircleDashed },
  ACTIVE:    { label: "Active",    variant: "success",     Icon: PlayCircle },
  ON_HOLD:   { label: "On hold",   variant: "warning",     Icon: PauseCircle },
  COMPLETED: { label: "Completed", variant: "success",     Icon: CheckCircle2 },
  ARCHIVED:  { label: "Archived",  variant: "secondary",   Icon: Archive },
  CANCELLED: { label: "Cancelled", variant: "destructive", Icon: XCircle },
} as const satisfies Record<ProjectStatusView, unknown>;

export function ProjectStatusBadge({ status }: { status: ProjectStatusView }) {
  const { label, variant, Icon } = CONFIG[status];
  return <Badge variant={variant}><Icon aria-hidden />{label}</Badge>;
}
```

Four properties of the existing three that you must keep:
1. **One map, one file** — "that is how the same complaint comes to read 'Under review' on one screen and 'In progress' on the other."
2. **`as const satisfies Record<Status, unknown>`** — makes an unhandled status a compile error.
3. **The icon takes no size class** — `[&>svg]:size-3` in the badge handles it. Pass only `aria-hidden`.
4. **Labels are sentence case** — "On leave", "Non-working day", "Under review" — never SCREAMING_CASE and never Title Case.

### 17.4 Colour-choice guidance carried over

- Neutral / "nothing has happened" states → **`secondary`** or **`outline`**, never `destructive`.
- Only genuinely bad outcomes get `destructive`.
- `warning` means "in progress / needs attention", not "error".
- Never put brand green *text* on a light surface — the tinted variants already use `-ink`.

---

## 18. Modals & Drawers

### 18.1 `Dialog` — `src/components/ui/dialog.tsx`

**Overlay**

```
motion-pop fixed inset-0 z-50 bg-black/25 backdrop-blur-md
data-[state=open]:animate-in data-[state=closed]:animate-out
data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
dark:bg-black/45
```

Light **25%** black, dark **45%**, both with `backdrop-blur-md` (12px).

**Content**

```
glass-strong motion-pop scrollbar-thin
fixed top-1/2 left-1/2 z-50 grid
max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg
-translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-2xl p-6
data-[state=open]:animate-in data-[state=closed]:animate-out
data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95
```

| Property | Value |
| --- | --- |
| Width | `calc(100% - 2rem)`, capped at `max-w-lg` (**512px**) |
| Max height | `calc(100dvh - 2rem)`, scrolls internally with `scrollbar-thin` |
| Surface | `glass-strong` (78% fill, 28px blur) |
| Radius | `rounded-2xl` (**30px**) |
| Padding | `p-6`, `gap-4` between slots |
| Shadow | `glass-strong`'s stack (`0 20px 48px -16px` + `0 48px 96px -40px` strong) |
| **Open animation** | fade-in + `zoom-in-95`, **220ms `cubic-bezier(0.34, 1.4, 0.64, 1)`** (spring, via `motion-pop`) |
| **Close animation** | fade-out + `zoom-out-95`, **150ms `cubic-bezier(0.4, 0, 0.6, 1)`** (flat) |

**Close button** — top-right, `absolute top-4 right-4 size-8 rounded-sm`,
`text-muted-foreground hover:text-foreground hover:bg-accent/70`, `active:scale-90`, 3px focus ring,
`<X className="size-4" />` + `<span className="sr-only">Close</span>`. Suppress with
`showCloseButton={false}`.

**Slots**

| Slot | Classes |
| --- | --- |
| `DialogHeader` | `flex flex-col gap-2 pr-8 text-center sm:text-left` — `pr-8` clears the close button |
| `DialogTitle` | `text-lg leading-tight font-semibold tracking-[-0.018em]` |
| `DialogDescription` | `text-muted-foreground text-sm leading-relaxed` |
| `DialogFooter` | `flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end` |

> **`flex-col-reverse` on mobile is deliberate** — the primary action ends up *on top* on a phone
> and *on the right* on desktop. Order children `[Cancel, Confirm]` in JSX and it resolves correctly
> both ways.

Common size overrides seen in the codebase: `className="max-w-md"`, `"max-w-2xl"`, `"max-w-3xl"`.

### 18.2 `AlertDialog` — `src/components/ui/alert-dialog.tsx`

Identical surface and animation, minus: internal scrolling, `max-h`, and the close button. Actions
are `AlertDialogAction` (styled with `buttonVariants()` → the `default` green button) and
`AlertDialogCancel`.

### 18.3 `ConfirmDialog` — `src/components/shared/confirm-dialog.tsx`

**Use this for every destructive confirmation in Projects.** Do not hand-roll one.

```tsx
<ConfirmDialog
  title="Delete this project?"
  description="This removes the project and every task on it. This cannot be undone."
  confirmLabel="Delete project"
  destructive
  onConfirm={async () => { await apiClient.delete(`/api/admin/projects/${id}`); await refresh(); }}
  trigger={<Button variant="destructive" size="sm">Delete</Button>}
/>
```

| Prop | Default | Notes |
| --- | --- | --- |
| `title`, `description` | — | required |
| `confirmLabel` / `cancelLabel` | `"Confirm"` / `"Cancel"` | |
| `destructive` | `false` | applies `buttonVariants({ variant: "destructive" })` to the action |
| `onConfirm` | — | `Promise<void> \| void`; **the dialog stays open while it runs** and shows `"Working…"` |
| `trigger` | — | uncontrolled usage |
| `open` / `onOpenChange` | — | **controlled usage — required when opening from a `DropdownMenu`** |

### 18.4 Drawers / Sheets

**[Not defined].** There is no `Sheet`/`Drawer` component and `vaul` is not installed. The only
drawer in the product is the **mobile navigation** (§14.6), implemented by hand.

> **For Projects:** use `Dialog` for a create/edit form and a full page for detail. If you need an
> edge panel, model it on the mobile drawer — fixed, inset, `glass-strong`, `rounded-2xl`,
> `transition-transform duration-300 ease-standard`, overlay `bg-black/25 backdrop-blur-md
> dark:bg-black/45` — rather than installing a new library.

### 18.5 Dialog-with-form pattern

From `employee-edit-dialog.tsx` / `job-role-dialog.tsx`: controlled `open`/`onOpenChange`, a
react-hook-form `<Form>` inside `DialogContent`, an `onSaved` callback the parent uses to `refresh()`,
`toast.success(...)` on success, and `toast.error(...)` on `ApiClientError`.

---

## 19. Dropdowns & Popovers

### 19.1 Shared menu surface

`DropdownMenuContent`, `DropdownMenuSubContent` and `SelectContent` share:

```
glass-strong motion-pop text-popover-foreground z-50 min-w-32 overflow-hidden rounded-lg p-1.5
origin-(--radix-dropdown-menu-content-transform-origin)     /* or -select- */
data-[state=open]:animate-in data-[state=closed]:animate-out
data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95
```

| Property | Value |
| --- | --- |
| Surface | `glass-strong` — 78% fill, **28px blur**, saturate 180% |
| Radius | `rounded-lg` (**18px**) |
| Padding | `p-1.5` (6px) |
| Min width | `min-w-32` (128px); `Select` also honours `min-w-[var(--radix-select-trigger-width)]` |
| `sideOffset` | **8px** (dropdown, popover, tooltip all default to 8) |
| Shadow | `glass-strong` stack |
| Animation | zoom 95→100 + fade, **from the Radix transform origin**, 220ms spring in / 150ms flat out |
| z-index | 50 |

### 19.2 Menu item

```
relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none
transition-colors duration-150 ease-standard
focus:bg-accent focus:text-accent-foreground
data-[disabled]:pointer-events-none data-[disabled]:opacity-45
[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4
```

| Aspect | Value |
| --- | --- |
| Height | ~32px (`py-1.5` + 14px text) |
| Radius | `rounded-sm` (10px) |
| Hover/keyboard | `focus:bg-accent` — **Radix uses `:focus`, not `:hover`**, so pointer and keyboard highlight identically |
| Disabled | `opacity-45` |
| Icon | auto-sized 16px, `gap-2` |
| Destructive | `data-[variant=destructive]:text-destructive-ink` + `focus:bg-destructive/12` |
| Inset | `data-[inset]:pl-8` |

Other parts: `DropdownMenuLabel` `px-2 py-1.5 text-sm font-medium`; `DropdownMenuSeparator`
`bg-border/70 -mx-1.5 my-1.5 h-px`; `DropdownMenuShortcut` `text-muted-foreground ml-auto text-xs
tracking-widest`.

### 19.3 `Select` specifics

- Item: `py-1.5 pr-8 pl-2`, check indicator at `right-2` as `<Check className="text-primary-ink size-4" />`.
- `SelectLabel`: `text-muted-foreground px-2 py-1.5 text-xs font-medium`.
- `SelectSeparator`: `bg-border/70 -mx-1 my-1 h-px`.
- Viewport `p-1.5`; popper side offsets translate 2 units away from the trigger.
- `max-h-(--radix-select-content-available-height)` with `scrollbar-thin`.

### 19.4 `Popover`

```
glass-strong motion-pop text-popover-foreground z-50 w-72 rounded-xl p-4 outline-hidden
```

Note the differences from a menu: **`w-72` (288px)**, **`rounded-xl` (24px)**, **`p-4`**.
Defaults `align="center"`, `sideOffset={8}`.

### 19.5 `Tooltip`

```
motion-pop bg-foreground/92 text-background z-50 w-fit rounded-sm px-2.5 py-1.5
text-xs font-medium text-balance backdrop-blur-sm
shadow-[0_4px_12px_-4px_var(--glass-shadow-strong)]
```

**The only surface in the app that is not glass** — an inverted solid chip. `TooltipProvider` is
mounted once in `src/app/layout.tsx` with **`delayDuration={200}`**. It animates in only
(`data-[state=delayed-open]`), with no zoom on exit.

### 19.6 Hand-built popover panel (global search)

When you need a panel anchored to an input rather than to a Radix trigger, copy `global-search.tsx`:

```tsx
<div className="glass-strong scrollbar-thin animate-in fade-in-0 zoom-in-95 slide-in-from-top-1
                absolute top-full z-50 mt-2 max-h-96 w-full overflow-y-auto rounded-xl p-1.5
                duration-200 ease-standard">
```

It handles outside-click and Escape by hand via `document` listeners.

---

## 20. Iconography

### 20.1 The library

**`lucide-react` ^1.28.0, used in 69 files. It is the only icon set.** Registered in
`components.json` as `"iconLibrary": "lucide"`. **[Not defined]:** there are no custom SVG icon
components anywhere in `src/components/`.

### 20.2 Sizes

| Context | Class | px |
| --- | --- | --- |
| **Default everywhere** | `size-4` | **16** |
| Badge icon | `[&>svg]:size-3` (automatic) | **12** |
| Sort-button arrow | `size-3` | 12 |
| Stat-card icon | `size-5` | 20 |
| Empty-state / error / not-found disc icon | `size-6` | 24 |
| Landing role-card icon | `size-7` | 28 |
| Nav icon | `size-4` | 16 |
| Table row-action icon | `size-4` | 16 |

Buttons, menu items and select triggers all auto-size a bare SVG to 16px via
`[&_svg:not([class*='size-'])]:size-4`. **So inside those, write `<Icon />` with no size class.**

### 20.3 Stroke width

**[Confirmed] Lucide's default (`2`) everywhere.** A search finds no `strokeWidth` or
`absoluteStrokeWidth` prop anywhere in `src/`. Do not change it.

### 20.4 Colour

| State | Class |
| --- | --- |
| Default / decorative | inherits (`currentColor`) |
| Muted / inactive | `text-muted-foreground` |
| Branded / accent | **`text-primary-ink`** — never `text-primary` |
| Active nav | `text-brand` (legal: on the dark sidebar) |
| Inside a tinted disc | tone ink — `text-success-ink`, `text-warning-ink`, `text-destructive-ink` |
| Inside a solid button | inherits the button's foreground |

### 20.5 The tinted icon disc/tile — a recurring motif

| Shape | Classes | Where |
| --- | --- | --- |
| Disc, 48px | `bg-primary/10 text-primary-ink flex size-12 items-center justify-center rounded-full` | `EmptyState` |
| Disc, 48px, destructive | `bg-destructive/12 text-destructive-ink … size-12 … rounded-full` | `error.tsx` |
| Disc, 56px | `bg-primary/12 text-primary-ink … size-14 … rounded-full` | landing role cards |
| Rounded tile, 44px | `bg-primary/12 text-primary-ink flex size-11 items-center justify-center rounded-xl` | auth page headers |
| Rounded tile, 40px | tone-driven `bg-*/12 text-*-ink … size-10 … rounded-md` | `StatCard` |
| Small tile, 32px | `bg-primary/10 text-primary-ink flex size-8 … rounded-sm` | global-search result rows |

Formula: **`bg-{tone}/10–15` + `text-{tone}-ink` + a square `size-*` + `rounded-full` or a radius token.**

### 20.6 Accessibility

Decorative icons carry `aria-hidden`. Icon-only buttons carry `aria-label` (`"Open navigation"`,
`"Account menu"`, `"Toggle theme"`, `"Previous page"`, `"Actions"`). Follow both.

### 20.7 Icons already spoken for

`LayoutDashboard` dashboard · `Users` staff · `Shield`/`ShieldCheck` admin/access · `MapPin`
attendance · `CalendarDays` leave · `CalendarOff` closures/working days · `Sparkles` AI request ·
`FileBarChart` reports · `BotMessageSquare` assistant · `Mail` email · `MessageSquareWarning`
complaints · `User` profile · `Search` search · `Download` export · `SlidersHorizontal` clear
filters · `MoreHorizontal` row actions · `Eye` view · `Pencil` edit · `Trash2` delete · `Ban`/
`CircleCheck` suspend/activate · `Lock`/`LockOpen` profile lock · `CheckCircle2`/`XCircle`/`Clock`
statuses · `Loader2` spinner · `Menu`/`X` drawer · `Sun`/`Moon`/`Monitor` theme.

> **For Projects, unclaimed and semantically apt:** `FolderKanban`, `KanbanSquare`, `Briefcase`,
> `ListChecks`, `Milestone`, `Target`, `Flag`, `GitBranch`, `Timer`, `UserPlus`.

---

## 21. Animation & Motion

**All motion is CSS.** No Framer Motion, no GSAP, no JS animation loop.

### 21.1 The primitives

**Durations** (`:root` in `globals.css`):

```css
--duration-fast: 150ms;   /* exits, colour-only transitions */
--duration-base: 220ms;   /* the default */
--duration-slow: 300ms;   /* travel — drawer, rail, switch thumb */
```

**Easing** (a non-inline `@theme` so Tailwind emits `ease-*` utilities):

```css
--ease-standard: cubic-bezier(0.32, 0.72, 0, 1);   /* decelerating, no overshoot */
--ease-spring:   cubic-bezier(0.34, 1.4, 0.64, 1); /* overshoots on entry */
--ease-exit:     cubic-bezier(0.4, 0, 0.6, 1);     /* flat */
```

Measured usage: `ease-standard` **31**, `ease-spring` **8**, `ease-exit` **0** as a class (it is
applied through `motion-pop`). Durations: `duration-200` 19 · `duration-300` 12 · `duration-500` 6 ·
`duration-150` 6 · `duration-100` 1.

> **Note the near-miss:** components mostly write `duration-200` (Tailwind's 200ms) rather than
> `--duration-base` (220ms). A 20ms difference nobody can see, but it means the `--duration-*`
> tokens are effectively used only *inside* the `@utility` blocks. **Match the surrounding code:
> write `duration-200 ease-standard` in components.**

### 21.2 The motion utilities

**`hover-lift`** — card lift; the rim warms toward brand green.

```css
@utility hover-lift {
  transition: transform var(--duration-base) var(--ease-standard),
              box-shadow var(--duration-base) var(--ease-standard);
  &:hover {
    transform: translateY(-2px);
    box-shadow:
      inset 0 1px 0 0 var(--glass-highlight),
      inset 0 0 0 1px color-mix(in oklab, var(--brand) 22%, var(--glass-hairline)),
      0  2px  4px  -2px var(--glass-shadow),
      0 16px 36px -12px var(--glass-shadow-strong),
      0 36px 72px -32px var(--glass-shadow-strong),
      0 20px 48px -28px color-mix(in oklab, var(--brand) 38%, transparent);  /* brand halo */
  }
}
```

Trigger hover · **−2px translateY** · 220ms · `ease-standard` · adds a brand halo. Applied only via
`<Card interactive>`. Neutralised under `prefers-reduced-motion`.

**`press`** — `&:active { transform: scale(0.97) }`, 150ms.
**[Confirmed] declared but never used as a class** (buttons inline `active:scale-[0.97]` instead).

**`motion-pop`** — retimes the tw-animate-css keyframes against Radix state:

```css
@utility motion-pop {
  &[data-state="open"], &[data-state="delayed-open"] {
    animation-duration: var(--duration-base);        /* 220ms */
    animation-timing-function: var(--ease-spring);
  }
  &[data-state="closed"] {
    animation-duration: var(--duration-fast);        /* 150ms */
    animation-timing-function: var(--ease-exit);
  }
}
```

*"Entry overshoots on a spring; exit is faster and flat, because a dismissal that bounces reads as
indecisive."* Applied to every Radix surface: dialog, alert-dialog, dropdown, sub-menu, select,
popover, tooltip (9 sites). **Any new Radix surface must carry `motion-pop`.**

**`shimmer`** — the skeleton sweep:

```css
@keyframes glass-shimmer { from { background-position: 200% 0 } to { background-position: -200% 0 } }

@utility shimmer {
  background-image: linear-gradient(90deg, transparent 0%,
    color-mix(in oklab, var(--foreground) 6%, transparent) 50%, transparent 100%);
  background-size: 200% 100%;
  animation: glass-shimmer 1.8s var(--ease-standard) infinite;
}
```

**1.8s, infinite, travelling left.** *"Reads as light moving across glass, where a pulse just reads
as a box blinking."*

### 21.3 Enter animations (tw-animate-css)

| Where | Classes | Duration |
| --- | --- | --- |
| Auth page content | `animate-in fade-in-0 slide-in-from-bottom-2 duration-500 ease-standard` | 500ms |
| Landing hero | `animate-in fade-in-0 slide-in-from-bottom-2 duration-500 ease-standard` | 500ms |
| Error / not-found card | `animate-in fade-in-0 zoom-in-95 duration-500 ease-standard` | 500ms |
| Search results panel | `animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-200 ease-standard` | 200ms |
| Mobile drawer overlay | `animate-in fade-in-0 duration-200` | 200ms |
| Tab content | `data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-300` | 300ms |
| Radix surfaces | `zoom-in-95` + `fade-in-0` via `motion-pop` | 220 / 150ms |

**No page-transition system exists.** **[Not defined]** — Next.js route changes are not animated.
Do not add one.

### 21.4 Micro-interactions

| Interaction | Implementation |
| --- | --- |
| Button press | `active:scale-[0.97] active:duration-100` |
| Nav item press | `active:scale-[0.98]` |
| Tab press | `active:scale-[0.98]` |
| Dialog close press | `active:scale-90` |
| Search result press | `active:scale-[0.99]` |
| Link button | `active:scale-100` — press **cancelled** |
| Landing card icon | `group-hover:scale-105 group-hover:bg-primary/20`, 300ms `ease-spring` |
| Active-nav rail | `scaleY` 0→1, `origin-center`, 300ms `ease-spring` |
| Switch thumb | `translate-x-5`, 300ms `ease-spring` |
| Select chevron | `transition-transform duration-200 ease-standard` |
| Progress fill | `translateX(-{100-value}%)`, **500ms** `ease-standard` |
| Theme toggle | Sun/Moon cross-fade — `scale-100 rotate-0` ⇄ `dark:scale-0 dark:-rotate-90` / `scale-0 rotate-90` ⇄ `dark:scale-100 dark:rotate-0`, `transition-all` |
| Auth header logo | `hover:opacity-75`, 200ms `ease-standard` |

### 21.5 Transition property lists — always explicit

Components transition **named properties**, never `all` (except the theme toggle's icons):

- Button: `transition-[background-color,box-shadow,transform,color,opacity]`
- Input / Textarea / Select: `transition-[box-shadow,background-color]`
- Nav item: `transition-[background-color,color,transform]`
- Tabs trigger: `transition-[background-color,color,box-shadow,transform]`
- Table row / menu item: `transition-colors`
- Switch: `transition-[background-color,box-shadow]`
- Sidebar: `transition-transform`

**Copy this discipline** — a bare `transition-all` on a glass element animates `backdrop-filter` and
is visibly expensive.

### 21.6 Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  .hover-lift:hover { transform: none; }
}
```

Global — anything you build inherits it. **[Note]** a hand-written `hover:-translate-y-1` would
*not* be neutralised (only its duration is), which is a further reason to use `hover-lift`.

---

## 22. Interaction States

A complete state guide, assembled from every primitive.

### 22.1 Focus — one system, three shapes

| Shape | Implementation | Used by |
| --- | --- | --- |
| **Global keyboard fallback** | `:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px }` in `@layer base` | anything without its own ring |
| **Ring** (3px halo) | `outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35` | `Button`, `Tabs`, `Switch`, dialog close, `SortButton`, logo links, landing cards |
| **Well replacement** (form controls) | `focus-visible:bg-card/80` + `focus-visible:shadow-[inset_0_0_0_1px_var(--ring), 0_0_0_1px_var(--ring-edge), 0_0_0_4px_color-mix(in_oklab,var(--ring)_30%,transparent)]` | `Input` (the 3-layer version) |
| | `focus-visible:shadow-[inset_0_0_0_1px_var(--ring), 0_0_0_3px_color-mix(in_oklab,var(--ring)_28%,transparent)]` | `Textarea`, `SelectTrigger` (2-layer) |

`--ring` is **always** the exact brand green. Destructive/success buttons override only the *tint*
(`focus-visible:ring-destructive/35`, `ring-success/35`), never the ring geometry.

> Radix menus use `outline-hidden` and express focus as a **background** (`focus:bg-accent`)
> instead, so pointer and keyboard highlight look identical.

### 22.2 Hover

| Element | Hover |
| --- | --- |
| Table row | `hover:bg-accent/60` (150ms) |
| Menu / select item | `focus:bg-accent focus:text-accent-foreground` (150ms) |
| Nav item (inactive) | `hover:bg-accent hover:text-foreground`; icon → `group-hover:text-foreground` |
| Ghost button | `hover:bg-accent/70 hover:text-accent-foreground` |
| Outline button | `hover:bg-accent/60 hover:text-accent-foreground` |
| Glass button | `hover:bg-accent/45` |
| Secondary button | `hover:bg-secondary/70` |
| Primary / success button | **background unchanged**; the brand glow goes 60% → 78% and the sheen 38% → 45% |
| Destructive button | `hover:bg-destructive/92` + glow 55% → 65% |
| Input / textarea / select | `hover:bg-card/70` |
| Card (`interactive`) | `hover-lift` — −2px + brand halo |
| Search result row | `hover:bg-accent/70` |
| Activity list row | `hover:bg-accent/40` |
| Link button | `hover:underline` |
| Auth logo | `hover:opacity-75` |
| Landing card icon | `group-hover:scale-105 group-hover:bg-primary/20` |
| Scrollbar thumb | 30% → 50% `--muted-foreground` |

> **Everything resolves to `--accent`.** The alpha ladder is 40 / 45 / 60 / 70 / 100 — pick by how
> dense the surface already is. **Never name a colour for a hover; use `bg-accent/N`.**

### 22.3 Active / pressed

`active:scale-[0.97]` (buttons, 100ms) · `active:scale-[0.98]` (nav, tabs) ·
`active:scale-[0.99]` (search rows) · `active:scale-90` (dialog close) ·
`active:scale-100` (link buttons — deliberately none).

### 22.4 Selected

| Element | Selected |
| --- | --- |
| Nav item | `bg-brand/15` + brand rim 28% + `text-primary-ink` + rail |
| Table row | `data-[state=selected]:bg-brand/12` |
| Picker row | `bg-brand/12` + brand rim 30% |
| Tab | `data-[state=active]:bg-card data-[state=active]:text-primary-ink` + brand rim 30% + brand glow 35% |
| Select item | `<Check className="text-primary-ink size-4" />` at `right-2` |
| Theme-toggle item | `className={theme === value ? "bg-accent" : undefined}` |

### 22.5 Disabled

| Element | Disabled |
| --- | --- |
| Button | `disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none` |
| Input | `disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50` |
| Textarea / Select | `disabled:cursor-not-allowed disabled:opacity-50` |
| Switch | `disabled:cursor-not-allowed disabled:opacity-45` |
| Menu item | `data-[disabled]:pointer-events-none data-[disabled]:opacity-45` |
| Tabs trigger | `disabled:pointer-events-none disabled:opacity-45` |
| Label (peer) | `peer-disabled:cursor-not-allowed peer-disabled:opacity-50` |

> **Two alphas, and the split is consistent:** interactive chrome (buttons, menus, switches, tabs)
> is **45%**; form fields are **50%**. Only the button also drops its shadow, so a disabled primary
> stops glowing.

### 22.6 Loading

| Scope | Pattern |
| --- | --- |
| Button | `loading` prop → disabled + `aria-busy` + `<Loader2 className="size-4 animate-spin" />` |
| Whole panel | `Skeleton` composition (see §27) |
| Inline field | `<Loader2 className="… absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" />` |
| Dialog action | `ConfirmDialog` keeps the dialog open and swaps the label to `"Working…"` |
| Data fetch | `useApiResource` returns `{ data, error, loading, refresh }`; screens branch `loading → error → empty → data` |

### 22.7 Error

| Scope | Pattern |
| --- | --- |
| Field | `aria-invalid` (set automatically by `FormControl`) → destructive inset ring; `FormMessage` in `text-destructive-ink text-xs font-medium`; `FormLabel` in `data-[error=true]:text-destructive-ink` |
| Panel / list | `<EmptyState icon={XCircle} title="Couldn't load …" description={error} />` |
| Transient action | `toast.error(err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.")` |
| Whole route | `src/app/error.tsx` — logo + `<Card glass>` + destructive disc + "Try again" |
| Missing route | `src/app/not-found.tsx` — logo + `<Card glass>` + `Compass` disc + "Back to home" |

### 22.8 The state-branch order every screen uses

```
loading  →  error  →  empty (no filters)  |  empty (filtered)  →  data
```

Confirmed identical in `leave-table.tsx`, `employee-manager.tsx`, `admin-dashboard.tsx`,
`employee-dashboard.tsx`, `attendance-manager.tsx`, `complaint-manager.tsx`. **Follow it exactly.**

---

## 23. Light / Dark Theme

### 23.1 Mechanism

```tsx
// src/app/layout.tsx
<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
```

`next-themes` puts `.dark` on `<html>`. `globals.css` declares
`@custom-variant dark (&:is(.dark *));` so `dark:` works against that class.
`suppressHydrationWarning` is on `<html>`; `disableTransitionOnChange` prevents every transition in
the app firing at once on switch.

`viewport.themeColor` is declared per scheme and **matches the tokens exactly** —
light `#f5f9f5` = `--background`, dark `#070f09` = `--background`.

### 23.2 `ThemeToggle` — `src/components/shared/theme-toggle.tsx`

A `ghost` `icon` button opening a `DropdownMenu` with Light / Dark / System. It renders a
**disabled placeholder `<Sun />` until `mounted`** to avoid a hydration mismatch. Sun and Moon
cross-fade with scale + rotation. Copy this component; do not build a second toggle.

### 23.3 Comparison table

| Surface | Light | Dark | Same? |
| --- | --- | --- | --- |
| App background | `#F5F9F5` | `#070F09` | ✗ |
| Card (opaque token) | `#FFFFFF` | `#111B13` | ✗ |
| Popover | `#FFFFFF` | `#121D15` | ✗ |
| Glass fill | white @62% | `#162118` @55% | ✗ |
| Glass strong | white @78% | `#141F16` @78% | ✗ |
| Glass subtle | white @42% | `#1E2A20` @34% | ✗ |
| Glass highlight | white @**90%** | white @**14%** | ✗ — the biggest single change |
| Glass hairline | `#214329`-ish @12% | white @8% | ✗ (dark rim → light rim) |
| Glass shadow | green `#214329` @10% | near-black @45% | ✗ (**4.5× more opaque**) |
| Glass shadow strong | `#0D371A` @16% | black @60% | ✗ |
| Blur / saturation | 20px / 180% | 20px / 180% | **✓** |
| Foreground | `#0F1A12` | `#EFF4F0` | ✗ |
| Muted foreground | `#5D685F` | `#9DA89F` | ✗ |
| Accent (hover) | `#E3F6E6` | `#213525` | ✗ |
| Border | `#D0DAD1` solid | white @11% | ✗ (**solid → alpha**) |
| Input | `#D5E0D7` solid | white @14% | ✗ |
| **`--primary` / `--brand`** | `#0AEA0A` | `#0AEA0A` | **✓ never altered** |
| **`--primary-ink`** | `#058004` (darkened) | `#0AEA0A` (**collapses to brand**) | ✗ |
| `--success-ink` | `#058004` | `#0AEA0A` | ✗ |
| `--destructive` | `#D53C3D` | `#E8605B` | ✗ |
| `--destructive-ink` | `#BB151F` | `#F66D67` | ✗ |
| `--warning` | `#ED9E2F` | `#F5AE4B` | ✗ |
| `--ring` | `#0AEA0A` | `#0AEA0A` | **✓** |
| `--ring-edge` | deep green @42% | deep green @60% | ✗ |
| Chart ramp 2–5 | darker steps | **lifted** steps | ✗ |
| Chart-1 | `#0AEA0A` | `#0AEA0A` | **✓** |
| Dialog overlay | black @25% | black @45% | ✗ |
| **Sidebar** | `#092411` @90% | `#092411` @72% | **✓ colour identical, opacity differs** |
| Sidebar foreground | `#F0F6F1` | `#F0F6F1` | **✓** |
| Aurora 1 / 3 | brand 17% / 11% | brand 14% / 9% | ✗ |
| Aurora 2 | deep green **15%** | deep green **60%** | ✗ (**4× stronger**) |
| Radius scale | identical | identical | **✓** |
| Typography | identical | identical | **✓** |
| Motion | identical | identical | **✓** |
| Switch thumb | `bg-white` | `bg-white` | **✓** |
| Tooltip | `bg-foreground/92` (dark chip) | `bg-foreground/92` (light chip) | inverts automatically |

### 23.4 What this means for Projects

1. **Write tokens, never `dark:` colour overrides.** A correctly tokenised component is themed for free. The only legitimate `dark:` usages in the whole codebase are `dark:bg-black/45` on the two overlays and `dark:hidden` / `hidden dark:block` on the logo.
2. **`-ink` collapsing is why the FILL/INK rule costs nothing in dark mode** — you pay the exception only where it is needed.
3. **Do not hand-roll a dark shadow.** Dark shadows are 4–5× more opaque *and* nearly black; a light-mode value reused in dark is invisible.
4. **Anything you put in the sidebar must work on dark ground in both themes** — style with tokens and `glass-sidebar` re-scopes them for you.

---

## 24. Responsive Design

### 24.1 Breakpoints

**[Confirmed] Tailwind v4 defaults, unmodified** — there is no config file and no `--breakpoint-*`
override in `globals.css`.

| Prefix | Min-width | Uses in `src/**/*.tsx` |
| --- | --- | --- |
| (base) | 0 | — |
| `sm` | **640px** | **91** |
| `md` | **768px** | 4 |
| `lg` | **1024px** | **40** |
| `xl` | **1280px** | 9 |
| `2xl` | 1536px | **0** |

> **Effectively a two-breakpoint system: `sm` and `lg`.** `md` is used only for the input font-size
> switch and the landing headline; `xl` only for 4- and 5-up stat grids; `2xl` never.

### 24.2 Layout behaviour by breakpoint

| Region | < 640px | 640–1023px | ≥ 1024px |
| --- | --- | --- | --- |
| **Sidebar** | off-canvas drawer; hamburger in topbar | same | fixed 264px slab, `lg:translate-x-0` |
| **Content offset** | none | none | `lg:pl-[17.5rem]` |
| **Topbar** | `px-3 pt-3`, inner `px-2`; shows hamburger + compact logo | `sm:px-4`, inner `sm:px-3` | `lg:pr-4`; hamburger + logo hidden |
| **`<main>`** | `px-3 py-6` | `sm:px-4` | `lg:pr-4` |
| **User menu** | avatar only | `sm:inline` name appears | same |
| **`PageHeader`** | stacked, `flex-col gap-4` | `sm:flex-row sm:items-end sm:justify-between` | same |
| **Stat grid** | 1 column | `sm:grid-cols-2` | `xl:grid-cols-4` (or `-5` on attendance) |
| **Chart pair** | stacked | stacked | `lg:grid-cols-2` |
| **Filter bar** | `flex-col gap-3` | same | `lg:flex-row lg:items-center` |
| **Table** | horizontal scroll inside `overflow-x-auto scrollbar-thin` | same | same |
| **Table bleed** | `-mx-4`, cells `pl-4`/`pr-4` | `sm:-mx-6`, `sm:pl-6`/`sm:pr-6` | same |
| **Pagination** | `flex-col gap-3` | `sm:flex-row` | same |
| **Dialog** | `w-[calc(100%-2rem)]` | capped `max-w-lg` (512px) | same |
| **Dialog footer** | `flex-col-reverse` (primary on top) | `sm:flex-row sm:justify-end` | same |
| **Dialog header** | `text-center` | `sm:text-left` | same |
| **Card grid (landing)** | 1 column | `sm:grid-cols-2` | same |
| **Input font size** | `text-base` (16px, blocks iOS zoom) | — | `md:text-sm` (14px) |
| **Landing H1** | `text-[2rem]` | — | `md:text-[2.75rem]` |

### 24.3 Overflow discipline — three mechanisms

1. **`min-w-0`** on `Card`, on flex children holding text, on the sidebar logo link.
2. **`truncate` / `line-clamp-2`** on every user-supplied string in a constrained cell.
3. **`overflow-x-auto scrollbar-thin`** on the table wrapper — tables scroll, pages do not.

> Typography does **not** scale responsively (apart from the landing headline and the input). One
> type scale for all viewports. Spacing shifts only at `sm` and only for shell padding.

### 24.4 Rules for Projects at each breakpoint

- **Mobile (< 640px):** one column. Project cards stack. Tables scroll horizontally inside the card — do **not** build a separate card-list mobile view; nothing in the codebase does. Keep the primary action in `PageHeader.actions`, which stacks above the content.
- **Tablet (640–1023px):** `sm:grid-cols-2` for KPI tiles and project cards. Sidebar is still a drawer, so content has the full width.
- **Desktop (≥ 1024px):** `lg:pl-[17.5rem]` is applied by `AppShell` — you do not add it. Use `lg:flex-row` for filter bars and `lg:grid-cols-2` for side-by-side panels.
- **Wide (≥ 1280px):** `xl:grid-cols-4` for a 4-tile KPI row, matching both dashboards.

---

## 25. Page Layout Templates

### 25.1 The shell

```
<html> (.dark toggled by next-themes)
└── <body class="flex min-h-full flex-col antialiased">
    └── ThemeProvider → SessionProvider → TooltipProvider
        ├── {children}
        └── <Toaster />                            ← mounted once, globally
```

Inside an authenticated route group, `AppShell` renders:

```
<div class="app-aurora min-h-dvh">                 ← fixed aurora at z-index -1
├── [mobile] overlay button           z-40
├── <aside class="glass-sidebar no-print fixed z-50 inset-y-3 left-3 w-[16.5rem] rounded-2xl">
│   ├── logo row      h-16 px-4
│   ├── [admin] Badge "Administrator"  px-4 pb-3
│   ├── <nav>         flex-1 overflow-y-auto scrollbar-thin px-3 py-2 space-y-0.5
│   └── footer        border-t px-4 py-3.5 text-xs
└── <div class="app-shell-body flex min-h-dvh min-w-0 flex-col lg:pl-[17.5rem]">
    ├── <div class="no-print sticky top-0 z-30 px-3 pt-3 sm:px-4 lg:pr-4">
    │   └── <header class="glass flex h-14 items-center gap-2 rounded-xl px-2 sm:px-3">
    └── <main class="flex-1 px-3 py-6 sm:px-4 lg:pr-4">{children}</main>
```

**There is no max-width container on `<main>`.** Content spans the full remaining width; individual
elements cap themselves (`max-w-md` search, `max-w-2xl` page description, `max-w-lg` dialogs).
**Do not add a `max-w-7xl mx-auto` wrapper for Projects** — nothing else does.

### 25.2 The standard page body

Every screen inside `<main>` follows this shape:

```tsx
export default async function AdminProjectsPage() {
  // 1. Server: session + permission resolution from the DATABASE, not the token
  const session = await auth();
  const canManage = await projectService.mayManage({ id: session.user.id, role: session.user.role });

  return (
    <>
      <PageHeader
        title="Projects"
        description="Everything the team is working on, and who is on it."
        actions={<CreateProjectDialog />}
      />
      <div className="space-y-4">
        <ProjectManager canManage={canManage} />
      </div>
    </>
  );
}
```

Notes drawn from every existing page:

- **A React fragment, not a wrapper div.** `<main>` already supplies the padding.
- **`PageHeader` first**, with its own `mb-7`.
- **Content wrapper is `space-y-4` or `grid gap-4`** — `admin/staff/page.tsx` uses `<div className="space-y-4">`; both dashboards use `<div className="grid gap-4">`.
- **`export const metadata: Metadata = { title: "Projects" }`** — the root layout templates it to `%s · Zovencia Presence`.
- **The page is a Server Component**; the interactive part is a `"use client"` manager component underneath.
- **Permissions are resolved server-side from the database and passed down as props** for *rendering only*; the endpoint re-checks.

### 25.3 `PageHeader` — `src/components/layout/page-header.tsx`

```tsx
<div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
  <div className="min-w-0 space-y-1.5">
    <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.028em]">{title}</h1>
    {description && <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">{description}</p>}
  </div>
  {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
</div>
```

Props: `title: string`, `description?: string`, `actions?: ReactNode`. Server Component — safe to
use from a page. **Every content screen uses it. Use it.**

`actions` convention: at most one `variant="default"` (green) button, the rest `outline`/`ghost`.
Titles are **plain nouns** ("Staff", "Projects", "Reports") or a greeting on dashboards
("Good to see you, {firstName}").

### 25.4 Full-screen (no shell) template

Used by `(auth)/layout.tsx`, `app/page.tsx`, `error.tsx`, `not-found.tsx`:

```tsx
<div className="app-aurora flex min-h-dvh flex-col">
  <header className="flex items-center justify-between px-5 py-4 sm:px-7 sm:py-5">
    <Link href={ROUTES.home} className="…">{<ZovenciaLogo priority />}{appConfig.name}</Link>
    <ThemeToggle />
  </header>
  <main className="flex flex-1 items-center justify-center px-4 pb-14">
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 w-full max-w-md duration-500 ease-standard">
      {children}
    </div>
  </main>
</div>
```

### 25.5 Route-group conventions

| Group | Layout does | Add Projects here? |
| --- | --- | --- |
| `(admin)/admin/**` | `auth()` → redirect if not admin → `chromeUser()` → resolve grants → `<AppShell isAdmin …>` | **Yes**, for the management screens |
| `(employee)/**` | `auth()` → redirect if no session → `<AppShell>`; **admins are NOT turned away** | Only if employees get a personal "My projects" view |
| `(auth)/**` | full-screen aurora template | no |
| `(onboarding)/**` | profile setup | no |

Add the route to `src/lib/constants.ts` `ROUTES` and link through it — **never write the path into a
`Link`**. (`ROUTES.adminStaff` is cited in `AGENTS.md` as the reason a screen rename touched one
constant rather than eight components.)

---

## 26. Dashboard Components

Two dashboards exist: `src/components/dashboard/admin-dashboard.tsx` and
`employee-dashboard.tsx`. A Projects dashboard should mirror the admin one.

### 26.1 The admin dashboard composition, in order

```
PageHeader (greeting + description + [population toggle] + primary CTA)
└── <div className="grid gap-4">
    ├── <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">  ← 4 StatCards
    ├── <Card>  "In the office today" — CardHeader with CardAction button
    │           + CardContent holding a NESTED grid of 3 StatCards (sm:grid-cols-3)
    ├── <UpcomingClosures … />
    ├── <div className="grid gap-4 lg:grid-cols-2">                 ← 2 chart Cards
    └── <Card>  "Recent activity" — a <ul className="divide-border/60 divide-y">
```

**Nested `StatCard`s inside a `Card` is an established pattern** — use it for a per-project
breakdown.

### 26.2 KPI tile

See §13.4. Grid: `grid gap-4 sm:grid-cols-2 xl:grid-cols-4` (or `xl:grid-cols-5` on attendance).

**Trend indicators [Not defined].** No component renders a percentage delta or an up/down arrow.
The `hint` line carries context instead ("All time", "Able to sign in", "Checked in today").
**Do not invent a trend chip** — if Projects needs one, express it in `hint`.

### 26.3 Charts — `src/components/charts/`

Two exist. Both are `"use client"`, both `ResponsiveContainer width="100%"`, both import shared
styling from `chart-theme.ts`.

| | `LeaveTrendChart` | `DepartmentChart` |
| --- | --- | --- |
| Type | stacked `AreaChart` | horizontal `BarChart` (`layout="vertical"`) |
| Height | `280` fixed | `Math.max(220, rows * 40)` |
| Margin | `{ top: 8, right: 8, left: -20, bottom: 0 }` | `{ top: 4, right: 16, left: 8, bottom: 4 }` |
| Grid | `strokeDasharray="3 3"`, `vertical={false}` | `strokeDasharray="3 3"`, `horizontal={false}` |
| Axes | `tickLine={false} axisLine={false}`, `allowDecimals={false}` | same; `YAxis width={130}` |
| Colour | **status colours** (`--color-success` / `--color-warning` / `--color-destructive`) | **`CHART_PALETTE`** ramp per `<Cell>` |
| Extra | vertical `linearGradient` fill 0.45 → 0.04; `strokeWidth={2}` | `stroke={barStroke}` hairline; `radius={[0,6,6,0]}`; `barSize={18}` |
| Legend | `iconType="circle"`, `fontSize: "0.8125rem"`, muted colour | none |
| Cursor | `{ stroke: gridStroke }` | `{ fill: "var(--color-brand)", opacity: 0.08 }` |

Shared tokens in `chart-theme.ts`: `CHART_PALETTE`, `axisTick` (`fill: --color-muted-foreground`,
`fontSize: 12`), `gridStroke` (`--color-border` @70%), `barStroke` (`--brand-deep` @55%),
`tooltipContentStyle` / `tooltipItemStyle` / `tooltipLabelStyle`.

**Two documented colour rules to obey:**

1. *"The brand green is luminous enough that a bar of it sits at only ~1.6:1 against a light surface. Rather than darken the fill — which would break the brand — each bar carries a deep-green hairline so its silhouette stays readable."* → **always pass `stroke={barStroke}` on a green bar.**
2. Series split by *outcome* borrow the **status** colours, not the green ramp: *"a reader who has learned 'amber = pending' from the badges should not have to learn a second encoding."* Series split by *category* use `CHART_PALETTE`.

> Projects: a status-split chart (Active/On hold/Completed) uses success/warning/destructive; a
> per-team or per-client breakdown uses `CHART_PALETTE`. Always wrap a chart in a `Card` with an
> icon'd `CardTitle` + `CardDescription`, and always render `<EmptyState … inset={false} />` when
> there is no data.

### 26.4 Progress bars

`src/components/ui/progress.tsx` — `h-2 rounded-full`, `glass-inset` track,
`bg-primary` indicator with a specular edge + brand bloom, 500ms `ease-standard`.

Usage pattern from `employee-dashboard.tsx` (a natural fit for "project completion"):

```tsx
<div className="w-full max-w-xs space-y-2">
  <Progress value={percent} indicatorClassName={percent === 100 ? "bg-success" : "bg-primary"} />
  <p className="text-muted-foreground text-xs">{done} of {total} tasks complete</p>
</div>
```

`indicatorClassName` is the supported override — use it for state colour, nothing else.

### 26.5 Activity feed

```tsx
<ul className="divide-border/60 divide-y">
  {items.map((item) => (
    <li key={item.id}
        className="-mx-2 flex items-center gap-3 rounded-md px-2 py-3 transition-colors duration-150 ease-standard first:pt-0 last:pb-0 hover:bg-accent/40">
      <Avatar className="size-9">
        {item.actor.profilePhoto && <AvatarImage src={item.actor.profilePhoto} alt="" />}
        <AvatarFallback>{initialsOf(item.actor.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          <span className="font-medium">{item.actor.name}</span>{" "}
          <span className="text-muted-foreground">created</span>{" "}
          <span className="font-medium">{item.projectName}</span>
        </p>
        <p className="text-muted-foreground truncate text-xs">{item.note} · {relativeTime(item.createdAt)}</p>
      </div>
      <ProjectStatusBadge status={item.status} />
    </li>
  ))}
</ul>
```

Note the idioms: `-mx-2 px-2` negative-margin hover bleed, `first:pt-0 last:pb-0`, `min-w-0 flex-1`
+ `truncate`, sentence built from `font-medium` / `text-muted-foreground` spans, and a trailing
badge.

### 26.6 Avatars

`src/components/ui/avatar.tsx`. Default `size-9`; `size-8` in table cells; `size-7` in the topbar;
`text-2xl` fallback on profile pages. Fallback is `initialsOf(name)` from `src/lib/utils.ts` (which
lives there, not next to the component, so Server Components can call it). Always pass `alt=""` on
`AvatarImage` — the name is beside it.

---

## 27. Empty / Loading / Error States

### 27.1 `EmptyState` — `src/components/shared/empty-state.tsx`

**The single component for "there is nothing here" AND for "this failed to load."**

```tsx
<EmptyState
  icon={FolderKanban}
  title="No projects yet"
  description="Projects will appear here once they are created."
  action={<Button size="sm" onClick={openCreate}>Create a project</Button>}
  inset            /* default true */
/>
```

Markup:

```tsx
<div className={cn("flex flex-col items-center justify-center gap-3 rounded-xl px-6 py-14 text-center", inset && "glass-inset")}>
  <div className="bg-primary/10 text-primary-ink flex size-12 items-center justify-center rounded-full">
    <Icon className="size-6" aria-hidden />
  </div>
  <div className="space-y-1">
    <p className="font-semibold tracking-[-0.012em]">{title}</p>
    <p className="text-muted-foreground mx-auto max-w-sm text-sm text-balance">{description}</p>
  </div>
  {action}
</div>
```

> **`inset={false}` when nesting inside a `Card`** — "stacking two wells reads as a rendering
> mistake." Both dashboards pass `inset={false}` for the in-card chart placeholders.

**Three distinct copy variants, all in use:**

| Situation | title | description | action |
| --- | --- | --- | --- |
| No data at all | "No projects yet" | "Projects will appear here once they are created." | optional CTA |
| Filters match nothing | "No matching projects" | "Try adjusting your search or filters to widen the results." | **"Clear filters"** `outline` `sm` |
| Load failed | "Couldn't load projects" | the `error` string from `useApiResource` | none |

Note the error title convention: **"Couldn't load X"** with a curly apostrophe, and the icon is
`XCircle` for a failure rather than the domain icon.

### 27.2 `Skeleton` — `src/components/ui/skeleton.tsx`

```tsx
<div data-slot="skeleton" aria-hidden className={cn("bg-muted/70 shimmer rounded-md", className)} />
```

`bg-muted/70` + the 1.8s `shimmer` sweep + `rounded-md`, and **`aria-hidden`** so a screen reader
is not read a wall of placeholders.

**Skeletons mirror the layout they replace** — this is the strongest convention in the codebase.

Page-level (`src/app/loading.tsx`):

```tsx
<div className="app-aurora flex min-h-dvh flex-col gap-4 p-8">
  <Skeleton className="h-8 w-64" />          {/* title */}
  <Skeleton className="h-4 w-96" />          {/* description */}
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
  </div>
  <Skeleton className="h-80 rounded-xl" />
</div>
```

Dashboard-level (`admin-dashboard.tsx` — **keeps the real `PageHeader` on screen** so the toggle is
not torn away mid-click):

```tsx
<div className="mb-6 space-y-2"><Skeleton className="h-8 w-72" /><Skeleton className="h-4 w-96" /></div>
<div className="grid gap-4">
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    {Array.from({ length: 4 }, (_, i) => <StatCardSkeleton key={i} />)}
  </div>
  <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-80 rounded-xl" /><Skeleton className="h-80 rounded-xl" /></div>
  <Skeleton className="h-64 rounded-xl" />
</div>
```

Table-level (`leave-table.tsx`) — one row of bars per record, shaped like the real columns:

```tsx
<div className="space-y-3 py-2">
  {Array.from({ length: 5 }, (_, i) => (
    <div key={i} className="flex items-center gap-4">
      <Skeleton className="h-5 w-28" />
      <Skeleton className="h-9 w-40" />          {/* person cell */}
      <Skeleton className="h-5 flex-1" />
      <Skeleton className="h-6 w-24 rounded-full" />   {/* badge → rounded-full */}
      <Skeleton className="h-5 w-20" />
    </div>
  ))}
</div>
```

**Standard heights:** `h-4` caption · `h-5` body row · `h-6` badge · `h-8` heading/value ·
`h-9` avatar row · `h-28` stat card · `h-64`/`h-80` panel. **Standard radii:** `rounded-xl` for a
card-shaped block, `rounded-full` for a badge, `rounded-md` default.

### 27.3 Spinners

Only `Loader2` + `animate-spin` (9 uses). Three placements: inside a `loading` button, absolutely
positioned in an input, and inline in an assistant transcript. **There is no full-page spinner** —
skeletons cover that.

### 27.4 Full-route error and 404

Both in `src/app/`: `app-aurora` background, `<ZovenciaLogo size="lg" />` **above** the card,
`<Card glass className="animate-in fade-in-0 zoom-in-95 w-full max-w-md text-center duration-500 ease-standard">`,
a 48px tinted disc, `<h1 className="text-xl font-semibold tracking-[-0.02em]">`, a muted sentence,
and one full-width `<Button className="w-full">`. `error.tsx` also prints
`Reference: {error.digest}` in `font-mono text-xs` and `console.error`s on mount.

---

## 28. Notifications & Toasts

### 28.1 Configuration — `src/components/ui/sonner.tsx`

Mounted **once** in `src/app/layout.tsx`, outside the providers.

```tsx
<Sonner
  theme={theme as ToasterProps["theme"]}     /* from next-themes */
  className="toaster group"
  position="top-right"
  offset={20}
  closeButton
  toastOptions={{
    unstyled: false,
    classNames: {
      toast: cn("group toast glass-strong !border-0 !bg-[var(--glass-bg-strong)] !text-foreground",
                "!rounded-xl !gap-3 !p-4"),
      title: "!text-sm !font-semibold !tracking-[-0.01em]",
      description: "!text-muted-foreground !text-sm",
      actionButton: "!bg-primary !text-primary-foreground !rounded-sm",
      cancelButton: "!bg-secondary !text-secondary-foreground !rounded-sm",
      closeButton: "!bg-transparent !border-0 !text-muted-foreground hover:!text-foreground hover:!bg-accent/70 !rounded-sm",
      icon: "!size-4",
      success: "[&_[data-icon]]:!text-success-ink",
      error:   "[&_[data-icon]]:!text-destructive-ink",
      warning: "[&_[data-icon]]:!text-warning-ink",
      info:    "[&_[data-icon]]:!text-primary-ink",
    },
  }}
/>
```

| Property | Value |
| --- | --- |
| Position | **top-right** |
| Offset | 20px |
| Surface | `glass-strong` (78% fill, 28px blur) |
| Radius | `rounded-xl` (**24px**) |
| Padding / gap | `p-4` / `gap-3` |
| Border | **removed** (`!border-0`) |
| Title | 14px, 600, `tracking-[-0.01em]` |
| Description | 14px, `--muted-foreground` |
| Icon | 16px, tinted per type with the `-ink` token |
| Close button | always on |
| Duration | **[Not defined]** — Sonner's default (4s; 6s for errors) is used; no `duration` is set anywhere |
| Animation | Sonner's own slide/fade — the only motion in the app not governed by `motion-pop` |

> The comment records the intent: *"Sonner ships its own surface colours; unset them so the toast
> picks up the same glass treatment as every other floating panel."* The `!` prefixes are required
> to beat Sonner's inline defaults — **do not remove them.**

### 28.2 Usage — `import { toast } from "sonner"`

Used in **30 files**. The four types map to the four `-ink` colours above.

```tsx
try {
  await apiClient.post("/api/admin/projects", payload);
  toast.success("Project created.");
  await refresh();
} catch (error) {
  toast.error(error instanceof ApiClientError ? error.message : "Couldn't create that project.");
}
```

**Conventions [Confirmed across `employee-manager.tsx`, `attendance-manager.tsx`, `complaint-manager.tsx`]:**

- **Success:** past tense, full stop. *"Employee marked as Present successfully."* / *"Project created."*
- **Error:** always prefer the server's own message (`ApiClientError.message`); the hard-coded string is only the fallback, and it says what did not happen — *"Couldn't record that attendance. The status is unchanged."*
- Toasts are for **transient outcomes**. A persistent failure state belongs in `EmptyState`; a field-level failure belongs in `FormMessage`.
- A toast is **not** a substitute for refreshing — the codebase pairs `toast.success` with `await refresh()` so the screen reflects the server.
- **No `toast.promise` and no `toast.loading` anywhere.** Pending state is the button's `loading` prop.

### 28.3 Non-toast notification surfaces

**[Not defined]:** there is no in-app notification centre, no bell, no unread badge, and no
persistent alert/banner component. Inline notices are built ad hoc from a tinted div, e.g.
`invitation-gate.tsx`:

```tsx
<div className="bg-brand/8 text-muted-foreground flex items-center gap-2 rounded-lg p-3 text-sm
                shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--brand)_28%,transparent)]">
```

**That is the pattern to copy for an inline informational notice in Projects** — tinted wash at
8–15%, same-hue rim at 28–32%, `rounded-lg`, `p-3`, `text-sm`.

---

## 29. Reusable Components Inventory

`Reuse` column: **Must** = use it, do not write an alternative · **Yes** = reuse where applicable ·
**Pattern** = copy the shape into a Projects-specific component · **No** = domain-specific, ignore.

### 29.1 UI primitives — `src/components/ui/` (26 files)

| Component | File | Purpose | Key props / variants | Styling | Reuse |
| --- | --- | --- | --- | --- | --- |
| `Button`, `buttonVariants` | `button.tsx` | All actions | `variant`: default·destructive·success·outline·secondary·glass·ghost·link · `size`: default·sm·lg·icon·icon-sm · `asChild` · `loading` | CVA | **Must** |
| `Card` + 6 slots | `card.tsx` | Every panel | `glass?`, `interactive?` | `cn` | **Must** |
| `Input` | `input.tsx` | Text/date/time/search fields | native `<input>` props | `glass-inset` | **Must** |
| `Textarea` | `textarea.tsx` | Multi-line | native | `glass-inset`, `field-sizing-content` | **Must** |
| `Label` | `label.tsx` | Field labels | Radix Label | — | **Must** |
| `Form*` (8 exports) | `form.tsx` | react-hook-form bridge | `FormField`,`FormItem`,`FormLabel`,`FormControl`,`FormDescription`,`FormMessage`,`useFormField` | — | **Must** |
| `Select*` (10 exports) | `select.tsx` | Dropdown choice | `SelectTrigger size`: sm·default | `glass-inset` / `glass-strong` | **Must** |
| `Badge`, `badgeVariants` | `badge.tsx` | Status pills | `variant`: default·secondary·destructive·success·warning·outline · `asChild` | CVA | **Must** |
| `Table` + 7 parts | `table.tsx` | All tables | native table props | `glass-subtle` header | **Must** |
| `Dialog*` (10 exports) | `dialog.tsx` | Modals | `showCloseButton?` | `glass-strong` | **Must** |
| `AlertDialog*` (9 exports) | `alert-dialog.tsx` | Confirmations | — | `glass-strong` | **Yes** (prefer `ConfirmDialog`) |
| `DropdownMenu*` (15 exports) | `dropdown-menu.tsx` | Menus, row actions | `DropdownMenuItem variant`: default·destructive · `inset` | `glass-strong` | **Must** |
| `Popover*` (4 exports) | `popover.tsx` | Anchored panels | `align`, `sideOffset` | `glass-strong`, `w-72` | **Yes** |
| `Tooltip*` (4 exports) | `tooltip.tsx` | Hints | `sideOffset` | inverted solid | **Yes** |
| `Tabs*` (4 exports) | `tabs.tsx` | In-page sections | Radix Tabs | `glass-inset` track | **Yes** |
| `Avatar*` (3 exports) | `avatar.tsx` | People | — | gradient fallback | **Must** |
| `Switch` | `switch.tsx` | Booleans | Radix Switch | brand fill + glow | **Yes** |
| `Progress` | `progress.tsx` | Completion | `value`, `indicatorClassName` | `glass-inset` track | **Yes** |
| `Separator` | `separator.tsx` | Dividers | `orientation` | `bg-border` | **Yes** |
| `Skeleton` | `skeleton.tsx` | Loading | `className` | `shimmer` | **Must** |
| `Toaster` | `sonner.tsx` | Toast host | — | `glass-strong` | already mounted — **do not mount again** |
| `PaginationControls` | `pagination-controls.tsx` | Paging | `pagination`, `onPageChange`, `label` | — | **Must** |
| `SortButton` | `sort-button.tsx` | Column sort | `label`, `active`, `direction`, `onClick` | — | **Must** |

### 29.2 Shared components — `src/components/shared/`

| Component | File | Purpose | Props | Reuse |
| --- | --- | --- | --- | --- |
| `StatCard`, `StatCardSkeleton` | `stat-card.tsx` | KPI tile | `label`,`value`,`icon`,`tone`,`hint`,`className` | **Must** |
| `EmptyState` | `empty-state.tsx` | Empty / error panel | `icon`,`title`,`description`,`action?`,`inset?`,`className?` | **Must** |
| `ConfirmDialog` | `confirm-dialog.tsx` | Destructive confirm | `title`,`description`,`confirmLabel?`,`cancelLabel?`,`destructive?`,`onConfirm`,`trigger?`,`open?`,`onOpenChange?` | **Must** |
| `ThemeToggle` | `theme-toggle.tsx` | Theme switch | none | already in topbar — **do not add a second** |
| `LeaveStatusBadge` | `leave-status-badge.tsx` | Leave status | `status` | **Pattern** |
| `AttendanceStatusBadge` | `attendance-status-badge.tsx` | Day status | `status` | **Pattern** |

### 29.3 Layout — `src/components/layout/`

| Component | File | Purpose | Props | Reuse |
| --- | --- | --- | --- | --- |
| `AppShell` | `app-shell.tsx` | Sidebar + topbar + main | `user`,`isAdmin`,`isSuperAdmin?`,`canManageComplaints?`,`appName`,`children` | already applied by the route-group layout — **do not render it yourself** |
| `PageHeader` | `page-header.tsx` | Title/description/actions | `title`,`description?`,`actions?` | **Must** |
| `ZovenciaLogo` | `zovencia-logo.tsx` | Brand mark | `variant`: mark·full · `size`: xs·sm·md·lg · `surface`: auto·dark · `priority` · `className` | **Must** — the only place a logo path may be named |
| `UserMenu` | `user-menu.tsx` | Account menu | `name`,`email`,`image`,`isAdmin` | in shell — no |
| `GlobalSearch` | `global-search.tsx` | Topbar search | `isAdmin` | in shell; **Pattern** for an anchored panel |
| `nav-config.ts` | — | Nav lists + `isActiveRoute` + `visibleNav` | — | **Must edit** to add Projects |

### 29.4 Charts, complaints, and other patterns

| Component | File | Purpose | Reuse |
| --- | --- | --- | --- |
| `chart-theme.ts` | `charts/chart-theme.ts` | `CHART_PALETTE`, `axisTick`, `gridStroke`, `barStroke`, tooltip styles | **Must** if you chart |
| `LeaveTrendChart` | `charts/leave-trend-chart.tsx` | Stacked area | **Pattern** |
| `DepartmentChart` | `charts/department-chart.tsx` | Horizontal bar | **Pattern** |
| `ComplaintStatusBadge` | `complaints/complaint-status-badge.tsx` | Status pill | **Pattern** |
| `ComplaintAttachmentsField` | `complaints/complaint-attachments-field.tsx` | Data-URL attachments | **Pattern** if Projects has attachments |
| `EmailAttachmentsField` | `admin/email-attachments-field.tsx` | Multipart files | **Pattern** |
| `RichTextEditor` | `admin/rich-text-editor.tsx` | Sanitised HTML editor | **Yes** if a project needs rich description |
| `ReportPeoplePicker` | `admin/report-people-picker.tsx` | Server-filtered multi-select | **Pattern** for assigning members from a large roster |
| `AdminRecipientPicker` | `admin/admin-recipient-picker.tsx` | Client-filtered multi-select | **Pattern** for a bounded list |
| `LeaveTable` | `leaves/leave-table.tsx` | Full filter+table+paging screen | **Pattern** — the canonical table screen |
| `EmployeeManager` | `admin/employee-manager.tsx` | Table + row actions + dialogs | **Pattern** |
| `StaffManager` | `admin/staff-manager.tsx` | Tabs over two tables | **Pattern** for Overview/Tasks/Members tabs |
| `AvatarUpload` | `profile/avatar-upload.tsx` | Data-URL image upload | **Yes** if projects get a cover image |
| `AccessPanel`, `AdminPermissions` | `admin/*` | Grant toggles | **Pattern** if Projects adds a grant |

### 29.5 Hooks — `src/hooks/`

| Hook | File | Returns | Reuse |
| --- | --- | --- | --- |
| `useApiResource<T>(path \| null)` | `use-api-resource.ts` | `{ data, error, loading, refresh }`; discards superseded responses; `null` path = idle | **Must** |
| `useDebouncedValue(value, ms)` | `use-debounced-value.ts` | debounced value | **Must** (350ms for tables) |
| `useEmployeeTable(pageSize, role)` | `use-employee-table.ts` | filters + `update`/`toggleSort`/`reset`/`hasActiveFilters` + resource | **Pattern** |
| `useLeaveTable(...)` | `use-leave-table.ts` | as above + `exportUrl` | **Pattern** |
| `useCountdown` | `use-countdown.ts` | ticking remainder | **Yes** for a deadline |
| `useStickToBottom` | `use-stick-to-bottom.ts` | chat scroll anchor | No |
| `useSpeech` | `use-speech.ts` | speech recognition | No |

### 29.6 Lib helpers — `src/lib/`

| Export | File | Purpose | Reuse |
| --- | --- | --- | --- |
| `cn(...)` | `utils.ts` | clsx + tailwind-merge | **Must** |
| `initialsOf(name)` | `utils.ts` | Avatar initials (callable from RSC) | **Must** |
| `apiClient`, `ApiClientError`, `toQueryString` | `api-client.ts` | Envelope-unwrapping fetch | **Must** |
| `formatDate`, `formatDateTime`, `relativeTime`, `monthLabel`, `toUtcDay`, `todayUtc`, … | `date.ts` | All date work | **Must** — never `new Date(y,m,d)`, never `date-fns` |
| `ROUTES` | `constants.ts` | Path constants | **Must** — add `adminProjects` here |
| `BRAND_NAME`, `BRAND_TAGLINE`, `BRAND_COLORS`, `productSuffix` | `brand.ts` | Document/export branding | **Must** for exports |
| `escapeCsvCell`, `toCsv`, `csvResponse` | `csv.ts` | Formula-injection guard, row joining, and the download `Response` | **Must** if you export CSV |
| `serializeEmployee`, `serializeLeave`, `serializeAttendance`, `serializeHoliday`, `serializeReport`, `serializeTrend` | `serialize.ts` | `Date` → ISO across the RSC boundary — add a `serializeProject` here | **Must** |
| `sanitizeHtml` | `sanitize-html.ts` | Rich-text sanitising | **Yes** |

### 29.7 What does **not** exist (so do not go looking)

`Checkbox` · `RadioGroup` · `Calendar` / `DatePicker` · `Command` / command palette ·
`Sheet` / `Drawer` · `Accordion` · `Collapsible` · `Breadcrumb` · `Alert` / banner ·
`ScrollArea` (there is the `scrollbar-thin` utility instead) · `Slider` · `Toggle` /
`ToggleGroup` · `HoverCard` · `Carousel` · `Chart` wrapper · `DataTable` · notification centre ·
page-transition system · icon-only sidebar mode.

---

## 30. Design Tokens

Everything below is **copied from `src/app/globals.css`**, not restated in a new vocabulary. Where
the prompt's suggested token name differs from the real one, the real one is given.

### 30.1 Colours

```text
/* Brand — identical in both themes */
--brand:            oklch(0.812 0.275 142.5);   /* #0AEA0A */
--brand-deep:       oklch(0.286 0.091 143.9);   /* #023506 */

/* Light                                     Dark */
--background:       #F5F9F5                    #070F09
--foreground:       #0F1A12                    #EFF4F0
--card:             #FFFFFF                    #111B13
--card-foreground:  #0F1A12                    #EFF4F0
--popover:          #FFFFFF                    #121D15
--primary:          #0AEA0A                    #0AEA0A      (never altered)
--primary-foreground: #023506                  #023506
--primary-ink:      #058004                    #0AEA0A      (collapses in dark)
--secondary:        #EBF3EC                    #1D2820
--muted:            #EDF3EE                    #1D2820
--muted-foreground: #5D685F                    #9DA89F
--accent:           #E3F6E6                    #213525      (every hover)
--accent-foreground:#1A3520                    #EFF4F0
--success:          #0AEA0A                    #0AEA0A
--success-ink:      #058004                    #0AEA0A
--warning:          #ED9E2F                    #F5AE4B
--warning-ink:      #965813                    #F8B656
--destructive:      #D53C3D                    #E8605B
--destructive-ink:  #BB151F                    #F66D67
--border:           #D0DAD1                    oklch(1 0 0 / 11%)
--input:            #D5E0D7                    oklch(1 0 0 / 14%)
--ring:             #0AEA0A                    #0AEA0A
--ring-edge:        brand-deep @42%            brand-deep @60%

/* Sidebar — theme-independent */
--sidebar:                 oklch(0.235 0.05 150 / 90%)  →  / 72% in dark   /* #092411 */
--sidebar-foreground:      #F0F6F1
--sidebar-muted-foreground:#ACBAAF
--sidebar-border:          oklch(1 0 0 / 12%)
--sidebar-accent:          oklch(1 0 0 / 8%)

/* Charts */
--chart-1..5: #0AEA0A · #26B63D · #0B8932 · #035E23 · #06390A   (light)
              #0AEA0A · #11BE41 · #249242 · #1B6934 · #104A17   (dark)
```

> The prompt's `--primary-dark`, `--surface`, `--surface-glass`, `--text-primary`,
> `--text-secondary`, `--text-muted`, `--error` **do not exist**. Their real equivalents are
> `--brand-deep`, `--card`, `--glass-bg`, `--foreground`, `--secondary-foreground`,
> `--muted-foreground`, `--destructive`.

### 30.2 Radius

```text
--radius:     1.5rem;                     /* 24px — the anchor */
--radius-sm:  calc(var(--radius) - 14px); /* 10px  tooltips, small buttons, menu items */
--radius-md:  calc(var(--radius) - 10px); /* 14px  buttons, nav items, tabs pill */
--radius-lg:  calc(var(--radius) -  6px); /* 18px  inputs, menus, tabs track */
--radius-xl:  var(--radius);              /* 24px  cards, topbar, popovers, toasts */
--radius-2xl: calc(var(--radius) +  6px); /* 30px  dialogs, sidebar */
--radius-3xl: calc(var(--radius) + 12px); /* 36px  declared, unused */
/* pill / circle: rounded-full (9999px) — badges, avatars, switch, progress */
```

### 30.3 Shadows

```text
/* Declared in @theme inline — currently UNUSED as `shadow-glass-*` utilities */
--shadow-glass-sm: 0 1px 2px -1px var(--glass-shadow), 0 4px 12px -6px var(--glass-shadow);
--shadow-glass:    0 1px 2px -1px var(--glass-shadow), 0 8px 24px -10px var(--glass-shadow),
                   0 20px 44px -24px var(--glass-shadow);
--shadow-glass-lg: 0 1px 2px -1px var(--glass-shadow), 0 12px 32px -12px var(--glass-shadow-strong),
                   0 32px 64px -32px var(--glass-shadow-strong);
--shadow-glass-xl: 0 2px 4px -2px var(--glass-shadow), 0 20px 48px -16px var(--glass-shadow-strong),
                   0 48px 96px -40px var(--glass-shadow-strong);

/* The shadow COLOURS (these are what matter) */
--glass-shadow:        light oklch(0.35 0.06 150 / 10%)  ·  dark oklch(0.06 0.03 150 / 45%)
--glass-shadow-strong: light oklch(0.3  0.07 150 / 16%)  ·  dark oklch(0.04 0.03 150 / 60%)

/* Glow (the app's real "elevation" language) */
brand glow rest : 0 6px 18px -8px color-mix(in oklab, var(--brand) 60%, transparent)
brand glow hover: 0 12px 30px -8px color-mix(in oklab, var(--brand) 78%, transparent)
brand halo (card): 0 20px 48px -28px color-mix(in oklab, var(--brand) 38%, transparent)
rail glow        : 0 0 12px 0 color-mix(in oklab, var(--brand) 70%, transparent)
```

### 30.4 Blur

```text
--glass-blur:       20px      /* the base */
--glass-saturation: 180%
--blur-glass:       var(--glass-blur)     /* Tailwind utility `blur-glass`, currently unused */

Effective blurs:
  glass          20px  · saturate(180%)
  glass-strong   28px  (× 1.4) · saturate(180%)
  glass-subtle   12px  (× 0.6) · saturate(140%)
  glass-sidebar  26px  (× 1.3) · saturate(160%)
  glass-inset    none
  overlays       backdrop-blur-md (12px, Tailwind default)
  tooltip        backdrop-blur-sm (4px, Tailwind default)
```

> The prompt's `--blur-sm/md/lg` do not exist. Use the utilities, which carry the blur *and* the
> saturation *and* the reduced-transparency fallback.

### 30.5 Motion

```text
--duration-fast: 150ms    --ease-standard: cubic-bezier(0.32, 0.72, 0, 1)
--duration-base: 220ms    --ease-spring:   cubic-bezier(0.34, 1.4, 0.64, 1)
--duration-slow: 300ms    --ease-exit:     cubic-bezier(0.4, 0, 0.6, 1)
```

In components, write `duration-200 ease-standard` (matching the existing code) or
`duration-300 ease-spring` for travel.

### 30.6 Spacing

**No spacing tokens are declared** — Tailwind's default 4px scale is used unmodified.
The de-facto ladder: `gap-2` (8) · `gap-3` (12) · `gap-4` (16) for grids · `p-4` (16) cells ·
`p-5` (20) stat cards · `p-6` (24) cards & dialogs · `px-3.5` (14) inputs · `mb-7` (28) page header.

### 30.7 Typography tokens

```text
--font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display",
             var(--font-geist-sans), "Segoe UI Variable Text", "Segoe UI",
             ui-sans-serif, system-ui, sans-serif;
--font-mono: "SF Mono", var(--font-geist-mono), ui-monospace, monospace;
```

---

## 31. Projects Module Implementation Rules

Practical, ordered, and enforceable.

### 31.1 Before you write a component, check these six files

1. `src/app/globals.css` — every token, every glass utility, every motion curve.
2. `src/components/ui/` — 26 primitives already exist.
3. `src/components/shared/` — `StatCard`, `EmptyState`, `ConfirmDialog`.
4. `src/components/leaves/leave-table.tsx` — the canonical filter + table + paging screen.
5. `src/components/dashboard/admin-dashboard.tsx` — the canonical dashboard.
6. `src/hooks/use-employee-table.ts` — the canonical table-state hook.

### 31.2 The hard rules

**Colour**
1. **Never write a colour literal.** No hex, no `rgb()`, no `oklch()` for a *hue*. (Inline `oklch(1 0 0 / N%)` white/black alphas inside a `shadow-[...]` are the one accepted exception, matching `button.tsx`.)
2. **Obey FILL vs INK.** `bg-primary` / `bg-success` / `bg-warning` / `bg-destructive` for fills; `text-primary-ink` / `text-success-ink` / `text-warning-ink` / `text-destructive-ink` for letterforms and bare icons. **Never `text-primary`.** **Never an `-ink` token as a background.**
3. **Never darken the brand green** to make it readable. Change the surface — tint, opacity, rim, weight.
4. **Every hover resolves to `--accent`**: `hover:bg-accent/40|45|60|70`.
5. Selection = `bg-brand/12` (or `/15`) + `shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--brand)_28%,transparent)]`.

**Surfaces**
6. Use `glass` / `glass-strong` / `glass-subtle` / `glass-inset` — **never hand-roll `bg-white/60 backdrop-blur-xl`**, which silently opts out of the reduced-transparency and print fallbacks.
7. Panels are `<Card>`. Form controls are `glass-inset`. Floating surfaces are `glass-strong`.
8. Rims are `inset 0 0 0 1px`, not `border`. Real `border` only for dividers, always alpha-reduced.

**Radius / shadow**
9. Only `rounded-{sm,md,lg,xl,2xl,full}`. **No arbitrary `rounded-[Npx]`.**
10. Elevation is **brand glow**, not darker grey. Copy the exact strings from `button.tsx` / `tabs.tsx` / `app-shell.tsx`.

**Type**
11. No new font. No `font-bold`. Two weights: `font-medium`, `font-semibold`.
12. Headings carry the negative tracking from the ladder in §7.4. Uppercase eyebrows are `text-[0.6875rem] font-semibold tracking-[0.06em] uppercase`.
13. Every comparable number gets `tabular-nums`.

**Motion**
14. CSS only. **Do not install Framer Motion or GSAP.**
15. `duration-200 ease-standard` default; `duration-300 ease-spring` for travel. Any new Radix surface carries `motion-pop`.
16. Transition **named properties**, never `transition-all`.
17. Presses are `active:scale-[0.97]` (buttons) / `[0.98]` (rows and tabs).

**Icons**
18. Lucide only, default stroke, `size-4` unless the table in §20.2 says otherwise. Inside buttons and menu items, pass no size class. `aria-hidden` on decorative, `aria-label` on icon-only buttons.

**Structure**
19. Page = `<PageHeader>` + `<div className="space-y-4">` (or `grid gap-4`). No max-width wrapper.
20. Branch state as `loading → error → empty → data`, using `Skeleton`, `EmptyState`, `EmptyState`.
21. Data via `useApiResource`; mutations via `apiClient`; errors surfaced with `toast.error(err instanceof ApiClientError ? err.message : "…")`.
22. Paths via `ROUTES`. Dates via `src/lib/date.ts`. Classes via `cn()`.
23. Server Component page → `"use client"` manager component. Permissions resolved server-side **from the database**, passed down for rendering only; the endpoint re-checks.
24. Validation in `src/validations/project.schema.ts`, shared by form and route handler.
25. Follow `route handler → service → repository → prisma` (see `AGENTS.md`) — only repositories import `prisma`.

### 31.3 The don'ts

- ✗ Don't introduce a new visual language, colour, gradient, radius scale, shadow scale, font, or icon library.
- ✗ Don't add a `Checkbox`, `Calendar`, `Sheet` or `DataTable` without first trying the existing idioms (selectable rows, native `type="date"` in `Input`, `Dialog`, hand-composed `Table`).
- ✗ Don't add `zustand` state or `date-fns` calls — both are installed and deliberately unused.
- ✗ Don't mount a second `<Toaster>` or a second `ThemeToggle`.
- ✗ Don't render `<AppShell>` yourself — the route-group layout does it.
- ✗ Don't put a `max-w-7xl mx-auto` container around page content.
- ✗ Don't hard-code a light colour for anything that may land in the sidebar.
- ✗ Don't build a separate mobile card-list view of a table — the table scrolls.
- ✗ Don't add page transitions or a collapsed sidebar mode.
- ✗ Don't write a Prisma-touching test (`AGENTS.md`: the Vitest suite covers pure policy only).

---

## 32. Projects Module UI Mapping

Each answer is built from components that already exist.

### 32.1 Projects overview — `/admin/projects`

```tsx
export const metadata: Metadata = { title: "Projects" };

<>
  <PageHeader
    title="Projects"
    description="Everything the team is working on, who owns it, and where it stands."
    actions={<CreateProjectDialog />}
  />
  <div className="grid gap-4">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Active"     value={s.active}    icon={PlayCircle}  tone="primary"     hint="In flight" />
      <StatCard label="Completed"  value={s.completed} icon={CheckCircle2} tone="success"     hint="All time" />
      <StatCard label="On hold"    value={s.onHold}    icon={PauseCircle}  tone="warning"     hint="Paused" />
      <StatCard label="Overdue"    value={s.overdue}   icon={XCircle}      tone="destructive" hint="Past due date" />
    </div>
    <ProjectTable table={table} />
  </div>
</>
```

The table is the §16.5 recipe verbatim. **Prefer the table over a card grid** — every list screen in
this application is a table, and a card grid would be a new pattern.

### 32.2 Project cards (if a board/grid view is required)

Use `<Card interactive>` — `glass` + `hover-lift`, `rounded-xl`, `py-6`, `px-6` slots. Grid
`grid gap-4 sm:grid-cols-2 xl:grid-cols-3`. Structure: `CardHeader` with `CardTitle` +
`CardDescription` and a `CardAction` holding the status badge; `CardContent` with a `Progress` bar,
a member `Avatar` stack, and a muted due-date line. **Do not use `<Card glass>`** — that variant is
for cards floating directly on the aurora.

Selected state = the brand-selection idiom (§13.5).

### 32.3 Project status → badge

Build `ProjectStatusBadge` exactly as §17.3 shows. Mapping guidance from the existing three:

| Status | Variant | Rationale from the codebase |
| --- | --- | --- |
| Draft | `outline` | "nobody has looked yet" is the absence of a state — mirrors complaint `PENDING` |
| Active / In progress | `success` | it is working as intended |
| On hold / Blocked | `warning` | needs attention, not an error |
| Completed | `success` + `CheckCircle2` | mirrors `APPROVED` |
| Archived | `secondary` | neutral, not an accusation — mirrors `ON_LEAVE` / `NO_RECORD` |
| Cancelled | `destructive` | a genuinely negative outcome |

For **task priority**, the same ladder: Low `secondary` · Medium `outline` · High `warning` ·
Urgent `destructive`. Do not introduce a new hue.

### 32.4 Project detail — `/admin/projects/[id]`

Server Component. Gate it with the same function the endpoint uses — `AGENTS.md` records
`staff/[id]/page.tsx` calling `byId` instead of `byIdForActor` as a real security hole:
**"A page is as reachable as an endpoint; gate it with the same function."**

```tsx
<PageHeader
  title={project.name}
  description={project.summary}
  actions={<><Button variant="outline" size="sm">Export CSV</Button><EditProjectDialog … /></>}
/>
<div className="grid gap-4">
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{/* KPI tiles */}</div>

  <Tabs defaultValue="overview">
    <TabsList>
      <TabsTrigger value="overview"><LayoutDashboard aria-hidden />Overview</TabsTrigger>
      <TabsTrigger value="tasks"><ListChecks aria-hidden />Tasks</TabsTrigger>
      <TabsTrigger value="members"><Users aria-hidden />Members</TabsTrigger>
    </TabsList>
    <TabsContent value="overview" className="mt-4">…</TabsContent>
    …
  </Tabs>
</div>
```

`Tabs` is the codebase's answer to in-page sections (`staff-manager.tsx`). Icons inside
`TabsTrigger` take no size class. Detail facts go in a `<Card>` as a
`<dl>`-style stack of `text-muted-foreground text-xs` label over `text-sm` value.

### 32.5 Project members

- **In a table:** the person cell from §16.5 — `Avatar size-8` + name (`text-sm font-medium`) over department/role (`text-muted-foreground text-xs`), both `truncate`, inside `min-w-0`.
- **In a card:** an `Avatar` stack at `size-8` with `-space-x-2` and a `+N` `Badge variant="secondary"`. *(This overlap idiom is **[Inferred]** — no avatar stack exists today. If you would rather not invent it, list the first three names as text with a muted "+N others".)*
- **Adding a member:** if the roster is large, copy `ReportPeoplePicker` (server-filtered, capped); if it is small, copy `AdminRecipientPicker` (client-filtered). Both use the brand-selection idiom on rows and **name their selection back to the user before committing** — a documented rule: *"a number tells somebody the send is bigger than they meant, only names tell them it is going to the wrong people."*
- **Removing a member:** row-action `DropdownMenu` → `variant="destructive"` item → **controlled** `ConfirmDialog`.

### 32.6 Project tasks

A `Table`, same recipe. Suggested columns and their cell classes:

| Column | Cell |
| --- | --- |
| Task | `font-medium` + `line-clamp-2` if long; `max-w-64` on the cell |
| Assignee | person cell (`Avatar size-8` + name/role) |
| Status | `<TaskStatusBadge />` |
| Priority | `<TaskPriorityBadge />` |
| Due date | `formatDate(...)`, `whitespace-nowrap`; overdue → `text-destructive-ink` |
| Updated | `relativeTime(...)`, `text-muted-foreground text-sm whitespace-nowrap` |
| Actions | `text-right` + `MoreHorizontal` menu |

Sortable columns get `SortButton`. **A Kanban board is a new pattern with no precedent here** — if
the requirement demands one, keep the columns as `glass-inset` wells (`rounded-xl`, `p-3`) with an
11px uppercase column heading, and each card as `<Card interactive className="py-4">`. Prefer the
table first.

### 32.7 Project creation

A `Dialog` (not a separate page — `EmployeeEditDialog` and `JobRoleDialog` are the precedent),
`max-w-lg` default or `max-w-2xl` if the form is long, with `react-hook-form` + a Zod resolver from
`src/validations/project.schema.ts`:

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogTrigger asChild><Button><Plus className="size-4" />New project</Button></DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>New project</DialogTitle>
      <DialogDescription>Name it, set an owner and a due date. You can add tasks afterwards.</DialogDescription>
    </DialogHeader>
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField … name="name"     … />   {/* Input */}
        <FormField … name="summary"  … />   {/* Textarea */}
        <FormField … name="ownerId"  … />   {/* Select */}
        <FormField … name="dueDate"  … />   {/* <Input type="date" /> */}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" loading={form.formState.isSubmitting}>Create project</Button>
        </DialogFooter>
      </form>
    </Form>
  </DialogContent>
</Dialog>
```

On success: `toast.success("Project created.")` → `onSaved()` → parent `refresh()` → close.
On failure: `toast.error(err instanceof ApiClientError ? err.message : "Couldn't create that project.")`,
**leaving the dialog open** so typed input is not lost (the rule `attendance-manager.tsx` follows).

### 32.8 Project dashboard

Mirror `admin-dashboard.tsx` (§26.1): `PageHeader` → 4 `StatCard`s at
`sm:grid-cols-2 xl:grid-cols-4` → a highlight `Card` with nested `StatCard`s → a
`lg:grid-cols-2` pair of chart `Card`s → a "Recent activity" `Card` with a `divide-y` list.

Charts: a **stacked `AreaChart`** of projects created/completed per month using the *status* colours,
and a **horizontal `BarChart`** of projects per team/client using `CHART_PALETTE` with
`stroke={barStroke}`. Import all styling from `chart-theme.ts`. Every chart gets an
`<EmptyState … inset={false} />` fallback.

Completion percentage: `Progress` with the caption pattern from §26.4. No trend chips.

---

## 33. Do's and Don'ts

### 33.1 Quick contrast table

| ✅ Do | ❌ Don't |
| --- | --- |
| `className="bg-primary"` | `className="bg-[#0AEA0A]"` |
| `text-primary-ink` for green text | `text-primary` for green text |
| `bg-success/12 text-success-ink` | `bg-success text-white` |
| `hover:bg-accent/60` | `hover:bg-gray-100` |
| `<Card>` | `<div className="bg-white/60 backdrop-blur-xl rounded-2xl shadow-lg">` |
| `glass-inset` on a control | `border border-gray-200` |
| `rounded-lg` (18px) | `rounded-[12px]` |
| brand glow `0 6px 18px -8px …brand 60%` | `shadow-lg` |
| `duration-200 ease-standard` | `duration-[250ms] ease-in-out` |
| `transition-[background-color,box-shadow]` | `transition-all` |
| `<Button loading={saving}>Save</Button>` | `<Button disabled>{saving ? "Saving…" : "Save"}</Button>` |
| `<EmptyState … />` | a bespoke "no data" div |
| `<Skeleton className="h-28 rounded-xl" />` shaped like the content | a centred spinner |
| `<ConfirmDialog destructive … />` | `window.confirm(...)` |
| `toast.error(err instanceof ApiClientError ? err.message : "…")` | `alert(err)` |
| `formatDate(value)` from `src/lib/date.ts` | `new Date(y, m, d).toLocaleDateString()` |
| `ROUTES.adminProjects` | `"/admin/projects"` in a `Link` |
| `cn(...)` | template-literal class concatenation |
| `size-4` Lucide icons | a second icon library |
| `<Icon />` inside a `Button` (auto-sized) | `<Icon className="h-4 w-4" />` inside a `Button` |
| `tabular-nums` on figures | proportional digits in a column |
| `min-w-0` + `truncate` on user text | letting a long name blow out the grid |
| Server page → `"use client"` manager | a whole page marked `"use client"` |
| Gate the page with the same function as the endpoint | gate only the endpoint |

### 33.2 The five rules most likely to be broken

1. **`text-primary` instead of `text-primary-ink`.** It compiles, it looks fine in dark mode, and it is 1.64:1 in light mode. Grep your diff for `text-primary\b`, `text-success\b`, `text-warning\b`, `text-destructive\b` — in the current codebase every one of those is followed by `-ink`.
2. **Hand-rolled glass.** It bypasses `prefers-reduced-transparency` and `@media print`.
3. **Arbitrary radii.** `rounded-lg` is 18px here, not 8px. Nothing may use `rounded-[Npx]`.
4. **`shadow-lg` / neutral shadows.** Elevation is a *brand glow*; a neutral shadow reads grey against the green-cast system.
5. **A second `<Toaster>` or a page-level `"use client"`.** Both work and both are wrong.

---

## Existing UI Inconsistencies

Documented rather than silently normalised, as required. None is a visual defect a user would
notice; all are places where a new developer could reasonably be confused about which pattern to
follow.

### I-1. `--shadow-glass-*` tokens are declared but never used

- **What:** `--shadow-glass-sm`, `--shadow-glass`, `--shadow-glass-lg`, `--shadow-glass-xl` in `@theme inline`. **0 usages** of the resulting `shadow-glass-*` utilities in `src/`.
- **Where:** `src/app/globals.css`.
- **Majority pattern:** the `@utility glass*` blocks inline their own equivalent stacks so they can also set `background-color` and `backdrop-filter`.
- **Follow:** use the `glass*` utilities. Reach for `shadow-glass` only if you need the shadow *without* the blur and rim.

### I-2. `press` and `glass-hairline` utilities are declared but never used

- **What:** `@utility press` (`active:scale(0.97)`) and `@utility glass-hairline`. Neither appears as a class anywhere.
- **Majority pattern:** buttons inline `active:scale-[0.97]`; rims come with the glass utilities.
- **Follow:** inline `active:scale-[0.97]`, matching `button.tsx`. Both utilities are legitimate if you want them; just know you would be the first caller.

### I-3. `--glass-border`, `--blur-glass` and `--radius-3xl` are unreferenced

- **What:** `--glass-border` (declared in both themes) is used by no utility or component; `blur-glass` and `rounded-3xl` have 0 usages.
- **Follow:** ignore them. Rims use `--glass-hairline`; the largest radius in use is `rounded-2xl`.

### I-4. `--duration-*` tokens vs Tailwind's `duration-*` classes

- **What:** `--duration-base` is **220ms**, but components write `duration-200` (200ms). Likewise `--duration-fast` 150ms ≈ `duration-150`, `--duration-slow` 300ms = `duration-300`. So the tokens are honoured exactly only inside the `@utility` blocks.
- **Where:** every component with a transition.
- **Majority pattern:** `duration-200 ease-standard` in components (19 uses).
- **Follow:** **the majority.** Write `duration-200 ease-standard`. A 20ms difference is invisible and consistency with 19 existing call sites is worth more.

### I-5. Focus ring: `Input` is 3-layer, `Textarea` / `SelectTrigger` are 2-layer

- **What:** `Input` uses `inset 1px ring` + `0 0 0 1px var(--ring-edge)` + `0 0 0 4px ring 30%`. `Textarea` and `SelectTrigger` use `inset 1px ring` + `0 0 0 3px ring 28%` — **no `--ring-edge` layer, 3px instead of 4px, 28% instead of 30%.**
- **Where:** `input.tsx` vs `textarea.tsx`, `select.tsx`.
- **Majority pattern:** by file count the 2-layer form is more common (2 of 3); `input.tsx` carries the comment explaining *why* `--ring-edge` exists, so it appears to be the intended, later refinement.
- **Follow:** match the control you are copying. For a **new** control, prefer the `Input` (3-layer) form — it is the one the codebase argues for. Do not "fix" the existing two in a Projects PR.

### I-6. `CardTitle`'s default size is overridden almost everywhere it appears

- **What:** `CardTitle` ships at `text-[0.9375rem]` (15px). Both dashboards pass `className="text-base"` (16px); all ten auth pages pass `className="text-2xl"` (24px).
- **Where:** `card.tsx` vs `admin-dashboard.tsx`, `employee-dashboard.tsx`, `(auth)/**`.
- **Majority pattern:** inside the app shell → `text-base`; on a full-screen auth card → `text-2xl`.
- **Follow:** pass `text-base` for a dashboard/section card. Do not change the component default.

### I-7. `viewport.themeColor` hexes are hand-maintained duplicates of `--background`

- **What:** `src/app/layout.tsx` hard-codes `#f5f9f5` and `#070f09`. They currently match `--background` in both themes exactly (verified by conversion), but nothing enforces it.
- **Follow:** if you ever retune `--background`, update these two literals in the same change. **This is the only legitimate hex literal in the application** — do not treat it as licence for others.

### I-8. Loading copy: the `loading` prop vs a swapped label

- **What:** `Button` has a `loading` prop that keeps the label and prepends a spinner. `ConfirmDialog` instead swaps the label to `"Working…"` on `AlertDialogAction` (which is not a `Button` and has no `loading` prop).
- **Majority pattern:** the `loading` prop.
- **Follow:** use `loading` on real `Button`s. `ConfirmDialog` already handles its own case — just use the component.

### I-9. `glass-subtle` is not flattened for print

- **What:** the `@media print` block flattens `.glass`, `.glass-strong` and `.glass-inset`, but **not `.glass-subtle`** — which is the table header, the thing most likely to be printed.
- **Where:** `src/app/globals.css`, print block.
- **Impact:** a printed table header keeps a translucent fill and its inset rims. Minor; the header is legible either way, and `thead { display: table-header-group }` still repeats it correctly.
- **Follow:** **do not fix this inside a Projects PR** (it is a global CSS change affecting every existing screen). Note it, and if a Projects report is meant to be printed, raise it separately.

### I-10. Screen name vs endpoint name may diverge deliberately

- **What:** the Staff screen is `/admin/staff` while its endpoints are `/api/admin/employees`. `AGENTS.md` states this is deliberate and instructs: *"Don't tidy either half into agreeing with the other."*
- **Follow:** for **new** work, keep them in step (`/admin/projects` ↔ `/api/admin/projects`). Just do not read the Staff mismatch as a convention to copy.

---

## 34. Source Code References

```text
DESIGN SYSTEM CORE
  src/app/globals.css                        ★ every token, glass utility, motion curve,
                                               print + reduced-motion + reduced-transparency
  src/app/layout.tsx                           fonts, providers, Toaster, themeColor
  src/components/providers/theme-provider.tsx  next-themes wrapper
  src/lib/utils.ts                             cn(), initialsOf()
  src/lib/brand.ts                             BRAND_NAME, BRAND_COLORS, productSuffix
  components.json                              shadcn config (new-york, lucide, cssVariables)
  postcss.config.mjs                           @tailwindcss/postcss
  (no tailwind.config.ts — Tailwind v4 is configured in CSS)

UI PRIMITIVES — src/components/ui/
  button.tsx  card.tsx  input.tsx  textarea.tsx  label.tsx  form.tsx
  select.tsx  badge.tsx  table.tsx  dialog.tsx  alert-dialog.tsx
  dropdown-menu.tsx  popover.tsx  tooltip.tsx  tabs.tsx  avatar.tsx
  switch.tsx  progress.tsx  separator.tsx  skeleton.tsx  sonner.tsx
  pagination-controls.tsx  sort-button.tsx

SHARED
  src/components/shared/stat-card.tsx          StatCard + StatCardSkeleton
  src/components/shared/empty-state.tsx        EmptyState
  src/components/shared/confirm-dialog.tsx     ConfirmDialog
  src/components/shared/theme-toggle.tsx       ThemeToggle
  src/components/shared/leave-status-badge.tsx        status-badge pattern
  src/components/shared/attendance-status-badge.tsx   status-badge pattern
  src/components/complaints/complaint-status-badge.tsx status-badge pattern

LAYOUT
  src/components/layout/app-shell.tsx        ★ sidebar + topbar + main, mobile drawer
  src/components/layout/nav-config.ts        ★ NavItem, ADMIN_NAV, visibleNav, isActiveRoute
  src/components/layout/page-header.tsx        PageHeader
  src/components/layout/zovencia-logo.tsx      ZovenciaLogo (only file naming a logo path)
  src/components/layout/user-menu.tsx          account dropdown
  src/components/layout/global-search.tsx      anchored results panel pattern

PAGE / ROUTE TEMPLATES
  src/app/(admin)/admin/layout.tsx             admin shell + DB-resolved grants
  src/app/(admin)/admin/page.tsx               admin dashboard page
  src/app/(admin)/admin/staff/page.tsx       ★ the page template to copy
  src/app/(admin)/admin/staff/[id]/page.tsx    detail page (and its documented gating lesson)
  src/app/(employee)/layout.tsx                employee shell
  src/app/(auth)/layout.tsx                    full-screen aurora template
  src/app/page.tsx                             landing
  src/app/loading.tsx  error.tsx  not-found.tsx   global states

CANONICAL SCREENS TO COPY
  src/components/leaves/leave-table.tsx      ★ filter + table + paging + all four states
  src/components/admin/employee-manager.tsx  ★ table + row actions + dialogs + toasts
  src/components/admin/staff-manager.tsx       Tabs over two tables
  src/components/dashboard/admin-dashboard.tsx ★ dashboard composition + skeleton
  src/components/dashboard/employee-dashboard.tsx  progress + balance card
  src/components/admin/attendance-manager.tsx  tiles + date nav + mark dialog
  src/components/admin/complaint-manager.tsx   list/detail + resolution flow
  src/components/admin/report-people-picker.tsx    server-filtered multi-select
  src/components/admin/admin-recipient-picker.tsx  client-filtered multi-select

CHARTS
  src/components/charts/chart-theme.ts       ★ palette, axis, grid, tooltip styles
  src/components/charts/leave-trend-chart.tsx  stacked area
  src/components/charts/department-chart.tsx   horizontal bar

HOOKS
  src/hooks/use-api-resource.ts              ★ { data, error, loading, refresh }
  src/hooks/use-debounced-value.ts
  src/hooks/use-employee-table.ts            ★ table-state hook template
  src/hooks/use-leave-table.ts                 + exportUrl
  src/hooks/use-countdown.ts

DATA / UTIL
  src/lib/api-client.ts                        apiClient, ApiClientError, toQueryString
  src/lib/date.ts                            ★ all date formatting and UTC normalisation
  src/lib/constants.ts                         ROUTES + policy constants
  src/lib/serialize.ts                         Date → ISO across the RSC boundary
  src/lib/csv.ts                               escapeCsvCell
  src/types/index.ts                           Pagination and every view type
  src/validations/*.schema.ts                  shared Zod schemas

BRAND ASSETS
  public/brand/zovencia-mark.png               standalone Z — both themes
  public/brand/zovencia-full-black.png         wordmark for light ground
  public/brand/zovencia-full-white.png         wordmark for dark ground
  public/brand/email/                          trimmed copies for email
  src/app/icon.png  apple-icon.png  public/favicon.ico

PROJECT DOCTRINE
  AGENTS.md   ★ architecture, layering, permission model, and the reasoning behind them
  README.md     setup + endpoint tables
```

---

## 35. Developer Quick Reference

*Keep this section open while coding.*

### Colours

```
Fills      bg-primary  bg-success  bg-warning  bg-destructive  bg-secondary  bg-muted
Green text text-primary-ink        (NEVER text-primary)
Status text text-success-ink  text-warning-ink  text-destructive-ink
Body       text-foreground · text-muted-foreground
Hover      hover:bg-accent/40|45|60|70
Selected   bg-brand/12 + shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--brand)_28%,transparent)]
Tinted pill bg-{tone}/12  +  text-{tone}-ink   (warning uses /15)
Brand      #0AEA0A  ·  Deep #023506  ·  BG light #F5F9F5  ·  BG dark #070F09
```

### Typography

```
Page title    text-[1.75rem] font-semibold tracking-[-0.028em] leading-tight   (PageHeader)
Section title text-xl font-semibold tracking-[-0.02em]
Dialog title  text-lg font-semibold tracking-[-0.018em] leading-tight
Card title    text-base font-semibold      (pass className="text-base")
Stat value    text-[2rem] font-semibold tracking-[-0.03em] leading-none tabular-nums
Body          text-sm
Caption       text-xs text-muted-foreground
Eyebrow/TH    text-[0.6875rem] font-semibold tracking-[0.06em] uppercase text-muted-foreground
Weights       font-medium (500) · font-semibold (600)      — no bold
Numbers       always tabular-nums
```

### Glass

```
glass          panels, topbar         white@62% · blur 20px · sat 180%
glass-strong   dialogs, menus, toasts white@78% · blur 28px
glass-subtle   table header/footer    white@42% · blur 12px · no drop shadow
glass-inset    inputs, tabs track, wells   card@55% · no blur · inset shadow
glass-sidebar  the nav slab           #092411@90/72% · blur 26px · re-scopes tokens
```

### Radius

```
rounded-sm  10px   tooltip · sm button · menu item
rounded-md  14px   button · nav item · tab pill · stat icon tile
rounded-lg  18px   input · select · menu panel · tabs track · lg button
rounded-xl  24px   CARD · topbar · popover · toast · empty state
rounded-2xl 30px   dialog · sidebar
rounded-full       badge · avatar · switch · progress
```

### Shadows

```
Elevation = BRAND GLOW, not grey.
rest  : 0 6px 18px -8px color-mix(in oklab, var(--brand) 60%, transparent)
hover : 0 12px 30px -8px color-mix(in oklab, var(--brand) 78%, transparent)
sheen : inset 0 1px 0 0 oklch(1 0 0/38%), inset 0 7px 14px -8px oklch(1 0 0/30%)
rim   : inset 0 0 0 1px color-mix(in oklab, var(--brand) 28%, transparent)
```

### Buttons

```
<Button>                        green, semibold — one per screen
<Button variant="outline">      the default secondary
<Button variant="ghost">        icon buttons, "Clear"
<Button variant="destructive">  delete
<Button variant="secondary">    quiet
<Button variant="link">         inline nav
sizes: default h-9 · sm h-8 · lg h-11 · icon size-9 · icon-sm size-8
<Button loading={busy}>Save</Button>
<Button asChild><Link href={ROUTES.x}><Icon className="size-4" />Go</Link></Button>
```

### Cards

```tsx
<Card>                                        {/* in-shell panel */}
<Card className="py-0">                       {/* table card */}
<Card glass>                                  {/* floating on the aurora */}
<Card interactive>                            {/* clickable / hover-lift */}
<CardHeader><CardTitle className="flex items-center gap-2 text-base">
  <Icon className="text-primary-ink size-4" aria-hidden />Title</CardTitle>
  <CardDescription>…</CardDescription></CardHeader>
<CardContent>…</CardContent>
```

### Inputs

```tsx
<Input />                     {/* h-10 rounded-lg glass-inset border-0 */}
<Input className="pl-9" />    {/* with the absolutely-positioned Search icon */}
<Textarea />                  {/* min-h-20, field-sizing-content */}
<Select><SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
  <SelectContent><SelectItem value="ALL">All statuses</SelectItem>…</SelectContent></Select>
{/* Always inside FormField/FormItem/FormControl — aria-invalid is wired for you */}
```

### Navigation

```
Sidebar   16.5rem · fixed inset-y-3 left-3 · rounded-2xl · glass-sidebar · z-50
Content   lg:pl-[17.5rem]
Topbar    h-14 · glass · rounded-xl · sticky top-0 z-30 · wrapper px-3 pt-3 sm:px-4 lg:pr-4
Main      flex-1 px-3 py-6 sm:px-4 lg:pr-4    (no max-width container)
Nav item  rounded-md px-3 py-2.5 text-sm font-medium gap-3
Active    text-primary-ink bg-brand/15 + brand rim 28% + 3px rail (scaleY, 300ms ease-spring)
```

### Responsive

```
sm 640px   (91 uses)  — the main layout breakpoint
md 768px   (4)        — input font-size, landing headline only
lg 1024px  (40)       — sidebar becomes fixed; filter bars go horizontal
xl 1280px  (9)        — 4/5-up stat grids
2xl        (0)        — unused
Common: grid gap-4 sm:grid-cols-2 xl:grid-cols-4
```

### Animation

```
duration-200 ease-standard      default
duration-300 ease-spring        travel (rail, drawer, switch thumb)
duration-150                    colour-only, exits
motion-pop                      on every Radix surface
active:scale-[0.97]             buttons     active:scale-[0.98]  rows/tabs
transition-[named,properties]   never transition-all
```

### Component reuse — the ten that matter most

1. `Card` + slots — `ui/card.tsx`
2. `Button` — `ui/button.tsx`
3. `Table` family + `SortButton` + `PaginationControls`
4. `StatCard` / `StatCardSkeleton` — `shared/stat-card.tsx`
5. `EmptyState` — `shared/empty-state.tsx`
6. `ConfirmDialog` — `shared/confirm-dialog.tsx`
7. `Dialog` + `Form` + `Input`/`Select`/`Textarea`
8. `Badge` (+ a `ProjectStatusBadge` in the established shape)
9. `PageHeader` — `layout/page-header.tsx`
10. `useApiResource` + `useDebouncedValue` + `apiClient` + `src/lib/date.ts`

---

## 36. Final Design System Checklist

Run this over a Projects PR before review.

**Colour**
- [ ] No hex, `rgb()` or hue-bearing `oklch()` in any `.tsx` (white/black alpha inside `shadow-[...]` excepted).
- [ ] `grep -n "text-primary\b\|text-success\b\|text-warning\b\|text-destructive\b"` returns nothing — every one is `-ink`.
- [ ] No `-ink` token used as a background.
- [ ] Every hover is `bg-accent/N`.
- [ ] Selection uses `bg-brand/12` + brand rim.

**Surfaces**
- [ ] No hand-rolled `backdrop-blur` + `bg-white/N`; every panel is `Card` or a `glass*` utility.
- [ ] Form controls are `glass-inset` with `border-0`.
- [ ] Rims are `inset 0 0 0 1px`; real borders only on dividers, alpha-reduced.

**Radius & shadow**
- [ ] Only `rounded-{sm,md,lg,xl,2xl,full}`; no `rounded-[Npx]`.
- [ ] Elevation is a brand/tone glow, not `shadow-lg`.

**Typography**
- [ ] No new font, no `font-bold`.
- [ ] Headings carry the tracking from §7.4.
- [ ] Uppercase eyebrows are 11px / 600 / `tracking-[0.06em]`.
- [ ] Every comparable figure has `tabular-nums`.

**Motion**
- [ ] No Framer Motion / GSAP added.
- [ ] `duration-200 ease-standard` (or `300`/`spring` for travel).
- [ ] Any new Radix surface carries `motion-pop`.
- [ ] No `transition-all`.
- [ ] No new `@keyframes`.

**Icons**
- [ ] Lucide only, default stroke.
- [ ] `size-4` unless §20.2 says otherwise; no size class inside buttons/menu items.
- [ ] `aria-hidden` on decorative; `aria-label` on icon-only buttons.

**Structure & behaviour**
- [ ] Page = `<PageHeader>` + `space-y-4`/`grid gap-4`; no max-width wrapper; no self-rendered `AppShell`.
- [ ] `export const metadata` set.
- [ ] States branch `loading → error → empty → data`.
- [ ] Skeletons mirror the real layout (`StatCardSkeleton` for tiles).
- [ ] Empty state distinguishes "no data" from "no matches", and the latter offers "Clear filters".
- [ ] Destructive actions go through `ConfirmDialog` (controlled if launched from a menu).
- [ ] `toast.success` past tense; `toast.error` prefers `ApiClientError.message`.
- [ ] Mutations are followed by `refresh()`.
- [ ] Path added to `ROUTES`; no literal paths in `Link`.
- [ ] Dates via `src/lib/date.ts`; no `date-fns`, no `new Date(y,m,d)`.
- [ ] No `zustand`.
- [ ] Nav item added to `nav-config.ts` with `group: "Manage"` and no `exact`.

**Theme & responsive**
- [ ] Verified in light **and** dark, and with the system setting.
- [ ] No `dark:` colour overrides beyond overlays/logo.
- [ ] Verified at 375px, 768px and 1440px.
- [ ] Tables scroll horizontally; the page body never does.
- [ ] `min-w-0` + `truncate` on every user-supplied string.

**Accessibility & environment**
- [ ] Keyboard-navigable; focus rings visible.
- [ ] Checked with `prefers-reduced-motion` and `prefers-reduced-transparency`.
- [ ] Printed at least one screen (`no-print` on chrome, tables repeat their header).

**Repository gate — `AGENTS.md` requires all four to pass**

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

- [ ] Layering respected: `route handler → service → repository → prisma`; only repositories import `prisma`.
- [ ] Validation lives in `src/validations/`, shared by form and handler.
- [ ] Any new page is gated with the **same function** its endpoint uses.
- [ ] No test that reaches for Prisma.

---

*End of specification. Generated by reverse-engineering the Zovencia Presence codebase at commit
`a02cc49` on 2026-08-20. Every value is cited to its source file; anything not found in the code is
marked **[Not defined]**, and anything concluded from repetition rather than declaration is marked
**[Inferred]**.*
