import { describe, expect, it } from "vitest";
import { computeSalesLock, MANDATORY_COMPLIANCE_DOCS } from "./quality.js";

const valid = (types: readonly string[]) => types.map((t) => ({ type: t, status: "VALID" }));

describe("computeSalesLock (KAL-04)", () => {
  it("tüm zorunlu belgeler VALID ise ACTIVE", () => {
    expect(computeSalesLock("SALES_LOCKED", valid(MANDATORY_COMPLIANCE_DOCS))).toBe("ACTIVE");
  });

  it("bir zorunlu belge eksikse SALES_LOCKED", () => {
    const docs = valid(MANDATORY_COMPLIANCE_DOCS.slice(1)); // UTS_NOTIFICATION yok
    expect(computeSalesLock("ACTIVE", docs)).toBe("SALES_LOCKED");
  });

  it("zorunlu belge VALID değilse (IN_PROGRESS) SALES_LOCKED", () => {
    const docs = [...valid(MANDATORY_COMPLIANCE_DOCS.slice(1)), { type: "UTS_NOTIFICATION", status: "IN_PROGRESS" }];
    expect(computeSalesLock("ACTIVE", docs)).toBe("SALES_LOCKED");
  });

  it("DRAFT ve DISCONTINUED durumlarına dokunmaz", () => {
    expect(computeSalesLock("DRAFT", valid(MANDATORY_COMPLIANCE_DOCS))).toBe("DRAFT");
    expect(computeSalesLock("DISCONTINUED", [])).toBe("DISCONTINUED");
  });
});
