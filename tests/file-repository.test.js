import test from "node:test";
import assert from "node:assert/strict";
import { createWriteStream } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  open as fsOpen,
  readFile,
  readdir,
  rename as fsRename,
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
    fileOps: options.fileOps,
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

function createRepository({ storageDir, templateDir, fileOps }) {
  return new FileRepository({
    storageDir,
    templateDir,
    now: () => new Date("2026-07-14T10:00:00.000Z"),
    idFactory: () => secondId,
    maxUncompressedBytes,
    fileOps,
  });
}

function replacementPaths(fileDir, extension = "docx") {
  return {
    content: path.join(fileDir, `content.${extension}`),
    metadata: path.join(fileDir, "metadata.json"),
    marker: path.join(fileDir, ".replace-transaction.json"),
    markerTemp: path.join(fileDir, ".replace-transaction.json.tmp"),
    backup: path.join(fileDir, `.content.${extension}.backup`),
    nextContent: path.join(fileDir, `.content.${extension}.next`),
    nextMetadata: path.join(fileDir, ".metadata.json.next"),
  };
}

function replacementMarker(metadata, newBuffer) {
  return {
    id: metadata.id,
    extension: metadata.extension,
    oldSha256: metadata.sha256,
    newSha256: sha256(newBuffer),
  };
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

test("lists metadata without reading document content", async (t) => {
  const { repository, storageDir } = await createFixture(t);
  const created = await repository.create({ name: "列表性能", type: "word" });
  await unlink(path.join(storageDir, created.id, "content.docx"));

  assert.deepEqual(await repository.list(), [created]);
  await assert.rejects(
    repository.get(created.id),
    (error) => error.code === "STORAGE_CORRUPT" && error.status === 500,
  );
});

test("rejects metadata timestamps that are not canonical ISO 8601", async (t) => {
  const { repository, storageDir } = await createFixture(t);
  const created = await repository.create({ name: "时间格式", type: "word" });
  const metadataPath = path.join(storageDir, created.id, "metadata.json");
  await writeFile(
    metadataPath,
    JSON.stringify({
      ...created,
      updatedAt: "Tue, 14 Jul 2026 08:00:00 GMT",
    }),
  );

  await assert.rejects(
    repository.get(created.id),
    (error) => error.code === "STORAGE_CORRUPT" && error.status === 500,
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

test("rolls back old content when metadata commit fails after content install", async (t) => {
  let expectedNewSha256;
  let contentWasInstalled = false;
  const fileOps = {
    rename: async (source, target) => {
      if (
        path.basename(source) === ".metadata.json.next" &&
        path.basename(target) === "metadata.json"
      ) {
        const installed = await readFile(
          path.join(path.dirname(target), "content.docx"),
        );
        contentWasInstalled = sha256(installed) === expectedNewSha256;
        throw new Error("metadata commit failed");
      }
      return fsRename(source, target);
    },
  };
  const { repository, root, storageDir } = await createFixture(t, { fileOps });
  const created = await repository.create({ name: "替换回滚", type: "word" });
  const oldBuffer = await repository.readContent(created.id);
  const newBuffer = await makeDifferentDocx(path.join(root, "rollback.docx"));
  expectedNewSha256 = sha256(newBuffer);

  await assert.rejects(
    repository.replaceContent(created.id, newBuffer),
    /metadata commit failed/,
  );

  assert.equal(contentWasInstalled, true);
  assert.deepEqual(await repository.readContent(created.id), oldBuffer);
  assert.equal((await repository.get(created.id)).revision, 1);
  assert.deepEqual(
    (await readdir(path.join(storageDir, created.id))).sort(),
    ["content.docx", "metadata.json"],
  );
});

test("cleans owned prewrites when a synced handle fails to close", async (t) => {
  const fileOps = {
    open: async (filePath, flags) => {
      const handle = await fsOpen(filePath, flags);
      if (path.basename(filePath) !== ".metadata.json.next") return handle;
      return {
        writeFile: (...args) => handle.writeFile(...args),
        sync: () => handle.sync(),
        close: async () => {
          await handle.close();
          throw new Error("close failed");
        },
      };
    },
  };
  const { repository, root, storageDir } = await createFixture(t, { fileOps });
  const created = await repository.create({ name: "关闭失败", type: "word" });
  const oldBuffer = await repository.readContent(created.id);
  const newBuffer = await makeDifferentDocx(path.join(root, "close-failure.docx"));

  await assert.rejects(repository.replaceContent(created.id, newBuffer), /close failed/);

  assert.deepEqual(await repository.readContent(created.id), oldBuffer);
  assert.deepEqual(
    (await readdir(path.join(storageDir, created.id))).sort(),
    ["content.docx", "metadata.json"],
  );
});

test("preserves the commit error when rollback fails and leaves startup recovery", async (t) => {
  const commitError = new Error("metadata commit failed");
  const rollbackError = new Error("rollback failed");
  const fileOps = {
    rename: async (source, target) => {
      if (
        path.basename(source) === ".metadata.json.next" &&
        path.basename(target) === "metadata.json"
      ) {
        throw commitError;
      }
      if (
        path.basename(source) === ".content.docx.backup" &&
        path.basename(target) === "content.docx"
      ) {
        throw rollbackError;
      }
      return fsRename(source, target);
    },
  };
  const { repository, root, storageDir, templateDir } = await createFixture(t, {
    fileOps,
  });
  const created = await repository.create({ name: "回滚失败", type: "word" });
  const oldBuffer = await repository.readContent(created.id);
  const newBuffer = await makeDifferentDocx(path.join(root, "rollback-failure.docx"));

  await assert.rejects(
    repository.replaceContent(created.id, newBuffer),
    (error) => error === commitError && error.cause === rollbackError,
  );

  const restarted = createRepository({ storageDir, templateDir });
  await restarted.init();
  assert.deepEqual(await restarted.readContent(created.id), oldBuffer);
});

test("does not delete an existing transaction when prewrite collides", async (t) => {
  const { repository, root, storageDir } = await createFixture(t);
  const created = await repository.create({ name: "事务冲突", type: "word" });
  const oldBuffer = await repository.readContent(created.id);
  const newBuffer = await makeDifferentDocx(path.join(root, "collision.docx"));
  const fileDir = path.join(storageDir, created.id);
  const paths = replacementPaths(fileDir);
  await Promise.all([
    writeFile(paths.nextContent, newBuffer),
    writeFile(paths.backup, oldBuffer),
    writeFile(paths.marker, JSON.stringify(replacementMarker(created, newBuffer))),
  ]);

  await assert.rejects(
    repository.replaceContent(created.id, newBuffer),
    (error) => error.code === "EEXIST",
  );
  await access(paths.marker);
  await access(paths.backup);
  await access(paths.nextContent);
});

test("init restores an interrupted replacement with old metadata and backup", async (t) => {
  const { repository, root, storageDir, templateDir } = await createFixture(t);
  const created = await repository.create({ name: "启动回滚", type: "word" });
  const oldBuffer = await repository.readContent(created.id);
  const newBuffer = await makeDifferentDocx(path.join(root, "recover-old.docx"));
  const fileDir = path.join(storageDir, created.id);
  const paths = replacementPaths(fileDir);
  const nextMetadata = {
    ...created,
    updatedAt: "2026-07-14T10:00:00.000Z",
    revision: 2,
    sha256: sha256(newBuffer),
  };
  await Promise.all([
    writeFile(paths.content, newBuffer),
    writeFile(paths.backup, oldBuffer),
    writeFile(paths.nextMetadata, JSON.stringify(nextMetadata)),
    writeFile(paths.marker, JSON.stringify(replacementMarker(created, newBuffer))),
  ]);

  const restarted = createRepository({ storageDir, templateDir });
  await restarted.init();

  assert.deepEqual(await restarted.readContent(created.id), oldBuffer);
  assert.equal((await restarted.get(created.id)).revision, 1);
  assert.deepEqual((await readdir(fileDir)).sort(), ["content.docx", "metadata.json"]);
});

test("init discards synced prewrites left before marker installation", async (t) => {
  const { repository, root, storageDir, templateDir } = await createFixture(t);
  const created = await repository.create({ name: "标记前崩溃", type: "word" });
  const oldBuffer = await repository.readContent(created.id);
  const newBuffer = await makeDifferentDocx(path.join(root, "before-marker.docx"));
  const fileDir = path.join(storageDir, created.id);
  const paths = replacementPaths(fileDir);
  await Promise.all([
    writeFile(paths.nextContent, newBuffer),
    writeFile(paths.nextMetadata, JSON.stringify({ ...created, revision: 2 })),
    writeFile(paths.markerTemp, JSON.stringify(replacementMarker(created, newBuffer))),
  ]);

  const restarted = createRepository({ storageDir, templateDir });
  await restarted.init();

  assert.deepEqual(await restarted.readContent(created.id), oldBuffer);
  assert.deepEqual((await readdir(fileDir)).sort(), ["content.docx", "metadata.json"]);
});

test("init aborts a marked replacement before old content moves", async (t) => {
  const { repository, root, storageDir, templateDir } = await createFixture(t);
  const created = await repository.create({ name: "备份前崩溃", type: "word" });
  const oldBuffer = await repository.readContent(created.id);
  const newBuffer = await makeDifferentDocx(path.join(root, "before-backup.docx"));
  const fileDir = path.join(storageDir, created.id);
  const paths = replacementPaths(fileDir);
  await Promise.all([
    writeFile(paths.nextContent, newBuffer),
    writeFile(paths.nextMetadata, JSON.stringify({ ...created, revision: 2 })),
    writeFile(paths.marker, JSON.stringify(replacementMarker(created, newBuffer))),
  ]);

  const restarted = createRepository({ storageDir, templateDir });
  await restarted.init();

  assert.deepEqual(await restarted.readContent(created.id), oldBuffer);
  assert.deepEqual((await readdir(fileDir)).sort(), ["content.docx", "metadata.json"]);
});

test("init restores backup when old content moved before next install", async (t) => {
  const { repository, root, storageDir, templateDir } = await createFixture(t);
  const created = await repository.create({ name: "安装前崩溃", type: "word" });
  const oldBuffer = await repository.readContent(created.id);
  const newBuffer = await makeDifferentDocx(path.join(root, "before-install.docx"));
  const fileDir = path.join(storageDir, created.id);
  const paths = replacementPaths(fileDir);
  await fsRename(paths.content, paths.backup);
  await Promise.all([
    writeFile(paths.nextContent, newBuffer),
    writeFile(paths.nextMetadata, JSON.stringify({ ...created, revision: 2 })),
    writeFile(paths.marker, JSON.stringify(replacementMarker(created, newBuffer))),
  ]);

  const restarted = createRepository({ storageDir, templateDir });
  await restarted.init();

  assert.deepEqual(await restarted.readContent(created.id), oldBuffer);
  assert.deepEqual((await readdir(fileDir)).sort(), ["content.docx", "metadata.json"]);
});

test("init finalizes a committed replacement that still has backup and marker", async (t) => {
  const { repository, root, storageDir, templateDir } = await createFixture(t);
  const created = await repository.create({ name: "启动完成", type: "word" });
  const oldBuffer = await repository.readContent(created.id);
  const newBuffer = await makeDifferentDocx(path.join(root, "recover-new.docx"));
  const fileDir = path.join(storageDir, created.id);
  const paths = replacementPaths(fileDir);
  const committedMetadata = {
    ...created,
    updatedAt: "2026-07-14T10:00:00.000Z",
    revision: 2,
    sha256: sha256(newBuffer),
  };
  await Promise.all([
    writeFile(paths.content, newBuffer),
    writeFile(paths.metadata, JSON.stringify(committedMetadata)),
    writeFile(paths.backup, oldBuffer),
    writeFile(paths.marker, JSON.stringify(replacementMarker(created, newBuffer))),
  ]);

  const restarted = createRepository({ storageDir, templateDir });
  await restarted.init();

  assert.deepEqual(await restarted.readContent(created.id), newBuffer);
  assert.equal((await restarted.get(created.id)).revision, 2);
  assert.deepEqual((await readdir(fileDir)).sort(), ["content.docx", "metadata.json"]);
});

test("init rejects an interrupted replacement with no trustworthy backup", async (t) => {
  const { repository, root, storageDir, templateDir } = await createFixture(t);
  const created = await repository.create({ name: "无法恢复", type: "word" });
  const newBuffer = await makeDifferentDocx(path.join(root, "unrecoverable.docx"));
  const fileDir = path.join(storageDir, created.id);
  const paths = replacementPaths(fileDir);
  await Promise.all([
    writeFile(paths.content, newBuffer),
    writeFile(paths.backup, Buffer.from("not the old document")),
    writeFile(paths.marker, JSON.stringify(replacementMarker(created, newBuffer))),
  ]);

  const restarted = createRepository({ storageDir, templateDir });
  await assert.rejects(
    restarted.init(),
    (error) => error.code === "STORAGE_CORRUPT" && error.status === 500,
  );
});

test("get rejects content whose hash does not match metadata", async (t) => {
  const { repository, root, storageDir } = await createFixture(t);
  const created = await repository.create({ name: "哈希不符", type: "word" });
  const different = await makeDifferentDocx(path.join(root, "mismatch.docx"));
  await writeFile(path.join(storageDir, created.id, "content.docx"), different);

  await assert.rejects(
    repository.get(created.id),
    (error) => error.code === "STORAGE_CORRUPT" && error.status === 500,
  );
});
