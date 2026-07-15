import { describe, expect, it } from "vitest";
import {
  competitionRanking,
  isAcceptedAnswer,
  nextStatus,
  normalizeAnswer,
  orderRetestQuestions,
  stableShuffle,
} from "../src/domain";
import type { PublicQuestion } from "../src/types";

describe("답안 정규화와 채점", () => {
  it("앞뒤 공백, 연속 공백, 영문 대소문자만 정규화한다", () => {
    expect(normalizeAnswer("  Green   Swan  ")).toBe("green swan");
    expect(normalizeAnswer("호크아이(Hawk-Eye)")).toBe("호크아이(hawk-eye)");
  });

  it("대표 정답과 | 구분 별칭을 정확히 비교한다", () => {
    expect(
      isAcceptedAnswer(
        " hallucination ",
        "할루시네이션 (Hallucination)",
        "할루시네이션 | Hallucination",
      ),
    ).toBe(true);
    expect(isAcceptedAnswer("필터버블", "필터 버블", "필터 버블")).toBe(false);
    expect(isAcceptedAnswer("", "정답", "정답")).toBe(false);
  });
});

describe("랭킹", () => {
  it("동점을 1, 2, 2, 4 경쟁 순위로 계산하고 같은 닉네임을 분리한다", () => {
    const result = competitionRanking([
      { nickname: "민지", score: 17, total: 20 },
      { nickname: "유민", score: 18, total: 20 },
      { nickname: "민지", score: 17, total: 20 },
      { nickname: "서준", score: 15, total: 20 },
    ]);
    expect(result.map((row) => row.rank)).toEqual([1, 2, 2, 4]);
    expect(result.filter((row) => row.nickname === "민지")).toHaveLength(2);
  });
});

describe("재시험 순서", () => {
  const questions: PublicQuestion[] = Array.from({ length: 20 }, (_, index) => ({
    questionId: `q-${index + 1}`,
    order: index + 1,
    question: `문제 ${index + 1}`,
  }));

  it("같은 참가자에게 항상 같은 순서를 만든다", () => {
    expect(stableShuffle(questions, "participant-a")).toEqual(stableShuffle(questions, "participant-a"));
    expect(stableShuffle(questions, "participant-a")).not.toEqual(stableShuffle(questions, "participant-b"));
  });

  it("저장된 순서가 유효하면 그대로 복구한다", () => {
    const stored = questions.map((question) => question.questionId).reverse();
    const result = orderRetestQuestions(questions, "participant-a", stored);
    expect(result.order).toEqual(stored);
    expect(result.questions[0].questionId).toBe("q-20");
  });
});

describe("시험 상태", () => {
  it("정해진 다음 상태만 반환한다", () => {
    expect(nextStatus("WAITING")).toBe("FIRST_TEST");
    expect(nextStatus("RETEST")).toBe("FINISHED");
    expect(nextStatus("FINISHED")).toBeNull();
  });
});
