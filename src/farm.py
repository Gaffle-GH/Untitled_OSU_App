"""
PP farm maps, sourced from grumd's osu-pps dataset (https://osu-pps.com).

osu-pps aggregates the top plays of tens of thousands of players and ranks maps
by how often they show up as top PP sources — i.e. how "overweighted"/farmable a
map is. The data lives as CSV on the `data` branch of grumd/osu-pps:

  data/maps/<mode>/diffs.csv     per-difficulty farm data
  data/maps/<mode>/mapsets.csv   set metadata (artist/title/bpm)

We download, join, sort by farm value, and cache the result in memory.
"""

import csv
import io
import threading
import time

import requests

OSU_PPS_BASE = "https://raw.githubusercontent.com/grumd/osu-pps/data/data/maps"

# App mode string -> osu-pps directory name.
MODE_DIRS = {
    "osu": "osu",
    "taiko": "taiko",
    "fruits": "fruits",
    "catch": "fruits",
    "mania": "mania",
}

_CACHE_TTL_SECONDS = 6 * 60 * 60
_cache: dict[str, tuple[float, list[dict]]] = {}
_lock = threading.Lock()

# osu! mod bitmask -> acronym. NC supersedes DT, PF supersedes SD.
_MOD_BITS = [
    (2, "EZ"),
    (1, "NF"),
    (256, "HT"),
    (8, "HD"),
    (16, "HR"),
    (1024, "FL"),
    (512, "NC"),
    (64, "DT"),
    (16384, "PF"),
    (32, "SD"),
    (4096, "SO"),
    (128, "RX"),
    (8192, "AP"),
    (4, "TD"),
]


def decode_mods(value) -> list[str]:
    try:
        bits = int(float(value))
    except (TypeError, ValueError):
        return []

    has_nc = bits & 512
    has_pf = bits & 16384

    mods = []
    for bit, name in _MOD_BITS:
        if name == "DT" and has_nc:
            continue
        if name == "SD" and has_pf:
            continue
        if bits & bit:
            mods.append(name)
    return mods


def _to_float(value):
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return None


def _to_int(value):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _download_csv(url: str) -> list[dict]:
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    return list(csv.DictReader(io.StringIO(response.text)))


def _load_mode(mode_dir: str) -> list[dict]:
    diffs = _download_csv(f"{OSU_PPS_BASE}/{mode_dir}/diffs.csv")
    mapsets = _download_csv(f"{OSU_PPS_BASE}/{mode_dir}/mapsets.csv")

    set_meta = {row.get("s"): row for row in mapsets}

    maps = []
    for diff in diffs:
        set_id = diff.get("s")
        meta = set_meta.get(set_id, {})
        maps.append(
            {
                "beatmap_id": _to_int(diff.get("b")),
                "beatmapset_id": _to_int(set_id),
                "artist": meta.get("art") or "Unknown artist",
                "title": meta.get("t") or "Unknown title",
                "version": diff.get("v") or "",
                "mods": decode_mods(diff.get("m")),
                "stars": _to_float(diff.get("d")),
                "pp": _to_float(diff.get("pp99")),
                "farm_value": _to_float(diff.get("x")),
                "length": _to_int(diff.get("l")),
                "bpm": _to_float(meta.get("bpm")),
                "ar": _to_float(diff.get("ar")),
                "od": _to_float(diff.get("accuracy")),
                "cs": _to_float(diff.get("cs")),
                "hp": _to_float(diff.get("drain")),
                "cover_url": (
                    f"https://assets.ppy.sh/beatmaps/{set_id}/covers/cover.jpg"
                    if set_id
                    else None
                ),
            }
        )

    # Each beatmap can appear once per mod combo; keep the most farmable variant.
    maps.sort(key=lambda m: m["farm_value"] or 0, reverse=True)
    deduped = []
    seen = set()
    for m in maps:
        bid = m["beatmap_id"]
        if bid in seen:
            continue
        seen.add(bid)
        deduped.append(m)
    return deduped


def get_farm_maps(mode: str = "osu", limit: int = 150) -> list[dict]:
    mode_dir = MODE_DIRS.get(mode, "osu")
    now = time.time()

    with _lock:
        cached = _cache.get(mode_dir)
        if cached and now - cached[0] < _CACHE_TTL_SECONDS:
            data = cached[1]
        else:
            data = _load_mode(mode_dir)
            _cache[mode_dir] = (now, data)

    return data[: max(1, limit)]
