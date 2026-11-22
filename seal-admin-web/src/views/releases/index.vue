<template>
  <div class="page-container">
    <header class="page-heading">
      <div>
        <h1>版本管理</h1>
        <p>按版本和平台查看发布状态，未选择的平台不会发布</p>
      </div>
      <div class="page-actions">
        <el-button :loading="busy" @click="refresh">刷新列表</el-button>
        <el-button v-if="canWrite" type="primary" @click="openComposer">发布版本</el-button>
      </div>
    </header>

    <el-card shadow="never">
      <div class="table-toolbar">
        <div class="toolbar-left">
          <div class="segment-tabs">
            <button
              v-for="item in filters"
              :key="item.key"
              type="button"
              :class="{ active: filter === item.key }"
              @click="filter = item.key"
            >
              {{ item.label }} <span>{{ statistics[item.key] }}</span>
            </button>
          </div>
        </div>
        <div class="toolbar-right">
          <el-input v-model="search" placeholder="筛选版本号" clearable style="width: 180px" @keyup.enter="applyQuery" />
          <el-select v-model="platformFilter" placeholder="全部平台" style="width: 170px">
            <el-option label="全部平台" value="" />
            <el-option v-for="p in platforms" :key="p.key" :label="p.label" :value="p.key" />
          </el-select>
          <el-button type="primary" plain @click="applyQuery">查询</el-button>
          <el-button @click="resetQuery">重置</el-button>
        </div>
      </div>

      <el-table v-loading="busy" :data="pagedRows" row-key="key" stripe>
        <el-table-column prop="version" label="版本" min-width="110" />
        <el-table-column label="通道" width="90" align="center">
          <template #default="{ row }">{{ row.channel === 'beta' ? '测试版' : '稳定版' }}</template>
        </el-table-column>
        <el-table-column label="已发布平台" min-width="260" show-overflow-tooltip>
          <template #default="{ row }">{{ row.items.map((item: ReleaseItem) => label(item.platform)).join('、') }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.published ? 'success' : 'danger'" effect="light">{{ row.published ? '已上架' : '已下架' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="发布时间" width="170">
          <template #default="{ row }">{{ stamp(row.publishedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="detail = row">编辑</el-button>
            <el-button v-if="canWrite" link type="danger" :disabled="busy" @click="pendingVersionDelete = row">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-bar">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="rows.length"
          layout="total, prev, pager, next"
          background
        />
      </div>
    </el-card>

    <!-- 发布版本弹窗 -->
    <el-dialog
      v-model="composing"
      title="发布版本"
      width="1100px"
      :close-on-click-modal="false"
      :before-close="requestClose"
      class="release-dialog"
    >
      <div class="release-scroll">
        <p class="text-muted">填写一份更新说明，按需选择平台并分别上传附件。未选择的平台不发布。</p>
        <el-form label-position="top" class="release-fields">
          <el-form-item label="版本号">
            <el-input v-model="form.version" :disabled="busy || hasAssets" placeholder="例如 2.7.2" />
            <small v-if="hasAssets" class="text-muted">附件已上传，清空选择后才能修改版本号。</small>
          </el-form-item>
          <el-form-item label="发布通道">
            <el-select v-model="form.channel">
              <el-option label="稳定版" value="stable" />
              <el-option label="测试版" value="beta" />
            </el-select>
          </el-form-item>
          <el-form-item label="更新说明" class="span-all">
            <el-input v-model="form.notes" type="textarea" :rows="4" placeholder="逐条说明本次更新内容" />
          </el-form-item>
          <el-form-item label="最低可用版本">
            <el-input v-model="form.minVersion" placeholder="低于此版本时强制更新" />
          </el-form-item>
          <el-form-item label="强制更新">
            <div class="mandatory-row">
              <el-tag :type="form.mandatory ? 'danger' : 'info'" effect="light">{{ form.mandatory ? '已开启' : '未开启' }}</el-tag>
              <el-button size="small" @click="form.mandatory ? (form.mandatory = false) : (confirmMandatory = true)">
                {{ form.mandatory ? '关闭强制更新' : '开启强制更新' }}
              </el-button>
            </div>
          </el-form-item>
        </el-form>

        <div class="release-platforms">
          <section v-for="p in platforms" :key="p.key" class="release-platform">
            <el-checkbox v-model="selections[p.key].selected" :disabled="busy">
              <strong>{{ p.label }}</strong>
            </el-checkbox>
            <p class="text-muted">{{ p.hint }}</p>
            <template v-if="selections[p.key].selected">
              <div class="file-row">
                <input
                  :ref="(el) => setFileInput(p.key, el)"
                  type="file"
                  :accept="p.extension"
                  class="file-input"
                  :disabled="busy"
                  @change="chooseFile(p.key, $event)"
                />
                <el-button size="small" :disabled="busy" @click="triggerFile(p.key)">
                  {{ selections[p.key].file ? '重新选择' : '选择文件' }}
                </el-button>
                <span class="file-name">{{ selections[p.key].file?.name || '未选择文件' }}</span>
              </div>
              <div class="file-actions">
                <el-button size="small" type="primary" plain :disabled="busy || !selections[p.key].file" @click="uploadFile(p)">
                  上传附件
                </el-button>
                <el-button v-if="uploading === p.key" size="small" @click="controller?.abort()">取消上传</el-button>
              </div>
              <el-progress
                v-if="uploading === p.key"
                :percentage="selections[p.key].progress"
                :stroke-width="8"
                class="upload-progress"
              />
              <div v-if="selections[p.key].asset" class="asset-info">
                <p>上传完成：{{ selections[p.key].asset?.filename }} · {{ fileSize(selections[p.key].asset?.bytes ?? 0) }}</p>
                <p class="text-muted">SHA-256：{{ selections[p.key].asset?.sha256 }}</p>
              </div>
              <el-form-item v-if="p.key === 'windows-store'" label="微软商店链接" class="store-url">
                <el-input v-model="form.storeUrl" />
              </el-form-item>
            </template>
          </section>
        </div>
      </div>

      <template #footer>
        <div class="release-footer">
          <span v-if="closeHint" class="close-hint">{{ closeHint }}</span>
          <span class="text-muted">已选择 {{ selected.length }} 个平台</span>
          <el-button :disabled="busy" @click="resetDraft">清空选择</el-button>
          <el-button :disabled="busy" @click="requestClose(() => (composing = false))">取消</el-button>
          <el-button
            type="primary"
            :loading="busy && !uploading"
            :disabled="busy || !selected.length || !form.version.trim()"
            @click="publish"
          >
            发布所选平台
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 版本详情（平台发布管理） -->
    <el-dialog
      :model-value="Boolean(detail)"
      :title="detail ? detail.version + ' 平台发布管理' : ''"
      width="760px"
      @close="detail = null"
    >
      <section v-for="row in detail?.items || []" :key="row.id" class="detail-platform">
        <h3>
          {{ label(row.platform) }}
          <el-tag :type="row.withdrawn ? 'danger' : 'success'" effect="light" size="small">
            {{ row.withdrawn ? '已下架' : '已上架' }}
          </el-tag>
          <el-tag v-if="row.mandatory" type="warning" effect="light" size="small">强制更新</el-tag>
        </h3>
        <p>{{ row.notes || '未填写更新说明' }}</p>
        <p class="text-muted">
          {{ row.asset?.filename || row.url || '无附件' }}<template v-if="row.asset?.bytes">，{{ fileSize(row.asset.bytes) }}</template>
        </p>
        <div v-if="canWrite" class="detail-actions">
          <el-button size="small" :disabled="busy" @click="requestMandatory(row)">
            {{ row.mandatory ? '取消强制' : '设为强制' }}
          </el-button>
          <el-button size="small" :disabled="busy" @click="setWithdrawn(row, !row.withdrawn)">
            {{ row.withdrawn ? '重新上架' : '下架' }}
          </el-button>
          <el-button size="small" type="danger" plain :disabled="busy" @click="pendingDelete = row">删除</el-button>
        </div>
      </section>
    </el-dialog>

    <!-- 各类确认弹窗 -->
    <el-dialog v-model="confirmMandatory" title="确认开启强制更新" width="420px">
      <span>开启后低于此版本的用户无法跳过更新。请确认安装包与发布内容已经验收。</span>
      <template #footer>
        <el-button @click="confirmMandatory = false">取消</el-button>
        <el-button type="primary" @click="form.mandatory = true; confirmMandatory = false">确认开启</el-button>
      </template>
    </el-dialog>

    <el-dialog :model-value="Boolean(pendingMandatory)" title="确认设为强制更新" width="420px" @close="pendingMandatory = null">
      <span>该平台低于此版本的用户将无法跳过更新。</span>
      <template #footer>
        <el-button @click="pendingMandatory = null">取消</el-button>
        <el-button type="primary" @click="pendingMandatory && setMandatory(pendingMandatory, true)">确认设置</el-button>
      </template>
    </el-dialog>

    <el-dialog :model-value="Boolean(pendingDelete)" title="确认删除发布记录" width="460px" @close="pendingDelete = null">
      <span>删除后客户端不再收到该平台版本，对应安装包文件一并清除。若只是暂停分发，请改用下架。</span>
      <template #footer>
        <el-button @click="pendingDelete = null">取消</el-button>
        <el-button type="danger" :loading="busy" @click="remove">确认删除</el-button>
      </template>
    </el-dialog>

    <el-dialog :model-value="Boolean(pendingVersionDelete)" title="确认删除整个版本" width="480px" @close="pendingVersionDelete = null">
      <span v-if="pendingVersionDelete">
        将删除 {{ pendingVersionDelete.version }}（{{ pendingVersionDelete.channel === 'beta' ? '测试版' : '稳定版' }}）全部
        {{ pendingVersionDelete.items.length }} 个平台的发布记录及对应安装包文件，删除后不可恢复。若只是暂停分发，请进入编辑改用下架。
      </span>
      <template #footer>
        <el-button @click="pendingVersionDelete = null">取消</el-button>
        <el-button type="danger" :loading="busy" @click="removeVersion">确认删除</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  batchRelease,
  deleteRelease,
  deleteReleaseVersion,
  fetchReleases,
  updateRelease,
  uploadReleaseAsset
} from '@/api/admin'
import { runTask } from '@/utils/run'
import { fileSize, stamp } from '@/utils/format'
import { useUserStore } from '@/stores/user'
import type { ReleaseAsset, ReleaseItem, ReleaseStatistics } from '@/types'

