/**
 * KBS 시사상식 스터디 웹앱 백엔드
 *
 * 기존 Apps Script 서비스와 진입점이 충돌하지 않도록 별도의 독립 Apps Script
 * 프로젝트를 만들고, 그 프로젝트의 StudyWebApp.gs 파일로 사용한다.
 */

var KBS_SHEETS = {
  QUESTIONS: "items",
  ROUNDS: "Rounds",
  ROUND_QUESTIONS: "RoundQuestions",
  RESPONSES: "Responses",
};

var KBS_STATUSES = ["WAITING", "FIRST_TEST", "REVIEW", "RETEST", "FINISHED"];
var KBS_NEXT_STATUS = {
  WAITING: "FIRST_TEST",
  FIRST_TEST: "REVIEW",
  REVIEW: "RETEST",
  RETEST: "FINISHED",
  FINISHED: null,
};

function doGet(e) {
  return KBS_handleGet(e);
}

function doPost(e) {
  return KBS_handlePost(e);
}

function KBS_handleGet(e) {
  try {
    var action = KBS_string(e && e.parameter && e.parameter.action);
    var data;
    if (action === "health") {
      data = { service: "kbs-current-affairs-study", status: "ok" };
    } else if (action === "bootstrap") {
      data = KBS_bootstrap(KBS_string(e.parameter.participantId));
    } else if (action === "history") {
      data = KBS_history();
    } else if (action === "roundDetail") {
      data = KBS_roundDetail(KBS_string(e.parameter.roundId));
    } else if (action === "attemptResult") {
      data = KBS_attemptResult(
        KBS_string(e.parameter.roundId),
        KBS_string(e.parameter.participantId),
        Number(e.parameter.attempt),
      );
    } else {
      throw KBS_error("UNKNOWN_ACTION", "요청한 기능을 찾을 수 없어요.", false);
    }
    return KBS_json({ ok: true, data: data, serverTime: new Date().toISOString() });
  } catch (error) {
    return KBS_errorResponse(error);
  }
}

function KBS_handlePost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    var action = KBS_string(body.action);
    var data;
    if (action === "submitAttempt") {
      data = KBS_submitAttempt(body);
    } else if (action === "adminLogin") {
      data = KBS_adminLogin(KBS_string(body.code));
    } else if (action === "transition") {
      data = KBS_transition(body);
    } else {
      throw KBS_error("UNKNOWN_ACTION", "요청한 기능을 찾을 수 없어요.", false);
    }
    return KBS_json({ ok: true, data: data, serverTime: new Date().toISOString() });
  } catch (error) {
    return KBS_errorResponse(error);
  }
}

function KBS_json(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function KBS_errorResponse(error) {
  console.error(error && error.stack ? error.stack : error);
  var known = error && error.kbsCode;
  return KBS_json({
    ok: false,
    error: {
      code: known ? error.kbsCode : "INTERNAL_ERROR",
      message: known ? error.message : "요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.",
      retryable: known ? Boolean(error.kbsRetryable) : true,
    },
    serverTime: new Date().toISOString(),
  });
}

function KBS_error(code, message, retryable) {
  var error = new Error(message);
  error.kbsCode = code;
  error.kbsRetryable = Boolean(retryable);
  return error;
}

function KBS_assert(condition, code, message, retryable) {
  if (!condition) throw KBS_error(code, message, retryable);
}

function KBS_string(value) {
  return value === null || value === undefined ? "" : String(value);
}

function KBS_properties() {
  return PropertiesService.getScriptProperties();
}

function KBS_spreadsheet() {
  var id = KBS_properties().getProperty("SPREADSHEET_ID");
  KBS_assert(id, "CONFIG_MISSING", "스프레드시트 연결 설정이 필요해요.", false);
  return SpreadsheetApp.openById(id);
}

function KBS_sheet(name) {
  var sheet = KBS_spreadsheet().getSheetByName(name);
  KBS_assert(sheet, "SHEET_MISSING", name + " 시트를 찾을 수 없어요.", false);
  return sheet;
}

function KBS_readTable(name) {
  var sheet = KBS_sheet(name);
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow < 1 || lastColumn < 1) return { sheet: sheet, headers: [], rows: [] };
  var values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  var headers = values[0].map(KBS_string);
  var rows = [];
  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    if (values[rowIndex].every(function (value) { return value === ""; })) continue;
    var row = { _row: rowIndex + 1 };
    headers.forEach(function (header, columnIndex) {
      if (header) row[header] = values[rowIndex][columnIndex];
    });
    rows.push(row);
  }
  return { sheet: sheet, headers: headers, rows: rows };
}

