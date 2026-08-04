import process from "node:process";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

let cachedClient: { client: S3Client; bucket: string } | null = null;

/**
 * Бакет `ftspb-media` публичный — presigner не нужен, только `PutObject`.
 * Кэшируется на процесс, т.к. используется и из CLI-скрипта миграции, и
 * (с этапа 5) из загрузки файлов в админке.
 */
export function getS3Client(): { client: S3Client; bucket: string } {
  if (cachedClient) {
    return cachedClient;
  }

  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET;
  const region = process.env.S3_REGION;

  const missing = [
    ["S3_ENDPOINT", endpoint],
    ["S3_BUCKET", bucket],
    ["S3_KEY_ID", accessKeyId],
    ["S3_SECRET", secretAccessKey],
    ["S3_REGION", region],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Не заданы переменные окружения: ${missing.join(", ")}`);
  }

  cachedClient = {
    client: new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
    }),
    bucket: bucket!,
  };

  return cachedClient;
}

export async function uploadObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const { client, bucket } = getS3Client();
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
  );
}
