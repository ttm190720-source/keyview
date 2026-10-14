"use client";
import { useEffect, useState } from "react";
import { addFavorite, isFavorite, removeFavorite, subscribeLibrary } from "@/lib/localKeywords";

export default function FavoriteButton({ keyword, compact = false }: { keyword: string; compact?: boolean }) {
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sync = () => setSaved(isFavorite(keyword));
    sync();
    setReady(true);
    return subscribeLibrary(sync);
  }, [keyword]);
  function toggle() {
    const ok = saved ? removeFavorite(keyword) : addFavorite(keyword);
    if (!ok) window.alert("브라우저 저장소에 접근할 수 없어 저장하지 못했습니다.");
  }
  return (
    <button type="button" className={`favoriteButton ${compact ? "small" : ""} ${saved ? "selected" : ""}`}
      aria-label={`${keyword} ${saved ? "관심 키워드 해제" : "관심 키워드 등록"}`}
      title={saved ? "관심 키워드에서 삭제" : "관심 키워드에 등록"}
      aria-pressed={saved} onClick={toggle} disabled={!ready}>
      <span aria-hidden="true">{saved ? "★" : "☆"}</span>
      {!compact && <span>{saved ? "관심 등록됨" : "관심 키워드 등록"}</span>}
    </button>
  );
}
