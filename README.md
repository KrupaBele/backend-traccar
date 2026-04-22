# backend-vehicle

WhatsApp alert backend for your vehicle rule engine.

## Features

- `POST /api/alerts/send` endpoint for alert delivery
- Twilio WhatsApp integration
- In-memory cooldown/deduplication to prevent spam
- CORS protection for allowed frontend origins

## 1) Setup

```bash
npm install
```

Copy env file:

```bash
copy .env.example .env
```

Then fill real values in `.env`.

## 2) Run

```bash
npm run dev
```

Health check:

```bash
GET https://backend-traccar.onrender.com/health
```

## 3) Alert API

```http
POST /api/alerts/send
Content-Type: application/json
```

Sample body:

```json
{
  "deviceId": 7,
  "deviceName": "Audi",
  "metric": "device_offline",
  "value": "offline",
  "message": "Audi went offline (custom rule)",
  "source": "custom"
}
```

## 4) Frontend call example

From your React app when custom alert triggers:

```js
await fetch('https://backend-traccar.onrender.com/api/alerts/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    deviceId: 7,
    deviceName: 'Audi',
    metric: 'device_offline',
    value: 'offline',
    message: 'Audi went offline (custom rule)',
    source: 'custom',
  }),
});
```

## Notes

- Cooldown is controlled by `ALERT_COOLDOWN_SECONDS`.
- Current dedupe store is in-memory; restarting server clears history.
- For production, move dedupe state to Redis or database.
