import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { COUNT_TONE, Pill } from "@/components/Pill";
import { Topbar } from "@/components/Topbar";
import { ApiError, apiGet, getMe } from "@/lib/api-server";
import { fmtMoney, fmtQty } from "@/lib/format";
import { type StockRules } from "@/lib/stock-types";
import { CountEditor, type CountLine } from "./CountEditor";

interface CountDetail {
  id: string;
  status: "OPEN" | "SUBMITTED" | "APPROVED";
  zone: string | null;
  isBlind: boolean;
  needsApproval: boolean;
  varianceValue: string | null;
  systemHidden: boolean;
  warehouse: { name: string };
  lines: CountLine[];
}

export default async function CountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("stock");
  const me = await getMe();
  let count: CountDetail;
  try {
    count = await apiGet<CountDetail>(`/stock/counts/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const rules = await apiGet<StockRules>("/stock/rules");
  const perms = new Set(me.permissions);
  return (
    <>
      <Topbar
        heading={`${t("counts.title")} · ${count.warehouse.name}${count.zone ? ` · ${count.zone}` : ""}`}
        action={<Pill tone={COUNT_TONE[count.status]}>{t(`counts.status.${count.status}`)}</Pill>}
      />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        <Link href="/stok/sayim" className="self-start text-[13px] font-semibold">
          ← {t("counts.back")}
        </Link>
        {count.varianceValue && (
          <p className="m-0 max-w-2xl rounded-[10px] bg-surface-soft px-4 py-3 text-[13px]">
            {t("counts.variance", { value: fmtQty(count.varianceValue) })}
            {count.status === "SUBMITTED" && count.needsApproval && ` · ${t("counts.needsApproval")}`}
            {count.status === "APPROVED" && ` · ${t("counts.done")}`}
          </p>
        )}
        <CountEditor
          id={count.id}
          status={count.status}
          lines={count.lines}
          systemHidden={count.systemHidden}
          canEdit={perms.has("stock:EDIT")}
          canApprove={perms.has("stock:APPROVE")}
          thresholdLabel={fmtMoney(String(rules["stock.countApprovalThreshold"]?.value ?? "0"))}
        />
      </div>
    </>
  );
}
