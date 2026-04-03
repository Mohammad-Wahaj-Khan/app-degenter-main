import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export const runtime = "nodejs";

const S3_BUCKET = process.env.AWS_S3_BUCKET || "";
const S3_REGION = process.env.AWS_REGION || "";

const extFromMime = (mime: string) => {
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/gif") return ".gif";
  if (mime === "image/webp") return ".webp";
  return ".png";
};

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const hash = createHash("sha256").update(buffer).digest("hex");
    const ext = extFromMime(file.type || "");
    const key = `tokens/${hash}${ext}`;

    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      return NextResponse.json(
        { error: "Missing AWS credentials on server" },
        { status: 500 }
      );
    }

    const s3 = new S3Client({
      region: S3_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN || undefined,
      },
    });

    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: file.type || "image/png",
      })
    );

    return NextResponse.json({
      url: `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`,
    });
  } catch (error: any) {
    console.error("S3 file upload failed", error);
    return NextResponse.json(
      { error: "Unexpected upload error" },
      { status: 500 }
    );
  }
}
