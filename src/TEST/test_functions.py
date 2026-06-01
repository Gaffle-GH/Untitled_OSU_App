import warnings
warnings.filterwarnings("ignore", message="urllib3 v2 only supports OpenSSL")
from urllib3.exceptions import NotOpenSSLWarning
warnings.simplefilter("ignore", NotOpenSSLWarning)

import sys
import os
import httpx
import requests
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

sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

from urllib import response
from include.cred import client
# from osu.exceptions import RequestException
RequestException = Exception  # fallback to generic Exception if osu.exceptions is unavailable
from osu import Mods
from rosu_pp_py import Beatmap, Performance
from src.main import fetch_details

# Downlaods OSZ
def test_download(id, beatmap):
    script_dir  = os.path.dirname(os.path.abspath(__file__))
    save_folder = os.path.join(script_dir, "download")
    os.makedirs(save_folder, exist_ok=True)

    mapset        = client.get_beatmap(id)
    beatmapset_id = mapset.beatmapset.id

    _section("DOWNLOAD BEATMAP")
    print()
    _field("beatmapset id", str(beatmapset_id), Colors.YELLOW)
    _field("url",           mapset.url)
    print()

    mirrors = [
        f"https://api.nerinyan.moe/d/{beatmapset_id}",
        f"https://beatconnect.io/b/{beatmapset_id}",
        f"https://kitsu.moe/api/d/{beatmapset_id}",
    ]

    response      = None
    initial_chunk = None

    for url in mirrors:
        try:
            _try(url)
            r = requests.get(url, stream=True, timeout=10)
            r.raise_for_status()

            content_type = r.headers.get("Content-Type", "").lower()
            if "html" in content_type or "text" in content_type:
                _warn(f"HTML content-type returned, skipping")
                continue

            content_length = r.headers.get("Content-Length")
            if content_length is not None and int(content_length) < 100_000:
                _warn(f"suspiciously small response ({content_length} bytes), skipping")
                continue

            initial_chunk = next(r.iter_content(chunk_size=8192), b"")
            if not initial_chunk:
                _warn("empty stream, skipping")
                continue

            if not initial_chunk.startswith(b"PK"):
                lower = initial_chunk.lower()
                if b"<html" in lower or b"<doctype" in lower:
                    _warn("HTML body returned instead of OSZ, skipping")
                else:
                    _warn("non-OSZ bytes returned, skipping")
                continue

            response = r
            _ok("mirror accepted")
            print()
            break

        except Exception as e:
            _err(str(e))
            continue

    if response is None:
        existing_files = [f for f in os.listdir(save_folder) if f.endswith('.osz')]
        for existing_file in existing_files:
            if str(beatmapset_id) in existing_file:
                _ok(f"already downloaded  {Colors.DIM}{existing_file}{Colors.END}")
                filepath = os.path.join(save_folder, existing_file)
                extract_result = test_extract_beatmap(filepath)
                return {
                    "osz_path": filepath,
                    "extract": extract_result,
                }
        raise RuntimeError("all mirrors failed or returned invalid content — try again later")

    filename = f"{beatmapset_id} - {mapset.beatmapset.artist} {mapset.beatmapset.title}.osz"
    filepath = os.path.join(save_folder, filename)

    with open(filepath, "wb") as f:
        f.write(initial_chunk)
        for chunk in response.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)

    _ok(f"saved  {Colors.DIM}{filepath}{Colors.END}")
    print()
    extract_result = test_extract_beatmap(filepath)
    return {
        "osz_path": filepath,
        "extract": extract_result,
    }

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
            download_result = test_download(selected_beatmap.id, selected_beatmap)
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

    download_result = test_download(id, beatmap)
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

# Extracts Beatmap's Song & Background Art
def test_extract_beatmap(filepath):
    script_dir     = os.path.dirname(os.path.abspath(__file__))
    extract_folder = os.path.join(script_dir, "previews")
    os.makedirs(extract_folder, exist_ok=True)

    extracted_paths = []
    cropped_paths = []

    _section("EXTRACT BACKGROUND")
    print()
    try:
        with zipfile.ZipFile(filepath, 'r') as zip_ref:
            for file_info in zip_ref.filelist:
                filename = file_info.filename
                if (filename.lower().endswith(('.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff')) and
                        '/' not in filename and '\\' not in filename):
                    basename = os.path.basename(filename)
                    extract_path = os.path.join(extract_folder, basename)
                    extract_path = unique_path(extract_path)
                    with zip_ref.open(filename) as source:
                        content = source.read()
                    with open(extract_path, 'wb') as target:
                        target.write(content)
                    cropped_path = img_crop(extract_path)
                    extracted_paths.append(extract_path)
                    cropped_paths.append(cropped_path)
                    _ok(f"{filename}")
                    _info(f"{Colors.DIM}{cropped_path}{Colors.END}")
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
        output_path = unique_path(output_path)

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