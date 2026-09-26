import { useTranslations } from "next-intl";
import { Pill, type Tone } from "@/components/Pill";

const TONE: Record<string, Tone> = {
  CREATED: "neu",
  LABEL_PRINTED: "info",
  HANDED_OVER: "info",
  IN_TRANSIT: "info",
  OUT_FOR_DELIVERY: "warn",
  DELIVERED: "ok",
  DELAYED: "warn",
  RETURNED: "bad",
  LOST: "bad",
};

export function ShipStatusPill({ status }: { status: string }) {
  const t = useTranslations("shipping");
  return <Pill tone={TONE[status] ?? "neu"}>{t(`status.${status}`)}</Pill>;
}
