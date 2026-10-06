const HEX_WIDTH = 16;

const state = {
  filePath: null,
  bytes: [],
  highlightOffset: null,
  lastSearch: null,
  activeSection: null,
  tileBitmap: null,
  selectedTileOffset: 0x4000,
  palette: ['#000000', '#7C7C7C', '#B0B0B0', '#FFFFFF']
};

const fileInfoEl = document.getElementById('file-info');
const romInfoEl = document.getElementById('rom-info');
const hexTableBody = document.querySelector('#hex-table tbody');
const searchInput = document.getElementById('search-input');
const openButton = document.getElementById('open-rom-button');
const saveButton = document.getElementById('save-rom-button');
const analyzeButton = document.getElementById('analyze-rom-button');
const searchButton = document.getElementById('search-button');
const exportSpriteButton = document.getElementById('export-sprite-button');
const sectionListEl = document.getElementById('rom-sections');
const tileCanvas = document.getElementById('tile-canvas');
const mapCanvas = document.getElementById('map-canvas');
const tileDetails = document.getElementById('tile-details');
const mapDetails = document.getElementById('map-details');
const paletteGridEl = document.getElementById('palette-grid');
const spriteCanvas = document.getElementById('sprite-canvas');
const spriteDetails = document.getElementById('sprite-details');
const extractSpriteButton = document.getElementById('extract-sprite-button');

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

function buildPaletteGrid() {
  paletteGridEl.innerHTML = state.palette.map((color, index) => `
    <div class="palette-swatch">
      <div class="palette-color" style="background:${color};"></div>
      <span class="palette-label">${index}: ${color}</span>
    </div>
  `).join('');
}

function buildRomSections() {
  if (!state.bytes.length) {
    sectionListEl.innerHTML = '<div class="empty-state">No ROM loaded</div>';
    return [];
  }

  const sections = [];
  const maxLength = state.bytes.length;

  sections.push({
    name: 'Header',
    start: 0x0000,
    end: 0x014F,
    description: 'ROM header / title / cartridge info'
  });

  const bankSize = 0x4000;
  for (let bank = 0; bank < Math.min(8, Math.ceil(maxLength / bankSize)); bank += 1) {
    const start = bank * bankSize;
    const end = Math.min(start + bankSize, maxLength);
    sections.push({
      name: `Bank ${bank}`,
      start,
      end,
      description: `${end - start} bytes`
    });
  }

  if (maxLength > 0x8000) {
    sections.push({
      name: 'Tail',
      start: 0x8000,
      end: maxLength,
      description: 'Remaining bytes after the first banks'
    });
  }

  sectionListEl.innerHTML = sections.map((section) => {
    const active = state.activeSection === section.name ? 'active' : '';
    return `
      <button class="section-item ${active}" data-section="${section.name}" data-start="${section.start}">
        <strong>${section.name}</strong>
        <small>${section.description}</small>
      </button>
    `;
  }).join('');

  sectionListEl.querySelectorAll('.section-item').forEach((button) => {
    button.addEventListener('click', () => {
      const start = Number(button.dataset.start);
      state.activeSection = button.dataset.section;
      state.highlightOffset = start;
      drawHexTable();
      buildRomSections();
      setStatus(`Selected ${button.dataset.section} at ${formatOffset(start)}`);
    });
  });

  return sections;
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
      state.selectedTileOffset = offset;
      drawHexTable();
      drawTilePreview();
      drawSpritePreview();
      drawMapPreview();
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

function drawTilePreview() {
  if (!state.bytes.length) {
    tileDetails.textContent = 'Load a ROM to preview tiles.';
    return;
  }

  const ctx = tileCanvas.getContext('2d');
  const tileSize = 8;
  const scale = 8;
  const tilesPerRow = 4;
  const tileCount = 16;
  const previewOffset = Math.max(0x4000, Math.min(state.bytes.length - 16 * 16, 0x4000));

  ctx.clearRect(0, 0, tileCanvas.width, tileCanvas.height);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, tileCanvas.width, tileCanvas.height);

  for (let tileIndex = 0; tileIndex < tileCount; tileIndex += 1) {
    const tileStart = previewOffset + tileIndex * 16;
    if (tileStart + 15 >= state.bytes.length) {
      break;
    }

    const tileX = (tileIndex % tilesPerRow) * (tileSize * scale);
    const tileY = Math.floor(tileIndex / tilesPerRow) * (tileSize * scale);

    for (let py = 0; py < tileSize; py += 1) {
      const rowBase = tileStart + py * 2;
      const low = state.bytes[rowBase];
      const high = state.bytes[rowBase + 1];

      for (let px = 0; px < tileSize; px += 1) {
        const bit = 7 - px;
        const colorIndex = ((high >> bit) & 1) << 1 | ((low >> bit) & 1);
        const color = state.palette[colorIndex] || '#000000';
        ctx.fillStyle = color;
        ctx.fillRect(tileX + (px * scale), tileY + (py * scale), scale, scale);
      }
    }
  }

  const selectedStart = previewOffset + Math.floor((state.selectedTileOffset - previewOffset) / 16) * 16;
  tileDetails.textContent = `Tile preview • offset ${formatOffset(previewOffset)} • selected tile ${formatOffset(selectedStart)}`;
}

