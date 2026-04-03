// lib/rpc-websocket.ts
type RPCRequest = {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: any;
};

type RPCResponse = {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: any;
  error?: { code: number; message: string; data?: any };
  method?: string;
  params?: any;
};

type SubscriptionHandler = (data: any) => void;

type Subscription = {
  id: string;
  unsubscribe: () => void;
};

export class RPCWebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private requestId = 0;
  private subscriptions = new Map<string, SubscriptionHandler>();
  private pendingRequests = new Map<number | string, (response: any) => void>();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnected = false;
  private messageQueue: string[] = [];

  constructor(url: string) {
    this.url = url;
    this.connect();
  }

  private connect() {
    if (this.ws) this.ws.close();

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      // console.log("[RPC WS] connected");
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.flushMessageQueue();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: RPCResponse = JSON.parse(event.data);

        // Tendermint "subscription" event
        if (msg.method === "subscription" && msg.params?.result) {
          const { subscription, result } = msg.params;
          const handler = this.subscriptions.get(subscription);
          if (handler) handler(result);
          return;
        }

        // Regular RPC response
        if (msg.id != null && this.pendingRequests.has(msg.id)) {
          const resolve = this.pendingRequests.get(msg.id)!;
          this.pendingRequests.delete(msg.id);
          resolve(msg);
        }
      } catch (err) {
        console.error("[RPC WS] parse error:", err);
      }
    };

    this.ws.onclose = () => {
      console.warn("[RPC WS] disconnected");
      this.isConnected = false;
      this.handleReconnect();
    };

    this.ws.onerror = (err) => {
      console.error("[RPC WS] error:", err);
      this.ws?.close();
    };
  }

  private handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("[RPC WS] max reconnection attempts reached");
      return;
    }
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts++);
    // console.log(`[RPC WS] reconnecting in ${delay}ms...`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private async sendRequest(method: string, params?: any): Promise<any> {
    const id = ++this.requestId;
    const request: RPCRequest = { jsonrpc: "2.0", id, method, params };
    const requestJson = JSON.stringify(request);

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, (response: RPCResponse) => {
        if (response.error) reject(new Error(response.error.message));
        else resolve(response.result);
      });

      if (this.isConnected && this.ws) {
        this.ws.send(requestJson);
      } else {
        this.messageQueue.push(requestJson);
      }
    });
  }

  private flushMessageQueue() {
    if (!this.isConnected || !this.ws) return;
    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift();
      if (msg) this.ws.send(msg);
    }
  }

  /** 🌐 Tendermint-style subscription */
  public async subscribe(
    query: string,
    p0: { token: string; tf: string },
    callback: SubscriptionHandler
  ): Promise<Subscription> {
    const id = `sub_${Date.now()}`;

    // 🔧 Send proper Tendermint RPC payload
    const result = await this.sendRequest("subscribe", { query });

    const subscriptionId = result?.id || id;
    this.subscriptions.set(subscriptionId, callback);

    return {
      id: subscriptionId,
      unsubscribe: () => {
        this.sendRequest("unsubscribe", { query }).catch(console.error);
        this.subscriptions.delete(subscriptionId);
      },
    };
  }

  /** 🔧 General RPC call (for status, abci_query, etc.) */
  public async call<T = any>(
    method: string,
    params?: Record<string, any>
  ): Promise<T> {
    const response = await this.sendRequest(method, params);
    return response as T;
  }

  public disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) this.ws.close();
    this.isConnected = false;
    this.subscriptions.clear();
    this.pendingRequests.clear();
    this.messageQueue = [];
  }
}

// 🟢 Singleton instance
export const rpcWebSocket = new RPCWebSocketClient(
  process.env.NEXT_PUBLIC_WS_URL || "wss://dev-api.degenter.io/ws"
);
