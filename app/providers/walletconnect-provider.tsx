// "use client";

// import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
// import { GasPrice } from "@cosmjs/stargate";
// import { fromBase64, toBase64 } from "@cosmjs/encoding";
// import { AminoSignResponse, OfflineAminoSigner } from "@cosmjs/amino";
// import {
//   AccountData,
//   DirectSignResponse,
//   OfflineDirectSigner,
//   OfflineSigner,
//   getOfflineSignerAuto,
//   StdSignDoc,
// } from "@cosmjs/proto-signing";
// import { Secp256k1 } from "@cosmjs/crypto";
// import { fromHex } from "@cosmjs/encoding";
// import SignClient from "@walletconnect/sign-client";
// import type { SessionTypes } from "@walletconnect/types";
// import { Web3Modal } from "@web3modal/standalone";
// import Long from "long";
// import React, {
//   createContext,
//   useCallback,
//   useContext,
//   useEffect,
//   useMemo,
//   useRef,
//   useState,
// } from "react";
// import type { ReactNode } from "react";
// import { AuthInfo, SignDoc, TxBody } from "cosmjs-types/cosmos/tx/v1beta1/tx";
// import { Any } from "cosmjs-types/google/protobuf/any";
// import { MsgExecuteContract } from "cosmjs-types/cosmwasm/wasm/v1/tx";

// type WalletStatus = "disconnected" | "connecting" | "connected" | "error";

// type WalletContextValue = {
//   address: string;
//   status: WalletStatus;
//   client: SigningCosmWasmClient | null;
//   connect: () => Promise<void>;
//   disconnect: () => Promise<void>;
// };

// const WalletContext = createContext<WalletContextValue | undefined>(undefined);

// const DEFAULT_CHAIN_ID = "zigchain-1";
// const DEFAULT_CHAIN_NAME = "Zigchain";
// const DEFAULT_COIN_DENOM = "ZIG";
// const DEFAULT_COIN_MIN_DENOM = "uzig";
// const DEFAULT_COIN_DECIMALS = 6;
// const DEFAULT_BECH32 = "zig";

// export const CHAIN_ID =
//   process.env.NEXT_PUBLIC_CHAIN_ID_DEGENTER ||
//   process.env.CHAIN_ID_DEGENTER ||
//   DEFAULT_CHAIN_ID;

// const CHAIN_NAME =
//   process.env.NEXT_PUBLIC_CHAIN_NAME_DEGENTER ||
//   process.env.CHAIN_NAME_DEGENTER ||
//   DEFAULT_CHAIN_NAME;

// const COIN_DENOM =
//   process.env.NEXT_PUBLIC_COIN_DENOM_DEGENTER ||
//   process.env.COIN_DENOM_DEGENTER ||
//   DEFAULT_COIN_DENOM;

// const COIN_MIN_DENOM =
//   process.env.NEXT_PUBLIC_COIN_MIN_DENOM_DEGENTER ||
//   process.env.COIN_MIN_DENOM_DEGENTER ||
//   DEFAULT_COIN_MIN_DENOM;

// const COIN_DECIMALS =
//   Number(
//     process.env.NEXT_PUBLIC_COIN_DECIMALS_DEGENTER ||
//       process.env.COIN_DECIMALS_DEGENTER
//   ) || DEFAULT_COIN_DECIMALS;

// const BECH32_PREFIX =
//   process.env.NEXT_PUBLIC_BECH32_PREFIX_DEGENTER ||
//   process.env.BECH32_PREFIX_DEGENTER ||
//   DEFAULT_BECH32;

// const RPC_URL =
//   process.env.RPC_URL_DEGENTER ||
//   process.env.RPC_URL_DEGENTER ||
//   "https://rpc.zigscan.net";
// const REST_URL =
//   process.env.NEXT_PUBLIC_REST_URL_DEGENTER ||
//   process.env.REST_URL_DEGENTER ||
//   "https://zigchain-mainnet-api.wickhub.cc";
// const WC_PROJECT_ID =
//   process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ||
//   process.env.WC_PROJECT_ID ||
//   "";
// const GAS_PRICE = GasPrice.fromString(
//   process.env.NEXT_PUBLIC_GAS_PRICE_DEGENTER ||
//     process.env.GAS_PRICE_DEGENTER ||
//     `0.025${COIN_MIN_DENOM}`
// );