function drawSpritePreview() {
  if (!state.bytes.length) {
    spriteDetails.textContent = 'Select a tile to inspect sprite pixels.';
    return;
  }

  const ctx = spriteCanvas.getContext('2d');
  const base = Math.max(0x4000, Math.min(state.bytes.length - 16, state.selectedTileOffset));

  ctx.clearRect(0, 0, spriteCanvas.width, spriteCanvas.height);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, spriteCanvas.width, spriteCanvas.height);

  for (let py = 0; py < 8; py += 1) {
    const rowBase = base + py * 2;
    const low = state.bytes[rowBase];
    const high = state.bytes[rowBase + 1];

    for (let px = 0; px < 8; px += 1) {
      const bit = 7 - px;
      const colorIndex = ((high >> bit) & 1) << 1 | ((low >> bit) & 1);
      ctx.fillStyle = state.palette[colorIndex] || '#000000';
      ctx.fillRect(px * 12 + 4, py * 12 + 4, 12, 12);
    }
  }

  spriteDetails.textContent = `Sprite tile • ${formatOffset(base)} • 8x8 pixel block`;
}

function drawMapPreview() {
  if (!state.bytes.length) {
    mapDetails.textContent = 'Load a ROM to preview level map blocks.';
    return;
  }

  const ctx = mapCanvas.getContext('2d');
  const blockSize = 16;
  const arrayStart = Math.max(0, Math.min(state.bytes.length - 256, 0x5000));

  ctx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, mapCanvas.width, mapCanvas.height);

  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const index = arrayStart + (y * 16 + x);
      const value = state.bytes[index] || 0;
      const color = state.palette[value % state.palette.length] || '#000000';
      ctx.fillStyle = color;
      ctx.fillRect(x * blockSize, y * blockSize, blockSize, blockSize);
    }
  }

  mapDetails.textContent = `Map blocks • sample from ${formatOffset(arrayStart)} (${16}x${16} preview)`;
}

function exportSprite() {
  if (!state.bytes.length) {
    setStatus('Load a ROM before exporting a sprite.', true);
    return;
  }

  const base = Math.max(0x4000, Math.min(state.bytes.length - 16, state.selectedTileOffset));
  const spriteBytes = Array.from(state.bytes.slice(base, base + 16));
  const payload = {
    offset: formatOffset(base),
    bytes: spriteBytes,
    palette: state.palette
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aladdin-sprite-${formatOffset(base).replace('0x', '')}.json`;
  a.click();
  URL.revokeObjectURL(url);

  spriteDetails.textContent = `Exported sprite • ${formatOffset(base)} • ${spriteBytes.length} bytes`;
  setStatus(`Sprite exported at ${formatOffset(base)}`);
}

function extractSprite() {
  if (!state.bytes.length) {
    setStatus('Load a ROM before extracting a sprite.', true);
    return;
  }

  const base = Math.max(0x4000, Math.min(state.bytes.length - 16, state.selectedTileOffset));
  const spriteBytes = Array.from(state.bytes.slice(base, base + 16));
  const payload = {
    offset: formatOffset(base),
    bytes: spriteBytes,
    palette: state.palette
  };

  const text = JSON.stringify(payload, null, 2);
  spriteDetails.textContent = `Sprite extracted: ${formatOffset(base)} (${spriteBytes.length} bytes)`;
  console.log('Sprite payload:', text);
  setStatus(`Sprite extracted at ${formatOffset(base)}`);
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
    state.activeSection = 'Header';
    state.selectedTileOffset = 0x4000;

    fileInfoEl.textContent = `${rom.fileName} • ${rom.size} bytes`;
    fileInfoEl.style.color = '#e2e8f0';

    renderRomInfo(rom.metadata);
    buildRomSections();
    drawHexTable();
    drawTilePreview();
    drawSpritePreview();
    drawMapPreview();
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
  state.selectedTileOffset = offset;

  drawHexTable();
  drawTilePreview();
  drawSpritePreview();
  drawMapPreview();
  setStatus(`Found ${label} at ${formatOffset(offset)}`);

  const targetButton = document.querySelector(`.byte-cell[data-offset="${offset}"]`);
  if (targetButton) {
    targetButton.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function analyzeRom() {
  if (!state.bytes.length) {
    setStatus('Load a ROM before analysis.', true);
    return;
  }

  const totalSize = state.bytes.length;
  const banks = Math.max(1, Math.ceil(totalSize / 0x4000));
  const header = `${totalSize.toLocaleString()} bytes • ${banks} bank(s)`;
  setStatus(`ROM analysis: ${header}`);
  const firstBytes = Array.from(state.bytes.slice(0, 32)).map((value) => formatHexByte(value)).join(' ');
  tileDetails.textContent = `Header sample: ${firstBytes} ...`;
}

openButton.addEventListener('click', openRom);
saveButton.addEventListener('click', saveRom);
analyzeButton.addEventListener('click', analyzeRom);
extractSpriteButton.addEventListener('click', extractSprite);
exportSpriteButton.addEventListener('click', exportSprite);
searchButton.addEventListener('click', searchRom);
searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    searchRom();
  }
});

setStatus('No ROM loaded');
renderRomInfo(null);
buildPaletteGrid();
buildRomSections();
drawHexTable();
drawTilePreview();
drawSpritePreview();
drawMapPreview();
