import { expect, type Page } from "@playwright/test";

import { createConfirmedUser, getAdminClient } from "../fixtures/supabase-admin";

export async function loginViaUI(
  page: Page,
  {
    email,
    password,
    redirectTo,
  }: {
    email: string;
    password: string;
    redirectTo?: string;
  },
) {
  const loginUrl = redirectTo
    ? `/login?redirectTo=${encodeURIComponent(redirectTo)}`
    : "/login";

  await page.goto(loginUrl);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();

  if (redirectTo) {
    await page.waitForURL(new RegExp(escapeRegex(redirectTo)), { timeout: 20_000 });
  } else {
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  }
}

export async function signupViaUI(
  page: Page,
  {
    email,
    password,
    fullName,
    redirectTo,
  }: {
    email: string;
    password: string;
    fullName: string;
    redirectTo?: string;
  },
) {
  const signupUrl = redirectTo
    ? `/signup?redirectTo=${encodeURIComponent(redirectTo)}&email=${encodeURIComponent(email)}`
    : `/signup?email=${encodeURIComponent(email)}`;

  await page.goto(signupUrl);
  await page.locator("#fullName").fill(fullName);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();

  const successMessage = page.getByText(
    "Conta criada com sucesso. Redirecionando...",
  );
  const signupError = page.getByText(
    /Não foi possível criar a conta|Confirme seu e-mail/,
  );

  const outcome = await Promise.race([
    successMessage
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => "success" as const),
    signupError
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => "error" as const),
  ]).catch(() => "timeout" as const);

  if (outcome !== "success") {
    const admin = getAdminClient();
    await createConfirmedUser(admin, {
      email,
      password,
      fullName,
    });
    await loginViaUI(page, { email, password, redirectTo });
    return;
  }

  if (redirectTo) {
    await page.waitForURL(new RegExp(escapeRegex(redirectTo)), { timeout: 20_000 });
  } else {
    await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 20_000 });
  }
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function ensureActiveFamily(page: Page, familyId: string) {
  await page.evaluate((id) => {
    window.localStorage.setItem("casaflux:active-family-id", id);
  }, familyId);
  await page.reload();
  await page.waitForLoadState("networkidle");
}

export async function loginAndSelectFamily(
  page: Page,
  {
    email,
    password,
    familyId,
  }: {
    email: string;
    password: string;
    familyId: string;
  },
) {
  await loginViaUI(page, { email, password });
  await ensureActiveFamily(page, familyId);
  await expectDashboard(page);
}

export async function expectDashboard(page: Page) {
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}
