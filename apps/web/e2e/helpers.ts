import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { E2E, type E2EState } from "./env";

export const state = JSON.parse(readFileSync(E2E.stateFile, "utf8")) as E2EState;

export const nav = (page: Page) => page.getByRole("navigation", { name: "Modüller" });

/** Uygulama uyarıları (Next.js'in gizli rota duyurucusu da role=alert taşır, hariç tutulur). */
export const alert = (page: Page) => page.locator("[role=alert]:not(#__next-route-announcer__)");

/** Giriş yapar; başarı beklenirse kontrol paneline yönlenmeyi bekler. */
export async function login(page: Page, email: string, password: string, expectSuccess = true) {
  await page.goto("/giris");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill(password);
  await page.getByRole("button", { name: "Devam et" }).click();
  if (expectSuccess) await expect(page).toHaveURL(/\/$/);
}

export const loginAdmin = (page: Page) => login(page, state.admin.email, state.admin.password);

/** Görsel kontrol için ekran görüntüsü (test-results/screens, git'e girmez). */
export const screenshot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });
