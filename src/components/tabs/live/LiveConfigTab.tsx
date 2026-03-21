'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Button, Badge } from '@/components/ui/ChartCard';
import { ALL_TAGS } from '@/config/events';
import { SIMILARITY_ASSET_POOL, TRIGGER_ASSET } from '@/config/engine';
import { displayLabel } from '@/engine/returns';

export function LiveConfigTab() {
  const { live, provenance, allLabels, assetMeta, similarityAssets, setSimilarityAssets, setLive, resetLive, setProvenance } = useDashboard();
  const [status, setStatus] = useState('');
  const [pulling, setPulling] = useState(false);
  const [triggerOverride, setTriggerOverride] = useState(false);
  const [day0Price, setDay0Price] = useState<number | null>(null);
  const [day0PriceDate, setDay0PriceDate] = useState('');
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [currentPriceDate, setCurrentPriceDate] = useState('');
  const [priceStatus, setPriceStatus] = useState('');

  const fetchPrice = useCallback(async (dateStr?: string): Promise<{ price: number; date: string } | null> => {
    try {
      const params = dateStr ? `?date=${dateStr}` : '';
      const response = await fetch(`/api/trigger${params}`);
      if (!response.ok) return null;
      const data = await response.json();
      if (!data.price) return null;
      return { price: data.price, date: data.date || '' };
    } catch {
      return null;
    }
  }, []);

  const fetchBothPrices = useCallback(async (day0Date?: string) => {
    setPriceStatus('Loading');
    const [day0, current] = await Promise.all([
      day0Date ? fetchPrice(day0Date) : Promise.resolve(null),
      fetchPrice(),
    ]);

    if (day0) {
      setDay0Price(day0.price);
      setDay0PriceDate(day0.date);
      if (!triggerOverride) setLive({ trigger: day0.price });
    }
    if (current) {
      setCurrentPrice(current.price);
      setCurrentPriceDate(current.date);
    }

    setPriceStatus(day0 || current ? '' : 'Fetch failed');
  }, [fetchPrice, setLive, triggerOverride]);

  useEffect(() => {
    fetchBothPrices(live.day0 || undefined);
  }, [fetchBothPrices, live.day0]);

  const similarityOptions = useMemo(
    () => SIMILARITY_ASSET_POOL.filter((asset) => allLabels.includes(asset)),
    [allLabels]
  );

  const handleDateChange = useCallback((newDate: string) => {
    setLive({ day0: newDate });
    if (newDate.length === 10) fetchBothPrices(newDate);
  }, [fetchBothPrices, setLive]);

  async function handlePull() {
    if (!live.day0) {
      setStatus('Choose a Day 0 date before pulling live data.');
      return;
    }

    setPulling(true);
    setStatus('Pulling live data...');

    try {
      const response = await fetch(`/api/live-pull?date=${live.day0}&assets=all`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      const returns: Record<string, Record<number, number>> = {};
      const levels: Record<string, Record<number, number>> = {};

      for (const [label, series] of Object.entries(data.returns || {})) {
        returns[label] = {};
        for (const [offset, value] of Object.entries(series as Record<string, number>)) {
          returns[label][parseInt(offset, 10)] = value;
        }
      }
      for (const [label, series] of Object.entries(data.levels || {})) {
        levels[label] = {};
        for (const [offset, value] of Object.entries(series as Record<string, number>)) {
          levels[label][parseInt(offset, 10)] = value;
        }
      }

      setLive({
        returns,
        levels,
        dayN: data.dayN,
        triggerPctile: data.triggerZScore ?? null,
        triggerZScore: data.triggerZScore ?? null,
        triggerDate: data.triggerDate ?? data.actualDay0 ?? live.day0,
        actualDay0: data.actualDay0 ?? live.day0,
        businessDates: Array.isArray(data.businessDates) ? data.businessDates : [],
        asOfDate: data.asOfDate ?? data.timestamp ?? null,
      });
      setProvenance({
        liveSource: 'live',
        liveAsOf: data.asOfDate ?? data.timestamp ?? null,
      });

      setStatus(`${live.name} loaded: Day+${data.dayN} across ${Object.keys(returns).length} assets`);
    } catch (error: any) {
      resetLive();
      setStatus(`Live pull failed: ${error.message}. Demo mode is now manual only.`);
    } finally {
      setPulling(false);
    }
  }

  function generateMockLiveData() {
    const mockReturns: Record<string, Record<number, number>> = {};
    const mockLevels: Record<string, Record<number, number>> = {};
    const assets = [
      'S&P 500', 'Brent Futures', 'Gold', 'VIX', 'DXY', 'US 10Y Yield',
      'WTI Crude (spot)', 'USDJPY', 'Copper', 'MSCI EM', 'Energy Equities',
      'Silver', 'Natural Gas Fut', 'Oil Vol (OVX)', 'Defense (ITA)',
      'Airlines (JETS)', 'US HY OAS', 'Bitcoin', 'EURUSD', 'Shipping (BDRY)',
    ];

    for (const asset of assets) {
      mockReturns[asset] = {};
      mockLevels[asset] = {};
      let cumulative = 0;
      let level = 100;
      const isOil = asset.includes('Crude') || asset.includes('Brent') || asset.includes('Gas');
      const isSafe = asset.includes('Gold') || asset.includes('Treasury');
      const isVol = asset.includes('VIX') || asset.includes('Vol');
      const drift = isOil ? 0.15 : isSafe ? 0.08 : isVol ? 0.3 : -0.05;
      const volatility = isVol ? 1.5 : 0.8;

      for (let day = 0; day <= 25; day += 1) {
        cumulative += drift + (Math.random() - 0.48) * volatility;
        level = Math.max(1, level * (1 + cumulative / 1000));
        mockReturns[asset][day] = Math.round(cumulative * 100) / 100;
        mockLevels[asset][day] = Math.round(level * 100) / 100;
      }
    }

    const today = new Date().toISOString();
    setLive({
      returns: mockReturns,
      levels: mockLevels,
      dayN: 25,
      triggerPctile: 0.8,
      triggerZScore: 0.8,
      triggerDate: live.day0,
      actualDay0: live.day0,
      businessDates: Array.from({ length: 26 }, (_, index) => `D+${index}`),
      asOfDate: today,
    });
    setProvenance({ liveSource: 'demo', liveAsOf: today });
    setStatus(`Demo mode active with ${assets.length} assets`);
  }

  return (
    <div className="p-4 space-y-4">
      <ChartCard
        title="Live Event Configuration"
        subtitle="Explicit live or demo mode. No silent fallback."
        controls={
          provenance.liveSource !== 'none' ? (
            <Badge color={provenance.liveSource === 'demo' ? 'amber' : 'teal'}>
              {provenance.liveSource === 'demo' ? 'Demo' : 'Live'}
            </Badge>
          ) : undefined
        }
      >
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-5">
            <Field label="Event Name">
              <input
                value={live.name}
                onChange={(event) => setLive({ name: event.target.value })}
                className="input-field"
              />
            </Field>
            <Field label="Day 0 Date">
              <input
                type="date"
                value={live.day0 || ''}
                onChange={(event) => handleDateChange(event.target.value)}
                className="input-field"
              />
            </Field>
          </div>

          <Field label="Event Tags">
            <div className="flex flex-wrap gap-1.5">
              {ALL_TAGS.map((tag) => {
                const enabled = live.tags.has(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => {
                      const next = new Set(live.tags);
                      if (enabled) next.delete(tag);
                      else next.add(tag);
                      setLive({ tags: next });
                    }}
                    className={`px-2.5 py-0.5 text-[10px] border rounded-sm transition-all ${
                      enabled
                        ? 'bg-[#00e5ff]/10 text-[#00e5ff] border-[#00e5ff]/30'
                        : 'bg-transparent text-[#4a4a5a] border-[#1e1e2e] hover:text-[#6a6a7a]'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Live Sim Asset Comparer">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {similarityOptions.map((asset) => {
                const selected = similarityAssets.includes(asset);
                return (
                  <button
                    key={asset}
                    onClick={() => {
                      const next = selected
                        ? similarityAssets.filter((value) => value !== asset)
                        : [...similarityAssets, asset];
                      setSimilarityAssets(next);
                    }}
                    className={`text-left px-2.5 py-2 rounded-sm border transition-all ${
                      selected
                        ? 'border-accent-teal/30 bg-accent-teal/10 text-accent-teal'
                        : 'border-border/40 bg-bg-cell/30 text-text-secondary hover:border-border/70'
                    }`}
                  >
                    <div className="text-2xs font-medium">{displayLabel(assetMeta[asset], asset)}</div>
                    <div className="text-[10px] opacity-70 mt-1">{assetMeta[asset]?.class || 'Unknown'}</div>
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="p-4 border border-[#1a1a2e] bg-[#0a0a10]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] uppercase tracking-widest text-[#4a4a5a]">{TRIGGER_ASSET}</span>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={triggerOverride}
                    onChange={(event) => setTriggerOverride(event.target.checked)}
                    className="w-3 h-3 accent-[#ffab40]"
                  />
                  <span className="text-[10px] text-[#ffab40]">Manual override</span>
                </label>
                {!triggerOverride && (
                  <button
                    onClick={() => fetchBothPrices(live.day0 || undefined)}
                    className="text-[10px] text-[#00e5ff] hover:text-[#00e5ff]/70"
                  >
                    Refresh
                  </button>
                )}
                {priceStatus && <span className="text-[10px] text-[#ffab40]">{priceStatus}</span>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[9px] text-[#3a3a4a] uppercase tracking-wider mb-1">
                  Day 0 Price <span className="text-[#00e5ff]">(used for scoring)</span>
                </div>
                {triggerOverride ? (
                  <input
                    type="number"
                    value={live.trigger}
                    step="0.01"
                    onChange={(event) => setLive({ trigger: parseFloat(event.target.value) || 0 })}
                    className="input-field text-lg font-semibold w-full"
                  />
                ) : (
                  <div className="text-xl font-bold text-[#e0e0e8]">
                    ${day0Price?.toFixed(2) ?? '--'}
                    {day0PriceDate && <span className="text-[10px] text-[#3a3a4a] ml-2 font-normal">{day0PriceDate}</span>}
                  </div>
                )}
              </div>

              <div>
                <div className="text-[9px] text-[#3a3a4a] uppercase tracking-wider mb-1">
                  Current Price <span className="text-[#6a6a7a]">(reference)</span>
                </div>
                <div className="text-xl font-bold text-[#6a6a7a]">
                  ${currentPrice?.toFixed(2) ?? '--'}
                  {currentPriceDate && <span className="text-[10px] text-[#3a3a4a] ml-2 font-normal">{currentPriceDate}</span>}
                </div>
                {day0Price && currentPrice && (
                  <div className={`text-[10px] mt-0.5 ${currentPrice > day0Price ? 'text-[#ff5252]' : 'text-[#69f0ae]'}`}>
                    {((currentPrice / day0Price - 1) * 100).toFixed(1)}% since Day 0
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <Field label="CPI Regime">
              <select
                value={live.cpi}
                onChange={(event) => setLive({ cpi: event.target.value })}
                className="input-field"
              >
                <option value="high">High &gt;4%</option>
                <option value="mid">Mid 2-4%</option>
                <option value="low">Low &lt;2%</option>
              </select>
            </Field>
            <Field label="Fed Stance">
              <select
                value={live.fed}
                onChange={(event) => setLive({ fed: event.target.value })}
                className="input-field"
              >
                <option value="hiking">Hiking</option>
                <option value="cutting">Cutting</option>
                <option value="hold">Hold</option>
              </select>
            </Field>
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-[#1a1a2e]">
            <Button onClick={handlePull} disabled={pulling}>
              {pulling ? 'Pulling...' : 'Refresh Live Data'}
            </Button>
            <Button onClick={generateMockLiveData} variant="secondary">Demo Mode</Button>
            {status && (
              <span className={`text-xs ${status.startsWith('Live pull failed') ? 'text-[#ffab40]' : 'text-[#69f0ae]'}`}>
                {status}
              </span>
            )}
          </div>

          {live.dayN !== null && (
            <div className="p-3 border border-[#1a1a2e] bg-[#0a0a10] mt-2">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-[#ffab40] animate-pulse" />
                <span className="text-xs text-[#ffab40] font-medium">
                  {provenance.liveSource === 'demo' ? 'Demo event active' : 'Live event active'}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-3 text-[10px] text-[#6a6a7a]">
                <div>Day+{live.dayN}</div>
                <div>{Object.keys(live.returns || {}).length} assets</div>
                <div>{TRIGGER_ASSET}: ${live.trigger?.toFixed(2)}</div>
                <div>As of: {live.asOfDate ? new Date(live.asOfDate).toLocaleDateString() : '--'}</div>
              </div>
            </div>
          )}
        </div>
      </ChartCard>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] text-[#4a4a5a] mb-1 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}
