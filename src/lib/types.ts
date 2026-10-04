/** Types mirroring the API contract. */

export type Role = 'ADMIN' | 'MANAGER' | 'DRIVER';
export type UserStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED';
export type InvitationStatus = 'NONE' | 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
export type InvitationChannel = 'EMAIL' | 'MOBILE';

export type TruckStatus = 'AVAILABLE' | 'ASSIGNED' | 'IN_TRIP' | 'MAINTENANCE' | 'INACTIVE';
export type FuelType = 'DIESEL' | 'PETROL' | 'CNG' | 'LNG' | 'ELECTRIC';

export type CargoStatus = 'PENDING' | 'ASSIGNED' | 'LOADED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';
export type CargoType =
  | 'GENERAL'
  | 'PERISHABLE'
  | 'FRAGILE'
  | 'HAZARDOUS'
  | 'LIQUID'
  | 'REFRIGERATED'
  | 'OVERSIZED'
  | 'CONTAINER';

export type TripStatus =
  | 'PLANNED'
  | 'ASSIGNED'
  | 'LOADING'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED';

export type MaintenanceType =
  | 'ROUTINE_SERVICE'
  | 'ENGINE'
  | 'TYRE'
  | 'BRAKES'
  | 'ELECTRICAL'
  | 'BODYWORK'
  | 'AC_COOLING'
  | 'INSPECTION'
  | 'ACCIDENT_REPAIR'
  | 'OTHER';
export type MaintenanceStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type TransportationCostType =
  | 'TOLL'
  | 'PERMIT'
  | 'LOADING'
  | 'UNLOADING'
  | 'WEIGHBRIDGE'
  | 'ESCORT'
  | 'PARKING'
  | 'BROKERAGE'
  | 'OTHER';

export type DriverExpenseType =
  | 'FOOD'
  | 'LODGING'
  | 'TOLL'
  | 'FUEL'
  | 'REPAIR'
  | 'PARKING'
  | 'LOADING'
  | 'MISC';
export type ExpenseStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type DocumentType =
  | 'INSURANCE'
  | 'REGISTRATION'
  | 'PERMIT'
  | 'FITNESS'
  | 'POLLUTION'
  | 'LICENSE'
  | 'RECEIPT'
  | 'PROOF_OF_DELIVERY'
  | 'INVOICE'
  | 'CONTRACT'
  | 'OTHER';
export type DocumentOwnerType = 'TRUCK' | 'DRIVER' | 'TRIP' | 'EXPENSE' | 'BREAKDOWN';
export type DocumentStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export type BreakdownSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type BreakdownStatus = 'REPORTED' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED';

