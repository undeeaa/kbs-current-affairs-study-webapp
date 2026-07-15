# 운영 가이드

## 1. Google Sheet 구조

기존 `items` 탭은 수정하거나 이름을 바꾸지 않습니다.

추가 탭은 다음과 같습니다.

### Rounds

`roundId | title | status | createdAt | firstStartedAt | firstEndedAt | retestStartedAt | retestEndedAt`

### RoundQuestions

`roundId | questionId | order`

### Responses

`roundId | participantId | nickname | attempt | questionId | response | isCorrect | submittedAt`

`Responses`는 웹앱이 기록하는 탭이므로 직접 수정하지 않습니다.

## 2. Apps Script 최초 설치

1. 기존 Sheet의 Apps Script 프로젝트는 열거나 수정하지 않습니다.
2. Google Drive에서 별도의 독립 Apps Script 프로젝트를 새로 만듭니다.
3. 새 프로젝트의 파일 이름을 `StudyWebApp.gs`로 바꾸고 저장소의 `apps-script/StudyWebApp.gs` 내용을 붙여넣습니다.
4. 프로젝트 설정의 Script Properties에 다음 두 값을 넣습니다.
   - `SPREADSHEET_ID`: 대상 Sheet URL의 `/d/`와 `/edit` 사이 ID
   - `ADMIN_CODE_PLAIN`: 8자 이상의 최초 관리자 코드
5. 편집기에서 `KBS_setupAdmin`을 한 번 실행하고 권한을 승인합니다.
6. 실행이 끝나면 `ADMIN_CODE_PLAIN`은 자동 삭제되고 salted hash와 토큰 서명 키만 남습니다.
7. `배포 → 새 배포 → 웹 앱`을 선택합니다.
   - 실행 사용자: 나
   - 액세스 권한: 모든 사용자
8. 배포 후 `/exec`으로 끝나는 URL에 `?action=health`를 붙여 `status: ok` 응답을 확인합니다.

웹 앱 코드를 갱신할 때는 기존 배포를 편집해 새 버전을 연결합니다. `/dev` URL은 운영에 사용하지 않습니다.

## 3. 새 회차 만들기

1. `Rounds`에 한 행을 추가합니다.
   - `roundId`: 중복 없는 값, 예: `2026-05`
   - `title`: 예: `제5회 시사상식 시험`
   - `status`: `WAITING`
   - `createdAt`: 현재 날짜와 시각
2. `items`에서 사용할 문제 20개의 `id`를 고릅니다.
3. `RoundQuestions`에 같은 `roundId`로 20행을 추가합니다.
4. `order`에는 1부터 20까지 중복 없이 입력합니다.
5. 웹앱 관리 화면에서 `1차 시험 시작`을 누릅니다.

문제 본문이나 정답을 수정해야 할 때 이미 사용된 `items.id`를 고치지 말고 새 문제 ID로 추가합니다. 종료된 회차도 현재 문제 데이터를 참조하기 때문입니다.

## 4. 시험 운영 순서

1. 참가자가 닉네임을 입력하고 대기합니다.
2. 관리자가 `1차 시험 시작`을 누릅니다.
3. 종료 안내 시 `1차 시험 종료`를 누릅니다.
4. 참가자 화면이 입력을 잠그고 답안을 제출한 뒤 정답·해설을 표시합니다.
5. 복습 후 `재시험 시작`을 누릅니다.
6. 재시험 종료 안내 시 `재시험 종료`를 누릅니다.
7. 제출이 완료되면 회차가 지난 회차에 공개됩니다.

상태 확인 주기가 4초이므로 화면 전환에는 최대 약 5초가 걸릴 수 있습니다.

## 5. 장애 대응

- 참가자 연결이 끊겨도 답안은 해당 기기의 브라우저에 남습니다. 같은 브라우저로 다시 접속하면 재전송합니다.
- 참가자에게 제출 오류가 보이면 `다시 제출해요`를 누르게 합니다.
- 같은 참가자의 동일 차수 답안은 최초 저장본만 인정되며 재전송으로 바뀌지 않습니다.
- 상태를 잘못 변경했을 때는 관리자 화면에서 되돌릴 수 없습니다. `Rounds.status`와 관련 시각을 Sheet에서 직접 복구한 뒤 새로고침합니다.
- `진행 가능한 회차가 두 개 이상` 오류가 나면 `FINISHED`가 아닌 `Rounds` 행을 하나만 남깁니다.
- 20문항 구성 오류가 나면 `RoundQuestions`의 문제 ID, 순서 중복, 누락을 확인합니다.

## 6. GitHub Pages

1. 공개 GitHub 저장소 이름을 `kbs-current-affairs-study-webapp`으로 만들고 이 프로젝트를 `main`에 푸시합니다.
2. `VITE_API_URL=<Apps Script /exec URL> npm run build`로 운영 빌드를 만듭니다.
3. `dist` 폴더의 결과물을 `gh-pages` 브랜치 루트에 배포합니다.
4. 저장소 `Settings → Pages → Source`에서 `Deploy from a branch`, `gh-pages / (root)`를 선택합니다.
5. 배포된 페이지에서 대기 화면과 관리자 로그인까지 확인합니다.

백엔드 주소를 변경하거나 화면을 수정한 경우 테스트 후 2~3단계를 다시 실행합니다.

## 7. 리허설 체크

- 20명이 5초 안에 같은 단계로 전환되는지 확인
- 새로고침 후 입력 답안과 재시험 순서가 유지되는지 확인
- 같은 닉네임 두 명이 랭킹에 별도 행으로 표시되는지 확인
- 20명 기준 차수별 400행, 전체 800행이 누락·중복 없이 기록되는지 확인
- 한 명을 오프라인으로 둔 뒤 종료 후 재연결하여 자동 제출 확인
- 공동 순위가 `1, 2, 2, 4` 방식으로 표시되는지 확인
- 종료 전에는 정답·별칭·해설이 브라우저 응답에 포함되지 않는지 확인
