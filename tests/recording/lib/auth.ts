// Clerk sign-up / sign-in through the real Clerk UI, using Clerk's development test identities:
// emails containing "+clerk_test" and phone numbers +1 (XXX) 555-01XX accept the code 424242 and send nothing.
import type { Page } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { click, env, expect, point, sleep, type } from "./stage.ts";

export interface TestPerson {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phoneDigits: string; // US test number, 10 digits, 555-01XX
  password: string;
}

export function person(role: string, firstName: string, lastName: string, phoneSuffix: string): TestPerson {
  const run = Date.now().toString(36);
  return {
    firstName,
    lastName,
    username: `${env.userPrefix.replace(/-/g, "_")}${role}_${run}`,
    email: `${env.userPrefix}${role}-${run}+clerk_test@example.com`,
    phoneDigits: `20155501${phoneSuffix}`,
    password: `Rec-${run}-Pass!2026`,
  };
}

async function enterCode(page: Page) {
  const code = page.getByRole("textbox", { name: /verification code/i }).first();
  await code.waitFor({ timeout: 30_000 });
  await point(page, code);
  await code.click();
  await page.keyboard.type("424242", { delay: 90 });
  await sleep(1500);
}


/** Clerk "session tasks" configured in the Clerk dashboard (e.g. required organizations) appear after sign-up/in. */
async function completeClerkTasks(page: Page, organization: string) {
  for (let i = 0; i < 3; i++) {
    const task = await Promise.race([
      page.getByRole("heading", { name: /Setup your organization|Choose an organization|Create organization/i }).waitFor({ timeout: 12_000 }).then(() => "org"),
      page.waitForURL((url) => !/\/(sign-up|sign-in)/.test(url.pathname), { timeout: 12_000 }).then(() => "done"),
    ]).catch(() => "unknown");
    if (task !== "org") return;
    const name = page.getByRole("textbox", { name: "Name" });
    if (await name.count()) await type(page, name, organization);
    const create = page.getByRole("button", { name: /^(Continue|Create organization)$/ }).first();
    await click(page, create);
    await page.waitForTimeout(2500);
  }
}

export async function signUp(page: Page, p: TestPerson, organization = `${p.firstName}'s team`) {
  await setupClerkTestingToken({ page });
  await page.goto(`${env.admin}/sign-up`);
  await page.locator("#username-field").waitFor();
  await type(page, page.locator("#firstName-field"), p.firstName);
  await type(page, page.locator("#lastName-field"), p.lastName);
  await type(page, page.locator("#username-field"), p.username);
  await type(page, page.locator("#emailAddress-field"), p.email);
  // Clerk's fictional numbers are US numbers; switch the country picker from India to the US.
  await click(page, page.getByRole("button", { name: "in", exact: true }));
  await page.keyboard.type("United States", { delay: 40 });
  await sleep(500);
  const us = page.getByRole("option", { name: /United States/ }).first();
  if (await us.isVisible({ timeout: 3000 }).catch(() => false)) await click(page, us); else await page.keyboard.press("Enter");
  await type(page, page.locator("#phoneNumber-field"), p.phoneDigits);
  await type(page, page.locator("#password-field"), p.password);
  await click(page, page.getByRole("button", { name: "Continue", exact: true }));
  // Email, then phone verification (order depends on the instance; handle whatever appears).
  for (let i = 0; i < 3; i++) {
    const step = await Promise.race([
      page.getByRole("heading", { name: /Verify your (email|phone)/i }).waitFor({ timeout: 20_000 }).then(() => "verify"),
      page.waitForURL((url) => !url.pathname.startsWith("/sign-up"), { timeout: 20_000 }).then(() => "done"),
    ]).catch(() => "unknown");
    if (step !== "verify") break;
    const heading = await page.getByRole("heading", { name: /Verify your/i }).textContent();
    await enterCode(page);
    await page.waitForFunction((h) => !document.body.innerText.includes(h ?? ""), heading, { timeout: 20_000 }).catch(() => {});
  }
  await completeClerkTasks(page, organization);
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-up"), { timeout: 45_000 });
}

export async function signIn(page: Page, p: TestPerson) {
  await setupClerkTestingToken({ page });
  await page.goto(`${env.admin}/sign-in`);
  const identifier = page.locator('input[name="identifier"]');
  await identifier.waitFor();
  await type(page, identifier, p.username);
  await click(page, page.getByRole("button", { name: "Continue", exact: true }));
  const password = page.locator('input[name="password"]');
  await password.waitFor();
  await type(page, password, p.password);
  await click(page, page.getByRole("button", { name: "Continue", exact: true }));
  // A new device may be asked for a second factor / email code.
  const needsCode = await Promise.race([
    page.getByRole("textbox", { name: /verification code/i }).first().waitFor({ timeout: 8000 }).then(() => true),
    page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 8000 }).then(() => false),
  ]).catch(() => false);
  if (needsCode) await enterCode(page);
  await completeClerkTasks(page, `${p.firstName}'s team`);
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 45_000 });
}

export async function signOut(page: Page) {
  await click(page, page.locator(".cl-userButtonTrigger"));
  await click(page, page.getByRole("menuitem", { name: /Sign out/i }));
  await page.waitForURL(/sign-in|accounts\.dev/, { timeout: 30_000 }).catch(() => {});
}

/**
 * Regression check (fixed 2026-10-06): right after Clerk sign-in/sign-up the admin used to request /v1/session
 * before the token was ready and show "We couldn't load your account". It must now go straight to the app.
 */
export async function expectAccountLoaded(page: Page) {
  const failed = page.getByText("We couldn't load your account");
  const nav = page.getByRole("navigation", { name: "Main" });
  const onboarding = page.getByRole("heading", { name: /set up your restaurant|create your restaurant/i });
  await expect(nav.or(onboarding).or(failed).first()).toBeVisible({ timeout: 30_000 });
  if (await failed.isVisible()) throw new Error("Regression: admin showed \"We couldn't load your account\" right after sign-in.");
}

/** Makes sure the admin window is signed in as `p` (re-signs in if the carried session expired). */
export async function ensureSignedIn(page: Page, p: TestPerson, say?: (text: string, where?: "both" | "admin" | "store") => Promise<void>) {
  await page.goto(env.admin);
  await page.waitForLoadState("networkidle").catch(() => {});
  if (/sign-in|accounts\.dev/.test(page.url())) {
    await say?.(`${p.firstName} signs in`, "admin");
    await signIn(page, p);
    await expectAccountLoaded(page);
  }
}
