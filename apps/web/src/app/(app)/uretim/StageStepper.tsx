import { useTranslations } from "next-intl";

const FLOW = ["FORMULA_APPROVAL", "WEIGHING_MIXING", "MACERATION", "CHILL_FILTER", "FILLING", "LABEL_PACK", "QUALITY_CONTROL", "RELEASED"] as const;

/** Yatay süreç adımları; mevcut aşama vurgulanır, geçilenler işaretli. */
export function StageStepper({ stage }: { stage: string }) {
  const t = useTranslations("production");
  const current = FLOW.indexOf(stage as (typeof FLOW)[number]);
  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-5">
      <h3 className="m-0 font-display text-[16px] font-semibold">{t("stepper.title")}</h3>
      <ol className="m-0 flex list-none flex-wrap gap-x-1 gap-y-3 p-0">
        {FLOW.map((s, i) => {
          const done = current >= 0 && i < current;
          const active = i === current;
          return (
            <li key={s} className="flex items-center gap-1">
              <div className="flex flex-col items-center gap-1" style={{ width: 78 }}>
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold ${
                    active ? "bg-ink text-on-ink" : done ? "bg-ok text-on-ink" : "bg-neu-bg text-neu"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className={`text-center text-[10.5px] leading-tight ${active ? "font-bold text-text" : "text-muted"}`}>{t(`stage.${s}`)}</span>
              </div>
              {i < FLOW.length - 1 && <span className={`h-0.5 w-3 ${done ? "bg-ok" : "bg-line"}`} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
