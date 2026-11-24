// The home folder path usually contains the OS user name (C:\Users\alice, /home/alice).
// Shown text replaces it with "~", so the page and the recap card never reveal that name.

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A path ends at a separator, quote, space or punctuation: C:\Users\al must not match C:\Users\alice.
const PATH_END = String.raw`(?=$|[\\/\s"'\x60:;,)\]}])`;

/** Matches the home folder however a log writes it: C:\Users\me, c:/Users/me, /c/Users/me. */
function homeFolderPattern(home: string): RegExp | undefined {
  const parts = home.split(/[\\/]+/).filter(Boolean);
  const [first, ...rest] = parts;
  // "/" or "/root": nothing personal to hide.
  if (first === undefined || rest.length === 0) return undefined;
  const drive = /^[A-Za-z]:$/.test(first)
    ? `(?:${first[0]}:|/${first[0]})`
    : `/${escapeRegExp(first)}`;
  const body = rest.map(escapeRegExp).join(String.raw`[\\/]+`);
  return new RegExp(String.raw`${drive}[\\/]+${body}${PATH_END}`, "gi");
}

/** Returns a function that replaces `home` with "~" in any text. */
export function homeHider(home: string): (text: string) => string {
  const pattern = homeFolderPattern(home);
  return (text) => (pattern === undefined ? text : text.replace(pattern, "~"));
}

/**
 * Claude Code names each project's log folder after its path, with every other character as "-"
 * (C:\Users\me\app → C--Users-me-app). Drops the home part so the user name doesn't show.
 */
export function projectFromLogFolder(folder: string, home: string): string {
  const encodedHome = home.replace(/[^A-Za-z0-9]/g, "-").toLowerCase();
  const lower = folder.toLowerCase();
  if (lower === encodedHome) return "~";
  return lower.startsWith(`${encodedHome}-`) ? folder.slice(encodedHome.length + 1) : folder;
}
