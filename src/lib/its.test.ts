import { describe, expect, it } from "vitest";

import {
  buildItsCctvInfoUrl,
  mapItsCctvRecordToFeed,
  parseItsCctvResponse,
  redactApiKey,
} from "./its";

describe("ITS CCTV API helpers", () => {
  it("공식 cctvInfo 요청 URL을 좌표 박스와 HTTPS HLS 타입으로 만든다", () => {
    const url = buildItsCctvInfoUrl({
      apiKey: "secret-key",
      roadType: "ex",
      cctvType: "4",
      minX: 126.8,
      maxX: 127.89,
      minY: 34.9,
      maxY: 35.1,
      responseType: "json",
    });

    expect(url.toString()).toBe(
      "https://openapi.its.go.kr:9443/cctvInfo?apiKey=secret-key&type=ex&cctvType=4&minX=126.8&maxX=127.89&minY=34.9&maxY=35.1&getType=json",
    );
  });

  it("로그/화면 공유용 URL에서는 API 키를 마스킹한다", () => {
    const redacted = redactApiKey(
      "https://openapi.its.go.kr:9443/cctvInfo?apiKey=secret-key&type=all&getType=json",
    );

    expect(redacted).toBe(
      "https://openapi.its.go.kr:9443/cctvInfo?apiKey=***&type=all&getType=json",
    );
  });

  it("ITS 응답 레코드를 앱 CCTV 피드 스키마로 변환한다", () => {
    const feed = mapItsCctvRecordToFeed(
      {
        cctvname: "[경부선] 서울요금소",
        cctvurl: "https://example.com/live.m3u8",
        cctvformat: "HLS",
        cctvtype: "4",
        coordx: "127.1049",
        coordy: "37.3349",
        roadsectionid: "0010",
        filecreatetime: "20261011185000",
      },
      0,
    );

    expect(feed).toMatchObject({
      id: "its-0010-0",
      name: "[경부선] 서울요금소",
      route: "ITS 고속도로/국도",
      direction: "확인 필요",
      location: "[경부선] 서울요금소",
      coordinates: { lat: 37.3349, lng: 127.1049 },
      status: "unverified",
      streamType: "HTTPS HLS",
      streamUrl: "https://example.com/live.m3u8",
      source: "ITS 국가교통정보센터",
      lastCheckedAt: "18:50",
    });
  });

  it("실제 API처럼 숫자로 내려오는 좌표와 CCTV 유형을 변환한다", () => {
    const feed = mapItsCctvRecordToFeed({
      cctvname: "숫자 필드 검증용", cctvtype: 4,
      coordx: 127.1049, coordy: 37.3349,
      cctvurl: "https://example.com/live.m3u8",
    }, 0);
    expect(feed.coordinates).toEqual({ lat: 37.3349, lng: 127.1049 });
    expect(feed.streamType).toBe("HTTPS HLS");
  });

  it("HTTP 200의 인증 오류와 예상 밖 응답을 빈 목록으로 숨기지 않는다", () => {
    expect(() => parseItsCctvResponse({ resultCode: "4005", resultMsg: "fixture-sensitive-message" })).toThrow("ITS API error: 4005");
    expect(() => parseItsCctvResponse({ response: { header: { resultCode: "4001" } } })).toThrow("ITS API error: 4001");
    expect(() => parseItsCctvResponse(null)).toThrow("ITS response invalid");
    expect(() => parseItsCctvResponse({ unexpected: true })).toThrow("ITS response invalid");
    expect(parseItsCctvResponse({ response: { datacount: 0, data: [] } })).toEqual([]);
  });

  it("단일 data 객체와 배열 data 객체 모두 안전하게 파싱한다", () => {
    const single = parseItsCctvResponse({ response: { data: { cctvname: "A" } } });
    const list = parseItsCctvResponse({ response: { data: [{ cctvname: "A" }, { cctvname: "B" }] } });

    expect(single).toHaveLength(1);
    expect(list).toHaveLength(2);
  });
});
