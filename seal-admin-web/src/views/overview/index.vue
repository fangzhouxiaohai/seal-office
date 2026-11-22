<template>
  <div class="page-container">
    <header class="page-heading">
      <div>
        <h1>运行概览</h1>
        <p>服务运行与空间使用情况</p>
      </div>
      <div class="page-actions">
        <el-button :loading="busy" @click="refresh">刷新数据</el-button>
      </div>
    </header>

    <template v-if="counts">
      <!-- 指标卡片 -->
      <div class="stat-row">
        <el-card v-for="item in metrics" :key="item.label" shadow="never" class="stat-card">
          <div class="stat-inner">
            <span class="stat-icon" :class="`is-${item.tint}`">
              <el-icon :size="22"><component :is="item.icon" /></el-icon>
            </span>
            <div class="stat-meta">
              <span class="stat-label">{{ item.label }}</span>
              <strong class="stat-value">{{ item.value }}</strong>
              <span class="stat-hint">{{ item.hint }}</span>
            </div>
          </div>
        </el-card>
      </div>

      <div class="overview-grid">
        <el-card shadow="never">
          <template #header>
            <div class="panel-head">
              <span>云服务运行</span>
              <el-tag type="success" effect="light">已连接</el-tag>
            </div>
          </template>
          <dl class="detail-grid">
            <div>
              <dt>服务器剩余磁盘</dt>
              <dd>{{ data.runtime ? (data.runtime.diskFree / 1000000000).toFixed(2) + ' GB' : '暂无数据' }}</dd>
            </div>
            <div>
              <dt>进程内存</dt>
              <dd>{{ data.runtime ? sizeMB(data.runtime.memory) + ' MB' : '暂无数据' }}</dd>
            </div>
            <div v-if="data.quota != null">
              <dt>每账号实际配额</dt>
              <dd>{{ sizeMB(data.quota) }} MB</dd>
            </div>
            <div>
              <dt>待提交上传</dt>
              <dd>{{ data.runtime?.pendingUploads ?? '暂无数据' }}</dd>
            </div>
          </dl>
          <div class="privacy-note">
            <strong>客户端加密保护</strong>
            <p>私有文档保持客户端加密，管理后台不提供解密入口。</p>
          </div>
        </el-card>

        <el-card shadow="never">
          <template #header>
            <div class="panel-head">
              <span>短信服务</span>
              <el-tag :type="data.smsConfigured ? 'success' : 'warning'" effect="light">
                {{ data.smsConfigured ? '已配置' : '未配置' }}
              </el-tag>
            </div>
          </template>
          <dl class="service-list">
            <div>
              <dt>短信签名</dt>
              <dd>{{ data.sms?.sign || '未设置' }}</dd>
            </div>
            <div>
              <dt>验证码模板</dt>
              <dd>{{ data.sms?.template || '未设置' }}</dd>
            </div>
            <div>
              <dt>24 小时发送请求</dt>
              <dd>{{ data.sms?.lastDay ?? '暂无数据' }}</dd>
            </div>
          </dl>
        </el-card>
      </div>

      <el-card v-if="shortcuts.length" shadow="never">
        <template #header>
          <div class="panel-head">
            <span>常用功能 <small class="text-muted">快速访问业务管理</small></span>
          </div>
        </template>
        <div class="shortcut-grid">
          <router-link v-for="item in shortcuts" :key="item.key" :to="'/' + item.key" class="shortcut">
            <span class="shortcut-icon">
              <el-icon :size="18"><component :is="menuIcon(item.icon)" /></el-icon>
            </span>
            <span>{{ item.title }}</span>
          </router-link>
        </div>
      </el-card>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Folder, Stamp, Upload, User } from '@element-plus/icons-vue'
import { fetchOverview } from '@/api/admin'
import { runTask } from '@/utils/run'
import { sizeMB } from '@/utils/format'
import { menuIcon } from '@/utils/icons'
import { menuKey, useUserStore } from '@/stores/user'
import type { OverviewData } from '@/types'

const userStore = useUserStore()
const data = ref<OverviewData>({})
const busy = ref(false)

// 概览段落受 overview:read 权限控制，缺失时后端不会返回
const counts = computed(() => data.value.overviewCounts)

const metrics = computed(() => {
  const value = counts.value
  if (!value) return []
  return [
    { label: '账号总数', value: value.users, hint: '已注册的海豹办公账号', icon: User, tint: 'green' },
    { label: '实际文件占用', value: sizeMB(value.used) + ' MB', hint: '包含历史版本与回收站', icon: Folder, tint: 'blue' },
    { label: '等待审核', value: value.pending, hint: '演示模板、知识与皮肤', icon: Stamp, tint: 'orange' },
    { label: '待提交上传', value: data.value.runtime?.pendingUploads ?? '暂无数据', hint: '当前云服务上传任务', icon: Upload, tint: 'purple' }
  ]
})

// 快捷入口取会话菜单，排除概览自身
const shortcuts = computed(() =>
  userStore.menus
    .map((menu) => ({ key: menuKey(menu), title: menu.title, icon: menu.icon }))
    .filter((item) => item.key && item.key !== 'overview')
)

function refresh() {
  void runTask(busy, async () => {
    data.value = await fetchOverview()
    if (!data.value.overviewCounts) throw new Error('无权查看运行概览')
  })
}

onMounted(refresh)
</script>

<style scoped lang="scss">
.stat-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.stat-inner {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.stat-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 12px;

  &.is-green {
    color: #16a376;
    background: rgba(22, 163, 122, 0.12);
  }

  &.is-blue {
    color: #3b82f6;
    background: rgba(59, 130, 246, 0.12);
  }

  &.is-orange {
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.14);
  }

  &.is-purple {
    color: #6a5cf5;
    background: rgba(106, 92, 245, 0.14);
  }
}

.stat-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.stat-label {
  font-size: 13px;
  color: var(--text-2);
}

.stat-value {
  font-size: 24px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.stat-hint {
  font-size: 12px;
  color: var(--text-3);
}

.overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
  margin: 8px 0 20px;

  dt {
    font-size: 13px;
    color: var(--text-2);
  }

  dd {
    margin: 6px 0 0;
    font-size: 21px;
    font-weight: 600;
  }
}

.privacy-note {
  background: #f7f8fb;
  border-radius: 8px;
  padding: 14px;
  color: var(--text-2);

  strong {
    color: var(--brand);
  }

  p {
    margin: 4px 0 0;
    font-size: 13px;
  }
}

.service-list {
  margin: 0;

  div {
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
  }

  div:last-child {
    border: 0;
  }

  dt {
    font-size: 13px;
    color: var(--text-2);
  }

  dd {
    margin: 4px 0 0;
  }
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
  min-width: 0;
  padding: 14px 16px;
  color: var(--text-1);
  border: 1px solid var(--border);
  border-radius: 8px;
  transition: background 0.15s, border-color 0.15s;

  &:hover {
    background: #f8f7ff;
    border-color: #cfc7fb;
  }
}

.shortcut-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  color: var(--brand);
  background: var(--brand-soft);
  border-radius: 8px;
}

@media (max-width: 1200px) {
  .stat-row,
  .shortcut-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .overview-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 500px) {
  .stat-row,
  .shortcut-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
