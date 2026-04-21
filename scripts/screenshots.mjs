import puppeteer from "puppeteer";
import { mkdirSync } from "fs";
import { join } from "path";

const BASE = "http://localhost:3005";
const OUT = ".aidesigner/screenshots";
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  protocolTimeout: 60000,
});
const page = await browser.newPage();
page.setDefaultTimeout(30000);
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });

async function shoot(name, url, opts = {}) {
  await page.goto(`${BASE}${url}`, {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });
  await new Promise((r) => setTimeout(r, opts.wait ?? 900));
  await page.screenshot({
    path: join(OUT, `${name}.png`),
    fullPage: opts.fullPage ?? false,
  });
  console.log(`  ✅ ${name}.png`);
}

async function login(loginId, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.type('input[name="login_id"]', loginId);
  await page.type('input[name="password"]', password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.click('button[type="submit"]'),
  ]);
}

async function logout() {
  await page.evaluate(() => {
    const form = document.querySelector('form[action="/api/logout"]');
    if (form) form.requestSubmit();
  });
  await new Promise((r) => setTimeout(r, 500));
}

// 1. Login page
console.log("📸 Login");
await shoot("01-login", "/login");

// 2. member (山本) login → 打刻画面
console.log("🔐 Login as watanabe...");
await login("watanabe", "unitime2026");

console.log("📸 Home (member view, expanded)");
await shoot("02-home-member", "/");

console.log("📸 History");
await shoot("04-history", "/history");

console.log("📸 Home (sidebar collapsed)");
await page.evaluate(() => {
  localStorage.setItem("unitime-sidebar-collapsed", "true");
});
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 1200));
await shoot("03-home-collapsed", "/");

// Reset sidebar
await page.evaluate(() => {
  localStorage.removeItem("unitime-sidebar-collapsed");
});

// Clear cookies for clean re-login
const client = await page.createCDPSession();
await client.send("Network.clearBrowserCookies");
await client.send("Network.clearBrowserCache");

// 3. owner (見波) login → /admin にリダイレクト
console.log("🔐 Login as minami...");
await login("minami", "unitime2026");

console.log("📸 Team (owner view — redirected from /)");
await shoot("05-team-owner", "/admin");

console.log("📸 Admin Users (owner only)");
await shoot("06-admin-users", "/admin/users");

await browser.close();
console.log("\n✅ Done");
