const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')

const ACCESS_RUNTIME_URL = 'https://support.microsoft.com/zh-cn/access/download-and-install-microsoft-365-access-runtime'
const ACCESS_EXTENSIONS = new Set(['.accdb', '.mdb'])
const READ_ACTIONS = new Set(['inspect', 'query', 'readTable'])
const WRITE_ACTIONS = new Set(['execute', 'insert', 'update', 'delete', 'createTable', 'dropTable', 'importRows'])
const ALL_ACTIONS = new Set(['status', 'create', ...READ_ACTIONS, ...WRITE_ACTIONS])
const MAX_QUERY_ROWS = 5000
const MAX_IMPORT_ROWS = 10000
const MAX_IMPORT_COLUMNS = 255

const POWERSHELL_SCRIPT = String.raw`
param(
  [Parameter(Mandatory = $true)][string]$RequestPath,
  [Parameter(Mandatory = $true)][string]$ResultPath
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
Add-Type -AssemblyName System.Data

function Write-SealResult([object]$Payload) {
  $json = $Payload | ConvertTo-Json -Depth 16 -Compress
  [System.IO.File]::WriteAllText($ResultPath, $json, (New-Object System.Text.UTF8Encoding($false)))
}

function Get-Cell($Row, [string]$Name) {
  if ($null -eq $Row -or $null -eq $Row.Table -or -not $Row.Table.Columns.Contains($Name)) { return $null }
  $value = $Row[$Name]
  if ($null -eq $value -or $value -is [System.DBNull]) { return $null }
  return $value
}

function Quote-Ident([string]$Name) {
  if ([string]::IsNullOrWhiteSpace($Name) -or $Name.IndexOf([char]0) -ge 0) { throw '数据库对象名称无效' }
  return '[' + $Name.Replace(']', ']]') + ']'
}

function Convert-SealValue([object]$Value) {
  if ($null -eq $Value -or $Value -is [System.DBNull]) { return $null }
  if ($Value -is [byte[]]) {
    return [ordered]@{ __type = 'binary'; length = $Value.Length }
  }
  if ($Value -is [DateTime]) { return $Value.ToString('o') }
  if ($Value -is [DateTimeOffset]) { return $Value.ToString('o') }
  if ($Value -is [Guid] -or $Value -is [TimeSpan]) { return $Value.ToString() }
  if ($Value -is [System.Data.SqlTypes.INullable] -and $Value.IsNull) { return $null }
  if ($Value -is [string] -or $Value -is [bool] -or $Value -is [byte] -or
      $Value -is [int16] -or $Value -is [int32] -or $Value -is [int64] -or
      $Value -is [single] -or $Value -is [double] -or $Value -is [decimal]) { return $Value }
  return $Value.ToString()
}

function Add-SealParameters($Command, [object[]]$Values) {
  foreach ($value in $Values) {
    $parameter = $Command.CreateParameter()
    $parameter.Value = if ($null -eq $value) { [DBNull]::Value } else { $value }
    [void]$Command.Parameters.Add($parameter)
  }
}

function Read-SealRows($Command, [int]$Limit) {
  $reader = $Command.ExecuteReader()
  try {
    $columns = @()
    for ($index = 0; $index -lt $reader.FieldCount; $index += 1) {
      $columns += [ordered]@{ name = $reader.GetName($index); type = $reader.GetFieldType($index).Name }
    }
    $rows = @()
    $truncated = $false
    while ($reader.Read()) {
      if ($rows.Count -ge $Limit) { $truncated = $true; break }
      $row = [ordered]@{}
      for ($index = 0; $index -lt $reader.FieldCount; $index += 1) {
        $row[$reader.GetName($index)] = Convert-SealValue $reader.GetValue($index)
      }
      $rows += [pscustomobject]$row
    }
    return [ordered]@{ columns = $columns; rows = $rows; truncated = $truncated; rowCount = $rows.Count }
  } finally {
    $reader.Close()
  }
}

function Get-ProviderList {
  $providers = @()
  try {
    $table = [System.Data.OleDb.OleDbEnumerator]::GetRootEnumerator()
    while ($table.Read()) {
      $name = [string]$table['SOURCES_NAME']
      if ($name -match '^(Microsoft\.(ACE|Jet)\.OLEDB\.)') { $providers += $name }
    }
    $table.Close()
  } catch {}
  return @($providers | Sort-Object -Unique)
}

function New-SealConnection($Request) {
  $builder = New-Object System.Data.OleDb.OleDbConnectionStringBuilder
  $builder.Provider = [string]$Request.provider
  # PowerShell 的属性赋值会输出 DataSource（无空格），ACE 会把它当成未知
  # 扩展属性并报“找不到可安装的 ISAM”；必须使用标准 OLE DB 键名。
  $builder['Data Source'] = [string]$Request.path
  if (-not [string]::IsNullOrEmpty([string]$Request.databasePassword)) {
    $builder['Jet OLEDB:Database Password'] = [string]$Request.databasePassword
  }
  if (-not [string]::IsNullOrEmpty([string]$Request.userName)) { $builder['User ID'] = [string]$Request.userName }
  if (-not [string]::IsNullOrEmpty([string]$Request.userPassword)) { $builder['Password'] = [string]$Request.userPassword }
  if (-not [string]::IsNullOrEmpty([string]$Request.workgroupPath)) { $builder['Jet OLEDB:System database'] = [string]$Request.workgroupPath }
  $connection = New-Object System.Data.OleDb.OleDbConnection($builder.ConnectionString)
  $connection.Open()
  return $connection
}

function Get-SealSchema($Connection, $Request) {
  $tableRows = $Connection.GetSchema('Tables')
  $columnRows = $Connection.GetSchema('Columns')
  $indexRows = $null
  $foreignRows = $null
  try { $indexRows = $Connection.GetOleDbSchemaTable([System.Data.OleDb.OleDbSchemaGuid]::Indexes, $null) } catch {}
  try { $foreignRows = $Connection.GetOleDbSchemaTable([System.Data.OleDb.OleDbSchemaGuid]::Foreign_Keys, $null) } catch {}

  $tables = @()
  $queries = @()
  foreach ($tableRow in $tableRows.Rows) {
    $name = [string](Get-Cell $tableRow 'TABLE_NAME')
    $type = [string](Get-Cell $tableRow 'TABLE_TYPE')
    if ([string]::IsNullOrWhiteSpace($name) -or $name -match '^MSys') { continue }
    if ($type -match 'VIEW|PROCEDURE') {
      $queries += [ordered]@{ name = $name; type = $type }
      continue
    }
    if ($type -notmatch 'TABLE|LINK') { continue }
    $columns = @()
    foreach ($columnRow in $columnRows.Rows) {
      if ([string](Get-Cell $columnRow 'TABLE_NAME') -ne $name) { continue }
      $nullable = Get-Cell $columnRow 'IS_NULLABLE'
      $columns += [ordered]@{
        name = [string](Get-Cell $columnRow 'COLUMN_NAME')
        type = [string](Get-Cell $columnRow 'TYPE_NAME')
        dataType = Convert-SealValue (Get-Cell $columnRow 'DATA_TYPE')
        ordinal = Convert-SealValue (Get-Cell $columnRow 'ORDINAL_POSITION')
        maxLength = Convert-SealValue (Get-Cell $columnRow 'CHARACTER_MAXIMUM_LENGTH')
        nullable = if ($null -eq $nullable) { $true } else { [string]$nullable -notmatch '^(False|NO|0)$' }
        defaultValue = Convert-SealValue (Get-Cell $columnRow 'COLUMN_DEFAULT')
      }
    }
    $indexes = @()
    $primaryKey = @()
    if ($null -ne $indexRows) {
      $byIndex = @{}
      foreach ($indexRow in $indexRows.Rows) {
        if ([string](Get-Cell $indexRow 'TABLE_NAME') -ne $name) { continue }
        $indexName = [string](Get-Cell $indexRow 'INDEX_NAME')
        if ([string]::IsNullOrWhiteSpace($indexName)) { continue }
        if (-not $byIndex.ContainsKey($indexName)) {
          $byIndex[$indexName] = [ordered]@{ name = $indexName; columns = @(); primary = $false; unique = $false }
        }
        $columnName = [string](Get-Cell $indexRow 'COLUMN_NAME')
        if (-not [string]::IsNullOrWhiteSpace($columnName) -and $byIndex[$indexName].columns -notcontains $columnName) {
          $byIndex[$indexName].columns += $columnName
        }
        $isPrimary = Get-Cell $indexRow 'PRIMARY_KEY'
        $isUnique = Get-Cell $indexRow 'UNIQUE'
        if ($isPrimary -eq $true -or [string]$isPrimary -eq 'True') { $byIndex[$indexName].primary = $true }
        if ($isUnique -eq $true -or [string]$isUnique -eq 'True') { $byIndex[$indexName].unique = $true }
      }
      foreach ($entry in $byIndex.Values) {
        $indexes += $entry
        if ($entry.primary) { $primaryKey += $entry.columns }
      }
    }
    $tables += [ordered]@{
      name = $name
      type = $type
      columns = @($columns | Sort-Object { [int]$_.ordinal })
      indexes = $indexes
      primaryKey = @($primaryKey | Select-Object -Unique)
    }
  }

  $relationships = @()
  if ($null -ne $foreignRows) {
    foreach ($row in $foreignRows.Rows) {
      $relationships += [ordered]@{
        name = [string](Get-Cell $row 'FK_NAME')
        primaryTable = [string](Get-Cell $row 'PK_TABLE_NAME')
        primaryColumn = [string](Get-Cell $row 'PK_COLUMN_NAME')
        foreignTable = [string](Get-Cell $row 'FK_TABLE_NAME')
        foreignColumn = [string](Get-Cell $row 'FK_COLUMN_NAME')
      }
    }
  }
  return [ordered]@{ tables = $tables; queries = @($queries | Sort-Object name -Unique); relationships = $relationships }
}

try {
  $requestText = [System.IO.File]::ReadAllText($RequestPath, [System.Text.Encoding]::UTF8)
  $request = $requestText | ConvertFrom-Json
  if ($request.action -eq 'status') {
    Write-SealResult ([ordered]@{ success = $true; data = [ordered]@{ providers = @(Get-ProviderList); bitness = [IntPtr]::Size * 8 } })
    exit 0
  }

  if ($request.action -eq 'create') {
    if (Test-Path -LiteralPath $request.path) { throw '目标数据库文件已存在' }
    $catalog = New-Object -ComObject ADOX.Catalog
    try {
      # ACCDB 由 ACE 根据 .accdb 扩展名创建；Engine Type=5 会强制生成 Jet 4.0/MDB，
      # 即使文件名写成 .accdb 也不是现代 Access 文件格式。
      $connectionString = 'Provider=' + $request.provider + ';Data Source=' + $request.path + ';'
      $catalog.Create($connectionString)
    } finally {
      if ($null -ne $catalog) { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($catalog) }
    }
    Write-SealResult ([ordered]@{ success = $true; data = [ordered]@{ path = $request.path; provider = $request.provider; bitness = [IntPtr]::Size * 8 } })
    exit 0
  }

  $connection = New-SealConnection $request
  try {
    $data = $null
    if ($request.action -eq 'inspect') {
      $data = Get-SealSchema $connection $request
    } elseif ($request.action -eq 'query') {
      $command = $connection.CreateCommand()
      $command.CommandText = [string]$request.sql
      if ($request.timeoutSeconds) { $command.CommandTimeout = [int]$request.timeoutSeconds }
      Add-SealParameters $command @($request.parameters)
      $data = Read-SealRows $command ([int]$request.maxRows)
    } elseif ($request.action -eq 'readTable') {
      $command = $connection.CreateCommand()
      $command.CommandText = 'SELECT TOP ' + [int]$request.maxRows + ' * FROM ' + (Quote-Ident ([string]$request.table))
      $data = Read-SealRows $command ([int]$request.maxRows)
    } elseif ($request.action -eq 'execute') {
      $transaction = $connection.BeginTransaction()
      try {
        $command = $connection.CreateCommand()
        $command.Transaction = $transaction
        $command.CommandText = [string]$request.sql
        Add-SealParameters $command @($request.parameters)
        $affected = $command.ExecuteNonQuery()
        $transaction.Commit()
        $data = [ordered]@{ affectedRows = $affected }
      } catch { $transaction.Rollback(); throw }
    } elseif ($request.action -eq 'insert') {
      $names = @($request.values.psobject.Properties.Name)
      $columnsSql = @($names | ForEach-Object { Quote-Ident $_ }) -join ', '
      $placeholders = @($names | ForEach-Object { '?' }) -join ', '
      $command = $connection.CreateCommand()
      $command.CommandText = 'INSERT INTO ' + (Quote-Ident ([string]$request.table)) + ' (' + $columnsSql + ') VALUES (' + $placeholders + ')'
      Add-SealParameters $command @($names | ForEach-Object { $request.values.$_ })
      $data = [ordered]@{ affectedRows = $command.ExecuteNonQuery() }
    } elseif ($request.action -eq 'update' -or $request.action -eq 'delete') {
      $keyNames = @($request.key.psobject.Properties.Name)
      $whereParts = @()
      $whereValues = @()
      foreach ($name in $keyNames) {
        $value = $request.key.$name
        if ($null -eq $value) { $whereParts += (Quote-Ident $name) + ' IS NULL' }
        else { $whereParts += (Quote-Ident $name) + ' = ?'; $whereValues += $value }
      }
      $command = $connection.CreateCommand()
      if ($request.action -eq 'update') {
        $valueNames = @($request.values.psobject.Properties.Name)
        $setSql = @($valueNames | ForEach-Object { (Quote-Ident $_) + ' = ?' }) -join ', '
        $command.CommandText = 'UPDATE ' + (Quote-Ident ([string]$request.table)) + ' SET ' + $setSql + ' WHERE ' + ($whereParts -join ' AND ')
        Add-SealParameters $command @($valueNames | ForEach-Object { $request.values.$_ })
      } else {
        $command.CommandText = 'DELETE FROM ' + (Quote-Ident ([string]$request.table)) + ' WHERE ' + ($whereParts -join ' AND ')
      }
      Add-SealParameters $command $whereValues
      $data = [ordered]@{ affectedRows = $command.ExecuteNonQuery() }
    } elseif ($request.action -eq 'createTable') {
      $definitions = @()
      foreach ($column in @($request.columns)) {
        $definition = (Quote-Ident ([string]$column.name)) + ' ' + [string]$column.type
        if ($column.required -eq $true) { $definition += ' NOT NULL' }
        $definitions += $definition
      }
      if (@($request.primaryKey).Count -gt 0) {
        $definitions += 'CONSTRAINT [PrimaryKey] PRIMARY KEY (' + ((@($request.primaryKey) | ForEach-Object { Quote-Ident ([string]$_) }) -join ', ') + ')'
      }
      $command = $connection.CreateCommand()
      $command.CommandText = 'CREATE TABLE ' + (Quote-Ident ([string]$request.table)) + ' (' + ($definitions -join ', ') + ')'
      $data = [ordered]@{ affectedRows = $command.ExecuteNonQuery() }
    } elseif ($request.action -eq 'dropTable') {
      $command = $connection.CreateCommand()
      $command.CommandText = 'DROP TABLE ' + (Quote-Ident ([string]$request.table))
      $data = [ordered]@{ affectedRows = $command.ExecuteNonQuery() }
    } elseif ($request.action -eq 'importRows') {
      $names = @($request.columns)
      $transaction = $connection.BeginTransaction()
      try {
        if ($request.createTable -eq $true) {
          $createCommand = $connection.CreateCommand()
          $createCommand.Transaction = $transaction
          $defs = @($names | ForEach-Object { (Quote-Ident ([string]$_)) + ' LONGTEXT' }) -join ', '
          $createCommand.CommandText = 'CREATE TABLE ' + (Quote-Ident ([string]$request.table)) + ' (' + $defs + ')'
          [void]$createCommand.ExecuteNonQuery()
        }
        $command = $connection.CreateCommand()
        $command.Transaction = $transaction
        $command.CommandText = 'INSERT INTO ' + (Quote-Ident ([string]$request.table)) + ' (' + ((@($names | ForEach-Object { Quote-Ident ([string]$_) })) -join ', ') + ') VALUES (' + ((@($names | ForEach-Object { '?' })) -join ', ') + ')'
        foreach ($name in $names) { $parameter = $command.CreateParameter(); [void]$command.Parameters.Add($parameter) }
        $count = 0
        foreach ($row in @($request.rows)) {
          for ($index = 0; $index -lt $names.Count; $index += 1) {
            $property = $row.psobject.Properties[[string]$names[$index]]
            $value = if ($null -eq $property) { $null } else { $property.Value }
            $command.Parameters[$index].Value = if ($null -eq $value) { [DBNull]::Value } else { $value }
          }
          [void]$command.ExecuteNonQuery()
          $count += 1
        }
        $transaction.Commit()
        $data = [ordered]@{ affectedRows = $count }
      } catch { $transaction.Rollback(); throw }
    } else {
      throw '不支持的数据库操作'
    }
    Write-SealResult ([ordered]@{ success = $true; data = $data; provider = $request.provider; bitness = [IntPtr]::Size * 8 })
  } finally {
    if ($null -ne $connection) { $connection.Close(); $connection.Dispose() }
  }
} catch {
  Write-SealResult ([ordered]@{ success = $false; error = $_.Exception.Message; detail = $_.Exception.ToString(); provider = $request.provider; bitness = [IntPtr]::Size * 8 })
  exit 1
}
`

