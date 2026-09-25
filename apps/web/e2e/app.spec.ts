import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { E2E, type E2EState } from "./env";

/**
 * Uçtan uca senaryo: yönetici girer, sistemi dener, yeni bir depo kullanıcısı açar;
 * kullanıcı yetkisine göre menüyü görür, parolasını değiştirir; yönetici onu devre dışı bırakır.
 * Testler sırayla koşar ve aynı veritabanı durumunu paylaşır.
 */
test.describe.configure({ mode: "serial" });

const state = JSON.parse(readFileSync(E2E.stateFile, "utf8")) as E2EState;
const run = Date.now().toString(36);
const worker = {
  fullName: `Deniz Depocu ${run}`,
  email: `depo-${run}@emaparfums.local`,
  password: "Gecici-parola-2026",
  newPassword: "Yeni-depo-parolasi-2026",
};

const nav = (page: Page) => page.getByRole("navigation", { name: "Modüller" });
/** Uygulama uyarıları (Next.js'in gizli rota duyurucusu da role=alert taşır, hariç tutulur). */
const alert = (page: Page) => page.locator("[role=alert]:not(#__next-route-announcer__)");

/** Giriş yapar; başarı beklenirse kontrol paneline yönlenmeyi bekler (yarış durumunu önler). */
async function login(page: Page, email: string, password: string, expectSuccess = true) {
  await page.goto("/giris");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill(password);
  await page.getByRole("button", { name: "Devam et" }).click();
  if (expectSuccess) await expect(page).toHaveURL(/\/$/);
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "Çıkış yap" }).click();
  await expect(page).toHaveURL(/\/giris$/);
}

test("oturum yoksa giriş ekranına yönlendirir", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/giris$/);
  await expect(page.getByRole("heading", { name: "Giriş yap" })).toBeVisible();
  await expect(page).toHaveTitle("EMA Parfums · Parfüm İşletim Sistemi");
});

test("hatalı parolada Türkçe hata mesajı", async ({ page }) => {
  await login(page, state.admin.email, "yanlis-parola", false);
  await expect(alert(page)).toHaveText("E-posta veya parola hatalı");
  await expect(page).toHaveURL(/\/giris$/);
});

test("yönetici girer; kontrol paneli ve tüm menü görünür", async ({ page }) => {
  await login(page, state.admin.email, state.admin.password);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Test");
  await expect(page.getByText("Faz 0 · Temel altyapı")).toBeVisible();
  await expect(page.getByText("Çalışıyor")).toBeVisible();
  for (const item of [
    "Kontrol Paneli",
    "Stok Takip",
    "Faturalandırma",
    "Koku Laboratuvarı",
    "Yetki & Kayıtlar",
  ]) {
    await expect(nav(page).getByRole("link", { name: item })).toBeVisible();
  }
});

