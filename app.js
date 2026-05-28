// Chord Timing Tester — App Logic
'use strict';

// --- Storage Keys ---
const K = {
  ENTRIES: 'ctt_entries',
  SETTINGS: 'ctt_settings',
  LIBRARY: 'ctt_library',
};

// --- Utility Functions ---
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { console.warn('Storage write failed:', e); }
}

// --- Settings ---
const Settings = {
  get() { return { theme: 'dark', caseInsensitive: true, ...load(K.SETTINGS, {}) }; },
  save(s) { save(K.SETTINGS, s); },
};

// --- Library ---
const Library = {
  get() { return load(K.LIBRARY, null); },
  save(lib) { save(K.LIBRARY, lib); },
  clear() { localStorage.removeItem(K.LIBRARY); },
};

// --- Entries ---
const Entries = {
  getAll() { return load(K.ENTRIES, []); },
  saveAll(arr) { save(K.ENTRIES, arr); },
  add(entry) { const all = Entries.getAll(); all.push(entry); Entries.saveAll(all); },
  removeByIds(ids) { const all = Entries.getAll().filter(e => !ids.includes(e.id)); Entries.saveAll(all); },
  clear() { save(K.ENTRIES, []); },
};

// --- DOM Helpers ---
function $(id) { return document.getElementById(id); }
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function setText(el, txt) { el.textContent = txt; }
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function cmp(a, b) {
  return Settings.get().caseInsensitive
    ? String(a).toLowerCase() === String(b).toLowerCase()
    : String(a) === String(b);
}
function decodeOutputHex(raw) {
  const hex = String(raw || '').trim();
  if (!hex) return '';
  if (hex.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(hex)) {
    const bytes = [];
    for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
    const decoded = bytes.map(b => String.fromCharCode(b)).join('');
    if (/^[\x20-\x7e]+$/.test(decoded)) return decoded;
  }
  return hex;
}
function decodeInputHex(hex) {
  const h = String(hex || '').trim();
  if (!/^[0-9a-fA-F]{32}$/.test(h)) return [];
  const bits = h.split('').map(c => parseInt(c, 16).toString(2).padStart(4, '0')).join('');
  const slots = [];
  for (let off = 8; off < 128; off += 10) slots.push(parseInt(bits.slice(off, off + 10), 2));
  return slots.filter(c => c !== 0).reverse();
}
function formatChordKeys(codes) {
  if (!codes?.length) return '';
  return codes.join('+');
}

