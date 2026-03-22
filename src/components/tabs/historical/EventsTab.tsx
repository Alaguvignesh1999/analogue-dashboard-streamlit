'use client';

import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Button, Badge, StatBox } from '@/components/ui/ChartCard';
import {
  computeCustomEventReturns,
  getHistoricalCoverageRange,
  getTriggerPriceForDate,
} from '@/engine/customEvents';

const TAG_CONFIG: Record<string, { color: 'amber' | 'red' | 'green' | 'teal' | 'blue' | 'purple' }> = {
  energy_shock: { color: 'amber' },
  military_conflict: { color: 'red' },
  shipping_disruption: { color: 'teal' },
  sanctions: { color: 'green' },
  pandemic: { color: 'blue' },
};

const AVAILABLE_TAGS = Object.keys(TAG_CONFIG);

export function EventsTab() {
  const {
    activeEvents,
    toggleEvent,
    setActiveEvents,
    events,
    eventTags,
    dailyHistory,
    provenance,
    assetMeta,
    addCustomEvent,
    customEvents,
  } = useDashboard();

  const [customName, setCustomName] = useState('');
  const [customDate, setCustomDate] = useState('');
  const [customTags, setCustomTags] = useState<Set<string>>(new Set());
  const [customStatus, setCustomStatus] = useState('');
  const [eventDateOverrides, setEventDateOverrides] = useState<Record<string, string>>({});

  const activeCount = activeEvents.size;
  const totalCount = events.length;
  const coverage = useMemo(
    () => (dailyHistory ? getHistoricalCoverageRange(dailyHistory) : { startDate: null, endDate: null }),
    [dailyHistory]
  );

  const triggerPrice = useMemo(() => {
    if (!dailyHistory || !customDate) return null;
    return getTriggerPriceForDate(dailyHistory, customDate);
  }, [customDate, dailyHistory]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    events.forEach((event) => {
      eventTags[event.name]?.forEach((tag) => tags.add(tag));
    });
    return Array.from(tags);
  }, [eventTags, events]);

  const tagStats = useMemo(() => (
    allTags.map((tag) => {
      const totalWithTag = events.filter((event) => eventTags[event.name]?.has(tag)).length;
      const activeWithTag = Array.from(activeEvents).filter((eventName) => eventTags[eventName]?.has(tag)).length;
      return { tag, totalWithTag, activeWithTag };
    })
  ), [activeEvents, allTags, eventTags, events]);

  const handleAddCustomEvent = () => {
    if (!dailyHistory) {
      setCustomStatus('Daily history is not loaded yet.');
      return;
    }
    if (!customName.trim() || !customDate) {
      setCustomStatus('Enter an event name and date first.');
      return;
    }

    if (coverage.startDate && customDate < coverage.startDate) {
      setCustomStatus(`Date is before historical coverage starts (${coverage.startDate}).`);
      return;
    }
    if (coverage.endDate && customDate > coverage.endDate) {
      setCustomStatus(`Date is after historical coverage ends (${coverage.endDate}).`);
      return;
    }

    const computed = computeCustomEventReturns(dailyHistory, assetMeta, customDate);
    if (!computed.resolvedAnchorDate) {
      setCustomStatus('Could not resolve a trading-day anchor on or before that date.');
      return;
    }

    addCustomEvent(
      {
        name: customName.trim(),
        date: computed.resolvedAnchorDate,
        source: 'custom',
        tags: Array.from(customTags),
        trigger: triggerPrice?.value ?? null,
        createdAt: new Date().toISOString(),
        selectedDate: customDate,
        resolvedAnchorDate: computed.resolvedAnchorDate,
        storageScope: 'local',
      },
      computed.returnsByAsset,
    );
    setCustomStatus(
      `Applied ${customName.trim()} locally across ${Object.keys(computed.returnsByAsset).length} assets. Anchor: ${computed.resolvedAnchorDate}.`
    );
    setCustomName('');
    setCustomDate('');
    setCustomTags(new Set());
  };

  const handleApplyDateOverride = (eventName: string, date: string, tags: string[]) => {
    if (!dailyHistory) {
      setCustomStatus('Daily history is not loaded yet.');
      return;
    }
    if (!date) {
      setCustomStatus(`Choose a date for ${eventName} first.`);
      return;
    }

    if (coverage.startDate && date < coverage.startDate) {
      setCustomStatus(`Date is before historical coverage starts (${coverage.startDate}).`);
      return;
    }
    if (coverage.endDate && date > coverage.endDate) {
      setCustomStatus(`Date is after historical coverage ends (${coverage.endDate}).`);
      return;
    }

    const computed = computeCustomEventReturns(dailyHistory, assetMeta, date);
    if (!computed.resolvedAnchorDate) {
      setCustomStatus(`Could not resolve a trading-day anchor for ${eventName}.`);
      return;
    }

    const trigger = getTriggerPriceForDate(dailyHistory, date);
    addCustomEvent(
      {
        name: eventName,
        date: computed.resolvedAnchorDate,
        source: 'custom',
        tags,
        trigger: trigger?.value ?? null,
        createdAt: new Date().toISOString(),
        selectedDate: date,
        resolvedAnchorDate: computed.resolvedAnchorDate,
        storageScope: 'local',
      },
      computed.returnsByAsset,
    );
    setCustomStatus(
      `Updated ${eventName} locally to ${date} (anchor ${computed.resolvedAnchorDate}) across ${Object.keys(computed.returnsByAsset).length} assets.`
    );
  };

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ChartCard
        title="Event Selection"
        subtitle={`${activeCount} of ${totalCount} events active`}
        controls={
          <div className="flex items-center gap-2">
            <Button onClick={() => setActiveEvents(new Set(events.map((event) => event.name)))} variant="secondary" size="xs">
              All
            </Button>
            <Button onClick={() => setActiveEvents(new Set())} variant="secondary" size="xs">
              None
            </Button>
          </div>
        }
      >
        <div className="p-4 space-y-3">
          {provenance.warnings.length > 0 && (
            <div className="p-3 border border-accent-amber/20 bg-accent-amber/5 rounded-sm text-2xs text-text-muted">
              {provenance.warnings.join(' | ')}
            </div>
          )}

          <div className="p-3 border border-border/40 bg-bg-cell/20 rounded-sm space-y-3">
            <div className="text-2xs text-text-muted uppercase tracking-wider">Custom Event Creation</div>
            <div className="text-2xs text-text-dim">
              Historical coverage: {coverage.startDate || '--'} to {coverage.endDate || '--'} | Stored locally in this browser only
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                value={customName}
                onChange={(event) => setCustomName(event.target.value)}
                placeholder="Event name"
                className="input-field"
              />
              <input
                type="date"
                value={customDate}
                onChange={(event) => setCustomDate(event.target.value)}
                className="input-field"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_TAGS.map((tag) => {
                const selected = customTags.has(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => {
                      const next = new Set(customTags);
                      if (selected) next.delete(tag);
                      else next.add(tag);
                      setCustomTags(next);
                    }}
                    className={`px-2.5 py-0.5 text-[10px] border rounded-sm transition-all ${
                      selected
                        ? 'bg-[#00e5ff]/10 text-[#00e5ff] border-[#00e5ff]/30'
                        : 'bg-transparent text-[#4a4a5a] border-[#1e1e2e] hover:text-[#6a6a7a]'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap text-2xs text-text-dim">
              <div>
                Brent on selected date:{' '}
                <span className="text-text-primary">
                  {triggerPrice ? `$${triggerPrice.value.toFixed(2)} (${triggerPrice.date})` : '--'}
                </span>
              </div>
              <Button onClick={handleAddCustomEvent} size="xs">Apply Event Update</Button>
            </div>
            {customStatus && <div className="text-2xs text-accent-teal">{customStatus}</div>}
          </div>

          <div className="max-h-[520px] overflow-y-auto space-y-2">
            {events.map((event) => {
              const active = activeEvents.has(event.name);
              const tags = eventTags[event.name] || new Set<string>();
              const customEvent = customEvents.find((item) => item.name === event.name);
              const effectiveDate = eventDateOverrides[event.name] || event.date;
              const eventTrigger = dailyHistory ? getTriggerPriceForDate(dailyHistory, effectiveDate) : null;
              return (
                <div
                  key={event.name}
                  className="group flex items-start gap-3 p-3 border border-border/40 bg-bg-cell/30 rounded-sm hover:border-border/80 hover:bg-bg-cell/50 transition-all table-row-hover"
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleEvent(event.name)}
                    className="w-4 h-4 mt-0.5 accent-accent-teal cursor-pointer flex-shrink-0"
                    aria-label={`Toggle ${event.name}`}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-sm font-semibold text-text-primary font-mono">{event.name}</span>
                      <span className="text-2xs text-text-muted font-mono">{event.date}</span>
                      {customEvent && (
                        <Badge color="teal" className="text-2xs">
                          local only
                        </Badge>
                      )}
                    </div>
                    {customEvent && (
                      <div className="text-2xs text-text-dim mb-2">
                        Selected date {customEvent.selectedDate} | Resolved anchor {customEvent.resolvedAnchorDate || '--'}
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-[180px_auto] gap-2 mb-2">
                      <input
                        type="date"
                        value={effectiveDate}
                        onChange={(inputEvent) => setEventDateOverrides((current) => ({
                          ...current,
                          [event.name]: inputEvent.target.value,
                        }))}
                        className="input-field"
                      />
                      <div className="flex items-center justify-between gap-2 flex-wrap text-2xs text-text-dim">
                        <span>
                          Brent on date:{' '}
                          <span className="text-text-primary">
                            {eventTrigger ? `$${eventTrigger.value.toFixed(2)} (${eventTrigger.date})` : '--'}
                          </span>
                        </span>
                        <Button
                          onClick={() => handleApplyDateOverride(event.name, effectiveDate, Array.from(tags))}
                          size="xs"
                          variant="secondary"
                        >
                          Apply Exact Date
                        </Button>
                      </div>
                    </div>
                    {tags.size > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from(tags).map((tag) => (
                          <Badge key={tag} color={TAG_CONFIG[tag]?.color || 'dim'} className="text-2xs">
                            {tag.replace(/_/g, ' ')}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {active && (
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-2 h-2 rounded-full bg-accent-teal animate-pulse shadow-glow-teal" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </ChartCard>

      <div className="grid grid-cols-2 gap-4">
        <StatBox label="Active" value={activeCount} color="#00d4aa" />
        <StatBox label="Total" value={totalCount} />
      </div>

      <ChartCard title="Tag Coverage">
        <div className="p-4 space-y-2.5">
          {tagStats.map(({ tag, activeWithTag, totalWithTag }) => {
            const pct = totalWithTag > 0 ? (activeWithTag / totalWithTag) * 100 : 0;
            return (
              <div key={tag} className="space-y-1.5">
                <div className="flex items-center justify-between text-2xs">
                  <Badge color={TAG_CONFIG[tag]?.color || 'dim'}>
                    {tag.replace(/_/g, ' ')}
                  </Badge>
                  <span className="text-text-dim font-mono">
                    {activeWithTag}/{totalWithTag}
                  </span>
                </div>
                <div className="h-1.5 bg-border/40 rounded-full overflow-hidden">
                  <div className="h-full bg-accent-teal/60 transition-all duration-300" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </ChartCard>
    </div>
  );
}
