<!--
  演示中心 · 工具箱:内置 Tools 工具库在线试用。
  每张卡片右上角标注对应的后端函数,结果全部来自 server/app/common/support/tools,本地数据,不调用外部接口。
  Author: qiufeng
-->
<template>
  <div class="toolbox">
    <div class="toolbox__head">
      <div>
        <h2>工具箱</h2>
        <p>后端内置 <code>Tools::xxx()</code> 工具库在线试用:万年历、拼音、敏感词、归属地、行政区划、金额大写、二维码……全部读本地数据,不调用外部接口。</p>
      </div>
    </div>

    <!-- 万年历 + 当日详情 -->
    <div class="toolbox__row toolbox__row--calendar">
      <section class="panel">
        <div class="card-head">
          <span class="card-title">万年历<small>农历、节气、节日、法定节假日与调休</small></span>
          <code class="fn">Tools::calendarMonth()</code>
        </div>
        <div class="cal-bar">
          <t-button variant="outline" shape="square" size="small" @click="shiftMonth(-1)"><chevron-left-icon /></t-button>
          <span class="cal-bar__month">{{ monthLabel }}</span>
          <t-button variant="outline" shape="square" size="small" @click="shiftMonth(1)"><chevron-right-icon /></t-button>
          <t-button variant="text" size="small" @click="goToday">回到今天</t-button>
        </div>
        <t-loading :loading="calLoading" size="small">
          <div class="cal-grid">
            <div v-for="w in WEEK_HEAD" :key="w" class="cal-grid__week">{{ w }}</div>
            <div v-for="n in leadingBlanks" :key="`b${n}`" class="cal-cell cal-cell--blank" />
            <button
              v-for="d in calendar?.days ?? []"
              :key="d.date"
              type="button"
              class="cal-cell"
              :class="{
                'is-today': d.date === todayDate,
                'is-selected': d.date === selected?.date,
                'is-rest': d.is_rest_day,
              }"
              @click="selected = d"
            >
              <span class="cal-cell__day">{{ Number(d.date.slice(8)) }}</span>
              <span class="cal-cell__sub" :class="{ 'is-mark': cellMark(d).mark }">{{ cellMark(d).text }}</span>
              <span v-if="d.holiday" class="cal-cell__badge" :class="d.holiday.is_rest ? 'is-rest' : 'is-work'">
                {{ d.holiday.is_rest ? '休' : '班' }}
              </span>
            </button>
          </div>
        </t-loading>
      </section>

      <section v-if="selected" class="panel day-card">
        <div class="day-card__date">
          <span class="day-card__num">{{ Number(selected.date.slice(8)) }}</span>
          <div>
            <div>{{ dayjs(selected.date).format('YYYY年M月') }} · {{ selected.week }}</div>
            <div class="day-card__lunar">农历{{ selected.lunar.month }}月{{ selected.lunar.day }}</div>
          </div>
        </div>
        <div class="day-card__tags">
          <t-tag v-for="f in dayFestivals(selected)" :key="f" theme="primary" variant="light">{{ f }}</t-tag>
          <t-tag v-if="selected.lunar.jie_qi" theme="success" variant="light">{{ selected.lunar.jie_qi }}</t-tag>
          <t-tag v-if="selected.holiday" :theme="selected.holiday.is_rest ? 'success' : 'warning'" variant="light">
            {{ selected.holiday.name }}{{ selected.holiday.is_rest ? '放假' : '调休上班' }}
          </t-tag>
          <t-tag v-else :theme="selected.is_workday ? 'default' : 'success'" variant="light">
            {{ selected.is_workday ? '工作日' : '休息日' }}
          </t-tag>
        </div>
        <dl class="kv">
          <dt>干支</dt>
          <dd>{{ selected.lunar.gan_zhi_year }}年 {{ selected.lunar.gan_zhi_month }}月 {{ selected.lunar.gan_zhi_day }}日</dd>
          <dt>生肖</dt>
          <dd>{{ selected.lunar.sheng_xiao }}</dd>
          <dt class="is-yi">宜</dt>
          <dd>{{ selected.lunar.yi.slice(0, 8).join(' ') || '-' }}</dd>
          <dt class="is-ji">忌</dt>
          <dd>{{ selected.lunar.ji.slice(0, 8).join(' ') || '-' }}</dd>
        </dl>
        <div v-if="calendar?.next_holiday" class="day-card__next">
          <span>下一个节假日</span>
          <strong>{{ calendar.next_holiday.name }}</strong>
          <em>{{ calendar.next_holiday.days_until === 0 ? '就是今天' : `还有 ${calendar.next_holiday.days_until} 天` }}</em>
        </div>
        <code class="fn fn--block">Tools::calendar() · Tools::nextHoliday()</code>
      </section>
    </div>

    <div class="toolbox__row">
      <!-- 文字处理 -->
      <section class="panel">
        <div class="card-head">
          <span class="card-title">文字处理</span>
          <code class="fn">Tools::pinyin() / matchSensitive()</code>
        </div>
        <t-textarea v-model="text" :maxlength="200" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="输入一段中文" />
        <div class="actions">
          <t-button size="small" :loading="textLoading" @click="runText">转换</t-button>
          <t-link v-for="s in TEXT_SAMPLES" :key="s" theme="primary" hover="color" @click="text = s; runText()">{{ s }}</t-link>
        </div>
        <dl v-if="textResult" class="kv">
          <dt>拼音</dt>
          <dd>{{ textResult.pinyin }}</dd>
          <dt>首字母</dt>
          <dd class="mono">{{ textResult.abbr }}</dd>
          <dt>URL 别名</dt>
          <dd class="mono">{{ textResult.slug }}</dd>
          <dt>繁体</dt>
          <dd>{{ textResult.traditional }}</dd>
          <dt>敏感词</dt>
          <dd>
            <t-space v-if="textResult.sensitive.hit" size="4px" break-line>
              <t-tag v-for="m in textResult.sensitive.matches" :key="m.offset" theme="danger" variant="light" size="small">
                {{ m.text }} · {{ m.category_label }}
              </t-tag>
            </t-space>
            <span v-else class="ok">未命中</span>
          </dd>
          <dt>替换后</dt>
          <dd>{{ textResult.sensitive.replaced }}</dd>
        </dl>
      </section>

      <!-- 归属地 -->
      <section class="panel">
        <div class="card-head">
          <span class="card-title">归属地</span>
          <code class="fn">Tools::phoneLocation() / IP 库</code>
        </div>
        <div class="inline-form">
          <t-input v-model="phone" placeholder="手机号" clearable @enter="runPhone" />
          <t-button variant="outline" @click="runPhone">查手机号</t-button>
        </div>
        <p v-if="phoneResult" class="result-line">
          <template v-if="phoneResult.found">
            <strong>{{ phoneResult.province }} {{ phoneResult.city }}</strong>
            <span>{{ phoneResult.operator }} · 区号 {{ phoneResult.area_code }} · 邮编 {{ phoneResult.postcode }}</span>
          </template>
          <span v-else class="warn">{{ phoneResult.message }}</span>
        </p>
        <div class="inline-form">
          <t-input v-model="ip" placeholder="IPv4 地址" clearable @enter="runIp" />
          <t-button variant="outline" @click="runIp">查 IP</t-button>
        </div>
        <p v-if="ipResult" class="result-line">
          <template v-if="ipResult.found">
            <strong>{{ [ipResult.country, ipResult.province, ipResult.city].filter(Boolean).join(' ') }}</strong>
            <span>{{ ipResult.isp || '未知运营商' }}</span>
          </template>
          <span v-else class="warn">{{ ipResult.message }}</span>
        </p>
        <p class="note">号段库与 IP 库都在本地,登录日志的"登录地点"、IP 屏蔽规则用的就是它们。</p>
      </section>

      <!-- 行政区划 -->
      <section class="panel">
        <div class="card-head">
          <span class="card-title">行政区划</span>
          <code class="fn">Tools::regionChildren() / postcode()</code>
        </div>
        <t-cascader
          v-model="regionCode"
          :options="regionOptions"
          :load="loadRegion"
          check-strictly
          clearable
          placeholder="省 / 市 / 区县 / 乡镇 / 村,任意一级都可选"
          @change="onRegionChange"
        />
        <dl v-if="regionDetail" class="kv">
          <dt>完整名称</dt>
          <dd>{{ regionDetail.full_name }}</dd>
          <dt>区划编码</dt>
          <dd class="mono">{{ regionDetail.region.code }}</dd>
          <dt>层级</dt>
          <dd>{{ LEVELS[regionDetail.region.level - 1] }}</dd>
          <dt>邮编 / 区号</dt>
          <dd>
            <template v-if="regionDetail.postcode">
              {{ regionDetail.postcode.zip_code || '-' }} / {{ regionDetail.postcode.area_code || '-' }}
            </template>
            <span v-else class="muted">邮编库只到区县级</span>
          </dd>
        </dl>
        <p class="note">五级区划(省市区县乡镇村)存在本地 SQLite,按需懒加载。</p>
      </section>
    </div>

    <div class="toolbox__row">
      <!-- 金额大写 -->
      <section class="panel">
        <div class="card-head">
          <span class="card-title">金额大写</span>
          <code class="fn">Tools::moneyToCn()</code>
        </div>
        <div class="inline-form">
          <t-input v-model="amount" placeholder="金额(元)" clearable @enter="runMoney">
            <template #prefix-icon><span class="yuan">¥</span></template>
          </t-input>
          <t-button variant="outline" @click="runMoney">转换</t-button>
        </div>
        <div v-if="moneyResult" class="money">
          <div class="money__cn">{{ moneyResult.chinese }}</div>
          <div class="muted">存库用分:<span class="mono">{{ moneyResult.fen }}</span>,展示:{{ moneyResult.formatted }}</div>
        </div>
      </section>

      <!-- 二维码 -->
      <section class="panel">
        <div class="card-head">
          <span class="card-title">二维码</span>
          <code class="fn">Tools::qrcodeBase64()</code>
        </div>
        <div class="inline-form">
          <t-input v-model="qrContent" placeholder="网址或任意文字" clearable @enter="runQrcode" />
          <t-button variant="outline" @click="runQrcode">生成</t-button>
        </div>
        <div v-if="qrImage" class="qrcode"><img :src="qrImage" alt="二维码" /></div>
      </section>

      <!-- 当前设备 -->
      <section class="panel">
        <div class="card-head">
          <span class="card-title">当前设备</span>
          <code class="fn">Tools::parseUserAgent()</code>
        </div>
        <dl v-if="uaResult" class="kv">
          <dt>浏览器</dt>
          <dd>{{ uaResult.browser }} {{ uaResult.browser_version }}</dd>
          <dt>系统</dt>
          <dd>{{ uaResult.os }} {{ uaResult.os_version }}</dd>
          <dt>设备类型</dt>
          <dd>{{ DEVICE_TYPES[uaResult.device_type] ?? uaResult.device_type }}</dd>
          <dt>爬虫</dt>
          <dd>{{ uaResult.is_robot ? '是' : '否' }}</dd>
        </dl>
        <p v-if="uaResult" class="ua">{{ uaResult.user_agent }}</p>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import dayjs from 'dayjs';
