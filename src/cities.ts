/**
 * Built-in cities: a name in the plugin's five languages (Intl has names
 * for countries and languages, not for cities), the time zone, where it is,
 * and the usual working week there, so nobody has to type coordinates.
 */
import type { Localized } from '@kiosko/sdk';

/** Days off in a normal week. */
export type Weekend = 'sat-sun' | 'fri-sat' | 'thu-fri' | 'sun' | 'sat' | 'fri';
export const WEEKENDS: readonly Weekend[] = ['sat-sun', 'fri-sat', 'thu-fri', 'sun', 'sat', 'fri'];
/** The weekdays off, 0 = Sunday. */
export const WEEKEND_DAYS: Record<Weekend, number[]> = { 'sat-sun': [6, 0], 'fri-sat': [5, 6], 'thu-fri': [4, 5], sun: [0], sat: [6], fri: [5] };

export interface City {
  id: string;
  name: Localized;
  timeZone: string;
  lat: number;
  lon: number;
  weekend: Weekend;
}

type Row = [id: string, en: string, es: string, de: string, hans: string, hant: string, tz: string, lat: number, lon: number, weekend?: Weekend];

// Weekends: Friday–Saturday in most of the Gulf and the Arab world, Israel and
// Bangladesh; Thursday–Friday in Iran; Saturday only in Nepal; the UAE moved
// to Saturday–Sunday in 2022.
const ROWS: Row[] = [
  ['honolulu', 'Honolulu', 'Honolulu', 'Honolulu', '檀香山', '檀香山', 'Pacific/Honolulu', 21.31, -157.86],
  ['anchorage', 'Anchorage', 'Anchorage', 'Anchorage', '安克雷奇', '安克拉治', 'America/Anchorage', 61.22, -149.9],
  ['vancouver', 'Vancouver', 'Vancouver', 'Vancouver', '温哥华', '溫哥華', 'America/Vancouver', 49.28, -123.12],
  ['seattle', 'Seattle', 'Seattle', 'Seattle', '西雅图', '西雅圖', 'America/Los_Angeles', 47.61, -122.33],
  ['san-francisco', 'San Francisco', 'San Francisco', 'San Francisco', '旧金山', '舊金山', 'America/Los_Angeles', 37.77, -122.42],
  ['los-angeles', 'Los Angeles', 'Los Ángeles', 'Los Angeles', '洛杉矶', '洛杉磯', 'America/Los_Angeles', 34.05, -118.24],
  ['denver', 'Denver', 'Denver', 'Denver', '丹佛', '丹佛', 'America/Denver', 39.74, -104.99],
  ['mexico-city', 'Mexico City', 'Ciudad de México', 'Mexiko-Stadt', '墨西哥城', '墨西哥城', 'America/Mexico_City', 19.43, -99.13],
  ['austin', 'Austin', 'Austin', 'Austin', '奥斯汀', '奧斯汀', 'America/Chicago', 30.27, -97.74],
  ['chicago', 'Chicago', 'Chicago', 'Chicago', '芝加哥', '芝加哥', 'America/Chicago', 41.88, -87.63],
  ['toronto', 'Toronto', 'Toronto', 'Toronto', '多伦多', '多倫多', 'America/Toronto', 43.65, -79.38],
  ['new-york', 'New York', 'Nueva York', 'New York', '纽约', '紐約', 'America/New_York', 40.71, -74.01],
  ['miami', 'Miami', 'Miami', 'Miami', '迈阿密', '邁阿密', 'America/New_York', 25.76, -80.19],
  ['bogota', 'Bogotá', 'Bogotá', 'Bogotá', '波哥大', '波哥大', 'America/Bogota', 4.71, -74.07],
  ['lima', 'Lima', 'Lima', 'Lima', '利马', '利馬', 'America/Lima', -12.05, -77.04],
  ['santiago', 'Santiago', 'Santiago de Chile', 'Santiago de Chile', '圣地亚哥', '聖地牙哥', 'America/Santiago', -33.45, -70.67],
  ['buenos-aires', 'Buenos Aires', 'Buenos Aires', 'Buenos Aires', '布宜诺斯艾利斯', '布宜諾斯艾利斯', 'America/Argentina/Buenos_Aires', -34.6, -58.38],
  ['sao-paulo', 'São Paulo', 'São Paulo', 'São Paulo', '圣保罗', '聖保羅', 'America/Sao_Paulo', -23.55, -46.63],
  ['reykjavik', 'Reykjavík', 'Reikiavik', 'Reykjavík', '雷克雅未克', '雷克雅維克', 'Atlantic/Reykjavik', 64.15, -21.94],
  ['dublin', 'Dublin', 'Dublín', 'Dublin', '都柏林', '都柏林', 'Europe/Dublin', 53.35, -6.26],
  ['london', 'London', 'Londres', 'London', '伦敦', '倫敦', 'Europe/London', 51.51, -0.13],
  ['lisbon', 'Lisbon', 'Lisboa', 'Lissabon', '里斯本', '里斯本', 'Europe/Lisbon', 38.72, -9.14],
  ['madrid', 'Madrid', 'Madrid', 'Madrid', '马德里', '馬德里', 'Europe/Madrid', 40.42, -3.7],
  ['barcelona', 'Barcelona', 'Barcelona', 'Barcelona', '巴塞罗那', '巴塞隆納', 'Europe/Madrid', 41.39, 2.17],
  ['paris', 'Paris', 'París', 'Paris', '巴黎', '巴黎', 'Europe/Paris', 48.86, 2.35],
  ['amsterdam', 'Amsterdam', 'Ámsterdam', 'Amsterdam', '阿姆斯特丹', '阿姆斯特丹', 'Europe/Amsterdam', 52.37, 4.9],
  ['zurich', 'Zurich', 'Zúrich', 'Zürich', '苏黎世', '蘇黎世', 'Europe/Zurich', 47.37, 8.54],
  ['berlin', 'Berlin', 'Berlín', 'Berlin', '柏林', '柏林', 'Europe/Berlin', 52.52, 13.4],
  ['munich', 'Munich', 'Múnich', 'München', '慕尼黑', '慕尼黑', 'Europe/Berlin', 48.14, 11.58],
  ['vienna', 'Vienna', 'Viena', 'Wien', '维也纳', '維也納', 'Europe/Vienna', 48.21, 16.37],
  ['rome', 'Rome', 'Roma', 'Rom', '罗马', '羅馬', 'Europe/Rome', 41.9, 12.5],
  ['stockholm', 'Stockholm', 'Estocolmo', 'Stockholm', '斯德哥尔摩', '斯德哥爾摩', 'Europe/Stockholm', 59.33, 18.07],
  ['warsaw', 'Warsaw', 'Varsovia', 'Warschau', '华沙', '華沙', 'Europe/Warsaw', 52.23, 21.01],
  ['helsinki', 'Helsinki', 'Helsinki', 'Helsinki', '赫尔辛基', '赫爾辛基', 'Europe/Helsinki', 60.17, 24.94],
  ['athens', 'Athens', 'Atenas', 'Athen', '雅典', '雅典', 'Europe/Athens', 37.98, 23.73],
  ['kyiv', 'Kyiv', 'Kiev', 'Kyjiw', '基辅', '基輔', 'Europe/Kyiv', 50.45, 30.52],
  ['istanbul', 'Istanbul', 'Estambul', 'Istanbul', '伊斯坦布尔', '伊斯坦堡', 'Europe/Istanbul', 41.01, 28.98],
  ['moscow', 'Moscow', 'Moscú', 'Moskau', '莫斯科', '莫斯科', 'Europe/Moscow', 55.76, 37.62],
  ['cairo', 'Cairo', 'El Cairo', 'Kairo', '开罗', '開羅', 'Africa/Cairo', 30.04, 31.24, 'fri-sat'],
  ['lagos', 'Lagos', 'Lagos', 'Lagos', '拉各斯', '拉哥斯', 'Africa/Lagos', 6.52, 3.38],
  ['nairobi', 'Nairobi', 'Nairobi', 'Nairobi', '内罗毕', '奈洛比', 'Africa/Nairobi', -1.29, 36.82],
  ['johannesburg', 'Johannesburg', 'Johannesburgo', 'Johannesburg', '约翰内斯堡', '約翰尼斯堡', 'Africa/Johannesburg', -26.2, 28.05],
  ['tel-aviv', 'Tel Aviv', 'Tel Aviv', 'Tel Aviv', '特拉维夫', '特拉維夫', 'Asia/Jerusalem', 32.09, 34.78, 'fri-sat'],
  ['riyadh', 'Riyadh', 'Riad', 'Riad', '利雅得', '利雅德', 'Asia/Riyadh', 24.71, 46.68, 'fri-sat'],
  ['tehran', 'Tehran', 'Teherán', 'Teheran', '德黑兰', '德黑蘭', 'Asia/Tehran', 35.69, 51.39, 'thu-fri'],
  ['dubai', 'Dubai', 'Dubái', 'Dubai', '迪拜', '杜拜', 'Asia/Dubai', 25.2, 55.27],
  ['karachi', 'Karachi', 'Karachi', 'Karatschi', '卡拉奇', '喀拉蚩', 'Asia/Karachi', 24.86, 67.01],
  ['mumbai', 'Mumbai', 'Bombay', 'Mumbai', '孟买', '孟買', 'Asia/Kolkata', 19.08, 72.88],
  ['delhi', 'New Delhi', 'Nueva Delhi', 'Neu-Delhi', '新德里', '新德里', 'Asia/Kolkata', 28.61, 77.21],
  ['bengaluru', 'Bengaluru', 'Bangalore', 'Bengaluru', '班加罗尔', '班加羅爾', 'Asia/Kolkata', 12.97, 77.59],
  ['kathmandu', 'Kathmandu', 'Katmandú', 'Kathmandu', '加德满都', '加德滿都', 'Asia/Kathmandu', 27.72, 85.32, 'sat'],
  ['dhaka', 'Dhaka', 'Daca', 'Dhaka', '达卡', '達卡', 'Asia/Dhaka', 23.81, 90.41, 'fri-sat'],
  ['bangkok', 'Bangkok', 'Bangkok', 'Bangkok', '曼谷', '曼谷', 'Asia/Bangkok', 13.76, 100.5],
  ['jakarta', 'Jakarta', 'Yakarta', 'Jakarta', '雅加达', '雅加達', 'Asia/Jakarta', -6.21, 106.85],
  ['singapore', 'Singapore', 'Singapur', 'Singapur', '新加坡', '新加坡', 'Asia/Singapore', 1.35, 103.82],
  ['manila', 'Manila', 'Manila', 'Manila', '马尼拉', '馬尼拉', 'Asia/Manila', 14.6, 120.98],
  ['hong-kong', 'Hong Kong', 'Hong Kong', 'Hongkong', '香港', '香港', 'Asia/Hong_Kong', 22.32, 114.17],
  ['shenzhen', 'Shenzhen', 'Shenzhen', 'Shenzhen', '深圳', '深圳', 'Asia/Shanghai', 22.54, 114.06],
  ['shanghai', 'Shanghai', 'Shanghái', 'Shanghai', '上海', '上海', 'Asia/Shanghai', 31.23, 121.47],
  ['beijing', 'Beijing', 'Pekín', 'Peking', '北京', '北京', 'Asia/Shanghai', 39.9, 116.41],
  ['taipei', 'Taipei', 'Taipéi', 'Taipeh', '台北', '臺北', 'Asia/Taipei', 25.03, 121.57],
  ['seoul', 'Seoul', 'Seúl', 'Seoul', '首尔', '首爾', 'Asia/Seoul', 37.57, 126.98],
  ['tokyo', 'Tokyo', 'Tokio', 'Tokio', '东京', '東京', 'Asia/Tokyo', 35.68, 139.69],
  ['perth', 'Perth', 'Perth', 'Perth', '珀斯', '伯斯', 'Australia/Perth', -31.95, 115.86],
  ['adelaide', 'Adelaide', 'Adelaida', 'Adelaide', '阿德莱德', '阿得雷德', 'Australia/Adelaide', -34.93, 138.6],
  ['melbourne', 'Melbourne', 'Melbourne', 'Melbourne', '墨尔本', '墨爾本', 'Australia/Melbourne', -37.81, 144.96],
  ['sydney', 'Sydney', 'Sídney', 'Sydney', '悉尼', '雪梨', 'Australia/Sydney', -33.87, 151.21],
  ['auckland', 'Auckland', 'Auckland', 'Auckland', '奥克兰', '奧克蘭', 'Pacific/Auckland', -36.85, 174.76],
];

export const CITIES: City[] = ROWS.map(([id, en, es, de, hans, hant, timeZone, lat, lon, weekend]) => ({
  id,
  name: { en, es, de, 'zh-Hans': hans, 'zh-Hant': hant },
  timeZone,
  lat,
  lon,
  weekend: weekend ?? 'sat-sun',
}));

export const CITY_IDS = CITIES.map((c) => c.id);
const BY_ID = new Map(CITIES.map((c) => [c.id, c]));

export function cityById(id: string): City | undefined {
  return BY_ID.get(id);
}

/** The team shown before any is set: a city on each continent, around the clock. */
export const DEFAULT_TEAM = ['san-francisco', 'new-york', 'sao-paulo', 'london', 'berlin', 'dubai', 'mumbai', 'shanghai', 'tokyo', 'sydney'];
