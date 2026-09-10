import { useState, useEffect, useCallback } from 'react';

interface EntryCondition {
  id: string;
  type: 'price_above' | 'price_below' | 'ema_cross' | 'ema_above' | 'ema_below' | 'bos_bullish' | 'bos_bearish' | 'fvg_bullish' | 'fvg_bearish' | 'session_check';
  params: Record<string, any>;
}

interface SavedStrategy {
  id: string;
  name: string;
  description: string;
  family: string;
  entry_conditions: string;
  sl_type: string;
  sl_value: number;
  tp_type: string;
  tp_value: number;
  session_filter: string;
  trend_filter: number;
  trend_ema_length: number;
  default_timeframe: string;
  backtest_stats?: string;
  is_active: number;
  created_at: string;
}

const ENTRY_CONDITION_TYPES = [
  { value: 'price_above', label: 'Price Above Level' },
  { value: 'price_below', label: 'Price Below Level' },
  { value: 'ema_cross', label: 'EMA Crossover' },
  { value: 'ema_above', label: 'Price Above EMA' },
  { value: 'ema_below', label: 'Price Below EMA' },
  { value: 'bos_bullish', label: 'Bullish BOS' },
  { value: 'bos_bearish', label: 'Bearish BOS' },
  { value: 'fvg_bullish', label: 'Bullish FVG' },
  { value: 'fvg_bearish', label: 'Bearish FVG' },
  { value: 'session_check', label: 'Session Filter' },
];

