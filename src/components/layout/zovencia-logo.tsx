import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * The Zovencia brand mark, in the two shapes it officially comes in.
 *
 * **The only place a logo file is named.** Every surface asks this for a
 * variant and a size; nothing else imports a path from `public/brand`, so
 * replacing the artwork later is one edit rather than eight.
 *
 * The three files are the supplied originals, copied in byte for byte and never
 * cropped, recoloured or redrawn. What this component owns is *which* of them to
 * show and *how big the artwork inside them lands* — see `ASSETS`.
 */

/**
 * Each file's real geometry: the PNG's own dimensions, and the artwork's
 * bounding box inside it.
 *
 * These are measured, not guessed, and they are here because the three files
 * were exported with **very different amounts of transparent padding**. The
 * black wordmark's artwork fills 88% of its file's height; the white one fills
 * 56%. Drop both into one slot with `object-contain` — the obvious
 * implementation — and the wordmark visibly *shrinks by a third* the moment
 * somebody switches to dark mode. The mark is worse: its artwork is square but
 * its file is half as wide again, so it would sit at 63% of any square slot with
 * the rest as invisible margin, and no two call sites would agree on how big
 * "size 8" looked.
 *
 * So a caller asks for the height of the **artwork** and `sizeFor` works
 * backwards to the file box that puts it there. Because every file centres its
 * artwork, the boxes differ in size while the ink lands identically — which is
 * what makes a theme switch move nothing on screen.
 *
 * Trimming the padding out of the files would be the other fix, and it is not
 * ours to make: these are the official assets exactly as supplied.
 */
const ASSETS = {
  /**
   * The standalone Z. **One file, both themes, permanently** — the mark is a
   * green gradient that carries itself on light and dark ground alike, and the
   * brief is explicit that it never varies.
   */
  mark: { src: "/brand/zovencia-mark.png", boxW: 3430, boxH: 2437, artW: 2165, artH: 2124 },

  /** Z + ZOVENCIA with a black wordmark — for light ground. */
  fullBlack: { src: "/brand/zovencia-full-black.png", boxW: 2984, boxH: 454, artW: 2688, artH: 398 },

  /** Z + ZOVENCIA with a white wordmark — for dark ground. */
  fullWhite: { src: "/brand/zovencia-full-white.png", boxW: 2420, boxH: 632, artW: 2370, artH: 352 },
} as const;

type Asset = (typeof ASSETS)[keyof typeof ASSETS];

/**
 * The file box that renders this asset's artwork at `artHeight` pixels tall.
 *
 * The overhang is transparent, so it is allowed to spill outside the layout box
 * the wrapper reserves — see the `full` and `mark` renderers below.
 */
function sizeFor(asset: Asset, artHeight: number) {
  const height = Math.round((artHeight * asset.boxH) / asset.artH);
  const width = Math.round((height * asset.boxW) / asset.boxH);
  const artWidth = Math.round((artHeight * asset.artW) / asset.artH);

  return { width, height, artWidth };
}

/**
 * How tall the *artwork* should be, in pixels, for each named size.
 *
 * One scale for the whole application, so the sidebar, the sign-in screens and
 * the landing page cannot each settle on their own idea of the right size.
 */
const ART_HEIGHT = {
  /**
   * The logo standing in for a **word** in a line of text.
   *
   * Sized to the cap height of the copy beside it rather than to the line, so
   * `full` reads as the word ZOVENCIA in a sentence rather than as a picture
   * dropped into one. It is the only size the full wordmark fits the sidebar
   * at: at `sm` the artwork alone is 135px, and with the product name after it
   * that overruns a 16.5rem panel.
   */
  xs: 16,
  /** Beside a hamburger, or anywhere the chrome is already tight. */
  sm: 20,
  /** The default: sidebar headers, sign-in headers. */
  md: 26,
  /** Standalone branding with room around it. */
  lg: 34,
} as const;

type LogoSize = keyof typeof ART_HEIGHT;

