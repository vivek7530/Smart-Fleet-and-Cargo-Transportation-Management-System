import { z } from 'zod';
import { TRIP_STATUSES } from '../../types/enums';
import { listQuerySchema } from '../../lib/pagination';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'That identifier is not valid');
const dateField = z.string().datetime().or(z.string().date());

export const createTripSchema = z
  .object({
    truck: objectId.nullable().optional(),
    driver: objectId.nullable().optional(),
    cargo: z.array(objectId).max(20).default([]),
    pickupLocation: z.string().trim().min(2, 'Pickup location is required').max(200),
    deliveryLocation: z.string().trim().min(2, 'Delivery location is required').max(200),
    distanceKm: z.coerce.number().min(0).max(20000).optional(),
    startDate: dateField,
    expectedDeliveryDate: dateField,
    revenue: z.coerce.number().min(0, 'Revenue cannot be negative').default(0),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine(
    (data) => new Date(data.expectedDeliveryDate).getTime() >= new Date(data.startDate).getTime(),
    { message: 'Expected delivery must be on or after the start date', path: ['expectedDeliveryDate'] },
  );

export const updateTripSchema = z.object({
  truck: objectId.nullable().optional(),
  driver: objectId.nullable().optional(),
  cargo: z.array(objectId).max(20).optional(),
  pickupLocation: z.string().trim().min(2).max(200).optional(),
  deliveryLocation: z.string().trim().min(2).max(200).optional(),
  distanceKm: z.coerce.number().min(0).max(20000).optional(),
  startDate: dateField.optional(),
  expectedDeliveryDate: dateField.optional(),
  revenue: z.coerce.number().min(0).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const listTripsQuerySchema = listQuerySchema.extend({
  status: z.enum(TRIP_STATUSES).optional(),
  driver: objectId.optional(),
  truck: objectId.optional(),
  /** Convenience filter for everything currently on the road. */
  active: z.coerce.boolean().optional(),
});

export const changeStatusSchema = z.object({
  status: z.enum(TRIP_STATUSES),
  note: z.string().trim().max(500).optional(),
});

export const startTripSchema = z.object({
  note: z.string().trim().max(500).optional(),
  odometerKm: z.coerce.number().min(0).optional(),
});

export const completeTripSchema = z.object({
  actualDeliveryDate: dateField.optional(),
  note: z.string().trim().max(500).optional(),
  odometerKm: z.coerce.number().min(0).optional(),
});

export const cancelTripSchema = z.object({
  reason: z.string().trim().min(3, 'Please give a reason for cancelling').max(500),
});

export type CreateTripInput = z.infer<typeof createTripSchema>;
export type UpdateTripInput = z.infer<typeof updateTripSchema>;

