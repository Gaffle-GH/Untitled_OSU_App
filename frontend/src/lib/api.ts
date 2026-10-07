// Always use the page origin so the PyWebView desktop app works when the
// backend is started on a dynamic localhost port. Vite dev proxies /api.
const API_BASE_URL = window.location.origin;

export interface BeatmapData {
  id: number;
  artist: string;
  title: string;
  creator: string;
  status: string;
  difficulties: Array<{
    id?: number;
    version: string;
    stars: number;
    status: string;
    ar?: number;
    cs?: number;
    hp?: number;
    od?: number;
  }>;
  preview_url: string;
  url: string;
}

export interface UserStatsData {
  user_id: number;
  username: string;
  avatar_url?: string | null;
  cover_url?: string | null;
  country?: string | null;
  rank: number | null;
  country_rank?: number | null;
  pp: number | null;
  accuracy: number | null;
  play_count: number | null;
  top_scores: Array<{
    title: string;
    difficulty?: string | null;
    stars?: number | null;
    beatmap_id?: number | null;
    beatmapset_id?: number | null;
    beatmap_max_combo?: number | null;
    cover_url?: string | null;
    pp: number;
    score: number;
    accuracy: number;
    max_combo?: number | null;
    grade?: string | null;
    mods: string[];
    created_at?: string | null;
    count_300?: number;
    count_100?: number;
    count_50?: number;
    count_miss?: number;
  }>;
  recent_scores: Array<{
    title: string;
    pp: number;
    score: number;
    accuracy: number;
    grade?: string | null;
    mods: string[];
  }>;
}

export interface AuthStatus {
  authenticated: boolean;
  user_id?: number;
  username?: string;
  avatar_url?: string | null;
  country?: string | null;
}

export interface SignInResponse {
  success: boolean;
  user_id: number;
  username: string;
  avatar_url?: string | null;
  country?: string | null;
}

export interface DownloadWithExtractResponse {
  success: boolean;
  beatmapset_id: number;
  osz_path: string;
  background_image: string;
  background_path?: string;
  extracted_paths: {
    extracted?: string[];
    cropped?: string[];
  };
}

export interface DetailsAndPreviewResponse extends BeatmapData {
  success: boolean;
  beatmap_id: number;
  preview_path?: string;
  preview_filename?: string;
}

export interface ImageCropResponse {
  success: boolean;
  input_path: string;
  output_path: string;
  width: number;
  height: number;
}

export interface SearchAndDownloadResponse {
  success: boolean;
  beatmapset_id: number;
  beatmap: BeatmapData;
  assets: {
    preview_path: string;
    preview_filename: string;
    osz_path: string;
    background_path: string;
    background_image: string;
    extracted_paths: {
      extracted?: string[];
      cropped?: string[];
    };
  };
}

// Health check
export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`);
    return response.ok;
  } catch (error) {
    console.error("Health check failed:", error);
    return false;
  }
}

// OAuth endpoints
export async function startOAuth(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/oauth/start`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Failed to start OAuth");
  }
  const data = await response.json();
  return data.auth_url;
}

export async function handleOAuthCallback(code: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/oauth/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) {
    throw new Error("OAuth callback failed");
  }
}

export async function getAuthStatus(): Promise<AuthStatus> {
  const response = await fetch(`${API_BASE_URL}/api/auth/status`);
  if (!response.ok) {
    return { authenticated: false };
  }
  return response.json();
}

export async function signIn(): Promise<SignInResponse> {
  const response = await fetch(`${API_BASE_URL}/api/oauth/signin`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, "Sign in failed"));
  }
  return response.json();
}

