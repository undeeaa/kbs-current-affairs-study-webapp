import { afterEach, describe, expect, it, vi } from "vitest";
import { StudyApp } from "../src/study-app";
import type { BootstrapData, RoundStatus } from "../src/types";

function envelope(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data, serverTime: "now" }));
}

function errorEnvelope(message: string): Response {
  return new Response(JSON.stringify({
    ok: false,
    error: { code: "SERVER_ERROR", message, retryable: true },
    serverTime: "now",
  }));
}

function bootstrap(status: RoundStatus, title = "7월 시험"): BootstrapData {
  return {
    currentRound: {
      roundId: "round-1",
      title,
      status,
      date: "2026-07-16",
      questionCount: 20,
    },
    questions: [],
    eligibleForRetest: false,
  };
}

describe("낙관적 UI 업데이트", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    document.body.innerHTML = "";
    localStorage.clear();
    sessionStorage.clear();
  });

  it("닉네임을 입력하면 Google 응답 전에 대기 화면을 표시한다", async () => {
    vi.stubEnv("VITE_API_URL", "https://script.google.com/macros/s/example/exec");
    window.history.replaceState(null, "", "#/exam");
    document.body.innerHTML = '<div id="app"></div>';

    let resolveRefresh: ((response: Response) => void) | undefined;
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(envelope(bootstrap("WAITING")))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveRefresh = resolve; }));

    const root = document.querySelector<HTMLDivElement>("#app") as HTMLDivElement;
    const app = new StudyApp(root);
    await app.start();

    const input = root.querySelector<HTMLInputElement>("#nickname") as HTMLInputElement;
    input.value = "민지";
    root.querySelector<HTMLFormElement>('[data-form="nickname"]')
      ?.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));

    expect(root.textContent).toContain("곧 시험이 시작돼요");
    expect(root.textContent).toContain("민지 · 시험 시작을 기다리고 있어요");
    expect(root.textContent).toContain("참가 준비는 끝났어요");

    resolveRefresh?.(envelope(bootstrap("WAITING")));
    await vi.waitFor(() => expect(root.textContent).not.toContain("참가 준비는 끝났어요"));
  });

  it("시험 단계는 화면에 먼저 반영하고 서버 실패 시 이전 상태로 복구한다", async () => {
    vi.stubEnv("VITE_API_URL", "https://script.google.com/macros/s/example/exec");
    window.history.replaceState(null, "", "#/admin");
    sessionStorage.setItem("kbs-study:admin-token", "token");
    document.body.innerHTML = '<div id="app"></div>';

    let resolveTransition: ((response: Response) => void) | undefined;
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(envelope(bootstrap("WAITING")))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveTransition = resolve; }));

    const root = document.querySelector<HTMLDivElement>("#app") as HTMLDivElement;
    const app = new StudyApp(root);
    await app.start();

    root.querySelector<HTMLButtonElement>('[data-action="prepare-transition"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-action="confirm-transition"]')?.click();

    expect(root.textContent).toContain("현재 1차 시험 단계예요");
    expect(root.textContent).toContain("화면을 다음 시험 단계로 먼저 바꿨어요");

    resolveTransition?.(errorEnvelope("단계를 저장하지 못했어요."));
    await vi.waitFor(() => expect(root.textContent).toContain("현재 시험 준비 단계예요"));
    expect(root.textContent).toContain("단계를 저장하지 못했어요.");
  });

  it("다음 회차를 먼저 표시하고 서버 실패 시 완료된 회차로 돌아간다", async () => {
    vi.stubEnv("VITE_API_URL", "https://script.google.com/macros/s/example/exec");
    window.history.replaceState(null, "", "#/admin");
    sessionStorage.setItem("kbs-study:admin-token", "token");
    document.body.innerHTML = '<div id="app"></div>';

    let resolveNextRound: ((response: Response) => void) | undefined;
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(envelope(bootstrap("FINISHED", "이전 회차")))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveNextRound = resolve; }));

    const root = document.querySelector<HTMLDivElement>("#app") as HTMLDivElement;
    const app = new StudyApp(root);
    await app.start();

    const input = root.querySelector<HTMLInputElement>("#next-round-title") as HTMLInputElement;
    input.value = "새 회차";
    root.querySelector<HTMLFormElement>('[data-form="next-round"]')
      ?.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));

    expect(root.textContent).toContain("새 회차");
    expect(root.textContent).toContain("현재 시험 준비 단계예요");
    expect(root.textContent).toContain("새 회차를 화면에 먼저 준비했어요");

    resolveNextRound?.(errorEnvelope("새 회차를 만들지 못했어요."));
    await vi.waitFor(() => expect(root.textContent).toContain("이전 회차"));
    expect(root.textContent).toContain("새 회차를 만들지 못했어요.");
  });
});
