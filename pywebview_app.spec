# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for osu! Trainer PyWebView desktop application
Creates a native .app / .exe executable with React frontend + Python backend
"""

import os
from pathlib import Path

root_dir = Path(SPECPATH).resolve().parent
app_dist_dir = root_dir / "frontend" / "dist"
src_dir = root_dir / "src"
include_dir = root_dir / "include"

a = Analysis(
    [str(root_dir / "pywebview_app.py")],
    pathex=[str(root_dir)],
    binaries=[],
    datas=[
        (str(app_dist_dir), "frontend/dist"),
        (str(src_dir), "src"),
        (str(include_dir), "include"),
    ],
    hiddenimports=[
        "fastapi",
        "uvicorn",
        "uvicorn.lifespan",
        "uvicorn.loops",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.http.httptools",
        "uvicorn.protocols.websocket",
        "uvicorn.protocols.websocket.auto",
        "uvicorn.protocols.websocket.wsproto",
        "uvicorn.server",
        "pydantic",
        "pydantic_core",
        "pydantic_settings",
        "httpx",
        "ossapi",
        "osu",
        "requests",
        "PIL",
        "rosu_pp",
        "webview",
        "AppKit",
        "objc",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludedimports=["matplotlib", "numpy", "scipy"],
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=None)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="osu! Trainer",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # No console window
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

# macOS .app bundle
app = BUNDLE(
    exe,
    name="osu! Trainer.app",
    icon=None,
    bundle_identifier="com.osutrainer.app",
    info_plist={
        "NSPrincipalClass": "NSApplication",
        "NSHighResolutionCapable": "True",
        "CFBundleVersion": "1.0.0",
        "CFBundleShortVersionString": "1.0.0",
    },
)
