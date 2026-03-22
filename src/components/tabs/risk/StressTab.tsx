'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Select, StatBox, Button } from '@/components/ui/ChartCard';
import { poiRet, displayLabel } from '@/engine/returns';
import { getEffectiveScoringDate, getEffectiveScoringDay } from '@/engine/live';
import { selectEvents } from '@/engine/similarity';
import { PORTFOLIO_SCENARIOS } from '@/config/engine';
import { nanMean, nanMedian, nanMin, nanMax, nanPercentile } from '@/lib/math';
import { fmtDollar } from '@/lib/format';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';

const AX_TICK = '#a1a1b0';
const AX_LINE = '#2a2a3a';
const GRID_CLR = '#1e1e22';

interface PortfolioPosition {
  asset: string;
  notional: number;
}

function scenarioToPositions(name: string): PortfolioPosition[] {
  const scenario = PORTFOLIO_SCENARIOS[name as keyof typeof PORTFOLIO_SCENARIOS] || {};
  return Object.entries(scenario).map(([asset, notional]) => ({ asset, notional }));
}

export function StressTab() {
  const { eventReturns, assetMeta, scores, scoreCutoff, horizon, live, allLabels } = useDashboard();
  const [scenarioName, setScenarioName] = useState('Geopolitical Long');
  const [positions, setPositions] = useState<PortfolioPosition[]>(() => scenarioToPositions('Geopolitical Long'));

  const selectedEvents = useMemo(() => selectEvents(scores, scoreCutoff), [scores, scoreCutoff]);
  const positionLabels = useMemo(() => positions.map((position) => position.asset), [positions]);
  const dayN = getEffectiveScoringDay(live, positionLabels);
  const effectiveDate = getEffectiveScoringDate(live, positionLabels);

  useEffect(() => {
    setPositions(scenarioToPositions(scenarioName));
  }, [scenarioName]);

  const assetOptions = useMemo(
    () => allLabels.map((label) => ({ value: label, label: displayLabel(assetMeta[label], label) })),
    [allLabels, assetMeta],
  );

  const stressResults = useMemo(() => {
    if (selectedEvents.length === 0 || positions.length === 0) return [];

    const cleanedPositions = positions.filter((position) => position.asset && Number.isFinite(position.notional) && position.notional !== 0);
    const results: { event: string; positions: { asset: string; notional: number; ret: number; pnl: number }[]; totalPnl: number }[] = [];

    for (const eventName of selectedEvents) {
      let totalPnl = 0;
      const eventPositions: { asset: string; notional: number; ret: number; pnl: number }[] = [];

      for (const position of cleanedPositions) {
        const atDn = poiRet(eventReturns, position.asset, eventName, dayN);
        const atFo = poiRet(eventReturns, position.asset, eventName, dayN + horizon);
        if (Number.isNaN(atDn) || Number.isNaN(atFo)) continue;

        const ret = atFo - atDn;
        const pnl = (position.notional * ret) / 100;
        totalPnl += pnl;
        eventPositions.push({ asset: position.asset, notional: position.notional, ret, pnl });
      }

      results.push({ event: eventName, positions: eventPositions, totalPnl });
    }

    results.sort((left, right) => left.totalPnl - right.totalPnl);
    return results;
  }, [dayN, eventReturns, horizon, positions, selectedEvents]);

  const pnls = stressResults.map((result) => result.totalPnl);
  const stats = useMemo(() => ({
    median: nanMedian(pnls),
    mean: nanMean(pnls),
    worst: nanMin(pnls),
    best: nanMax(pnls),
    p25: nanPercentile(pnls, 25),
    p75: nanPercentile(pnls, 75),
    n: pnls.length,
  }), [pnls]);

  const chartData = useMemo(
    () => stressResults.map((result) => ({
      name: result.event.length > 14 ? `${result.event.slice(0, 14)}...` : result.event,
      pnl: Math.round(result.totalPnl),
    })),
    [stressResults],
  );

  const scenarioOptions = useMemo(
    () => Object.keys(PORTFOLIO_SCENARIOS).map((name) => ({ label: name, value: name })),
    [],
  );

  const grossNotional = useMemo(
    () => positions.reduce((sum, position) => sum + Math.abs(position.notional || 0), 0),
    [positions],
  );

  function updatePosition(index: number, patch: Partial<PortfolioPosition>) {
    setPositions((current) => current.map((position, currentIndex) => (
      currentIndex === index ? { ...position, ...patch } : position
    )));
  }

  function removePosition(index: number) {
    setPositions((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ChartCard
        title="Portfolio Stress Test"
        subtitle={`${scenarioName} · ${selectedEvents.length} analogues · effective D+${dayN}${effectiveDate ? ` (${effectiveDate})` : ''} -> D+${dayN + horizon}`}
        controls={<Select label="Preset" value={scenarioName} onChange={setScenarioName} options={scenarioOptions} />}
      >
        <div className="px-4 py-3 text-2xs text-text-dim border-b border-border/40 bg-bg-cell/20">
          Stress runs the current portfolio through each selected analogue event and shows the distribution of total PnL. Edit the basket below to test a custom portfolio without changing the shared presets.
        </div>

        <div className="p-4 border-b border-border/30 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-2xs text-text-dim">Portfolio composition</div>
            <div className="flex items-center gap-2">
              <Button size="xs" variant="secondary" onClick={() => setPositions(scenarioToPositions(scenarioName))}>Reset To Preset</Button>
              <Button size="xs" variant="secondary" onClick={() => setPositions((current) => [...current, { asset: allLabels[0] || '', notional: 100000 }])}>Add Position</Button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 text-2xs text-text-dim">
            <div>Positions: {positions.length}</div>
            <div>Gross: {fmtDollar(grossNotional)}</div>
            <div>Scenario: {scenarioName}</div>
            <div>Live basis: D+{dayN}</div>
          </div>
          <div className="space-y-2">
            {positions.map((position, index) => (
              <div key={`${position.asset}-${index}`} className="grid grid-cols-[minmax(0,1fr)_140px_80px] gap-2 items-center">
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
                  className="bg-bg-cell border border-border/60 text-xs text-text-primary px-2 py-1 rounded-sm focus:outline-none focus:border-accent-teal/40"
                />
                <Button size="xs" variant="danger" onClick={() => removePosition(index)}>Remove</Button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-5 gap-2 p-4 bg-bg-cell/30">
          <StatBox label="Median PnL" value={fmtDollar(stats.median)} color={stats.median >= 0 ? '#22c55e' : '#ef4444'} />
          <StatBox label="Mean PnL" value={fmtDollar(stats.mean)} color="#a1a1b0" />
          <StatBox label="Best" value={fmtDollar(stats.best)} color="#22c55e" />
          <StatBox label="Worst" value={fmtDollar(stats.worst)} color="#ef4444" />
          <StatBox label="Scenarios" value={stats.n} color="#a1a1b0" />
        </div>

        <div className="h-[320px] p-4 border-t border-border/30">
          {chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-text-dim text-xs">
              No data available. Run analogue matching and keep at least one valid portfolio position.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 40, left: 60 }}>
                <CartesianGrid stroke={GRID_CLR} strokeDasharray="2 8" />
                <XAxis dataKey="name" stroke={AX_LINE} tick={{ fontSize: 8, fill: AX_TICK, fontFamily: 'JetBrains Mono' }} angle={-35} textAnchor="end" />
                <YAxis stroke={AX_LINE} tick={{ fontSize: 10, fill: AX_TICK, fontFamily: 'JetBrains Mono' }} tickFormatter={(value: number) => fmtDollar(value)} width={56} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(12,12,18,0.98)',
                    border: '1px solid #2a2a3a',
                    borderRadius: 4,
                    fontSize: 11,
                    fontFamily: 'JetBrains Mono',
                  }}
                  formatter={(value: any) => [fmtDollar(Number(value)), 'PnL']}
                />
                <ReferenceLine y={0} stroke="#3a3a4e" />
                <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                  {chartData.map((point, index) => (
                    <Cell key={index} fill={point.pnl >= 0 ? '#22c55e' : '#ef4444'} fillOpacity={0.75} />
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
                    {['#', 'Event', 'Total PnL', 'Positions'].map((header) => (
                      <th key={header} className="px-3 py-2 text-text-muted font-medium text-left whitespace-nowrap">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stressResults.map((result, index) => (
                    <tr key={result.event} className="border-b border-border/20 hover:bg-bg-cell/40 transition-colors">
                      <td className="px-3 py-2 text-text-dim">{index + 1}</td>
                      <td className="px-3 py-2 text-text-primary font-medium">{result.event}</td>
                      <td className={`px-3 py-2 font-semibold ${result.totalPnl >= 0 ? 'text-up' : 'text-down'}`}>
                        {fmtDollar(result.totalPnl)}
                      </td>
                      <td className="px-3 py-2 text-text-dim">
                        {result.positions.length === 0
                          ? 'No overlapping portfolio data'
                          : result.positions.map((position) => `${displayLabel(assetMeta[position.asset], position.asset)}: ${fmtDollar(position.pnl)}`).join(' | ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </ChartCard>
    </div>
  );
}
