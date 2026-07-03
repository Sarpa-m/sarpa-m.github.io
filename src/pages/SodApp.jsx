import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import './Sod.css';

const STORAGE_KEY = 'csvFiltroState';

// ── CSV Parser ────────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return null;
  const split = (line) => {
    const r = []; let c = '', q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === ';' && !q) { r.push(c.trim()); c = ''; }
      else c += ch;
    }
    r.push(c.trim()); return r;
  };
  const h = split(lines[0]);
  const rows = lines.slice(1).map(l => { const cols = split(l); while (cols.length < h.length) cols.push(''); return cols.slice(0, h.length); });
  return { headers: h, rows };
}

/** Opções da coluna `colIdx` considerando:
 *  - Colunas anteriores na ordem visual (columnOrder)
 *  - Se coluna anterior está em multi-select com itens → IN filter
 *  - Senão → exact match */
function getFilteredOptions(headers, rows, filterValues, columnOrder, colIdx, multiSelections) {
  let f = rows;
  const pos = columnOrder.indexOf(colIdx);
  for (let p = 0; p < pos; p++) {
    const col = columnOrder[p];
    const ms = multiSelections[col];
    if (ms && ms.size > 0) {
      f = f.filter(row => ms.has((row[col] || '').trim()));
    } else {
      const v = (filterValues[col] || '').trim();
      if (v) f = f.filter(row => (row[col] || '').trim() === v);
    }
  }
  return [...new Set(f.map(row => (row[colIdx] || '').trim()).filter(Boolean))];
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, type, onDismiss }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, type === 'warning' ? 5000 : 3000);
    return () => clearTimeout(t);
  }, [message, type, onDismiss]);
  if (!message) return null;
  const icons = { success: '✓', warning: '⚠', info: 'ℹ', error: '✗' };
  return <div className={`sod-toast sod-toast--${type}`} onClick={onDismiss}><span className="sod-toast-icon">{icons[type]}</span><span className="sod-toast-msg">{message}</span></div>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SodApp() {
  const restore = (key, fb) => { try { const r = localStorage.getItem(STORAGE_KEY); if (r) { const p = JSON.parse(r); if (p[key] !== undefined) return p[key]; } } catch {} return fb; };

  const [csvHeaders, setCsvHeaders] = useState(() => restore('csvHeaders', []));
  const [csvData, setCsvData] = useState(() => restore('csvData', []));
  const [savedTableRows, setSavedTableRows] = useState(() => restore('savedTableRows', []));
  const colCount = csvHeaders.length;
  const csvLoaded = colCount > 0;

  // Ordem visual: posição → índice original
  const [columnOrder, setColumnOrder] = useState(() => {
    const s = restore('columnOrder', null);
    return (s && s.length === (csvHeaders.length || s.length)) ? s : csvHeaders.map((_, i) => i);
  });

  // Estados indexados por coluna ORIGINAL
  const [filterValues, setFilterValues] = useState(() => csvLoaded ? new Array(colCount).fill('') : []);
  const [enabledMask, setEnabledMask] = useState(() => {
    if (!csvLoaded) return [];
    const m = new Array(colCount).fill(false);
    const co = restore('columnOrder', null) || columnOrder;
    m[co[0]] = true;
    return m;
  });
  const [locked, setLocked] = useState(() => csvLoaded ? new Array(colCount).fill(false) : []);

  // Multisseleção: { [colIdx]: Set }
  const [multiSelections, setMultiSelections] = useState({});
  const [openDropdownCol, setOpenDropdownCol] = useState(null); // qual coluna está com dropdown aberto

  const [editingRowIndex, setEditingRowIndex] = useState(-1);
  const [toast, setToast] = useState({ message: '', type: 'info' });
  const [highlightRow, setHighlightRow] = useState(-1);

  const fileInputRef = useRef(null);
  const inputRefs = useRef([]);
  const dragCounter = useRef(0);
  const [dragOver, setDragOver] = useState(false);
  const cascadeRef = useRef(null);

  // ── Persist ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!csvLoaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ csvHeaders, csvData, savedTableRows, columnOrder }));
  }, [csvHeaders, csvData, savedTableRows, columnOrder, csvLoaded]);

  // ── Toast ───────────────────────────────────────────────────────────────────

  const showToast = useCallback((m, t = 'info') => setToast({ message: m, type: t }), []);
  const dismissToast = useCallback(() => setToast({ message: '', type: 'info' }), []);

  // ── Datalist ───────────────────────────────────────────────────────────────

  const getOpts = useCallback((colIdx) => {
    if (!csvLoaded) return [];
    return getFilteredOptions(csvHeaders, csvData, filterValues, columnOrder, colIdx, multiSelections);
  }, [csvLoaded, csvHeaders, csvData, filterValues, columnOrder, multiSelections]);

  // ── CSV Upload ─────────────────────────────────────────────────────────────

  const processFile = useCallback((file) => {
    if (!file || !file.name.toLowerCase().endsWith('.csv')) { showToast('Selecione um .csv', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (re) => {
      const p = parseCSV(re.target.result);
      if (!p) { showToast('CSV inválido.', 'error'); return; }
      const n = p.headers.length;
      const order = p.headers.map((_, i) => i);
      const mask = new Array(n).fill(false); mask[order[0]] = true;
      setCsvHeaders(p.headers); setCsvData(p.rows); setSavedTableRows([]);
      setColumnOrder(order); setFilterValues(new Array(n).fill(''));
      setEnabledMask(mask); setLocked(new Array(n).fill(false));
      setMultiSelections({}); setEditingRowIndex(-1); setHighlightRow(-1);
      showToast(`${p.rows.length.toLocaleString('pt-BR')} linhas × ${n} colunas.`, 'success');
    };
    reader.readAsText(file, 'UTF-8');
  }, [showToast]);

  const handleFileInput = useCallback((e) => { const f = e.target.files[0]; if (f) processFile(f); e.target.value = ''; }, [processFile]);
  const handleDragEnter = useCallback((e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current++; setDragOver(true); }, []);
  const handleDragLeave = useCallback((e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current--; if (dragCounter.current === 0) setDragOver(false); }, []);
  const handleDragOver  = useCallback((e) => { e.preventDefault(); e.stopPropagation(); }, []);
  const handleDrop      = useCallback((e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); dragCounter.current = 0; const f = e.dataTransfer.files[0]; if (f) processFile(f); }, [processFile]);

  // ── Reorder ────────────────────────────────────────────────────────────────

  const reorder = useCallback((displayIdx, direction) => {
    const other = displayIdx + direction;
    if (other < 0 || other >= colCount) return;
    setColumnOrder(prev => {
      const next = [...prev];
      [next[displayIdx], next[other]] = [next[other], next[displayIdx]];
      // Habilita a primeira coluna da nova ordem
      const mask = new Array(colCount).fill(false);
      mask[next[0]] = true;
      setFilterValues(new Array(colCount).fill(''));
      setEnabledMask(mask);
      setMultiSelections({});
      setEditingRowIndex(-1);
      return next;
    });
  }, [colCount]);

  // ── Search filter dentro do painel multi-select ─────────────────────────────

  const [multiSearch, setMultiSearch] = useState({}); // { [colIdx]: string }

  // Quando seleciona itens no multi-select, ativa a próxima coluna na cascata
  useEffect(() => {
    Object.entries(multiSelections).forEach(([colStr, sel]) => {
      if (sel.size > 0) {
        const col = parseInt(colStr);
        const pos = columnOrder.indexOf(col);
        if (pos >= 0) {
          // Habilita este e o próximo campo
          setEnabledMask(prev => {
            let changed = false;
            const n = [...prev];
            if (!n[col]) { n[col] = true; changed = true; }
            if (pos + 1 < colCount) {
              const nextCol = columnOrder[pos + 1];
              if (!n[nextCol]) { n[nextCol] = true; changed = true; }
            }
            return changed ? n : prev;
          });
          // Foco no próximo campo (ou neste se for o último)
          const focusCol = pos + 1 < colCount ? columnOrder[pos + 1] : col;
          setTimeout(() => {
            const el = inputRefs.current[focusCol];
            if (el && !multiSelections[focusCol]) el.focus();
          }, 60);
        }
      }
    });
  }, [multiSelections, columnOrder, colCount]);

  // ── Multi-select toggle ────────────────────────────────────────────────────

  const toggleMulti = useCallback((colIdx) => {
    setMultiSelections(prev => {
      const next = { ...prev };
      if (next[colIdx]) {
        delete next[colIdx];
        setOpenDropdownCol(null);
      } else {
        next[colIdx] = new Set();
        setOpenDropdownCol(colIdx);
      }
      return next;
    });
  }, []);

  const openMultiDropdown = useCallback((colIdx) => {
    if (multiSelections[colIdx]) setOpenDropdownCol(colIdx);
  }, [multiSelections]);

  const toggleMultiOpt = useCallback((colIdx, val) => {
    setMultiSelections(prev => {
      const next = { ...prev };
      const s = new Set(next[colIdx] || []);
      if (s.has(val)) s.delete(val); else s.add(val);
      next[colIdx] = s;
      return next;
    });
  }, []);

  const selectAll = useCallback((colIdx) => {
    const opts = getFilteredOptions(csvHeaders, csvData, filterValues, columnOrder, colIdx, multiSelections);
    setMultiSelections(prev => ({ ...prev, [colIdx]: new Set(opts) }));
  }, [csvHeaders, csvData, filterValues, columnOrder, multiSelections]);

  const deselectAll = useCallback((colIdx) => {
    setMultiSelections(prev => ({ ...prev, [colIdx]: new Set() }));
  }, []);

  // Opções disponíveis para multisseleção (brutas, sem filtro interno da própria coluna)
  const getMultiOptions = useCallback((colIdx) => {
    if (!csvLoaded) return [];
    // Opções desta coluna filtradas apenas pelas colunas ANTERIORES
    return getFilteredOptions(csvHeaders, csvData, filterValues, columnOrder, colIdx, multiSelections);
  }, [csvLoaded, csvHeaders, csvData, filterValues, columnOrder, multiSelections]);

  // ── Save Row ───────────────────────────────────────────────────────────────

  const saveRow = useCallback((rowData) => {
    // Resolve colunas em multi-select: se a coluna tem multiSelections ativo,
    // tenta achar qual valor selecionado bate com o resto da linha
    const finalRow = [...rowData];
    Object.entries(multiSelections).forEach(([colStr, sel]) => {
      const col = parseInt(colStr);
      if (sel.size > 0 && !(finalRow[col] || '').trim()) {
        const match = [...sel].find(val =>
          csvData.some(row =>
            (row[col] || '').trim() === val &&
            csvHeaders.every((_, c) => c === col || !finalRow[c] || (row[c] || '').trim() === finalRow[c])
          )
        );
        if (match) finalRow[col] = match;
      }
    });

    let updatedRows;
    if (editingRowIndex >= 0) {
      updatedRows = [...savedTableRows];
      updatedRows[editingRowIndex] = finalRow;
      setSavedTableRows(updatedRows);
      setEditingRowIndex(-1);
    } else {
      updatedRows = [...savedTableRows, finalRow];
      setSavedTableRows(updatedRows);
    }

    const rowIdx = editingRowIndex >= 0 ? editingRowIndex : updatedRows.length - 1;
    setHighlightRow(rowIdx);
    setTimeout(() => setHighlightRow(-1), 1200);

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ csvHeaders, csvData, savedTableRows: updatedRows, columnOrder }));

    // Smart Reset: mantém campos travados, limpa destravados, reconstrói cascata
    const nextValues = [...finalRow];
    const nextMask = new Array(colCount).fill(false);
    let firstEmptyIdx = -1;

    locked.forEach((isLocked, col) => {
      if (!isLocked) { nextValues[col] = ''; if (firstEmptyIdx === -1) firstEmptyIdx = col; }
    });

    let cascadeValid = true;
    let curData = csvData;
    columnOrder.forEach((col, pos) => {
      if (pos === 0) {
        nextMask[col] = true;
        if (!(nextValues[col] || '').trim()) cascadeValid = false;
      } else {
        const prevCol = columnOrder[pos - 1];
        const prevVal = (nextValues[prevCol] || '').trim();
        const ms = multiSelections[prevCol];
        if (cascadeValid && (prevVal || (ms && ms.size > 0))) {
          if (ms && ms.size > 0) {
            curData = curData.filter(row => ms.has((row[prevCol] || '').trim()));
          } else if (prevVal) {
            curData = curData.filter(row => (row[prevCol] || '').trim() === prevVal);
          }
          nextMask[col] = true;
          if (!(nextValues[col] || '').trim()) cascadeValid = false;
        } else {
          nextMask[col] = false;
          cascadeValid = false;
        }
      }
    });

    setFilterValues(nextValues);
    setEnabledMask(nextMask);
    // Mantém multisseleções apenas das colunas travadas
    setMultiSelections(prev => {
      const kept = {};
      Object.entries(prev).forEach(([colStr, sel]) => {
        const c = parseInt(colStr);
        if (locked[c] && sel.size > 0) kept[c] = sel;
      });
      return kept;
    });

    if (firstEmptyIdx !== -1) {
      setTimeout(() => { const el = inputRefs.current[firstEmptyIdx]; if (el) el.focus(); }, 80);
    }
  }, [editingRowIndex, savedTableRows, csvHeaders, csvData, locked, columnOrder, multiSelections, colCount]);

  // ── Cascade ────────────────────────────────────────────────────────────────

  useEffect(() => { cascadeRef.current = cascadeFrom; });

  const cascadeFrom = useCallback((changedColIdx, currentValues, currentMask) => {
    const value = (currentValues[changedColIdx] || '').trim();
    if (!value) return;

    // Soft warning
    const validOpts = getFilteredOptions(csvHeaders, csvData, currentValues, columnOrder, changedColIdx, multiSelections);
    if (validOpts.length > 0 && !validOpts.includes(value)) {
      showToast(`"${value}" não encontrado em "${csvHeaders[changedColIdx]}".`, 'warning');
    }

    const displayPos = columnOrder.indexOf(changedColIdx);
    const nextValues = [...currentValues];
    const nextMask = [...currentMask];

    // Limpa colunas posteriores na ordem visual
    for (let dp = displayPos + 1; dp < colCount; dp++) {
      const col = columnOrder[dp];
      nextValues[col] = '';
      nextMask[col] = false;
    }

    const nextDp = displayPos + 1;
    if (nextDp < colCount) {
      const nextCol = columnOrder[nextDp];
      nextMask[nextCol] = true;
      const nextOpts = getFilteredOptions(csvHeaders, csvData, nextValues, columnOrder, nextCol, multiSelections);

      if (nextOpts.length === 1) {
        nextValues[nextCol] = nextOpts[0];
        setFilterValues(nextValues);
        setEnabledMask(nextMask);
        setTimeout(() => cascadeRef.current?.(nextCol, nextValues, nextMask), 60);
      } else {
        setFilterValues(nextValues);
        setEnabledMask(nextMask);
        setTimeout(() => { const el = inputRefs.current[nextCol]; if (el) el.focus(); }, 60);
      }
    } else {
      setFilterValues(nextValues);
      setEnabledMask(nextMask);
      saveRow(nextValues);
    }
  }, [csvHeaders, csvData, colCount, columnOrder, multiSelections, saveRow, showToast]);

  const handleInputChange = useCallback((colIdx) => {
    if (!(filterValues[colIdx] || '').trim()) return;
    cascadeFrom(colIdx, filterValues, enabledMask);
  }, [filterValues, enabledMask, cascadeFrom]);

  // ── Edit / Delete ───────────────────────────────────────────────────────────

  const editRow = useCallback((ri) => {
    setEditingRowIndex(ri);
    setFilterValues([...savedTableRows[ri]]);
    setEnabledMask(new Array(colCount).fill(true));
    setMultiSelections({});
    showToast(`Editando linha ${ri + 1}.`, 'info');
    setTimeout(() => {
      const el = inputRefs.current[columnOrder[0]];
      if (el) el.focus();
      document.getElementById('sod-filters-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, [savedTableRows, colCount, columnOrder, showToast]);

  const deleteRow = useCallback((ri) => {
    const up = savedTableRows.filter((_, i) => i !== ri);
    setSavedTableRows(up);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ csvHeaders, csvData, savedTableRows: up, columnOrder }));
    showToast('Linha removida.', 'info');
  }, [savedTableRows, csvHeaders, csvData, columnOrder, showToast]);

  // ── Export / Reset ─────────────────────────────────────────────────────────

  const exportToExcel = useCallback(() => {
    if (!savedTableRows.length) { showToast('Tabela vazia.', 'warning'); return; }
    const tsv = csvHeaders.join('\t') + '\n' + savedTableRows.map(r => r.join('\t')).join('\n');
    navigator.clipboard.writeText(tsv).then(() => showToast('Copiado para Excel.', 'success')).catch(() => showToast('Erro ao copiar.', 'error'));
  }, [csvHeaders, savedTableRows, showToast]);

  const resetSession = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setCsvHeaders([]); setCsvData([]); setSavedTableRows([]); setColumnOrder([]);
    setFilterValues([]); setEnabledMask([]); setLocked([]);
    setMultiSelections({}); setEditingRowIndex(-1); setHighlightRow(-1);
    showToast('Sessão limpa.', 'info');
  }, [showToast]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-app">
      <Toast message={toast.message} type={toast.type} onDismiss={dismissToast} />

      <header className="p-header">
        <a href="/" className="p-back">← sarpa.dev</a>
        <div className="p-header-center"><h1 className="p-title">Gerador de Tabela — SoD</h1>{csvLoaded && <p className="p-date">{csvData.length.toLocaleString('pt-BR')} registros · {colCount} colunas</p>}</div>
        <span className={`p-badge ${csvLoaded ? 'p-badge--green' : 'p-badge--gray'}`}>{csvLoaded ? 'ativo' : 'vazio'}</span>
      </header>

      <main className="p-main sod-main">

        {/* 1. Upload */}
        <section className="p-card sod-upload-card">
          <div className="sod-section-head"><span className="sod-step-badge">1</span><div><h2 className="sod-section-title">Importar CSV</h2><p className="sod-section-sub">Delimitador: ponto e vírgula (;)</p></div>{csvLoaded && <button className="p-danger-btn sod-reset-btn" onClick={resetSession}>Limpar tudo</button>}</div>
          <div className={`sod-dropzone ${dragOver ? 'sod-dropzone--active' : ''} ${csvLoaded ? 'sod-dropzone--loaded' : ''}`}
            onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
            {csvLoaded ? (
              <div className="sod-dropzone-loaded">
                <div className="sod-file-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>
                <div><p className="sod-dropzone-title">Arquivo carregado</p><p className="sod-dropzone-sub">{csvData.length.toLocaleString('pt-BR')} registros em {colCount} colunas</p></div>
                <label className="sod-file-label"><input ref={fileInputRef} type="file" accept=".csv" className="sod-file-input" onChange={handleFileInput} /><span className="sod-file-btn sod-file-btn--sm">Trocar</span></label>
              </div>
            ) : (
              <div className="sod-dropzone-empty">
                <div className="sod-dropzone-icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>
                <p className="sod-dropzone-title">Arraste um arquivo .csv aqui</p><p className="sod-dropzone-sub">ou clique para selecionar</p>
                <label className="sod-file-label"><input ref={fileInputRef} type="file" accept=".csv" className="sod-file-input" onChange={handleFileInput} /><span className="sod-file-btn">Escolher arquivo</span></label>
              </div>
            )}
          </div>
        </section>

        {/* 2. Filters */}
        {csvLoaded && (
          <section className="p-card" id="sod-filters-section">
            <div className="sod-section-head">
              <span className={`sod-step-badge ${editingRowIndex >= 0 ? 'sod-step-badge--edit' : ''}`}>2</span>
              <div>
                <h2 className="sod-section-title">{editingRowIndex >= 0 ? 'Editando registro' : 'Seleção de Dados'}</h2>
                <p className="sod-section-sub">{editingRowIndex >= 0 ? `Linha ${editingRowIndex + 1}` : '⬆⬆ reordena · 🔒 trava · ☐ multisseleção em qualquer coluna'}</p>
              </div>
              {editingRowIndex >= 0 && (
                <button className="p-toggle" onClick={() => { setEditingRowIndex(-1); setFilterValues(new Array(colCount).fill('')); const m = new Array(colCount).fill(false); m[columnOrder[0]] = true; setEnabledMask(m); setMultiSelections({}); showToast('Edição cancelada.', 'info'); }}>Cancelar</button>
              )}
            </div>

            <div className="sod-filters">
              {columnOrder.map((colIdx, displayIdx) => {
                const header = csvHeaders[colIdx];
                const isEnabled = enabledMask[colIdx];
                const value = filterValues[colIdx] || '';
                const isMulti = !!multiSelections[colIdx];
                const ms = multiSelections[colIdx];
                const msSize = ms ? ms.size : 0;
                const options = isEnabled ? getOpts(colIdx) : [];
                const multiOpts = isMulti && isEnabled ? getMultiOptions(colIdx) : [];
                const isEditing = editingRowIndex >= 0;

                return (
                  <div key={colIdx} className={`sod-filter-row ${!isEnabled ? 'sod-filter-row--off' : ''} ${isEditing ? 'sod-filter-row--editing' : ''} ${isEnabled && !isEditing ? 'sod-filter-row--active' : ''}`}>

                    {/* Reorder */}
                    <div className="sod-reorder">
                      <button className="sod-reorder-btn" onClick={() => reorder(displayIdx, -1)} disabled={displayIdx === 0} title="Mover para cima">▲</button>
                      <button className="sod-reorder-btn" onClick={() => reorder(displayIdx, 1)} disabled={displayIdx === colCount - 1} title="Mover para baixo">▼</button>
                    </div>

                    {/* Lock */}
                    <button className={`sod-lock-btn ${locked[colIdx] ? 'sod-lock-btn--locked' : ''}`} onClick={() => setLocked(prev => { const n = [...prev]; n[colIdx] = !n[colIdx]; return n; })} title={locked[colIdx] ? 'Destravar' : 'Travar'} tabIndex={-1}>
                      {locked[colIdx] ? (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none" stroke="currentColor" strokeWidth="2"/></svg>
                      ) : (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      )}
                    </button>

                    <span className="sod-filter-num">{displayIdx + 1}</span>

                    <div className="sod-filter-field">
                      <span className="sod-filter-name">{header}</span>
                      {isEnabled && !isMulti && options.length > 0 && <span className="sod-filter-optcount">{options.length}</span>}
                      {isMulti && msSize > 0 && <span className="sod-filter-optcount sod-filter-optcount--multi">{msSize}</span>}
                    </div>

                    {/* Input ou display multi-select */}
                    <div className="sod-filter-input-wrap">
                      {isMulti ? (
                        <div className="sod-multi-display" onClick={() => openMultiDropdown(colIdx)}>
                          {msSize > 0 ? (
                            <span className="sod-multi-display-text">
                              {msSize} selecionado{msSize !== 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className="sod-multi-display-text sod-multi-display-text--empty">
                              Clique para selecionar...
                            </span>
                          )}
                          <span className="sod-multi-display-arrow">▼</span>
                        </div>
                      ) : (
                        <input
                          ref={el => inputRefs.current[colIdx] = el}
                          type="text" className={`sod-filter-input ${isEditing ? 'sod-filter-input--editing' : ''}`}
                          list={`sod-dl-${colIdx}`} value={value} disabled={!isEnabled}
                          placeholder={isEnabled ? 'Selecione ou digite...' : '—'}
                          onChange={(e) => { const n = [...filterValues]; n[colIdx] = e.target.value; setFilterValues(n); }}
                          onBlur={() => { if ((filterValues[colIdx] || '').trim()) handleInputChange(colIdx); }}
                        />
                      )}
                      {isEnabled && options.length > 0 && !isMulti && (
                        <datalist id={`sod-dl-${colIdx}`}>{options.map((o, oi) => <option key={oi} value={o} />)}</datalist>
                      )}
                    </div>

                    {/* Dropdown flutuante */}
                    {isMulti && openDropdownCol === colIdx && (
                      <>
                        <div className="sod-dropdown-backdrop" onClick={() => setOpenDropdownCol(null)} />
                        <div className="sod-dropdown" onClick={e => e.stopPropagation()}>
                          <input
                            type="text" className="sod-dropdown-search"
                            placeholder="Buscar opções..."
                            value={multiSearch[colIdx] || ''}
                            onChange={(e) => setMultiSearch(prev => ({ ...prev, [colIdx]: e.target.value }))}
                            autoFocus
                          />
                          <div className="sod-dropdown-actions">
                            <button className="sod-dropdown-act" onClick={() => selectAll(colIdx)}>Selecionar todos</button>
                            <button className="sod-dropdown-act" onClick={() => deselectAll(colIdx)}>Limpar</button>
                            <span style={{flex:1}} />
                            <span style={{fontFamily:'var(--font-mono)',fontSize:'0.58rem',color:'var(--text-muted)'}}>
                              {msSize}/{multiOpts.length}
                            </span>
                          </div>
                          <div className="sod-dropdown-opts">
                            {(() => {
                              const search = (multiSearch[colIdx] || '').toLowerCase();
                              const filtered = search
                                ? multiOpts.filter(o => o.toLowerCase().includes(search))
                                : multiOpts;
                              if (filtered.length === 0) return <div className="sod-dropdown-empty">Nenhuma opção encontrada</div>;
                              return filtered.map(opt => (
                                <label key={opt} className={`sod-dropdown-opt ${ms && ms.has(opt) ? 'sod-dropdown-opt--sel' : ''}`}>
                                  <input type="checkbox" checked={ms ? ms.has(opt) : false} onChange={() => toggleMultiOpt(colIdx, opt)} />
                                  <span>{opt}</span>
                                </label>
                              ));
                            })()}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Toggle multi-select */}
                    {!isEditing && isEnabled && (
                      <button
                        className={`sod-multi-toggle ${isMulti ? (msSize > 0 ? 'sod-multi-toggle--has' : 'sod-multi-toggle--on') : ''}`}
                        onClick={() => toggleMulti(colIdx)}
                        title={isMulti ? 'Voltar para texto' : 'Multisseleção'}
                      >
                        {isMulti && msSize > 0 ? msSize : '☐'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 3. Results */}
        {csvLoaded && (
          <section className="p-card sod-results-card">
            <div className="sod-section-head">
              <span className="sod-step-badge">3</span>
              <div><h2 className="sod-section-title">Tabela Final</h2><p className="sod-section-sub">{savedTableRows.length > 0 ? `${savedTableRows.length} registro${savedTableRows.length !== 1 ? 's' : ''}` : 'Nenhum'}</p></div>
              <button className={`p-btn sod-export-btn ${savedTableRows.length === 0 ? 'sod-export-btn--off' : ''}`} onClick={exportToExcel} disabled={savedTableRows.length === 0}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copiar para Excel
              </button>
            </div>
            {savedTableRows.length > 0 ? (
              <div className="sod-table-wrap">
                <table className="sod-table">
                  <thead><tr><th className="sod-th sod-th--idx">#</th>{csvHeaders.map((h, i) => <th key={i} className="sod-th">{h}</th>)}<th className="sod-th sod-th--act"></th></tr></thead>
                  <tbody>{savedTableRows.map((row, ri) => (
                    <tr key={ri} className={`sod-tr ${highlightRow === ri ? 'sod-tr--flash' : ''}`}>
                      <td className="sod-td sod-td--idx">{ri + 1}</td>
                      {row.map((cell, ci) => <td key={ci} className="sod-td" title={cell}>{cell}</td>)}
                      <td className="sod-td sod-td--act">
                        <button className="sod-action sod-action--edit" onClick={() => editRow(ri)} title="Editar"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                        <button className="sod-action sod-action--del" onClick={() => deleteRow(ri)} title="Remover"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : (
              <div className="sod-empty-table">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                <p>Preencha os filtros para montar a tabela.</p>
                <p className="sod-empty-hint">Use ☐ para multisseleção em qualquer coluna.</p>
              </div>
            )}
          </section>
        )}

      </main>
    </div>
  );
}
