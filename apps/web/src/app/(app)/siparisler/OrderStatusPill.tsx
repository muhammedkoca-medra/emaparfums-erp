import { useTranslations } from "next-intl";
import { Pill, type Tone } from "@/components/Pill";

const TONE: Record<string, Tone> = {
  NEW: "neu",
  PAYMENT_PENDING: "warn",
  CONFIRMED: "info",
  IN_PRODUCTION: "warn",
  PICKING: "warn",
  SHIPPED: "info",
  DELIVERED: "ok",
  COMPLETED: "ok",
  CANCELLED: "bad",
  RETURNED: "bad",
};

export function OrderStatusPill({ status }: { status: string }) {
  const t = useTranslations("orders");
  return <Pill tone={TONE[status] ?? "neu"}>{t(`status.${status}`)}</Pill>;
}
