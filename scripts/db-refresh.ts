import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import postgres from "postgres";
import { describeTarget, isLocalHost, sslFor } from "../src/db/ssl";

/**
 * Обновление ЛОКАЛЬНОЙ базы копией боевой.
 *
 * Единственное обращение к боевому кластеру во всём репозитории — вызов
 * `pg_dump` на чтение из этого скрипта. Ни одного SELECT, ни одной записи:
 * postgres.js здесь подключается только к локальной базе.
 *
 * Сравнение счёта строк — замкнутое: файл дампа против локальной базы после
 * разворота. Прод в сравнении не участвует намеренно. Проверяется не
 * совпадение локальной базы с продом «сейчас» (прод живой, он меняется прямо
 * во время работы скрипта и дал бы ложные расхождения), а то, что разворот
 * воспроизвёл снимок без потерь. Поэтому ни одна таблица не исключается и не
 * помечается «ожидаемо изменчивой», включая admin_session: относительно файла
 * она обязана совпасть точно.
 *
 * Запуск: bun run db:refresh [--yes] [--out=ПУТЬ]
 */

// ───────────────────────── аргументы ─────────────────────────

function parseArgs(argv: string[]) {
  let yes = false;
  let out: string | undefined;

  for (const arg of argv) {
    if (arg === "--yes") {
      yes = true;
    } else if (arg.startsWith("--out=")) {
      out = arg.slice("--out=".length);
    } else {
      throw new Error(`Неизвестный аргумент: ${arg}`);
    }
  }

  return { yes, out };
}

const { yes, out: outArg } = parseArgs(process.argv.slice(2));

const CA_PATH = path.resolve(process.cwd(), "certs", "timeweb-ca.crt");
const DUMP_DIR = path.resolve(process.cwd(), "dumps");

// ───────────────────────── вспомогательное ─────────────────────────

function fail(message: string): never {
  console.error(`Отказ: ${message}`);
  process.exit(1);
}

/**
 * Пароль уходит в PGPASSWORD, а не в аргументы командной строки: аргументы
 * видны в списке процессов всей машине. В коде пароль не хранится и никуда
 * не печатается — только из строки подключения в окружение подпроцесса.
 */
function splitCredentials(connectionString: string): { url: string; password: string } {
  const url = new URL(connectionString);
  const password = decodeURIComponent(url.password);
  url.password = "";
  return { url: url.toString(), password };
}

