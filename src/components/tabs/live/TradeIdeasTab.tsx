'use client';

import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { BottomDescription, ChartCard, Select, Badge } from '@/components/ui/ChartCard';
import { DiagnosticsStrip } from '@/components/ui/DiagnosticsStrip';
import { displayLabel } from '@/engine/returns';
import { getEffectiveScoringDay, getLiveDiagnosticsSummary, getLiveDisplayDay, getLiveDisplayDate } from '@/engine/live';
import { filterScoresByActiveEvents, selectEvents } from '@/engine/similarity';
import { computeTradeRows } from '@/engine/trades';
import { fmtReturn } from '@/lib/format';
import { ALL_ASSETS_OPTION, getGroupLabels, groupOptionsFromData } from '@/config/assets';
import { alphaThemeColor } from '@/theme/chart';

function hitRateClass(hitRate: number): string {
  if (hitRate >= 0.75) return 'text-accent-blue';
  if (hitRate >= 0.6) return 'text-up';
  if (hitRate >= 0.5) return 'text-accent-amber';
  return 'text-down';
}

function moveClass(value: number, dir: 'LONG' | 'SHORT'): string {
  const favorable = dir === 'LONG' ? value >= 0 : value <= 0;
  return favorable ? 'text-up' : 'text-down';
}

function gapClass(value: number): string {
  if (Number.isNaN(value)) return 'text-text-dim';
  if (value >= 0) return 'text-up';
  if (value >= -0.25) return 'text-accent-amber';
  return 'text-down';
}

