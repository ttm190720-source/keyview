# 키뷰 (Keyview) v2

검색어 하나를 입력하면 네이버 월간 검색량과 관련 키워드를 검색량 순으로 보여주고, 키워드를 클릭하며 계속 탐색하는 무료 키워드 도구입니다.

## 핵심 원칙

- 검색마다 API를 호출하지 않습니다.
- 7일 이내 캐시는 그대로 사용합니다.
- 7~30일 데이터도 API 재호출 없이 저장 데이터를 우선 제공합니다.
- 캐시가 없거나 30일을 넘긴 경우에만 Naver SearchAd `/keywordstool`을 호출합니다.
- 동일 키워드 동시 요청은 프로세스 내에서 1개 호출로 병합합니다.
- 서로 다른 키워드 호출도 전역 큐로 직렬화하고 기본 1.2초 간격을 둡니다.
- 최근 24시간 호출은 기본 1,000회 자체 예산을 두며 환경변수로 조정할 수 있습니다.
- 검색엔진 봇은 Naver API를 호출하지 않고 캐시에 있는 데이터만 읽습니다.
- 네이버 API가 429를 반환하면 기존 저장 데이터가 있으면 계속 표시합니다.
- API 키/Secret은 코드에 넣지 않고 환경변수로만 관리합니다.

## 환경변수

- `DATABASE_URL`
- `NAVER_SEARCHAD_API_KEY`
- `NAVER_SEARCHAD_SECRET_KEY`
- `NAVER_SEARCHAD_CUSTOMER_ID`
- `KEYVIEW_DAILY_API_BUDGET` (기본 1000)
- `KEYVIEW_MIN_API_INTERVAL_MS` (기본 1200)

## 데이터 구조

- `keywords`: 키워드 및 PC/모바일 월 검색량, 마지막 조회 시각
- `keyword_relations`: A 키워드 → 관련 키워드 관계
- `search_events`: 키뷰 내부 인기 키워드 계산용 조회 로그
- `api_call_events`: 외부 API 호출량 보호 및 상태 기록

공고픽 저장소/DB/환경변수와 공유하지 않습니다.
