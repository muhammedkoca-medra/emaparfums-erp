export * from "./adapter.js";
export * from "./invoke.js";
export * from "./rate-limit.js";
export * from "./registry.js";
export * from "./credentials.js";
export { TemplateAdapter, TEMPLATE_CODE, classifyHttpError } from "./_template/index.js";
export { TemplateMockAdapter } from "./_template/mock.js";
export { EInvoiceAdapter, EINVOICE_CODE } from "./einvoice/index.js";
export { EInvoiceMockAdapter } from "./einvoice/mock.js";

import { TemplateAdapter, TEMPLATE_CODE } from "./_template/index.js";
import { TemplateMockAdapter } from "./_template/mock.js";
import { type IntegrationAdapter } from "./adapter.js";
import { EInvoiceAdapter, EINVOICE_CODE } from "./einvoice/index.js";
import { EInvoiceMockAdapter } from "./einvoice/mock.js";
import { IntegrationRegistry } from "./registry.js";

/**
 * Uygulamanın kullandığı kayıt defteri. Yeni adaptörler buraya eklenir (/entegrasyon).
 * Yerelde kimlik bilgisi olmadığından hepsi mock modda çalışır (CLAUDE.md kural 8).
 */
export function createDefaultRegistry(): IntegrationRegistry {
  return new IntegrationRegistry()
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
}