// const KEPLR_CHAIN_INFO = {
//   chainId: CHAIN_ID,
//   chainName: CHAIN_NAME,
//   rpc: RPC_URL,
//   rest: REST_URL,
//   bip44: { coinType: 118 },
//   bech32Config: {
//     bech32PrefixAccAddr: BECH32_PREFIX,
//     bech32PrefixAccPub: `${BECH32_PREFIX}pub`,
//     bech32PrefixValAddr: `${BECH32_PREFIX}valoper`,
//     bech32PrefixValPub: `${BECH32_PREFIX}valoperpub`,
//     bech32PrefixConsAddr: `${BECH32_PREFIX}valcons`,
//     bech32PrefixConsPub: `${BECH32_PREFIX}valconspub`,
//   },
//   currencies: [
//     {
//       coinDenom: COIN_DENOM,
//       coinMinimalDenom: COIN_MIN_DENOM,
//       coinDecimals: COIN_DECIMALS,
//       coinGeckoId: COIN_DENOM.toLowerCase(),
//     },
//   ],
//   feeCurrencies: [
//     {
//       coinDenom: COIN_DENOM,
//       coinMinimalDenom: COIN_MIN_DENOM,
//       coinDecimals: COIN_DECIMALS,
//       gasPriceStep: { low: 0.025, average: 0.03, high: 0.04 },
//     },
//   ],
//   stakeCurrency: {
//     coinDenom: COIN_DENOM,
//     coinMinimalDenom: COIN_MIN_DENOM,
//     coinDecimals: COIN_DECIMALS,
//   },
//   features: ["cosmwasm"],
// };

// class WalletConnectSigner
//   implements OfflineSigner, OfflineDirectSigner, OfflineAminoSigner
// {
//   private parseAndCompressPubkey = (val: string | undefined): string => {
//     if (!val) return "";
//     const asHex = val.startsWith("0x") ? val.slice(2) : null;
//     const tryHex =
//       asHex && /^[0-9a-fA-F]+$/.test(asHex) ? fromHex(asHex) : null;
//     const tryB64 = (() => {
//       try {
//         return fromBase64(val);
//       } catch {
//         return null;
//       }
//     })();
//     const raw = tryHex || tryB64;
//     if (!raw) return "";
//     try {
//       return toBase64(this.compressPubkeySafe(raw));
//     } catch {
//       return val;
//     }
//   };

//   private compressPubkeySafe = (input: Uint8Array): Uint8Array => {
//     // Accept raw 64-byte (x||y), or 65-byte uncompressed (0x04||x||y), or already-compressed 33-byte.
//     if (input.length === 33 && (input[0] === 0x02 || input[0] === 0x03)) {
//       return input;
//     }
//     if (input.length === 64) {
//       const prefixed = new Uint8Array(65);
//       prefixed.set([0x04], 0);
//       prefixed.set(input, 1);
//       try {
//         return Secp256k1.compressPubkey(prefixed);
//       } catch {
//         return prefixed;
//       }
//     }
//     if (input.length === 65 && input[0] === 0x04) {
//       try {
//         return Secp256k1.compressPubkey(input);
//       } catch {
//         return input;
//       }
//     }
//     return input;
//   };

//   constructor(
//     private signClient: SignClient,
//     private session: SessionTypes.Struct,
//     private chainId: string,
//     private fallbackAddress: string
//   ) {}

//   private get namespaceChain() {
//     return `cosmos:${this.chainId}`;
//   }

