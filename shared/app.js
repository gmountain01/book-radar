// ━━━ Claude API 키 설정 ━━━
// 아래 CLAUDE_API_KEY에 실제 키를 입력하면 UI 입력 없이 자동 사용됩니다.
// 키는 이 파일에만 저장되므로 파일을 공유할 때 주의하세요.
const CLAUDE_API_KEY = '';  // 예: 'sk-ant-api03-...'

// ━━━ API 키 세션 저장소 ━━━
// sessionStorage 사용: 탭/창 닫으면 자동 삭제 — 다중 사용자 환경에 적합.
// 같은 탭 내에서는 패널 이동 후에도 유지됨.
const _SESSION_AK = 'ub_session_ak';
// 이전 버전 호환성용 키 이름 (마이그레이션 후 삭제)
const _AK_STORE = 'ub_ak_enc';
const _AK_SALT_STORE = 'ub_ak_salt';

async function saveApiKey(rawKey) {
  if (!rawKey || !rawKey.trim()) {
    sessionStorage.removeItem(_SESSION_AK);
    return;
  }
  sessionStorage.setItem(_SESSION_AK, rawKey.trim());
  // 이전 localStorage 잔재 정리 (보안)
  try {
    localStorage.removeItem(_AK_STORE);
    localStorage.removeItem(_AK_SALT_STORE);
    localStorage.removeItem('ub_apikey');
  } catch(e) {}
}

async function loadApiKey() {
  if (CLAUDE_API_KEY) return CLAUDE_API_KEY;
  // sessionStorage 우선
  const session = sessionStorage.getItem(_SESSION_AK);
  if (session) return session;
  // 이전 localStorage 평문 마이그레이션
  try {
    const plain = localStorage.getItem('ub_apikey');
    if (plain) { await saveApiKey(plain); return plain; }
  } catch(e) {}
  // 이전 AES-GCM 암호화 저장소 마이그레이션
  try {
    const saltB64 = localStorage.getItem(_AK_SALT_STORE);
    const stored  = localStorage.getItem(_AK_STORE);
    if (saltB64 && stored) {
      const enc2 = new TextEncoder();
      const km = await crypto.subtle.importKey(
        'raw', enc2.encode('hb_pub_tool_2026_' + window.location.hostname),
        { name: 'PBKDF2' }, false, ['deriveKey']
      );
      const b64d = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
      const salt = b64d(saltB64);
      const dk = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
      );
      const { iv, data } = JSON.parse(stored);
      const dec = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: b64d(iv) }, dk, b64d(data)
      );
      const recovered = new TextDecoder().decode(dec);
      await saveApiKey(recovered); // sessionStorage로 마이그레이션 후 localStorage 삭제
      return recovered;
    }
  } catch(e) {}
  return '';
}

const CATS=[
  ['AI 교육/교사',['에듀테크 5대장','에듀테크 활용','교사를 위한 ai','교사를 위한 에듀테크','요즘 교사를 위한','요즘 유치원 교사','선생님을 위한','교실로 on','교실에서 바로 쓰는','ai 수업 활용','ai 디지털 수업','ai 학교 수업','ai로 날개를 달다','ai 교육 트렌드','ai 디지털 교육 트렌드','교육과정 평가, ai','2022 개정 교육과정','열정민쌤','챗gpt 교사','챗gpt&ai 수업','선생님의 시간','생성형ai 활용법 with 챗','notebooklm 실전','유아교사','유아디지털교육','대학생을 위한 에듀테크','ai 시대 예비 교사','ai 디지털 활용 수업','스마트폰이 사라진 교실','무조건 도움되는 유아','인공지능 윤리 수업','사서교사']],
  ['제미나이',['제미나이','gemini']],
  ['챗GPT',['챗gpt','chatgpt','gpts']],
  ['클로드/Claude',['클로드 코드','claude code','클로드 mcp','이게 되네? 클로드','클로드 ai','cowork부터 code']],
  ['바이브코딩',['바이브 코딩','바이브코딩','vibe cod']],
  ['커서/코덱스/코파일럿/안티그래비티',['커서 ai','cursor ai','커서로','코덱스 cli','codex cli','코파일럿','copilot','cursor.ai','안티그래비티','안티그래피티','antigravity']],
  ['MCP/AI에이전트',['mcp','ai 에이전트','ai agent','langchain','langgraph','a2a×','rag adk','멀티 에이전트','agentops','agentic','graphrag','graph rag','multi-agent','온톨로지 기반','rag','에이전트 개발','에이전트 구현','에이전트 시스템','에이전트 군단']],
  ['LLM/프롬프트엔지니어링',['llm','프롬프트 엔지니어링','프롬프트 텔링','프롬프트를 만드는','프롬프트 엔지니어의','파인튜닝','fine-tuning','slm','벡터 임베딩','컨텍스트 엔지니어링','context engineering','멀티모달']],
  ['AI 영상/이미지생성',['미드저니','midjourney','comfyui','나노바나나','나노 바나나','ai 영상 제작','ai 쇼츠','수노로 시작','소라 2 ai','런웨이','vrew','브루','ai 작곡','ai 사진','ai 이미지 만들기','ai bx','ai 비주얼 영상','ai 영상 마스터','ai 영상으로','영상 제작 입문','ai 영상 아카데미','stable diffusion','stable','이미지 생성','영상 생성','elevenlabs','음성 ai']],
  ['AI 일반/트렌드',['ai 강의','ai 2026','ai 2041','agi의 시대','특이점이 시작','ai 전쟁','ai 다음 물결','피지컬 ai','ai 워커스','ai력','ai는 인간을','ai 이후의 세계','기계는 왜 학습','나의 다정한 ai','ai는 세상을','도덕적인 ai']],
  ['AI 통합 활용서',['챗gpt·퍼플렉시티','챗gpt와 ai','gpt, 제미나이','gpt·제미나이','gpt·클로드','클로드·코파일럿','퍼플렉시티·클로드','챗gpt·코파일럿','챗gpt+소라','클로드 코드·코덱스','with gpt, 제미나이','7가지 생성 ai','생성형 ai 활용 백과','ai 팀원이 다 해줌','오픈클로 with','다 잘함','perplexity','ai 생산성','ai 실무','업무 자동화 ai','ai 문서 작성','ai 대필','ai 아웃소싱','ai 서비스 기획','ai 기반 신제품','카드뉴스 이미지+텍스트','생산성 200%','ai로 완성하는','ai로 정복','ai로 코딩','ai로 찾는','ai 취업','ai 스타트업']],
  ['AI 활용/비즈니스',['비전공자도 이해할 수 있는 ai','ai 엔지니어링','ai 프로덕트','ai 프로젝트 100%','ai로 7일 만에','ai 비즈니스 트렌드','ai 리터러시','ai 게임 개발','요즘 당근 ai','요즘 우아한 ai','생성형 ai 첫걸음','생성형 ai 활용과 실습','생성형 ai를 활용한','생성형 ai 프롬프트 디자인','슬기로운 ai 생활','aeo','geo 생존']],
  ['인공지능 입문',['인공지능 입문','처음 만나는 인공지능','난생처음 인공지능','인공지능 스타트','인공지능 첫걸음','인공지능 abc','체험 인공지능','인공지능 시대의','인공지능 1 ','인공지능 2 ','인공지능은 왜','인공지능이 답할','인공지능과 ','컴퓨터 공학 지식','컴퓨터공학 복수전공']],
  ['파이썬',['파이썬','python']],
  ['자바',['명품 java','혼자 공부하는 자바','혼자 만들면서 공부하는 자바','이것이 자바','난생처음 자바','파워 자바','자바 객체','자바 마스터','자바로 배우는','java programming','java essential','이펙티브 자바','자바와 함께','모던 자바 동시성','자바 orm','do it! 자바']],
  ['자바스크립트/웹프론트',['자바스크립트','javascript','모던 자바스크립트','리액트','react','vue','typescript','타입스크립트','html + css','html5 + css','html5 웹 프로그래밍','웹 표준의 정석','프런트엔드','코어 프런트엔드','html & css for beginner','next.js','프론트엔드 심화','프론트엔드 수업','프론트엔드 pre academy','웹 개발 바이블','프론트엔드 심화캠프','시그니처 프론트엔드']],
  ['C언어/C++/C#',['c언어','c 언어','c++','c#','열혈 c ','열혈 c+','perfect c','core c']],
  ['스프링/백엔드',['스프링','spring','백엔드 개발','주니어 백엔드','부트캠프 백엔드','node.js','jsp 자바 웹','도커','docker','kubernetes','쿠버네티스','aws 잘하는','클라우드 플랫폼 인프라','msa','대용량 트래픽','대규모 채팅','대용량 아키텍처','golang']],
  ['모바일/앱개발',['안드로이드','android','플러터','flutter','코틀린','kotlin','앱 프로그래밍','앱 개발','앱 창업','앱 인벤터','1인 개발 수익화','ios 코드 설계','jetpack compose','개인 앱','앱 아키텍처']],
  ['Git/버전관리',['깃','git','github','깃허브']],
  ['알고리즘/자료구조/코딩테스트',['알고리즘','자료구조','코딩 테스트','코딩테스트','코딩 인터뷰','알고리즘 문제 해결','introduction to algorithms']],
  ['개발실무/CS교양',['클린 코드','clean code','리팩터링','헤드 퍼스트 디자인 패턴','오브젝트','가상 면접 사례','대규모 시스템 설계','시스템 설계 수업','요즘 개발자를 위한 시스템','컴퓨터 밑바닥','미래를 바꾼 아홉','이것이 취업을 위한 코딩','파인만의 컴퓨터','소프트웨어 아키텍처','개발자를 위한 필수 수학','우리, 프로그래머들','미니멀리즘 프로그래머','생각하게 하지 마','코드 (화이트 에디션)','시스템 성능 엔지니어링','일 잘하는 엔지니어','데이터 중심 애플리케이션','패턴 랭귀지','배민 기술이사','데브캠프']],
  ['노코드/자동화',['n8n','make.com','zapier','노코드','no-code','워크플로 자동화','rpa','업무 자동화','자동화 혁신','오토핫키','autohotkey','파워 오토메이트','power automate']],
  ['머신러닝/딥러닝',['머신러닝','딥러닝','deep learning','핸즈온 머신러닝','밑바닥부터 시작하는 딥러닝','파이토치','pytorch','텐서플로','tensorflow','강화학습','단단한 강화학습','기계 학습','yolo','nerf','computer vision']],
  ['데이터분석',['데이터 분석','데이터분석','데이터 과학','빅데이터','린 분석','최소한의 데이터 리터러시','데이터 시각화','데이터 파이프라인','elasticsearch','spark','kafka','flink','데이터와 말하기','data driven','데이터로 승부']],
  ['데이터베이스/SQL',['데이터베이스','sql','oracle','mysql','nosql','postgresql','친절한 sql','real mysql']],
  ['통계분석(R/SPSS/MATLAB)',['spss','amos','r 데이터','r코딩','r을 활용','쉽게 배우는 r ','matlab','매트랩','r을 이용','통계분석','통계학','생활속의 통계','현대기초통계']],
  ['수학',['이산수학','선형대수','확률과 통계','기초수학','수치해석','공학수학','인공지능을 위한 수학','인공지능 수학','ai 딥러닝 수학','머신러닝을 위한 수학','논문 통계분석']],
  ['네트워크',['컴퓨터 네트워크','데이터통신과 네트워킹','네트워크 기초','네트워크 개론','한 권으로 끝내는 네트워크','모두의 네트워크','tcp/ip','wireshark','혼자 공부하는 네트워크','후니의 쉽게 쓴 시스코','손에 잡히는 데이터 통신','데이터 통신','네트워크와 보안 핵심']],
  ['리눅스/운영체제',['리눅스','linux','rocky linux','우분투','ubuntu','운영체제','operating system','os 개념']],
  ['보안/정보보호',['정보보호','정보보안','해킹과 보안','보안 개론','네트워크 보안','암호학','사이버','리버싱','포렌식','보이지 않는 위협']],
  ['클라우드/인프라',['클라우드','인프라 구조','인프라 엔지니어','devops','한 권으로 끝내는 it 인프라','aws 입문','서비스 운영','장애율 0%','장애 대응']],
  ['컴퓨터구조/하드웨어',['컴퓨터구조','컴퓨터 구조','논리회로','디지털 논리','반도체 공학','마이크로컨트롤러','아두이노','arduino','라즈베리파이','raspberry','iot','임베디드','avr','esp32','mano의 컴퓨터','전자회로','자율주행','ros 2','로봇 개발','로봇 비전','fpga','soc 설계','차량용 반도체','로봇 공학','로봇 행동','로봇 코딩']],
  ['컴퓨터개론/SW공학',['컴퓨터 개론','it 세상을 만나는','소프트웨어 공학','소프트웨어 테스트','컴퓨터 사이언스','컴퓨터 과학','정보통신 배움터','4차 산업혁명과 정보통신','컴퓨터 활용과 실습','디지털 콘텐츠 기획','멀티미디어 배움터','초융합 시대의 멀티미디어','컴퓨터 공학 지식','컴퓨터공학 복수전공']],
  ['엑셀',['엑셀','excel','회사에서 바로 통하는 엑셀','누구나 아는 나만 모르는 엑셀','진짜 쓰는 실무 엑셀','엑셀 대신','오빠두','엑셀마왕','회사는 엑셀을','보고서 & 프레젠테이션','승인 받는 ai 문서','연봉을 올리는 보고서','보고서 작성']],
  ['오피스(파워포인트/워드/한글)',['파워포인트','powerpoint','한글 2022','한글 2021','한글 20','실무 엑셀 파워포인트','mos ']],
  ['업무생산성/구글',['구글 시트','구글 스프레드','구글 클래스룸','구글 활용법','업무 생산성','굿노트','스마트 노트','제텔카스텐','일센스','신입 때 알았더라면','논문 3배']],
  ['노션',['노션','notion','나의 첫 노션','처음이지만 프로처럼 쓰는 노션','선생님을 위한 노션','스프레드 시트 with 노션']],
  ['옵시디언',['옵시디언','obsidian','세컨드 브레인은 옵시디언']],
  ['포토샵/일러스트레이터',['포토샵','photoshop','일러스트레이터','illustrator','맛있는 디자인 포토','무작정 따라하기 포토','진짜 쓰는 일러스트']],
  ['피그마/UX·UI',['피그마','figma','ux/ui','ux·ui','ui/ux','디자인 시스템','사용자를 사로잡는 ux','ux 디자인','ux 라이팅','ux 리서치','ux로 만드는','ux를','ux 사용자','팔리는 ux','모바일 ux','사용자 경험','데이터 삽질 끝에 ux',' ux']],
  ['영상편집',['프리미어 프로','애프터 이펙트','after effect','맛있는 디자인 프리미어','진짜 쓰는 프리미어','final cut']],
  ['디자인이론',['타이포그래피','디자인 구구단','디자인 감각','색 잘 쓰는','버려지는 디자인','좋아 보이는 것들','디자인 심리','처음 배우는 명암','빛과 색','친절한 빛과 색','월스트리트저널 인포그래픽','디자인, 이것만 알면','ai 잘 쓰는 디자이너','ai 디자인','그래픽 디자이너','고감도 ai bx']],
  ['캔바/미리캔버스',['캔바','canva','미리캔버스','캔바 ai']],
  ['인디자인',['인디자인','indesign','편집 디자인','책 만들기 with 인디자인']],
  ['오토캐드/3D모델링',['autocad','오토캐드','catia','solidworks','revit','스케치업','sketchup','3d 초급자','maya 2026','fusion','inventor','건축 & 조경','조경디자인']],
  ['드로잉/이모티콘',['드로잉','작화 기술','캐릭터 얼굴','아이패드 드로잉','프로크리에이트','이모티콘 작가','이모티콘 승인','오늘부터 이모티콘','카카오톡 이모티콘','픽셀아트','일러스트 향상 강좌','잘 그리는 사람','다테나오토','로호의 배경 일러스트','최고의 그림을 그리는','빛과 그림자 그리기']],
  ['유튜브/영상마케팅',['유튜브 채널','유튜브 쇼츠','유튜브 영상 만들기','조회수 터지는','스마트폰 촬영','7가지 생성 ai로 영상','ai 영상 제작 with','유튜브 크리에이터','유튜브 수익화','유튜브 훈련소','유튜브 알고리즘','유튜브 운영','유튜브 마케팅']],
  ['블로그/SNS마케팅',['네이버 블로그','블로그 with','네이버 3대장','팔리는 블로그','하루 30분! 돈이 되는 네이버','스레드 운영법','sns 마케팅','인스타그램 릴스','ai 상위 노출','리텐션 마케팅','상품기획','마케팅의 본질','판을 짜는 기술','팔지 않고','더 비싸게 파는','마케팅 ai 실무']],
  ['전자상거래/창업',['스마트스토어','쿠팡에서','엣시','구매대행','네이버 스마트플레이스','1인 앱 창업','0원으로 시작해서','쿠썸','쿠팡으로']],
  ['그로스해킹/스타트업',['그로스 해킹','린 스타트업','제로클릭','진화된 마케팅 그로스']],
  ['게임개발',['유니티','unity','게임 프로그래밍','게임 기획','게임 시나리오','로블록스','unreal','언리얼','레트로의 유니티','게임 디자인','게임 수학','라프 코스터','재미이론','페르시아의 왕자','인디게임 개발','방치형 rpg']],
  ['코딩입문/교육',['엔트리','스크래치','블록 코딩','sw코딩','코딩창의','코딩과 스토리텔링','앱 인벤터','this is coding']],
  ['수험/자격증',['sqld','정보처리기사','aice','csts','리눅스마스터','코딩자격']],
  ['사진/카메라',['dslr','미러리스','스마트폰 사진 촬영','사진 보정','사진종합']],
  ['웹소설/창작',['웹소설','웹툰','만화를 위한','스토리텔링 우동이즘','창작 본능']],
  ['마인크래프트',['마인크래프트','minecraft']],
  ['캡컷/영상편집앱',['캡컷','capcut','키네마스터','비바비디오']],
  ['AI 윤리/사회',['ai 윤리','ai 시대의 삶','ai와 사회복지','ai 시대의 데이터','지능정보사회와 ai','인공지능 윤리','ai는 인간을 먹고','ai 시대, 동네','컴퓨팅사고와 인공지능 리터러시','ai, 글쓰기, 저작권','도덕적인 ai','ai의 선택','ai 시대의 직업','ai와 반도체','ai와 음악','ai와 글쓰기','ai와 공공']],
  ['IT교양/비전공자',['비전공자를 위한 이해할 수 있는 it','it 지식','대체불가능','생각이란 무엇인가','슬기로운 ai 생활','감각 있는 일잘러의 it','it 세계의','코딩으로 바꾸는','우리, 프로그래머']],
  ['게임 비즈니스/기획',['게임 사업','게임 마케팅','게임 시스템 기획','레벨 디자인','내러티브 디자인','게임 기획자']],
  ['이미지처리/컴퓨터비전',['이미지 처리','컴퓨터 비전','opencv','영상 처리 바이블','딥러닝 이미지']],
  ['프로그래밍언어론',['프로그래밍 언어론','컴파일러 설계','오토마타','형식 언어']],
  ['통신/신호처리',['통신이론','신호 처리','데이터처리입문','통신 시스템','디지털 신호']],
  ['논문/학술글쓰기',['논문 작성','제대로 작성하는 논문','학술적 글쓰기','논문 쓰는','선행 논문 분석','연구 주제 찾기']],
  ['양자컴퓨터/블록체인',['양자 컴퓨터','블록체인','양자광학']],
  ['멘토시리즈',['멘토시리즈']],
];

