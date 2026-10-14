export type HistoryEntry = { keyword: string; viewedAt: string; visits: number };
export type FavoriteEntry = { keyword: string; addedAt: string };
const HISTORY = "keyview:history:v1";
const FAVORITES = "keyview:favorites:v1";
const EVENT = "keyview:library-changed";

function clean(s: string) { return s.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 80); }
function key(s: string) { return clean(s).toLocaleLowerCase("ko-KR"); }
function read<T>(storageKey: string): T[] {
  if (typeof window === "undefined") return [];
  try { const data: unknown = JSON.parse(localStorage.getItem(storageKey) || "[]"); return Array.isArray(data) ? data : []; }
  catch { return []; }
}
function write<T>(storageKey: string, items: T[]) {
  if (typeof window === "undefined") return false;
  try { localStorage.setItem(storageKey, JSON.stringify(items)); window.dispatchEvent(new Event(EVENT)); return true; }
  catch { return false; }
}
export function getSearchHistory() {
  return read<HistoryEntry>(HISTORY).filter(x => x && typeof x.keyword === "string" && Number.isFinite(Date.parse(x.viewedAt)))
    .sort((a,b) => Date.parse(b.viewedAt) - Date.parse(a.viewedAt));
}
export function getFavoriteKeywords() {
  return read<FavoriteEntry>(FAVORITES).filter(x => x && typeof x.keyword === "string" && Number.isFinite(Date.parse(x.addedAt)))
    .sort((a,b) => Date.parse(b.addedAt) - Date.parse(a.addedAt));
}
export function recordKeywordVisit(value: string) {
  const keyword = clean(value);
  if (!keyword) return false;
  const history = getSearchHistory();
  const previous = history.find(x => key(x.keyword) === key(keyword));
  const now = Date.now();
  if (previous && now - Date.parse(previous.viewedAt) < 10000) return true;
  return write(HISTORY, [
    { keyword, viewedAt: new Date(now).toISOString(), visits: (previous?.visits || 0) + 1 },
    ...history.filter(x => key(x.keyword) !== key(keyword))
  ].slice(0, 200));
}
export function removeHistoryKeyword(keyword: string) {
  return write(HISTORY, getSearchHistory().filter(x => key(x.keyword) !== key(keyword)));
}
export function clearHistory() { return write(HISTORY, [] as HistoryEntry[]); }
export function isFavorite(keyword: string) { return getFavoriteKeywords().some(x => key(x.keyword) === key(keyword)); }
export function addFavorite(value: string) {
  const keyword = clean(value);
  if (!keyword) return false;
  const existing = getFavoriteKeywords();
  if (existing.some(x => key(x.keyword) === key(keyword))) return true;
  return write(FAVORITES, [{ keyword, addedAt: new Date().toISOString() }, ...existing].slice(0, 200));
}
export function removeFavorite(keyword: string) {
  return write(FAVORITES, getFavoriteKeywords().filter(x => key(x.keyword) !== key(keyword)));
}
export function subscribeLibrary(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const listener = (event: StorageEvent) => { if (!event.key || event.key === HISTORY || event.key === FAVORITES) callback(); };
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", listener);
  return () => { window.removeEventListener(EVENT, callback); window.removeEventListener("storage", listener); };
}
