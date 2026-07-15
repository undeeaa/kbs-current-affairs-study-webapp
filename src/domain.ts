import type { PublicQuestion, RankingRow, RoundStatus } from "./types";

export function normalizeAnswer(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function isAcceptedAnswer(response: string, answer: string, alias: string): boolean {
  const normalizedResponse = normalizeAnswer(response);
  if (!normalizedResponse) return false;
  const accepted = [answer, ...alias.split("|")]
    .map(normalizeAnswer)
    .filter(Boolean);
  return accepted.includes(normalizedResponse);
}

export function competitionRanking(
  rows: Array<{ nickname: string; score: number; total: number }>,
): RankingRow[] {
  const sorted = [...rows].sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname, "ko"));
  let previousScore: number | undefined;
  let previousRank = 0;
  return sorted.map((row, index) => {
    if (row.score !== previousScore) previousRank = index + 1;
    previousScore = row.score;
    return { ...row, rank: previousRank };
  });
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFromSeed(seed: number): () => number {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function stableShuffle<T>(items: readonly T[], seedValue: string): T[] {
  const result = [...items];
  const random = randomFromSeed(hashSeed(seedValue));
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function orderRetestQuestions(
  questions: PublicQuestion[],
  participantId: string,
  storedOrder?: string[],
): { questions: PublicQuestion[]; order: string[] } {
  const ids = new Set(questions.map((question) => question.questionId));
  if (
    storedOrder?.length === questions.length &&
    storedOrder.every((questionId) => ids.has(questionId))
  ) {
    const byId = new Map(questions.map((question) => [question.questionId, question]));
    return {
      questions: storedOrder.map((questionId) => byId.get(questionId) as PublicQuestion),
      order: storedOrder,
    };
  }
  const shuffled = stableShuffle(questions, participantId);
  return { questions: shuffled, order: shuffled.map((question) => question.questionId) };
}

export function shouldResetQuestionIndex(
  previousRoundId: string | undefined,
  previousStatus: RoundStatus | undefined,
  nextRoundId: string | undefined,
  nextStatus: RoundStatus | undefined,
): boolean {
  if (!nextRoundId || !nextStatus) return false;
  if (previousRoundId !== nextRoundId) return true;
  return previousStatus !== nextStatus && (nextStatus === "FIRST_TEST" || nextStatus === "RETEST");
}

export function nextStatus(status: string): string | null {
  const transitions: Record<string, string | null> = {
    WAITING: "FIRST_TEST",
    FIRST_TEST: "REVIEW",
    REVIEW: "RETEST",
    RETEST: "FINISHED",
    FINISHED: null,
  };
  return transitions[status] ?? null;
}