// 강의 플랫폼: cat2 매핑 우선 → 강의명 키워드 보조
const LECTURE_CAT_MAP={
  'AI 생산성':'AI 통합 활용서',
  'AI TECH':'AI 활용/비즈니스',
  'AI/업무생산성':'AI 통합 활용서',
  'RAG & AI Agent':'MCP/AI에이전트',
  'LLM':'LLM/프롬프트엔지니어링',
  '딥러닝/머신러닝':'머신러닝/딥러닝',
  '2D/3D 이미지 생성':'AI 영상/이미지생성',
  '영상 생성':'AI 영상/이미지생성',
  '백엔드 개발':'스프링/백엔드',
  '프론트엔드 개발':'자바스크립트/웹프론트',
  '모바일 앱 개발':'모바일/앱개발',
  '데이터분석':'데이터분석',
  '데이터 엔지니어링':'데이터분석',
  'DevOps/Infra':'클라우드/인프라',
  '반도체':'컴퓨터구조/하드웨어',
  '자율주행/로봇':'컴퓨터구조/하드웨어',
  '마케팅':'블로그/SNS마케팅',
  '엑셀/피피티/보고서':'엑셀',
  'UX/UI':'피그마/UX·UI',
  '게임 개발':'게임개발',
  '보안':'보안/정보보호',
  '네트워크':'네트워크',
  '파이썬':'파이썬',
  '자바':'자바',
  '알고리즘/자료구조':'알고리즘/자료구조/코딩테스트',
  '컴퓨터 공학/SW 엔지니어링':'컴퓨터개론/SW공학',
  '개발/데이터':'개발실무/CS교양',
  '컴퓨터비전':'이미지처리/컴퓨터비전',
};

function catLecture(r){
  const byTitle=cat(r.title);
  if(byTitle!=='기타')return byTitle;
  if(r.cat2&&LECTURE_CAT_MAP[r.cat2])return LECTURE_CAT_MAP[r.cat2];
  if(r.cat1&&LECTURE_CAT_MAP[r.cat1])return LECTURE_CAT_MAP[r.cat1];
  return '기타';
}

// 바이브코딩 + 특정 도구가 함께 언급된 경우 → 도구 카테고리 우선
// 순서: n8n·MCP 먼저, 커서 계열은 claude code보다 앞에
const VIBE_TOOL_MAP=[
  [['n8n'],'노코드/자동화'],
  [['mcp'],'MCP/AI에이전트'],
  [['나노바나나','나노 바나나'],'AI 영상/이미지생성'],
  [['cursor ai','커서 ai'],'커서/코덱스/코파일럿/안티그래비티'],
  [['코덱스','codex cli','codex'],'커서/코덱스/코파일럿/안티그래비티'],
  [['코파일럿','copilot'],'커서/코덱스/코파일럿/안티그래비티'],
  [['안티그래비티','antigravity'],'커서/코덱스/코파일럿/안티그래비티'],
  [['클로드 코드','claude code'],'클로드/Claude'],
  [['cursor','커서'],'커서/코덱스/코파일럿/안티그래비티'],
];
const VIBE_KW=['바이브 코딩','바이브코딩','vibe cod'];

// "혼자 공부하는 SQL with 챗GPT" 같이 핵심 주제 + AI 도구 조합은 주제 카테고리 우선
const SUBJECT_FIRST_MAP=[
  [['sql','데이터베이스','oracle','mysql','postgresql'],'데이터베이스/SQL'],
  [['파이썬','python'],'파이썬'],
  [['자바스크립트','javascript','리액트','react','타입스크립트','typescript'],'자바스크립트/웹프론트'],
  [['자바 ','java ','스프링','spring'],'스프링/백엔드'],
  [['엑셀','excel'],'엑셀'],
  [['포토샵','photoshop','일러스트레이터','illustrator'],'포토샵/일러스트레이터'],
  [['피그마','figma'],'피그마/UX·UI'],
  [['스프레드 시트 with 노션','with 노션 에이전트'],'노션'],
];
// AI 도구 키워드가 포함된 경우에만 주제 우선 체크
const AI_TOOL_KW=['챗gpt','chatgpt','제미나이','gemini','클로드','claude','코파일럿','copilot','ai로','with ai'];

function cat(t){
  const s=t.toLowerCase();
  // 바이브코딩 제목에 다른 도구 키워드가 함께 있으면 도구 카테고리 우선
  if(VIBE_KW.some(k=>s.includes(k))){
    for(const[kws,c]of VIBE_TOOL_MAP)if(kws.some(k=>s.includes(k)))return c;
  }
  // "SQL with 챗GPT" 패턴 — AI 도구가 포함돼 있어도 핵심 주제로 분류
  if(AI_TOOL_KW.some(k=>s.includes(k))){
    for(const[kws,c]of SUBJECT_FIRST_MAP)if(kws.some(k=>s.includes(k)))return c;
  }
  for(const[c,ks]of CATS)if(ks.some(k=>s.includes(k)))return c;
  return '기타';
}

// 출간월 형식 정규화: '2026년03월' → '2026년 03월'
function normalizeMonth(raw){
  if(!raw)return '';
  return String(raw).trim().replace(/^(\d{4}년)(\d{2}월)$/,'$1 $2');
}

// ── 데이터 ──
let bestRows=[], plannedRows=[], lectureRows=[], myPub='', compPubs=[];
let analysisData=[];

// ── 탭 전환 ──
function switchTab(i,btn){
  if(btn.classList.contains('locked'))return;
  document.querySelectorAll('#mainSidebar .nav-item').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('panel'+i).classList.add('active');
  if(i===2 && typeof AUTHOR_DATA !== 'undefined') filterAuthors();
  // 패널 활성화 훅 실행 (각 패널 JS에서 PanelRegistry.register(i, {onActivate}) 등록 시 호출됨)
  if(typeof PanelRegistry !== 'undefined') PanelRegistry.onActivate(i);
}

function toggleSidebar(){
  const sb = document.getElementById('mainSidebar');
  const collapsed = sb.classList.toggle('collapsed');
  const w = collapsed ? '52px' : '210px';
  document.documentElement.style.setProperty('--sb-w', w);
}

// ── 파일 읽기 ──
function readFile(file){
  return new Promise(r=>{
    const fr=new FileReader();
    fr.onload=e=>{const wb=XLSX.read(e.target.result,{type:'array'});r(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1}));};
    fr.readAsArrayBuffer(file);
  });
}

// ── 드래그&드롭 (출간 예정 파일만) ──
{
  const z=document.getElementById('zone2');
  if(z){
    z.addEventListener('dragover',e=>{e.preventDefault();z.classList.add('drag');});
    z.addEventListener('dragleave',()=>z.classList.remove('drag'));
    z.addEventListener('drop',e=>{
      e.preventDefault();z.classList.remove('drag');
      const f=e.dataTransfer.files[0];
      if(f) handlePlanned(f);
    });
  }
}

async function handleBest(file){
  const b64=await fileToB64(file);
  saveToLS(LS_KEYS.best, b64, file.name);
  const data=readB64(b64);
  await handleBestData(data, file.name);
}
async function handleBestFile(input){
  if(input.files[0]) await handleBest(input.files[0]);
}

async function handleBestData(data, fname){
  const hdr=data[0]||[];
  let rc=-1,tc=-1,pc=-1,sc=-1,yc=-1;
  hdr.forEach((h,i)=>{const s=String(h||'').toLowerCase();
    if(s.includes('순번')||s.includes('순위'))rc=i;
    if(s.includes('상품명')||s.includes('제목')||s.includes('도서'))tc=i;
    if(s.includes('출판사'))pc=i;
    if(s.includes('세일즈')||s.includes('sp')||s.includes('포인트'))sc=i;
    if(s.includes('출판일')||s.includes('발행일')||s.includes('출간일')||s.includes('연도')||s.includes('출간연도')||s.includes('출판연도'))yc=i;
  });
  if(tc<0||pc<0){alert('컬럼 인식 실패: 상품명·출판사 컬럼이 필요합니다.');return;}
  bestRows=[];
  const curYear=new Date().getFullYear();
  for(let i=1;i<data.length;i++){
    const r=data[i];if(!r[tc])continue;
    // 출판연도: 전용 컬럼 우선, 없으면 제목/SP 셀에서 4자리 연도 추출 시도
    let year=0;
    if(yc>=0){const m=String(r[yc]||'').match(/20\d{2}/);if(m)year=parseInt(m[0]);}
    if(!year){const m=String(r[tc]||'').match(/\(?(20\d{2})\)?/);if(m)year=parseInt(m[1]);}
    bestRows.push({rank:rc>=0?(parseInt(r[rc])||i):i,title:String(r[tc]||'').trim(),pub:String(r[pc]||'').trim(),sp:sc>=0?(parseInt(String(r[sc]||'').replace(/[^0-9]/g,''))||0):0,year});
  }
  const pubs=[...new Set(bestRows.map(r=>r.pub))].sort();
  document.getElementById('myPub').innerHTML=pubs.map(p=>`<option value="${p}">${p} (${bestRows.filter(r=>r.pub===p).length}권)</option>`).join('');
  document.getElementById('compSel').innerHTML=pubs.map(p=>`<option value="${p}">${p}</option>`).join('');
  showStatus('1',fname,`${bestRows.length}행 · ${pubs.length}개 출판사`);
  onMyPubChange();
  checkRun();
}

// ── 강의 플랫폼 업로드 ──
async function handleLecture(file){
  const b64=await fileToB64(file);
  saveToLS(LS_KEYS.lecture, b64, file.name);
  const data=readB64(b64);
  await handleLectureData(data, file.name);
}
async function handleLectureFile(input){
  if(input.files[0]) await handleLecture(input.files[0]);
}

async function handleLectureData(data, fname){
  const hdr=data[0]||[];
  let svc=-1,cat1c=-1,cat2c=-1,tc=-1,pc=-1;
  hdr.forEach((h,i)=>{const s=String(h||'').toLowerCase().trim();
    if(s.includes('서비스'))svc=i;
    if(s.includes('전체 카테고리')||s==='cat1')cat1c=i;
    if(s==='카테고리'||s==='cat2'||s.includes('카테고리'))cat2c=i;
    if(s.includes('강의명')||s.includes('제목')||s.includes('강의'))tc=i;
    if(s.includes('인기도')||s.includes('수강생')||s.includes('인기'))pc=i;
  });
  // 전체카테고리 vs 카테고리 구분 (더 구체적인 것 선택)
  if(cat1c===cat2c) cat2c=-1;
  const nameCol = tc>=0?tc:(cat2c>=0?cat2c:-1);
  if(nameCol<0){alert('강의명 컬럼을 찾을 수 없습니다.\n컬럼: '+hdr.join(', '));return;}

  lectureRows=[];
  for(let i=1;i<data.length;i++){
    const r=data[i];if(!r[nameCol])continue;
    const popStr=String(r[pc]||'0').replace(/[^0-9]/g,'');
    lectureRows.push({
      service: svc>=0?String(r[svc]||'').trim():'강의플랫폼',
      cat1: cat1c>=0?String(r[cat1c]||'').trim():'',
      cat2: cat2c>=0?String(r[cat2c]||'').trim():'',
      title: String(r[nameCol]||'').trim(),
      pop: parseInt(popStr)||0,
    });
  }
  const services=[...new Set(lectureRows.map(r=>r.service))];
  showStatus('3',fname,lectureRows.length+'개 강의 · '+services.join(', '));
  checkRun();
}

// ── 출간예정 업로드 ──
const _fi2El = document.getElementById('fi2');
if(_fi2El) _fi2El.addEventListener('change',e=>{if(e.target.files[0])handlePlanned(e.target.files[0]);});

async function handlePlanned(file){
  const b64=await fileToB64(file);
  saveToLS(LS_KEYS.planned, b64, file.name);
  const data=readB64(b64);
  await handlePlannedData(data, file.name);
}

async function handlePlannedData(data, fname){
  const hdr=data[0]||[];
  let tc=-1,cc=-1,emc=-1,ac=-1,mc=-1,dc=-1;
  hdr.forEach((h,i)=>{const s=String(h||'').toLowerCase().trim();
    if(s.includes('도서명')||s==='제목'||s.includes('책제목'))tc=i;
    if(tc<0&&s.includes('제목'))tc=i;
    if(s.includes('카테고리')||s.includes('분류'))cc=i;
    if(s==='팀'||s.includes('담당팀')||s.includes('팀명'))emc=i;
    if(s.includes('저자')||s.includes('작가')||s.includes('담당자'))ac=i;
    if(s.includes('출간월')||s.includes('출간일')||s.includes('발행'))mc=i;
    if(s.includes('진행')||s.includes('상태'))dc=i;
  });
  if(tc<0){alert('도서명(제목) 컬럼을 찾을 수 없습니다.\n감지된 컬럼: '+hdr.join(', '));return;}
  plannedRows=[];
  for(let i=1;i<data.length;i++){
    const r=data[i];if(!r[tc])continue;
    plannedRows.push({
      title:String(r[tc]||'').trim(),
      category:cc>=0?String(r[cc]||'').trim():'',
      team:emc>=0?String(r[emc]||'').trim():'',
      author:ac>=0?String(r[ac]||'').trim():'',
      month:mc>=0?normalizeMonth(String(r[mc]||'').trim()):'',
      status:dc>=0?String(r[dc]||'').trim():'',
    });
  }
  const teams=[...new Set(plannedRows.map(r=>r.team).filter(Boolean))].sort();
  const tf=document.getElementById('teamSel');
  tf.innerHTML=teams.length?teams.map(t=>`<option value="${t}">${t}</option>`):'<option>팀 정보 없음</option>';
  showStatus('2',fname,`${plannedRows.length}권 · 팀 ${teams.length}개`);
  checkRun();
}

