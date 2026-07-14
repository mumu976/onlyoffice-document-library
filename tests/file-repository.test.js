import test from "node:test";
import assert from "node:assert/strict";
import { createWriteStream } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { finished } from "node:stream/promises";
import { ZipFile } from "yazl";
import { FileRepository } from "../src/repositories/file-repository.js";
import { sha256 } from "../src/services/ooxml.js";

const templatePaths = {
  docx: new URL("../templates/blank.docx", import.meta.url),
  xlsx: new URL("../templates/blank.xlsx", import.meta.url),
};
const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const maxUncompressedBytes = 100 * 1024 * 1024;

async function createFixture(t, options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "onlyoffice-repo-"));
  const storageDir = path.join(root, "storage");
  const templateDir = path.join(root, "templates");
  await mkdir(templateDir);
  await Promise.all([
    copyFile(templatePaths.docx, path.join(templateDir, "blank.docx")),
    copyFile(templatePaths.xlsx, path.join(templateDir, "blank.xlsx")),
  ]);
  t.after(() => rm(root, { recursive: true, force: true }));

  const repository = new FileRepository({
    storageDir,
    templateDir,
    now: options.now ?? (() => new Date("2026-07-14T08:00:00.000Z")),
    idFactory: options.idFactory ?? (() => firstId),
    maxUncompressedBytes,
  });
  await repository.init();
  return { repository, root, storageDir, templateDir };
}

async function makeDifferentDocx(outputPath, extraContent = Buffer.from("different")) {
  const zip = new ZipFile();
  zip.addBuffer(Buffer.from("<Types/>"), "[Content_Types].xml");
  zip.addBuffer(
    Buffer.from(
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/></w:body></w:document>',
    ),
    "word/document.xml",
  );
  zip.addBuffer(extraContent, "custom/value.txt", { compress: false });
  zip.end();
  const output = createWriteStream(outputPath);
  zip.outputStream.pipe(output);
  await finished(output);
  return readFile(outputPath);
}

test("supports the complete create, read, replace, list, and remove lifecycle", async (t) => {
  const { repository, root, storageDir } = await createFixture(t);
  const blankDocx = await readFile(templatePaths.docx);

  const created = await repository.create({ name: "季度报告", type: "word" });
  assert.deepEqual(
    {
      id: created.id,
      name: created.name,
      extension: created.extension,
      revision: created.revision,
    },
    {
      id: firstId,
      name: "季度报告.docx",
      extension: "docx",
      revision: 1,
    },
  );
  assert.equal((await repository.list()).length, 1);
  assert.deepEqual(await repository.readContent(created.id), blankDocx);

  const unchanged = await repository.replaceContent(
    created.id,
    await repository.readContent(created.id),
  );
  assert.equal(unchanged.changed, false);
  assert.equal(unchanged.metadata.revision, 1);
  assert.equal(unchanged.metadata.updatedAt, created.updatedAt);

  const differentValidDocx = await makeDifferentDocx(path.join(root, "different.docx"));
  const changed = await repository.replaceContent(created.id, differentValidDocx);
  assert.equal(changed.changed, true);
  assert.equal(changed.metadata.revision, 2);
  assert.equal(changed.metadata.sha256, sha256(differentValidDocx));
  assert.deepEqual(await repository.readContent(created.id), differentValidDocx);
  assert.deepEqual(
    (await readdir(path.join(storageDir, created.id))).sort(),
    ["content.docx", "metadata.json"],
  );

  await repository.remove(created.id);
  await assert.rejects(
    repository.get(created.id),
    (error) => error.code === "FILE_NOT_FOUND" && error.status === 404,
  );
});

test("uploads a validated document using its normalized original name", async (t) => {
  const { repository } = await createFixture(t);
  const buffer = await readFile(templatePaths.xlsx);

  const uploaded = await repository.upload({ name: "../ 预算表.XLSX", buffer });

  assert.deepEqual(
    {
      id: uploaded.id,
      name: uploaded.name,
      extension: uploaded.extension,
      revision: uploaded.revision,
      sha256: uploaded.sha256,
    },
    {
      id: firstId,
      name: "预算表.xlsx",
      extension: "xlsx",
      revision: 1,
      sha256: sha256(buffer),
    },
  );
  assert.deepEqual(await repository.readContent(uploaded.id), buffer);
});

test("rejects malformed IDs before any filesystem path is used", async (t) => {
  const { repository } = await createFixture(t);
  const buffer = await readFile(templatePaths.docx);
  const operations = [
    () => repository.get("../../outside"),
    () => repository.readContent("..\\..\\outside"),
    () => repository.replaceContent("C:\\outside", buffer),
    () => repository.remove("\\\\server\\share"),
  ];

  for (const operation of operations) {
    await assert.rejects(
      operation(),
      (error) =>
        error.code === "FILE_NOT_FOUND" &&
        error.message === "文件不存在" &&
        error.status === 404,
    );
  }
});

