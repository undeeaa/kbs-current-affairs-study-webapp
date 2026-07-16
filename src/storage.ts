import type { Attempt, ParticipantSession } from "./types";

const PREFIX = "kbs-study:v1";
const ACTIVE_SESSION_KEY = `${PREFIX}:active-session`;

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export class StudyStorage {
  constructor(private readonly storage: Storage = window.localStorage) {}

  private persistSession(session: ParticipantSession): ParticipantSession {
    this.storage.setItem(`${PREFIX}:session:${session.roundId}`, JSON.stringify(session));
    this.storage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
    return session;
  }

  getSession(roundId: string): ParticipantSession | null {
    return parseJson<ParticipantSession>(this.storage.getItem(`${PREFIX}:session:${roundId}`));
  }

  getActiveSession(): ParticipantSession | null {
    const active = parseJson<ParticipantSession>(this.storage.getItem(ACTIVE_SESSION_KEY));
    if (active) return active;
    for (let index = this.storage.length - 1; index >= 0; index -= 1) {
      const key = this.storage.key(index);
      if (!key?.startsWith(`${PREFIX}:session:`)) continue;
      const session = parseJson<ParticipantSession>(this.storage.getItem(key));
      if (session) return this.persistSession(session);
    }
    return null;
  }

  rememberSession(session: ParticipantSession): void {
    this.persistSession(session);
  }

  createSession(roundId: string, nickname: string): ParticipantSession {
    const session = { roundId, participantId: crypto.randomUUID(), nickname: nickname.trim() };
    return this.persistSession(session);
  }

  updateNickname(session: ParticipantSession, nickname: string): ParticipantSession {
    const updated = { ...session, nickname: nickname.trim() };
    return this.persistSession(updated);
  }

  getAnswers(roundId: string, participantId: string, attempt: Attempt): Record<string, string> {
    return (
      parseJson<Record<string, string>>(
        this.storage.getItem(`${PREFIX}:answers:${roundId}:${participantId}:${attempt}`),
      ) ?? {}
    );
  }

  saveAnswer(
    roundId: string,
    participantId: string,
    attempt: Attempt,
    questionId: string,
    response: string,
  ): Record<string, string> {
    const answers = this.getAnswers(roundId, participantId, attempt);
    answers[questionId] = response.slice(0, 200);
    this.storage.setItem(
      `${PREFIX}:answers:${roundId}:${participantId}:${attempt}`,
      JSON.stringify(answers),
    );
    return answers;
  }

  getRetestOrder(roundId: string, participantId: string): string[] | null {
    return parseJson<string[]>(this.storage.getItem(`${PREFIX}:order:${roundId}:${participantId}:2`));
  }

  saveRetestOrder(roundId: string, participantId: string, order: string[]): void {
    this.storage.setItem(`${PREFIX}:order:${roundId}:${participantId}:2`, JSON.stringify(order));
  }

  getSubmissionState(roundId: string, participantId: string, attempt: Attempt): "pending" | "submitted" | null {
    const value = this.storage.getItem(`${PREFIX}:submission:${roundId}:${participantId}:${attempt}`);
    return value === "pending" || value === "submitted" ? value : null;
  }

  setSubmissionState(
    roundId: string,
    participantId: string,
    attempt: Attempt,
    state: "pending" | "submitted",
  ): void {
    this.storage.setItem(`${PREFIX}:submission:${roundId}:${participantId}:${attempt}`, state);
  }
}
