import { expect, test } from "@playwright/test";
import { alert, loginAdmin, nav, screenshot } from "./helpers";

/**
 * Stok takip uçtan uca: liste, filtre, arama, kalem detayı, düzeltme, elle giriş (karantina),
 * kalite onayı, rezervasyon, SKT listesi, kural değişikliği ve sayım (onaylı).
 */
test.describe.configure({ mode: "serial" });

const row = (page: import("@playwright/test").Page, text: string) =>
  page.getByRole("table", { name: "Stok kalemleri" }).getByRole("row").filter({ hasText: text });

test("stok listesi prototip tablosunu gerçek veriyle üretir", async ({ page }) => {
  await loginAdmin(page);
  await screenshot(page, "01-kontrol-paneli");
  await nav(page).getByRole("link", { name: "Stok Takip" }).click();
  await expect(page).toHaveURL(/\/stok$/);
  await expect(page.getByRole("heading", { level: 1, name: "Stok takip" })).toBeVisible();

  // Bergamot: 6,2 kg eldeki, 4 kg rezerve → kullanılabilir 2,2 < min 8 → Kritik
  const bergamot = row(page, "Bergamot");
  await expect(bergamot).toContainText("L-2607-C");
  await expect(bergamot).toContainText("6,2 kg");
  await expect(bergamot).toContainText("Kritik");
  await expect(bergamot).toContainText("A1-01");
  // Velvet Iris: SKT 2026-12-10 (90 gün içinde) → SKT yakın
  await expect(row(page, "Velvet Iris")).toContainText("SKT yakın");
  // Stoğu olmayan kalem de listede
  await expect(row(page, "MM-1003")).toContainText("Kritik");
  // KPI: 3 kritik kalem (Bergamot, şişe, MM-1003)
  await expect(page.getByText("Kritik kalem").locator("..")).toContainText("3");
  await screenshot(page, "02-stok-takip");
});

test("tür sekmesi ve arama filtreler", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/stok");
  await page.getByRole("link", { name: "Ambalaj", exact: true }).click();
  await expect(page).toHaveURL(/tip=PACKAGING/);
  await expect(row(page, "Cam şişe")).toHaveCount(1);
  await expect(row(page, "Bergamot")).toHaveCount(0);

  await page.goto("/stok");
  await page.getByLabel("Stokta ara").fill("L-2511");
  await page.getByLabel("Stokta ara").press("Enter");
  await expect(page).toHaveURL(/q=L-2511/);
  await expect(row(page, "Velvet Iris")).toHaveCount(1);
  await expect(row(page, "Bergamot")).toHaveCount(0);
});

test("kalem detayında düzeltme hareketi yazılır", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/stok");
  await row(page, "Velvet Iris").getByRole("link", { name: "MM-1011" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("MM-1011 · Velvet Iris EDP 100 ml");

  await page.getByRole("tab", { name: "Düzeltme" }).click();
  await page.getByLabel("Azalış (−)").check();
  await page.getByLabel(/^Miktar/).fill("2");
  await page.getByLabel("Not / gerekçe").fill("Kırık şişe");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByRole("status")).toHaveText("Kaydedildi.");
  await expect(
    page.getByRole("table", { name: "Hareket geçmişi" }).getByRole("row").filter({ hasText: "Kırık şişe" }),
  ).toContainText("Düzeltme");
  await expect(page.getByText("460 ad").first()).toBeVisible();

  // Kullanılabilirden fazlası reddedilir, Türkçe mesaj
  await page.getByLabel("Azalış (−)").check();
  await page.getByLabel(/^Miktar/).fill("9999");
  await page.getByLabel("Not / gerekçe").fill("Deneme");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(alert(page)).toContainText("Yetersiz kullanılabilir stok");
});

