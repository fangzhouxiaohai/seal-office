<!--
  仪表盘:登录后首页。系统统计、操作趋势、最近登录按当前账号的权限显示;
  一项系统统计都看不到时,统计卡片退回显示当前账号概览。
  Author: qiufeng
-->
<template>
  <div class="dashboard">
    <div class="dashboard__head">
      <div>
        <h2>{{ greeting }},{{ userStore.user?.nickname || userStore.user?.username }}</h2>
        <p>{{ today }}</p>
      </div>
    </div>

    <div class="stat-row">
      <div v-for="s in stats" :key="s.key" class="stat-card">
        <span class="stat-card__icon" :class="`is-${s.tint}`"><component :is="s.icon" size="22px" /></span>
        <div class="stat-card__meta">
          <span class="stat-card__label">{{ s.label }}</span>
          <span class="stat-card__value" :class="{ 'is-text': s.text }">{{ s.value }}</span>
          <span v-if="s.hint" class="stat-card__hint">{{ s.hint }}</span>
        </div>
      </div>
    </div>

    <div v-if="overview?.operation_trend || overview?.recent_logins" class="dashboard__grid">
      <div v-if="overview.operation_trend" class="panel">
        <div class="panel__header">
          <span class="panel__title">近 7 天操作量<small>共 {{ trendTotal }} 次,来自操作日志</small></span>
        </div>
        <div class="trend" role="img" :aria-label="trendAria">
          <div class="trend__plot">
            <div
              v-for="(p, i) in overview.operation_trend"
              :key="p.date"
              class="trend__col"
              @mouseenter="hoverIndex = i"
              @mouseleave="hoverIndex = -1"
            >
              <span v-if="hoverIndex === i" class="trend__tip">{{ p.date }} · {{ p.count }} 次</span>
              <span v-else-if="i === overview.operation_trend.length - 1" class="trend__label">{{ p.count }}</span>
              <span class="trend__bar" :class="{ 'is-hover': hoverIndex === i }" :style="{ height: barHeight(p.count) }" />
            </div>
          </div>
          <div class="trend__axis">
            <span v-for="(p, i) in overview.operation_trend" :key="p.date">
              {{ i === overview.operation_trend.length - 1 ? '今天' : p.date }}
            </span>
          </div>
        </div>
      </div>

      <div v-if="overview.recent_logins" class="panel">
        <div class="panel__header">
          <span class="panel__title">最近登录</span>
          <t-link theme="primary" hover="color" @click="router.push('/system/log/login')">登录日志</t-link>
        </div>
        <ul v-if="overview.recent_logins.length" class="logins">
          <li v-for="(l, i) in overview.recent_logins" :key="i">
            <span class="logins__dot" :class="l.status === 1 ? 'is-ok' : 'is-fail'" />
            <div class="logins__main">
              <div>{{ l.username }} <em>{{ l.status === 1 ? '登录成功' : '登录失败' }}</em></div>
              <small>{{ l.ip }}{{ l.location ? ` · ${l.location}` : '' }}</small>
            </div>
            <span class="logins__time">{{ formatDate(l.create_time, 'MM-DD HH:mm') }}</span>
          </li>
        </ul>
        <p v-else class="empty-tip">暂无登录记录</p>
      </div>
    </div>

    <div class="dashboard__grid">
      <div class="panel">
        <div class="panel__header">
          <span class="panel__title">常用功能<small>来自当前账号可见菜单</small></span>
        </div>
        <div v-if="shortcuts.length" class="shortcut-grid">
          <router-link v-for="m in shortcuts" :key="m.id" :to="m.path" class="shortcut">
            <span class="shortcut__icon"><icon :name="m.icon || 'app'" size="20px" /></span>
            <span class="shortcut__label">{{ m.title }}</span>
          </router-link>
        </div>
        <p v-else class="empty-tip">当前账号还没有可见菜单</p>
      </div>

      <div class="panel">
        <div class="panel__header">
          <span class="panel__title">账号信息</span>
          <t-link theme="primary" hover="color" @click="router.push('/profile')">个人中心</t-link>
        </div>
        <div class="account">
          <t-avatar size="48px" :image="userStore.user?.avatar || undefined">{{ avatarText }}</t-avatar>
          <div>
            <div class="account__name">{{ userStore.user?.nickname || userStore.user?.username }}</div>
            <div class="account__sub">账号:{{ userStore.user?.username }}</div>
          </div>
        </div>
        <dl class="account__list">
          <dt>角色</dt>
          <dd>
            <t-space size="6px" break-line>
              <t-tag v-if="userStore.user?.is_super === 1" theme="danger" variant="light" size="small">超管</t-tag>
              <t-tag v-for="role in userStore.roles" :key="role.id" theme="primary" variant="light" size="small">
                {{ role.name }}
              </t-tag>
              <span v-if="!userStore.roles.length && userStore.user?.is_super !== 1">-</span>
            </t-space>
          </dd>
          <dt>上次登录</dt>
          <dd>{{ formatDate(userStore.user?.last_login_time) }}</dd>
          <dt>登录 IP</dt>
          <dd>{{ userStore.user?.last_login_ip || '-' }}</dd>
        </dl>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, type Component } from 'vue';
