/** Single source of truth for every enum shared between the API and the UI. */

export const ROLES = ['ADMIN', 'MANAGER', 'DRIVER'] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ['INVITED', 'ACTIVE', 'SUSPENDED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const INVITATION_STATUSES = ['NONE', 'PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const INVITATION_CHANNELS = ['EMAIL', 'MOBILE'] as const;
export type InvitationChannel = (typeof INVITATION_CHANNELS)[number];

export const TRUCK_STATUSES = ['AVAILABLE', 'ASSIGNED', 'IN_TRIP', 'MAINTENANCE', 'INACTIVE'] as const;
export type TruckStatus = (typeof TRUCK_STATUSES)[number];

export const FUEL_TYPES = ['DIESEL', 'PETROL', 'CNG', 'LNG', 'ELECTRIC'] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const CARGO_TYPES = [
  'GENERAL',
  'PERISHABLE',
  'FRAGILE',
  'HAZARDOUS',
  'LIQUID',
  'REFRIGERATED',
  'OVERSIZED',
  'CONTAINER',
] as const;
export type CargoType = (typeof CARGO_TYPES)[number];

export const CARGO_STATUSES = ['PENDING', 'ASSIGNED', 'LOADED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'] as const;
export type CargoStatus = (typeof CARGO_STATUSES)[number];

export const TRIP_STATUSES = [
  'PLANNED',
  'ASSIGNED',
  'LOADING',
  'IN_TRANSIT',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

/** Allowed forward transitions of the trip lifecycle. */
export const TRIP_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  PLANNED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['LOADING', 'IN_TRANSIT', 'CANCELLED'],
  LOADING: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const MAINTENANCE_TYPES = [
  'ROUTINE_SERVICE',
  'ENGINE',
  'TYRE',
  'BRAKES',
  'ELECTRICAL',
  'BODYWORK',
  'AC_COOLING',
  'INSPECTION',
  'ACCIDENT_REPAIR',
  'OTHER',
] as const;
export type MaintenanceType = (typeof MAINTENANCE_TYPES)[number];

export const MAINTENANCE_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export const TRANSPORTATION_COST_TYPES = [
  'TOLL',
  'PERMIT',
  'LOADING',
  'UNLOADING',
  'WEIGHBRIDGE',
  'ESCORT',
  'PARKING',
  'BROKERAGE',
  'OTHER',
] as const;
export type TransportationCostType = (typeof TRANSPORTATION_COST_TYPES)[number];

export const DRIVER_EXPENSE_TYPES = [
  'FOOD',
  'LODGING',
  'TOLL',
  'FUEL',
  'REPAIR',
  'PARKING',
  'LOADING',
  'MISC',
] as const;
export type DriverExpenseType = (typeof DRIVER_EXPENSE_TYPES)[number];

export const EXPENSE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const DOCUMENT_TYPES = [
  'INSURANCE',
  'REGISTRATION',
  'PERMIT',
  'FITNESS',
  'POLLUTION',
  'LICENSE',
  'RECEIPT',
  'PROOF_OF_DELIVERY',
  'INVOICE',
  'CONTRACT',
  'OTHER',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_OWNER_TYPES = ['TRUCK', 'DRIVER', 'TRIP', 'EXPENSE', 'BREAKDOWN'] as const;
export type DocumentOwnerType = (typeof DOCUMENT_OWNER_TYPES)[number];

export const DOCUMENT_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const BREAKDOWN_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type BreakdownSeverity = (typeof BREAKDOWN_SEVERITIES)[number];

export const BREAKDOWN_STATUSES = ['REPORTED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'] as const;
export type BreakdownStatus = (typeof BREAKDOWN_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  'TRIP_ASSIGNED',
  'TRIP_STARTED',
  'TRIP_COMPLETED',
  'TRIP_CANCELLED',
  'EXPENSE_SUBMITTED',
  'EXPENSE_APPROVED',
  'EXPENSE_REJECTED',
  'BREAKDOWN_REPORTED',
  'BREAKDOWN_UPDATED',
  'DOCUMENT_EXPIRING',
  'DOCUMENT_VERIFIED',
  'INVITATION_SENT',
  'INVITATION_ACCEPTED',
  'MAINTENANCE_DUE',
  'GENERAL',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
