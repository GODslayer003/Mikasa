// src/utils/timeParser.js
export function parseDuration(input) {
  if (!input) return null;

  const match = input.match(/^(\d+)(m|h|d)$/i);
  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();

  if (value <= 0) return null;

  switch (unit) {
    case "m": return value * 60;
    case "h": return value * 3600;
    case "d": return value * 86400;
    default: return null;
  }
}