import { useState, useEffect, useCallback, useRef } from 'react';
import './Ponto.css';

// ── Helpers ───────────────────────────────────────────────────────────────────

const getToday   = () => new Date().toISOString().slice(0, 10);
const storageKey = (d) => `ponto_${d}`;

const toHHMM = (date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

const parseHHMM = (str) => {
  const [h, m] = str.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};

const addMinutes  = (date, m) => new Date(date.getTime() + m * 60_000);
const diffMinutes = (a, b) => Math.round((a.getTime() - b.getTime()) / 60_000);

const fmtBalance = (mins) => {
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${mins >= 0 ? '+' : '-'}${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
};

const fmtWorked = (mins) => {
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return `${h}h${m > 0 ? ` ${m}min` : ''}`;
};

const fmtDate = (dateStr) => {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
};

const fmtShortDate = (dateStr) => {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString('pt-BR', {
    weekday: 'short', day: '2-digit', month: '2-digit',
  });
};

const loadDay = (date) => {
  const raw = localStorage.getItem(storageKey(date));
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  // Migra formato antigo (objeto) para array
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === 'object' && parsed !== null) {
    const order = ['entrada', 'saidaIntervalo', 'retornoIntervalo', 'saida'];
    return order.map(k => parsed[k]).filter(Boolean);
  }
  return [];
};

const saveDay  = (date, punches) =>
  localStorage.setItem(storageKey(date), JSON.stringify(punches));

const loadHistory = () => {
  const hist = [];
  for (let i = 1; i <= 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const data = loadDay(dateStr);
    if (data.length) hist.push({ date: dateStr, punches: data });
  }
  return hist;
};

// ── Calculations ──────────────────────────────────────────────────────────────

const JOURNEY = 8 * 60;

function calcWorked(punches) {
  let total = 0;
  for (let i = 0; i + 1 < punches.length; i += 2) {
    const diff = diffMinutes(parseHHMM(punches[i + 1]), parseHHMM(punches[i]));
    if (diff > 0) total += diff;
  }
  return total;
}

function calcSuggestions(punches) {
  if (!punches.length) return null;
  const worked    = calcWorked(punches);
  const remaining = Math.max(0, JOURNEY - worked);
  const isWorking = punches.length % 2 === 1;

  // Break suggestion (only before first exit)
  let breakSuggestion = null;
  if (punches.length === 1) {
    const entrada = parseHHMM(punches[0]);
    breakSuggestion = {
      from: toHHMM(addMinutes(entrada, 4 * 60)),
      to:   toHHMM(addMinutes(entrada, 5 * 60)),
    };
  }

  // Return suggestion (currently on break)
  let returnSuggestion = null;
  if (!isWorking && punches.length >= 2) {
    const lastOut = parseHHMM(punches[punches.length - 1]);
    returnSuggestion = toHHMM(addMinutes(lastOut, 60));
  }

  // Exit suggestion (currently working, still has hours to do)
  let exitSuggestion = null;
  if (isWorking && remaining > 0) {
    const lastEntry = parseHHMM(punches[punches.length - 1]);
    exitSuggestion = toHHMM(addMinutes(lastEntry, remaining));
  }

  return { worked, remaining, isWorking, breakSuggestion, returnSuggestion, exitSuggestion };
}

function calcBalance(punches) {
  if (!punches.length || punches.length % 2 !== 0) return null;
  return calcWorked(punches) - JOURNEY;
}

function calcDayBalance(punches) {
  if (!punches.length || punches.length % 2 !== 0) return null;
  return calcWorked(punches) - JOURNEY;
}

// ── Punch label ───────────────────────────────────────────────────────────────

function punchLabel(index) {
  if (index === 0) return 'Entrada';
  if (index % 2 === 1) {
    const n = Math.ceil(index / 2);
    return n === 1 ? 'Saída Intervalo' : `Saída ${n}`;
  }
  const n = index / 2;
  return n === 1 ? 'Retorno' : `Retorno ${n}`;
}

const isEntry = (i) => i % 2 === 0;

// ── Countdown ─────────────────────────────────────────────────────────────────

function Countdown({ targetHHMM }) {
  const [diff, setDiff] = useState(null);
  useEffect(() => {
    const tick = () => {
      setDiff(diffMinutes(parseHHMM(targetHHMM), new Date()));
    };
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [targetHHMM]);
  if (diff === null) return null;
  if (diff <= 0) return <span className="p-countdown p-countdown--past">agora</span>;
  return <span className="p-countdown">em {fmtWorked(diff)}</span>;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PontoApp() {
  const [today,       setToday]       = useState(getToday);
  const [punches,     setPunches]     = useState(() => loadDay(getToday()));
  const [now,         setNow]         = useState(new Date());
  const [inputTime,   setInputTime]   = useState(() => toHHMM(new Date()));
  const [history,     setHistory]     = useState(loadHistory);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const inputTouched = useRef(false);

  // Clock tick
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      setNow(n);
      if (!inputTouched.current) setInputTime(toHHMM(n));
      const newToday = n.toISOString().slice(0, 10);
      if (newToday !== today) {
        setToday(newToday);
        setPunches(loadDay(newToday));
        setHistory(loadHistory());
        inputTouched.current = false;
      }
    }, 1000);
    return () => clearInterval(id);
  }, [today]);

  const save = useCallback((next) => {
    saveDay(today, next);
    setPunches(next);
    setHistory(loadHistory());
  }, [today]);

  const addPunch = useCallback(() => {
    if (!inputTime) return;
    save([...punches, inputTime]);
    inputTouched.current = false;
    setInputTime(toHHMM(new Date()));
  }, [punches, inputTime, save]);

  const editPunch = useCallback((i, val) => {
    const next = [...punches];
    next[i] = val;
    save(next);
  }, [punches, save]);

  const removePunch = useCallback((i) => {
    save(punches.filter((_, idx) => idx !== i));
  }, [punches, save]);

  const resetDay = useCallback(() => {
    save([]);
    setConfirmReset(false);
    inputTouched.current = false;
    setInputTime(toHHMM(new Date()));
  }, [save]);

  const useNow = () => {
    setInputTime(toHHMM(new Date()));
    inputTouched.current = false;
  };

  const sugg    = calcSuggestions(punches);
  const balance = calcBalance(punches);
  const isWorking = punches.length % 2 === 1;
  const isDone    = punches.length >= 4 && punches.length % 2 === 0;

  // Next action label
  const nextBtn = punches.length === 0 ? 'Registrar Entrada'
    : isWorking ? (punches.length === 1 ? 'Saída para Intervalo' : 'Registrar Saída')
    : (punches.length === 2 ? 'Retorno do Intervalo' : 'Registrar Entrada');

  const statusLabel = punches.length === 0 ? 'Aguardando'
    : isWorking ? 'Trabalhando'
    : isDone ? 'Dia Encerrado'
    : 'Em Intervalo';

  const statusColor = punches.length === 0 ? 'gray'
    : isWorking ? 'green'
    : isDone ? 'blue'
    : 'yellow';

  return (
    <div className="p-app">
      {/* Header */}
      <header className="p-header">
        <a href="/" className="p-back">← sarpa.dev</a>
        <div className="p-header-center">
          <h1 className="p-title">Controle de Ponto</h1>
          <p className="p-date">{fmtDate(today)}</p>
        </div>
        <span className={`p-badge p-badge--${statusColor}`}>{statusLabel}</span>
      </header>

      <main className="p-main">

        {/* ── Registrar ───────────────────────── */}
        <section className="p-card p-punch-card">
          <div className="p-clock">
            {toHHMM(now)}
            <span className="p-clock-seconds">:{String(now.getSeconds()).padStart(2,'0')}</span>
          </div>

          <div className="p-input-row">
            <input
              type="time"
              className="p-time-input"
              value={inputTime}
              onChange={(e) => { setInputTime(e.target.value); inputTouched.current = true; }}
            />
            <button className="p-btn" onClick={addPunch}>{nextBtn}</button>
          </div>

          {inputTouched.current && (
            <button className="p-undo" onClick={useNow}>↺ usar hora atual</button>
          )}

          {/* Hint */}
          {sugg?.breakSuggestion && (
            <p className="p-hint">
              Intervalo recomendado: <strong>{sugg.breakSuggestion.from}</strong> – <strong>{sugg.breakSuggestion.to}</strong>
              <Countdown targetHHMM={sugg.breakSuggestion.from} />
            </p>
          )}
          {sugg?.returnSuggestion && (
            <p className="p-hint">
              Retorno sugerido às <strong>{sugg.returnSuggestion}</strong>
              <Countdown targetHHMM={sugg.returnSuggestion} />
            </p>
          )}
          {sugg?.exitSuggestion && (
            <p className="p-hint">
              Saída para 8h: <strong>{sugg.exitSuggestion}</strong>
              <Countdown targetHHMM={sugg.exitSuggestion} />
            </p>
          )}

          {/* Balance when done */}
          {isDone && balance !== null && (
            <div className={`p-balance-big ${balance >= 0 ? 'pos' : 'neg'}`}>
              <span className="p-balance-label">Saldo do dia</span>
              <span className="p-balance-value">{fmtBalance(balance)}</span>
            </div>
          )}
        </section>

        {/* ── Batidas ─────────────────────────── */}
        {punches.length > 0 && (
          <section className="p-card">
            <div className="p-card-titlerow">
              <h2 className="p-card-title">Batidas de hoje ({punches.length})</h2>
              {!confirmReset ? (
                <button className="p-danger-btn" onClick={() => setConfirmReset(true)}>
                  Resetar dia
                </button>
              ) : (
                <span className="p-confirm-row">
                  Tem certeza?&nbsp;
                  <button className="p-danger-btn" onClick={resetDay}>Sim</button>
                  &nbsp;
                  <button className="p-toggle" onClick={() => setConfirmReset(false)}>Não</button>
                </span>
              )}
            </div>

            <div className="p-punches-list">
              {punches.map((time, i) => (
                <div key={i} className={`p-punch-row ${isEntry(i) ? 'p-punch-row--entry' : 'p-punch-row--exit'}`}>
                  <span className="p-punch-row-label">{punchLabel(i)}</span>
                  <input
                    type="time"
                    className="p-time-input p-time-input--sm"
                    value={time}
                    onChange={(e) => editPunch(i, e.target.value)}
                  />
                  <button
                    className="p-remove-btn"
                    onClick={() => removePunch(i)}
                    title="Remover batida"
                  >×</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Resumo ──────────────────────────── */}
        {sugg && (
          <section className="p-card">
            <h2 className="p-card-title">Resumo</h2>
            <div className="p-calcs">
              <div className="p-calc-row">
                <span>Trabalhado</span>
                <span>{fmtWorked(sugg.worked)}</span>
              </div>
              <div className="p-calc-row">
                <span>Restante</span>
                <span>{sugg.remaining > 0 ? fmtWorked(sugg.remaining) : '—'}</span>
              </div>
              {sugg.exitSuggestion && (
                <div className="p-calc-row p-calc-row--accent">
                  <span>Saída prevista (8h)</span>
                  <span>{sugg.exitSuggestion}</span>
                </div>
              )}
              {balance !== null && (
                <div className={`p-calc-row p-calc-row--balance ${balance >= 0 ? 'pos' : 'neg'}`}>
                  <span>Saldo do dia</span>
                  <span>{fmtBalance(balance)}</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Histórico ───────────────────────── */}
        {history.length > 0 && (
          <section className="p-card">
            <div className="p-card-titlerow">
              <h2 className="p-card-title">Histórico</h2>
              <button className="p-toggle" onClick={() => setShowHistory(v => !v)}>
                {showHistory ? 'Ocultar' : `Ver ${history.length} dias`}
              </button>
            </div>
            {showHistory && (
              <div className="p-history">
                {history.map(({ date, punches: dp }) => {
                  const bal = calcDayBalance(dp);
                  return (
                    <div key={date} className="p-hist-row">
                      <span className="p-hist-date">{fmtShortDate(date)}</span>
                      <span className="p-hist-punches">{dp.join(' · ')}</span>
                      {bal !== null && (
                        <span className={`p-hist-balance ${bal >= 0 ? 'pos' : 'neg'}`}>
                          {fmtBalance(bal)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

      </main>
    </div>
  );
}
