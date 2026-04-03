import { Coin, StdFee } from "@cosmjs/amino";
import {
  CosmWasmClient,
  SigningCosmWasmClient,
} from "@cosmjs/cosmwasm-stargate";

// Types for limit order contract
export type OrderSide = "buy" | "sell";
export type Uint128 = string;
export type Decimal = string;

export type OroSwapOperation = {
  offer_asset_info: {
    native_token?: { denom: string };
    token?: { contract_addr: string };
  };
  ask_asset_info: {
    native_token?: { denom: string };
    token?: { contract_addr: string };
  };
  pair_type: { custom?: string; xyk?: Record<string, never> };
  pair_address: string;
};

export type ConfigUpdate = {
  admin?: string;
  keeper_address?: string;
  gas_fee_per_order?: Uint128;
};

export type ExecuteMsg =
  | {
      create_limit_order: {
        pool_address: string;
        side: OrderSide;
        offer_denom: string;
        ask_denom: string;
        quantity: Uint128;
        limit_price: Decimal;
        min_receive?: Uint128 | null;
        max_spread?: Decimal | null;
      };
    }
  | { cancel_order: { order_id: number } }
  | { execute_order: { order_id: number; current_price: Decimal } }
  | { update_config: { config: ConfigUpdate } }
  | { emergency_pause: { paused: boolean; reason?: string | null } };

export type QueryMsg =
  | { config: Record<string, never> }
  | { order: { order_id: number } }
  | { user_orders: { user: string; limit?: number } }
  | { user_active_orders: { user: string } }
  | { pool_orders: { pool_address: string; limit?: number } }
  | { active_pools: Record<string, never> }
  | { get_pool_orders: { pool_address: string } }
  | { user_stats: { user: string } }
  | { reply_context: Record<string, never> };

export type GenericQueryResponse = Record<string, unknown>;

export class LimitOrderContractQueryClient {
  constructor(
    protected readonly client: CosmWasmClient,
    protected readonly contractAddress: string
  ) {}

  getRawClient() {
    return this.client;
  }

  protected async query<T = GenericQueryResponse>(msg: QueryMsg): Promise<T> {
    return this.client.queryContractSmart(this.contractAddress, msg);
  }

  config(): Promise<GenericQueryResponse> {
    return this.query({ config: {} });
  }

  order(orderId: number): Promise<GenericQueryResponse> {
    return this.query({ order: { order_id: orderId } });
  }

  userOrders(user: string, limit?: number): Promise<GenericQueryResponse> {
    return this.query({ user_orders: { user, limit } });
  }

  userActiveOrders(user: string): Promise<GenericQueryResponse> {
    return this.query({ user_active_orders: { user } });
  }

  poolOrders(
    poolAddress: string,
    limit?: number
  ): Promise<GenericQueryResponse> {
    return this.query({ pool_orders: { pool_address: poolAddress, limit } });
  }

  activePools(): Promise<GenericQueryResponse> {
    return this.query({ active_pools: {} });
  }

  getPoolOrders(poolAddress: string): Promise<GenericQueryResponse> {
    return this.query({ get_pool_orders: { pool_address: poolAddress } });
  }

  userStats(user: string): Promise<GenericQueryResponse> {
    return this.query({ user_stats: { user } });
  }

  replyContext(): Promise<GenericQueryResponse> {
    return this.query({ reply_context: {} });
  }
}

export class LimitOrderContractExecuteClient extends LimitOrderContractQueryClient {
  constructor(
    private readonly signingClient: SigningCosmWasmClient,
    private readonly senderAddress: string,
    contractAddress: string
  ) {
    super(signingClient, contractAddress);
  }

  private exec<T = unknown>(
    msg: ExecuteMsg,
    fee: "auto" | number | StdFee = "auto",
    memo?: string,
    funds?: readonly Coin[]
  ): Promise<T> {
    return this.signingClient.execute(
      this.senderAddress,
      this.contractAddress,
      msg,
      fee,
      memo,
      funds
    ) as Promise<T>;
  }

  createLimitOrder(
    params: {
      poolAddress: string;
      side: OrderSide;
      offerDenom: string;
      askDenom: string;
      quantity: Uint128;
      limitPrice: Decimal;
      minReceive?: Uint128 | null;
      maxSpread?: Decimal | null;
    },
    fee: "auto" | number | StdFee = "auto",
    memo?: string,
    funds?: readonly Coin[]
  ) {
    const msg: ExecuteMsg = {
      create_limit_order: {
        pool_address: params.poolAddress,
        side: params.side,
        offer_denom: params.offerDenom,
        ask_denom: params.askDenom,
        quantity: params.quantity,
        limit_price: params.limitPrice,
        min_receive: params.minReceive ?? null,
        max_spread: params.maxSpread ?? null,
      },
    };

    return this.exec(msg, fee, memo, funds);
  }

  cancelOrder(
    orderId: number,
    fee: "auto" | number | StdFee = "auto",
    memo?: string
  ) {
    return this.exec({ cancel_order: { order_id: orderId } }, fee, memo);
  }

  executeOrder(
    orderId: number,
    currentPrice: Decimal,
    fee: "auto" | number | StdFee = "auto",
    memo?: string
  ) {
    return this.exec(
      { execute_order: { order_id: orderId, current_price: currentPrice } },
      fee,
      memo
    );
  }

  updateConfig(
    config: ConfigUpdate,
    fee: "auto" | number | StdFee = "auto",
    memo?: string
  ) {
    return this.exec({ update_config: { config } }, fee, memo);
  }

  emergencyPause(
    paused: boolean,
    reason?: string,
    fee: "auto" | number | StdFee = "auto",
    memo?: string
  ) {
    return this.exec(
      { emergency_pause: { paused, reason: reason ?? null } },
      fee,
      memo
    );
  }
}

export function getQueryClient(
  client: CosmWasmClient,
  contractAddress: string
) {
  return new LimitOrderContractQueryClient(client, contractAddress);
}

export async function getExecuteClient(
  signer: SigningCosmWasmClient,
  senderAddress: string,
  contractAddress: string
) {
  return new LimitOrderContractExecuteClient(
    signer,
    senderAddress,
    contractAddress
  );
}
