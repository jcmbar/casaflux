import { expect, type Page } from "@playwright/test";

export function parseCurrency(value: string) {
  const normalized = value
    .replace(/\u00a0/g, " ")
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  return Number(normalized);
}

export async function readCurrencyTotal(page: Page, testId: string) {
  const text = await page.getByTestId(testId).innerText();
  return parseCurrency(text);
}

export function currencyPattern(amount: number) {
  const formatted = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount);

  return new RegExp(formatted.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

export async function waitForLancamentosReady(page: Page) {
  await page.goto("/lancamentos");
  await expect(page.getByTestId("lancamentos-summary")).toHaveAttribute(
    "data-ready",
    "true",
    { timeout: 20_000 },
  );
}

async function selectTransactionAccountByName(page: Page, accountName: string) {
  const select = page.locator("#account");
  await expect(
    select.locator("option").filter({ hasText: accountName }).first(),
  ).toBeAttached({ timeout: 20_000 });

  const value = await select.locator("option").evaluateAll((options, name) => {
    const match = options.find(
      (option) =>
        option.getAttribute("value") &&
        option.textContent?.includes(name as string),
    );

    return match?.getAttribute("value") ?? "";
  }, accountName);

  if (!value) {
    throw new Error(`Conta não encontrada no lançamento: ${accountName}`);
  }

  await select.selectOption(value);
}

export async function createExpenseViaUI(
  page: Page,
  {
    description,
    amount,
    categoryName,
    accountName,
  }: {
    description: string;
    amount: number;
    categoryName: string;
    accountName?: string;
  },
) {
  await waitForLancamentosReady(page);
  await page.getByTestId("new-transaction-button").click();
  await expect(page.getByTestId("transaction-form")).toBeVisible();

  await page.locator("#description").fill(description);
  await page.locator("#amount").fill(String(amount));
  await page.locator("#category").selectOption({ label: categoryName });

  if (accountName) {
    await selectTransactionAccountByName(page, accountName);
  }

  await page.getByTestId("save-transaction-button").click();

  await expect(page.getByText("Lançamento salvo.")).toBeVisible();
  await expect(page.getByText(description).first()).toBeVisible();
}

export async function createIncomeViaUI(
  page: Page,
  {
    description,
    amount,
  }: {
    description: string;
    amount: number;
  },
) {
  await waitForLancamentosReady(page);
  await page.getByTestId("new-transaction-button").click();

  await page.locator("#type").selectOption("income");
  await page.locator("#description").fill(description);
  await page.locator("#amount").fill(String(amount));
  await page.getByTestId("save-transaction-button").click();

  await expect(page.getByText("Lançamento salvo.")).toBeVisible();
  await expect(page.getByText(description).first()).toBeVisible();
}

export async function defineBudgetLimitViaUI(
  page: Page,
  {
    categoryName,
    limit,
  }: {
    categoryName: string;
    limit: number;
  },
) {
  await page.goto("/orcamento");
  await page.getByTestId("define-budget-button").click();
  await page.locator("#categoryId").selectOption({ label: categoryName });
  await page.locator("#amountLimit").fill(String(limit));
  await page.getByTestId("save-budget-button").click();
  await expect(page.getByText("Limite definido.")).toBeVisible();
}

export async function createGoalViaUI(
  page: Page,
  {
    name,
    targetAmount,
    currentAmount = 0,
  }: {
    name: string;
    targetAmount: number;
    currentAmount?: number;
  },
) {
  await waitForMetasReady(page);
  await page.getByTestId("new-goal-button").click();
  await page.locator("#name").fill(name);
  await page.locator("#targetAmount").fill(String(targetAmount));
  await page.locator("#currentAmount").fill(String(currentAmount));
  await page.getByTestId("save-goal-button").click();

  await expect(goalListItem(page, name)).toBeVisible({ timeout: 20_000 });
}

export function goalListItem(page: Page, name: string) {
  return page.getByTestId("goal-list-item").filter({ hasText: name });
}

export function goalHighlightItem(page: Page, name: string) {
  return page.getByTestId("goal-highlight-item").filter({ hasText: name });
}

async function selectGoalAccountByName(page: Page, accountName: string) {
  const select = page.locator("#accountId");
  await expect(select).toBeVisible();
  await expect(
    select.locator("option").filter({ hasText: accountName }).first(),
  ).toBeAttached({ timeout: 20_000 });

  const value = await select.locator("option").evaluateAll((options, name) => {
    const match = options.find(
      (option) =>
        option.getAttribute("value") &&
        option.textContent?.includes(name as string),
    );

    return match?.getAttribute("value") ?? "";
  }, accountName);

  if (!value) {
    throw new Error(`Conta não encontrada no seletor: ${accountName}`);
  }

  await select.selectOption(value);
}

async function waitForMetasReady(page: Page) {
  await page.goto("/metas");
  await expect(page.getByTestId("new-goal-button")).toBeEnabled({
    timeout: 20_000,
  });
  await expect(page.getByText("Carregando metas...")).toHaveCount(0, {
    timeout: 20_000,
  });
}

export async function createAutomaticGoalViaUI(
  page: Page,
  {
    name,
    targetAmount,
    accountName,
  }: {
    name: string;
    targetAmount: number;
    accountName: string;
  },
) {
  await waitForMetasReady(page);
  await page.getByTestId("new-goal-button").click();
  await page.locator("#name").fill(name);
  await page.locator("#progressMode").selectOption("account_balance");
  await selectGoalAccountByName(page, accountName);
  await page.locator("#targetAmount").fill(String(targetAmount));
  await page.getByTestId("save-goal-button").click();

  await expect(goalListItem(page, name)).toBeVisible({ timeout: 20_000 });
}

export async function expectGoalProgressInList(
  page: Page,
  goalName: string,
  {
    current,
    percent,
    badge,
  }: {
    current: number;
    percent: number;
    badge?: string | RegExp;
  },
) {
  const item = goalListItem(page, goalName);
  await expect(item.getByTestId("goal-current-amount")).toHaveText(
    currencyPattern(current),
  );
  await expect(item.getByTestId("goal-progress-percent")).toHaveText(
    `${percent}%`,
  );

  if (badge) {
    await expect(item.getByTestId("goal-progress-badge")).toContainText(badge);
  }
}

export async function expectGoalProgressOnDashboard(
  page: Page,
  goalName: string,
  {
    current,
    percent,
    badge,
  }: {
    current: number;
    percent: number;
    badge?: string | RegExp;
  },
) {
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");

  const item = goalHighlightItem(page, goalName);
  await expect(item).toBeVisible({ timeout: 20_000 });
  await expect(item).toContainText(
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(current),
  );
  await expect(item.getByTestId("goal-progress-percent")).toHaveText(
    `${percent}%`,
  );

  if (badge) {
    await expect(item.getByTestId("goal-progress-badge")).toContainText(badge);
  }
}

export async function getGoalAccountOptionLabels(page: Page) {
  await waitForMetasReady(page);
  await page.getByTestId("new-goal-button").click();
  await page.locator("#progressMode").selectOption("account_balance");

  await expect(page.locator("#accountId option[value]:not([value=''])").first()).toBeAttached({
    timeout: 20_000,
  });

  return page.locator("#accountId option").evaluateAll((options) =>
    options
      .map((option) => option.textContent?.trim() ?? "")
      .filter(
        (label) =>
          label.length > 0 &&
          !label.includes("Nenhuma conta no contexto atual"),
      ),
  );
}

export async function expectKpiAmount(
  page: Page,
  testId: string,
  amount: number,
) {
  await expect(page.getByTestId(testId)).toHaveText(currencyPattern(amount));
}

export async function expectKpiIncreasedBy(
  page: Page,
  testId: string,
  previous: number,
  delta: number,
) {
  await expect(page.getByTestId(testId)).toHaveText(
    currencyPattern(previous + delta),
  );
}
