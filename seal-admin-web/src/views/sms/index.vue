<template>
  <div class="page-container">
    <header class="page-heading">
      <div>
        <h1>短信服务</h1>
        <p>验证码短信通道配置、发送统计与发送记录</p>
      </div>
      <div class="page-actions">
        <el-button :loading="busy" :icon="Refresh" @click="refresh">刷新数据</el-button>
      </div>
    </header>

    <el-skeleton v-if="!data && busy" :rows="10" animated />

    <template v-if="data">
      <el-alert
        v-if="!data.config.configured"
        type="warning"
        show-icon
        :closable="false"
        class="config-alert"
        title="短信通道未配置访问密钥：用户暂时无法收到登录验证码。请在服务器环境文件中设置 ALIYUN_ACCESS_KEY_ID 与 ALIYUN_ACCESS_KEY_SECRET 后重启服务。"
      />

      <!-- 指标 -->
      <div class="kpi-row">
        <div v-for="item in kpis" :key="item.label" class="kpi-card">
          <span class="kpi-label">{{ item.label }}</span>
          <strong class="kpi-value">{{ item.value }}</strong>
          <span class="kpi-hint">{{ item.hint }}</span>
        </div>
      </div>

      <div class="grid grid-2-1">
        <ChartCard title="发送趋势" subtitle="近 30 天每日发送成功与失败条数" :option="trendBar" :height="300" />

        <!-- 通道配置 -->
        <el-card shadow="never">
          <template #header>
            <div class="panel-head">
              <span class="panel-title">通道配置</span>
              <el-tag :type="data.config.configured ? 'success' : 'warning'" effect="light" round>
                <el-icon class="tag-icon"><component :is="data.config.configured ? CircleCheckFilled : WarningFilled" /></el-icon>
                {{ data.config.configured ? '已配置' : '未配置' }}
              </el-tag>
            </div>
          </template>
          <dl class="config-list">
            <div><dt>服务商</dt><dd>{{ data.config.provider }} · {{ data.config.region }}</dd></div>
            <div><dt>访问密钥</dt><dd class="mono">{{ data.config.accessKey || '未设置' }}</dd></div>
            <div>
              <dt>短信签名</dt>
              <dd>{{ data.config.sign }} <el-tag v-if="data.config.sign !== data.config.defaultSign" size="small" effect="plain">已自定义</el-tag></dd>
            </div>
            <div>
              <dt>验证码模板</dt>
              <dd class="mono">{{ data.config.template }} <el-tag v-if="data.config.template !== data.config.defaultTemplate" size="small" effect="plain">已自定义</el-tag></dd>
            </div>
            <div v-if="data.config.updated"><dt>最近修改</dt><dd>{{ stamp(data.config.updated) }}</dd></div>
          </dl>
          <div v-if="canWrite" class="config-actions">
            <el-button type="primary" plain :icon="EditPen" @click="openSettings">修改签名模板</el-button>
            <el-button :icon="Promotion" :disabled="!data.config.configured" @click="testVisible = true">测试发送</el-button>
          </div>
          <p class="config-tip">访问密钥只从服务器环境文件读取，后台仅显示脱敏标识，不提供修改与回显。</p>
        </el-card>
      </div>

      <div class="grid grid-3">
        <ChartCard title="发送结果" subtitle="近 30 天" :option="resultPie" :height="260" :empty="!data.stats.monthSent && !data.stats.monthFailed" />
        <ChartCard title="发送时段" subtitle="近 24 小时各小时发送条数" :option="hourlyBar" :height="260" />
        <ChartCard title="验证码用途" subtitle="近 30 天" :option="purposePie" :height="260" :empty="!data.purposes.length" />
      </div>

      <div class="grid grid-1-1">
        <ChartCard title="失败原因" subtitle="近 30 天按供应商错误码归类" :option="errorBar" :height="240" :empty="!data.errors.length" empty-text="近 30 天没有发送失败" />
        <el-card shadow="never">
          <template #header>
            <div class="panel-head"><span class="panel-title">防刷限制</span></div>
          </template>
          <div class="limit-grid">
            <div class="limit"><span>同号发送间隔</span><strong>{{ data.limits.phoneInterval }} 秒</strong></div>
            <div class="limit"><span>同号每日上限</span><strong>{{ data.limits.phoneDaily }} 条</strong></div>
            <div class="limit"><span>同 IP 每小时上限</span><strong>{{ data.limits.ipHourly }} 条</strong></div>
            <div class="limit"><span>验证码有效期</span><strong>{{ data.limits.codeTtl / 60 }} 分钟</strong></div>
            <div class="limit"><span>最多校验次数</span><strong>{{ data.limits.maxAttempts }} 次</strong></div>
            <div class="limit"><span>当前有效验证码</span><strong>{{ data.stats.activeCodes }}</strong></div>
          </div>
          <div v-if="data.topIps.length" class="ip-list">
            <span class="ip-title">近 24 小时请求最多的来源</span>
            <div v-for="row in data.topIps" :key="String(row.ip)" class="ip-row">
              <span class="mono">{{ row.ip }}</span>
              <span>{{ row.count }} 次</span>
            </div>
          </div>
        </el-card>
      </div>

      <!-- 发送记录 -->
      <el-card shadow="never">
        <template #header>
          <div class="panel-head">
            <span class="panel-title">发送记录 <small class="text-muted">保留 {{ data.limits.retentionDays }} 天，手机号与 IP 已脱敏</small></span>
            <div class="log-filters">
              <el-input v-model="phone" placeholder="按手机号筛选" clearable style="width: 170px" @change="search" @clear="search" />
              <el-select v-model="status" style="width: 120px" @change="search">
                <el-option label="全部结果" value="all" />
                <el-option label="发送成功" value="sent" />
                <el-option label="发送失败" value="failed" />
              </el-select>
            </div>
          </div>
        </template>
        <el-table v-loading="logBusy" :data="logs" empty-text="暂无发送记录">
          <el-table-column label="时间" min-width="170">
            <template #default="{ row }">{{ stamp(row.time) }}</template>
          </el-table-column>
          <el-table-column prop="phone" label="手机号" min-width="130" />
          <el-table-column label="用途" min-width="110">
            <template #default="{ row }">{{ purposeName(row.purpose) }}</template>
          </el-table-column>
          <el-table-column label="来源" min-width="100">
            <template #default="{ row }">{{ row.source === 'admin' ? '后台测试' : '用户请求' }}</template>
          </el-table-column>
          <el-table-column label="IP" min-width="130">
            <template #default="{ row }"><span class="mono">{{ row.ip || '—' }}</span></template>
          </el-table-column>
          <el-table-column label="结果" min-width="200">
            <template #default="{ row }">
              <span class="status" :class="row.status">
                <el-icon><component :is="row.status === 'sent' ? CircleCheckFilled : CircleCloseFilled" /></el-icon>
                {{ row.status === 'sent' ? '发送成功' : '发送失败' }}
              </span>
              <span v-if="row.error" class="error-text">{{ row.error }}</span>
            </template>
          </el-table-column>
        </el-table>
        <div class="pager">
          <el-pagination
            v-model:current-page="page"
            :page-size="size"
            :total="total"
            layout="total, prev, pager, next"
            background
            @current-change="loadLogs"
          />
        </div>
      </el-card>
    </template>

    <el-dialog v-model="settingsVisible" title="修改签名与模板" width="460px">
      <el-form label-width="96px" @submit.prevent>
        <el-form-item label="短信签名">
          <el-input v-model="form.sign" maxlength="30" show-word-limit />
        </el-form-item>
        <el-form-item label="模板编号">
          <el-input v-model="form.template" placeholder="SMS_123456789" />
        </el-form-item>
      </el-form>
      <p class="dialog-tip">签名与模板须已在阿里云短信控制台审核通过，保存后立即用于新的验证码短信。默认值：{{ data?.config.defaultSign }} / {{ data?.config.defaultTemplate }}</p>
      <template #footer>
        <el-button @click="restoreDefault">恢复默认</el-button>
        <el-button @click="settingsVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveSettings">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="testVisible" title="测试发送" width="420px">
      <el-form label-width="80px" @submit.prevent>
        <el-form-item label="手机号">
          <el-input v-model="testPhone" maxlength="11" placeholder="接收测试短信的手机号" />
        </el-form-item>
      </el-form>
      <p class="dialog-tip">将用当前签名和模板发送一条随机验证码，产生一条真实短信计费；每 60 秒最多测试一次。</p>
      <template #footer>
        <el-button @click="testVisible = false">取消</el-button>
        <el-button type="primary" :loading="testing" @click="sendTest">发送</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { CircleCheckFilled, CircleCloseFilled, EditPen, Promotion, Refresh, WarningFilled } from '@element-plus/icons-vue'
