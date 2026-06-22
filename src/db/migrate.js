require('dotenv').config();
const pool = require('./pool');

const schema = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  prep_time_minutes INT,
  cook_time_minutes INT,
  servings INT,
  cuisine TEXT,
  tags TEXT[],
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingredients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity NUMERIC,
  unit TEXT,
  sort_order INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  step_number INT NOT NULL,
  instruction TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meal_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  planned_date DATE NOT NULL,
  meal_type TEXT CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
  servings INT DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shopping_list_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity NUMERIC,
  unit TEXT,
  is_checked BOOLEAN DEFAULT false,
  recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saved_recipes (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, recipe_id)
);

CREATE TABLE IF NOT EXISTS pantry_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity NUMERIC,
  unit TEXT,
  category TEXT,
  expires_at DATE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS cooking_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cooking_timers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES cooking_sessions(id) ON DELETE CASCADE,
  label TEXT,
  step_number INT,
  duration_seconds INT NOT NULL,
  remaining_seconds INT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  status TEXT DEFAULT 'running' CHECK (status IN ('running','paused','completed','cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`;

(async () => {
  try {
    await pool.query(schema);
    console.log('Migration complete.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
