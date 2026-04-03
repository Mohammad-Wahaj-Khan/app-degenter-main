# TradingView Chart Integration

This directory contains the implementation of the TradingView charting library in your React application.

## Components

### TradingViewChart

The main chart component that renders the TradingView chart.

#### Props

| Prop          | Type                | Default                             | Description                                                |
| ------------- | ------------------- | ----------------------------------- | ---------------------------------------------------------- |
| `symbol`      | string              | `'BTC/USDT'`                        | The trading pair symbol to display                         |
| `interval`    | string              | `'15'`                              | Default chart interval (1, 5, 15, 30, 60, 240, 1D, 1W, 1M) |
| `theme`       | 'dark' \| 'light'   | `'dark'`                            | Chart theme                                                |
| `autosize`    | boolean             | `true`                              | Whether the chart should auto-resize                       |
| `style`       | React.CSSProperties | `{ width: '100%', height: '100%' }` | Container styles                                           |
| `containerId` | string              | `'tradingview-chart'`               | ID for the chart container                                 |
| `libraryPath` | string              | `'/charting_library/'`              | Path to the charting library                               |
| `fullscreen`  | boolean             | `false`                             | Whether to show in fullscreen mode                         |

### Datafeed

The datafeed implementation that connects the chart to your API.

## Usage

1. First, ensure you have the TradingView charting library files in the `public/charting_library/` directory.

2. Import and use the `TradingViewChart` component in your page:

```tsx
import dynamic from "next/dynamic";

// Dynamically import the chart with SSR disabled
const TradingViewChart = dynamic(
  () => import("@/components/TradingViewChart"),
  { ssr: false }
);

function MyTradingPage() {
  return (
    <div style={{ height: "600px" }}>
      <TradingViewChart symbol="BTC/USDT" interval="15" theme="dark" />
    </div>
  );
}
```

## API Integration

The chart requires a backend API that provides the following endpoints:

### GET /api/candles

Returns historical candle data in the following format:

```json
[
  {
    "time": "2023-01-01T00:00:00Z",
    "open": 16500.5,
    "high": 16550.25,
    "low": 16480.75,
    "close": 16520.1,
    "volume": 125.5
  },
  ...
]
```

### WebSocket (optional)

For real-time updates, implement a WebSocket server that pushes updates to the client. The `Datafeed` class includes placeholder methods for WebSocket integration.

## Styling

You can customize the chart's appearance by modifying the `overrides` object in the `TradingViewChart` component.

## Troubleshooting

- **Chart not loading**: Check the browser console for errors. Ensure the charting library files are correctly placed in the `public/charting_library/` directory.
- **No data**: Verify that your API is returning data in the expected format and that CORS is properly configured.
- **Performance issues**: For large datasets, consider implementing server-side pagination or data aggregation.
