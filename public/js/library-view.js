const nameCollator = new Intl.Collator("zh-CN", {
  numeric: true,
  sensitivity: "base",
});

function byUpdatedAt(left, right) {
  return Date.parse(left.updatedAt) - Date.parse(right.updatedAt);
}

export function deriveLibraryView(
  files,
  { query = "", type = "all", sort = "newest" } = {},
) {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const visible = files.filter((file) => {
    const matchesName = file.name.toLocaleLowerCase("zh-CN").includes(normalizedQuery);
    const matchesType = type === "all" || file.extension === type;
    return matchesName && matchesType;
  });

  return visible.sort((left, right) => {
    if (sort === "oldest") return byUpdatedAt(left, right);
    if (sort === "name") return nameCollator.compare(left.name, right.name);
    return byUpdatedAt(right, left);
  });
}

export function recentFiles(files, limit = 4) {
  return [...files].sort((left, right) => byUpdatedAt(right, left)).slice(0, limit);
}

export function normalizeViewPreference(value) {
  return value === "grid" ? "grid" : "list";
}
