-- AuditLog yalnızca eklenir (YTK-03, docs/07-guvenlik-kvkk.md §Denetim).
-- UPDATE, DELETE ve TRUNCATE veritabanı seviyesinde reddedilir; uygulama hatası ya da
-- doğrudan SQL erişimi kaydı değiştiremez.

CREATE OR REPLACE FUNCTION audit_log_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog değiştirilemez: % reddedildi', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_block_mutation();

CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_block_mutation();
