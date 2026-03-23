'use client';

import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { BottomDescription, ChartCard, Select, StatBox, Button, Badge } from '@/components/ui/ChartCard';
import { poiRet, displayLabel } from '@/engine/returns';
import { getEffectiveScoringDay, getLiveDisplayDay, getLiveDisplayDate } from '@/engine/live';
import { filterScoresByActiveEvents, selectEvents } from '@/engine/similarity';
import { PORTFOLIO_SCENARIOS } from '@/config/engine';
import { CHART_THEME } from '@/config/theme';
import { nanMean, nanMedian, nanMin, nanMax, nanPercentile } from '@/lib/math';
import { fmtDollar } from '@/lib/format';
import { segmentedControlStyle, THEME_FONTS } from '@/theme/chart';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';

interface PortfolioPosition {
  asset: string;
  notional: number;
}

type PortfolioBook = Record<string, PortfolioPosition[]>;
type StressViewMode = 'nominal' | 'percent';

function scenarioToPositions(name: string): PortfolioPosition[] {
  const scenario = PORTFOLIO_SCENARIOS[name as keyof typeof PORTFOLIO_SCENARIOS] || {};
  return Object.entries(scenario).map(([asset, notional]) => ({ asset, notional }));
}

function initialPortfolioBook(): PortfolioBook {
  return Object.fromEntries(
    Object.keys(PORTFOLIO_SCENARIOS).map((name) => [name, scenarioToPositions(name)]),
  );
}