// --- CharaChorder Module (Serial API + JSON import) ---
const CC = (() => {
  // Extended action-code → character map for US-International / German AltGr combos.
  const CC_CHAR_MAP = {
    780:'\u00f6', 781:'\u00e4', 783:'\u00df', 789:'\u00fc',
    748:'\u00d6', 749:'\u00c4', 757:'\u00dc',
    701:'\u00a1', 704:'\u00a3', 706:'\u00bd', 710:'\u00be', 711:'\u00f7',
    712:'\u00e7', 713:'\u00a5', 715:'\u00bf', 716:'\u2019', 717:'\u00b9',
    718:'\u00b2', 719:'\u00b3', 720:'\u00a4', 721:'\u20ac', 725:'\u2018',
    726:'\u00b0', 727:'\u00b6', 728:'\u00c7', 729:'\u00d7', 733:'\u00c1',
    735:'\u00a2', 736:'\u00d0', 737:'\u00c9', 741:'\u00cd', 742:'\u00cf',
    743:'\u0152', 744:'\u00d8', 745:'\u00b1', 746:'\u00d1', 747:'\u00d3',
    750:'\u00cb', 751:'\u00a7', 752:'\u00de', 753:'\u00da', 754:'\u2122',
    755:'\u00c5', 758:'\u00c6', 759:'\u00ab', 760:'\u00ac', 761:'\u00bb',
    762:'\u00bc', 765:'\u00e1', 766:'\u00b7', 767:'\u00a9', 768:'\u00f0',
    769:'\u00e9', 773:'\u00ed', 774:'\u00ef', 775:'\u0153', 776:'\u00f8',
    777:'\u00b5', 778:'\u00f1', 779:'\u00f3', 782:'\u00eb', 784:'\u00fe',
    785:'\u00fa', 786:'\u00ae', 787:'\u00e5', 790:'\u00e6', 791:'\u201c',
    792:'\u00a6', 793:'\u201d',
  };

  function decodeActionCodes(arr) {
    if (!Array.isArray(arr)) return '';
    return arr.map(code => {
      if (!code) return '';
      if (code >= 1 && code <= 255) return String.fromCharCode(code);
      return CC_CHAR_MAP[code] ?? '';
    }).join('');
  }

  function codeLabel(code) {
    const sp = {
      40:'↵', 41:'Esc', 42:'⌫', 43:'Tab', 44:'Spc',
      45:'-', 46:'=', 47:'[', 48:']', 49:'\\', 51:';', 52:"'", 53:'`', 54:',', 55:'.', 56:'/',
      79:'→', 80:'←', 81:'↓', 82:'↑',
      8:'⌫', 9:'Tab', 13:'↵', 27:'Esc', 32:'Spc', 300:'Spc',
    };
    if (sp[code] !== undefined) return sp[code];
    if (code >= 4  && code <= 29) return String.fromCharCode(code - 4 + 97); // a–z
    if (code >= 30 && code <= 38) return String.fromCharCode(code - 30 + 49); // 1–9
    if (code === 39) return '0';
    if (code >= 33 && code <= 126) return String.fromCharCode(code);
    if (code >= 160 && code <= 255) return String.fromCharCode(code);
    if (CC_CHAR_MAP[code]) return CC_CHAR_MAP[code];
    return `#${code}`;
  }

  function fmtKeys(codes) { return codes?.length ? codes.map(codeLabel).join('+') : ''; }

  // --- Serial helpers ---
  function parseCmlC0(line) {
    const m = String(line||'').trim().match(/^CML\s+C0\s+(\d+)$/);
    return m ? parseInt(m[1], 10) : null;
  }
  function parseCmlC1(line) {
    const m = String(line||'').trim().match(/^CML\s+C1\s+(\d+)\s+([0-9A-Fa-f]{32})\s+([0-9A-Fa-f]*)\s+(\d+)$/);
    if (!m) return null;
    return { index: parseInt(m[1], 10), inputHex: m[2].toUpperCase(), outputHex: m[3].toUpperCase() };
  }
  function combineSplitLines(lines) {
    const src = lines.map(l => String(l||'').trim()).filter(Boolean);
    const out = [];
    for (let i = 0; i < src.length; i++) {
      const cur = src[i], next = src[i+1];
      if ((cur === 'CML C0' || /^CML\s+C1\s+\d+$/.test(cur)) && /^CML\b/.test(next||'')) {
        out.push(`${cur} ${next.replace(/^CML\s*/, '')}`); i++;
      } else out.push(cur);
    }
    return out;
  }
  function notifyWaiters(s) { s.waiters.splice(0).forEach(r => r()); }
  function appendChunk(session, value, flush = false) {
    session.buffer += session.decoder.decode(value, { stream: !flush });
    const parts = session.buffer.replace(/\r/g, '').split('\n');
    session.buffer = parts.pop() || '';
    let added = false;
    for (const p of parts) { const l = p.trim(); if (l) { session.lines.push(l); added = true; } }
    if (flush && session.buffer.trim()) { session.lines.push(session.buffer.trim()); session.buffer = ''; added = true; }
    if (added) notifyWaiters(session);
  }
  async function openSession(port) {
    const reader = port.readable.getReader(), writer = port.writable.getWriter();
    const session = { reader, writer, decoder: new TextDecoder(), buffer: '', lines: [], waiters: [], closed: false, readError: null };
    session.readTask = (async () => {
      try { while (true) { const { value, done } = await reader.read(); if (done) break; if (value) appendChunk(session, value); } appendChunk(session, new Uint8Array(0), true); }
      catch (err) { session.readError = err; } finally { session.closed = true; notifyWaiters(session); }
    })();
    return session;
  }
  function waitForSignal(session, ms) {
    return new Promise(resolve => {
      let done = false;
      const w = () => { clearTimeout(tid); finish(false); };
      const finish = (to) => { if (done) return; done = true; resolve(to); };
      const tid = setTimeout(() => { const i = session.waiters.indexOf(w); if (i >= 0) session.waiters.splice(i, 1); finish(true); }, ms);
      session.waiters.push(w);
    });
  }
  async function readUntilMatch(session, startIdx, regex, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const lines = session.lines.slice(startIdx);
      if (regex && lines.some(l => regex.test(l))) return lines;
      if (session.readError) throw session.readError;
      if (session.closed) return lines;
      const timedOut = await waitForSignal(session, Math.max(1, deadline - Date.now()));
      if (timedOut) break;
    }
    if (session.readError) throw session.readError;
    return session.lines.slice(startIdx);
  }
  async function sendCommand(session, cmd, regex, timeoutMs = 5000) {
    const enc = new TextEncoder().encode(cmd + '\r\n');
    const startIdx = session.lines.length;
    await session.writer.write(enc);
    return readUntilMatch(session, startIdx, regex, timeoutMs);
  }

  // --- Public API ---
  function buildChordMap(entries) {
    const map = {};
    for (const e of entries) {
      if (!e.output || !e.inputCodes?.length) continue;
      const key = e.output.replace(/[\x00-\x1f\x7f]/g, '').toLowerCase().trim();
      if (!key) continue;
      if (!map[key] || e.inputCodes.length < map[key].keys.length)
        map[key] = { keys: e.inputCodes, display: fmtKeys(e.inputCodes) };
    }
    return map;
  }

  return {
    isSupported() { return 'serial' in navigator; },

    async connectAndSync(onProgress) {
      if (!this.isSupported()) throw new Error('Web Serial API not available. Use Chrome or Edge on https:// or http://localhost.');
      let port = null;
      try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 });
        await new Promise(r => setTimeout(r, 150));
        const session = await openSession(port);
        onProgress?.('Querying chord count…');
        const countLines = combineSplitLines(await sendCommand(session, 'CML C0', /^CML\s+C0\b/, 6000));
        const count = parseCmlC0(countLines.find(l => /^CML\s+C0\b/.test(l)));
        if (!Number.isFinite(count) || count < 0) throw new Error('Invalid chord count from device.');
        onProgress?.(`Found ${count} chords. Syncing…`);
        const entries = [];
        for (let i = 0; i < count; i++) {
          if (i % 100 === 0) onProgress?.(`Syncing chords… ${i}/${count}`);
          const re = new RegExp(`^CML\\s+C1\\s+${i}\\b`);
          const lines = combineSplitLines(await sendCommand(session, `CML C1 ${i}`, re, 5000));
          const parsed = parseCmlC1(lines.find(l => re.test(l)));
          if (!parsed) continue;
          const inputCodes = decodeInputHex(parsed.inputHex);
          const output     = decodeOutputHex(parsed.outputHex);
          if (output) entries.push({ inputCodes, output });
        }
        try { session.reader.releaseLock(); } catch {}
        try { session.writer.releaseLock(); } catch {}
        try { await port.close(); } catch {}
        const map = buildChordMap(entries);
        onProgress?.(`Done! Loaded ${entries.length} chords.`);
        return { source: 'serial', syncedAt: Date.now(), entryCount: entries.length, map };
      } catch (err) { try { await port?.close(); } catch {} throw err; }
    },

    importFromJson(json) {
      const data = JSON.parse(json);
      let entries = [];
      const toEntry = (obj) => ({
        inputCodes: obj.inputCodes || decodeInputHex(obj.inputHex || obj.chord || obj.input || ''),
        output: decodeOutputHex(obj.outputHex || obj.phrase || obj.output || obj.result || ''),
      });
      if      (data.entries && Array.isArray(data.entries))  entries = data.entries.map(toEntry);
      else if (data.chords  && Array.isArray(data.chords)) {
        if (data.chords.length > 0 && Array.isArray(data.chords[0])) {
          entries = data.chords.map(c => ({ inputCodes: c[0].filter(x => x !== 0), output: decodeActionCodes(c[1]) }));
        } else {
          entries = data.chords.map(toEntry);
        }
      }
      else if (data.library && Array.isArray(data.library))  entries = data.library.map(toEntry);
      else if (Array.isArray(data))                          entries = data.map(toEntry);
      // Chordtrainer saved chord map: { source, map: { word: { keys, display } } }
      else if (data.map && typeof data.map === 'object' && !Array.isArray(data.map)) {
        return { source: 'json', syncedAt: Date.now(), entryCount: Object.keys(data.map).length, map: data.map };
      }
      else if (typeof data === 'object') {
        for (const [word, val] of Object.entries(data)) {
          if (Array.isArray(val)) entries.push({ inputCodes: val, output: word });
          else if (typeof val === 'string') entries.push({ inputCodes: val.split('+').map(k => k.charCodeAt(0)), output: word });
        }
      }
      if (!entries.length) throw new Error('No chord entries found. Supported: CharaChorder backup JSON, charachorder.io Library JSON.');
      const map = buildChordMap(entries);
      if (!Object.keys(map).length) throw new Error(`Parsed ${entries.length} entries but produced 0 usable chords.`);
      return { source: 'json', syncedAt: Date.now(), entryCount: entries.length, map };
    },
  };
})();

