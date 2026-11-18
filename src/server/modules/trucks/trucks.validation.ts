import { z } from 'zod';
import { FUEL_TYPES, TRUCK_STATUSES } from '../../types/enums';
import { listQuerySchema } from '../../lib/pagination';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'That identifier is not valid');
const optionalDate = z.string().datetime().or(z.string().date()).nullable().optional();

export const createTruckSchema = z.object({
  truckNumber: z.string().trim().min(3, 'Truck number is required').max(24).toUpperCase(),
  registrationNumber: z.string().trim().min(4, 'Registration number is required').max(24).toUpperCase(),
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

