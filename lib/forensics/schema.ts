export type ForensicsEnvelope<T> = {
  status: "1" | "0";
  message: string;
  result: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    hasMore?: boolean;
  };
  partial?: boolean;
};

export type ForensicsProfile = {
  address: string;
  activity: {
    total_txs: number;
    unique_txs: number;
    first_active: string | null;
    last_active: string | null;
    total_gas_spent: number;
    gas_on_successful: number;
    successful_txs: number;
    failed_txs: number;
  };
  message_types: Array<{
    type_url: string;
    count: number;
  }>;
  transfers: {
    sent: {
      transfer_count: number;
      unique_counterparties: number;
      unique_denoms: number;
    };
    received: {
      transfer_count: number;
      unique_counterparties: number;
      unique_denoms: number;
    };
  };
  contracts: {
    total_calls: number;
    unique_contracts: number;
  };
  partial?: boolean;
};

export type ForensicsCounterparty = {
  address: string;
  direction: "sent" | "received";
  tx_count: number;
  denoms: string[];
  total_amount: string;
  first_interaction: string | null;
  last_interaction: string | null;
};

export type ForensicsCounterpartiesResult = {
  address: string;
  counterparties: ForensicsCounterparty[];
  partial?: boolean;
};

export type ForensicsTransfer = {
  tx_hash: string;
  height: number;
  from_addr: string;
  to_addr: string;
  denom: string;
  amount: string;
  time: string | null;
  fee?: Record<string, unknown> | string | null;
  memo?: string | null;
};

export type ForensicsTransfersResult = {
  data: ForensicsTransfer[];
  meta: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
  partial?: boolean;
};

export type ForensicsTokenFlow = {
  address: string;
  range: "7d" | "30d" | "90d" | "all";
  flows: Array<{
    denom: string;
    symbol: string;
    decimals: number;
    logo_uri: string | null;
    total_received: string;
    total_sent: string;
    net_flow: string;
    receive_count: number;
    send_count: number;
    unique_senders: number;
    unique_receivers: number;
  }>;
  partial?: boolean;
};

export type ForensicsTimeline = {
  address: string;
  range: "7d" | "30d" | "90d";
  interval: "1h" | "1d";
  data: Array<{
    bucket: string;
    tx_count: number;
    gas_used: number;
    action_diversity: number;
  }>;
  partial?: boolean;
};

export type ForensicsContracts = {
  address: string;
  contracts: Array<{
    contract: string;
    label: string | null;
    creator: string | null;
    call_count: number;
    successful: number;
    failed: number;
    total_gas: number;
    first_call_height: number;
    last_call_height: number;
    top_methods: string[];
  }>;
  partial?: boolean;
};

export type ForensicsStaking = {
  address: string;
  staking: Array<{
    event_type: string;
    validator?: string;
    validator_src?: string;
    validator_dst?: string;
    denom: string;
    event_count: number;
    total_amount: string;
    first_event_height: number;
    last_event_height: number;
  }>;
  partial?: boolean;
};

export type ForensicsRisk = {
  address: string;
  risk_indicators: {
    rapid_fire_events: Array<{
      minute: string;
      transfers_in_minute: number;
    }>;
    round_amounts: Array<{
      amount: string;
      denom: string;
      occurrence: number;
      unique_recipients: number;
    }>;
    top_counterparties: Array<{
      counterparty: string;
      tx_count: number;
      total_amount: number;
    }>;
    account_age: {
      first_seen: string | null;
      last_seen: string | null;
      active_days_span: number;
      dormant_days: number;
    };
  };
  partial?: boolean;
};

export type TokenMetadataResponse = {
  status: "1" | "0";
  message: string;
  result: {
    denom: string;
    metadata: {
      name?: string;
      symbol: string;
      description?: string;
      decimals: number;
      image_url?: string | null;
    };
  };
};
