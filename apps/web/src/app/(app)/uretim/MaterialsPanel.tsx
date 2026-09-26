import { getTranslations } from "next-intl/server";

export interface MaterialLine {
  itemId: string;
  code: string;
  name: string;
  uom: string;
  requiredQty: string;
  availableQty: string;
  shortageQty: string;
  ok: boolean;
}
export interface Materials {
  hasBom: boolean;
  hasShortage: boolean;
  lines: MaterialLine[];
}

/** URT-02: parti adedine ölçeklenmiş malzeme ihtiyacı ve stok uygunluğu. */
export async function MaterialsPanel({ materials }: { materials: Materials }) {
  const t = await getTranslations("production.materials");
  if (!materials.hasBom) {
    return (
      <section className="rounded-[16px] border border-line bg-surface p-5">
        <h3 className="m-0 font-display text-[16px] font-semibold">{t("title")}</h3>
        <p className="mt-2 mb-0 text-[13px] text-muted">{t("noBom")}</p>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-3 rounded-[16px] border border-line bg-surface p-5">
      <div>
        <h3 className="m-0 font-display text-[16px] font-semibold">{t("title")}</h3>
        <p className="m-0 text-[12px] text-muted">{t("subtitle")}</p>
      </div>
      {materials.hasShortage && <p className="m-0 rounded-[9px] bg-bad-bg px-3 py-2 text-[13px] text-bad">{t("shortageWarn")}</p>}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="py-1.5 pr-3 font-semibold">{t("code")}</th>
              <th className="py-1.5 pr-3 font-semibold">{t("name")}</th>
              <th className="py-1.5 pr-3 text-right font-semibold">{t("required")}</th>
              <th className="py-1.5 pr-3 text-right font-semibold">{t("available")}</th>
              <th className="py-1.5 text-right font-semibold">{t("shortage")}</th>
            </tr>
          </thead>
          <tbody>
            {materials.lines.map((l) => (
              <tr key={l.itemId} className="border-t border-line-soft">
                <td className="num py-1.5 pr-3 text-muted">{l.code}</td>
                <td className="py-1.5 pr-3">{l.name}</td>
                <td className="num py-1.5 pr-3 text-right font-semibold">
                  {l.requiredQty} {l.uom}
                </td>
                <td className="num py-1.5 pr-3 text-right">
                  {l.availableQty} {l.uom}
                </td>
                <td className="py-1.5 text-right">
                  {l.ok ? (
                    <span className="rounded-full bg-ok-bg px-2 py-0.5 text-[12px] font-semibold text-ok">✓ {t("ok")}</span>
                  ) : (
                    <span className="num rounded-full bg-bad-bg px-2 py-0.5 text-[12px] font-semibold text-bad">
                      −{l.shortageQty} {l.uom}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
