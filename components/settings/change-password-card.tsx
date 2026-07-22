"use client";

import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import { FormField } from "@/components/forms/form-controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAppContext } from "@/contexts/app-context";
import {
  changePassword,
  MIN_PASSWORD_LENGTH,
  validateChangePassword,
  type ChangePasswordFields,
} from "@/lib/auth/change-password";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  visible: boolean;
  onToggleVisible: () => void;
  disabled?: boolean;
  invalid?: boolean;
};

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  visible,
  onToggleVisible,
  disabled,
  invalid,
}: PasswordFieldProps) {
  return (
    <FormField id={id} label={label}>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          className="h-10 bg-surface-sunken/60 pr-10 dark:bg-input/40"
        />
        <button
          type="button"
          onClick={onToggleVisible}
          disabled={disabled}
          className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        >
          {visible ? (
            <EyeOff className="size-4" />
          ) : (
            <Eye className="size-4" />
          )}
        </button>
      </div>
    </FormField>
  );
}

const EMPTY_FIELDS: ChangePasswordFields = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

export function ChangePasswordCard() {
  const supabase = useMemo(() => createClient()!, []);
  const { user } = useAppContext();
  const [fields, setFields] = useState<ChangePasswordFields>(EMPTY_FIELDS);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fieldError, setFieldError] = useState<
    keyof ChangePasswordFields | null
  >(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const email = user?.email?.trim() ?? "";

  function updateField<K extends keyof ChangePasswordFields>(
    key: K,
    value: ChangePasswordFields[K],
  ) {
    setFields((current) => ({ ...current, [key]: value }));
    setFieldError(null);
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldError(null);

    if (!email) {
      setFormError(
        "Não foi possível identificar o e-mail da conta para alterar a senha.",
      );
      return;
    }

    const validation = validateChangePassword(fields);
    if (!validation.ok) {
      setFormError(validation.message);
      setFieldError(validation.field ?? null);
      return;
    }

    setSaving(true);

    const result = await changePassword(supabase, email, fields);

    setSaving(false);

    if (!result.ok) {
      setFormError(result.message);
      if (result.message === "Senha atual incorreta.") {
        setFieldError("currentPassword");
      }
      toast.error(result.message);
      return;
    }

    setFields(EMPTY_FIELDS);
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    toast.success("Senha alterada com sucesso.");
  }

  return (
    <Card className="animate-enter border-border/50 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-semibold">
          <KeyRound className="size-5 text-primary" />
          Alterar senha
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Defina uma nova senha para o login. Mínimo de {MIN_PASSWORD_LENGTH}{" "}
            caracteres.
          </p>

          {formError ? (
            <p
              className={cn(
                "rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive",
              )}
              role="alert"
              data-testid="change-password-error"
            >
              {formError}
            </p>
          ) : null}

          <PasswordField
            id="current-password"
            label="Senha atual"
            value={fields.currentPassword}
            onChange={(value) => updateField("currentPassword", value)}
            autoComplete="current-password"
            visible={showCurrent}
            onToggleVisible={() => setShowCurrent((value) => !value)}
            disabled={saving || !email}
            invalid={fieldError === "currentPassword"}
          />

          <PasswordField
            id="new-password"
            label="Nova senha"
            value={fields.newPassword}
            onChange={(value) => updateField("newPassword", value)}
            autoComplete="new-password"
            visible={showNew}
            onToggleVisible={() => setShowNew((value) => !value)}
            disabled={saving || !email}
            invalid={fieldError === "newPassword"}
          />

          <PasswordField
            id="confirm-new-password"
            label="Confirmar nova senha"
            value={fields.confirmPassword}
            onChange={(value) => updateField("confirmPassword", value)}
            autoComplete="new-password"
            visible={showConfirm}
            onToggleVisible={() => setShowConfirm((value) => !value)}
            disabled={saving || !email}
            invalid={fieldError === "confirmPassword"}
          />

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="submit"
              disabled={saving || !email}
              data-testid="change-password-submit"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar nova senha"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
