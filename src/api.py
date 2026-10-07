from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import sys
import os
import json
import base64
import asyncio
from pathlib import Path

# Add repo root and src to path
repo_root = os.path.normpath(os.path.join(os.path.dirname(__file__), '..'))
src_root = os.path.dirname(__file__)
sys.path.insert(0, repo_root)
sys.path.insert(0, src_root)

bundle_root = Path(getattr(sys, "_MEIPASS", repo_root))
frontend_dist_dir = bundle_root / "frontend" / "dist"

from include.cred import client, client_id, client_secret
from TEST.osu_gui import (
    do_oauth_flow,
    fetch_user_stats,
    fetch_available_modes,
    beatmap_search,
    get_me_id,
    load_token,
    save_token,
    delete_token,
)
from TEST.test_functions import test_download, test_details, test_extract_beatmap, img_crop
from osu import GameModeStr, UserScoreType

app = FastAPI(title="osu! Trainer API")

# CORS configuration for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:3000", "http://127.0.0.1:5173", "http://127.0.0.1:5174", "http://127.0.0.1:5175"],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Data Models
# ============================================================================


class BeatmapSearchResponse(BaseModel):
    id: int
    artist: str
    title: str
    creator: str
    status: str
    difficulties: list
    preview_url: str
    url: str


class UserStatsResponse(BaseModel):
    user_id: int
    username: str
    rank: int
    pp: float
    accuracy: float
    play_count: int
    top_scores: list
    recent_scores: list


class BeatmapDownloadRequest(BaseModel):
    beatmap_id: int


class BeatmapSearchAndDownloadRequest(BaseModel):
    beatmapset_id: int


class OAuthCallbackRequest(BaseModel):
    code: str


class DownloadResponse(BaseModel):
    success: bool
    filename: str
    message: str


def serialize_beatmap_info(beatmap_info: dict) -> dict:
    """
    Convert osu.py enum-like values into JSON-safe strings.
    """
    if "difficulties" in beatmap_info:
        for diff in beatmap_info["difficulties"]:
            if hasattr(diff.get("status"), "name"):
                diff["status"] = diff["status"].name
            elif hasattr(diff.get("status"), "value"):
                diff["status"] = diff["status"].value

    if hasattr(beatmap_info.get("status"), "name"):
        beatmap_info["status"] = beatmap_info["status"].name
    elif hasattr(beatmap_info.get("status"), "value"):
        beatmap_info["status"] = beatmap_info["status"].value

    return beatmap_info


def first_asset_path(extract_result: dict, key: str) -> str | None:
    value = extract_result.get(key)
    if isinstance(value, list) and value:
        return value[0]
    if isinstance(value, str):
        return value
    return None


def filename_or_empty(path: str | None) -> str:
    return os.path.basename(path) if path else ""


def resolve_user_identifier(user_identifier: str) -> str | int:
    if user_identifier == "me":
        user_id = get_me_id()
        if not user_id:
            raise HTTPException(status_code=401, detail="Not signed in")
        return user_id
    return user_identifier


def score_rank_label(score) -> str | None:
    rank = getattr(score, "rank", None)
    if rank is None:
        return None
    name = rank.name if hasattr(rank, "name") else str(rank)
    return name.replace("SILVER_", "")


def beatmapset_image_url(beatmapset) -> str | None:
    if beatmapset is None:
        return None

    background = getattr(beatmapset, "background_url", None)
    if background:
        return background

    covers = getattr(beatmapset, "covers", None)
    if covers is not None:
        cover = getattr(covers, "cover", None)
        if cover:
            return cover

    beatmapset_id = getattr(beatmapset, "id", None)
    if beatmapset_id:
        return f"https://assets.ppy.sh/beatmaps/{beatmapset_id}/covers/cover.jpg"

    return None


def score_map_fields(score) -> dict:
    beatmap = getattr(score, "beatmap", None)
    difficulty = None
    stars = None
    beatmap_id = None
    beatmapset_id = None
    cover_url = None
    title = "Unknown beatmap"

    beatmap_max_combo = None
    if beatmap is not None:
        difficulty = getattr(beatmap, "version", None)
        stars = getattr(beatmap, "difficulty_rating", None)
        beatmap_id = getattr(beatmap, "id", None)
        beatmapset_id = getattr(beatmap, "beatmapset_id", None)
        beatmap_max_combo = getattr(beatmap, "max_combo", None)

    beatmapset = getattr(score, "beatmapset", None)
    if beatmapset is None and beatmap is not None:
        beatmapset = getattr(beatmap, "beatmapset", None)

    if beatmapset is not None:
        beatmapset_id = getattr(beatmapset, "id", None) or beatmapset_id
        cover_url = beatmapset_image_url(beatmapset)
        artist = getattr(beatmapset, "artist", None) or "Unknown artist"
        song = getattr(beatmapset, "title", None) or "Unknown title"
        title = f"{artist} - {song}"
    elif difficulty:
        title = difficulty
    elif beatmap_id:
        title = f"Beatmap #{beatmap_id}"

    if cover_url is None and beatmapset_id:
        cover_url = f"https://assets.ppy.sh/beatmaps/{beatmapset_id}/covers/cover.jpg"

    return {
        "title": title,
        "difficulty": difficulty,
        "stars": stars,
        "beatmap_id": beatmap_id,
        "beatmapset_id": beatmapset_id,
        "beatmap_max_combo": beatmap_max_combo,
        "cover_url": cover_url,
    }


