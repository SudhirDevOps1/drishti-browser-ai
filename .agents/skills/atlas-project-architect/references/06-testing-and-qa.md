# 06 — Testing & QA

## Levels

Unit · integration · component · API/contract · database · E2E · regression · accessibility · performance · security · build · fresh-clone install.

## Tools by stack

| Stack | Unit | E2E | Extras |
|---|---|---|---|
| JS/TS | Vitest / Jest | Playwright | Testing Library, axe, Lighthouse CI |
| Python | pytest | Playwright | Hypothesis |
| Java | JUnit 5 | — | Testcontainers |
| Go | go test | — | httptest |
| Rust | cargo test | — | proptest |
| Mobile | platform | Maestro / Detox | screenshot tests |

Don't install all of them. Choose per actual need.

## Must-test list

Happy path · invalid input · missing fields · unauthorised access · cross-user isolation · empty state · error state · network failure · timeout · repeated/cloned requests · concurrent writes · pagination edges · large input · unicode/RTL · responsive breakpoints · keyboard path · production build.

## E2E realism

No "page loads" tests. Test behaviour: create → persists → read back → edit → delete → gone; login → protected access → logout → blocked; state transitions for payments/orders.

## Evidence format

```
Command: pnpm test
Suites:  12 passed / 0 failed
Tests:   184 passed, 0 failed, 3 skipped
Time:    38.2s
Env:     Node 22, Windows 11, commit a1b2c3d, 2026-11-24
Not run: Playwright (browser missing) — reason
```

## Flaky tests

Quarantine with an issue + owner. Never delete. Never retry-forever to hide. Fix the nondeterminism.

## Coverage

Report measured coverage with the tool name. Never claim a number you didn't measure. Coverage is a signal, not a target.

## Bug hunting after each slice

Read your own diff as a hostile reviewer: broken imports · missing deps · runtime/type errors · state bugs · races · leaks · wrong contracts · unhandled rejections · a11y regressions · responsive breaks · security holes · perf cliffs · dead code · broken nav · stale docs.

Severity: Critical (data loss/auth bypass/crash) → stop; High (main flow broken) → fix now; Medium → fix or log; Low → log; Info → propose.

Fix root cause, add regression test, re-run neighbours. Never weaken an assertion to pass.

## Test report file

`docs/TESTING.md` — commands, environments, current results, known gaps, how to reproduce failures.
