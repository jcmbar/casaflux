import Link from "next/link";

import {
  BRAND_NAME,
  BRAND_TAGLINE,
  brandMarkForSurface,
  brandMarkSrc,
  type BrandMarkVariant,
  type BrandSurface,
} from "@/lib/brand";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  /** Pass `null` to render without a link. */
  href?: string | null;
  /** Prefer `surface` so usage stays consistent with the brand map. */
  surface?: BrandSurface;
  /** Explicit override when surface mapping is not enough. */
  variant?: BrandMarkVariant;
  size?: "sm" | "md" | "lg";
  orientation?: "vertical" | "horizontal";
  showTagline?: boolean;
  className?: string;
};

const sizeClasses = {
  sm: {
    mark: "size-8",
    name: "text-base",
    tagline: "text-xs",
  },
  md: {
    mark: "size-10",
    name: "text-xl",
    tagline: "text-xs",
  },
  lg: {
    mark: "size-12",
    name: "text-2xl",
    tagline: "text-sm",
  },
};

function resolveVariant(
  surface: BrandSurface | undefined,
  variant: BrandMarkVariant | undefined,
): BrandMarkVariant {
  if (variant) return variant;
  if (surface) return brandMarkForSurface(surface);
  return "institutional";
}

export function BrandMark({
  href = "/",
  surface,
  variant,
  size = "md",
  orientation = "vertical",
  showTagline,
  className,
}: BrandMarkProps) {
  const resolved = resolveVariant(surface, variant);
  const sizes = sizeClasses[size];
  const isHorizontal = orientation === "horizontal";
  const taglineVisible =
    showTagline ?? (orientation === "vertical" || size !== "sm");

  const content = (
    <div
      className={cn(
        "flex items-center",
        isHorizontal ? "flex-row gap-2.5" : "flex-col gap-3",
        className,
      )}
      data-brand-variant={resolved}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- brand SVGs from /public */}
      <img
        src={brandMarkSrc(resolved)}
        alt=""
        width={48}
        height={48}
        className={cn("shrink-0", sizes.mark)}
        aria-hidden
      />
      <div className={isHorizontal ? "min-w-0 text-left" : "text-center"}>
        <p
          className={cn(
            "font-semibold tracking-tight text-foreground",
            sizes.name,
          )}
        >
          {BRAND_NAME}
        </p>
        {taglineVisible ? (
          <p
            className={cn(
              "text-muted-foreground",
              isHorizontal && "truncate",
              sizes.tagline,
            )}
          >
            {BRAND_TAGLINE}
          </p>
        ) : null}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="transition-opacity hover:opacity-80"
        aria-label={BRAND_NAME}
      >
        {content}
      </Link>
    );
  }

  return content;
}

/** Icon-only compact mark (B) for tight UI chrome. */
export function BrandMarkCompact({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- brand SVGs from /public
    <img
      src={brandMarkSrc("compact")}
      alt={BRAND_NAME}
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      data-brand-variant="compact"
    />
  );
}
