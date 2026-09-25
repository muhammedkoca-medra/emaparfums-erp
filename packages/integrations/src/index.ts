export * from "./adapter.js";
export * from "./invoke.js";
export * from "./rate-limit.js";
export * from "./registry.js";
export * from "./credentials.js";
export { TemplateAdapter, TEMPLATE_CODE, classifyHttpError } from "./_template/index.js";
export { TemplateMockAdapter } from "./_template/mock.js";

import { TemplateAdapter, TEMPLATE_CODE } from "./_template/index.js";
import { TemplateMockAdapter } from "./_template/mock.js";
import { type IntegrationAdapter } from "./adapter.js";
import { IntegrationRegistry } from "./registry.js";

/**
 * Uygulamanın kullandığı kayıt defteri. Yeni adaptörler buraya eklenir (/entegrasyon).
 * Şablon adaptör, çerçevenin uçtan uca çalıştığını göstermek için kayıtlıdır.
 */
export function createDefaultRegistry(): IntegrationRegistry {
  return new IntegrationRegistry().register<IntegrationAdapter>({
    code: TEMPLATE_CODE,
    kind: "MARKETPLACE",
    requiredCredentials: ["apiKey"],
    create: () => new TemplateAdapter(),
    createMock: () => new TemplateMockAdapter(),
  });
}
