import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/Topbar";
import { getMe } from "@/lib/api-server";
import { canView, findBySlug } from "@/lib/modules";

/** Henüz geliştirilmemiş modüller için yer tutucu: hangi fazda geleceğini söyler. */
export default async function ModulePlaceholder({ params }: { params: Promise<{ modul: string }> }) {
  const { modul } = await params;
  const item = findBySlug(modul);
  if (!item) notFound();

  const t = await getTranslations();
  const me = await getMe();
  const allowed = canView(me.permissions, item.permission);

  return (
    <>
      <Topbar heading={t(`nav.modules.${item.key}`)} />
      <div className="px-4 py-5 sm:px-8">
        <section className="flex max-w-2xl flex-col gap-3 rounded-[16px] border border-line bg-surface p-6">
          {allowed ? (
            <>
              <span className="eyebrow">{t("placeholder.eyebrow")}</span>
              <h2 className="m-0 font-display text-[19px] font-semibold">
                {t("placeholder.title", { phase: item.phase })}
              </h2>
              <p className="m-0 text-[13.5px] leading-relaxed text-text-2">{t("placeholder.body")}</p>
              {item.spec && (
                <p className="m-0 text-xs text-muted">
                  {t("placeholder.spec", { file: `docs/03-moduller/${item.spec}` })}
                </p>
              )}
            </>
          ) : (
            <p role="alert" className="m-0 rounded-[10px] bg-warn-bg px-4 py-3 text-[13px] text-warn">
              {t("placeholder.noAccess")}
            </p>
          )}
        </section>
      </div>
    </>
  );
}
