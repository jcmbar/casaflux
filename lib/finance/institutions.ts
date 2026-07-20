import { siMercadopago, siNeon, siNubank, siPicpay } from "simple-icons";

import type { AccountType } from "@/types/account";

export type InstitutionId =
  | "nubank"
  | "itau"
  | "inter"
  | "santander"
  | "bradesco"
  | "caixa"
  | "banco-do-brasil"
  | "c6"
  | "picpay"
  | "neon"
  | "mercadopago"
  | "btg"
  | "xp"
  | "other";

export type InstitutionIcon = {
  /** SVG path data (Simple Icons compatible). */
  path: string;
  /** Brand hex without #. */
  hex: string;
};

export type InstitutionDefinition = {
  id: InstitutionId;
  name: string;
  /** Brand primary color (#hex). */
  color: string;
  /** 1–2 letter monogram used when there is no SVG logo. */
  monogram: string;
  /** Normalized aliases matched against account names. */
  aliases: string[];
  /** Optional vector logo (from simple-icons or curated). */
  icon?: InstitutionIcon;
};

function iconFromSimpleIcon(icon: {
  path: string;
  hex: string;
}): InstitutionIcon {
  return { path: icon.path, hex: icon.hex };
}

/**
 * Central institution catalog. Expand by adding an entry + aliases.
 * Logos come from simple-icons when available; otherwise monogram + color.
 */
export const INSTITUTIONS: Record<InstitutionId, InstitutionDefinition> = {
  nubank: {
    id: "nubank",
    name: "Nubank",
    color: "#820AD1",
    monogram: "Nu",
    aliases: ["nubank", "nu bank", "roxinho", "nu pagamentos"],
    icon: iconFromSimpleIcon(siNubank),
  },
  itau: {
    id: "itau",
    name: "Itaú",
    color: "#EC7000",
    monogram: "It",
    aliases: ["itau", "itaú", "banco itau", "banco itaú"],
  },
  inter: {
    id: "inter",
    name: "Inter",
    color: "#FF7A00",
    monogram: "In",
    aliases: ["inter", "banco inter", "interbank"],
  },
  santander: {
    id: "santander",
    name: "Santander",
    color: "#EC0000",
    monogram: "Sa",
    aliases: ["santander"],
  },
  bradesco: {
    id: "bradesco",
    name: "Bradesco",
    color: "#CC092F",
    monogram: "Br",
    aliases: ["bradesco"],
  },
  caixa: {
    id: "caixa",
    name: "Caixa",
    color: "#0070AF",
    monogram: "Cx",
    aliases: ["caixa", "caixa economica", "caixa econômica", "cef"],
  },
  "banco-do-brasil": {
    id: "banco-do-brasil",
    name: "Banco do Brasil",
    color: "#FFDD00",
    monogram: "BB",
    aliases: [
      "banco do brasil",
      "banco brasil",
      "bb",
      "banco do brasil s.a",
    ],
  },
  c6: {
    id: "c6",
    name: "C6 Bank",
    color: "#1A1A1A",
    monogram: "C6",
    aliases: ["c6", "c6 bank", "c6bank"],
  },
  picpay: {
    id: "picpay",
    name: "PicPay",
    color: "#21C25E",
    monogram: "Pp",
    aliases: ["picpay", "pic pay"],
    icon: iconFromSimpleIcon(siPicpay),
  },
  neon: {
    id: "neon",
    name: "Neon",
    color: "#00E4C9",
    monogram: "Ne",
    aliases: ["neon"],
    icon: iconFromSimpleIcon(siNeon),
  },
  mercadopago: {
    id: "mercadopago",
    name: "Mercado Pago",
    color: "#00BCFF",
    monogram: "MP",
    aliases: ["mercado pago", "mercadopago", "mercado livre"],
    icon: iconFromSimpleIcon(siMercadopago),
  },
  btg: {
    id: "btg",
    name: "BTG Pactual",
    color: "#001E62",
    monogram: "BT",
    aliases: ["btg", "btg pactual"],
  },
  xp: {
    id: "xp",
    name: "XP",
    color: "#000000",
    monogram: "XP",
    aliases: ["xp", "xp investimentos"],
  },
  other: {
    id: "other",
    name: "Outra instituição",
    color: "#0F766E",
    monogram: "?",
    aliases: [],
  },
};

const INSTITUTION_LIST = Object.values(INSTITUTIONS).filter(
  (institution) => institution.id !== "other",
);

export function normalizeInstitutionText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type AliasMatch = {
  institution: InstitutionDefinition;
  alias: string;
  score: number;
};

/**
 * Resolves an institution from free-text (usually account.name).
 * Prefers longer alias matches to avoid weak hits (e.g. "bb" vs "nubank").
 */
export function resolveInstitutionFromName(
  name: string | null | undefined,
): InstitutionDefinition {
  const normalized = normalizeInstitutionText(name ?? "");
  if (!normalized) {
    return INSTITUTIONS.other;
  }

  const matches: AliasMatch[] = [];

  for (const institution of INSTITUTION_LIST) {
    for (const alias of institution.aliases) {
      const normalizedAlias = normalizeInstitutionText(alias);
      if (!normalizedAlias) continue;

      if (
        normalized === normalizedAlias ||
        normalized.includes(normalizedAlias)
      ) {
        // Short aliases like "bb" / "nu" need token boundaries.
        if (normalizedAlias.length <= 2) {
          const tokenBound = new RegExp(
            `(^|\\s)${normalizedAlias}(\\s|$)`,
          );
          if (!tokenBound.test(normalized)) continue;
        }

        matches.push({
          institution,
          alias: normalizedAlias,
          score: normalizedAlias.length,
        });
      }
    }
  }

  if (matches.length === 0) {
    return INSTITUTIONS.other;
  }

  matches.sort((a, b) => b.score - a.score);
  return matches[0]!.institution;
}

export function getInstitutionById(id: InstitutionId): InstitutionDefinition {
  return INSTITUTIONS[id] ?? INSTITUTIONS.other;
}

export type AccountIdentityInput = {
  name: string;
  type?: AccountType | null;
  color?: string | null;
};

export type ResolvedAccountIdentity = {
  institution: InstitutionDefinition;
  /** Color used for the mark: account color → institution color → default. */
  color: string;
  /** Monogram for fallback mark. */
  monogram: string;
  /** True when a vector logo is available. */
  hasLogo: boolean;
  /** Whether institution came from a real match (not "other"). */
  isKnownInstitution: boolean;
};

function initialsFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return "?";

  return parts
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Builds the visual identity for an account without requiring DB changes.
 */
export function resolveAccountIdentity(
  account: AccountIdentityInput,
): ResolvedAccountIdentity {
  const institution = resolveInstitutionFromName(account.name);
  const isKnownInstitution = institution.id !== "other";
  const color =
    account.color?.trim() ||
    institution.color ||
    INSTITUTIONS.other.color;

  const monogram = isKnownInstitution
    ? institution.monogram
    : initialsFromName(account.name);

  return {
    institution,
    color,
    monogram,
    hasLogo: Boolean(institution.icon),
    isKnownInstitution,
  };
}