export async function signOut(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/oauth/signout`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, "Sign out failed"));
  }
}

// Beatmap endpoints
export async function searchBeatmap(beatmapId: number): Promise<BeatmapData> {
  const response = await fetch(
    `${API_BASE_URL}/api/beatmap/search/${beatmapId}`
  );
  if (!response.ok) {
    throw new Error("Beatmap not found");
  }
  return response.json();
}

export async function searchAndDownloadBeatmap(
  beatmapsetId: number
): Promise<SearchAndDownloadResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/beatmap/search-and-download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ beatmapset_id: beatmapsetId }),
    });
    if (response.ok) {
      return response.json();
    }
  } catch {
    // Fall back to the older endpoint sequence below.
  }

  const beatmap = await searchBeatmap(beatmapsetId);
  await getBeatmapDetailsAndPreview(beatmap.id).catch(() => null);
  const assets = await downloadAndExtractBeatmap(beatmap.id);
  let backgroundImage = assets.background_image;

  if (!backgroundImage) {
    backgroundImage = await getCroppedImageFilename(beatmap.id).catch(() => "");
  }

  return {
    success: true,
    beatmapset_id: beatmap.id,
    beatmap,
    assets: {
      preview_path: "",
      preview_filename: `${beatmap.id}_preview.mp3`,
      osz_path: assets.osz_path,
      background_path: assets.background_path || "",
      background_image: backgroundImage,
      extracted_paths: assets.extracted_paths,
    },
  };
}

export async function downloadBeatmap(beatmapId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/beatmap/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ beatmap_id: beatmapId }),
  });
  if (!response.ok) {
    throw new Error("Download failed");
  }
}

async function readApiError(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const data = await response.json();
    if (typeof data?.detail === "string" && data.detail.trim()) {
      return data.detail;
    }
  } catch {
    // Fall back to generic message below.
  }
  return fallback;
}

export async function downloadAndExtractBeatmap(
  beatmapsetId: number
): Promise<DownloadWithExtractResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/beatmap/download-with-extract`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ beatmapset_id: beatmapsetId }),
    }
  );
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Download and extract failed"),
    );
  }
  return response.json();
}

export async function getBeatmapDetailsAndPreview(
  beatmapId: number
): Promise<DetailsAndPreviewResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/beatmap/details-and-preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ beatmap_id: beatmapId }),
    }
  );
  if (!response.ok) {
    throw new Error("Failed to get beatmap details");
  }
  return response.json();
}

export async function cropImage(
  imagePath: string,
  width: number = 720,
  height: number = 300
): Promise<ImageCropResponse> {
  const response = await fetch(`${API_BASE_URL}/api/image/crop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_path: imagePath,
      size_width: width,
      size_height: height,
    }),
  });
  if (!response.ok) {
    throw new Error("Image crop failed");
  }
  return response.json();
}

export async function getCroppedImageFilename(
  beatmapsetId: number
): Promise<string> {
  const response = await fetch(
    `${API_BASE_URL}/api/beatmap/${beatmapsetId}/cropped-image`
  );
  if (!response.ok) {
    throw new Error("Cropped image not found");
  }
  const data = await response.json();
  return data.filename;
}

export function getPreviewFileUrl(beatmapsetId: number): string {
  return `${API_BASE_URL}/api/beatmap/preview-file/${beatmapsetId}`;
}

export function getBackgroundFileUrl(filename: string): string {
  const encodedFilename = filename.split("/").map(encodeURIComponent).join("/");
  return `${API_BASE_URL}/api/beatmap/background-file/${encodedFilename}`;
}

// User endpoints
export async function getUserStats(
  userIdentifier: string,
  mode: string = "osu",
  topN: number = 100,
): Promise<UserStatsData> {
  const response = await fetch(
    `${API_BASE_URL}/api/user/${userIdentifier}/stats?mode=${mode}&top_n=${topN}`,
  );
  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to load profile"));
  }
  return response.json();
}

export interface FarmMap {
  beatmap_id: number | null;
  beatmapset_id: number | null;
  artist: string;
  title: string;
  version: string;
  mods: string[];
  stars: number | null;
  pp: number | null;
  farm_value: number | null;
  length: number | null;
  bpm: number | null;
  ar: number | null;
  od: number | null;
  cs: number | null;
  hp: number | null;
  cover_url: string | null;
}

export interface FarmMapsData {
  mode: string;
  maps: FarmMap[];
}

export async function getFarmMaps(
  mode: string = "osu",
  limit: number = 150,
): Promise<FarmMapsData> {
  const response = await fetch(
    `${API_BASE_URL}/api/farm/maps?mode=${mode}&limit=${limit}`,
  );
  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to load farm maps"));
  }
  return response.json();
}

export interface UserModesData {
  modes: string[];
  main_mode: string | null;
}

export async function getUserModes(
  userIdentifier: string,
): Promise<UserModesData> {
  const response = await fetch(
    `${API_BASE_URL}/api/user/${userIdentifier}/modes`,
  );
  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to load modes"));
  }
  return response.json();
}