import { ChevronLeftIcon, ChevronRightIcon } from 'tdesign-icons-vue-next';
import type { CascaderProps, TreeNodeModel } from 'tdesign-vue-next';
import {
  getCalendar,
  convertText,
  convertMoney,
  listRegions,
  getRegionDetail,
  makeQrcode,
  getSamples,
  lookupPhone,
  lookupIp,
  type CalendarDay,
  type CalendarMonth,
  type TextResult,
  type MoneyResult,
  type RegionDetail,
  type UserAgentResult,
  type PhoneLocation,
  type IpLocation,
  type RegionItem,
} from '@/api/demo/toolbox';

const WEEK_HEAD = ['一', '二', '三', '四', '五', '六', '日'];
const LEVELS = ['省级', '地级', '县级', '乡级', '村级'];
const DEVICE_TYPES: Record<string, string> = {
  desktop: '电脑',
  mobile: '手机',
  tablet: '平板',
  robot: '爬虫',
  unknown: '未知',
};
const TEXT_SAMPLES = ['重庆火锅很好吃', '高薪招聘,有意者加QQ'];

// ---------- 万年历 ----------
const todayDate = dayjs().format('YYYY-MM-DD');
const month = ref(dayjs().format('YYYY-MM'));
const calendar = ref<CalendarMonth>();
const selected = ref<CalendarDay>();
const calLoading = ref(false);

