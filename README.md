# KBS 시사상식 스터디

KBS 공채 시사상식 대비 스터디의 주간 쪽지시험을 진행하고 복습하기 위한 가벼운 정적 웹앱입니다.

## 제공 기능

- 회차마다 닉네임을 입력하는 익명 참여
- 1차 시험과 재시험의 동시 시작·종료
- 브라우저 답안 임시 저장과 종료 시 자동 제출
- 자동 채점, 정답·해설 복습, 재시험 순서 무작위화
- 종료 회차 목록, 1차 점수 랭킹, 문제별 정답·해설 토글
- 관리자 코드 기반의 단방향 시험 상태 관리

## 구성

- 화면: Vanilla TypeScript, Vite, 순수 CSS
- 정적 배포: GitHub Pages
- 백엔드: Google Apps Script Web App
- 데이터: 기존 Google Sheet의 `items`, `Rounds`, `RoundQuestions`, `Responses`

런타임 UI 프레임워크, 웹폰트, 이미지, 별도 데이터베이스는 사용하지 않습니다.

## 로컬 확인

```sh
npm install
npm test
npm run build
```

화면 흐름을 로컬에서 확인하려면 두 터미널에서 다음을 실행합니다.

```sh
npm run mock-api
VITE_API_URL=http://127.0.0.1:8787 npm run dev
```

로컬 관리자 코드는 `study1234`입니다. 운영 코드와는 관계없는 개발 전용 값입니다.

## 배포와 운영

Apps Script 설치, Script Properties, GitHub Pages 연결, 회차 생성 및 장애 복구 절차는 [운영 가이드](docs/OPERATIONS.md)를 따릅니다.
