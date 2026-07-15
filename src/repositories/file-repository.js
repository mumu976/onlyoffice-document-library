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

function attachCause(error, cause) {
  if (error?.cause === undefined) {
    error.cause = cause;
  } else {
    error.cleanupError = cause;
  }
}

function isCanonicalIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function isMetadataShapeValid(metadata, id) {
  return (
    metadata !== null &&
    typeof metadata === "object" &&
    metadata.id === id &&
    typeof metadata.name === "string" &&
    supportedExtensions.has(metadata.extension) &&
    isCanonicalIsoTimestamp(metadata.createdAt) &&
    isCanonicalIsoTimestamp(metadata.updatedAt) &&
    Number.isSafeInteger(metadata.revision) &&
    metadata.revision > 0 &&
    typeof metadata.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(metadata.sha256)
  );
}

function isTransactionMarkerValid(marker, id) {
  return (
    marker !== null &&
    typeof marker === "object" &&
    marker.id === id &&
    supportedExtensions.has(marker.extension) &&
    typeof marker.oldSha256 === "string" &&
    /^[a-f0-9]{64}$/.test(marker.oldSha256) &&
    typeof marker.newSha256 === "string" &&
    /^[a-f0-9]{64}$/.test(marker.newSha256) &&
    marker.oldSha256 !== marker.newSha256
  );
}

