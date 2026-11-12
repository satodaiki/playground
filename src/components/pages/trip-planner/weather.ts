export type WeatherDay = {
  date: string;
  weatherCode: number;
  maxTemp: number;
  minTemp: number;
  precipitationProbability: number;
};

export type WeatherSuggestion = { id: string; name: string; reason: string };

const CODE_LABELS: [limit: number, label: string][] = [
  [0, '晴れ'], [1, '晴れ'], [2, 'くもり'], [3, 'くもり'],
  [45, '霧'], [48, '霧'], [51, '小雨'], [53, '小雨'], [55, '小雨'],
  [56, '雨'], [57, '雨'], [61, '雨'], [63, '雨'], [65, '大雨'],
  [66, '雨'], [67, '雨'], [71, '雪'], [73, '雪'], [75, '大雪'],
  [77, '雪'], [80, 'にわか雨'], [81, 'にわか雨'], [82, '激しい雨'],
  [85, '雪'], [86, '雪'], [95, '雷雨'], [96, '雷雨'], [99, '雷雨'],
];

export function weatherLabel(code: number): string {
  return CODE_LABELS.find(([limit]) => code === limit)?.[1] ?? 'くもり';
}

export function isRainyCode(code: number): boolean {
  return [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code);
}

export function isSnowyCode(code: number): boolean {
  return [71, 73, 75, 77, 85, 86].includes(code);
}

type ForecastResponse = {
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
  };
};

/** Open-Meteo（キー不要）から日別予報を取得する。 */
export async function fetchWeather(
  lat: number,
  lng: number,
  startDate: string,
  days: number,
  fetcher: typeof fetch = fetch,
): Promise<WeatherDay[]> {
  const end = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(end.getTime())) throw new Error('invalid-date');
  end.setDate(end.getDate() + Math.max(1, days) - 1);
  const pad = (value: number) => String(value).padStart(2, '0');
  const endDate = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
  const params = new URLSearchParams({
    latitude: String(lat), longitude: String(lng),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto', start_date: startDate, end_date: endDate,
  });
  const response = await fetcher(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error('weather-fetch-failed');
  const body = await response.json() as ForecastResponse;
  const times = body.daily?.time ?? [];
  return times.map((date, index) => ({
    date,
    weatherCode: body.daily?.weather_code?.[index] ?? 3,
    maxTemp: body.daily?.temperature_2m_max?.[index] ?? 0,
    minTemp: body.daily?.temperature_2m_min?.[index] ?? 0,
    precipitationProbability: body.daily?.precipitation_probability_max?.[index] ?? 0,
  }));
}

/** 予報から持ち物の追加候補を作る。重複は呼び出し側で既存IDと合わせて避ける。 */
export function weatherSuggestions(days: WeatherDay[]): WeatherSuggestion[] {
  const suggestions = new Map<string, WeatherSuggestion>();
  const add = (id: string, name: string, reason: string) => {
    if (!suggestions.has(id)) suggestions.set(id, { id, name, reason });
  };
  for (const day of days) {
    const label = `${day.date.slice(5).replace('-', '/')}は${weatherLabel(day.weatherCode)}予報`;
    if (isRainyCode(day.weatherCode) || day.precipitationProbability >= 50) {
      add('rain', '折りたたみ傘・雨具', `${label}（降水確率${Math.round(day.precipitationProbability)}%）`);
      add('waterproof', '防水バッグ・濡れたものを入れる袋', `${label}のため`);
    } else if (day.precipitationProbability >= 30) {
      add('rain', '折りたたみ傘', `${label}（降水確率${Math.round(day.precipitationProbability)}%）`);
    }
    if (isSnowyCode(day.weatherCode) || day.minTemp <= 0) {
      add('warm', '防寒着・手袋', `${label}（最低${Math.round(day.minTemp)}℃）`);
      add('weather-shoes', '滑りにくい靴・替えの靴下', `${label}のため`);
    } else if (day.minTemp <= 8) {
      add('warm', '防寒着・手袋', `${label}（最低${Math.round(day.minTemp)}℃）`);
    }
    if (day.maxTemp >= 28) {
      add('sun', '帽子・日焼け止め', `${label}（最高${Math.round(day.maxTemp)}℃）`);
      add('water', '飲み物・水筒', `${label}の熱中症対策`);
    }
  }
  return [...suggestions.values()];
}

export function weatherSummaryLine(day: WeatherDay): string {
  return `${day.date.slice(5).replace('-', '/')} ${weatherLabel(day.weatherCode)} ${Math.round(day.minTemp)}〜${Math.round(day.maxTemp)}℃・降水確率${Math.round(day.precipitationProbability)}%`;
}
