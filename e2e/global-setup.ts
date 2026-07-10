const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default async function globalSetup() {
  if (!process.env.PLAYWRIGHT_SKIP_WEBSERVER) {
    return;
  }

  try {
    const response = await fetch(baseURL, { redirect: "manual" });

    if (response.status >= 500) {
      throw new Error(`status ${response.status}`);
    }
  } catch {
    throw new Error(
      [
        `App not reachable at ${baseURL}.`,
        "With PLAYWRIGHT_SKIP_WEBSERVER=1 you must run the dev server first:",
        "  npm run dev",
        "",
        "Or let Playwright start it automatically:",
        "  npm run test:e2e",
      ].join("\n"),
    );
  }
}
