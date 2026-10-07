#!/usr/bin/env python3
"""
osu! Trainer - PyWebView Desktop Application
Wraps the React frontend with a native window and Python backend
"""

import os
import sys
import subprocess
import threading
import time
import socket
import webbrowser
from pathlib import Path

# Get project paths
ROOT_DIR = Path(__file__).parent
VENV_PYTHON = ROOT_DIR / ".venv" / "bin" / "python"

if VENV_PYTHON.exists() and Path(sys.executable).resolve() != VENV_PYTHON.resolve():
    os.execv(str(VENV_PYTHON), [str(VENV_PYTHON), *sys.argv])

import webview

DIST_DIR = ROOT_DIR / "frontend" / "dist"

# Locked window — content layout uses height:100% to fit the client area.
APP_WINDOW_WIDTH = 760
APP_WINDOW_HEIGHT = 720
APP_BACKGROUND_COLOR = "#0a0a14"  # Match --background in theme.css


def configure_macos_seamless_window(window):
    """Transparent title bar, edge-to-edge content, close + minimize only."""
    try:
        import AppKit
        from PyObjCTools import AppHelper
        from webview.platforms.cocoa import BrowserView
    except ImportError:
        return

    uid = window.uid

    def apply_native_chrome_on_main_thread():
        instance = BrowserView.instances.get(uid)
        if instance is None:
            return

        ns_window = instance.window
        ns_window.setBackgroundColor_(
            BrowserView.nscolor_from_hex(APP_BACKGROUND_COLOR)
        )

        close_btn = ns_window.standardWindowButton_(AppKit.NSWindowCloseButton)
        mini_btn = ns_window.standardWindowButton_(AppKit.NSWindowMiniaturizeButton)
        zoom_btn = ns_window.standardWindowButton_(AppKit.NSWindowZoomButton)

        if close_btn is not None:
            close_btn.setHidden_(False)
            close_btn.setAlphaValue_(1.0)
        if mini_btn is not None:
            mini_btn.setHidden_(False)
            mini_btn.setAlphaValue_(1.0)
        if zoom_btn is not None:
            zoom_btn.setHidden_(True)

    def schedule_native_chrome():
        AppHelper.callAfter(apply_native_chrome_on_main_thread)

    def on_loaded():
        schedule_native_chrome()
        window.evaluate_js(
            "document.documentElement.classList.add('mac-desktop')"
        )

    window.events.loaded += on_loaded


def find_available_port(preferred_port=8000):
    """Return the preferred port if available, otherwise an ephemeral port."""
    for port in (preferred_port, 0):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.bind(("127.0.0.1", port))
                return sock.getsockname()[1]
        except OSError:
            continue

    raise RuntimeError("No available localhost port found")


def start_backend(port):
    """Start the FastAPI backend server"""
    try:
        venv_python = ROOT_DIR / ".venv" / "bin" / "python"
        if not venv_python.exists():
            venv_python = "python"
        
        # Start FastAPI server in background
        process = subprocess.Popen(
            [str(venv_python), "-m", "uvicorn", "src.api:app",
             "--host", "127.0.0.1", "--port", str(port),
             "--log-level", "critical"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            preexec_fn=os.setsid if sys.platform != "win32" else None,
        )
        
        return process
    except Exception as e:
        print(f"❌ Error starting backend: {e}")
        return None


def print_backend_error(process):
    """Print useful backend output when startup fails."""
    if not process:
        return

    try:
        if process.poll() is None:
            process.terminate()
        stdout, stderr = process.communicate(timeout=5)
    except Exception:
        try:
            process.kill()
            stdout, stderr = process.communicate(timeout=5)
        except Exception:
            return

    output = "\n".join(part.strip() for part in (stdout, stderr) if part and part.strip())
    if output:
        print("\nBackend startup output:")
        print(output)


def wait_for_server(process, port, max_retries=60):
    """Wait for backend server to be ready"""
    for i in range(max_retries):
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            result = sock.connect_ex(('127.0.0.1', port))
            sock.close()
            if result == 0:
                return True
        except:
            pass
        time.sleep(0.3)
        if process and process.poll() is not None:
            return False
    
    return False


def main():
    print("🎵 osu! Trainer - PyWebView Desktop Application")
    print("=" * 60)
    
    # Check React build exists
    if not (DIST_DIR / "index.html").exists():
        print("❌ React build not found!")
        print("   Build the React app first:")
        print("   cd frontend && npm run build")
        sys.exit(1)
    
    # Start backend server
    backend_port = find_available_port()
    print(f"🚀 Starting backend server on port {backend_port}...")
    backend_process = start_backend(backend_port)
    if not backend_process:
        print("❌ Failed to start backend")
        sys.exit(1)
    
    # Wait for server to be ready
    print("⏳ Waiting for server to start...")
    if not wait_for_server(backend_process, backend_port):
        print("❌ Backend server failed to start (timeout)")
        print_backend_error(backend_process)
        sys.exit(1)
    
    print("✓ Server ready!")
    
    # Create native window with React app
    print("🪟 Creating native application window...")
    
    try:
        is_macos = sys.platform == "darwin"

        # Create PyWebView window
        window = webview.create_window(
            title="osu! Trainer",
            url=f"http://127.0.0.1:{backend_port}",
            width=APP_WINDOW_WIDTH,
            height=APP_WINDOW_HEIGHT,
            min_size=(APP_WINDOW_WIDTH, APP_WINDOW_HEIGHT),
            resizable=False,
            frameless=is_macos,
            easy_drag=is_macos,
            shadow=True,
            background_color=APP_BACKGROUND_COLOR,
        )

        if is_macos:
            configure_macos_seamless_window(window)

        # Start the window (blocking call)
        webview.start(debug=False)
        
    except Exception as e:
        print(f"❌ Error creating window: {e}")
    finally:
        # Cleanup
        print("\n🛑 Shutting down...")
        try:
            # Terminate background process group
            if sys.platform != "win32":
                os.killpg(os.getpgid(backend_process.pid), 15)
            else:
                backend_process.terminate()
            
            backend_process.wait(timeout=5)
        except:
            try:
                backend_process.kill()
            except:
                pass
        
        print("✓ Application closed")


if __name__ == "__main__":
    main()
