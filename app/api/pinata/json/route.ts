import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const jwt = process.env.PINATA_JWT || process.env.NEXT_PUBLIC_PINATA_JWT;
    if (!jwt) {
      return NextResponse.json(
        { error: "Missing token on server" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const payload = body?.payload;
    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ error: "payload is required" }, { status: 400 });
    }

    const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ pinataContent: payload }),
    });

    const raw = await res.text();
    const data = (() => {
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    })();
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error || data?.message || raw || "Pinata metadata upload failed" },
        { status: res.status }
      );
    }

    return NextResponse.json({
      ipfsHash: data.IpfsHash,
      url: `https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`,
    });
  } catch (error: any) {
    console.error("Pinata JSON upload failed", error);
    return NextResponse.json(
      { error: "Unexpected upload error" },
      { status: 500 }
    );
  }
}
