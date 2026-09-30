-- Production indexes for event discovery and moderation.
CREATE INDEX IF NOT EXISTS events_author_idx ON events(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS events_trust_created_idx ON events(trust_status, created_at DESC);
CREATE INDEX IF NOT EXISTS attendance_user_idx ON event_attendance(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_event_idx ON reports(event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS push_geo_idx ON push_subscriptions(latitude, longitude);

-- Keep notification cleanup cheap when a scheduled retention job is enabled.
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications(user_id, read_at, created_at DESC);
