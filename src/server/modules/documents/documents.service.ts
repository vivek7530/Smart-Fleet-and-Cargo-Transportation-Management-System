import { z } from 'zod';
import { DocumentRecord } from '../../models/DocumentRecord';
import { Truck } from '../../models/Truck';
import { ApiError } from '../../lib/ApiError';
import {
  dateRangeFilter,
  listQuerySchema,
  mergeFilters,
  paginate,
  resolveSort,
  searchFilter,
} from '../../lib/pagination';
import { recordAudit } from '../../services/audit.service';
import { notify } from '../../services/notification.service';
import { DOCUMENT_OWNER_TYPES, DOCUMENT_STATUSES, DOCUMENT_TYPES } from '../../types/enums';
import { objectId, optionalDateString } from '../shared';
import type { Ctx } from '../../api/context';

/**
 * Documents are tracked as records only — reference number, issuer, validity
 * window and verification state. No files are uploaded or stored anywhere.
 */
export const createDocumentSchema = z
  .object({
    name: z.string().trim().min(2, 'Give the document a name').max(200),
    type: z.enum(DOCUMENT_TYPES),
    ownerType: z.enum(DOCUMENT_OWNER_TYPES),
    truck: objectId.nullable().optional(),
    driver: objectId.nullable().optional(),
    trip: objectId.nullable().optional(),
    referenceNumber: z.string().trim().max(120).optional(),
    issuedBy: z.string().trim().max(160).optional(),
    issueDate: optionalDateString,
    expiryDate: optionalDateString,
    notes: z.string().trim().max(1000).optional(),
  })
  // The record must point at whatever it belongs to.
  .refine((data) => data.ownerType !== 'TRUCK' || Boolean(data.truck), {
    message: 'Choose the truck this document belongs to',
    path: ['truck'],
  })
  .refine((data) => data.ownerType !== 'DRIVER' || Boolean(data.driver), {
    message: 'Choose the driver this document belongs to',
    path: ['driver'],
  })
  .refine((data) => data.ownerType !== 'TRIP' || Boolean(data.trip), {
    message: 'Choose the trip this document belongs to',
    path: ['trip'],
  });

export const updateDocumentSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  type: z.enum(DOCUMENT_TYPES).optional(),
  referenceNumber: z.string().trim().max(120).optional(),
  issuedBy: z.string().trim().max(160).optional(),
  issueDate: optionalDateString,
  expiryDate: optionalDateString,
  notes: z.string().trim().max(1000).optional(),
});

export const rejectDocumentSchema = z.object({
  reason: z.string().trim().min(3, 'A reason is required when rejecting a document').max(1000),
});

export const listDocumentsQuerySchema = listQuerySchema.extend({
  type: z.enum(DOCUMENT_TYPES).optional(),
  ownerType: z.enum(DOCUMENT_OWNER_TYPES).optional(),
  status: z.enum(DOCUMENT_STATUSES).optional(),
  truck: objectId.optional(),
  driver: objectId.optional(),
  trip: objectId.optional(),
  /** Documents expiring within the next N days (or already expired). */
  expiring: z.coerce.number().int().min(1).max(365).optional(),
});

const POPULATE = [
  { path: 'truck', select: 'truckNumber registrationNumber' },
  { path: 'driver', select: 'name avatarColor' },
  { path: 'trip', select: 'tripCode' },
  { path: 'addedBy', select: 'name role avatarColor' },
  { path: 'verifiedBy', select: 'name role' },
];

export async function listDocuments(query: z.infer<typeof listDocumentsQuerySchema>, ctx: Ctx) {
  const { sortBy, sortDir } = resolveSort(query, ['createdAt', 'name', 'expiryDate', 'status', 'type']);

  // Drivers see their own documents plus everything attached to their truck.
  let scope: Record<string, unknown> | null = null;
  if (ctx.user.role === 'DRIVER') {
    const truck = await Truck.findOne({ assignedDriver: ctx.user._id }).select('_id');
    scope = {
      $or: [{ driver: ctx.user._id }, { addedBy: ctx.user._id }, ...(truck ? [{ truck: truck._id }] : [])],
    };
  }

  const expiringFilter = query.expiring
    ? { expiryDate: { $ne: null, $lte: new Date(Date.now() + query.expiring * 86_400_000) } }
    : null;

  const filter = mergeFilters(
    scope,
    query.type ? { type: query.type } : null,
    query.ownerType ? { ownerType: query.ownerType } : null,
    query.status ? { status: query.status } : null,
    query.truck ? { truck: query.truck } : null,
    query.driver && ctx.user.role !== 'DRIVER' ? { driver: query.driver } : null,
    query.trip ? { trip: query.trip } : null,
    expiringFilter,
    searchFilter(query.search, ['name', 'referenceNumber', 'issuedBy', 'notes']),
    dateRangeFilter('createdAt', query.from, query.to),
  );

  return paginate(DocumentRecord, {
    filter,
    limit: query.limit,
    cursor: query.cursor,
    sortBy,
    sortDir,
    populate: POPULATE,
  });
}

