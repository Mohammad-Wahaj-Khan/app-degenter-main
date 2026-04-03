export type OrderStatus =
  | "pending" // Order is pending execution
  | "open" // Order is open and active
  | "filled" // Order is completely filled
  | "partial" // Order is partially filled
  | "cancelled" // Order was cancelled
  | "failed" // Order failed to execute
  | "expired"; // Order expired

export interface OrderStatusInfo {
  status: OrderStatus;
  filledAmount?: string;
  remainingAmount?: string;
  averagePrice?: string;
  lastUpdated: number; // timestamp
  error?: {
    code: string;
    message: string;
    txHash?: string;
  };
  txHashes?: {
    create?: string;
    fill?: string[];
    cancel?: string;
  };
}

export interface EnhancedOrder extends Record<string, any> {
  id: number;
  statusInfo: OrderStatusInfo;
  // Other existing order fields will be merged with this type
}