export function TradeIdeasTab() {
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
    activeTab,
    selectedTradeIdea,
    setDetailContext,
    setActiveGroup,
    setActiveTab,
  } = useDashboard();

  const [group, setGroup] = useState(ALL_ASSETS_OPTION);

  const activeScores = useMemo(() => filterScoresByActiveEvents(scores, activeEvents), [activeEvents, scores]);
  const selectedEvents = useMemo(() => selectEvents(activeScores, scoreCutoff), [activeScores, scoreCutoff]);
  const labels = useMemo(
    () => getGroupLabels(group, allLabels, assetMeta),
    [group, allLabels, assetMeta],
  );
  const dayN = getEffectiveScoringDay(live, labels);
  const displayDay = getLiveDisplayDay(live);
  const displayDate = getLiveDisplayDate(live);
  const rows = useMemo(
    () => computeTradeRows(labels, eventReturns, assetMeta, selectedEvents, dayN, horizon, live),
    [labels, eventReturns, assetMeta, selectedEvents, dayN, horizon, live],
  );
  const diagnostics = useMemo(() => getLiveDiagnosticsSummary(live, labels), [live, labels]);
  const groupOptions = useMemo(() => groupOptionsFromData(allClasses), [allClasses]);

  return (
    <ChartCard
      title="Trade Ideas"
      subtitle={`${rows.length} ideas | live D+${displayDay}${displayDate ? ` (${displayDate})` : ''} -> D+${displayDay + horizon} | ${selectedEvents.length} analogues`}
      controls={
        <Select label="Group" value={group} onChange={setGroup} options={groupOptions} />
      }
    >
      <DiagnosticsStrip
        live={live}
        labels={labels}
        scoringMode="live-sim"
        extra={<span>Click any row to open Detail with the same asset and horizon.</span>}
      />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-2xs font-mono">
          <thead>
            <tr className="bg-bg-cell">
              {['#', 'Asset', 'Class', 'Dir', `D+${displayDay}->D+${displayDay + horizon}`, 'Median', 'Hit%', 'Sharpe', 'Sortino', 'Worst', 'Gap', 'Pctile', 'Status', 'Coverage', 'Conv', 'N'].map((header) => (
                <th key={header} className="px-2 py-1.5 text-text-muted border-b border-border font-medium text-center whitespace-nowrap">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={16} className="px-4 py-8 text-center text-text-dim">
                  {!live.returns
                    ? 'Run L1 Config to load live data first.'
                    : selectedEvents.length === 0
                      ? 'No analogue events are currently selected. Re-score or loosen the cutoff.'
                      : 'No trade ideas passed the current filters for this group.'}
                </td>
              </tr>
            ) : rows.map((row, index) => {
              const dirColor = row.dir === 'LONG' ? alphaThemeColor('up', '0.10') : alphaThemeColor('down', '0.10');
              const isSelected = selectedTradeIdea === row.lbl && activeTab === 'l5-detail';
              return (
                <tr
                  key={row.lbl}
                  className="hover:bg-bg-hover/40 transition-colors cursor-pointer"
                  style={{ backgroundColor: isSelected ? alphaThemeColor('uiAccent', '0.08') : dirColor }}
                  onClick={() => {
                    setDetailContext({
                      selectedDetailAsset: row.lbl,
                      selectedDetailHorizon: horizon,
                      selectedTradeIdea: row.lbl,
                    });
                    setActiveGroup('live');
                    setActiveTab('l5-detail');
                  }}
                >
                  <td className="px-2 py-1 text-center text-text-dim border-b border-border/30">{index + 1}</td>
                  <td className="px-2 py-1 text-left text-text-primary border-b border-border/30 whitespace-nowrap font-medium">
                    <div className="flex items-center gap-2">
                      <span>{displayLabel(assetMeta[row.lbl], row.lbl)}</span>
                      {isSelected && <Badge color="dim">Detail</Badge>}
                    </div>
                  </td>
                  <td className="px-2 py-1 text-center text-text-muted border-b border-border/30">{row.cls}</td>
                  <td className={`px-2 py-1 text-center font-semibold border-b border-border/30 ${row.dir === 'LONG' ? 'text-up' : 'text-down'}`}>
                    {row.dir}
                  </td>
                  <td className="px-2 py-1 text-center text-text-muted border-b border-border/30">{`D+${displayDay}->D+${displayDay + horizon}`}</td>
                  <td className={`px-2 py-1 text-center font-medium border-b border-border/30 ${row.med >= 0 ? 'text-up' : 'text-down'}`}>
                    {fmtReturn(row.med, row.isRates)}
                  </td>
                  <td className="px-2 py-1 text-center border-b border-border/30">
                    <span className={hitRateClass(row.hitRate)}>
                      {(row.hitRate * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className={`px-2 py-1 text-center border-b border-border/30 ${row.sharpe > 0 ? 'text-up' : 'text-down'}`}>
                    {row.sharpe.toFixed(2)}
                  </td>
                  <td className={`px-2 py-1 text-center border-b border-border/30 ${row.sortino > 0 ? 'text-up' : 'text-down'}`}>
                    {row.sortino.toFixed(2)}
                  </td>
                  <td className={`px-2 py-1 text-center border-b border-border/30 ${moveClass(row.worst, row.dir)}`}>
                    {fmtReturn(row.worst, row.isRates)}
                  </td>
                  <td className="px-2 py-1 text-center border-b border-border/30">
                    {Number.isNaN(row.liveGap)
                      ? '--'
                      : <span className={gapClass(row.liveGap)}>{fmtReturn(row.liveGap, row.isRates)}</span>}
                  </td>
                  <td className="px-2 py-1 text-center border-b border-border/30">
                    {Number.isNaN(row.livePctile) ? '--' : `${row.livePctile.toFixed(0)}th`}
                  </td>
                  <td className="px-2 py-1 text-center border-b border-border/30 whitespace-nowrap">{row.status}</td>
                  <td className="px-2 py-1 text-center border-b border-border/30 text-text-dim">
                    {diagnostics.requestedAssetCount > 0 ? `${((row.n / Math.max(selectedEvents.length, 1)) * 100).toFixed(0)}%` : '--'}
                  </td>
                  <td className="px-2 py-1 text-center border-b border-border/30">{row.stars}</td>
                  <td className="px-2 py-1 text-center text-text-dim border-b border-border/30">{row.n}/{row.nTotal}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <BottomDescription>
        Trade Ideas ranks forward setups from the current live state, not from Day 0. The window shown above is the current live day to the future live day for the selected horizon. If an asset does not have a print exactly on the live day, the latest available value on or before that live date is used automatically. Clicking a row opens the deeper drill-down in Detail.
      </BottomDescription>
    </ChartCard>
  );
}
