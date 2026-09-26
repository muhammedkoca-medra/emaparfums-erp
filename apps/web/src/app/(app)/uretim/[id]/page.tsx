import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BottleViewer } from "@/components/BottleViewer";
import { Topbar } from "@/components/Topbar";
import { ApiError, apiGet, getMe } from "@/lib/api-server";
import { AdvanceButton } from "../AdvanceButton";
import { BatchEditor } from "../BatchEditor";
import { MacerationClock } from "../MacerationClock";
import { type Materials, MaterialsPanel } from "../MaterialsPanel";
import { MixBeaker } from "../MixBeaker";
import { OutputForm } from "../OutputForm";
import { StageBadge } from "../StageBadge";
import { StageStepper } from "../StageStepper";

interface Batch {
  id: string;
  number: string;
  stage: string;
  plannedQty: number;
  producedQty: number;
  essenceGr: string | null;
  baseGr: string | null;
  essencePct: number | null;
  basePct: number | null;
  totalGr: number | null;
  macerationDays: number | null;
  macerationPlace: string | null;
  bottleType: string | null;
  maceration: { start: string; days: number; remainingMs: number; done: boolean } | null;
  product: { id: string; name: string; sku: string; itemCode: string };
  formula: { id: string; code: string; version: number };
  stageLogs: { stage: string; startedAt: string; endedAt: string | null; note: string | null }[];
}

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("production");
  const me = await getMe();
  let b: Batch;
  try {
    b = await apiGet<Batch>(`/production/batches/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
  const canEdit = me.permissions.includes("production:EDIT");
  let materials: Materials | null = null;
  try {
    materials = await apiGet<Materials>(`/production/batches/${encodeURIComponent(id)}/materials`);
  } catch {
    materials = null;
  }

  return (
    <>
      <Topbar heading={`${b.number} · ${b.product.name}`} sub={`${b.product.sku} · ${b.formula.code} v${b.formula.version}`} action={<StageBadge stage={b.stage} />} />
      <div className="flex flex-col gap-5 px-4 py-5 sm:px-8">
        <Link href="/uretim" className="self-start text-[13px] font-semibold">
          ← {t("back")}
        </Link>

        <StageStepper stage={b.stage} />

        {/* Görsel süreç: karışım + demlenme + şişe */}
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <MixBeaker essenceGr={b.essenceGr} baseGr={b.baseGr} essencePct={b.essencePct} basePct={b.basePct} />
          <MacerationClock startIso={b.maceration?.start ?? null} days={b.macerationDays} place={b.macerationPlace} />
          <div className="flex flex-col items-center gap-3 rounded-[18px] border border-line bg-surface p-5">
            <h3 className="m-0 self-start font-display text-[16px] font-semibold">{t("bottle3d")}</h3>
            <BottleViewer className="aspect-[4/5] h-44 cursor-grab active:cursor-grabbing" />
            <p className="m-0 text-[13px] font-semibold">{b.bottleType ? t(`bottle.${b.bottleType}`) : "—"}</p>
            <dl className="m-0 grid w-full grid-cols-2 gap-2 text-center text-[13px]">
              <div className="flex flex-col gap-0.5 rounded-[10px] bg-surface-soft px-2 py-2">
                <dt className="text-[11px] text-muted">{t("col.qty")}</dt>
                <dd className="num m-0 font-semibold">{b.plannedQty}</dd>
              </div>
              <div className="flex flex-col gap-0.5 rounded-[10px] bg-surface-soft px-2 py-2">
                <dt className="text-[11px] text-muted">{t("mix.concentration")}</dt>
                <dd className="num m-0 font-semibold">{b.essencePct != null ? `%${b.essencePct}` : "—"}</dd>
              </div>
            </dl>
          </div>
        </div>

        {canEdit && <AdvanceButton batchId={b.id} stage={b.stage} macerationDone={b.maceration?.done ?? true} />}

        {materials && <MaterialsPanel materials={materials} />}

        {canEdit && b.stage === "FILLING" && b.producedQty === 0 && <OutputForm batchId={b.id} plannedQty={b.plannedQty} />}

        {canEdit && <BatchEditor batch={b} />}

        {/* Aşama geçmişi */}
        {b.stageLogs.length > 0 && (
          <section className="flex flex-col gap-2 rounded-[16px] border border-line bg-surface p-5">
            <h3 className="m-0 font-display text-[16px] font-semibold">{t("stepper.title")}</h3>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
              {b.stageLogs.map((l, i) => (
                <li key={i} className="flex items-center gap-3 border-t border-line-soft py-1.5 first:border-t-0">
                  <span className="num w-32 shrink-0 text-muted">{new Date(l.startedAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}</span>
                  <span className="font-semibold">{t(`stage.${l.stage}`)}</span>
                  {l.note && <span className="text-text-2">· {l.note}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