function databaseName(connectionString: string): string {
  return new URL(connectionString).pathname.replace(/^\//, "");
}

/** URL той же машины/учётки, но на служебной базе `postgres`: из-под неё делается DROP/CREATE. */
function maintenanceUrl(connectionString: string): string {
  const url = new URL(connectionString);
  url.pathname = "/postgres";
  return url.toString();
}

async function run(command: string, args: string[], env: Record<string, string>): Promise<number> {
  const proc = Bun.spawn([command, ...args], {
    env: { ...process.env, ...env },
    stdio: ["inherit", "inherit", "inherit"],
  });
  return await proc.exited;
}

async function isRunnable(command: string): Promise<boolean> {
  try {
    const proc = Bun.spawn([command, "--version"], { stdio: ["ignore", "ignore", "ignore"] });
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}

// ───────────────────────── подсчёт строк ─────────────────────────

/**
 * В plain-дампе данные лежат блоками `COPY схема.таблица (...) FROM stdin;`
 * … строки … `\.`. В текстовом формате COPY обратный слэш внутри данных
 * экранируется как `\\`, поэтому строка данных никогда не равна `\.` —
 * терминатор однозначен. Идентификаторы pg_dump квотирует только при
 * необходимости, отсюда необязательные кавычки в регулярном выражении.
 */
function countRowsInDump(file: string): Map<string, number> {
  const copyStart = /^COPY "?([^".\s]+)"?\."?([^".\s]+)"? .*FROM stdin;$/;
  const counts = new Map<string, number>();

  const lines = fs.readFileSync(file, "utf8").split("\n");
  let current: string | undefined;
  let rows = 0;

  for (const raw of lines) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;

    if (current === undefined) {
      const match = copyStart.exec(line);
      if (match) {
        current = `${match[1]}.${match[2]}`;
        rows = 0;
      }
      continue;
    }

    if (line === "\\.") {
      counts.set(current, rows);
      current = undefined;
      continue;
    }

    rows += 1;
  }

  if (current !== undefined) {
    fail(`COPY-блок таблицы ${current} в дампе не закрыт — файл обрезан.`);
  }

  return counts;
}

async function countRowsInDatabase(connectionString: string): Promise<Map<string, number>> {
  const sql = postgres(connectionString, { max: 1, ssl: sslFor(connectionString) });
  const counts = new Map<string, number>();

  try {
    const tables = await sql<{ table_schema: string; table_name: string }[]>`
      select table_schema, table_name
      from information_schema.tables
      where table_type = 'BASE TABLE'
        and table_schema not in ('pg_catalog', 'information_schema')
      order by table_schema, table_name
    `;

    for (const table of tables) {
      const [row] = await sql.unsafe<{ n: number }[]>(
        `select count(*)::int as n from "${table.table_schema}"."${table.table_name}"`,
      );
      counts.set(`${table.table_schema}.${table.table_name}`, row.n);
    }
  } finally {
    await sql.end();
  }

  return counts;
}

// ───────────────────────── отчёт ─────────────────────────

function reportComparison(dump: Map<string, number>, live: Map<string, number>) {
  // Объединение множеств: таблица, присутствующая только с одной стороны,
  // обязана попасть в отчёт как расхождение, а не молча выпасть.
  const names = [...new Set([...dump.keys(), ...live.keys()])].sort();
  const width = Math.max(20, ...names.map((n) => n.length));

  console.log("───────────────────────────────────────");
  console.log(`${"Таблица".padEnd(width)}  ${"дамп".padStart(8)}  ${"локально".padStart(9)}`);

  let mismatches = 0;
  for (const name of names) {
    const inDump = dump.get(name);
    const inLive = live.get(name);
    const ok = inDump !== undefined && inDump === inLive;
    if (!ok) mismatches += 1;

    console.log(
      `${name.padEnd(width)}  ${String(inDump ?? "—").padStart(8)}  ` +
        `${String(inLive ?? "—").padStart(9)}  ${ok ? "OK" : "РАСХОЖДЕНИЕ"}`,
    );
  }

  console.log("───────────────────────────────────────");
  if (mismatches > 0) {
    console.error(
      `Расхождений: ${mismatches} из ${names.length}. Разворот воспроизвёл дамп не полностью.`,
    );
    process.exit(1);
  }
  console.log(`Совпало таблиц: ${names.length}. Локальная база соответствует дампу.`);
}

// ───────────────────────── фаза A: валидация ─────────────────────────

/**
 * Вся валидация — до любого действия. К моменту первого побочного эффекта
 * не должно остаться ни одной непроверенной предпосылки.
 */
function validate() {
  const prodUrl = process.env.PROD_DATABASE_URL;
  const localUrl = process.env.DATABASE_URL;

  if (!prodUrl) {
    fail("PROD_DATABASE_URL не задан — неоткуда брать дамп.");
  }
  if (!localUrl) {
    fail("DATABASE_URL не задан — некуда разворачивать дамп.");
  }

  for (const [name, value] of [
    ["DATABASE_URL", localUrl],
    ["PROD_DATABASE_URL", prodUrl],
  ] as const) {
    try {
      new URL(value);
    } catch {
      fail(`${name} не разбирается как строка подключения.`);
    }
  }

  if (!isLocalHost(localUrl)) {
    fail(
      `DATABASE_URL указывает на ${new URL(localUrl).hostname} — db-refresh разворачивает дамп ` +
        `только в локальную базу. Разворот в удалённую базу невозможен по построению.`,
    );
  }
  if (isLocalHost(prodUrl)) {
    fail(
      `PROD_DATABASE_URL указывает на localhost — похоже, строки перепутаны местами. ` +
        `Источником дампа должна быть боевая база.`,
    );
  }

  if (!fs.existsSync(CA_PATH)) {
    fail(`не найден CA-сертификат ${CA_PATH} — pg_dump не сможет проверить боевой сервер.`);
  }

  return { prodUrl, localUrl };
}

const { prodUrl, localUrl } = validate();

for (const tool of ["pg_dump", "psql"]) {
  if (!(await isRunnable(tool))) {
    fail(`${tool} не найден в PATH.`);
  }
}

const localDb = databaseName(localUrl);
const dumpPath = outArg
  ? path.resolve(process.cwd(), outArg)
  : path.join(DUMP_DIR, `ftspb_dump_${new Date().toISOString().slice(0, 10)}.sql`);

// ───────────────────────── план ─────────────────────────

console.log(`Источник (pg_dump): ${describeTarget(prodUrl)}`);
console.log(`Файл дампа:         ${dumpPath}`);
console.log(
  `Локальная база:     ${describeTarget(localUrl)} — будет удалена (DROP DATABASE) и создана заново`,
);
console.log(`Служебное подключение для DROP/CREATE: ${describeTarget(maintenanceUrl(localUrl))}`);

if (!yes) {
  console.log("Изменений не внесено. Для выполнения повторите запуск с флагом --yes.");
  process.exit(0);
}

// ───────────────────────── фаза B: выполнение ─────────────────────────

console.log("───────────────────────────────────────");

fs.mkdirSync(path.dirname(dumpPath), { recursive: true });

const prod = splitCredentials(prodUrl);
const local = splitCredentials(localUrl);

console.log(`pg_dump ${describeTarget(prodUrl)} → ${dumpPath}`);
const dumpCode = await run("pg_dump", ["--no-owner", "--no-privileges", "-f", dumpPath, prod.url], {
  PGPASSWORD: prod.password,
  PGSSLMODE: "verify-full",
  PGSSLROOTCERT: CA_PATH,
});
if (dumpCode !== 0) {
  fail(`pg_dump завершился с кодом ${dumpCode}. Локальная база не тронута.`);
}
console.log(`Дамп снят: ${(fs.statSync(dumpPath).size / 1024 / 1024).toFixed(1)} МБ`);

/**
 * Счёт по файлу считается ДО DROP: битый или пустой дамп должен выясниться
 * раньше, чем локальная база будет уничтожена.
 */
const dumpCounts = countRowsInDump(dumpPath);
if (dumpCounts.size === 0) {
  fail("в дампе не найдено ни одного COPY-блока — разворачивать нечего.");
}
console.log(`Таблиц в дампе: ${dumpCounts.size}`);

console.log(`DROP/CREATE DATABASE "${localDb}" на ${describeTarget(maintenanceUrl(localUrl))}`);
const recreateCode = await run(
  "psql",
  [
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "-d",
    maintenanceUrl(local.url),
    // WITH (FORCE) рвёт чужие подключения — иначе запущенный `bun run dev`
    // блокирует удаление базы.
    "-c",
    `DROP DATABASE IF EXISTS "${localDb}" WITH (FORCE)`,
    // Без опций: наследование от template1 воспроизводит текущие кодировку
    // и локаль базы.
    "-c",
    `CREATE DATABASE "${localDb}"`,
  ],
  { PGPASSWORD: local.password },
);
if (recreateCode !== 0) {
  fail(`psql (DROP/CREATE) завершился с кодом ${recreateCode}.`);
}

console.log(`Разворот дампа в ${describeTarget(localUrl)}`);
const restoreCode = await run(
  "psql",
  ["-X", "-v", "ON_ERROR_STOP=1", "-f", dumpPath, "-d", local.url],
  { PGPASSWORD: local.password },
);
if (restoreCode !== 0) {
  fail(`psql (разворот) завершился с кодом ${restoreCode}.`);
}

// ───────────────────────── фаза C: сравнение ─────────────────────────

const localCounts = await countRowsInDatabase(localUrl);
reportComparison(dumpCounts, localCounts);
