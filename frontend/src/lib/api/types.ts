/**
 * Response shapes of the CargoTrack API, as the frontend uses them.
 * Decimal columns arrive as strings — Prisma serialises them that way so no
 * precision is lost — and are formatted, never computed with, in the UI.
 */

export type Role = "OFFICE_MANAGER" | "CLIENT";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  clientId: string | null;
}

export interface LoginResult {
  accessToken: string;
  user: User;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export type OrderStatus =
  | "ORDER_PLACED"
  | "ORDER_CONFIRMED"
  | "GOODS_RECEIVED"
  | "SHIPMENT_BOOKING"
  | "ROUTE_DECISION"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "CLOSED_OUT"
  | "CANCELLED"
  | "FACTORY_CANNOT_FULFIL"
  | "QC_REJECTED"
  | "DOCUMENTS_WITHHELD";

export interface Client {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string | null;
  country: string;
}

export interface Supplier {
  id: string;
  name: string;
  country: string;
}

export interface OrderItem {
  id: string;
  description: string;
  category: string | null;
  quantity: number;
  unitCbm: string;
  unitWeightKg: string;
  unitPrice: string;
}

export type ProductionOrderStatus =
  | "PENDING"
  | "IN_PRODUCTION"
  | "READY"
  | "RECEIVED"
  | "CANCELLED";

export type QcOutcome = "PASSED" | "REJECTED" | "PARTIAL";

export interface QcInspection {
  id: string;
  inspectedAt: string;
  outcome: QcOutcome;
  rejectionNotes: string | null;
  clientSignedOffAt: string | null;
}

export interface ProductionOrder {
  id: string;
  agreedCost: string;
  currency: string;
  status: ProductionOrderStatus;
  supplier: { id: string; name: string; country: string };
  inspections: QcInspection[];
}

export interface Settlement {
  currency: string;
  agreedPrice: string;
  depositRequired: string;
  depositReceived: string;
  depositMet: boolean;
  collected: string;
  balanceDue: string;
  paidInFull: boolean;
}

export interface OrderSummary {
  id: string;
  status: OrderStatus;
  agreedPrice: string;
  currency: string;
  placedAt: string;
  client: { id: string; companyName: string };
  _count: { items: number };
}

export interface Order {
  id: string;
  clientId: string;
  status: OrderStatus;
  agreedPrice: string;
  currency: string;
  depositPercentage: string;
  totalCbm: string | null;
  totalWeightKg: string | null;
  requiredBy: string | null;
  placedAt: string;
  closedAt: string | null;
  client: { id: string; companyName: string; country: string };
  items: OrderItem[];
  productionOrders: ProductionOrder[];
  settlement: Settlement;
}

export interface StatusChange {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  changedAt: string;
  changedByUser: { id: string; name: string; role: Role } | null;
}

export type PaymentType =
  | "DEPOSIT"
  | "BALANCE"
  | "FREIGHT"
  | "CUSTOMS"
  | "STORAGE"
  | "REFUND";

export interface Payment {
  id: string;
  orderId: string;
  paymentType: PaymentType;
  direction: "INBOUND" | "OUTBOUND";
  counterpartyType: string;
  amount: string;
  currency: string;
  paidAt: string | null;
  reference: string | null;
  createdAt: string;
}

export type DocumentType =
  | "BILL_OF_LADING"
  | "PACKING_LIST"
  | "COMMERCIAL_INVOICE"
  | "CERTIFICATE_OF_ORIGIN"
  | "CUSTOMS_DECLARATION"
  | "INSURANCE_CERTIFICATE"
  | "QC_REPORT"
  | "OTHER";

export interface CargoDocument {
  id: string;
  orderId: string | null;
  containerId: string | null;
  docType: DocumentType;
  version: number;
  supersedesId: string | null;
  isCurrent: boolean;
  createdAt: string;
  releasedToClientAt: string | null;
  withheld: boolean;
  withheldReason: string | null;
  /** Absent when the viewer may not have the file. */
  fileRef?: string;
}

export type ContainerStatus =
  | "OPEN_FOR_ALLOCATION"
  | "FULLY_ALLOCATED"
  | "DEPARTED"
  | "ARRIVED"
  | "CLOSED";

export interface Utilization {
  allocatedCbm: string;
  allocatedWeightKg: string;
  remainingCbm: string;
  remainingWeightKg: string;
  cbmPercent: number;
  weightPercent: number;
}

export interface ContainerSummary {
  id: string;
  containerRef: string;
  containerType: string;
  status: ContainerStatus;
  routeType: "DIRECT" | "TRANSIT";
  originPort: string;
  destinationPort: string;
  capacityCbm: string;
  capacityWeightKg: string;
  utilization: Utilization;
  _count: { allocations: number; transitLegs: number };
}

export interface Allocation {
  id: string;
  allocatedCbm: string;
  allocatedWeightKg: string;
  order: {
    id: string;
    status: OrderStatus;
    client: { id: string; companyName: string };
  };
}

export interface TransitLeg {
  id: string;
  sequence: number;
  port: string;
  arrivedAt: string | null;
  departedAt: string | null;
}

export interface Container extends Omit<ContainerSummary, "_count"> {
  departedAt: string | null;
  arrivedAt: string | null;
  allocations: Allocation[];
  transitLegs: TransitLeg[];
}

export type NotificationStatus =
  | "PENDING"
  | "SENT"
  | "FAILED"
  | "RETRYING"
  | "DEAD_LETTER";

export interface Notification {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  recipientType: string;
  recipientId: string;
  channel: string;
  clientVisible: boolean;
  status: NotificationStatus;
  retryCount: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
}
