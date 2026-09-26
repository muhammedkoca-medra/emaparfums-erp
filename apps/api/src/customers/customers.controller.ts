import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { type Tx, writeAudit } from "@atelier/db";
import {
  type AddressRequest,
  addressSchema,
  type ConsentRequest,
  consentSchema,
  CONSENT_TEXT_VERSION,
  type CustomerCreateRequest,
  customerCreateSchema,
  type CustomerQuery,
  customerQuerySchema,
  type CustomerUpdateRequest,
  customerUpdateSchema,
  maskEmail,
  maskPhone,
  maskTaxNo,
} from "@atelier/shared";
import { type AuthContext, type AuthedRequest, clientInfo, CurrentUser } from "../auth/auth-context.js";
import { ApiZodBody, ApiZodQuery, ZodPipe } from "../common/zod.js";
import { PiiService } from "../common/pii.service.js";
import { RequirePermission } from "../permissions/decorators.js";
import { PermissionService } from "../permissions/permission.service.js";
import { PrismaService } from "../prisma.service.js";

interface Contact {
  email: string | null;
  phone: string | null;
  taxNo: string | null;
}

/**
 * Müşteri ve KVKK rıza yönetimi (F2-01 · docs/03-moduller/satis.md, docs/07-guvenlik-kvkk.md).
 *  - PII (e-posta/telefon/VKN) AES-256-GCM ile şifreli saklanır; arama HMAC hash ile (SAL-04).
 *  - İletişim bilgisi yalnızca customer_pii:VIEW izniyle açık görünür; aksi halde maskeli.
 *  - Rıza kayıtları kanal + metin sürümüyle ConsentRecord'a yazılır; en güncel durum Customer'da.
 *  - Denetim kaydı maskeli değerlerle yazılır (loglarda açık PII olmaz).
 */
