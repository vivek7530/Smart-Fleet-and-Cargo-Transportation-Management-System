import { z } from 'zod';
import { CARGO_STATUSES, CARGO_TYPES } from '../../types/enums';
import { listQuerySchema } from '../../lib/pagination';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'That identifier is not valid');

export const createCargoSchema = z.object({
  description: z.string().trim().min(3, 'Describe the cargo').max(500),
  type: z.enum(CARGO_TYPES).default('GENERAL'),
  weightTons: z.coerce.number().min(0.01, 'Weight must be greater than zero').max(200),
  units: z.coerce.number().int().min(0).optional(),
  declaredValue: z.coerce.number().min(0).optional(),
  shipperName: z.string().trim().min(2, 'Shipper name is required').max(160),
  shipperContact: z.string().trim().max(60).optional(),
  consigneeName: z.string().trim().min(2, 'Consignee name is required').max(160),
  consigneeContact: z.string().trim().max(60).optional(),
  origin: z.string().trim().min(2, 'Origin is required').max(160),
  destination: z.string().trim().min(2, 'Destination is required').max(160),
  status: z.enum(CARGO_STATUSES).default('PENDING'),
  trip: objectId.nullable().optional(),
  handlingInstructions: z.string().trim().max(1000).optional(),
});

export const updateCargoSchema = createCargoSchema.partial();

export const listCargoQuerySchema = listQuerySchema.extend({
  status: z.enum(CARGO_STATUSES).optional(),
  type: z.enum(CARGO_TYPES).optional(),
  trip: objectId.optional(),
  unassigned: z.coerce.boolean().optional(),
});

export type CreateCargoInput = z.infer<typeof createCargoSchema>;
export type UpdateCargoInput = z.infer<typeof updateCargoSchema>;

