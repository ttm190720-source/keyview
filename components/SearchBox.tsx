"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function SearchBox({ initial = "", compact = false }: { initial?: string; compact?: boolean }) {
  const [value, setValue] = useState(initial);
  const router = useRouter();

  function submit(event: FormEvent) {
    event.preventDefault();
    const keyword = value.trim();
    if (!keyword) return;
    router.push(`/k/${encodeURIComponent(keyword)}`);
  }

  return (
    <form className={`searchBox ${compact ? "compact" : ""}`} onSubmit={submit}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="검색어를 입력하세요"
        aria-label="키워드 검색"
        maxLength={80}
        autoComplete="off"
      />
      <button type="submit">검색</button>
    </form>
  );
}
