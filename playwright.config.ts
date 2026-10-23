import { defineConfig } from "@playwright/test";

// Runs against the Expo web dev server. Set CASHMINE_TOKEN in the environment; it is never read from the repo.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:8081",
    browserName: "chromium",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "iphone-14", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "small-android", use: { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true } },
    { name: "iphone-se", use: { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: "npx expo start --web --port 8081",
    url: "http://localhost:8081",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