export function StrategyBuilder() {
  const [strategies, setStrategies] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [entryConditions, setEntryConditions] = useState<EntryCondition[]>([]);
  const [slType, setSlType] = useState('fixed_pips');
  const [slValue, setSlValue] = useState(20);
  const [tpType, setTpType] = useState('rr_multiple');
  const [tpValue, setTpValue] = useState(2.5);
  const [sessionFilter, setSessionFilter] = useState('all');
  const [trendFilter, setTrendFilter] = useState(false);
  const [trendEmaLength, setTrendEmaLength] = useState(200);
  const [defaultTimeframe, setDefaultTimeframe] = useState('1h');
  const [selectedPair, setSelectedPair] = useState('EURUSD');
  const [usePendingOrder, setUsePendingOrder] = useState(true); // Default: pending orders enabled
  const [entryGapPips, setEntryGapPips] = useState(5); // Default: 5 pips gap

  const PAIRS = ["EURUSD", "USDJPY", "GBPUSD", "AUDUSD", "XAUUSD", "USDCAD", "NZDUSD", "USDCHF"];
  const TIMEFRAMES = ["5m", "15m", "30m", "1h", "4h", "1d"];

  // Results
  const [backtestResult, setBacktestResult] = useState<any>(null);
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  // Persist analysis to localStorage
  useEffect(() => {
    if (analysisResult) {
      localStorage.setItem('gizzyfx.strategy_analysis', JSON.stringify(analysisResult));
    }
  }, [analysisResult]);

  // Restore analysis from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('gizzyfx.strategy_analysis');
    if (saved) {
      try {
        setAnalysisResult(JSON.parse(saved));
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    fetchStrategies();
  }, []);

  const fetchStrategies = async () => {
    try {
      const builtInRes = await fetch('/api/strategies');
      const builtInData = builtInRes.ok ? await builtInRes.json() : { strategies: [] };
      
      const userRes = await fetch('/api/hermes/user-strategies');
      const userData = userRes.ok ? await userRes.json() : { strategies: [] };
      
      const allStrategies = [
        ...(builtInData.strategies || []).map((s: any) => ({ ...s, isBuiltIn: true })),
        ...(userData.strategies || []),
      ];

      // Run backtest for each strategy to get win rate
      const strategiesWithWR = await Promise.all(allStrategies.map(async (s) => {
        try {
          const res = await fetch('/api/strategies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'backtest',
              strategy_id: s.id,
              pair: selectedPair,
              interval: s.id === 'ema9-vwap' ? '5m' : '1h',
              limit: 2000,
              params: {},
            }),
          });
          if (res.ok) {
            const data = await res.json();
            return { ...s, winRate: data.winRate || 0, trades: data.total || 0, totalPips: data.totalPips || 0, confidence: data.confidence || 'VERY_LOW', ciLow: data.ciLow || 0, ciHigh: data.ciHigh || 0 };
          }
        } catch { /* ignore */ }
        return { ...s, winRate: 0, trades: 0, totalPips: 0, confidence: 'VERY_LOW', ciLow: 0, ciHigh: 0 };
      }));

      setStrategies(strategiesWithWR);
    } catch {
      // Silently fail
    }
  };

  const addCondition = () => {
    setEntryConditions([...entryConditions, {
      id: crypto.randomUUID(),
      type: 'price_above',
      params: { level: 0 },
    }]);
  };

  const removeCondition = (id: string) => {
    setEntryConditions(entryConditions.filter(c => c.id !== id));
  };

  const updateCondition = (id: string, updates: Partial<EntryCondition>) => {
    setEntryConditions(entryConditions.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setEntryConditions([]);
    setSlType('fixed_pips');
    setSlValue(20);
    setTpType('rr_multiple');
    setTpValue(2.5);
    setSessionFilter('all');
    setTrendFilter(false);
    setTrendEmaLength(200);
    setDefaultTimeframe('1h');
    setSelectedId('');
    setEditing(false);
    setBacktestResult(null);
    setAnalysisResult(null);
  };

  const saveStrategy = async () => {
    if (!name.trim()) {
      setError('Strategy name is required');
      return;
    }
    if (entryConditions.length === 0) {
      setError('Add at least one entry condition');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/hermes/user-strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedId || undefined,
          name,
          description,
          family: 'custom',
          entry_conditions: JSON.stringify(entryConditions),
          sl_type: slType,
          sl_value: slValue,
          tp_type: tpType,
          tp_value: tpValue,
          session_filter: sessionFilter,
          trend_filter: trendFilter ? 1 : 0,
          trend_ema_length: trendEmaLength,
          default_timeframe: defaultTimeframe,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to save');
      }

      setSuccess('Strategy saved!');
      resetForm();
      fetchStrategies();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadStrategy = (strat: any) => {
    setSelectedId(strat.id);
    setName(strat.name);
    setDescription(strat.description || '');
    setBacktestResult(null);
    setAnalysisResult(null);
    
    if (strat.isBuiltIn) {
      const params = strat.params || [];
      const emaParam = params.find((p: any) => p.name === 'ema_length');
      const atrMultParam = params.find((p: any) => p.name === 'atr_mult');
      const rrParam = params.find((p: any) => p.name === 'rr_ratio');
      
      if (strat.id === 'ema9-vwap') {
        setDefaultTimeframe('5m');
      }
      
      setEntryConditions([]);
      setSlType('atr_multiple');
      setSlValue(atrMultParam?.default || 2);
      setTpType('rr_multiple');
      setTpValue(rrParam?.default || 2.5);
      setSessionFilter('all');
      setTrendFilter(false);
      setTrendEmaLength(emaParam?.default || 9);
      setEditing(false);
      return;
    }
    
    setEntryConditions(JSON.parse(strat.entry_conditions || '[]'));
    setSlType(strat.sl_type);
    setSlValue(strat.sl_value);
    setTpType(strat.tp_type);
    setTpValue(strat.tp_value);
    setSessionFilter(strat.session_filter);
    setTrendFilter(!!strat.trend_filter);
    setTrendEmaLength(strat.trend_ema_length);
    setDefaultTimeframe(strat.default_timeframe);
    setEditing(true);
  };

  const deleteStrategy = async (id: string) => {
    const s = strategies.find(x => x.id === id);
    if (s?.isBuiltIn) {
      alert('Built-in strategies cannot be deleted from the UI.');
      return;
    }
    if (!confirm(`Delete "${s?.name || id}"? This cannot be undone.`)) return;
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/hermes/user-strategies', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Delete failed (${res.status})`);
      }
      setSuccess('Strategy deleted');
      await fetchStrategies();
      if (selectedId === id) resetForm();
    } catch (e: any) {
      setError(e.message || 'Failed to delete');
    }
  };

  const runBacktest = async () => {
    if (!selectedId) return;
    setLoading(true);
    setError(null);
    setBacktestResult(null);

    try {
      const res = await fetch('/api/strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'backtest',
          strategy_id: selectedId,
          pair: selectedPair,
          interval: defaultTimeframe,
          limit: 2000,
          params: {
            entry_conditions: entryConditions,
            sl_type: slType,
            sl_value: slValue,
            tp_type: tpType,
            tp_value: tpValue,
            session_filter: sessionFilter,
            trend_filter: trendFilter,
            trend_ema_length: trendEmaLength,
          },
        }),
      });

      if (!res.ok) throw new Error('Backtest failed');
      const data = await res.json();
      setBacktestResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const analyzeWithHermes = async () => {
    if (!selectedId) return;
    setLoading(true);
    setError(null);
    setAnalysisResult(null);

    try {
      const res = await fetch('/api/hermes/strategy-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'analyze',
          strategy_id: selectedId,
          pair: selectedPair,
          interval: defaultTimeframe,
          limit: 500,
          params: {
            entry_conditions: entryConditions,
            sl_type: slType,
            sl_value: slValue,
            tp_type: tpType,
            tp_value: tpValue,
            session_filter: sessionFilter,
            trend_filter: trendFilter,
            trend_ema_length: trendEmaLength,
            use_pending_order: usePendingOrder,
            entry_gap_pips: entryGapPips,
          },
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Analysis failed');
      }

      const data = await res.json();
      setAnalysisResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const interpretBacktest = async () => {
    if (!backtestResult) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/hermes/strategy-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'interpret_backtest',
          strategy_id: selectedId,
          pair: 'EURUSD',
          interval: defaultTimeframe,
          backtest_result: backtestResult.stats,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Interpretation failed');
      }

      const data = await res.json();
      setAnalysisResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Styles using site's CSS variables
  const styles = {
    card: {
      background: 'oklch(var(--gz-s2))',
      border: '1px solid oklch(var(--gz-p) / 0.10)',
      borderRadius: 'var(--radius-lg)',
      padding: '16px',
    },
    header: {
      color: 'oklch(var(--gz-txt))',
      fontSize: '13px',
      fontWeight: 600,
    },
    label: {
      color: 'oklch(var(--gz-mut))',
      fontSize: '10px',
      display: 'block',
      marginBottom: '4px',
    },
    input: {
      width: '100%',
      background: 'oklch(var(--gz-inp))',
      border: '1px solid oklch(var(--gz-p) / 0.10)',
      borderRadius: 'var(--radius-sm)',
      padding: '4px 8px',
      fontSize: '11px',
      color: 'oklch(var(--gz-txt))',
      outline: 'none',
    },
    button: {
      background: 'oklch(var(--gz-p))',
      color: 'oklch(var(--gz-bg))',
      border: 'none',
      borderRadius: 'var(--radius-sm)',
      padding: '8px 16px',
      fontSize: '11px',
      fontWeight: 500,
      cursor: 'pointer',
    },
    buttonSecondary: {
      background: 'oklch(var(--gz-s1))',
      color: 'oklch(var(--gz-txt))',
      border: '1px solid oklch(var(--gz-p) / 0.10)',
      borderRadius: 'var(--radius-sm)',
      padding: '6px 12px',
      fontSize: '10px',
      fontWeight: 500,
      cursor: 'pointer',
    },
    tag: {
      background: 'oklch(var(--gz-s1))',
      border: '1px solid oklch(var(--gz-p) / 0.10)',
      borderRadius: 'var(--radius-sm)',
      padding: '2px 8px',
      fontSize: '10px',
      color: 'oklch(var(--gz-mut))',
      cursor: 'pointer',
    },
    tagActive: {
      background: 'oklch(var(--gz-p) / 0.20)',
      border: '1px solid oklch(var(--gz-p) / 0.40)',
      color: 'oklch(var(--gz-p))',
    },
    resultBox: {
      background: 'oklch(var(--gz-s1))',
      borderRadius: 'var(--radius-sm)',
      padding: '8px',
      textAlign: 'center' as const,
    },
    resultLabel: {
      fontSize: '9px',
      color: 'oklch(var(--gz-mut))',
    },
    resultValue: {
      fontSize: '11px',
      fontWeight: 700,
      color: 'oklch(var(--gz-txt))',
      fontFamily: 'var(--font-mono)',
    },
    errorBox: {
      background: 'oklch(var(--gz-neg) / 0.10)',
      border: '1px solid oklch(var(--gz-neg) / 0.20)',
      borderRadius: 'var(--radius-sm)',
      padding: '8px',
      fontSize: '10px',
      color: 'oklch(var(--gz-neg))',
    },
    successBox: {
      background: 'oklch(var(--gz-pos) / 0.10)',
      border: '1px solid oklch(var(--gz-pos) / 0.20)',
      borderRadius: 'var(--radius-sm)',
      padding: '8px',
      fontSize: '10px',
      color: 'oklch(var(--gz-pos))',
    },
  };

  return (
    <div style={styles.card} className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 style={styles.header}>Strategy Builder</h3>
        <button onClick={resetForm} className="text-[10px] hover:underline" style={{ color: 'oklch(var(--gz-mut))' }}>
          + New
        </button>
      </div>

      {/* Pair & Timeframe Selection */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label style={styles.label}>Pair</label>
          <select
            value={selectedPair}
            onChange={e => setSelectedPair(e.target.value)}
            style={styles.input}
          >
            {PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label style={styles.label}>Timeframe</label>
          <select
            value={defaultTimeframe}
            onChange={e => setDefaultTimeframe(e.target.value)}
            style={styles.input}
          >
            {TIMEFRAMES.map(tf => <option key={tf} value={tf}>{tf}</option>)}
          </select>
        </div>
      </div>

      {/* Strategy Summary Table */}
      <div className="space-y-1">
        <label style={styles.label}>Strategy Performance</label>
        <div className="rounded border" style={{ borderColor: 'oklch(var(--gz-p) / 0.1)' }}>
          <div className="grid grid-cols-[1fr_50px_50px_60px_50px] gap-1 px-2 py-1 text-[9px] font-bold" style={{ background: 'oklch(var(--gz-s3))', borderBottom: '1px solid oklch(var(--gz-p) / 0.1)' }}>
            <span>Strategy</span>
            <span className="text-center">WR</span>
            <span className="text-center">Trades</span>
            <span className="text-right">Pips</span>
            <span className="text-center">Conf</span>
          </div>
          {strategies.map(s => (
            <div key={s.id} className="grid grid-cols-[1fr_50px_50px_60px_50px] gap-1 px-2 py-1 text-[9px]" style={{ borderBottom: '1px solid oklch(var(--gz-p) / 0.05)' }}>
              <span className="truncate">{s.name} {s.isBuiltIn ? '★' : ''}</span>
              <span className="text-center" style={{ color: (s.winRate || 0) >= 35 ? 'oklch(var(--gz-pos))' : 'oklch(var(--gz-neg))' }}>
                {s.winRate?.toFixed(0) || 0}%
              </span>
              <span className="text-center" style={{ color: 'oklch(var(--gz-mut))' }}>{s.trades || 0}</span>
              <span className="text-right" style={{ color: (s.totalPips || 0) >= 0 ? 'oklch(var(--gz-pos))' : 'oklch(var(--gz-neg))' }}>
                {(s.totalPips || 0).toFixed(1)}
              </span>
              <span className="text-center" style={{ color: s.confidence === 'HIGH' ? 'oklch(var(--gz-pos))' : s.confidence === 'MEDIUM' ? 'oklch(var(--gz-warn))' : 'oklch(var(--gz-neg))' }}>
                {s.confidence === 'VERY_LOW' ? 'VL' : s.confidence === 'LOW' ? 'L' : s.confidence === 'MEDIUM' ? 'M' : 'H'}
              </span>
            </div>
          ))}
        </div>
        <div className="text-[8px]" style={{ color: 'oklch(var(--gz-mut))' }}>
          Conf: H=HIGH (100+ trades), M=MEDIUM (50+), L=LOW (20+), VL=VERY_LOW (&lt;20)
        </div>
      </div>

      {/* Strategy Selection Dropdown */}
      <div className="space-y-1">
        <label style={styles.label}>Select Strategy</label>
        <select
          value={selectedId}
          onChange={e => {
            const s = strategies.find(x => x.id === e.target.value);
            if (s) loadStrategy(s);
          }}
          style={{ ...styles.input, width: '100%' }}
        >
          <option value="">-- Choose Strategy --</option>
          {strategies.map(s => (
            <option key={s.id} value={s.id}>
              {s.name} {s.isBuiltIn ? '★' : ''} — {s.winRate?.toFixed(0) || 0}% WR ({s.trades || 0} trades) [{s.confidence === 'VERY_LOW' ? 'VL' : s.confidence === 'LOW' ? 'L' : s.confidence === 'MEDIUM' ? 'M' : 'H'}]
            </option>
          ))}
        </select>
      </div>

      {/* Selected strategy indicator */}
      {selectedId && (
        <div style={{ fontSize: '10px', color: 'oklch(var(--gz-p))' }}>
          Selected: <strong>{strategies.find(s => s.id === selectedId)?.name}</strong>
        </div>
      )}

      {/* Pine Script Viewer */}
      {selectedId && strategies.find(s => s.id === selectedId)?.pineScript && (
        <div className="space-y-1">
          <label style={styles.label}>Pine Script</label>
          <pre
            className="rounded border p-2 overflow-x-auto text-[9px] leading-tight"
            style={{
              background: 'oklch(var(--gz-s3))',
              borderColor: 'oklch(var(--gz-p) / 0.1)',
              color: 'oklch(var(--gz-txt))',
              maxHeight: '200px',
              overflowY: 'auto',
            }}
          >
            <code>{strategies.find(s => s.id === selectedId)?.pineScript}</code>
          </pre>
        </div>
      )}

      {/* Form */}
      <div className="space-y-3">
        <div>
          <label style={styles.label}>Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="My Strategy"
            style={styles.input}
          />
        </div>

        <div>
          <label style={styles.label}>Description</label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Optional description"
            style={styles.input}
          />
        </div>

        {/* Entry Conditions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label style={{ ...styles.label, margin: 0 }}>Entry Conditions</label>
            <button onClick={addCondition} className="text-[10px] hover:underline" style={{ color: 'oklch(var(--gz-p))' }}>+ Add</button>
          </div>
          {entryConditions.map(cond => (
            <div key={cond.id} className="flex items-center gap-1">
              <select
                value={cond.type}
                onChange={e => updateCondition(cond.id, { type: e.target.value as any })}
                style={{ ...styles.input, flex: 1 }}
              >
                {ENTRY_CONDITION_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <button onClick={() => removeCondition(cond.id)} className="text-[10px] px-1" style={{ color: 'oklch(var(--gz-neg))' }}>×</button>
            </div>
          ))}
        </div>

        {/* SL/TP */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label style={styles.label}>Stop Loss</label>
            <div className="flex gap-1">
              <input
                type="number"
                value={slValue}
                onChange={e => setSlValue(Number(e.target.value))}
                style={{ ...styles.input, width: '64px' }}
              />
              <select
                value={slType}
                onChange={e => setSlType(e.target.value)}
                style={{ ...styles.input, flex: 1 }}
              >
                <option value="fixed_pips">pips</option>
                <option value="atr_multiple">ATR x</option>
              </select>
            </div>
          </div>
          <div>
            <label style={styles.label}>Take Profit</label>
            <div className="flex gap-1">
              <input
                type="number"
                value={tpValue}
                onChange={e => setTpValue(Number(e.target.value))}
                step="0.5"
                style={{ ...styles.input, width: '64px' }}
              />
              <select
                value={tpType}
                onChange={e => setTpType(e.target.value)}
                style={{ ...styles.input, flex: 1 }}
              >
                <option value="rr_multiple">R:R</option>
                <option value="fixed_pips">pips</option>
                <option value="atr_multiple">ATR x</option>
              </select>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label style={styles.label}>Session</label>
            <select
              value={sessionFilter}
              onChange={e => setSessionFilter(e.target.value)}
              style={styles.input}
            >
              <option value="all">All Sessions</option>
              <option value="london">London Only</option>
              <option value="ny">NY Only</option>
              <option value="london_ny">London + NY</option>
              <option value="asia">Asia Only</option>
            </select>
          </div>
          <div>
            <label style={styles.label}>Trend Filter</label>
            <label className="flex items-center gap-1 text-[10px] cursor-pointer" style={{ color: 'oklch(var(--gz-txt))' }}>
              <input
                type="checkbox"
                checked={trendFilter}
                onChange={e => setTrendFilter(e.target.checked)}
              />
              EMA {trendEmaLength}
            </label>
          </div>
        </div>

        <div>
          <label style={styles.label}>Timeframe</label>
          <select
            value={defaultTimeframe}
            onChange={e => setDefaultTimeframe(e.target.value)}
            style={styles.input}
          >
            <option value="5m">5m</option>
            <option value="15m">15m</option>
            <option value="1h">1h</option>
            <option value="4h">4h</option>
          </select>
        </div>

        {/* Pending Order Settings */}
        <div className="space-y-2 pt-2" style={{ borderTop: '1px solid oklch(var(--gz-p) / 0.10)' }}>
          <label style={{ ...styles.label, fontWeight: 600 }}>Entry Order Type</label>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1 text-[10px] cursor-pointer" style={{ color: 'oklch(var(--gz-txt))' }}>
              <input
                type="checkbox"
                checked={usePendingOrder}
                onChange={e => setUsePendingOrder(e.target.checked)}
              />
              Use Pending Order
            </label>
            {usePendingOrder && (
              <div className="flex items-center gap-1">
                <label className="text-[10px]" style={{ color: 'oklch(var(--gz-mut))' }}>Gap:</label>
                <input
                  type="number"
                  value={entryGapPips}
                  onChange={e => setEntryGapPips(Number(e.target.value))}
                  style={{ ...styles.input, width: '50px', padding: '2px 4px' }}
                  min="1"
                  max="50"
                />
                <span className="text-[10px]" style={{ color: 'oklch(var(--gz-mut))' }}>pips</span>
              </div>
            )}
          </div>
          {usePendingOrder && (
            <div className="text-[9px]" style={{ color: 'oklch(var(--gz-info))' }}>
              ℹ️ Entry will be placed {entryGapPips} pips below signal price for long orders, above for short orders
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-2">
        <button
          onClick={saveStrategy}
          disabled={loading}
          style={{ ...styles.button, width: '100%', opacity: loading ? 0.5 : 1 }}
        >
          {loading ? 'Saving...' : editing ? 'Update Strategy' : 'Save Strategy'}
        </button>

        <div className="flex gap-2">
          <button
            onClick={runBacktest}
            disabled={loading || !selectedId}
            style={{ ...styles.buttonSecondary, flex: 1, opacity: (loading || !selectedId) ? 0.5 : 1 }}
          >
            Backtest
          </button>
          <button
            onClick={analyzeWithHermes}
            disabled={loading || !selectedId}
            style={{ ...styles.buttonSecondary, flex: 1, opacity: (loading || !selectedId) ? 0.5 : 1, color: 'oklch(var(--gz-p))', borderColor: 'oklch(var(--gz-p) / 0.30)' }}
          >
            Analyze with Hermes
          </button>
        </div>

        {!selectedId && (
          <div className="text-[9px] text-center" style={{ color: 'oklch(var(--gz-mut))' }}>
            Select a strategy above to enable backtest and analysis
          </div>
        )}

        {/* Analyzing Animation */}
        {loading && (
          <div className="flex flex-col items-center gap-2 py-3">
            <div className="relative w-8 h-8">
              <div
                className="absolute inset-0 rounded-full border-2 animate-spin"
                style={{ borderColor: 'oklch(var(--gz-p) / 0.2)', borderTopColor: 'oklch(var(--gz-p))' }}
              />
              <div
                className="absolute inset-1 rounded-full border-2 animate-spin"
                style={{ borderColor: 'oklch(var(--gz-pos) / 0.2)', borderBottomColor: 'oklch(var(--gz-pos))', animationDirection: 'reverse', animationDuration: '1.5s' }}
              />
            </div>
            <div className="text-[9px] text-center" style={{ color: 'oklch(var(--gz-p))' }}>
              Analyzing with GizzyFx Co-Pilot...
            </div>
          </div>
        )}

        {selectedId && (
          <div className="flex gap-2 pt-2" style={{ borderTop: '1px solid oklch(var(--gz-p) / 0.10)' }}>
            <button
              onClick={() => {
                const s = strategies.find(x => x.id === selectedId);
                if (s?.isBuiltIn) {
                  alert('Built-in strategies cannot be deleted from the UI.');
                  return;
                }
                deleteStrategy(selectedId);
              }}
              className="flex-1 py-1.5 text-[10px] rounded border hover:opacity-80"
              style={{ color: 'oklch(var(--gz-neg))', borderColor: 'oklch(var(--gz-neg) / 0.3)', background: 'oklch(var(--gz-neg) / 0.05)' }}
            >
              Delete Strategy
            </button>
            <button
              onClick={resetForm}
              className="flex-1 py-1.5 text-[10px] rounded border hover:opacity-80"
              style={{ color: 'oklch(var(--gz-mut))', borderColor: 'oklch(var(--gz-p) / 0.1)' }}
            >
              Clear Selection
            </button>
          </div>
        )}
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}
      {success && <div style={styles.successBox}>{success}</div>}

      {/* Backtest Results */}
      {backtestResult && (
        <div className="space-y-2 pt-2" style={{ borderTop: '1px solid oklch(var(--gz-p) / 0.10)' }}>
          <div className="flex items-center justify-between">
            <div style={{ ...styles.label, margin: 0 }}>Backtest Results</div>
            <button
              onClick={interpretBacktest}
              className="text-[10px] hover:underline"
              style={{ color: 'oklch(var(--gz-p))' }}
            >
              Interpret with Hermes
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1 text-center">
            <div style={styles.resultBox}>
              <div style={styles.resultLabel}>Trades</div>
              <div style={styles.resultValue}>{backtestResult.stats?.total || 0}</div>
            </div>
            <div style={styles.resultBox}>
              <div style={styles.resultLabel}>WR</div>
              <div style={{
                ...styles.resultValue,
                color: (backtestResult.stats?.winRate || 0) >= 35 ? 'oklch(var(--gz-pos))' : 'oklch(var(--gz-neg))',
              }}>
                {(backtestResult.stats?.winRate || 0).toFixed(1)}%
              </div>
            </div>
            <div style={styles.resultBox}>
              <div style={styles.resultLabel}>Pips</div>
              <div style={{
                ...styles.resultValue,
                color: (backtestResult.stats?.totalPips || 0) >= 0 ? 'oklch(var(--gz-pos))' : 'oklch(var(--gz-neg))',
              }}>
                {(backtestResult.stats?.totalPips || 0).toFixed(0)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hermes Analysis Result */}
      {analysisResult && (
        <div className="space-y-2 pt-2" style={{ borderTop: '1px solid oklch(var(--gz-p) / 0.10)' }}>
          <div style={{ ...styles.label, margin: 0 }}>Hermes Analysis</div>
          
          {analysisResult.analysis?.signal && (
            <div className="grid grid-cols-2 gap-2">
              <div style={styles.resultBox}>
                <div style={styles.resultLabel}>Signal</div>
                <div style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: analysisResult.analysis.signal === 'LONG' ? 'oklch(var(--gz-pos))' :
                         analysisResult.analysis.signal === 'SHORT' ? 'oklch(var(--gz-neg))' : 'oklch(var(--gz-warn))',
                }}>
                  {analysisResult.analysis.signal}
                </div>
              </div>
              <div style={styles.resultBox}>
                <div style={styles.resultLabel}>Confidence</div>
                <div style={styles.resultValue}>
                  {analysisResult.analysis.confidence}%
                </div>
              </div>
            </div>
          )}

          {analysisResult.analysis?.entry && (
            <div className="grid grid-cols-3 gap-1 text-center">
              <div style={{ ...styles.resultBox, background: 'oklch(var(--gz-pos) / 0.05)' }}>
                <div style={styles.resultLabel}>{usePendingOrder ? 'Pending Entry' : 'Entry'}</div>
                <div style={{ ...styles.resultValue, color: 'oklch(var(--gz-pos))' }}>
                  {usePendingOrder && analysisResult.analysis.signal === 'LONG'
                    ? (analysisResult.analysis.entry - entryGapPips * 0.0001).toFixed(5)
                    : usePendingOrder && analysisResult.analysis.signal === 'SHORT'
                    ? (analysisResult.analysis.entry + entryGapPips * 0.0001).toFixed(5)
                    : analysisResult.analysis.entry.toFixed(5)}
                </div>
                {usePendingOrder && (
                  <div style={{ fontSize: '8px', color: 'oklch(var(--gz-info))' }}>
                    {entryGapPips} pips {analysisResult.analysis.signal === 'LONG' ? 'below' : 'above'} signal
                  </div>
                )}
              </div>
              <div style={{ ...styles.resultBox, background: 'oklch(var(--gz-neg) / 0.05)' }}>
                <div style={styles.resultLabel}>SL</div>
                <div style={{ ...styles.resultValue, color: 'oklch(var(--gz-neg))' }}>
                  {analysisResult.analysis.stopLoss.toFixed(5)}
                </div>
              </div>
              <div style={{ ...styles.resultBox, background: 'oklch(var(--gz-info) / 0.05)' }}>
                <div style={styles.resultLabel}>TP</div>
                <div style={{ ...styles.resultValue, color: 'oklch(var(--gz-info))' }}>
                  {analysisResult.analysis.takeProfit1.toFixed(5)}
                </div>
              </div>
            </div>
          )}

          {analysisResult.analysis?.rationale && (
            <div style={{ ...styles.resultBox, textAlign: 'left', fontSize: '10px' }}>
              <span style={{ fontWeight: 600, color: 'oklch(var(--gz-txt))' }}>Rationale:</span>{' '}
              <span style={{ color: 'oklch(var(--gz-mut))' }}>{analysisResult.analysis.rationale}</span>
            </div>
          )}

          {analysisResult.analysis?.risk && (
            <div style={{ ...styles.resultBox, textAlign: 'left', fontSize: '10px' }}>
              <span style={{ fontWeight: 600, color: 'oklch(var(--gz-txt))' }}>Risk:</span>{' '}
              <span style={{ color: 'oklch(var(--gz-mut))' }}>{analysisResult.analysis.risk}</span>
            </div>
          )}

          {analysisResult.analysis?.raw && (
            <details style={{ fontSize: '10px', color: 'oklch(var(--gz-mut))' }}>
              <summary className="cursor-pointer hover:underline">View Full Analysis</summary>
              <div style={{ ...styles.resultBox, marginTop: '4px', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', textAlign: 'left' }}>
                {analysisResult.analysis.raw}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
