<!--
  第三方插件配置:支付/微信/短信/存储。schema 驱动动态表单 + 依赖包状态 + 密钥脱敏保存。
  短信、存储同一时间只用一家服务商:选中哪家就只显示哪家的密钥项。
  Author: qiufeng
-->
<template>
  <t-card :bordered="false" :loading="loading">
    <t-alert
      theme="info"
      class="tip"
      message="配置各第三方能力的密钥与渠道。密钥保存后以脱敏(******)展示,留空或不改则不覆盖原值。"
    />

    <t-tabs v-model="activeGroup">
      <t-tab-panel v-for="g in groups" :key="g.group" :value="g.group" :label="GROUP_LABELS[g.group] ?? g.group">
        <div class="panel">
          <!-- 依赖包状态 -->
          <div class="packages">
            <span class="pkg-label">依赖包:</span>
            <t-tag
              v-for="pkg in g.packages"
              :key="pkg.key"
              :theme="pkg.installed ? 'success' : 'warning'"
              variant="light"
            >
              {{ pkg.title }} · {{ pkg.name }} · {{ pkg.installed ? '已安装' : '未安装' }}
            </t-tag>
          </div>

          <!-- schema 驱动表单 -->
          <t-form label-width="140px" class="config-form">
            <template v-for="f in visibleFields(g)" :key="f.field">
              <!-- 服务商选择:单选,按钮组展示中文名 -->
              <t-form-item v-if="isProviderField(g, f)" :label="f.label" help="只需配置一家,切换后显示对应的密钥项">
                <t-radio-group
                  variant="primary-filled"
                  :value="currentProvider(g)"
                  @change="(v: unknown) => setProvider(g, String(v))"
                >
                  <t-radio-button v-for="o in f.options ?? []" :key="o" :value="o">{{ optionLabel(g, o) }}</t-radio-button>
                </t-radio-group>
              </t-form-item>

              <t-form-item v-else :label="fieldText(g, f).label" :help="fieldText(g, f).hint">
                <t-textarea
                  v-if="f.type === 'textarea'"
                  v-model="forms[g.group][f.field]"
                  :placeholder="f.secret ? '不修改留空即可' : ''"
                  :autosize="{ minRows: 2, maxRows: 6 }"
                />
                <t-select v-else-if="f.type === 'select'" v-model="forms[g.group][f.field]" clearable style="width: 320px">
                  <t-option v-for="o in f.options ?? []" :key="o" :label="optionLabel(g, o)" :value="o" />
                </t-select>
                <t-checkbox-group v-else-if="f.type === 'checkbox'" v-model="forms[g.group][f.field]">
                  <t-checkbox v-for="o in f.options ?? []" :key="o" :value="o">{{ optionLabel(g, o) }}</t-checkbox>
                </t-checkbox-group>
                <t-switch v-else-if="f.type === 'switch'" v-model="forms[g.group][f.field]" />
                <t-input-number v-else-if="f.type === 'number'" v-model="forms[g.group][f.field]" :min="0" />
                <!-- 逗号分隔的列表(如允许的扩展名):按标签编辑,存回仍是逗号分隔字符串 -->
                <div v-else-if="isListField(f)" class="list-field">
                  <t-tag-input
                    :value="toList(forms[g.group][f.field])"
                    clearable
                    placeholder="输入后回车添加"
                    @change="(v: unknown) => setList(g, f, v as string[])"
                  />
                  <div v-if="f.field.endsWith('allowed_exts')" class="list-field__presets">
                    <span>快速添加:</span>
                    <t-link
                      v-for="p in EXT_PRESETS"
                      :key="p.label"
                      theme="primary"
                      hover="color"
                      @click="setList(g, f, [...toList(forms[g.group][f.field]), ...p.exts])"
                    >{{ p.label }}</t-link>
                  </div>
                </div>
                <t-input
                  v-else
                  v-model="forms[g.group][f.field]"
                  :type="f.type === 'password' ? 'password' : 'text'"
                  :placeholder="f.secret ? '不修改留空即可' : ''"
                  style="width: 320px"
                />
              </t-form-item>
            </template>

            <t-form-item>
              <t-button
                v-permission="'system:config:update'"
                theme="primary"
                :loading="saving === g.group"
                @click="save(g)"
              >保存{{ GROUP_LABELS[g.group] ?? '' }}配置</t-button>
            </t-form-item>
          </t-form>
        </div>
      </t-tab-panel>
    </t-tabs>
  </t-card>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { get } from 'lodash-es';
import {
  getIntegrations,
  saveIntegration,
  type IntegrationField,
  type IntegrationGroup,
} from '@/api/system/integration';

const GROUP_LABELS: Record<string, string> = {
  pay: '支付',
  wechat: '微信公众号',
  wechat_miniapp: '微信小程序',
  sms: '短信',
  storage: '存储',
};

/** 选项值 → 中文名(按能力组区分,同一个 aliyun 在短信/存储下叫法不同) */
const OPTION_LABELS: Record<string, Record<string, string>> = {
  pay: { wechat: '微信支付', alipay: '支付宝' },
  sms: { aliyun: '阿里云短信', qcloud: '腾讯云短信' },
  storage: { local: '本地磁盘', aliyun: '阿里云 OSS', cos: '腾讯云 COS', qiniu: '七牛云' },
};

/**
 * 单服务商能力组:selector 为选择服务商的字段,prefix 下一段是服务商标识。
 * 例如 storage 的 disks.aliyun.bucket 只在 default = aliyun 时显示。
 */
const PROVIDER_GROUPS: Record<string, { selector: string; prefix: string }> = {
  sms: { selector: 'default.gateways', prefix: 'gateways.' },
  storage: { selector: 'default', prefix: 'disks.' },
};

