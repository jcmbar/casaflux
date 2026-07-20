export const TRANSACTIONS_SELECT = `
  *,
  categories (
    id,
    name
  ),
  accounts (
    id,
    name,
    type,
    color,
    is_family_shared
  )
`;
