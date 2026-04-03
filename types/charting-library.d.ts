declare module "charting_library/datafeed-api" {
  export type ResolutionString =
    | "1"
    | "2"
    | "3"
    | "4"
    | "5"
    | "10"
    | "15"
    | "30"
    | "45"
    | "60"
    | "90"
    | "120"
    | "180"
    | "240"
    | "360"
    | "720"
    | "1D"
    | "1W"
    | "1M"
    | "3M"
    | "6M"
    | "12M"
    | "1Y"
    | string;

  export interface LibrarySymbolInfo {
    name: string;
    full_name?: string;
    exchange?: string;
    timezone?: string;
    session?: string;
    minmov?: number;
    pricescale?: number;
    type?: string;
    intraday_multipliers?: string[];
    has_intraday?: boolean;
    has_daily?: boolean;
    has_weekly_and_monthly?: boolean;
    ticker?: string;
  }

  export interface Bar {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }

  export type SubscribeBarsCallback = (bar: Bar) => void;
}
