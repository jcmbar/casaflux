import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const formSelectClassName =
  "flex h-10 w-full rounded-lg border border-input bg-surface-sunken/60 px-2.5 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/40";

type FormFieldProps = {
  id: string;
  label: string;
  children: React.ReactNode;
  className?: string;
};

export function FormField({ id, label, children, className }: FormFieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

type FormInputProps = React.ComponentProps<typeof Input> & {
  id: string;
  label: string;
};

export function FormInput({ id, label, className, ...props }: FormInputProps) {
  return (
    <FormField id={id} label={label}>
      <Input
        id={id}
        className={cn(
          "h-10 bg-surface-sunken/60 dark:bg-input/40",
          className,
        )}
        {...props}
      />
    </FormField>
  );
}

type FormSelectProps = React.ComponentProps<"select"> & {
  id: string;
  label: string;
};

export function FormSelect({
  id,
  label,
  className,
  children,
  ...props
}: FormSelectProps) {
  return (
    <FormField id={id} label={label}>
      <select id={id} className={cn(formSelectClassName, className)} {...props}>
        {children}
      </select>
    </FormField>
  );
}

type FormSectionProps = {
  title?: string;
  children: React.ReactNode;
  className?: string;
};

export function FormSection({ title, children, className }: FormSectionProps) {
  return (
    <div
      className={cn(
        "space-y-3 rounded-xl border border-border/50 bg-muted/20 p-4",
        className,
      )}
    >
      {title ? <p className="text-sm font-medium">{title}</p> : null}
      {children}
    </div>
  );
}
