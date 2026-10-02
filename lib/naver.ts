import crypto from "node:crypto";

const BASE_URL = "https://api.searchad.naver.com";
const PATH = "/keywordstool";

export type NaverKeyword = {
  relKeyword: string;
  monthlyPcQcCnt: number | string | null;
  monthlyMobileQcCnt: number | string | null;
};

type NaverResponse = { keywordList?: NaverKeyword[] };

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function makeSignature(timestamp: string, method: string, path: string, secret: string) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${method}.${path}`)
    .digest("base64");
}

export class NaverRateLimitError extends Error {}

let apiQueue: Promise<void> = Promise.resolve();
let lastApiCallAt = 0;

async function waitForApiSlot() {
  const minInterval = Math.max(250, Number(process.env.KEYVIEW_MIN_API_INTERVAL_MS || 1200));
  let release!: () => void;
  const previous = apiQueue;
  apiQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  const wait = Math.max(0, minInterval - (Date.now() - lastApiCallAt));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastApiCallAt = Date.now();
  release();
}

export async function fetchRelatedKeywords(keyword: string) {
  await waitForApiSlot();
  const apiKey = env("NAVER_SEARCHAD_API_KEY");
  const secret = env("NAVER_SEARCHAD_SECRET_KEY");
  const customerId = env("NAVER_SEARCHAD_CUSTOMER_ID");
  const timestamp = Date.now().toString();
  const signature = makeSignature(timestamp, "GET", PATH, secret);

  const params = new URLSearchParams({
    hintKeywords: keyword,
    showDetail: "1",
  });

  const response = await fetch(`${BASE_URL}${PATH}?${params}`, {
    method: "GET",
    headers: {
      "X-Timestamp": timestamp,
      "X-API-KEY": apiKey,
      "X-Customer": customerId,
      "X-Signature": signature,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (response.status === 429) {
    throw new NaverRateLimitError("Naver keyword tool rate limit reached");
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Naver API ${response.status}: ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as NaverResponse;
  return data.keywordList ?? [];
}

export function parseNaverCount(input: number | string | null | undefined) {
  if (input == null) return { value: null, low: false };
  if (typeof input === "number") return { value: input, low: false };

  const text = String(input).trim().replace(/,/g, "");
  if (/^<\s*10$/.test(text)) return { value: 0, low: true };
  const value = Number(text);
  return { value: Number.isFinite(value) ? value : null, low: false };
}
