import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/web",
  testMatch: "**/*.spec.ts",
  timeout: 45000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4319",
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "npm run dev:web:test",
    url: "http://127.0.0.1:4319",
    timeout: 60000,
    reuseExistingServer: false,
  },
});
