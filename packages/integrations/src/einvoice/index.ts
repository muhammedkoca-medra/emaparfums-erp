import { type EInvoiceCapabilities, IntegrationError, type IntegrationAdapter } from "../adapter.js";

/** E-belge entegratörü (seçim ADR-0004). Canlı uç noktalar sözleşmeyle netleşene kadar mock kullanılır. */
export const EINVOICE_CODE = "EINVOICE";

export class EInvoiceAdapter implements IntegrationAdapter, EInvoiceCapabilities {
  readonly code = EINVOICE_CODE;
  readonly kind = "EINVOICE" as const;

  async healthCheck() {
    throw new IntegrationError("E-belge canlı adaptörü yapılandırılmadı (ADR-0004)", false, EINVOICE_CODE);
    return { ok: false };
  }
  isEInvoiceUser(): Promise<boolean> {
    throw new IntegrationError("yapılandırılmadı", false, EINVOICE_CODE);
  }
  send(): Promise<{ number: string; ettn: string }> {
    throw new IntegrationError("yapılandırılmadı", false, EINVOICE_CODE);
  }
  status(): Promise<string> {
    throw new IntegrationError("yapılandırılmadı", false, EINVOICE_CODE);
  }
  pullIncoming(): Promise<unknown[]> {
    throw new IntegrationError("yapılandırılmadı", false, EINVOICE_CODE);
  }
  cancel(): Promise<void> {
    throw new IntegrationError("yapılandırılmadı", false, EINVOICE_CODE);
  }
  pdf(): Promise<Uint8Array> {
    throw new IntegrationError("yapılandırılmadı", false, EINVOICE_CODE);
  }
}
