import { expect, test } from "@playwright/test";

import { loginViaUI, expectDashboard, signupViaUI } from "./helpers/auth-ui";
import {
  createConfirmedUser,
  createInvitation,
  createOwnerWithFamily,
  deleteUser,
  getAdminClient,
  getFamilyMemberCount,
  revokeInvitationByToken,
  uniqueEmail,
  verifyAdminClient,
} from "./fixtures/supabase-admin";

const PASSWORD = process.env.E2E_USER_PASSWORD ?? "TestPass123!";
const hasAdminEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

test.describe("Family invite flow — UI states", () => {
  test("shows invalid state for unknown token", async ({ page }) => {
    await page.goto("/convite/token-inexistente-e2e");
    await expect(
      page.getByRole("heading", { name: "Convite inválido" }),
    ).toBeVisible();
  });
});

const describeWithAdmin = hasAdminEnv ? test.describe : test.describe.skip;

describeWithAdmin("Family invite flow — full journey", () => {
  test.beforeAll(async () => {
    await verifyAdminClient();
  });

  test("new user accepts invite via signup", async ({ page }) => {
    const admin = getAdminClient();
    const ownerEmail = uniqueEmail("owner");
    const inviteeEmail = uniqueEmail("invitee");
    const token = `e2e-signup-${Date.now()}`;

    const { owner, family } = await createOwnerWithFamily(admin, {
      ownerEmail,
      familyName: "Família Convite Signup",
    });

    await createInvitation(admin, {
      familyId: family.id,
      email: inviteeEmail,
      invitedBy: owner.id,
      token,
    });

    try {
      await page.goto(`/convite/${token}`);
      await expect(page.getByTestId("invite-family-name")).toHaveText(
        "Família Convite Signup",
      );
      await expect(page.getByTestId("invite-email")).toContainText(inviteeEmail);

      await page.getByTestId("invite-signup-link").click();

      await signupViaUI(page, {
        email: inviteeEmail,
        password: PASSWORD,
        fullName: "Convidado Signup",
        redirectTo: `/convite/${token}`,
      });

      await expect(page.getByRole("button", { name: "Aceitar convite" })).toBeVisible();

      await page.getByTestId("accept-invite-button").click();
      await expect(page.getByText("Convite aceito com sucesso")).toBeVisible();
      await expectDashboard(page);

      const memberCount = await getFamilyMemberCount(admin, family.id);
      expect(memberCount).toBe(2);
    } finally {
      const { data: users } = await admin.auth.admin.listUsers();
      const invitee = users.users.find((u) => u.email === inviteeEmail);
      if (invitee) await deleteUser(admin, invitee.id);
      await deleteUser(admin, owner.id);
    }
  });

  test("existing user accepts invite via login", async ({ page }) => {
    const admin = getAdminClient();
    const ownerEmail = uniqueEmail("owner");
    const inviteeEmail = uniqueEmail("invitee");
    const token = `e2e-login-${Date.now()}`;

    const { owner, family } = await createOwnerWithFamily(admin, {
      ownerEmail,
      familyName: "Família Convite Login",
    });

    const invitee = await createConfirmedUser(admin, {
      email: inviteeEmail,
      fullName: "Convidado Login",
    });

    await createInvitation(admin, {
      familyId: family.id,
      email: inviteeEmail,
      invitedBy: owner.id,
      token,
    });

    try {
      await page.goto(`/convite/${token}`);
      await page.getByTestId("invite-login-link").click();

      await loginViaUI(page, {
        email: inviteeEmail,
        password: PASSWORD,
        redirectTo: `/convite/${token}`,
      });

      await page.getByTestId("accept-invite-button").click();
      await expectDashboard(page);

      const memberCount = await getFamilyMemberCount(admin, family.id);
      expect(memberCount).toBe(2);
    } finally {
      await deleteUser(admin, invitee.id);
      await deleteUser(admin, owner.id);
    }
  });

  test("owner creates invite via UI and invitee accepts", async ({
    browser,
  }) => {
    const admin = getAdminClient();
    const ownerEmail = uniqueEmail("owner");
    const inviteeEmail = uniqueEmail("invitee");

    const { owner, family, password: ownerPassword } =
      await createOwnerWithFamily(admin, {
        ownerEmail,
        familyName: "Família UI Convite",
      });

    const ownerContext = await browser.newContext();
    const inviteeContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    const inviteePage = await inviteeContext.newPage();

    try {
      await loginViaUI(ownerPage, {
        email: ownerEmail,
        password: ownerPassword,
      });
      await expectDashboard(ownerPage);

      await ownerPage.goto("/familia");
      await ownerPage.getByTestId("invite-email").fill(inviteeEmail);
      await ownerPage.getByTestId("invite-submit").click();

      await expect(
        ownerPage.getByTestId("pending-invite").filter({ hasText: inviteeEmail }),
      ).toBeVisible({ timeout: 15_000 });

      const { data: invitation } = await admin
        .from("family_invitations")
        .select("token")
        .eq("family_id", family.id)
        .eq("email", inviteeEmail.toLowerCase())
        .is("accepted_at", null)
        .single();

      expect(invitation?.token).toBeTruthy();

      await inviteePage.goto(`/convite/${invitation!.token}`);
      await inviteePage.getByTestId("invite-signup-link").click();

      await signupViaUI(inviteePage, {
        email: inviteeEmail,
        password: PASSWORD,
        fullName: "Convidado UI",
        redirectTo: `/convite/${invitation!.token}`,
      });

      await inviteePage.getByTestId("accept-invite-button").click();
      await expectDashboard(inviteePage);
    } finally {
      await ownerContext.close();
      await inviteeContext.close();

      const { data: users } = await admin.auth.admin.listUsers();
      const invitee = users.users.find((u) => u.email === inviteeEmail);
      if (invitee) await deleteUser(admin, invitee.id);
      await deleteUser(admin, owner.id);
    }
  });

  test("shows email mismatch for wrong authenticated user", async ({
    page,
  }) => {
    const admin = getAdminClient();
    const ownerEmail = uniqueEmail("owner");
    const inviteeEmail = uniqueEmail("invitee");
    const wrongEmail = uniqueEmail("wrong");
    const token = `e2e-mismatch-${Date.now()}`;

    const { owner, family } = await createOwnerWithFamily(admin, {
      ownerEmail,
    });

    await createConfirmedUser(admin, {
      email: wrongEmail,
      fullName: "Usuário Errado",
    });

    await createInvitation(admin, {
      familyId: family.id,
      email: inviteeEmail,
      invitedBy: owner.id,
      token,
    });

    try {
      await loginViaUI(page, {
        email: wrongEmail,
        password: PASSWORD,
        redirectTo: `/convite/${token}`,
      });

      await expect(
        page.getByText(/Este convite é para/).first(),
      ).toContainText(inviteeEmail);
      await expect(
        page.getByText(/você está autenticado como/),
      ).toContainText(wrongEmail);
      await expect(
        page.getByRole("button", { name: "Sair e entrar com outra conta" }),
      ).toBeVisible();
    } finally {
      const { data: users } = await admin.auth.admin.listUsers();
      for (const email of [wrongEmail, ownerEmail]) {
        const user = users.users.find((u) => u.email === email);
        if (user) await deleteUser(admin, user.id);
      }
    }
  });

  test("revoked invite becomes invalid", async ({ page }) => {
    const admin = getAdminClient();
    const ownerEmail = uniqueEmail("owner");
    const inviteeEmail = uniqueEmail("invitee");
    const token = `e2e-revoke-${Date.now()}`;

    const { owner, family } = await createOwnerWithFamily(admin, {
      ownerEmail,
    });

    await createInvitation(admin, {
      familyId: family.id,
      email: inviteeEmail,
      invitedBy: owner.id,
      token,
    });

    try {
      await page.goto(`/convite/${token}`);
      await expect(page.getByTestId("invite-family-name")).toBeVisible();

      await revokeInvitationByToken(admin, token);

      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Convite inválido" }),
      ).toBeVisible();
    } finally {
      await deleteUser(admin, owner.id);
    }
  });
});