const monthLabel = computed(() => dayjs(`${month.value}-01`).format('YYYY 年 M 月'));

/** 周一开头,1 号前面补几个空格 */
const leadingBlanks = computed(() => (dayjs(`${month.value}-01`).day() + 6) % 7);

async function loadCalendar(): Promise<void> {
  calLoading.value = true;
  try {
    calendar.value = await getCalendar(month.value);
    // 当月含今天就选中今天,否则选中 1 号
    selected.value =
      calendar.value.days.find((d) => d.date === selected.value?.date) ??
      calendar.value.days.find((d) => d.date === todayDate) ??
      calendar.value.days[0];
  } finally {
    calLoading.value = false;
  }
}

function shiftMonth(step: number): void {
  month.value = dayjs(`${month.value}-01`).add(step, 'month').format('YYYY-MM');
  loadCalendar();
}

function goToday(): void {
  month.value = todayDate.slice(0, 7);
  selected.value = undefined;
  loadCalendar();
}

/** 当天的节日名(公历节日 + 农历节日) */
function dayFestivals(d: CalendarDay): string[] {
  return [...d.festivals, ...d.lunar.festivals];
}

/** 格子下方文字:节日 > 节气 > 农历日(初一显示月份) */
function cellMark(d: CalendarDay): { text: string; mark: boolean } {
  const festival = dayFestivals(d)[0];
  if (festival) return { text: festival, mark: true };
  if (d.lunar.jie_qi) return { text: d.lunar.jie_qi, mark: true };
  return { text: d.lunar.day === '初一' ? `${d.lunar.month}月` : d.lunar.day, mark: false };
}

