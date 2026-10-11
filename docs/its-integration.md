# ITS CCTV 연동 준비

실제 CCTV 연결은 API 키/약관/트래픽/저장 가능 여부 확인 후 소수 샘플로만 진행합니다.

## 필요한 환경 변수

```bash
# 기본값은 mock입니다. 실제 호출 전 약관/한도/저장 가능 여부를 먼저 확인합니다.
CCTV_SOURCE_MODE=mock
ITS_API_KEY="발급받은 ITS 인증키"
```

## 요청 URL 생성 로직

- `src/lib/its.ts`
- 공식 엔드포인트: `https://openapi.its.go.kr:9443/cctvInfo`
- 기본 목표 타입: `cctvType=4` HTTPS HLS
- 응답 목표: `getType=json`
- 로그/화면 공유 시 `apiKey`는 `***`로 마스킹

## 현재 구현

- ITS CCTV 요청 URL 빌더
- API 키 마스킹 유틸
- ITS 응답 `data` 단일/배열 파서
- ITS 레코드 → 앱 `CctvFeed` 스키마 변환
- mock/ITS 공통 source adapter 계층
- `/api/cctv`에서 환경 변수 기반 source adapter 선택
- HLS.js 기반 클라이언트 플레이어 컴포넌트
- streamUrl이 없을 때 안전한 플레이스홀더 표시

## 금지/주의

- 대량 좌표 박스 조회 금지
- 영상 저장/재배포/재인코딩 금지
- 프레임 추출 기반 AI 분석은 허용 범위 확인 전 금지
- 스트림 URL, API 키, 장애 로그를 외부에 그대로 노출하지 않기
