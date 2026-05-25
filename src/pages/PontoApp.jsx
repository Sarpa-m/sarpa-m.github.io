import { useState, useEffect, useCallback } from 'react';
import './Ponto.css';

// ── Helpers ─────────────────────────────────────────────────────────────────

const getToday = () => new Date().toISOString().slice(0, 10);

const storageKey = (date) => `ponto_${date}`;

const toHHMM = (date) =>
  date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const parseHHMM = (str) => {
  const [h, m] = str.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};

const addMinutes = (date, mins) => new Date(date.getTime() + mins * 60_000);

const diffMinutes = (a, b) => Math.round((a.getTime() - b.getTime()) / 60_000);

const fmtBalance = (mins) => {
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${mins >= 0 ? '+' : '-'}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const fmtDuration = (mins) => {
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return `${h}h${m > 0 ? ` ${m}min` : ''}`;
};

const fmtDate = (dateStr) => {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
};

const fmtShortDate = (dateStr) => {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
};

const loadDay = (date) => {
  const raw = localStorage.getItem(storageKey(date));
  return raw ? JSON.parse(raw) : {};
};

const saveDay = (date, punches) => {
  localStorage.setItem(storageKey(date), JSON.stringify(punches));
};

const loadHistory = () => {
  const history = [];
  for (let i = 1; i <= 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const data = loadDay(dateStr);
    if (data.entrada) history.push({ date: dateStr, ...data });
  }
  return history;
};

// ── Calculations ─────────────────────────────────────────────────────────────

const JOURNEY_MINUTES = 8 * 60;
const BREAK_MINUTES = 60;
const MIN_WORK_BEFORE_BREAK = 4 * 60;
const MAX_WORK_BEFORE_BREAK = 5 * 60;

function calcSuggestions(punches) {
  if (!punches.entrada) return null;
  const entrada = parseHHMM(punches.entrada);

  const breakWindowStart = addMinutes(entrada, MIN_WORK_BEFORE_BREAK);
  const breakWindowEnd   = addMinutes(entrada, MAX_WORK_BEFORE_BREAK);

  const breakStart = punches.saidaIntervalo
    ? parseHHMM(punches.saidaIntervalo)
    : breakWindowStart;

  const breakEnd = punches.retornoIntervalo
    ? parseHHMM(punches.retornoIntervalo)
    : addMinutes(breakStart, BREAK_MINUTES);

  const workedBeforeBreak = diffMinutes(breakStart, entrada);
  const remaining = JOURNEY_MINUTES - workedBeforeBreak;
  const saida = addMinutes(breakEnd, remaining);

  return {
    breakWindowStart: toHHMM(breakWindowStart),
    breakWindowEnd:   toHHMM(breakWindowEnd),
    retorno:          toHHMM(addMinutes(breakStart, BREAK_MINUTES)),
    saida:            toHHMM(saida),
  };
}

function calcBalance(punches) {
  if (!punches.entrada || !punches.saida) return null;
  const entrada = parseHHMM(punches.entrada);
  const saida   = parseHHMM(punches.saida);
  const breakMins =
    punches.saidaIntervalo && punches.retornoIntervalo
      ? diffMinutes(parseHHMM(punches.retornoIntervalo), parseHHMM(punches.saidaIntervalo))
      : BREAK_MINUTES;
  const worked  = diffMinutes(saida, entrada) - breakMins;
  return worked - JOURNEY_MINUTES;
}

function calcDayBalance(day) {
  if (!day.entrada || !day.saida) return null;
  return calcBalance(day);
}

// ── Phase logic ───────────────────────────────────────────────────────────────

const PHASES = {
  pending:    { label: 'Aguardando', btn: 'Registrar Entrada',          status: 'gray'   },
  working1:   { label: 'Trabalhando', btn: 'Saída para Intervalo',       status: 'green'  },
  onBreak:    { label: 'Em Intervalo', btn: 'Retorno do Intervalo',      status: 'yellow' },
  working2:   { label: 'Trabalhando', btn: 'Registrar Saída',            status: 'green'  },
  done:       { label: 'Dia Encerrado', btn: null,                       status: 'blue'   },
};

function getPhase({ entrada, saidaIntervalo, retornoIntervalo, saida }) {
  if (!entrada) return 'pending';
  if (!saidaIntervalo) return 'working1';
  if (!retornoIntervalo) return 'onBreak';
  if (!saida) return 'working2';
  return 'done';
}

// ── Countdown ─────────────────────────────────────────────────────────────────

function Countdown({ targetHHMM }) {
  const [diff, setDiff] = useState(null);

  useEffect(() => {
    const tick = () => {
      const target = parseHHMM(targetHHMM);
      const now = new Date();
      const d = diffMinutes(target, now);
      setDiff(d);
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, [targetHHMM]);

  if (diff === null) return null;
  if (diff <= 0) return <span className="p-countdown p-countdown--past">agora</span>;
  return (
    <span className="p-countdown">
      em {fmtDuration(diff)}
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PontoApp() {
  const [today, setToday] = useState(getToday);
  const [punches, setPunches] = useState(() => loadDay(getToday()));
  const [now, setNow] = useState(new Date());
  const [history, setHistory] = useState(loadHistory);
  const [showHistory, setShowHistory] = useState(false);

  // Clock tick
  useEffect(() => {
    const id = setInterval(() => {
      const newNow = new Date();
      setNow(newNow);
      const newToday = newNow.toISOString().slice(0, 10);
      if (newToday !== today) {
        setToday(newToday);
        setPunches(loadDay(newToday));
        setHistory(loadHistory());
      }
    }, 1000);
    return () => clearInterval(id);
  }, [today]);

  const register = useCallback(() => {
    const time = toHHMM(new Date());
    setPunches((prev) => {
      let next;
      if (!prev.entrada)           next = { ...prev, entrada: time };
      else if (!prev.saidaIntervalo)   next = { ...prev, saidaIntervalo: time };
      else if (!prev.retornoIntervalo) next = { ...prev, retornoIntervalo: time };
      else if (!prev.saida)            next = { ...prev, saida: time };
      else return prev;
      saveDay(today, next);
      if (next.entrada && next.saida) setHistory(loadHistory());
      return next;
    });
  }, [today]);

  const undo = useCallback(() => {
    setPunches((prev) => {
      const order = ['saida', 'retornoIntervalo', 'saidaIntervalo', 'entrada'];
      const next = { ...prev };
      for (const key of order) {
        if (next[key]) { delete next[key]; break; }
      }
      saveDay(today, next);
      return next;
    });
  }, [today]);

  const phase       = getPhase(punches);
  const phaseInfo   = PHASES[phase];
  const suggestions = calcSuggestions(punches);
  const balance     = calcBalance(punches);

  const PUNCH_LABELS = [
    { key: 'entrada',           label: 'Entrada'          },
    { key: 'saidaIntervalo',    label: 'Saída Intervalo'  },
    { key: 'retornoIntervalo',  label: 'Retorno'          },
    { key: 'saida',             label: 'Saída'            },
  ];

  const hasPunches = Object.keys(punches).length > 0;

  return (
    <div className="p-app">
      {/* ── Header ─────────────────────────────── */}
      <header className="p-header">
        <a href="/" className="p-back">← sarpa.dev</a>
        <div className="p-header-center">
          <h1 className="p-title">Controle de Ponto</h1>
          <p className="p-date">{fmtDate(today)}</p>
        </div>
        <span className={`p-badge p-badge--${phaseInfo.status}`}>
          {phaseInfo.label}
        </span>
      </header>

      <main className="p-main">
        {/* ── Relógio + Botão ────────────────────── */}
        <section className="p-card p-punch-card">
          <div className="p-clock">
            {toHHMM(now)}
            <span className="p-clock-seconds">
              :{String(now.getSeconds()).padStart(2, '0')}
            </span>
          </div>

          {phase !== 'done' ? (
            <>
              <button className="p-btn" onClick={register}>
                {phaseInfo.btn}
              </button>

              {phase === 'working1' && suggestions && (
                <p className="p-hint">
                  Intervalo recomendado: <strong>{suggestions.breakWindowStart}</strong> – <strong>{suggestions.breakWindowEnd}</strong>
                  <Countdown targetHHMM={suggestions.breakWindowStart} />
                </p>
              )}
              {phase === 'onBreak' && suggestions && (
                <p className="p-hint">
                  Retorno às <strong>{suggestions.retorno}</strong>
                  <Countdown targetHHMM={suggestions.retorno} />
                </p>
              )}
              {phase === 'working2' && suggestions && (
                <p className="p-hint">
                  Saída prevista: <strong>{suggestions.saida}</strong>
                  <Countdown targetHHMM={suggestions.saida} />
                </p>
              )}
            </>
          ) : (
            <div className={`p-balance-big ${balance >= 0 ? 'pos' : 'neg'}`}>
              <span className="p-balance-label">Saldo do dia</span>
              <span className="p-balance-value">{fmtBalance(balance)}</span>
            </div>
          )}

          {hasPunches && (
            <button className="p-undo" onClick={undo} title="Desfazer última batida">
              ↩ desfazer última
            </button>
          )}
        </section>

        {/* ── Batidas de hoje ────────────────────── */}
        <section className="p-card">
          <h2 className="p-card-title">Batidas de hoje</h2>
          <div className="p-timeline">
            {PUNCH_LABELS.map(({ key, label }, i) => (
              <div
                key={key}
                className={`p-tl-item ${punches[key] ? 'p-tl-item--done' : 'p-tl-item--pending'}`}
              >
                <div className="p-tl-dot" />
                {i < 3 && <div className="p-tl-line" />}
                <div className="p-tl-info">
                  <span className="p-tl-label">{label}</span>
                  <span className="p-tl-time">{punches[key] ?? '—'}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Cálculos ───────────────────────────── */}
        {suggestions && (
          <section className="p-card">
            <h2 className="p-card-title">Cálculos do dia</h2>
            <div className="p-calcs">
              <div className="p-calc-row">
                <span>Entrada</span>
                <span>{punches.entrada}</span>
              </div>
              <div className="p-calc-row">
                <span>Janela de intervalo</span>
                <span>{suggestions.breakWindowStart} – {suggestions.breakWindowEnd}</span>
              </div>
              <div className="p-calc-row">
                <span>Retorno (após 1h)</span>
                <span>{suggestions.retorno}</span>
              </div>
              <div className="p-calc-row p-calc-row--accent">
                <span>Saída para 8h de trabalho</span>
                <span>{suggestions.saida}</span>
              </div>
              {balance !== null && (
                <div className={`p-calc-row p-calc-row--balance ${balance >= 0 ? 'pos' : 'neg'}`}>
                  <span>Saldo do dia</span>
                  <span>{fmtBalance(balance)}</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Histórico ──────────────────────────── */}
        {history.length > 0 && (
          <section className="p-card">
            <div className="p-card-titlerow">
              <h2 className="p-card-title">Histórico</h2>
              <button
                className="p-toggle"
                onClick={() => setShowHistory((v) => !v)}
              >
                {showHistory ? 'Ocultar' : `Ver ${history.length} dias`}
              </button>
            </div>

            {showHistory && (
              <div className="p-history">
                {history.map((day) => {
                  const bal = calcDayBalance(day);
                  return (
                    <div key={day.date} className="p-hist-row">
                      <span className="p-hist-date">{fmtShortDate(day.date)}</span>
                      <span className="p-hist-punches">
                        {[day.entrada, day.saidaIntervalo, day.retornoIntervalo, day.saida]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
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
