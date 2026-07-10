import { expect, test } from "@playwright/test";

import {
  createFinanceWorkspace,
  deleteFinanceWorkspace,
} from "./fixtures/finance-seed";
import {
  createExpenseViaUI,
  createGoalViaUI,
  createIncomeViaUI,
  defineBudgetLimitViaUI,
  expectGoalProgressOnDashboard,
  expectKpiIncreasedBy,
  readCurrencyTotal,
  waitForLancamentosReady,
} from "./helpers/finance-ui";
import { expectDashboard, loginAndSelectFamily } from "./helpers/auth-ui";
import {
  getAdminClient,
  uniqueEmail,
  verifyAdminClient,
} from "./fixtures/supabase-admin";

const hasAdminEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const describeWithAdmin = hasAdminEnv ? test.describe : test.describe.skip;

describeWithAdmin("Finance core — cross-screen coherence", () => {
  test.beforeAll(async () => {
    await verifyAdminClient();

    const admin = getAdminClient();
    const { error: budgetsError } = await admin
      .from("category_budgets")
      .select("id")
      .limit(1);

    if (budgetsError?.message.includes("does not exist")) {
      throw new Error(
        "Missing category_budgets table. Run: npx supabase db push",
      );
    }

    const { error: goalsError } = await admin
      .from("financial_goals")
      .select("id")
      .limit(1);

    if (goalsError?.message.includes("does not exist")) {
      throw new Error(
        "Missing financial_goals table. Run: npx supabase db push",
      );
    }
  });

  test("expense reflects on Dashboard, Orçamento and recent list", async ({
    page,
  }) => {
    const admin = getAdminClient();
    const ownerEmail = uniqueEmail("finance");
    const categoryName = `Alimentação ${Date.now()}`;
    const expenseAmount = 150;
    const budgetLimit = 500;

    const workspace = await createFinanceWorkspace(admin, {
      ownerEmail,
      familyName: "Família Finance Core",
      categoryName,
    });

    try {
      await loginAndSelectFamily(page, {
        email: ownerEmail,
        password: workspace.password,
        familyId: workspace.family.id,
      });

      await waitForLancamentosReady(page);
      const expenseBefore = await readCurrencyTotal(
        page,
        "lancamentos-expense-total",
      );

      await createExpenseViaUI(page, {
        description: "Compra E2E",
        amount: expenseAmount,
        categoryName,
      });

      const expenseAfter = await readCurrencyTotal(
        page,
        "lancamentos-expense-total",
      );
      expect(expenseAfter - expenseBefore).toBe(expenseAmount);

      await page.goto("/dashboard");
      await page.reload();

      await expect(
        page
          .getByTestId("recent-transaction-item")
          .filter({ hasText: "Compra E2E" }),
      ).toBeVisible();

      const dashboardExpense = await readCurrencyTotal(page, "kpi-expense");
      expect(dashboardExpense).toBe(expenseBefore + expenseAmount);

      await defineBudgetLimitViaUI(page, {
        categoryName,
        limit: budgetLimit,
      });

      const budgetRow = page
        .getByTestId("budget-category-row")
        .filter({ hasText: categoryName });

      await expect(budgetRow).toContainText(/R\$\s*150,00/);
      await expect(budgetRow).toContainText(/de R\$\s*500,00/);

      const orcamentoSpent = await readCurrencyTotal(page, "orcamento-spent-total");
      expect(orcamentoSpent).toBeGreaterThanOrEqual(expenseAmount);
    } finally {
      await deleteFinanceWorkspace(admin, {
        ownerId: workspace.owner.id,
        familyId: workspace.family.id,
        categoryId: workspace.category.id,
      });
    }
  });

  test("active goal appears on Dashboard highlight", async ({ page }) => {
    const admin = getAdminClient();
    const ownerEmail = uniqueEmail("finance-goals");
    const goalName = `Reserva E2E ${Date.now()}`;

    const workspace = await createFinanceWorkspace(admin, {
      ownerEmail,
      familyName: "Família Metas E2E",
    });

    try {
      await loginAndSelectFamily(page, {
        email: ownerEmail,
        password: workspace.password,
        familyId: workspace.family.id,
      });

      await createGoalViaUI(page, {
        name: goalName,
        targetAmount: 10_000,
        currentAmount: 2_500,
      });

      await expectGoalProgressOnDashboard(page, goalName, {
        current: 2_500,
        percent: 25,
        badge: "Progresso manual",
      });
    } finally {
      await deleteFinanceWorkspace(admin, {
        ownerId: workspace.owner.id,
        familyId: workspace.family.id,
        categoryId: workspace.category.id,
      });
    }
  });

  test("income and expense totals stay coherent between Lançamentos and Dashboard", async ({
    page,
  }) => {
    const admin = getAdminClient();
    const ownerEmail = uniqueEmail("finance-totals");
    const categoryName = `Despesa ${Date.now()}`;

    const workspace = await createFinanceWorkspace(admin, {
      ownerEmail,
      categoryName,
    });

    try {
      await loginAndSelectFamily(page, {
        email: ownerEmail,
        password: workspace.password,
        familyId: workspace.family.id,
      });

      await waitForLancamentosReady(page);
      const incomeBefore = await readCurrencyTotal(
        page,
        "lancamentos-income-total",
      );
      const expenseBefore = await readCurrencyTotal(
        page,
        "lancamentos-expense-total",
      );

      await createIncomeViaUI(page, {
        description: "Salário E2E",
        amount: 3_000,
      });

      await createExpenseViaUI(page, {
        description: "Conta E2E",
        amount: 800,
        categoryName,
      });

      const incomeAfter = await readCurrencyTotal(
        page,
        "lancamentos-income-total",
      );
      const expenseAfter = await readCurrencyTotal(
        page,
        "lancamentos-expense-total",
      );
      const balanceAfter = await readCurrencyTotal(
        page,
        "lancamentos-balance-total",
      );

      expect(incomeAfter - incomeBefore).toBe(3_000);
      expect(expenseAfter - expenseBefore).toBe(800);
      expect(balanceAfter).toBe(incomeAfter - expenseAfter);

      await page.goto("/dashboard");
      await page.reload();

      await expectKpiIncreasedBy(page, "kpi-income", incomeBefore, 3_000);
      await expectKpiIncreasedBy(page, "kpi-expense", expenseBefore, 800);
      await expectKpiIncreasedBy(
        page,
        "kpi-net",
        incomeBefore - expenseBefore,
        3_000 - 800,
      );
    } finally {
      await deleteFinanceWorkspace(admin, {
        ownerId: workspace.owner.id,
        familyId: workspace.family.id,
        categoryId: workspace.category.id,
      });
    }
  });
});