import ChartCard from '@/components/ChartCard.vue'
import { fetchSmsLogs, fetchSmsSummary, sendSmsTest, updateSmsSettings } from '@/api/admin'
import { runTask } from '@/utils/run'
import { stamp } from '@/utils/format'
import { SERIES, STATUS, barOption, pieOption } from '@/utils/charts'
import { useUserStore } from '@/stores/user'
import type { SmsLogRow, SmsSummary } from '@/types'

const userStore = useUserStore()
const canWrite = computed(() => userStore.hasPerm('sms:write'))

const data = ref<SmsSummary>()
const busy = ref(false)

const purposeNames: Record<string, string> = {
  login: '登录注册',
  password: '设置密码',
  purge: '清空云空间',
  'space-key-reset': '重置空间密钥',
  'delete-account': '注销账号',
  'admin-test': '后台测试'
}
const purposeName = (value: string) => purposeNames[value] || value

const kpis = computed(() => {
  const s = data.value!.stats
  return [
    { label: '今日发送', value: s.todaySent, hint: s.todayFailed ? `另有 ${s.todayFailed} 条失败` : '今日无失败' },
    { label: '近 7 天发送', value: s.weekSent, hint: `涉及 ${s.uniquePhones7d} 个手机号` },
    { label: '近 30 天发送', value: s.monthSent, hint: `失败 ${s.monthFailed} 条` },
    { label: '发送成功率', value: s.successRate == null ? '—' : s.successRate + '%', hint: '近 30 天' },
    { label: '24 小时请求', value: s.window24h, hint: '计入防刷限流窗口' }
  ]
})

