import { randomBytes } from "node:crypto";
import process from "node:process";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { buildContentDisposition } from "../src/lib/content-disposition";
import { getS3Client, uploadObject } from "../src/server/storage";

/**
 * Разовая проверка фактом (не тест): собирает маленький валидный PDF,
 * заливает его в бакет под тестовым ключом с Content-Disposition (та же
 * функция, что использует src/server/document-upload.ts), делает
 * HeadObject и печатает, что реально осело на объекте в S3. Ничего не
 * удаляет — бакет общий на схемы, лишний smoke-объект безвреден. В БД
 * ничего не пишет — таблицы document/news_document этот скрипт не трогает.
 *
 * URL собирается тут же, а не импортом buildImageUrl из src/server/news.ts:
 * тот модуль на уровне импорта открывает пул подключений к БД (см.
 * src/db/client.ts) — скрипту, который вообще не трогает БД, лишнее
 * подключение не только не нужно, но и держит процесс живым после
 * завершения main() (пул никогда явно не закрывается). Та же причина, по
 * которой scripts/create-admin.ts не импортирует src/server/auth.ts.
 *
 * Запуск: bun run scripts/check-content-disposition.ts
 */

function buildImageUrl(s3Key: string): string {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  if (!endpoint || !bucket) {
    throw new Error("Не заданы переменные окружения: S3_ENDPOINT, S3_BUCKET");
  }
  return `${endpoint}/${bucket}/${s3Key}`;
}

function buildMinimalPdf(): Buffer {
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] " +
      "/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];
  const streamContent = "BT /F1 24 Tf 20 100 Td (Smoke test) Tj ET";
  objects.push(
    `5 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
  );

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += obj;
  }

  const xrefStart = Buffer.byteLength(body, "latin1");
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(body + xref + trailer, "latin1");
}

async function main() {
  const key = `documents/_smoke-${randomBytes(4).toString("hex")}.pdf`;
  const title = "Регламент первенства СПб 2026";
  const disposition = buildContentDisposition(title, "pdf");

  console.log(`Ключ: ${key}`);
  console.log(`Собранный Content-Disposition: ${disposition}`);

  await uploadObject(key, buildMinimalPdf(), "application/pdf", disposition);
  console.log("Объект залит.");

  const { client, bucket } = getS3Client();
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));

  console.log(`Фактический ContentDisposition из HeadObject: ${head.ContentDisposition}`);
  console.log(`URL: ${buildImageUrl(key)}`);
}

await main();
