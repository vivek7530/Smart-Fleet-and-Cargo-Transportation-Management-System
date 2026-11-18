import { z } from 'zod';
import { FUEL_TYPES, SHARE_PERMISSIONS, TRUCK_STATUSES } from '../../types/enums';
import { listQuerySchema } from '../../lib/pagination';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'That identifier is not valid');
const optionalDate = z.string().datetime().or(z.string().date()).nullable().optional();

export const createTruckSchema = z.object({
  truckNumber: z.string().trim().min(3, 'Truck number is required').max(24).toUpperCase(),
  /**
   * The RTO plate. In this fleet it is the truck number — operators enter one
   * value and expect both to match — so the form no longer asks twice and the
   * service fills it in. It stays a field of its own because the two genuinely
   * can differ, and older records here already do.
   */
  registrationNumber: z.string().trim().min(4).max(24).toUpperCase().optional(),
  make: z.string().trim().min(1, 'Make is required').max(60),
  model: z.string().trim().min(1, 'Model is required').max(60),
  year: z.coerce
    .number()
    .int()
    .min(1980, 'Year must be 1980 or later')
    .max(new Date().getFullYear() + 1, 'Year cannot be in the future'),
  capacityTons: z.coerce.number().min(0.5, 'Capacity must be at least 0.5 tons').max(200),
  fuelType: z.enum(FUEL_TYPES).default('DIESEL'),
  status: z.enum(TRUCK_STATUSES).default('AVAILABLE'),
  assignedDriver: objectId.nullable().optional(),
  // Honoured only for an administrator; a manager always owns what they create.
  owner: objectId.nullable().optional(),
  odometerKm: z.coerce.number().finite().min(0).multipleOf(0.1).default(0),
  mileageKmPerLitre: z.coerce.number().min(0).max(100).optional(),
  insuranceProvider: z.string().trim().max(120).optional(),
  insurancePolicyNumber: z.string().trim().max(60).optional(),
  insuranceExpiry: optionalDate,
  registrationExpiry: optionalDate,
  fitnessExpiry: optionalDate,
  permitExpiry: optionalDate,
  purchaseDate: optionalDate,
  purchasePrice: z.coerce.number().min(0).optional(),
  purchaseVendor: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
});

// The current reading is advanced by operational events; arbitrary patches would
// bypass monotonic validation and the correction audit trail.
export const updateTruckSchema = createTruckSchema.omit({ odometerKm: true }).partial();

export const listTrucksQuerySchema = listQuerySchema.extend({
  status: z.enum(TRUCK_STATUSES).optional(),
  fuelType: z.enum(FUEL_TYPES).optional(),
  assignedDriver: objectId.optional(),
  unassigned: z.coerce.boolean().optional(),
  // Administrative views of the whole fleet; ignored for a manager, whose own
  // scope already decides what they can see.
  owner: objectId.optional(),
  unowned: z.coerce.boolean().optional(),
});

export const assignDriverSchema = z.object({
  driverId: objectId.nullable(),
});

export type CreateTruckInput = z.infer<typeof createTruckSchema>;
export type UpdateTruckInput = z.infer<typeof updateTruckSchema>;

/**
 * Moving a truck to another manager. `owner: null` hands it back to nobody,
 * which is how an administrator parks a vehicle between managers.
 */
export const transferTruckSchema = z.object({
  owner: objectId.nullable(),
  /** Take the assigned driver along, instead of detaching them. */
  moveDriver: z.boolean().optional(),
});

export type TransferTruckInput = z.infer<typeof transferTruckSchema>;

/** Granting another manager access to a truck, or changing the access given. */
export const shareTruckSchema = z.object({
  user: objectId,
  permission: z.enum(SHARE_PERMISSIONS).default('VIEW'),
});

export type ShareTruckInput = z.infer<typeof shareTruckSchema>;
