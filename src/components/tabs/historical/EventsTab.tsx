'use client';

import { useMemo } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Button, Badge, StatBox } from '@/components/ui/ChartCard';
import { EVENTS, EVENT_TAGS } from '@/config/events';

const TAG_CONFIG: Record<string, { color: 'amber' | 'red' | 'green' | 'teal' | 'blue' | 'purple' }> = {
  'energy_shock': { color: 'amber' },
  'military_conflict': { color: 'red' },
  'shipping_disruption': { color: 'teal' },
  'sanctions': { color: 'green' },
  'pandemic': { color: 'blue' },
};

export function EventsTab() {
  const { activeEvents, toggleEvent, setActiveEvents } = useDashboard();

  const activeCount = useMemo(() => activeEvents.size, [activeEvents]);
  const totalCount = EVENTS.length;
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    EVENTS.forEach(e => {
      EVENT_TAGS[e.name]?.forEach(t => tags.add(t));
    });
    return Array.from(tags);
  }, []);

  const handleSelectAll = () => {
    setActiveEvents(new Set(EVENTS.map(e => e.name)));
  };

  const handleDeselectAll = () => {
    setActiveEvents(new Set());
  };

  const tagStats = useMemo(() => {
    return allTags.map(tag => {
      const totalWithTag = EVENTS.filter(e => EVENT_TAGS[e.name]?.has(tag)).length;
      const activeWithTag = Array.from(activeEvents).filter(
        eventName => EVENT_TAGS[eventName]?.has(tag)
      ).length;
      return { tag, totalWithTag, activeWithTag };
    });
  }, [allTags, activeEvents]);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ChartCard
        title="Event Selection"
        subtitle={`${activeCount} of ${totalCount} events active`}
        controls={
          <div className="flex items-center gap-2">
            <Button onClick={handleSelectAll} variant="secondary" size="xs">
              All
            </Button>
            <Button onClick={handleDeselectAll} variant="secondary" size="xs">
              None
            </Button>
          </div>
        }
      >
        <div className="p-4 space-y-2 max-h-[560px] overflow-y-auto">
          {EVENTS.map((event) => {
            const isActive = activeEvents.has(event.name);
            const tags = EVENT_TAGS[event.name] || new Set();

            return (
              <div
                key={event.name}
                className="group flex items-start gap-3 p-3 border border-border/40 bg-bg-cell/30 rounded-sm
                  hover:border-border/80 hover:bg-bg-cell/50 transition-all table-row-hover"
              >
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={() => toggleEvent(event.name)}
                  className="w-4 h-4 mt-0.5 accent-accent-teal cursor-pointer flex-shrink-0"
                  aria-label={`Toggle ${event.name}`}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-sm font-semibold text-text-primary font-mono">
                      {event.name}
                    </span>
                    <span className="text-2xs text-text-muted font-mono">
                      {event.date}
                    </span>
                  </div>

                  {tags.size > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from(tags).map((tag) => {
                        const cfg = TAG_CONFIG[tag];
                        return (
                          <Badge
                            key={tag}
                            color={cfg?.color || 'dim'}
                            className="text-2xs"
                          >
                            {tag.replace(/_/g, ' ')}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </div>

                {isActive && (
                  <div className="flex-shrink-0 mt-1">
                    <div className="w-2 h-2 rounded-full bg-accent-teal animate-pulse shadow-glow-teal" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ChartCard>

      <div className="grid grid-cols-2 gap-4">
        <StatBox label="Active" value={activeCount} color="#00d4aa" />
        <StatBox label="Total" value={totalCount} />
      </div>

      <ChartCard title="Tag Coverage">
        <div className="p-4 space-y-2.5">
          {tagStats.map(({ tag, activeWithTag, totalWithTag }) => {
            const cfg = TAG_CONFIG[tag];
            const pct = totalWithTag > 0 ? (activeWithTag / totalWithTag) * 100 : 0;
            return (
              <div key={tag} className="space-y-1.5">
                <div className="flex items-center justify-between text-2xs">
                  <Badge color={cfg?.color || 'dim'}>
                    {tag.replace(/_/g, ' ')}
                  </Badge>
                  <span className="text-text-dim font-mono">
                    {activeWithTag}/{totalWithTag}
                  </span>
                </div>
                <div className="h-1.5 bg-border/40 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-teal/60 transition-all duration-300"
                    style={{ width: `${pct}%` }}
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
