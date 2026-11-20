const express = require('express');
const router = express.Router();

function getWeatherCondition(code) {
  const conditions = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    71: 'Slight snow',
    73: 'Moderate snow',
    75: 'Heavy snow',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail',
  };
  return conditions[code] || 'Unknown';
}

function generateWeatherAlerts({ temperature, humidity, rainProbability }) {
  const alerts = [];

  if (temperature >= 38) {
    alerts.push(
      `High temperature (${temperature}°C): General weather warning for extreme heat (not a crop-specific prediction).`
    );
  }
  if (rainProbability >= 70) {
    alerts.push(
      `High rain probability (${rainProbability}%): General weather warning for likely rainfall (not a crop-specific prediction).`
    );
  }
  if (humidity >= 80) {
    alerts.push(
      `High humidity (${humidity}%): General weather warning for very humid conditions (not a crop-specific prediction).`
    );
  }

  return alerts;
}

router.get('/', async (req, res) => {
  const city = req.query.city?.trim();

  if (!city) {
    return res.status(400).json({
      error: 'Missing required query parameter: city (e.g., /api/weather?city=Patna)',
    });
  }

  try {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      city
    )}&count=1&language=en&format=json`;

    const geoRes = await fetch(geoUrl);
    if (!geoRes.ok) {
      return res.status(502).json({ error: 'Geocoding API failed.' });
    }

    const geoData = await geoRes.json();
    if (!geoData.results || geoData.results.length === 0) {
      return res.status(404).json({ error: `City "${city}" not found.` });
    }

    const { latitude, longitude, name } = geoData.results[0];

    const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&daily=precipitation_probability_max&timezone=auto&forecast_days=1`;

    const forecastRes = await fetch(forecastUrl);
    if (!forecastRes.ok) {
      return res.status(502).json({ error: 'Weather Forecast API failed.' });
    }

    const forecastData = await forecastRes.json();
    const current = forecastData.current;
    const daily = forecastData.daily;

    if (!current || !daily) {
      return res.status(502).json({ error: 'Incomplete weather data received.' });
    }

    const temperature = Math.round(current.temperature_2m);
    const humidity = Math.round(current.relative_humidity_2m);
    const windSpeed = Math.round(current.wind_speed_10m);
    const rainProbability = daily.precipitation_probability_max?.[0] ?? 0;
    const condition = getWeatherCondition(current.weather_code);
    const alerts = generateWeatherAlerts({ temperature, humidity, rainProbability });

    return res.json({
      city: name,
      temperature,
      humidity,
      windSpeed,
      rainProbability,
      condition,
      alerts,
    });
  } catch (error) {
    return res.status(503).json({
      error: 'Network or server error while fetching weather data.',
    });
  }
});

module.exports = router;