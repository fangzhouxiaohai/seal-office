// Shared by live deletion and backup sanitization, including older database schemas.
function eraseRecords(db, userId, secret) {
  const tables = new Set(db.query("SELECT name FROM sqlite_master WHERE type='table'").map(row => row.name))
  const rows = (table, sql, params = [userId]) => tables.has(table) ? db.query(sql, params) : []
  const run = (table, sql, params = [userId]) => { if (tables.has(table)) db.run(sql, params) }
  const person = rows('users','SELECT phone FROM users WHERE id=?')[0]
  const files = [
    ...rows('versions','SELECT blob FROM versions WHERE user_id=?').map(row=>({directory:'objects',name:row.blob})),
    ...rows('publications','SELECT blob FROM publications WHERE user_id=?').map(row=>({directory:'objects',name:row.blob})),
    ...rows('uploads','SELECT id FROM uploads WHERE user_id=?').map(row=>({directory:'incoming',name:row.id})),
  ]
  for (const team of rows('teams','SELECT id FROM teams WHERE owner_id=?')) {
    files.push(...rows('team_versions','SELECT blob FROM team_versions WHERE team_id=?',[team.id]).map(row=>({directory:'team-objects',name:row.blob})))
    for(const table of ['team_versions','team_nodes','team_invites','team_members']) run(table,`DELETE FROM ${table} WHERE team_id=?`,[team.id])
  }
  for(const room of rows('realtime_rooms','SELECT id FROM realtime_rooms WHERE owner_id=?')) {
    for(const table of ['realtime_updates','realtime_receipts','realtime_presence'])run(table,`DELETE FROM ${table} WHERE room_id=?`,[room.id])
  }
  if(tables.has('sessions'))run('realtime_presence','DELETE FROM realtime_presence WHERE session_hash IN (SELECT hash FROM sessions WHERE user_id=?)')
  run('shares','DELETE FROM shares WHERE owner_id=? OR recipient_id=?',[userId,userId])
  run('team_invites','DELETE FROM team_invites WHERE inviter_id=? OR recipient_id=?',[userId,userId])
  // Documents owned by other teams remain theirs; remove the deleted account's cleartext attribution.
  for(const table of ['team_versions','realtime_updates'])run(table,`UPDATE ${table} SET actor_id='deleted-account' WHERE actor_id=?`)
  for(const table of ['teams','realtime_rooms'])run(table,`DELETE FROM ${table} WHERE owner_id=?`)
  for(const table of ['passwords','team_members','node_tags','tags','nodes','versions','uploads','publications','session_devices','sessions','audit'])run(table,`DELETE FROM ${table} WHERE user_id=?`)
  run('audit',"UPDATE audit SET detail='' WHERE instr(COALESCE(detail,''),?)>0")
  if(person) {
    if(secret&&tables.has('password_attempts'))for(const key of ['login-phone:'+person.phone,'change:'+userId])db.run('DELETE FROM password_attempts WHERE key=?',[require('node:crypto').createHmac('sha256',secret).update(key).digest('hex')])
    for(const table of ['codes','sends'])run(table,`DELETE FROM ${table} WHERE phone=?`,[person.phone])
    run('audit',"UPDATE audit SET detail='' WHERE instr(COALESCE(detail,''),?)>0",[person.phone])
  }
  run('users','DELETE FROM users WHERE id=?')
  return files
}
module.exports={eraseRecords}
