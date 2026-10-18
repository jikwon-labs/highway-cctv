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
- ITS adapter 좌표 박스 안전 가드
- `/api/cctv` 응답 `meta.runtimeStatus`에 요청 모드, 실제 적용 모드, API 키 존재 여부, 안내 문구 포함
- source adapter 실패 시 `/api/cctv` 502 JSON 오류 반환. 오류 메시지의 `apiKey` query 값은 `***`로 마스킹
- 대시보드 상단에서 `안전 모드 · mock 데이터` 또는 `실제 소스 · ITS 실제 소스`를 구분 표시
- HLS.js 기반 클라이언트 플레이어 컴포넌트
- streamUrl이 없을 때 안전한 플레이스홀더 표시
- 실제 응답의 숫자형 coordx/coordy/cctvtype 지원
- 영상 주소를 받은 상태는 `재생 미확인`으로 표시하며 지연은 `미측정`으로 구분
- `영상 연결 시작` 전에는 video/HLS를 만들지 않으며, 중지 또는 지점/URL 변경 시 연결 해제
- 실제 모드 초기 화면에는 샘플 CCTV/감지 후보를 넣지 않고 `데이터 갱신`으로 명시적으로 조회

## 실제 호출 안전 장치

- 기본값은 항상 `CCTV_SOURCE_MODE=mock`
- `CCTV_SOURCE_MODE=its`라도 `ITS_API_KEY`가 없으면 mock adapter로 폴백
- ITS 요청 좌표 박스는 경도/위도 각각 1도 이하, 면적 0.75도² 이하만 허용
- ITS adapter는 동일 서버 프로세스의 route 요청들이 공유하는 60초 캐시와 in-flight 요청 합치기를 사용함. 다중 프로세스/서버리스 인스턴스 전체를 제한하는 분산 rate limit은 아님
- 기본 조회 범위는 경도 127.1~127.12, 위도 37.32~37.35의 소구역으로 제한
- upstream 요청에는 10초 timeout과 redirect 차단을 적용하고, 원본 네트워크 예외 메시지를 노출하지 않음
- 안전 범위를 넘으면 fetch 전에 차단하고 실제 API를 호출하지 않음
- API route는 adapter 오류를 502 JSON으로 반환해 화면에서 갱신 실패로 표시

## 소량 ITS 호출 전 점검 절차

1. ITS 이용 약관, 트래픽 한도, 영상 저장/재배포 가능 여부를 확인합니다.
2. `.env.local`에만 값을 넣습니다. 실제 키는 문서, 커밋, 채팅에 남기지 않습니다.

```bash
CCTV_SOURCE_MODE=its
ITS_API_KEY="발급받은 ITS 인증키"
```

3. 개발 서버를 실행하고 `/api/cctv`를 한 번만 호출합니다.

```bash
pnpm dev
curl -s http://localhost:3000/api/cctv
```

4. 응답에서 아래 항목만 확인합니다.
   - `meta.runtimeStatus.effectiveMode`가 `its`인지
   - `meta.feedCount`가 예상 범위인지
   - stream URL이 화면/로그에 불필요하게 노출되지 않는지
5. 실패 응답은 502 JSON으로 확인합니다. 오류 공유 시 `apiKey=***` 형태로 마스킹되어야 합니다.
6. 반복 호출은 피합니다. adapter 기본 캐시는 60초지만, 실제 테스트는 필요한 최소 횟수만 수행합니다.

## 금지/주의

- 대량 좌표 박스 조회 금지
- 영상 저장/재배포/재인코딩 금지
- 프레임 추출 기반 AI 분석은 허용 범위 확인 전 금지
- 스트림 URL, API 키, 장애 로그를 외부에 그대로 노출하지 않기