const trendBar = computed(() =>
  barOption(
    data.value!.trend.days,
    [
      { name: '发送成功', data: data.value!.trend.sent, color: STATUS.good },
      { name: '发送失败', data: data.value!.trend.failed, color: STATUS.critical }
    ],
    { stack: true }
  )
)
const resultPie = computed(() =>
  pieOption(
    [
      { name: '发送成功', value: data.value!.stats.monthSent },
      { name: '发送失败', value: data.value!.stats.monthFailed }
    ],
    [STATUS.good, STATUS.critical]
  )
)
const hourlyBar = computed(() =>
  barOption(Array.from({ length: 24 }, (_, i) => `${i}时`), [{ name: '发送条数', data: data.value!.hourly, color: SERIES[0] }])
)
const purposePie = computed(() => {
  const order = Object.keys(purposeNames)
  const rows = [...data.value!.purposes].sort((a, b) => order.indexOf(String(a.purpose)) - order.indexOf(String(b.purpose)))
  return pieOption(
    rows.map((row) => ({ name: purposeName(String(row.purpose)), value: row.count })),
    rows.map((row) => {
      const index = order.indexOf(String(row.purpose))
      return SERIES[index >= 0 ? index : SERIES.length - 1]
    })
  )
})
const errorBar = computed(() =>
  barOption(
    data.value!.errors.map((row) => String(row.error)),
    [{ name: '失败次数', data: data.value!.errors.map((row) => row.count), color: STATUS.critical }],
    { horizontal: true, labelWidth: 200 }
  )
)

