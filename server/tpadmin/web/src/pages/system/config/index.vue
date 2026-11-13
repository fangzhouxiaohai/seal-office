<!--
  系统配置:API 响应格式 / 接口限流 / 动态验证码全局开关 / IP 归属地屏蔽。
  Author: qiufeng
-->
<template>
  <div class="config-page">
    <t-card title="API 响应格式" :bordered="false">
      <t-form label-width="140px">
        <t-form-item label="默认响应格式" help="外部调用方可用 format=json|xml 参数覆盖">
          <t-radio-group v-model="responseFormat">
            <t-radio-button value="json">JSON</t-radio-button>
            <t-radio-button value="xml">XML</t-radio-button>
          </t-radio-group>
        </t-form-item>
        <t-form-item>
          <t-button v-permission="'system:config:update'" theme="primary" :loading="saving === 'format'" @click="onSaveFormat">保存</t-button>
        </t-form-item>
      </t-form>
    </t-card>

    <t-card title="时间显示格式" :bordered="false">
      <t-form label-width="140px">
        <t-form-item label="全局时间格式" help="后台所有时间一律按此格式展示,不受数据库存储格式影响(dayjs 格式串)">
          <t-select v-model="datetimeFormat" creatable filterable style="width: 280px">
            <t-option v-for="p in datetimePresets" :key="p" :label="p" :value="p" />
          </t-select>
        </t-form-item>
        <t-form-item label="效果预览">
          <span class="dt-preview">{{ datetimePreview }}</span>
        </t-form-item>
        <t-form-item>
          <t-button v-permission="'system:config:update'" theme="primary" :loading="saving === 'datetime'" @click="onSaveDatetime">保存</t-button>
        </t-form-item>
      </t-form>
    </t-card>

    <t-card title="接口限流" :bordered="false">
      <t-form label-width="140px">
        <t-form-item label="每秒请求上限" help="按登录用户/IP 每秒计数,0 表示不限流。默认 30;打开一个页面会并发好几个请求,不宜设太低">
          <t-input-number v-model="rateLimit" :min="0" :max="1000" />
        </t-form-item>
        <t-form-item>
          <t-button v-permission="'system:config:update'" theme="primary" :loading="saving === 'rate'" @click="onSaveRate">保存</t-button>
        </t-form-item>
      </t-form>
    </t-card>

    <t-card title="动态验证码(Google Authenticator)" :bordered="false">
      <t-form label-width="140px">
        <t-form-item label="全局开关" help="开启后,已绑定动态码的账号登录时必须输入 6 位动态码">
          <t-switch v-model="totp.enabled" />
        </t-form-item>
        <t-form-item label="签发者名称" help="验证器 App 中显示的名称">
          <t-input v-model="totp.issuer" style="width: 240px" />
        </t-form-item>
        <t-form-item>
          <t-button v-permission="'system:config:update'" theme="primary" :loading="saving === 'totp'" @click="onSaveTotp">保存</t-button>
        </t-form-item>
      </t-form>
    </t-card>

    <t-card title="接口文档调试台" :bordered="false">
      <t-form label-width="140px">
        <t-form-item label="访问保护" help="开启后访问接口文档(/api-docs.html、openapi.json)需输入账号密码;另外文档仅在 APP_DEBUG=true 时开放">
          <t-switch v-model="apiDocs.enabled" />
        </t-form-item>
        <template v-if="apiDocs.enabled">
          <t-form-item label="访问账号">
            <t-input v-model="apiDocs.username" style="width: 240px" />
          </t-form-item>
          <t-form-item label="访问密码" :help="apiDocs.has_password ? '已设置密码,留空表示沿用原密码' : '请设置访问密码'">
            <t-input v-model="apiDocs.password" type="password" clearable :placeholder="apiDocs.has_password ? '不修改请留空' : '请输入密码'" style="width: 240px" />
          </t-form-item>
        </template>
        <t-form-item>
          <t-button v-permission="'system:config:update'" theme="primary" :loading="saving === 'apiDocs'" @click="onSaveApiDocs">保存</t-button>
        </t-form-item>
      </t-form>
    </t-card>

    <t-card title="IP 归属地屏蔽" :bordered="false">
      <t-form label-width="140px">
        <t-form-item label="启用屏蔽">
          <t-switch v-model="ipBlock.enabled" />
        </t-form-item>
        <t-form-item label="模式">
          <t-radio-group v-model="ipBlock.mode">
            <t-radio-button value="blacklist">黑名单(命中规则拒绝)</t-radio-button>
            <t-radio-button value="whitelist">白名单(命中规则放行)</t-radio-button>
          </t-radio-group>
        </t-form-item>
        <t-form-item label="信任代理头" help="部署在反向代理后开启,取 X-Forwarded-For 作为客户端 IP">
          <t-switch v-model="ipBlock.trust_proxy_headers" />
        </t-form-item>
        <t-form-item label="规则" help="归属地从本地 IP 库可识别的范围中选择(可只选到国家或省);IP/网段为可选的精确匹配">
          <div class="rules-box">
            <div v-for="(rule, i) in ipBlock.rules" :key="i" class="rule-row">
              <t-cascader
                :options="regionOptions"
                :value="regionPath(rule)"
                :keys="{ label: 'label', value: 'value', children: 'children' }"
                check-strictly
                value-type="full"
                clearable
                placeholder="选择归属地(国家/省/市)"
                style="width: 280px"
                @change="(val: unknown) => applyRegion(rule, val as string[])"
              />
              <t-input v-model="rule.ip" placeholder="IP / 网段(可选,精确匹配)" style="width: 220px" />
              <t-button variant="text" theme="danger" @click="ipBlock.rules.splice(i, 1)">删除</t-button>
            </div>
            <t-button variant="dashed" @click="ipBlock.rules.push({ country: '', province: '', city: '', ip: '' })">
              <template #icon><add-icon /></template>添加规则
            </t-button>
          </div>
        </t-form-item>
        <t-form-item>
          <t-button v-permission="'system:config:update'" theme="primary" :loading="saving === 'ip'" @click="onSaveIpBlock">保存</t-button>
        </t-form-item>
      </t-form>
    </t-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { AddIcon } from 'tdesign-icons-vue-next';
