import { ForensicsCounterparty, ForensicsTransfer } from "../../lib/api/forensics";

export type AccountTx = ForensicsTransfer;

export interface CounterpartyGroup extends ForensicsCounterparty {
  transactions: any[];
  totalVolumeFormatted: string;
  tokenImageUrl?: string;
  edgeTimeRange: string;
  totalVolumeColor: string;
  lastActiveFormatted: string;
}

export type DbTransactionData = any; // Reserved for future use if needed
export type RpcTransactionData = any; // Reserved for future use if needed
