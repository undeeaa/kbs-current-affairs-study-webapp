(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))s(i);new MutationObserver(i=>{for(const n of i)if(n.type==="childList")for(const o of n.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&s(o)}).observe(document,{childList:!0,subtree:!0});function e(i){const n={};return i.integrity&&(n.integrity=i.integrity),i.referrerPolicy&&(n.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?n.credentials="include":i.crossOrigin==="anonymous"?n.credentials="omit":n.credentials="same-origin",n}function s(i){if(i.ep)return;i.ep=!0;const n=e(i);fetch(i.href,n)}})();class d extends Error{constructor(t,e="UNKNOWN",s=!1){super(t),this.code=e,this.retryable=s}}class w{constructor(t){this.baseUrl=t}ensureConfigured(){if(!this.baseUrl)throw new d("앱 연결 주소가 아직 설정되지 않았어요.","NOT_CONFIGURED")}async parse(t){let e;try{e=await t.json()}catch{throw new d("연결 응답을 확인하지 못했어요.","INVALID_RESPONSE",!0)}if(!e.ok||e.data===void 0)throw new d(e.error?.message??"요청을 처리하지 못했어요.",e.error?.code,e.error?.retryable);return e.data}async get(t,e={}){this.ensureConfigured();const s=new URL(this.baseUrl);s.searchParams.set("action",t),s.searchParams.set("ts",String(Date.now())),Object.entries(e).forEach(([n,o])=>o&&s.searchParams.set(n,o));const i=await fetch(s,{cache:"no-store",redirect:"follow"});return this.parse(i)}async post(t,e){this.ensureConfigured();const s=await fetch(this.baseUrl,{method:"POST",redirect:"follow",headers:{"Content-Type":"text/plain;charset=UTF-8"},body:JSON.stringify({action:t,...e})});return this.parse(s)}bootstrap(t=""){return this.get("bootstrap",{participantId:t})}history(){return this.get("history")}roundDetail(t){return this.get("roundDetail",{roundId:t})}attemptResult(t,e,s){return this.get("attemptResult",{roundId:t,participantId:e,attempt:String(s)})}submitAttempt(t){return this.post("submitAttempt",t)}adminLogin(t){return this.post("adminLogin",{code:t})}transition(t,e,s){return this.post("transition",{roundId:t,targetStatus:e,adminToken:s})}}function I(r){let t=2166136261;for(let e=0;e<r.length;e+=1)t^=r.charCodeAt(e),t=Math.imul(t,16777619);return t>>>0}function $(r){let t=r;return()=>{t+=1831565813;let e=t;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}}function S(r,t){const e=[...r],s=$(I(t));for(let i=e.length-1;i>0;i-=1){const n=Math.floor(s()*(i+1));[e[i],e[n]]=[e[n],e[i]]}return e}function T(r,t,e){const s=new Set(r.map(n=>n.questionId));if(e?.length===r.length&&e.every(n=>s.has(n))){const n=new Map(r.map(o=>[o.questionId,o]));return{questions:e.map(o=>n.get(o)),order:e}}const i=S(r,t);return{questions:i,order:i.map(n=>n.questionId)}}function m(r,t,e,s){return!e||!s?!1:r!==e?!0:t!==s&&(s==="FIRST_TEST"||s==="RETEST")}function R(r){return{WAITING:"FIRST_TEST",FIRST_TEST:"REVIEW",REVIEW:"RETEST",RETEST:"FINISHED",FINISHED:null}[r]??null}const l="kbs-study:v1";function h(r){if(!r)return null;try{return JSON.parse(r)}catch{return null}}class v{constructor(t=window.localStorage){this.storage=t}getSession(t){return h(this.storage.getItem(`${l}:session:${t}`))}createSession(t,e){const s={roundId:t,participantId:crypto.randomUUID(),nickname:e.trim()};return this.storage.setItem(`${l}:session:${t}`,JSON.stringify(s)),s}updateNickname(t,e){const s={...t,nickname:e.trim()};return this.storage.setItem(`${l}:session:${t.roundId}`,JSON.stringify(s)),s}getAnswers(t,e,s){return h(this.storage.getItem(`${l}:answers:${t}:${e}:${s}`))??{}}saveAnswer(t,e,s,i,n){const o=this.getAnswers(t,e,s);return o[i]=n.slice(0,200),this.storage.setItem(`${l}:answers:${t}:${e}:${s}`,JSON.stringify(o)),o}getRetestOrder(t,e){return h(this.storage.getItem(`${l}:order:${t}:${e}:2`))}saveRetestOrder(t,e,s){this.storage.setItem(`${l}:order:${t}:${e}:2`,JSON.stringify(s))}getSubmissionState(t,e,s){const i=this.storage.getItem(`${l}:submission:${t}:${e}:${s}`);return i==="pending"||i==="submitted"?i:null}setSubmissionState(t,e,s,i){this.storage.setItem(`${l}:submission:${t}:${e}:${s}`,i)}}const E=4e3,g=1200,c="kbs-study:admin-token";function a(r){return String(r??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}function f(r){if(!r)return"";const t=new Date(r);return Number.isNaN(t.getTime())?r:new Intl.DateTimeFormat("ko-KR",{year:"numeric",month:"numeric",day:"numeric"}).format(t)}function b(){return(window.location.hash||"#/exam").replace(/^#\/?/,"").split("/").filter(Boolean)}function p(r){return{WAITING:"시험 준비",FIRST_TEST:"1차 시험",REVIEW:"정답 확인",RETEST:"재시험",FINISHED:"시험 완료"}[r]}class k{constructor(t){this.root=t}api=new w("https://script.google.com/macros/s/AKfycbydwBqH1ZXSq9LirFb8_qORLSm6MHDzvZW718NDff4La3A2PYdAFzhbx2lNzxm0Fmd-/exec".trim()??"");storage=new v;bootstrapData=null;historyData=[];detailData=null;session=null;loading=!0;refreshing=!1;message="";currentQuestionIndex=0;editingNickname=!1;submittingAttempt=null;retryTimer=null;pollTimer=null;retryDelayIndex=0;openExplanations=new Set;pendingTransition=null;pendingAction=null;pendingNickname="";slowRequest=!1;slowBackgroundRefresh=!1;slowRequestTimer=null;slowBackgroundTimer=null;async start(){window.addEventListener("hashchange",()=>void this.loadRoute()),window.addEventListener("online",()=>void this.loadRoute(!0)),document.addEventListener("visibilitychange",()=>{document.visibilityState==="visible"&&this.loadRoute(!0)}),this.root.addEventListener("click",t=>void this.handleClick(t)),this.root.addEventListener("submit",t=>void this.handleSubmit(t)),this.root.addEventListener("input",t=>this.handleInput(t)),this.root.addEventListener("change",t=>this.handleChange(t)),await this.loadRoute()}async loadRoute(t=!1){if(!this.refreshing){this.refreshing=!0,t?this.pendingAction||this.armSlowBackgroundTimer():(this.loading=!0,this.armSlowRequestTimer(),this.render()),this.clearPolling();try{const[e,s]=b();!e||e==="exam"?(await this.loadExam(),this.startPolling()):e==="history"&&s?this.detailData=await this.api.roundDetail(s):e==="history"?this.historyData=await this.api.history():e==="admin"?(await this.loadExam(!1),this.startPolling()):window.location.hash="#/exam",t&&(this.message="")}catch(e){this.message=this.friendlyError(e)}finally{this.loading=!1,this.refreshing=!1,t||this.clearSlowRequestTimer(),this.clearSlowBackgroundTimer(),this.render()}}}async loadExam(t=!0){const e=this.bootstrapData?.currentRound,s=this.session??(e?this.storage.getSession(e.roundId):null),i=await this.api.bootstrap(s?.participantId),n=i.currentRound?.roundId;this.session=n?this.storage.getSession(n):null,this.bootstrapData=this.session&&this.session.participantId!==s?.participantId?await this.api.bootstrap(this.session.participantId):i,m(e?.roundId,e?.status,this.bootstrapData.currentRound?.roundId,this.bootstrapData.currentRound?.status)&&(this.currentQuestionIndex=0),t&&await this.handlePhaseSubmission()}armSlowRequestTimer(){this.clearSlowRequestTimer(),this.slowRequest=!1,this.slowRequestTimer=window.setTimeout(()=>{this.slowRequest=!0,this.render()},g)}clearSlowRequestTimer(){this.slowRequestTimer!==null&&window.clearTimeout(this.slowRequestTimer),this.slowRequestTimer=null,this.slowRequest=!1}armSlowBackgroundTimer(){this.clearSlowBackgroundTimer(),this.slowBackgroundTimer=window.setTimeout(()=>{this.slowBackgroundRefresh=!0,this.updateConnectionFeedback()},g)}clearSlowBackgroundTimer(){this.slowBackgroundTimer!==null&&window.clearTimeout(this.slowBackgroundTimer),this.slowBackgroundTimer=null,this.slowBackgroundRefresh=!1,this.updateConnectionFeedback()}beginAction(t){return this.pendingAction?!1:(this.pendingAction=t,this.armSlowRequestTimer(),this.render(),!0)}finishAction(){const t=this.pendingAction;this.pendingAction=null,t==="nickname"&&(this.pendingNickname=""),this.clearSlowRequestTimer(),this.render()}async handlePhaseSubmission(){const t=this.bootstrapData,e=t?.currentRound;!t||!e||!this.session||(e.status==="REVIEW"?await this.ensureSubmitted(1):e.status==="FINISHED"&&t.eligibleForRetest&&await this.ensureSubmitted(2))}async ensureSubmitted(t){if(!this.session||!this.bootstrapData?.currentRound)return;const{roundId:e}=this.bootstrapData.currentRound;if(this.storage.getSubmissionState(e,this.session.participantId,t)!=="submitted"){this.storage.setSubmissionState(e,this.session.participantId,t,"pending"),this.submittingAttempt=t,this.render();try{const s=this.storage.getAnswers(e,this.session.participantId,t);await this.api.submitAttempt({roundId:e,participantId:this.session.participantId,nickname:this.session.nickname,attempt:t,answers:Object.entries(s).map(([i,n])=>({questionId:i,response:n}))}),this.storage.setSubmissionState(e,this.session.participantId,t,"submitted"),this.retryDelayIndex=0,this.message="",this.bootstrapData=await this.api.bootstrap(this.session.participantId)}catch(s){this.message=this.friendlyError(s,"답안을 아직 보내지 못했어요. 연결되는 대로 다시 제출할게요."),this.scheduleRetry()}finally{this.submittingAttempt=null}}}scheduleRetry(){this.retryTimer!==null&&window.clearTimeout(this.retryTimer);const t=[5e3,1e4,2e4,3e4],e=t[Math.min(this.retryDelayIndex,t.length-1)];this.retryDelayIndex+=1,this.retryTimer=window.setTimeout(()=>void this.loadRoute(!0),e)}startPolling(){this.pollTimer=window.setInterval(()=>void this.loadRoute(!0),E)}clearPolling(){this.pollTimer!==null&&window.clearInterval(this.pollTimer),this.pollTimer=null}friendlyError(t,e="연결이 잠시 불안정해요. 잠시 후 다시 시도해볼게요."){return t instanceof d&&t.message||e}render(){const[t,e]=b(),s=(t==="exam"||!t)&&["FIRST_TEST","RETEST"].includes(this.bootstrapData?.currentRound?.status??""),i=this.loading?this.renderLoading():t==="history"&&e?this.renderRoundDetail():t==="history"?this.renderHistory():t==="admin"?this.renderAdmin():this.renderExam();this.root.innerHTML=`
      ${s?"":this.renderNavigation(t||"exam")}
      <main id="main" class="page ${s?"page--quiz":""}" tabindex="-1">
        ${this.message?`<div class="notice" role="status">${a(this.message)}</div>`:""}
        ${this.renderRequestFeedback()}
        ${i}
      </main>
      <div class="connection-feedback" role="status" aria-live="polite" hidden></div>
    `,this.syncIndeterminateCheckbox(),this.updateConnectionFeedback()}renderRequestFeedback(){return this.slowRequest?`<div class="request-feedback" role="status"><span class="spinner" aria-hidden="true"></span><span>${this.pendingAction==="transition"?"시험 단계를 바꾸는 데 시간이 조금 걸리고 있어요. 완료될 때까지 그대로 기다려주세요.":this.pendingAction==="admin-login"?"관리자 권한을 확인하고 있어요. Apps Script 응답이 평소보다 조금 늦어요.":this.pendingAction==="nickname"?"참가 정보를 저장하고 있어요. Apps Script 응답이 평소보다 조금 늦어요.":this.pendingAction==="retry-submit"?"답안을 다시 보내고 있어요. 입력한 답은 이 기기에 안전하게 남아 있어요.":"시험 데이터를 불러오는 데 시간이 조금 걸리고 있어요. 연결은 유지되고 있습니다."}</span></div>`:""}updateConnectionFeedback(){const t=this.root.querySelector(".connection-feedback");t&&(t.hidden=!this.slowBackgroundRefresh,t.textContent=this.slowBackgroundRefresh?"최신 시험 상태 확인이 늦어지고 있어요. 입력한 답은 이 기기에 계속 저장됩니다.":"")}renderNavigation(t){const e=(s,i,n)=>`<a href="${s}" class="nav__link ${n?"is-active":""}">${i}</a>`;return`
      <header class="site-header">
        <a class="brand" href="#/exam">KBS 시사상식</a>
        <nav class="nav" aria-label="주요 메뉴">
          ${e("#/exam","시험",t==="exam")}
          ${e("#/history","지난 회차",t==="history")}
          ${e("#/admin","관리",t==="admin")}
        </nav>
      </header>
    `}renderLoading(){return`
      <section class="status-screen" aria-live="polite">
        <span class="pulse-dot" aria-hidden="true"></span>
        <h1>시험 상태를 확인하고 있어요</h1>
        <p>잠시만 기다려주세요.</p>
      </section>
    `}renderExam(){const t=this.bootstrapData,e=t?.currentRound;if(!t||!e)return this.renderEmpty("지금 진행 중인 시험이 없어요","다음 시험이 시작되면 여기에서 바로 참여할 수 있어요.");if(!this.session||this.editingNickname)return["WAITING","FIRST_TEST"].includes(e.status)?this.renderNickname(e):e.status==="FINISHED"?this.renderFinished(e,t):this.renderEmpty("이미 시험이 진행 중이에요","다음 회차가 시작되면 닉네임을 입력하고 참여할 수 있어요.");switch(e.status){case"WAITING":return this.renderWaiting(e);case"FIRST_TEST":return this.renderQuiz(e,t.questions,1);case"REVIEW":return this.renderReview(e,t.firstResult);case"RETEST":return t.eligibleForRetest?this.renderQuiz(e,t.questions,2):this.renderEmpty("재시험에 참여할 수 없어요","1차 시험 제출 기록을 찾지 못했어요.");case"FINISHED":return this.renderFinished(e,t)}}renderNickname(t){const e=this.pendingAction==="nickname";return`
      <section class="narrow-panel">
        <p class="eyebrow">${a(t.title)}</p>
        <h1>오늘 시험에 참여할 이름을 알려주세요</h1>
        <p class="lead">시험 결과와 랭킹에 이 이름으로 표시돼요. 같은 이름도 괜찮아요.</p>
        <form class="stack" data-form="nickname">
          <label class="field-label" for="nickname">닉네임</label>
          <input id="nickname" name="nickname" maxlength="20" autocomplete="nickname" required ${e?"disabled":""}
            value="${a(this.pendingNickname||this.session?.nickname||"")}" placeholder="닉네임을 입력해요" />
          <button class="button button--primary" type="submit" ${e?"disabled":""}>${e?'<span class="spinner" aria-hidden="true"></span> 저장하고 있어요':"시험 준비하기"}</button>
        </form>
      </section>
    `}renderWaiting(t){return`
      <section class="status-screen">
        <p class="eyebrow">${a(t.title)}</p>
        <span class="pulse-dot" aria-hidden="true"></span>
        <h1>곧 시험이 시작돼요</h1>
        <p>시작 안내가 나오면 바로 문제를 풀 수 있어요.</p>
        <p class="status-meta">${a(this.session?.nickname)} · 시험 시작을 기다리고 있어요</p>
        <button class="button button--text" data-action="edit-nickname" type="button">이름 바꾸기</button>
      </section>
    `}getOrderedQuestions(t,e){if(e===1||!this.session||!this.bootstrapData?.currentRound)return[...t].sort((o,u)=>o.order-u.order);const s=this.bootstrapData.currentRound.roundId,i=this.storage.getRetestOrder(s,this.session.participantId)??void 0,n=T(t,this.session.participantId,i);return this.storage.saveRetestOrder(s,this.session.participantId,n.order),n.questions}renderQuiz(t,e,s){if(!this.session)return"";const i=this.getOrderedQuestions(e,s);if(!i.length)return this.renderEmpty("문제를 불러오지 못했어요","잠시 후 다시 확인해주세요.");this.currentQuestionIndex=Math.min(this.currentQuestionIndex,i.length-1);const n=i[this.currentQuestionIndex],o=this.storage.getAnswers(t.roundId,this.session.participantId,s),u=s===1?"1차 시험":"재시험";return`
      <section class="quiz" aria-labelledby="quiz-title">
        <header class="quiz__header">
          <div>
            <p class="eyebrow">${a(t.title)}</p>
            <h1 id="quiz-title" class="quiz__title">${u}</h1>
          </div>
          <p class="quiz__progress" aria-live="polite">${this.currentQuestionIndex+1} / ${i.length}</p>
        </header>
        <div class="progress-track" aria-hidden="true"><span style="width:${(this.currentQuestionIndex+1)/i.length*100}%"></span></div>
        <article class="question" data-question-id="${a(n.questionId)}">
          <p class="question__number">${String(this.currentQuestionIndex+1).padStart(2,"0")}</p>
          <h2 class="question__text">${a(n.question)}</h2>
          <label class="field-label" for="answer">내 답</label>
          <input id="answer" class="answer-input" data-answer="${a(n.questionId)}" maxlength="200"
            autocomplete="off" value="${a(o[n.questionId]??"")}" placeholder="답을 입력해요" />
        </article>
        <footer class="quiz-actions">
          <button class="button button--secondary" data-action="previous-question" type="button" ${this.currentQuestionIndex===0?"disabled":""}>이전</button>
          <button class="button button--primary" data-action="next-question" type="button" ${this.currentQuestionIndex===i.length-1?"disabled":""}>다음</button>
        </footer>
        <p class="quiet-copy">시험이 끝나면 지금 적힌 답이 자동으로 제출돼요.</p>
      </section>
    `}renderReview(t,e){return this.submittingAttempt===1||!e?`
        <section class="status-screen">
          <p class="eyebrow">${a(t.title)}</p>
          <span class="pulse-dot" aria-hidden="true"></span>
          <h1>답안을 제출하고 있어요</h1>
          <p>잠시만 기다려주세요.</p>
          ${this.message?'<button class="button button--secondary" data-action="retry-submit" type="button">다시 제출해요</button>':""}
        </section>
      `:`
      <section class="review">
        <p class="eyebrow">${a(t.title)} · 1차 시험 결과</p>
        <h1 class="score">${e.score} <span>/ ${e.total}</span></h1>
        <p class="lead">틀린 문제부터 천천히 다시 확인해보세요.</p>
        <div class="review-list">${e.items.map((s,i)=>this.renderReviewItem(s,i)).join("")}</div>
      </section>
    `}renderReviewItem(t,e){return`
      <article class="review-item">
        <p class="question__number">${String(e+1).padStart(2,"0")}</p>
        <h2>${a(t.question)}</h2>
        <div class="answer-grid">
          <div><p class="data-label">내 답</p><p>${a(t.response||"미응답")}</p></div>
          <div><p class="data-label">결과</p><p class="${t.isCorrect?"correct":"needs-review"}">${t.isCorrect?"정답이에요":"다시 확인해볼 문제예요"}</p></div>
        </div>
        <div class="explanation">
          <p class="data-label">정답</p><p>${a(t.answer)}</p>
          ${t.description?`<p class="data-label">해설</p><p>${a(t.description)}</p>`:""}
        </div>
      </article>
    `}renderFinished(t,e){const s=e.firstResult,i=e.retestResult,n=s&&i?i.score-s.score:0;return`
      <section class="status-screen finished">
        <p class="eyebrow">${a(t.title)}</p>
        <h1>오늘 시험이 모두 끝났어요</h1>
        ${s?`<div class="result-line"><span>1차 시험</span><strong>${s.score} / ${s.total}</strong></div>`:""}
        ${i?`<div class="result-line"><span>재시험</span><strong>${i.score} / ${i.total}</strong></div>`:""}
        ${n>0?`<p class="accent-copy">처음보다 ${n}문제를 더 맞혔어요.</p>`:""}
        ${this.submittingAttempt===2?'<p class="status-meta">재시험 답안을 제출하고 있어요.</p>':""}
        <a class="button button--primary" href="#/history/${encodeURIComponent(t.roundId)}">지난 회차 보기</a>
      </section>
    `}renderHistory(){return this.historyData.length?`
      <section class="content-list">
        <header class="page-heading"><p class="eyebrow">ARCHIVE</p><h1>지난 회차</h1></header>
        <div class="round-list">
          ${this.historyData.map(t=>`
            <a class="round-row" href="#/history/${encodeURIComponent(t.roundId)}">
              <strong>${a(t.title)}</strong>
              <span>${a(f(t.date))}</span>
              <span>${t.questionCount}문제${t.participantCount===void 0?"":` · ${t.participantCount}명`}</span>
            </a>
          `).join("")}
        </div>
      </section>
    `:this.renderEmpty("아직 지난 시험이 없어요","첫 시험이 끝나면 문제와 결과를 여기에서 볼 수 있어요.")}renderRoundDetail(){const t=this.detailData;if(!t)return this.renderEmpty("이 시험을 찾을 수 없어요","지난 회차 목록에서 다시 선택해주세요.");const e=t.questions.length>0&&this.openExplanations.size===t.questions.length;return`
      <section class="detail">
        <a class="back-link" href="#/history">← 지난 회차</a>
        <header class="page-heading">
          <p class="eyebrow">${a(f(t.round.date))} · ${t.round.questionCount}문제</p>
          <h1>${a(t.round.title)}</h1>
        </header>
        <section class="ranking" aria-labelledby="ranking-title">
          <h2 id="ranking-title">1차 시험 랭킹</h2>
          <div class="ranking-table" role="table" aria-label="1차 시험 랭킹">
            <div class="ranking-row ranking-row--header" role="row"><span>순위</span><span>점수</span><span>닉네임</span></div>
            ${t.ranking.map(s=>`<div class="ranking-row" role="row"><strong class="${s.rank===1?"rank-first":""}">${s.rank}</strong><span>${s.score} / ${s.total}</span><span>${a(s.nickname)}</span></div>`).join("")}
          </div>
        </section>
        <section class="archive-questions" aria-labelledby="questions-title">
          <div class="section-heading">
            <h2 id="questions-title">문제 ${t.questions.length}개</h2>
            <label class="check-label"><input type="checkbox" data-action="toggle-all" ${e?"checked":""} /> 전체 정답·해설 보기</label>
          </div>
          ${t.questions.map((s,i)=>{const n=this.openExplanations.has(s.questionId);return`<article class="archive-question">
              <p class="question__number">${String(i+1).padStart(2,"0")}</p>
              <h3>${a(s.question)}</h3>
              <label class="check-label"><input type="checkbox" data-explanation="${a(s.questionId)}" ${n?"checked":""} /> 정답·해설 보기</label>
              ${n?`<div class="explanation"><p class="data-label">정답</p><p>${a(s.answer)}</p>${s.description?`<p class="data-label">해설</p><p>${a(s.description)}</p>`:""}</div>`:""}
            </article>`}).join("")}
        </section>
      </section>
    `}renderAdmin(){if(!sessionStorage.getItem(c)){const o=this.pendingAction==="admin-login";return`
        <section class="narrow-panel">
          <p class="eyebrow">ADMIN</p><h1>시험 관리</h1>
          <p class="lead">관리자 코드를 입력해주세요.</p>
          <form class="stack" data-form="admin-login">
            <label class="field-label" for="admin-code">관리자 코드</label>
            <input id="admin-code" name="code" type="password" autocomplete="current-password" required ${o?"disabled":""} />
            <button class="button button--primary" type="submit" ${o?"disabled":""}>${o?'<span class="spinner" aria-hidden="true"></span> 확인하고 있어요':"관리 화면 열기"}</button>
          </form>
        </section>
      `}const e=this.bootstrapData?.currentRound;if(!e)return this.renderEmpty("관리할 회차가 없어요","시트에서 새 회차를 준비해주세요.");const s=R(e.status),i=this.pendingAction==="transition",n={WAITING:"1차 시험 시작",FIRST_TEST:"1차 시험 종료",REVIEW:"재시험 시작",RETEST:"재시험 종료",FINISHED:""};return`
      <section class="narrow-panel admin-panel">
        <p class="eyebrow">현재 회차</p>
        <h1>${a(e.title)}</h1>
        <p class="lead">현재 ${p(e.status)} 단계예요.</p>
        ${s?`<button class="button button--primary" data-action="prepare-transition" data-target="${s}" type="button" ${i?"disabled":""}>${i?'<span class="spinner" aria-hidden="true"></span> 변경하고 있어요':n[e.status]}</button>`:'<p class="status-meta">이 회차의 시험이 모두 끝났어요.</p>'}
        <button class="button button--text" data-action="admin-logout" type="button" ${i?"disabled":""}>관리 화면 닫기</button>
        ${this.pendingTransition?this.renderTransitionConfirm(e,this.pendingTransition):""}
      </section>
    `}renderTransitionConfirm(t,e){const s=e==="REVIEW"||e==="FINISHED",i=this.pendingAction==="transition";return`
      <div class="confirm-panel" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">${s?`${p(t.status)}을 끝낼까요?`:`${p(e)}을 시작할까요?`}</h2>
        <p>${s?"모든 참가자의 현재 입력을 잠그고 답안을 제출해요.":"참가자 화면이 다음 단계로 바뀌어요."}</p>
        <div class="confirm-actions">
          <button class="button button--secondary" data-action="cancel-transition" type="button" ${i?"disabled":""}>계속 진행해요</button>
          <button class="button button--primary" data-action="confirm-transition" data-target="${e}" type="button" ${i?"disabled":""}>${i?'<span class="spinner" aria-hidden="true"></span> 처리하고 있어요':s?"시험을 끝내요":"시작해요"}</button>
        </div>
      </div>
    `}renderEmpty(t,e){return`<section class="status-screen"><h1>${a(t)}</h1><p>${a(e)}</p></section>`}async handleClick(t){const e=t.target.closest("[data-action]");if(!e)return;const s=e.dataset.action;if(s==="edit-nickname")this.editingNickname=!0,this.render();else if(s==="previous-question")this.currentQuestionIndex=Math.max(0,this.currentQuestionIndex-1),this.renderAndFocusAnswer();else if(s==="next-question")this.currentQuestionIndex+=1,this.renderAndFocusAnswer();else if(s==="retry-submit"){if(!this.beginAction("retry-submit"))return;try{await this.handlePhaseSubmission()}finally{this.finishAction()}}else if(s==="prepare-transition")this.pendingTransition=e.dataset.target,this.render();else if(s==="cancel-transition")this.pendingTransition=null,this.render();else if(s==="confirm-transition"){if(!this.beginAction("transition"))return;try{await this.performTransition(e.dataset.target)}finally{this.finishAction()}}else s==="admin-logout"&&(sessionStorage.removeItem(c),this.pendingTransition=null,this.render())}async handleSubmit(t){const e=t.target;if(!e.dataset.form)return;t.preventDefault();const s=new FormData(e);if(e.dataset.form==="nickname"){const i=String(s.get("nickname")??"").trim();if(!i||i.length>20||!this.bootstrapData?.currentRound)return;if(this.pendingNickname=i,!this.beginAction("nickname")){this.pendingNickname="";return}try{this.session=this.session?this.storage.updateNickname(this.session,i):this.storage.createSession(this.bootstrapData.currentRound.roundId,i),this.editingNickname=!1,await this.loadRoute(!0)}finally{this.finishAction()}}else if(e.dataset.form==="admin-login"){const i=String(s.get("code")??"");if(!this.beginAction("admin-login"))return;try{const n=await this.api.adminLogin(i);sessionStorage.setItem(c,n.adminToken),this.message=""}catch(n){this.message=this.friendlyError(n,"관리자 코드를 확인해주세요.")}finally{this.finishAction()}}}handleInput(t){const e=t.target,s=e.dataset.answer,i=this.bootstrapData?.currentRound;if(!s||!i||!this.session)return;const n=i.status==="RETEST"?2:1;this.storage.saveAnswer(i.roundId,this.session.participantId,n,s,e.value)}handleChange(t){const e=t.target;if(e.dataset.action==="toggle-all"&&this.detailData){this.openExplanations=e.checked?new Set(this.detailData.questions.map(i=>i.questionId)):new Set,this.render();return}const s=e.dataset.explanation;s&&(e.checked?this.openExplanations.add(s):this.openExplanations.delete(s),this.render())}async performTransition(t){const e=this.bootstrapData?.currentRound,s=sessionStorage.getItem(c);if(!(!e||!s))try{const i=await this.api.transition(e.roundId,t,s);m(e.roundId,e.status,i.currentRound?.roundId,i.currentRound?.status)&&(this.currentQuestionIndex=0),this.bootstrapData=i,this.pendingTransition=null,this.message=""}catch(i){const n=i;(n.code==="ADMIN_TOKEN_INVALID"||n.code==="ADMIN_TOKEN_EXPIRED")&&sessionStorage.removeItem(c),this.message=this.friendlyError(i)}}renderAndFocusAnswer(){this.render(),window.requestAnimationFrame(()=>document.querySelector("#answer")?.focus())}syncIndeterminateCheckbox(){if(!this.detailData)return;const t=this.root.querySelector('input[data-action="toggle-all"]');t&&(t.indeterminate=this.openExplanations.size>0&&this.openExplanations.size<this.detailData.questions.length)}}const y=document.querySelector("#app");if(!y)throw new Error("앱을 표시할 영역을 찾지 못했습니다.");const A=new k(y);A.start();
//# sourceMappingURL=index-BnIqWIzS.js.map
