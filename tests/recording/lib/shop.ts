// Customer-side helpers for placing orders on the storefront.
import type { Page } from "@playwright/test";
import { click, env, expect, sleep, type } from "./stage.ts";

export async function addSimple(store: Page, name: string) {
  await click(store, store.getByRole("button", { name: new RegExp(`^Add ${name}$`) }).first());
  await expect(store.getByText(`${name} added`).first()).toBeVisible();
  await store.getByText(`${name} added`).first().waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
}

export async function addWithOptions(store: Page, name: string, choices: string[] = []) {
  await click(store, store.getByRole("button", { name: new RegExp(`^Add ${name} \\(choose options\\)`) }).first());
  const sheet = store.getByRole("dialog");
  for (const c of choices) await click(store, sheet.getByLabel(c));
  await click(store, sheet.getByRole("button", { name: /^Add · / }));
  await expect(store.getByText(`${name} added`).first()).toBeVisible();
  await store.getByText(`${name} added`).first().waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
}

export async function contact(store: Page, name: string, phone: string) {
  await type(store, store.getByLabel("Name"), name);
  await type(store, store.getByLabel("Mobile number"), phone);
}

export async function address(store: Page, line1: string, pincode: string) {
  await type(store, store.getByLabel("House / flat, building, street"), line1);
  await type(store, store.getByLabel("City"), "Bengaluru");
  await type(store, store.getByLabel("Pincode"), pincode);
}

/** Places the order from checkout and completes the test-mode payment; returns order token and number. */
export async function placeAndPay(store: Page, outcome: "success" | "leave" = "success"): Promise<{ token: string; number: number }> {
  await click(store, store.getByRole("button", { name: /^Place order/ }));
  await expect(store).toHaveURL(/\/order\/[^/]+\/pay$/);
  const token = store.url().split("/order/")[1]!.split("/")[0]!;
  const number = Number((await store.getByText(/^Order #\d+/).first().textContent())!.match(/#(\d+)/)![1]);
  if (outcome === "success") {
    await click(store, store.getByRole("button", { name: /^Pay / }));
    await expect(store.getByRole("heading", { name: /Order #\d+ confirmed/ })).toBeVisible();
  }
  return { token, number };
}

export async function orderPage(store: Page, token: string) {
  await store.goto(`${env.storefront}/order/${token}`);
  await sleep(500);
}
