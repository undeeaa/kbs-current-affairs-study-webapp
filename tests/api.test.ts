import { afterEach, describe, expect, it, vi } from "vitest";
import { StudyApi, StudyApiError } from "../src/api";

describe("API 계약", () => {
  afterEach(() => vi.restoreAllMocks());

  it("POST를 사전 요청이 필요 없는 text/plain JSON으로 보낸다", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: { adminToken: "token", expiresAt: "later" }, serverTime: "now" })),
    );
    const api = new StudyApi("https://script.google.com/macros/s/example/exec");
    await api.adminLogin("secret-code");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "text/plain;charset=UTF-8" });
    expect(JSON.parse(String(init.body))).toEqual({ action: "adminLogin", code: "secret-code" });
  });

  it("서버 오류 형식을 사용자 오류로 바꾼다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        ok: false,
        error: { code: "ROUND_NOT_FOUND", message: "이 시험을 찾을 수 없어요.", retryable: false },
        serverTime: "now",
      })),
    );
    const api = new StudyApi("https://script.google.com/macros/s/example/exec");
    await expect(api.roundDetail("missing")).rejects.toMatchObject({
      code: "ROUND_NOT_FOUND",
      retryable: false,
    } satisfies Partial<StudyApiError>);
  });
});
