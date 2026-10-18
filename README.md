# Highway CCTV AI

웹 기반 고속도로 CCTV AI 관제 보조 MVP입니다.

## 현재 구현 범위

- Next.js App Router + TypeScript + Tailwind CSS 기반 웹 앱
- CCTV 피드 목록/상태/지연시간 샘플 데이터
- 선택 CCTV 관제 플레이스홀더
- Leaflet/OpenStreetMap 실제 도로 지도, 정확한 CCTV 좌표·후보 건수/긴급도·선택 강조
- 위치 동의 후 주변 고속도로 CCTV 직선거리 정렬, 사용 중지·늦은 응답 무효화
- `/monitor`: 선택 CCTV 최대 4대의 TV형 화면, localStorage 선택·순서 복원
- `/events`: 오탐 제외 후보 감지 지점만 모아보는 화면
- 지도·CCTV 목록·이벤트 상세의 양방향 선택 연동
- 검색/큐 필터와 독립적인 선택 지점 유지 및 지점별 후보 선택
- 소스 상태/라이선스/저장 제한 패널
- 감지 후보 패널
- CCTV 상태 필터/선택 인터랙션
- 이벤트 확인/오탐/대기 검토 상태 변경
- 브라우저 저장소 기반 최근 검토 이력
- 이벤트 처리 사유 선택 및 이력 기록
- 이벤트 상세 패널과 감지/검토 타임라인
- 감지 후보 운영 큐 필터와 상태별 건수 표시
- 감지 후보 지점/이벤트/근거 검색
- 감지 후보 긴급도/신뢰도/최신/지점 정렬
- 확인/오탐/대기 상태별 처리 사유 선택
- 검토 이력 JSON/CSV 다운로드
- 관제 도구 톤의 라이트 UI
- 이벤트 우선순위/관제 요약 도메인 로직
- HLS.js 기반 플레이어 컴포넌트
- ITS CCTV API URL 빌더/응답 매핑 유틸
- mock/ITS 공통 source adapter 계층
- `/api/cctv` source adapter route와 대시보드 갱신 버튼
- ITS 실제 호출 전 좌표 박스 안전 가드, 60초 캐시, 502 오류 응답
- `/api/cctv` runtime status와 대시보드 상단 실제/mock 모드 표시
- API 키 마스킹 유틸
- 실응답 숫자 필드 지원 및 실제 모드의 샘플 결과 분리
- 작은 기본 조회 구역, process-local 캐시/동시 요청 합치기, 10초 timeout
- 명시적 영상 연결/중지/다시 연결, MSE HLS.js 우선 경로와 오류 분류
- GPS 메모리 전용·서버에는 격자화 bbox만 전달, 구역별 최대 8개 LRU/캐시
- Vitest 단위 테스트

## 원칙

- 실제 CCTV 대량 호출, 영상 저장, 재배포, 재인코딩은 하지 않습니다.
- API 키/약관/트래픽/프레임 추출 가능 여부 확인 전까지 실제 스트림 연결은 소수 샘플로 제한합니다.
- AI 결과는 확정 판정이 아니라 운영자 검토용 후보로 표시합니다.
- 실제 ITS 테스트는 `.env.local`에만 키를 넣고 `/api/cctv` 단일 호출로 먼저 확인합니다.

API 발급 준비는 [API 설정 안내](docs/api-setup.md), 지도 연동 검증은 [QA 기록](docs/qa-map-workspace.md), 실제 ITS 정보 조회 검증은 [실연동 기록](docs/its-live-validation.md)을 참고합니다.

화면별 사용법과 저장 범위는 [모니터링 화면 계약](docs/monitoring-workspaces.md), 최신 검증은 [통합 QA](docs/qa-monitoring-workspaces.md), 재생 오류 진단은 [진단 기록](docs/playback-diagnosis.md)에 있습니다. 실제 CCTV 자동 감지기는 아직 연결하지 않았습니다.

## 실행

```bash
pnpm install
pnpm dev
```

## 검증

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```
