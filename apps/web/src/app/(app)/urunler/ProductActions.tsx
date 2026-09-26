import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import type { ICONS } from "@/lib/modules";

/** Ürün hızlı erişim butonları: üretim, stok, satış raporu, ücretlendirme. İlgili sayfaya yönlendirir. */
export function ProductActions({
  itemId,
  size = "sm",
}: {
  itemId: string;
  size?: "sm" | "md";
}) {
  const t = useTranslations("catalog.hub");
  const buttons: { key: string; href: string; icon: keyof typeof ICONS; label: string }[] = [
    { key: "production", href: "/uretim", icon: "flask", label: t("production") },
    { key: "stock", href: `/stok/kalem/${itemId}`, icon: "box", label: t("stock") },
    { key: "salesReport", href: "/satis", icon: "trend", label: t("salesReport") },
    { key: "pricing", href: "/fiyatlandirma", icon: "coin", label: t("pricing") },
  ];
  const cls =
    size === "md"
      ? "flex flex-col items-center gap-1 rounded-[12px] border border-line bg-surface px-2 py-3 text-[12px] font-semibold text-text-2 no-underline transition-colors hover:border-gold-2 hover:text-text"
      : "flex items-center gap-1.5 rounded-[9px] border border-line bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-text-2 no-underline transition-colors hover:border-gold-2 hover:text-text";
  return (
    <div className={size === "md" ? "grid grid-cols-4 gap-2" : "flex flex-wrap gap-1.5"}>
      {buttons.map((b) => (
        <Link key={b.key} href={b.href} className={cls}>
          <span className="text-gold-text">
            <Icon name={b.icon} size={size === "md" ? 20 : 15} />
          </span>
          {b.label}
        </Link>
      ))}
    </div>
  );
}