// ---- 发送记录 ----
const logs = ref<SmsLogRow[]>([])
const logBusy = ref(false)
const page = ref(1)
const size = 15
const total = ref(0)
const status = ref('all')
const phone = ref('')

function loadLogs() {
  void runTask(logBusy, async () => {
    const result = await fetchSmsLogs({ page: page.value, size, status: status.value === 'all' ? '' : status.value, phone: phone.value.trim() })
    logs.value = result.items
    total.value = result.total
  })
}

function search() {
  page.value = 1
  loadLogs()
}

function refresh() {
  void runTask(busy, async () => {
    data.value = await fetchSmsSummary()
  })
  loadLogs()
}

// ---- 配置修改 ----
const settingsVisible = ref(false)
const saving = ref(false)
const form = reactive({ sign: '', template: '' })

function openSettings() {
  form.sign = data.value!.config.sign
  form.template = data.value!.config.template
  settingsVisible.value = true
}

function restoreDefault() {
  form.sign = data.value!.config.defaultSign
  form.template = data.value!.config.defaultTemplate
}

function saveSettings() {
  void runTask(saving, async () => {
    const config = await updateSmsSettings(form.sign.trim(), form.template.trim())
    data.value!.config = config
    settingsVisible.value = false
    ElMessage.success('短信签名与模板已保存')
  })
}

// ---- 测试发送 ----
const testVisible = ref(false)
const testing = ref(false)
const testPhone = ref('')

function sendTest() {
  void runTask(testing, async () => {
    if (!/^1[3-9]\d{9}$/.test(testPhone.value.trim())) throw new Error('请输入正确的 11 位手机号')
    const result = await sendSmsTest(testPhone.value.trim())
    testVisible.value = false
    ElMessage.success(`测试短信已发送至 ${result.phone}`)
    refresh()
  })
}

onMounted(refresh)
</script>

<style scoped lang="scss">
.config-alert {
  margin-bottom: 16px;
}

.kpi-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.kpi-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 18px 20px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
}

.kpi-label {
  font-size: 13px;
  color: var(--text-2);
}

.kpi-value {
  font-size: 26px;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
}

.kpi-hint {
  font-size: 12px;
  color: var(--text-3);
}

.grid {
  display: grid;
  gap: 16px;
  margin-bottom: 16px;
}

.grid-2-1 { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
.grid-1-1 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.panel-title {
  font-weight: 600;
}

.tag-icon {
  margin-right: 4px;
  vertical-align: -2px;
}

.config-list {
  margin: 0;

  div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
  }

  div:last-child {
    border-bottom: 0;
  }

  dt {
    flex: 0 0 auto;
    font-size: 13px;
    color: var(--text-2);
  }

  dd {
    margin: 0;
    text-align: right;
    overflow-wrap: anywhere;
  }
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
}

.config-actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}

.config-tip,
.dialog-tip {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.6;
}

.limit-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.limit {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  background: #f7f8fb;
  border-radius: 8px;

  span {
    font-size: 12px;
    color: var(--text-2);
  }

  strong {
    font-size: 18px;
    font-variant-numeric: tabular-nums;
  }
}

.ip-list {
  margin-top: 14px;
}

.ip-title {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--text-2);
}

.ip-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 13px;
  border-bottom: 1px dashed var(--border);
}

.log-filters {
  display: flex;
  gap: 8px;
}

.status {
  display: inline-flex;
  align-items: center;
  gap: 4px;

  &.sent { color: #0a8f1f; }
  &.failed { color: #dc3c3d; }
}

.error-text {
  display: block;
  font-size: 12px;
  color: var(--text-3);
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

@media (max-width: 1300px) {
  .kpi-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 1100px) {
  .kpi-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .grid-2-1,
  .grid-1-1,
  .grid-3 { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 600px) {
  .kpi-row,
  .limit-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