function 获取PowerShell候选(系统根目录 = process.env.SystemRoot || 'C:\\Windows') {
  const 候选 = [
    { 路径: path.join(系统根目录, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), 位数: 64 },
    { 路径: path.join(系统根目录, 'SysWOW64', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), 位数: 32 },
  ]
  const 去重 = new Set()
  return 候选.filter((项) => {
    const 键 = 项.路径.toLowerCase()
    if (去重.has(键) || !fs.existsSync(项.路径)) return false
    去重.add(键)
    return true
  })
}

function 执行文件(程序, 参数, 选项) {
  return new Promise((完成) => {
    execFile(程序, 参数, 选项, (错误, stdout, stderr) => 完成({ 错误, stdout, stderr }))
  })
}

async function 执行PowerShell请求(请求, 候选, 依赖 = {}) {
  const 创建临时目录 = 依赖.创建临时目录 ?? (() => fs.promises.mkdtemp(path.join(os.tmpdir(), 'seal-access-')))
  const 执行 = 依赖.执行文件 ?? 执行文件
  const 删除目录 = 依赖.删除目录 ?? ((目录) => fs.promises.rm(目录, { recursive: true, force: true }))
  const 临时目录 = await 创建临时目录()
  const 请求路径 = path.join(临时目录, 'request.json')
  const 结果路径 = path.join(临时目录, 'result.json')
  const 脚本路径 = path.join(临时目录, 'access-worker.ps1')
  try {
    await fs.promises.writeFile(请求路径, JSON.stringify(请求), 'utf8')
    // Windows 的 CreateProcess 命令行上限约为 32K。工作脚本编码后超过该上限，
    // 不能使用 -EncodedCommand；写入带 BOM 的 UTF-16LE 临时脚本还能让 Windows
    // PowerShell 5.1 稳定读取中文、emoji 和其他 Unicode 符号。
    await fs.promises.writeFile(脚本路径, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(POWERSHELL_SCRIPT, 'utf16le')]))
    const { 错误, stderr } = await 执行(候选.路径, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', 脚本路径, '-RequestPath', 请求路径, '-ResultPath', 结果路径,
    ], {
      windowsHide: true,
      timeout: 120000,
      maxBuffer: 1024 * 1024,
      encoding: 'utf8',
    })
    if (!fs.existsSync(结果路径)) {
      return { success: false, error: 错误?.killed ? '数据库操作超时' : String(stderr || 错误?.message || '数据库引擎没有返回结果') }
    }
    const 结果 = JSON.parse(await fs.promises.readFile(结果路径, 'utf8'))
    return 结果 && typeof 结果 === 'object' ? 结果 : { success: false, error: '数据库引擎返回了无效结果' }
  } catch (错误) {
    return { success: false, error: 错误 instanceof Error ? 错误.message : '数据库引擎调用失败' }
  } finally {
    await 删除目录(临时目录).catch(() => {})
  }
}

