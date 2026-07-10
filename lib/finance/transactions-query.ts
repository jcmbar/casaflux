export const TRANSACTIONS_SELECT = `
  *,
  categories (
    id,
    name
  ),
  accounts (
    id,
    name,
    is_family_shared
  )
`;
