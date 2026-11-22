<template>
  <el-container class="layout">
    <el-aside width="220px" class="aside">
      <div class="logo">
        <img :src="logoUrl" alt="海豹办公" class="logo-img" />
        <div class="logo-text">
          <strong>海豹办公</strong>
          <span>云端管理</span>
        </div>
      </div>
      <el-scrollbar class="menu-scroll">
        <el-menu
          :default-active="activeMenu"
          router
          background-color="#001529"
          text-color="#b7c0cd"
          active-text-color="#ffffff"
        >
          <el-menu-item v-for="menu in menus" :key="menuKey(menu)" :index="'/' + menuKey(menu)">
            <el-icon><component :is="menuIcon(menu.icon)" /></el-icon>
            <template #title>{{ menu.title }}</template>
          </el-menu-item>
        </el-menu>
      </el-scrollbar>
    </el-aside>

    <el-container class="right-wrap">
      <el-header class="header">
        <div class="header-left">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item v-if="route.meta.title">{{ route.meta.title }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>

        <div class="header-right">
          <el-dropdown trigger="click" @command="handleCommand">
            <span class="user-info">
              <el-avatar :size="28" class="avatar">{{ initials }}</el-avatar>
              <span class="username">{{ displayName }}</span>
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item disabled>
                  <span class="role-text">{{ roleText }}</span>
                </el-dropdown-item>
                <el-dropdown-item command="logout" divided>
                  <el-icon><SwitchButton /></el-icon> 退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="main">
        <router-view v-slot="{ Component, route: childRoute }">
          <transition name="fade" mode="out-in">
            <component :is="Component" :key="childRoute.fullPath" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { ArrowDown, SwitchButton } from '@element-plus/icons-vue'
import { menuKey, useUserStore } from '@/stores/user'
import { menuIcon } from '@/utils/icons'
import { clearDynamicRoutes } from '@/router'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

// Logo 位于 public 目录，按部署基础路径拼接
const logoUrl = import.meta.env.BASE_URL + 'seal-logo.png'

const menus = computed(() => userStore.menus)
const activeMenu = computed(() => route.path)
const displayName = computed(() => userStore.displayName)
const initials = computed(() => (displayName.value || 'U').charAt(0).toUpperCase())
const roleText = computed(() =>
  userStore.user?.is_super ? '超级管理员' : userStore.roles.map((role) => role.name).join('、') || '未分配角色'
)

function handleCommand(command: string) {
  if (command === 'logout') {
    doLogout()
  }
}

async function doLogout() {
  try {
    await ElMessageBox.confirm('确定退出登录吗？', '提示', { type: 'warning', confirmButtonText: '退出', cancelButtonText: '取消' })
  } catch {
    return
  }
  await userStore.logout()
  clearDynamicRoutes()
  router.push('/login')
}
</script>

<style scoped lang="scss">
.layout {
  height: 100%;
}

.aside {
  background-color: #001529;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.logo {
  height: 56px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.logo-img {
  width: 32px;
  height: 32px;
  border-radius: 8px;
}

.logo-text {
  display: flex;
  flex-direction: column;
  line-height: 1.3;

  strong {
    color: #fff;
    font-size: 15px;
    letter-spacing: 0.5px;
  }

  span {
    color: rgba(255, 255, 255, 0.45);
    font-size: 11px;
    letter-spacing: 1.5px;
  }
}

.menu-scroll {
  flex: 1;
}

:deep(.el-menu) {
  border-right: none;
}

:deep(.el-menu-item.is-active) {
  background-color: var(--brand) !important;
}

:deep(.el-menu-item:hover) {
  background-color: rgba(255, 255, 255, 0.08) !important;
}

.right-wrap {
  overflow: hidden;
}

.header {
  height: 56px;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
  z-index: 10;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  outline: none;
}

.avatar {
  background: var(--brand);
  color: #fff;
  font-size: 13px;
}

.username {
  font-size: 14px;
  color: #303133;
}

.role-text {
  color: var(--text-3);
  font-size: 12px;
}

.main {
  background: var(--bg-page);
  padding: 0;
  overflow-y: auto;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
