# osu! Trainer

A desktop osu! beatmap trainer with a React UI, FastAPI backend, and osu! OAuth profile integration.

## Features

- **Editor** — Search beatmaps, browse difficulties, preview audio, extract backgrounds
- **Profile** — Sign in with osu!, view stats and top 100 plays
- **Native window** — PyWebView desktop shell

## Project structure

```
.
├── pywebview_app.py        # Primary desktop entry point
├── frontend/               # React UI
├── src/
│   ├── api.py              # FastAPI backend
│   └── TEST/
│       ├── osu_gui.py      # OAuth, beatmap search, user stats
│       ├── test_functions.py
│       ├── download/       # Runtime .osz downloads (gitignored)
│       └── previews/       # Previews & extracted images (gitignored)
├── include/                # API credentials (cred.py gitignored)
├── docs/BUILD.md           # Build and run instructions
└── requirements.txt
```

## Quick start

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd frontend && npm install && npm run build && cd ..
python3 pywebview_app.py
```

See [docs/BUILD.md](docs/BUILD.md) for packaging and troubleshooting.

## Tests

```bash
cd src/TEST && make run
```