export function StressTab() {
  const { eventReturns, assetMeta, scores, scoreCutoff, horizon, live, allLabels, activeEvents } = useDashboard();
  const [portfolioBook, setPortfolioBook] = useState<PortfolioBook>(() => initialPortfolioBook());
  const [selectedPortfolio, setSelectedPortfolio] = useState('Geopolitical Long');
  const [viewMode, setViewMode] = useState<StressViewMode>('nominal');

  const activeScores = useMemo(() => filterScoresByActiveEvents(scores, activeEvents), [activeEvents, scores]);
  const selectedEvents = useMemo(() => selectEvents(activeScores, scoreCutoff), [activeScores, scoreCutoff]);
  const positions = portfolioBook[selectedPortfolio] || [];
  const positionLabels = useMemo(() => positions.map((position) => position.asset), [positions]);
  const dayN = getEffectiveScoringDay(live, positionLabels);
  const displayDay = getLiveDisplayDay(live);
  const displayDate = getLiveDisplayDate(live);
  const displayEndDay = displayDay + horizon;

  const assetOptions = useMemo(
    () => allLabels.map((label) => ({ value: label, label: displayLabel(assetMeta[label], label) })),
    [allLabels, assetMeta],
  );

  const stressResults = useMemo(() => {
    if (selectedEvents.length === 0 || positions.length === 0) return [];

    const cleanedPositions = positions.filter((position) => position.asset && Number.isFinite(position.notional) && position.notional !== 0);
    const gross = cleanedPositions.reduce((sum, position) => sum + Math.abs(position.notional), 0);
    if (cleanedPositions.length === 0 || gross <= 0) return [];

    const results: { event: string; positions: { asset: string; notional: number; weight: number; ret: number; pnl: number }[]; totalPnl: number; totalPct: number }[] = [];

    for (const eventName of selectedEvents) {
      let totalPnl = 0;
      let totalPct = 0;
      const eventPositions: { asset: string; notional: number; weight: number; ret: number; pnl: number }[] = [];

      for (const position of cleanedPositions) {
        const atDn = poiRet(eventReturns, position.asset, eventName, dayN);
        const atFo = poiRet(eventReturns, position.asset, eventName, dayN + horizon);
        if (Number.isNaN(atDn) || Number.isNaN(atFo)) continue;

        const ret = atFo - atDn;
        const pnl = (position.notional * ret) / 100;
        const weight = Math.abs(position.notional) / gross;
        totalPnl += pnl;
        totalPct += weight * ret;
        eventPositions.push({ asset: position.asset, notional: position.notional, weight, ret, pnl });
      }

      results.push({ event: eventName, positions: eventPositions, totalPnl, totalPct });
    }

    results.sort((left, right) => {
      const leftMetric = viewMode === 'nominal' ? left.totalPnl : left.totalPct;
      const rightMetric = viewMode === 'nominal' ? right.totalPnl : right.totalPct;
      return leftMetric - rightMetric;
    });
    return results;
  }, [dayN, eventReturns, horizon, positions, selectedEvents, viewMode]);

  const series = stressResults.map((result) => (viewMode === 'nominal' ? result.totalPnl : result.totalPct));
  const stats = useMemo(() => ({
    median: nanMedian(series),
    mean: nanMean(series),
    worst: nanMin(series),
    best: nanMax(series),
    p25: nanPercentile(series, 25),
    p75: nanPercentile(series, 75),
    n: series.length,
  }), [series]);

  const chartData = useMemo(
    () => stressResults.map((result) => ({
      name: result.event.length > 14 ? `${result.event.slice(0, 14)}...` : result.event,
      value: viewMode === 'nominal' ? Math.round(result.totalPnl) : result.totalPct,
    })),
    [stressResults, viewMode],
  );

  const portfolioOptions = useMemo(
    () => Object.keys(portfolioBook).map((name) => ({ label: name, value: name })),
    [portfolioBook],
  );

  const grossNotional = useMemo(
    () => positions.reduce((sum, position) => sum + Math.abs(position.notional || 0), 0),
    [positions],
  );

  function updatePositions(next: PortfolioPosition[]) {
    setPortfolioBook((current) => ({ ...current, [selectedPortfolio]: next }));
  }

  function updatePosition(index: number, patch: Partial<PortfolioPosition>) {
    updatePositions(positions.map((position, currentIndex) => (
      currentIndex === index ? { ...position, ...patch } : position
    )));
  }

  function removePosition(index: number) {
    updatePositions(positions.filter((_, currentIndex) => currentIndex !== index));
  }

  function addPortfolio() {
    const baseName = 'Custom Portfolio';
    let suffix = 1;
    let name = `${baseName} ${suffix}`;
    while (portfolioBook[name]) {
      suffix += 1;
      name = `${baseName} ${suffix}`;
    }
    setPortfolioBook((current) => ({ ...current, [name]: [] }));
    setSelectedPortfolio(name);
  }

  function resetToPreset() {
    if (PORTFOLIO_SCENARIOS[selectedPortfolio as keyof typeof PORTFOLIO_SCENARIOS]) {
      updatePositions(scenarioToPositions(selectedPortfolio));
    } else {
      updatePositions([]);
    }
  }

  const fmtValue = (value: number) => viewMode === 'nominal' ? fmtDollar(value) : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ChartCard
        title="Portfolio Stress Test"
        subtitle={`${selectedPortfolio} | ${selectedEvents.length} analogues | live D+${displayDay}${displayDate ? ` (${displayDate})` : ''} -> D+${displayEndDay}`}
        controls={
          <div className="flex items-center gap-2">
            <Select label="Portfolio" value={selectedPortfolio} onChange={setSelectedPortfolio} options={portfolioOptions} />
            <div className="flex">
              {(['nominal', 'percent'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className="px-2.5 py-1 text-[10px] font-mono tracking-wide uppercase border-y border-r first:border-l first:rounded-l-sm last:rounded-r-sm transition-all"
                  style={segmentedControlStyle(viewMode === mode)}
                >
                  {mode === 'nominal' ? 'Nominal' : '% View'}
                </button>
              ))}
            </div>
          </div>
        }
      >
        <div className="p-4 border-b border-border/30 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-2xs text-text-dim">Portfolio composition</div>
            <div className="flex items-center gap-2">
              <Button size="xs" variant="secondary" onClick={resetToPreset}>Reset Current</Button>
              <Button size="xs" variant="secondary" onClick={() => updatePositions([...positions, { asset: allLabels[0] || '', notional: 100000 }])}>Add Position</Button>
              <Button size="xs" variant="secondary" onClick={addPortfolio}>New Portfolio</Button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 text-2xs text-text-dim">
            <div>Positions: {positions.length}</div>
            <div>Gross: {fmtDollar(grossNotional)}</div>
            <div>View: {viewMode === 'nominal' ? 'Nominal PnL' : 'Weighted % return'}</div>
            <div>Live basis: D+{dayN}</div>
          </div>
          <div className="space-y-2">
            {positions.length === 0 ? (
              <div className="text-2xs text-text-dim border border-border/40 bg-bg-cell/30 px-3 py-3 rounded-sm">
                This portfolio is empty. Add positions above to create a new custom book directly in the dashboard.
              </div>
            ) : positions.map((position, index) => (
              <div key={`${position.asset}-${index}`} className="grid grid-cols-[minmax(0,1fr)_140px_90px] gap-2 items-center">
                <Select
                  label=""
                  value={position.asset}
                  onChange={(value) => updatePosition(index, { asset: value })}
                  options={assetOptions}
                />
                <input
                  type="number"
                  value={position.notional}
                  onChange={(event) => updatePosition(index, { notional: Number(event.target.value) || 0 })}
                  className="bg-bg-cell border border-border/60 text-xs text-text-primary px-2 py-1 rounded-sm focus:outline-none"
                />
                <Button size="xs" variant="danger" onClick={() => removePosition(index)}>Remove</Button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-5 gap-2 p-4 bg-bg-cell/30">
          <StatBox label="Median" value={fmtValue(stats.median)} color={stats.median >= 0 ? CHART_THEME.up : CHART_THEME.down} />
          <StatBox label="Mean" value={fmtValue(stats.mean)} color={CHART_THEME.textSecondary} />
          <StatBox label="Best" value={fmtValue(stats.best)} color={CHART_THEME.up} />
          <StatBox label="Worst" value={fmtValue(stats.worst)} color={CHART_THEME.down} />
          <StatBox label="Scenarios" value={stats.n} color={CHART_THEME.textSecondary} />
        </div>

        <div className="h-[320px] p-4 border-t border-border/30">
          {chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-text-dim text-xs">
              No data available. Run analogue matching and keep at least one valid portfolio position.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 40, left: 60 }}>
                <CartesianGrid stroke={CHART_THEME.grid} strokeDasharray="2 8" />
                <XAxis dataKey="name" stroke={CHART_THEME.axisLine} tick={{ fontSize: 8, fill: CHART_THEME.textMuted, fontFamily: THEME_FONTS.mono }} angle={-35} textAnchor="end" />
                <YAxis stroke={CHART_THEME.axisLine} tick={{ fontSize: 10, fill: CHART_THEME.textMuted, fontFamily: THEME_FONTS.mono }} tickFormatter={(value: number) => fmtValue(value)} width={72} />
                <Tooltip
                  contentStyle={{
                    background: CHART_THEME.tooltipBg,
                    border: `1px solid ${CHART_THEME.gridBright}`,
                    borderRadius: 4,
                    fontSize: 11,
                    fontFamily: THEME_FONTS.mono,
                    color: CHART_THEME.textPrimary,
                  }}
                  formatter={(value: any) => [fmtValue(Number(value)), viewMode === 'nominal' ? 'PnL' : 'Return']}
                />
                <ReferenceLine y={0} stroke={CHART_THEME.zero} />
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                  {chartData.map((point, index) => (
                    <Cell key={index} fill={point.value >= 0 ? CHART_THEME.up : CHART_THEME.down} fillOpacity={0.75} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {stressResults.length > 0 && (
          <div className="border-t border-border/30">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-2xs font-mono">
                <thead>
                  <tr className="bg-bg-cell/80 border-b border-border/40">
                    {['#', 'Event', viewMode === 'nominal' ? 'Total PnL' : 'Total Return', 'Breakdown'].map((header) => (
                      <th key={header} className="px-3 py-2 text-text-muted font-medium text-left whitespace-nowrap">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stressResults.map((result, index) => {
                    const totalValue = viewMode === 'nominal' ? result.totalPnl : result.totalPct;
                    return (
                      <tr key={result.event} className="border-b border-border/20 hover:bg-bg-cell/40 transition-colors">
                        <td className="px-3 py-2 text-text-dim">{index + 1}</td>
                        <td className="px-3 py-2 text-text-primary font-medium">{result.event}</td>
                        <td className={`px-3 py-2 font-semibold ${totalValue >= 0 ? 'text-up' : 'text-down'}`}>
                          {fmtValue(totalValue)}
                        </td>
                        <td className="px-3 py-2 text-text-dim">
                          {result.positions.length === 0
                            ? 'No overlapping portfolio data'
                            : result.positions.map((position) => {
                              const value = viewMode === 'nominal' ? position.pnl : position.ret;
                              const prefix = viewMode === 'nominal' ? fmtDollar(value) : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
                              return `${displayLabel(assetMeta[position.asset], position.asset)}: ${prefix}`;
                            }).join(' | ')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <BottomDescription>
          Stress runs the current portfolio through each selected analogue event from the current live state to D+{displayEndDay}. Use nominal view for dollar PnL and percentage view for normalized portfolio-return terms.
        </BottomDescription>
      </ChartCard>
    </div>
  );
}
