CREATE TABLE IF NOT EXISTS player_profiles (
  nickname varchar(16) PRIMARY KEY,
  animation varchar(16) NOT NULL DEFAULT 'inspect',
  background varchar(16) NOT NULL DEFAULT 'default',
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS play_time (
  uuid varchar(36) PRIMARY KEY,
  nickname varchar(36) NOT NULL UNIQUE,
  playtime bigint NOT NULL DEFAULT 0,
  artificial_playtime bigint NOT NULL DEFAULT 0,
  afk_playtime bigint NOT NULL DEFAULT 0,
  last_seen bigint DEFAULT NULL,
  first_join bigint DEFAULT NULL,
  relative_join_streak integer DEFAULT 0,
  absolute_join_streak integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS player_daily_activity (
  user_uuid varchar(36) NOT NULL,
  nickname varchar(36) NOT NULL,
  activity_date date NOT NULL,
  played_seconds bigint NOT NULL DEFAULT 0,
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  PRIMARY KEY (user_uuid, activity_date),
  CONSTRAINT player_daily_activity_user_uuid_fkey
    FOREIGN KEY (user_uuid) REFERENCES play_time(uuid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_player_daily_activity_nickname_date
  ON player_daily_activity (nickname, activity_date);

CREATE TABLE IF NOT EXISTS player_online_status (
  user_uuid varchar(36) PRIMARY KEY,
  nickname varchar(36) NOT NULL,
  online boolean NOT NULL DEFAULT false,
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT player_online_status_user_uuid_fkey
    FOREIGN KEY (user_uuid) REFERENCES play_time(uuid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_player_online_status_nickname
  ON player_online_status (nickname);

CREATE TABLE IF NOT EXISTS player_ratings (
  target_nickname varchar(16) NOT NULL,
  voter_nickname varchar(16) NOT NULL,
  value integer NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  PRIMARY KEY (target_nickname, voter_nickname),
  CONSTRAINT player_ratings_value_check CHECK (value IN (-1, 1))
);

CREATE INDEX IF NOT EXISTS player_ratings_voter_nickname_idx
  ON player_ratings (voter_nickname);