const userStore = useUserStore()
const canWrite = computed(() => userStore.hasPerm('releases:write'))

interface Platform {
  key: string
  label: string
  extension: string
  filename: (version: string) => string
  hint: string
}

// 七个发行平台与安装包命名模板，与仓库发行命名规则一致
const platforms: Platform[] = [
  { key: 'windows', label: 'Windows 安装版', extension: '.exe', filename: (v) => `seal-office-setup-${v}.exe`, hint: '安装程序下载后自动校验，确认一致才启动安装。' },
  { key: 'windows-store', label: 'Windows 商店版', extension: '.msix', filename: (v) => `seal-office-${v}-microsoft-store-x64.msix`, hint: '商店附件单独归档，客户端通过下方商店链接更新。' },
  { key: 'macos', label: 'macOS', extension: '.dmg', filename: (v) => `seal-office-${v}-macos.dmg`, hint: '上传已验收的 DMG，用户下载后按 macOS 提示安装。' },
  { key: 'linux', label: 'Ubuntu', extension: '.deb', filename: (v) => `seal-office-${v}-amd64.deb`, hint: '下载 DEB 安装包后，由用户按系统提示安装。' },
  { key: 'web', label: '网页版', extension: '.zip', filename: (v) => `seal-office-${v}-web.zip`, hint: '先部署新网页再发布通知；可上传网页归档，也可不附文件。' },
  { key: 'android', label: 'Android', extension: '.apk', filename: (v) => `seal-office-${v}-android.apk`, hint: '上传已验收的正式 APK，用户下载后确认安装。' },
  { key: 'harmony', label: 'HarmonyOS', extension: '.hap', filename: (v) => `seal-office-${v}-harmony.hap`, hint: '上传独立签名的 HAP，不能使用 App Pack 代替。' }
]

