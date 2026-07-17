"use client";

export const dynamic = "force-dynamic";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Tags,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormInput, FormSelect } from "@/components/forms/form-controls";
import { PageIntro } from "@/components/layout/page-intro";
import { useConfirm } from "@/components/feedback/confirm-dialog-provider";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAppContext } from "@/contexts/app-context";
import {
  CATEGORY_IN_USE_MESSAGE,
  deactivateCategoryForUser,
  deleteUnusedCustomCategory,
  fetchCategoryUsage,
  fetchHiddenSystemCategoryIds,
  reactivateCategoryForUser,
  splitCategoriesByVisibility,
  type CategoryVisibilityContext,
} from "@/lib/finance/active-categories";
import {
  CATEGORIES_CHANGED_EVENT,
  notifyCategoriesChanged,
} from "@/lib/finance/category-events";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  isCustomCategory,
  type Category,
  type CategoryType,
} from "@/types/category";

type FormState = {
  name: string;
  type: CategoryType;
};

const defaultForm: FormState = {
  name: "",
  type: "expense",
};

const typeLabels: Record<CategoryType, string> = {
  expense: "Despesa",
  income: "Receita",
  transfer: "Transferência",
};

function CategoryRow({
  category,
  onEdit,
  onDeactivate,
  onReactivate,
  onDelete,
  inactive = false,
}: {
  category: Category;
  onEdit?: (category: Category) => void;
  onDeactivate?: (category: Category) => void;
  onReactivate?: (category: Category) => void;
  onDelete?: (category: Category) => void;
  inactive?: boolean;
}) {
  const custom = isCustomCategory(category);

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border px-4 py-3",
        inactive ? "border-border/40 bg-muted/20" : "border-border/60",
      )}
      data-testid={`category-row-${category.id}`}
    >
      <div className="min-w-0">
        <p
          className={cn(
            "truncate font-medium",
            inactive && "text-muted-foreground",
          )}
        >
          {category.name}
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          {custom ? (
            <Badge variant="secondary" className="text-[11px]">
              Personalizada
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[11px]">
              Padrão
            </Badge>
          )}
          {inactive ? (
            <Badge variant="outline" className="text-[11px]">
              Inativa
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 gap-1">
        {inactive ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Reativar ${category.name}`}
              onClick={() => onReactivate?.(category)}
            >
              <Eye className="size-4" />
            </Button>
            {custom ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Excluir ${category.name}`}
                onClick={() => onDelete?.(category)}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            ) : null}
          </>
        ) : (
          <>
            {custom && onEdit ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Editar ${category.name}`}
                onClick={() => onEdit(category)}
              >
                <Pencil className="size-4" />
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Desativar ${category.name}`}
              onClick={() => onDeactivate?.(category)}
            >
              <EyeOff className="size-4" />
            </Button>
            {custom && onDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Excluir ${category.name}`}
                onClick={() => onDelete(category)}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export default function CategoriasPage() {
  const [supabase, setSupabase] = useState<ReturnType<
    typeof createClient
  > | null>(null);
  const pathname = usePathname();
  const confirm = useConfirm();
  const { user, loading: authLoading } = useAppContext();
  const [categories, setCategories] = useState<Category[]>([]);
  const [visibilityContext, setVisibilityContext] =
    useState<CategoryVisibilityContext>({
      hiddenSystemCategoryIds: new Set(),
    });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [inactiveExpanded, setInactiveExpanded] = useState<
    Record<CategoryType, boolean>
  >({
    expense: false,
    income: false,
    transfer: false,
  });

  useEffect(() => {
    setSupabase(createClient());
  }, []);

  const loadCategories = useCallback(async () => {
    if (!supabase) return;

    if (!user) {
      setCategories([]);
      setVisibilityContext({ hiddenSystemCategoryIds: new Set() });
      setLoading(false);
      return;
    }

    setLoading(true);

    const [categoriesRes, hiddenSystemCategoryIds] = await Promise.all([
      supabase
        .from("categories")
        .select("*")
        .order("type", { ascending: true })
        .order("name", { ascending: true }),
      fetchHiddenSystemCategoryIds(supabase, user.id),
    ]);

    if (categoriesRes.error) {
      console.error(categoriesRes.error);
      toast.error("Não foi possível carregar as categorias.");
      setLoading(false);
      return;
    }

    setCategories(
      ((categoriesRes.data ?? []) as Category[]).map((category) => ({
        ...category,
        is_active: category.is_active ?? true,
      })),
    );
    setVisibilityContext({ hiddenSystemCategoryIds });
    setLoading(false);
  }, [supabase, user]);

  useEffect(() => {
    if (authLoading) return;

    if (pathname === "/categorias") {
      void loadCategories();
    }
  }, [authLoading, loadCategories, pathname, user]);

  useEffect(() => {
    function handleCategoriesChanged() {
      if (user) {
        void loadCategories();
      }
    }

    window.addEventListener(CATEGORIES_CHANGED_EVENT, handleCategoriesChanged);
    return () => {
      window.removeEventListener(
        CATEGORIES_CHANGED_EVENT,
        handleCategoriesChanged,
      );
    };
  }, [loadCategories, user]);

  const grouped = useMemo(() => {
    const result: Record<
      CategoryType,
      { active: Category[]; inactive: Category[] }
    > = {
      expense: { active: [], inactive: [] },
      income: { active: [], inactive: [] },
      transfer: { active: [], inactive: [] },
    };

    for (const categoryType of ["expense", "income", "transfer"] as const) {
      const forType = categories.filter(
        (category) => category.type === categoryType,
      );
      const split = splitCategoriesByVisibility(forType, visibilityContext);
      result[categoryType] = split;
    }

    return result;
  }, [categories, visibilityContext]);

  function resetForm() {
    setForm(defaultForm);
    setEditingId(null);
  }

  function handleOpenNew() {
    resetForm();
    setOpen(true);
  }

  function handleOpenEdit(category: Category) {
    if (!isCustomCategory(category)) return;

    setEditingId(category.id);
    setForm({
      name: category.name,
      type: category.type,
    });
    setOpen(true);
  }

  async function handleDeactivate(category: Category) {
    if (!user || !supabase) return;

    const result = await deactivateCategoryForUser(supabase, category, user.id);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    await loadCategories();
    notifyCategoriesChanged();
    toast.success("Categoria desativada.");
  }

  async function handleReactivate(category: Category) {
    if (!user || !supabase) return;

    const result = await reactivateCategoryForUser(supabase, category, user.id);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    await loadCategories();
    notifyCategoriesChanged();
    toast.success("Categoria reativada.");
  }

  async function handleDelete(category: Category) {
    if (!isCustomCategory(category) || !user || !supabase) return;

    const usage = await fetchCategoryUsage(supabase, category.id);

    if (usage.inUse) {
      toast.error(CATEGORY_IN_USE_MESSAGE);
      return;
    }

    const confirmed = await confirm({
      title: "Excluir categoria",
      description: `Excluir "${category.name}"? Esta ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      destructive: true,
    });

    if (!confirmed) return;

    const result = await deleteUnusedCustomCategory(supabase, category.id);

    if (!result.ok) {
      if (result.inUse) {
        toast.error(CATEGORY_IN_USE_MESSAGE);
        return;
      }

      toast.error(result.message);
      return;
    }

    await loadCategories();
    notifyCategoriesChanged();
    toast.success("Categoria excluída.");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user || !supabase) return;

    const name = form.name.trim();
    if (!name) return;

    setSaving(true);

    if (editingId) {
      const { error } = await supabase
        .from("categories")
        .update({ name, type: form.type })
        .eq("id", editingId);

      if (error) {
        console.error(error);
        toast.error("Não foi possível atualizar a categoria.");
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from("categories").insert({
        name,
        type: form.type,
        owner_user_id: user.id,
        is_active: true,
      });

      if (error) {
        console.error(error);
        toast.error("Não foi possível criar a categoria.");
        setSaving(false);
        return;
      }
    }

    await loadCategories();
    notifyCategoriesChanged();
    setOpen(false);
    resetForm();
    setSaving(false);
    toast.success(editingId ? "Categoria atualizada." : "Categoria criada.");
  }

  const isEditing = Boolean(editingId);

  return (
    <div className="space-y-6 md:space-y-8">
      <PageIntro description="Organize receitas e despesas do seu jeito." />

      <div className="flex justify-stretch sm:justify-end">
        <Button
          className="w-full shadow-sm sm:w-auto"
          onClick={handleOpenNew}
          disabled={loading}
          data-testid="new-category-button"
        >
          <Plus className="h-4 w-4" />
          Nova categoria
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Carregando categorias…
        </div>
      ) : (
        (["expense", "income"] as const).map((categoryType) => {
          const { active, inactive } = grouped[categoryType];

          return (
            <Card key={categoryType}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Tags className="size-4 text-muted-foreground" />
                  {typeLabels[categoryType]}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Ativas
                  </p>
                  {active.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma categoria ativa de{" "}
                      {typeLabels[categoryType].toLowerCase()}.
                    </p>
                  ) : (
                    active.map((category) => (
                      <CategoryRow
                        key={category.id}
                        category={category}
                        onEdit={handleOpenEdit}
                        onDeactivate={handleDeactivate}
                        onDelete={handleDelete}
                      />
                    ))
                  )}
                </div>

                {inactive.length > 0 ? (
                  <div className="space-y-2 border-t border-border/50 pt-4">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
                      onClick={() =>
                        setInactiveExpanded((current) => ({
                          ...current,
                          [categoryType]: !current[categoryType],
                        }))
                      }
                      aria-expanded={inactiveExpanded[categoryType]}
                    >
                      <span>Inativas ({inactive.length})</span>
                      <ChevronDown
                        className={cn(
                          "size-4 shrink-0 transition-transform",
                          inactiveExpanded[categoryType] && "rotate-180",
                        )}
                      />
                    </button>

                    {inactiveExpanded[categoryType] ? (
                      <div className="space-y-2">
                        {inactive.map((category) => (
                          <CategoryRow
                            key={category.id}
                            category={category}
                            inactive
                            onReactivate={handleReactivate}
                            onDelete={
                              isCustomCategory(category)
                                ? handleDelete
                                : undefined
                            }
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })
      )}

      <Sheet
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) resetForm();
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {isEditing ? "Editar categoria" : "Nova categoria"}
            </SheetTitle>
          </SheetHeader>

          <form
            className="flex flex-1 flex-col gap-4 px-6 py-4"
            onSubmit={handleSubmit}
          >
            <FormInput
              id="category-name"
              label="Nome"
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Ex.: Mercado, Freelance"
              autoFocus
            />

            <FormSelect
              id="category-type"
              label="Tipo"
              value={form.type}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  type: event.target.value as CategoryType,
                }))
              }
            >
              <option value="expense">Despesa</option>
              <option value="income">Receita</option>
            </FormSelect>

            <SheetFooter className="mt-auto px-0">
              <Button
                type="submit"
                className="w-full"
                disabled={saving || !form.name.trim()}
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Salvando…
                  </>
                ) : isEditing ? (
                  "Salvar alterações"
                ) : (
                  "Criar categoria"
                )}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