import { computed } from 'vue';
import { formatDate, setGlobalDateFormat } from '@/utils/date';
import {
  getResponseFormat, saveResponseFormat, getRateLimit, saveRateLimit,
  getTotpConfig, saveTotpConfig, getIpBlockConfig, saveIpBlockConfig, getIpRegions,
  getDatetimeFormat, saveDatetimeFormat, getApiDocsAuth, saveApiDocsAuth,
  type IpBlockConfig, type IpBlockRule, type TotpConfig, type RegionOption,
} from '@/api/system/config';

const saving = ref('');

const responseFormat = ref<'json' | 'xml'>('json');
const rateLimit = ref(10);
const datetimeFormat = ref('YYYY-MM-DD HH:mm:ss');
const datetimePresets = ref<string[]>([]);
const datetimePreview = computed(() => formatDate(Math.floor(Date.now() / 1000), datetimeFormat.value));
const totp = reactive<TotpConfig>({ enabled: false, issuer: 'TLAdmin' });
const apiDocs = reactive({ enabled: false, username: 'admin', password: '', has_password: false });
const ipBlock = reactive<IpBlockConfig>({
  enabled: false, mode: 'blacklist', trust_proxy_headers: false, excluded_paths: [], rules: [],
});
const regionOptions = ref<RegionOption[]>([]);

onMounted(async () => {
  const [format, rate, totpCfg, ipCfg, regions, dtFormat, docsCfg] = await Promise.all([
    getResponseFormat(), getRateLimit(), getTotpConfig(), getIpBlockConfig(),
    getIpRegions().catch(() => []), getDatetimeFormat(), getApiDocsAuth(),
  ]);
  responseFormat.value = format.value;
  rateLimit.value = rate.per_second;
  Object.assign(totp, totpCfg);
  Object.assign(ipBlock, ipCfg);
  regionOptions.value = regions;
  datetimeFormat.value = dtFormat.value;
  datetimePresets.value = dtFormat.presets;
  Object.assign(apiDocs, docsCfg, { password: '' });
});

/** 规则的归属地 → 级联路径(过滤空层级) */
function regionPath(rule: IpBlockRule): string[] {
  return [rule.country, rule.province, rule.city].filter((v): v is string => !!v);
}

/** 级联选中路径 → 回写规则的 country/province/city */
function applyRegion(rule: IpBlockRule, path: string[]): void {
  rule.country = path[0] ?? '';
  rule.province = path[1] ?? '';
  rule.city = path[2] ?? '';
}

async function withSaving(key: string, fn: () => Promise<unknown>): Promise<void> {
  saving.value = key;
  try {
    await fn();
    MessagePlugin.success('保存成功');
  } finally {
    saving.value = '';
  }
}

const onSaveFormat = () => withSaving('format', () => saveResponseFormat(responseFormat.value));
const onSaveDatetime = () => withSaving('datetime', async () => {
  await saveDatetimeFormat(datetimeFormat.value);
  // 立即应用到当前会话,无需刷新即可看到全站时间格式变化
  setGlobalDateFormat(datetimeFormat.value);
});
const onSaveRate = () => withSaving('rate', () => saveRateLimit(rateLimit.value));
const onSaveTotp = () => withSaving('totp', () => saveTotpConfig({ ...totp }));
const onSaveApiDocs = () => withSaving('apiDocs', async () => {
  await saveApiDocsAuth({ enabled: apiDocs.enabled, username: apiDocs.username, password: apiDocs.password });
  // 已设置密码后清空输入框,再次保存留空即沿用原密码
  if (apiDocs.password !== '') {
    apiDocs.has_password = true;
    apiDocs.password = '';
  }
});
const onSaveIpBlock = () => withSaving('ip', () => saveIpBlockConfig({ ...ipBlock, rules: ipBlock.rules.filter((r) => r.country || r.province || r.city || r.ip) }));
</script>

<style scoped>
.config-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.rules-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.rule-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.dt-preview {
  font-family: monospace;
  font-size: 15px;
  color: var(--td-brand-color);
}
</style>
