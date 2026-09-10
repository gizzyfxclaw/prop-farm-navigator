import { useState, useEffect } from 'react';

interface PineScriptAnalysis {
  summary: string;
  entry_conditions: string[];
  stop_loss: string;
  take_profit: string[];
  direction: string;
  confidence: number;
  rationale: string;
  risk: string;
  raw_analysis: string;
}

export function PineScriptInterpreter() {
  const [pineCode, setPineCode] = useState('');
  const [analysis, setAnalysis] = useState<PineScriptAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedScripts, setSavedScripts] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [scriptName, setScriptName] = useState('');

  // Restore analysis from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('gizzyfx.pine_analysis');
    if (saved) {
      try {
        setAnalysis(JSON.parse(saved));
      } catch { /* ignore */ }
    }
    const code = localStorage.getItem('gizzyfx.pine_code');
    if (code) setPineCode(code);
  }, []);

  // Persist analysis to localStorage
  useEffect(() => {
    if (analysis) {
      localStorage.setItem('gizzyfx.pine_analysis', JSON.stringify(analysis));
    }
  }, [analysis]);

  // Persist code to localStorage
  useEffect(() => {
    localStorage.setItem('gizzyfx.pine_code', pineCode);
  }, [pineCode]);

  useEffect(() => {
    const saved = localStorage.getItem('gizzyfx.pine_scripts');
    if (saved) {
      try {
        setSavedScripts(JSON.parse(saved));
      } catch {
        // ignore
      }
    }
  }, []);

  const saveScript = () => {
    if (!scriptName.trim() || !pineCode.trim()) return;
    const newScript = {
      id: crypto.randomUUID(),
      name: scriptName.trim(),
      code: pineCode,
    };
    const updated = [...savedScripts, newScript];
    setSavedScripts(updated);
    localStorage.setItem('gizzyfx.pine_scripts', JSON.stringify(updated));
    setShowSaveDialog(false);
    setScriptName('');
  };

  const loadScript = (script: { id: string; name: string; code: string }) => {
    setPineCode(script.code);
    setAnalysis(null);
    setError(null);
  };

  const deleteScript = (id: string) => {
    const updated = savedScripts.filter(s => s.id !== id);
    setSavedScripts(updated);
    localStorage.setItem('gizzyfx.pine_scripts', JSON.stringify(updated));
  };

  const analyzeWithHermes = async () => {
    if (!pineCode.trim()) {
      setError('Please paste your Pine Script code');
      return;
    }

    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const res = await fetch('/api/hermes/pine-script-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pine_script: pineCode,
          pair: 'EURUSD',
          interval: '1h',
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Analysis failed');
      }

      const data = await res.json();
      setAnalysis(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

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
      background: 'oklch(var(--gz-s3))',
      border: '1px solid oklch(var(--gz-p) / 0.10)',
      borderRadius: 'var(--radius-sm)',
      padding: '6px 8px',
      fontSize: '11px',
      color: 'oklch(var(--gz-txt))',
      width: '100%',
      outline: 'none',
    },
    textarea: {
      background: 'oklch(var(--gz-s3))',
      border: '1px solid oklch(var(--gz-p) / 0.10)',
      borderRadius: 'var(--radius-sm)',
      padding: '8px',
      fontSize: '10px',
      color: 'oklch(var(--gz-txt))',
      width: '100%',
      minHeight: '120px',
      fontFamily: 'var(--font-mono)',
      outline: 'none',
    },
    button: {
      background: 'oklch(var(--gz-p))',
      color: 'oklch(var(--gz-s1))',
      border: 'none',
      borderRadius: 'var(--radius-sm)',
      padding: '8px 12px',
      fontSize: '11px',
      fontWeight: 600,
      cursor: 'pointer',
    },
    buttonSecondary: {
      background: 'oklch(var(--gz-s3))',
      color: 'oklch(var(--gz-txt))',
      border: '1px solid oklch(var(--gz-p) / 0.10)',
      borderRadius: 'var(--radius-sm)',
      padding: '8px 12px',
      fontSize: '11px',
      cursor: 'pointer',
    },
    tag: {
      background: 'oklch(var(--gz-s3))',
      border: '1px solid oklch(var(--gz-p) / 0.10)',
      borderRadius: 'var(--radius-sm)',
      padding: '4px 8px',
      fontSize: '9px',
      color: 'oklch(var(--gz-txt))',
      cursor: 'pointer',
    },
    errorBox: {
      background: 'oklch(var(--gz-neg) / 0.05)',
      border: '1px solid oklch(var(--gz-neg) / 0.20)',
      borderRadius: 'var(--radius-sm)',
      padding: '8px',
      fontSize: '10px',
      color: 'oklch(var(--gz-neg))',
    },
    successBox: {
      background: 'oklch(var(--gz-pos) / 0.05)',
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
        <h3 style={styles.header}>Pine Script Interpreter</h3>
        <button onClick={() => setShowSaveDialog(true)} className="text-[10px] hover:underline" style={{ color: 'oklch(var(--gz-mut))' }}>
          Save Script
        </button>
      </div>

      {showSaveDialog && (
        <div className="flex gap-2 items-center">
          <input
            value={scriptName}
            onChange={e => setScriptName(e.target.value)}
            placeholder="Script name"
            style={styles.input}
          />
          <button onClick={saveScript} style={styles.button}>Save</button>
          <button onClick={() => setShowSaveDialog(false)} className="text-[10px] hover:underline" style={{ color: 'oklch(var(--gz-neg))' }}>Cancel</button>
        </div>
      )}

      {savedScripts.length > 0 && (
        <div className="space-y-1">
          <label style={styles.label}>Saved Scripts</label>
          <div className="flex flex-wrap gap-1">
            {savedScripts.map(s => (
              <div key={s.id} className="flex items-center gap-1">
                <button onClick={() => loadScript(s)} style={styles.tag}>{s.name}</button>
                <button onClick={() => deleteScript(s.id)} className="text-[10px] px-1" style={{ color: 'oklch(var(--gz-neg))' }}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <label style={styles.label}>Paste Pine Script Code</label>
        <textarea
          value={pineCode}
          onChange={e => setPineCode(e.target.value)}
          placeholder={`//@version=5\nstrategy("My Strategy", overlay=true)\n\n// Entry conditions\nfast = ta.sma(close, 10)\nslow = ta.sma(close, 20)\n\nlongCondition = ta.crossover(fast, slow)\nshortCondition = ta.crossunder(fast, slow)\n\nif (longCondition)\n    strategy.entry("Long", strategy.long)\n\nif (shortCondition)\n    strategy.entry("Short", strategy.short)`}
          style={styles.textarea}
          spellCheck={false}
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={analyzeWithHermes}
          disabled={loading || !pineCode.trim()}
          style={{ ...styles.button, flex: 1, opacity: loading ? 0.5 : 1 }}
        >
          {loading ? 'Analyzing with Hermes...' : 'Analyze with Hermes'}
        </button>
        <button
          onClick={() => { setPineCode(''); setAnalysis(null); setError(null); }}
          style={styles.buttonSecondary}
        >
          Clear
        </button>
      </div>

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

      {error && <div style={styles.errorBox}>{error}</div>}

      {analysis && (
        <div className="space-y-2">
          <div className="text-[10px] font-bold" style={{ color: 'oklch(var(--gz-p))' }}>Analysis Results</div>
          
          {'summary' in analysis && (
            <div className="rounded border p-2 text-[10px]" style={{ borderColor: 'oklch(var(--gz-p) / 0.1)', background: 'oklch(var(--gz-s3))' }}>
              <div className="font-bold mb-1" style={{ color: 'oklch(var(--gz-txt))' }}>Summary</div>
              <div style={{ color: 'oklch(var(--gz-mut))' }}>{analysis.summary}</div>
            </div>
          )}

          {'entry_conditions' in analysis && analysis.entry_conditions && (
            <div className="rounded border p-2 text-[10px]" style={{ borderColor: 'oklch(var(--gz-p) / 0.1)', background: 'oklch(var(--gz-s3))' }}>
              <div className="font-bold mb-1" style={{ color: 'oklch(var(--gz-txt))' }}>Entry Conditions</div>
              <ul className="list-disc list-inside" style={{ color: 'oklch(var(--gz-mut))' }}>
                {analysis.entry_conditions.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}

          {'stop_loss' in analysis && (
            <div className="rounded border p-2 text-[10px]" style={{ borderColor: 'oklch(var(--gz-p) / 0.1)', background: 'oklch(var(--gz-s3))' }}>
              <div className="font-bold mb-1" style={{ color: 'oklch(var(--gz-txt))' }}>Stop Loss</div>
              <div style={{ color: 'oklch(var(--gz-mut))' }}>{analysis.stop_loss}</div>
            </div>
          )}

          {'take_profit' in analysis && analysis.take_profit && (
            <div className="rounded border p-2 text-[10px]" style={{ borderColor: 'oklch(var(--gz-p) / 0.1)', background: 'oklch(var(--gz-s3))' }}>
              <div className="font-bold mb-1" style={{ color: 'oklch(var(--gz-txt))' }}>Take Profit</div>
              <ul className="list-disc list-inside" style={{ color: 'oklch(var(--gz-mut))' }}>
                {analysis.take_profit.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          )}

          {'direction' in analysis && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded border p-2 text-center" style={{ borderColor: 'oklch(var(--gz-p) / 0.1)', background: 'oklch(var(--gz-s3))' }}>
                <div className="text-[9px]" style={{ color: 'oklch(var(--gz-mut))' }}>Signal</div>
                <div className="text-[12px] font-bold" style={{ color: analysis.direction === 'LONG' ? 'oklch(var(--gz-pos))' : analysis.direction === 'SHORT' ? 'oklch(var(--gz-neg))' : 'oklch(var(--gz-warn))' }}>
                  {analysis.direction}
                </div>
              </div>
              <div className="rounded border p-2 text-center" style={{ borderColor: 'oklch(var(--gz-p) / 0.1)', background: 'oklch(var(--gz-s3))' }}>
                <div className="text-[9px]" style={{ color: 'oklch(var(--gz-mut))' }}>Confidence</div>
                <div className="text-[12px] font-bold" style={{ color: (analysis.confidence || 0) >= 70 ? 'oklch(var(--gz-pos))' : 'oklch(var(--gz-warn))' }}>
                  {analysis.confidence || 0}%
                </div>
              </div>
            </div>
          )}

          {'rationale' in analysis && (
            <div className="rounded border p-2 text-[10px]" style={{ borderColor: 'oklch(var(--gz-p) / 0.1)', background: 'oklch(var(--gz-s3))' }}>
              <div className="font-bold mb-1" style={{ color: 'oklch(var(--gz-txt))' }}>Rationale</div>
              <div style={{ color: 'oklch(var(--gz-mut))' }}>{analysis.rationale}</div>
            </div>
          )}

          {'risk' in analysis && (
            <div className="rounded border p-2 text-[10px]" style={{ borderColor: 'oklch(var(--gz-neg) / 0.1)', background: 'oklch(var(--gz-neg) / 0.05)' }}>
              <div className="font-bold mb-1" style={{ color: 'oklch(var(--gz-neg))' }}>Risk</div>
              <div style={{ color: 'oklch(var(--gz-mut))' }}>{analysis.risk}</div>
            </div>
          )}

          {'raw_analysis' in analysis && (
            <details className="text-[10px]">
              <summary className="cursor-pointer" style={{ color: 'oklch(var(--gz-mut))' }}>Raw Analysis</summary>
              <pre className="mt-1 p-2 rounded overflow-x-auto" style={{ background: 'oklch(var(--gz-s3))', color: 'oklch(var(--gz-txt))' }}>
                {analysis.raw_analysis}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