function showStatus(n,fname,meta){
  document.getElementById('zone'+n).style.display='none';
  const us=document.getElementById('us'+n);
  us.classList.add('show');
  document.getElementById('us'+n+'n').textContent=fname;
  document.getElementById('us'+n+'m').textContent=meta;
}

function checkRun(){document.getElementById('runBtn').disabled=!bestRows.length;}

// ── 비밀번호 잠금 ──
let _unlocked = false;

function runWithPW(){
  if(_unlocked){ runAll(); return; }
  const modal = document.getElementById('pw-modal');
  modal.style.display = 'flex';
  setTimeout(()=>document.getElementById('pw-input').focus(), 80);
}

function checkPW(){
  const val = document.getElementById('pw-input').value;
  if(val === ACCESS_PW){
    _unlocked = true;
    closePWModal();
    unlockTabs();
    runAll();
  } else {
    const err = document.getElementById('pw-error');
    err.textContent = '비밀번호가 올바르지 않습니다.';
    document.getElementById('pw-input').value = '';
    document.getElementById('pw-input').focus();
    setTimeout(()=>{ err.textContent=''; }, 2000);
  }
}

function closePWModal(){
  document.getElementById('pw-modal').style.display = 'none';
  document.getElementById('pw-input').value = '';
  document.getElementById('pw-error').textContent = '';
}

function unlockTabs(){
  ['tab1','tab2','tab3','tab4','tab5','tab6'].forEach(id=>{
    const btn = document.getElementById(id);
    if(!btn) return;
    btn.classList.remove('locked');
    // nav-label span만 업데이트 — textContent 직접 교체 시 span이 사라져 축소 시 텍스트 노출됨
    const label = btn.querySelector('.nav-label');
    if(label) label.textContent = label.textContent.replace(' 🔒','');
    else btn.textContent = btn.textContent.replace(' 🔒','');
  });
}


// ── 파일 로드 유틸 ──
function readB64(b64){
  const bin=atob(b64);
  const arr=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);
  const wb=XLSX.read(arr,{type:'array'});
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1});
}

function fileToB64(file){
  return new Promise(r=>{
    const fr=new FileReader();
    fr.onload=e=>r(btoa(String.fromCharCode(...new Uint8Array(e.target.result))));
    fr.readAsArrayBuffer(file);
  });
}

