export function notifyCategoriesChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("casaflux:categories-changed"));
  }
}

export const CATEGORIES_CHANGED_EVENT = "casaflux:categories-changed";