interface Selection {
  selected: boolean
  file: File | null
  asset: ReleaseAsset | null
  progress: number
}

const blankPlatforms = (): Record<string, Selection> =>
  Object.fromEntries(platforms.map((p) => [p.key, { selected: false, file: null, asset: null, progress: 0 }]))

const form = ref({
  version: '',
  channel: 'stable',
  mandatory: false,
  minVersion: '',
  notes: '',
  storeUrl: 'ms-windows-store://pdp/?productid=9NGPL705R5Z3'
})
const selections = ref(blankPlatforms())
const items = ref<ReleaseItem[]>([])
const statistics = ref<ReleaseStatistics>({ all: 0, published: 0, withdrawn: 0 })

const busy = ref(false)
const uploading = ref('')
const composing = ref(false)
const closeHint = ref('')
const confirmMandatory = ref(false)
const pendingMandatory = ref<ReleaseItem | null>(null)
const pendingDelete = ref<ReleaseItem | null>(null)
const pendingVersionDelete = ref<any>(null)
const detail = ref<any>(null)

const filter = ref<'all' | 'published' | 'withdrawn'>('all')
const search = ref('')
const platformFilter = ref('')
const query = ref({ search: '', platform: '' })
const page = ref(1)
const pageSize = 10
const filters = [
  { key: 'all', label: '全部' },
  { key: 'published', label: '已上架' },
  { key: 'withdrawn', label: '已下架' }
] as const

