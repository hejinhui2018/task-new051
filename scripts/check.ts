import { SCENARIOS, runScenario } from '../src/engine/scenarios';

let total = 0;
let passed = 0;
for (const sc of SCENARIOS) {
  const r = runScenario(sc);
  console.log(`\n=== ${sc.title}（${sc.id}，事件 ${r.eventCount}）===`);
  for (const c of r.results) {
    total += 1;
    if (c.pass) {
      passed += 1;
      console.log(`  ✓ ${c.desc}`);
    } else {
      console.log(`  ✗ ${c.desc}${c.detail ? ` —— ${c.detail}` : ''}`);
    }
  }
}
console.log(`\n结果：${passed}/${total} 通过`);
if (passed !== total) process.exit(1);