function KBS_headerIndex(table, header) {
  var index = table.headers.indexOf(header);
  KBS_assert(index >= 0, "SHEET_SCHEMA_INVALID", table.sheet.getName() + " 시트에 " + header + " 열이 필요해요.", false);
  return index + 1;
}

function KBS_iso(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString();
  if (!value) return "";
  var date = new Date(value);
  return isNaN(date.getTime()) ? KBS_string(value) : date.toISOString();
}

function KBS_rounds() {
  var table = KBS_readTable(KBS_SHEETS.ROUNDS);
  ["roundId", "title", "status", "createdAt", "firstStartedAt", "firstEndedAt", "retestStartedAt", "retestEndedAt"].forEach(function (header) {
    KBS_headerIndex(table, header);
  });
  return table;
}

function KBS_currentRound() {
  var rows = KBS_rounds().rows;
  var active = rows.filter(function (row) { return KBS_string(row.status) !== "FINISHED"; });
  KBS_assert(active.length <= 1, "MULTIPLE_ACTIVE_ROUNDS", "진행 가능한 회차가 두 개 이상이에요. Rounds 시트를 확인해주세요.", false);
  var candidates = active.length ? active : rows.filter(function (row) { return KBS_string(row.status) === "FINISHED"; });
  candidates.sort(function (a, b) {
    return KBS_sortTime(b) - KBS_sortTime(a);
  });
  return candidates[0] || null;
}

function KBS_sortTime(row) {
  var value = row.retestEndedAt || row.firstStartedAt || row.createdAt;
  var time = value instanceof Date ? value.getTime() : new Date(value || 0).getTime();
  return isNaN(time) ? 0 : time;
}

function KBS_findRound(roundId) {
  var rows = KBS_rounds().rows;
  var matches = rows.filter(function (row) { return KBS_string(row.roundId) === roundId; });
  KBS_assert(matches.length === 1, "ROUND_NOT_FOUND", "이 시험을 찾을 수 없어요.", false);
  return matches[0];
}

function KBS_roundBundle(roundId, bypassCache) {
  var cache = CacheService.getScriptCache();
  var cacheKey = "round-bundle:" + roundId;
  if (!bypassCache) {
    var cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);
  }

  var questionTable = KBS_readTable(KBS_SHEETS.QUESTIONS);
  var linkTable = KBS_readTable(KBS_SHEETS.ROUND_QUESTIONS);
  ["id", "question", "description", "answer", "alias"].forEach(function (header) { KBS_headerIndex(questionTable, header); });
  ["roundId", "questionId", "order"].forEach(function (header) { KBS_headerIndex(linkTable, header); });

  var questionsById = {};
  questionTable.rows.forEach(function (row) { questionsById[KBS_string(row.id)] = row; });
  var links = linkTable.rows
    .filter(function (row) { return KBS_string(row.roundId) === roundId; })
    .sort(function (a, b) { return Number(a.order) - Number(b.order); });
  var questions = links.map(function (link) {
    var questionId = KBS_string(link.questionId);
    var source = questionsById[questionId];
    KBS_assert(source, "QUESTION_NOT_FOUND", "회차에 연결된 문제를 찾을 수 없어요: " + questionId, false);
    return {
      questionId: questionId,
      order: Number(link.order),
      question: KBS_string(source.question),
      description: KBS_string(source.description),
      answer: KBS_string(source.answer),
      alias: KBS_string(source.alias),
    };
  });
  var bundle = { questions: questions };
  cache.put(cacheKey, JSON.stringify(bundle), 30);
  return bundle;
}

function KBS_validateRound(round) {
  KBS_assert(KBS_string(round.status) === "WAITING", "ROUND_STATE_INVALID", "대기 중인 회차만 시작할 수 있어요.", false);
  var bundle = KBS_roundBundle(KBS_string(round.roundId), true);
  KBS_assert(bundle.questions.length === 20, "ROUND_QUESTION_COUNT", "회차에는 정확히 20문제가 필요해요.", false);
  var ids = {};
  var orders = {};
  bundle.questions.forEach(function (question) {
    KBS_assert(question.questionId && !ids[question.questionId], "ROUND_QUESTION_DUPLICATE", "같은 문제가 회차에 두 번 들어 있어요.", false);
    KBS_assert(question.order >= 1 && question.order <= 20 && !orders[question.order], "ROUND_ORDER_INVALID", "문제 순서는 1부터 20까지 한 번씩 사용해야 해요.", false);
    KBS_assert(question.question.trim() && question.answer.trim(), "QUESTION_REQUIRED_VALUE", "문제 본문과 대표 정답은 비워둘 수 없어요.", false);
    ids[question.questionId] = true;
    orders[question.order] = true;
  });
}

function KBS_responses() {
  var table = KBS_readTable(KBS_SHEETS.RESPONSES);
  ["roundId", "participantId", "nickname", "attempt", "questionId", "response", "isCorrect", "submittedAt"].forEach(function (header) {
    KBS_headerIndex(table, header);
  });
  return table;
}

function KBS_responseRows(roundId, participantId, attempt) {
  return KBS_responses().rows.filter(function (row) {
    return KBS_string(row.roundId) === roundId &&
      KBS_string(row.participantId) === participantId &&
      Number(row.attempt) === Number(attempt);
  });
}

function KBS_roundSummary(round, includeParticipantCount) {
  var roundId = KBS_string(round.roundId);
  var bundle = KBS_roundBundle(roundId, false);
  var summary = {
    roundId: roundId,
    title: KBS_string(round.title),
    status: KBS_string(round.status),
    date: KBS_iso(round.firstStartedAt || round.createdAt),
    questionCount: bundle.questions.length,
  };
  if (includeParticipantCount) {
    var seen = {};
    KBS_responses().rows.forEach(function (row) {
      if (KBS_string(row.roundId) === roundId && Number(row.attempt) === 1) seen[KBS_string(row.participantId)] = true;
    });
    summary.participantCount = Object.keys(seen).length;
  }
  return summary;
}

function KBS_publicQuestions(bundle) {
  return bundle.questions.map(function (question) {
    return { questionId: question.questionId, order: question.order, question: question.question };
  });
}

function KBS_bootstrap(participantId) {
  var round = KBS_currentRound();
  if (!round) {
    return { currentRound: null, questions: [], eligibleForRetest: false };
  }
  var roundId = KBS_string(round.roundId);
  var status = KBS_string(round.status);
  var bundle = KBS_roundBundle(roundId, false);
  var firstResult = participantId ? KBS_buildAttemptResult(roundId, participantId, 1) : null;
  var retestResult = participantId ? KBS_buildAttemptResult(roundId, participantId, 2) : null;
  var eligibleForRetest = Boolean(firstResult);
  var questions = [];
  if (status === "FIRST_TEST") questions = KBS_publicQuestions(bundle);
  if (status === "RETEST" && eligibleForRetest) questions = KBS_publicQuestions(bundle);
  var output = {
    currentRound: KBS_roundSummary(round, false),
    questions: questions,
    eligibleForRetest: eligibleForRetest,
  };
  if (status === "REVIEW" && firstResult) output.firstResult = firstResult;
  if (status === "FINISHED") {
    if (firstResult) output.firstResult = firstResult;
    if (retestResult) output.retestResult = retestResult;
  }
  return output;
}

