import { useTranslations } from "next-intl";
import { Pill, type Tone } from "@/components/Pill";

const TONE: Record<string, Tone> = {
  REQUESTED: "neu",
  PENDING_APPROVAL: "warn",
  ORDERED: "info",
  IN_TRANSIT: "info",
  RECEIVING: "warn",
  CLOSED: "ok",
  CANCELLED: "bad",
};

export function PoStatusPill({ status }: { status: string }) {
  const t = useTranslations("purchasing");
  return <Pill tone={TONE[status] ?? "neu"}>{t(`status.${status}`)}</Pill>;
}
