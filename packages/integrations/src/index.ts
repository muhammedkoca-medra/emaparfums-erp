export * from "./adapter.js";
export * from "./invoke.js";
export * from "./rate-limit.js";
export * from "./registry.js";
export * from "./credentials.js";
export { TemplateAdapter, TEMPLATE_CODE, classifyHttpError } from "./_template/index.js";
export { TemplateMockAdapter } from "./_template/mock.js";
export { EInvoiceAdapter, EINVOICE_CODE } from "./einvoice/index.js";
export { EInvoiceMockAdapter } from "./einvoice/mock.js";
export { CargoMockAdapter } from "./cargo/mock.js";
export { MessagingMockAdapter } from "./messaging/mock.js";

import { TemplateAdapter, TEMPLATE_CODE } from "./_template/index.js";
import { TemplateMockAdapter } from "./_template/mock.js";
import { type IntegrationAdapter } from "./adapter.js";
import { CargoMockAdapter } from "./cargo/mock.js";
import { MessagingMockAdapter } from "./messaging/mock.js";
import { EInvoiceAdapter, EINVOICE_CODE } from "./einvoice/index.js";
import { EInvoiceMockAdapter } from "./einvoice/mock.js";
import { IntegrationRegistry } from "./registry.js";

export const CARGO_CODES = ["CARGO_YURTICI", "CARGO_ARAS"] as const;
export const MESSAGING_CODES = ["SMS", "WHATSAPP"] as const;

/**
 * Uygulamanın kullandığı kayıt defteri. Yeni adaptörler buraya eklenir (/entegrasyon).
 * Yerelde kimlik bilgisi olmadığından hepsi mock modda çalışır (CLAUDE.md kural 8).
 */
export function createDefaultRegistry(): IntegrationRegistry {
  const reg = new IntegrationRegistry()
    .register<IntegrationAdapter>({
      code: TEMPLATE_CODE,
      kind: "MARKETPLACE",
      requiredCredentials: ["apiKey"],
      create: () => new TemplateAdapter(),
      createMock: () => new TemplateMockAdapter(),
    })
    .register<IntegrationAdapter>({
      code: EINVOICE_CODE,
      kind: "EINVOICE",
      requiredCredentials: ["apiKey"],
      create: () => new EInvoiceAdapter(),
      createMock: () => new EInvoiceMockAdapter(),
    });
  for (const code of CARGO_CODES) {
    reg.register<IntegrationAdapter>({
      code,
      kind: "CARGO",
      requiredCredentials: ["apiKey"],
      // Canlı adaptör sözleşmeyle gelene kadar mock (create de mock döndürür; forceMode mock).
      create: () => new CargoMockAdapter(code),
      createMock: () => new CargoMockAdapter(code),
    });
  }
  for (const code of MESSAGING_CODES) {
    reg.register<IntegrationAdapter>({
      code,
      kind: "MESSAGING",
      requiredCredentials: ["apiKey"],
      create: () => new MessagingMockAdapter(code),
      createMock: () => new MessagingMockAdapter(code),
    });
  }
  return reg;
}
