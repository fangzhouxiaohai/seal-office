/**
 * 前端工具库单元测试:金额、日期、树结构、字符串。
 * Author: qiufeng
 */
import { describe, expect, it } from 'vitest';
import { fenToYuan, formatMoney, yuanToFen } from '@/utils/money';
import { formatDate, setGlobalDateFormat } from '@/utils/date';
import { listToTree, treeToList } from '@/utils/array';
import { mask, truncate } from '@/utils/string';

describe('money', () => {
  it('元转分四舍五入,不受浮点误差影响', () => {
    expect(yuanToFen('19.99')).toBe(1999);
    expect(yuanToFen(0.1 + 0.2)).toBe(30);
  });

  it('分转元与展示格式', () => {
    expect(fenToYuan(1234567)).toBe('12345.67');
    expect(formatMoney(1234567, { fromFen: true })).toBe('¥12,345.67');
    expect(formatMoney('abc')).toBe('¥0.00');
  });
});

describe('date', () => {
  it('秒级时间戳自动识别,与毫秒结果一致', () => {
    const seconds = 1790294400;
    expect(formatDate(seconds, 'YYYY-MM-DD')).toBe(formatDate(seconds * 1000, 'YYYY-MM-DD'));
  });

  it('空值和 0 显示占位符', () => {
    expect(formatDate(0)).toBe('-');
    expect(formatDate(null, undefined, '暂无')).toBe('暂无');
  });

  it('不传格式时用后台设置的全局格式', () => {
    setGlobalDateFormat('YYYY/MM/DD');
    expect(formatDate(new Date(2026, 8, 25))).toBe('2026/09/25');
    setGlobalDateFormat('YYYY-MM-DD HH:mm:ss');
  });
});

describe('array', () => {
  it('列表转树再转回,节点不丢', () => {
    type Dept = { id: number; parent_id: number; name: string; children?: Dept[] };
    const list: Dept[] = [
      { id: 1, parent_id: 0, name: '总公司' },
      { id: 2, parent_id: 1, name: '技术部' },
      { id: 3, parent_id: 2, name: '前端组' },
      { id: 4, parent_id: 1, name: '财务部' },
    ];
    const tree = listToTree(list);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.children).toHaveLength(2);
    expect(treeToList(tree).map((n) => n.id).sort()).toEqual([1, 2, 3, 4]);
  });
});

describe('string', () => {
  it('手机号脱敏', () => {
    expect(mask('13800138000')).toBe('138****8000');
  });

  it('超长截断', () => {
    expect(truncate('中后台管理框架', 4)).toBe('中后台管…');
  });
});
