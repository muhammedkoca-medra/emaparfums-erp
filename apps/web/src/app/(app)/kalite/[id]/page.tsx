import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/Topbar";
import { ApiError, apiGet, getMe } from "@/lib/api-server";
import { InspectionForm } from "./InspectionForm";

export interface InspectionDetail {
  id: string;
  status: string;
  lot: { id: string; lotNo: string; qcStatus: string };
  tests: { testId: string; code: string; name: string; value: string | null; passed: boolean | null }[];
}

export default async function InspectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("quality");
  const me = await getMe();
  let insp: InspectionDetail;
  try {
    insp = await apiGet<InspectionDetail>(`/quality/inspections/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
  const canApprove = me.permissions.includes("quality:APPROVE");
  const canEdit = me.permissions.includes("quality:EDIT");

  return (
    <>
      <Topbar heading={`${insp.lot.lotNo}`} sub={t("queue")} />
      <div className="flex flex-col gap-5 px-4 py-5 sm:px-8">
        <Link href="/kalite" className="self-start text-[13px] font-semibold">
          ← {t("back")}
        </Link>
        <InspectionForm inspection={insp} canEdit={canEdit} canApprove={canApprove} />
      </div>
    </>
  );
}
