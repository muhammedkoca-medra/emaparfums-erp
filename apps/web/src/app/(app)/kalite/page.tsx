import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/Topbar";
import { apiGet, getMe } from "@/lib/api-server";
import { canView } from "@/lib/modules";

interface Inspection {
  id: string;
  status: string;
  lot: { id: string; lotNo: string; qcStatus: string; itemCode: string; itemName: string };
  results: { code: string; passed: boolean }[];
}
interface Nc {
  id: string;
  number: string;
  description: string;
  status: string;
}

const PILL: Record<string, string> = {
  PENDING: "bg-surface-soft text-muted",
  TESTING: "bg-warn-bg text-warn",
  PASSED: "bg-ok-bg text-ok",
  FAILED: "bg-bad-bg text-bad",
};

export default async function QualityPage() {
  const t = await getTranslations("quality");
  const me = await getMe();
  if (!canView(me.permissions, "quality")) {
    return (
      <>
        <Topbar heading={t("title")} />
        <p role="alert" className="mx-4 my-5 max-w-2xl rounded-[10px] bg-warn-bg px-4 py-3 text-[13px] text-warn sm:mx-8">
          {t("noAccess")}
        </p>
      </>
    );
  }
  const [inspections, ncs] = await Promise.all([apiGet<Inspection[]>("/quality/inspections"), apiGet<Nc[]>("/quality/nonconformances")]);
  const th = "px-2 py-2 text-left text-[11px] font-bold tracking-[0.08em] text-muted uppercase";
  const td = "border-t border-line-soft px-2 py-2.5 text-[13px]";

  return (
    <>
      <Topbar heading={t("title")} sub={t("subtitle")} />
      <div className="flex flex-col gap-6 px-4 py-5 sm:px-8">
        <section className="rounded-[16px] border border-line bg-surface p-5">
          <h2 className="m-0 mb-3 font-display text-[17px] font-semibold">{t("queue")}</h2>
          {inspections.length === 0 ? (
            <p className="m-0 text-[13px] text-muted">{t("empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={th}>{t("col.lot")}</th>
                    <th className={th}>{t("col.item")}</th>
                    <th className={th}>{t("tests")}</th>
                    <th className={th}>{t("col.status")}</th>
                    <th className={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {inspections.map((i) => {
                    const passed = i.results.filter((r) => r.passed).length;
                    return (
                      <tr key={i.id}>
                        <td className={`${td} num font-semibold`}>{i.lot.lotNo}</td>
                        <td className={td}>
                          <span className="num text-muted">{i.lot.itemCode}</span> · {i.lot.itemName}
                        </td>
                        <td className={`${td} num`}>
                          {passed}/{i.results.length}
                        </td>
                        <td className={td}>
                          <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${PILL[i.status] ?? "bg-surface-soft"}`}>{t(`status.${i.status}`)}</span>
                        </td>
                        <td className={td}>
                          <Link href={`/kalite/${i.id}`} className="font-semibold text-gold-2">
                            {t("open")} →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-[16px] border border-line bg-surface p-5">
          <h2 className="m-0 mb-3 font-display text-[17px] font-semibold">{t("nc.title")}</h2>
          {ncs.length === 0 ? (
            <p className="m-0 text-[13px] text-muted">{t("nc.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={th}>{t("nc.number")}</th>
                    <th className={th}>{t("nc.desc")}</th>
                    <th className={th}>{t("nc.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ncs.map((n) => (
                    <tr key={n.id}>
                      <td className={`${td} num font-semibold`}>{n.number}</td>
                      <td className={td}>{n.description}</td>
                      <td className={td}>{t(`nc.${n.status}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