//   async getAccounts(): Promise<readonly AccountData[]> {
//     try {
//       const res: any = await this.signClient.request({
//         topic: this.session.topic,
//         chainId: this.namespaceChain,
//         request: { method: "cosmos_getAccounts", params: {} },
//       });
//       const accounts = Array.isArray(res?.accounts)
//         ? res.accounts
//         : Array.isArray(res)
//         ? res
//         : [];
//       if (accounts.length) {
//         return accounts.map((acc: any) => ({
//           address: acc.address || this.fallbackAddress,
//           algo: acc.algo || "secp256k1",
//           pubkey: this.compressPubkeySafe(
//             (() => {
//               if (!acc?.pubkey) return new Uint8Array();
//               const hexStr =
//                 typeof acc.pubkey === "string" && acc.pubkey.startsWith("0x")
//                   ? acc.pubkey.slice(2)
//                   : null;
//               if (
//                 hexStr &&
//                 /^[0-9a-fA-F]+$/.test(hexStr) &&
//                 (hexStr.length === 128 || hexStr.length === 130)
//               ) {
//                 try {
//                   return fromHex(hexStr);
//                 } catch {}
//               }
//               try {
//                 return fromBase64(String(acc.pubkey));
//               } catch {
//                 return new Uint8Array();
//               }
//             })()
//           ),
//         }));
//       }
//     } catch {
//       // fall through to fallback below
//     }

//     return [
//       {
//         address: this.fallbackAddress,
//         algo: "secp256k1",
//         pubkey: new Uint8Array(),
//       },
//     ];
//   }

//   async signAmino(
//     signerAddress: string,
//     signDoc: StdSignDoc
//   ): Promise<AminoSignResponse> {
//     const res: any = await this.signClient.request({
//       topic: this.session.topic,
//       chainId: this.namespaceChain,
//       request: {
//         method: "cosmos_signAmino",
//         params: { signerAddress, signDoc },
//       },
//     });

//     const signature =
//       res?.signature?.signature ||
//       res?.signature ||
//       res?.signed?.signature ||
//       "";
//     const pubKeyValue =
//       res?.signature?.pub_key?.value || res?.pub_key?.value || "";

//     return {
//       signed: res?.signed ?? signDoc,
//       signature: {
//         signature: typeof signature === "string" ? signature : "",
//         pub_key: {
//           type: "tendermint/PubKeySecp256k1",
//           value:
//             typeof pubKeyValue === "string"
//               ? this.parseAndCompressPubkey(pubKeyValue)
//               : "",
//         },
//       },
//     };
//   }

//   async signDirect(
//     signerAddress: string,
//     signDoc: SignDoc
//   ): Promise<DirectSignResponse> {
//     // Normalize to WalletConnect sign-direct payload (base64 fields).
//     const toBytes = (val: Uint8Array | string | null | undefined) => {
//       if (val instanceof Uint8Array) return val;
//       if (typeof val === "string") {
//         try {
//           return fromBase64(val);
//         } catch {
//           return new Uint8Array();
//         }
//       }
//       return new Uint8Array();
//     };

//     const bodyBytes = toBytes(signDoc.bodyBytes as any);
//     const authInfoBytes = toBytes(signDoc.authInfoBytes as any);
//     const bodyBytesB64 = toBase64(bodyBytes);
//     const authInfoBytesB64 = toBase64(authInfoBytes);
//     const accountNumberStr = signDoc.accountNumber.toString();

//     // Decode for wallet UIs (many show "undefined" if no decoded fields are sent)
//     let txBodyJson: any = undefined;
//     let authInfoJson: any = undefined;
//     let decodedMsgs: any[] = [];
//     const decodeWasmMsgJson = (raw: Uint8Array | string | undefined) => {
//       const asBytes =
//         raw instanceof Uint8Array
//           ? raw
//           : typeof raw === "string"
//           ? fromBase64(raw)
//           : null;
//       if (!asBytes) return null;
//       try {
//         const text = new TextDecoder().decode(asBytes);
//         return JSON.parse(text);
//       } catch {
//         return null;
//       }
//     };

//     const decodeMessages = (anys: Any[]): any[] => {
//       return anys.map((msgAny) => {
//         const typeUrl = msgAny.typeUrl || (msgAny as any).type_url || "";
//         const valBytes = msgAny.value ?? msgAny?.value;
//         const asBytes =
//           valBytes instanceof Uint8Array
//             ? valBytes
//             : typeof valBytes === "string"
//             ? fromBase64(valBytes)
//             : new Uint8Array();

