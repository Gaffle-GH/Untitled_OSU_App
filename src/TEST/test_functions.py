import warnings
warnings.filterwarnings("ignore", message="urllib3 v2 only supports OpenSSL")
from urllib3.exceptions import NotOpenSSLWarning
warnings.simplefilter("ignore", NotOpenSSLWarning)

import sys
import os
import httpx
import requests
import time
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import zipfile
from PIL import Image

sys.path.append(os.path.join(os.path.dirname(__file__), '../..')) 

from include.const import Colors

def _tag(label, color=Colors.BLUE):
    return f"{Colors.BOLD}{color}[{label}]{Colors.END}"

def _ok(msg):    print(f"  {_tag('OK',    Colors.GREEN)}  {msg}")
def _warn(msg):  print(f"  {_tag('WARN',  Colors.YELLOW)}  {msg}")
def _err(msg):   print(f"  {_tag('ERR',   Colors.RED)}  {msg}")
def _info(msg):  print(f"  {_tag('INFO',  Colors.BLUE)}  {msg}")
def _try(msg):   print(f"  {_tag('TRY',   Colors.DIM)}  {msg}")

def _section(title):
    print(f"\n{Colors.BOLD}{Colors.CYAN}[ {title} ]{Colors.END}")

def _field(key, value, value_color=""):
    print(f"  {Colors.DIM}{key:<14}{Colors.END}  {value_color}{value}{Colors.END if value_color else ''}")


def unique_path(base_path):
    if not os.path.exists(base_path):
        return base_path

    root, ext = os.path.splitext(base_path)
    index = 1
    while True:
        candidate = f"{root} ({index}){ext}"
        if not os.path.exists(candidate):
            return candidate
        index += 1


def unique_path_for_content(base_path, content):
    if not os.path.exists(base_path):
        return base_path

    with open(base_path, 'rb') as existing_file:
        if existing_file.read() == content:
            return base_path

    root, ext = os.path.splitext(base_path)
    index = 1
    while True:
        candidate = f"{root} ({index}){ext}"
        if not os.path.exists(candidate):
            return candidate
        index += 1

sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

from include.cred import client
# from osu.exceptions import RequestException
RequestException = Exception  # fallback to generic Exception if osu.exceptions is unavailable
from osu import Mods
from rosu_pp_py import Beatmap, Performance
from src.main import fetch_details

# Downlaods OSZ
def test_download(beatmapset_id):
    script_dir  = os.path.dirname(os.path.abspath(__file__))
    save_folder = os.path.join(script_dir, "download")
    os.makedirs(save_folder, exist_ok=True)

    # Use beatmapset metadata for filenames and URLs
    mapset = client.get_beatmapset(beatmapset_id)

    existing_files = [f for f in os.listdir(save_folder) if f.endswith('.osz') and str(beatmapset_id) in f]
    valid_existing = None
    for existing_file in existing_files:
        filepath = os.path.join(save_folder, existing_file)
        if zipfile.is_zipfile(filepath):
            valid_existing = filepath
            break
        _warn(f"invalid existing OSZ removed: {existing_file}")
        os.remove(filepath)

    if valid_existing:
        _ok(f"already downloaded  {Colors.DIM}{os.path.basename(valid_existing)}{Colors.END}")
        extract_result = test_extract_beatmap(valid_existing)
        return {
            "osz_path": valid_existing,
            "extract": extract_result,
        }

    _section("DOWNLOAD BEATMAP")
    print()
    _field("beatmapset id", str(beatmapset_id), Colors.YELLOW)
    _field("url",           f"https://osu.ppy.sh/beatmapsets/{beatmapset_id}")
    print()

    # Mirrors to try (domain, (connect_timeout, read_timeout))
    # Prefer the API host that worked manually (api.nerinyan.moe) first.
    mirrors = [
        (f"https://api.nerinyan.moe/d/{beatmapset_id}", (10, 120)),
        (f"https://dl.nerinyan.moe/v2/d/{beatmapset_id}", (10, 120)),
    ]

    session = requests.Session()
    # Use browser-like headers — some mirrors block unknown user-agents or require Referer
    browser_ua = (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
    )
    referer = f"https://osu.ppy.sh/beatmapsets/{beatmapset_id}"
    session.headers.update({
        "User-Agent": browser_ua,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": referer,
    })

    filename = f"{beatmapset_id} - {mapset.artist} {mapset.title}.osz"
    filepath = os.path.join(save_folder, filename)
    temp_path = os.path.join(save_folder, f".{beatmapset_id}.part")

    for url, timeout in mirrors:
        try:
            _try(url)
            # Retry on 429 with exponential backoff
            max_attempts = 3
            backoff = 1
            r = None
            for attempt in range(1, max_attempts + 1):
                try:
                    r = session.get(url, stream=True, timeout=timeout)
                except requests.exceptions.RequestException as e:
                    # network-level error, break to outer handler
                    raise

                if r.status_code == 429:
                    if attempt < max_attempts:
                        _warn(f"429 Too Many Requests, retrying in {backoff}s (attempt {attempt}/{max_attempts})")
                        time.sleep(backoff)
                        backoff *= 2
                        continue
                    else:
                        _err(f"429 Client Error: Too Many Requests for url: {url}/")
                        break

                # non-429: validate status
                r.raise_for_status()
                break

            # if we exhausted retries and received 429, move to next mirror
            if r is None or r.status_code == 429:
                continue

            content_type = r.headers.get("Content-Type", "").lower()
            if "html" in content_type or "text" in content_type:
                _warn(f"HTML content-type returned, skipping")
                continue

            # Write full response to a temporary file, then validate as zip
            with open(temp_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)

            if os.path.getsize(temp_path) == 0:
                _warn("empty stream, skipping")
                try:
                    os.remove(temp_path)
                except OSError:
                    pass
                continue

            if not zipfile.is_zipfile(temp_path):
                _warn("downloaded file is not a valid OSZ, skipping mirror")
                try:
                    os.remove(temp_path)
                except OSError:
                    pass
                continue

            os.replace(temp_path, filepath)
            _ok("mirror accepted")
            _ok(f"saved  {Colors.DIM}{filepath}{Colors.END}")
            print()
            extract_result = test_extract_beatmap(filepath)
            return {
                "osz_path": filepath,
                "extract": extract_result,
            }

        except requests.exceptions.RequestException as e:
            _err(str(e))
            continue
        except Exception as e:
            _err(str(e))
            continue
        finally:
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass

    raise RuntimeError("all mirrors failed or returned invalid content — try again later")