/**
 * Which ground the logo is sitting on, for `variant="full"` only.
 *
 * `auto` follows the theme through the `.dark` class `next-themes` already puts
 * on `<html>` — the application's own mechanism, read in CSS rather than through
 * `useTheme()`. That choice matters twice: it keeps this a **Server Component**,
 * so the sign-in and landing headers do not have to become client components to
 * show a logo, and it swaps the file in the same paint as every other themed
 * colour, so there is no mounted-guard flash of the wrong wordmark on load.
 *
 * `dark` is the deliberate exception, and it is not a way round the rule. The
 * sidebar is a dark green slab in **both** themes — `--sidebar` is the same
 * token in the light palette as in the dark one — so a logo that followed the
 * theme there would put a black wordmark on a near-black panel in light mode and
 * be invisible. The brief's rule is about contrast, and on a surface that does
 * not follow the theme, following the theme is what breaks it.
 */
type LogoSurface = "auto" | "dark";

type ZovenciaLogoProps = {
  /** `mark` is the standalone Z; `full` is Z + ZOVENCIA. */
  variant?: "mark" | "full";
  size?: LogoSize;
  /** Only meaningful for `full`. The mark is one file on every ground. */
  surface?: LogoSurface;
  className?: string;
  /**
   * Whether this is the largest logo above the fold on its screen — the sign-in
   * header, the landing header. Everything else stays lazy.
   */
  priority?: boolean;
};

/**
 * One asset, centred on the layout box the wrapper reserved.
 *
 * `loading="eager"` on every one of them, deliberately. A lazily-loaded image
 * that is `display:none` never intersects the viewport, so the browser has no
 * reason to fetch it — and the theme-aware pair below keeps one of the two
 * hidden at all times. It would then start downloading at the moment somebody
 * switched theme, which is the one moment it must already be there.
 */
function LogoImage({
  asset,
  artHeight,
  alt,
  priority,
  className,
}: {
  asset: Asset;
  artHeight: number;
  alt: string;
  priority: boolean;
  className?: string;
}) {
  const { width, height } = sizeFor(asset, artHeight);

  return (
    <Image
      src={asset.src}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      loading="eager"
      className={cn(
        "absolute top-1/2 left-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 object-contain",
        className,
      )}
    />
  );
}

export function ZovenciaLogo({
  variant = "mark",
  size = "md",
  surface = "auto",
  className,
  priority = false,
}: ZovenciaLogoProps) {
  const artHeight = ART_HEIGHT[size];

  // The wrapper is always the size of the *ink*, so a flex row lays out around
  // the artwork rather than around a file that carries invisible margin. The
  // images are centred on it and allowed to overhang into transparency.
  const frame = (artWidth: number, children: React.ReactNode) => (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: artWidth, height: artHeight }}
    >
      {children}
    </span>
  );

  if (variant === "mark") {
    const { artWidth } = sizeFor(ASSETS.mark, artHeight);

    return frame(
      artWidth,
      <LogoImage asset={ASSETS.mark} artHeight={artHeight} alt="Zovencia logo" priority={priority} />,
    );
  }

  const black = sizeFor(ASSETS.fullBlack, artHeight);
  const white = sizeFor(ASSETS.fullWhite, artHeight);

  // Always the white wordmark on ground that is dark whatever the theme says.
  if (surface === "dark") {
    return frame(
      white.artWidth,
      <LogoImage asset={ASSETS.fullWhite} artHeight={artHeight} alt="Zovencia" priority={priority} />,
    );
  }

  /*
    Both wordmarks are rendered and CSS shows one. Toggling with `dark:` rather
    than branching in JavaScript is what makes the swap free of a re-render and
    free of a flash: the class is already on `<html>` before the first paint, so
    the right file is the only one ever shown.

    Neither carries `aria-hidden`. `hidden` is `display:none`, which already
    takes an element out of the accessibility tree — so exactly one "Zovencia"
    is exposed at a time, whichever theme is on. Marking the second one hidden
    would have read correctly in light mode and left dark mode with a logo no
    screen reader could see.

    The layout box is sized once, from the black artwork: the two arts are the
    same shape to within a third of a percent (6.754 against 6.732), so one box
    holds both and a theme switch moves nothing around it.
  */
  return frame(
    black.artWidth,
    <>
      <LogoImage
        asset={ASSETS.fullBlack}
        artHeight={artHeight}
        alt="Zovencia"
        priority={priority}
        className="dark:hidden"
      />
      <LogoImage
        asset={ASSETS.fullWhite}
        artHeight={artHeight}
        alt="Zovencia"
        priority={priority}
        className="hidden dark:block"
      />
    </>,
  );
}
