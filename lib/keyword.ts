export function normalizeKeyword(input: string) {
  return input
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("ko-KR")
    .slice(0, 80);
}

export function displayCount(value: number | null, low: boolean) {
  if (value == null) return "-";
  if (low) return "10 미만";
  return value.toLocaleString("ko-KR");
}

export function totalCount(pc: number | null, mobile: number | null) {
  return (pc ?? 0) + (mobile ?? 0);
}

export function isKnownBot(userAgent: string) {
  return /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|yandex|baiduspider|duckduckbot|googleother/i.test(
    userAgent,
  );
}
