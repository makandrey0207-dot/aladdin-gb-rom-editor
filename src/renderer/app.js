const HEX_WIDTH = 16;

const state = {
  filePath: null,
  bytes: [],
  highlightOffset: null,
  lastSearch: null
};

const fileInfoEl = document.getElementById('file-info');
const romInfoEl = document.getElementById('rom-info');
const hexTableBody = document.querySelector('#hex-table tbody');
const searchInput = document.getElementById('search-input');
const openButton = document.getElementById('open-rom-button');
const saveButton = document.getElementById('save-rom-button');
const searchButton = document.getElementById('search-button');

function formatHexByte(value) {
  return Number(value).toString(16).padStart(2, '0').toUpperCase();
}

function formatOffset(value) {
  return `0x${Number(value).toString(16).toUpperCase().padStart(4, '0')}`;
}

function setStatus(message, isError = false) {
  fileInfoEl.textContent = message;
  fileInfoEl.style.color = isError ? '#f87171' : '#94a3b8';
}

function drawHexTable() {
  if (state.bytes.length === 0) {
    hexTableBody.innerHTML = '<tr><td class="empty-state">No bytes loaded.</td></tr>';
    return;
  }

  const rows = [];

  for (let offset = 0; offset < state.bytes.length; offset += HEX_WIDTH) {
    const slice = state.bytes.slice(offset, offset + HEX_WIDTH);
    const hexCells = slice.map((byte, index) => {
      const trueOffset = offset + index;
      const isHighlight = state.highlightOffset === trueOffset;

      return `<button class="byte-cell ${isHighlight ? 'highlight' : ''}" data-offset="${trueOffset}" title="Edit byte at ${formatOffset(trueOffset)}">${formatHexByte(byte)}</button>`;
    }).join('');

    const ascii = slice.map((byte) => {
      const char = byte >= 32 && byte < 127 ? String.fromCharCode(byte) : '.';
      return char;
    }).join('');

    rows.push(`
      <tr>
        <td class="offset-cell">${formatOffset(offset)}</td>
        <td><div class="hex-cell-group">${hexCells}</div></td>
        <td class="ascii-cell">${ascii}</td>
      </tr>
    `);
  }

  hexTableBody.innerHTML = rows.join('');

  document.querySelectorAll('.byte-cell').forEach((button) => {
    button.addEventListener('click', () => {
      const offset = Number(button.dataset.offset);
      const current = state.bytes[offset];
      const input = window.prompt(`Set byte at ${formatOffset(offset)} (00-FF)`, formatHexByte(current));

      if (input === null) {
        return;
      }

      const normalized = input.replace(/[^0-9a-fA-F]/g, '').slice(0, 2);
      if (!normalized || normalized.length !== 2) {
        window.alert('Invalid byte value. Use 2 hex digits, for example: FF');
        return;
      }

      state.bytes[offset] = parseInt(normalized, 16);
      state.highlightOffset = offset;
      drawHexTable();
      setStatus(`Modified byte at ${formatOffset(offset)} to ${normalized.toUpperCase()}`);
    });
  });
}

function renderRomInfo(metadata) {
  if (!metadata) {
    romInfoEl.innerHTML = '<div class="empty-state">Load a ROM to inspect metadata.</div>';
    return;
  }

  romInfoEl.innerHTML = `
    <div class="meta-box"><span class="label">Title</span><span class="value">${metadata.title || 'Unknown'}</span></div>
    <div class="meta-box"><span class="label">Cartridge</span><span class="value">${metadata.cartridgeType || 'Unknown'}</span></div>
    <div class="meta-box"><span class="label">ROM size</span><span class="value">${metadata.romSize || 'Unknown'}</span></div>
    <div class="meta-box"><span class="label">RAM size</span><span class="value">${metadata.ramSize || 'Unknown'}</span></div>
    <div class="meta-box"><span class="label">Mode</span><span class="value">${metadata.cgbFlag || 'Unknown'}</span></div>
  `;
}

async function openRom() {
  const filePath = await window.romEditor.openRom();

  if (!filePath) {
    return;
  }

  try {
    const rom = await window.romEditor.readRom(filePath);
    state.filePath = rom.filePath;
    state.bytes = rom.bytes;
    state.highlightOffset = null;

    fileInfoEl.textContent = `${rom.fileName} • ${rom.size} bytes`;
    fileInfoEl.style.color = '#e2e8f0';

    renderRomInfo(rom.metadata);
    drawHexTable();
  } catch (error) {
    setStatus(error.message, true);
    console.error(error);
  }
}

async function saveRom() {
  if (!state.filePath || state.bytes.length === 0) {
    setStatus('Load a ROM before saving.', true);
    return;
  }

  try {
    const result = await window.romEditor.saveRom(state.filePath, state.bytes);
    setStatus(`Saved ${result.filePath} (${result.bytesWritten} bytes)`);
  } catch (error) {
    setStatus(error.message, true);
    console.error(error);
  }
}

function findHexSequence(target) {
  const bytes = Array.from(target);

  for (let index = 0; index <= state.bytes.length - bytes.length; index += 1) {
    let match = true;

    for (let i = 0; i < bytes.length; i += 1) {
      if (state.bytes[index + i] !== bytes[i]) {
        match = false;
        break;
      }
    }

    if (match) {
      return index;
    }
  }

  return -1;
}

function searchRom() {
  if (!state.bytes.length) {
    setStatus('Load a ROM before searching.', true);
    return;
  }

  const rawInput = searchInput.value.trim();
  if (!rawInput) {
    setStatus('Enter a hex value or ASCII string to search.', true);
    return;
  }

  const normalized = rawInput.replace(/\s+/g, '').toUpperCase();
  let searchBytes = [];
  let label = '';

  if (/^[0-9A-F]+$/.test(normalized)) {
    if (normalized.length % 2 !== 0) {
      setStatus('Hex search must contain an even number of digits.', true);
      return;
    }

    for (let i = 0; i < normalized.length; i += 2) {
      searchBytes.push(parseInt(normalized.slice(i, i + 2), 16));
    }

    label = `hex pattern ${normalized}`;
  } else {
    searchBytes = Array.from(rawInput).map((char) => char.charCodeAt(0));
    label = `ASCII text "${rawInput}"`;
  }

  const offset = findHexSequence(searchBytes);
  if (offset === -1) {
    setStatus(`No match found for ${label}.`, true);
    return;
  }

  state.highlightOffset = offset;
  state.lastSearch = offset;

  drawHexTable();
  setStatus(`Found ${label} at ${formatOffset(offset)}`);

  const targetButton = document.querySelector(`.byte-cell[data-offset="${offset}"]`);
  if (targetButton) {
    targetButton.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

openButton.addEventListener('click', openRom);
saveButton.addEventListener('click', saveRom);
searchButton.addEventListener('click', searchRom);
searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    searchRom();
  }
});

setStatus('No ROM loaded');
renderRomInfo(null);