/** 标签里的服务商前缀,服务商已经选定,字段标签里不再重复 */
const PROVIDER_NAME_PREFIX = /^(阿里云|腾讯云|七牛)\s*/;

/** 扩展名快捷分组 */
const EXT_PRESETS = [
  { label: '图片', exts: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'] },
  { label: '音视频', exts: ['mp4', 'mov', 'mp3', 'wav'] },
  { label: '文档', exts: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'] },
  { label: '压缩包', exts: ['zip', 'rar', '7z'] },
];

/** 标签里写明"逗号分隔"的文本字段按列表编辑 */
function isListField(f: IntegrationField): boolean {
  return f.type === 'text' && /[(（]逗号分隔[)）]$/.test(f.label);
}

function toList(value: unknown): string[] {
  return String(value ?? '')
    .split(/[,，\s]+/)
    .filter(Boolean);
}

/** 写回逗号分隔字符串;粘贴一串也能拆开,统一小写、去掉前导点、去重 */
function setList(g: IntegrationGroup, f: IntegrationField, items: string[]): void {
  const cleaned = items
    .flatMap((item) => toList(item))
    .map((item) => (f.field.endsWith('allowed_exts') ? item.replace(/^\.+/, '').toLowerCase() : item));
  forms[g.group]![f.field] = [...new Set(cleaned)].join(',');
}

const loading = ref(false);
const saving = ref('');
const activeGroup = ref('pay');
const groups = ref<IntegrationGroup[]>([]);
/**
 * 每个能力组的扁平表单值:{ group: { field: value } }。
 * schema 驱动,值的类型随控件变化(文本/数字/开关/多选),这里不做静态约束。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const forms = reactive<Record<string, Record<string, any>>>({});

function optionLabel(g: IntegrationGroup, value: string): string {
  return OPTION_LABELS[g.group]?.[value] ?? value;
}

function isProviderField(g: IntegrationGroup, f: IntegrationField): boolean {
  return PROVIDER_GROUPS[g.group]?.selector === f.field;
}

/** 当前选中的服务商;短信后端存的是渠道数组,取第一个 */
function currentProvider(g: IntegrationGroup): string {
  const rule = PROVIDER_GROUPS[g.group];
  if (!rule) return '';
  const value = forms[g.group]?.[rule.selector];
  return String((Array.isArray(value) ? value[0] : value) ?? '');
}

function setProvider(g: IntegrationGroup, provider: string): void {
  const rule = PROVIDER_GROUPS[g.group]!;
  const field = g.schema.find((f) => f.field === rule.selector);
  // 保持后端原有的数据格式:checkbox 存数组,select 存字符串
  forms[g.group]![rule.selector] = field?.type === 'checkbox' ? [provider] : provider;
}

/** 字段所属服务商(不属于任何服务商的通用字段返回空) */
function providerOf(g: IntegrationGroup, f: IntegrationField): string {
  const rule = PROVIDER_GROUPS[g.group];
  if (!rule || !f.field.startsWith(rule.prefix)) return '';
  return f.field.slice(rule.prefix.length).split('.')[0] ?? '';
}

/** 单服务商能力组只显示通用字段 + 当前服务商的字段 */
function visibleFields(g: IntegrationGroup): IntegrationField[] {
  if (!PROVIDER_GROUPS[g.group]) return g.schema;
  const current = currentProvider(g);
  return g.schema.filter((f) => {
    const provider = providerOf(g, f);
    return provider === '' || provider === current;
  });
}

/** 长标签拆分:括号里的说明挪到输入框下方提示,避免标签被输入框遮住 */
function fieldText(g: IntegrationGroup, f: IntegrationField): { label: string; hint?: string } {
  const matched = f.label.match(/^(.*?)[(（](.+)[)）]$/);
  let label = matched ? matched[1]!.trim() : f.label;
  let hint = matched ? matched[2]!.trim() : undefined;
  if (isListField(f)) hint = '回车添加,可直接粘贴一串(逗号或空格分隔);点标签上的 × 删除';
  if (providerOf(g, f)) label = label.replace(PROVIDER_NAME_PREFIX, '') || label;
  return { label, hint };
}

/** 按 schema 从嵌套 config 取出每个字段的当前值 */
function buildForm(g: IntegrationGroup): Record<string, unknown> {
  const config = g.config ?? {};
  const form: Record<string, unknown> = {};
  for (const f of g.schema) {
    if (f.type === 'checkbox') {
      form[f.field] = get(config, f.field, []) ?? [];
    } else if (f.type === 'switch') {
      form[f.field] = !!get(config, f.field, false);
    } else {
      form[f.field] = get(config, f.field, '') ?? '';
    }
  }
  return form;
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const data = await getIntegrations();
    groups.value = data.list;
    for (const g of data.list) {
      forms[g.group] = buildForm(g);
    }
    if (data.list[0]) activeGroup.value = data.list[0].group;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function save(g: IntegrationGroup): Promise<void> {
  saving.value = g.group;
  try {
    const updated = await saveIntegration(g.group, forms[g.group]!);
    // 用返回的脱敏配置刷新本组,保持与后端一致
    const idx = groups.value.findIndex((x) => x.group === g.group);
    if (idx >= 0) groups.value[idx] = updated;
    forms[g.group] = buildForm(updated);
    MessagePlugin.success('保存成功');
  } finally {
    saving.value = '';
  }
}
</script>

<style scoped>
.tip {
  margin-bottom: 16px;
}

.panel {
  padding-top: 12px;
}

.packages {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 20px;
}

.pkg-label {
  color: var(--td-text-color-secondary);
}

.list-field {
  width: 100%;
  max-width: 560px;
}

.list-field__presets {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.config-form {
  max-width: 760px;
}
</style>
