import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BottleViewer } from "@/components/BottleViewer";
import { Topbar } from "@/components/Topbar";
import { ApiError, apiGet, getMe } from "@/lib/api-server";
import { fmtQty } from "@/lib/format";
import { HashOpener } from "@/components/HashOpener";
import { AdvanceButton } from "../AdvanceButton";
import { DeleteBatchButton } from "../DeleteBatchButton";
import { BatchEditor } from "../BatchEditor";
import { MacerationClock } from "../MacerationClock";
import { type Materials, MaterialsPanel } from "../MaterialsPanel";
import { MixBeaker } from "../MixBeaker";
import { OutputForm } from "../OutputForm";
import { type QualityLot, QualityReleasePanel } from "../QualityReleasePanel";
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
  plannedMl: string | null;
  essenceMl: string | null;
  baseMl: string | null;
  testerMl: string;
  scrapMl: string;
  mixUnit: "ml" | "gr";
  mixEssence: string | null;
  mixBase: string | null;
  concentrationPct: string;
  essencePct: number | null;
  basePct: number | null;
  totalGr: number | null;
  macerationDays: number | null;
  macerationPlace: string | null;
  bottleType: string | null;
  maceration: { start: string; days: number; remainingMs: number; done: boolean } | null;
  product: { id: string; name: string; sku: string; itemCode: string; volumeMl: number };
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
  const canQuality = me.permissions.includes("quality:APPROVE");
  const showQuality = b.stage === "QUALITY_CONTROL" || b.stage === "RELEASED";
  const quality = showQuality
    ? await apiGet<{ stage: string; lots: QualityLot[] }>(`/production/batches/${encodeURIComponent(id)}/quality`).catch(() => null)
    : null;
  const hasOutput = b.producedQty > 0 || Number(b.testerMl) > 0;
  let materials: Materials | null = null;
  try {
    materials = await apiGet<Materials>(`/production/batches/${encodeURIComponent(id)}/materials`);
  } catch {
    materials = null;
  }

  return (
    <>
      <Topbar
        heading={`${b.number} · ${b.product.name}`}
        sub={`${b.product.sku} · ${b.formula.code} v${b.formula.version}`}
        action={
          <span className="flex items-center gap-3">
            {canEdit && (
              <a href="#duzenle" className="text-[13px] font-semibold text-gold-text no-underline hover:underline">
                ✎ {t("edit.title")}
              </a>
            )}
            <StageBadge stage={b.stage} />
          </span>
        }
      />
      <HashOpener ids={["duzenle"]} />
      <div className="flex flex-col gap-5 px-4 py-5 sm:px-8">
        <Link href="/uretim" className="self-start text-[13px] font-semibold">
          ← {t("back")}
        </Link>

        <StageStepper stage={b.stage} />

        {/* Görsel süreç: karışım + demlenme + şişe */}
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <MixBeaker essence={b.mixEssence} base={b.mixBase} unit={b.mixUnit} essencePct={b.essencePct} basePct={b.basePct} />
          <MacerationClock startIso={b.maceration?.start ?? null} days={b.macerationDays} place={b.macerationPlace} />
          <div className="flex flex-col items-center gap-3 rounded-[18px] border border-line bg-surface p-5">
            <h3 className="m-0 self-start font-display text-[16px] font-semibold">{t("bottle3d")}</h3>
            <BottleViewer className="aspect-[4/5] h-44 cursor-grab active:cursor-grabbing" />
            <p className="m-0 text-[13px] font-semibold">{b.bottleType ? t(`bottle.${b.bottleType}`) : "—"}</p>
            <dl className="m-0 grid w-full grid-cols-2 gap-2 text-center text-[13px]">
              <div className="flex flex-col gap-0.5 rounded-[10px] bg-surface-soft px-2 py-2">
                <dt className="text-[11px] text-muted">{b.plannedMl ? t("form.plannedMl") : t("col.qty")}</dt>
                <dd className="num m-0 font-semibold">
                  {b.plannedMl ? `${fmtQty(b.plannedMl)} ml` : b.plannedQty}
                  {b.plannedMl && <span className="block text-[11px] font-normal text-muted">{t("units", { count: b.plannedQty })}</span>}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5 rounded-[10px] bg-surface-soft px-2 py-2">
                <dt className="text-[11px] text-muted">{t("mix.concentration")}</dt>
                <dd className="num m-0 font-semibold">{b.essencePct != null ? `%${b.essencePct}` : "—"}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Şimdi ne yapmalı: aşamaya göre tek cümlelik yönlendirme + ilerleme */}
        <section className="flex flex-col gap-3 rounded-[16px] border border-gold-2/60 bg-surface-soft p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-bold text-on-ink">→</span>
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-bold tracking-[0.1em] text-muted uppercase">{t("next.title")}</span>
              <p className="m-0 text-[14px] leading-relaxed">{t.has(`next.${b.stage}`) ? t(`next.${b.stage}`) : t("next.default")}</p>
            </div>
          </div>
          {canEdit && (
            <AdvanceButton
              batchId={b.id}
              stage={b.stage}
              macerationDone={b.maceration?.done ?? true}
              disabledReason={b.stage === "FILLING" && !hasOutput ? t("next.fillingBlocked") : null}
            />
          )}
        </section>

        {materials && <MaterialsPanel materials={materials} />}

        {canEdit && ["FILLING", "LABEL_PACK", "QUALITY_CONTROL"].includes(b.stage) && !hasOutput && (
          <OutputForm batchId={b.id} plannedQty={b.plannedQty} plannedMl={b.plannedMl} volumeMl={b.product.volumeMl} />
        )}

        {hasOutput && (
          <section className="flex flex-col gap-3 rounded-[16px] border border-line bg-surface p-5">
            <h3 className="m-0 font-display text-[16px] font-semibold">{t("output.summary")}</h3>
            <dl className="m-0 grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-3">
              <div className="flex flex-col gap-0.5 rounded-[10px] bg-ok-bg px-3 py-2.5">
                <dt className="text-[11px] text-ok">{t("output.toStock")}</dt>
                <dd className="num m-0 font-display text-[19px] font-semibold text-ok">{t("units", { count: b.producedQty })}</dd>
              </div>
              <div className="flex flex-col gap-0.5 rounded-[10px] bg-surface-soft px-3 py-2.5">
                <dt className="text-[11px] text-muted">{t("output.tester")}</dt>
                <dd className="num m-0 font-display text-[19px] font-semibold">{fmtQty(b.testerMl)} ml</dd>
              </div>
              <div className="flex flex-col gap-0.5 rounded-[10px] bg-surface-soft px-3 py-2.5">
                <dt className="text-[11px] text-muted">{t("output.scrap")}</dt>
                <dd className="num m-0 font-display text-[19px] font-semibold">{fmtQty(b.scrapMl)} ml</dd>
              </div>
            </dl>
          </section>
        )}

        {quality && quality.lots.length > 0 && <QualityReleasePanel batchId={b.id} lots={quality.lots} canApprove={canQuality} />}

        {canEdit && <BatchEditor batch={b} />}

        {me.permissions.includes("production:DELETE") && <DeleteBatchButton batchId={b.id} batchNumber={b.number} />}

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
