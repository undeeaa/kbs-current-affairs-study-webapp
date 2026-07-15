import http from "node:http";

const port = Number(process.env.PORT || 8787);
let status = process.env.MOCK_STATUS || "WAITING";
const roundId = "2026-rehearsal";
const answers = [
  ["할루시네이션", "생성형 AI가 사실이 아닌 내용을 사실처럼 만드는 현상"],
  ["필터 버블", "개인화 알고리즘이 선호 정보만 반복 제공하는 현상"],
  ["스태그플레이션", "경기 침체와 물가 상승이 동시에 나타나는 현상"],
  ["그린워싱", "실제보다 친환경적인 것처럼 홍보하는 행위"],
  ["코드 커팅", "유료 방송을 해지하고 OTT로 이동하는 현상"],
  ["CBDC", "중앙은행이 발행하는 디지털 법정통화"],
  ["게리맨더링", "특정 세력에 유리하도록 선거구를 획정하는 행위"],
  ["슈링크플레이션", "가격을 유지하면서 제품 용량을 줄이는 전략"],
  ["호크아이", "공의 궤적을 추적해 판정을 돕는 시스템"],
  ["그린 스완", "기후 변화에서 비롯되는 예측하기 어려운 금융 충격"],
  ["디지털 트윈", "현실 대상을 가상 공간에 동일하게 구현한 모델"],
  ["딥페이크", "인공지능으로 인물의 영상이나 음성을 합성하는 기술"],
  ["에코 체임버", "비슷한 의견만 반복 접하면서 신념이 강화되는 현상"],
  ["양자 컴퓨터", "양자 중첩과 얽힘을 계산에 활용하는 컴퓨터"],
  ["다크 패턴", "사용자를 의도한 행동으로 유도하는 기만적 화면 설계"],
  ["리쇼어링", "해외 생산 시설을 자국으로 다시 옮기는 현상"],
  ["니어쇼어링", "생산 시설을 본국과 가까운 국가로 옮기는 전략"],
  ["플랫폼 노동", "디지털 플랫폼을 통해 일감을 얻어 수행하는 노동"],
  ["탄소 국경 조정 제도", "탄소 배출이 많은 수입품에 비용을 부과하는 제도"],
  ["제로 트러스트", "모든 접근을 검증하는 정보 보안 원칙"],
];
const questions = answers.map(([answer], index) => ({
  questionId: `mock-q-${index + 1}`,
  order: index + 1,
  question: `${answer}와 관련된 시사상식 용어를 적어보세요. (${index + 1}번)` ,
}));
const submissions = new Map();

const json = (response, data) => {
  response.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  response.end(JSON.stringify({ ok: true, data, serverTime: new Date().toISOString() }));
};

const fail = (response, code, message, retryable = false) => {
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
  response.end(JSON.stringify({ ok: false, error: { code, message, retryable }, serverTime: new Date().toISOString() }));
};

const resultFor = (participantId, attempt) => {
  const saved = submissions.get(`${participantId}:${attempt}`);
  if (!saved) return undefined;
  const items = questions.map((question, index) => {
    const response = saved.answers.find((entry) => entry.questionId === question.questionId)?.response || "";
    const accepted = response.trim().replace(/\s+/g, " ").toLowerCase() === answers[index][0].toLowerCase();
    return { ...question, response, isCorrect: accepted, answer: answers[index][0], description: answers[index][1] };
  });
  return { attempt, score: items.filter((item) => item.isCorrect).length, total: items.length, items };
};

const round = () => ({
  roundId,
  title: "제4회 시사상식 시험",
  status,
  date: "2026-07-16T10:00:00.000Z",
  questionCount: 20,
  participantCount: new Set([...submissions.values()].filter((value) => value.attempt === 1).map((value) => value.participantId)).size,
});

const bootstrap = (participantId = "") => {
  const firstResult = resultFor(participantId, 1);
  const retestResult = resultFor(participantId, 2);
  return {
    currentRound: round(),
    questions: status === "FIRST_TEST" || (status === "RETEST" && firstResult) ? questions : [],
    eligibleForRetest: Boolean(firstResult),
    ...(status === "REVIEW" && firstResult ? { firstResult } : {}),
    ...(status === "FINISHED" && firstResult ? { firstResult } : {}),
    ...(status === "FINISHED" && retestResult ? { retestResult } : {}),
  };
};

const server = http.createServer((request, response) => {
  if (request.method === "OPTIONS") return json(response, {});
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (request.method === "GET") {
    const action = url.searchParams.get("action");
    if (action === "health") return json(response, { service: "mock", status: "ok" });
    if (action === "bootstrap") return json(response, bootstrap(url.searchParams.get("participantId") || ""));
    if (action === "history") return json(response, status === "FINISHED" ? [round()] : []);
    if (action === "roundDetail") {
      if (status !== "FINISHED") return fail(response, "ROUND_NOT_PUBLIC", "아직 공개되지 않은 회차예요.");
      const grouped = new Map();
      for (const saved of submissions.values()) {
        if (saved.attempt !== 1) continue;
        const result = resultFor(saved.participantId, 1);
        grouped.set(saved.participantId, { nickname: saved.nickname, score: result.score, total: 20 });
      }
      let previousScore;
      let previousRank = 0;
      const ranking = [...grouped.values()].sort((a, b) => b.score - a.score).map((row, index) => {
        if (row.score !== previousScore) previousRank = index + 1;
        previousScore = row.score;
        return { ...row, rank: previousRank };
      });
      return json(response, {
        round: round(), ranking,
        questions: questions.map((question, index) => ({ ...question, answer: answers[index][0], description: answers[index][1] })),
      });
    }
    if (action === "attemptResult") {
      const result = resultFor(url.searchParams.get("participantId"), Number(url.searchParams.get("attempt")));
      return result ? json(response, result) : fail(response, "RESULT_NOT_FOUND", "결과가 없어요.");
    }
    return fail(response, "UNKNOWN_ACTION", "기능을 찾을 수 없어요.");
  }

  let raw = "";
  request.on("data", (chunk) => { raw += chunk; });
  request.on("end", () => {
    const body = JSON.parse(raw || "{}");
    if (body.action === "adminLogin") {
      return body.code === "study1234"
        ? json(response, { adminToken: "mock-admin-token", expiresAt: new Date(Date.now() + 3600000).toISOString() })
        : fail(response, "ADMIN_CODE_INVALID", "관리자 코드를 확인해주세요.");
    }
    if (body.action === "transition") {
      const transitions = { WAITING: "FIRST_TEST", FIRST_TEST: "REVIEW", REVIEW: "RETEST", RETEST: "FINISHED" };
      if (body.adminToken !== "mock-admin-token" || transitions[status] !== body.targetStatus) return fail(response, "TRANSITION_INVALID", "상태를 바꿀 수 없어요.");
      status = body.targetStatus;
      return json(response, bootstrap());
    }
    if (body.action === "submitAttempt") {
      const allowed = body.attempt === 1 ? ["REVIEW", "RETEST", "FINISHED"].includes(status) : status === "FINISHED";
      if (!allowed) return fail(response, "SUBMISSION_NOT_OPEN", "아직 제출할 수 없어요.", true);
      const key = `${body.participantId}:${body.attempt}`;
      if (!submissions.has(key)) submissions.set(key, body);
      return json(response, resultFor(body.participantId, body.attempt));
    }
    return fail(response, "UNKNOWN_ACTION", "기능을 찾을 수 없어요.");
  });
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Mock API listening on http://127.0.0.1:${port}\n`);
});
