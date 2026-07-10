import { expect, test } from "@playwright/test";

import {
  createAdditionalFamilyForUser,
  createFinanceWorkspace,
  createPersonalAccount,
  deleteFinanceWorkspace,
} from "./fixtures/finance-seed";
import { ensureActiveFamily, loginAndSelectFamily } from "./helpers/auth-ui";
import {
  createExpenseViaUI,
  defineBudgetLimitViaUI,
  readCurrencyTotal,
} from "./helpers/finance-ui";
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

describeWithAdmin("Orçamento — finance context scope", () => {
  test.beforeAll(async () => {
    await verifyAdminClient();
  });

  test("counts personal and family expenses when active family is selected", async ({
    page,
  }) => {
    const admin = getAdminClient();
    const ownerEmail = uniqueEmail("orcamento-scope-mix");
    const categoryName = `Alimentação mix ${Date.now()}`;
    const familyAccountName = "Conta Família Orçamento E2E";
    const personalAccountName = "Carteira Pessoal E2E";
    const familyExpense = 120;
    const personalExpense = 80;

    const workspace = await createFinanceWorkspace(admin, {
      ownerEmail,
      familyName: "Família Orçamento Mix",
      categoryName,
      accountName: familyAccountName,
    });

    await createPersonalAccount(admin, {
      userId: workspace.owner.id,
      name: personalAccountName,
    });

    try {
      await loginAndSelectFamily(page, {
        email: ownerEmail,
        password: workspace.password,
        familyId: workspace.family.id,
      });

      await defineBudgetLimitViaUI(page, {
        categoryName,
        limit: 1_000,
      });

      await createExpenseViaUI(page, {
        description: "Despesa família",
        amount: familyExpense,
        categoryName,
        accountName: familyAccountName,
      });

      await createExpenseViaUI(page, {
        description: "Despesa pessoal",
        amount: personalExpense,
        categoryName,
        accountName: personalAccountName,
      });

      await page.goto("/orcamento");

      const budgetRow = page
        .getByTestId("budget-category-row")
        .filter({ hasText: categoryName });

      await expect(budgetRow).toContainText(/R\$\s*200,00/);

      const orcamentoSpent = await readCurrencyTotal(page, "orcamento-spent-total");
      expect(orcamentoSpent).toBe(familyExpense + personalExpense);
    } finally {
      await deleteFinanceWorkspace(admin, {
        ownerId: workspace.owner.id,
        familyId: workspace.family.id,
        categoryId: workspace.category.id,
      });
    }
  });

  test("does not include expenses from another family when context switches", async ({
    page,
  }) => {
    const admin = getAdminClient();
    const ownerEmail = uniqueEmail("orcamento-scope-switch");
    const categoryName = `Transporte ${Date.now()}`;
    const activeAccountName = "Conta Família Ativa Orçamento";
    const otherAccountName = "Conta Outra Família Orçamento";
    const expenseAmount = 175;

    const workspace = await createFinanceWorkspace(admin, {
      ownerEmail,
      familyName: "Família Ativa Orçamento",
      categoryName,
      accountName: activeAccountName,
    });

    const extraFamily = await createAdditionalFamilyForUser(admin, {
      userId: workspace.owner.id,
      familyName: "Família Secundária Orçamento",
      accountName: otherAccountName,
    });

    try {
      await loginAndSelectFamily(page, {
        email: ownerEmail,
        password: workspace.password,
        familyId: workspace.family.id,
      });

      await defineBudgetLimitViaUI(page, {
        categoryName,
        limit: 800,
      });

      await createExpenseViaUI(page, {
        description: "Despesa família ativa",
        amount: expenseAmount,
        categoryName,
        accountName: activeAccountName,
      });

      await page.goto("/orcamento");
      await page.waitForLoadState("networkidle");

      const budgetRow = page
        .getByTestId("budget-category-row")
        .filter({ hasText: categoryName });

      await expect(budgetRow).toContainText(/R\$\s*175,00/, {
        timeout: 20_000,
      });

      expect(await readCurrencyTotal(page, "orcamento-spent-total")).toBe(
        expenseAmount,
      );

      await ensureActiveFamily(page, extraFamily.family.id);

      await page.goto("/orcamento");
      await page.waitForLoadState("networkidle");

      await expect(page.getByTestId("orcamento-spent-total")).toHaveText(
        /R\$\s*0,00/,
        { timeout: 20_000 },
      );
    } finally {
      await admin.from("families").delete().eq("id", extraFamily.family.id);
      await deleteFinanceWorkspace(admin, {
        ownerId: workspace.owner.id,
        familyId: workspace.family.id,
        categoryId: workspace.category.id,
      });
    }
  });
});
