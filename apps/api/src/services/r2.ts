import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { extname } from "path";

function getR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 credentials are not configured");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

function getBucket() {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("R2_BUCKET_NAME is not set");
  return bucket;
}

export async function createPresignedPutUrl(
  filename: string,
  contentType: string
): Promise<{ uploadUrl: string; r2Key: string; expiresAt: string }> {
  const client = getR2Client();
  const bucket = getBucket();
  const ext = extname(filename) || ".audio";
  const r2Key = `uploads/${randomUUID()}${ext}`;
  const expiresIn = 900;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: r2Key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn });
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  return { uploadUrl, r2Key, expiresAt };
}

export async function createPresignedGetUrl(r2Key: string): Promise<string> {
  const client = getR2Client();
  const bucket = getBucket();
  const command = new GetObjectCommand({ Bucket: bucket, Key: r2Key });
  return getSignedUrl(client, command, { expiresIn: 3600 });
}

export { getR2Client, getBucket };
