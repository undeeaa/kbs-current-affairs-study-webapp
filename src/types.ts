export type RoundStatus = "WAITING" | "FIRST_TEST" | "REVIEW" | "RETEST" | "FINISHED";
export type Attempt = 1 | 2;

export interface PublicQuestion {
  questionId: string;
  order: number;
  question: string;
}

export interface ReviewItem extends PublicQuestion {
  response: string;
  isCorrect: boolean;
  answer: string;
  description: string;
}

export interface AttemptResult {
  attempt: Attempt;
  score: number;
  total: number;
  items: ReviewItem[];
}

export interface RoundSummary {
  roundId: string;
  title: string;
  status: RoundStatus;
  date: string;
  questionCount: number;
  participantCount?: number;
}

export interface BootstrapData {
  currentRound: RoundSummary | null;
  questions: PublicQuestion[];
  firstResult?: AttemptResult;
  retestResult?: AttemptResult;
  eligibleForRetest: boolean;
}

export interface RankingRow {
  rank: number;
  nickname: string;
  score: number;
  total: number;
}

export interface RoundDetail {
  round: RoundSummary;
  ranking: RankingRow[];
  questions: Array<PublicQuestion & { answer: string; description: string }>;
}

export interface ParticipantSession {
  roundId: string;
  participantId: string;
  nickname: string;
}

export interface SubmitAttemptInput {
  roundId: string;
  participantId: string;
  nickname: string;
  attempt: Attempt;
  answers: Array<{ questionId: string; response: string }>;
}

export interface ApiErrorShape {
  code: string;
  message: string;
  retryable: boolean;
}

export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: ApiErrorShape;
  serverTime: string;
}
