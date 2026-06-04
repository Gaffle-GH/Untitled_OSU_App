import sys
import os
import httpx
import requests

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from include.cred import client
from osu.exceptions import RequestException

# GET: Fetch Beatmap Details and Download Preview
def fetch_details():
    while True:
        print("Enter a beatmapset ID or beatmap ID to fetch details and Download Preview Song & Beatmap.")
        print("Example: 'https://osu.ppy.sh/beatmapsets/1#osu/75' -> Beatmap ID: 75, Beatmapset ID: 1")
        user_input = input("ID: ").strip()
        if not user_input.isdigit():
            print("Please enter a numeric ID.")
            continue
        id = int(user_input)

        save_folder = "previews"
        if os.path.exists(save_folder):
            for file in os.listdir(save_folder):
                file_path = os.path.join(save_folder, file)
                if os.path.isfile(file_path):
                    os.remove(file_path)
        else:
            os.makedirs(save_folder, exist_ok=True)

        # Try as beatmap ID first
        try:
            beatmap = client.get_beatmap(id)
            # If this works, it's a beatmap ID
            if beatmap.status == 1:
                beatmap.status = "RANKED"
            elif beatmap.status == 2:
                beatmap.status = "APPROVED"
            else:
                beatmap.status = "UNRANKED"
            beatmap.difficulty_rating = round(beatmap.difficulty_rating, 2)
            print(f"RESULT:\n",
                f"{beatmap.beatmapset.title} by {beatmap.beatmapset.artist}\n",
                f"Difficulty: [{beatmap.version}] {beatmap.difficulty_rating} stars\n",
                f"Max Combo: {beatmap.max_combo}, BPM: {beatmap.bpm}, Length: {beatmap.total_length} seconds\n",
                f"Status: {beatmap.status}\n",
                f"URL: {beatmap.url}\n")
            preview_url = f"https://b.ppy.sh/preview/{beatmap.beatmapset.id}.mp3"
            beatmap_download(id, beatmap)
            response = httpx.get(preview_url)
            if response.status_code == 200:
                filename = f"preview.mp3"
                filepath = os.path.join(save_folder, filename)
                with open(filepath, "wb") as file:
                    file.write(response.content)
                print(f"Song preview downloaded successfully as '{filepath}'.")
                if sys.platform == "darwin":
                    os.system(f"open -a \"QuickTime Player\" \"{filepath}\"")
                elif sys.platform == "win32":
                    os.startfile(filepath)
                else:
                    os.system(f"xdg-open \"{filepath}\"")
            else:
                print(f"Failed to download preview: {response.status_code}")
            break
        except RequestException:
            # If not a beatmap, try as beatmapset
            try:
                beatmapset = client.get_beatmapset(id)
                print(f"RESULT:\n",
                      f"{beatmapset.title} by {beatmapset.artist}\n",
                      f"Beatmapset ID: {beatmapset.id}\n",
                      f"URL: https://osu.ppy.sh/beatmapsets/{beatmapset.id}\n")
                # Optionally, preview for the set
                preview_url = f"https://b.ppy.sh/preview/{beatmapset.id}.mp3"
                response = httpx.get(preview_url)
                if response.status_code == 200:
                    filename = f"preview.mp3"
                    filepath = os.path.join(save_folder, filename)
                    with open(filepath, "wb") as file:
                        file.write(response.content)
                    print(f"Song preview downloaded successfully as '{filepath}'.")
                    if sys.platform == "darwin":
                        os.system(f"open -a \"QuickTime Player\" \"{filepath}\"")
                    elif sys.platform == "win32":
                        os.startfile(filepath)
                    else:
                        os.system(f"xdg-open \"{filepath}\"")
                else:
                    print(f"Failed to download preview: {response.status_code}")
                break
            except RequestException:
                print("An error occurred while fetching details. Please enter a valid beatmap or beatmapset ID.")
                continue

# GET: Download Beatmap
def beatmap_download(id, beatmap):
    mapset = client.get_beatmap(id)
    save_folder = "download"
    os.makedirs(save_folder, exist_ok=True)

    beatmapset_id = mapset.beatmapset.id
    print(f"Beatmapset Code: {beatmapset_id}\n"
          f"Web URL: https://osu.ppy.sh/beatmapsets/{beatmapset_id}#osu/{id}\n")

    mirrors = [
        (f"https://api.nerinyan.moe/d/{beatmapset_id}", (10, 120)),
        (f"https://beatconnect.io/b/{beatmapset_id}", (5, 60)), # rate-limited, keep as fallback
        (f"https://kitsu.moe/api/d/{beatmapset_id}", (5, 60)),
    ]

    response = None
    initial_chunk = None
    for url, timeout in mirrors:
        try:
            print(f"Trying: {url}")
            r = requests.get(url, stream=True, timeout=timeout)
            r.raise_for_status()

            content_type = r.headers.get("Content-Type", "").lower()
            if "html" in content_type or "text" in content_type:
                print(f"Mirror returned HTML content-type ({content_type}), probably blocked or redirected: {url}")
                continue

            content_length = r.headers.get("Content-Length")
            if content_length is not None and int(content_length) < 100_000:
                print(f"Mirror returned suspiciously small content-length ({content_length}), skipping: {url}")
                continue

            initial_chunk = next(r.iter_content(chunk_size=8192), b"")
            if not initial_chunk:
                print(f"Mirror returned empty stream, skipping: {url}")
                continue

            # Osu .osz is a ZIP archive, starts with PK\x03\x04
            if not initial_chunk.startswith(b"PK"):
                lower = initial_chunk.lower()
                if b"<html" in lower or b"<doctype" in lower:
                    print(f"Mirror returned HTML body instead of OSZ, skipping: {url}")
                    continue
                print(f"Mirror returned non-OSZ binary first bytes, skipping: {url}")
                continue

            response = r
            print(f"Success!")
            break
        except Exception as e:
            print(f"Failed: {e}")
            continue

    if response is None:
        raise RuntimeError("All mirrors failed or returned invalid file content. Try again later.")

    filename = f"{beatmapset_id} - {beatmap.beatmapset.artist} {beatmap.beatmapset.title}.osz"
    filepath = os.path.join(save_folder, filename)

    with open(filepath, "wb") as f:
        f.write(initial_chunk)
        for chunk in response.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)

    print(f"Saved to: {filepath}")
    return filepath


if __name__ == "__main__":
    fetch_details()

