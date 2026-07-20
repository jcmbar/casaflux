/**
 * CasaFlux brand system (V1)
 *
 * Compact (B): small functional surfaces — favicon, app icon, icon-only UI.
 * Institutional (A): larger brand surfaces — login, sidebar, onboarding, headers.
 * Experimental (C): do not use as default; kept for future exploration only.
 */

export const BRAND_COLOR = "#0f766e";

export const BRAND_NAME = "CasaFlux";

export const BRAND_TAGLINE = "Finanças familiares";

/** Canonical SVG asset paths under `/public`. */
export const BRAND_MARKS = {
  /** Proposal B — teal tile. Official compact / app icon mark. */
  compact: "/brand/mark-compact.svg",
  /** Proposal A — monoline house + flow. Larger institutional surfaces. */
  institutional: "/brand/mark-institutional.svg",
  /**
   * Proposal C — abstract frame. Not a product default in V1.
   * Keep for exploration only; do not wire into UI without an explicit decision.
   */
  experimental: "/brand/mark-experimental.svg",
} as const;

export type BrandMarkVariant = "compact" | "institutional";

/**
 * Product surfaces that need a brand mark.
 * Favicon / apple-icon / app/icon.svg are wired to compact outside React.
 */
export type BrandSurface =
  | "favicon"
  | "app_icon"
  | "sidebar_expanded"
  | "sidebar_collapsed"
  | "mobile_nav"
  | "login"
  | "onboarding"
  | "header"
  | "icon_only";

const SURFACE_MARK: Record<BrandSurface, BrandMarkVariant> = {
  favicon: "compact",
  app_icon: "compact",
  sidebar_collapsed: "compact",
  icon_only: "compact",
  sidebar_expanded: "institutional",
  mobile_nav: "institutional",
  login: "institutional",
  onboarding: "institutional",
  header: "institutional",
};

/** Resolves which mark to render for a given product surface. */
export function brandMarkForSurface(surface: BrandSurface): BrandMarkVariant {
  return SURFACE_MARK[surface];
}

export function brandMarkSrc(variant: BrandMarkVariant): string {
  return BRAND_MARKS[variant];
}
