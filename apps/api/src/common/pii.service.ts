import { Inject, Injectable } from "@nestjs/common";
import { decryptField, encryptField, type PiiKeyring, type PiiKind, searchHash } from "@atelier/shared/node";
import { PII_KEYRING } from "../auth/auth.service.js";

/**
 * Kişisel veri şifreleme/hash servisi (docs/07). Kayıtta şifreler, aramada HMAC hash üretir.
 * Şifreli değerler yalnızca customer_pii izniyle çözülür; loglara maskeli yazılır (maskDeep).
 */
@Injectable()
export class PiiService {
  constructor(@Inject(PII_KEYRING) private readonly keyring: PiiKeyring) {}

  /** Değeri şifreler; boş/null ise null döner. */
  enc(value: string | null | undefined): string | null {
    const v = value?.trim();
    return v ? encryptField(this.keyring, v) : null;
  }

  /** Şifreli token'ı çözer; null/boş ise null. */
  dec(token: string | null | undefined): string | null {
    return token ? decryptField(this.keyring, token) : null;
  }

  /** Arama için HMAC hash; boş/null ise null. */
  hash(kind: PiiKind, value: string | null | undefined): string | null {
    const v = value?.trim();
    return v ? searchHash(this.keyring, kind, v) : null;
  }
}