function KBS_history() {
  return KBS_rounds().rows
    .filter(function (row) { return KBS_string(row.status) === "FINISHED"; })
    .sort(function (a, b) { return KBS_sortTime(b) - KBS_sortTime(a); })
    .map(function (round) { return KBS_roundSummary(round, true); });
}

function KBS_roundDetail(roundId) {
  KBS_assert(roundId, "ROUND_ID_REQUIRED", "회차 정보가 필요해요.", false);
  var round = KBS_findRound(roundId);
  KBS_assert(KBS_string(round.status) === "FINISHED", "ROUND_NOT_PUBLIC", "아직 공개되지 않은 회차예요.", false);
  var bundle = KBS_roundBundle(roundId, false);
  return {
    round: KBS_roundSummary(round, true),
    ranking: KBS_ranking(roundId, bundle.questions.length),
    questions: bundle.questions.map(function (question) {
      return {
        questionId: question.questionId,
        order: question.order,
        question: question.question,
        answer: question.answer,
        description: question.description,
      };
    }),
  };
}

function KBS_attemptResult(roundId, participantId, attempt) {
  KBS_assert(roundId && participantId && (attempt === 1 || attempt === 2), "ATTEMPT_QUERY_INVALID", "응시 결과 정보를 확인해주세요.", false);
  var round = KBS_findRound(roundId);
  var status = KBS_string(round.status);
  var allowed = status === "FINISHED" || (status === "REVIEW" && attempt === 1);
  KBS_assert(allowed, "RESULT_NOT_PUBLIC", "지금은 이 결과를 볼 수 없어요.", false);
  var result = KBS_buildAttemptResult(roundId, participantId, attempt);
  KBS_assert(result, "RESULT_NOT_FOUND", "제출된 답안을 찾을 수 없어요.", false);
  return result;
}

function KBS_buildAttemptResult(roundId, participantId, attempt) {
  var bundle = KBS_roundBundle(roundId, false);
  var rows = KBS_responseRows(roundId, participantId, attempt);
  if (rows.length !== bundle.questions.length || !rows.length) return null;
  var byQuestion = {};
  rows.forEach(function (row) { byQuestion[KBS_string(row.questionId)] = row; });
  var score = 0;
  var items = bundle.questions.map(function (question) {
    var row = byQuestion[question.questionId];
    if (!row) return null;
    var isCorrect = row.isCorrect === true || KBS_string(row.isCorrect).toUpperCase() === "TRUE";
    if (isCorrect) score += 1;
    return {
      questionId: question.questionId,
      order: question.order,
      question: question.question,
      response: KBS_unescapeSheetText(KBS_string(row.response)),
      isCorrect: isCorrect,
      answer: question.answer,
      description: question.description,
    };
  });
  if (items.some(function (item) { return item === null; })) return null;
  return { attempt: attempt, score: score, total: bundle.questions.length, items: items };
}

