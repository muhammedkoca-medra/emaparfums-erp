import { z } from "zod";
import { passwordSchema } from "./auth.js";
import { PERMISSION_ACTIONS, PERMISSION_MODULES, ROLE_CODES } from "./permissions.js";

/** Yetki & kayıtlar modülü (docs/03-moduller/yetki.md) istek şemaları. */

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().trim().min(2).max(120),
  password: passwordSchema,
  roleCodes: z.array(z.enum(ROLE_CODES)).min(1),
  isExternal: z.boolean().default(false),
});
export type CreateUserRequest = z.infer<typeof createUserSchema>;

export const setUserRolesSchema = z.object({
  roleCodes: z.array(z.enum(ROLE_CODES)).min(1),
});
export type SetUserRolesRequest = z.infer<typeof setUserRolesSchema>;

export const auditQuerySchema = z.object({
  entity: z.string().max(60).optional(),
  entityId: z.string().max(60).optional(),
  userId: z.string().max(60).optional(),
  action: z.string().max(80).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(60).optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

export const setUserStatusSchema = z.object({ isActive: z.boolean() });
export type SetUserStatusRequest = z.infer<typeof setUserStatusSchema>;

export const permissionChangeSchema = z.object({
  roleId: z.string().min(1),
  module: z.enum(PERMISSION_MODULES),
  action: z.enum(PERMISSION_ACTIONS),
  grant: z.boolean(),
  note: z.string().trim().max(300).optional(),
});
export type PermissionChangeRequest = z.infer<typeof permissionChangeSchema>;

export const approvalDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().trim().max(300).optional(),
});
export type ApprovalDecisionRequest = z.infer<typeof approvalDecisionSchema>;
