"use client";

import Link from "next/link";

import { AuthAtmosphere } from "@/components/auth/auth-atmosphere";
import { BrandMark } from "@/components/auth/brand-mark";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type AuthShellProps = {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function AuthShell({
  title,
  description,
  children,
  footer,
}: AuthShellProps) {
  return (
    <AuthAtmosphere>
      <div className="absolute top-4 right-4 z-10 md:top-6 md:right-6">
        <ThemeToggle />
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6">
        <div className="animate-enter mb-8">
          <BrandMark size="md" />
        </div>

        <div className="animate-enter-delayed w-full max-w-[26rem]">
          <div className="rounded-2xl border border-border/50 bg-card p-7 shadow-md sm:p-8">
            <div className="mb-7 space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            </div>

            {children}

            {footer ? (
              <div
                className={cn(
                  "mt-7 border-t border-border/50 pt-6 text-center text-sm text-muted-foreground",
                )}
              >
                {footer}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </AuthAtmosphere>
  );
}

type AuthFieldProps = {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  minLength?: number;
};

export function AuthField({
  id,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  required,
  autoComplete,
  minLength,
}: AuthFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        minLength={minLength}
        className="h-10 bg-surface-sunken/60 dark:bg-input/40"
      />
    </div>
  );
}

type AuthMessageProps = {
  tone: "success" | "error" | "info";
  children: React.ReactNode;
};

export function AuthMessage({ tone, children }: AuthMessageProps) {
  const toneClass =
    tone === "success"
      ? "border-primary/25 bg-primary/5 text-foreground"
      : tone === "error"
        ? "border-destructive/25 bg-destructive/5 text-destructive"
        : "border-border bg-muted/60 text-foreground";

  return (
    <div className={cn("rounded-lg border px-3 py-2.5 text-sm", toneClass)}>
      {children}
    </div>
  );
}

export function AuthLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("font-medium text-brand-foreground hover:underline", className)}
    >
      {children}
    </Link>
  );
}
