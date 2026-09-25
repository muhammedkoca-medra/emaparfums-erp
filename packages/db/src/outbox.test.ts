import { describe, expect, it } from "vitest";
import { aggregateOf } from "./outbox.js";

describe("outbox · aggregateOf", () => {
  it("olay adının ilk parçası ve ilk kimlik alanı", () => {
    expect(aggregateOf({ type: "lot.released", lotId: "L1" })).toEqual({
      aggregate: "lot",
      aggregateId: "L1",
    });
    expect(aggregateOf({ type: "payment.captured", paymentId: "P1", orderId: "O1" })).toEqual({
      aggregate: "payment",
      aggregateId: "P1",
    });
    expect(aggregateOf({ type: "system.ping", pingId: "x", requestedById: "u" })).toEqual({
      aggregate: "system",
      aggregateId: "x",
    });
  });
});