def score_title(score) -> str:
    return score_map_fields(score)["title"]


def mod_labels(score) -> list[str]:
    mods = getattr(score, "mods", None) or []
    labels = []
    for mod in mods:
        if hasattr(mod, "short_name"):
            labels.append(mod.short_name)
            continue
        nested = getattr(mod, "mod", None)
        if nested is not None and hasattr(nested, "value"):
            labels.append(nested.value)
            continue
        if hasattr(mod, "name"):
            labels.append(mod.name)
            continue
        labels.append(str(mod))
    return labels


def score_hit_counts(score) -> dict:
    stats = getattr(score, "statistics", None)

    def pick(*names):
        for name in names:
            value = getattr(stats, name, None)
            if value is not None:
                return value
        return 0

    if stats is None:
        return {"count_300": 0, "count_100": 0, "count_50": 0, "count_miss": 0}

    return {
        "count_300": pick("count_300", "great", "perfect"),
        "count_100": pick("count_100", "ok", "good"),
        "count_50": pick("count_50", "meh"),
        "count_miss": pick("count_miss", "miss"),
    }


def score_created_at(score) -> str | None:
    created = getattr(score, "created_at", None)
    if created is None:
        return None
    if hasattr(created, "isoformat"):
        try:
            return created.isoformat()
        except Exception:
            return str(created)
    return str(created)


def serialize_score(score) -> dict:
    map_fields = score_map_fields(score)
    return {
        **map_fields,
        "pp": getattr(score, "pp", 0) or 0,
        "score": getattr(score, "score", 0) or 0,
        "accuracy": getattr(score, "accuracy", 0) or 0,
        "max_combo": getattr(score, "max_combo", None),
        "grade": score_rank_label(score),
        "mods": mod_labels(score),
        "created_at": score_created_at(score),
        **score_hit_counts(score),
    }


def user_cover_url(user) -> str | None:
    cover = getattr(user, "cover", None)
    if cover is not None:
        for attr in ("custom_url", "url"):
            value = getattr(cover, attr, None)
            if value:
                return value
    return getattr(user, "cover_url", None) or None


def serialize_user_brief(user) -> dict:
    country = getattr(user, "country", None)
    return {
        "user_id": user.id,
        "username": user.username,
        "avatar_url": getattr(user, "avatar_url", None),
        "cover_url": user_cover_url(user),
        "country": country.name if country else None,
    }


def download_preview_file(beatmapset_id: int) -> str:
    """
    Download the beatmapset preview MP3 without opening an external player.
    """
    preview_folder = Path(__file__).resolve().parent / "TEST" / "previews"
    preview_folder.mkdir(parents=True, exist_ok=True)

    preview_path = preview_folder / f"{beatmapset_id}_preview.mp3"
    if preview_path.exists() and preview_path.stat().st_size > 0:
        return str(preview_path)

    import requests

    response = requests.get(
        f"https://b.ppy.sh/preview/{beatmapset_id}.mp3",
        timeout=30,
    )
    response.raise_for_status()
    preview_path.write_bytes(response.content)

    return str(preview_path)


def download_osz_and_extract_assets(beatmapset_id: int) -> dict:
    """
    Download the OSZ and extract/crop its background image.
    """
    download_result = test_download(beatmapset_id)
    osz_path = download_result.get("osz_path")
    extract_result = download_result.get("extract") or {}

    if osz_path and not extract_result:
        extract_result = test_extract_beatmap(osz_path)

    background_path = (
        first_asset_path(extract_result, "cropped")
        or first_asset_path(extract_result, "extracted")
    )

    return {
        "osz_path": osz_path or "",
        "background_path": background_path or "",
        "background_image": filename_or_empty(background_path),
        "extracted_paths": extract_result,
    }


# ============================================================================
# OAuth Endpoints
# ============================================================================


