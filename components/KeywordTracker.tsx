"use client";
import { useEffect } from "react";
import { recordKeywordVisit } from "@/lib/localKeywords";
import FavoriteButton from "@/components/FavoriteButton";

export default function KeywordTracker({ keyword }: { keyword: string }) {
  useEffect(() => { recordKeywordVisit(keyword); }, [keyword]);
  return <FavoriteButton keyword={keyword} />;
}