//         if (typeUrl === "/cosmwasm.wasm.v1.MsgExecuteContract") {
//           try {
//             const decoded = MsgExecuteContract.decode(asBytes);
//             const json = MsgExecuteContract.toJSON(decoded) as any;
//             const msgDecoded = decodeWasmMsgJson(decoded.msg as any);
//             const msgFinal =
//               msgDecoded ??
//               (() => {
//                 try {
//                   return JSON.parse(
//                     new TextDecoder().decode(
//                       decoded.msg instanceof Uint8Array
//                         ? decoded.msg
//                         : new Uint8Array()
//                     )
//                   );
//                 } catch {
//                   return undefined;
//                 }
//               })() ??
//               msgDecoded;
//             return {
//               type_url: typeUrl,
//               ...json,
//               msg: msgFinal ?? json?.msg,
//               msg_decoded: msgFinal,
//               msg_json: msgFinal
//                 ? JSON.stringify(msgFinal, null, 2)
//                 : undefined,
//               msg_string: msgFinal ? JSON.stringify(msgFinal) : undefined,
//             };
//           } catch {
//             // fall through
//           }
//         }
//         return { type_url: typeUrl, value: toBase64(asBytes) };
//       });
//     };
//     try {
//       const decoded = TxBody.decode(bodyBytes);
//       decodedMsgs = decodeMessages(decoded.messages);
//       txBodyJson = {
//         ...TxBody.toJSON(decoded),
//         messages: decodedMsgs,
//       };
//     } catch {
//       txBodyJson = undefined;
//     }
//     try {
//       authInfoJson = AuthInfo.toJSON(AuthInfo.decode(authInfoBytes));
//     } catch {
//       authInfoJson = undefined;
//     }
//     const msgs =
//       Array.isArray(txBodyJson?.messages) && txBodyJson.messages.length
//         ? txBodyJson.messages
//         : decodedMsgs;

//     const wcDoc = {
//       bodyBytes: bodyBytesB64,
//       authInfoBytes: authInfoBytesB64,
//       chainId: signDoc.chainId,
//       accountNumber: accountNumberStr,
//       // compatibility keys
//       body_bytes: bodyBytesB64,
//       auth_info_bytes: authInfoBytesB64,
//       chain_id: signDoc.chainId,
//       account_number: accountNumberStr,
//     };

//     const res: any = await this.signClient.request({
//       topic: this.session.topic,
//       chainId: this.namespaceChain,
//       request: {
//         method: "cosmos_signDirect",
//         params: {
//           signerAddress,
//           signDoc: wcDoc,
//           signDocJson: {
//             chainId: signDoc.chainId,
//             accountNumber: accountNumberStr,
//             txBody: txBodyJson ?? { messages: msgs },
//             authInfo: authInfoJson ?? {},
//             fee: authInfoJson?.fee,
//             msgs,
//             messages: msgs,
//             msgs_decoded: decodedMsgs,
//           },
//         },
//       },
//     });

//     const signedRaw = res?.signed ?? res?.signDoc ?? res?.sign_doc ?? wcDoc;
//     const sigRaw =
//       res?.signature?.signature ?? res?.signature ?? signedRaw?.signature ?? "";

//     const bodyB64 =
//       signedRaw?.bodyBytes ||
//       signedRaw?.body_bytes ||
//       signedRaw?.txBodyBytes ||
//       signedRaw?.tx_body_bytes ||
//       wcDoc.bodyBytes;
//     const authB64 =
//       signedRaw?.authInfoBytes ||
//       signedRaw?.auth_info_bytes ||
//       signedRaw?.authInfo ||
//       signedRaw?.auth_info ||
//       wcDoc.authInfoBytes;

//     if (!bodyB64 || !authB64 || !sigRaw) {
//       throw new Error("WalletConnect: missing signed data from wallet");
//     }

//     // const bodyBytes = fromBase64(String(bodyB64));
//     // const authInfoBytes = fromBase64(String(authB64));
//     const signatureBytes =
//       typeof sigRaw === "string"
//         ? fromBase64(sigRaw)
//         : sigRaw instanceof Uint8Array
//         ? sigRaw
//         : new Uint8Array();

