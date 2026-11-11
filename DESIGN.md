---
name: Bullproof research terminal
description: Dark chart-first stock investigation workspace
colors:
  background: "#0b1016"
  surface: "#111923"
  ink: "#e0e8ef"
  muted: "#91a1b1"
  rule: "#25313d"
  accent: "#20d99a"
  positive: "#24cfa0"
  negative: "#f16f7c"
---
# Design System: Bullproof

## Overview
On October28 evening the user explicitly rejected the prior editorial/Atlas feel and supplied three dark trading-terminal screenshots. This supersedes the earlier light Research Journal direction. The references are saved under output/terminal-redesign-oct28/*-reference.png. Borrow their compact hierarchy, chart dominance and integrated panels; retain Bullproof identity and real research functionality.

## Colors
Runtime tokens are in src/components/terminal-workspace.css, scoped to research-app.terminal-workspace. Near-black navy canvas, slightly lifted slate panels, mint selection/action, green/red signed financial changes. Company briefs use the same dark tokens. Market charts are official TradingView embeds with their own dark theme and exchange-delay labels.

## Typography
Use existing self-hosted Geist interface face and Geist Mono for tickers and numerical measures. Small compact headings, no editorial serif or oversized hero. Desktop body12px, panel labels10–12px, readable numeric values. Mobile search16px prevents unwanted input zoom.

## Layout
Full-width desktop workspace: compact54px header, market ticker tape, slim source-status row,190px filing rail / flexible market chart /280px evidence inspector, then a financial screener. Main chart includes volume and native TradingView controls. Fine1px borders,3px corners,8px panel gaps. At1150px the ticker rail becomes a horizontal strip; at800px panels stack and the header wraps. Preserve horizontal table scrolling rather than shrinking all data to unreadability.

## Components
Price chart is the default central tab; Map and Rank preserve financial comparison tools. Selecting a filing-rail or screener company updates the chart and inspector. Inspector prioritizes source facts, open-brief and save actions; quarterly history expands on demand. Company financial evidence, source filings, notes and market tabs remain functional. Saved-data storage keys are unchanged. Paper lab is explicitly Concept, not an active trader.

## Do's and Don'ts
Do keep market price changes separate from reported financial growth. Do show units, quarter dates, source times and provider attribution. Do retain source errors and missing-value handling. Do keep navigation and research actions visible while scanning.
Do not fill terminal panels with invented quotes, order-book depth, trade executions, AI performance or fake balances. Do not reintroduce light-paper briefs or oversized marketing headings unless the user changes direction again.


## Brand mark — October 29

Approved: upward-facing three-quarter bull head with check-shaped negative space, selected concept 02. Use `public/brand/bullproof.svg` on dark surfaces and `bullproof-ink.svg` on light ones. Preserve the approved silhouette. Wordmark is Bullproof in the existing Geist interface family. App tiles use ivory on the terminal background; maskable icons have separate safe-area padding.


## October 29 — terminal refinement
Interface text uses IBM Plex Sans (self-hosted by Next font; the legacy CSS variable remains --font-geist-sans). Geist Mono remains for tickers and numerical measures. This supersedes the 9–12px interface scale above: controls 12–14px, research prose 15–16px, section titles 16–20px. Keep chart labels compact. Desktop discovery uses one connected frame and divider lines, with unboxed metric rows and immediately visible brief/save actions. Arena strategies share a comparison strip; on phones it scrolls horizontally instead of shrinking balances. Market movers and historical saved research share the dark palette. Preserve data tables’ internal horizontal scrolling, dated sources and unavailable states.


## October 29 — information-first correction
User explicitly rejected instructional filler and requested established stock-app references. Remove default-view coaching sentences, marketing headings, and repeated review questions; do not reintroduce them to explain controls. Clear labels, actual values, dates, units, source links, estimated/unavailable status and useful errors remain. Methodology belongs in disclosures.
Reviewed official Koyfin dashboard example (https://www.koyfin.com/features/custom-dashboards/) and live Finviz (https://finviz.com/). Applied compact panel bars, aligned numeric columns, concise news rows, flatter borders and more chart visibility. Preserve Bullproof identity and real data; no copied brand assets or invented market widgets. Company view prioritizes earnings, valuation, reported financial charts and filings. Removed repeated generic case/research-checkpoint paragraphs while preserving the actual strategy evidence and rules.


## Portfolio competition — October 29
Chart + standings lead /arena. Strategy selection updates measured returns, holdings and fills together. Compact numeric position rows show entry, mark, shares, value and unrealized P/L; recorded buy signals sit immediately below. Detailed research stays under a disclosure. Preserve dark connected terminal, IBM Plex Sans interface and mono financial values. On phones charts retain readable axes; holdings stack and trade tables scroll internally. SPY uses a dashed line and labeled readout; color is supplemental.

## Current direction — November 3, 2026
The user-selected November 2 terminal screenshot supersedes After Hours. Navy #0b1218 / #101922, borders #293640, text #dae3e9, mint #19c99d. Neutral compact headings; mono numeric values. Desktop filing rail/chart/inspector, compact screener below; horizontal company selection on phones. Preserve functional research detail behind deliberate expansion. Shared styling also applies to briefs, markets, portfolios and pairing.
