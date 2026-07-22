"use client";

import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeCategoryKeyword } from "@/lib/finance/user-category-keywords";
import { cn } from "@/lib/utils";

type KeywordChipsInputProps = {
  id?: string;
  label?: string;
  hint?: string;
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  className?: string;
};

function splitRawKeywords(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function KeywordChipsInput({
  id = "category-keywords",
  label = "Palavras-chave de reconhecimento",
  hint = "Usadas na importação quando a descrição contém o termo. Enter ou vírgula para adicionar.",
  value,
  onChange,
  disabled = false,
  className,
}: KeywordChipsInputProps) {
  const [draft, setDraft] = useState("");

  function commitTokens(raw: string) {
    const next = [...value];
    const seen = new Set(value);
    for (const part of splitRawKeywords(raw)) {
      const normalized = normalizeCategoryKeyword(part);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      next.push(normalized);
    }
    onChange(next);
    setDraft("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      if (draft.trim()) {
        commitTokens(draft);
      }
      return;
    }

    if (event.key === "Backspace" && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="rounded-xl border border-border/70 bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring/40">
        <div className="flex flex-wrap gap-1.5">
          {value.map((keyword, index) => (
            <Badge
              key={`${keyword}-${index}`}
              variant="secondary"
              className="gap-1 pr-1 text-[11px] font-normal"
            >
              {keyword}
              <button
                type="button"
                className="rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Remover ${keyword}`}
                disabled={disabled}
                onClick={() => removeAt(index)}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <Input
            id={id}
            value={draft}
            disabled={disabled}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (draft.trim()) {
                commitTokens(draft);
              }
            }}
            placeholder={value.length === 0 ? "Ex.: drogaria, drogasil" : "Adicionar…"}
            className="h-7 min-w-[8rem] flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
        </div>
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
