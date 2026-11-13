/**
 * 数组工具:树形转换、扁平化、分组、排序。
 * Author: qiufeng
 */

interface TreeOptions {
  id?: string;
  parentId?: string;
  children?: string;
  rootValue?: number | string | null;
}

/** 扁平列表转树:listToTree(rows, {id:'id', parentId:'parent_id'}) */
export function listToTree<T extends Record<string, any>>(list: T[], options: TreeOptions = {}): T[] {
  const { id = 'id', parentId = 'parent_id', children = 'children', rootValue = 0 } = options;
  const map = new Map<unknown, T & Record<string, any>>();
  const tree: T[] = [];
  for (const item of list) map.set(item[id], { ...item });
  for (const item of map.values()) {
    const parent = map.get(item[parentId]) as Record<string, any> | undefined;
    if (item[parentId] === rootValue || !parent) {
      tree.push(item);
    } else {
      (parent[children] = parent[children] ?? []).push(item);
    }
  }
  return tree;
}

/** 树扁平化(深度优先) */
export function treeToList<T extends Record<string, any>>(tree: T[], childrenKey = 'children'): T[] {
  const result: T[] = [];
  const walk = (nodes: T[]): void => {
    for (const node of nodes) {
      const { [childrenKey]: kids, ...rest } = node;
      result.push(rest as T);
      if (Array.isArray(kids) && kids.length) walk(kids as T[]);
    }
  };
  walk(tree);
  return result;
}

/** 按 key(或取值函数)分组 */
export function groupBy<T>(list: T[], key: keyof T | ((item: T) => string | number)): Record<string, T[]> {
  const getKey = typeof key === 'function' ? key : (item: T) => String(item[key]);
  return list.reduce<Record<string, T[]>>((acc, item) => {
    const k = String(getKey(item));
    (acc[k] = acc[k] ?? []).push(item);
    return acc;
  }, {});
}

/** 多字段排序:sortBy(rows, ['sort', '-create_time']),'-' 前缀降序 */
export function sortBy<T extends Record<string, any>>(list: T[], fields: string[]): T[] {
  return [...list].sort((a, b) => {
    for (const field of fields) {
      const desc = field.startsWith('-');
      const key = desc ? field.slice(1) : field;
      const cmp = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
      if (cmp !== 0) return desc ? -cmp : cmp;
    }
    return 0;
  });
}

/** 去重(可按 key) */
export function unique<T>(list: T[], key?: keyof T): T[] {
  if (!key) return [...new Set(list)];
  const seen = new Set<unknown>();
  return list.filter((item) => (seen.has(item[key]) ? false : (seen.add(item[key]), true)));
}