function 校验路径(文件路径, { 必须存在 = true, 只允许Accdb = false } = {}) {
  if (typeof 文件路径 !== 'string' || !path.isAbsolute(文件路径) || 文件路径.includes('\0')) throw new Error('Access 数据库路径无效')
  const 扩展名 = path.extname(文件路径).toLowerCase()
  if (!ACCESS_EXTENSIONS.has(扩展名) || (只允许Accdb && 扩展名 !== '.accdb')) throw new Error(只允许Accdb ? '新数据库必须使用 .accdb 格式' : '仅支持 .accdb 和 .mdb 数据库文件')
  if (必须存在) {
    const 状态 = fs.statSync(文件路径)
    if (!状态.isFile()) throw new Error('所选路径不是普通数据库文件')
  }
  return { 文件路径: path.resolve(文件路径), 扩展名 }
}

function 校验标识符(名称, 字段 = '数据库对象名称') {
  if (typeof 名称 !== 'string' || 名称.trim() === '' || 名称.length > 255 || /[\0\r\n]/.test(名称)) throw new Error(`${字段}无效`)
  return 名称
}

function 校验值对象(值, 字段, { 允许空 = false } = {}) {
  if (!值 || typeof 值 !== 'object' || Array.isArray(值)) throw new Error(`${字段}无效`)
  const 键 = Object.keys(值)
  if ((!允许空 && 键.length === 0) || 键.length > MAX_IMPORT_COLUMNS) throw new Error(`${字段}为空或字段过多`)
  const 输出 = Object.create(null)
  for (const 名称 of 键) {
    校验标识符(名称, '字段名称')
    const 项 = 值[名称]
    if (项 !== null && !['string', 'number', 'boolean'].includes(typeof 项)) throw new Error(`字段「${名称}」包含不支持的值类型`)
    if (typeof 项 === 'number' && !Number.isFinite(项)) throw new Error(`字段「${名称}」的数字无效`)
    if (typeof 项 === 'string' && 项.length > 16 * 1024 * 1024) throw new Error(`字段「${名称}」内容过大`)
    输出[名称] = 项
  }
  return 输出
}

