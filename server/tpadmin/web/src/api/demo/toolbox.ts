/**
 * 演示中心 · 工具箱接口(内置 Tools 工具库在线试用)。
 * Author: qiufeng
 */
import http from '@/utils/request';

/** 万年历单日 */
export interface CalendarDay {
  date: string;
  week: string;
  lunar: {
    year: string;
    month: string;
    day: string;
    gan_zhi_year: string;
    gan_zhi_month: string;
    gan_zhi_day: string;
    sheng_xiao: string;
    jie_qi: string;
    festivals: string[];
    yi: string[];
    ji: string[];
  };
  festivals: string[];
  holiday: { name: string; target: string; is_rest: boolean } | null;
  is_workday: boolean;
  is_rest_day: boolean;
}

export interface CalendarMonth {
  month: string;
  today: CalendarDay;
  next_holiday: { name: string; date: string; target: string; days_until: number } | null;
  days: CalendarDay[];
}

export interface SensitiveMatch {
  word: string;
  text: string;
  category: string;
  category_label: string;
  offset: number;
}

export interface TextResult {
  text: string;
  pinyin: string;
  pinyin_plain: string;
  abbr: string;
  slug: string;
  traditional: string;
  sensitive: { hit: boolean; matches: SensitiveMatch[]; replaced: string };
}

export interface MoneyResult {
  amount: string;
  chinese: string;
  fen: number;
  formatted: string;
}

export interface RegionItem {
  code: string;
  name: string;
  level: number;
  leaf: boolean;
}

export interface RegionDetail {
  region: { code: string; name: string; level: number; parent_code: string };
  path: { code: string; name: string; level: number }[];
  full_name: string;
  postcode: { zip_code: string; area_code: string } | null;
}

export interface UserAgentResult {
  browser: string;
  browser_version: string;
  os: string;
  os_version: string;
  device_type: string;
  is_robot: boolean;
  user_agent: string;
}

export interface PhoneLocation {
  found: boolean;
  phone: string;
  province?: string;
  city?: string;
  operator?: string;
  area_code?: string;
  postcode?: string;
  message?: string;
}

export interface IpLocation {
  found: boolean;
  ip: string;
  country?: string;
  province?: string;
  city?: string;
  isp?: string;
  message?: string;
}

const BASE = '/adminapi/demo-toolbox';

export const getCalendar = (month: string) => http.get<CalendarMonth>(`${BASE}/calendar`, { month });

export const convertText = (text: string) => http.get<TextResult>(`${BASE}/text`, { text });

export const convertMoney = (amount: string) => http.get<MoneyResult>(`${BASE}/money`, { amount });

export const listRegions = (code = '') => http.get<RegionItem[]>(`${BASE}/regions`, { code });

export const getRegionDetail = (code: string) => http.get<RegionDetail>(`${BASE}/region-detail`, { code });

export const makeQrcode = (content: string) => http.get<{ content: string; image: string }>(`${BASE}/qrcode`, { content });

/** 页面初始示例:一次拿齐各卡片的示例结果(接口默认每秒限流 10 次,打开页面不宜并发太多请求) */
export interface ToolboxSamples {
  text: TextResult;
  money: MoneyResult;
  qrcode: { content: string; image: string };
  user_agent: UserAgentResult;
  region: { selected: string[]; levels: { items: RegionItem[] }[]; detail: RegionDetail };
}

export const getSamples = () => http.get<ToolboxSamples>(`${BASE}/samples`);

/** 归属地查询复用系统已有的工具接口 */
export const lookupPhone = (phone: string) => http.get<PhoneLocation>('/adminapi/tools/phone-location', { phone });

export const lookupIp = (ip: string) => http.get<IpLocation>('/adminapi/tools/ip-location', { ip });
