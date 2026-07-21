"use client";

import { Loader2, Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { FormInput, FormSelect } from "@/components/forms/form-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { notifyCategoriesChanged } from "@/lib/finance/category-events";
import {
  createUserCategory,
  updateUserCategory,
} from "@/lib/finance/save-user-category";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import type { Category } from "@/types/category";
import { isCustomCategory } from "@/types/category";
import type { TransactionType } from "@/types/transaction";
import { cn } from "@/lib/utils";
import type {
  ImportCategoryFeedback,
} from "@/lib/integrations/categories/import-category-feedback";
import {
  getImportCategoryFeedbackLabel,
  isImportCategoryFeedbackActive,
} from "@/lib/integrations/categories/import-category-feedback";

export function ImportRowCategoryField({
  sourceLine,
  transactionType,
  categories,
  selectedCategoryId,
  categoryFeedback = null,
  onCategoryChange,
  onCategorySaved,
  userId,
}: {
  sourceLine: number;
  transactionType: TransactionType;
  categories: Category[];
  selectedCategoryId: string;
  categoryFeedback?: ImportCategoryFeedback | null;
  onCategoryChange: (categoryId: string) => void;
  onCategorySaved: (
    category: Category,
    sourceLine: number,
    mode: "create" | "update",
  ) => void;
  userId: string;
}) {
  const supabase = useMemo(() => createClient()!, []);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const categoriesForType = useMemo(
    () => categories.filter((category) => category.type === transactionType),
    [categories, transactionType],
  );

  const selectedCategory = categories.find(
    (category) => category.id === selectedCategoryId,
  );
  const canEditSelected =
    Boolean(selectedCategory) && isCustomCategory(selectedCategory!);
  const showFeedback = isImportCategoryFeedbackActive(
    categoryFeedback,
    selectedCategoryId,
  );

  async function handleCreateCategory() {
    const name = newCategoryName.trim();
    if (!name) {
      return;
    }

    setCreatingCategory(true);
    const result = await createUserCategory(supabase, {
      name,
      type: transactionType,
      ownerUserId: userId,
    });
    setCreatingCategory(false);

    if (!result.category) {
      toast.error(result.errorMessage ?? "Não foi possível criar a categoria.");
      return;
    }

    onCategorySaved(result.category, sourceLine, "create");
    onCategoryChange(result.category.id);
    notifyCategoriesChanged();
    setShowNewCategory(false);
    setNewCategoryName("");
  }

  function handleOpenEdit() {
    if (!selectedCategory || !canEditSelected) {
      return;
    }

    setEditName(selectedCategory.name);
    setEditOpen(true);
  }

  async function handleSaveEdit() {
    if (!selectedCategory || !canEditSelected) {
      return;
    }

    setSavingEdit(true);
    const result = await updateUserCategory(supabase, {
      categoryId: selectedCategory.id,
      name: editName,
      type: selectedCategory.type,
    });
    setSavingEdit(false);

    if (!result.category) {
      toast.error(result.errorMessage ?? "Não foi possível atualizar a categoria.");
      return;
    }

    onCategorySaved(result.category, sourceLine, "update");
    notifyCategoriesChanged();
    setEditOpen(false);
  }

  return (
    <>
      <div
        className={cn(
          "max-w-md flex-1 space-y-2 rounded-lg transition-colors",
          showFeedback && "bg-emerald-500/10 p-2 ring-1 ring-emerald-500/25",
        )}
        data-testid={`import-row-category-field-${sourceLine}`}
        data-category-feedback={
          showFeedback ? categoryFeedback?.kind ?? "none" : "none"
        }
      >
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2">
              <label
                htmlFor={`row-category-${sourceLine}`}
                className="text-sm font-medium"
              >
                Categoria
              </label>
              {showFeedback && categoryFeedback ? (
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0 text-[10px] font-medium text-emerald-900 dark:text-emerald-100"
                  data-testid={`import-row-category-feedback-badge-${sourceLine}`}
                >
                  {getImportCategoryFeedbackLabel(categoryFeedback.kind)}
                </Badge>
              ) : null}
            </div>
            <select
              id={`row-category-${sourceLine}`}
              value={selectedCategoryId}
              onChange={(event) => onCategoryChange(event.target.value)}
              data-testid={`import-row-category-select-${sourceLine}`}
              className={cn(
                "flex h-10 w-full rounded-lg border border-input bg-surface-sunken/60 px-2.5 py-2 text-sm outline-none transition-colors",
                "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/40",
                showFeedback && "border-emerald-500/40",
              )}
            >
              <option value="">Sem categoria</option>
              {categoriesForType.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mb-0.5 shrink-0"
            onClick={() => {
              setShowNewCategory((current) => !current);
              setNewCategoryName("");
            }}
            data-testid={`import-row-new-category-${sourceLine}`}
          >
            <Plus className="size-3.5" />
            Nova
          </Button>
          {canEditSelected ? (
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              className="mb-0.5 shrink-0"
              aria-label="Editar categoria selecionada"
              onClick={handleOpenEdit}
              data-testid={`import-row-edit-category-${sourceLine}`}
            >
              <Pencil className="size-3.5" />
            </Button>
          ) : null}
        </div>

        {showNewCategory ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              placeholder="Nome da categoria"
              className={cn(
                "h-10 min-w-0 flex-1 rounded-lg border border-input bg-surface-sunken/60 px-3 text-sm outline-none",
                "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/40",
              )}
              data-testid={`import-row-new-category-name-${sourceLine}`}
              autoFocus
            />
            <Button
              type="button"
              size="sm"
              className="shrink-0"
              disabled={creatingCategory || !newCategoryName.trim()}
              onClick={() => void handleCreateCategory()}
              data-testid={`import-row-new-category-save-${sourceLine}`}
            >
              {creatingCategory ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Salvar"
              )}
            </Button>
          </div>
        ) : null}

        {showFeedback && categoryFeedback ? (
          <p
            className="text-[11px] text-emerald-900/90 dark:text-emerald-100"
            data-testid={`import-row-category-feedback-${sourceLine}`}
          >
            {categoryFeedback.kind === "created"
              ? "Categoria nova aplicada nesta linha."
              : "Nome da categoria atualizado."}
          </p>
        ) : null}
      </div>

      <Sheet
        open={editOpen}
        onOpenChange={(nextOpen) => {
          setEditOpen(nextOpen);
          if (!nextOpen) {
            setEditName("");
          }
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Editar categoria</SheetTitle>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-4 px-6 py-4">
            <FormInput
              id={`import-edit-category-name-${sourceLine}`}
              label="Nome"
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              placeholder="Ex.: Mercado, Freelance"
              autoFocus
            />

            <p className="text-xs text-muted-foreground">
              Tipo: {transactionType === "income" ? "Receita" : "Despesa"}
            </p>

            <SheetFooter className="mt-auto px-0">
              <Button
                type="button"
                className="w-full"
                disabled={savingEdit || !editName.trim()}
                onClick={() => void handleSaveEdit()}
                data-testid={`import-row-edit-category-save-${sourceLine}`}
              >
                {savingEdit ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Salvando…
                  </>
                ) : (
                  "Salvar alterações"
                )}
              </Button>
            </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