test("elle stok girişi yeni lotu karantinada açar; kalite onayıyla serbest kalır", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/stok");
  await page.getByRole("link", { name: "Stok girişi" }).click();
  await expect(page).toHaveURL(/\/stok\/giris$/);
  await page.getByLabel("Kalem").selectOption({ label: "MM-1003 · Noir Ambré EDP 50 ml" });
  await page.getByLabel("Lokasyon").selectOption({ label: "Ana depo · D2-01" });
  await page.getByLabel(/^Miktar/).fill("120");
  await page.getByLabel("Lot numarası").fill("L-2609-E2E");
  await page.getByLabel("Son kullanma tarihi").fill("2029-09-30");
  await page.getByRole("button", { name: "Kaydet" }).click();

  await expect(page).toHaveURL(/\/stok\/kalem\//);
  const lotRow = page
    .getByRole("table", { name: "Lotlar ve lokasyonlar" })
    .getByRole("row")
    .filter({ hasText: "L-2609-E2E" });
  await expect(lotRow).toContainText("Karantina");
  await expect(lotRow).toContainText("120 ad");

  await page.getByRole("tab", { name: "Kalite durumu" }).click();
  await page.getByLabel("Yeni durum").selectOption("RELEASED");
  await page.getByLabel("Gerekçe").fill("Koku ve görünüm uygun");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByRole("status")).toHaveText("Kaydedildi.");
  await expect(
    page
      .getByRole("table", { name: "Lotlar ve lokasyonlar" })
      .getByRole("row")
      .filter({ hasText: "L-2609-E2E" }),
  ).toContainText("Serbest");
});

test("rezervasyon FEFO ile ayrılır ve kaldırılır", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/stok?q=MM-1003");
  await row(page, "MM-1003").first().getByRole("link", { name: "MM-1003" }).click();
  await page.getByRole("tab", { name: "Rezervasyon" }).click();
  await page.getByLabel(/^Miktar/).fill("20");
  await page.getByLabel("Not / gerekçe").fill("Numune seti");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByRole("status")).toHaveText("Kaydedildi.");
  const res = page.getByRole("listitem").filter({ hasText: "Numune seti" });
  await expect(res).toContainText("20 ad");
  page.once("dialog", (d) => void d.accept());
  await res.getByRole("button", { name: "Rezervasyonu kaldır" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Numune seti" })).toHaveCount(0);
});

test("SKT listesi ve kural değişikliği", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/stok/skt");
  await expect(page.getByRole("row").filter({ hasText: "L-2511-C" })).toBeVisible();

  await page.goto("/stok/kurallar");
  const field = page.getByLabel("SKT uyarı süresi (gün)");
  await field.fill("30");
  await field.locator("xpath=ancestor::form").getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByRole("status").first()).toHaveText("Kural güncellendi.");
  // 30 günde Velvet Iris (Aralık 2026) artık listede değil
  await page.goto("/stok/skt");
  await expect(page.getByText("Bu süre içinde SKT'si dolan lot yok.")).toBeVisible();
  await page.goto("/stok/kurallar");
  await page.getByLabel("SKT uyarı süresi (gün)").fill("90");
  await page
    .getByLabel("SKT uyarı süresi (gün)")
    .locator("xpath=ancestor::form")
    .getByRole("button", { name: "Kaydet" })
    .click();
  await expect(page.getByRole("status").first()).toHaveText("Kural güncellendi.");
});

test("sayım: fark girilir, maliyet yoksa yönetici onayıyla düzeltilir", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/stok/sayim");
  const form = page.getByRole("form", { name: "Yeni sayım" });
  await form.getByLabel("Depo").selectOption({ label: "Soğuk oda (12–15°C)" });
  await form.getByRole("button", { name: "Sayımı başlat" }).click();
  await expect(page).toHaveURL(/\/stok\/sayim\/.+/);

  await page.getByLabel(/^Sayılan · HM-0104/).fill("6");
  await page.getByRole("button", { name: "Sayımı gönder" }).click();
  await expect(page.getByText("Onay bekliyor").first()).toBeVisible();
  await screenshot(page, "03-sayim");
  await page.getByRole("button", { name: "Onayla ve düzelt" }).click();
  await expect(page.getByText("Onaylandı").first()).toBeVisible();

  await page.goto("/stok?q=HM-0104");
  await expect(row(page, "Bergamot")).toContainText("6 kg");
});
