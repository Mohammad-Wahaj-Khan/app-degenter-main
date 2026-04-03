import { Coin, StdFee } from "@cosmjs/amino";
import {
  CosmWasmClient,
  SigningCosmWasmClient,
} from "@cosmjs/cosmwasm-stargate";
import {
  ConfigUpdate,
  ExecuteMsg,
  OroSwapOperation,
  QueryMsg,
  Uint128,
} from "@/schemas/TwapContract.types";

export type TwapConfigResponse = {
  config: Record<string, unknown>;
};

export type GenericQueryResponse = Record<string, unknown>;

export class TwapContractQueryClient {
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

  config(): Promise<TwapConfigResponse> {
    return this.query({ config: {} });
  }

  order(user: string): Promise<GenericQueryResponse> {
    return this.query({ order: { user } });
  }

  userOrders(user: string, limit?: number): Promise<GenericQueryResponse> {
    return this.query({ user_orders: { user, limit } });
  }

  activeOrders(limit?: number, startAfter?: string): Promise<GenericQueryResponse> {
    return this.query({
      active_orders: {
        limit,
        start_after: startAfter ?? undefined,
      },
    });
  }

  chunk(user: string, chunkId: number): Promise<GenericQueryResponse> {
    return this.query({ chunk: { user, chunk_id: chunkId } });
  }

  userChunks(user: string): Promise<GenericQueryResponse> {
    return this.query({ user_chunks: { user } });
  }

  stats(): Promise<GenericQueryResponse> {
    return this.query({ stats: {} });
  }

  userStats(user: string): Promise<GenericQueryResponse> {
    return this.query({ user_stats: { user } });
  }

  pendingExecutions(limit?: number): Promise<GenericQueryResponse> {
    return this.query({ pending_executions: { limit } });
  }

  replyContext(): Promise<GenericQueryResponse> {
    return this.query({ reply_context: {} });
  }

  userLatestOrder(user: string): Promise<GenericQueryResponse> {
    return this.query({ user_latest_order: { user } });
  }

  userAllOrders(user: string): Promise<GenericQueryResponse> {
    return this.query({ user_all_orders: { user } });
  }
}

export class TwapContractExecuteClient extends TwapContractQueryClient {
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

  createTwapOrder(
    params: {
      offerDenom: string;
      askDenom: string;
      pairAddress?: string | null;
      totalAmount: Uint128;
      chunkCount: number;
      totalTimeMinutes: number;
      minReceive?: Uint128 | null;
      maxSpread?: string | null;
      operations: OroSwapOperation[];
    },
    fee: "auto" | number | StdFee = "auto",
    memo?: string,
    funds?: readonly Coin[]
  ) {
    const msg: ExecuteMsg = {
      create_twap_order: {
        offer_denom: params.offerDenom,
        ask_denom: params.askDenom,
        pair_address: params.pairAddress,
        total_amount: params.totalAmount,
        chunk_count: params.chunkCount,
        total_time_minutes: params.totalTimeMinutes,
        min_receive: params.minReceive,
        max_spread: params.maxSpread ?? null,
        operations: params.operations,
      },
    };

    return this.exec(msg, fee, memo, funds);
  }

  cancelOrder(fee: "auto" | number | StdFee = "auto", memo?: string) {
    return this.exec({ cancel_order: {} }, fee, memo);
  }

  markChunkFailed(
    chunkId: number,
    fee: "auto" | number | StdFee = "auto",
    memo?: string
  ) {
    return this.exec({ mark_chunk_failed: { chunk_id: chunkId } }, fee, memo);
  }

  executeChunk(
    user: string,
    chunkId: number,
    fee: "auto" | number | StdFee = "auto",
    memo?: string
  ) {
    return this.exec({ execute_chunk: { user, chunk_id: chunkId } }, fee, memo);
  }

  cleanupCancelledOrderChunks(
    user: string,
    fee: "auto" | number | StdFee = "auto",
    memo?: string
  ) {
    return this.exec(
      { cleanup_cancelled_order_chunks: { user } },
      fee,
      memo
    );
  }

  clearReplyContext(fee: "auto" | number | StdFee = "auto", memo?: string) {
    return this.exec({ clear_reply_context: {} }, fee, memo);
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
    return this.exec({ emergency_pause: { paused, reason } }, fee, memo);
  }

  executeTriggerReadyChunks(
    fee: "auto" | number | StdFee = "auto",
    memo?: string
  ) {
    return this.exec({ execute_trigger_ready_chunks: {} }, fee, memo);
  }
}

export function getQueryClient(client: CosmWasmClient, contractAddress: string) {
  return new TwapContractQueryClient(client, contractAddress);
}

export async function getExecuteClient(
  signer: SigningCosmWasmClient,
  senderAddress: string,
  contractAddress: string
) {
  return new TwapContractExecuteClient(signer, senderAddress, contractAddress);
}
