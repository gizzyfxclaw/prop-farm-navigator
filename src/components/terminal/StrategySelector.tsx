import { useState, useEffect, useCallback } from 'react';

interface StrategyParam {
  name: string;
  label: string;
  type: 'int' | 'float' | 'boolean' | 'select';
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: string }[];
}

interface Strategy {
  id: string;
  name: string;
  family: string;
  description: string;
  params: StrategyParam[];
}

interface AnalysisResult {
  action?: string;
  strategy_id: string;
  strategy_name: string;
  pair: string;
  interval: string;
  bars_used: number;
  trades?: any[];
  stats: {
    total: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPips: number;
    avgPips: number;
    expectancy: number;
    maxDrawdown: number;
  };
  monthly?: Record<string, { wins: number; losses: number; pnl: number }>;
  last_price?: number;
  last_time?: number;
  active_trade?: any;
  pending_setup?: any;
  recent_trades?: any[];
}

export function StrategySelector() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [params, setParams] = useState<Record<string, any>>({});
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/strategies')
      .then(r => r.json())
      .then(d => {
        setStrategies(d.strategies);
        if (d.strategies.length > 0) {
          setSelectedId(d.strategies[0].id);
          const defaultParams: Record<string, any> = {};
          d.strategies[0].params.forEach((p: StrategyParam) => {
            defaultParams[p.name] = p.default;
          });
          setParams(defaultParams);
        }
      })
      .catch(() => setError('Failed to load strategies'));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const strat = strategies.find(s => s.id === selectedId);
    if (strat) {
      const defaultParams: Record<string, any> = {};
      strat.params.forEach(p => {
        defaultParams[p.name] = p.default;
      });
      setParams(defaultParams);
      setResult(null);
    }
  }, [selectedId, strategies]);

  // Main analyze button
  const runAnalyze = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'analyze',
          strategy_id: selectedId,
          pair: 'EURUSD',
          interval: '1h',
          limit: 2000,
          params,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      setError(e.message || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }, [selectedId, params]);

  // Analyze with Hermes
  const analyzeWithHermes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const strat = strategies.find(s => s.id === selectedId);
      if (!strat) return;
      
      const smcRes = await fetch('/api/smc-analyze?pair=EURUSD&interval=1h&limit=500');
      if (!smcRes.ok) throw new Error('Failed to get SMC data');
      const smcData = await smcRes.json();
      
      const res = await fetch('/api/hermes/analyze-with-hermes', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Hermes-Key': '33d1d4fe788bdddc3af35dac80ae8dff132be97c7e95dec47309e1df592e693f'
        },
        body: JSON.stringify({
          pair: 'EURUSD',
          smc_data: { summary: smcData.structure?.summary, channel: smcData.channel, debate: smcData.debate },
          user_notes: `Analyze using ${strat.name} strategy. ${strat.description}`,
          timeframe: '1h',
        }),
      });
      
      if (!res.ok) throw new Error('Hermes analysis failed');
      const data = await res.json();
      
      setResult({
        action: 'hermes',
        strategy_id: selectedId,
        strategy_name: strat.name,
        pair: 'EURUSD',
        interval: '1h',
        bars_used: smcData.barCount || 0,
        last_price: smcData.lastPrice || 0,
        pending_setup: { hermes_request_id: data.id },
        stats: { total: 0, wins: 0, losses: 0, winRate: 0, totalPips: 0, avgPips: 0, expectancy: 0, maxDrawdown: 0 },
      });
    } catch (e: any) {
      setError(e.message || 'Hermes analysis failed');
    } finally {
      setLoading(false);
    }
  }, [selectedId, strategies]);

  const selected = strategies.find(s => s.id === selectedId);

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Strategy Selector</h3>
        <span className="text-[10px] text-muted-foreground">Pick a strategy to analyze</span>
      </div>

      <div>
        <label className="text-[11px] text-muted-foreground block mb-1">Strategy</label>
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-[12px] text-foreground"
        >
          {strategies.map(s => (
            <option key={s.id} value={s.id}>{s.name} ({s.family})</option>
          ))}
        </select>
        {selected && (
          <p className="text-[10px] text-muted-foreground mt-1">{selected.description}</p>
        )}
      </div>

      {selected && selected.params.length > 0 && (
        <div className="space-y-2">
          <label className="text-[11px] text-muted-foreground">Parameters</label>
          <div className="grid grid-cols-2 gap-2">
            {selected.params.map(p => (
              <div key={p.name}>
                <label className="text-[10px] text-muted-foreground block">{p.label}</label>
                {p.type === 'boolean' ? (
                  <label className="flex items-center gap-1 text-[11px] text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!params[p.name]}
                      onChange={e => setParams(prev => ({ ...prev, [p.name]: e.target.checked }))}
                    />
                    {params[p.name] ? 'On' : 'Off'}
                  </label>
                ) : (
                  <input
                    type="number"
                    value={Number(params[p.name] ?? p.default)}
                    min={p.min}
                    max={p.max}
                    step={p.step || (p.type === 'int' ? 1 : 0.1)}
                    onChange={e => setParams(prev => ({ ...prev, [p.name]: p.type === 'int' ? parseInt(e.target.value) : parseFloat(e.target.value) }))}
                    className="w-full bg-black/30 border border-white/10 rounded px-1 py-0.5 text-[11px] text-foreground"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Analyze Button */}
      <button
        onClick={runAnalyze}
        disabled={loading || !selectedId}
        className="w-full py-2.5 rounded text-[12px] font-medium disabled:opacity-50"
        style={{ background: 'oklch(0.55 0.18 280)', color: '#fff' }}
      >
        {loading ? 'Analyzing...' : `Analyze ${selected?.name || ''}`}
      </button>

      {/* Analyze with Hermes Button */}
      <button
        onClick={analyzeWithHermes}
        disabled={loading || !selectedId}
        className="w-full py-2 rounded text-[11px] font-medium disabled:opacity-50 border border-white/10 text-foreground hover:bg-white/5"
      >
        {loading ? 'Sending...' : 'Analyze with GizzyFx Co-Pilot'}
      </button>

      {error && (
        <div className="text-[11px] text-red-400 bg-red-500/10 rounded p-2">{error}</div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-black/20 rounded p-2">
              <div className="text-[10px] text-muted-foreground">Trades</div>
              <div className="text-sm font-bold text-foreground">{result.stats.total}</div>
            </div>
            <div className="bg-black/20 rounded p-2">
              <div className="text-[10px] text-muted-foreground">Win Rate</div>
              <div className={`text-sm font-bold ${result.stats.winRate >= 35 ? 'text-emerald-400' : 'text-red-400'}`}>
                {result.stats.winRate.toFixed(1)}%
              </div>
            </div>
            <div className="bg-black/20 rounded p-2">
              <div className="text-[10px] text-muted-foreground">Pips</div>
              <div className={`text-sm font-bold ${result.stats.totalPips >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {result.stats.totalPips >= 0 ? '+' : ''}{result.stats.totalPips.toFixed(1)}
              </div>
            </div>
          </div>

          <div className={`text-[11px] text-center rounded p-1.5 ${
            result.stats.total >= 50 && result.stats.winRate >= 35 && result.stats.avgPips >= 3
              ? 'bg-emerald-500/20 text-emerald-400'
              : result.stats.total < 50 && result.stats.winRate > 28 && result.stats.avgPips > 0
              ? 'bg-amber-500/20 text-amber-400'
              : 'bg-red-500/20 text-red-400'
          }`}>
            {result.stats.total >= 50 && result.stats.winRate >= 35 && result.stats.avgPips >= 3
              ? 'PASS'
              : result.stats.total < 50 && result.stats.winRate > 28 && result.stats.avgPips > 0
              ? 'INCONCLUSIVE'
              : 'FAIL'}
          </div>

          {result.monthly && Object.keys(result.monthly).length > 0 && (
            <div>
              <div className="text-[10px] text-muted-foreground mb-1">Monthly</div>
              <div className="space-y-0.5 max-h-24 overflow-y-auto">
                {Object.entries(result.monthly).sort().map(([month, m]: [string, any]) => {
                  const total = m.wins + m.losses;
                  const wr = total > 0 ? (m.wins / total) * 100 : 0;
                  return (
                    <div key={month} className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">{month}</span>
                      <span className={m.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {m.wins}W/{m.losses}L ({Math.round(wr)}%) {m.pnl >= 0 ? '+' : ''}{Math.round(m.pnl)}p
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {result.action === 'hermes' && result.pending_setup?.hermes_request_id && (
            <div className="text-[11px] text-center py-2">
              <a href={`/smc?review=${result.pending_setup.hermes_request_id}`} className="text-purple-400 hover:underline">
                View in GizzyFx Co-Pilot →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
