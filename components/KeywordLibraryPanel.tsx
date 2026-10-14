"use client";
import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  addFavorite, clearHistory, getFavoriteKeywords, getSearchHistory, isFavorite,
  removeFavorite, removeHistoryKeyword, subscribeLibrary,
  type HistoryEntry, type FavoriteEntry
} from "@/lib/localKeywords";

type Mode = "history" | "favorites";
function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}
export default function KeywordLibraryPanel({ mode }: { mode: Mode }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState("");
  const [manual, setManual] = useState("");
  useEffect(() => {
    const sync = () => { setHistory(getSearchHistory()); setFavorites(getFavoriteKeywords()); };
    sync(); setReady(true);
    return subscribeLibrary(sync);
  }, []);
  const entries = mode === "history" ? history : favorites;
  const rows = useMemo(() => entries.filter(x => x.keyword.toLocaleLowerCase("ko-KR").includes(filter.trim().toLocaleLowerCase("ko-KR"))), [entries, filter]);
  function addManual(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!manual.trim()) return;
    if (addFavorite(manual)) setManual("");
    else window.alert("브라우저 저장소에 접근할 수 없어 등록하지 못했습니다.");
  }
  function removeEntry(keyword: string) {
    if (mode === "history") removeHistoryKeyword(keyword); else removeFavorite(keyword);
  }
  function deleteAll() {
    if (window.confirm("검색기록을 모두 삭제하시겠습니까? 관심 키워드는 유지됩니다.")) clearHistory();
  }
  return (
    <section className="libraryCard">
      <div className="libraryTabs" role="navigation" aria-label="키워드 관리">
        <Link href="/history" className={mode === "history" ? "active" : ""}>검색기록</Link>
        <Link href="/saved" className={mode === "favorites" ? "active" : ""}>관심 키워드</Link>
      </div>
      {mode === "favorites" && (
        <form className="libraryAddForm" onSubmit={addManual}>
          <input value={manual} onChange={e => setManual(e.target.value)}
            placeholder="등록할 관심 키워드 입력" aria-label="관심 키워드 입력" maxLength={80} />
          <button type="submit" disabled={!manual.trim()}>+ 관심 키워드 등록</button>
        </form>
      )}
      <div className="libraryToolbar">
        <strong>{ready ? `총 ${entries.length.toLocaleString("ko-KR")}개` : "불러오는 중"}</strong>
        <div className="libraryToolbarActions">
          <input value={filter} onChange={e => setFilter(e.target.value)}
            placeholder="내 키워드 찾기" aria-label="저장된 키워드 검색" />
          {mode === "history" && history.length > 0 && <button type="button" onClick={deleteAll}>기록 전체 삭제</button>}
        </div>
      </div>
      {!ready ? <div className="libraryEmpty">저장된 데이터를 불러오는 중입니다.</div> : rows.length ? (
        <div className="libraryRows">
          {rows.map(entry => (
            <div className="libraryRow" key={entry.keyword.toLocaleLowerCase("ko-KR")}>
              <div className="libraryRowMain">
                <Link href={`/k/${encodeURIComponent(entry.keyword)}`} prefetch={false}>{entry.keyword}</Link>
                <span>{mode === "history"
                  ? `최근 검색 ${formatDate((entry as HistoryEntry).viewedAt)} · ${(entry as HistoryEntry).visits}회`
                  : `등록 ${formatDate((entry as FavoriteEntry).addedAt)}`}</span>
              </div>
              <div className="libraryRowActions">
                {mode === "history" && (
                  <button type="button" className={favorites.some(x => x.keyword.toLocaleLowerCase("ko-KR") === entry.keyword.toLocaleLowerCase("ko-KR")) ? "selected" : ""}
                    onClick={() => { const ok = isFavorite(entry.keyword) ? removeFavorite(entry.keyword) : addFavorite(entry.keyword);
                      if (!ok) window.alert("관심 키워드를 저장하지 못했습니다."); }}>
                    {favorites.some(x => x.keyword.toLocaleLowerCase("ko-KR") === entry.keyword.toLocaleLowerCase("ko-KR")) ? "★ 관심등록" : "☆ 관심등록"}
                  </button>
                )}
                <button type="button" onClick={() => removeEntry(entry.keyword)} aria-label={`${entry.keyword} 삭제`}>삭제</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="libraryEmpty">
          <strong>{filter ? "일치하는 키워드가 없습니다." : mode === "history" ? "아직 검색기록이 없습니다." : "아직 관심 키워드가 없습니다."}</strong>
          <p>{filter ? "다른 검색어를 입력해보세요." : mode === "history" ? "키워드를 분석하면 이곳에 자동으로 기록됩니다." : "위에서 키워드를 직접 등록하거나 분석 화면에서 ☆를 눌러보세요."}</p>
          {!filter && mode === "history" && <Link href="/">키워드 검색하기 →</Link>}
        </div>
      )}
      <p className="libraryStorageNote">기록과 관심 키워드는 현재 브라우저에만 저장됩니다. 브라우저 데이터 삭제 또는 다른 기기에서는 목록이 이어지지 않습니다.</p>
    </section>
  );
}
