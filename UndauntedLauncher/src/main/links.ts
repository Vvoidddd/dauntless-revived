// Which links the launcher may open in the browser. The renderer never passes a URL: it names a
// target, the main process picks the URL and checks it here before shell.openExternal.

function parse(url: string): URL | null {
  if (typeof url !== "string" || url.length > 1024) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username !== "" || u.password !== "" || u.port !== "") return null;
    return u;
  } catch {
    return null;
  }
}

export function isAllowedStaticUrl(url: string): boolean {
  const u = parse(url);
  if (!u) return false;
  switch (u.hostname) {
    case "tailscale.com":
    case "login.tailscale.com":
      return true;
    case "aka.ms":
      return u.pathname.startsWith("/vs/");
    case "github.com":
      return u.pathname === "/mixutin/dauntless-revived" || u.pathname.startsWith("/mixutin/dauntless-revived/");
    default:
      return false;
  }
}

// The host's own source link (from ServerStatus.sourceUrl) is allowed as long as it is plain https.
export function isAllowedExternalUrl(url: string, hostSourceUrl: string | null): boolean {
  if (isAllowedStaticUrl(url)) return true;
  if (hostSourceUrl !== null && url === hostSourceUrl) return parse(url) !== null;
  return false;
}
