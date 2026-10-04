import { Schema, model, models, type Document, type Model, type Types } from 'mongoose';
import {
  DOCUMENT_OWNER_TYPES,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  type DocumentOwnerType,
  type DocumentStatus,
  type DocumentType,
} from '../types/enums';

/**
 * A compliance record — insurance, permits, licences, proofs of delivery.
 *
 * This system deliberately stores no files of any kind: a document is tracked
 * by its reference number, issue and expiry dates, and verification state.
 * The physical paperwork stays wherever the business already keeps it.
 */
export interface DocumentRecordDocument extends Document {
  _id: Types.ObjectId;
  name: string;
  type: DocumentType;
  ownerType: DocumentOwnerType;
  truck?: Types.ObjectId | null;
  driver?: Types.ObjectId | null;
  trip?: Types.ObjectId | null;
  /** Policy / permit / licence number as printed on the document. */
  referenceNumber?: string;
  issuedBy?: string;
  issueDate?: Date | null;
  expiryDate?: Date | null;
  status: DocumentStatus;
  addedBy?: Types.ObjectId | null;
  verifiedBy?: Types.ObjectId | null;
  verifiedAt?: Date | null;
  rejectionReason?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  /** virtual */
  isExpired: boolean;
}

const documentSchema = new Schema<DocumentRecordDocument>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    type: { type: String, enum: DOCUMENT_TYPES, required: true, index: true },
    ownerType: { type: String, enum: DOCUMENT_OWNER_TYPES, required: true, index: true },
    truck: { type: Schema.Types.ObjectId, ref: 'Truck', default: null, index: true },
    driver: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    trip: { type: Schema.Types.ObjectId, ref: 'Trip', default: null, index: true },
    referenceNumber: { type: String, trim: true, maxlength: 120 },
    issuedBy: { type: String, trim: true, maxlength: 160 },
    issueDate: { type: Date, default: null },
    expiryDate: { type: Date, default: null, index: true },
    status: { type: String, enum: DOCUMENT_STATUSES, default: 'PENDING', index: true },
    addedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date, default: null },
    rejectionReason: { type: String, trim: true },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: (_d, ret: Record<string, unknown>) => (delete ret.__v, ret) },
    toObject: { virtuals: true },
  },
);

documentSchema.virtual('isExpired').get(function (this: DocumentRecordDocument) {
  return this.expiryDate ? this.expiryDate.getTime() < Date.now() : false;
});

documentSchema.index({ createdAt: -1 });
documentSchema.index({ status: 1, expiryDate: 1 });

export const DocumentRecord: Model<DocumentRecordDocument> =
  (models.Document as Model<DocumentRecordDocument> | undefined) ??
  model<DocumentRecordDocument>('Document', documentSchema);
