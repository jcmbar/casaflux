# E2E tests — CasaFlux

End-to-end tests use [Playwright](https://playwright.dev/) against a running Next.js app and Supabase.

## Prerequisites

1. **Supabase** with all migrations applied (`npx supabase db push` or linked remote project).
2. **Email confirmation disabled** for signup tests (local Supabase default, or disable in dashboard).
3. **Service role key** in `.env.local` or `.env.e2e.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
E2E_USER_PASSWORD=TestPass123!
```

The service role key is only used in test fixtures to create/delete users and seed data. It is never sent to the browser.

## Run

```bash
# Starts dev server automatically (reuse if already running)
npm run test:e2e

# Interactive UI
npm run test:e2e:ui

# With browser visible
npm run test:e2e:headed

# If dev server is already running on :3000
PLAYWRIGHT_SKIP_WEBSERVER=1 npm run test:e2e
```

## Baseline estável — núcleo financeiro consolidado

**Status:** congelado em jul/2026. Sem novas regras financeiras até concluir a frente de UX operacional.

**Suíte E2E:** 16 testes — finance core (3), metas vinculadas (4), orçamento escopo (2), convites (6), RLS isolamento (1).

```bash
npm run test:e2e
# Esperado: 16 passed
```

### O que esta baseline garante

| Área | Comportamento |
|------|----------------|
| **RLS** | Isolamento por usuário/conta; sem policies `dev full access` |
| **Contexto** | Dashboard, Lançamentos e Orçamento: pessoais + família ativa |
| **Metas** | Manual, automática (saldo da conta), escopo no seletor, fallback |
| **Orçamento** | Utilizado = despesas categorizadas do escopo atual |
| **Convites** | Fluxo completo de família |

### Checklist manual — Orçamento (~5 min)

Com **família ativa** e **mesmo mês** em Orçamento e Lançamentos:

1. [ ] Definir limite em uma categoria (ex.: Alimentação)
2. [ ] Lançar despesa na **conta da família** → linha da categoria e **Utilizado no mês** sobem
3. [ ] Lançar despesa na **conta pessoal** (mesma categoria) → valor **soma** no utilizado
4. [ ] Conferir: utilizado da categoria = soma das despesas equivalentes em Lançamentos (filtro do mês)
5. [ ] Trocar família ativa → gastos da família anterior **não** entram no Orçamento

Se os 5 itens passarem, Orçamento está alinhado à baseline.

### Checklist manual completo (~15 min)

Marque no **mesmo mês** e com **família ativa** selecionada.

#### Segurança e contexto

- [ ] Usuário E2E/isolado **não** vê lançamentos de outras contas (Nubank, Supermercado etc.)
- [ ] Trocar família ativa altera contas/lançamentos visíveis (sem misturar outra família)
- [ ] Contas pessoais continuam visíveis com família ativa

#### Dashboard + Lançamentos

- [ ] KPIs do mês batem com totais de Lançamentos
- [ ] Nova despesa aparece em recentes e reflete no KPI
- [ ] Saldo em contas = soma das contas **do escopo atual**

#### Metas

- [ ] Meta manual: progresso pelo valor acumulado + badge **Progresso manual**
- [ ] Meta automática: vinculada a conta do escopo + badge **Saldo de {conta}**
- [ ] Receita na conta vinculada atualiza progresso em `/metas` e Dashboard
- [ ] Meta pausada/concluída não aparece no destaque do Dashboard

### Orçamento (baseline consolidada)

- [ ] Limite por categoria reflete despesas categorizadas do mês (escopo atual)
- [ ] Valor utilizado inclui despesas pessoais **e** da família ativa
- [ ] Valor utilizado bate com Lançamentos para a mesma categoria/mês
- [ ] Trocar família ativa zera/muda gastos de outra família no Orçamento

#### Família

- [ ] Convite: criar → aceitar → membro aparece em `/familia`
- [ ] Participação por membro no Dashboard reflete `created_by`

### Próxima frente (fora desta baseline)

**UX operacional** — sem alterar regras financeiras:

- Refinar dialogs de confirmação e toasts (já usam `useConfirm` + Sonner; polir visual e consistência)
- Pequenos ajustes de fluxo e feedback (loading, estados vazios, mensagens)
- Não inclui: novas regras de escopo, RLS, metas ou orçamento

## Manual validation checklist (detailed)

Use this before or after E2E runs to validate real usage across screens. Work in **the same calendar month** unless noted.

### Dashboard

- [ ] KPIs (Receitas, Despesas, Saldo do mês) match Lançamentos totals for the current month
- [ ] New expense appears in **Lançamentos recentes**
- [ ] Donut / detalhamento reflect categorized expenses
- [ ] Active goals appear in **Metas em destaque** (paused/completed goals do not)

### Lançamentos

- [ ] Create expense with category → toast success → row visible in list
- [ ] Period filter `?month=YYYY-MM` matches Dashboard month
- [ ] Totals (Receitas / Despesas / Saldo do mês) update after save

### Orçamento

- [ ] Define limit for a category → **Utilizado no mês** counts scoped categorized expenses in that month
- [ ] Personal + family expenses both count when active family is selected
- [ ] Same category + same month: spent in Orçamento = sum in Lançamentos (scoped accounts)
- [ ] Switching active family excludes the previous family's spending
- [ ] Expenses without category do not inflate a category row (may appear as “sem limite”)

### Metas

- [ ] Create active goal → visible on `/metas` and Dashboard highlight
- [ ] Manual goal: progress % = `current_amount / target_amount`
- [ ] Automatic goal: progress follows linked account balance after income/expense
- [ ] Account picker only shows accounts in current scope (personal + active family)
- [ ] Paused/completed goals hidden from Dashboard highlight

### Família

- [ ] Active family selected in app context
- [ ] Member breakdown on Dashboard reflects `created_by` on shared transactions
- [ ] Invite flow still works (see invite scenarios below)

### Cross-check matrix

| Value | Lançamentos | Dashboard | Orçamento |
|-------|-------------|-----------|-----------|
| Despesas do mês | Summary card | KPI Despesas | Utilizado (budgeted categories) |
| Receitas do mês | Summary card | KPI Receitas | — |
| Saldo do mês | Summary card | KPI Saldo do mês | — |

**Note:** **Saldo em contas** on Dashboard is the sum of account balances (manual), not derived from transactions.

## Scenarios covered

### Invite flow (`invite-flow.spec.ts`)

| Test | What it validates |
|------|-------------------|
| Signup via invite | `/convite/{token}` → signup → accept → `/dashboard` |
| Login via invite | Existing user → login → accept → `/dashboard` |
| UI invite creation | Owner creates invite on `/familia`, invitee accepts |
| Invalid token | Unknown token shows error state |
| Email mismatch | Wrong logged-in email blocks acceptance |
| Revoked invite | Deleted invitation shows invalid state |

### Finance core (`finance-core.spec.ts`)

| Test | What it validates |
|------|-------------------|
| Expense coherence | Lançamento → Dashboard KPI + recentes → Orçamento spent |
| Goal highlight | Active meta on `/metas` → Dashboard **Metas em destaque** |
| Totals coherence | Receitas/Despesas/Saldo match between Lançamentos and Dashboard |

### Goals — account link (`goals-account-link.spec.ts`)

| Test | What it validates |
|------|-------------------|
| Automatic progress | Saldo da conta + receita → progresso em Metas e Dashboard |
| Manual goals | Badge e progresso manual intactos |
| Scope in picker | Conta de outra família não aparece no seletor |
| Fallback | Conta fora do escopo → badge **Conta indisponível**, UI estável |

### RLS isolation (`rls-transactions-isolation.spec.ts`)

| Test | What it validates |
|------|-------------------|
| Cross-user isolation | User B não lê transações pessoais de User A |

### Orçamento scope (`orcamento-scope.spec.ts`)

| Test | What it validates |
|------|-------------------|
| Mixed scope | Despesa pessoal + família contam no utilizado com família ativa |
| Family switch | Despesa de outra família não entra ao trocar contexto |

## Troubleshooting

### `net::ERR_CONNECTION_REFUSED at http://localhost:3000/...`

The app was not running when using `PLAYWRIGHT_SKIP_WEBSERVER=1`.

**Fix:** start the dev server in another terminal:

```bash
npm run dev
```

Or run without skipping the web server:

```bash
npm run test:e2e
```

### `Failed to create user ...: Invalid API key`

`SUPABASE_SERVICE_ROLE_KEY` is missing, wrong, or set to the anon key.

**Fix:** copy the **`service_role`** secret from Supabase → Settings → API into `.env.local`.

### Budget/goals tests fail with missing tables

Run pending migrations:

```bash
npx supabase db push
```

## Notes

- Tests create isolated users with `@example.com` emails and clean up after each run.
- Supabase may rate-limit signup emails; helpers fall back to admin user creation + UI login.
- For CI, set `CI=1` and provide `SUPABASE_SERVICE_ROLE_KEY` as a secret.
