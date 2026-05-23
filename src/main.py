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
        print("Enter a valid beatmap ID to fetch details and Download Preview Song & Beatmap.")
        print("Example: 'https://osu.ppy.sh/beatmapsets/1#osu/75' -> ID: 75")
        id = int(input("ID: "))

        save_folder = "previews"

        # Delete existing previews inside folder (keep folder)
        if os.path.exists(save_folder):
            for file in os.listdir(save_folder):
                file_path = os.path.join(save_folder, file)
                if os.path.isfile(file_path):
                    os.remove(file_path)
        else:
            os.makedirs(save_folder, exist_ok=True)
        try:
            beatmap = client.get_beatmap(id)

            # Swap BEATMAP Status Code to String
            if beatmap.status == 1:
                beatmap.status = "RANKED"
            elif beatmap.status == 2:
                beatmap.status = "APPROVED"
            else:
                beatmap.status = "UNRANKED"

            # Round Difficulty Rating to 2 Decimal Places
            beatmap.difficulty_rating = round(beatmap.difficulty_rating, 2)

            print(f"RESULT:\n",
                f"{beatmap.beatmapset.title} by {beatmap.beatmapset.artist}\n",
                f"Difficulty: [{beatmap.version}] {beatmap.difficulty_rating} stars\n",
                f"Max Combo: {beatmap.max_combo}, BPM: {beatmap.bpm}, Length: {beatmap.total_length} seconds\n",
                f"Status: {beatmap.status}\n",
                f"URL: {beatmap.url}\n")

            # Song Preview DOWNLOAD and DELETES AFTER RERUN OF PROGRAM
            preview_url = f"https://b.ppy.sh/preview/{beatmap.beatmapset.id}.mp3"
            
            beatmap_download(id, beatmap)
            
            response = httpx.get(preview_url)
            if response.status_code == 200:
                filename = f"preview.mp3"
                filepath = os.path.join(save_folder, filename)

                with open(filepath, "wb") as file:
                    file.write(response.content)
                print(f"Song preview downloaded successfully as '{filepath}'.")

                # Open the downloaded preview file with QuickTime Player on macOS
                if sys.platform == "darwin":
                    os.system(f"open -a \"QuickTime Player\" \"{filepath}\"")
                elif sys.platform == "win32":
                    os.startfile(filepath)
                else:
                    os.system(f"xdg-open \"{filepath}\"")
            else:
                print(f"Failed to download preview: {response.status_code}")
            break # Exit loop if successful 

        except RequestException:
            print("An error occurred while fetching beatmap details. Retrying...")

# GET: Download Beatmap
def beatmap_download(id, beatmap):
    mapset = client.get_beatmap(id)
    save_folder = "download"
    os.makedirs(save_folder, exist_ok=True)

    beatmapset_id = mapset.beatmapset.id
    print(f"Beatmapset Code: {beatmapset_id}\n"
          f"Web URL: https://osu.ppy.sh/beatmapsets/{beatmapset_id}#osu/{id}\n")

    mirrors = [
        f"https://api.nerinyan.moe/d/{beatmapset_id}",
        f"https://beatconnect.io/b/{beatmapset_id}", # Currently Works
        f"https://kitsu.moe/api/d/{beatmapset_id}",
    ]

    response = None
    initial_chunk = None
    for url in mirrors:
        try:
            print(f"Trying: {url}")
            r = requests.get(url, stream=True, timeout=10)
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

