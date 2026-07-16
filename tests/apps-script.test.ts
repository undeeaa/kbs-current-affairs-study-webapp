import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { beforeEach, describe, expect, it } from "vitest";

interface GasContext {
  KBS_normalizeAnswer(value: unknown): string;
  KBS_isAccepted(response: string, answer: string, alias: string): boolean;
  KBS_escapeSheetText(value: string): string;
  KBS_unescapeSheetText(value: string): string;
  KBS_constantTimeEqual(left: string, right: string): boolean;
  KBS_nextRoundCandidates(
    questionRows: Array<Record<string, unknown>>,
    linkRows: Array<Record<string, unknown>>,
  ): Array<Record<string, unknown>>;
  KBS_ranking(roundId: string, total: number): Array<{ rank: number; nickname: string; score: number }>;
  KBS_responses(): { rows: Array<Record<string, unknown>> };
  KBS_currentRound(): Record<string, unknown> | null;
  KBS_status(): { roundId: string | null; status: string | null };
}

describe("Apps Script 핵심 규칙", () => {
  let gas: GasContext;

  beforeEach(() => {
    const source = readFileSync(resolve("apps-script/StudyWebApp.gs"), "utf8");
    const context: Record<string, unknown> = { console };
    runInNewContext(source, context, { filename: "StudyWebApp.gs" });
    gas = context as unknown as GasContext;
  });

  it("운영 백엔드에서도 명세와 같은 답안 정규화를 사용한다", () => {
    expect(gas.KBS_normalizeAnswer("  Green   Swan ")).toBe("green swan");
    expect(gas.KBS_isAccepted("Hallucination", "할루시네이션", "할루시네이션 | Hallucination")).toBe(true);
    expect(gas.KBS_isAccepted("필터버블", "필터 버블", "필터 버블")).toBe(false);
  });

  it("사용자 입력이 Sheet 수식으로 실행되지 않도록 이스케이프한다", () => {
    expect(gas.KBS_escapeSheetText("=IMPORTXML(...)")) .toBe("'=IMPORTXML(...)");
    expect(gas.KBS_unescapeSheetText("'=IMPORTXML(...)")) .toBe("=IMPORTXML(...)");
    expect(gas.KBS_escapeSheetText("일반 답안")).toBe("일반 답안");
  });

  it("중복 닉네임을 참가자 ID별로 분리하고 경쟁 순위를 계산한다", () => {
    const makeRows = (participantId: string, nickname: string, correctCount: number) =>
      Array.from({ length: 20 }, (_, index) => ({
        roundId: "round-1",
        participantId,
        nickname,
        attempt: 1,
        questionId: `q-${index + 1}`,
        isCorrect: index < correctCount,
      }));
    gas.KBS_responses = () => ({
      rows: [
        ...makeRows("p-11111111", "민지", 18),
        ...makeRows("p-22222222", "민지", 17),
        ...makeRows("p-33333333", "서준", 17),
        ...makeRows("p-44444444", "유민", 15),
      ],
    });
    const ranking = gas.KBS_ranking("round-1", 20);
    expect(ranking.map((row) => row.rank)).toEqual([1, 2, 2, 4]);
    expect(ranking.filter((row) => row.nickname === "민지")).toHaveLength(2);
  });

  it("관리자 서명 비교를 전체 문자열 기준으로 수행한다", () => {
    expect(gas.KBS_constantTimeEqual("same", "same")).toBe(true);
    expect(gas.KBS_constantTimeEqual("same", "diff")).toBe(false);
    expect(gas.KBS_constantTimeEqual("short", "longer")).toBe(false);
  });

  it("다음 회차에는 이전에 쓰지 않은 유효한 문제만 시트 순서대로 고른다", () => {
    const candidates = gas.KBS_nextRoundCandidates([
      { id: "used", question: "사용한 문제", answer: "정답" },
      { id: "next-1", question: "다음 문제 1", answer: "정답" },
      { id: "invalid", question: "정답이 없는 문제", answer: "" },
      { id: "next-2", question: "다음 문제 2", answer: "정답" },
    ], [{ roundId: "round-1", questionId: "used", order: 1 }]);
    expect(candidates.map((row) => row.id)).toEqual(["next-1", "next-2"]);
  });

  it("상태 조회에는 회차 ID와 단계만 포함한다", () => {
    gas.KBS_currentRound = () => ({ roundId: "round-1", status: "FIRST_TEST", title: "시험" });
    expect(gas.KBS_status()).toEqual({ roundId: "round-1", status: "FIRST_TEST" });
    gas.KBS_currentRound = () => null;
    expect(gas.KBS_status()).toEqual({ roundId: null, status: null });
  });
});