# Fetches Details of Beatmap (Specifically the ID Difficulty)
def test_details(TEST, id):
    script_dir  = os.path.dirname(os.path.abspath(__file__))
    save_folder = os.path.join(script_dir, "previews")

    if not os.path.exists(save_folder):
        os.makedirs(save_folder, exist_ok=True)

    # Try as beatmapset ID first
    beatmapset = None
    try:
        beatmapset = client.get_beatmapset(id)
    except RequestException:
        beatmapset = None

    if beatmapset is not None:
        _section("BEATMAPSET DETAILS")
        print(f"\n  {Colors.BOLD}{Colors.CYAN}{beatmapset.title}{Colors.END}  "
              f"{Colors.DIM}by{Colors.END}  {Colors.CYAN}{beatmapset.artist}{Colors.END}\n")
        _field("Beatmapset ID", beatmapset.id, Colors.YELLOW)
        _field("URL", f"{Colors.UNDERLINE}https://osu.ppy.sh/beatmapsets/{beatmapset.id}{Colors.END}")
        print()

        preview_url = f"https://b.ppy.sh/preview/{beatmapset.id}.mp3"
        response    = httpx.get(preview_url)
        if response.status_code == 200:
            filename = f"{beatmapset.id}_preview.mp3"
            filepath = os.path.join(save_folder, filename)
            with open(filepath, "wb") as file:
                file.write(response.content)
            _ok(f"Preview Saved  {Colors.DIM}{filepath}{Colors.END}")

            if sys.platform == "darwin":
                os.system(f"open -a \"QuickTime Player\" \"{filepath}\"")
            elif sys.platform == "win32":
                os.startfile(filepath)
            else:
                os.system(f"xdg-open \"{filepath}\"")
        else:
            raise RuntimeError(f"preview download failed ({response.status_code})")
        
        # Show available difficulties and let user choose
        if hasattr(beatmapset, 'beatmaps') and beatmapset.beatmaps:
            print(f"\n  {Colors.BOLD}Available Difficulties:{Colors.END}")
            for i, bm in enumerate(beatmapset.beatmaps, 1):
                status_map = {1: "RANKED", 2: "APPROVED", 3: "QUALIFIED",
                              4: "LOVED", -1: "WIP", -2: "GRAVEYARD", 0: "PENDING"}
                status = status_map.get(bm.status, str(bm.status))
                star_rating = round(bm.difficulty_rating, 2) if hasattr(bm, 'difficulty_rating') else "?"
                print(f"    {Colors.DIM}[{i}]{Colors.END}  {bm.version:<20}  {star_rating}★  ({status})")
            print()
            
            # Prompt for selection
            if TEST:
                # For testing, use first one automatically
                selected_beatmap = beatmapset.beatmaps[0]
                _info(f"Auto-selecting first difficulty: {selected_beatmap.version}")
            else:
                # For interactive mode, ask user
                while True:
                    try:
                        choice = input(f"  {Colors.BOLD}Select difficulty [1-{len(beatmapset.beatmaps)}]:{Colors.END} ").strip()
                        choice_idx = int(choice) - 1
                        if 0 <= choice_idx < len(beatmapset.beatmaps):
                            selected_beatmap = beatmapset.beatmaps[choice_idx]
                            break
                        else:
                            print(f"  {_tag('ERR', Colors.RED)}  Invalid selection")
                    except ValueError:
                        print(f"  {_tag('ERR', Colors.RED)}  Please enter a number")
            
            print()
            # Use beatmapset id (not individual difficulty id) for downloads
            download_result = test_download(beatmapset.id)
            if not download_result.get("extract", {}).get("cropped"):
                raise RuntimeError("no cropped image produced from beatmap OSZ")
            return {
                "preview_path": filepath,
                "download": download_result,
            }
        else:
            raise RuntimeError("no beatmaps found in this beatmapset")

    # Try as beatmap ID
    try:
        beatmap = client.get_beatmap(id)
    except RequestException:
        raise RuntimeError("beatmap or beatmapset not found — please enter a valid ID")

    status_map = {1: "RANKED", 2: "APPROVED", 3: "QUALIFIED",
                  4: "LOVED", -1: "WIP", -2: "GRAVEYARD", 0: "PENDING"}
    beatmap.status = status_map.get(beatmap.status, str(beatmap.status))

    osu_file    = requests.get(f"https://osu.ppy.sh/osu/{id}")
    osu_map     = Beatmap(bytes=osu_file.content)
    perf        = Performance(accuracy=100, mods=0)
    pp_attrs    = perf.calculate(osu_map)
    star_rating = round(pp_attrs.difficulty.stars, 2)

    _section("BEATMAP DETAILS")
    print(f"\n  {Colors.BOLD}{Colors.CYAN}{beatmap.beatmapset.title}{Colors.END}  "
          f"{Colors.DIM}by{Colors.END}  {Colors.CYAN}{beatmap.beatmapset.artist}{Colors.END}\n")
    _field("Status",     beatmap.status,                       Colors.YELLOW)
    _field("Difficulty", f"[{beatmap.version}]  {star_rating}★")
    _field("PP (100%)",  f"{int(pp_attrs.pp):,}pp",            Colors.GREEN)
    _field("Max Combo",  f"{beatmap.max_combo}x")
    _field("BPM",        f"{beatmap.bpm}")
    _field("Length",     f"{beatmap.total_length}s")
    _field("URL",        f"{Colors.UNDERLINE}{beatmap.url}{Colors.END}")
    print()

    preview_url = f"https://b.ppy.sh/preview/{beatmap.beatmapset.id}.mp3"
    response    = httpx.get(preview_url)

    if response.status_code == 200:
        filename = f"{beatmap.beatmapset.id}_preview.mp3"
        filepath = os.path.join(save_folder, filename)
        with open(filepath, "wb") as file:
            file.write(response.content)
        _ok(f"Preview Saved  {Colors.DIM}{filepath}{Colors.END}")

        if sys.platform == "darwin":
            os.system(f"open -a \"QuickTime Player\" \"{filepath}\"")
        elif sys.platform == "win32":
            os.startfile(filepath)
        else:
            os.system(f"xdg-open \"{filepath}\"")
    else:
        raise RuntimeError(f"preview download failed ({response.status_code})")

    # Use beatmapset id for downloads (avoid per-difficulty id issues)
    download_result = test_download(beatmap.beatmapset.id)
    if not download_result.get("extract", {}).get("cropped"):
        raise RuntimeError("no cropped image produced from beatmap OSZ")

    result = {
        "preview_path": filepath,
        "download": download_result,
    }

    if TEST == False:
        print(f"\n  {_tag('SKIP', Colors.YELLOW)}  testing disabled\n")
        fetch_details()

    return result

