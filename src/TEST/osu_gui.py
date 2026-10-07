import json
import os
import sys
import webbrowser
from concurrent.futures import ThreadPoolExecutor
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

import requests

# Ensure repo root is on sys.path so `include` can be imported
sys.path.append(os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..')))
from include.cred import client, client_id, client_secret
from osu import GameModeStr, UserScoreType

REPO_ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
TOKEN_PATH = os.path.join(REPO_ROOT, 'include', 'user_token.json')


def load_token():
    if not os.path.exists(TOKEN_PATH):
        return None
    try:
        with open(TOKEN_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None


def save_token(token_data):
    os.makedirs(os.path.dirname(TOKEN_PATH), exist_ok=True)
    with open(TOKEN_PATH, 'w', encoding='utf-8') as f:
        json.dump(token_data, f)


def delete_token():
    if os.path.exists(TOKEN_PATH):
        os.remove(TOKEN_PATH)


def get_me_id():
    token = load_token()
    if not token or 'access_token' not in token:
        return None
    headers = {'Authorization': f"Bearer {token['access_token']}"}
    response = requests.get('https://osu.ppy.sh/api/v2/me', headers=headers)
    if response.status_code != 200:
        return None
    data = response.json()
    return data.get('id')


def oauth_callback_page(*, success: bool, error_message: str | None = None) -> bytes:
    if success:
        html = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Signed in</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      font-family: system-ui, -apple-system, sans-serif;
      background: #0a0a14;
      color: #f0f0f8;
    }
    .check {
      width: 72px;
      height: 72px;
      border-radius: 999px;
      display: grid;
      place-items: center;
      font-size: 36px;
      font-weight: 700;
      color: #ff66ab;
      background: rgba(255, 102, 171, 0.12);
      border: 1px solid rgba(255, 102, 171, 0.35);
    }
    p { font-size: 15px; color: #c8c8d8; }
  </style>
</head>
<body>
  <div class="check">✓</div>
  <p>This window will close.</p>
  <script>setTimeout(function() { window.close(); }, 1500);</script>
</body>
</html>"""
    else:
        message = error_message or "Sign in failed. You can close this window and try again."
        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sign in failed</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding: 24px;
      font-family: system-ui, -apple-system, sans-serif;
      background: #0a0a14;
      color: #f0f0f8;
      text-align: center;
    }}
    .icon {{
      width: 72px;
      height: 72px;
      border-radius: 999px;
      display: grid;
      place-items: center;
      font-size: 36px;
      font-weight: 700;
      color: #ff6b6b;
      background: rgba(255, 107, 107, 0.12);
      border: 1px solid rgba(255, 107, 107, 0.35);
    }}
    p {{ font-size: 15px; color: #c8c8d8; max-width: 320px; line-height: 1.5; }}
  </style>
</head>
<body>
  <div class="icon">!</div>
  <p>{message}</p>
</body>
</html>"""
    return html.encode("utf-8")


def do_oauth_flow(callback_port=53682, timeout=300):
    if not client_id or not client_secret:
        raise RuntimeError('client_id/client_secret not configured')

    redirect_uri = f'http://localhost:{callback_port}/callback'
    auth_url = (
        f"https://osu.ppy.sh/oauth/authorize?client_id={client_id}"
        f"&redirect_uri={redirect_uri}&response_type=code&scope=identify%20public"
    )

    code_container = {}
    error_container = {}

    class _OAuthHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            parsed = urlparse(self.path)
            if parsed.path != '/callback':
                self.send_response(404)
                self.end_headers()
                return
            params = parse_qs(parsed.query)
            code = params.get('code', [None])[0]
            error = params.get('error', [None])[0]

            self.send_response(200 if code else 400)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()

            if code:
                code_container['code'] = code
                self.wfile.write(oauth_callback_page(success=True))
            elif error:
                error_container['error'] = error
                self.wfile.write(oauth_callback_page(
                    success=False,
                    error_message="Sign in was cancelled.",
                ))
            else:
                error_container['error'] = 'missing_code'
                self.wfile.write(oauth_callback_page(
                    success=False,
                    error_message="Sign in failed. No authorization code was received.",
                ))

        def log_message(self, format, *args):
            return

    server = HTTPServer(('localhost', callback_port), _OAuthHandler)

    webbrowser.open(auth_url)
    server.timeout = timeout
    while 'code' not in code_container and 'error' not in error_container:
        server.handle_request()

    server.server_close()

    if error_container.get('error'):
        raise RuntimeError('Authorization was cancelled or denied')

    code = code_container.get('code')
    if not code:
        raise RuntimeError('No OAuth code received')

    token_resp = requests.post('https://osu.ppy.sh/oauth/token', json={
        'client_id': client_id,
        'client_secret': client_secret,
        'code': code,
        'grant_type': 'authorization_code',
        'redirect_uri': redirect_uri,
    })

    if token_resp.status_code != 200:
        raise RuntimeError(f"Token exchange failed: {token_resp.status_code} {token_resp.text}")

    token_data = token_resp.json()
    save_token(token_data)
    return token_data


GAME_MODES = (
    GameModeStr.STANDARD,
    GameModeStr.TAIKO,
    GameModeStr.CATCH,
    GameModeStr.MANIA,
)


def fetch_user_stats(user_identifier, mode=GameModeStr.STANDARD, top_n=5, recent_n=5):
    try:
        uid = int(user_identifier)
    except ValueError:
        uid = user_identifier

    user = client.get_user(uid, mode)
    if not user:
        raise RuntimeError('User not found')

    stats = getattr(user, 'statistics', None)
    tops = client.get_user_scores(user.id, UserScoreType.BEST, limit=top_n, mode=mode)
    recents = client.get_user_scores(user.id, UserScoreType.RECENT, include_fails=False, limit=recent_n, mode=mode)
    return user, stats, tops, recents


def _mode_top_play_info(uid, mode):
    """Return (mode_value_if_has_top_play, main_mode) for a single mode, or (None, None)."""
    try:
        user = client.get_user(uid, mode)
    except Exception:
        return None, None
    if not user:
        return None, None

    main_mode = getattr(user, 'playmode', None)
    try:
        tops = client.get_user_scores(user.id, UserScoreType.BEST, limit=1, mode=mode)
    except Exception:
        tops = None

    return (mode.value if tops else None), main_mode


def fetch_available_modes(user_identifier):
    """Return (modes, main_mode) for modes where the user has at least one top (best) play."""
    try:
        uid = int(user_identifier)
    except ValueError:
        uid = user_identifier

    # Probe all modes in parallel — each probe is independent network I/O.
    with ThreadPoolExecutor(max_workers=len(GAME_MODES)) as executor:
        results = list(
            executor.map(lambda mode: _mode_top_play_info(uid, mode), GAME_MODES)
        )

    available = []
    main_mode = None
    for mode_value, main in results:
        if main_mode is None and main:
            main_mode = main
        if mode_value:
            available.append(mode_value)

    return available, main_mode


def beatmap_search(beatmapset_id_or_beatid):
    try:
        beatmapset = client.get_beatmapset(beatmapset_id_or_beatid)
    except Exception:
        try:
            beatmap = client.get_beatmap(beatmapset_id_or_beatid)
            beatmapset = beatmap.beatmapset
        except Exception as e:
            raise RuntimeError('Beatmap or beatmapset not found') from e

    difficulties = []
    if hasattr(beatmapset, 'beatmaps'):
        for bm in beatmapset.beatmaps:
            difficulties.append({
                'id': getattr(bm, 'id', None),
                'version': getattr(bm, 'version', 'unknown'),
                'stars': getattr(bm, 'difficulty_rating', 0),
                'status': getattr(bm, 'status', ''),
                'ar': getattr(bm, 'ar', None),
                'cs': getattr(bm, 'cs', None),
                'hp': getattr(bm, 'drain', None),
                'od': getattr(bm, 'accuracy', None),
            })

    return {
        'id': beatmapset.id,
        'artist': beatmapset.artist,
        'title': beatmapset.title,
        'creator': getattr(beatmapset, 'creator', ''),
        'status': getattr(beatmapset, 'ranked_status', ''),
        'difficulties': difficulties,
        'preview_url': f'https://b.ppy.sh/preview/{beatmapset.id}.mp3',
        'url': f'https://osu.ppy.sh/beatmapsets/{beatmapset.id}',
    }
