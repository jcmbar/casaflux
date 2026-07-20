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
    is_family_shared
  )
`;
