// View: 자연어 검색 입력(워터드롭 유리 필). 로컬 입력 상태만 갖고 onSearch로 위임.
"use client";

import { useState } from "react";

import { SearchIcon } from "./icons";

export default function SearchBar({
  initialValue = "",
  onSearch,
  autoFocus = false,
  placeholder = "예: 블랙 오버핏 반팔티 L, 3만원 이하",
}: {
  initialValue?: string;
  onSearch: (q: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <form
      className="tf-searchbar"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSearch(value.trim());
      }}
    >
      <div className="tf-pill">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
          }}
          placeholder={placeholder}
          aria-label="검색어"
          autoFocus={autoFocus}
          autoComplete="off"
        />
        <button className="tf-pill__btn" type="submit" aria-label="검색">
          <SearchIcon />
        </button>
      </div>
    </form>
  );
}
