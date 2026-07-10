import Link from "next/link";
import { SparklesIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type BrandMarkProps = {
  href?: string;
  size?: "sm" | "md" | "lg";
  orientation?: "vertical" | "horizontal";
  className?: string;
};

const sizeClasses = {
  sm: {
    icon: "size-8 rounded-lg",
    iconInner: "size-3.5",
    name: "text-base",
    tagline: "text-xs",
  },
  md: {
    icon: "size-10 rounded-xl",
    iconInner: "size-4",
    name: "text-xl",
    tagline: "text-xs",
  },
  lg: {
    icon: "size-11 rounded-xl",
    iconInner: "size-5",
    name: "text-2xl",
    tagline: "text-sm",
  },
};

export function BrandMark({
  href = "/",
  size = "md",
  orientation = "vertical",
  className,
}: BrandMarkProps) {
  const sizes = sizeClasses[size];
  const isHorizontal = orientation === "horizontal";

  const content = (
    <div
      className={cn(
        "flex items-center",
        isHorizontal ? "flex-row gap-2.5" : "flex-col gap-3",
        className,
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-center bg-primary/10 text-primary shadow-sm ring-1 ring-primary/15",
          sizes.icon,
        )}
      >
        <SparklesIcon className={sizes.iconInner} />
      </div>
      <div className={isHorizontal ? "min-w-0 text-left" : "text-center"}>
        <p
          className={cn(
            "font-semibold tracking-tight text-foreground",
            sizes.name,
          )}
        >
          CasaFlux
        </p>
        {!isHorizontal ? (
          <p className={cn("text-muted-foreground", sizes.tagline)}>
            Finanças familiares
          </p>
        ) : (
          <p className={cn("truncate text-muted-foreground", sizes.tagline)}>
            Finanças familiares
          </p>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="transition-opacity hover:opacity-80">
        {content}
      </Link>
    );
  }

  return content;
}
