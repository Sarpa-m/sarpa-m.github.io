import { useState, useEffect, useCallback, useRef } from 'react';
import './Sod.css';

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'csvFiltroState';

// ── CSV Parser ────────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length < 2) return null;

  const splitLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === ';' && !inQuotes) { result.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    result.push(current.trim());
    return result;
  };

  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map(line => {
    const cols = splitLine(line);
    while (cols.length < headers.length) cols.push('');
    return cols.slice(0, headers.length);
  });

  return { headers, rows };
}

function getFilteredOptions(headers, rows, filterValues, colIndex) {
  let filtered = rows;
  for (let i = 0; i < colIndex; i++) {
    const val = (filterValues[i] || '').trim();
    if (val) filtered = filtered.filter(row => (row[i] || '').trim() === val);
  }
  return [...new Set(filtered.map(row => (row[colIndex] || '').trim()).filter(Boolean))];
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, type, onDismiss }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, type === 'warning' ? 5000 : 3000);
    return () => clearTimeout(timer);
  }, [message, type, onDismiss]);

  if (!message) return null;

  const icons = { success: '✓', warning: '⚠', info: 'ℹ', error: '✗' };
  return (
    <div className={`sod-toast sod-toast--${type}`} onClick={onDismiss}>
      <span className="sod-toast-icon">{icons[type] || 'ℹ'}</span>
      <span className="sod-toast-msg">{message}</span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SodApp() {
  // ── State ──────────────────────────────────────────────────────────────────

  const restore = (key, fallback) => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p[key] !== undefined) return p[key];
      }
    } catch { /* vazio ou corrompido */ }
    return fallback;
  };

  const [csvHeaders, setCsvHeaders] = useState(() => restore('csvHeaders', []));
  const [csvData, setCsvData] = useState(() => restore('csvData', []));
  const [savedTableRows, setSavedTableRows] = useState(() => restore('savedTableRows', []));

  const colCount = csvHeaders.length;
  const csvLoaded = colCount > 0;

  const [filterValues, setFilterValues] = useState(() =>
    csvLoaded ? restore('filterValues', new Array(colCount).fill('')) : []
  );

  const [enabledMask, setEnabledMask] = useState(() =>
    csvLoaded ? new Array(colCount).fill(false).map((_, i) => i === 0) : []
  );

  const [locked, setLocked] = useState(() =>
    csvLoaded ? csvHeaders.map((_, i) => i === 0) : []
  );

  const [editingRowIndex, setEditingRowIndex] = useState(-1);
  const [toast, setToast] = useState({ message: '', type: 'info' });
  const [highlightRow, setHighlightRow] = useState(-1);

  const fileInputRef = useRef(null);
  const inputRefs = useRef([]);
  const dropZoneRef = useRef(null);
  const dragCounter = useRef(0);
  const [dragOver, setDragOver] = useState(false);

  // ── Persist ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!csvLoaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      csvHeaders, csvData, savedTableRows, filterValues,
    }));
  }, [csvHeaders, csvData, savedTableRows, filterValues, csvLoaded]);

  // ── Toast helper ───────────────────────────────────────────────────────────

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
  }, []);

  const dismissToast = useCallback(() => {
    setToast({ message: '', type: 'info' });
  }, []);

  // ── Datalist ───────────────────────────────────────────────────────────────

  const getDatalistOptions = useCallback((colIndex) => {
    if (!csvLoaded) return [];
    return getFilteredOptions(csvHeaders, csvData, filterValues, colIndex);
  }, [csvLoaded, csvHeaders, csvData, filterValues]);

  // ── CSV Upload ─────────────────────────────────────────────────────────────

  const processFile = useCallback((file) => {
    if (!file || !file.name.toLowerCase().endsWith('.csv')) {
      showToast('Por favor, selecione um arquivo .csv', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (re) => {
      const parsed = parseCSV(re.target.result);
      if (!parsed) {
        showToast('CSV inválido. O arquivo precisa ter cabeçalho e pelo menos uma linha de dados separados por ponto e vírgula (;).', 'error');
        return;
      }

      setCsvHeaders(parsed.headers);
      setCsvData(parsed.rows);
      setSavedTableRows([]);
      setFilterValues(new Array(parsed.headers.length).fill(''));
      setEnabledMask(new Array(parsed.headers.length).fill(false).map((_, i) => i === 0));
      setLocked(parsed.headers.map((_, i) => i === 0));
      setEditingRowIndex(-1);
      setHighlightRow(-1);

      showToast(`${parsed.rows.length.toLocaleString('pt-BR')} linhas carregadas com ${parsed.headers.length} colunas.`, 'success');
    };
    reader.readAsText(file, 'UTF-8');
  }, [showToast]);

  const handleFileInput = useCallback((e) => {
    const file = e.target.files[0];
    if (file) processFile(file);
    e.target.value = '';
  }, [processFile]);

  // Drag & drop
  const handleDragEnter = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current++;
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragOver(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    setDragOver(false);
    dragCounter.current = 0;
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  // ── Save Row ───────────────────────────────────────────────────────────────

  const saveRowData = useCallback((rowData) => {
    let updatedRows, rowIdx;

    if (editingRowIndex >= 0) {
      updatedRows = [...savedTableRows];
      updatedRows[editingRowIndex] = rowData;
      rowIdx = editingRowIndex;
      setSavedTableRows(updatedRows);
      setEditingRowIndex(-1);
      showToast('Linha atualizada com sucesso.', 'success');
    } else {
      updatedRows = [...savedTableRows, rowData];
      rowIdx = updatedRows.length - 1;
      setSavedTableRows(updatedRows);
      showToast('Linha adicionada.', 'success');
    }

    // Highlight da nova linha
    setHighlightRow(rowIdx);
    setTimeout(() => setHighlightRow(-1), 1200);

    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      csvHeaders, csvData, savedTableRows: updatedRows,
    }));

    // ── Smart Reset ──
    let firstEmptyIndex = -1;
    const nextValues = [...rowData];
    const nextMask = [...enabledMask];
    let currentFilteredData = csvData;

    locked.forEach((isLocked, i) => {
      if (!isLocked) {
        nextValues[i] = '';
        if (firstEmptyIndex === -1) firstEmptyIndex = i;
      }
    });

    let cascadeValid = true;
    csvHeaders.forEach((_, i) => {
      if (i === 0) {
        nextMask[i] = true;
        if ((nextValues[i] || '').trim() === '') cascadeValid = false;
      } else {
        const prevVal = (nextValues[i - 1] || '').trim();
        if (cascadeValid && prevVal !== '') {
          currentFilteredData = currentFilteredData.filter(row => (row[i - 1] || '').trim() === prevVal);
          nextMask[i] = true;
          if ((nextValues[i] || '').trim() === '') cascadeValid = false;
        } else {
          nextMask[i] = false;
          cascadeValid = false;
        }
      }
    });

    setFilterValues(nextValues);
    setEnabledMask(nextMask);

    if (firstEmptyIndex !== -1) {
      setTimeout(() => {
        if (inputRefs.current[firstEmptyIndex]) {
          inputRefs.current[firstEmptyIndex].focus();
        }
      }, 80);
    }
  }, [editingRowIndex, savedTableRows, csvHeaders, csvData, locked, enabledMask, showToast]);

  // ── Filter change (cascata) ────────────────────────────────────────────────

  const handleInputChange = useCallback((changedIndex) => {
    const value = (filterValues[changedIndex] || '').trim();
    if (!value) return;

    const validOptions = getFilteredOptions(csvHeaders, csvData, filterValues, changedIndex);
    if (validOptions.length > 0 && !validOptions.includes(value)) {
      showToast(`"${value}" não encontrado na lista de opções da coluna "${csvHeaders[changedIndex]}". O valor será mantido, mas verifique.`, 'warning');
    }

    const nextValues = [...filterValues];
    const nextMask = [...enabledMask];
    for (let i = changedIndex + 1; i < colCount; i++) {
      nextValues[i] = '';
      nextMask[i] = false;
    }

    const nextIndex = changedIndex + 1;

    if (nextIndex < colCount) {
      nextMask[nextIndex] = true;
      setFilterValues(nextValues);
      setEnabledMask(nextMask);
      setTimeout(() => {
        if (inputRefs.current[nextIndex]) inputRefs.current[nextIndex].focus();
      }, 60);
    } else {
      setFilterValues(nextValues);
      setEnabledMask(nextMask);
      saveRowData(filterValues.map((v, i) => i <= changedIndex ? v : nextValues[i]));
    }
  }, [filterValues, enabledMask, csvHeaders, csvData, colCount, saveRowData, showToast]);

  // ── Edit Row ───────────────────────────────────────────────────────────────

  const editRow = useCallback((rowIndex) => {
    setEditingRowIndex(rowIndex);
    const rowData = savedTableRows[rowIndex];
    setFilterValues([...rowData]);
    setEnabledMask(csvHeaders.map(() => true));
    showToast(`Editando linha ${rowIndex + 1} — preencha até o último campo para salvar.`, 'info');
    setTimeout(() => {
      if (inputRefs.current[0]) inputRefs.current[0].focus();
      document.getElementById('sod-filters-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, [savedTableRows, csvHeaders, showToast]);

  // ── Delete Row ─────────────────────────────────────────────────────────────

  const deleteRow = useCallback((rowIndex) => {
    const updated = savedTableRows.filter((_, i) => i !== rowIndex);
    setSavedTableRows(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ csvHeaders, csvData, savedTableRows: updated }));
    showToast('Linha removida.', 'info');
  }, [savedTableRows, csvHeaders, csvData, showToast]);

  // ── Toggle Lock ────────────────────────────────────────────────────────────

  const toggleLock = useCallback((index) => {
    setLocked(prev => { const next = [...prev]; next[index] = !next[index]; return next; });
  }, []);

  // ── Export ─────────────────────────────────────────────────────────────────

  const exportToExcel = useCallback(() => {
    if (savedTableRows.length === 0) {
      showToast('A tabela está vazia.', 'warning');
      return;
    }
    let tsv = csvHeaders.join('\t') + '\n';
    savedTableRows.forEach(row => { tsv += row.join('\t') + '\n'; });
    navigator.clipboard.writeText(tsv).then(() => {
      showToast('Dados copiados! Cole no Excel com Ctrl+V.', 'success');
    }).catch(() => {
      showToast('Erro ao copiar. Verifique as permissões do navegador.', 'error');
    });
  }, [csvHeaders, savedTableRows, showToast]);

  // ── Reset ──────────────────────────────────────────────────────────────────

  const resetSession = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setCsvHeaders([]); setCsvData([]); setSavedTableRows([]);
    setFilterValues([]); setEnabledMask([]); setLocked([]);
    setEditingRowIndex(-1); setHighlightRow(-1);
    showToast('Sessão limpa.', 'info');
  }, [showToast]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-app">
      {/* Toast */}
      <Toast message={toast.message} type={toast.type} onDismiss={dismissToast} />

      {/* Header */}
      <header className="p-header">
        <a href="/" className="p-back">← sarpa.dev</a>
        <div className="p-header-center">
          <h1 className="p-title">Gerador de Tabela — SoD</h1>
          {csvLoaded && (
            <p className="p-date">
              {csvData.length.toLocaleString('pt-BR')} registros · {colCount} colunas
            </p>
          )}
        </div>
        <span className={`p-badge ${csvLoaded ? 'p-badge--green' : 'p-badge--gray'}`}>
          {csvLoaded ? 'ativo' : 'vazio'}
        </span>
      </header>

      <main className="p-main sod-main">

        {/* ── Step 1: Upload ────────────────────── */}
        <section className="p-card sod-upload-card">
          <div className="sod-section-head">
            <span className="sod-step-badge">1</span>
            <div>
              <h2 className="sod-section-title">Importar CSV</h2>
              <p className="sod-section-sub">Arquivo delimitado por ponto e vírgula (;)</p>
            </div>
            {csvLoaded && (
              <button className="p-danger-btn sod-reset-btn" onClick={resetSession}>
                Limpar tudo
              </button>
            )}
          </div>

          <div
            ref={dropZoneRef}
            className={`sod-dropzone ${dragOver ? 'sod-dropzone--active' : ''} ${csvLoaded ? 'sod-dropzone--loaded' : ''}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {csvLoaded ? (
              <div className="sod-dropzone-loaded">
                <div className="sod-file-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                </div>
                <div>
                  <p className="sod-dropzone-title">Arquivo carregado</p>
                  <p className="sod-dropzone-sub">{csvData.length.toLocaleString('pt-BR')} registros em {colCount} colunas</p>
                </div>
                <label className="sod-file-label">
                  <input ref={fileInputRef} type="file" accept=".csv" className="sod-file-input" onChange={handleFileInput} />
                  <span className="sod-file-btn sod-file-btn--sm">Trocar</span>
                </label>
              </div>
            ) : (
              <div className="sod-dropzone-empty">
                <div className="sod-dropzone-icon">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                </div>
                <p className="sod-dropzone-title">Arraste um arquivo .csv aqui</p>
                <p className="sod-dropzone-sub">ou clique para selecionar</p>
                <label className="sod-file-label">
                  <input ref={fileInputRef} type="file" accept=".csv" className="sod-file-input" onChange={handleFileInput} />
                  <span className="sod-file-btn">Escolher arquivo</span>
                </label>
              </div>
            )}
          </div>
        </section>

        {/* ── Step 2: Filters ────────────────────── */}
        {csvLoaded && (
          <section className="p-card" id="sod-filters-section">
            <div className="sod-section-head">
              <span className={`sod-step-badge ${editingRowIndex >= 0 ? 'sod-step-badge--edit' : ''}`}>2</span>
              <div>
                <h2 className="sod-section-title">
                  {editingRowIndex >= 0 ? 'Editando registro' : 'Seleção de Dados'}
                </h2>
                <p className="sod-section-sub">
                  {editingRowIndex >= 0
                    ? `Linha ${editingRowIndex + 1} — ajuste os campos e preencha até o final para confirmar`
                    : 'Preencha em ordem — cada escolha abre a próxima opção'}
                </p>
              </div>
              {editingRowIndex >= 0 && (
                <button className="p-toggle" onClick={() => {
                  setEditingRowIndex(-1);
                  setFilterValues(new Array(colCount).fill(''));
                  setEnabledMask(new Array(colCount).fill(false).map((_, i) => i === 0));
                  showToast('Edição cancelada.', 'info');
                }}>
                  Cancelar
                </button>
              )}
            </div>

            <div className="sod-hint-row">
              <span className="sod-hint-icon">🔒</span>
              <span>Cadeado = campo mantém o valor após adicionar. Clique para alternar.</span>
            </div>

            <div className="sod-filters">
              {csvHeaders.map((header, i) => {
                const isEnabled = enabledMask[i];
                const options = isEnabled ? getDatalistOptions(i) : [];
                const datalistId = `sod-dl-${i}`;
                const value = filterValues[i] || '';
                const isLocked = locked[i];
                const isEditing = editingRowIndex >= 0;

                return (
                  <div
                    key={i}
                    className={`sod-filter-row ${!isEnabled ? 'sod-filter-row--off' : ''} ${isEditing ? 'sod-filter-row--editing' : ''} ${isEnabled && !isEditing ? 'sod-filter-row--active' : ''}`}
                  >
                    <button
                      className={`sod-lock-btn ${isLocked ? 'sod-lock-btn--locked' : ''}`}
                      onClick={() => toggleLock(i)}
                      title={isLocked ? 'Destravar campo' : 'Travar campo'}
                      tabIndex={-1}
                    >
                      {isLocked ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none" stroke="currentColor" strokeWidth="2"/></svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      )}
                    </button>

                    <span className="sod-filter-num">{i + 1}</span>

                    <div className="sod-filter-field">
                      <span className="sod-filter-name">{header}</span>
                      {isEnabled && options.length > 0 && (
                        <span className="sod-filter-optcount">{options.length}</span>
                      )}
                    </div>

                    <div className="sod-filter-input-wrap">
                      <input
                        ref={el => inputRefs.current[i] = el}
                        type="text"
                        className={`sod-filter-input ${isEditing ? 'sod-filter-input--editing' : ''}`}
                        list={datalistId}
                        value={value}
                        disabled={!isEnabled}
                        placeholder={isEnabled ? `Selecione ou digite...` : '—'}
                        onChange={(e) => {
                          const next = [...filterValues];
                          next[i] = e.target.value;
                          setFilterValues(next);
                        }}
                        onBlur={() => {
                          if ((filterValues[i] || '').trim()) handleInputChange(i);
                        }}
                      />
                      {isEnabled && options.length > 0 && (
                        <datalist id={datalistId}>
                          {options.map((opt, oi) => <option key={oi} value={opt} />)}
                        </datalist>
                      )}
                    </div>

                    {!isEnabled && i <= enabledMask.findIndex(v => !v) && (
                      <span className="sod-filter-arrow">→</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Step 3: Results ────────────────────── */}
        {csvLoaded && (
          <section className="p-card sod-results-card">
            <div className="sod-section-head">
              <span className="sod-step-badge">3</span>
              <div>
                <h2 className="sod-section-title">Tabela Final</h2>
                <p className="sod-section-sub">
                  {savedTableRows.length > 0
                    ? `${savedTableRows.length} registro${savedTableRows.length !== 1 ? 's' : ''}`
                    : 'Nenhum registro adicionado ainda'}
                </p>
              </div>
              <button
                className={`p-btn sod-export-btn ${savedTableRows.length === 0 ? 'sod-export-btn--off' : ''}`}
                onClick={exportToExcel}
                disabled={savedTableRows.length === 0}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                Copiar para Excel
              </button>
            </div>

            {savedTableRows.length > 0 ? (
              <div className="sod-table-wrap">
                <table className="sod-table">
                  <thead>
                    <tr>
                      <th className="sod-th sod-th--idx">#</th>
                      {csvHeaders.map((h, i) => (
                        <th key={i} className="sod-th">{h}</th>
                      ))}
                      <th className="sod-th sod-th--act"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {savedTableRows.map((row, ri) => (
                      <tr key={ri} className={`sod-tr ${highlightRow === ri ? 'sod-tr--flash' : ''}`}>
                        <td className="sod-td sod-td--idx">{ri + 1}</td>
                        {row.map((cell, ci) => (
                          <td key={ci} className="sod-td" title={cell}>{cell}</td>
                        ))}
                        <td className="sod-td sod-td--act">
                          <button className="sod-action sod-action--edit" onClick={() => editRow(ri)} title="Editar">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>
                          <button className="sod-action sod-action--del" onClick={() => deleteRow(ri)} title="Remover">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="sod-empty-table">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.4">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
                </svg>
                <p>Preencha os filtros acima para montar a tabela.</p>
                <p className="sod-empty-hint">Ao completar o último campo, o registro é adicionado automaticamente.</p>
              </div>
            )}
          </section>
        )}

      </main>
    </div>
  );
}
