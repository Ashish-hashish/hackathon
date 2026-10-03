// Typed API client for Fair Drop backend endpoints

const API_BASE = '/api';

export interface EventItem {
  id: string;
  name: string;
  capacity: number;
  state: 'PENDING' | 'OPEN' | 'CLOSED' | 'DRAWN' | 'DONE';
  commitment?: string | null;
  seed_reveal?: string | null;
  entries_count: number;
  available_inventory: number;
  active_holds?: number;
  confirmed?: number;
  queue_length?: number;
  created_at?: string | null;
}

export interface RegisterResponse {
  status: string;
  identity_id: string;
  email: string;
  dev_code_hint?: string | null;
  provider?: string;
}

export interface VerifyResponse {
  status: string;
  identity_id: string;
  event_id: string;
  sid: string;
}

export interface ChallengeResponse {
  challenge: string;
  nonce?: string;
  difficulty_bits: number;
  issued_at: number;
  exp: number;
}

export interface EntryResponse {
  status: string;
  entry_id: string;
  is_existing: boolean;
}

export interface UserStatusResponse {
  status: 'REGISTERED' | 'ENTERED' | 'DRAWN' | 'ADMITTED' | 'CONFIRMED' | 'EXPIRED' | 'SKIPPED_CLUSTER_CAP';
  identity_id: string;
  event_id?: string;
  event_name?: string;
  entry_id?: string;
  window_state: 'PENDING' | 'OPEN' | 'CLOSED' | 'DRAWN' | 'DONE';
  rank_bucket?: string;
  exact_rank?: number | null;
  is_account_age_eligible?: boolean;
  account_age_remaining_seconds?: number;
  hold?: {
    hold_id: string;
    status: string;
    expires_at: number;
    remaining_seconds: number;
  } | null;
}

export interface AuditDrawResponse {
  event_id: string;
  state: string;
  commitment: string | null;
  seed_reveal: string | null;
  entries_hash: string | null;
  params: Record<string, any>;
}

export interface AuditVerifyResponse {
  entry_id: string;
  rank: number;
  weight: number;
  cluster_id: string;
  reason_codes: string[];
  commitment: string;
  seed: string;
  entries_hash: string;
  computed: {
    entry_id: string;
    weight: number;
    claimed_rank: number;
    computed_u_i: number;
    computed_key_i: number;
    computed_log_key: number;
    valid: boolean;
  };
  is_verified: boolean;
}

export interface AdminMetricsResponse {
  event_id: string;
  window_state: string;
  capacity: number;
  entries_count: number;
  queue_length: number;
  inventory: {
    capacity: number;
    available: number;
    active_holds: number;
    confirmed: number;
    oversell: number;
  };
  reconciliation: {
    is_healthy: boolean;
    confirmed: number;
    active_holds: number;
    available: number;
    oversell: number;
    error?: string;
  };
  timestamp?: number;
}

export interface SamplingEntry {
  rank: number;
  entry_id: string;
  identity_id: string;
  email_canonical: string;
  is_bot: boolean;
  ip_prefix?: string;
  asn?: string;
  cluster_id: string;
  weight: number;
  u_i: number;
  key_i: number;
  log_key: number;
  status: 'ADMITTED_WINNER' | 'WAITLISTED' | 'SKIPPED_CLUSTER_CAP';
  reason_codes: string[];
  ts_server: number;
  pow_solve_ms?: number;
}

export interface SamplingTableResponse {
  event_id: string;
  event_name: string;
  state: string;
  capacity: number;
  commitment: string | null;
  seed_reveal: string | null;
  entries_hash: string | null;
  drawn_at: string | null;
  summary: {
    total_entries: number;
    admitted_winners: number;
    waitlisted: number;
    skipped_cluster_cap: number;
    total_bots: number;
    total_legit: number;
    bot_winners: number;
    legit_winners: number;
    bot_traffic_share_pct: number;
    bot_win_share_pct: number;
    legit_win_share_pct: number;
  };
  math_formula: {
    uniform_hash: string;
    weight_formula: string;
    key_formula: string;
    sort_order: string;
  };
  entries: SamplingEntry[];
}

export interface ScenarioRunResponse {
  scenario: any;
  summary: {
    fcfs: {
      bot_win_share: number;
      bot_traffic_share: number;
      spearman_arrival_correlation: number;
      oversell: number;
      duplicates: number;
    };
    fair_drop: {
      bot_win_share: number;
      bot_traffic_share: number;
      spearman_arrival_correlation: number;
      oversell: number;
      duplicates: number;
    };
  };
  charts: {
    win_share_comparison: Array<{ name: string; 'Bot Share %': number }>;
    decile_win_rates: Array<{ decile: string; FCFS: number; FairDrop: number }>;
    sybil_scaling_curve: Array<{ identities: number; defenses_on_win_share: number; defenses_off_win_share: number }>;
    ablation: Array<{ layer: string; bot_win_share: number }>;
  };
}

