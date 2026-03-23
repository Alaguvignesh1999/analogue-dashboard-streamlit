'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { Badge, ChartCard, Select, StatBox } from '@/components/ui/ChartCard';
import { DiagnosticsStrip } from '@/components/ui/DiagnosticsStrip';
import { displayLabel, unitLabel } from '@/engine/returns';
import { getEffectiveScoringDate, getEffectiveScoringDay, getLiveDisplayDay } from '@/engine/live';
import { filterScoresByActiveEvents, selectEvents } from '@/engine/similarity';
import {
  buildDotPlot,
  buildIdeaCorrelationMatrix,
  buildLiveDeviationSeries,
  computePerHorizonStats,
  computeTradeRows,
} from '@/engine/trades';
import { ALL_ASSETS_OPTION, getGroupLabels, groupOptionsFromData } from '@/config/assets';
import { fmtReturn } from '@/lib/format';
import { nanMedian } from '@/lib/math';
import {
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const AX_TICK = '#8a8a9a';
const AX_LINE = '#2a2a3a';
const GRID = '#1e1e22';
const POS = '#22c55e';
const NEG = '#ef4444';
const LIVE = '#ffab40';
const MED = '#00d4aa';
const HORIZON_CHOICES = [
  { label: '+1W', offset: 5 },
  { label: '+2W', offset: 10 },
  { label: '+1M', offset: 21 },
  { label: '+2M', offset: 42 },
  { label: '+3M', offset: 63 },
];

function heatColor(value: number): string {
  if (Number.isNaN(value)) return 'rgba(36,36,46,0.45)';
  const intensity = Math.min(Math.abs(value), 1);
  if (value >= 0) return `rgba(34,197,94,${0.12 + intensity * 0.38})`;
  return `rgba(239,68,68,${0.12 + intensity * 0.38})`;
}

function corrLabel(value: number): string {
  if (Number.isNaN(value)) return '--';
  return value.toFixed(2);
}

export function DetailTab() {
  const {
    eventReturns,
    assetMeta,
    allLabels,
    allClasses,
    scores,
    scoreCutoff,
    horizon,
    live,
    activeEvents,
    selectedDetailAsset,
    selectedDetailHorizon,
    setDetailContext,
  } = useDashboard();

  const [group, setGroup] = useState(ALL_ASSETS_OPTION);
  const [selectedAsset, setSelectedAsset] = useState(selectedDetailAsset || 'Brent Futures');
  const [selectedHorizon, setSelectedHorizon] = useState(selectedDetailHorizon ?? horizon);

  useEffect(() => {
    if (selectedDetailAsset) {
      setSelectedAsset(selectedDetailAsset);
    }
  }, [selectedDetailAsset]);

  useEffect(() => {
    if (selectedDetailHorizon) {
      setSelectedHorizon(selectedDetailHorizon);
    }
  }, [selectedDetailHorizon]);

  const activeScores = useMemo(() => filterScoresByActiveEvents(scores, activeEvents), [activeEvents, scores]);
  const selectedEvents = useMemo(() => selectEvents(activeScores, scoreCutoff), [activeScores, scoreCutoff]);
  const labels = useMemo(() => getGroupLabels(group, allLabels, assetMeta), [group, allLabels, assetMeta]);
  const groupAssets = useMemo(
    () => labels.filter((label) => assetMeta[label]),
    [labels, assetMeta],
  );

  useEffect(() => {
    if (!groupAssets.includes(selectedAsset) && groupAssets.length > 0) {
      setSelectedAsset(groupAssets[0]);
    }
  }, [groupAssets, selectedAsset]);

  useEffect(() => {
    setDetailContext({
      selectedDetailAsset: selectedAsset,
      selectedDetailHorizon: selectedHorizon,
      selectedTradeIdea: selectedAsset,
    });
  }, [selectedAsset, selectedHorizon, setDetailContext]);

  const effectiveDay = getEffectiveScoringDay(live, [selectedAsset]);
  const effectiveDate = getEffectiveScoringDate(live, [selectedAsset]);
  const displayDay = getLiveDisplayDay(live);
  const meta = assetMeta[selectedAsset];
  const isRates = meta?.is_rates_bp || false;
  const unit = unitLabel(meta);

  const tradeRows = useMemo(
    () => computeTradeRows(groupAssets, eventReturns, assetMeta, selectedEvents, effectiveDay, selectedHorizon, live),
    [groupAssets, eventReturns, assetMeta, selectedEvents, effectiveDay, selectedHorizon, live],
  );
  const currentTrade = useMemo(
    () => tradeRows.find((row) => row.lbl === selectedAsset) ?? null,
    [selectedAsset, tradeRows],
  );

  const horizonStats = useMemo(() => {
    const horizons = HORIZON_CHOICES
      .map((item) => ({ ...item, offset: effectiveDay + item.offset }))
      .filter((item) => item.offset > effectiveDay);
    return computePerHorizonStats(selectedAsset, selectedEvents, effectiveDay, eventReturns, horizons);
  }, [selectedAsset, selectedEvents, effectiveDay, eventReturns]);

  const dotPlot = useMemo(
    () => buildDotPlot(selectedAsset, selectedEvents, effectiveDay, effectiveDay + selectedHorizon, eventReturns),
    [selectedAsset, selectedEvents, effectiveDay, selectedHorizon, eventReturns],
  );

  const deviationSeries = useMemo(
    () => buildLiveDeviationSeries(selectedAsset, selectedEvents, displayDay, eventReturns, live),
    [selectedAsset, selectedEvents, displayDay, eventReturns, live],
  );

  const correlationMatrix = useMemo(
    () => buildIdeaCorrelationMatrix(tradeRows, selectedEvents, effectiveDay, selectedHorizon, eventReturns),
    [tradeRows, selectedEvents, effectiveDay, selectedHorizon, eventReturns],
  );

  const explanation = useMemo(() => {
    if (!currentTrade) return null;
    const signText = currentTrade.med >= 0 ? 'upside' : 'downside';
    const coverage = currentTrade.nTotal > 0 ? `${Math.round((currentTrade.n / currentTrade.nTotal) * 100)}%` : '--';
    const percentile = Number.isNaN(currentTrade.livePctile) ? 'no live percentile yet' : `${currentTrade.livePctile.toFixed(0)}th percentile`;
    return `This idea is showing ${signText} over the next ${selectedHorizon} trading days. The analogue set has ${coverage} usable forward coverage for this asset, live is currently at the ${percentile}, and the trade quality is strongest when Sharpe, Sortino, and hit rate point in the same direction.`;
  }, [currentTrade, selectedHorizon]);

  const groupOptions = useMemo(() => groupOptionsFromData(allClasses), [allClasses]);
  const assetOptions = useMemo(
    () => groupAssets.map((label) => ({ value: label, label: displayLabel(assetMeta[label], label) })),
    [groupAssets, assetMeta],
  );
  const horizonOptions = useMemo(
    () => HORIZON_CHOICES.map((item) => ({ value: item.offset.toString(), label: `${item.label} (${item.offset}d)` })),
    [],
  );

  const correlationLabels = correlationMatrix?.labels || [];
  const correlationGrid = correlationMatrix?.matrix || [];

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ChartCard
        title={`Detail - ${displayLabel(meta, selectedAsset)}`}
        subtitle={`Display D+${displayDay} | effective D+${effectiveDay}${effectiveDate ? ` (${effectiveDate})` : ''} | forward +${selectedHorizon}d`}
        controls={
          <div className="flex items-center gap-2 flex-wrap">
            <Select label="" value={group} onChange={setGroup} options={groupOptions} />
            <Select label="" value={selectedAsset} onChange={setSelectedAsset} options={assetOptions} />
            <Select label="" value={selectedHorizon.toString()} onChange={(value) => setSelectedHorizon(parseInt(value, 10))} options={horizonOptions} />
          </div>
        }
      >
        <DiagnosticsStrip
          live={live}
          labels={[selectedAsset]}
          scoringMode="live-sim"
          extra={<span>Detail stays synced to the same analysis day and trade context as Trade Ideas.</span>}
        />

        {selectedEvents.length === 0 ? (
          <div className="py-12 text-center text-text-dim text-sm">
            No analogues selected. Adjust cutoff or rerun the analogue engine.
          </div>
        ) : !currentTrade ? (
          <div className="py-12 text-center text-text-dim text-sm">
            This asset does not have enough valid analogue coverage at the selected horizon.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="px-4 py-3 text-2xs text-text-dim border-b border-border/40 bg-bg-cell/20">
              Detail is the drill-down for a single trade idea. Read it top-down: headline edge, horizon-by-horizon stability, analogue-by-analogue spread, then live deviation and correlation crowding.
            </div>

            <div className="px-4 pt-4 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
              <StatBox label="Median" value={fmtReturn(currentTrade.med, isRates)} color={currentTrade.med >= 0 ? POS : NEG} />
              <StatBox label="Mean" value={fmtReturn(currentTrade.mean, isRates)} color={MED} />
              <StatBox label="Hit Rate" value={`${(currentTrade.hitRate * 100).toFixed(0)}%`} color={currentTrade.hitRate >= 0.6 ? POS : currentTrade.hitRate >= 0.5 ? '#fbbf24' : NEG} />
              <StatBox label="Sharpe" value={currentTrade.sharpe.toFixed(2)} color={currentTrade.sharpe > 0 ? POS : NEG} />
              <StatBox label="Sortino" value={currentTrade.sortino.toFixed(2)} color={currentTrade.sortino > 0 ? POS : NEG} />
              <StatBox label="Worst" value={fmtReturn(currentTrade.worst, isRates)} color={NEG} />
              <StatBox label="Gap" value={Number.isNaN(currentTrade.liveGap) ? '--' : fmtReturn(currentTrade.liveGap, isRates)} color={Number.isNaN(currentTrade.liveGap) ? '#8a8a9a' : currentTrade.liveGap >= 0 ? POS : NEG} />
              <StatBox label="Pctile" value={Number.isNaN(currentTrade.livePctile) ? '--' : `${currentTrade.livePctile.toFixed(0)}th`} color="#ffffff" />
            </div>

            <div className="px-4 flex items-center gap-2 flex-wrap">
              <Badge color={currentTrade.dir === 'LONG' ? 'green' : 'red'}>{currentTrade.dir}</Badge>
              <Badge color="teal">{currentTrade.stars}</Badge>
              <Badge color="dim">{currentTrade.n}/{currentTrade.nTotal} events</Badge>
              <Badge color="dim">Unit: {unit}</Badge>
            </div>

            {explanation && (
              <div className="mx-4 px-3 py-3 text-2xs text-text-secondary border border-border/40 bg-bg-cell/30 rounded-sm">
                {explanation}
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 px-4">
              <ChartCard title="Forward Stats By Horizon" subtitle="Median/IQR and risk quality across horizons">
                {horizonStats.length === 0 ? (
                  <div className="py-12 text-center text-text-dim text-xs">No horizon stats available for this asset.</div>
                ) : (
                  <div className="space-y-3">
                    <div className="h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={horizonStats} margin={{ top: 12, right: 12, bottom: 18, left: 8 }}>
                          <CartesianGrid stroke={GRID} strokeDasharray="2 8" />
                          <XAxis dataKey="horizonLabel" stroke={AX_LINE} tick={{ fontSize: 10, fill: AX_TICK, fontFamily: 'JetBrains Mono' }} />
                          <YAxis stroke={AX_LINE} tick={{ fontSize: 10, fill: AX_TICK, fontFamily: 'JetBrains Mono' }} tickFormatter={(value: number) => fmtReturn(value, isRates)} width={60} />
                          <Tooltip
                            contentStyle={{ background: 'rgba(12,12,18,0.96)', border: '1px solid #2a2a3a', borderRadius: 2, fontSize: 11, fontFamily: 'JetBrains Mono' }}
                            formatter={(value: unknown, _name, entry: any) => [fmtReturn(Number(value), isRates), entry?.dataKey]}
                          />
                          <ReferenceLine y={0} stroke="#3a3a4e" />
                          <Bar dataKey="med" radius={[3, 3, 0, 0]}>
                            {horizonStats.map((row) => (
                              <Cell key={row.horizonLabel} fill={row.med >= 0 ? POS : NEG} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-2xs font-mono">
                        <thead>
                          <tr className="bg-bg-cell border-b border-border/40">
                            {['H', 'Median', 'Q1', 'Q3', 'Hit', 'Sharpe', 'Sortino', 'N'].map((header) => (
                              <th key={header} className="px-2 py-1.5 text-center text-text-muted font-medium whitespace-nowrap">{header}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {horizonStats.map((row) => (
                            <tr key={row.horizonLabel} className="border-b border-border/20">
                              <td className="px-2 py-1.5 text-center text-text-secondary">{row.horizonLabel}</td>
                              <td className={`px-2 py-1.5 text-center ${row.med >= 0 ? 'text-up' : 'text-down'}`}>{fmtReturn(row.med, isRates)}</td>
                              <td className="px-2 py-1.5 text-center text-text-dim">{fmtReturn(row.q1, isRates)}</td>
                              <td className="px-2 py-1.5 text-center text-text-dim">{fmtReturn(row.q3, isRates)}</td>
                              <td className="px-2 py-1.5 text-center text-text-dim">{(row.hit * 100).toFixed(0)}%</td>
                              <td className="px-2 py-1.5 text-center text-text-dim">{row.sharpe.toFixed(2)}</td>
                              <td className="px-2 py-1.5 text-center text-text-dim">{row.sortino.toFixed(2)}</td>
                              <td className="px-2 py-1.5 text-center text-text-dim">{row.n}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </ChartCard>

              <ChartCard title="Per-Analogue Dot Plot" subtitle={`Forward return from D+${effectiveDay} to D+${effectiveDay + selectedHorizon}`}>
                {dotPlot.length === 0 ? (
                  <div className="py-12 text-center text-text-dim text-xs">Not enough analogue points for the selected horizon.</div>
                ) : (
                  <div className="space-y-3">
                    <div className="h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dotPlot} margin={{ top: 12, right: 12, bottom: 40, left: 8 }}>
                          <CartesianGrid stroke={GRID} strokeDasharray="2 8" />
                          <XAxis dataKey="event" stroke={AX_LINE} tick={{ fontSize: 9, fill: AX_TICK, fontFamily: 'JetBrains Mono' }} angle={-32} textAnchor="end" height={64} />
                          <YAxis stroke={AX_LINE} tick={{ fontSize: 10, fill: AX_TICK, fontFamily: 'JetBrains Mono' }} tickFormatter={(value: number) => fmtReturn(value, isRates)} width={60} />
                          <Tooltip
                            contentStyle={{ background: 'rgba(12,12,18,0.96)', border: '1px solid #2a2a3a', borderRadius: 2, fontSize: 11, fontFamily: 'JetBrains Mono' }}
                            formatter={(value: unknown) => [fmtReturn(Number(value), isRates), 'Forward']}
                          />
                          <ReferenceLine y={0} stroke="#3a3a4e" />
                          <ReferenceLine y={nanMedian(dotPlot.map((item) => item.value))} stroke={MED} strokeDasharray="4 4" />
                          <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                            {dotPlot.map((row) => (
                              <Cell key={row.event} fill={row.value >= 0 ? POS : NEG} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="text-2xs text-text-dim">
                      This shows the spread of analogue outcomes for the chosen horizon. Wide disagreement means the idea is real but less stable.
                    </div>
                  </div>
                )}
              </ChartCard>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 px-4">
              <ChartCard title="Live vs Analogue Deviation" subtitle="Historical median band vs current live path">
                {deviationSeries.length === 0 ? (
                  <div className="py-12 text-center text-text-dim text-xs">No live deviation series available.</div>
                ) : (
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={deviationSeries} margin={{ top: 12, right: 12, bottom: 18, left: 8 }}>
                        <CartesianGrid stroke={GRID} strokeDasharray="2 8" />
                        <XAxis dataKey="offset" stroke={AX_LINE} tick={{ fontSize: 10, fill: AX_TICK, fontFamily: 'JetBrains Mono' }} tickFormatter={(value) => `D+${value}`} />
                        <YAxis stroke={AX_LINE} tick={{ fontSize: 10, fill: AX_TICK, fontFamily: 'JetBrains Mono' }} tickFormatter={(value: number) => fmtReturn(value, isRates)} width={60} />
                        <Tooltip
                          contentStyle={{ background: 'rgba(12,12,18,0.96)', border: '1px solid #2a2a3a', borderRadius: 2, fontSize: 11, fontFamily: 'JetBrains Mono' }}
                          formatter={(value: unknown, label: string) => [value === null ? '--' : fmtReturn(Number(value), isRates), label]}
                          labelFormatter={(value) => `D+${value}`}
                        />
                        <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: AX_TICK }} />
                        <ReferenceLine y={0} stroke="#3a3a4e" />
                        <Line type="monotone" dataKey="p25" stroke="#4b5563" strokeDasharray="3 3" dot={false} name="P25" />
                        <Line type="monotone" dataKey="median" stroke={MED} strokeWidth={2} dot={false} name="Median" />
                        <Line type="monotone" dataKey="p75" stroke="#4b5563" strokeDasharray="3 3" dot={false} name="P75" />
                        <Line type="monotone" dataKey="live" stroke={LIVE} strokeWidth={2.5} dot={false} name="Live" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </ChartCard>

              <ChartCard title="Intra-Idea Correlation" subtitle="Avoid stacking trades that are effectively the same analogue expression">
                {!correlationMatrix ? (
                  <div className="py-12 text-center text-text-dim text-xs">
                    Need at least two well-covered trade ideas to compute crowding.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="border-collapse text-2xs font-mono min-w-full">
                      <thead>
                        <tr>
                          <th className="px-2 py-2 text-left text-text-muted border-b border-r border-border/50 bg-bg-cell/80 sticky left-0 z-10 min-w-[120px]">Idea</th>
                          {correlationLabels.map((label) => (
                            <th key={label} className="px-2 py-2 text-center text-text-muted border-b border-border/40 bg-bg-cell/80 min-w-[72px]">
                              {displayLabel(assetMeta[label], label).slice(0, 12)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {correlationLabels.map((rowLabel, rowIndex) => (
                          <tr key={rowLabel}>
                            <td className="px-2 py-2 text-text-secondary border-b border-r border-border/30 bg-bg-cell/40 sticky left-0 z-10">
                              {displayLabel(assetMeta[rowLabel], rowLabel).slice(0, 18)}
                            </td>
                            {correlationLabels.map((colLabel, colIndex) => {
                              const value = correlationGrid[rowIndex]?.[colIndex] ?? Number.NaN;
                              return (
                                <td
                                  key={colLabel}
                                  className="px-2 py-2 text-center border-b border-border/20"
                                  style={{ backgroundColor: heatColor(value) }}
                                >
                                  {rowIndex === colIndex
                                    ? '1.00'
                                    : Number.isNaN(value)
                                      ? '--'
                                      : corrLabel(value)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </ChartCard>
            </div>
          </div>
        )}
      </ChartCard>
    </div>
  );
}
