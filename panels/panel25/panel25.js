(function(){
'use strict';

/* ═══════════════════════════════════════════
   panel25 — 기획 보드
   명세: 기획보드_명세서.md 기반
   종합 판단 패널 — 수집된 모든 데이터 → AI 종합 의견 + 아이템 + 저자 매칭
   ═══════════════════════════════════════════ */

var _result = null;  // AI 종합 결과
var _running = false;
var _justGenerated = false;  // 방금 생성 vs 캐시 구분

function getBoard() { return getPlanningBoard(); }
function saveBoard(b) { savePlanningBoard(b); _updateBadge(b); }
function _updateBadge(board) {
  var badge = document.getElementById('p25Badge');
  if (badge) {
    badge.textContent = board.items.length;
    badge.style.display = board.items.length > 0 ? 'inline-flex' : 'none';
  }
}

// ── 리스크 플래그 자동 태깅 (명세 3-3) ──
var RISK_PATTERNS = [
  { flag: '🔴 저서 보유', patterns: ['저자','저서','출간','지음','집필','저작'], meaning: '타사 계약 가능성' },
  { flag: '🟡 캐시카우', patterns: ['강의 문의','클래스101','패스트캠퍼스','전자책','VIP','마스터클래스','인프런','유데미','코딩 테스트','멘토링'], meaning: '출판 동기 약함' },
  { flag: '🔴 집필 고사', patterns: ['외부 강연 고사','집필 집중','정중히 고사','고사합니다'], meaning: '섭외 난망' }
];

function detectRiskFlags(description) {
  if (!description) return [];
  var desc = description.toLowerCase();
  var flags = [];
  RISK_PATTERNS.forEach(function(r) {
    r.patterns.forEach(function(p) {
      if (desc.indexOf(p) >= 0 && !flags.some(function(f){ return f.flag === r.flag; })) {
        flags.push({ flag: r.flag, meaning: r.meaning });
      }
    });
  });
  return flags;
}

// ── 집필 적합 자동 코멘트 (명세 3-4) ──
function writingComment(descScore) {
  if (descScore >= 18) return '글쓰기 검증됨 — 매뉴얼/입문서 집필 적합';
  if (descScore >= 14) return '집필력 미검증 — 샘플 원고 선확인 필요';
  return '장문 집필 습관 약함 — 공저/구성 보강 검토';
}

// ── 데이터 자동 수집 ──
function collectAllData() {
  var data = {};

  // 1. 리포트 — 최신 1개
  data.reports = [];
  if (window._REPORTS && window._REPORTS.reports && window._REPORTS.reports.length) {
    var latest = window._REPORTS.reports[0];
    data.reports = [{ title: latest.title, date: latest.date, summary: latest.summary || '', content: (latest.content || '').substring(0, 1500) }];
  }

  // 2. RSS 피드
  data.feed = [];
  data.feedTotal = 0;
  if (window._RSS_ARCHIVE && window._RSS_ARCHIVE.articles) {
    data.feedTotal = window._RSS_ARCHIVE.articles.length;
    data.feed = window._RSS_ARCHIVE.articles.slice(0, 30).map(function(a) {
      return { title: a.title, date: a.date, source: a.source_name, keywords: a.keywords || [], summary: a.summary || '' };
    });
  }

  // 3. 트렌드 키워드
  data.trends = [];
  if (window._RSS_ARCHIVE && window._RSS_ARCHIVE.weekly_trends) {
    var wt = window._RSS_ARCHIVE.weekly_trends;
    if (wt.length) data.trends = wt.slice(-3);
  }

  // 4. 키워드 분석 — 현재 세션만
  data.keywords = [];
  if (window._kwDisplayedCards && window._kwDisplayedCards.length) {
    data.keywords = window._kwDisplayedCards.slice(0, 20).map(function(c) {
      return { keyword: c.keyword, pick_type: c.pick_type, reason: c.reason, views: c.views, category: c.category };
    });
  }

  // 5. 유튜버 분석 — 현재 세션 + 리스크 플래그
  data.youtubers = [];
  if (window.YT_S && window.YT_S.searchResults && window.YT_S.searchResults.length) {
    data.youtubers = window.YT_S.searchResults.slice(0, 15).map(function(ch) {
      var sn = ch.snippet || {};
      var desc = sn.description || '';
      var flags = detectRiskFlags(desc);
      return {
        name: sn.title || '', subs: ch._subs || 0,
        videoCount: ch._videoCount || 0, titleMatch: ch._titleMatch || 0,
        description: desc.substring(0, 300),
        riskFlags: flags
      };
    });
  }

  // 6. 대시보드 분석 결과 (panel1 통합 분석)
  data.dashboard = { total: 0, myPub: '', gaps: [], behind: [], leading: [], summary: '' };
  var analysis = typeof getAnalysisData === 'function' ? getAnalysisData() : [];
  var bestRows = typeof getKwBestRows === 'function' ? getKwBestRows() : [];
  data.dashboard.total = bestRows.length;
  data.dashboard.myPub = typeof getMyPub === 'function' ? getMyPub() : '';
  if (analysis && analysis.length) {
    // 카테고리별 분석 결과
    analysis.forEach(function(d) {
      var item = {
        cat: d.cat,
        compCount: d.comp ? d.comp.length : 0,
        mineCount: d.mine ? d.mine.length : 0,
        plannedCount: d.planned ? d.planned.length : 0,
        lectureCnt: d.lectureCnt || 0,
        compBest: d.compBest,
        mineBest: d.mineBest
      };
      if (d.status === 'gap') data.dashboard.gaps.push(item);
      else if (d.status === 'behind') data.dashboard.behind.push(item);
      else if (d.status === 'leading') data.dashboard.leading.push(item);
    });
    data.dashboard.summary = '총 ' + analysis.length + '개 카테고리 분석 — 공백 ' + data.dashboard.gaps.length + '개, 열세 ' + data.dashboard.behind.length + '개, 우위 ' + data.dashboard.leading.length + '개';
  }

  // 7. 저자 목록
  data.authors = [];
  data.authorsTotal = 0;
  if (window._AUTHORS_DATA && window._AUTHORS_DATA.authors) {
    data.authorsTotal = window._AUTHORS_DATA.authors.length;
    data.authors = window._AUTHORS_DATA.authors.slice(0, 50).map(function(a) {
      return { name: a.name, count: a.count, pubs: a.pubs, bestRank: a.bestRank, totalDays: a.totalDays,
               books: (a.books || []).slice(0, 3).map(function(b){ return typeof b === 'string' ? b : b.title; }) };
    });
  }

  return data;
}

// ── 렌더 ──
function render() {
  var el = document.getElementById('p25Content');
  if (!el) return;

  var data = collectAllData();
  var board = getBoard();
  var boardCounts = {};
  board.items.forEach(function(it) { boardCounts[it.type] = (boardCounts[it.type] || 0) + 1; });
  var hasData = data.reports.length || data.feed.length || data.keywords.length || data.authors.length || data.dashboard.total;

  var html = '<div class="p25-wrap">';

  // 헤더
  html += '<div class="p25-header">';
  html += '<div class="p25-header-left"><h2>기획 보드</h2>';
  html += '<p class="p25-subtitle">흩어진 분석 결과를 모아 종합 판단을 내립니다.</p></div>';
  html += '<div class="p25-header-right">';
  if (_result) html += '<button class="p25-clear-result-btn" onclick="p25_clearResult()">결과 초기화</button>';
  html += '<button class="p25-run-btn" id="p25RunBtn" onclick="p25_run()"' + (hasData ? '' : ' disabled') + '>';
  html += '<span class="p25-run-icon">▶</span> 종합 의견 생성</button>';
  html += '</div></div>';

  // 데이터 현황
  html += '<div class="p25-status-grid">';
  [
    { icon:'📊', label:'리포트', count:data.reports.length },
    { icon:'📡', label:'RSS', count:data.feedTotal || data.feed.length },
    { icon:'📈', label:'트렌드', count:data.trends.length, unit:'주' },
    { icon:'🔑', label:'키워드', count:Math.max(data.keywords.length, boardCounts.keyword||0) },
    { icon:'📺', label:'유튜버', count:Math.max(data.youtubers.length, boardCounts.youtuber||0), unit:'명' },
    { icon:'📉', label:'대시보드', count: (data.dashboard.gaps.length + data.dashboard.behind.length + data.dashboard.leading.length) || (data.dashboard.total ? 1 : 0), unit: (data.dashboard.gaps.length + data.dashboard.behind.length + data.dashboard.leading.length) ? '개 카테고리' : (data.dashboard.total ? ' (미분석)' : '') },
    { icon:'📚', label:'저자', count:data.authorsTotal || data.authors.length, unit:'명' }
  ].forEach(function(s) {
    var ok = s.count > 0;
    html += '<div class="p25-status-card' + (ok ? '' : ' empty') + '">';
    html += '<span class="p25-status-icon">' + s.icon + '</span>';
    html += '<div class="p25-status-info"><div class="p25-status-label">' + s.label + '</div>';
    html += '<div class="p25-status-count">' + (ok ? s.count + (s.unit || '개') : '없음') + '</div></div></div>';
  });
  html += '</div>';

  // 진행 상태
  html += '<div class="p25-progress" id="p25Progress" style="display:none;"></div>';

  // 결과
  html += '<div class="p25-results" id="p25Results">';
  if (_result) {
    // 생성 날짜 + 캐시 여부 표시
    var isFromCache = !_justGenerated;
    var lastRun = board.lastRun;
    if (lastRun) {
      var d = new Date(lastRun);
      var dateStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
      html += '<div class="p25-result-meta">';
      html += '<span>📅 생성: ' + dateStr + '</span>';
      if (isFromCache) html += '<span class="p25-cache-badge">💾 저장된 결과</span>';
      else html += '<span class="p25-fresh-badge">✨ 방금 생성</span>';
      html += '</div>';
    }
    html += _renderResult(_result);
  } else if (!hasData) {
    html += '<div class="p25-no-data"><div class="icon">📭</div><p>분석할 데이터가 없습니다.</p>';
    html += '<p class="hint">시장 분석, 키워드 분석, 유튜버 분석 등을 먼저 진행하세요.</p></div>';
  }
  html += '</div>';

  html += '</div>';
  el.innerHTML = html;
}

// ── 결과 렌더 (명세 4-5) ──
function _renderResult(r) {
  var h = '';

  // summary — 상단 강조 박스
  if (r.summary) {
    h += '<div class="p25-summary-box"><div class="p25-summary-title">종합 의견</div>';
    h += '<p>' + escHtml(r.summary) + '</p></div>';
  }

  // recommendedItems — 아이템 카드 (fitType별 색상)
  if (r.recommendedItems && r.recommendedItems.length) {
    h += '<div class="p25-section-title">추천 기획 아이템</div>';
    h += '<div class="p25-items-grid">';
    r.recommendedItems.forEach(function(item, i) {
      var fitClass = item.fitType === '안전' ? 'fit-safe' : item.fitType === '데이터' ? 'fit-data' : 'fit-risk';
      h += '<div class="p25-item-card ' + fitClass + '">';
      h += '<div class="p25-item-fit">' + escHtml(item.fitType || '') + '</div>';
      h += '<div class="p25-item-concept">' + escHtml(item.concept) + '</div>';
      if (item.targetLevel) h += '<div class="p25-item-target">🎯 ' + escHtml(item.targetLevel) + '</div>';
      h += '<div class="p25-item-rationale">' + escHtml(item.rationale || '') + '</div>';
      h += '</div>';
    });
    h += '</div>';
  }

  // authorMatching — 비교 표
  if (r.authorMatching && r.authorMatching.length) {
    h += '<div class="p25-section-title">저자 매칭</div>';
    h += '<div class="p25-author-table"><table><thead><tr>';
    h += '<th>저자/채널</th><th>추천 아이템</th><th>강점</th><th>리스크</th><th>판정</th>';
    h += '</tr></thead><tbody>';
    r.authorMatching.forEach(function(am) {
      var vClass = (am.verdict || '').indexOf('안전') >= 0 ? 'verdict-safe' :
                   (am.verdict || '').indexOf('베팅') >= 0 ? 'verdict-bet' : 'verdict-hold';
      h += '<tr>';
      h += '<td class="p25-am-author">' + escHtml(am.author) + '</td>';
      h += '<td>' + escHtml(am.bestFitItem || '') + '</td>';
      h += '<td>' + escHtml(am.strength || '') + '</td>';
      h += '<td>' + escHtml(am.risk || '') + '</td>';
      h += '<td><span class="p25-verdict ' + vClass + '">' + escHtml(am.verdict || '') + '</span></td>';
      h += '</tr>';
    });
    h += '</tbody></table></div>';
  }

  // cautions — 주의사항 박스
  if (r.cautions && r.cautions.length) {
    h += '<div class="p25-cautions"><div class="p25-cautions-title">⚠️ 주의사항</div><ul>';
    r.cautions.forEach(function(c) { h += '<li>' + escHtml(c) + '</li>'; });
    h += '</ul></div>';
  }

  // 액션 버튼
  h += '<div class="p25-result-actions">';
  h += '<button class="p25-card-btn primary" onclick="p25_toProposal()">→ 저자 제안서로 전달</button>';
  h += '<button class="p25-card-btn primary" onclick="p25_toPlan()">→ 출판 기획서로 전달</button>';
  h += '</div>';

  return h;
}

// ── 종합 의견 생성 (명세 4장) ──
window.p25_run = async function() {
  if (_running) return;
  _running = true;

  var btn = document.getElementById('p25RunBtn');
  var progress = document.getElementById('p25Progress');
  btn.disabled = true;
  btn.innerHTML = '<span class="p25-spinner"></span> 분석 중…';
  progress.style.display = 'block';

  var data = collectAllData();
  var board = getBoard();

  try {
    var apiKey = await loadApiKey();
    if (!apiKey) { showToast('통합현황에서 Claude API 키를 설정해주세요.', 'orange'); return; }

    // Step 1: RSS 피드 분석
    _setProgress(progress, 1, 3, 'RSS 피드 종합 의견 생성 중…');
    var feedAnalysis = '';
    if (data.feed.length) {
      var feedPrompt = '아래 IT 업계 최근 뉴스를 출판 기획 관점에서 3~5줄로 종합하라. 어떤 주제가 뜨고, 어떤 기술이 주목받는지.\n\n';
      data.feed.forEach(function(f) {
        feedPrompt += '- [' + f.date + '] ' + f.title + (f.source ? ' (' + f.source + ')' : '') + '\n';
      });
      feedAnalysis = await callClaudeApi({ apiKey:apiKey, model:'claude-haiku-4-5-20251001', system:'IT 출판 편집자. 한국어. 간결체.', prompt:feedPrompt, maxTokens:500 }) || '';
    }

    // Step 2: 종합 의견 생성
    _setProgress(progress, 2, 3, '전체 데이터 종합 판단 중…');

    // 시스템 프롬프트 (명세 4-2)
    var sysPrompt = '너는 한국 IT 출판사(한빛미디어)의 베테랑 기획 편집자다.\n';
    sysPrompt += '아래 시장/키워드/유튜버 데이터를 종합해 출판 기획 판단을 내려라.\n\n';
    sysPrompt += '[반드시 적용할 5가지 판단 필터]\n';
    sysPrompt += '1. 한국 시장·한국 독자 우선\n';
    sysPrompt += '2. 주제 중복 회피 (외부 경쟁서 + 사내 타 팀 진행작 모두)\n';
    sysPrompt += '3. 무명 저자로도 가능해야 함 (유명 강사는 강의·전자책이 더 돈이 되어 집필 기피, 실력자는 경쟁사에 묶임)\n';
    sysPrompt += '4. 즉시 활용 가능해야 함 (따라 하면 결과 나오는 핸즈온 + 업무를 끝내주는 실무형). 경험담·에세이형 지양\n';
    sysPrompt += '5. 버전 추적 함정 회피 (도구·방법론이 6주마다 바뀜 + 한빛 신간 3~4주 지연). 원리·워크플로우 중심 선호\n\n';
    sysPrompt += '[판단 시 유의]\n';
    sysPrompt += '- 출판 적합도 점수만 높다고 추천하지 마라. "이 아이템에 이 채널이 맞는가"(주제 정합성)를 먼저 본다.\n';
    sysPrompt += '- 리스크 플래그(저서 보유/캐시카우/집필 고사)를 반드시 반영.\n';
    sysPrompt += '- 단정 짓지 말고, 안전 카드와 모험 카드를 구분해 제시.\n';
    sysPrompt += '- JSON만 출력. 마크다운 코드블록 금지.';

    // 유저 메시지 구성 (명세 4-3)
    var userMsg = '';

    if (data.reports.length) {
      userMsg += '[시장 리포트]\n';
      data.reports.forEach(function(r) { userMsg += r.title + ' (' + r.date + '): ' + (r.content || r.summary || '').substring(0, 500) + '\n'; });
      userMsg += '\n';
    }
    if (feedAnalysis) userMsg += '[RSS 피드 종합]\n' + feedAnalysis + '\n\n';

    if (data.trends.length) {
      userMsg += '[주간 트렌드]\n';
      data.trends.forEach(function(t) {
        userMsg += t.week + ': ' + Object.keys(t.keywords).slice(0, 10).map(function(k){ return k+'('+t.keywords[k]+')'; }).join(', ') + '\n';
      });
      userMsg += '\n';
    }

    // 키워드 병합
    var kwList = [];
    var kwSeen = {};
    data.keywords.forEach(function(c) { kwList.push(c); kwSeen[c.keyword] = true; });
    board.items.forEach(function(it) {
      if (it.type === 'keyword' && !kwSeen[it.title]) {
        kwList.push({ keyword: it.title, pick_type: (it.data && it.data.pick_type) || '', reason: (it.data && it.data.reason) || '' });
      }
    });
    if (kwList.length) {
      userMsg += '[키워드 데이터]\n';
      kwList.forEach(function(c) { userMsg += '[' + (c.pick_type||'').toUpperCase() + '] ' + c.keyword + (c.reason ? ': ' + c.reason.substring(0, 80) : '') + '\n'; });
      userMsg += '\n';
    }

    // 유튜버 병합 + 리스크 플래그
    var ytList = [];
    var ytSeen = {};
    data.youtubers.forEach(function(y) { ytList.push(y); ytSeen[y.name] = true; });
    board.items.forEach(function(it) {
      if (it.type === 'youtuber' && !ytSeen[it.title]) {
        ytList.push({ name: it.title, subs: (it.data && it.data.subs) || 0, videoCount: 0, riskFlags: [] });
      }
    });
    if (ytList.length) {
      userMsg += '[유튜버/저자 후보 — 리스크 플래그 포함]\n';
      ytList.forEach(function(y) {
        var line = y.name + ' (구독 ' + y.subs;
        if (y.videoCount) line += ', 관련영상 ' + y.videoCount + '개';
        line += ')';
        if (y.riskFlags && y.riskFlags.length) {
          line += ' ' + y.riskFlags.map(function(f){ return f.flag; }).join(' ');
        }
        userMsg += line + '\n';
      });
      userMsg += '\n';
    }

    if (data.dashboard.gaps.length || data.dashboard.behind.length || data.dashboard.leading.length) {
      userMsg += '[대시보드 통합 분석 — 자사: ' + (data.dashboard.myPub || '미설정') + ']\n';
      userMsg += data.dashboard.summary + '\n';
      if (data.dashboard.gaps.length) {
        userMsg += '공백 카테고리(경쟁사만 있음): ' + data.dashboard.gaps.map(function(g){ return g.cat + '(경쟁 ' + g.compCount + '종, 최고 ' + g.compBest + '위)'; }).join(', ') + '\n';
      }
      if (data.dashboard.behind.length) {
        userMsg += '열세 카테고리: ' + data.dashboard.behind.map(function(g){ return g.cat + '(자사 ' + g.mineBest + '위 vs 경쟁 ' + g.compBest + '위)'; }).join(', ') + '\n';
      }
      if (data.dashboard.leading.length) {
        userMsg += '우위 카테고리: ' + data.dashboard.leading.map(function(g){ return g.cat; }).join(', ') + '\n';
      }
      userMsg += '\n';
    } else if (data.dashboard.total) {
      userMsg += '[베스트셀러 데이터]\n총 ' + data.dashboard.total + '행 업로드됨 (통합 분석 미실행)\n\n';
    }

    if (data.authors.length) {
      userMsg += '[저자 DB]\n';
      data.authors.slice(0, 50).forEach(function(a) {
        userMsg += a.name + ' (' + a.pubs.join('/') + ') 도서: ' + a.books.join(', ') + '\n';
      });
      userMsg += '\n';
    }

    // 출력 스키마 (명세 4-4 확장)
    userMsg += '[다양성 규칙]\n';
    userMsg += '- recommendedItems는 정확히 3개. 각각 다른 주제 + 다른 대상 독자 수준이어야 한다.\n';
    userMsg += '- 대상 예시: "AI를 처음 접하는 비개발자", "AI 도구를 쓰기 시작한 실무자", "AI 에이전트를 직접 만드는 개발자" 등\n';
    userMsg += '- 컨셉 예시: AI 도구 활용서 / AI 코딩 실전 / AI 시스템 설계 / 비개발자 업무 자동화 / 특정 도구 입문 등 다양하게\n';
    userMsg += '- 같은 수준(입문-중급)으로만 몰리면 안 됨. 반드시 초보/중급/고급 또는 비개발자/실무자/개발자를 섞을 것\n\n';
    userMsg += '위 데이터를 종합해 아래 JSON 형식으로만 답하라. 다른 말 없이 JSON만.\n';
    userMsg += '{"summary":"한 단락 종합 의견 (시장 공백 + 키워드 + 저자를 한 흐름으로 연결)"';
    userMsg += ',"recommendedItems":[{"concept":"아이템 컨셉 한 줄","targetLevel":"대상 독자 수준 (초보/중급/고급 + 직군)","rationale":"왜 유망한지","fitType":"안전 | 데이터 | 모험"}]';
    userMsg += ',"authorMatching":[{"author":"이름","bestFitItem":"아이템 컨셉","strength":"강점","risk":"리스크","verdict":"안전한 정답 | 베팅 | 보류"}]';
    userMsg += ',"cautions":["주의사항1","주의사항2"]}';

    var text = await callClaudeApi({ apiKey:apiKey, model:'claude-sonnet-4-6', system:sysPrompt, prompt:userMsg, maxTokens:8000, noPersona:true });

    _setProgress(progress, 3, 3, '결과 정리 중…');

    // JSON 파싱
    var jsonStr = (text || '').replace(/```json?\s*/g,'').replace(/```/g,'').trim();
    var m = jsonStr.match(/\{[\s\S]*\}/);
    if (m) jsonStr = m[0];
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
    // 잘린 JSON 복구
    var opens = (jsonStr.match(/[\[{]/g) || []).length;
    var closes = (jsonStr.match(/[\]}]/g) || []).length;
    for (var ci = 0; ci < opens - closes; ci++) {
      var lastOpen = Math.max(jsonStr.lastIndexOf('['), jsonStr.lastIndexOf('{'));
      jsonStr += jsonStr[lastOpen] === '[' ? ']' : '}';
    }

    try {
      _result = JSON.parse(jsonStr);
    } catch(e2) {
      console.warn('[panel25] JSON 파싱 실패, 재시도:', jsonStr.substring(0, 200));
      throw new Error('AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.');
    }

    // localStorage 저장
    var boardSave = getPlanningBoard();
    boardSave.result = _result;
    boardSave.lastRun = new Date().toISOString();
    savePlanningBoard(boardSave);

    _justGenerated = true;
    showToast('종합 의견이 생성되었습니다.', 'green');
  } catch (e) {
    console.error('[panel25] 분석 실패:', e);
    showToast('분석 실패: ' + e.message, 'red');
  } finally {
    _running = false;
    btn.disabled = false;
    btn.innerHTML = '<span class="p25-run-icon">▶</span> 종합 의견 생성';
    progress.style.display = 'none';
    render();
  }
};

function _setProgress(el, step, total, msg) {
  var pct = Math.round(step / total * 100);
  el.innerHTML = '<div class="p25-progress-bar"><div class="p25-progress-fill" style="width:' + pct + '%"></div></div>' +
    '<div class="p25-progress-text">' + step + '/' + total + ' ' + msg + '</div>';
}

// ── 이벤트 ──
window.p25_clearResult = function() {
  _result = null;
  var board = getPlanningBoard();
  delete board.result;
  savePlanningBoard(board);
  render();
};

window.p25_toProposal = function() {
  if (!_result) return;
  window._p25_exportData = _result;
  switchTab(3, document.getElementById('tab3'));
  showToast('종합 의견을 저자 제안서로 전달했습니다.', 'green');
};
window.p25_toPlan = function() {
  if (!_result) return;
  window._p25_exportData = _result;
  switchTab(5, document.getElementById('tab5'));
  showToast('종합 의견을 출판 기획서로 전달했습니다.', 'green');
};

// ── 초기화 ──
function init() {
  var board = getPlanningBoard();
  if (board.result) { _result = board.result; _justGenerated = false; }
  render();
}

if (typeof PanelRegistry !== 'undefined') {
  PanelRegistry.register(25, {
    onActivate: function() { init(); },
    onDeactivate: function() {}
  });
}

})();