class ApiClient {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      credentials: 'include',
    });

    if (!res.ok) {
      let errorBody = {};
      try {
        errorBody = await res.json();
      } catch (e) {
        // Not JSON
      }
      throw {
        status: res.status,
        ...(typeof errorBody === 'object' && errorBody !== null && 'detail' in errorBody
          ? (errorBody as any).detail
          : errorBody),
      };
    }

    return res.json() as Promise<T>;
  }

  // --- Multi-Event Management ---
  async listAdminEvents(): Promise<{ events: EventItem[] }> {
    return this.request<{ events: EventItem[] }>('/admin/events');
  }

  async listPublicEvents(): Promise<{ events: EventItem[] }> {
    return this.request<{ events: EventItem[] }>('/events/list');
  }

  async createEvent(data: { name: string; capacity: number; id?: string; window_seconds?: number }): Promise<any> {
    return this.request('/admin/events', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async openWindowEvent(eventId: string, capacity?: number): Promise<any> {
    return this.request(`/admin/events/${encodeURIComponent(eventId)}/open`, {
      method: 'POST',
      body: JSON.stringify({ capacity }),
    });
  }

  async closeWindowEvent(eventId: string): Promise<any> {
    return this.request(`/admin/events/${encodeURIComponent(eventId)}/close`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async triggerDrawEvent(eventId: string, capacity?: number): Promise<any> {
    return this.request(`/admin/events/${encodeURIComponent(eventId)}/draw`, {
      method: 'POST',
      body: JSON.stringify({ capacity }),
    });
  }

  async resetEvent(eventId: string): Promise<any> {
    return this.request(`/admin/events/${encodeURIComponent(eventId)}/reset`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async seedEventData(eventId: string, count: number = 100, botPercentage: number = 20): Promise<any> {
    return this.request(`/admin/events/${encodeURIComponent(eventId)}/seed`, {
      method: 'POST',
      body: JSON.stringify({ count, bot_percentage: botPercentage }),
    });
  }

  async getAdminMetrics(eventId?: string): Promise<AdminMetricsResponse> {
    const q = eventId ? `?event_id=${encodeURIComponent(eventId)}` : '';
    return this.request<AdminMetricsResponse>(`/admin/metrics${q}`);
  }

  async getSamplingTable(eventId: string): Promise<SamplingTableResponse> {
    return this.request<SamplingTableResponse>(`/admin/events/${encodeURIComponent(eventId)}/sampling-table`);
  }

  // --- Auth & Registration ---
  async register(email: string, phone?: string, event_id?: string): Promise<RegisterResponse> {
    return this.request<RegisterResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, phone, event_id }),
    });
  }

  async verify(identity_id: string, email_otp: string): Promise<VerifyResponse> {
    return this.request<VerifyResponse>('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ identity_id, email_otp }),
    });
  }

  async getChallenge(eventId?: string): Promise<ChallengeResponse> {
    const q = eventId ? `?event_id=${encodeURIComponent(eventId)}` : '';
    return this.request<ChallengeResponse>(`/entry/challenge${q}`);
  }

  async submitEntry(challenge: string, solution: string, eventId?: string): Promise<EntryResponse> {
    return this.request<EntryResponse>('/entry', {
      method: 'POST',
      body: JSON.stringify({ challenge, solution, event_id: eventId }),
    });
  }

  async getMyStatus(eventId?: string): Promise<UserStatusResponse> {
    const q = eventId ? `?event_id=${encodeURIComponent(eventId)}` : '';
    return this.request<UserStatusResponse>(`/me${q}`);
  }

  async confirmSeat(hold_id: string, idempotencyKey: string): Promise<any> {
    return this.request('/hold/confirm', {
      method: 'POST',
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ hold_id }),
    });
  }

  // --- Audit ---
  async getAuditDraw(eventId?: string): Promise<AuditDrawResponse> {
    const q = eventId ? `?event_id=${encodeURIComponent(eventId)}` : '';
    return this.request<AuditDrawResponse>(`/audit/draw${q}`);
  }

  async getAuditVerify(entry_id: string, eventId?: string): Promise<AuditVerifyResponse> {
    const q = eventId ? `?event_id=${encodeURIComponent(eventId)}` : '';
    return this.request<AuditVerifyResponse>(`/audit/verify/${encodeURIComponent(entry_id)}${q}`);
  }

  async runScenario(params: any): Promise<ScenarioRunResponse> {
    return this.request<ScenarioRunResponse>('/admin/scenario/run', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // Legacy compatibility helpers
  async openWindow(): Promise<any> {
    return this.request('/admin/event/open', { method: 'POST', body: JSON.stringify({}) });
  }

  async triggerDraw(): Promise<any> {
    return this.request('/admin/event/draw', { method: 'POST', body: JSON.stringify({}) });
  }

  async seedData(count: number = 100, botPercentage: number = 20): Promise<any> {
    return this.request('/admin/seed', {
      method: 'POST',
      body: JSON.stringify({ count, bot_percentage: botPercentage }),
    });
  }
}

export const api = new ApiClient();