/** Powers the "documents expiring soon" widget. */
export async function expiringDocuments(days = 30) {
  const horizon = new Date(Date.now() + Math.min(days, 365) * 86_400_000);

  const documents = await DocumentRecord.find({
    expiryDate: { $ne: null, $lte: horizon },
    status: { $ne: 'REJECTED' },
  })
    .sort({ expiryDate: 1 })
    .limit(50)
    .populate(POPULATE);

  return {
    days,
    items: documents.map((doc) => doc.toJSON()),
    expiredCount: documents.filter((doc) => doc.expiryDate! < new Date()).length,
  };
}

export async function createDocument(input: z.infer<typeof createDocumentSchema>, ctx: Ctx) {
  const isDriver = ctx.user.role === 'DRIVER';

  const record = await DocumentRecord.create({
    ...input,
    driver: input.driver ?? (input.ownerType === 'DRIVER' ? ctx.user._id : null),
    issueDate: input.issueDate ? new Date(input.issueDate) : null,
    expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
    addedBy: ctx.user._id,
    // Staff entries are trusted; driver entries await verification.
    status: isDriver ? 'PENDING' : 'VERIFIED',
    verifiedBy: isDriver ? null : ctx.user._id,
    verifiedAt: isDriver ? null : new Date(),
  });

  await recordAudit({
    ctx,
    action: 'DOCUMENT_ADDED',
    summary: `${ctx.user.name} added the document "${record.name}" (${record.type.toLowerCase()})`,
    entity: 'Document',
    entityId: record._id,
  });

  return record.populate(POPULATE);
}

export async function updateDocument(id: string, input: z.infer<typeof updateDocumentSchema>, ctx: Ctx) {
  const record = await DocumentRecord.findById(id);
  if (!record) throw ApiError.notFound('That document could not be found');

  if (ctx.user.role === 'DRIVER' && String(record.addedBy) !== String(ctx.user._id)) {
    throw ApiError.forbidden('You can only edit documents you added');
  }

  Object.assign(record, input);
  if (input.issueDate !== undefined) record.issueDate = input.issueDate ? new Date(input.issueDate) : null;
  if (input.expiryDate !== undefined) record.expiryDate = input.expiryDate ? new Date(input.expiryDate) : null;
  await record.save();

  await recordAudit({
    ctx,
    action: 'DOCUMENT_UPDATED',
    summary: `${ctx.user.name} updated the document "${record.name}"`,
    entity: 'Document',
    entityId: record._id,
  });

  return record.populate(POPULATE);
}

export async function reviewDocument(
  id: string,
  status: 'VERIFIED' | 'REJECTED',
  reason: string | undefined,
  ctx: Ctx,
) {
  const record = await DocumentRecord.findById(id);
  if (!record) throw ApiError.notFound('That document could not be found');

  record.status = status;
  record.verifiedBy = ctx.user._id;
  record.verifiedAt = new Date();
  record.rejectionReason = status === 'REJECTED' ? reason : undefined;
  await record.save();

  await recordAudit({
    ctx,
    action: status === 'VERIFIED' ? 'DOCUMENT_VERIFIED' : 'DOCUMENT_REJECTED',
    summary:
      status === 'VERIFIED'
        ? `${ctx.user.name} verified the document "${record.name}"`
        : `${ctx.user.name} rejected the document "${record.name}" — ${reason}`,
    entity: 'Document',
    entityId: record._id,
  });

  if (record.addedBy) {
    await notify({
      users: [record.addedBy],
      type: 'DOCUMENT_VERIFIED',
      title: status === 'VERIFIED' ? 'Document verified' : 'Document rejected',
      message:
        status === 'VERIFIED' ? `"${record.name}" has been verified.` : `"${record.name}" was rejected: ${reason}`,
      link: '/documents',
      entity: 'Document',
      entityId: record._id,
    });
  }

  return record.populate(POPULATE);
}

export async function deleteDocument(id: string, ctx: Ctx) {
  const record = await DocumentRecord.findById(id);
  if (!record) throw ApiError.notFound('That document could not be found');

  if (ctx.user.role === 'DRIVER' && String(record.addedBy) !== String(ctx.user._id)) {
    throw ApiError.forbidden('You can only remove documents you added');
  }

  await DocumentRecord.deleteOne({ _id: record._id });

  await recordAudit({
    ctx,
    action: 'DOCUMENT_DELETED',
    summary: `${ctx.user.name} deleted the document "${record.name}"`,
    entity: 'Document',
    entityId: record._id,
  });

  return { id };
}
