'use client';
import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Select, StatBox } from '@/components/ui/ChartCard';
import { poiRet, displayLabel, unitLabel } from '@/engine/returns';
import { selectEvents } from '@/engine/similarity';
import { PORTFOLIO_SCENARIOS } from '@/config/engine';
import { nanMean, nanMedian, nanMin, nanMax, nanPercentile } from '@/lib/math';
import { fmtDollar, fmtReturn } from '@/lib/format';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';

const AX_TICK = '#a1a1b0';
const AX_LINE = '#2a2a3a';
const GRID_CLR = '#1e1e22';

export function StressTab() {
  const { eventReturns, assetMeta, scores, scoreCutoff, horizon, live } = useDashboard();
  const [scenarioName, setScenarioName] = useState('Geopolitical Long');

  const scenarioOptions = useMemo(
    () => Object.keys(PORTFOLIO_SCENARIOS).map(n => ({ label: n, value: n })),
    []
  );

  const selectedEvents = useMemo(() => selectEvents(scores, scoreCutoff), [scores, scoreCutoff]);
  const dayN = live.dayN ?? 0;

  // Stress test: for each analogue event, compute portfolio PnL
  const stressResults = useMemo(() => {
    const scenario = PORTFOLIO_SCENARIOS[scenarioName as keyof typeof PORTFOLIO_SCENARIOS];
    if (!scenario || selectedEvents.length === 0) return [];

    const results: { event: string; positions: { asset: string; notional: number; ret: number; pnl: number }[]; totalPnl: number }[] = [];

    for (const evtName of selectedEvents) {
      let totalPnl = 0;
      const positions: { asset: string; notional: number; ret: number; pnl: number }[] = [];

      for (const [assetLabel, notional] of Object.entries(scenario)) {
        const atDn = poiRet(eventReturns, assetLabel, evtName, dayN);
        const atFo = poiRet(eventReturns, assetLabel, evtName, dayN + horizon);
        if (isNaN(atDn) || isNaN(atFo)) continue;
        const ret = atFo - atDn; // percent or bp change
        const pnl = (notional * ret) / 100;
        totalPnl += pnl;
        positions.push({ asset: assetLabel, notional, ret, pnl });
      }

      results.push({ event: evtName, positions, totalPnl });
    }

    results.sort((a, b) => a.totalPnl - b.totalPnl);
    return results;
  }, [scenarioName, selectedEvents, eventReturns, dayN, horizon]);

  const pnls = stressResults.map(r => r.totalPnl);
  const stats = useMemo(() => ({
    median: nanMedian(pnls),
    mean: nanMean(pnls),
    worst: nanMin(pnls),
    best: nanMax(pnls),
    p25: nanPercentile(pnls, 25),
    p75: nanPercentile(pnls, 75),
    n: pnls.length,
  }), [pnls]);

  const chartData = stressResults.map(r => ({
    name: r.event.length > 14 ? r.event.slice(0, 14) + '…' : r.event,
    pnl: Math.round(r.totalPnl),
  }));

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ChartCard
        title="Portfolio Stress Test"
        subtitle={`${scenarioName} · ${selectedEvents.length} analogues · D+${dayN} → D+${dayN + horizon}`}
        controls={
          <Select label="" value={scenarioName} onChange={setScenarioName} options={scenarioOptions} />
        }
      >
        {/* Summary Stats */}
        <div className="grid grid-cols-5 gap-2 p-4 bg-bg-cell/30">
          <StatBox
            label="Median PnL"
            value={fmtDollar(stats.median)}
            color={stats.median >= 0 ? '#22c55e' : '#ef4444'}
          />
          <StatBox
            label="Mean PnL"
            value={fmtDollar(stats.mean)}
            color="#a1a1b0"
          />
          <StatBox
            label="Best"
            value={fmtDollar(stats.best)}
            color="#22c55e"
          />
          <StatBox
            label="Worst"
            value={fmtDollar(stats.worst)}
            color="#ef4444"
          />
          <StatBox
            label="Scenarios"
            value={stats.n}
            color="#a1a1b0"
          />
        </div>

        {/* Bar Chart */}
        <div className="h-[320px] p-4 border-t border-border/30">
          {chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-text-dim text-xs">
              No data — run analogue matching first
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 40, left: 60 }}>
                <CartesianGrid stroke={GRID_CLR} strokeDasharray="2 8" />
                <XAxis
                  dataKey="name"
                  stroke={AX_LINE}
                  tick={{ fontSize: 8, fill: AX_TICK, fontFamily: 'JetBrains Mono' }}
                  angle={-35}
                  textAnchor="end"
                />
                <YAxis
                  stroke={AX_LINE}
                  tick={{ fontSize: 10, fill: AX_TICK, fontFamily: 'JetBrains Mono' }}
                  tickFormatter={(v: number) => fmtDollar(v)}
                  width={56}
                />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(12,12,18,0.98)',
                    border: '1px solid #2a2a3a',
                    borderRadius: 4,
                    fontSize: 11,
                    fontFamily: 'JetBrains Mono'
                  }}
                  formatter={(v: any) => [fmtDollar(Number(v)), 'PnL']}
                />
                <ReferenceLine y={0} stroke="#3a3a4e" />
                <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.pnl >= 0 ? '#22c55e' : '#ef4444'} fillOpacity={0.75} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Results Table */}
        {stressResults.length > 0 && (
          <div className="border-t border-border/30">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-2xs font-mono">
                <thead>
                  <tr className="bg-bg-cell/80 border-b border-border/40">
                    {['#', 'Event', 'Total PnL', 'Positions'].map(h => (
                      <th key={h} className="px-3 py-2 text-text-muted font-medium text-left whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stressResults.map((r, i) => (
                    <tr key={r.event} className="border-b border-border/20 hover:bg-bg-cell/40 transition-colors">
                      <td className="px-3 py-2 text-text-dim">{i + 1}</td>
                      <td className="px-3 py-2 text-text-primary font-medium">{r.event}</td>
                      <td className={`px-3 py-2 font-semibold ${r.totalPnl >= 0 ? 'text-up' : 'text-down'}`}>
                        {fmtDollar(r.totalPnl)}
                      </td>
                      <td className="px-3 py-2 text-text-dim">
                        {r.positions.map(p => `${p.asset}: ${fmtDollar(p.pnl)}`).join('  |  ')}
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
