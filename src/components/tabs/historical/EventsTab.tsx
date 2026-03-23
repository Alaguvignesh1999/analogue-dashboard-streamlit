'use client';

import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Button, Badge, StatBox } from '@/components/ui/ChartCard';
import { EVENTS as BASE_EVENTS } from '@/config/events';
import {
  computeCustomEventReturns,
  getHistoricalCoverageRange,
  getTriggerPriceForDate,
} from '@/engine/customEvents';
import { CHART_THEME } from '@/config/theme';
import { alphaThemeColor, THEME_COLORS } from '@/theme/chart';

const TAG_CONFIG: Record<string, { color: 'amber' | 'red' | 'green' | 'teal' | 'blue' | 'purple' }> = {
  energy_shock: { color: 'amber' },
  military_conflict: { color: 'red' },
  shipping_disruption: { color: 'teal' },
  sanctions: { color: 'green' },
  pandemic: { color: 'blue' },
};

const TAG_BAR_COLOR: Record<string, string> = {
  energy_shock: alphaThemeColor('accentAmber', '0.65'),
  military_conflict: alphaThemeColor('down', '0.7'),
  shipping_disruption: alphaThemeColor('live', '0.7'),
  sanctions: alphaThemeColor('up', '0.7'),
  pandemic: alphaThemeColor('accentBlue', '0.7'),
};

const AVAILABLE_TAGS = Object.keys(TAG_CONFIG);
const BASE_EVENT_NAMES = new Set(BASE_EVENTS.map((event) => event.name));

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
    removeCustomEvent,
    customEvents,
  } = useDashboard();

  const [customName, setCustomName] = useState('');
  const [customDate, setCustomDate] = useState('');
  const [customTags, setCustomTags] = useState<Set<string>>(new Set());
  const [customStatus, setCustomStatus] = useState('');
  const [eventDateOverrides, setEventDateOverrides] = useState<Record<string, string>>({});
  const [eventTagOverrides, setEventTagOverrides] = useState<Record<string, string[]>>({});

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
    if (events.some((event) => event.name === customName.trim())) {
      setCustomStatus('That event name already exists. Edit the local event below instead of creating a duplicate.');
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
            <div className="text-2xs text-text-dim">
              Custom events and exact-date overrides do not change shared GitHub or Vercel data. The chosen calendar date is always resolved to the latest trading day on or before that date before returns are recomputed.
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
                        ? 'text-text-primary'
                        : 'bg-transparent text-text-dim border-border/60 hover:text-text-muted'
                    }`}
                    style={selected ? {
                      borderColor: THEME_COLORS.controlActiveBorder,
                      backgroundColor: alphaThemeColor('controlActiveBg', '0.08'),
                      color: THEME_COLORS.textPrimary,
                    } : undefined}
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
            {customStatus && <div className="text-2xs text-text-primary">{customStatus}</div>}
          </div>

          <div className="max-h-[520px] overflow-y-auto space-y-2">
            {events.map((event) => {
              const active = activeEvents.has(event.name);
              const tags = eventTags[event.name] || new Set<string>();
              const customEvent = customEvents.find((item) => item.name === event.name);
              const deletableCustomEvent = customEvent && !BASE_EVENT_NAMES.has(event.name);
              const effectiveDate = eventDateOverrides[event.name] || event.date;
              const effectiveTags = eventTagOverrides[event.name] || Array.from(tags);
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
                    className="w-4 h-4 mt-0.5 cursor-pointer flex-shrink-0"
                    style={{ accentColor: THEME_COLORS.controlActiveBg }}
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
                          onClick={() => handleApplyDateOverride(event.name, effectiveDate, effectiveTags)}
                          size="xs"
                          variant="secondary"
                        >
                          {customEvent ? 'Apply Event Update' : 'Apply Exact Date'}
                        </Button>
                      </div>
                    </div>
                    {deletableCustomEvent && (
                      <div className="space-y-2 mb-2">
                        <div className="text-2xs text-text-dim">Local event tags</div>
                        <div className="flex flex-wrap gap-1.5">
                          {AVAILABLE_TAGS.map((tag) => {
                            const selected = effectiveTags.includes(tag);
                            return (
                              <button
                                key={`${event.name}-${tag}`}
                                onClick={() => {
                                  setEventTagOverrides((current) => {
                                    const currentTags = current[event.name] || Array.from(tags);
                                    const nextTags = currentTags.includes(tag)
                                      ? currentTags.filter((value) => value !== tag)
                                      : [...currentTags, tag];
                                    return { ...current, [event.name]: nextTags };
                                  });
                                }}
                                className={`px-2.5 py-0.5 text-[10px] border rounded-sm transition-all ${
                                  selected
                                    ? 'text-text-primary'
                                    : 'bg-transparent text-text-dim border-border/60 hover:text-text-muted'
                                }`}
                                style={selected ? {
                                  borderColor: THEME_COLORS.controlActiveBorder,
                                  backgroundColor: alphaThemeColor('controlActiveBg', '0.08'),
                                  color: THEME_COLORS.textPrimary,
                                } : undefined}
                              >
                                {tag}
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex items-center justify-end">
                          <Button
                            onClick={() => {
                              removeCustomEvent(event.name);
                              setEventTagOverrides((current) => {
                                const next = { ...current };
                                delete next[event.name];
                                return next;
                              });
                              setEventDateOverrides((current) => {
                                const next = { ...current };
                                delete next[event.name];
                                return next;
                              });
                              setCustomStatus(`Removed local event ${event.name}.`);
                            }}
                            size="xs"
                            variant="danger"
                          >
                            Delete Added Event
                          </Button>
                        </div>
                      </div>
                    )}
                    {tags.size > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {effectiveTags.map((tag) => (
                          <Badge key={tag} color={TAG_CONFIG[tag]?.color || 'dim'} className="text-2xs">
                            {tag.replace(/_/g, ' ')}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {active && (
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: THEME_COLORS.live, boxShadow: `0 0 0 2px ${alphaThemeColor('live', '0.14')}` }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </ChartCard>

      <div className="grid grid-cols-2 gap-4">
        <StatBox label="Active" value={activeCount} color={CHART_THEME.accentTeal} />
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
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: TAG_BAR_COLOR[tag] || alphaThemeColor('uiAccent', '0.55'),
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </ChartCard>
    </div>
  );
}
