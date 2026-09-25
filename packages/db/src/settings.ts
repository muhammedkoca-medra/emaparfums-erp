import { parseSetting, type SettingKey, type SettingValue } from "@atelier/shared";
import { writeAudit } from "./audit.js";
import { type Tx } from "./client.js";

/** Geçerli parametre değeri (kayıt yoksa ya da bozuksa varsayılan). */
export async function getSetting<K extends SettingKey>(tx: Tx, key: K): Promise<SettingValue<K>> {
  const row = await tx.systemSetting.findUnique({ where: { key } });
  return parseSetting(key, row?.value);
}

/** Parametreyi değiştirir ve AuditLog yazar. Değer çağıran tarafından şemayla doğrulanmış olmalı. */
export async function setSetting<K extends SettingKey>(
  tx: Tx,
  key: K,
  value: SettingValue<K>,
  userId: string | null,
): Promise<void> {
  const before = await getSetting(tx, key);
  await tx.systemSetting.upsert({
    where: { key },
    update: { value: value as never, updatedById: userId },
    create: { key, value: value as never, updatedById: userId },
  });
  await writeAudit(tx, {
    userId,
    action: "setting.change",
    entity: "SystemSetting",
    entityId: key,
    before: { value: before },
    after: { value },
  });
}