//     return {
//       signed: {
//         bodyBytes,
//         authInfoBytes,
//         chainId: signedRaw.chainId || signedRaw.chain_id || signDoc.chainId,
//         accountNumber: Long.fromString(
//           signedRaw.accountNumber ??
//             signedRaw.account_number ??
//             accountNumberStr
//         ).toBigInt(),
//       },
//       signature: {
//         pub_key: {
//           type: "tendermint/PubKeySecp256k1",
//           value: this.parseAndCompressPubkey(
//             res?.signature?.pub_key?.value || res?.pub_key?.value || ""
//           ),
//         },
//         signature:
//           typeof sigRaw === "string" ? sigRaw : toBase64(signatureBytes),
//       },
//     };
//   }
// }

// async function createModal() {
//   if (typeof window === "undefined" || !WC_PROJECT_ID) return null;
//   return new Web3Modal({
//     projectId: WC_PROJECT_ID,
//     themeMode: "dark",
//     walletConnectVersion: 2,
//   });
// }

// export function WalletProvider({
//   children,
//   preferInjected = true,
// }: {
//   children: ReactNode;
//   preferInjected?: boolean;
// }) {
//   const [address, setAddress] = useState("");
//   const [status, setStatus] = useState<WalletStatus>("disconnected");
//   const [client, setClient] = useState<SigningCosmWasmClient | null>(null);
//   const [preferInjectedState, setPreferInjectedState] =
//     useState(preferInjected);
//   const modalRef = useRef<Web3Modal | null>(null);
//   const signClientRef = useRef<SignClient | null>(null);
//   const sessionRef = useRef<SessionTypes.Struct | null>(null);

//   const requiredNamespaces = useMemo(
//     () => ({
//       cosmos: {
//         chains: [`cosmos:${CHAIN_ID}`],
//         methods: [
//           "cosmos_getAccounts",
//           "cosmos_signDirect",
//           "cosmos_signAmino",
//         ],
//         events: ["chainChanged", "accountsChanged"],
//       },
//     }),
//     []
//   );

//   const initModal = useCallback(async () => {
//     if (!modalRef.current) {
//       modalRef.current = await createModal();
//     }
//     return modalRef.current;
//   }, []);

//   const initSignClient = useCallback(async () => {
//     if (signClientRef.current) return signClientRef.current;

//     const metadata = {
//       name: "Degenter Terminal",
//       description: "Degenter Terminal WalletConnect",
//       url: "https://degenterminal.com",
//       icons: ["https://www.cryptocomics.cc/assets/logo-BIVGl_Zz.svg"],
//     };

//     signClientRef.current = await SignClient.init({
//       projectId: WC_PROJECT_ID,
//       metadata,
//     });
//     return signClientRef.current;
//   }, []);

//   const hydrateSession = useCallback(async (session: SessionTypes.Struct) => {
//     sessionRef.current = session;
//     const cosmosAccounts = session.namespaces?.cosmos?.accounts || [];
//     const first = cosmosAccounts.find((acct) =>
//       acct.startsWith(`cosmos:${CHAIN_ID}`)
//     );
//     const addr = first ? first.split(":")[2] : "";
//     const signer = new WalletConnectSigner(
//       signClientRef.current as SignClient,
//       session,
//       CHAIN_ID,
//       addr
//     );
//     const signingClient = await SigningCosmWasmClient.connectWithSigner(
//       RPC_URL,
//       signer,
//       { gasPrice: GAS_PRICE as any }
//     );
//     setAddress(addr);
//     setClient(signingClient);
//     setStatus("connected");
//   }, []);

//   const connectInjected = useCallback(async () => {
//     if (typeof window === "undefined") return null;

//     const tryProvider = async (provider: any) => {
//       if (!provider?.enable) return null;
//       try {
//         if (provider.experimentalSuggestChain) {
//           try {
//             await provider.experimentalSuggestChain(KEPLR_CHAIN_INFO);
//           } catch {
//             // ignore suggest failures
//           }
//         }
//         await provider.enable(CHAIN_ID);
//         const signer =
//           provider.getOfflineSignerAuto?.(CHAIN_ID) ??
//           provider.getOfflineSigner?.(CHAIN_ID) ??
//           (await getOfflineSignerAuto(CHAIN_ID));
//         if (!signer?.getAccounts) return null;
//         const accounts = await signer.getAccounts();
//         const addr = accounts?.[0]?.address || "";
//         return { signer, addr };
//       } catch {
//         return null;
//       }
//     };

