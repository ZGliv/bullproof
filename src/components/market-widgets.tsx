"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, RotateCw } from "lucide-react";

/** Isolate each official embed document so React cleanup cannot detach its executing script. */
function HostedWidget({
  kind,
  options,
  title,
}: {
  kind: "advanced-chart" | "ticker-tape" | "symbol-profile";
  options: Record<string, unknown>;
  title: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const encoded = JSON.stringify(options).replaceAll("<", "\\u003c");
  const document = useMemo(
    () =>
      `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;background:#0b1218;color-scheme:dark;overflow:hidden}.tradingview-widget-container,.tradingview-widget-container__widget{width:100%;height:100%}</style></head><body><div class="tradingview-widget-container"><div class="tradingview-widget-container__widget"></div><script async src="https://s3.tradingview.com/external-embedding/embed-widget-${kind}.js" onerror="parent.postMessage({type:'bullproof-widget-failed'},'*')">${encoded}</script></div></body></html>`,
    [encoded, kind],
  );
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (
        event.source === frame.current?.contentWindow &&
        event.data?.type === "bullproof-widget-failed"
      )
        setFailed(true);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);
  return (
    <>
      <iframe
        ref={frame}
        key={attempt}
        className="t-hosted-widget"
        title={title}
        srcDoc={document}
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      {failed ? (
        <div className="t-widget-failure">
          <p>The market-data widget could not connect.</p>
          <button
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
          >
            <RotateCw size={14} /> Retry connection
          </button>
        </div>
      ) : null}
    </>
  );
}
export function PriceChart({ symbol, name }: { symbol: string; name: string }) {
  return (
    <div className="t-price-widget">
      <HostedWidget
        kind="advanced-chart"
        title={`${name} interactive price chart`}
        options={{
          autosize: true,
          symbol,
          interval: "D",
          timezone: "America/New_York",
          theme: "dark",
          style: "1",
          locale: "en",
          allow_symbol_change: false,
          calendar: false,
          hide_top_toolbar: false,
          hide_side_toolbar: true,
          withdateranges: true,
          save_image: false,
          support_host: "https://www.tradingview.com",
        }}
      />
      <div className="t-chart-attribution">
        <a
          href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {name} chart by TradingView <ExternalLink size={11} />
        </a>
        <span>Feed timing varies by exchange. See chart status.</span>
      </div>
    </div>
  );
}
export function MarketTape({ symbols }: { symbols: string[] }) {
  return (
    <div className="t-market-tape">
      <HostedWidget
        key={symbols.join(",")}
        kind="ticker-tape"
        title="Research universe market ticker tape"
        options={{
          symbols: symbols
            .slice(0, 12)
            .map((proName) => ({ proName, description: "" })),
          showSymbolLogo: true,
          isTransparent: false,
          displayMode: "regular",
          colorTheme: "dark",
          locale: "en",
        }}
      />
      <a
        href="https://www.tradingview.com/markets/stocks-usa/"
        target="_blank"
        rel="noopener noreferrer"
      >
        Market tape by TradingView · exchange delays apply
      </a>
    </div>
  );
}
export function CompanyProfile({ symbol }: { symbol: string }) {
  return (
    <div className="t-profile-widget">
      <HostedWidget
        kind="symbol-profile"
        title={`${symbol} company profile`}
        options={{
          width: "100%",
          height: "100%",
          colorTheme: "dark",
          isTransparent: false,
          symbol,
          locale: "en",
        }}
      />
      <a
        className="t-chart-attribution"
        href={`https://www.tradingview.com/symbols/${encodeURIComponent(symbol.replace(":", "-"))}/`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Company profile by TradingView <ExternalLink size={11} />
      </a>
    </div>
  );
}
