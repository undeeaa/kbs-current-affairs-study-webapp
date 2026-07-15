import { StudyApi, StudyApiError } from "./api";
import { nextStatus, orderRetestQuestions, shouldResetQuestionIndex } from "./domain";
import { StudyStorage } from "./storage";
import type {
  Attempt,
  AttemptResult,
  BootstrapData,
  ParticipantSession,
  PublicQuestion,
  RoundDetail,
  RoundStatus,
  RoundSummary,
} from "./types";

const POLL_INTERVAL_MS = 4_000;
const SLOW_REQUEST_MS = 1_200;
const ADMIN_TOKEN_KEY = "kbs-study:admin-token";

type PendingAction = "nickname" | "admin-login" | "transition" | "retry-submit" | "next-round";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function routeParts(): string[] {
  return (window.location.hash || "#/exam").replace(/^#\/?/, "").split("/").filter(Boolean);
}

function phaseLabel(status: RoundStatus): string {
  return {
    WAITING: "시험 준비",
    FIRST_TEST: "1차 시험",
    REVIEW: "정답 확인",
    RETEST: "재시험",
    FINISHED: "시험 완료",
  }[status];
}

export class StudyApp {
  private readonly api = new StudyApi(import.meta.env.VITE_API_URL?.trim() ?? "");
  private readonly storage = new StudyStorage();
  private bootstrapData: BootstrapData | null = null;
  private historyData: RoundSummary[] = [];
  private detailData: RoundDetail | null = null;
  private session: ParticipantSession | null = null;
  private loading = true;
  private refreshing = false;
  private message = "";
  private currentQuestionIndex = 0;
  private editingNickname = false;
  private submittingAttempt: Attempt | null = null;
  private retryTimer: number | null = null;
  private pollTimer: number | null = null;
  private retryDelayIndex = 0;
  private openExplanations = new Set<string>();
  private pendingTransition: RoundStatus | null = null;
  private pendingAction: PendingAction | null = null;
  private pendingNickname = "";
  private pendingRoundTitle = "";
  private slowRequest = false;
  private slowBackgroundRefresh = false;
  private slowRequestTimer: number | null = null;
  private slowBackgroundTimer: number | null = null;

  constructor(private readonly root: HTMLDivElement) {}

  async start(): Promise<void> {
    window.addEventListener("hashchange", () => void this.loadRoute());
    window.addEventListener("online", () => void this.loadRoute(true));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void this.loadRoute(true);
    });
    this.root.addEventListener("click", (event) => void this.handleClick(event));
    this.root.addEventListener("submit", (event) => void this.handleSubmit(event));
    this.root.addEventListener("input", (event) => this.handleInput(event));
    this.root.addEventListener("change", (event) => this.handleChange(event));
    await this.loadRoute();
  }

  private async loadRoute(background = false): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    if (!background) {
      this.loading = true;
      this.armSlowRequestTimer();
      this.render();
    } else if (!this.pendingAction) {
      this.armSlowBackgroundTimer();
    }
    this.clearPolling();
    try {
      const [route, id] = routeParts();
      if (!route || route === "exam") {
        await this.loadExam();
        this.startPolling();
      } else if (route === "history" && id) {
        this.detailData = await this.api.roundDetail(id);
      } else if (route === "history") {
        this.historyData = await this.api.history();
      } else if (route === "admin") {
        await this.loadExam(false);
        this.startPolling();
      } else {
        window.location.hash = "#/exam";
      }
      if (background) this.message = "";
    } catch (error) {
      this.message = this.friendlyError(error);
    } finally {
      this.loading = false;
      this.refreshing = false;
      if (!background) this.clearSlowRequestTimer();
      this.clearSlowBackgroundTimer();
      this.render();
    }
  }

  private async loadExam(allowAutoSubmit = true): Promise<void> {
    const previousRound = this.bootstrapData?.currentRound;
    const knownSession = this.session ?? (
      previousRound ? this.storage.getSession(previousRound.roundId) : null
    );
    const initial = await this.api.bootstrap(knownSession?.participantId);
    const roundId = initial.currentRound?.roundId;
    this.session = roundId ? this.storage.getSession(roundId) : null;
    this.bootstrapData = this.session && this.session.participantId !== knownSession?.participantId
      ? await this.api.bootstrap(this.session.participantId)
      : initial;
    if (shouldResetQuestionIndex(
      previousRound?.roundId,
      previousRound?.status,
      this.bootstrapData.currentRound?.roundId,
      this.bootstrapData.currentRound?.status,
    )) {
      this.currentQuestionIndex = 0;
    }
    if (allowAutoSubmit) await this.handlePhaseSubmission();
  }

  private armSlowRequestTimer(): void {
    this.clearSlowRequestTimer();
    this.slowRequest = false;
    this.slowRequestTimer = window.setTimeout(() => {
      this.slowRequest = true;
      this.render();
    }, SLOW_REQUEST_MS);
  }

  private clearSlowRequestTimer(): void {
    if (this.slowRequestTimer !== null) window.clearTimeout(this.slowRequestTimer);
    this.slowRequestTimer = null;
    this.slowRequest = false;
  }

  private armSlowBackgroundTimer(): void {
    this.clearSlowBackgroundTimer();
    this.slowBackgroundTimer = window.setTimeout(() => {
      this.slowBackgroundRefresh = true;
      this.updateConnectionFeedback();
    }, SLOW_REQUEST_MS);
  }

  private clearSlowBackgroundTimer(): void {
    if (this.slowBackgroundTimer !== null) window.clearTimeout(this.slowBackgroundTimer);
    this.slowBackgroundTimer = null;
    this.slowBackgroundRefresh = false;
    this.updateConnectionFeedback();
  }

  private beginAction(action: PendingAction): boolean {
    if (this.pendingAction) return false;
    this.pendingAction = action;
    this.armSlowRequestTimer();
    this.render();
    return true;
  }

  private finishAction(): void {
    const completedAction = this.pendingAction;
    this.pendingAction = null;
    if (completedAction === "nickname") this.pendingNickname = "";
    if (completedAction === "next-round") this.pendingRoundTitle = "";
    this.clearSlowRequestTimer();
    this.render();
  }

  private async handlePhaseSubmission(): Promise<void> {
    const data = this.bootstrapData;
    const round = data?.currentRound;
    if (!data || !round || !this.session) return;

    if (round.status === "REVIEW") {
      await this.ensureSubmitted(1);
    } else if (round.status === "FINISHED" && data.eligibleForRetest) {
      await this.ensureSubmitted(2);
    }
  }

  private async ensureSubmitted(attempt: Attempt): Promise<void> {
    if (!this.session || !this.bootstrapData?.currentRound) return;
    const { roundId } = this.bootstrapData.currentRound;
    if (this.storage.getSubmissionState(roundId, this.session.participantId, attempt) === "submitted") {
      return;
    }
    this.storage.setSubmissionState(roundId, this.session.participantId, attempt, "pending");
    this.submittingAttempt = attempt;
    this.render();
    try {
      const answers = this.storage.getAnswers(roundId, this.session.participantId, attempt);
      await this.api.submitAttempt({
        roundId,
        participantId: this.session.participantId,
        nickname: this.session.nickname,
        attempt,
        answers: Object.entries(answers).map(([questionId, response]) => ({ questionId, response })),
      });
      this.storage.setSubmissionState(roundId, this.session.participantId, attempt, "submitted");
      this.retryDelayIndex = 0;
      this.message = "";
      this.bootstrapData = await this.api.bootstrap(this.session.participantId);
    } catch (error) {
      this.message = this.friendlyError(error, "답안을 아직 보내지 못했어요. 연결되는 대로 다시 제출할게요.");
      this.scheduleRetry();
    } finally {
      this.submittingAttempt = null;
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    const delays = [5_000, 10_000, 20_000, 30_000];
    const delay = delays[Math.min(this.retryDelayIndex, delays.length - 1)];
    this.retryDelayIndex += 1;
    this.retryTimer = window.setTimeout(() => void this.loadRoute(true), delay);
  }

  private startPolling(): void {
    this.pollTimer = window.setInterval(() => void this.loadRoute(true), POLL_INTERVAL_MS);
  }

  private clearPolling(): void {
    if (this.pollTimer !== null) window.clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private friendlyError(error: unknown, fallback = "연결이 잠시 불안정해요. 잠시 후 다시 시도해볼게요."): string {
    if (error instanceof StudyApiError) return error.message || fallback;
    return fallback;
  }

  private render(): void {
    const [route, id] = routeParts();
    const isExamActive =
      (route === "exam" || !route) &&
      ["FIRST_TEST", "RETEST"].includes(this.bootstrapData?.currentRound?.status ?? "");
    const content = this.loading
      ? this.renderLoading()
      : route === "history" && id
        ? this.renderRoundDetail()
        : route === "history"
          ? this.renderHistory()
          : route === "admin"
            ? this.renderAdmin()
            : this.renderExam();

    this.root.innerHTML = `
      ${isExamActive ? "" : this.renderNavigation(route || "exam")}
      <main id="main" class="page ${isExamActive ? "page--quiz" : ""}" tabindex="-1">
        ${this.message ? `<div class="notice" role="status">${escapeHtml(this.message)}</div>` : ""}
        ${this.renderRequestFeedback()}
        ${content}
      </main>
      <div class="connection-feedback" role="status" aria-live="polite" hidden></div>
    `;

    this.syncIndeterminateCheckbox();
    this.updateConnectionFeedback();
  }

  private renderRequestFeedback(): string {
    if (!this.slowRequest || (this.loading && !this.pendingAction)) return "";
    const copy = this.pendingAction === "transition"
      ? "시험 단계를 바꾸는 데 시간이 조금 걸리고 있어요. 완료될 때까지 그대로 기다려주세요."
      : this.pendingAction === "admin-login"
        ? "관리자 권한을 확인하고 있어요. Apps Script 응답이 평소보다 조금 늦어요."
        : this.pendingAction === "nickname"
          ? "참가 정보를 저장하고 있어요. Apps Script 응답이 평소보다 조금 늦어요."
          : this.pendingAction === "retry-submit"
            ? "답안을 다시 보내고 있어요. 입력한 답은 이 기기에 안전하게 남아 있어요."
            : this.pendingAction === "next-round"
              ? "다음 회차와 문제 20개를 준비하고 있어요. Apps Script 응답을 기다려주세요."
            : "시험 데이터를 불러오는 데 시간이 조금 걸리고 있어요. 연결은 유지되고 있습니다.";
    return `<div class="request-feedback" role="status"><span class="spinner" aria-hidden="true"></span><span>${copy}</span></div>`;
  }

  private updateConnectionFeedback(): void {
    const feedback = this.root.querySelector<HTMLElement>(".connection-feedback");
    if (!feedback) return;
    feedback.hidden = !this.slowBackgroundRefresh;
    feedback.textContent = this.slowBackgroundRefresh
      ? "최신 시험 상태 확인이 늦어지고 있어요. 입력한 답은 이 기기에 계속 저장됩니다."
      : "";
  }

  private renderNavigation(route: string): string {
    const item = (href: string, label: string, active: boolean) =>
      `<a href="${href}" class="nav__link ${active ? "is-active" : ""}">${label}</a>`;
    return `
      <header class="site-header">
        <a class="brand" href="#/exam">KBS 시사상식</a>
        <nav class="nav" aria-label="주요 메뉴">
          ${item("#/exam", "시험", route === "exam")}
          ${item("#/history", "지난 회차", route === "history")}
          ${item("#/admin", "관리", route === "admin")}
        </nav>
      </header>
    `;
  }

  private renderLoading(): string {
    return `
      <section class="status-screen" aria-live="polite">
        <span class="pulse-dot" aria-hidden="true"></span>
        <h1>시험 상태를 확인하고 있어요</h1>
      </section>
    `;
  }

  private renderExam(): string {
    const data = this.bootstrapData;
    const round = data?.currentRound;
    if (!data || !round) {
      return this.renderEmpty("지금 진행 중인 시험이 없어요", "다음 시험이 시작되면 여기에서 바로 참여할 수 있어요.");
    }

    if (!this.session || this.editingNickname) {
      if (["WAITING", "FIRST_TEST"].includes(round.status)) return this.renderNickname(round);
      if (round.status === "FINISHED") return this.renderFinished(round, data);
      return this.renderEmpty("이미 시험이 진행 중이에요", "다음 회차가 시작되면 닉네임을 입력하고 참여할 수 있어요.");
    }

    switch (round.status) {
      case "WAITING":
        return this.renderWaiting(round);
      case "FIRST_TEST":
        return this.renderQuiz(round, data.questions, 1);
      case "REVIEW":
        return this.renderReview(round, data.firstResult);
      case "RETEST":
        if (!data.eligibleForRetest) {
          return this.renderEmpty("재시험에 참여할 수 없어요", "1차 시험 제출 기록을 찾지 못했어요.");
        }
        return this.renderQuiz(round, data.questions, 2);
      case "FINISHED":
        return this.renderFinished(round, data);
    }
  }

  private renderNickname(round: RoundSummary): string {
    const busy = this.pendingAction === "nickname";
    return `
      <section class="narrow-panel">
        <p class="eyebrow">${escapeHtml(round.title)}</p>
        <h1>오늘 시험에 참여할 이름을 알려주세요</h1>
        <p class="lead">시험 결과와 랭킹에 이 이름으로 표시돼요. 같은 이름도 괜찮아요.</p>
        <form class="stack" data-form="nickname">
          <label class="field-label" for="nickname">닉네임</label>
          <input id="nickname" name="nickname" maxlength="20" autocomplete="nickname" required ${busy ? "disabled" : ""}
            value="${escapeHtml(this.pendingNickname || this.session?.nickname || "")}" placeholder="닉네임을 입력해요" />
          <button class="button button--primary" type="submit" ${busy ? "disabled" : ""}>${busy ? '<span class="spinner" aria-hidden="true"></span> 저장하고 있어요' : "시험 준비하기"}</button>
        </form>
      </section>
    `;
  }

  private renderWaiting(round: RoundSummary): string {
    return `
      <section class="status-screen">
        <p class="eyebrow">${escapeHtml(round.title)}</p>
        <span class="pulse-dot" aria-hidden="true"></span>
        <h1>곧 시험이 시작돼요</h1>
        <p>시작 안내가 나오면 바로 문제를 풀 수 있어요.</p>
        <p class="status-meta">${escapeHtml(this.session?.nickname)} · 시험 시작을 기다리고 있어요</p>
        <button class="button button--text" data-action="edit-nickname" type="button">이름 바꾸기</button>
      </section>
    `;
  }

  private getOrderedQuestions(questions: PublicQuestion[], attempt: Attempt): PublicQuestion[] {
    if (attempt === 1 || !this.session || !this.bootstrapData?.currentRound) {
      return [...questions].sort((a, b) => a.order - b.order);
    }
    const roundId = this.bootstrapData.currentRound.roundId;
    const stored = this.storage.getRetestOrder(roundId, this.session.participantId) ?? undefined;
    const ordered = orderRetestQuestions(questions, this.session.participantId, stored);
    this.storage.saveRetestOrder(roundId, this.session.participantId, ordered.order);
    return ordered.questions;
  }

  private renderQuiz(round: RoundSummary, questions: PublicQuestion[], attempt: Attempt): string {
    if (!this.session) return "";
    const ordered = this.getOrderedQuestions(questions, attempt);
    if (!ordered.length) return this.renderEmpty("문제를 불러오지 못했어요", "잠시 후 다시 확인해주세요.");
    this.currentQuestionIndex = Math.min(this.currentQuestionIndex, ordered.length - 1);
    const question = ordered[this.currentQuestionIndex];
    const answers = this.storage.getAnswers(round.roundId, this.session.participantId, attempt);
    const label = attempt === 1 ? "1차 시험" : "재시험";
    return `
      <section class="quiz" aria-labelledby="quiz-title">
        <header class="quiz__header">
          <div>
            <p class="eyebrow">${escapeHtml(round.title)}</p>
            <h1 id="quiz-title" class="quiz__title">${label}</h1>
          </div>
          <p class="quiz__progress" aria-live="polite">${this.currentQuestionIndex + 1} / ${ordered.length}</p>
        </header>
        <div class="progress-track" aria-hidden="true"><span style="width:${((this.currentQuestionIndex + 1) / ordered.length) * 100}%"></span></div>
        <article class="question" data-question-id="${escapeHtml(question.questionId)}">
          <p class="question__number">${String(this.currentQuestionIndex + 1).padStart(2, "0")}</p>
          <h2 class="question__text">${escapeHtml(question.question)}</h2>
          <label class="field-label" for="answer">내 답</label>
          <input id="answer" class="answer-input" data-answer="${escapeHtml(question.questionId)}" maxlength="200"
            autocomplete="off" value="${escapeHtml(answers[question.questionId] ?? "")}" placeholder="답을 입력해요" />
        </article>
        <footer class="quiz-actions">
          <button class="button button--secondary" data-action="previous-question" type="button" ${this.currentQuestionIndex === 0 ? "disabled" : ""}>이전</button>
          <button class="button button--primary" data-action="next-question" type="button" ${this.currentQuestionIndex === ordered.length - 1 ? "disabled" : ""}>다음</button>
        </footer>
        <p class="quiet-copy">시험이 끝나면 지금 적힌 답이 자동으로 제출돼요.</p>
      </section>
    `;
  }

  private renderReview(round: RoundSummary, result?: AttemptResult): string {
    if (this.submittingAttempt === 1 || !result) {
      return `
        <section class="status-screen">
          <p class="eyebrow">${escapeHtml(round.title)}</p>
          <span class="pulse-dot" aria-hidden="true"></span>
          <h1>답안을 제출하고 있어요</h1>
          <p>잠시만 기다려주세요.</p>
          ${this.message ? '<button class="button button--secondary" data-action="retry-submit" type="button">다시 제출해요</button>' : ""}
        </section>
      `;
    }
    return `
      <section class="review">
        <p class="eyebrow">${escapeHtml(round.title)} · 1차 시험 결과</p>
        <h1 class="score">${result.score} <span>/ ${result.total}</span></h1>
        <p class="lead">틀린 문제부터 천천히 다시 확인해보세요.</p>
        <div class="review-list">${result.items.map((item, index) => this.renderReviewItem(item, index)).join("")}</div>
      </section>
    `;
  }

  private renderReviewItem(item: AttemptResult["items"][number], index: number): string {
    return `
      <article class="review-item">
        <p class="question__number">${String(index + 1).padStart(2, "0")}</p>
        <h2>${escapeHtml(item.question)}</h2>
        <div class="answer-grid">
          <div><p class="data-label">내 답</p><p>${escapeHtml(item.response || "미응답")}</p></div>
          <div><p class="data-label">결과</p><p class="${item.isCorrect ? "correct" : "needs-review"}">${item.isCorrect ? "정답이에요" : "다시 확인해볼 문제예요"}</p></div>
        </div>
        <div class="explanation">
          <p class="data-label">정답</p><p>${escapeHtml(item.answer)}</p>
          ${item.description ? `<p class="data-label">해설</p><p>${escapeHtml(item.description)}</p>` : ""}
        </div>
      </article>
    `;
  }

  private renderFinished(round: RoundSummary, data: BootstrapData): string {
    const first = data.firstResult;
    const retest = data.retestResult;
    const improvement = first && retest ? retest.score - first.score : 0;
    return `
      <section class="status-screen finished">
        <p class="eyebrow">${escapeHtml(round.title)}</p>
        <h1>오늘 시험이 모두 끝났어요</h1>
        ${first ? `<div class="result-line"><span>1차 시험</span><strong>${first.score} / ${first.total}</strong></div>` : ""}
        ${retest ? `<div class="result-line"><span>재시험</span><strong>${retest.score} / ${retest.total}</strong></div>` : ""}
        ${improvement > 0 ? `<p class="accent-copy">처음보다 ${improvement}문제를 더 맞혔어요.</p>` : ""}
        ${this.submittingAttempt === 2 ? '<p class="status-meta">재시험 답안을 제출하고 있어요.</p>' : ""}
        <a class="button button--primary" href="#/history/${encodeURIComponent(round.roundId)}">지난 회차 보기</a>
      </section>
    `;
  }

  private renderHistory(): string {
    if (!this.historyData.length) return this.renderEmpty("아직 지난 시험이 없어요", "첫 시험이 끝나면 문제와 결과를 여기에서 볼 수 있어요.");
    return `
      <section class="content-list">
        <header class="page-heading"><p class="eyebrow">ARCHIVE</p><h1>지난 회차</h1></header>
        <div class="round-list">
          ${this.historyData.map((round) => `
            <a class="round-row" href="#/history/${encodeURIComponent(round.roundId)}">
              <strong>${escapeHtml(round.title)}</strong>
              <span>${escapeHtml(formatDate(round.date))}</span>
              <span>${round.questionCount}문제${round.participantCount === undefined ? "" : ` · ${round.participantCount}명`}</span>
            </a>
          `).join("")}
        </div>
      </section>
    `;
  }

  private renderRoundDetail(): string {
    const detail = this.detailData;
    if (!detail) return this.renderEmpty("이 시험을 찾을 수 없어요", "지난 회차 목록에서 다시 선택해주세요.");
    const allOpen = detail.questions.length > 0 && this.openExplanations.size === detail.questions.length;
    return `
      <section class="detail">
        <a class="back-link" href="#/history">← 지난 회차</a>
        <header class="page-heading">
          <p class="eyebrow">${escapeHtml(formatDate(detail.round.date))} · ${detail.round.questionCount}문제</p>
          <h1>${escapeHtml(detail.round.title)}</h1>
        </header>
        <section class="ranking" aria-labelledby="ranking-title">
          <h2 id="ranking-title">1차 시험 랭킹</h2>
          <div class="ranking-table" role="table" aria-label="1차 시험 랭킹">
            <div class="ranking-row ranking-row--header" role="row"><span>순위</span><span>점수</span><span>닉네임</span></div>
            ${detail.ranking.map((row) => `<div class="ranking-row" role="row"><strong class="${row.rank === 1 ? "rank-first" : ""}">${row.rank}</strong><span>${row.score} / ${row.total}</span><span>${escapeHtml(row.nickname)}</span></div>`).join("")}
          </div>
        </section>
        <section class="archive-questions" aria-labelledby="questions-title">
          <div class="section-heading">
            <h2 id="questions-title">문제 ${detail.questions.length}개</h2>
            <label class="check-label"><input type="checkbox" data-action="toggle-all" ${allOpen ? "checked" : ""} /> 전체 정답·해설 보기</label>
          </div>
          ${detail.questions.map((question, index) => {
            const open = this.openExplanations.has(question.questionId);
            return `<article class="archive-question">
              <p class="question__number">${String(index + 1).padStart(2, "0")}</p>
              <h3>${escapeHtml(question.question)}</h3>
              <label class="check-label"><input type="checkbox" data-explanation="${escapeHtml(question.questionId)}" ${open ? "checked" : ""} /> 정답·해설 보기</label>
              ${open ? `<div class="explanation"><p class="data-label">정답</p><p>${escapeHtml(question.answer)}</p>${question.description ? `<p class="data-label">해설</p><p>${escapeHtml(question.description)}</p>` : ""}</div>` : ""}
            </article>`;
          }).join("")}
        </section>
      </section>
    `;
  }

  private renderAdmin(): string {
    const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (!token) {
      const busy = this.pendingAction === "admin-login";
      return `
        <section class="narrow-panel">
          <p class="eyebrow">ADMIN</p><h1>시험 관리</h1>
          <p class="lead">관리자 코드를 입력해주세요.</p>
          <form class="stack" data-form="admin-login">
            <label class="field-label" for="admin-code">관리자 코드</label>
            <input id="admin-code" name="code" type="password" autocomplete="current-password" required ${busy ? "disabled" : ""} />
            <button class="button button--primary" type="submit" ${busy ? "disabled" : ""}>${busy ? '<span class="spinner" aria-hidden="true"></span> 확인하고 있어요' : "관리 화면 열기"}</button>
          </form>
        </section>
      `;
    }
    const round = this.bootstrapData?.currentRound;
    if (!round) return this.renderEmpty("관리할 회차가 없어요", "시트에서 새 회차를 준비해주세요.");
    const target = nextStatus(round.status) as RoundStatus | null;
    const adminBusy = this.pendingAction === "transition" || this.pendingAction === "next-round";
    const actionLabel: Record<RoundStatus, string> = {
      WAITING: "1차 시험 시작",
      FIRST_TEST: "1차 시험 종료",
      REVIEW: "재시험 시작",
      RETEST: "재시험 종료",
      FINISHED: "",
    };
    return `
      <section class="narrow-panel admin-panel">
        <p class="eyebrow">현재 회차</p>
        <h1>${escapeHtml(round.title)}</h1>
        <p class="lead">현재 ${phaseLabel(round.status)} 단계예요.</p>
        ${target ? `<button class="button button--primary" data-action="prepare-transition" data-target="${target}" type="button" ${adminBusy ? "disabled" : ""}>${this.pendingAction === "transition" ? '<span class="spinner" aria-hidden="true"></span> 변경하고 있어요' : actionLabel[round.status]}</button>` : this.renderNextRoundForm()}
        <button class="button button--text" data-action="admin-logout" type="button" ${adminBusy ? "disabled" : ""}>관리 화면 닫기</button>
        ${this.pendingTransition ? this.renderTransitionConfirm(round, this.pendingTransition) : ""}
      </section>
    `;
  }

  private renderNextRoundForm(): string {
    const busy = this.pendingAction === "next-round";
    const suggestedTitle = `${formatDate(new Date().toISOString())} 시사상식 시험`;
    return `
      <form class="stack next-round-panel" data-form="next-round">
        <div>
          <h2>다음 회차를 준비할까요?</h2>
          <p>아직 출제하지 않은 문제 중 20개를 시트 순서대로 구성해요.</p>
        </div>
        <label class="field-label" for="next-round-title">회차 제목</label>
        <input id="next-round-title" name="title" maxlength="80" required ${busy ? "disabled" : ""}
          value="${escapeHtml(this.pendingRoundTitle || suggestedTitle)}" />
        <button class="button button--primary" type="submit" ${busy ? "disabled" : ""}>${busy ? '<span class="spinner" aria-hidden="true"></span> 준비하고 있어요' : "다음 회차 준비하기"}</button>
      </form>
    `;
  }

  private renderTransitionConfirm(round: RoundSummary, target: RoundStatus): string {
    const ending = target === "REVIEW" || target === "FINISHED";
    const busy = this.pendingAction === "transition";
    return `
      <div class="confirm-panel" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">${ending ? `${phaseLabel(round.status)}을 끝낼까요?` : `${phaseLabel(target)}을 시작할까요?`}</h2>
        <p>${ending ? "모든 참가자의 현재 입력을 잠그고 답안을 제출해요." : "참가자 화면이 다음 단계로 바뀌어요."}</p>
        <div class="confirm-actions">
          <button class="button button--secondary" data-action="cancel-transition" type="button" ${busy ? "disabled" : ""}>계속 진행해요</button>
          <button class="button button--primary" data-action="confirm-transition" data-target="${target}" type="button" ${busy ? "disabled" : ""}>${busy ? '<span class="spinner" aria-hidden="true"></span> 처리하고 있어요' : ending ? "시험을 끝내요" : "시작해요"}</button>
        </div>
      </div>
    `;
  }

  private renderEmpty(title: string, description: string): string {
    return `<section class="status-screen"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></section>`;
  }

  private async handleClick(event: Event): Promise<void> {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    if (action === "edit-nickname") {
      this.editingNickname = true;
      this.render();
    } else if (action === "previous-question") {
      this.currentQuestionIndex = Math.max(0, this.currentQuestionIndex - 1);
      this.renderAndFocusAnswer();
    } else if (action === "next-question") {
      this.currentQuestionIndex += 1;
      this.renderAndFocusAnswer();
    } else if (action === "retry-submit") {
      if (!this.beginAction("retry-submit")) return;
      try {
        await this.handlePhaseSubmission();
      } finally {
        this.finishAction();
      }
    } else if (action === "prepare-transition") {
      this.pendingTransition = target.dataset.target as RoundStatus;
      this.render();
    } else if (action === "cancel-transition") {
      this.pendingTransition = null;
      this.render();
    } else if (action === "confirm-transition") {
      if (!this.beginAction("transition")) return;
      try {
        await this.performTransition(target.dataset.target as RoundStatus);
      } finally {
        this.finishAction();
      }
    } else if (action === "admin-logout") {
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
      this.pendingTransition = null;
      this.render();
    }
  }

  private async handleSubmit(event: SubmitEvent): Promise<void> {
    const form = event.target as HTMLFormElement;
    if (!form.dataset.form) return;
    event.preventDefault();
    const formData = new FormData(form);
    if (form.dataset.form === "nickname") {
      const nickname = String(formData.get("nickname") ?? "").trim();
      if (!nickname || nickname.length > 20 || !this.bootstrapData?.currentRound) return;
      this.pendingNickname = nickname;
      if (!this.beginAction("nickname")) {
        this.pendingNickname = "";
        return;
      }
      try {
        this.session = this.session
          ? this.storage.updateNickname(this.session, nickname)
          : this.storage.createSession(this.bootstrapData.currentRound.roundId, nickname);
        this.editingNickname = false;
        await this.loadRoute(true);
      } finally {
        this.finishAction();
      }
    } else if (form.dataset.form === "admin-login") {
      const code = String(formData.get("code") ?? "");
      if (!this.beginAction("admin-login")) return;
      try {
        const result = await this.api.adminLogin(code);
        sessionStorage.setItem(ADMIN_TOKEN_KEY, result.adminToken);
        this.message = "";
      } catch (error) {
        this.message = this.friendlyError(error, "관리자 코드를 확인해주세요.");
      } finally {
        this.finishAction();
      }
    } else if (form.dataset.form === "next-round") {
      const title = String(formData.get("title") ?? "").trim();
      const adminToken = sessionStorage.getItem(ADMIN_TOKEN_KEY);
      if (!title || title.length > 80 || !adminToken) return;
      this.pendingRoundTitle = title;
      if (!this.beginAction("next-round")) {
        this.pendingRoundTitle = "";
        return;
      }
      try {
        this.bootstrapData = await this.api.createNextRound(title, adminToken);
        this.session = null;
        this.currentQuestionIndex = 0;
        this.pendingTransition = null;
        this.message = "다음 회차가 준비됐어요. 참가자가 대기한 뒤 1차 시험을 시작해주세요.";
      } catch (error) {
        const apiError = error as StudyApiError;
        if (apiError.code === "ADMIN_TOKEN_INVALID" || apiError.code === "ADMIN_TOKEN_EXPIRED") {
          sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        }
        this.message = this.friendlyError(error);
      } finally {
        this.finishAction();
      }
    }
  }

  private handleInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const questionId = input.dataset.answer;
    const round = this.bootstrapData?.currentRound;
    if (!questionId || !round || !this.session) return;
    const attempt: Attempt = round.status === "RETEST" ? 2 : 1;
    this.storage.saveAnswer(round.roundId, this.session.participantId, attempt, questionId, input.value);
  }

  private handleChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.dataset.action === "toggle-all" && this.detailData) {
      this.openExplanations = input.checked
        ? new Set(this.detailData.questions.map((question) => question.questionId))
        : new Set();
      this.render();
      return;
    }
    const questionId = input.dataset.explanation;
    if (!questionId) return;
    if (input.checked) this.openExplanations.add(questionId);
    else this.openExplanations.delete(questionId);
    this.render();
  }

  private async performTransition(targetStatus: RoundStatus): Promise<void> {
    const round = this.bootstrapData?.currentRound;
    const adminToken = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (!round || !adminToken) return;
    try {
      const nextData = await this.api.transition(round.roundId, targetStatus, adminToken);
      if (shouldResetQuestionIndex(
        round.roundId,
        round.status,
        nextData.currentRound?.roundId,
        nextData.currentRound?.status,
      )) {
        this.currentQuestionIndex = 0;
      }
      this.bootstrapData = nextData;
      this.pendingTransition = null;
      this.message = "";
    } catch (error) {
      const apiError = error as StudyApiError;
      if (apiError.code === "ADMIN_TOKEN_INVALID" || apiError.code === "ADMIN_TOKEN_EXPIRED") {
        sessionStorage.removeItem(ADMIN_TOKEN_KEY);
      }
      this.message = this.friendlyError(error);
    }
  }

  private renderAndFocusAnswer(): void {
    this.render();
    window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>("#answer")?.focus());
  }

  private syncIndeterminateCheckbox(): void {
    if (!this.detailData) return;
    const all = this.root.querySelector<HTMLInputElement>('input[data-action="toggle-all"]');
    if (!all) return;
    all.indeterminate = this.openExplanations.size > 0 && this.openExplanations.size < this.detailData.questions.length;
  }
}
