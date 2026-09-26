import { useTranslations } from "next-intl";
import { Pill, type Tone } from "@/components/Pill";

const TONE: Record<string, Tone> = {
  FORMULA_APPROVAL: "neu",
  WEIGHING_MIXING: "warn",
  MACERATION: "warn",
  CHILL_FILTER: "neu",
  FILLING: "neu",
  LABEL_PACK: "neu",
  QUALITY_CONTROL: "warn",
  RELEASED: "ok",
  CANCELLED: "bad",
};

/** Aşama rozeti (renkli). */
export function StageBadge({ stage }: { stage: string }) {
  const t = useTranslations("production");
  return <Pill tone={TONE[stage] ?? "neu"}>{t(`stage.${stage}`)}</Pill>;
}
