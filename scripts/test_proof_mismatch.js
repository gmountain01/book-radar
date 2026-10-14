// AI 교정 지적의 원문·수정안 불일치 가드 — 가짜 응답(유료 호출 없음)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { makeSandbox, loadScript, SCRIPTS, ROOT } = require('./run_tests.js');

module.exports = async function () {
  const sb = makeSandbox();
  const base = '포스트 트레이닝을 거치기 전 단계임을 강조할 때는 베이스 모델base model이라고도 합니다. 다만 베이스 모델은 아직 대화형 어시스턴트처럼 동작하지 않습니다.';
  const pref = '선호도 미세 조정preference Fine-tuning은 모델의 응답을 사람이 선호하는 방향으로 조정alignment하는 단계입니다.';
  const page = { page: 1, text: base + '\n' + pref + '\n' + '이 문장은 다를 수 있습니다. '.repeat(10), lines: [], headings: [] };
  sb.fetch = async (url, init) => {
    const issues = [
      { page: 1, type: '표기불일치', severity: 'medium', found: base.slice(0, 60), suggestion: pref.replace('Fine-tuning', 'fine-tuning'), description: '표기 혼용' }, // 원문≠수정안 문장
      { page: 1, type: '표기불일치', severity: 'low', found: 'preference Fine-tuning', suggestion: 'preference fine-tuning', description: '대문자' },            // 정상(어절 교체)
      { page: 1, type: '문법', severity: 'medium', found: '이 문장은 다를 수 있습니다.', suggestion: '이 문장은 다룰 수 있습니다.', description: '오탈자' },      // 정상(한 글자 수정)
    ];
    return { ok: true, status: 200, json: async () => ({ model: 'claude-sonnet-4-6', stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: JSON.stringify({ issues }) }] }) };
  };
  for (const s of SCRIPTS) if (fs.existsSync(path.join(ROOT, s)) && !/api-keys/.test(s)) loadScript(sb, s);
  const r = await sb.__p8Eval.checkLinguistic({ filename: 't', total_pages: 1, pages: [page], toc: [] }, 'sk-ant-x', () => {}, () => {});
  assert.equal(r.issues.length, 3);
  const [mis, cap, typo] = r.issues;
  assert(mis.noAutoReplace && mis.mismatch && /참고용/.test(mis.description), 'mismatched sentence must not be auto-applied');
  assert(!cap.noAutoReplace && !typo.noAutoReplace, 'normal edits stay applicable');
  // 번역체·일본식 표현 규칙: 잡힌 어구로 실제 예시를 만들고, 예시는 교정본에 자동 적용하지 않는다
  const P8 = sb.__p8Eval;
  const txt = '이 세 방식은 절대적인 점수에서 상대적인 비교로 확장됩니다. 학습함에 있어서 데이터를 통해서 배운다. 시스템에서의 처리와 사용자로부터의 피드백을 본다. '.repeat(2);
  const sur = P8.checkSurface({ pages: [{ page: 1, text: txt }] }).filter(i => /일본식표현|번역체/.test(i.type));
  const sg = f => (sur.find(i => i.found === f) || {}).suggestion || '';
  assert(sg('절대적인 점수에서').includes('"절대적인 점수에서" → "절대 점수에서"'), sg('절대적인 점수에서'));
  assert(sg('학습함에 있어서') === '' ? true : sg('함에 있어서').includes('→ "할 때"'));
  assert(sg('데이터를 통해서').includes('→ "데이터를 통해"'));
  assert(sg('시스템에서의 ').includes('→ "시스템에서"') && sg('사용자로부터의 ').includes('→ "사용자"'));
  assert(sur.every(i => P8._cleanSuggestion(i) === ''), 'examples must not be auto-applied to the corrected file');
  // 카드의 원문 줄·수정안 줄: 같은 어절은 그대로 두고 바뀐 어절만 표시한다(두 줄이 같은 앞 문맥에서 시작)
  const [dA, dB] = P8._wordDiffHtml('이 문장은 다를 수 있습니다.', '이 문장은 다룰 수 있습니다.');
  assert.equal(dA, '이 문장은 <span class="ctx-found">다를</span> 수 있습니다.');
  assert.equal(dB, '이 문장은 <span class="diff-add">다룰</span> 수 있습니다.');
  const [eA, eB] = P8._wordDiffHtml('값을 <b> 넣고 다시 실행을 합니다', '값을 <b> 넣은 뒤 실행합니다');
  assert(eA.startsWith('값을 &lt;b&gt; <span class="ctx-found">넣고</span>') && eB.startsWith('값을 &lt;b&gt; <span class="diff-add">넣은</span>'), eA + ' / ' + eB);
  const cx = { before: '…몇 분이 걸릴 수 있으니 ', target: '창을 닫지 말고', after: ' 기다리세요. 이 도구는…' };
  assert.equal(P8._suggCore('몇 분이 걸릴 수 있으니 창을 닫지 않고 기다리세요.', cx), '창을 닫지 않고'); // 문장 전체를 고쳐 준 수정안: 앞뒤 문맥과 겹치는 부분은 떼고 맞춘다
  assert.equal(P8._suggCore('창을 닫지 않고', cx), '창을 닫지 않고');
  console.log('PASS: proof mismatch guard — cross-sentence suggestion flagged, word/typo edits untouched');
};
