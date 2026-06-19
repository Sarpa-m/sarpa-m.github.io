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

/** Retorna { punches: string[], not_worked: boolean } */
const loadDay = (date) => {
  const raw = localStorage.getItem(storageKey(date));
  if (!raw) return { punches: [], not_worked: false };
  const parsed = JSON.parse(raw);
  // Novo formato: { punches, not_worked }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'punches' in parsed) {
    return { punches: parsed.punches || [], not_worked: !!parsed.not_worked };
  }
  // Migra formato antigo (array)
  if (Array.isArray(parsed)) return { punches: parsed, not_worked: false };
  // Migra formato legado (objeto com chaves nomeadas)
  if (typeof parsed === 'object' && parsed !== null) {
    const order = ['entrada', 'saidaIntervalo', 'retornoIntervalo', 'saida'];
    return { punches: order.map(k => parsed[k]).filter(Boolean), not_worked: false };
  }
  return { punches: [], not_worked: false };
};

const saveDay = (date, data) => {
  const payload = Array.isArray(data) ? { punches: data, not_worked: false } : data;
  localStorage.setItem(storageKey(date), JSON.stringify(payload));
};

const loadHistory = (days = 14) => {
  const hist = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const data = loadDay(dateStr);
    if (data.punches.length || data.not_worked) hist.push({ date: dateStr, ...data });
  }
  return hist;
};

/** Carrega todos os dias salvos no localStorage (para saldo acumulado e export) */
const loadAllDays = () => {
  const days = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('ponto_')) {
      const dateStr = key.replace('ponto_', '');
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const data = loadDay(dateStr);
        if (data.punches.length || data.not_worked) {
          days.push({ date: dateStr, ...data });
        }
      }
    }
  }
  days.sort((a, b) => a.date.localeCompare(b.date)); // ordem cronológica
  return days;
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

function calcDayBalance(punches, notWorked = false) {
  if (notWorked) return -JOURNEY; // dia não trabalhado conta como -8h
  if (!punches.length || punches.length % 2 !== 0) return null;
  return calcWorked(punches) - JOURNEY;
}

/** Saldo acumulado de todos os dias salvos */
function calcCumulativeBalance(allDays) {
  return allDays.reduce((acc, d) => {
    const bal = calcDayBalance(d.punches, d.not_worked);
    return acc + (bal || 0);
  }, 0);
}

