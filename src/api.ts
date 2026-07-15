import type {
  ApiEnvelope,
  Attempt,
  AttemptResult,
  BootstrapData,
  RoundDetail,
  RoundStatus,
  RoundSummary,
  SubmitAttemptInput,
} from "./types";

export class StudyApiError extends Error {
  constructor(
    message: string,
    readonly code = "UNKNOWN",
    readonly retryable = false,
  ) {
    super(message);
  }
}

export class StudyApi {
  constructor(private readonly baseUrl: string) {}

  private ensureConfigured(): void {
    if (!this.baseUrl) {
      throw new StudyApiError("앱 연결 주소가 아직 설정되지 않았어요.", "NOT_CONFIGURED");
    }
  }

  private async parse<T>(response: Response): Promise<T> {
    let envelope: ApiEnvelope<T>;
    try {
      envelope = (await response.json()) as ApiEnvelope<T>;
    } catch {
      throw new StudyApiError("연결 응답을 확인하지 못했어요.", "INVALID_RESPONSE", true);
    }
    if (!envelope.ok || envelope.data === undefined) {
      throw new StudyApiError(
        envelope.error?.message ?? "요청을 처리하지 못했어요.",
        envelope.error?.code,
        envelope.error?.retryable,
      );
    }
    return envelope.data;
  }

  private async get<T>(action: string, params: Record<string, string> = {}): Promise<T> {
    this.ensureConfigured();
    const url = new URL(this.baseUrl);
    url.searchParams.set("action", action);
    url.searchParams.set("ts", String(Date.now()));
    Object.entries(params).forEach(([key, value]) => value && url.searchParams.set(key, value));
    const response = await fetch(url, { cache: "no-store", redirect: "follow" });
    return this.parse<T>(response);
  }

  private async post<T>(action: string, payload: Record<string, unknown>): Promise<T> {
    this.ensureConfigured();
    const response = await fetch(this.baseUrl, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ action, ...payload }),
    });
    return this.parse<T>(response);
  }

  bootstrap(participantId = ""): Promise<BootstrapData> {
    return this.get("bootstrap", { participantId });
  }

  history(): Promise<RoundSummary[]> {
    return this.get("history");
  }

  roundDetail(roundId: string): Promise<RoundDetail> {
    return this.get("roundDetail", { roundId });
  }

  attemptResult(roundId: string, participantId: string, attempt: Attempt): Promise<AttemptResult> {
    return this.get("attemptResult", { roundId, participantId, attempt: String(attempt) });
  }

  submitAttempt(input: SubmitAttemptInput): Promise<AttemptResult> {
    return this.post("submitAttempt", input as unknown as Record<string, unknown>);
  }

  adminLogin(code: string): Promise<{ adminToken: string; expiresAt: string }> {
    return this.post("adminLogin", { code });
  }

  transition(roundId: string, targetStatus: RoundStatus, adminToken: string): Promise<BootstrapData> {
    return this.post("transition", { roundId, targetStatus, adminToken });
  }
}
