const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { createCloud } = require('../index.cjs')
const { createService } = require('../../main/cloud/service')
const { seal, unseal } = require('../../main/cloud/crypto')
const blockedPorts=new Set([1,7,9,11,13,15,17,19,20,21,22,23,25,37,42,43,53,69,77,79,87,95,101,102,103,104,109,110,111,113,115,117,119,123,135,137,139,143,161,179,389,427,465,512,513,514,515,526,530,531,532,540,548,554,556,563,587,601,636,989,990,993,995,1719,1720,1723,2049,3659,4045,5060,5061,6000,6566,6665,6666,6667,6668,6669,6697,10080])
async function listenLoopback(server){for(let attempt=0;attempt<30;attempt++){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));if(!blockedPorts.has(server.address().port))return;await new Promise(resolve=>server.close(resolve))}throw new Error('无法分配测试HTTP端口')}

async function createLocalCollaborationFixture(t, { quota, clients = true,env={},conversionTimeout } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-collab-')), codes = new Map(), locations = new Map(), recoveries = new Map()
  let time = Date.now(), closed = false
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: text => seal(Buffer.alloc(32, 23), Buffer.from(text), 'test-device'), decryptString: bytes => unseal(Buffer.alloc(32, 23), bytes, 'test-device').toString() }
  const cloud = await createCloud({ directory: path.join(directory, 'server'), quota, clock: () => time,conversionTimeout, sms: { configured: true, send: async (phone, code) => codes.set(phone, code) }, env })
  await listenLoopback(cloud.server)
  const url = `http://127.0.0.1:${cloud.server.address().port}`
  async function client(phone) {
    if (codes.has(phone)) time += 61000
    const local = path.join(directory, `client-${locations.size}`); fs.mkdirSync(local)
    const instance = createService({ directory: local, safeStorage }); locations.set(instance, local)
    await instance.setServer(url); await instance.sendCode(phone); await instance.login(phone, codes.get(phone))
    if (!instance.status().account.enabled) { const enabled = await instance.enable(true); recoveries.set(phone, enabled.recovery); instance.ackRecovery() }
    else await instance.unlock(recoveries.get(phone))
    return instance
  }
  const localState = instance => JSON.parse(safeStorage.decryptString(fs.readFileSync(path.join(locations.get(instance), 'cloud.secure'))))
  async function request(route, { client: instance, token = instance ? localState(instance).token : undefined, method = 'GET', data, headers = {}, raw = false } = {}) {
    const response = await fetch(url + route, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(data !== undefined && !Buffer.isBuffer(data) ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(data === undefined ? {} : { body: Buffer.isBuffer(data) ? data : JSON.stringify(data) }) })
    const bytes = Buffer.from(await response.arrayBuffer())
    return { status: response.status, headers: response.headers, body: raw ? bytes : JSON.parse(bytes.toString()) }
  }
  async function cleanup() { if (closed) return; closed = true; cloud.server.closeAllConnections?.(); await cloud.close(); if (!path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep + 'seal-collab-')) throw new Error('测试目录越界'); fs.rmSync(directory, { recursive: true, force: true }) }
  t?.after?.(cleanup)
  const fixture = { cloud, directory, url, codes, safeStorage, locations, recoveries, client, localState, request, cleanup, advance: ms => { time += ms }, now: () => time, reopen: instance => createService({ directory: locations.get(instance), safeStorage }) }
  if (clients) { fixture.a = await client('13800111001'); fixture.b = await client('13800111002'); fixture.c = await client('13800111003') }
  return fixture
}
module.exports = { createLocalCollaborationFixture,listenLoopback }
