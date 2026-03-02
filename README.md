# Bid Document Similarity Checker

`Bid Document Similarity Checker` is an Electron desktop application for reviewing similarities between two bid or tender documents.

It is designed for fast manual review of:

- text similarity
- metadata warnings
- shared keyword overlap
- exportable HTML reports

The current release is `1.0.1`.

## Features

- Compare two documents side by side
- Support `DOCX`, `PDF`, and `TXT`
- Extract document text and build structured comparison results
- Detect high-similarity text blocks
- Flag suspicious metadata overlaps
- Identify shared keywords between two documents
- Export the review result as an HTML report

## Tech Stack

- Electron
- Node.js
- `mammoth` for DOCX text extraction
- `pdfjs-dist` for PDF parsing
- `diff-match-patch` for text diff scoring
- `jszip` for DOCX metadata extraction

## Project Structure

```text
.
|-- main.js              # Electron main process and comparison logic
|-- preload.js           # Safe renderer API bridge
|-- launch.js            # Electron launcher used by npm start
|-- renderer/
|   |-- index.html       # App shell
|   |-- styles.css       # UI styles
|   `-- app.js           # Renderer-side interaction logic
|-- package.json
`-- RESTART_TODO.md      # Follow-up work notes
```

## Getting Started

### Requirements

- Node.js 18+ recommended
- npm
- Windows is the current primary target

### Install

```bash
npm install
```

### Run

```bash
npm start
```

### Build

```bash
npm run build
```

Other build targets:

```bash
npm run build:mac
npm run build:linux
```

## How It Works

1. Load document A and document B.
2. The app reads the file and extracts text plus basic metadata.
3. The backend computes:
   - overall similarity score
   - exact match score
   - fuzzy match score
   - text anomalies
   - metadata warnings
   - keyword matches
4. The renderer displays results in a multi-panel review UI.
5. Results can be exported as an HTML report.

## Current Limitations

- Image comparison is a placeholder and is not implemented yet.
- Evidence view is currently block-level text display, not true PDF page rendering.
- Text anomaly positioning is still coarse-grained.
- There is no automated test suite yet.

## Known Next Steps

The next planned improvements are tracked in [RESTART_TODO.md](./RESTART_TODO.md), including:

- full Electron flow validation
- UI and interaction cleanup
- real PDF page preview
- finer-grained text positioning
- stronger metadata extraction
- image comparison
- report enhancements

## Development Notes

- `npm start` uses `launch.js` to start Electron cleanly.
- Large files may increase memory usage because document buffers are passed through IPC.
- This repository currently tracks source files only; generated output and dependencies are ignored by `.gitignore`.

## License

MIT