function 校验参数列表(参数) {
  if (参数 === undefined) return []
  if (!Array.isArray(参数) || 参数.length > 1000) throw new Error('查询参数无效或过多')
  for (const 值 of 参数) if (值 !== null && !['string', 'number', 'boolean'].includes(typeof 值)) throw new Error('查询参数包含不支持的值类型')
  return 参数
}

function 校验连接文本(值, 字段, 最大长度 = 4096) {
  if (值 === undefined || 值 === null || 值 === '') return ''
  if (typeof 值 !== 'string' || 值.length > 最大长度 || 值.includes('\0')) throw new Error(`${字段}无效或过长`)
  return 值
}

function 校验工作组文件(文件路径) {
  const 值 = 校验连接文本(文件路径, '工作组文件路径', 32768)
  if (!值) return ''
  if (!path.isAbsolute(值) || path.extname(值).toLowerCase() !== '.mdw') throw new Error('工作组文件必须是绝对路径的 .mdw 文件')
  const 状态 = fs.statSync(值)
  if (!状态.isFile()) throw new Error('工作组文件不是普通文件')
  return path.resolve(值)
}

function 提供者顺序(扩展名, 动作) {
  if (动作 === 'create' || 扩展名 === '.accdb') return ['Microsoft.ACE.OLEDB.16.0', 'Microsoft.ACE.OLEDB.12.0']
  return ['Microsoft.ACE.OLEDB.16.0', 'Microsoft.ACE.OLEDB.12.0', 'Microsoft.Jet.OLEDB.4.0']
}