// ---------- 文字处理 ----------
const text = ref('');
const textResult = ref<TextResult>();
const textLoading = ref(false);

async function runText(): Promise<void> {
  if (!text.value.trim()) return;
  textLoading.value = true;
  try {
    textResult.value = await convertText(text.value);
  } finally {
    textLoading.value = false;
  }
}

// ---------- 归属地 ----------
const phone = ref('13800138000');
const ip = ref('114.114.114.114');
const phoneResult = ref<PhoneLocation>();
const ipResult = ref<IpLocation>();

async function runPhone(): Promise<void> {
  if (phone.value.trim()) phoneResult.value = await lookupPhone(phone.value.trim());
}

async function runIp(): Promise<void> {
  if (ip.value.trim()) ipResult.value = await lookupIp(ip.value.trim());
}

// ---------- 行政区划(懒加载) ----------
const regionCode = ref<string>();
const regionOptions = ref<CascaderProps['options']>([]);
const regionDetail = ref<RegionDetail>();

/** 区划行 → 级联选项;children: true 表示还有下级,展开时再调 load */
function toOptions(list: RegionItem[]): NonNullable<CascaderProps['options']> {
  return list.map((r) => ({ label: r.name, value: r.code, children: r.leaf ? undefined : true }));
}

const loadRegion = async (node: TreeNodeModel) => toOptions(await listRegions(String(node.value)));