import { useRouter } from 'vue-router';
import {
  Icon,
  UserSafetyIcon,
  KeyIcon,
  ViewModuleIcon,
  TimeIcon,
  UserCircleIcon,
  UsergroupIcon,
  LoginIcon,
} from 'tdesign-icons-vue-next';
import { getDashboardOverview, type DashboardOverview } from '@/api/dashboard';
import dayjs from 'dayjs';
import { useUserStore } from '@/stores/user';
import { formatDate } from '@/utils/date';
import { treeToList } from '@/utils/array';

const router = useRouter();
const userStore = useUserStore();

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const today = computed(() => {
  const now = dayjs();
  return `${now.format('YYYY年M月D日')} 星期${WEEKDAYS[now.day()]}`;
});

const avatarText = computed(() => (userStore.user?.nickname || userStore.user?.username || '?').slice(0, 1));

const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
});

const menuItems = computed(() =>
  treeToList(userStore.menus).filter((m) => m.type === 'menu' && m.visible === 1 && m.path),
);

/** 统计卡片(系统统计与账号概览共用) */
interface StatCard {
  key: string;
  label: string;
  value: string | number;
  hint?: string;
  icon: Component;
  tint: string;
  text: boolean;
}

// ---------- 系统统计(按权限返回) ----------
const overview = ref<DashboardOverview>();

/** 系统统计卡片的图标与配色 */
const STAT_STYLES: Record<string, { icon: Component; tint: string }> = {
  admins: { icon: UserCircleIcon, tint: 'green' },
  roles: { icon: UserSafetyIcon, tint: 'blue' },
  members: { icon: UsergroupIcon, tint: 'orange' },
  logins: { icon: LoginIcon, tint: 'purple' },
};

const trendTotal = computed(() => (overview.value?.operation_trend ?? []).reduce((sum, p) => sum + p.count, 0));
const trendMax = computed(() => Math.max(1, ...(overview.value?.operation_trend ?? []).map((p) => p.count)));
const trendAria = computed(
  () => `近 7 天操作量:${(overview.value?.operation_trend ?? []).map((p) => `${p.date} ${p.count} 次`).join(',')}`,
);
const hoverIndex = ref(-1);

/** 柱高按最大值等比;有数据的柱子至少 4px,保证看得见 */
function barHeight(count: number): string {
  if (count === 0) return '0px';
  return `max(4px, ${(count / trendMax.value) * 100}%)`;
}

onMounted(async () => {
  try {
    overview.value = await getDashboardOverview();
  } catch {
    /* 统计拉取失败(request.ts 已提示)时仍显示账号概览 */
  }
});

/** 账号概览卡片:看不到任何系统统计时使用 */
const accountStats = computed<StatCard[]>(() => [
  {
    key: 'roles',
    label: '所属角色',
    value: userStore.user?.is_super === 1 ? '超管' : userStore.roles.length,
    icon: UserSafetyIcon,
    tint: 'green',
    text: userStore.user?.is_super === 1,
  },
  {
    key: 'perms',
    label: '权限点',
    value: userStore.isSuper ? '全部' : userStore.permissions.length,
    icon: KeyIcon,
    tint: 'blue',
    text: userStore.isSuper,
  },
  { key: 'menus', label: '可见菜单', value: menuItems.value.length, icon: ViewModuleIcon, tint: 'orange', text: false },
  {
    key: 'login',
    label: '上次登录',
    value: formatDate(userStore.user?.last_login_time, 'MM-DD HH:mm'),
    icon: TimeIcon,
    tint: 'purple',
    text: true,
  },
]);

const stats = computed<StatCard[]>(() => {
  const system = overview.value?.stats ?? [];
  if (!system.length) return accountStats.value;
  return system.map((s) => ({
    key: s.key,
    label: s.label,
    value: s.value,
    hint: s.hint,
    icon: STAT_STYLES[s.key]?.icon ?? ViewModuleIcon,
    tint: STAT_STYLES[s.key]?.tint ?? 'green',
    text: false,
  }));
});

