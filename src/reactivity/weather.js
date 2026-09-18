async function json(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Weather service returned ${response.status}`);
  return response.json();
}
export async function searchCities(name, signal) {
  const query = new URLSearchParams({ name, count: '5', language: 'en', format: 'json' });
  return (await json(`https://geocoding-api.open-meteo.com/v1/search?${query}`, signal)).results ?? [];
}
export async function loadWeather(city, signal) {
  const query = new URLSearchParams({ latitude: city.latitude, longitude: city.longitude, current: 'temperature_2m,cloud_cover,precipitation,weather_code', timezone: 'auto' });
  const data = await json(`https://api.open-meteo.com/v1/forecast?${query}`, signal);
  if (!Number.isFinite(data.current?.cloud_cover)) throw new Error('Weather service did not return current conditions');
  return { sampledAt: Date.now(), temperature: data.current.temperature_2m, cloudCover: data.current.cloud_cover, precipitation: data.current.precipitation, code: data.current.weather_code };
}
