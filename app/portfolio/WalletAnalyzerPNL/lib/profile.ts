import { API_BASE_URL } from "@/lib/api";

export interface ProfileData {
  user_id: number;
  handle: string;
  display_name: string | null;
  bio: string | null;
  image_url: string | null;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  wallets: Array<{
    wallet_id: number;
    address: string;
    label: string;
    is_primary: boolean;
    linked_at: string;
  }>;
}

export async function fetchProfileByWallet(walletAddress: string): Promise<ProfileData | null> {
  try {
    const apiKey = process.env.NEXT_PUBLIC_API_KEY || process.env.NEXT_PUBLIC_X_API_KEY;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const response = await fetch(
      `${API_BASE_URL}/profiles/by-wallet/${walletAddress}`,
      { headers }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.success ? data.data : null;
  } catch (error) {
    console.error('Error fetching profile:', error);
    return null;
  }
}

export function getSocialTagsFromProfile(profile: ProfileData | null) {
  if (!profile?.tags?.length) return [];
  
  const tagMap: Record<string, string> = {
    'whale': 'Whale',
    'hacker': 'Hacker',
    'smart trader': 'Smart Trader',
    'airdrop': 'Airdrop Farmer'
  };
  
  return profile.tags
    .map(tag => tag.toLowerCase())
    .filter(tag => tag in tagMap)
    .map(tag => tagMap[tag]);
}