function KBS_submitAttempt(body) {
  var roundId = KBS_string(body.roundId).trim();
  var participantId = KBS_string(body.participantId).trim();
  var nickname = KBS_string(body.nickname).trim();
  var attempt = Number(body.attempt);
  var answers = Array.isArray(body.answers) ? body.answers : [];
  KBS_assert(/^[A-Za-z0-9-]{8,64}$/.test(participantId), "PARTICIPANT_ID_INVALID", "참가자 정보를 확인하지 못했어요.", false);
  KBS_assert(roundId && roundId.length <= 80, "ROUND_ID_INVALID", "회차 정보를 확인하지 못했어요.", false);
  KBS_assert(nickname.length >= 1 && nickname.length <= 20, "NICKNAME_INVALID", "닉네임은 1자 이상 20자 이하로 입력해주세요.", false);
  KBS_assert(attempt === 1 || attempt === 2, "ATTEMPT_INVALID", "시험 차수를 확인하지 못했어요.", false);

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (error) {
    throw KBS_error("SUBMISSION_BUSY", "답안 제출이 몰리고 있어요. 잠시 후 다시 시도할게요.", true);
  }
  try {
    var round = KBS_findRound(roundId);
    var status = KBS_string(round.status);
    var allowed = attempt === 1
      ? ["REVIEW", "RETEST", "FINISHED"].indexOf(status) >= 0
      : status === "FINISHED";
    KBS_assert(allowed, "SUBMISSION_NOT_OPEN", "아직 이 답안을 제출할 수 없어요.", true);
    if (attempt === 2) {
      KBS_assert(Boolean(KBS_buildAttemptResult(roundId, participantId, 1)), "RETEST_NOT_ELIGIBLE", "1차 시험 제출 기록을 찾지 못했어요.", false);
    }

    var bundle = KBS_roundBundle(roundId, false);
    var existing = KBS_responseRows(roundId, participantId, attempt);
    if (existing.length === bundle.questions.length) return KBS_buildAttemptResult(roundId, participantId, attempt);
    KBS_assert(existing.length === 0, "PARTIAL_SUBMISSION", "일부 답안만 저장되어 있어요. 관리자에게 알려주세요.", false);

    var validIds = {};
    bundle.questions.forEach(function (question) { validIds[question.questionId] = true; });
    var answerMap = {};
    answers.forEach(function (answer) {
      var questionId = KBS_string(answer && answer.questionId).trim();
      var response = KBS_string(answer && answer.response);
      KBS_assert(validIds[questionId], "ANSWER_QUESTION_INVALID", "회차에 없는 문제 답안이 포함되어 있어요.", false);
      KBS_assert(answerMap[questionId] === undefined, "ANSWER_DUPLICATE", "같은 문제 답안이 두 번 포함되어 있어요.", false);
      KBS_assert(response.length <= 200, "ANSWER_TOO_LONG", "답안은 200자 이하로 입력해주세요.", false);
      answerMap[questionId] = response;
    });

    var submittedAt = new Date();
    var values = bundle.questions.map(function (question) {
      var response = answerMap[question.questionId] || "";
      return [
        roundId,
        participantId,
        KBS_escapeSheetText(nickname),
        attempt,
        question.questionId,
        KBS_escapeSheetText(response),
        KBS_isAccepted(response, question.answer, question.alias),
        submittedAt,
      ];
    });
    var responseTable = KBS_responses();
    var startRow = responseTable.sheet.getLastRow() + 1;
    var target = responseTable.sheet.getRange(startRow, 1, values.length, values[0].length);
    target.setNumberFormat("@");
    target.setValues(values);
    responseTable.sheet.getRange(startRow, 4, values.length, 1).setNumberFormat("0");
    responseTable.sheet.getRange(startRow, 7, values.length, 1).setNumberFormat("BOOLEAN");
    responseTable.sheet.getRange(startRow, 8, values.length, 1).setNumberFormat("yyyy-mm-dd hh:mm:ss");
    SpreadsheetApp.flush();
    return KBS_buildAttemptResult(roundId, participantId, attempt);
  } finally {
    lock.releaseLock();
  }
}

function KBS_normalizeAnswer(value) {
  return KBS_string(value).trim().replace(/\s+/g, " ").toLowerCase();
}

function KBS_isAccepted(response, answer, alias) {
  var normalized = KBS_normalizeAnswer(response);
  if (!normalized) return false;
  var candidates = [answer].concat(KBS_string(alias).split("|"));
  return candidates.some(function (candidate) {
    return KBS_normalizeAnswer(candidate) === normalized && KBS_normalizeAnswer(candidate) !== "";
  });
}

