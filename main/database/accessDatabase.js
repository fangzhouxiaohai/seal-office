const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')

const ACCESS_RUNTIME_URL = 'https://support.microsoft.com/zh-cn/access/download-and-install-microsoft-365-access-runtime'
const ACCESS_EXTENSIONS = new Set(['.accdb', '.mdb'])
const READ_ACTIONS = new Set(['inspect', 'query', 'readTable'])
const WRITE_ACTIONS = new Set(['execute', 'insert', 'update', 'delete', 'createTable', 'alterTable', 'dropTable', 'importRows'])
// 建表与改表共用的类型白名单；类型文本会拼入 DDL，必须严格匹配。
const 字段类型规则 = /^(?:TEXT\((?:[1-9]|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\)|LONGTEXT|BYTE|SHORT|INTEGER|LONG|SINGLE|DOUBLE|DECIMAL(?:\(\d{1,2},\d{1,2}\))?|CURRENCY|DATETIME|YESNO|GUID|LONGBINARY|COUNTER)$/i
const 改表操作 = new Set(['addColumn', 'alterColumn', 'renameColumn', 'dropColumn', 'setPrimaryKey'])
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

function New-SealConnectionString($Request) {
  $builder = New-Object System.Data.OleDb.OleDbConnectionStringBuilder
  $builder.Provider = [string]$Request.provider
  # PowerShell 的属性赋值会输出 DataSource（无空格），ACE 会把它当成未知
  # 扩展属性并报“找不到可安装的 ISAM”；必须使用标准 OLE DB 键名。
  # 路径统一经构造器加引号转义：含分号、等号、单引号、空格或中文的路径
  # 不会被拆成额外的连接参数（2.7.0 新建时手工拼接连接串即在此出错）。
  $builder['Data Source'] = [string]$Request.path
  if (-not [string]::IsNullOrEmpty([string]$Request.databasePassword)) {
    $builder['Jet OLEDB:Database Password'] = [string]$Request.databasePassword
  }
  if (-not [string]::IsNullOrEmpty([string]$Request.userName)) { $builder['User ID'] = [string]$Request.userName }
  if (-not [string]::IsNullOrEmpty([string]$Request.userPassword)) { $builder['Password'] = [string]$Request.userPassword }
  if (-not [string]::IsNullOrEmpty([string]$Request.workgroupPath)) { $builder['Jet OLEDB:System database'] = [string]$Request.workgroupPath }
  return $builder.ConnectionString
}

function New-SealConnection($Request) {
  $connection = New-Object System.Data.OleDb.OleDbConnection((New-SealConnectionString $Request))
  $connection.Open()
  return $connection
}

function Get-SealAutoColumns($Connection, [string]$TableName) {
  # GetSchema('Columns') 不区分自动编号与普通长整型，需读取键信息里的 IsAutoIncrement。
  $names = @()
  try {
    $command = $Connection.CreateCommand()
    $command.CommandText = 'SELECT * FROM ' + (Quote-Ident $TableName) + ' WHERE 1 = 0'
    $reader = $command.ExecuteReader([System.Data.CommandBehavior]::KeyInfo -bor [System.Data.CommandBehavior]::SchemaOnly)
    try {
      $schemaTable = $reader.GetSchemaTable()
      foreach ($row in $schemaTable.Rows) {
        if ($row['IsAutoIncrement'] -eq $true) { $names += [string]$row['ColumnName'] }
      }
    } finally { $reader.Close() }
  } catch {}
  return $names
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
    $autoColumns = @(Get-SealAutoColumns $Connection $name)
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
        autoIncrement = $autoColumns -contains [string](Get-Cell $columnRow 'COLUMN_NAME')
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
      [void]$catalog.Create((New-SealConnectionString $request))
      # 立即关闭创建时打开的连接，释放 .laccdb 锁，保证随后回读结构不被占用。
      try { $catalog.ActiveConnection.Close() } catch {}
    } finally {
      if ($null -ne $catalog) { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($catalog) }
    }
    Write-SealResult ([ordered]@{ success = $true; data = [ordered]@{ path = $request.path; provider = $request.provider; bitness = [IntPtr]::Size * 8 } })
    exit 0
  }

  if ($request.action -eq 'alterTable' -and $request.operation -eq 'renameColumn') {
    # Access SQL 没有 RENAME COLUMN；改名只能经 ADOX 目录对象完成，字段数据与索引保持不变。
    $catalog = New-Object -ComObject ADOX.Catalog
    try {
      $catalog.ActiveConnection = (New-SealConnectionString $request)
      $catalog.Tables.Item([string]$request.table).Columns.Item([string]$request.column).Name = [string]$request.newName
      try { $catalog.ActiveConnection.Close() } catch {}
    } finally {
      if ($null -ne $catalog) { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($catalog) }
    }
    Write-SealResult ([ordered]@{ success = $true; data = [ordered]@{ affectedRows = 0 }; provider = $request.provider; bitness = [IntPtr]::Size * 8 })
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
    } elseif ($request.action -eq 'alterTable') {
      $tableSql = Quote-Ident ([string]$request.table)
      if ($request.operation -eq 'setPrimaryKey') {
        # 主键变更在事务中先删除旧主键再建立新主键；新主键遇到重复值或空值时整体回滚，原主键保留。
        $transaction = $connection.BeginTransaction()
        try {
          $indexRows = $connection.GetOleDbSchemaTable([System.Data.OleDb.OleDbSchemaGuid]::Indexes, $null)
          $oldNames = @()
          foreach ($row in $indexRows.Rows) {
            $isPrimary = Get-Cell $row 'PRIMARY_KEY'
            if ([string](Get-Cell $row 'TABLE_NAME') -eq [string]$request.table -and ($isPrimary -eq $true -or [string]$isPrimary -eq 'True')) {
              $indexName = [string](Get-Cell $row 'INDEX_NAME')
              if ($oldNames -notcontains $indexName) { $oldNames += $indexName }
            }
          }
          foreach ($indexName in $oldNames) {
            $command = $connection.CreateCommand()
            $command.Transaction = $transaction
            $command.CommandText = 'ALTER TABLE ' + $tableSql + ' DROP CONSTRAINT ' + (Quote-Ident $indexName)
            [void]$command.ExecuteNonQuery()
          }
          if (@($request.primaryKey).Count -gt 0) {
            $command = $connection.CreateCommand()
            $command.Transaction = $transaction
            $command.CommandText = 'ALTER TABLE ' + $tableSql + ' ADD CONSTRAINT [PrimaryKey] PRIMARY KEY (' + ((@($request.primaryKey) | ForEach-Object { Quote-Ident ([string]$_) }) -join ', ') + ')'
            [void]$command.ExecuteNonQuery()
          }
          $transaction.Commit()
        } catch { $transaction.Rollback(); throw }
        $data = [ordered]@{ affectedRows = 0 }
      } else {
        $command = $connection.CreateCommand()
        if ($request.operation -eq 'addColumn') {
          $command.CommandText = 'ALTER TABLE ' + $tableSql + ' ADD COLUMN ' + (Quote-Ident ([string]$request.column)) + ' ' + [string]$request.type + $(if ($request.required -eq $true) { ' NOT NULL' } else { '' })
        } elseif ($request.operation -eq 'alterColumn') {
          $command.CommandText = 'ALTER TABLE ' + $tableSql + ' ALTER COLUMN ' + (Quote-Ident ([string]$request.column)) + ' ' + [string]$request.type + $(if ($request.required -eq $true) { ' NOT NULL' } else { '' })
        } elseif ($request.operation -eq 'dropColumn') {
          $command.CommandText = 'ALTER TABLE ' + $tableSql + ' DROP COLUMN ' + (Quote-Ident ([string]$request.column))
        } else {
          throw '不支持的表结构修改'
        }
        $data = [ordered]@{ affectedRows = $command.ExecuteNonQuery() }
      }
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

function 校验字段类型(字段名, 类型) {
  const type = String(类型 || 'TEXT(255)').toUpperCase()
  if (!字段类型规则.test(type)) throw new Error(`字段「${字段名}」的数据类型不受支持`)
  return type
}

// PowerShell 把 .NET 异常包成“使用“0”个参数调用“Open”时发生异常:“原因”。”，只保留真正原因。
function 提取引擎原因(文本) {
  const 原文 = String(文本 || '').trim()
  const 匹配 = 原文.match(/^(?:使用“\d+”个参数调用“[^”]+”时发生异常|Exception calling "[^"]+" with "\d+" argument\(s\))\s*[:：]\s*[“"](.*)[”"]\s*$/s)
  return (匹配 ? 匹配[1] : 原文).trim()
}

const 驱动缺失规则 = /not registered|未在本地计算机上注册|Class not registered|没有注册类|找不到提供程序|provider cannot be found|0x80040154/i
const 目录不可写规则 = /无法打开文件.*或向其写入数据|没有查看和写入其数据的权限|不是一个有效的路径|is not a valid path|cannot open the file|access (?:is )?denied|拒绝访问|read-only|只读/i
const 文件损坏规则 = /不可识别的数据库格式|unrecognized database format|数据库已损坏|database (?:is )?corrupt|需要修复|不是数据库/i

/**
 * 把各提供者的失败记录归为：驱动未安装 / 目录不可写 / 文件损坏 / 文件已存在 / 结构冲突 / 其他。
 * 驱动未注册的尝试只在全部失败都属此类时才视为驱动问题，否则以其余更具体的原因为准。
 */
function 分类Access错误(失败列表, { 动作, 扩展名 } = {}) {
  const 原因列表 = 失败列表.map((项) => 提取引擎原因(项.错误))
  const 具体原因 = 原因列表.filter((原因) => !驱动缺失规则.test(原因))
  if (原因列表.length === 0 || 具体原因.length === 0) {
    return { 错误类别: '驱动未安装', 错误: '未检测到 Access 数据库引擎，当前无法新建或打开 Access 数据库。请安装与本机 Office 位数匹配的 Microsoft 365 Access Runtime 后重试。', 详情: 原因列表[0] || '', 安装地址: ACCESS_RUNTIME_URL }
  }
  const 详情 = 具体原因[0]
  if (/目标数据库文件已存在/.test(详情)) return { 错误类别: '文件已存在', 错误: '目标位置已有同名数据库文件，请换一个文件名。', 详情 }
  if (目录不可写规则.test(详情)) {
    return 动作 === 'create'
      ? { 错误类别: '目录不可写', 错误: '所选目录不可写或不存在，无法在此创建数据库，请选择“文档”等有写入权限的目录。', 详情 }
      : { 错误类别: '目录不可写', 错误: '数据库文件所在位置无权访问或文件正被其他程序独占打开，请关闭占用程序或检查文件权限后重试。', 详情 }
  }
  if (文件损坏规则.test(详情)) {
    if (扩展名 === '.mdb') return { 错误类别: '文件损坏', 错误: '该 MDB 可能是 Access 2002/XP 或更早格式，也可能已经损坏或使用了当前驱动无法识别的特性。本程序不会覆盖它；请先在 Microsoft Access 中确认文件可正常打开，并另存为 Access 2003 MDB 或 ACCDB 后再试。', 详情, 需要旧版转换: true }
    return { 错误类别: '文件损坏', 错误: '数据库文件已损坏或不是有效的 Access 文件，无法打开。', 详情 }
  }
  if (/password|密码|not a valid account name|workgroup|工作组/i.test(详情)) return { 错误类别: '密码错误', 错误: '数据库密码或工作组账号不正确，请核对后重试。', 详情 }
  if (/创建重复的值|duplicate values/i.test(详情)) return { 错误类别: '结构冲突', 错误: '该字段存在重复值或空值，无法设为主键或唯一索引。请先清理数据后重试。', 详情 }
  if (/数据类型不匹配|type mismatch/i.test(详情)) return { 错误类别: '结构冲突', 错误: '现有数据无法转换为所选类型，Access 拒绝了此次类型修改，原数据未改动。', 详情 }
  if (/不能删除已成为索引的一部分|part of an index/i.test(详情)) return { 错误类别: '结构冲突', 错误: '该字段属于主键或索引，需先取消主键后再删除。', 详情 }
  if (/无效的字段数据类型|invalid field data type/i.test(详情)) return { 错误类别: '结构冲突', 错误: '数据库引擎不支持此次字段类型修改。', 详情 }
  if (/已经存在|already exists/i.test(详情)) return { 错误类别: '结构冲突', 错误: '同名的表或字段已存在，请换一个名称。', 详情 }
  if (/数据库操作超时/.test(详情)) return { 错误类别: '其他', 错误: '数据库操作超时，请缩小查询范围后重试。', 详情 }
  return { 错误类别: '其他', 错误: `数据库引擎返回错误：${详情}`, 详情 }
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
    const columns = 输入.字段.map((字段) => {
      const name = 校验标识符(字段?.名称, '字段名称')
      return { name, type: 校验字段类型(name, 字段?.类型), required: 字段?.必填 === true }
    })
    if (new Set(columns.map((项) => 项.name.toLocaleLowerCase())).size !== columns.length) throw new Error('字段名称不能重复')
    const primaryKey = Array.isArray(输入.主键) ? 输入.主键.map((名称) => 校验标识符(名称, '主键字段')) : []
    if (primaryKey.some((名称) => !columns.some((字段) => 字段.name === 名称))) throw new Error('主键必须引用新表中的字段')
    return { 请求: { ...基础, table: 校验标识符(输入.表名, '表名'), columns, primaryKey }, 扩展名 }
  }
  if (动作 === 'alterTable') {
    const 表 = { ...基础, table: 校验标识符(输入.表名, '表名'), operation: 输入.操作 }
    if (!改表操作.has(输入.操作)) throw new Error('不支持的表结构修改')
    if (输入.操作 === 'addColumn' || 输入.操作 === 'alterColumn') {
      const column = 校验标识符(输入.字段?.名称, '字段名称')
      const type = 校验字段类型(column, 输入.字段?.类型)
      // ACE 只允许在 ADD COLUMN 时声明 COUNTER；对已有字段 ALTER 为 COUNTER 会报“无效的字段数据类型”。
      if (输入.操作 === 'alterColumn' && type === 'COUNTER') throw new Error('自动编号只能在新建字段时设置，已有字段无法改为自动编号')
      return { 请求: { ...表, column, type, required: 输入.字段?.必填 === true }, 扩展名 }
    }
    if (输入.操作 === 'renameColumn') {
      const column = 校验标识符(输入.字段名, '字段名称')
      const newName = 校验标识符(输入.新名称, '新字段名')
      if (column === newName) throw new Error('新字段名与原字段名相同')
      return { 请求: { ...表, column, newName }, 扩展名 }
    }
    if (输入.操作 === 'dropColumn') return { 请求: { ...表, column: 校验标识符(输入.字段名, '字段名称') }, 扩展名 }
    const primaryKey = Array.isArray(输入.主键) ? 输入.主键.map((名称) => 校验标识符(名称, '主键字段')) : []
    if (new Set(primaryKey.map((名称) => 名称.toLocaleLowerCase())).size !== primaryKey.length) throw new Error('主键字段不能重复')
    return { 请求: { ...表, primaryKey }, 扩展名 }
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
    const 分类 = 分类Access错误(失败列表, { 动作, 扩展名: 规范.扩展名 })
    return {
      成功: false,
      ...分类,
      需要旧版转换: 分类.需要旧版转换 === true,
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
  分类Access错误,
  提取引擎原因,
  创建Access数据库服务,
}