// --- Lead-in Words State (shared between setupLeadIn and setupTest) ---
let leadInWordsList = [];

// --- Tab Navigation ---
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    $("tab-" + btn.dataset.tab).classList.add('active');
  });
});

// --- Theme Toggle ---
(function setupTheme() {
  const themeBtn = $('themeToggle');
  let theme = Settings.get().theme;
  document.documentElement.setAttribute('data-theme', theme);
  themeBtn.addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    Settings.save({ ...Settings.get(), theme });
  });
})();

// --- Library Tab Logic ---
(function setupLibrary() {
  const connectBtn  = $('ccConnectBtn');
  const importBtn   = $('ccImportBtn');
  const jsonInput   = $('ccJsonInput');
  const statusEl    = $('ccConnectStatus');
  const browserWarn = $('ccBrowserWarn');
  const clearBtn    = $('clearLibraryBtn');
  const searchInput = $('librarySearchInput');
  const table       = $('libraryTable');
  let lastFiltered = [];

  // Convert CC map { word: {keys, display} } → library entries [{ word, chord }]
  function mapToEntries(map) {
    return Object.entries(map)
      .map(([word, v]) => ({ word: String(word).trim(), chord: v.display || formatChordKeys(v.keys) || '' }))
      .filter(e => e.word && e.chord);
  }

  function renderTable(lib, filter = '') {
    if (!lib || !lib.entries) { table.innerHTML = '<div class="text-muted">No library loaded.</div>'; return; }
    const filtered = lib.entries.filter(e =>
      (!filter || e.word.toLowerCase().includes(filter.toLowerCase()))
    );
    lastFiltered = filtered;
    const rows = filtered.map((e, idx) =>
      `<tr><td>${escHtml(e.word)}</td><td>${escHtml(e.chord)}</td><td><button class="btn btn-secondary useLibraryBtn" data-idx="${idx}">Use</button></td></tr>`
    ).join('');
    table.innerHTML = `<table><thead><tr><th>Word</th><th>Chord</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
    table.querySelectorAll('.useLibraryBtn').forEach(btn => {
      btn.addEventListener('click', () => {
        const entry = lastFiltered[Number(btn.dataset.idx)];
        if (!entry) return;
        $('wordInput').value = entry.word;
        $('chordInput').value = entry.chord;
        document.querySelector('[data-tab="test"]').click();
      });
    });
  }

  function setStatus(msg, isError = false) {
    statusEl.textContent = msg;
    statusEl.className = 'cc-status-msg' + (isError ? ' cc-status-err' : msg.startsWith('✓') ? ' cc-status-ok' : '');
    statusEl.classList.remove('hidden');
  }

  // Show browser warning if Web Serial is unavailable
  if (!CC.isSupported()) browserWarn.classList.remove('hidden');

  // Connect via Web Serial
  connectBtn.addEventListener('click', async () => {
    connectBtn.disabled = true;
    setStatus('Connecting…');
    try {
      const result = await CC.connectAndSync(msg => setStatus(msg));
      const entries = mapToEntries(result.map);
      Library.save({ entries });
      setStatus(`✓ Loaded ${entries.length} chords from device.`);
      renderTable(Library.get());
    } catch (err) {
      setStatus('✗ ' + (err.message || 'Connection failed.'), true);
    } finally {
      connectBtn.disabled = false;
    }
  });

  // Import JSON file
  importBtn.addEventListener('click', () => jsonInput.click());

  jsonInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const result = CC.importFromJson(ev.target.result);
        const entries = mapToEntries(result.map);
        Library.save({ entries });
        setStatus(`✓ Loaded ${entries.length} chords from ${escHtml(file.name)}.`);
        renderTable(Library.get());
      } catch (err) {
        setStatus('✗ ' + err.message, true);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  clearBtn.addEventListener('click', () => {
    Library.clear();
    statusEl.textContent = '';
    statusEl.classList.add('hidden');
    renderTable(null);
  });

  searchInput.addEventListener('input', () => {
    renderTable(Library.get(), searchInput.value);
  });

  // On load — restore persisted library
  const lib = Library.get();
  if (lib) renderTable(lib);
})();

// --- Lead-in Words UI ---
(function setupLeadIn() {
  const tagsEl      = $('leadInTags');
  const addInput    = $('leadInAddInput');
  const addBtn      = $('leadInAddBtn');
  const fromLibBtn  = $('leadInFromLibraryBtn');
  const clearAllBtn = $('leadInClearBtn');
  const libPicker   = $('leadInLibPicker');
  const libSearch   = $('leadInLibSearch');
  const libClose    = $('leadInLibClose');
  const libList     = $('leadInLibList');
  const trackPause  = $('trackPauseCheckbox');

  function renderTags() {
    if (!leadInWordsList.length) {
      tagsEl.innerHTML = '<span class="lead-in-empty-hint text-muted">No lead-in words — testing in isolation mode.</span>';
      trackPause.disabled = true;
      trackPause.checked  = false;
      return;
    }
    tagsEl.innerHTML = leadInWordsList.map((w, i) =>
      `<span class="lead-in-tag">${escHtml(w)}<button class="lead-in-tag-remove" data-idx="${i}" title="Remove">×</button></span>`
    ).join('');
    tagsEl.querySelectorAll('.lead-in-tag-remove').forEach(btn =>
      btn.addEventListener('click', () => {
        leadInWordsList.splice(Number(btn.dataset.idx), 1);
        renderTags();
      })
    );
    trackPause.disabled = false;
    trackPause.checked  = true; // auto-enable when lead-in words are present
  }

  function addWord(word) {
    const w = word.trim();
    if (!w) return;
    if (!leadInWordsList.includes(w)) leadInWordsList.push(w);
    renderTags();
    addInput.value = '';
  }

  addBtn.addEventListener('click', () => addWord(addInput.value));
  addInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addWord(addInput.value); }
  });

  clearAllBtn.addEventListener('click', () => {
    leadInWordsList = [];
    renderTags();
  });

  function renderLibPicker(filter = '') {
    const lib = Library.get();
    if (!lib?.entries?.length) {
      libList.innerHTML = '<span class="text-muted" style="font-size:.84rem;padding:.25rem">No library loaded. Go to the Library tab first.</span>';
      return;
    }
    const f = filter.toLowerCase();
    const items = lib.entries.filter(e => !f || e.word.toLowerCase().includes(f)).slice(0, 120);
    if (!items.length) { libList.innerHTML = '<span class="text-muted" style="font-size:.84rem;padding:.25rem">No matches.</span>'; return; }
    libList.innerHTML = items.map(e =>
      `<button class="lead-in-lib-item${leadInWordsList.includes(e.word) ? ' added' : ''}" data-word="${escHtml(e.word)}">${escHtml(e.word)}</button>`
    ).join('');
    libList.querySelectorAll('.lead-in-lib-item:not(.added)').forEach(btn =>
      btn.addEventListener('click', () => { addWord(btn.dataset.word); renderLibPicker(libSearch.value); })
    );
  }

  fromLibBtn.addEventListener('click', () => {
    libPicker.classList.remove('hidden');
    libSearch.value = '';
    renderLibPicker();
    libSearch.focus();
  });
  libClose.addEventListener('click', () => libPicker.classList.add('hidden'));
  libSearch.addEventListener('input', () => renderLibPicker(libSearch.value));

  renderTags(); // initial render — disables checkbox when no words
})();

// --- Test Tab Logic ---
(function setupTest() {
  const wordInput    = $('wordInput');
  const chordInput   = $('chordInput');
  const loadFromLibraryBtn = $('loadFromLibraryBtn');
  const trackPauseCheckbox = $('trackPauseCheckbox');
  const startBtn     = $('startTestBtn');
  const testArea     = $('testArea');
  const roundLabel   = $('roundLabel');   // small hint text above word
  const wordDisplay  = $('wordDisplay');  // big word the user must type NOW
  const typingInput  = $('typingInput');
  const testStats    = $('testStats');
  const finishBtn    = $('finishTestBtn');
  const discardBtn   = $('discardTestBtn');

  let S = null; // active test state

  function updateStats(msg = '') {
    if (!S) return;
    const avg = S.roundsCorrect ? Math.round(S.totalDurationMs / S.roundsCorrect) : null;
    const avgText = avg != null ? ` | Avg: ${avg} ms` : '';
    const msgText = msg ? ` | ${msg}` : '';
    testStats.innerHTML =
      `Rounds: ${S.roundsTotal} | Correct: ${S.roundsCorrect} | Wrong: ${S.roundsWrong}${avgText}${msgText}`;
  }

  function resetArea() {
    clearTimeout(S?._outputTimeout);
    hide(testArea);
    testStats.innerHTML = '';
    typingInput.value = '';
    S = null;
  }

  // Called at the start of every round
  function beginRound() {
    clearTimeout(S._outputTimeout);
    typingInput.value = '';
    S.keydownTime = null;
    S.keyupTime   = null;
    S.keysHeld    = new Set();
    S.chordState  = 'idle'; // idle | pressing | released | done
    S.lastContextEnd = null;

    if (S.contextWords.length) {
      const ctx = S.contextWords[Math.floor(Math.random() * S.contextWords.length)];
      S.contextTarget = ctx;
      S.phase = 'context';
      setText(wordDisplay, ctx);
      setText(roundLabel, `\u2192 then: ${S.word}`);
    } else {
      S.phase = 'target';
      setText(wordDisplay, S.word);
      setText(roundLabel, '');
    }
    typingInput.focus();
    updateStats();
  }

  // Transition from context phase to target phase — called as soon as input matches context word
  function acceptContext() {
    if (S.trackPause) S.lastContextEnd = performance.now();
    typingInput.value = '';
    S.phase       = 'target';
    S.keydownTime = null;
    S.keyupTime   = null;
    S.keysHeld    = new Set();
    // Go idle immediately — no delay. If the context chord was still held when acceptContext
    // fired (intermediate chars matched), the device will output the context word as a chord
    // after release. That spurious chord is detected in the input handler (released state,
    // context word appears) and silently absorbed before any trial is recorded.
    S.chordState  = 'idle';
    clearTimeout(S._outputTimeout);
    setText(wordDisplay, S.word);
    setText(roundLabel, `\u2190 ${S.contextTarget}`);
    typingInput.focus();
    updateStats('Type target \u2192');
  }

  // Finalize the current target-phase round (called from input or timeout)
  function finalizeRound() {
    if (!S?.running || S.phase !== 'target' || S.chordState !== 'released') return;
    clearTimeout(S._outputTimeout);
    S.chordState = 'done'; // prevent double-finalize

    const typed     = typingInput.value.trim();
    const isCorrect = cmp(typed, S.word);
    const duration  = (S.keydownTime != null && S.keyupTime != null)
      ? Math.round(S.keyupTime - S.keydownTime)
      : null;
    let pause = null;
    if (S.trackPause && S.lastContextEnd != null && S.keydownTime != null) {
      pause = Math.round(S.keydownTime - S.lastContextEnd);
      if (pause >= 0) S.pauseDurations.push(pause);
    }
    S.roundsTotal++;
    if (isCorrect) {
      S.roundsCorrect++;
      if (duration != null) S.totalDurationMs += duration;
      S.trials.push({ duration, correct: true, pause });
      updateStats(duration != null ? `\u2713 ${duration} ms` : '\u2713');
    } else {
      S.roundsWrong++;
      S.trials.push({ duration, correct: false }); // save duration even for wrong rounds
      updateStats('\u2717 wrong');
    }
    typingInput.value = '';
    setTimeout(() => { if (S?.running) beginRound(); }, 220);
  }

  // Unified input handler — context acceptance + target word detection
  typingInput.addEventListener('input', () => {
    if (!S?.running) return;

    if (S.phase === 'context') {
      // Accept immediately when context word appears in input
      const val = typingInput.value.trim();
      if (val && cmp(val, S.contextTarget)) acceptContext();
      return;
    }

    if (S.phase === 'target') {
      if (S.chordState === 'idle') {
        // Any content arriving while idle is spurious device output from the context chord.
        // Clear it unconditionally so it cannot concatenate with the target chord output.
        if (typingInput.value) typingInput.value = '';
        return;
      }
      if (S.chordState !== 'released') return;
      const val = typingInput.value.trim();
      if (!val) { clearTimeout(S._outputTimeout); return; } // device clearing intermediate chars

      if (cmp(val, S.word)) {
        // Correct target word — finalize immediately
        finalizeRound();
      } else if (S.contextTarget && cmp(val, S.contextTarget)) {
        // Device output for the context chord arrived in target phase (chord was still held
        // when acceptContext fired). Absorb silently and reset — not a real target attempt.
        clearTimeout(S._outputTimeout);
        typingInput.value = '';
        S.keydownTime = null;
        S.keyupTime   = null;
        S.keysHeld    = new Set();
        S.chordState  = 'idle';
      } else {
        // Device is still outputting — debounce: wait until chars stop arriving, then finalize
        clearTimeout(S._outputTimeout);
        S._outputTimeout = setTimeout(() => {
          if (S?.running && S.chordState === 'released') finalizeRound();
        }, 50);
      }
    }
  });

  // Keydown: start chord timing (target phase, idle state only)
  typingInput.addEventListener('keydown', e => {
    if (!S?.running || S.phase !== 'target') return;
    if (e.key.length !== 1) return; // ignore Backspace, Enter, Shift, etc.
    if (e.key === ' ') return; // ignore space — CharaChorder trailing separator, must not start timing
    // released / done: ignore all keydowns (device output in progress)
    if (S.chordState !== 'idle' && S.chordState !== 'pressing') return;
    S.keysHeld.add(e.code);
    if (S.chordState === 'idle') {
      S.keydownTime = performance.now();
      S.chordState  = 'pressing';
    }
  });

  // Keyup: detect full chord release (target phase only)
  typingInput.addEventListener('keyup', e => {
    if (!S?.running || S.phase !== 'target' || S.chordState !== 'pressing') return;
    S.keysHeld.delete(e.code);
    if (S.keysHeld.size > 0) return;
    // All chord keys are up — record the end time and wait for device output via input events.
    // Clear any intermediate chars now so the device's backspaces are no-ops and the chord
    // output word arrives into a clean field.
    S.keyupTime  = performance.now();
    S.chordState = 'released';
    typingInput.value = '';
    const val = typingInput.value.trim();
    if (val) {
      if (cmp(val, S.word)) {
        finalizeRound();
      } else if (S.contextTarget && cmp(val, S.contextTarget)) {
        // Spurious full context word that slipped through — absorb and reset.
        typingInput.value = '';
        S.keydownTime = null;
        S.keyupTime   = null;
        S.keysHeld    = new Set();
        S.chordState  = 'idle';
      } else {
        // Device output doesn't match target — debounce and evaluate (counts as wrong).
        clearTimeout(S._outputTimeout);
        S._outputTimeout = setTimeout(() => {
          if (S?.running && S.chordState === 'released') finalizeRound();
        }, 50);
      }
    }
  });

  startBtn.addEventListener('click', () => {
    resetArea();
    const word  = wordInput.value.trim();
    const chord = chordInput.value.trim();
    if (!word || !chord) {
      testStats.innerHTML = '<span style="color:var(--warn)">Please enter Word and Chord.</span>';
      setTimeout(() => { testStats.innerHTML = ''; }, 1800);
      return;
    }
    S = {
      word, chord,
      contextWords:    leadInWordsList.slice(),
      trackPause:      trackPauseCheckbox.checked,
      trials:          [],
      pauseDurations:  [],
      contextTarget:   null,
      phase:           'target',
      running:         true,
      keydownTime:     null,
      keyupTime:       null,
      keysHeld:        new Set(),
      chordState:      'idle',
      lastContextEnd:  null,
      _outputTimeout:  null,
      roundsTotal:     0,
      roundsCorrect:   0,
      roundsWrong:     0,
      totalDurationMs: 0,
    };
    show(testArea);
    updateStats('timing: first keydown \u2192 last keyup');
    beginRound();
  });

  loadFromLibraryBtn.addEventListener('click', () => {
    document.querySelector('[data-tab="library"]').click();
  });
  testArea.addEventListener('click', () => typingInput.focus());
  document.addEventListener('keydown', () => {
    if (S?.running && document.activeElement !== typingInput) typingInput.focus();
  });

  finishBtn.addEventListener('click', () => {
    if (!S) return;
    Entries.add({
      id:           Date.now(),
      word:         S.word,
      chord:        S.chord,
      contextWords: S.contextWords,
      trials:       S.trials,
      pauseDurations: S.pauseDurations,
      roundsTotal:  S.roundsTotal,
      roundsCorrect: S.roundsCorrect,
      roundsWrong:  S.roundsWrong,
      savedAt:      new Date().toISOString(),
    });
    // notify results UI to refresh (results now shown inline under Test)
    document.dispatchEvent(new Event('entriesChanged'));
    resetArea();
  });

  discardBtn.addEventListener('click', resetArea);
  resetArea();
})();

// --- Results Tab Logic ---
(function setupResults() {
  const filterInput = $('filterInput');
  const table = $('resultsTable');
  const compareBtn = $('compareBtn');
  const resetSelectedBtn = $('resetSelectedBtn');
  const exportBtn = $('exportBtn');
  const importBtn = $('importBtn');
  const resetAllBtn = $('resetAllBtn');
  const comparePanel = $('comparePanel');

  let selectedIds = new Set();
  const chartInstances = new Map();

  function destroyAllCharts() {
    chartInstances.forEach(ch => ch.destroy());
    chartInstances.clear();
  }

  function toggleDetail(entryId, tr) {
    const next = tr.nextElementSibling;
    if (next?.classList.contains('detail-row')) {
      if (chartInstances.has(entryId)) { chartInstances.get(entryId).destroy(); chartInstances.delete(entryId); }
      next.remove();
      return;
    }
    const entry = Entries.getAll().find(e => e.id === entryId);
    if (!entry) return;
    const detailRow = document.createElement('tr');
    detailRow.classList.add('detail-row');
    const td = document.createElement('td');
    td.colSpan = 10;
    const canvasId = `trialChart_${entryId}`;
    td.innerHTML = `<div style="padding:8px 16px"><canvas id="${canvasId}" height="90"></canvas></div>`;
    detailRow.appendChild(td);
    tr.after(detailRow);
    const correctData = [], wrongData = [];
    entry.trials.forEach((t, i) => {
      if (t.duration == null) return;
      (t.correct ? correctData : wrongData).push({ x: i + 1, y: t.duration });
    });
    const chart = new Chart($(canvasId).getContext('2d'), {
      type: 'scatter',
      data: {
        datasets: [
          { label: 'Correct', data: correctData, backgroundColor: '#3fb950', borderColor: '#3fb950', pointRadius: 4, showLine: true, borderWidth: 1, tension: 0.3 },
          { label: 'Wrong',   data: wrongData,   backgroundColor: '#f85149', borderColor: '#f85149', pointRadius: 5 },
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } } },
        scales: {
          x: { type: 'linear', title: { display: true, text: 'Attempt #' }, ticks: { stepSize: 1, precision: 0 } },
          y: { title: { display: true, text: 'Time (ms)' }, beginAtZero: false },
        }
      }
    });
    chartInstances.set(entryId, chart);
  }

  function renderTable() {
    destroyAllCharts();
    const all = Entries.getAll();
    const filter = filterInput.value.trim().toLowerCase();
    const filtered = !filter ? all : all.filter(e => e.word.toLowerCase().includes(filter));
    if (!filtered.length) { table.innerHTML = '<div class="text-muted">No results.</div>'; return; }
    const rows = filtered.map(e =>
      `<tr data-entry-id="${e.id}" style="cursor:pointer" title="Click to expand chart"><td><input type="checkbox" class="resultSelect" data-id="${e.id}" ${selectedIds.has(e.id) ? 'checked' : ''}></td><td>${escHtml(e.word)}</td><td>${escHtml(e.chord)}</td><td>${e.trials.filter(t => t.correct).length}</td><td>${avg(e)} ms</td><td>${median(e)} ms</td><td>${min(e)} ms</td><td>${max(e)} ms</td><td>${avgPause(e)}</td><td>${new Date(e.savedAt).toLocaleString()}</td></tr>`
    ).join('');
    table.innerHTML = `<table><thead><tr><th></th><th>Word</th><th>Chord</th><th>Trials</th><th>Avg</th><th>Median</th><th>Min</th><th>Max</th><th>Avg Pause</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table>`;
    table.querySelectorAll('.resultSelect').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) selectedIds.add(Number(cb.dataset.id));
        else selectedIds.delete(Number(cb.dataset.id));
        compareBtn.disabled = selectedIds.size < 2;
      });
    });
    table.querySelectorAll('tbody tr[data-entry-id]').forEach(tr => {
      tr.addEventListener('click', e => {
        if (e.target.closest('input')) return;
        toggleDetail(Number(tr.dataset.entryId), tr);
      });
    });
  }
  function avg(e) {
    const arr = e.trials.filter(t => t.correct && t.duration != null).map(t => t.duration);
    if (!arr.length) return '-';
    return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  }
  function avgPause(e) {
    const arr = e.pauseDurations?.filter(v => v != null) ?? [];
    if (!arr.length) return '-';
    return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) + ' ms';
  }
  function median(e) {
    const arr = e.trials.filter(t => t.correct).map(t => t.duration).sort((a, b) => a - b);
    if (!arr.length) return '-';
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 ? arr[mid] : Math.round((arr[mid - 1] + arr[mid]) / 2);
  }
  function min(e) {
    const arr = e.trials.filter(t => t.correct).map(t => t.duration);
    if (!arr.length) return '-';
    return Math.min(...arr);
  }
  function max(e) {
    const arr = e.trials.filter(t => t.correct).map(t => t.duration);
    if (!arr.length) return '-';
    return Math.max(...arr);
  }

  // Refresh table on load and when entries change (results now shown inline under Test)
  document.addEventListener('entriesChanged', renderTable);
  filterInput.addEventListener('input', renderTable);

  compareBtn.addEventListener('click', () => {
    const all = Entries.getAll();
    const selected = all.filter(e => selectedIds.has(e.id)).slice(0, 4);
    if (selected.length < 2) return;
    comparePanel.classList.remove('hidden');

    if (window._compareChartInstance) { window._compareChartInstance.destroy(); window._compareChartInstance = null; }

    const COLORS = ['#58a6ff', '#3fb950', '#f0883e', '#bc8cff'];
    const metrics = [
      { label: 'Avg (ms)',    fn: avg    },
      { label: 'Median (ms)', fn: median },
      { label: 'Min (ms)',    fn: min    },
      { label: 'Max (ms)',    fn: max    },
    ];

    // vals[metricIdx][entryIdx]
    const vals = metrics.map(m => selected.map(e => m.fn(e)));

    const headerCells = selected.map((e, i) =>
      `<th style="color:${COLORS[i]}">${escHtml(e.word)}<br><small style="font-weight:normal;opacity:.8">${escHtml(e.chord)}</small></th>`
    ).join('');

    const metricRows = metrics.map((m, mi) => {
      const numVals = vals[mi].map(v => typeof v === 'number' ? v : Infinity);
      const best = Math.min(...numVals);
      const cells = vals[mi].map((v, i) => {
        const isBest = typeof v === 'number' && v === best;
        return `<td style="${isBest ? 'color:#3fb950;font-weight:bold' : ''}">${v !== '-' ? v + ' ms' : '-'}</td>`;
      }).join('');
      return `<tr><td class="text-muted">${m.label}</td>${cells}</tr>`;
    }).join('');

    const accuracyRow = `<tr><td class="text-muted">Accuracy</td>${selected.map(e => {
      const total = e.trials.length;
      const correct = e.trials.filter(t => t.correct).length;
      const accVals = selected.map(s => { const t2 = s.trials.length; return t2 ? s.trials.filter(t => t.correct).length / t2 : 0; });
      const best = Math.max(...accVals);
      const myAcc = total ? correct / total : 0;
      const isBest = total > 0 && myAcc === best;
      return `<td style="${isBest ? 'color:#3fb950;font-weight:bold' : ''}">${total ? Math.round(100 * correct / total) + '%' : '-'}</td>`;
    }).join('')}</tr>`;

    const trialsRow = `<tr><td class="text-muted">Trials</td>${selected.map(e => `<td>${e.trials.filter(t => t.correct).length} / ${e.trials.length}</td>`).join('')}</tr>`;
    const pauseRow  = `<tr><td class="text-muted">Avg Pause</td>${selected.map(e => `<td>${avgPause(e)}</td>`).join('')}</tr>`;

    comparePanel.innerHTML = `
      <div style="padding:8px 16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <strong>Compare (${selected.length})</strong>
          <button id="closeCompareBtn" class="btn btn-secondary">Close</button>
        </div>
        <table class="compare-table" style="width:100%;margin-bottom:14px">
          <thead><tr><th></th>${headerCells}</tr></thead>
          <tbody>
            ${trialsRow}
            ${accuracyRow}
            ${metricRows}
            ${pauseRow}
          </tbody>
        </table>
        <canvas id="compareChart" height="110"></canvas>
      </div>
    `;

    document.getElementById('closeCompareBtn').addEventListener('click', () => {
      comparePanel.classList.add('hidden');
      if (window._compareChartInstance) { window._compareChartInstance.destroy(); window._compareChartInstance = null; }
    });

    // Grouped bar chart: groups = metrics, bars = entries
    window._compareChartInstance = new Chart($('compareChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: metrics.map(m => m.label),
        datasets: selected.map((e, i) => ({
          label: e.word,
          data: metrics.map(m => { const v = m.fn(e); return typeof v === 'number' ? v : 0; }),
          backgroundColor: COLORS[i] + 'cc',
          borderColor: COLORS[i],
          borderWidth: 1,
        })),
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
        },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'ms' } },
        },
      },
    });
  });

  resetSelectedBtn.addEventListener('click', () => {
    if (!selectedIds.size) return;
    if (!confirm('Delete selected entries?')) return;
    Entries.removeByIds(Array.from(selectedIds));
    selectedIds.clear();
    renderTable();
  });
  exportBtn.addEventListener('click', () => {
    const data = JSON.stringify(Entries.getAll(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ctt_results.json';
    a.click();
    URL.revokeObjectURL(url);
  });
  importBtn.addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json';
    inp.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const arr = JSON.parse(ev.target.result);
          if (Array.isArray(arr)) {
            const all = Entries.getAll();
            const ids = new Set(all.map(e => e.id));
            const merged = [...all, ...arr.filter(e => !ids.has(e.id))];
            Entries.saveAll(merged);
            renderTable();
          }
        } catch {}
      };
      reader.readAsText(file);
    };
    inp.click();
  });
  resetAllBtn.addEventListener('click', () => {
    if (!confirm('Delete ALL results?')) return;
    Entries.clear();
    selectedIds.clear();
    renderTable();
  });

  renderTable();
})();