async function onRegionChange(value: unknown): Promise<void> {
  regionDetail.value = value ? await getRegionDetail(String(value)) : undefined;
}

// ---------- 金额 / 二维码 / 设备 ----------
const amount = ref('');
const moneyResult = ref<MoneyResult>();
const qrContent = ref('');
const qrImage = ref('');
const uaResult = ref<UserAgentResult>();

async function runMoney(): Promise<void> {
  if (amount.value.trim()) moneyResult.value = await convertMoney(amount.value.trim());
}

async function runQrcode(): Promise<void> {
  if (qrContent.value.trim()) qrImage.value = (await makeQrcode(qrContent.value)).image;
}

/** 示例区划:把省 → 市 → 区县三级选项挂成树,级联框才能直接显示已选名称 */
function applyRegionSample(sample: { selected: string[]; levels: { items: RegionItem[] }[]; detail: RegionDetail }): void {
  const levels = sample.levels.map((level) => toOptions(level.items));
  for (let i = 0; i < levels.length - 1; i++) {
    const parent = levels[i]!.find((o) => o.value === sample.selected[i]);
    if (parent) parent.children = levels[i + 1]!;
  }
  regionOptions.value = levels[0]!;
  regionCode.value = sample.selected.at(-1);
  regionDetail.value = sample.detail;
}

onMounted(async () => {
  // 示例结果一次拿齐,打开页面只发 4 个请求,不会撞上默认每秒 10 次的接口限流
  const [samples] = await Promise.all([getSamples(), loadCalendar(), runPhone(), runIp()]);
  text.value = samples.text.text;
  textResult.value = samples.text;
  amount.value = samples.money.amount;
  moneyResult.value = samples.money;
  qrContent.value = samples.qrcode.content;
  qrImage.value = samples.qrcode.image;
  uaResult.value = samples.user_agent;
  applyRegionSample(samples.region);
});
</script>

<style scoped>
.toolbox {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.toolbox__head h2 {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 600;
  color: var(--tl-text-1);
}

.toolbox__head p {
  margin: 0;
  font-size: 13px;
  color: var(--tl-text-2);
}

.toolbox__head code {
  padding: 1px 6px;
  font-size: 12px;
  color: var(--tl-primary-dark);
  background: var(--tl-primary-light);
  border-radius: 4px;
}

.toolbox__row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  align-items: start;
}

.toolbox__row--calendar {
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
}

/* ---------- 卡片头 ---------- */
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 14px;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--tl-text-1);
  white-space: nowrap;
}

.card-title small {
  margin-left: 8px;
  font-size: 12px;
  font-weight: 400;
  color: var(--tl-text-3);
}

.fn {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 2px 8px;
  font-family: 'SFMono-Regular', Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--tl-primary-dark);
  background: var(--tl-primary-light);
  border-radius: 4px;
}

.fn--block {
  display: block;
  margin-top: 16px;
  text-align: center;
}

/* ---------- 万年历 ---------- */
.cal-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.cal-bar__month {
  min-width: 110px;
  font-size: 15px;
  font-weight: 600;
  text-align: center;
}

.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
}

.cal-grid__week {
  padding: 4px 0;
  font-size: 12px;
  text-align: center;
  color: var(--tl-text-3);
}

.cal-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 58px;
  padding: 0;
  font: inherit;
  color: var(--tl-text-1);
  cursor: pointer;
  background: var(--tl-surface);
  border: 1px solid var(--tl-line);
  border-radius: 8px;
  transition: border-color 0.15s, background 0.15s;
}

.cal-cell:hover {
  border-color: var(--td-brand-color-3);
}

.cal-cell--blank {
  cursor: default;
  border-color: transparent;
}

.cal-cell.is-rest .cal-cell__day {
  color: var(--td-error-color);
}