function 规范请求(动作, 输入 = {}) {
  if (!ALL_ACTIONS.has(动作)) throw new Error('不支持的 Access 数据库操作')
  if (动作 === 'status') return { action: 动作 }
  const { 文件路径, 扩展名 } = 校验路径(输入.路径, { 必须存在: 动作 !== 'create', 只允许Accdb: 动作 === 'create' })
  const 基础 = {
    action: 动作,
    path: 文件路径,
    databasePassword: 校验连接文本(输入.数据库密码, '数据库密码'),
    userName: 校验连接文本(输入.用户名, '用户名', 255),
    userPassword: 校验连接文本(输入.用户密码, '用户密码'),
    workgroupPath: 校验工作组文件(输入.工作组文件),
  }
  if (动作 === 'inspect' || 动作 === 'create') return { 请求: 基础, 扩展名 }
  if (动作 === 'query' || 动作 === 'execute') {
    const sql = typeof 输入.SQL === 'string' ? 输入.SQL.trim() : ''
    if (sql === '' || sql.length > 200000 || sql.includes('\0')) throw new Error('SQL 语句为空或过长')
    if (动作 === 'query' && !/^(?:\s*(?:PARAMETERS\b[\s\S]*?;\s*)?)?(?:SELECT|TRANSFORM|TABLE|WITH)\b/i.test(sql)) {
      throw new Error('查询区只允许读取语句；修改数据请使用“执行更改”')
    }
    return { 请求: { ...基础, sql, parameters: 校验参数列表(输入.参数), maxRows: Math.min(Math.max(Number(输入.最大行数) || 500, 1), MAX_QUERY_ROWS), timeoutSeconds: 60 }, 扩展名 }
  }
  if (动作 === 'readTable' || 动作 === 'dropTable') return { 请求: { ...基础, table: 校验标识符(输入.表名, '表名'), maxRows: Math.min(Math.max(Number(输入.最大行数) || 500, 1), MAX_QUERY_ROWS) }, 扩展名 }
  if (动作 === 'insert') return { 请求: { ...基础, table: 校验标识符(输入.表名, '表名'), values: 校验值对象(输入.值, '新增数据') }, 扩展名 }
  if (动作 === 'update') return { 请求: { ...基础, table: 校验标识符(输入.表名, '表名'), values: 校验值对象(输入.值, '修改数据'), key: 校验值对象(输入.主键, '主键') }, 扩展名 }
  if (动作 === 'delete') return { 请求: { ...基础, table: 校验标识符(输入.表名, '表名'), key: 校验值对象(输入.主键, '主键') }, 扩展名 }
  if (动作 === 'createTable') {
    if (!Array.isArray(输入.字段) || 输入.字段.length === 0 || 输入.字段.length > MAX_IMPORT_COLUMNS) throw new Error('新表字段为空或过多')
    const 类型规则 = /^(?:TEXT\((?:[1-9]|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\)|LONGTEXT|BYTE|SHORT|INTEGER|LONG|SINGLE|DOUBLE|DECIMAL(?:\(\d{1,2},\d{1,2}\))?|CURRENCY|DATETIME|YESNO|GUID|LONGBINARY|COUNTER)$/i
    const columns = 输入.字段.map((字段) => {
      const name = 校验标识符(字段?.名称, '字段名称')
      const type = String(字段?.类型 || 'TEXT(255)').toUpperCase()
      if (!类型规则.test(type)) throw new Error(`字段「${name}」的数据类型不受支持`)
      return { name, type, required: 字段?.必填 === true }
    })
    if (new Set(columns.map((项) => 项.name.toLocaleLowerCase())).size !== columns.length) throw new Error('字段名称不能重复')
    const primaryKey = Array.isArray(输入.主键) ? 输入.主键.map((名称) => 校验标识符(名称, '主键字段')) : []
    if (primaryKey.some((名称) => !columns.some((字段) => 字段.name === 名称))) throw new Error('主键必须引用新表中的字段')
    return { 请求: { ...基础, table: 校验标识符(输入.表名, '表名'), columns, primaryKey }, 扩展名 }
  }
  if (动作 === 'importRows') {
    if (!Array.isArray(输入.字段) || 输入.字段.length === 0 || 输入.字段.length > MAX_IMPORT_COLUMNS) throw new Error('导入字段为空或过多')
    const columns = 输入.字段.map((名称) => 校验标识符(名称, '字段名称'))
    if (new Set(columns.map((名称) => 名称.toLocaleLowerCase())).size !== columns.length) throw new Error('导入字段名称不能重复')
    if (!Array.isArray(输入.记录) || 输入.记录.length === 0 || 输入.记录.length > MAX_IMPORT_ROWS) throw new Error(`一次只能导入 1 到 ${MAX_IMPORT_ROWS} 行数据`)
    const rows = 输入.记录.map((记录) => {
      const 值 = 校验值对象(记录, '导入记录', { 允许空: true })
      const 输出 = Object.create(null)
      for (const 名称 of columns) 输出[名称] = Object.prototype.hasOwnProperty.call(值, 名称) ? 值[名称] : null
      return 输出
    })
    return { 请求: { ...基础, table: 校验标识符(输入.表名, '表名'), columns, rows, createTable: 输入.新建表 !== false }, 扩展名 }
  }
  throw new Error('Access 数据库请求无效')
}

function 格式代际(扩展名, provider) {
  if (扩展名 === '.accdb') return 'Access 2007–2024 / Microsoft 365（ACCDB）'
  if (/Jet\.OLEDB\.4\.0/i.test(provider || '')) return 'Access 2003 兼容格式（Jet 4.0 MDB）'
  return 'Access 2003 兼容格式（MDB）'
}

function 创建Access数据库服务(依赖 = {}) {
  const 平台 = 依赖.平台 ?? process.platform
  const 获取候选 = 依赖.获取PowerShell候选 ?? 获取PowerShell候选
  const 运行 = 依赖.运行 ?? ((请求, 候选) => 执行PowerShell请求(请求, 候选, 依赖))

  async function status() {
    if (平台 !== 'win32') return { 成功: true, 可用: false, 平台支持: false, 错误: 'Access 数据库编辑仅在 Windows 桌面版可用', 安装地址: ACCESS_RUNTIME_URL, 提供者: [] }
    const 候选 = 获取候选()
    const 结果 = await Promise.all(候选.map(async (shell) => ({ shell, result: await 运行({ action: 'status' }, shell) })))
    const 提供者 = 结果.flatMap(({ shell, result }) => result.success && Array.isArray(result.data?.providers) ? result.data.providers.map((名称) => ({ 名称, 位数: Number(result.data.bitness) || shell.位数 })) : [])
      .filter((项, 索引, 列表) => 列表.findIndex((候选项) => 候选项.名称 === 项.名称 && 候选项.位数 === 项.位数) === 索引)
    return {
      成功: true,
      可用: 提供者.some((项) => /^Microsoft\.ACE\.OLEDB\./i.test(项.名称) || /^Microsoft\.Jet\.OLEDB\./i.test(项.名称)),
      平台支持: true,
      提供者,
      安装地址: ACCESS_RUNTIME_URL,
      兼容范围: {
        直接读写: ['Access 2003', 'Access 2007', 'Access 2010', 'Access 2013', 'Access 2016', 'Access 2019', 'Access 2021', 'Access 2024', 'Access for Microsoft 365'],
        不支持: ['Access 1.0–2002/XP（请先转换为 Access 2003 MDB 或 ACCDB）'],
      },
    }
  }

  async function invoke(动作, 输入) {
    if (平台 !== 'win32') return { 成功: false, 错误: 'Access 数据库功能仅支持 Windows 桌面版', 安装地址: ACCESS_RUNTIME_URL }
    let 规范
    try { 规范 = 规范请求(动作, 输入) } catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '数据库请求无效' } }
    const 候选 = 获取候选()
    if (候选.length === 0) return { 成功: false, 错误: '未找到 Windows PowerShell，无法调用 Access 数据库引擎' }
    const 失败列表 = []
    for (const provider of 提供者顺序(规范.扩展名, 动作)) {
      for (const shell of 候选) {
        if (/Jet\.OLEDB\./i.test(provider) && shell.位数 !== 32) continue
        const result = await 运行({ ...规范.请求, provider }, shell)
        if (result.success) {
          const 数据 = result.data && typeof result.data === 'object' ? result.data : {}
          return { 成功: true, 数据: { ...数据, 提供者: result.provider || provider, 位数: Number(result.bitness) || shell.位数, 格式代际: 格式代际(规范.扩展名, result.provider || provider) } }
        }
        失败列表.push({ provider, 位数: shell.位数, 错误: String(result.error || '打开失败') })
        if (/password|密码|not a valid account name|workgroup/i.test(String(result.error || ''))) break
      }
    }
    const 消息 = 失败列表.map((项) => `${项.provider}（${项.位数} 位）：${项.错误}`).join('；')
    const 需要旧版转换 = 规范.扩展名 === '.mdb' && /unrecognized database format|无法识别的数据库格式|installable isam|外部数据库驱动程序/i.test(消息)
    return {
      成功: false,
      错误: 需要旧版转换
        ? '该 MDB 可能是 Access 2002/XP 或更早格式，也可能已经损坏或使用了当前驱动无法识别的特性。本程序不会覆盖它；请先在 Microsoft Access 中确认文件可正常打开，并另存为 Access 2003 MDB 或 ACCDB 后再试。'
        : (消息 || '没有可用的 Access 数据库驱动，请安装 Microsoft 365 Access Runtime'),
      需要旧版转换,
      安装地址: ACCESS_RUNTIME_URL,
      尝试: 失败列表,
    }
  }

  return { status, invoke }
}

module.exports = {
  ACCESS_RUNTIME_URL,
  MAX_QUERY_ROWS,
  MAX_IMPORT_ROWS,
  POWERSHELL_SCRIPT,
  获取PowerShell候选,
  执行PowerShell请求,
  校验路径,
  校验标识符,
  校验工作组文件,
  规范请求,
  提供者顺序,
  创建Access数据库服务,
}
