const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 920,
    minWidth: 900,
    minHeight: 700,
    backgroundColor: '#0f172a',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function parseRomInfo(buffer) {
  const titleBytes = buffer.subarray(0x134, 0x143);
  const title = Buffer.from(titleBytes).toString('ascii', 0, titleBytes.length).replace(/\0+$/, '').trim();

  const cartridgeType = buffer[0x147];
  const romSizeCode = buffer[0x148];
  const ramSizeCode = buffer[0x149];
  const cgbFlag = buffer[0x143];

  const romSizes = {
    0x00: '32 KB (no ROM banking)',
    0x01: '64 KB (2 banks)',
    0x02: '128 KB (4 banks)',
    0x03: '256 KB (8 banks)',
    0x04: '512 KB (16 banks)',
    0x05: '1 MB (32 banks)',
    0x06: '2 MB (64 banks)',
    0x07: '4 MB (128 banks)',
    0x08: '8 MB (256 banks)',
    0x52: '1.1 MB (72 banks)',
    0x53: '1.2 MB (80 banks)',
    0x54: '1.5 MB (96 banks)'
  };

  const ramSizes = {
    0x00: 'None',
    0x01: '2 KB',
    0x02: '8 KB',
    0x03: '32 KB',
    0x04: '128 KB',
    0x05: '64 KB'
  };

  const cartTypes = {
    0x00: 'ROM ONLY',
    0x01: 'MBC1',
    0x02: 'MBC1 + RAM',
    0x03: 'MBC1 + RAM + BATTERY',
    0x05: 'MBC2',
    0x06: 'MBC2 + BATTERY',
    0x08: 'ROM + RAM',
    0x09: 'ROM + RAM + BATTERY',
    0x0F: 'MBC3 + TIMER + BATTERY',
    0x10: 'MBC3 + TIMER + RAM + BATTERY',
    0x11: 'MBC3',
    0x12: 'MBC3 + RAM',
    0x13: 'MBC3 + RAM + BATTERY',
    0x19: 'MBC5',
    0x1A: 'MBC5 + RAM',
    0x1B: 'MBC5 + RAM + BATTERY',
    0x1C: 'MBC5 + RUMBLE',
    0x1D: 'MBC5 + RUMBLE + RAM',
    0x1E: 'MBC5 + RUMBLE + RAM + BATTERY'
  };

  return {
    title,
    cartridgeType: cartTypes[cartridgeType] || `0x${cartridgeType.toString(16).toUpperCase().padStart(2, '0')}`,
    romSize: romSizes[romSizeCode] || `0x${romSizeCode.toString(16).toUpperCase().padStart(2, '0')}`,
    ramSize: ramSizes[ramSizeCode] || `0x${ramSizeCode.toString(16).toUpperCase().padStart(2, '0')}`,
    cgbFlag: cgbFlag === 0x80 ? 'CGB supported' : cgbFlag === 0xC0 ? 'CGB only' : 'DMG only'
  };
}

ipcMain.handle('open-rom', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Open Game Boy ROM',
    properties: ['openFile'],
    filters: [
      { name: 'Game Boy ROM', extensions: ['gb', 'gbc', 'bin', 'rom'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('read-rom', async (_event, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('ROM file not found');
  }

  const fileBuffer = fs.readFileSync(filePath);
  const metadata = parseRomInfo(fileBuffer);

  return {
    filePath,
    fileName: path.basename(filePath),
    size: fileBuffer.length,
    bytes: Array.from(fileBuffer),
    metadata
  };
});

ipcMain.handle('save-rom', async (_event, { filePath, bytes }) => {
  if (!filePath) {
    throw new Error('No file path provided');
  }

  const buffer = Buffer.from(Array.isArray(bytes) ? bytes : [], (value) => value & 0xff);
  fs.writeFileSync(filePath, buffer);

  return {
    ok: true,
    bytesWritten: buffer.length,
    filePath
  };
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
