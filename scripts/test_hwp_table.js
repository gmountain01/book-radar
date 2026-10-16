// HWP·HWPX 표 → Markdown 표(원고 조판 보기용, P8Hwp5.tableMd)
const assert = require('assert');
require('../panels/panel8/hwp5.js');
const { tableMd } = globalThis.P8Hwp5;
const C = (r, c, ...lines) => ({ r, c, lines });

assert.strictEqual(tableMd([C(0, 0, '항목'), C(0, 1, '설명'), C(1, 0, 'A|B'), C(1, 1, '첫 줄', '둘째 줄'), C(2, 0, '합침')]),
  '| 항목 | 설명 |\n| --- | --- |\n| A\\|B | 첫 줄<br>둘째 줄 |\n| 합침 |  |');          // 칸 안 | 이스케이프, 여러 문단 <br>, 합친 칸 빈칸
assert.strictEqual(tableMd([C(0, 0, '상자', '내용')]), '[박스]\n상자\n내용');                   // 한 칸짜리 표는 상자
assert.strictEqual(tableMd([C(0, 0), C(0, 1)]), '');                                          // 빈 표는 버림
const inner = tableMd([C(0, 0, '안1'), C(0, 1, '안2'), C(1, 0, '안3')]);
assert.strictEqual(tableMd([C(0, 0, '안쪽'), C(0, 1, inner)]), '| 안쪽 | 안1 · 안2<br>안3 |\n| --- | --- |'); // 셀 속 표는 글자로 풀기
console.log('  ✓ HWP·HWPX 표 → Markdown 표 점검 통과');
