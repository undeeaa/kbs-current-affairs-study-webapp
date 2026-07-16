import { afterEach, describe, expect, it, vi } from "vitest";
import { StudyApp } from "../src/study-app";

function envelope(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data, serverTime: "now" }));
}

describe("화면 이동 중 데이터 요청", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    document.body.innerHTML = "";
    localStorage.clear();
    sessionStorage.clear();
  });

  it("이전 요청 중 지난 회차로 이동해도 빈 상태를 먼저 표시하지 않는다", async () => {
    vi.stubEnv("VITE_API_URL", "https://script.google.com/macros/s/example/exec");
    window.history.replaceState(null, "", "#/exam");
    document.body.innerHTML = '<div id="app"></div>';

    vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce((_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }))
      .mockResolvedValueOnce(envelope([{
        roundId: "round-1",
        title: "7월 1회차",
        status: "FINISHED",
        date: "2026-07-16",
        questionCount: 20,
        participantCount: 3,
      }]));

    const root = document.querySelector<HTMLDivElement>("#app") as HTMLDivElement;
    const app = new StudyApp(root);
    const start = app.start();

    window.history.replaceState(null, "", "#/history");
    await Promise.all([start, (app as unknown as { loadRoute(): Promise<void> }).loadRoute()]);

    expect(root.textContent).toContain("7월 1회차");
    expect(root.textContent).not.toContain("아직 지난 시험이 없어요");
  });
});
