import { afterEach, describe, expect, it, vi } from "vitest";
import { StudyApp } from "../src/study-app";
import type { BootstrapData, RoundStatus } from "../src/types";

function envelope(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data, serverTime: "now" }));
}

function bootstrap(status: RoundStatus): BootstrapData {
  return {
    currentRound: {
      roundId: "round-1",
      title: "7월 시험",
      status,
      date: "2026-07-16",
      questionCount: 1,
    },
    questions: status === "FIRST_TEST"
      ? [{ questionId: "q1", order: 1, question: "테스트 문제" }]
      : [],
    eligibleForRetest: false,
  };
}

function seedSession(): void {
  localStorage.setItem("kbs-study:v1:session:round-1", JSON.stringify({
    roundId: "round-1",
    participantId: "participant-1",
    nickname: "민지",
  }));
}

describe("백그라운드 시험 상태 확인", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    document.body.innerHTML = "";
    localStorage.clear();
    sessionStorage.clear();
  });

  it("서버 상태가 같으면 답 입력 칸을 다시 만들지 않는다", async () => {
    vi.stubEnv("VITE_API_URL", "https://script.google.com/macros/s/example/exec");
    window.history.replaceState(null, "", "#/exam");
    document.body.innerHTML = '<div id="app"></div>';
    seedSession();

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(envelope(bootstrap("FIRST_TEST")))
      .mockResolvedValueOnce(envelope({ roundId: "round-1", status: "FIRST_TEST" }));

    const root = document.querySelector<HTMLDivElement>("#app") as HTMLDivElement;
    const app = new StudyApp(root);
    await app.start();

    const input = root.querySelector<HTMLInputElement>("#answer") as HTMLInputElement;
    input.focus();
    input.value = "작성 중인 답";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));

    await (app as unknown as { pollStatus(): Promise<void> }).pollStatus();

    expect(root.querySelector("#answer")).toBe(input);
    expect(input.value).toBe("작성 중인 답");
    expect(document.activeElement).toBe(input);
  });

  it("시험 단계가 바뀌면 새 화면을 표시한다", async () => {
    vi.stubEnv("VITE_API_URL", "https://script.google.com/macros/s/example/exec");
    window.history.replaceState(null, "", "#/exam");
    document.body.innerHTML = '<div id="app"></div>';
    seedSession();

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(envelope(bootstrap("WAITING")))
      .mockResolvedValueOnce(envelope({ roundId: "round-1", status: "FIRST_TEST" }))
      .mockResolvedValueOnce(envelope(bootstrap("FIRST_TEST")));

    const root = document.querySelector<HTMLDivElement>("#app") as HTMLDivElement;
    const app = new StudyApp(root);
    await app.start();
    expect(root.textContent).toContain("곧 시험이 시작돼요");

    await (app as unknown as { pollStatus(): Promise<void> }).pollStatus();

    expect(root.textContent).toContain("테스트 문제");
    expect(root.querySelector("#answer")).not.toBeNull();
  });

  it("시험 종료 시 제출 결과를 바로 사용하고 bootstrap을 다시 호출하지 않는다", async () => {
    vi.stubEnv("VITE_API_URL", "https://script.google.com/macros/s/example/exec");
    window.history.replaceState(null, "", "#/exam");
    document.body.innerHTML = '<div id="app"></div>';
    seedSession();
    const result = {
      attempt: 1,
      score: 1,
      total: 1,
      items: [{
        questionId: "q1",
        order: 1,
        question: "테스트 문제",
        response: "정답",
        isCorrect: true,
        answer: "정답",
        description: "해설",
      }],
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(envelope(bootstrap("FIRST_TEST")))
      .mockResolvedValueOnce(envelope({ roundId: "round-1", status: "REVIEW" }))
      .mockResolvedValueOnce(envelope(result));

    const root = document.querySelector<HTMLDivElement>("#app") as HTMLDivElement;
    const app = new StudyApp(root);
    await app.start();
    const input = root.querySelector<HTMLInputElement>("#answer") as HTMLInputElement;
    input.value = "정답";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));

    await (app as unknown as { pollStatus(): Promise<void> }).pollStatus();

    expect(root.textContent).toContain("1 / 1");
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const submitInit = fetchSpy.mock.calls[2][1] as RequestInit;
    expect(JSON.parse(String(submitInit.body)).action).toBe("submitAttempt");
  });

  it("숨겨진 탭에서는 예약된 상태 확인을 중단한다", async () => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_API_URL", "https://script.google.com/macros/s/example/exec");
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    window.history.replaceState(null, "", "#/exam");
    document.body.innerHTML = '<div id="app"></div>';
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(envelope(bootstrap("WAITING")));

    const root = document.querySelector<HTMLDivElement>("#app") as HTMLDivElement;
    const app = new StudyApp(root);
    await app.start();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    (app as unknown as { scheduleStatusPoll(immediate: boolean): void }).scheduleStatusPoll(false);
    await vi.advanceTimersByTimeAsync(30_000);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
