// Publish evidence identities and bounded observations, never third-party code or bytes.
const fs = require('fs'), path = require('path'), crypto = require('crypto')
const root = path.resolve(__dirname, '..'), base = path.join(root, '.upgrade-private/wps-native-v2.0.0')
const decode = raw => raw.structuredContent?.result ?? raw.structuredContent ?? JSON.parse(raw.content.find(item => item.type === 'text').text)
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const targetGroups = { xlsxrw: ['xlsxrw'], wppcore: ['wppcore'], wpsio: ['wpsio'], etcore: ['etcore', 'etcore-retry'], wpscore: ['wpscore', 'wpscore-retry'] }
const components = Object.entries(targetGroups).map(([name, directories]) => {
  const attempts = directories.map(directory => {
    const folder = path.join(base, directory)
    if (!fs.existsSync(folder)) return { directory, status: 'not-started', records: [] }
    const records = fs.readdirSync(folder).filter(file => /^\d{3}-.*\.json$/.test(file)).map(file => {
      const bytes = fs.readFileSync(path.join(folder, file)), raw = JSON.parse(bytes), value = decode(raw), normalized = value.normalized_result
      const item = { operation: file.replace(/^\d{3}-|\.json$/g, ''), rawRecord: path.relative(root, path.join(folder, file)).replaceAll('\\', '/'), rawRecordSha256: sha(bytes), failed: raw.isError === true }
      if (value.evidence_id) item.evidenceId = value.evidence_id
      if (value.subject?.digest) item.targetSha256 = value.subject.digest.sha256
      if (item.operation === 'open_binary') Object.assign(item, { targetSha256: value.sha256, architecture: value.architecture })
      if (item.operation === 'binary_overview' && normalized) item.inventory = { procedures: normalized.procedure_count, definedStrings: normalized.string_count, imageBase: normalized.image_base }
      if (item.operation === 'analyze_function' && normalized?.procedure) item.function = { address: normalized.procedure.address, name: normalized.procedure.name, bodyBytes: normalized.procedure.body?.total_bytes, pseudocodeAvailable: Boolean(normalized.pseudocode), callers: normalized.callers?.length, callees: normalized.callees?.length, limitations: normalized.limitations }
      if (value.error) item.error = { code: value.error.code, message: value.error.message, retryable: value.error.retryable }
      return item
    })
    const overview = records.find(record => record.operation === 'binary_overview')
    return { directory, status: overview ? overview.failed ? 'failed' : 'auto-analysis-complete' : 'pending', closed: records.some(record => record.operation === 'close_binary' && !record.failed), records }
  })
  return { name: name + '.dll', attempts, currentStatus: attempts.at(-1).status }
})
const report = {
  version: '2.0.0', recordedAt: new Date().toISOString(), reaVersion: '6.5.0', ghidraVersion: '12.1.4', wpsVersion: '12.1.0.26895',
  method: 'REA MCP stdio sessions with project-local Ghidra and JDK; original native targets remain immutable',
  fullWpsParityAchieved: false, allWpsCommandsExecuted: false, components,
  observations: [
    { component: 'xlsxrw.dll', address: '0x10169e50', evidence: 'ev_d93cf355e770e7b82b70959705e09cf9cfa5331a533ff7073cd3f4aa73f559eb', confidence: 'observed', finding: 'Conditional futureMetadata writer emits the standard dynamic-array extension URI and dynamic/collapsed flags; another branch writes rich-value future metadata.', implementedIndependently: 'Standard XLDAPR cell metadata roundtrip; unknown rich-value metadata remains an explicit fidelity boundary.' },
    { component: 'xlsxrw.dll', address: '0x10169700', evidence: 'ev_6ea03ae3fa6352633ef4e0383ee09819057ea97d0a6021354c362cf6fba2d6a2', confidence: 'observed', finding: 'Workbook metadata-part creation, metadata types, future metadata and cell metadata are separate writer stages.' },
    { component: 'xlsxrw.dll', address: '0x10123c10', evidence: 'ev_9460f0e739a8f1f3e62baa08168ba164644edeae726cd94770bf8f60b97900a2', confidence: 'observed', finding: 'A name-enumeration/filter path distinguishes xlfn and wpsfn prefixes; this does not establish complete formula parsing or evaluation semantics.' },
    { component: 'wppcore.dll', address: '0x101cf050', evidence: 'ev_712a5907e7ec581a9d8534d708899643ae6630b1f6b571c0409ee03dbf42ede6', confidence: 'observed', finding: 'Serialization path handles layout/follow identifiers, transition, timing, theme override and color mapping as separate fields; indirect callees and complete motion behavior remain unresolved.' },
    { component: 'wpsio.dll', report: 'docs/v2.0.0-WPS文字引擎观察.md', confidence: 'observed', finding: 'Five bounded native paths cover footnote-part acquisition/content indexing, field begin/separator/end, section import and revision property association. The report separates observations from inferred semantics.' },
    { component: 'etcore.dll', address: '0x10426f8c', evidence: 'ev_79650a9a3625a3f9c7f699edec01dff593bc17491af981bc3f69fc6f15786191', confidence: 'observed', finding: 'A formula optimization result path assembles source/optimized expressions, their durations, sheet/range, first-cell value and a separate dynamic-array flag into a suggestion list. This is diagnostic/result presentation evidence, not the formula evaluator or spill algorithm.' },
    { component: 'etcore.dll', address: '0x103fb668', evidence: 'ev_04921646e3c58e76b558c6cbc29f76ae00775785c94dae07ec91938159a78f6f', confidence: 'observed', finding: 'Retained pseudocode inspected through two pages identifies command registration, including put_Date1904. Its callback address is not a recovered Ghidra procedure; the date setter algorithm remains unresolved. Registration does not prove date conversion semantics.' },
    { component: 'wpscore.dll', address: '0x113136b0', evidence: 'ev_200810739050037299d7dda37c58ffb0ad073c57819b035a9478254de0a725d7', confidence: 'observed', finding: 'An actual revision rendering path conditionally installs a revision-field filter according to capability/current state, then restores prior filtering. Eleven indirect calls remain unresolved; complete revision layout/history is not established.' },
    { component: 'wpscore.dll', address: '0x10cb5670', evidence: 'ev_20226a9c941ec964fa52970fe254f013f2886652183fdbbf7ddb152f26d47ed2', confidence: 'observed', finding: 'A table-transpose impact/confirmation path includes annotations, bookmarks, fields, revisions and recalculation. It is not the acceptance-of-revisions algorithm. Sixty-five indirect calls and truncated value-flow observations limit further inference.' },
  ],
  limitations: [
    'Default Ghidra auto-analysis completion is not proof that every function, runtime path or WPS feature was understood or reconstructed.',
    'Missing original symbols, unresolved indirect calls, compiler transformations and packed/undefined strings limit static results.',
    'Initial 20-minute imports for the two largest engines timed out; separate retries use a 60-minute deadline and retain the original failures.',
    'No WPS binaries, private implementation, icons or vendor templates are included in product builds; public OOXML specifications and independent fixtures drive implementation.',
    'Exact pagination/fonts, every formula parameter, dynamic spilling, full native revision history and every cloud/team feature have not been proven equivalent.',
  ],
}
const output = path.join(root, 'docs/verification/v2.0.0-second-pass/wps-native.json')
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ output, components: components.map(item => ({ name: item.name, status: item.currentStatus })), fullWpsParityAchieved: false }))