@ApiTags("customers")
@Controller("customers")
export class CustomersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pii: PiiService,
    private readonly permissions: PermissionService,
  ) {}

  private async canSeePii(userId: string): Promise<boolean> {
    return (await this.permissions.forUser(userId)).has("customer_pii:VIEW");
  }

  /** Şifreli alanları çözer; yetkiye göre açık ya da maskeli döndürür. */
  private contact(row: { email: string | null; phone: string | null; taxNo: string | null }, full: boolean): Contact {
    const email = this.pii.dec(row.email);
    const phone = this.pii.dec(row.phone);
    const taxNo = this.pii.dec(row.taxNo);
    return full
      ? { email, phone, taxNo }
      : { email: email && maskEmail(email), phone: phone && maskPhone(phone), taxNo: taxNo && maskTaxNo(taxNo) };
  }

  @Get()
  @RequirePermission("sales", "VIEW")
  @ApiZodQuery(customerQuerySchema)
  async list(@Query(new ZodPipe(customerQuerySchema)) q: CustomerQuery, @CurrentUser() auth: AuthContext) {
    const full = await this.canSeePii(auth.userId);
    // Arama: e-posta/telefon/VKN tam eşleşmede hash ile; ad kısmi eşleşmede contains.
    const term = q.q?.trim();
    const hashOr = term
      ? [
          { emailHash: this.pii.hash("email", term) ?? undefined },
          { phoneHash: this.pii.hash("phone", term) ?? undefined },
          { taxNoHash: this.pii.hash("taxNo", term) ?? undefined },
          { fullName: { contains: term, mode: "insensitive" as const } },
        ]
      : undefined;
    const rows = await this.prisma.customer.findMany({
      where: { type: q.type, ...(hashOr ? { OR: hashOr } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        type: true,
        fullName: true,
        email: true,
        phone: true,
        taxNo: true,
        isEInvoiceUser: true,
        kvkkConsentAt: true,
        marketingConsentAt: true,
        createdAt: true,
      },
    });
    return rows.map(({ email, phone, taxNo, ...r }) => ({ ...r, ...this.contact({ email, phone, taxNo }, full) }));
  }

  @Post()
  @RequirePermission("sales", "CREATE")
  @ApiZodBody(customerCreateSchema)
  async create(
    @Body(new ZodPipe(customerCreateSchema)) body: CustomerCreateRequest,
    @CurrentUser() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    const now = new Date();
    const id = await this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          type: body.type,
          fullName: body.fullName,
          email: this.pii.enc(body.email),
          phone: this.pii.enc(body.phone),
          taxNo: this.pii.enc(body.taxNo),
          emailHash: this.pii.hash("email", body.email),
          phoneHash: this.pii.hash("phone", body.phone),
          taxNoHash: this.pii.hash("taxNo", body.taxNo),
          taxOffice: body.taxOffice ?? null,
          isEInvoiceUser: body.isEInvoiceUser,
          kvkkConsentAt: body.kvkkConsent ? now : null,
          marketingConsentAt: body.marketingConsent ? now : null,
          ...(body.address ? { addresses: { create: this.addressData(body.address) } } : {}),
        },
      });
      const consents: { purpose: "KVKK" | "MARKETING"; granted: boolean }[] = [];
      if (body.kvkkConsent) consents.push({ purpose: "KVKK", granted: true });
      if (body.marketingConsent) consents.push({ purpose: "MARKETING", granted: true });
      for (const c of consents) {
        await tx.consentRecord.create({
          data: { customerId: customer.id, purpose: c.purpose, granted: true, channel: body.consentChannel, textVersion: CONSENT_TEXT_VERSION },
        });
      }
      await this.audit(tx, auth, req, "customer.create", customer.id, null, {
        type: body.type,
        fullName: body.fullName,
        email: maskEmail(body.email ?? ""),
        phone: maskPhone(body.phone ?? ""),
        taxNo: maskTaxNo(body.taxNo ?? ""),
        kvkkConsent: body.kvkkConsent,
        marketingConsent: body.marketingConsent,
      });
      return customer.id;
    });
    return { id };
  }

  @Get(":id")
  @RequirePermission("sales", "VIEW")
  async get(@Param("id") id: string, @CurrentUser() auth: AuthContext) {
    const full = await this.canSeePii(auth.userId);
    const c = await this.prisma.customer.findUnique({
      where: { id },
      include: { addresses: true },
    });
    if (!c) throw new NotFoundException({ message: "Müşteri bulunamadı" });
    const { email, phone, taxNo, ...rest } = c;
    return { ...rest, ...this.contact({ email, phone, taxNo }, full) };
  }

  @Patch(":id")
  @RequirePermission("sales", "EDIT")
  @ApiZodBody(customerUpdateSchema)
  async update(
    @Param("id") id: string,
    @Body(new ZodPipe(customerUpdateSchema)) body: CustomerUpdateRequest,
    @CurrentUser() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.customer.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException({ message: "Müşteri bulunamadı" });
      const data: Record<string, unknown> = {};
      if (body.fullName !== undefined) data.fullName = body.fullName;
      if (body.taxOffice !== undefined) data.taxOffice = body.taxOffice;
      if (body.isEInvoiceUser !== undefined) data.isEInvoiceUser = body.isEInvoiceUser;
      if (body.email !== undefined) {
        data.email = this.pii.enc(body.email);
        data.emailHash = this.pii.hash("email", body.email);
      }
      if (body.phone !== undefined) {
        data.phone = this.pii.enc(body.phone);
        data.phoneHash = this.pii.hash("phone", body.phone);
      }
      if (body.taxNo !== undefined) {
        data.taxNo = this.pii.enc(body.taxNo);
        data.taxNoHash = this.pii.hash("taxNo", body.taxNo);
      }
      await tx.customer.update({ where: { id }, data });
      await this.audit(tx, auth, req, "customer.update", id, null, { fields: Object.keys(data) });
    });
    return { id };
  }

  @Post(":id/addresses")
  @RequirePermission("sales", "EDIT")
  @ApiZodBody(addressSchema)
  async addAddress(
    @Param("id") id: string,
    @Body(new ZodPipe(addressSchema)) body: AddressRequest,
    @CurrentUser() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    const address = await this.prisma.$transaction(async (tx) => {
      const c = await tx.customer.findUnique({ where: { id }, select: { id: true } });
      if (!c) throw new NotFoundException({ message: "Müşteri bulunamadı" });
      const a = await tx.address.create({ data: { customerId: id, ...this.addressData(body) } });
      await this.audit(tx, auth, req, "customer.address.add", id, null, { city: body.city, district: body.district });
      return a;
    });
    return address;
  }

  /** KVKK/pazarlama rızası ver veya geri çek (docs/07). Kayıt kanal + metin sürümüyle tutulur. */
  @Post(":id/consent")
  @RequirePermission("sales", "EDIT")
  @ApiZodBody(consentSchema)
  async setConsent(
    @Param("id") id: string,
    @Body(new ZodPipe(consentSchema)) body: ConsentRequest,
    @CurrentUser() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.customer.findUnique({ where: { id }, select: { id: true } });
      if (!c) throw new NotFoundException({ message: "Müşteri bulunamadı" });
      await tx.consentRecord.create({
        data: { customerId: id, purpose: body.purpose, granted: body.granted, channel: body.channel, textVersion: CONSENT_TEXT_VERSION },
      });
      const at = body.granted ? new Date() : null;
      await tx.customer.update({
        where: { id },
        data: body.purpose === "KVKK" ? { kvkkConsentAt: at } : { marketingConsentAt: at },
      });
      await this.audit(tx, auth, req, "customer.consent", id, null, { purpose: body.purpose, granted: body.granted, channel: body.channel });
    });
    return { id, purpose: body.purpose, granted: body.granted };
  }

  /** Müşteri 360°: iletişim (yetkiye göre), adresler, rıza durumu, sipariş özeti, sadakat. */
  @Get(":id/360")
  @RequirePermission("sales", "VIEW")
  async view360(@Param("id") id: string, @CurrentUser() auth: AuthContext) {
    const full = await this.canSeePii(auth.userId);
    const c = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        addresses: true,
        consents: { orderBy: { createdAt: "desc" }, take: 20 },
        loyalty: { include: { tier: { select: { name: true } } } },
        _count: { select: { orders: true, invoices: true, subscriptions: true } },
      },
    });
    if (!c) throw new NotFoundException({ message: "Müşteri bulunamadı" });
    const orders = await this.prisma.salesOrder.findMany({
      where: { customerId: id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, number: true, status: true, grandTotal: true, createdAt: true },
    });
    const { email, phone, taxNo, _count, loyalty, ...rest } = c;
    return {
      ...rest,
      ...this.contact({ email, phone, taxNo }, full),
      counts: _count,
      loyalty: loyalty && { points: loyalty.points, tier: loyalty.tier.name },
      recentOrders: orders.map((o) => ({ ...o, grandTotal: o.grandTotal.toString() })),
    };
  }

  private addressData(a: AddressRequest) {
    return {
      label: a.label ?? null,
      line1: a.line1,
      district: a.district,
      city: a.city,
      postalCode: a.postalCode ?? null,
      country: a.country,
    };
  }

  private audit(tx: Tx, auth: AuthContext, req: AuthedRequest, action: string, entityId: string, before: unknown, after: unknown) {
    return writeAudit(tx, { userId: auth.userId, action, entity: "Customer", entityId, before, after, ...clientInfo(req) });
  }
}
