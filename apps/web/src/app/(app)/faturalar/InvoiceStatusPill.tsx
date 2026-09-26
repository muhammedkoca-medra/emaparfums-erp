import { useTranslations } from "next-intl";
import { Pill, type Tone } from "@/components/Pill";

const TONE: Record<string, Tone> = {
  DRAFT: "neu",
  SENT: "info",
  DELIVERED: "info",
  AWAITING_RESPONSE: "warn",
  ACCEPTED: "ok",
  REJECTED: "bad",
  ERROR: "bad",
  CANCELLED: "neu",
  POSTED: "ok",
};

export function InvoiceStatusPill({ status }: { status: string }) {
  const t = useTranslations("invoices");
  return <Pill tone={TONE[status] ?? "neu"}>{t(`status.${status}`)}</Pill>;
}
