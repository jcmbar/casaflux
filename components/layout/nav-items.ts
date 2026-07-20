import {
  ArrowLeftRight,
  Landmark,
  LayoutDashboard,
  PieChart,
  Tags,
  Target,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  /** Compact label for bottom nav on narrow screens */
  shortLabel?: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

export const primaryNavItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    title: "Dashboard",
    description: "Visão geral das finanças familiares.",
    icon: LayoutDashboard,
  },
  {
    href: "/contas",
    label: "Contas",
    title: "Contas",
    description: "Bancos, carteiras, cartões e saldos disponíveis.",
    icon: Landmark,
  },
  {
    href: "/lancamentos",
    label: "Lançamentos",
    shortLabel: "Lançam.",
    title: "Lançamentos",
    description: "Receitas, despesas e transferências.",
    icon: ArrowLeftRight,
  },
  {
    href: "/familia",
    label: "Família",
    title: "Família",
    description: "Membros, convites e permissões da família ativa.",
    icon: Users,
  },
];

export const secondaryNavItems: NavItem[] = [
  {
    href: "/categorias",
    label: "Categorias",
    title: "Categorias",
    description: "Organize receitas e despesas do seu jeito.",
    icon: Tags,
  },
  {
    href: "/orcamento",
    label: "Orçamento",
    title: "Orçamento",
    description: "Planejamento e acompanhamento mensal por categoria.",
    icon: PieChart,
  },
  {
    href: "/metas",
    label: "Metas",
    title: "Metas",
    description: "Objetivos financeiros e progresso da família.",
    icon: Target,
  },
  {
    href: "/integracoes",
    label: "Integrações",
    title: "Integrações",
    description: "Importe extratos CSV do Nubank para revisão.",
    icon: Upload,
  },
];

/** All navigation items (desktop sidebar). */
export const navItems: NavItem[] = [
  ...primaryNavItems,
  ...secondaryNavItems,
];

export function getNavItemByPath(pathname: string): NavItem | undefined {
  return navItems.find(
    (item) =>
      pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}

const pageTitles: Record<string, { title: string; description: string }> = {
  "/configuracoes": {
    title: "Configurações",
    description: "Preferências da conta e limpeza de dados financeiros.",
  },
};

export function getPageMeta(pathname: string): {
  title: string;
  description?: string;
} {
  const navItem = getNavItemByPath(pathname);
  if (navItem) {
    return { title: navItem.title, description: navItem.description };
  }

  return pageTitles[pathname] ?? { title: "CasaFlux" };
}