/** 常用功能:取可见菜单(排除首页本身)前 8 个 */
const shortcuts = computed(() => menuItems.value.filter((m) => m.path !== '/' && m.path !== '/dashboard').slice(0, 8));
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dashboard__head h2 {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 600;
  color: var(--tl-text-1);
}

.dashboard__head p {
  margin: 0;
  font-size: 12px;
  color: var(--tl-text-3);
}

/* ---------- 统计卡片 ---------- */
.stat-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px;
  background: var(--tl-surface);
  border-radius: 8px;
  box-shadow: var(--tl-shadow);
}

.stat-card__icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 12px;
}

.stat-card__icon.is-green {
  color: var(--tl-primary);
  background: rgba(22, 163, 122, 0.12);
}

.stat-card__icon.is-blue {
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.12);
}

.stat-card__icon.is-orange {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.14);
}

.stat-card__icon.is-purple {
  color: #8b5cf6;
  background: rgba(139, 92, 246, 0.14);
}

.stat-card__meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.stat-card__label {
  font-size: 13px;
  color: var(--tl-text-2);
}

.stat-card__value {
  margin-top: 2px;
  font-size: 26px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--tl-text-1);
}

.stat-card__value.is-text {
  font-size: 20px;
}

.stat-card__hint {
  margin-top: 2px;
  font-size: 12px;
  color: var(--tl-text-3);
}

/* ---------- 近 7 天操作量(单序列柱状图,品牌绿) ---------- */
.trend__plot {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  height: 240px;
  padding-top: 24px;
  border-bottom: 1px solid var(--tl-line);
}

.trend__col {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  cursor: default;
}

.trend__bar {
  width: 60%;
  max-width: 36px;
  background: var(--tl-primary);
  border-radius: 4px 4px 0 0;
  transition: background 0.15s;
}

.trend__bar.is-hover {
  background: var(--tl-primary-dark);
}

.trend__label,
.trend__tip {
  margin-bottom: 4px;
  font-size: 12px;
  white-space: nowrap;
  color: var(--tl-text-2);
}

.trend__tip {
  padding: 2px 8px;
  color: var(--tl-surface);
  background: var(--tl-text-1);
  border-radius: 4px;
}

.trend__axis {
  display: flex;
  gap: 12px;
  margin-top: 6px;
}

.trend__axis span {
  flex: 1;
  font-size: 12px;
  text-align: center;
  color: var(--tl-text-3);
}

/* ---------- 最近登录 ---------- */
.logins {
  padding: 0;
  margin: 0;
  list-style: none;
}

.logins li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid var(--tl-line);
}

.logins li:last-child {
  border-bottom: none;
}

.logins__dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.logins__dot.is-ok {
  background: var(--tl-primary);
}

.logins__dot.is-fail {
  background: var(--td-error-color);
}

.logins__main {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--tl-text-1);
}

.logins__main em {
  margin-left: 6px;
  font-size: 12px;
  font-style: normal;
  color: var(--tl-text-3);
}

.logins__main small {
  display: block;
  font-size: 12px;
  color: var(--tl-text-3);
}

.logins__time {
  flex: 0 0 auto;
  font-size: 12px;
  color: var(--tl-text-3);
}

/* ---------- 常用功能 + 账号信息 ---------- */
.dashboard__grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 16px;
}

.shortcut-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.shortcut {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  color: var(--tl-text-1);
  border: 1px solid var(--tl-line);
  border-radius: 8px;
  transition: border-color 0.15s, background 0.15s;
}

.shortcut:hover {
  background: var(--tl-hover);
  border-color: var(--td-brand-color-3);
}

.shortcut__icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  color: var(--tl-primary);
  background: var(--tl-primary-light);
  border-radius: 8px;
}

.shortcut__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-tip {
  margin: 24px 0;
  text-align: center;
  color: var(--tl-text-3);
}

.account {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--tl-line);
}

.account :deep(.t-avatar) {
  font-weight: 600;
  color: #fff;
  background: var(--tl-primary);
}

.account__name {
  font-size: 16px;
  font-weight: 600;
  color: var(--tl-text-1);
}

.account__sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--tl-text-3);
}

.account__list {
  display: grid;
  grid-template-columns: 72px 1fr;
  row-gap: 12px;
  margin: 16px 0 0;
  font-size: 13px;
}

.account__list dt {
  color: var(--tl-text-2);
}

.account__list dd {
  margin: 0;
  color: var(--tl-text-1);
}

@media (max-width: 1200px) {
  .stat-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dashboard__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .shortcut-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
