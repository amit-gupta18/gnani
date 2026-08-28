import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

function getR2Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

export async function downloadFromR2(r2Key: string, destPath: string): Promise<void> {
  const client = getR2Client();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: r2Key,
    })
  );

  if (!response.Body) {
    throw new Error(`Failed to download object: ${r2Key}`);
  }

  const body = response.Body as Readable;
  await pipeline(body, createWriteStream(destPath));
}
