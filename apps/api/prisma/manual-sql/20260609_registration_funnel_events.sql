CREATE TABLE IF NOT EXISTS registration_funnel_events (
  id TEXT PRIMARY KEY,
  event_id TEXT NULL REFERENCES events(id) ON DELETE SET NULL ON UPDATE CASCADE,
  session_id TEXT NULL,
  user_id TEXT NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  email TEXT NULL,
  step TEXT NOT NULL,
  status TEXT NOT NULL,
  metadata JSONB NULL,
  user_agent TEXT NULL,
  referrer TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS registration_funnel_events_event_id_step_idx
  ON registration_funnel_events(event_id, step);

CREATE INDEX IF NOT EXISTS registration_funnel_events_step_status_idx
  ON registration_funnel_events(step, status);

CREATE INDEX IF NOT EXISTS registration_funnel_events_created_at_idx
  ON registration_funnel_events(created_at);
