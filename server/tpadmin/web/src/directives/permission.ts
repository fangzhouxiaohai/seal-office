/**
 * v-permission 按钮权限指令:无权限时直接移除元素。
 *
 * 用法:<t-button v-permission="'system:user:create'">新增</t-button>
 *       <t-button v-permission="['system:user:update', 'system:user:delete']">批量</t-button>(任一满足即可)
 * Author: qiufeng
 */
import type { Directive } from 'vue';
import { useUserStore } from '@/stores/user';

export const permission: Directive<HTMLElement, string | string[]> = {
  mounted(el, binding) {
    const userStore = useUserStore();
    const required = Array.isArray(binding.value) ? binding.value : [binding.value];
    const allowed = required.some((p) => userStore.hasPermission(p));
    if (!allowed) {
      el.parentNode?.removeChild(el);
    }
  },
};
