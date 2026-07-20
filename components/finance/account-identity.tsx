"use client";

import type { AccountMode, AccountType } from "@/types/account";
import { ACCOUNT_TYPE_LABELS } from "@/lib/constants";
import {
  resolveAccountIdentity,
  type ResolvedAccountIdentity,
} from "@/lib/finance/institutions";
import { cn } from "@/lib/utils";

export type AccountIdentityAccount = {
  name: string;
  type?: AccountType | null;
  color?: string | null;
  account_mode?: AccountMode | null;
  is_family_shared?: boolean | null;
};

type AccountIdentitySize = "xs" | "sm" | "md" | "lg";

const sizeClass: Record<
  AccountIdentitySize,
  { mark: string; icon: string; monogram: string; gap: string; name: string }
> = {
  xs: {
    mark: "size-5 rounded-md",
    icon: "size-2.5",
    monogram: "text-[8px]",
    gap: "gap-1.5",
    name: "text-xs",
  },
  sm: {
    mark: "size-7 rounded-lg",
    icon: "size-3.5",
    monogram: "text-[10px]",
    gap: "gap-2",
    name: "text-sm",
  },
  md: {
    mark: "size-9 rounded-xl",
    icon: "size-4",
    monogram: "text-[11px]",
    gap: "gap-2.5",
    name: "text-sm",
  },
  lg: {
    mark: "size-10 rounded-xl",
    icon: "size-5",
    monogram: "text-xs",
    gap: "gap-3",
    name: "text-base",
  },
};

function withAlpha(hex: string, alphaHex: string): string {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return `${hex}${alphaHex}`;
  return `#${normalized}${alphaHex}`;
}

export function AccountIdentityMark({
  account,
  size = "md",
  className,
  identity: identityProp,
}: {
  account: AccountIdentityAccount;
  size?: AccountIdentitySize;
  className?: string;
  identity?: ResolvedAccountIdentity;
}) {
  const identity = identityProp ?? resolveAccountIdentity(account);
  const classes = sizeClass[size];
  const color = identity.color;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center ring-1 ring-inset ring-black/5 dark:ring-white/10",
        classes.mark,
        className,
      )}
      style={{
        backgroundColor: withAlpha(color, "1A"),
        color,
      }}
      data-testid="account-identity-mark"
      data-institution={identity.institution.id}
      data-has-logo={identity.hasLogo ? "true" : "false"}
      title={identity.institution.name}
      aria-hidden
    >
      {identity.hasLogo && identity.institution.icon ? (
        <svg
          role="img"
          viewBox="0 0 24 24"
          className={cn(classes.icon, "fill-current")}
          aria-hidden
        >
          <path d={identity.institution.icon.path} />
        </svg>
      ) : (
        <span className={cn("font-semibold leading-none", classes.monogram)}>
          {identity.monogram}
        </span>
      )}
    </span>
  );
}

export type AccountIdentityProps = {
  account: AccountIdentityAccount;
  size?: AccountIdentitySize;
  showName?: boolean;
  showType?: boolean;
  showScope?: boolean;
  description?: string | null;
  className?: string;
  nameClassName?: string;
  metaClassName?: string;
};

/**
 * Shared account visual identity: institution mark + name (+ optional type/scope).
 */
export function AccountIdentity({
  account,
  size = "md",
  showName = true,
  showType = false,
  showScope = false,
  description,
  className,
  nameClassName,
  metaClassName,
}: AccountIdentityProps) {
  const identity = resolveAccountIdentity(account);
  const classes = sizeClass[size];
  const typeLabel = account.type ? ACCOUNT_TYPE_LABELS[account.type] : null;
  const scopeLabel =
    account.is_family_shared == null
      ? null
      : account.is_family_shared
        ? "Familiar"
        : "Pessoal";
  const modeLabel =
    account.account_mode === "forecast" ? "Provisão" : null;

  const metaParts = [
    showType ? typeLabel : null,
    modeLabel,
    showScope ? scopeLabel : null,
  ].filter(Boolean);

  return (
    <span
      className={cn("inline-flex min-w-0 items-center", classes.gap, className)}
      data-testid="account-identity"
      data-institution={identity.institution.id}
    >
      <AccountIdentityMark
        account={account}
        size={size}
        identity={identity}
      />

      {showName ? (
        <span className="min-w-0">
          <span
            className={cn(
              "block truncate font-medium text-foreground",
              classes.name,
              nameClassName,
            )}
          >
            {account.name}
          </span>
          {metaParts.length > 0 ? (
            <span
              className={cn(
                "mt-0.5 block truncate text-xs text-muted-foreground",
                metaClassName,
              )}
            >
              {metaParts.join(" · ")}
            </span>
          ) : null}
          {description ? (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {description}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

/** Compact chip content for selectors / quick-add. */
export function AccountIdentityChipLabel({
  account,
  showType = false,
}: {
  account: AccountIdentityAccount;
  showType?: boolean;
}) {
  return (
    <AccountIdentity
      account={account}
      size="xs"
      showName
      showType={showType}
      className="max-w-[14rem]"
      nameClassName="font-medium"
    />
  );
}