# Extracts Beatmap's Background Art only
def test_extract_beatmap(filepath):
    script_dir     = os.path.dirname(os.path.abspath(__file__))
    extract_folder = os.path.join(script_dir, "previews")
    os.makedirs(extract_folder, exist_ok=True)

    image_exts = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff'}
    import re

    def sanitize(text: str) -> str:
        return re.sub(r"[^0-9A-Za-z._-]", "_", text)

    _section("EXTRACT BACKGROUND")
    print()

    extracted_paths = []
    cropped_paths = []

    try:
        with zipfile.ZipFile(filepath, 'r') as zip_ref:
            # Map archive names to bytes for quick lookup
            names = set(zip_ref.namelist())

            # Find all .osu files and parse their referenced backgrounds
            osu_entries = [n for n in zip_ref.namelist() if n.lower().endswith('.osu')]
            if not osu_entries:
                raise RuntimeError("no .osu files found in OSZ")

            for osu_name in osu_entries:
                try:
                    with zip_ref.open(osu_name) as f:
                        osu_text = f.read().decode('utf-8', errors='ignore')

                    # Look for background in [Events] lines like: 0,0,"bg.jpg",0,0
                    bg_match = re.search(r'"([^\"]+\.(?:jpg|jpeg|png|webp|bmp|gif|tiff))"', osu_text, re.IGNORECASE)
                    if not bg_match:
                        # Fallback: search for common background keywords in file list
                        bg_candidate = None
                        for n in names:
                            base = os.path.basename(n).lower()
                            if any(k in base for k in ("bg", "background", "cover", "title", "art", "poster")) and os.path.splitext(base)[1] in image_exts:
                                bg_candidate = n
                                break
                        if not bg_candidate:
                            continue
                        bg_name = bg_candidate
                    else:
                        bg_basename = bg_match.group(1)
                        # background may be referenced relative to the .osu file; search archive for matching name
                        possible = [n for n in names if os.path.basename(n).lower() == bg_basename.lower()]
                        if possible:
                            bg_name = possible[0]
                        else:
                            continue

                    # Construct output names: include osu difficulty/version to make per-song files
                    osu_base = os.path.splitext(os.path.basename(osu_name))[0]
                    out_basename = f"{sanitize(os.path.splitext(os.path.basename(filepath))[0])}_{sanitize(osu_base)}_{os.path.basename(bg_name)}"
                    extract_path = os.path.join(extract_folder, out_basename)

                    # Read image bytes and write uniquely by content
                    with zip_ref.open(bg_name) as src:
                        img_bytes = src.read()

                    extract_path = unique_path_for_content(extract_path, img_bytes)
                    if not os.path.exists(extract_path):
                        with open(extract_path, 'wb') as out_f:
                            out_f.write(img_bytes)

                    cropped_path = img_crop(extract_path)
                    # Return only the first found background/crop so one file is produced
                    _ok(f"{bg_name} for {osu_base}")
                    _info(f"{Colors.DIM}{cropped_path}{Colors.END}")
                    print()
                    return {
                        "extracted": [extract_path],
                        "cropped": [cropped_path],
                    }

                except Exception:
                    # keep processing other difficulties even if one fails
                    continue

    except zipfile.BadZipFile:
        raise RuntimeError("not a valid zip file, skipping extraction")
    except Exception as e:
        raise RuntimeError(f"extraction failed: {e}")

    if not extracted_paths:
        raise RuntimeError("no background images found in OSZ")

    print()
    return {
        "extracted": extracted_paths,
        "cropped": cropped_paths,
    }

