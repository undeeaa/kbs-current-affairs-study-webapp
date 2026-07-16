import { afterEach, describe, expect, it, vi } from "vitest";
import { StudyApp } from "../src/study-app";

function envelope(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data, serverTime: "now" }));
}

describe("요청 중 UI", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    window.history.replaceState(null, "", "#/exam");
    document.body.innerHTML = "";
    localStorage.clear();
    sessionStorage.clear();
  });

  it("초기 시험 상태 확인 중에는 안내 문구를 하나만 표시한다", async () => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_API_URL", "https://script.google.com/macros/s/example/exec");
    window.history.replaceState(null, "", "#/exam");
    document.body.innerHTML = '<div id="app"></div>';

    let resolveBootstrap: ((response: Response) => void) | undefined;
    vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveBootstrap = resolve; }));

    const root = document.querySelector<HTMLDivElement>("#app") as HTMLDivElement;
    const app = new StudyApp(root);
    const start = app.start();

    await vi.advanceTimersByTimeAsync(1_200);
    expect(root.textContent).toContain("시험 상태를 확인하고 있어요");
    expect(root.textContent).not.toContain("잠시만 기다려주세요");
    expect(root.textContent).not.toContain("시험 데이터를 불러오는 데 시간이 조금 걸리고 있어요");

    resolveBootstrap?.(envelope({
      currentRound: null,
      questions: [],
      eligibleForRetest: false,
    }));
    await start;
  });

  it("관리자 로그인 중 입력 필드와 버튼만 잠그고 내부 연결 안내는 표시하지 않는다", async () => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_API_URL", "https://script.google.com/macros/s/example/exec");
    window.history.replaceState(null, "", "#/admin");
    document.body.innerHTML = '<div id="app"></div>';

    let resolveLogin: ((response: Response) => void) | undefined;
    vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveLogin = resolve; }));

    const root = document.querySelector<HTMLDivElement>("#app") as HTMLDivElement;
    const app = new StudyApp(root);
    await app.start();
    expect(globalThis.fetch).not.toHaveBeenCalled();

    const input = root.querySelector<HTMLInputElement>("#admin-code") as HTMLInputElement;
    const form = root.querySelector<HTMLFormElement>('[data-form="admin-login"]') as HTMLFormElement;
    input.value = "admin-code";
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();

    expect(root.querySelector<HTMLInputElement>("#admin-code")?.disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    expect(root.textContent).toContain("확인하고 있어요");

    await vi.advanceTimersByTimeAsync(1_200);
    expect(root.textContent).not.toContain("Apps Script");
    expect(root.textContent).not.toContain("Google");

    resolveLogin?.(envelope({
      adminToken: "token",
      expiresAt: "later",
      bootstrap: {
        currentRound: null,
        questions: [],
        eligibleForRetest: false,
      },
    }));
    await vi.waitFor(() => expect(root.textContent).toContain("새 회차를 준비할까요?"));
    expect(root.textContent).toContain("새 회차 준비하기");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("회차가 없으면 인증 후 첫 회차를 만들어 바로 관리할 수 있다", async () => {
    vi.stubEnv("VITE_API_URL", "https://script.google.com/macros/s/example/exec");
    window.history.replaceState(null, "", "#/admin");
    document.body.innerHTML = '<div id="app"></div>';

    const emptyBootstrap = {
      currentRound: null,
      questions: [],
      eligibleForRetest: false,
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(envelope({
        adminToken: "token",
        expiresAt: "later",
        bootstrap: emptyBootstrap,
      }))
      .mockResolvedValueOnce(envelope({
        currentRound: {
          roundId: "round-1",
          title: "첫 시사상식 시험",
          status: "WAITING",
          date: "2026-07-16",
          questionCount: 20,
        },
        questions: [],
        eligibleForRetest: false,
      }));

    const root = document.querySelector<HTMLDivElement>("#app") as HTMLDivElement;
    const app = new StudyApp(root);
    await app.start();

    const codeInput = root.querySelector<HTMLInputElement>("#admin-code") as HTMLInputElement;
    codeInput.value = "admin-code";
    root.querySelector<HTMLFormElement>('[data-form="admin-login"]')
      ?.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(root.querySelector('[data-form="next-round"]')).not.toBeNull());

    const titleInput = root.querySelector<HTMLInputElement>("#next-round-title") as HTMLInputElement;
    titleInput.value = "첫 시사상식 시험";
    root.querySelector<HTMLFormElement>('[data-form="next-round"]')
      ?.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(root.textContent).toContain("1차 시험 시작"));
    expect(root.textContent).toContain("첫 시사상식 시험");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchSpy.mock.calls[1][1]?.body))).toMatchObject({
      action: "createNextRound",
      title: "첫 시사상식 시험",
    });
  });
});
