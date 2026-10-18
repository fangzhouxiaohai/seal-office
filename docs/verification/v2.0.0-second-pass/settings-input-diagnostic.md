# Settings fake-key truncation investigation

This is the independent investigator's record. After this investigation, the parent task corrected only the repository test fixture, preserved the secure-storage assertions and added full-field/exact-save assertions. The complete Settings file then passed 17/17. See `renderer-audit.json` for the original failed run and the corrected-file rechecks.

This investigation did not modify SettingsPage.tsx, its repository test, build outputs, application resources, accounts, or real credentials. All added files are private diagnostic harnesses. Translation secure-storage calls used synthetic in-memory implementations and an explicitly fake key.

## Cause reproduced

The repository key-saving test replaces the entire `window.electronAPI` with an object containing only `presentationAi`. `AppProvider` sees that the bridge is available. After its real 1500 ms automatic-backup timer, an empty workspace calls `桥接.backupClear()`. Because the partial test API omits that method, the bridge returns `当前环境不支持备份清理`. AppProvider opens a new `自动备份失败` context modal. Ant Design's ActionButton timer and rc-dialog focus management move focus away from the password input. Remaining keyboard characters are therefore not inserted into that input.

Relevant installed/source evidence:

- `renderer/src/store.ts:403`: clear/save backup dispatch.
- `renderer/src/store.ts:443`: real timer; delay is 1500 ms.
- `renderer/src/store.ts:456`: automatic-backup failure modal.
- `renderer/src/ipc/bridge.ts:327`: missing `backupClear` fallback.
- `node_modules/antd/lib/_util/ActionButton.js:41`: deferred modal button focus.
- `node_modules/rc-dialog/lib/Dialog/index.js`: modal-content focus.

`pair-instrumented.log` comes from a private copy of the original two tests. Both passed in that timing, but its actual focus trace explicitly captured the new automatic-backup modal during the current key test. The preceding failed-storage modal was not needed to explain this new focus target.

`SettingsCausal.test.tsx` independently waits for hydration, types the first `s`, crosses the real 1500 ms timer, then sends the remaining keyboard sequence without refocusing. This reproduces exactly an input value of `s` with the partial API. The second control changes only `backupClear` to a successful mock: no error modal appears, focus remains on the key input, all key characters remain complete, the full fake key reaches `saveService`, and it is absent from ordinary localStorage. The two causal assertions pass in `causal.log`.

## Production check

`browser.cjs` loaded the final Android production IIFE with its complete browser bridge. Only translation get/save service calls were replaced with an in-memory test service. It used native Chromium `webContents.insertText` one character at a time rather than setting the field value or calling React handlers. Both immediate and 120 ms per character trials typed all 14 code points, retained input focus throughout, passed the full fake key to `saveService`, cleared the password field after success, and left no plaintext key in localStorage. The slow trial crosses the backup deadline; the genuine browser `backupClear` succeeds once. No automatic-backup modal, browser error, external HTTP request, or production account operation occurred.

The exact mobile `office.js` SHA-256 is `71a108a88bb02bf47e206952c90439d0200dbb149a671e74c475138dcd0b2398`, identical to the already verified cloud-ready snapshots. Results and focus/input traces are in `production-report.json`; screenshot is `settings-production.png`.

Production trials waited for the initial service address to appear, so they validate normal hydrated input and the 1500 ms backup interaction. They do not claim to cover a deliberately delayed initial secure-store read with typing begun before hydration.

## Test-isolation recommendation

Keep the complete fake bridge, or explicitly mock `backupClear` successfully for this Settings test. Retain the full input-value assertion before saving, the complete `saveService` argument assertion, and the assertion that ordinary localStorage contains no plaintext key. Waiting for hydration is useful but does not itself isolate the independent automatic-backup timer. No runtime-code fix is needed for the reproduced test failure.

The first diagnostic configuration accidentally inherited the broad test include list through mergeConfig array concatenation; its original pair passed, then that isolated process was stopped. The corrected private configuration contains only the private diagnostic test file. The first causal run reached the expected modal but used a single-element query for Antd's duplicated modal title; its log is retained separately. The final causal test uses `findAllByText` and retains the focus/value assertions.
