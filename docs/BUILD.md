# osu! Trainer — Build & Run

## Quick start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cd frontend && npm install && npm run build && cd ..

python3 pywebview_app.py
```

## Project layout

```
.
├── pywebview_app.py      # Desktop app entry (PyWebView + FastAPI)
├── pywebview_app.spec    # PyInstaller config
├── frontend/             # React UI (Vite + shadcn)
├── src/
│   ├── api.py            # FastAPI backend
│   └── TEST/
│       ├── osu_gui.py    # OAuth, search, profile stats
│       ├── test_functions.py
│       ├── download/     # Downloaded .osz (gitignored)
│       └── previews/     # Previews & extracted art (gitignored)
├── include/
│   ├── const.py
│   └── cred.py           # OAuth credentials (gitignored)
└── requirements.txt
```

## Frontend development

```bash
cd frontend
npm install
npm run dev
npm run build   # → frontend/dist/
```

Rebuild the frontend after UI changes before running `pywebview_app.py`.

## Package for macOS

```bash
pip install pyinstaller
pyinstaller pywebview_app.spec -y
# → dist/osu! Trainer.app
```

## Credentials

Create `include/cred.py` with your osu! OAuth `client_id` and `client_secret`.  
Sign-in saves a token to `include/user_token.json` (gitignored).