// ── Google Sheets 연동 ──
function parseGoogleSheetsId(url) {
  // 웹 게시 URL: /spreadsheets/d/e/{pubId}/pub...
  const pubM = url.match(/\/spreadsheets\/d\/e\/([^/?#]+)/);
  if (pubM) {
    const gidM = url.match(/[#?&]gid=(\d+)/);
    return { id: pubM[1], gid: gidM ? gidM[1] : '0', published: true };
  }
  // 일반 공유 URL: /spreadsheets/d/{id}
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) throw new Error('올바른 Google Sheets URL이 아닙니다.');
  const gidM = url.match(/[#?&]gid=(\d+)/);
  return { id: m[1], gid: gidM ? gidM[1] : '0', published: false };
}

// CSV 텍스트 직접 파싱 — SheetJS type:'string'은 한글 깨짐 발생
function parseCsvText(text) {
  const rows = [];
  const clean = text.replace(/^\uFEFF/, ''); // BOM 제거
  const lines = clean.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = [];
    let i = 0;
    while (i < line.length) {
      if (line[i] === '"') {
        let val = '', j = i + 1;
        while (j < line.length) {
          if (line[j] === '"' && line[j+1] === '"') { val += '"'; j += 2; }
          else if (line[j] === '"') { j++; break; }
          else val += line[j++];
        }
        cells.push(val);
        i = j;
        if (i < line.length && line[i] === ',') i++;
      } else {
        const end = line.indexOf(',', i);
        if (end === -1) { cells.push(line.slice(i)); break; }
        cells.push(line.slice(i, end));
        i = end + 1;
      }
    }
    rows.push(cells);
  }
  return rows;
}

// HTML 응답 감지 헬퍼 — Google 로그인/에러 페이지 등 모든 HTML 응답 탐지
function _isHtmlResponse(text) {
  const t = text.trim().toLowerCase();
  return t.startsWith('<!') || t.startsWith('<html') || t.startsWith('<head') ||
         t.startsWith('<body') || t.startsWith('<script') || t.startsWith('<meta');
}

// Google Apps Script 웹앱 URL 감지
function _isAppsScriptUrl(url) {
  return url.includes('script.google.com/macros/s/');
}

// Apps Script 웹앱 → rows[][] 정규화
// Apps Script는 Access-Control-Allow-Origin: * 반환 → file://에서도 fetch() 동작
async function _fetchAppsScript(url) {
  let resp;
  try {
    resp = await fetch(url, { cache: 'no-store' });
  } catch(e) {
    throw new Error(
      'Apps Script 접근 실패 (네트워크/CORS).\n' +
      '스크립트 배포 설정: 실행 대상 "나", 액세스 권한 "모든 사용자(익명 포함)"으로 재배포 후 다시 시도하세요.'
    );
  }
  if (!resp.ok) throw new Error('Apps Script HTTP ' + resp.status);

  const text = await resp.text();
  if (!text.trim()) throw new Error('Apps Script 빈 응답');
  if (_isHtmlResponse(text)) throw new Error('Apps Script가 HTML을 반환했습니다 — 배포 권한을 확인하세요');

  let data;
  try { data = JSON.parse(text); }
  catch(e) {
    // JSON이 아니면 CSV로 시도
    if (!_isHtmlResponse(text)) return parseCsvText(text);
    throw new Error('Apps Script 응답 파싱 실패');
  }

  // 배열 of 배열 (sheet.getDataRange().getValues()) — 그대로 반환
  if (Array.isArray(data) && Array.isArray(data[0])) {
    return data.map(row => row.map(cell => (cell == null ? '' : String(cell))));
  }

  // 배열 of 객체 (JSON.stringify 한 경우)
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
    const headers = Object.keys(data[0]);
    return [headers, ...data.map(item => headers.map(h => (item[h] == null ? '' : String(item[h]))))];
  }

  // 래핑 형식 {data: [[...]], headers: [...]} 또는 {values: [[...]]}
  if (data && typeof data === 'object') {
    if (Array.isArray(data.values)) {
      return data.values.map(row => row.map(c => (c == null ? '' : String(c))));
    }
    if (Array.isArray(data.data)) {
      const rows = data.data.map(row =>
        Array.isArray(row) ? row.map(c => (c == null ? '' : String(c))) : [String(row)]
      );
      return data.headers ? [data.headers.map(String), ...rows] : rows;
    }
  }

  throw new Error('Apps Script 응답 형식을 알 수 없습니다 (array-of-arrays 또는 array-of-objects 형식으로 반환하세요)');
}

// JSONP 방식 gviz/tq — <script> 태그 주입으로 file:// 환경 CORS 우회
// 조건: 시트가 "링크가 있는 모든 사용자 (뷰어)" 공유이어야 함
function _fetchSheetViaJsonp(fileId, gid) {
  return new Promise((resolve, reject) => {
    const cbName = '_gsCb' + Date.now() + Math.random().toString(36).slice(2, 6);
    const script = document.createElement('script');
    const timer = setTimeout(() => { cleanup(); reject(new Error('JSONP 타임아웃 (10초)'));}, 10000);

    function cleanup() {
      clearTimeout(timer);
      try { delete window[cbName]; } catch(_) {}
      try { document.head.removeChild(script); } catch(_) {}
    }

    window[cbName] = function(data) {
      cleanup();
      if (data.status === 'error') {
        const msg = data.errors?.[0]?.detailed_message || data.errors?.[0]?.message || '접근 거부';
        reject(new Error('gviz: ' + msg)); return;
      }
      try {
        const cols = (data.table?.cols || []).map(c => c.label || c.id || '');
        const rows = [cols];
        for (const row of (data.table?.rows || [])) {
          rows.push((row.c || []).map(cell => {
            if (!cell || cell.v == null) return '';
            if (typeof cell.v === 'string' && cell.v.startsWith('Date(')) return cell.f || cell.v;
            return String(cell.v);
          }));
        }
        resolve(rows);
      } catch(e) { reject(new Error('gviz 파싱 오류: ' + e.message)); }
    };

    script.onerror = () => { cleanup(); reject(new Error('JSONP 스크립트 로드 실패')); };
    script.src = `https://docs.google.com/spreadsheets/d/${fileId}/gviz/tq?tqx=reqId:1;out:json&callback=${cbName}&gid=${gid}`;
    document.head.appendChild(script);
  });
}

async function fetchSheetAsCsv(url) {
  // Apps Script 웹앱 URL은 별도 처리
  if (_isAppsScriptUrl(url)) return _fetchAppsScript(url);

  const { id, gid, published } = parseGoogleSheetsId(url);

  const candidates = [];
  if (published) {
    // 웹 게시 URL (2PACX-…): pub?output=csv
    const hasExplicitGid = /[#?&]gid=\d+/.test(url);
    if (hasExplicitGid) {
      candidates.push(`https://docs.google.com/spreadsheets/d/e/${id}/pub?output=csv&gid=${gid}`);
    } else {
      candidates.push(`https://docs.google.com/spreadsheets/d/e/${id}/pub?output=csv`);
      candidates.push(`https://docs.google.com/spreadsheets/d/e/${id}/pub?output=csv&gid=0`);
    }
  } else {
    // 일반 공유 URL: gviz/tq CSV → export → pub
    candidates.push(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`);
    candidates.push(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`);
    candidates.push(`https://docs.google.com/spreadsheets/d/${id}/pub?output=csv&gid=${gid}`);
  }

  const errors = [];
  for (const csvUrl of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const resp = await fetch(csvUrl, { cache: 'no-store', signal: controller.signal });
      clearTimeout(timer);
      if (!resp.ok) { errors.push(`HTTP ${resp.status}`); continue; }
      const text = await resp.text();
      if (!text.trim())                                            { errors.push('빈 응답'); continue; }
      if (_isHtmlResponse(text))                                   { errors.push('HTML(권한없음)'); continue; }
      if (text.includes('google.visualization.Query.setResponse')) { errors.push('gviz 오류'); continue; }
      return parseCsvText(text);
    } catch(e) {
      clearTimeout(timer);
      errors.push(e.name === 'AbortError' ? '타임아웃(8s)' : e.name === 'TypeError' ? 'CORS차단' : e.message);
    }
  }

  // fetch() 전부 실패 → JSONP 폴백 (file:// CORS 우회)
  // 일반 공유 URL(file ID)일 때만 동작 — pubhtml의 2PACX ID는 gviz/tq 미지원
  if (!published) {
    try {
      return await _fetchSheetViaJsonp(id, gid);
    } catch(je) {
      errors.push('JSONP: ' + je.message);
    }
  }

  console.error('[fetchSheetAsCsv] 실패:', { url, errors });

  // pubhtml URL에서 CORS 차단 → 일반 공유 URL 사용 안내
  if (published && errors.every(e => e.includes('CORS차단') || e.includes('HTTP'))) {
    throw new Error(
      '"웹에 게시" URL은 로컬 파일에서 CORS 차단됩니다.\n' +
      '일반 공유 URL을 대신 사용하세요:\n' +
      '공유 버튼 → "링크가 있는 모든 사용자" → 링크 복사 → 여기에 붙여넣기'
    );
  }

  const detail = errors.join(', ');
  if (errors.some(e => e.includes('HTML'))) {
    throw new Error(`접근 권한 없음 (${detail}) — 공유 설정 확인`);
  }
  throw new Error(`불러오기 실패 (${detail})`);
}

async function loadGoogleSheet(type) {
  const urlInputId = type === 'best' ? 'gs-url-best' : 'gs-url-lecture';
  const btnId      = type === 'best' ? 'gs-btn-best'  : 'gs-btn-lecture';
  const url = (document.getElementById(urlInputId)?.value || '').trim();
  if (!url) { showToast('Google Sheets URL을 입력해주세요.', 'red'); return; }
  const btn = document.getElementById(btnId);
  if (btn) { btn.disabled = true; btn.textContent = '불러오는 중…'; }
  try {
    const data = await fetchSheetAsCsv(url);
    if (type === 'best') {
      await handleBestData(data, 'Google Sheets (베스트셀러)');
      localStorage.setItem(LS_KEYS.bestSheetUrl, url);
    } else {
      await handleLectureData(data, 'Google Sheets (강의 플랫폼)');
      localStorage.setItem(LS_KEYS.lectureSheetUrl, url);
    }
    showToast('✅ Google Sheets 데이터를 불러왔습니다.', 'green');
  } catch(e) {
    showToast('❌ ' + e.message, 'red');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '불러오기'; }
  }
}

function changeGsSource(type) {
  const zoneId = type === 'best' ? 'zone1' : 'zone3';
  const usId   = type === 'best' ? 'us1'   : 'us3';
  const urlKey = type === 'best' ? LS_KEYS.bestSheetUrl : LS_KEYS.lectureSheetUrl;
  document.getElementById(zoneId).style.display = '';
  document.getElementById(usId).classList.remove('show');
  // URL 유지 (변경 후 재편집 가능)
  setTimeout(() => document.getElementById(type === 'best' ? 'gs-url-best' : 'gs-url-lecture')?.focus(), 80);
}

// Google Sheets 기본 URL — Apps Script 웹앱 방식
const DEFAULT_SHEET_URLS = {
  best:    'https://script.google.com/macros/s/AKfycbx0PRidfgLM41CLKyM6zmaNkf9_r-a3EZGxU9qicd-a_-i8K0xGGV2XH64geJwQ6k7d/exec',
  lecture: 'https://script.google.com/macros/s/AKfycbxNJHvbUpc7ceInJUcsb6aX3csS5t0och-or8PTfOEeIf99XAZpe455laF4TBgwD2fa/exec'
};

// localStorage 키
const LS_KEYS={best:'ub_best',lecture:'ub_lecture',planned:'ub_planned',bestSheetUrl:'ub_best_gs',lectureSheetUrl:'ub_lecture_gs'};
// 내장 파일 버전 — 기본 파일 교체 시 자동으로 localStorage 무효화
const LS_VERSION_KEY='ub_version';
const CURRENT_VERSION=DEFAULT_FILES.best.name+'|'+DEFAULT_FILES.lecture.name+'|'+DEFAULT_SHEET_URLS.best;

function resetDefaults(){
  if(!confirm('저장된 파일 캐시와 Google Sheets URL을 초기화하고 내장 기본 파일로 재시작할까요?')) return;
  try{
    Object.values(LS_KEYS).forEach(k=>localStorage.removeItem(k));
    localStorage.removeItem(LS_VERSION_KEY);
  }catch(e){}
  location.reload();
}

function checkLSVersion(){
  try{
    const saved=localStorage.getItem(LS_VERSION_KEY);
    if(saved!==CURRENT_VERSION){
      // 버전 불일치 → 구버전 캐시 전체 삭제
      Object.values(LS_KEYS).forEach(k=>localStorage.removeItem(k));
      localStorage.setItem(LS_VERSION_KEY,CURRENT_VERSION);
    }
  }catch(e){}
}

function saveToLS(key, b64, name){
  try{localStorage.setItem(key, JSON.stringify({b64, name}));}catch(e){
    // localStorage 용량 초과 시 조용히 실패
    console.warn('localStorage 저장 실패:', e);
  }
}

function loadFromLS(key){
  try{const s=localStorage.getItem(key);return s?JSON.parse(s):null;}
  catch(e){return null;}
}

async function loadDefaults(){
  checkLSVersion();

  // 버튼 로딩 상태
  const setLoading = (type, loading) => {
    const btn = document.getElementById(type === 'best' ? 'gs-btn-best' : 'gs-btn-lecture');
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? '로딩 중…' : '불러오기';
  };

  // 베스트셀러 + 강의 플랫폼 병렬 로드
  const bestUrl = localStorage.getItem(LS_KEYS.bestSheetUrl) || DEFAULT_SHEET_URLS.best;
  const lectureUrl = localStorage.getItem(LS_KEYS.lectureSheetUrl) || DEFAULT_SHEET_URLS.lecture;
  const urlBestEl = document.getElementById('gs-url-best');
  const urlLectureEl = document.getElementById('gs-url-lecture');
  if (urlBestEl) urlBestEl.value = bestUrl;
  if (urlLectureEl) urlLectureEl.value = lectureUrl;
  setLoading('best', true);
  setLoading('lecture', true);

  const [bestResult, lectureResult] = await Promise.allSettled([
    fetchSheetAsCsv(bestUrl),
    fetchSheetAsCsv(lectureUrl),
  ]);

  // 베스트셀러 결과 처리
  if (bestResult.status === 'fulfilled') {
    await handleBestData(bestResult.value, 'Google Sheets (베스트셀러)');
    localStorage.setItem(LS_KEYS.bestSheetUrl, bestUrl);
  } else {
    console.warn('[loadDefaults] 베스트셀러 시트 로드 실패:', bestUrl, bestResult.reason);
    showToast('⚠️ 베스트셀러 시트 불러오기 실패\n' + bestResult.reason.message, 'red');
    const src = loadFromLS(LS_KEYS.best) || {b64: DEFAULT_FILES.best.b64, name: DEFAULT_FILES.best.name};
    await handleBestData(readB64(src.b64), src.name);
  }
  setLoading('best', false);

  // 강의 플랫폼 결과 처리
  if (lectureResult.status === 'fulfilled') {
    await handleLectureData(lectureResult.value, 'Google Sheets (강의 플랫폼)');
    localStorage.setItem(LS_KEYS.lectureSheetUrl, lectureUrl);
  } else {
    console.warn('[loadDefaults] 강의 시트 로드 실패:', lectureUrl, lectureResult.reason);
    showToast('⚠️ 강의 시트 불러오기 실패\n' + lectureResult.reason.message, 'red');
    const src = loadFromLS(LS_KEYS.lecture) || {b64: DEFAULT_FILES.lecture.b64, name: DEFAULT_FILES.lecture.name};
    await handleLectureData(readB64(src.b64), src.name);
  }
  setLoading('lecture', false);

  // 출판사 선택 — 데이터 로드 완료 후 실행
  const myPubSel=document.getElementById('myPub');
  for(const o of myPubSel.options){if(o.value===DEFAULT_MY_PUB){o.selected=true;break;}}
  onMyPubChange();
  const compSel=document.getElementById('compSel');
  for(const o of compSel.options){
    o.selected=!DEFAULT_EXCLUDE_PUBS.includes(o.value);
  }
}

document.addEventListener('DOMContentLoaded', ()=>{
  loadDefaults();
  if(typeof meetInitDefaults === 'function') meetInitDefaults('brief');
  if(typeof meetRender === 'function') meetRender();
});


function onMyPubChange(){
  const v=document.getElementById('myPub').value;
  const sel=document.getElementById('compSel');
  [...sel.options].forEach(o=>{o.disabled=(o.value===v);if(o.disabled&&o.selected)o.selected=false;});
}

// ── 핵심: 통합 분석 ──
function runAll(){
  myPub=document.getElementById('myPub').value;
  compPubs=[...document.getElementById('compSel').selectedOptions].map(o=>o.value);
  const teamSel=[...document.getElementById('teamSel').selectedOptions].map(o=>o.value);
  if(!myPub){alert('우리 출판사를 선택하세요.');return;}
  if(!compPubs.length){alert('경쟁사를 1개 이상 선택하세요.');return;}

  // 출간완료·하판완료는 이미 출간된 도서 → 준비 중 목록에서 제외
  const DONE_STATUS=['출간완료','하판완료','하판 완료','출간 완료','기획완료'];
  const filteredPlanned=(teamSel.length?plannedRows.filter(r=>teamSel.includes(r.team)):plannedRows)
    .filter(r=>!DONE_STATUS.includes(r.status));

  // 카테고리별로 데이터 집계
  const catMap={};
  function ensureCat(c){
    if(!catMap[c])catMap[c]={comp:[],mine:[],planned:[],lecture:[]};
  }

  // 베스트셀러 분류
  for(const b of bestRows){
    const c=cat(b.title);
    if(c==='기타')continue;
    ensureCat(c);
    if(compPubs.includes(b.pub)) catMap[c].comp.push(b);
    if(b.pub===myPub) catMap[c].mine.push(b);
  }

  // 강의 플랫폼 분류
  for(const l of lectureRows){
    const c=catLecture(l);
    if(c==='기타')continue;
    ensureCat(c);
    catMap[c].lecture.push(l);
  }

  // 출간 예정 분류
  for(const p of filteredPlanned){
    const c=p.category||cat(p.title);
    ensureCat(c);
    catMap[c].planned.push(p);
  }

  // 분석 결과 생성
  analysisData=[];
  for(const[c,d]of Object.entries(catMap)){
    // 경쟁사도 없고 우리도 없고 준비도 없으면 스킵
    if(!d.comp.length&&!d.mine.length&&!d.planned.length)continue;

    d.comp.sort((a,b)=>a.rank-b.rank);
    d.mine.sort((a,b)=>a.rank-b.rank);

    const compBest=d.comp.length?d.comp[0].rank:9999;
    const mineBest=d.mine.length?d.mine[0].rank:9999;

    let status;
    if(!d.comp.length&&!d.mine.length) status='plan-only';       // 준비만 있음
    else if(!d.mine.length&&d.comp.length) status='gap';          // 우리 없음
    else if(d.mine.length&&!d.comp.length) status='leading';      // 경쟁사 없음 (독점)
    else if(mineBest<=compBest*1.3) status='leading';             // 우위
    else status='behind';                                          // 열세

    analysisData.push({cat:c, status, ...d, compBest, mineBest, lectureCnt:d.lecture.length});
  }

  // 통계
  const gap=analysisData.filter(d=>d.status==='gap').length;
  const behind=analysisData.filter(d=>d.status==='behind').length;
  const lead=analysisData.filter(d=>d.status==='leading').length;
  const planOnly=analysisData.filter(d=>d.status==='plan-only').length;
  const planCount=filteredPlanned.length;

  document.getElementById('sGap').textContent=gap;
  document.getElementById('sBehind').textContent=behind;
  document.getElementById('sLead').textContent=lead;
  document.getElementById('sPlan').textContent=planCount;
  document.getElementById('sTotal').textContent=analysisData.length;
  document.getElementById('sLec').textContent=analysisData.filter(d=>d.lectureCnt>0).length;

  // 필터탭
  const ft=document.getElementById('ftabs');
  const 기획예정Cnt=analysisData.filter(d=>d.planned.some(p=>p.status==='기획예정')).length;
  ft.innerHTML=[
    ['all','전체',analysisData.length],
    ['gap','공백 — 경쟁사만 있음',gap],
    ['behind','열세',behind],
    ['leading','우위/독점',lead],
    ['plan-only','준비 중(신규)',planOnly],
    ['planning','기획예정 포함',기획예정Cnt],
  ].map(([v,l,n])=>`<button class="ftab${v==='all'?' active':''}" onclick="filt('${v}',this)">${l}<span class="badge">${n}</span></button>`).join('');

  document.getElementById('main-empty').style.display='none';
  document.getElementById('main-content').style.display='block';
  document.getElementById('panel1-dl-bar').style.display='flex';
  switchTab(1,document.getElementById('tab1'));
  draw('all');
  setTimeout(()=>{renderCharts();renderTimeline();renderWorkload();},50);
}

function onSearch(){
  const q=document.getElementById('cat-search').value.trim().toLowerCase();
  document.getElementById('search-clear').style.display=q?'block':'none';
  const activeFilt=document.querySelector('.ftab.active')?.dataset?.filt||'all';
  drawWithSearch(activeFilt,q);
}

function clearSearch(){
  document.getElementById('cat-search').value='';
  document.getElementById('search-clear').style.display='none';
  const activeFilt=document.querySelector('.ftab.active')?.dataset?.filt||'all';
  draw(activeFilt);
}

function drawWithSearch(filter,q){
  if(!q){draw(filter);return;}
  let arr=filter==='all'?analysisData
    :filter==='planning'?analysisData.filter(d=>d.planned.some(p=>p.status==='기획예정'))
    :analysisData.filter(d=>d.status===filter);
  arr=arr.filter(d=>
    d.cat.toLowerCase().includes(q)||
    d.comp.some(b=>b.title.toLowerCase().includes(q))||
    d.mine.some(b=>b.title.toLowerCase().includes(q))||
    d.planned.some(p=>p.title.toLowerCase().includes(q))||
    d.lecture.some(l=>l.title.toLowerCase().includes(q))
  );
  const sorted=sortArr(arr);
  const container=document.getElementById('results');
  const cnt=document.getElementById('results-count');
  if(cnt)cnt.textContent=`${sorted.length}개 카테고리 (검색 중)`;
  if(!sorted.length){container.innerHTML=`<div style="text-align:center;padding:2rem;color:var(--muted);font-size:.85rem;">'${q}' 검색 결과가 없습니다.</div>`;return;}
  renderRows(sorted,q);
}

function highlightQ(text,q){
  if(!q)return text;
  const idx=text.toLowerCase().indexOf(q);
  if(idx<0)return text;
  return text.slice(0,idx)+`<mark style="background:#fff3b0;border-radius:2px;">${text.slice(idx,idx+q.length)}</mark>`+text.slice(idx+q.length);
}

function statFilt(f){
  document.querySelectorAll('.ftab').forEach(t=>{
    t.classList.remove('active');
    if(t.getAttribute('onclick')&&t.getAttribute('onclick').includes(`'${f}'`)){
      t.classList.add('active');
      t.dataset.filt=f;
    }
  });
  // all 필터탭은 onclick에 'all'이 포함됨
  if(f==='all'){
    const allBtn=document.querySelector('.ftab');
    if(allBtn){allBtn.classList.add('active');allBtn.dataset.filt='all';}
  }
  draw(f);
  setTimeout(()=>document.getElementById('results')?.scrollIntoView({behavior:'smooth',block:'start'}),100);
}

function filt(f,btn){
  document.querySelectorAll('.ftab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  btn.dataset.filt=f;
  const q=document.getElementById('cat-search')?.value.trim().toLowerCase()||'';
  drawWithSearch(f,q);
}

function sortArr(arr){
  const sortBy=document.getElementById('cat-sort')?.value||'status';
  if(sortBy==='comp-desc')return [...arr].sort((a,b)=>b.comp.length-a.comp.length);
  if(sortBy==='lec-desc')return [...arr].sort((a,b)=>b.lecture.length-a.lecture.length);
  if(sortBy==='rank-asc')return [...arr].sort((a,b)=>(a.compBest||9999)-(b.compBest||9999));
  if(sortBy==='plan-desc')return [...arr].sort((a,b)=>b.planned.length-a.planned.length);
  if(sortBy==='cat-asc')return [...arr].sort((a,b)=>a.cat.localeCompare(b.cat,'ko'));
  const order={gap:0,behind:1,'plan-only':2,leading:3};
  return [...arr].sort((a,b)=>(order[a.status]??9)-(order[b.status]??9)||(a.compBest||9999)-(b.compBest||9999));
}

function draw(filter){
  const q=document.getElementById('cat-search')?.value.trim().toLowerCase()||'';
  if(q){drawWithSearch(filter,q);return;}
  let arr=filter==='all'?analysisData
    :filter==='planning'?analysisData.filter(d=>d.planned.some(p=>p.status==='기획예정'))
    :analysisData.filter(d=>d.status===filter);
  const sorted=sortArr(arr);
  const cnt=document.getElementById('results-count');
  if(cnt)cnt.textContent=`${sorted.length}개 카테고리`;
  renderRows(sorted,'');
}

function renderRows(sorted,q){
  const bm={
    gap:['badge-gap','★ 공백'],
    behind:['badge-behind','▼ 열세'],
    leading:['badge-leading','▲ 우위'],
    'plan-only':['badge-plan','◎ 신규 준비'],
  };

  document.getElementById('results').innerHTML=sorted.length?sorted.map((d,i)=>{
    const[bc,bl]=bm[d.status]||['badge-nodata','—'];

    // 경쟁사 열 (노후도 뱃지 포함)
    const _curY=new Date().getFullYear();
    const compCol=d.comp.length
      ? d.comp.slice(0,5).map(b=>{
          const age=b.year>2000?_curY-b.year:-1;
          const ageBadge=age>=4
            ?`<span style="font-size:.6rem;padding:1px 4px;border-radius:3px;background:var(--red-bg);color:var(--red);border:1px solid var(--red-bd);margin-left:3px;" title="${age}년 된 책 — 개정 기회">📅 ${b.year}년 (${age}년 경과)</span>`
            :age>=2?`<span style="font-size:.6rem;padding:1px 4px;border-radius:3px;background:var(--yellow-bg);color:var(--yellow);border:1px solid var(--yellow-bd);margin-left:3px;">${b.year}년</span>`
            :age>=0?`<span style="font-size:.6rem;padding:1px 4px;border-radius:3px;background:var(--green-bg);color:var(--green);border:1px solid var(--green-bd);margin-left:3px;">신간</span>`:'';
          return`<div class="book-item">
            <span class="book-rank${b.rank<=50?' top':''}">${b.rank}위</span>
            <div class="book-info">
              <div class="book-title">${highlightQ(b.title,q)}${ageBadge}</div>
              <div class="book-pub">${b.pub}${b.sp?` · SP ${b.sp.toLocaleString()}`:''}</div>
            </div>
          </div>`;
        }).join('')+(d.comp.length>5?`<div style="font-size:.7rem;color:var(--muted);padding:.3rem 0;">외 ${d.comp.length-5}권</div>`:'')
      : `<div class="empty-col">경쟁사 도서 없음</div>`;

    // 우리 열
    const mineCol=d.mine.length
      ? d.mine.slice(0,5).map(b=>`
          <div class="book-item">
            <span class="book-rank${b.rank<=50?' top':''}">${b.rank}위</span>
            <div class="book-info">
              <div class="book-title">${highlightQ(b.title,q)}</div>
            </div>
          </div>`).join('')+(d.mine.length>5?`<div style="font-size:.7rem;color:var(--muted);padding:.3rem 0;">외 ${d.mine.length-5}권</div>`:'')
      : `<div class="empty-col gap">우리 도서 없음</div>`;

    // 강의 열
    const lecCol=d.lecture.length
      ? d.lecture.slice().sort((a,b_)=>b_.pop-a.pop).slice(0,5).map(l=>`
          <div class="book-item">
            <span class="book-rank" style="color:var(--yellow);">${l.pop?l.pop+'명':'-'}</span>
            <div class="book-info">
              <div class="book-title">${l.title}</div>
              <div class="book-pub" style="color:var(--yellow);">${l.service}${l.cat2?' · '+l.cat2:''}</div>
            </div>
          </div>`).join('')+(d.lecture.length>5?`<div style="font-size:.7rem;color:var(--muted);padding:.3rem 0;">외 ${d.lecture.length-5}개</div>`:'')
      : `<div class="empty-col">강의 없음</div>`;

    // 준비 열
    const planCol=d.planned.length
      ? d.planned.map(p=>{
          const statusColors={'기획예정':'#c07a00','계약진행중':'#1a4f8a','출간관리중':'#1a6b3c'};
          const sc=statusColors[p.status]||'var(--purple)';
          const sl=p.status||'준비';
          return `<div class="book-item">
            <span class="book-rank" style="color:${sc};background:${sc}18;border-radius:3px;padding:1px 4px;font-size:.65rem;">${sl}</span>
            <div class="book-info">
              <div class="book-title">${highlightQ(p.title,q)}</div>
              <div class="book-pub">${[p.team,p.month].filter(Boolean).join(' · ')}</div>
            </div>
          </div>`;
        }).join('')
      : `<div class="empty-col">준비 도서 없음</div>`;

    return`<div class="cat-block${i<5?' open':''}" id="cb${i}">
      <div class="cat-hdr" onclick="tog('cb${i}')">
        <span class="badge ${bc}">${bl}</span>
        <span class="cat-name">${highlightQ(d.cat,q)}</span>
        <span style="font-size:.72rem;color:var(--muted);font-family:'DM Mono',monospace;margin-right:.3rem;flex:1;">
          경쟁 ${d.comp.length}권${d.comp.length?` · ${d.compBest}위~`:''}
          &nbsp;/&nbsp; 우리 ${d.mine.length}권${d.mine.length?` · ${d.mineBest}위~`:''}
          &nbsp;/&nbsp; 준비 ${d.planned.length}건
          &nbsp;/&nbsp; 강의 ${d.lecture.length}개${(()=>{const tot=d.lecture.reduce((s,l)=>s+(l.pop||0),0);return tot>0?` (${tot.toLocaleString()}명)`:'';})()}
        </span>
        <button class="cat-action-btn" onclick="event.stopPropagation();showCatAuthors('${d.cat.replace(/'/g,"\\'")}','cb${i}')">👤 저자</button>
        <button class="cat-action-btn proposal" onclick="event.stopPropagation();openProposalFromCat('${d.cat.replace(/'/g,"\\'")}')">📝 저자 제안서</button>
        <button class="cat-action-btn ai" onclick="event.stopPropagation();openAIProposalWizard('${d.cat.replace(/'/g,"\\'")}',false)">✨ AI</button>
        <span class="chevron" style="margin-left:.3rem;">▾</span>
      </div>
      <div class="cat-body">
        <div class="cat-grid">
          <div class="cat-col">
            <div class="col-label comp"><span class="col-dot dot-comp"></span>경쟁사 도서</div>
            ${compCol}
          </div>
          <div class="cat-col">
            <div class="col-label mine"><span class="col-dot dot-mine"></span>우리 출판사</div>
            ${mineCol}
          </div>
          <div class="cat-col">
            <div class="col-label plan"><span class="col-dot dot-plan"></span>출간 예정</div>
            ${planCol}
          </div>
          <div class="cat-col">
            <div class="col-label lec"><span class="col-dot dot-lec"></span>강의 플랫폼</div>
            ${lecCol}
          </div>
        </div>
      </div>
    </div>`;
  }).join(''):`<div class="empty">해당 카테고리 없음</div>`;

  document.querySelectorAll('[id^="cb"].open .cat-body').forEach(b=>b.style.display='block');
} // renderRows 끝

// ── 차트 전역 인스턴스 ──
let _charts={};
let _chartMyName='우리 출판사';
let _chartCompName='경쟁사';
function destroyChart(id){if(_charts[id]){_charts[id].destroy();delete _charts[id];}}

/* ── 차트 공통 유틸 ── */
function mkGrad(ctx,c1,c2,vertical=true){
  const {width,height}=ctx.canvas.getBoundingClientRect();
  const g=vertical
    ?ctx.createLinearGradient(0,0,0,height||220)
    :ctx.createLinearGradient(0,0,width||400,0);
  g.addColorStop(0,c1);g.addColorStop(1,c2);return g;
}
// 공통 차트 폰트·컬러 기본값
Chart.defaults.font.family="'Noto Sans KR',sans-serif";
Chart.defaults.color='#6b6960';
// 공통 가로 막대 옵션 팩토리
function hBarOpts(extra={}){
  return {
    responsive:true,maintainAspectRatio:false,indexAxis:'y',
    animation:{duration:600,easing:'easeOutQuart'},
    plugins:{
      legend:{labels:{font:{size:11},boxWidth:12,padding:12,usePointStyle:true,pointStyle:'rectRounded'}},
      tooltip:{
        backgroundColor:'rgba(26,26,24,.85)',
        titleFont:{size:11,weight:'bold'},
        bodyFont:{size:11},
        padding:10,cornerRadius:8,
        callbacks:{label:c=>`  ${c.dataset.label}: ${c.parsed.x}권`}
      },
      ...extra.plugins
    },
    scales:{
      x:{
        ticks:{font:{size:10},color:'#9b9890'},
        grid:{color:'rgba(0,0,0,.04)',drawBorder:false},
        border:{dash:[4,4]}
      },
      y:{
        ticks:{font:{size:10.5},color:'#3a3a38'},
        grid:{display:false},
        border:{display:false}
      }
    },
    ...extra
  };
}

function renderCharts(){
  if(!analysisData.length)return;

  // 출판사 이름 동적 반영
  const compNames='경쟁사';
  const myName=myPub||'우리 출판사';
  _chartMyName=myName;
  _chartCompName=compNames;
  const t1=document.getElementById('titleDonut');
  const t2=document.getElementById('titleCompTop');
  const t3=document.getElementById('titleMine');
  if(t1)t1.textContent=`${compNames} vs ${myName} — 카테고리 현황 분포`;
  if(t2)t2.textContent=`${compNames} 강세 TOP 10 카테고리 (${myName} 대비)`;
  if(t3)t3.textContent=`${myName} 상위 카테고리 (${compNames} 대비)`;

  // ① 도넛 - 상태 분포
  destroyChart('donut');
  const gap=analysisData.filter(d=>d.status==='gap').length;
  const behind=analysisData.filter(d=>d.status==='behind').length;
  const lead=analysisData.filter(d=>d.status==='leading').length;
  const planOnly=analysisData.filter(d=>d.status==='plan-only').length;
  const total=gap+behind+lead+planOnly;
  const ctx1=document.getElementById('chartDonut').getContext('2d');
  // 도넛 중앙 라벨 플러그인
  const centerLabelPlugin={
    id:'centerLabel',
    afterDraw(chart){
      const{ctx:c,chartArea:{top,right,bottom,left}}=chart;
      const cx=(left+right)/2, cy=(top+bottom)/2;
      c.save();
      c.textAlign='center';c.textBaseline='middle';
      c.font="700 1.5rem 'DM Mono',monospace";
      c.fillStyle='#1a1a18';
      c.fillText(total, cx, cy-8);
      c.font="400 .68rem 'Noto Sans KR',sans-serif";
      c.fillStyle='#9b9890';
      c.fillText('전체 카테고리', cx, cy+14);
      c.restore();
    }
  };
  _charts['donut']=new Chart(ctx1,{
    type:'doughnut',
    plugins:[centerLabelPlugin],
    data:{
      labels:[`공백 (${compNames}만)`,`${compNames} 열세`,`${myName} 우위/독점`,'준비 중(신규)'],
      datasets:[{
        data:[gap,behind,lead,planOnly],
        backgroundColor:['#e8524a','#d4980f','#1e7d45','#7040b0'],
        hoverBackgroundColor:['#d43e36','#bf880a','#186836','#5e35a0'],
        borderWidth:3,
        borderColor:'#fff',
        hoverOffset:6
      }]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      cutout:'66%',
      animation:{duration:700,easing:'easeOutQuart'},
      plugins:{
        legend:{
          position:'right',
          labels:{
            font:{size:11},boxWidth:13,padding:12,
            usePointStyle:true,pointStyle:'circle'
          }
        },
        tooltip:{
          backgroundColor:'rgba(26,26,24,.88)',
          titleFont:{size:11,weight:'bold'},
          bodyFont:{size:11},
          padding:10,cornerRadius:8,
          callbacks:{
            label:c=>`  ${c.label}: ${c.parsed}개 (${total?Math.round(c.parsed/total*100):0}%)`
          }
        }
      }
    }
  });

  // ② 경쟁사 강세 TOP10
  destroyChart('compTop');
  const compSorted=[...analysisData].filter(d=>d.comp.length>0).sort((a,b)=>b.comp.length-a.comp.length).slice(0,10);
  const ctx2=document.getElementById('chartCompTop').getContext('2d');
  const gBlue=mkGrad(ctx2,'#2563c4','#1a4f8a',false);
  const gGreen2=mkGrad(ctx2,'#22a558','#1a6b3c',false);
  _charts['compTop']=new Chart(ctx2,{
    type:'bar',
    data:{
      labels:compSorted.map(d=>d.cat.length>10?d.cat.slice(0,10)+'…':d.cat),
      datasets:[
        {label:`${compNames} 권수`,data:compSorted.map(d=>d.comp.length),
         backgroundColor:gBlue,borderRadius:{topRight:5,bottomRight:5},borderSkipped:false},
        {label:`${myName} 권수`,data:compSorted.map(d=>d.mine.length),
         backgroundColor:gGreen2,borderRadius:{topRight:5,bottomRight:5},borderSkipped:false}
      ]
    },
    options:hBarOpts()
  });

  // ③ 우리 우위 차트 (초기: 권수 기준)
  renderMineChart();

  // ④ 강의 있는데 우리 책 없는 카테고리
  destroyChart('lecGap');
  const lecGapData=[...analysisData].filter(d=>d.lecture.length>0&&d.mine.length===0).sort((a,b)=>b.lecture.length-a.lecture.length).slice(0,10);
  const ctx4=document.getElementById('chartLecGap').getContext('2d');
  const gAmber=mkGrad(ctx4,'#f0a800','#c07a00',false);
  _charts['lecGap']=new Chart(ctx4,{
    type:'bar',
    data:{
      labels:lecGapData.map(d=>d.cat.length>10?d.cat.slice(0,10)+'…':d.cat),
      datasets:[{
        label:'강의 수',data:lecGapData.map(d=>d.lecture.length),
        backgroundColor:gAmber,
        borderRadius:{topRight:5,bottomRight:5},borderSkipped:false
      }]
    },
    options:hBarOpts({
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:'rgba(26,26,24,.88)',
          titleFont:{size:11,weight:'bold'},
          bodyFont:{size:11},
          padding:10,cornerRadius:8,
          callbacks:{label:c=>`  강의 수: ${c.parsed.x}개`}
        }
      }
    })
  });

  // 공백 분석 렌더
  renderGapAnalysis();
}

function renderMineChart(){
  destroyChart('mine');
  const myName=_chartMyName;
  const compNames=_chartCompName;
  const sorted=[...analysisData].filter(d=>d.mine.length>0).sort((a,b)=>b.mine.length-a.mine.length).slice(0,10);
  const ctx3=document.getElementById('chartMine').getContext('2d');
  const gGreen3=mkGrad(ctx3,'#22a558','#1a6b3c',false);
  const gBlue3=mkGrad(ctx3,'rgba(37,99,196,.55)','rgba(26,79,138,.35)',false);
  _charts['mine']=new Chart(ctx3,{
    type:'bar',
    data:{
      labels:sorted.map(d=>d.cat.length>10?d.cat.slice(0,10)+'…':d.cat),
      datasets:[
        {label:`${myName} 권수`,data:sorted.map(d=>d.mine.length),
         backgroundColor:gGreen3,borderRadius:{topRight:5,bottomRight:5},borderSkipped:false},
        {label:`${compNames} 권수`,data:sorted.map(d=>d.comp.length),
         backgroundColor:gBlue3,borderRadius:{topRight:5,bottomRight:5},borderSkipped:false}
      ]
    },
    options:hBarOpts()
  });
}

function renderGapAnalysis(){
  const insights=document.getElementById('insight-list');
  const insightBox=document.getElementById('insight-box');
  if(!insights)return;

  const gapCats=analysisData.filter(d=>d.status==='gap').sort((a,b)=>b.comp.length-a.comp.length);
  const behindCats=analysisData.filter(d=>d.status==='behind').sort((a,b)=>(b.comp.length-b.mine.length)-(a.comp.length-a.mine.length));
  const leadCats=analysisData.filter(d=>d.status==='leading').sort((a,b)=>b.mine.length-a.mine.length).slice(0,6);

  // 인사이트
  // ── 전략 인사이트 카드 ──
  const cards=[];

  // ① 즉시 대응 필요: 공백 카테고리 (우선순위 상위 3개 상세)
  if(gapCats.length>0){
    const top3=gapCats.slice(0,3);
    let rows='';
    const trunc=(s,n=18)=>s&&s.length>n?s.slice(0,n)+'…':s||'';
    top3.forEach((d,i)=>{
      const compTop=d.comp[0];
      const lecInfo=d.lecture.length>0?` · 강의 ${d.lecture.length}개`:'';
      const planTitles=d.planned.slice(0,2).map(p=>trunc(p.title,14)).join(', ')+(d.planned.length>2?` 외 ${d.planned.length-2}권`:'');
      const planInfo=d.planned.length>0?`<em> → 준비 중: ${planTitles}</em>`:'<em> → 준비 도서 없음</em>';
      const topAge=compTop.year>2000?new Date().getFullYear()-compTop.year:-1;
      const ageNote=topAge>=4?`<span style="font-size:.62rem;color:var(--red);font-weight:700;"> · ${topAge}년 경과</span>`:
                    topAge>=2?`<span style="font-size:.62rem;color:var(--yellow);"> · ${compTop.year}년작</span>`:'';
      rows+=`<div class="ic-row"><span class="ic-row-label">${i+1}위 ${d.cat}</span><span class="ic-row-val">경쟁사 ${d.comp.length}권${lecInfo} · 1위 <strong>${compTop.rank}위</strong> 『${trunc(compTop.title,20)}』${ageNote}${planInfo}</span></div>`;
      if(i<top3.length-1)rows+=`<div class="ic-divider"></div>`;
    });
    const restCnt=gapCats.length-3;
    cards.push(`<div class="ic ic-red">
      <div class="ic-head"><span class="ic-emoji">🚨</span><span class="ic-title">즉시 대응 필요 — 공백 카테고리</span><span class="ic-badge ic-badge-red">${gapCats.length}개</span><button onclick="statFilt('gap')" style="font-size:.63rem;padding:2px 8px;border-radius:4px;border:1px solid var(--red-bd);background:var(--surface);color:var(--red);cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0;">목록 보기 ↓</button></div>
      <div class="ic-rows">${rows}</div>
      ${restCnt>0?`<div class="ic-action">외 <strong>${restCnt}개</strong> 카테고리 추가 공백 존재</div>`:''}
    </div>`);
  }

  // ② 열세 카테고리: 우리 도서 순위 vs 경쟁사 순위 비교
  if(behindCats.length>0){
    const top3=behindCats.slice(0,3);
    let rows='';
    top3.forEach((d,i)=>{
      const compTop=d.comp[0];
      const mineTop=d.mine[0];
      rows+=`<div class="ic-row"><span class="ic-row-label">${d.cat}</span><span class="ic-row-val">우리 <strong>${mineTop.rank}위</strong> 『${mineTop.title.slice(0,14)}…』 vs 경쟁 <strong>${compTop.rank}위</strong> 『${compTop.title.slice(0,14)}…』</span></div>`;
      if(i<top3.length-1)rows+=`<div class="ic-divider"></div>`;
    });
    cards.push(`<div class="ic ic-yellow">
      <div class="ic-head"><span class="ic-emoji">⚠️</span><span class="ic-title">열세 — 순위 격차 상위</span><span class="ic-badge ic-badge-yellow">${behindCats.length}개</span><button onclick="statFilt('behind')" style="font-size:.63rem;padding:2px 8px;border-radius:4px;border:1px solid var(--yellow-bd);background:var(--surface);color:var(--yellow);cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0;">목록 보기 ↓</button></div>
      <div class="ic-rows">${rows}</div>
      <div class="ic-action">순위 격차가 큰 카테고리부터 <strong>개정 또는 신간</strong>으로 추격 검토</div>
    </div>`);
  }

  // ③ 우위 카테고리: 우리 1위 순위 vs 경쟁사 1위 순위 (마진 표시)
  if(leadCats.length>0){
    const top3=leadCats.slice(0,3);
    let rows='';
    top3.forEach((d,i)=>{
      const mineTop=d.mine[0];
      const compInfo=d.comp.length>0?`경쟁사 최고 <strong>${d.comp[0].rank}위</strong>`:'<em>경쟁사 없음 (독점)</em>';
      const lecInfo=d.lecture.length>0?` · 강의 ${d.lecture.length}개`:'';
      rows+=`<div class="ic-row"><span class="ic-row-label">${d.cat}</span><span class="ic-row-val">우리 <strong>${mineTop.rank}위</strong> · ${compInfo}${lecInfo}</span></div>`;
      if(i<top3.length-1)rows+=`<div class="ic-divider"></div>`;
    });
    cards.push(`<div class="ic ic-green">
      <div class="ic-head"><span class="ic-emoji">💪</span><span class="ic-title">우위 — 독점·강세 카테고리</span><span class="ic-badge ic-badge-green">${leadCats.length}개</span><button onclick="statFilt('leading')" style="font-size:.63rem;padding:2px 8px;border-radius:4px;border:1px solid var(--green-bd);background:var(--surface);color:var(--green);cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0;">목록 보기 ↓</button></div>
      <div class="ic-rows">${rows}</div>
      <div class="ic-action"><strong>개정판·후속 시리즈</strong>로 경쟁 진입 전 선점 강화 권장</div>
    </div>`);
  }

  // ④ 강의 수요 있으나 도서 없는 카테고리 (기회 영역)
  const lecNoBook=analysisData.filter(d=>d.lecture.length>=2&&d.mine.length===0&&d.comp.length===0);
  if(lecNoBook.length>0){
    const sorted=[...lecNoBook].sort((a,b)=>b.lecture.length-a.lecture.length).slice(0,3);
    let rows='';
    sorted.forEach((d,i)=>{
      const topLec=d.lecture[0];
      const pop=topLec.pop||'';
      rows+=`<div class="ic-row"><span class="ic-row-label">${d.cat}</span><span class="ic-row-val">강의 <strong>${d.lecture.length}개</strong>${pop?` · 대표 인기도 <strong>${pop}</strong>`:''}<em> — 도서 없음 (경쟁사 포함)</em></span></div>`;
      if(i<sorted.length-1)rows+=`<div class="ic-divider"></div>`;
    });
    cards.push(`<div class="ic ic-blue">
      <div class="ic-head"><span class="ic-emoji">📚</span><span class="ic-title">기회 — 강의 수요 있으나 도서 없음</span><span class="ic-badge ic-badge-blue">${lecNoBook.length}개</span></div>
      <div class="ic-rows">${rows}</div>
      <div class="ic-action">강의 수강층과 도서 독자층 차이 확인 후 <strong>도서화 우선순위</strong> 검토</div>
    </div>`);
  }

  // ⑤ 공백 중 준비 진행 중인 카테고리 — 요약 (풀 width)
  const planForGap=gapCats.filter(d=>d.planned.length>0);
  if(planForGap.length>0){
    const rows=planForGap.map((d,i)=>`
      <div class="ic-plan-row" id="ipr-${i}">
        <div class="ic-plan-head" onclick="togglePlanRow('ipr-${i}')">
          <span class="ic-plan-cat">${d.cat}</span>
          <span class="ic-plan-cnt">${d.planned.length}권</span>
          <span class="ic-plan-arrow">▾</span>
        </div>
        <div class="ic-plan-body">
          ${d.planned.map(p=>`<div class="ic-plan-book">· ${p.title}</div>`).join('')}
        </div>
      </div>`).join('');
    cards.push(`<div class="ic ic-blue ic-full">
      <div class="ic-head"><span class="ic-emoji">✅</span><span class="ic-title">공백 중 출간 준비 진행 중</span><span class="ic-badge ic-badge-blue">${planForGap.length}개 카테고리</span></div>
      <div class="ic-plan-list">${rows}</div>
      <div class="ic-action">출간 시 해당 공백 즉시 해소 — <strong>출간 시기 조율</strong>로 경쟁사 선점 차단 가능</div>
    </div>`);
  }

  // ⑥ 노후도: 경쟁사 1위 책이 4년 이상 된 카테고리 — 개정/신간 기회
  const curY=new Date().getFullYear();
  const oldCats=analysisData.filter(d=>d.comp.length>0&&d.comp[0].year>2000&&(curY-d.comp[0].year)>=4)
    .sort((a,b)=>(curY-b.comp[0].year)-(curY-a.comp[0].year)).slice(0,5);
  if(oldCats.length>0){
    let rows='';
    oldCats.forEach((d,i)=>{
      const age=curY-d.comp[0].year;
      const mineInfo=d.mine.length>0?`우리 ${d.mine[0].rank}위`:'우리 도서 없음';
      rows+=`<div class="ic-row"><span class="ic-row-label">${d.cat}</span><span class="ic-row-val">경쟁 1위 <strong>${d.comp[0].year}년작</strong> (${age}년 경과) · ${mineInfo}${d.planned.length>0?` · 준비 ${d.planned.length}건`:''}</span></div>`;
      if(i<oldCats.length-1)rows+=`<div class="ic-divider"></div>`;
    });
    cards.push(`<div class="ic ic-yellow">
      <div class="ic-head"><span class="ic-emoji">🕰️</span><span class="ic-title">경쟁사 노후 도서 — 개정·신간 진입 적기</span><span class="ic-badge ic-badge-yellow">${oldCats.length}개</span></div>
      <div class="ic-rows">${rows}</div>
      <div class="ic-action">4년 이상 된 경쟁 1위 도서 → <strong>최신 버전·개정판</strong>으로 순위 역전 가능성 높음</div>
    </div>`);
  }

  if(cards.length){
    insights.innerHTML=cards.join('');
    insightBox.style.display='block';
  }
}


function _buildTimelineHTML(books, monthMap, months, nowStr, accentColor){
  const statusHex={gap:'#c0392b',behind:'#c07a00',leading:'#1a6b3c','plan-only':'#5b2d8e'};
  return months.map(m=>{
    const list=monthMap[m];
    const isCurrent=m.startsWith(nowStr.slice(0,7));
    const isPast=!isCurrent&&m!=='미정'&&m<nowStr;
    const booksHtml=list.map(p=>{
      const clr=statusHex[p.catStatus]||'#5b2d8e';
      return `<div style="display:flex;align-items:center;gap:.45rem;padding:.28rem .4rem;border-radius:4px;background:var(--surface);border:1px solid var(--border);margin-bottom:.25rem;${isPast?'opacity:.55;':''}">
        <span style="font-size:.62rem;font-weight:700;padding:1px 5px;border-radius:3px;background:${clr}15;color:${clr};border:1px solid ${clr}35;white-space:nowrap;flex-shrink:0;">${p.cat}</span>
        <span style="font-size:.76rem;color:var(--text);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.title}</span>
        ${p.team?`<span style="font-size:.62rem;color:var(--muted);white-space:nowrap;">${p.team}</span>`:''}
        ${p.status?`<span style="font-size:.62rem;color:var(--muted);background:var(--surface2);border-radius:3px;padding:1px 4px;white-space:nowrap;">${p.status}</span>`:''}
      </div>`;
    }).join('');
    const monthLabel=isCurrent?`<span style="background:${accentColor};color:#fff;border-radius:3px;padding:1px 5px;font-size:.62rem;margin-top:2px;display:inline-block;">이번 달</span>`:'';
    return `<div style="display:grid;grid-template-columns:88px 1fr;gap:.5rem;margin-bottom:.7rem;">
      <div style="text-align:right;padding-top:.25rem;padding-right:.1rem;">
        <div style="font-size:.8rem;font-weight:700;color:${isPast?'var(--muted)':'var(--text)'};">${m}</div>
        <div style="font-size:.62rem;color:var(--muted);margin-top:1px;">${list.length}권</div>
        ${monthLabel}
      </div>
      <div style="border-left:2px solid ${isCurrent?accentColor:'var(--border2)'};padding-left:.7rem;">
        ${booksHtml}
      </div>
    </div>`;
  }).join('');
}

function renderTimeline(){
  const pubSec=document.getElementById('timeline-pub-section');
  const planSec=document.getElementById('timeline-plan-section');
  if(!pubSec||!planSec)return;

  const nowStr=new Date().toLocaleDateString('ko-KR',{year:'numeric',month:'2-digit'}).replace(/\. /g,'년 ').replace('.','월').trim();

  const pubMap={}, planMap={};
  for(const d of analysisData){
    for(const p of d.planned){
      const m=p.month||'미정';
      const obj={...p,cat:d.cat,catStatus:d.status};
      if(isPlanning(p.status)){
        if(!planMap[m])planMap[m]=[];
        planMap[m].push(obj);
      } else {
        if(!pubMap[m])pubMap[m]=[];
        pubMap[m].push(obj);
      }
    }
  }

  const sortMonths=obj=>Object.keys(obj).sort((a,b)=>{
    if(a==='미정')return 1;if(b==='미정')return -1;return a.localeCompare(b,'ko');
  });

  // 출간 예정
  const pubMonths=sortMonths(pubMap);
  if(pubMonths.length){
    const total=pubMonths.reduce((s,m)=>s+pubMap[m].length,0);
    document.getElementById('timeline-pub-subtitle').textContent=`${pubMonths.length}개월 · 총 ${total}권`;
    document.getElementById('timeline-pub-content').innerHTML=_buildTimelineHTML(null,pubMap,pubMonths,nowStr,'var(--green)');
    pubSec.style.display='block';
  } else {
    pubSec.style.display='none';
  }

  // 기획 예정
  const planMonths=sortMonths(planMap);
  if(planMonths.length){
    const total=planMonths.reduce((s,m)=>s+planMap[m].length,0);
    document.getElementById('timeline-plan-subtitle').textContent=`${planMonths.length}개월 · 총 ${total}권`;
    document.getElementById('timeline-plan-content').innerHTML=_buildTimelineHTML(null,planMap,planMonths,nowStr,'var(--yellow)');
    planSec.style.display='block';
  } else {
    planSec.style.display='none';
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ② 담당자별 출간 부하 (Workload)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 기획 단계 상태값 정의 (나머지는 "출간 예정"으로 분류)
const PLANNING_STATUSES=new Set(['기획중','기획예정','기획 예정','기획','']);

function isPlanning(status){return PLANNING_STATUSES.has((status||'').trim());}

function renderWorkload(excludePlanning){
  const sec=document.getElementById('workload-section');
  const content=document.getElementById('workload-content');
  if(!sec||!content)return;

  const raw=analysisData.flatMap(d=>d.planned.map(p=>({...p,cat:d.cat})));
  if(!raw.length){sec.style.display='none';return;}

  const allPlanned=excludePlanning?raw.filter(p=>!isPlanning(p.status)):raw;
  const planningCnt=raw.filter(p=>isPlanning(p.status)).length;
  const pubCnt=raw.filter(p=>!isPlanning(p.status)).length;

  // 팀/담당자별, 월별 집계
  const teamMap={};
  for(const p of raw){
    const team=p.team||'미배정';
    if(!teamMap[team])teamMap[team]={};
    const month=p.month||'미정';
    if(!teamMap[team][month])teamMap[team][month]=[];
    teamMap[team][month].push(p);
  }

  const teams=Object.keys(teamMap).sort();
  const baseMonths=[...new Set(raw.map(p=>p.month||'미정'))].sort((a,b)=>{
    if(a==='미정')return 1;if(b==='미정')return -1;return a.localeCompare(b,'ko');
  });

  // 과부하 판정: 출간예정 기준(pub) 별도 적용 — 셀 단위로만 표시
  // 출간예정: ≥2 주의(yellow), ≥3 과부하(red)
  // 기획예정: ≥3 주의(yellow), ≥5 과부하(red)  ← 기획은 실제 작업 부하가 낮으므로 기준 완화
  const pubOverloadMonths=teams.reduce((acc,t)=>{
    acc[t]=Object.entries(teamMap[t]).filter(([,arr])=>arr.filter(p=>!isPlanning(p.status)).length>=3).map(([m])=>m);
    return acc;
  },{});
  const maxPubMonth=Math.max(0,...teams.flatMap(t=>Object.values(teamMap[t]).map(arr=>arr.filter(p=>!isPlanning(p.status)).length)));
  const overloadTeamCnt=teams.filter(t=>pubOverloadMonths[t].length>0).length;

  document.getElementById('workload-subtitle').textContent=
    `${teams.length}개 팀/담당자 · 출간예정 ${pubCnt}권 · 기획예정 ${planningCnt}권`+
    (overloadTeamCnt>0?` · ⚠️ ${overloadTeamCnt}명 출간 과부하 월 존재`:'');

  const shownMonths=baseMonths; // 전체 월 (가로 스크롤)
  content.innerHTML=`
    <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.65rem;flex-wrap:wrap;">
      <label style="display:flex;align-items:center;gap:.3rem;font-size:.72rem;cursor:pointer;user-select:none;">
        <input type="checkbox" id="wk-excl-plan" ${excludePlanning?'checked':''}
          onchange="renderWorkload(this.checked)" style="cursor:pointer;accent-color:var(--green);">
        기획 예정 제외 (출간 예정만 표시)
      </label>
      <span style="font-size:.67rem;color:var(--muted);">|</span>
      <span style="font-size:.67rem;"><span style="color:var(--green);font-weight:700;">■</span> 출간예정</span>
      <span style="font-size:.67rem;"><span style="color:var(--yellow);font-weight:700;">■</span> 기획예정</span>
      <span style="font-size:.67rem;color:var(--muted);">|</span>
      <span style="font-size:.67rem;"><span style="background:#fde8e6;color:var(--red);padding:1px 4px;border-radius:3px;font-size:.62rem;">출간 ≥3</span> 과부하</span>
      <span style="font-size:.67rem;"><span style="background:#fdf5e0;color:#b07800;padding:1px 4px;border-radius:3px;font-size:.62rem;">출간 ≥2</span> 주의</span>
    </div>
    <div style="overflow-x:auto;">
    <table style="border-collapse:collapse;font-size:.75rem;min-width:max(100%,${120+shownMonths.length*140}px);">
      <thead>
        <tr style="background:var(--surface2);">
          <th style="padding:.45rem .7rem;text-align:left;font-size:.67rem;font-weight:700;color:var(--muted);border-bottom:2px solid var(--border);white-space:nowrap;width:110px;position:sticky;left:0;background:var(--surface2);z-index:2;">담당자/팀</th>
          ${shownMonths.map(m=>`<th style="padding:.45rem .7rem;text-align:center;font-size:.67rem;font-weight:700;color:var(--muted);border-bottom:2px solid var(--border);white-space:nowrap;">${m}</th>`).join('')}
          <th style="padding:.45rem .7rem;text-align:center;font-size:.67rem;font-weight:700;color:var(--muted);border-bottom:2px solid var(--border);white-space:nowrap;">합계</th>
        </tr>
      </thead>
      <tbody>
        ${teams.map(team=>{
          const monthData=teamMap[team];
          const pubTotal=Object.values(monthData).reduce((s,arr)=>s+arr.filter(p=>!isPlanning(p.status)).length,0);
          const planTotal=Object.values(monthData).reduce((s,arr)=>s+arr.filter(p=>isPlanning(p.status)).length,0);
          const displayTotal=excludePlanning?pubTotal:pubTotal+planTotal;
          // 행 레벨 강조 없음 — 셀 단위로만 표시
          return `<tr style="border-bottom:1px solid var(--border);">
            <td style="padding:.45rem .7rem;font-weight:600;white-space:nowrap;position:sticky;left:0;background:var(--surface);z-index:1;border-right:1px solid var(--border);">
              ${team}
              ${pubOverloadMonths[team]?.length>0?`<span style="font-size:.58rem;color:var(--red);display:block;">📅 ${pubOverloadMonths[team].length}개월 과부하</span>`:''}
            </td>
            ${shownMonths.map(m=>{
              const books=monthData[m]||[];
              const pub=books.filter(p=>!isPlanning(p.status));
              const plan=books.filter(p=>isPlanning(p.status));
              const dispBooks=excludePlanning?pub:books;
              // 셀 색상: 출간예정 기준으로만 판단 (기획은 별도 표기만)
              const pubCnt=pub.length;
              const cellBg=pubCnt>=3?'background:#fde8e6;':pubCnt===2?'background:#fdf5e0;':'';
              const cntColor=pubCnt>=3?'color:var(--red);font-weight:700;':pubCnt===2?'color:#b07800;font-weight:600;':'color:var(--text);';
              const overloadBadge=pubCnt>=3?'<div style="font-size:.58rem;color:var(--red);margin-top:1px;">⚠️ 과부하</div>':pubCnt===2?'<div style="font-size:.58rem;color:#b07800;margin-top:1px;">주의</div>':'';
              const bookList=dispBooks.map(p=>{
                const isPlan=isPlanning(p.status);
                return `<div style="font-size:.61rem;color:${isPlan?'var(--yellow)':'var(--muted)'};margin-top:1px;white-space:normal;line-height:1.4;text-align:left;">${isPlan?'◇':'·'} ${p.title.length>16?p.title.slice(0,16)+'…':p.title}</div>`;
              }).join('');
              const cntDisplay=excludePlanning
                ?(pub.length>0?`<div style="font-family:'DM Mono',monospace;font-size:.82rem;${cntColor}">${pub.length}권</div>`:'')
                :(books.length>0
                  ?`<div style="font-family:'DM Mono',monospace;font-size:.82rem;${cntColor}">${books.length}권</div>`
                    +(pub.length&&plan.length?`<div style="font-size:.6rem;margin-top:1px;"><span style="color:var(--green);">${pub.length}출</span><span style="color:var(--muted);"> + </span><span style="color:var(--yellow);">${plan.length}기</span></div>`
                    :pub.length?`<div style="font-size:.6rem;color:var(--green);">${pub.length}출간</div>`
                    :`<div style="font-size:.6rem;color:var(--yellow);">${plan.length}기획</div>`)
                  :'');
              return `<td style="padding:.4rem .6rem;text-align:center;vertical-align:top;${cellBg}">
                ${books.length>0||pub.length>0?cntDisplay+overloadBadge+bookList:`<span style="color:var(--border2);">—</span>`}
              </td>`;
            }).join('')}
            <td style="padding:.45rem .7rem;text-align:center;vertical-align:middle;border-left:1px solid var(--border);">
              <div style="font-family:'DM Mono',monospace;font-weight:700;font-size:.85rem;">${displayTotal}</div>
              ${!excludePlanning&&pubTotal&&planTotal?`<div style="font-size:.6rem;margin-top:1px;"><span style="color:var(--green);">${pubTotal}출</span> <span style="color:var(--yellow);">${planTotal}기</span></div>`:''}
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>`;
  sec.style.display='block';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ① 카테고리 → 저자풀 연결
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function showCatAuthors(catName,blockId){
  const panelId='cap-'+blockId;
  const existing=document.getElementById(panelId);
  if(existing){existing.remove();return;}

  // 키워드 추출 (카테고리명 토크나이즈)
  const keywords=catName.toLowerCase().replace(/[\/·\s]+/g,' ').split(' ').filter(k=>k.length>1);

  // AUTHOR_DATA에서 태그 매칭
  let matched=[];
  try{
    matched=(typeof AUTHOR_DATA!=='undefined'?AUTHOR_DATA:[]).filter(r=>{
      const tags=(r.태그||'').toLowerCase();
      const name=(r.저자명||'').toLowerCase();
      return keywords.some(k=>tags.includes(k)||name.includes(k));
    });
  }catch(e){}

  const panel=document.createElement('div');
  panel.id=panelId;
  panel.className='cat-author-panel';

  if(!matched.length){
    panel.innerHTML=`<div style="font-size:.75rem;color:var(--muted);display:flex;align-items:center;gap:.6rem;">
      <span>태그 일치 저자 없음</span>
      <a href="#" onclick="switchTab(2,document.getElementById('tab2'));return false;"
        style="font-size:.72rem;color:var(--blue);text-decoration:underline;">저자풀 전체 보기 →</a>
    </div>`;
  } else {
    const pubIcon=pub=>(pub||'').includes('출간')?'<span style="font-size:.6rem;padding:1px 4px;border-radius:3px;background:var(--green-bg);color:var(--green);border:1px solid var(--green-bd);margin-left:3px;">출간</span>':'';
    panel.innerHTML=`
      <div style="font-size:.68rem;font-weight:700;color:var(--purple);margin-bottom:.45rem;">👤 관련 저자 ${matched.length}명</div>
      <div style="display:flex;flex-wrap:wrap;gap:.35rem;">
        ${matched.map(r=>`
          <div style="background:var(--surface);border:1px solid var(--purple-bd);border-radius:6px;padding:.38rem .65rem;font-size:.75rem;max-width:200px;">
            <div style="font-weight:600;">${r.저자명}${pubIcon(r.출간여부)}</div>
            <div style="font-size:.63rem;color:var(--muted);margin-top:1px;">${(r.태그||'').split(',').slice(0,3).map(t=>t.trim()).join(' · ')}</div>
            ${r.담당자?`<div style="font-size:.63rem;color:var(--muted);">담당: ${r.담당자}</div>`:''}
          </div>`).join('')}
        <a href="#" onclick="switchTab(2,document.getElementById('tab2'));return false;"
          style="display:flex;align-items:center;padding:.38rem .65rem;font-size:.7rem;color:var(--blue);text-decoration:none;border:1px dashed var(--blue-bd);border-radius:6px;background:var(--blue-bg);">
          전체 보기 →
        </a>
      </div>`;
  }

  const block=document.getElementById(blockId);
  block.querySelector('.cat-hdr').insertAdjacentElement('afterend',panel);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ③ 기획서 ↔ 시장 데이터 연동
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function openProposalFromCat(catName,useAI=false){
  const d=analysisData.find(x=>x.cat===catName);
  if(!d)return;

  // 탭 이동 + 초기화
  switchTab(3,document.getElementById('tab3'));
  if(!window._pInitDone){window._pInitDone=true;pInitFields();}
  window._lastCatName=catName; // AI 재생성용 저장

  // API 키 불러오기
  const savedKey=await loadApiKey();
  const keyEl=document.getElementById('ai-api-key');
  if(keyEl&&savedKey&&!keyEl.value)keyEl.value=savedKey;

  const setVal=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v;};
  const totalPop=d.lecture.reduce((s,l)=>s+(l.pop||0),0);
  const curY=new Date().getFullYear();

  // ── 헤더 타이틀 ──
  const titleMap={
    gap:[`${catName} 시장,`,'지금 공백을 메울 수 있습니다.'],
    behind:[`${catName} 분야,`,'경쟁사를 따라잡을 기회입니다.'],
    leading:[`${catName} 분야,`,'우위를 더 단단히 할 때입니다.'],
    'plan-only':[`${catName} 분야,`,'지금이 진입 적기입니다.'],
  };
  const [t1,t2]=titleMap[d.status]||[`${catName} 분야,`,'지금이 출간 적기입니다.'];
  setVal('pf-title1',t1);
  setVal('pf-title2',t2);

  // ── Hero 헤드라인 ──
  const heroMap={
    gap:`경쟁사 ${d.comp.length}권이 활발한 ${catName} 카테고리, 우리 도서가 아직 없습니다`,
    behind:`${catName} 카테고리에서 경쟁사 대비 순위가 뒤처지고 있습니다 — 개정·신간으로 추격을 제안합니다`,
    leading:`${catName} 카테고리 1위를 지키기 위한 개정판·후속 시리즈를 제안합니다`,
    'plan-only':`강의 수요가 확인된 ${catName} — 도서화로 시장을 선점할 수 있습니다`,
  };
  setVal('pf-hero-head',heroMap[d.status]||`${catName} 시장 분석 기반 기획 제안`);

  // ── Hero 설명 ──
  const compTop=d.comp[0];
  const compAge=compTop&&compTop.year>2000?curY-compTop.year:-1;
  const lines=[];
  if(d.comp.length) lines.push(`예스24 베스트셀러 기준 경쟁사 ${d.comp.length}권 (최고 ${d.compBest}위)이 이 카테고리에서 활발히 유통 중입니다.`);
  if(compAge>=4) lines.push(`경쟁 1위 도서는 ${compTop.year}년작으로 ${compAge}년이 경과했습니다. 최신 기술을 반영한 신간으로 순위 역전이 가능합니다.`);
  else if(d.comp.length===0) lines.push('현재 이 카테고리에 경쟁사 도서가 없어 선점 가능성이 매우 높습니다.');
  if(d.lecture.length) lines.push(`강의 플랫폼에서 ${d.lecture.length}개 강의${totalPop>0?`, 수강생 ${totalPop.toLocaleString()}명`:''}으로 독자 수요가 이미 검증됐습니다.`);
  if(d.planned.length) lines.push(`현재 ${d.planned.length}권이 준비 중 — 출간 시기 조율로 경쟁사 선점이 가능합니다.`);
  setVal('pf-hero-desc',lines.join('\n'));

  // ── Why This Book? 4개 ──
  const whyCards=[
    // 0: 시장 근거
    {
      num:'MARKET',
      title:d.lecture.length>0?'강의 플랫폼 수요 검증 완료':'베스트셀러 시장 근거',
      body:d.lecture.length>0
        ?`${d.lecture.length}개 강의${totalPop>0?`, 수강생 ${totalPop.toLocaleString()}명`:''}으로 독자층이 이미 형성돼 있습니다. 강의를 들은 독자가 책으로 깊이를 더하는 흐름이 검증된 카테고리입니다.`
        :`예스24 베스트셀러에서 경쟁사 ${d.comp.length}권이 꾸준히 상위권을 유지 중입니다. 안정적인 구매 수요가 있는 카테고리입니다.`,
    },
    // 1: 경쟁 구도
    {
      num:'TIMING',
      title:d.status==='gap'?'공백 시장 선점 기회':compAge>=4?'경쟁사 노후 도서 — 역전 타이밍':'경쟁 차별화 포인트',
      body:d.status==='gap'
        ?`경쟁사가 ${d.comp.length}권을 운용 중이지만 우리 도서는 없습니다. 빠르게 진입할수록 독자 신뢰와 검색 노출을 선점할 수 있습니다.`
        :compAge>=4
        ?`경쟁 1위 도서는 ${compTop.year}년작(${compAge}년 경과)으로, 최신 기술·트렌드 반영이 부족합니다. 업데이트된 내용으로 시장 점유율을 가져올 수 있습니다.`
        :`기존 경쟁사 도서 대비 실습 중심 구성, 최신 버전 반영, 비개발자 친화적 접근 등 차별화 포인트로 독자층을 확장할 수 있습니다.`,
    },
    // 2: 독자층
    {
      num:'READER',
      title:'확장 가능한 독자층',
      body:`${catName} 분야는 실무 개발자부터 기획·마케팅·운영 직군까지 폭넓은 독자층을 아우릅니다. 입문서부터 실전 활용서까지 시리즈 확장 가능성도 높습니다.`,
    },
    // 3: OSMU / 출판사 강점
    {
      num:'OSMU',
      title:'전자책·교육 콘텐츠로 IP 확장',
      body:`단행본 출간 이후 전자책, 기업 교육용 워크북, 온라인 강의 연계 등 다양한 형태로 IP를 확장할 수 있습니다. 강의 플랫폼과의 시너지도 기대됩니다.`,
    },
  ];
  whyCards.forEach((w,i)=>{
    setVal(`pw-num-${i}`,w.num);
    setVal(`pw-title-${i}`,w.title);
    setVal(`pw-body-${i}`,w.body);
  });

  // ── 한빛미디어와 함께하면 4개 ──
  const hbCards=[
    {num:'DIST',title:'전 채널 동시 유통',body:'교보·yes24·알라딘 등 주요 서점 MD와 직접 협업, 신간 기획전 입점 및 노출 극대화를 함께 설계합니다.'},
    {num:'MKT',title:'IT 독자층 타겟 마케팅',body:`한빛미디어는 ${catName} 독자층에 이미 친숙한 브랜드입니다. 출간 전후 채널H·SNS·뉴스레터를 활용해 독자 유입을 지속적으로 만들어 갑니다.`},
    {num:'EDIT',title:'전담 편집팀 원고 지원',body:'기획부터 교정·교열·디자인까지 전담 편집팀이 함께합니다. 저자님은 내용에만 집중하실 수 있습니다.'},
    {num:'DATA',title:'데이터 기반 기획 지원',body:`베스트셀러 순위 데이터와 강의 수요 분석을 바탕으로, 독자가 원하는 내용과 구성을 함께 설계합니다. (강의 ${d.lecture.length}개, 수강생 ${totalPop.toLocaleString()}명 분석 완료)`},
  ];
  hbCards.forEach((h,i)=>{
    setVal(`ph-num-${i}`,h.num);
    setVal(`ph-title-${i}`,h.title);
    setVal(`ph-body-${i}`,h.body);
  });

  // ── CTA ──
  setVal('pf-cta-head','부담 없이 한 번 뵙고 싶습니다.');
  setVal('pf-cta-desc',`${catName} 시장 분석 데이터를 가지고 찾아뵙겠습니다.\n온·오프라인 모두 편하신 방식으로 연락 주세요.`);

  // 미리보기 갱신 후 스크롤
  setTimeout(()=>{
    pRender();
    document.getElementById('panel3')?.scrollIntoView({behavior:'smooth',block:'start'});
    if(useAI) generateProposalWithAI(catName);
  },120);

  if(!useAI) showToast(`📝 "${catName}" 저자 제안서 초안 생성 완료 — ✨ AI 버튼으로 내용을 더 풍부하게 만들 수 있습니다.`,'green');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AI 기획서 생성 (Claude API)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function generateProposalWithAI(catName){
  if(!catName){showToast('카테고리를 먼저 선택하세요 (분석 탭에서 ✨ AI 버튼 클릭)','red');return;}
  const apiKey=(document.getElementById('ai-api-key')?.value||'').trim()||await loadApiKey();
  if(!apiKey){showToast('Anthropic API 키를 입력해주세요 (AI 생성 시 사전 확인 창에서 입력)','red');return;}

  const d=analysisData.find(x=>x.cat===catName);
  if(!d)return;

  // 버튼 로딩 상태
  const btn=document.getElementById('ai-gen-btn');
  if(btn){btn.disabled=true;btn.textContent='생성 중…';}

  // 로딩 프리뷰
  const prevOut=document.getElementById('proposal-output');
  if(prevOut)prevOut.innerHTML=`<div style="display:flex;align-items:center;justify-content:center;height:300px;flex-direction:column;gap:1rem;">
    <div style="font-size:2rem;">✨</div>
    <div style="font-size:.9rem;color:var(--muted);">Claude AI가 저자 제안서를 작성 중입니다...</div>
    <div class="ai-spinner"></div>
  </div>`;

  const totalPop=d.lecture.reduce((s,l)=>s+(l.pop||0),0);
  const curY=new Date().getFullYear();
  const compTop=d.comp[0];
  const compAge=compTop&&compTop.year>2000?curY-compTop.year:-1;

  const ctx=`카테고리: ${d.cat}
상태: ${({'gap':'공백(경쟁사만 있음)','behind':'뒤처짐(경쟁사 우위)','leading':'우위(우리가 앞섬)','plan-only':'준비중(강의 수요만 있음)'}[d.status]||d.status)}
경쟁사 도서: ${d.comp.length}권 / 우리 도서: ${d.mine.length}권 / 준비중: ${d.planned.length}권
강의 수: ${d.lecture.length}개 / 총 수강생: ${totalPop.toLocaleString()}명
경쟁 최고순위: ${d.compBest||'없음'}위 / 우리 최고순위: ${d.mineBest||'없음'}위
${compTop?`경쟁 1위: "${compTop.title||''}" (${compTop.pub||''}, ${compTop.year||''}년, ${compTop.rank||''}위)${compAge>=4?` → ${compAge}년 경과 — 개정 기회`:''}`:'' }
경쟁 도서 목록: ${d.comp.slice(0,6).map(b=>`"${b.title||''}"(${b.rank||''}위, ${b.pub||''})`).join(' / ')||'없음'}
우리 도서 목록: ${d.mine.slice(0,4).map(b=>`"${b.title||''}"(${b.rank||''}위)`).join(' / ')||'없음'}
인기 강의: ${d.lecture.slice(0,3).map(l=>`"${l.title||''}"(${(l.pop||0).toLocaleString()}명)`).join(' / ')||'없음'}`;

  const prompt=`당신은 출판사 기획편집자입니다. 아래 시장 분석 데이터를 바탕으로, 저자에게 보내는 출판 기획 제안서 내용을 작성해주세요.

[시장 데이터]
${ctx}

아래 JSON 형식으로만 응답하세요. 한국어로, 따뜻하고 전문적인 편집자 톤으로 작성하세요. 실제 수치와 도서명을 최대한 활용하세요.

{
  "title1": "헤더 첫째줄 — 저자/분야 관련 짧은 문구 (쉼표로 끝남, 20자 이내)",
  "title2": "헤더 둘째줄 — 출판 제안의 핵심 메시지 (30자 이내)",
  "hero_head": "Why This Book? 헤드라인 — 이 책이 필요한 핵심 이유 (2-3줄, 감성적이고 구체적으로)",
  "hero_desc": "시장 데이터 기반 설명 — 수치와 경쟁 현황을 담아 3-4문장으로",
  "why": [
    {"num": "MARKET", "title": "시장 수요 제목", "body": "강의/베스트셀러 데이터 근거로 2-3문장"},
    {"num": "TIMING", "title": "타이밍 제목", "body": "지금이 출간 적기인 이유 2-3문장 (경쟁 도서 노후화, 공백 등 데이터 활용)"},
    {"num": "READER", "title": "독자층 제목", "body": "구체적 독자 페르소나와 확장성 2-3문장"},
    {"num": "OSMU", "title": "IP 확장 제목", "body": "전자책·강의·기업교육 등 확장 가능성 2-3문장"}
  ],
  "hanbit": [
    {"num": "DIST", "title": "유통 강점 제목", "body": "주요 서점 협업과 노출 전략 2문장"},
    {"num": "MKT", "title": "마케팅 제목", "body": "이 카테고리 독자 타겟 마케팅 전략 2-3문장"},
    {"num": "EDIT", "title": "편집 지원 제목", "body": "원고 기획부터 출간까지 지원 2문장"},
    {"num": "DATA", "title": "데이터 기획 제목", "body": "분석 수치를 활용한 기획 지원 설명 (구체적 수치 포함)"}
  ],
  "cta_head": "미팅 제안 헤드라인 (따뜻하게, 20자 이내)",
  "cta_desc": "미팅 제안 본문 — 가볍게 만나자는 내용, 2-3문장",
  "toc": [
    {"num": "1장", "title": "장 제목", "sub": "소제목·키워드1 · 키워드2"},
    {"num": "2장", "title": "장 제목", "sub": "소제목·키워드1 · 키워드2"},
    {"num": "3장", "title": "장 제목", "sub": "소제목·키워드1 · 키워드2"},
    {"num": "4장", "title": "장 제목", "sub": "소제목·키워드1 · 키워드2"},
    {"num": "5장", "title": "장 제목", "sub": "소제목·키워드1 · 키워드2"},
    {"num": "6장", "title": "장 제목", "sub": "소제목·키워드1 · 키워드2"},
    {"num": "부록", "title": "부록 제목", "sub": "부록 설명", "highlight": true}
  ],
  "discuss": [
    {"title": "이 책의 핵심 방향", "desc": "카테고리와 시장 분석 기반으로 제안하는 책의 핵심 포지셔닝과 차별점"},
    {"title": "목차 방향 논의", "desc": "위 목차는 가안이며, 저자님의 의견을 먼저 듣고 함께 완성하고 싶습니다."},
    {"title": "관련 추가 아이템", "desc": "이 분야에서 저자님이 추가로 관심 있는 도서 아이디어가 있다면 함께 이야기 나눠보고 싶습니다."}
  ]
}`;

  try{
    const resp=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{
        'x-api-key':apiKey,
        'anthropic-version':'2023-06-01',
        'content-type':'application/json',
        'anthropic-dangerous-direct-browser-access':'true'
      },
      body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:4000,messages:[{role:'user',content:prompt}]})
    });
    if(!resp.ok){const e=await resp.json().catch(()=>({}));throw new Error(e.error?.message||`HTTP ${resp.status}`);}
    const res=await resp.json();
    const text=res.content[0].text;
    const m=text.match(/\{[\s\S]*\}/);
    if(!m)throw new Error('JSON 형식 응답을 받지 못했습니다.');
    const r=JSON.parse(m[0]);

    const sv=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v||'';};
    sv('pf-title1',r.title1);sv('pf-title2',r.title2);
    sv('pf-hero-head',r.hero_head);sv('pf-hero-desc',r.hero_desc);
    (r.why||[]).forEach((w,i)=>{sv(`pw-num-${i}`,w.num);sv(`pw-title-${i}`,w.title);sv(`pw-body-${i}`,w.body);});
    (r.hanbit||[]).forEach((h,i)=>{sv(`ph-num-${i}`,h.num);sv(`ph-title-${i}`,h.title);sv(`ph-body-${i}`,h.body);});
    sv('pf-cta-head',r.cta_head);sv('pf-cta-desc',r.cta_desc);
    if(r.toc&&r.toc.length){
      document.getElementById('ptoc-rows').innerHTML='';
      pTocCnt=0;
      r.toc.forEach(t=>pAddToc({num:t.num,title:t.title,sub:t.sub||'',hl:!!t.highlight}));
    }
    if(r.discuss&&r.discuss.length){
      document.getElementById('pdiscuss-rows').innerHTML='';
      pDiscussCnt=0;
      r.discuss.forEach(d=>pAddDiscuss({title:d.title,desc:d.desc}));
    }
    pRender();
    showToast(`✨ AI가 "${catName}" 저자 제안서를 완성했습니다! 내용을 검토하고 PDF로 저장하세요.`,'green');
  }catch(err){
    pRender();
    showToast(`AI 생성 실패: ${err.message}`,'red');
    console.error('generateProposalWithAI error:',err);
  }finally{
    if(btn){btn.disabled=false;btn.textContent='✨ AI 생성';}
  }
}

// 토스트 알림
function showToast(msg,color='blue'){
  const t=document.createElement('div');
  const bg = color==='green'?'var(--green)':color==='red'?'var(--red)':color==='yellow'?'var(--yellow)':'var(--accent)';
  t.style.cssText=`position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);background:${bg};color:#fff;padding:.7rem 1.4rem;border-radius:12px;font-size:.8rem;z-index:9998;box-shadow:0 4px 20px rgba(0,0,0,.18);max-width:90vw;text-align:center;backdrop-filter:blur(8px);animation:toastIn .25s ease;`;
  t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity .3s';setTimeout(()=>t.remove(),300);},3200);
}

function toggleSection(id){
  const el=document.getElementById(id);
  if(el)el.classList.toggle('collapsible-section-closed');
}

function togglePlanRow(id){
  const el=document.getElementById(id);
  if(el)el.classList.toggle('open');
}

function tog(id){
  const el=document.getElementById(id);
  el.classList.toggle('open');
  el.querySelector('.cat-body').style.display=el.classList.contains('open')?'block':'none';
}

// ── 다운로드 ──

function dlHTML(){
  if(!analysisData.length){alert('먼저 분석을 실행하세요.');return;}
  const date=new Date().toLocaleDateString('ko-KR');
  const curY=new Date().getFullYear();
  const myName=myPub||'우리 출판사';
  const compName=compPubs.join(', ')||'경쟁사';

  const statusLabel={'gap':'공백','behind':'열세','leading':'우위','plan-only':'준비만'};
  const statusBg={'gap':'#fdf0ee','behind':'#fdf5e0','leading':'#e8f5ee','plan-only':'#f0eaf9'};
  const statusBd={'gap':'#f0c0bc','behind':'#f0d890','leading':'#b0d8be','plan-only':'#c8a8e8'};
  const statusFg={'gap':'#c0392b','behind':'#c07a00','leading':'#1a6b3c','plan-only':'#5b2d8e'};

  function actionText(d){
    const compTop=d.comp[0];
    const age=compTop&&compTop.year>2000?curY-compTop.year:-1;
    if(d.status==='gap'){
      if(d.planned.length)return '출간 준비 중 — 시기 조율로 선점 가능';
      if(d.lecture.length>=2)return '강의 수요 검증 — 도서화 즉시 검토';
      return '경쟁사 선점 시장 — 신규 기획 필요';
    }
    if(d.status==='behind')return age>=4?`경쟁 1위 ${age}년 경과 — 개정판으로 역전 타이밍`:'순위 격차 — 개정 또는 마케팅 강화';
    if(d.status==='leading')return '우위 유지 — 개정판·후속 시리즈 강화';
    return '강의→도서 전환 검토';
  }

  const sorted=[...analysisData].sort((a,b)=>{
    const o={gap:0,behind:1,'plan-only':2,leading:3};
    return (o[a.status]??9)-(o[b.status]??9)||(a.compBest||9999)-(b.compBest||9999);
  });

  // 요약 통계
  const gapN=sorted.filter(d=>d.status==='gap').length;
  const behindN=sorted.filter(d=>d.status==='behind').length;
  const leadN=sorted.filter(d=>d.status==='leading').length;
  const planN=sorted.filter(d=>d.status==='plan-only').length;
  const totalPop=analysisData.reduce((s,d)=>s+d.lecture.reduce((ss,l)=>ss+(l.pop||0),0),0);
  const totalPlanned=analysisData.reduce((s,d)=>s+d.planned.length,0);
  const oldBookN=analysisData.filter(d=>d.comp[0]&&d.comp[0].year>2000&&curY-d.comp[0].year>=4).length;

  // 즉시 액션 TOP5
  function priority(d){
    const totalP=d.lecture.reduce((s,l)=>s+(l.pop||0),0);
    const compTop=d.comp[0];const age=compTop&&compTop.year>2000?curY-compTop.year:-1;
    let s=0;
    if(d.status==='gap')s+=40;else if(d.status==='behind')s+=20;
    s+=Math.min(d.comp.length*2,20)+Math.min(d.lecture.length*3,15)+Math.min(Math.floor(totalP/1000),10);
    if(age>=4)s+=10;if(d.planned.length)s+=5;
    return s;
  }
  const top5=sorted.filter(d=>d.status==='gap'||d.status==='behind')
    .map(d=>({d,s:priority(d)})).sort((a,b)=>b.s-a.s).slice(0,5);

  const actionRows=top5.map(({d},i)=>{
    const compTop=d.comp[0];
    const age=compTop&&compTop.year>2000?curY-compTop.year:'';
    const totalP=d.lecture.reduce((s,l)=>s+(l.pop||0),0);
    return `<tr>
      <td style="padding:7px 10px;text-align:center;font-weight:700;color:#888;">${i+1}</td>
      <td style="padding:7px 10px;font-weight:700;">${d.cat}</td>
      <td style="padding:7px 10px;text-align:center;white-space:nowrap;"><span style="background:${statusBg[d.status]};color:${statusFg[d.status]};border:1px solid ${statusBd[d.status]};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;white-space:nowrap;display:inline-block;">${statusLabel[d.status]||d.status}</span></td>
      <td style="padding:7px 10px;font-size:12px;color:#333;">${actionText(d)}</td>
      <td style="padding:7px 10px;text-align:center;font-size:12px;">${d.comp.length}권</td>
      <td style="padding:7px 10px;font-size:11px;color:#555;">${compTop?compTop.title.slice(0,22)+(compTop.title.length>22?'…':''):'-'}${age?`<br><span style="color:${Number(age)>=4?'#c0392b':'#c07a00'};font-size:10px;">${age}년 경과</span>`:''}</td>
      <td style="padding:7px 10px;text-align:center;font-size:12px;">${d.lecture.length?`${d.lecture.length}개${totalP?`<br><span style="font-size:10px;color:#888;">${totalP.toLocaleString()}명</span>`:''}`:'-'}</td>
      <td style="padding:7px 10px;font-size:11px;color:#5b2d8e;">${d.planned.length?d.planned.slice(0,2).map(p=>p.title.slice(0,16)+(p.title.length>16?'…':'')).join('<br>')+(d.planned.length>2?`<br>+${d.planned.length-2}권`:''): '<span style="color:#aaa;">없음</span>'}</td>
    </tr>`;
  }).join('');

  // 전체 카테고리 테이블
  const rows=sorted.map(d=>{
    const compTop=d.comp[0];
    const age=compTop&&compTop.year>2000?curY-compTop.year:-1;
    const totalP=d.lecture.reduce((s,l)=>s+(l.pop||0),0);
    const compBooks=d.comp.slice(0,3).map(b=>{
      const a=b.year>2000?curY-b.year:-1;
      return `<div style="font-size:11px;color:#444;margin:2px 0;line-height:1.4;">${b.rank}위 <span style="color:#333;">${b.title.slice(0,22)+(b.title.length>22?'…':'')}</span> <span style="color:#888;font-size:10px;">${b.pub||''}${b.year>2000?' · '+b.year+'년':''}</span>${a>=4?`<span style="color:#c0392b;font-size:9px;font-weight:700;margin-left:3px;">${a}년 경과</span>`:''}</div>`;
    }).join('');
    const mineBooks=d.mine.slice(0,3).map(b=>`<div style="font-size:11px;color:#1a6b3c;margin:2px 0;">${b.rank}위 ${b.title.slice(0,22)+(b.title.length>22?'…':'')}</div>`).join('');
    const planBooks=d.planned.slice(0,3).map(p=>`<div style="font-size:11px;margin:2px 0;"><span style="color:${isPlanning(p.status)?'#c07a00':'#5b2d8e'};">${isPlanning(p.status)?'◇기획예정':'●출간예정'}</span> <span style="color:#333;">${p.title.slice(0,18)+(p.title.length>18?'…':'')}</span>${p.team?`<span style="color:#888;font-size:10px;"> ${p.team}</span>`:''}</div>`).join('');
    const lecInfo=d.lecture.length?`<div style="font-size:11px;font-weight:700;color:#1a4f8a;">${d.lecture.length}개</div>${totalP?`<div style="font-size:10px;color:#888;">${totalP.toLocaleString()}명</div>`:''}`:'-';
    return `<tr style="border-bottom:1px solid #f0f0f0;">
      <td style="padding:8px 10px;font-weight:700;font-size:12px;background:${statusBg[d.status]};border-left:3px solid ${statusFg[d.status]};">${d.cat}</td>
      <td style="padding:8px 6px;text-align:center;white-space:nowrap;background:${statusBg[d.status]};"><span style="background:${statusBg[d.status]};color:${statusFg[d.status]};font-size:11px;font-weight:700;padding:2px 8px;border-radius:3px;border:1px solid ${statusBd[d.status]};white-space:nowrap;display:inline-block;">${statusLabel[d.status]||d.status}</span></td>
      <td style="padding:8px 10px;font-size:11px;color:#555;">${actionText(d)}</td>
      <td style="padding:8px 10px;">${compBooks||'<span style="color:#bbb;font-size:11px;">없음</span>'}</td>
      <td style="padding:8px 10px;">${mineBooks||'<span style="color:#bbb;font-size:11px;">없음</span>'}</td>
      <td style="padding:8px 10px;text-align:center;">${lecInfo}</td>
      <td style="padding:8px 10px;">${planBooks||'<span style="color:#bbb;font-size:11px;">없음</span>'}</td>
    </tr>`;
  }).join('');

  const html=`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>출판 경쟁 분석 리포트 — ${date}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;background:#f5f5f3;padding:24px;color:#1a1a18;font-size:13px;}
  .wrap{max-width:1200px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 2px 16px rgba(0,0,0,.1);overflow:hidden;}
  .hd{padding:22px 28px;background:#111;color:#fff;display:flex;justify-content:space-between;align-items:flex-end;}
  .hd h1{font-size:17px;font-weight:700;letter-spacing:-.02em;}
  .hd .meta{font-size:11px;color:#999;text-align:right;line-height:1.6;}
  .stats{display:flex;border-bottom:1px solid #eee;}
  .st{flex:1;padding:14px 12px;border-right:1px solid #eee;text-align:center;}
  .st:last-child{border-right:none;}
  .st .n{font-size:24px;font-weight:800;line-height:1;}
  .st .l{font-size:10px;color:#999;margin-top:3px;letter-spacing:.03em;}
  .n-r{color:#c0392b;}.n-y{color:#c07a00;}.n-g{color:#1a6b3c;}.n-b{color:#1a4f8a;}.n-p{color:#5b2d8e;}
  .sec{padding:18px 20px 8px;}
  .sec-title{font-size:12px;font-weight:800;color:#444;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #eee;}
  table{width:100%;border-collapse:collapse;}
  th{padding:8px 10px;background:#f8f8f6;font-size:10px;font-weight:700;color:#777;text-align:left;border-bottom:2px solid #e8e8e6;white-space:nowrap;}
  tr:hover td{background:rgba(0,0,0,.015);}
  .foot{padding:14px 20px;font-size:10px;color:#bbb;text-align:center;border-top:1px solid #eee;background:#fafaf8;}
  @media(max-width:900px){.stats{flex-wrap:wrap;}.st{min-width:33%;}table{font-size:11px;}}
</style></head><body>
<div class="wrap">
  <div class="hd">
    <div>
      <div style="font-size:10px;color:#888;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px;">출판 경쟁 분석 리포트</div>
      <h1>📊 ${myName} 시장 현황 분석</h1>
    </div>
    <div class="meta">vs ${compName}<br>${date} 기준</div>
  </div>
  <div class="stats">
    <div class="st"><div class="n n-r">${gapN}</div><div class="l">🚨 공백</div></div>
    <div class="st"><div class="n n-y">${behindN}</div><div class="l">⚠️ 열세</div></div>
    <div class="st"><div class="n n-g">${leadN}</div><div class="l">✅ 우위</div></div>
    <div class="st"><div class="n n-p">${planN}</div><div class="l">📋 준비만</div></div>
    <div class="st"><div class="n n-b">${analysisData.length}</div><div class="l">전체 카테고리</div></div>
    <div class="st"><div class="n" style="color:#333;">${totalPlanned}</div><div class="l">준비 중 도서</div></div>
    <div class="st"><div class="n n-b">${totalPop.toLocaleString()}</div><div class="l">강의 수강생 합계</div></div>
    <div class="st"><div class="n n-y">${oldBookN}</div><div class="l">노후 도서 기회</div></div>
  </div>

  ${top5.length?`
  <div class="sec">
    <div class="sec-title">🎯 즉시 액션 — 우선순위 Top ${top5.length}</div>
    <table>
      <thead><tr>
        <th style="width:30px;">#</th>
        <th style="width:130px;">카테고리</th>
        <th style="width:70px;white-space:nowrap;">상태</th>
        <th>전략 액션</th>
        <th style="width:55px;">경쟁사</th>
        <th>경쟁 1위 도서</th>
        <th style="width:80px;">강의/수강생</th>
        <th>준비 중 도서</th>
      </tr></thead>
      <tbody>${actionRows}</tbody>
    </table>
  </div>`:''}

  <div class="sec" style="padding-top:16px;">
    <div class="sec-title">📋 전체 카테고리 현황</div>
    <table>
      <thead><tr>
        <th style="width:130px;">카테고리</th>
        <th style="width:70px;white-space:nowrap;">상태</th>
        <th style="width:160px;">전략 액션</th>
        <th>경쟁사 도서 (상위 3)</th>
        <th>${myName} 도서 (상위 3)</th>
        <th style="width:70px;">강의</th>
        <th>준비 중 도서</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <div class="foot">한빛미디어 출판 도우미 · ${date} 생성 · 내부 자료 — 외부 유출 금지</div>
</div></body></html>`;

  const blob=new Blob([html],{type:'text/html;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='출판경쟁분석_'+new Date().toISOString().slice(0,10)+'.html';
  a.click();
}

function dlTemplate(){
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
    ['도서명','카테고리','담당팀','저자','출간월','진행사항'],
    ['혼자 공부하는 파이썬 2판','파이썬','개발1팀','홍길동','2026년06월','출간관리중'],
    ['5분 클로드','클로드/Claude','AI팀','김철수','2026년07월','원고작업'],
    ['n8n으로 시작하는 AI 자동화','노코드/자동화','AI팀','','2026년08월','기획중'],
  ]),'출간예정도서');
  XLSX.writeFile(wb,'출간예정_도서_템플릿.xlsx');
}
