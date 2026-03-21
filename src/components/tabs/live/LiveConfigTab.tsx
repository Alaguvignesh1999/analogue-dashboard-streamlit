'use client';

import { useState, useEffect, useCallback } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Button } from '@/components/ui/ChartCard';
import { ALL_TAGS } from '@/config/events';
import { TRIGGER_ASSET } from '@/config/engine';

export function LiveConfigTab() {
  const { live, setLive } = useDashboard();
  const [status, setStatus] = useState('');
  const [pulling, setPulling] = useState(false);
  const [triggerOverride, setTriggerOverride] = useState(false);
  const [day0Price, setDay0Price] = useState<number | null>(null);
  const [day0PriceDate, setDay0PriceDate] = useState('');
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [currentPriceDate, setCurrentPriceDate] = useState('');
  const [priceStatus, setPriceStatus] = useState('');

  // Fetch Brent at a specific date
  const fetchPrice = useCallback(async (dateStr?: string): Promise<{ price: number; date: string } | null> => {
    try {
      const params = dateStr ? `?date=${dateStr}` : '';
      const res = await fetch(`/api/trigger${params}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (data.price) return { price: data.price, date: data.date || '' };
      return null;
    } catch { return null; }
  }, []);

  // Fetch both Day 0 + current on mount and when date changes
  const fetchBothPrices = useCallback(async (day0DateStr?: string) => {
    setPriceStatus('⟳');
    const [d0, curr] = await Promise.all([
      day0DateStr ? fetchPrice(day0DateStr) : Promise.resolve(null),
      fetchPrice(), // no date = latest
    ]);
    if (d0) {
      setDay0Price(d0.price);
      setDay0PriceDate(d0.date);
      if (!triggerOverride) setLive({ trigger: d0.price });
    }
    if (curr) {
      setCurrentPrice(curr.price);
      setCurrentPriceDate(curr.date);
    }
    setPriceStatus(d0 || curr ? '' : '⚠ fetch failed');
  }, [fetchPrice, triggerOverride, setLive]);

  useEffect(() => {
    fetchBothPrices(live.day0 || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDateChange = useCallback((newDate: string) => {
    setLive({ day0: newDate });
    if (newDate.length === 10) fetchBothPrices(newDate);
  }, [setLive, fetchBothPrices]);

  async function handlePull() {
    setPulling(true);
    setStatus('⟳ Pulling live data...');
    try {
      const res = await fetch(`/api/live-pull?date=${live.day0}&assets=all`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const returns: Record<string, Record<number, number>> = {};
      for (const [label, series] of Object.entries(data.returns || {})) {
        returns[label] = {};
        for (const [off, val] of Object.entries(series as Record<string, number>))
          returns[label][parseInt(off)] = val;
      }
      setLive({ returns, dayN: data.dayN, triggerPctile: data.triggerZScore || null });
      setStatus(`✅ ${live.name} · Day+${data.dayN} · ${Object.keys(returns).length} assets`);
    } catch (err: any) {
      setStatus('⚠ API unavailable — using Demo');
      generateMockLiveData();
    } finally { setPulling(false); }
  }

  function generateMockLiveData() {
    const mockReturns: Record<string, Record<number, number>> = {};
    const assets = [
      'S&P 500','Brent Futures','Gold','VIX','DXY','US 10Y Yield',
      'WTI Crude (spot)','USDJPY','Copper','MSCI EM','Energy Equities',
      'Silver','Natural Gas Fut','Oil Vol (OVX)','Defense (ITA)',
      'Airlines (JETS)','US HY OAS','Bitcoin','EURUSD','Shipping (BDRY)',
    ];
    for (const a of assets) {
      mockReturns[a] = {};
      let cum = 0;
      const isOil = a.includes('Crude') || a.includes('Brent') || a.includes('Gas');
      const isSafe = a.includes('Gold') || a.includes('Treasury');
      const isVol = a.includes('VIX') || a.includes('Vol');
      const drift = isOil ? 0.15 : isSafe ? 0.08 : isVol ? 0.3 : -0.05;
      const vol = isVol ? 1.5 : 0.8;
      for (let d = 0; d <= 25; d++) {
        cum += drift + (Math.random() - 0.48) * vol;
        mockReturns[a][d] = Math.round(cum * 100) / 100;
      }
    }
    setLive({ returns: mockReturns, dayN: 25, triggerPctile: 0.8 });
    setStatus(`✅ Demo · Day+25 · ${assets.length} assets`);
  }

  return (
    <div className="p-4 space-y-4">
      <ChartCard title="Live Event Configuration">
        <div className="p-5 space-y-5">
          {/* Row 1: Name + Date */}
          <div className="grid grid-cols-2 gap-5">
            <Field label="Event Name">
              <input value={live.name} onChange={e => setLive({ name: e.target.value })}
                className="input-field" />
            </Field>
            <Field label="Day 0 Date">
              <input type="date" value={live.day0 || ''}
                onChange={e => handleDateChange(e.target.value)}
                className="input-field" />
            </Field>
          </div>

          {/* Tags */}
          <Field label="Event Tags">
            <div className="flex flex-wrap gap-1.5">
              {ALL_TAGS.map(tag => {
                const on = live.tags.has(tag);
                return (
                  <button key={tag} onClick={() => {
                    const n = new Set(live.tags);
                    on ? n.delete(tag) : n.add(tag);
                    setLive({ tags: n });
                  }}
                    className={`px-2.5 py-0.5 text-[10px] border rounded-sm transition-all
                      ${on ? 'bg-[#00e5ff]/10 text-[#00e5ff] border-[#00e5ff]/30'
                           : 'bg-transparent text-[#4a4a5a] border-[#1e1e2e] hover:text-[#6a6a7a]'}`}>
                    {tag}
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Brent Prices — Day 0 + Current */}
          <div className="p-4 border border-[#1a1a2e] bg-[#0a0a10]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] uppercase tracking-widest text-[#4a4a5a]">{TRIGGER_ASSET}</span>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={triggerOverride}
                    onChange={e => setTriggerOverride(e.target.checked)}
                    className="w-3 h-3 accent-[#ffab40]" />
                  <span className="text-[10px] text-[#ffab40]">Manual override</span>
                </label>
                {!triggerOverride && (
                  <button onClick={() => fetchBothPrices(live.day0 || undefined)}
                    className="text-[10px] text-[#00e5ff] hover:text-[#00e5ff]/70">↻ Refresh</button>
                )}
                {priceStatus && <span className="text-[10px] text-[#ffab40]">{priceStatus}</span>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {/* Day 0 Price (used for scoring) */}
              <div>
                <div className="text-[9px] text-[#3a3a4a] uppercase tracking-wider mb-1">
                  Day 0 Price <span className="text-[#00e5ff]">(used for scoring)</span>
                </div>
                {triggerOverride ? (
                  <input type="number" value={live.trigger} step="0.01"
                    onChange={e => setLive({ trigger: parseFloat(e.target.value) || 0 })}
                    className="input-field text-lg font-semibold w-full" />
                ) : (
                  <div className="text-xl font-bold text-[#e0e0e8]">
                    ${day0Price?.toFixed(2) ?? '—'}
                    {day0PriceDate && (
                      <span className="text-[10px] text-[#3a3a4a] ml-2 font-normal">{day0PriceDate}</span>
                    )}
                  </div>
                )}
              </div>
              {/* Current Price (reference only) */}
              <div>
                <div className="text-[9px] text-[#3a3a4a] uppercase tracking-wider mb-1">
                  Current Price <span className="text-[#6a6a7a]">(reference)</span>
                </div>
                <div className="text-xl font-bold text-[#6a6a7a]">
                  ${currentPrice?.toFixed(2) ?? '—'}
                  {currentPriceDate && (
                    <span className="text-[10px] text-[#3a3a4a] ml-2 font-normal">{currentPriceDate}</span>
                  )}
                </div>
                {day0Price && currentPrice && (
                  <div className={`text-[10px] mt-0.5 ${currentPrice > day0Price ? 'text-[#ff5252]' : 'text-[#69f0ae]'}`}>
                    {currentPrice > day0Price ? '▲' : '▼'} {((currentPrice / day0Price - 1) * 100).toFixed(1)}% since Day 0
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* CPI + Fed */}
          <div className="grid grid-cols-2 gap-5">
            <Field label="CPI Regime">
              <select value={live.cpi} onChange={e => setLive({ cpi: e.target.value })} className="input-field">
                <option value="high">High &gt;4%</option>
                <option value="mid">Mid 2-4%</option>
                <option value="low">Low &lt;2%</option>
              </select>
            </Field>
            <Field label="Fed Stance">
              <select value={live.fed} onChange={e => setLive({ fed: e.target.value })} className="input-field">
                <option value="hiking">Hiking</option>
                <option value="cutting">Cutting</option>
                <option value="hold">Hold</option>
              </select>
            </Field>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-3 border-t border-[#1a1a2e]">
            <Button onClick={handlePull} disabled={pulling}>
              {pulling ? '⟳ Pulling...' : '⟳ Refresh Live Data'}
            </Button>
            <Button onClick={generateMockLiveData} variant="secondary">Demo Mode</Button>
            {status && (
              <span className={`text-xs ${status.startsWith('✅') ? 'text-[#69f0ae]' : 'text-[#ffab40]'}`}>
                {status}
              </span>
            )}
          </div>

          {/* Active indicator */}
          {live.dayN !== null && (
            <div className="p-3 border border-[#1a1a2e] bg-[#0a0a10] mt-2">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-[#ffab40] animate-pulse" />
                <span className="text-xs text-[#ffab40] font-medium">Live Event Active</span>
              </div>
              <div className="grid grid-cols-4 gap-3 text-[10px] text-[#6a6a7a]">
                <div>Day+{live.dayN}</div>
                <div>{Object.keys(live.returns || {}).length} assets</div>
                <div>{TRIGGER_ASSET}: ${live.trigger?.toFixed(2)}</div>
                <div>z: {live.triggerPctile?.toFixed(2) ?? '—'}</div>
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