/** Saldo projetado se bater o ponto AGORA (só faz sentido estando trabalhando) */
function calcProjectedBalance(punches, now) {
  if (!punches.length || punches.length % 2 === 0) return null;
  let total = 0;
  // Pares já fechados
  for (let i = 0; i + 1 < punches.length; i += 2) {
    const diff = diffMinutes(parseHHMM(punches[i + 1]), parseHHMM(punches[i]));
    if (diff > 0) total += diff;
  }
  // Sessão atual: do último punch até agora
  const lastEntry = parseHHMM(punches[punches.length - 1]);
  const currentDiff = diffMinutes(now, lastEntry);
  if (currentDiff > 0) total += currentDiff;
  return total - JOURNEY;
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
  const todayData = loadDay(getToday());
  const [today,       setToday]       = useState(getToday);
  const [punches,     setPunches]     = useState(todayData.punches);
  const [notWorked,   setNotWorked]   = useState(todayData.not_worked);
  const [now,         setNow]         = useState(new Date());
  const [inputTime,   setInputTime]   = useState(() => toHHMM(new Date()));
  const [history,     setHistory]     = useState(() => loadHistory(30));
  const [allDays,     setAllDays]     = useState(loadAllDays);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const inputTouched = useRef(false);

  // ── Edição de histórico ─────────────────────
  const [editingDate,   setEditingDate]   = useState(null);
  const [editPunches,   setEditPunches]   = useState([]);
  const [editNotWorked, setEditNotWorked] = useState(false);

  // ── Lançamento retroativo ──────────────────
  const [showRetroPick, setShowRetroPick] = useState(false);
  const [retroDate,     setRetroDate]     = useState('');

  // Clock tick
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      setNow(n);
      if (!inputTouched.current) setInputTime(toHHMM(n));
      const newToday = n.toISOString().slice(0, 10);
      if (newToday !== today) {
        setToday(newToday);
        const data = loadDay(newToday);
        setPunches(data.punches);
        setNotWorked(data.not_worked);
        setHistory(loadHistory(30));
        setAllDays(loadAllDays());
        inputTouched.current = false;
      }
    }, 1000);
    return () => clearInterval(id);
  }, [today]);

  const refreshAll = useCallback(() => {
    setHistory(loadHistory(30));
    setAllDays(loadAllDays());
  }, []);

  const save = useCallback((nextPunches, nextNotWorked) => {
    const nw = nextNotWorked !== undefined ? nextNotWorked : notWorked;
    saveDay(today, { punches: nextPunches, not_worked: nw });
    setPunches(nextPunches);
    setNotWorked(nw);
    refreshAll();
  }, [today, notWorked, refreshAll]);

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

  const toggleNotWorked = useCallback(() => {
    save(punches, !notWorked);
  }, [punches, notWorked, save]);

  const resetDay = useCallback(() => {
    save([], false);
    setConfirmReset(false);
    inputTouched.current = false;
    setInputTime(toHHMM(new Date()));
  }, [save]);

  // ── Edição de histórico ─────────────────────
  const startEditHistory = useCallback((dateStr, dayPunches, dayNotWorked) => {
    setEditingDate(dateStr);
    setEditPunches([...dayPunches]);
    setEditNotWorked(dayNotWorked);
  }, []);

  const cancelEditHistory = useCallback(() => {
    setEditingDate(null);
    setEditPunches([]);
    setEditNotWorked(false);
  }, []);

  const addEditPunch = useCallback(() => {
    setEditPunches(prev => [...prev, toHHMM(new Date())]);
  }, []);

  const editEditPunch = useCallback((i, val) => {
    setEditPunches(prev => { const n = [...prev]; n[i] = val; return n; });
  }, []);

  const removeEditPunch = useCallback((i) => {
    setEditPunches(prev => prev.filter((_, idx) => idx !== i));
  }, []);

  const saveHistoryEdit = useCallback(() => {
    if (!editingDate) return;
    saveDay(editingDate, { punches: editPunches, not_worked: editNotWorked });
    cancelEditHistory();
    refreshAll();
  }, [editingDate, editPunches, editNotWorked, cancelEditHistory, refreshAll]);

  // ── Lançamento retroativo ──────────────────
  const openRetroactive = useCallback(() => {
    // Abre o editor para uma data passada (nova ou existente)
    if (!retroDate) return;
    const existing = loadDay(retroDate);
    setEditingDate(retroDate);
    setEditPunches([...existing.punches]);
    setEditNotWorked(existing.not_worked);
    setShowRetroPick(false);
    setRetroDate('');
  }, [retroDate]);

  // ── Export / Import ─────────────────────────
  const exportData = useCallback(() => {
    const all = loadAllDays();
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      days: Object.fromEntries(all.map(d => [d.date, { punches: d.punches, not_worked: d.not_worked }])),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ponto-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const importData = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (re) => {
        try {
          const data = JSON.parse(re.target.result);
          if (!data.days || typeof data.days !== 'object') throw new Error('Formato inválido');
          let imported = 0;
          Object.entries(data.days).forEach(([dateStr, val]) => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr) && val && Array.isArray(val.punches)) {
              saveDay(dateStr, { punches: val.punches, not_worked: !!val.not_worked });
              imported++;
            }
          });
          alert(`${imported} dias importados com sucesso.`);
          refreshAll();
          // Se o dia de hoje foi importado, recarrega
          const td = getToday();
          const todayData = loadDay(td);
          if (todayData.punches.length || todayData.not_worked) {
            setPunches(todayData.punches);
            setNotWorked(todayData.not_worked);
          }
        } catch (err) {
          alert('Erro ao importar: ' + err.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [refreshAll]);

  const useNow = () => {
    setInputTime(toHHMM(new Date()));
    inputTouched.current = false;
  };

  const sugg             = calcSuggestions(punches);
  const balance          = calcBalance(punches);
  const projectedBalance = calcProjectedBalance(punches, now);
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
        <section className="p-card">
          <div className="p-card-titlerow">
            <h2 className="p-card-title">
              {notWorked ? 'Dia não trabalhado' : punches.length > 0 ? `Batidas de hoje (${punches.length})` : 'Nenhuma batida'}
            </h2>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <label className="p-notworked-toggle" style={{ marginRight: '0.25rem' }}>
                <input
                  type="checkbox"
                  checked={notWorked}
                  onChange={toggleNotWorked}
                />
                <span>Não trabalhei</span>
              </label>
              {punches.length > 0 && !confirmReset && (
                <button className="p-danger-btn" onClick={() => setConfirmReset(true)}>
                  Resetar dia
                </button>
              )}
              {confirmReset && (
                <span className="p-confirm-row">
                  Tem certeza?&nbsp;
                  <button className="p-danger-btn" onClick={resetDay}>Sim</button>
                  &nbsp;
                  <button className="p-toggle" onClick={() => setConfirmReset(false)}>Não</button>
                </span>
              )}
            </div>
          </div>

          {!notWorked && punches.length > 0 && (
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
          )}

          {notWorked && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '1rem 0' }}>
              Dia marcado como não trabalhado (−8h na contagem)
            </p>
          )}
        </section>

        {/* ── Resumo ──────────────────────────── */}
        <section className="p-card">
          <h2 className="p-card-title">Resumo</h2>
          {sugg ? (
            <div className="p-calcs">
              <div className="p-calc-row">
                <span>Trabalhado</span>
                <span>{fmtWorked(sugg.worked)}</span>
              </div>
              <div className="p-calc-row">
                <span>Restante</span>
                <span>{sugg.remaining > 0 ? fmtWorked(sugg.remaining) : '—'}</span>
              </div>
              {projectedBalance !== null && (
                <div className={`p-calc-row p-calc-row--balance ${projectedBalance >= 0 ? 'pos' : 'neg'}`}>
                  <span>Saldo projetado (agora)</span>
                  <span>{fmtBalance(projectedBalance)}</span>
                </div>
              )}
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
          ) : notWorked ? (
            <div className="p-calcs">
              <div className="p-calc-row p-calc-row--balance neg">
                <span>Saldo do dia</span>
                <span>{fmtBalance(-JOURNEY)}</span>
              </div>
            </div>
          ) : (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.5rem 0' }}>
              Registre sua entrada para ver o resumo
            </p>
          )}
          {/* Saldo acumulado */}
          {allDays.length > 0 && (() => {
            const cumBal = calcCumulativeBalance(allDays);
            return (
              <div className="p-cumulative">
                <span className="p-cumulative-label">Saldo acumulado ({allDays.length} dias)</span>
                <span className={`p-cumulative-value ${cumBal >= 0 ? 'pos' : 'neg'}`}>
                  {fmtBalance(cumBal)}
                </span>
              </div>
            );
          })()}
        </section>

        {/* ── Histórico ───────────────────────── */}
        <section className="p-card">
          <div className="p-card-titlerow">
            <h2 className="p-card-title">Histórico</h2>
            <div className="p-hist-actions">
              <button className="p-toggle" onClick={exportData} title="Exportar todos os dados">
                Exportar
              </button>
              <button className="p-toggle" onClick={importData} title="Importar backup">
                Importar
              </button>
              <button className="p-toggle" onClick={() => setShowHistory(v => !v)}>
                {showHistory ? 'Ocultar' : `Ver ${history.length} dias`}
              </button>
            </div>
          </div>

          {/* ── Lançamento retroativo ────────── */}
          <div className="p-retro-bar">
            {!showRetroPick ? (
              <button className="p-toggle" onClick={() => setShowRetroPick(true)}>
                + Lançamento retroativo
              </button>
            ) : (
              <span className="p-retro-picker">
                <input
                  type="date"
                  className="p-time-input p-time-input--sm"
                  value={retroDate}
                  max={today}
                  onChange={(e) => setRetroDate(e.target.value)}
                />
                <button className="p-btn p-btn--sm" onClick={openRetroactive} disabled={!retroDate}>
                  Criar / Editar
                </button>
                <button className="p-toggle" onClick={() => { setShowRetroPick(false); setRetroDate(''); }}>
                  Cancelar
                </button>
              </span>
            )}
          </div>

          {showHistory && (
            <div className="p-history">
              {/* Se está editando uma data que não está no histórico (retroativo novo) */}
              {editingDate && !history.some(h => h.date === editingDate) && (
                <div key={editingDate} className="p-hist-edit">
                  <div className="p-hist-edit-header">
                    <span className="p-hist-date">{fmtShortDate(editingDate)}</span>
                    <label className="p-notworked-toggle">
                      <input
                        type="checkbox"
                        checked={editNotWorked}
                        onChange={(e) => setEditNotWorked(e.target.checked)}
                      />
                      <span>Não trabalhei</span>
                    </label>
                  </div>
                  {!editNotWorked && (
                    <div className="p-punches-list p-hist-edit-punches">
                      {editPunches.map((time, i) => (
                        <div key={i} className={`p-punch-row ${isEntry(i) ? 'p-punch-row--entry' : 'p-punch-row--exit'}`}>
                          <span className="p-punch-row-label">{punchLabel(i)}</span>
                          <input
                            type="time"
                            className="p-time-input p-time-input--sm"
                            value={time}
                            onChange={(e) => editEditPunch(i, e.target.value)}
                          />
                          <button
                            className="p-remove-btn"
                            onClick={() => removeEditPunch(i)}
                            title="Remover batida"
                          >×</button>
                        </div>
                      ))}
                      <button className="p-add-punch-btn" onClick={addEditPunch}>
                        + Adicionar batida
                      </button>
                    </div>
                  )}
                  <div className="p-hist-edit-actions">
                    <button className="p-btn p-btn--sm" onClick={saveHistoryEdit}>Salvar</button>
                    <button className="p-toggle" onClick={cancelEditHistory}>Cancelar</button>
                  </div>
                </div>
              )}

              {history.map(({ date, punches: dp, not_worked: nw }) => {
                const isEditing = editingDate === date;
                const bal = calcDayBalance(dp, nw);
                const displayPunches = isEditing ? editPunches : dp;
                const displayNotWorked = isEditing ? editNotWorked : nw;

                if (isEditing) {
                  return (
                    <div key={date} className="p-hist-edit">
                      <div className="p-hist-edit-header">
                        <span className="p-hist-date">{fmtShortDate(date)}</span>
                        <label className="p-notworked-toggle">
                          <input
                            type="checkbox"
                            checked={displayNotWorked}
                            onChange={(e) => setEditNotWorked(e.target.checked)}
                          />
                          <span>Não trabalhei</span>
                        </label>
                      </div>
                      {!displayNotWorked && (
                        <div className="p-punches-list p-hist-edit-punches">
                          {displayPunches.map((time, i) => (
                            <div key={i} className={`p-punch-row ${isEntry(i) ? 'p-punch-row--entry' : 'p-punch-row--exit'}`}>
                              <span className="p-punch-row-label">{punchLabel(i)}</span>
                              <input
                                type="time"
                                className="p-time-input p-time-input--sm"
                                value={time}
                                onChange={(e) => editEditPunch(i, e.target.value)}
                              />
                              <button
                                className="p-remove-btn"
                                onClick={() => removeEditPunch(i)}
                                title="Remover batida"
                              >×</button>
                            </div>
                          ))}
                          <button className="p-add-punch-btn" onClick={addEditPunch}>
                            + Adicionar batida
                          </button>
                        </div>
                      )}
                      <div className="p-hist-edit-actions">
                        <button className="p-btn p-btn--sm" onClick={saveHistoryEdit}>Salvar</button>
                        <button className="p-toggle" onClick={cancelEditHistory}>Cancelar</button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={date} className={`p-hist-row ${nw ? 'p-hist-row--notworked' : ''}`}>
                    <span className="p-hist-date">{fmtShortDate(date)}</span>
                    <span className="p-hist-punches">
                      {nw ? '— Não trabalhado —' : (dp.length ? dp.join(' · ') : '—')}
                    </span>
                    <span className={`p-hist-balance ${bal !== null && bal >= 0 ? 'pos' : 'neg'}`}>
                      {bal !== null ? fmtBalance(bal) : '—'}
                    </span>
                    <button
                      className="p-edit-btn"
                      onClick={() => startEditHistory(date, dp, nw)}
                      title="Editar dia"
                    >✎</button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