function KBS_escapeSheetText(value) {
  var text = KBS_string(value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function KBS_unescapeSheetText(value) {
  return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
}

function KBS_ranking(roundId, total) {
  var grouped = {};
  KBS_responses().rows.forEach(function (row) {
    if (KBS_string(row.roundId) !== roundId || Number(row.attempt) !== 1) return;
    var participantId = KBS_string(row.participantId);
    if (!grouped[participantId]) {
      grouped[participantId] = { nickname: KBS_unescapeSheetText(KBS_string(row.nickname)), score: 0, seen: {} };
    }
    var questionId = KBS_string(row.questionId);
    if (!grouped[participantId].seen[questionId]) {
      grouped[participantId].seen[questionId] = true;
      if (row.isCorrect === true || KBS_string(row.isCorrect).toUpperCase() === "TRUE") grouped[participantId].score += 1;
    }
  });
  var rows = Object.keys(grouped).map(function (participantId) {
    return { participantId: participantId, nickname: grouped[participantId].nickname, score: grouped[participantId].score, total: total };
  });
  rows.sort(function (a, b) {
    return b.score - a.score || a.nickname.localeCompare(b.nickname);
  });
  var previousScore = null;
  var previousRank = 0;
  return rows.map(function (row, index) {
    if (row.score !== previousScore) previousRank = index + 1;
    previousScore = row.score;
    return { rank: previousRank, nickname: row.nickname, score: row.score, total: row.total };
  });
}

function KBS_adminLogin(code) {
  var properties = KBS_properties();
  var salt = properties.getProperty("ADMIN_CODE_SALT");
  var expected = properties.getProperty("ADMIN_CODE_HASH");
  var secret = properties.getProperty("TOKEN_SECRET");
  KBS_assert(salt && expected && secret, "ADMIN_NOT_CONFIGURED", "관리자 코드 설정이 필요해요.", false);
  var actual = KBS_hash(code, salt);
  KBS_assert(KBS_constantTimeEqual(actual, expected), "ADMIN_CODE_INVALID", "관리자 코드를 확인해주세요.", false);
  var expiresAt = Date.now() + 8 * 60 * 60 * 1000;
  var payload = Utilities.base64EncodeWebSafe(JSON.stringify({ exp: expiresAt, nonce: Utilities.getUuid() })).replace(/=+$/, "");
  var signature = KBS_sign(payload, secret);
  return { adminToken: payload + "." + signature, expiresAt: new Date(expiresAt).toISOString() };
}

function KBS_transition(body) {
  var roundId = KBS_string(body.roundId).trim();
  var targetStatus = KBS_string(body.targetStatus).trim();
  KBS_verifyAdminToken(KBS_string(body.adminToken));
  KBS_assert(KBS_STATUSES.indexOf(targetStatus) >= 0, "TARGET_STATUS_INVALID", "변경할 시험 상태를 확인해주세요.", false);

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (error) {
    throw KBS_error("TRANSITION_BUSY", "다른 상태 변경을 처리하고 있어요. 잠시 후 다시 시도해주세요.", true);
  }
  try {
    var table = KBS_rounds();
    var matches = table.rows.filter(function (row) { return KBS_string(row.roundId) === roundId; });
    KBS_assert(matches.length === 1, "ROUND_NOT_FOUND", "이 시험을 찾을 수 없어요.", false);
    var round = matches[0];
    var currentStatus = KBS_string(round.status);
    KBS_assert(KBS_NEXT_STATUS[currentStatus] === targetStatus, "TRANSITION_INVALID", "현재 단계에서 요청한 단계로 이동할 수 없어요.", false);
    if (currentStatus === "WAITING") KBS_validateRound(round);

    var now = new Date();
    var timestampHeader = {
      FIRST_TEST: "firstStartedAt",
      REVIEW: "firstEndedAt",
      RETEST: "retestStartedAt",
      FINISHED: "retestEndedAt",
    }[targetStatus];
    table.sheet.getRange(round._row, KBS_headerIndex(table, "status")).setValue(targetStatus);
    table.sheet.getRange(round._row, KBS_headerIndex(table, timestampHeader)).setValue(now);
    if (!round.createdAt) table.sheet.getRange(round._row, KBS_headerIndex(table, "createdAt")).setValue(now);
    SpreadsheetApp.flush();
    CacheService.getScriptCache().remove("round-bundle:" + roundId);
    return KBS_bootstrap("");
  } finally {
    lock.releaseLock();
  }
}

function KBS_verifyAdminToken(token) {
  var parts = token.split(".");
  KBS_assert(parts.length === 2, "ADMIN_TOKEN_INVALID", "관리자 인증이 만료됐어요. 다시 입력해주세요.", false);
  var secret = KBS_properties().getProperty("TOKEN_SECRET");
  KBS_assert(secret && KBS_constantTimeEqual(KBS_sign(parts[0], secret), parts[1]), "ADMIN_TOKEN_INVALID", "관리자 인증이 만료됐어요. 다시 입력해주세요.", false);
  var payload;
  try {
    payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  } catch (error) {
    throw KBS_error("ADMIN_TOKEN_INVALID", "관리자 인증이 만료됐어요. 다시 입력해주세요.", false);
  }
  KBS_assert(Number(payload.exp) > Date.now(), "ADMIN_TOKEN_EXPIRED", "관리자 인증 시간이 끝났어요. 다시 입력해주세요.", false);
}

function KBS_sign(payload, secret) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, secret)).replace(/=+$/, "");
}

