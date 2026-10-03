import http from 'k6/http';
import { check, sleep } from 'k6';

// Architecture Section 11 & 14:
// k6 burst test targeting 3,000+ req/s with p95 < 300ms
export const options = {
  scenarios: {
    entry_burst: {
      executor: 'ramping-arrival-rate',
      startRate: 100,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 1000,
      stages: [
        { duration: '10s', target: 500 },
        { duration: '20s', target: 3000 },
        { duration: '30s', target: 3000 },
        { duration: '10s', target: 100 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<300', 'p(99)<600'],
    http_req_failed: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:8000';

export default function () {
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'k6-load-agent',
  };

  // 1. Check health / status
  const res = http.get(`${BASE_URL}/healthz`, { headers: headers });
  check(res, {
    'status is 200': (r) => r.status === 200,
  });

  sleep(0.05);
}