test("olay hattı: test olayı worker'a ulaşır", async ({ page }) => {
  await login(page, state.admin.email, state.admin.password);
  const dispatched = page.locator("dt", { hasText: "İletilen" }).locator("xpath=following-sibling::dd");
  const before = Number(await dispatched.textContent());
  await page.getByRole("button", { name: "Olay hattını test et" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Test olayı gönderildi" })).toBeVisible();
  // Worker olayı kuyruğa alıp DISPATCHED yapınca "İletilen" sayacı artar.
  await expect(async () => {
    await page.reload();
    expect(Number(await dispatched.textContent())).toBeGreaterThan(before);
  }).toPass({ timeout: 15_000 });
});

test("yönetici ekrandan yeni kullanıcı oluşturur; işlem geçmişine yazılır", async ({ page }) => {
  await login(page, state.admin.email, state.admin.password);
  await nav(page).getByRole("link", { name: "Yetki & Kayıtlar" }).click();
  await expect(page).toHaveURL(/\/yetki$/);

  await page.getByRole("button", { name: "Kullanıcı ekle" }).click();
  const form = page.getByRole("form", { name: "Yeni kullanıcı" });
  await form.getByLabel("Ad soyad").fill(worker.fullName);
  await form.getByLabel("E-posta").fill(worker.email);
  await form.getByLabel("Geçici parola").fill(worker.password);
  await form.getByLabel("Depo").check();
  await form.getByRole("button", { name: "Kullanıcıyı oluştur" }).click();

  const row = page.getByRole("row", { name: new RegExp(worker.email) });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Depo");
  await expect(row).toContainText("Etkin");
  await expect(page.getByRole("cell", { name: "Kullanıcı oluşturuldu" }).first()).toBeVisible();
});

test("depo kullanıcısı yalnızca yetkili modülleri görür", async ({ page }) => {
  await login(page, worker.email, worker.password);
  await expect(page).toHaveURL(/\/$/);
  await expect(nav(page).getByRole("link", { name: "Stok Takip" })).toBeVisible();
  await expect(nav(page).getByRole("link", { name: "Kargo Takip" })).toBeVisible();
  await expect(nav(page).getByRole("link", { name: "Yetki & Kayıtlar" })).toHaveCount(0);
  await expect(nav(page).getByRole("link", { name: "Faturalandırma" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Olay hattını test et" })).toHaveCount(0);

  await page.goto("/stok");
  await expect(page.getByRole("heading", { name: "Bu modül Faz 1 kapsamında geliştirilecek" })).toBeVisible();

  // Menüde olmayan sayfaya doğrudan gidince yetki uyarısı (asıl kontrol API'de)
  await page.goto("/yetki");
  await expect(alert(page)).toContainText("görüntüleme yetkiniz yok");
});

test("kullanıcı Hesabım ekranından parolasını değiştirir", async ({ page }) => {
  await login(page, worker.email, worker.password);
  await page.getByRole("link", { name: new RegExp(worker.fullName) }).click();
  await expect(page).toHaveURL(/\/hesap$/);

  await page.getByLabel("Mevcut parola").fill(worker.password);
  await page.getByLabel("Yeni parola", { exact: true }).fill(worker.newPassword);
  await page.getByLabel("Yeni parola (tekrar)").fill("farkli-bir-parola-2026");
  await page.getByRole("button", { name: "Parolayı değiştir" }).click();
  await expect(alert(page)).toHaveText("Yeni parolalar birbiriyle aynı değil");

  await page.getByLabel("Yeni parola (tekrar)").fill(worker.newPassword);
  await page.getByRole("button", { name: "Parolayı değiştir" }).click();
  await expect(page.getByRole("status")).toHaveText("Parolanız değiştirildi.");
  await logout(page);

  await login(page, worker.email, worker.password, false);
  await expect(alert(page)).toHaveText("E-posta veya parola hatalı");
  await login(page, worker.email, worker.newPassword);
  await expect(page).toHaveURL(/\/$/);
});

test("yönetici kullanıcıyı devre dışı bırakır; kullanıcı giremez", async ({ page }) => {
  await login(page, state.admin.email, state.admin.password);
  await page.goto("/yetki");
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: `Devre dışı bırak · ${worker.fullName}` }).click();
  await expect(page.getByRole("row", { name: new RegExp(worker.email) })).toContainText("Devre dışı");
  await expect(page.getByRole("cell", { name: "Kullanıcı durumu değişti" }).first()).toBeVisible();
  // Yönetici kendi satırında işlem düğmesi görmez (kendini kilitleme koruması)
  await expect(page.getByRole("button", { name: `Devre dışı bırak · ${state.admin.fullName}` })).toHaveCount(
    0,
  );
  await logout(page);

  await login(page, worker.email, worker.newPassword, false);
  await expect(alert(page)).toHaveText("E-posta veya parola hatalı");
});

test("bulunamayan sayfa Türkçe", async ({ page }) => {
  await login(page, state.admin.email, state.admin.password);
  await page.goto("/boyle-bir-sayfa-yok/alt");
  await expect(page.getByRole("heading", { name: "Sayfa bulunamadı" })).toBeVisible();
});

test("mobil görünüm: menü düğmeyle açılır", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, state.admin.email, state.admin.password);
  await page.getByRole("button", { name: "Menüyü aç" }).click();
  await nav(page).getByRole("link", { name: "Stok Takip" }).click();
  await expect(page).toHaveURL(/\/stok$/);
});