test("reports inconsistent metadata and content as corrupt storage", async (t) => {
  const { repository, storageDir } = await createFixture(t);
  const created = await repository.create({ name: "损坏测试", type: "word" });
  const fileDir = path.join(storageDir, created.id);
  const metadataPath = path.join(fileDir, "metadata.json");

  await writeFile(metadataPath, JSON.stringify({ ...created, id: secondId }));
  await assert.rejects(
    repository.get(created.id),
    (error) =>
      error.code === "STORAGE_CORRUPT" &&
      error.message === "文件存储不完整" &&
      error.status === 500,
  );

  await writeFile(metadataPath, JSON.stringify(created));
  await unlink(path.join(fileDir, "content.docx"));
  await assert.rejects(
    repository.get(created.id),
    (error) => error.code === "STORAGE_CORRUPT" && error.status === 500,
  );
});

test("lists valid repository entries newest first and ignores other entries", async (t) => {
  const ids = [firstId, secondId];
  const times = [
    new Date("2026-07-14T08:00:00.000Z"),
    new Date("2026-07-14T09:00:00.000Z"),
  ];
  const { repository, storageDir } = await createFixture(t, {
    idFactory: () => ids.shift(),
    now: () => times.shift(),
  });
  await repository.create({ name: "较早", type: "word" });
  await repository.create({ name: "较新", type: "spreadsheet" });
  await mkdir(path.join(storageDir, "not-a-uuid"));

  const files = await repository.list();

  assert.deepEqual(
    files.map(({ id, name }) => ({ id, name })),
    [
      { id: secondId, name: "较新.xlsx" },
      { id: firstId, name: "较早.docx" },
    ],
  );
});

test("sorts accepted metadata timestamps chronologically", async (t) => {
  const ids = [firstId, secondId];
  const times = [
    new Date("2000-01-01T00:00:00.000Z"),
    new Date("2026-07-14T09:00:00.000Z"),
  ];
  const { repository, storageDir } = await createFixture(t, {
    idFactory: () => ids.shift(),
    now: () => times.shift(),
  });
  const older = await repository.create({ name: "较早", type: "word" });
  const newer = await repository.create({ name: "较新", type: "word" });
  const olderMetadataPath = path.join(storageDir, older.id, "metadata.json");
  await writeFile(
    olderMetadataPath,
    JSON.stringify({ ...older, updatedAt: "Sat, 01 Jan 2000 00:00:00 GMT" }),
  );

  assert.deepEqual(
    (await repository.list()).map(({ id }) => id),
    [newer.id, older.id],
  );
});

test("cleans a newly-created directory after persistence fails", async (t) => {
  const { repository, storageDir } = await createFixture(t, {
    now: () => {
      throw new Error("clock failed");
    },
  });

  await assert.rejects(repository.create({ name: "失败", type: "word" }), /clock failed/);
  await assert.rejects(access(path.join(storageDir, firstId)), { code: "ENOENT" });
});

test("does not delete an existing UUID directory when creation collides", async (t) => {
  const { repository, storageDir } = await createFixture(t);
  const fileDir = path.join(storageDir, firstId);
  const markerPath = path.join(fileDir, "keep.txt");
  await mkdir(fileDir);
  await writeFile(markerPath, "keep");

  await assert.rejects(
    repository.create({ name: "冲突", type: "word" }),
    (error) => error.code === "EEXIST",
  );
  assert.equal(await readFile(markerPath, "utf8"), "keep");
});

test("removes replacement temp files when the content rename fails", async (t) => {
  const { repository, root, storageDir } = await createFixture(t);
  const created = await repository.create({ name: "替换失败", type: "word" });
  const fileDir = path.join(storageDir, created.id);
  const contentPath = path.join(fileDir, "content.docx");
  const largeValidDocx = await makeDifferentDocx(
    path.join(root, "large.docx"),
    Buffer.alloc(8 * 1024 * 1024, 1),
  );

  const obstructRename = async () => {
    for (let attempt = 0; attempt < 2000; attempt += 1) {
      const entries = await readdir(fileDir);
      if (entries.some((entry) => entry.startsWith(".content.docx."))) {
        await rm(contentPath);
        await mkdir(contentPath);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    throw new Error("replacement temp file was not observed");
  };

  const [replacement, obstruction] = await Promise.allSettled([
    repository.replaceContent(created.id, largeValidDocx),
    obstructRename(),
  ]);

  assert.equal(obstruction.status, "fulfilled");
  assert.equal(replacement.status, "rejected");
  assert.equal(
    (await readdir(fileDir)).some((entry) => entry.endsWith(".tmp")),
    false,
  );
});
