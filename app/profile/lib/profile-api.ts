export type ProfileWallet = {
  address: string;
  label?: string;
  is_primary?: boolean;
  network?: string;
  updated_at?: string;
};

export type Profile = {
  created_at?: string | number | Date;
  handle: string;
  user_id?: number;
  display_name?: string;
  bio?: string;
  image_url?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  tags?: string[];
  wallets?: ProfileWallet[];
};

const DEFAULT_BASE_URL = "";
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_BASE_URL).replace(
  /\/+$/,
  ""
);

const buildHeaders = (apiKey?: string) => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  return headers;
};

const normalizeWallet = (wallet: any): ProfileWallet => ({
  address: wallet?.address ?? wallet?.wallet ?? "",
  label: wallet?.label ?? wallet?.name ?? "",
  is_primary: Boolean(wallet?.is_primary ?? wallet?.isPrimary),
  network: wallet?.network ?? wallet?.chain ?? "Zigchain",
  updated_at:
    wallet?.updated_at ??
    wallet?.updatedAt ??
    wallet?.lastUpdated ??
    wallet?.linked_at,
});

const normalizeProfile = (payload: any, fallbackHandle: string): Profile => ({
  handle: payload?.handle ?? payload?.id ?? payload?.user_id ?? fallbackHandle ?? "",
  user_id: payload?.user_id ?? payload?.id ?? undefined,
  display_name: payload?.display_name ?? payload?.displayName ?? "",
  bio: payload?.bio ?? "",
  image_url: payload?.image_url ?? payload?.imageUrl ?? "",
  website: payload?.website ?? "",
  twitter: payload?.twitter ?? "",
  telegram: payload?.telegram ?? "",
  tags: Array.isArray(payload?.tags) ? payload.tags : [],
  wallets: Array.isArray(payload?.wallets)
    ? payload.wallets.map(normalizeWallet)
    : [],
  created_at:
    payload?.created_at ?? payload?.createdAt ?? payload?.created ??
    new Date().toISOString(),
});
export async function getProfile(
  handle: string,
  apiKey?: string
): Promise<Profile> {
  const response = await fetch(`${API_BASE}/profiles/${handle}`, {
    method: "GET",
    headers: buildHeaders(apiKey),
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch profile: ${response.status}`);
  }

  const json = await response.json();
  const payload = json?.data ?? json;

  return normalizeProfile(payload, handle);
}

export async function getProfileById(
  userId: string | number,
  apiKey?: string
): Promise<Profile> {
  const response = await fetch(`${API_BASE}/profiles/${userId}`, {
    method: "GET",
    headers: buildHeaders(apiKey),
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch profile: ${response.status}`);
  }

  const json = await response.json();
  const payload = json?.data ?? json;

  return normalizeProfile(payload, String(userId));
}

export async function createProfile(
  profile: Profile,
  apiKey?: string
): Promise<Profile> {
  const response = await fetch(`${API_BASE}/profiles`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(profile),
  });

  if (!response.ok) {
    throw new Error(`Failed to create profile: ${response.status}`);
  }

  const json = await response.json();
  const payload = json?.data ?? json;

  return normalizeProfile(payload, profile.handle);
}

export async function hasWalletProfile(
  walletAddress: string,
  apiKey?: string
): Promise<boolean> {
  if (!walletAddress) return false;

  try {
    const response = await fetch(
      `${API_BASE}/profiles/by-wallet/${walletAddress}`,
      {
        method: "GET",
        headers: buildHeaders(apiKey),
        next: { revalidate: 60 },
      }
    );
    return response.ok;
  } catch (error) {
    console.error("Error checking wallet profile:", error);
    return false;
  }
}

export async function getProfileByWallet(
  walletAddress: string,
  apiKey?: string
): Promise<Profile> {
  const response = await fetch(
    `${API_BASE}/profiles/by-wallet/${walletAddress}`,
    {
      method: "GET",
      headers: buildHeaders(apiKey),
      next: { revalidate: 60 },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch profile by wallet: ${response.status}`);
  }

  const json = await response.json();
  const payload = json?.data ?? json;

  return normalizeProfile(payload, payload.handle);
}

export async function uploadProfileImage(
  userId: string | number,
  file: File,
  apiKey: string
): Promise<{ image_url: string }> {
  if (!apiKey?.trim()) {
    throw new Error("API key is required to upload profile image");
  }

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/profiles/${userId}/avatar`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Upload failed: ${error.message || response.statusText}`);
  }

  const result = await response.json();

  const rawImageUrl = (
    typeof result?.data?.image_url === "string"
      ? result.data.image_url
      : typeof result?.data?.url === "string"
      ? result.data.url
      : typeof result?.image_url === "string"
      ? result.image_url
      : typeof result?.url === "string"
      ? result.url
      : ""
  )?.trim();

  if (!rawImageUrl) {
    throw new Error("Image upload response did not include an image URL");
  }

  if (/^https?:\/\//i.test(rawImageUrl)) {
    return { image_url: rawImageUrl };
  }

  const pathParts = rawImageUrl.split("/");
  const fileName = pathParts[pathParts.length - 1] || "";
  const timestamp = Date.now();
  const finalUrl = `https://testnetmedia.degenter.io/degenter-media/profiles/${userId}/${fileName}?t=${timestamp}`;

  return { image_url: finalUrl };
}

export async function updateProfile(
  profile: Profile,
  apiKey?: string
): Promise<Profile> {
  if (!profile.user_id && !profile.handle) {
    throw new Error(
      "Either user_id or handle must be provided to update profile"
    );
  }

  // Always use user_id if available, otherwise fall back to handle
  const identifier = profile.user_id;
  const url = `${API_BASE}/profiles/${identifier}`;

  // Create a clean payload without undefined values and ensure required fields are included
  // Exclude image_url since it's handled separately via the avatar upload endpoint
  const payload: Partial<Profile> = {
    handle: profile.handle, // Include handle in the payload for updates
    display_name: profile.display_name,
    bio: profile.bio,
    website: profile.website,
    twitter: profile.twitter,
    telegram: profile.telegram,
    tags: profile.tags,
    // Don't include wallets in the update as they should be managed separately
  };

  // Remove undefined values from payload
  Object.keys(payload).forEach(
    (key) =>
      payload[key as keyof typeof payload] === undefined &&
      delete payload[key as keyof typeof payload]
  );

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      ...buildHeaders(apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `Failed to update profile (${response.status}): ${
        error.message || response.statusText
      }`
    );
  }

  const json = await response.json();
  const result = json?.data ?? json;

  // Return the updated profile data
  return normalizeProfile(result, profile.handle);
}
