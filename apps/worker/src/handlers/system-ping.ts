import { type EventHandler } from "./index.js";

/** Uçtan uca olay hattı testi: olayın worker'a ulaştığını loglar (Faz 0 çıkış kriteri). */
export const systemPing: EventHandler<"system.ping"> = async (event, { log, eventId }) => {
  log.info(
    { eventId, pingId: event.pingId, requestedById: event.requestedById },
    "system.ping alındı · olay hattı çalışıyor",
  );
};
