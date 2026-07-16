import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudyStorage } from "../src/storage";

describe("브라우저 임시 저장", () => {
  let storage: StudyStorage;

  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(crypto, "randomUUID").mockReturnValue("11111111-1111-4111-8111-111111111111");
    storage = new StudyStorage(localStorage);
  });

  it("회차별 참가자 ID와 닉네임을 복구한다", () => {
    const created = storage.createSession("2026-01", "민지");
    expect(created.participantId).toBe("11111111-1111-4111-8111-111111111111");
    expect(storage.getSession("2026-01")).toEqual(created);
    expect(storage.getActiveSession()).toEqual(created);
    expect(storage.getSession("2026-02")).toBeNull();
  });

  it("기존 세션 키도 최근 참가자 포인터로 한 번만 마이그레이션한다", () => {
    const legacy = { roundId: "2026-01", participantId: "p-12345678", nickname: "민지" };
    localStorage.setItem("kbs-study:v1:session:2026-01", JSON.stringify(legacy));
    expect(storage.getActiveSession()).toEqual(legacy);
    expect(JSON.parse(String(localStorage.getItem("kbs-study:v1:active-session")))).toEqual(legacy);
  });

  it("차수별 답안과 제출 상태를 분리한다", () => {
    storage.saveAnswer("2026-01", "p-12345678", 1, "q1", "첫 답");
    storage.saveAnswer("2026-01", "p-12345678", 2, "q1", "두 번째 답");
    storage.setSubmissionState("2026-01", "p-12345678", 1, "pending");
    expect(storage.getAnswers("2026-01", "p-12345678", 1).q1).toBe("첫 답");
    expect(storage.getAnswers("2026-01", "p-12345678", 2).q1).toBe("두 번째 답");
    expect(storage.getSubmissionState("2026-01", "p-12345678", 1)).toBe("pending");
  });

  it("답안을 200자로 제한한다", () => {
    storage.saveAnswer("2026-01", "p-12345678", 1, "q1", "가".repeat(250));
    expect(storage.getAnswers("2026-01", "p-12345678", 1).q1).toHaveLength(200);
  });
});