function KBS_hash(code, salt) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ":" + code, Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, "");
}

function KBS_constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  var difference = 0;
  for (var index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

/**
 * 최초 1회 설정용 함수.
 * Apps Script 프로젝트 설정의 Script Properties에 다음을 추가한다.
 * - SPREADSHEET_ID: 연결할 Google Sheet ID
 * - ADMIN_CODE_PLAIN: 최초 관리자 코드
 * 그런 다음 이 함수를 한 번 실행한다. 평문 코드는 즉시 삭제되고 해시만 남는다.
 */
function KBS_setupAdmin() {
  var properties = KBS_properties();
  var spreadsheetId = properties.getProperty("SPREADSHEET_ID");
  var plainCode = properties.getProperty("ADMIN_CODE_PLAIN");
  KBS_assert(spreadsheetId, "CONFIG_MISSING", "SPREADSHEET_ID Script Property를 먼저 추가해주세요.", false);
  KBS_assert(plainCode && plainCode.length >= 8, "ADMIN_CODE_WEAK", "ADMIN_CODE_PLAIN은 8자 이상으로 설정해주세요.", false);
  var salt = Utilities.getUuid();
  properties.setProperties({
    ADMIN_CODE_SALT: salt,
    ADMIN_CODE_HASH: KBS_hash(plainCode, salt),
    TOKEN_SECRET: properties.getProperty("TOKEN_SECRET") || Utilities.getUuid() + Utilities.getUuid(),
  });
  properties.deleteProperty("ADMIN_CODE_PLAIN");
  KBS_validateSheetSetup();
  console.log("관리자 코드와 시트 연결 설정이 완료됐습니다.");
}

function KBS_validateSheetSetup() {
  var questions = KBS_readTable(KBS_SHEETS.QUESTIONS);
  var rounds = KBS_rounds();
  var links = KBS_readTable(KBS_SHEETS.ROUND_QUESTIONS);
  var responses = KBS_responses();
  ["id", "createdAt", "author", "category", "question", "description", "answer", "source", "alias"].forEach(function (header) { KBS_headerIndex(questions, header); });
  ["roundId", "questionId", "order"].forEach(function (header) { KBS_headerIndex(links, header); });
  return {
    questionCount: questions.rows.length,
    roundCount: rounds.rows.length,
    roundQuestionCount: links.rows.length,
    responseCount: responses.rows.length,
  };
}
