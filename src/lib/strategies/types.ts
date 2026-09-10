// Strategy Engine — Type Definitions
// A strategy is a pure function that takes bars + parameters and returns signals

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface Signal {
  idx: number;
  direction: 'long' | 'short';
  entry: number;
  stop: number;
  target: number;
  reason: string;
}

export interface Trade {
  direction: 'long' | 'short';
  entry: number;
  exit: number;
  pnl: number;
  outcome: 'stop' | 'target' | 'session_close';
  entryIdx: number;
  exitIdx: number;
}

export interface BacktestResult {
  trades: Trade[];
  stats: {
    total: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPips: number;
    avgPips: number;
    expectancy: number;
    maxDrawdown: number;
    confidence: string;
    ciLow: number;
    ciHigh: number;
  };
  monthly: Record<string, { wins: number; losses: number; pnl: number }>;
}

export interface StrategyParam {
  name: string;
  label: string;
  type: 'int' | 'float' | 'boolean' | 'select';
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: string }[];
}

export interface Strategy {
  id: string;
  name: string;
  family: string;
  description: string;
  params: StrategyParam[];
  backtest: (bars: Bar[], params: Record<string, any>) => BacktestResult;
  pineScript?: string;
}
