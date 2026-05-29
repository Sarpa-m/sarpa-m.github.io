import { useState, useEffect, useRef, useCallback } from 'react';
import './Ponto.css';
import './Pomodoro.css';

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  sessionsUntilLong: 4,
};

const STORAGE_CONFIG   = 'pomodoro_config';
const STORAGE_SESSIONS = 'pomodoro_sessions';

const MODE_LABELS = { focus: 'Foco', shortBreak: 'Pausa Curta', longBreak: 'Pausa Longa' };
const MODE_COLORS = { focus: '#818cf8', shortBreak: '#4ade80', longBreak: '#22d3ee' };

// ── Storage helpers ───────────────────────────────────────────────────────────

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_CONFIG);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_CONFIG };
}

function loadSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_SESSIONS);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.date === new Date().toISOString().slice(0, 10)) return data.count;
    }
  } catch {}
  return 0;
}

function persistSessions(count) {
  localStorage.setItem(STORAGE_SESSIONS, JSON.stringify({
    date: new Date().toISOString().slice(0, 10),
    count,
  }));
}

// ── Audio ─────────────────────────────────────────────────────────────────────

let audioCtx = null;

function ensureAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playAlarmSound() {
  try {
    const ctx = ensureAudioCtx();
    const melody = [
      [880,  0.00], [1108, 0.25], [1319, 0.50],
      [880,  0.85], [1108, 1.10], [1568, 1.35],
    ];
    melody.forEach(([freq, t]) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const at = ctx.currentTime + t;
      gain.gain.setValueAtTime(0.45, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.22);
      osc.start(at);
      osc.stop(at + 0.22);
    });
  } catch {}
}

// ── Notifications ─────────────────────────────────────────────────────────────

function notify(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body, icon: '/favicon.svg' }); } catch {}
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getModeSeconds(mode, config) {
  if (mode === 'focus')      return config.focusMinutes * 60;
  if (mode === 'shortBreak') return config.shortBreakMinutes * 60;
  return config.longBreakMinutes * 60;
}

function fmtTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function clampInt(val, min, max, fallback) {
  const n = parseInt(val, 10);
  if (isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PomodoroApp() {
  const [config,       setConfig]       = useState(loadConfig);
  const [draftConfig,  setDraftConfig]  = useState(loadConfig);
  const [mode,         setMode]         = useState('focus');
  const [timeLeft,     setTimeLeft]     = useState(() => getModeSeconds('focus', loadConfig()));
  const [isRunning,    setIsRunning]    = useState(false);
  const [sessions,     setSessions]     = useState(loadSessions);
  const [showSettings, setShowSettings] = useState(false);
  const [alarmActive,  setAlarmActive]  = useState(false);

  // Refs to break stale-closure issues inside effects
  const modeRef        = useRef(mode);
  const configRef      = useRef(config);
  const sessionsRef    = useRef(sessions);
  const tickRef        = useRef({ startedAt: 0, startedWith: 0 });
  const alarmTimerRef  = useRef(null);

  useEffect(() => { modeRef.current     = mode;     }, [mode]);
  useEffect(() => { configRef.current   = config;   }, [config]);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  // ── Alarm ──────────────────────────────────────────────────────────────────

  const stopAlarm = useCallback(() => {
    clearInterval(alarmTimerRef.current);
    setAlarmActive(false);
  }, []);

  const triggerAlarm = useCallback((finishedMode, newSessionCount) => {
    setAlarmActive(true);
    playAlarmSound();
    alarmTimerRef.current = setInterval(playAlarmSound, 4000);

    if (finishedMode === 'focus') {
      notify('Pomodoro concluído! 🍅', `Sessão #${newSessionCount} completa. Hora de descansar!`);
    } else {
      notify('Pausa encerrada!', 'Hora de focar.');
    }
  }, []);

  // ── Timer end ─────────────────────────────────────────────────────────────

  const handleTimerEnd = useCallback(() => {
    const currentMode    = modeRef.current;
    const currentSession = sessionsRef.current;
    const cfg            = configRef.current;

    let newSessions = currentSession;
    let nextMode;

    if (currentMode === 'focus') {
      newSessions = currentSession + 1;
      persistSessions(newSessions);
      setSessions(newSessions);
      nextMode = newSessions % cfg.sessionsUntilLong === 0 ? 'longBreak' : 'shortBreak';
    } else {
      nextMode = 'focus';
    }

    triggerAlarm(currentMode, newSessions);
    setMode(nextMode);
    setTimeLeft(getModeSeconds(nextMode, cfg));
    setIsRunning(false);
  }, [triggerAlarm]);

  // ── Tick ──────────────────────────────────────────────────────────────────
  // Uses Date.now() so the timer stays accurate even when tab is throttled.

  useEffect(() => {
    if (!isRunning) return;

    tickRef.current = { startedAt: Date.now(), startedWith: timeLeft };

    const id = setInterval(() => {
      const elapsed   = Math.floor((Date.now() - tickRef.current.startedAt) / 1000);
      const remaining = tickRef.current.startedWith - elapsed;

      if (remaining <= 0) {
        clearInterval(id);
        setTimeLeft(0);
        handleTimerEnd();
      } else {
        setTimeLeft(remaining);
      }
    }, 500);

    return () => clearInterval(id);
  }, [isRunning]); // intentionally omits timeLeft — captured via tickRef on start

  // ── Notification permission ───────────────────────────────────────────────

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────

  const start = () => {
    ensureAudioCtx(); // unlock audio on user gesture
    stopAlarm();
    setIsRunning(true);
  };

  const pause = () => setIsRunning(false);

  const reset = () => {
    stopAlarm();
    setIsRunning(false);
    setTimeLeft(getModeSeconds(mode, config));
  };

  const switchMode = (newMode) => {
    stopAlarm();
    setIsRunning(false);
    setMode(newMode);
    setTimeLeft(getModeSeconds(newMode, config));
  };

  const openSettings = () => {
    setDraftConfig({ ...config });
    setShowSettings(true);
  };

  const saveSettings = () => {
    const validated = {
      focusMinutes:      clampInt(draftConfig.focusMinutes,      1, 99, 25),
      shortBreakMinutes: clampInt(draftConfig.shortBreakMinutes, 1, 60, 5),
      longBreakMinutes:  clampInt(draftConfig.longBreakMinutes,  1, 60, 15),
      sessionsUntilLong: clampInt(draftConfig.sessionsUntilLong, 1, 10, 4),
    };
    setConfig(validated);
    setDraftConfig(validated);
    localStorage.setItem(STORAGE_CONFIG, JSON.stringify(validated));
    setShowSettings(false);
    setIsRunning(false);
    setTimeLeft(getModeSeconds(mode, validated));
  };

  // ── Ring SVG ──────────────────────────────────────────────────────────────

  const RADIUS       = 110;
  const STROKE       = 8;
  const CIRCUMF      = 2 * Math.PI * RADIUS;
  const totalSecs    = getModeSeconds(mode, config);
  const remaining    = totalSecs > 0 ? timeLeft / totalSecs : 0; // 1→0 as time passes
  const dashOffset   = CIRCUMF * (1 - remaining);               // 0→CIRCUMF

  // ── Dots ─────────────────────────────────────────────────────────────────

  const filledDots = sessions % config.sessionsUntilLong;
  const modeColor  = MODE_COLORS[mode];

  return (
    <div className="p-app pm-app">

      {/* Header */}
      <header className="p-header">
        <a href="/" className="p-back">← sarpa.dev</a>
        <div className="p-header-center">
          <h1 className="p-title">Pomodoro</h1>
        </div>
        <button
          className="p-toggle"
          onClick={showSettings ? () => setShowSettings(false) : openSettings}
        >
          {showSettings ? 'Fechar' : 'Configurar'}
        </button>
      </header>

      <main className="p-main pm-main">

        {/* Mode tabs */}
        <div className="pm-tabs">
          {Object.entries(MODE_LABELS).map(([key, label]) => (
            <button
              key={key}
              className={`pm-tab ${mode === key ? 'pm-tab--active' : ''}`}
              style={mode === key ? { color: MODE_COLORS[key], borderColor: MODE_COLORS[key] } : {}}
              onClick={() => switchMode(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Timer ring */}
        <div className="pm-ring-wrap" style={{ '--mode-color': modeColor }}>
          <svg className="pm-ring-svg" viewBox="0 0 260 260" aria-hidden="true">
            <circle
              cx="130" cy="130" r={RADIUS}
              className="pm-ring-track"
              strokeWidth={STROKE}
            />
            <circle
              cx="130" cy="130" r={RADIUS}
              className="pm-ring-fill"
              strokeWidth={STROKE}
              strokeDasharray={CIRCUMF}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 130 130)"
            />
          </svg>
          <div className="pm-ring-inner">
            <div className="pm-time" style={{ color: modeColor }}>{fmtTime(timeLeft)}</div>
            <div className="pm-mode-label">{MODE_LABELS[mode]}</div>
          </div>
        </div>

        {/* Alarm banner */}
        {alarmActive && (
          <div className="pm-alarm" style={{ borderColor: modeColor }}>
            <span className="pm-alarm-msg">
              {mode === 'focus' ? 'Hora de focar!' : 'Pausa encerrada!'}
            </span>
            <button className="pm-alarm-stop" onClick={stopAlarm}>Parar alarme</button>
          </div>
        )}

        {/* Controls */}
        <div className="pm-controls">
          {!isRunning ? (
            <button className="p-btn pm-btn-start" onClick={start} style={{ background: modeColor }}>
              {timeLeft === totalSecs ? 'Iniciar' : 'Continuar'}
            </button>
          ) : (
            <button className="p-btn pm-btn-pause" onClick={pause}>Pausar</button>
          )}
          <button className="p-toggle pm-btn-reset" onClick={reset}>↺ Reiniciar</button>
        </div>

        {/* Session dots */}
        <div className="pm-sessions">
          <div className="pm-dots">
            {Array.from({ length: config.sessionsUntilLong }).map((_, i) => (
              <div key={i} className={`pm-dot ${i < filledDots ? 'pm-dot--done' : ''}`} />
            ))}
          </div>
          <span className="pm-sessions-label">
            {sessions} pomodoro{sessions !== 1 ? 's' : ''} hoje
            {sessions > 0 && ` · ciclo ${Math.ceil(sessions / config.sessionsUntilLong)}`}
          </span>
        </div>

        {/* Settings */}
        {showSettings && (
          <section className="p-card pm-settings">
            <h2 className="p-card-title">Configurações</h2>

            <div className="pm-settings-grid">
              <label className="pm-field">
                <span>Foco</span>
                <div className="pm-field-row">
                  <input
                    type="number" min="1" max="99"
                    className="pm-num-input"
                    value={draftConfig.focusMinutes}
                    onChange={e => setDraftConfig(d => ({ ...d, focusMinutes: e.target.value }))}
                  />
                  <span className="pm-unit">min</span>
                </div>
              </label>

              <label className="pm-field">
                <span>Pausa curta</span>
                <div className="pm-field-row">
                  <input
                    type="number" min="1" max="60"
                    className="pm-num-input"
                    value={draftConfig.shortBreakMinutes}
                    onChange={e => setDraftConfig(d => ({ ...d, shortBreakMinutes: e.target.value }))}
                  />
                  <span className="pm-unit">min</span>
                </div>
              </label>

              <label className="pm-field">
                <span>Pausa longa</span>
                <div className="pm-field-row">
                  <input
                    type="number" min="1" max="60"
                    className="pm-num-input"
                    value={draftConfig.longBreakMinutes}
                    onChange={e => setDraftConfig(d => ({ ...d, longBreakMinutes: e.target.value }))}
                  />
                  <span className="pm-unit">min</span>
                </div>
              </label>

              <label className="pm-field">
                <span>Sessões até pausa longa</span>
                <div className="pm-field-row">
                  <input
                    type="number" min="1" max="10"
                    className="pm-num-input"
                    value={draftConfig.sessionsUntilLong}
                    onChange={e => setDraftConfig(d => ({ ...d, sessionsUntilLong: e.target.value }))}
                  />
                  <span className="pm-unit">x</span>
                </div>
              </label>
            </div>

            <button className="p-btn pm-save-btn" onClick={saveSettings}>
              Salvar configurações
            </button>
          </section>
        )}

      </main>
    </div>
  );
}
