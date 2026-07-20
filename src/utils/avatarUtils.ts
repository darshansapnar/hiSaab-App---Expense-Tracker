/**
 * Curated palette of modern high-contrast background colors for avatars.
 */
const AVATAR_PALETTE = [
  "#0EA5E9", // Sky / Blue
  "#6366F1", // Indigo
  "#8B5CF6", // Purple
  "#EC4899", // Pink
  "#10B981", // Emerald / Green
  "#F59E0B", // Amber / Orange
  "#06B6D4", // Cyan
  "#14E5D4", // Teal / Cyan accent
  "#F43F5E", // Rose
  "#3B82F6", // Blue
];

/**
 * Extracts 1 or 2 capital initials from a display name or username.
 * e.g., "Darshan Sapnar" -> "DS", "Rahul" -> "R", "Aman Kumar" -> "AK"
 */
export function getInitials(name?: string | null): string {
  if (!name || typeof name !== "string") return "?";
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) return "?";

  const parts = clean.split(" ");
  if (parts.length >= 2) {
    const first = parts[0].charAt(0).toUpperCase();
    const last = parts[parts.length - 1].charAt(0).toUpperCase();
    return `${first}${last}`;
  }

  return clean.charAt(0).toUpperCase();
}

/**
 * Deterministically generates an HSL/Hex color from a user name or ID string.
 * The same input string will always yield the exact same palette color.
 */
export function getAvatarColor(identifier?: string | null): string {
  if (!identifier || typeof identifier !== "string") return AVATAR_PALETTE[0];

  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = identifier.charCodeAt(i) + ((hash << 5) - hash);
  }

  const index = Math.abs(hash) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[index];
}