@app.post("/api/oauth/start")
async def start_oauth():
    """
    Initiates OAuth flow and returns authorization URL.
    """
    try:
        redirect_uri = "http://localhost:53682/callback"
        auth_url = (
            f"https://osu.ppy.sh/oauth/authorize?client_id={client_id}"
            f"&redirect_uri={redirect_uri}&response_type=code&scope=identify%20public"
        )
        return {"auth_url": auth_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/oauth/callback")
async def oauth_callback(request: OAuthCallbackRequest):
    """
    Handles OAuth callback with authorization code.
    """
    try:
        redirect_uri = "http://localhost:53682/callback"
        token_resp_data = {
            'client_id': client_id,
            'client_secret': client_secret,
            'code': request.code,
            'grant_type': 'authorization_code',
            'redirect_uri': redirect_uri,
        }

        import requests

        token_resp = requests.post('https://osu.ppy.sh/oauth/token', json=token_resp_data)

        if token_resp.status_code != 200:
            raise HTTPException(
                status_code=400,
                detail=f"Token exchange failed: {token_resp.status_code}"
            )

        token_data = token_resp.json()
        save_token(token_data)

        return {"success": True, "message": "OAuth token saved"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/oauth/signin")
async def oauth_signin():
    """
    Open osu! OAuth in the browser, wait for authorization, and save the token.
    """
    try:
        await asyncio.to_thread(do_oauth_flow)
        user_id = get_me_id()
        if not user_id:
            raise HTTPException(
                status_code=400,
                detail="Sign-in completed but user could not be resolved",
            )

        user = client.get_user(user_id)
        return {"success": True, **serialize_user_brief(user)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/oauth/signout")
async def oauth_signout():
    """
    Remove the saved OAuth token.
    """
    delete_token()
    return {"success": True}


@app.get("/api/auth/status")
async def auth_status():
    """
    Check if user is authenticated and return user info.
    """
    try:
        token = load_token()
        if not token or 'access_token' not in token:
            return {"authenticated": False}

        user_id = get_me_id()
        if not user_id:
            return {"authenticated": False}

        user = client.get_user(user_id)
        return {
            "authenticated": True,
            **serialize_user_brief(user),
        }
    except Exception:
        return {"authenticated": False}


# ============================================================================
# Beatmap Endpoints
# ============================================================================


@app.get("/api/beatmap/search/{beatmap_id}")
async def search_beatmap(beatmap_id: int):
    """
    Search for a beatmap or beatmapset by ID.
    """
    try:
        return serialize_beatmap_info(beatmap_search(beatmap_id))
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/beatmap/search-and-download")
async def search_and_download_beatmap(request: BeatmapSearchAndDownloadRequest):
    """
    Search a beatmapset, then download its preview song, OSZ, and background image.
    """
    try:
        beatmap_info = serialize_beatmap_info(beatmap_search(request.beatmapset_id))
        beatmapset_id = int(beatmap_info["id"])

        preview_path = download_preview_file(beatmapset_id)
        asset_result = download_osz_and_extract_assets(beatmapset_id)

        return {
            "success": True,
            "beatmapset_id": beatmapset_id,
            "beatmap": beatmap_info,
            "assets": {
                "preview_path": preview_path,
                "preview_filename": filename_or_empty(preview_path),
                **asset_result,
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/beatmap/download")
async def download_beatmap(request: BeatmapDownloadRequest):
    """
    Download a beatmap by ID.
    """
    try:
        result = test_download(request.beatmap_id)
        return {
            "success": True,
            "filename": result.get("filename", ""),
            "message": f"Beatmap {request.beatmap_id} downloaded successfully",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# User Endpoints
# ============================================================================


@app.get("/api/farm/maps")
async def farm_maps(mode: str = "osu", limit: int = 150):
    """
    Return the most farmable (overweighted) maps for a mode, from osu-pps data.
    """
    try:
        from farm import get_farm_maps

        bounded = max(1, min(limit, 500))
        return {"mode": mode, "maps": get_farm_maps(mode, bounded)}
    except Exception as e:
        raise HTTPException(
            status_code=502, detail=f"Failed to load farm data: {e}"
        )


@app.get("/api/user/{user_identifier}/modes")
async def get_user_modes(user_identifier: str):
    """
    Return which game modes the user has plays in, plus their main mode.
    """
    try:
        resolved_id = resolve_user_identifier(user_identifier)
        modes, main_mode = fetch_available_modes(resolved_id)
        return {"modes": modes, "main_mode": main_mode}
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/user/{user_identifier}/stats")
async def get_user_stats(user_identifier: str, mode: str = "osu", top_n: int = 100):
    """
    Get user statistics including top and recent scores.
    """
    try:
        game_mode = GameModeStr(mode) if mode else GameModeStr.STANDARD
        resolved_id = resolve_user_identifier(user_identifier)
        limit = max(1, min(top_n, 100))
        user, stats, tops, recents = fetch_user_stats(
            resolved_id,
            mode=game_mode,
            top_n=limit,
        )

        return {
            **serialize_user_brief(user),
            "rank": stats.global_rank if stats else None,
            "country_rank": stats.country_rank if stats else None,
            "pp": stats.pp if stats else None,
            "accuracy": stats.hit_accuracy if stats else None,
            "play_count": stats.play_count if stats else None,
            "top_scores": [serialize_score(s) for s in tops],
            "recent_scores": [serialize_score(s) for s in recents],
        }
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


# ============================================================================
# Beatmap Download & Extraction Endpoints
# ============================================================================


class BeatmapDownloadWithExtractRequest(BaseModel):
    beatmapset_id: int


@app.post("/api/beatmap/download-with-extract")
async def download_and_extract(request: BeatmapDownloadWithExtractRequest):
    """
    Download a beatmap and extract its background image in one request.
    Returns paths to the downloaded OSZ and extracted/cropped background image.
    """
    try:
        asset_result = download_osz_and_extract_assets(request.beatmapset_id)
        if not asset_result["osz_path"]:
            raise HTTPException(status_code=500, detail="Failed to download beatmap")

        return {
            "success": True,
            "beatmapset_id": request.beatmapset_id,
            **asset_result,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/beatmap/details-and-preview")
async def get_beatmap_details_and_preview(request: BeatmapDownloadRequest):
    """
    Get beatmap details and download preview music file.
    """
    try:
        beatmap_info = serialize_beatmap_info(beatmap_search(request.beatmap_id))
        preview_path = download_preview_file(int(beatmap_info["id"]))

        return {
            "success": True,
            "beatmap_id": request.beatmap_id,
            "preview_path": preview_path,
            "preview_filename": filename_or_empty(preview_path),
            **beatmap_info,
        }
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


class ImageCropRequest(BaseModel):
    image_path: str
    size_width: int = 720
    size_height: int = 300


@app.post("/api/image/crop")
async def crop_image(request: ImageCropRequest):
    """
    Crop an image file to specified dimensions.
    """
    try:
        if not os.path.exists(request.image_path):
            raise HTTPException(status_code=404, detail="Image file not found")

        output_path = img_crop(
            request.image_path,
            size=(request.size_width, request.size_height)
        )

        return {
            "success": True,
            "input_path": request.image_path,
            "output_path": output_path,
            "width": request.size_width,
            "height": request.size_height,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/beatmap/preview-file/{beatmapset_id}")
async def get_preview_file(beatmapset_id: int):
    """
    Get the preview music file for a beatmap.
    """
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        preview_folder = os.path.join(script_dir, "TEST", "previews")

        # Look for preview file
        preview_filename = f"{beatmapset_id}_preview.mp3"
        preview_path = os.path.join(preview_folder, preview_filename)

        if not os.path.exists(preview_path):
            raise HTTPException(status_code=404, detail="Preview file not found")

        return FileResponse(preview_path, media_type="audio/mpeg")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/beatmap/{beatmapset_id}/cropped-image")
async def get_cropped_image_filename(beatmapset_id: int):
    """
    Get the filename of the cropped background image for a beatmapset if it exists.
    Returns the filename that can be used with /api/beatmap/background-file/{filename}
    """
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        preview_folder = os.path.join(script_dir, "TEST", "previews")
        
        # Look for files starting with the beatmapset ID and containing "_crop"
        if not os.path.exists(preview_folder):
            raise HTTPException(status_code=404, detail="Cropped image not found")
        
        beatmapset_str = str(beatmapset_id)
        cropped_files = [
            f for f in os.listdir(preview_folder)
            if f.startswith(beatmapset_str) and "_crop" in f
        ]
        
        if not cropped_files:
            raise HTTPException(status_code=404, detail="Cropped image not found")
        
        # Return the first cropped image found
        return {"filename": cropped_files[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/beatmap/background-file/{filename:path}")
async def get_background_file(filename: str):
    """
    Get a beatmap background image file.
    """
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        preview_folder = os.path.join(script_dir, "TEST", "previews")
        
        # Prevent directory traversal attacks
        safe_path = os.path.normpath(os.path.join(preview_folder, filename))
        if not safe_path.startswith(preview_folder):
            raise HTTPException(status_code=403, detail="Access denied")

        if not os.path.exists(safe_path):
            raise HTTPException(status_code=404, detail="Image file not found")

        # Determine media type
        ext = os.path.splitext(safe_path)[1].lower()
        media_types = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".webp": "image/webp",
        }
        media_type = media_types.get(ext, "application/octet-stream")

        return FileResponse(safe_path, media_type=media_type)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Health Check
# ============================================================================


@app.get("/api/health")
async def health_check():
    """
    Simple health check endpoint.
    """
    return {"status": "ok"}


# ============================================================================
# React Frontend
# ============================================================================


if frontend_dist_dir.exists():
    app.mount(
        "/",
        StaticFiles(directory=str(frontend_dist_dir), html=True),
        name="frontend",
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