export interface SessionUser {
  id: string;
  name: string;
  email: string | null;
  mobile: string | null;
  role: Role;
  status: UserStatus;
  designation?: string;
  avatarColor?: string;
  lockedContactField: 'email' | 'mobile' | null;
  licenseNumber?: string;
  licenseExpiry?: string | null;
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface UserRecord extends Omit<SessionUser, 'lockedContactField'> {
  lockedContactField?: 'email' | 'mobile' | null;
  invitationStatus: InvitationStatus;
  invitedBy?: { id: string; name: string; role: Role } | null;
  address?: string;
  experienceYears?: number;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  updatedAt: string;
}

export interface Invitation {
  id: string;
  name: string;
  email: string | null;
  mobile: string | null;
  role: Role;
  channel: InvitationChannel;
  status: InvitationStatus;
  tokenPreview: string;
  expiresAt: string;
  acceptedAt?: string | null;
  resendCount: number;
  invitedBy?: { id: string; name: string } | null;
  createdAt: string;
}

export interface InvitationSummary {
  name: string;
  role: Role;
  email: string | null;
  mobile: string | null;
  channel: InvitationChannel;
  lockedField: 'email' | 'mobile';
  expiresAt: string;
}

export interface Truck {
  id: string;
  truckNumber: string;
  registrationNumber: string;
  make: string;
  model: string;
  year: number;
  capacityTons: number;
  fuelType: FuelType;
  status: TruckStatus;
  assignedDriver?: Pick<UserRecord, 'id' | 'name' | 'mobile' | 'email' | 'avatarColor'> | null;
  odometerKm: number;
  mileageKmPerLitre?: number;
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
  insuranceExpiry?: string | null;
  registrationExpiry?: string | null;
  fitnessExpiry?: string | null;
  permitExpiry?: string | null;
  purchaseDate?: string | null;
  purchasePrice?: number;
  purchaseVendor?: string;
  notes?: string;
  createdAt: string;
}

export interface Cargo {
  id: string;
  cargoCode: string;
  description: string;
  type: CargoType;
  weightTons: number;
  units?: number;
  declaredValue?: number;
  shipperName: string;
  shipperContact?: string;
  consigneeName: string;
  consigneeContact?: string;
  origin: string;
  destination: string;
  status: CargoStatus;
  trip?: Pick<Trip, 'id' | 'tripCode' | 'status'> | null;
  handlingInstructions?: string;
  createdAt: string;
}

export interface TripStatusEvent {
  status: TripStatus;
  at: string;
  by?: string | null;
  note?: string;
}

export interface Trip {
  id: string;
  tripCode: string;
  truck?: Pick<Truck, 'id' | 'truckNumber' | 'registrationNumber' | 'make' | 'model' | 'status'> | null;
  driver?: Pick<UserRecord, 'id' | 'name' | 'mobile' | 'avatarColor'> | null;
  cargo: Cargo[];
  pickupLocation: string;
  deliveryLocation: string;
  distanceKm?: number;
  startDate: string;
  expectedDeliveryDate: string;
  actualDeliveryDate?: string | null;
  status: TripStatus;
  revenue: number;
  transportationCost: number;
  driverExpenseTotal: number;
  fuelCost: number;
  totalExpenses: number;
  profit: number;
  notes?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledReason?: string;
  statusHistory: TripStatusEvent[];
  createdBy?: { id: string; name: string; role: Role } | null;
  createdAt: string;
}

export interface FuelRecord {
  id: string;
  truck?: Pick<Truck, 'id' | 'truckNumber' | 'make' | 'model'> | null;
  driver?: Pick<UserRecord, 'id' | 'name' | 'avatarColor'> | null;
  trip?: Pick<Trip, 'id' | 'tripCode' | 'status'> | null;
  date: string;
  litres: number;
  pricePerLitre: number;
  totalCost: number;
  odometerKm?: number;
  station?: string;
  location?: string;
  paymentMode: 'CASH' | 'CARD' | 'FUEL_CARD' | 'CREDIT' | 'UPI';
  notes?: string;
  billNumber?: string;
  createdAt: string;
}

export interface MaintenanceRecord {
  id: string;
  truck?: Pick<Truck, 'id' | 'truckNumber' | 'make' | 'model' | 'status'> | null;
  type: MaintenanceType;
  description: string;
  cost: number;
  date: string;
  serviceProvider?: string;
  nextServiceDate?: string | null;
  odometerKm?: number;
  status: MaintenanceStatus;
  createdAt: string;
}

export interface TransportationCost {
  id: string;
  trip?: Pick<Trip, 'id' | 'tripCode' | 'status' | 'pickupLocation' | 'deliveryLocation'> | null;
  truck?: Pick<Truck, 'id' | 'truckNumber'> | null;
  type: TransportationCostType;
  amount: number;
  date: string;
  description?: string;
  vendor?: string;
  createdAt: string;
}

export interface DriverExpense {
  id: string;
  driver?: Pick<UserRecord, 'id' | 'name' | 'avatarColor' | 'mobile' | 'email'> | null;
  trip?: Pick<Trip, 'id' | 'tripCode' | 'status' | 'pickupLocation' | 'deliveryLocation'> | null;
  type: DriverExpenseType;
  amount: number;
  date: string;
  description?: string;
  /** Reference printed on the paper receipt — no file is stored. */
  receiptNumber?: string;
  status: ExpenseStatus;
  reviewedBy?: { id: string; name: string; role: Role } | null;
  reviewedAt?: string | null;
  rejectionReason?: string;
  createdAt: string;
}

/**
 * A compliance record. The system stores no files of any kind — a document is
 * tracked by its reference number, issuer and validity window.
 */
export interface DocumentRecord {
  id: string;
  name: string;
  type: DocumentType;
  ownerType: DocumentOwnerType;
  truck?: Pick<Truck, 'id' | 'truckNumber' | 'registrationNumber'> | null;
  driver?: Pick<UserRecord, 'id' | 'name' | 'avatarColor'> | null;
  trip?: Pick<Trip, 'id' | 'tripCode'> | null;
  referenceNumber?: string;
  issuedBy?: string;
  issueDate?: string | null;
  expiryDate?: string | null;
  status: DocumentStatus;
  isExpired: boolean;
  addedBy?: { id: string; name: string; role: Role; avatarColor?: string } | null;
  verifiedBy?: { id: string; name: string; role: Role } | null;
  verifiedAt?: string | null;
  rejectionReason?: string;
  notes?: string;
  createdAt: string;
}

export interface BreakdownReport {
  id: string;
  reportCode: string;
  truck?: Pick<Truck, 'id' | 'truckNumber' | 'make' | 'model' | 'status'> | null;
  driver?: Pick<UserRecord, 'id' | 'name' | 'mobile' | 'avatarColor'> | null;
  trip?: Pick<Trip, 'id' | 'tripCode' | 'status'> | null;
  location: string;
  description: string;
  severity: BreakdownSeverity;
  status: BreakdownStatus;
  reportedAt: string;
  acknowledgedAt?: string | null;
  resolutionNotes?: string;
  resolvedBy?: { id: string; name: string } | null;
  resolvedAt?: string | null;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  entity?: string;
  entityId?: string | null;
  read: boolean;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  user?: { id: string; name: string; role: Role; avatarColor?: string } | null;
  userName: string;
  userRole?: string;
  action: string;
  summary: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string;
  createdAt: string;
}

/** Envelope returned by every cursor-paginated list endpoint. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

export interface DashboardKpis {
  totalTrucks: number;
  activeTrucks: number;
  availableTrucks: number;
  maintenanceTrucks: number;
  inactiveTrucks: number;
  totalDrivers: number;
  activeDrivers: number;
  invitedDrivers: number;
  activeTrips: number;
  plannedTrips: number;
  completedTrips: number;
  cancelledTrips: number;
  tripsInRange: number;
  revenue: number;
  fuelExpenses: number;
  maintenanceExpenses: number;
  driverExpenses: number;
  transportationCosts: number;
  totalExpenses: number;
  profit: number;
  margin: number;
  pendingExpenseCount: number;
  pendingExpenseAmount: number;
  openBreakdowns: number;
  expiringDocuments: number;
}

export interface SeriesPoint {
  date: string;
  label: string;
  revenue: number;
  fuelExpenses: number;
  maintenanceExpenses: number;
  driverExpenses: number;
  transportationCosts: number;
  expenses: number;
  profit: number;
  trips: number;
}

export interface StaffDashboard {
  range: { from: string; to: string };
  kpis: DashboardKpis;
  trends: {
    revenue: number | null;
    expenses: number | null;
    profit: number | null;
    trips: number | null;
  };
  fleetStatus: { status: TruckStatus; count: number }[];
  tripStatus: { status: TripStatus; count: number }[];
  series: SeriesPoint[];
  recentTrips: Trip[];
}

export interface DriverDashboard {
  range: { from: string; to: string };
  kpis: {
    totalTrips: number;
    activeTrips: number;
    completedTrips: number;
    plannedTrips: number;
    pendingExpenseCount: number;
    pendingExpenseAmount: number;
    approvedExpenseAmount: number;
    rejectedExpenseCount: number;
    fuelSpendInRange: number;
    openBreakdowns: number;
  };
  assignedTruck: Truck | null;
  activeTrip: Trip | null;
  upcomingTrips: Trip[];
  expenses: Record<string, { count: number; amount: number }>;
}

export interface ReportSummary {
  range: { from: string; to: string };
  granularity: 'day' | 'week' | 'month';
  totals: {
    revenue: number;
    fuelExpenses: number;
    maintenanceExpenses: number;
    driverExpenses: number;
    transportationCosts: number;
    totalExpenses: number;
    profit: number;
    margin: number;
  };
  previousTotals: ReportSummary['totals'];
  series: SeriesPoint[];
  topDrivers: { id: string; name: string; avatarColor?: string; trips: number; revenue: number }[];
  topTrucks: { id: string; truckNumber: string; make: string; model: string; trips: number; revenue: number }[];
  topRoutes: { route: string; trips: number; revenue: number }[];
  expensesByType: { type: DriverExpenseType; amount: number; count: number }[];
}
