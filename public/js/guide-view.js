export function slugFromPath(pathname) {
  const match = /^\/guides\/([^/]+)\/?$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : "quick-start";
}

export function groupGuides(guides) {
  const groups = [];
  const byName = new Map();
  for (const guide of guides) {
    let group = byName.get(guide.group);
    if (!group) {
      group = { name: guide.group, guides: [] };
      byName.set(guide.group, group);
      groups.push(group);
    }
    group.guides.push(guide);
  }
  return groups;
}

export function safeExternalLink(anchor, origin) {
  const url = new URL(anchor.href, origin);
  if (!/^https?:$/.test(url.protocol) || url.origin === origin) return false;
  anchor.target = "_blank";
  anchor.rel = "noreferrer";
  return true;
}
