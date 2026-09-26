import { type ReactNode } from "react";

/** Durum rozeti (docs/06 §Durum rozetleri). Renk tek başına anlam taşımaz; metin her zaman var. */
export type Tone = "ok" | "warn" | "bad" | "info" | "neu" | "plum";

const TONES: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  bad: "bg-bad-bg text-bad",
  info: "bg-info-bg text-info",
  neu: "bg-neu-bg text-neu",
  plum: "bg-plum-bg text-plum",
};

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export const STOCK_STATUS_TONE: Record<string, Tone> = {
  QUARANTINE: "warn",
  REJECTED: "bad",
  CRITICAL: "bad",
  EXPIRING: "warn",
  IN_PROCESS: "plum",
  OK: "ok",
  EMPTY: "neu",
};

export const QC_TONE: Record<string, Tone> = { QUARANTINE: "warn", RELEASED: "ok", REJECTED: "bad" };

export const COUNT_TONE: Record<"OPEN" | "SUBMITTED" | "APPROVED", Tone> = {
  OPEN: "info",
  SUBMITTED: "warn",
  APPROVED: "ok",
};

export const PRODUCT_TONE: Record<string, Tone> = { DRAFT: "neu", ACTIVE: "ok", SALES_LOCKED: "bad", DISCONTINUED: "warn" };
export const FORMULA_TONE: Record<string, Tone> = { DRAFT: "neu", IN_REVIEW: "warn", APPROVED: "ok", ARCHIVED: "neu" };
export const TAX_STATE_TONE: Record<"PENDING" | "ACTIVE" | "SCHEDULED" | "EXPIRED", Tone> = { PENDING: "warn", ACTIVE: "ok", SCHEDULED: "neu", EXPIRED: "neu" };
