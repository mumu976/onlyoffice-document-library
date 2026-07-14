import { randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { AppError } from "../errors.js";
import {
  extensionFromName,
  normalizeDisplayName,
  sha256,
  validateOoxmlBuffer,
} from "../services/ooxml.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const supportedExtensions = new Set(["docx", "xlsx"]);
const extensionByType = {
  word: "docx",
  spreadsheet: "xlsx",
};

function fileNotFound() {
  return new AppError("FILE_NOT_FOUND", "文件不存在", 404);
}

function storageCorrupt() {
  return new AppError("STORAGE_CORRUPT", "文件存储不完整", 500);
}

function isMissing(error) {
  return error?.code === "ENOENT";
}

function isMetadataShapeValid(metadata, id) {
  return (
    metadata !== null &&
    typeof metadata === "object" &&
    metadata.id === id &&
    typeof metadata.name === "string" &&
    supportedExtensions.has(metadata.extension) &&
    typeof metadata.createdAt === "string" &&
    !Number.isNaN(Date.parse(metadata.createdAt)) &&
    typeof metadata.updatedAt === "string" &&
    !Number.isNaN(Date.parse(metadata.updatedAt)) &&
    Number.isSafeInteger(metadata.revision) &&
    metadata.revision > 0 &&
    typeof metadata.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(metadata.sha256)
  );
}

async function removeIfPresent(filePath) {
  try {
    await unlink(filePath);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

async function writeSynced(filePath, contents) {
  const handle = await open(filePath, "wx");
  try {
    await handle.writeFile(contents);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export class FileRepository {
  constructor({ storageDir, templateDir, now, idFactory, maxUncompressedBytes }) {
    this.storageDir = storageDir;
    this.templateDir = templateDir;
    this.now = now;
    this.idFactory = idFactory;
    this.maxUncompressedBytes = maxUncompressedBytes;
  }

  async init() {
    await mkdir(this.storageDir, { recursive: true });
    for (const extension of supportedExtensions) {
      const buffer = await readFile(path.join(this.templateDir, `blank.${extension}`));
      await validateOoxmlBuffer(buffer, extension, this.maxUncompressedBytes);
    }
  }

  async list() {
    const entries = await readdir(this.storageDir, { withFileTypes: true });
    const metadata = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && uuidPattern.test(entry.name))
        .map((entry) => this.get(entry.name)),
    );
    return metadata.sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    );
  }

  async get(id) {
    const fileDir = this.#fileDirectory(id);
    let directoryStat;
    try {
      directoryStat = await stat(fileDir);
    } catch (error) {
      if (isMissing(error)) throw fileNotFound();
      throw storageCorrupt();
    }
    if (!directoryStat.isDirectory()) throw storageCorrupt();

    let metadata;
    try {
      metadata = JSON.parse(await readFile(path.join(fileDir, "metadata.json"), "utf8"));
    } catch {
      throw storageCorrupt();
    }
    if (!isMetadataShapeValid(metadata, id)) throw storageCorrupt();

    try {
      const contentStat = await stat(this.#contentPath(fileDir, metadata.extension));
      if (!contentStat.isFile()) throw storageCorrupt();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw storageCorrupt();
    }
    return metadata;
  }

  async create({ name, type }) {
    const extension = extensionByType[type];
    const normalizedName = normalizeDisplayName(name, extension);
    const buffer = await readFile(path.join(this.templateDir, `blank.${extension}`));
    return this.#persistNew({ name: normalizedName, extension, buffer });
  }

  async upload({ name, buffer }) {
    const extension = extensionFromName(name);
    await validateOoxmlBuffer(buffer, extension, this.maxUncompressedBytes);
    const normalizedName = normalizeDisplayName(name, extension);
    return this.#persistNew({ name: normalizedName, extension, buffer });
  }

  async readContent(id) {
    const metadata = await this.get(id);
    const fileDir = this.#fileDirectory(id);
    try {
      return await readFile(this.#contentPath(fileDir, metadata.extension));
    } catch {
      throw storageCorrupt();
    }
  }

  async replaceContent(id, buffer) {
    const metadata = await this.get(id);
    await validateOoxmlBuffer(buffer, metadata.extension, this.maxUncompressedBytes);
    const nextSha256 = sha256(buffer);
    if (nextSha256 === metadata.sha256) {
      return { changed: false, metadata };
    }

    const fileDir = this.#fileDirectory(id);
    const contentPath = this.#contentPath(fileDir, metadata.extension);
    const contentTempPath = path.join(
      fileDir,
      `.content.${metadata.extension}.${randomUUID()}.tmp`,
    );
    const metadataTempPath = path.join(fileDir, `.metadata.json.${randomUUID()}.tmp`);
    const updatedMetadata = {
      ...metadata,
      updatedAt: new Date(this.now()).toISOString(),
      revision: metadata.revision + 1,
      sha256: nextSha256,
    };

    try {
      await writeSynced(contentTempPath, buffer);
      await rename(contentTempPath, contentPath);
      await writeSynced(metadataTempPath, JSON.stringify(updatedMetadata));
      await rename(metadataTempPath, path.join(fileDir, "metadata.json"));
    } catch (error) {
      await Promise.allSettled([
        removeIfPresent(contentTempPath),
        removeIfPresent(metadataTempPath),
      ]);
      throw error;
    }

    return { changed: true, metadata: updatedMetadata };
  }

  async remove(id) {
    await this.get(id);
    const fileDir = this.#fileDirectory(id);
    try {
      await rm(fileDir, { recursive: true });
    } catch (error) {
      if (isMissing(error)) throw fileNotFound();
      throw error;
    }
  }

  async #persistNew({ name, extension, buffer }) {
    const id = this.idFactory();
    const fileDir = this.#fileDirectory(id);
    let directoryCreated = false;
    try {
      await mkdir(fileDir, { recursive: false });
      directoryCreated = true;
      const timestamp = new Date(this.now()).toISOString();
      const metadata = {
        id,
        name,
        extension,
        createdAt: timestamp,
        updatedAt: timestamp,
        revision: 1,
        sha256: sha256(buffer),
      };
      const contentTempPath = path.join(fileDir, `.content.${extension}.tmp`);
      const metadataTempPath = path.join(fileDir, ".metadata.json.tmp");
      await writeFile(contentTempPath, buffer, { flag: "wx" });
      await writeFile(metadataTempPath, JSON.stringify(metadata), { flag: "wx" });
      await rename(contentTempPath, this.#contentPath(fileDir, extension));
      await rename(metadataTempPath, path.join(fileDir, "metadata.json"));
      return metadata;
    } catch (error) {
      if (directoryCreated) {
        await rm(fileDir, { recursive: true, force: true });
      }
      throw error;
    }
  }

  #fileDirectory(id) {
    if (typeof id !== "string" || !uuidPattern.test(id)) throw fileNotFound();
    return path.join(this.storageDir, id);
  }

  #contentPath(fileDir, extension) {
    if (!supportedExtensions.has(extension)) throw storageCorrupt();
    return path.join(fileDir, `content.${extension}`);
  }
}
