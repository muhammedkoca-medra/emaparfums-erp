import { getRequestConfig } from "next-intl/server";

/** Tek dil: Türkçe. Metinler messages/tr.json içinde (CLAUDE.md kural 1). */
export default getRequestConfig(async () => ({
  locale: "tr",
  timeZone: "Europe/Istanbul",
  messages: (await import("../../messages/tr.json")).default,
}));
