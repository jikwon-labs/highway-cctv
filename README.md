# Highway CCTV AI

웹 기반 고속도로 CCTV AI 관제 보조 MVP입니다.

## 현재 구현 범위

- Next.js App Router + TypeScript + Tailwind CSS 기반 웹 앱
- CCTV 피드 목록/상태/지연시간 샘플 데이터
- 선택 CCTV 관제 플레이스홀더
- AI 이벤트 후보 패널
- CCTV 상태 필터/선택 인터랙션
- 이벤트 확인/오탐/보류 검토 상태 변경
- 이벤트 우선순위/관제 요약 도메인 로직
- HLS.js 기반 플레이어 컴포넌트
- ITS CCTV API URL 빌더/응답 매핑 유틸
- `/api/cctv` mock API route와 대시보드 갱신 버튼
- API 키 마스킹 유틸
- Vitest 단위 테스트

## 원칙

- 실제 CCTV 대량 호출, 영상 저장, 재배포, 재인코딩은 하지 않습니다.
- API 키/약관/트래픽/프레임 추출 가능 여부 확인 전까지 실제 스트림 연결은 소수 샘플로 제한합니다.
- AI 결과는 확정 판정이 아니라 운영자 검토용 후보로 표시합니다.

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