async function removeIfPresent(filePath) {
  try {
    await unlink(filePath);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

async function writeSynced(filePath, contents, openImpl = open) {
  const handle = await openImpl(filePath, "wx");
  let writeError;
  try {
    await handle.writeFile(contents);
    await handle.sync();
  } catch (error) {
    writeError = error;
  }
  try {
    await handle.close();
  } catch (error) {
    if (writeError) {
      attachCause(writeError, error);
    } else {
      writeError = error;
    }
  }
  if (writeError) {
    try {
      await removeIfPresent(filePath);
    } catch (error) {
      attachCause(writeError, error);
    }
    throw writeError;
  }
}

export class FileRepository {
  constructor({
    storageDir,
    templateDir,
    now,
    idFactory,
    maxUncompressedBytes,
    fileOps,
  }) {
    this.storageDir = storageDir;
    this.templateDir = templateDir;
    this.now = now;
    this.idFactory = idFactory;
    this.maxUncompressedBytes = maxUncompressedBytes;
    this.open = fileOps?.open ?? open;
    this.rename = fileOps?.rename ?? rename;
  }

  async init() {
    await mkdir(this.storageDir, { recursive: true });
    for (const extension of supportedExtensions) {
      const buffer = await readFile(path.join(this.templateDir, `blank.${extension}`));
      await validateOoxmlBuffer(buffer, extension, this.maxUncompressedBytes);
    }

    const entries = await readdir(this.storageDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && uuidPattern.test(entry.name)) {
        await this.#recoverTransaction(entry.name);
      }
    }
  }

  async list() {
    const entries = await readdir(this.storageDir, { withFileTypes: true });
    const metadata = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && uuidPattern.test(entry.name))
        .map((entry) =>
          this.#readMetadata(this.#fileDirectory(entry.name), entry.name),
        ),
    );
    return metadata.sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    );
  }

  async get(id) {
    return (await this.readFile(id)).metadata;
  }

  async readFile(id) {
    const fileDir = this.#fileDirectory(id);
    let directoryStat;
    try {
      directoryStat = await stat(fileDir);
    } catch (error) {
      if (isMissing(error)) throw fileNotFound();
      throw storageCorrupt();
    }
    if (!directoryStat.isDirectory()) throw storageCorrupt();

    const metadata = await this.#readMetadata(fileDir, id);
    const content = await this.#readRequiredFile(
      this.#contentPath(fileDir, metadata.extension),
    );
    if (sha256(content) !== metadata.sha256) throw storageCorrupt();
    return { metadata, content };
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
    return (await this.readFile(id)).content;
  }

  async replaceContent(id, buffer) {
    const metadata = await this.get(id);
    await validateOoxmlBuffer(buffer, metadata.extension, this.maxUncompressedBytes);
    const nextSha256 = sha256(buffer);
    if (nextSha256 === metadata.sha256) {
      return { changed: false, metadata };
    }

    const fileDir = this.#fileDirectory(id);
    const paths = this.#transactionPaths(fileDir, metadata.extension);
    const updatedMetadata = {
      ...metadata,
      updatedAt: new Date(this.now()).toISOString(),
      revision: metadata.revision + 1,
      sha256: nextSha256,
    };
    const marker = {
      id,
      extension: metadata.extension,
      oldSha256: metadata.sha256,
      newSha256: nextSha256,
    };
    let markerInstalled = false;
    const prewrittenPaths = new Set();

    try {
      await writeSynced(paths.nextContent, buffer, this.open);
      prewrittenPaths.add(paths.nextContent);
      await writeSynced(
        paths.nextMetadata,
        JSON.stringify(updatedMetadata),
        this.open,
      );
      prewrittenPaths.add(paths.nextMetadata);
      await writeSynced(paths.markerTemp, JSON.stringify(marker), this.open);
      prewrittenPaths.add(paths.markerTemp);
      await this.rename(paths.markerTemp, paths.marker);
      prewrittenPaths.delete(paths.markerTemp);
      markerInstalled = true;
      await this.rename(paths.content, paths.backup);
      await this.rename(paths.nextContent, paths.content);
      await this.rename(paths.nextMetadata, paths.metadata);
      await this.#cleanupTransaction(paths);
    } catch (error) {
      if (markerInstalled) {
        try {
          await this.#recoverTransaction(id);
        } catch (recoveryError) {
          attachCause(error, recoveryError);
        }
      } else {
        try {
          for (const prewrittenPath of prewrittenPaths) {
            await removeIfPresent(prewrittenPath);
          }
        } catch (cleanupError) {
          attachCause(error, cleanupError);
        }
      }
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
      await this.rename(contentTempPath, this.#contentPath(fileDir, extension));
      await this.rename(metadataTempPath, path.join(fileDir, "metadata.json"));
      return metadata;
    } catch (error) {
      if (directoryCreated) {
        await rm(fileDir, { recursive: true, force: true });
      }
      throw error;
    }
  }

  async #readMetadata(fileDir, id) {
    let metadata;
    try {
      metadata = JSON.parse(
        await readFile(path.join(fileDir, "metadata.json"), "utf8"),
      );
    } catch {
      throw storageCorrupt();
    }
    if (!isMetadataShapeValid(metadata, id)) throw storageCorrupt();
    return metadata;
  }

  async #readRequiredFile(filePath) {
    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) throw storageCorrupt();
      return await readFile(filePath);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw storageCorrupt();
    }
  }

  async #readOptionalHash(filePath) {
    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) throw storageCorrupt();
      return sha256(await readFile(filePath));
    } catch (error) {
      if (isMissing(error)) return null;
      if (error instanceof AppError) throw error;
      throw storageCorrupt();
    }
  }

  async #readTransactionMarker(fileDir, id) {
    const markerPath = path.join(fileDir, ".replace-transaction.json");
    let serialized;
    try {
      serialized = await readFile(markerPath, "utf8");
    } catch (error) {
      if (isMissing(error)) return null;
      throw storageCorrupt();
    }

    let marker;
    try {
      marker = JSON.parse(serialized);
    } catch {
      throw storageCorrupt();
    }
    if (!isTransactionMarkerValid(marker, id)) throw storageCorrupt();
    return marker;
  }

  #transactionPaths(fileDir, extension) {
    if (!supportedExtensions.has(extension)) throw storageCorrupt();
    return {
      content: this.#contentPath(fileDir, extension),
      metadata: path.join(fileDir, "metadata.json"),
      marker: path.join(fileDir, ".replace-transaction.json"),
      markerTemp: path.join(fileDir, ".replace-transaction.json.tmp"),
      backup: path.join(fileDir, `.content.${extension}.backup`),
      nextContent: path.join(fileDir, `.content.${extension}.next`),
      nextMetadata: path.join(fileDir, ".metadata.json.next"),
    };
  }

  async #cleanupPreMarker(paths) {
    await removeIfPresent(paths.nextContent);
    await removeIfPresent(paths.nextMetadata);
    await removeIfPresent(paths.markerTemp);
  }

  async #cleanupTransaction(paths) {
    await this.#cleanupPreMarker(paths);
    await removeIfPresent(paths.backup);
    await removeIfPresent(paths.marker);
  }

  async #recoverTransaction(id) {
    const fileDir = this.#fileDirectory(id);
    const metadata = await this.#readMetadata(fileDir, id);
    const paths = this.#transactionPaths(fileDir, metadata.extension);
    const marker = await this.#readTransactionMarker(fileDir, id);

    if (marker === null) {
      if ((await this.#readOptionalHash(paths.backup)) !== null) {
        throw storageCorrupt();
      }
      await this.#cleanupPreMarker(paths);
      const currentHash = await this.#readOptionalHash(paths.content);
      if (currentHash !== metadata.sha256) throw storageCorrupt();
      return;
    }

    if (marker.extension !== metadata.extension) throw storageCorrupt();
    const currentHash = await this.#readOptionalHash(paths.content);
    const metadataMatchesTransaction =
      metadata.sha256 === marker.oldSha256 ||
      metadata.sha256 === marker.newSha256;
    if (metadataMatchesTransaction && currentHash === metadata.sha256) {
      await this.#cleanupTransaction(paths);
      return;
    }

    const backupHash = await this.#readOptionalHash(paths.backup);
    if (
      metadata.sha256 === marker.oldSha256 &&
      backupHash === marker.oldSha256
    ) {
      await this.rename(paths.backup, paths.content);
      await this.#cleanupTransaction(paths);
      const restoredHash = await this.#readOptionalHash(paths.content);
      if (restoredHash !== metadata.sha256) throw storageCorrupt();
      return;
    }

    throw storageCorrupt();
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