const fileInputs = new Map<string, HTMLInputElement>()
let disposed = false
let controller: AbortController | null = null

const selected = computed(() => platforms.filter((p) => selections.value[p.key].selected))
const hasAssets = computed(() => Object.values(selections.value).some((row) => Boolean(row.asset)))
const label = (key: string) => platforms.find((p) => p.key === key)?.label || key

// 按 版本/通道 分组，组内任意平台未下架即视为已上架
const groups = computed(() => {
  const map = new Map<string, any>()
  for (const item of items.value) {
    const key = item.version + '/' + item.channel
    const group = map.get(key) || { key, version: item.version, channel: item.channel, publishedAt: 0, items: [] }
    group.items.push(item)
    group.publishedAt = Math.max(group.publishedAt, item.publishedAt)
    map.set(key, group)
  }
  return [...map.values()]
    .map((group) => ({ ...group, published: group.items.some((item: ReleaseItem) => !item.withdrawn) }))
    .sort((a, b) => b.publishedAt - a.publishedAt)
})

const rows = computed(() =>
  groups.value.filter(
    (row) =>
      (filter.value === 'all' || (filter.value === 'published') === row.published) &&
      row.version.includes(query.value.search) &&
      (!query.value.platform || row.items.some((item: ReleaseItem) => item.platform === query.value.platform))
  )
)

const pagedRows = computed(() => rows.value.slice((page.value - 1) * pageSize, page.value * pageSize))

function setFileInput(key: string, el: any) {
  if (el) fileInputs.set(key, el as HTMLInputElement)
}

function triggerFile(key: string) {
  fileInputs.get(key)?.click()
}

function refresh() {
  void runTask(busy, load)
}

async function load() {
  const result = await fetchReleases()
  if (disposed) return
  items.value = result.items
  statistics.value = result.statistics
  if (detail.value) detail.value = groups.value.find((group) => group.key === detail.value.key) || null
}

function chooseFile(key: string, event: Event) {
  const input = event.target as HTMLInputElement
  selections.value[key].file = input.files?.[0] || null
  selections.value[key].asset = null
  selections.value[key].progress = 0
}

function uploadFile(platform: Platform) {
  void runTask(busy, async () => {
    const state = selections.value[platform.key]
    const version = form.value.version.trim()
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('请先填写有效版本号，例如 2.7.2')
    if (!state.file) throw new Error('请先选择 ' + platform.label + ' 安装包')
    if (state.file.name !== platform.filename(version)) {
      throw new Error('文件名与平台或版本不一致，应为 ' + platform.filename(version))
    }
    if (state.file.size > 1024 * 1024 * 1024) throw new Error('单个安装包不能超过 1 GiB')
    controller = new AbortController()
    uploading.value = platform.key
    try {
      const result = await uploadReleaseAsset(
        platform.key,
        version,
        state.file,
        (value) => {
          if (!disposed) state.progress = value
        },
        controller.signal
      )
      if (!disposed) {
        state.asset = result.item
        state.progress = 100
        ElMessage.success(platform.label + ' 上传完成')
      }
    } finally {
      controller = null
      if (!disposed) uploading.value = ''
    }
  })
}

function resetDraft() {
  if (busy.value) return
  selections.value = blankPlatforms()
  form.value = {
    version: '',
    channel: 'stable',
    mandatory: false,
    minVersion: '',
    notes: '',
    storeUrl: 'ms-windows-store://pdp/?productid=9NGPL705R5Z3'
  }
}

function openComposer() {
  closeHint.value = ''
  composing.value = true
}

// 上传或发布进行中禁止关闭弹窗，避免进度丢失
function requestClose(done: () => void) {
  if (busy.value) {
    closeHint.value = uploading.value
      ? '安装包正在上传，请等待上传完成后关闭，当前进度会保留。'
      : '正在提交发布，请等待完成后关闭。'
    return
  }
  closeHint.value = ''
  done()
}

