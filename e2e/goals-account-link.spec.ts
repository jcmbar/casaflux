import { expect, test } from "@playwright/test";

import {
  createAdditionalFamilyForUser,
  createFinanceWorkspace,
  deleteFinanceWorkspace,
  hideAccountFromFamilyView,
} from "./fixtures/finance-seed";
import { loginAndSelectFamily } from "./helpers/auth-ui";
import {
  createAutomaticGoalViaUI,
  createGoalViaUI,
  createIncomeViaUI,
  expectGoalProgressInList,
  expectGoalProgressOnDashboard,
  getGoalAccountOptionLabels,
  goalListItem,
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

describeWithAdmin("Goals — account-linked automatic progress", () => {
  test.beforeAll(async () => {
    await verifyAdminClient();
  });

  test("automatic goal progress follows account balance after income", async ({
    page,
  }) => {
    const admin = getAdminClient();
    const ownerEmail = uniqueEmail("goal-auto");
    const accountName = "Conta Meta Auto E2E";
    const goalName = `Reserva automática ${Date.now()}`;
    const targetAmount = 10_000;
    const incomeAmount = 2_500;

    const workspace = await createFinanceWorkspace(admin, {
      ownerEmail,
      familyName: "Família Meta Auto E2E",
      accountName,
    });

    try {
      await loginAndSelectFamily(page, {
        email: ownerEmail,
        password: workspace.password,
        familyId: workspace.family.id,
      });

      await createAutomaticGoalViaUI(page, {
        name: goalName,
        targetAmount,
        accountName,
      });

      await expectGoalProgressInList(page, goalName, {
        current: 0,
        percent: 0,
        badge: new RegExp(`Saldo de ${accountName}`),
      });

      await createIncomeViaUI(page, {
        description: "Aporte meta E2E",
        amount: incomeAmount,
      });

      await page.goto("/metas");
      await expectGoalProgressInList(page, goalName, {
        current: incomeAmount,
        percent: 25,
        badge: new RegExp(`Saldo de ${accountName}`),
      });

      await expectGoalProgressOnDashboard(page, goalName, {
        current: incomeAmount,
        percent: 25,
        badge: new RegExp(`Saldo de ${accountName}`),
      });
    } finally {
      await deleteFinanceWorkspace(admin, {
        ownerId: workspace.owner.id,
        familyId: workspace.family.id,
        categoryId: workspace.category.id,
      });
    }
  });

  test("manual goals still work with manual progress badge", async ({ page }) => {
    const admin = getAdminClient();
    const ownerEmail = uniqueEmail("goal-manual");
    const goalName = `Meta manual ${Date.now()}`;

    const workspace = await createFinanceWorkspace(admin, {
      ownerEmail,
      familyName: "Família Meta Manual E2E",
    });

    try {
      await loginAndSelectFamily(page, {
        email: ownerEmail,
        password: workspace.password,
        familyId: workspace.family.id,
      });

      await createGoalViaUI(page, {
        name: goalName,
        targetAmount: 5_000,
        currentAmount: 1_250,
      });

      await expectGoalProgressInList(page, goalName, {
        current: 1_250,
        percent: 25,
        badge: "Progresso manual",
      });

      await expectGoalProgressOnDashboard(page, goalName, {
        current: 1_250,
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

  test("account outside active family scope is not selectable", async ({
    page,
  }) => {
    const admin = getAdminClient();
    const ownerEmail = uniqueEmail("goal-scope");
    const activeAccountName = "Conta Família Ativa E2E";
    const otherAccountName = "Conta Outra Família E2E";

    const workspace = await createFinanceWorkspace(admin, {
      ownerEmail,
      familyName: "Família Ativa E2E",
      accountName: activeAccountName,
    });

    const extraFamily = await createAdditionalFamilyForUser(admin, {
      userId: workspace.owner.id,
      familyName: "Família Secundária E2E",
      accountName: otherAccountName,
    });

    try {
      await loginAndSelectFamily(page, {
        email: ownerEmail,
        password: workspace.password,
        familyId: workspace.family.id,
      });

      const optionLabels = await getGoalAccountOptionLabels(page);

      expect(optionLabels.some((label) => label.includes(activeAccountName))).toBe(
        true,
      );
      expect(optionLabels.some((label) => label.includes(otherAccountName))).toBe(
        false,
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

  test("fallback keeps UI stable when linked account leaves scope", async ({
    page,
  }) => {
    const admin = getAdminClient();
    const ownerEmail = uniqueEmail("goal-fallback");
    const accountName = "Conta Fallback E2E";
    const goalName = `Meta fallback ${Date.now()}`;

    const workspace = await createFinanceWorkspace(admin, {
      ownerEmail,
      familyName: "Família Fallback E2E",
      accountName,
    });

    try {
      await loginAndSelectFamily(page, {
        email: ownerEmail,
        password: workspace.password,
        familyId: workspace.family.id,
      });

      await createAutomaticGoalViaUI(page, {
        name: goalName,
        targetAmount: 8_000,
        accountName,
      });

      await hideAccountFromFamilyView(admin, workspace.account.id);

      await page.goto("/metas");
      await expect(goalListItem(page, goalName)).toBeVisible({ timeout: 20_000 });
      await expectGoalProgressInList(page, goalName, {
        current: 0,
        percent: 0,
        badge: "Conta indisponível",
      });

      await page.goto("/dashboard");
      const highlight = page
        .getByTestId("goal-highlight-item")
        .filter({ hasText: goalName });
      await expect(highlight).toBeVisible({ timeout: 20_000 });
      await expect(highlight.getByTestId("goal-progress-badge")).toContainText(
        "Conta indisponível",
      );
      await expect(highlight.getByTestId("goal-progress-percent")).toHaveText(
        "0%",
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