.cal-cell.is-today {
  background: var(--tl-primary-light);
  border-color: var(--td-brand-color-4);
}

.cal-cell.is-selected {
  background: var(--tl-primary);
  border-color: var(--tl-primary);
}

.cal-cell.is-selected .cal-cell__day,
.cal-cell.is-selected .cal-cell__sub {
  color: #fff;
}

.cal-cell__day {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.2;
}

.cal-cell__sub {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--tl-text-3);
}

.cal-cell__sub.is-mark {
  color: var(--tl-primary);
}

.cal-cell__badge {
  position: absolute;
  top: 3px;
  right: 4px;
  padding: 0 3px;
  font-size: 10px;
  line-height: 14px;
  color: #fff;
  border-radius: 3px;
}

.cal-cell__badge.is-rest {
  background: var(--tl-primary);
}

.cal-cell__badge.is-work {
  background: var(--td-warning-color);
}

.cal-cell.is-selected .cal-cell__badge {
  color: var(--tl-primary);
  background: var(--tl-surface);
}

/* ---------- 当日详情 ---------- */
.day-card__date {
  display: flex;
  align-items: center;
  gap: 14px;
  color: var(--tl-text-2);
}

.day-card__num {
  font-size: 48px;
  font-weight: 700;
  line-height: 1;
  color: var(--tl-primary);
}

.day-card__lunar {
  margin-top: 4px;
  font-size: 16px;
  font-weight: 600;
  color: var(--tl-text-1);
}

.day-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 16px 0 4px;
}

.day-card__next {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 12px 14px;
  margin-top: 16px;
  font-size: 13px;
  color: var(--tl-text-2);
  background: var(--tl-surface-2);
  border-radius: 8px;
}

.day-card__next strong {
  font-size: 15px;
  color: var(--tl-text-1);
}

.day-card__next em {
  margin-left: auto;
  font-style: normal;
  color: var(--tl-primary);
}

/* ---------- 通用 ---------- */
.kv {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  row-gap: 10px;
  margin: 16px 0 0;
  font-size: 13px;
}

.kv dt {
  color: var(--tl-text-2);
}

.kv dt.is-yi {
  color: var(--tl-primary);
}

.kv dt.is-ji {
  color: var(--td-error-color);
}

.kv dd {
  margin: 0;
  color: var(--tl-text-1);
  word-break: break-all;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  font-size: 12px;
}

.inline-form {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.inline-form + .inline-form {
  margin-top: 12px;
}

.result-line {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 40px;
  margin: 0;
  font-size: 13px;
  color: var(--tl-text-2);
}

.result-line strong {
  font-size: 15px;
  color: var(--tl-text-1);
}

.note {
  margin: 14px 0 0;
  font-size: 12px;
  color: var(--tl-text-3);
}

.mono {
  font-family: 'SFMono-Regular', Menlo, Consolas, monospace;
}

.muted {
  font-size: 12px;
  color: var(--tl-text-3);
}

.ok {
  color: var(--tl-primary);
}

.warn {
  color: var(--td-error-color);
}

.yuan {
  color: var(--tl-text-3);
}

.money {
  padding: 14px;
  margin-top: 8px;
  background: var(--tl-surface-2);
  border-radius: 8px;
}

.money__cn {
  margin-bottom: 6px;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 1px;
  color: var(--tl-text-1);
}

.qrcode {
  display: flex;
  justify-content: center;
  padding: 8px 0 0;
}

.qrcode img {
  width: 160px;
  height: 160px;
  border: 1px solid var(--tl-line);
  border-radius: 8px;
}

.ua {
  padding: 10px 12px;
  margin: 14px 0 0;
  font-family: 'SFMono-Regular', Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.5;
  color: var(--tl-text-2);
  word-break: break-all;
  background: var(--tl-surface-2);
  border-radius: 6px;
}

@media (max-width: 1280px) {
  .toolbox__row,
  .toolbox__row--calendar {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
