# Aladdin GB ROM Editor

A simple desktop ROM editor for Game Boy cartridges, built around the original Aladdin game. The project is intended as a practical starter for reverse-engineering and byte editing ROM data.

## Features

- Open a `.gb`, `.gbc`, `.bin`, or `.rom` file
- Read ROM metadata (title, cartridge type, ROM size, RAM size)
- View a hex dump with offset + ASCII panel
- Click any byte to patch it directly
- Search by hex sequence or ASCII text
- Save modified data back to the original ROM

## Run

```bash
npm install
npm start
```

## Notes

This is a lightweight editor skeleton, not a full disassembler or level editor yet. It is a good base for implementing additional Game Boy-specific tools such as:

- tile viewer/editor
- palette editor
- level data hex maps
- sprite extraction
- music/PCM tools
- script and map patching

## Project structure

- `src/main.js` - Electron main process
- `src/preload.js` - Secure preload bridge
- `src/renderer/index.html` - UI shell
- `src/renderer/styles.css` - styling
- `src/renderer/app.js` - ROM loading, hex view, patching logic

## License

MIT
