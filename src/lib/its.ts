import type { CctvFeed } from "./cctv";

export type ItsCctvType = "1" | "2" | "3" | "4" | "5";
export type ItsRoadType = "ex" | "its" | "all";
export type ItsResponseType = "json" | "xml";

export type ItsCctvInfoParams = {
  apiKey: string;
  roadType: ItsRoadType;
  cctvType: ItsCctvType;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  responseType: ItsResponseType;
};

export type ItsCctvRecord = {
  roadsectionid?: string;
  filecreatetime?: string;
  cctvtype?: string | number;
  cctvurl?: string;
  cctvresolution?: string;
  coordx?: string | number;
  coordy?: string | number;
  cctvformat?: string;
  cctvname?: string;
};


const streamTypeLabel: Record<string, CctvFeed["streamType"]> = {
  "1": "HLS",
  "2": "MP4",
  "3": "SNAPSHOT",
  "4": "HTTPS HLS",
  "5": "HTTPS MP4",
};

export function buildItsCctvInfoUrl(params: ItsCctvInfoParams): URL {
  const url = new URL("https://openapi.its.go.kr:9443/cctvInfo");

  url.searchParams.set("apiKey", params.apiKey);
  url.searchParams.set("type", params.roadType);
  url.searchParams.set("cctvType", params.cctvType);
  url.searchParams.set("minX", String(params.minX));
  url.searchParams.set("maxX", String(params.maxX));
  url.searchParams.set("minY", String(params.minY));
  url.searchParams.set("maxY", String(params.maxY));
  url.searchParams.set("getType", params.responseType);

  return url;
}

export function redactApiKey(url: string): string {
  const parsedUrl = new URL(url);

  if (parsedUrl.searchParams.has("apiKey")) {
    parsedUrl.searchParams.set("apiKey", "***");
  }

  return parsedUrl.toString();
}

export function parseItsCctvResponse(payload: unknown): ItsCctvRecord[] {
  const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  if (!object(payload)) throw new Error("ITS response invalid");
  const root = object(payload.response) ? payload.response : payload;
  const header = object(root.header) ? root.header : {};
  const code = root.resultCode ?? header.resultCode;
  if (code !== undefined && !["0", "SUCCESS"].includes(String(code))) {
    // Never echo provider messages, which may contain credentials or URLs.
    const safeCode = /^\d{1,5}$/.test(String(code)) ? String(code) : "unknown";
    throw new Error(`ITS API error: ${safeCode}`);
  }
  if (root.data === undefined && (root.datacount === 0 || root.datacount === "0")) return [];
  const data = root.data;
  const records = Array.isArray(data) ? data : object(data) ? [data] : undefined;
  if (!records || !records.every(object)) throw new Error("ITS response invalid");
  return records as ItsCctvRecord[];
}

export function mapItsCctvRecordToFeed(record: ItsCctvRecord, index: number): CctvFeed {
  const name = sanitizeText(record.cctvname) || `ITS CCTV ${index + 1}`;
  const streamUrl = sanitizeText(record.cctvurl);
  const cctvType = sanitizeText(record.cctvtype);
  const fileCreatedTime = sanitizeText(record.filecreatetime);
  const roadSectionId = sanitizeText(record.roadsectionid) || "unknown";
  const streamType = streamTypeLabel[cctvType] ?? inferStreamType(streamUrl, record.cctvformat);

  return {
    id: `its-${roadSectionId}-${index}`,
    name,
    route: "ITS 고속도로/국도",
    direction: "확인 필요",
    location: name,
    coordinates: {
      lat: parseCoordinate(record.coordy),
      lng: parseCoordinate(record.coordx),
    },
    status: streamUrl ? "unverified" : "offline",
    streamType,
    streamUrl: streamUrl || undefined,
    latencySeconds: 0,
    source: "ITS 국가교통정보센터",
    licenseNote: "출처표시 필요 · 저장/재배포/AI 프레임 추출 허용 범위 확인 필요",
    lastCheckedAt: formatItsTimestamp(fileCreatedTime),
  };
}

function inferStreamType(url: string, format?: string): CctvFeed["streamType"] {
  const normalizedFormat = sanitizeText(format).toLowerCase();
  const normalizedUrl = url.toLowerCase();

  if (normalizedFormat.includes("hls") || normalizedUrl.includes(".m3u8")) {
    return normalizedUrl.startsWith("https://") ? "HTTPS HLS" : "HLS";
  }

  if (normalizedFormat.includes("mp4") || normalizedUrl.includes(".mp4")) {
    return normalizedUrl.startsWith("https://") ? "HTTPS MP4" : "MP4";
  }

  return "SNAPSHOT";
}

function parseCoordinate(value?: string | number): number {
  const parsed = Number(sanitizeText(value).replace(/;$/, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatItsTimestamp(value: string): string {
  if (value.length >= 12) {
    return `${value.slice(8, 10)}:${value.slice(10, 12)}`;
  }

  return "확인 필요";
}

function sanitizeText(value?: string | number): string {
  return String(value ?? "").trim().replace(/;$/, "");
}