function protectUpload(event: BeforeUnloadEvent) {
  if (composing.value && busy.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}

function publish() {
  void runTask(busy, async () => {
    if (!selected.value.length) throw new Error('请至少选择一个需要发布的平台')
    const entries = selected.value.map((p) => {
      const state = selections.value[p.key]
      if (!state.asset && !['web', 'windows-store'].includes(p.key)) {
        throw new Error('请先上传 ' + p.label + ' 安装包，或取消选择该平台')
      }
      return {
        platform: p.key,
        ...(state.asset ? { assetId: state.asset.id } : {}),
        ...(p.key === 'windows-store' ? { url: form.value.storeUrl.trim() } : {})
      }
    })
    const version = form.value.version.trim()
    await batchRelease({
      version,
      channel: form.value.channel,
      mandatory: form.value.mandatory,
      minVersion: form.value.minVersion.trim() || null,
      notes: form.value.notes,
      platforms: entries
    })
    if (disposed) return
    composing.value = false
    selections.value = blankPlatforms()
    form.value.version = ''
    form.value.notes = ''
    ElMessage.success(`已发布 ${version}，共 ${entries.length} 个平台；未选择的平台保持原状`)
    await load()
  })
}

function requestMandatory(row: ReleaseItem) {
  if (row.mandatory) {
    void setMandatory(row, false)
  } else {
    pendingMandatory.value = row
  }
}

async function setMandatory(row: ReleaseItem, mandatory: boolean) {
  pendingMandatory.value = null
  void runTask(busy, async () => {
    await updateRelease(row.id, { mandatory })
    await load()
    if (!disposed) ElMessage.success(mandatory ? '已设为强制更新' : '已取消强制更新')
  })
}

function setWithdrawn(row: ReleaseItem, withdrawn: boolean) {
  void runTask(busy, async () => {
    await updateRelease(row.id, { withdrawn })
    await load()
    if (!disposed) ElMessage.success(withdrawn ? '已下架所选平台，客户端不再收到该版本' : '已重新上架所选平台')
  })
}

function remove() {
  const row = pendingDelete.value
  pendingDelete.value = null
  if (!row) return
  void runTask(busy, async () => {
    await deleteRelease(row.id)
    await load()
    if (!disposed) ElMessage.success('已删除所选平台的发布记录与安装包')
  })
}

function removeVersion() {
  const row = pendingVersionDelete.value
  pendingVersionDelete.value = null
  if (!row) return
  void runTask(busy, async () => {
    const result = await deleteReleaseVersion({ version: row.version, channel: row.channel })
    if (detail.value?.key === row.key) detail.value = null
    await load()
    if (!disposed) ElMessage.success(`已删除 ${row.version} 全部 ${result.deleted} 个平台的发布记录与安装包`)
  })
}

function applyQuery() {
  query.value = { search: search.value.trim(), platform: platformFilter.value }
  page.value = 1
}

function resetQuery() {
  filter.value = 'all'
  search.value = ''
  platformFilter.value = ''
  applyQuery()
}

onMounted(() => {
  refresh()
  window.addEventListener('beforeunload', protectUpload)
})

onUnmounted(() => {
  disposed = true
  controller?.abort()
  window.removeEventListener('beforeunload', protectUpload)
})
</script>

<style scoped lang="scss">
.release-scroll {
  max-height: 62vh;
  overflow-y: auto;
  padding-right: 6px;
}

.release-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;

  .span-all {
    grid-column: 1 / -1;
  }
}

.mandatory-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.release-platforms {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 8px;
}

.release-platform {
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.file-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}

.file-input {
  display: none;
}

.file-name {
  font-size: 12px;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-actions {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.upload-progress {
  margin-top: 10px;
}

.asset-info {
  margin-top: 10px;
  font-size: 12px;

  p {
    margin: 2px 0;
    overflow-wrap: anywhere;
  }
}

.store-url {
  margin-top: 10px;
}

.release-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.close-hint {
  color: #e6a23c;
  font-size: 12px;
  margin-right: auto;
}

.detail-platform {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px;
  margin-bottom: 12px;

  h3 {
    margin: 0 0 8px;
    font-size: 15px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  p {
    margin: 4px 0;
  }
}

.detail-actions {
  display: flex;
  gap: 10px;
  margin-top: 10px;
  flex-wrap: wrap;
}

@media (max-width: 900px) {
  .release-fields,
  .release-platforms {
    grid-template-columns: minmax(0, 1fr);
  }

  .release-fields .span-all {
    grid-column: auto;
  }
}
</style>