//     const keplr = (window as any).keplr;
//     const leap = (window as any).leap;
//     const cosmostation = (window as any)?.cosmostation?.providers?.keplr;

//     const hit =
//       (await tryProvider(keplr)) ||
//       (await tryProvider(leap)) ||
//       (await tryProvider(cosmostation));

//     if (!hit) return null;

//     const signingClient = await SigningCosmWasmClient.connectWithSigner(
//       RPC_URL,
//       hit.signer,
//       { gasPrice: GAS_PRICE as any }
//     );
//     setAddress(hit.addr);
//     setClient(signingClient);
//     setStatus("connected");
//     return hit;
//   }, []);

//   useEffect(() => {
//     if (typeof window === "undefined") return;
//     const mq = window.matchMedia("(min-width: 768px)");
//     setPreferInjectedState(mq.matches);
//     const handler = (e: MediaQueryListEvent) =>
//       setPreferInjectedState(e.matches);
//     mq.addEventListener("change", handler);
//     return () => mq.removeEventListener("change", handler);
//   }, []);

//   const connect = useCallback(async () => {
//     if (client && address) {
//       setStatus("connected");
//       return;
//     }
//     setStatus("connecting");
//     try {
//       const injected = await connectInjected();
//       if (injected) return;

//       if (!WC_PROJECT_ID) {
//         setStatus("error");
//         throw new Error("Missing WalletConnect project id");
//       }

//       const sc = await initSignClient();
//       const modal = await initModal();

//       const { uri, approval } = await sc.connect({
//         requiredNamespaces,
//       });

//       if (uri && modal) {
//         modal.openModal({ uri });
//       }

//       const session = await approval();
//       if (modal) modal.closeModal();
//       await hydrateSession(session);
//     } catch (error: any) {
//       const msg = String(error?.message || "");
//       if (
//         msg.toLowerCase().includes("expired") ||
//         msg.toLowerCase().includes("rejected")
//       ) {
//         setStatus("disconnected");
//         return;
//       }
//       console.error("WalletConnect connect failed", error);
//       const modal = modalRef.current;
//       modal?.closeModal();
//       setStatus("error");
//       throw error;
//     }
//   }, [
//     address,
//     client,
//     connectInjected,
//     hydrateSession,
//     initModal,
//     initSignClient,
//     preferInjectedState,
//     requiredNamespaces,
//   ]);

//   const disconnect = useCallback(async () => {
//     try {
//       const sc = signClientRef.current;
//       const session = sessionRef.current;
//       if (sc && session) {
//         await sc.disconnect({
//           topic: session.topic,
//           reason: { code: 6000, message: "User disconnected" },
//         });
//       }
//     } catch (error) {
//       console.error("WalletConnect disconnect failed", error);
//     } finally {
//       setAddress("");
//       setClient(null);
//       setStatus("disconnected");
//       sessionRef.current = null;
//       modalRef.current?.closeModal();
//     }
//   }, []);

//   // Try to restore any persisted session on mount
//   useEffect(() => {
//     (async () => {
//       if (!WC_PROJECT_ID) return;
//       try {
//         const sc = await initSignClient();
//         const existing = sc.session
//           .getAll()
//           .find((s) =>
//             s.namespaces?.cosmos?.accounts?.some((a) =>
//               a.startsWith(`cosmos:${CHAIN_ID}`)
//             )
//           );
//         if (existing) {
//           await hydrateSession(existing);
//         }
//       } catch (error) {
//         console.error("Failed to restore WalletConnect session", error);
//       }
//     })();
//   }, [hydrateSession, initSignClient]);

//   const value: WalletContextValue = {
//     address,
//     status,
//     client,
//     connect,
//     disconnect,
//   };

//   return (
//     <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
//   );
// }

// export function useWallet() {
//   const ctx = useContext(WalletContext);
//   if (!ctx) {
//     throw new Error("useWallet must be used within WalletProvider");
//   }
//   return ctx;
// }
