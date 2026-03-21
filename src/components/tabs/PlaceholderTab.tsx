'use client';

import { ChartCard } from '@/components/ui/ChartCard';

export function PlaceholderTab({ name }: { name: string }) {
  return (
    <div className="p-4">
      <ChartCard title={name}>
        <div className="h-[400px] flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 border-2 border-border-bright rounded-full flex items-center justify-center">
            <span className="text-lg text-text-dim">⟳</span>
          </div>
          <p className="text-xs text-text-muted">Coming in V2</p>
          <p className="text-2xs text-text-dim max-w-xs text-center">
            This tab is being ported from the notebook. All underlying engine logic is ready.
          </p>
        </div>
      </ChartCard>
    </div>
  );
}