# PASSED 
def search_by_range():
    pass

# Image cropping
def img_crop(input_path, output_path=None, size=(720, 300)):
    if output_path is None:
        root, ext = os.path.splitext(input_path)
        output_path = f"{root}_crop{ext}"

    if os.path.exists(output_path):
        return output_path

    with Image.open(input_path) as img:
        img = img.convert("RGB")
        width, height = img.size
        target_w, target_h = size
        target_ratio = target_w / target_h
        current_ratio = width / height

        if current_ratio > target_ratio:
            new_width = int(height * target_ratio)
            left = (width - new_width) // 2
            box = (left, 0, left + new_width, height)
        else:
            new_height = int(width / target_ratio)
            top = (height - new_height) // 2
            box = (0, top, width, top + new_height)

        cropped = img.crop(box).resize(size, Image.Resampling.LANCZOS)

        save_kwargs = {}
        ext = os.path.splitext(output_path)[1].lower()
        if ext in ('.jpg', '.jpeg'):
            save_kwargs = {'quality': 95, 'optimize': True, 'subsampling': 0}
        elif ext == '.webp':
            save_kwargs = {'quality': 95, 'method': 6}

        cropped.save(output_path, **save_kwargs)

    return output_path




if __name__ == "__main__":
    user_input = input("TESTING TRUE/FALSE: ")
    if user_input.lower() in ("true", "t"):
        test_details(True, 3881559)
    elif user_input.lower() in ("false", "f"):
        test_details(False, 3881559)