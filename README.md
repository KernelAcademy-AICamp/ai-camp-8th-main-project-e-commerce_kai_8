[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/yBcYDqOF)

# Orbit

개인화 무한 탐색 티셔츠 PWA (Discovery 단계, 임시명). 검색어 없이 이미지를 훑는 습관에서 출발해, 대중 베스트 목록 대신 사용할수록 개인 취향에 맞게 변하는 무한 탐색 경험을 검증한다.

## 구조

| 폴더 | 내용 |
|---|---|
| [`frontend/`](frontend/) | Next.js PWA — clean architecture + MVVM ([frontend/AGENTS.md](frontend/AGENTS.md)) |
| [`backend/`](backend/) | 무신사 `c_goods` 카탈로그 파이프라인 — Supabase에 226,320행 적재 완료 ([backend/README.md](backend/README.md)) |
| [`docs/`](docs/) | 기획 문서 — 제품 정의는 [docs/orbit/](docs/orbit/) |
| [`design/`](design/) | 디자인 시스템·시안 |

## 시작하기

```bash
npm install            # 루트에서 1회 — husky pre-commit 훅 설치
cd frontend
npm install
npm run dev
```

작업 규칙(브랜치·커밋·PR·코드 품질)은 [AGENTS.md](AGENTS.md)를 따른다.
