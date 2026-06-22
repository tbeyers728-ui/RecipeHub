const router = require('express').Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');

// Get all active timers for a cooking session
router.get('/session/:session_id', auth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM cooking_timers WHERE session_id=$1 AND user_id=$2 ORDER BY created_at',
    [req.params.session_id, req.user.id]
  );
  res.json(rows);
});

// Start a cooking session (returns session_id)
router.post('/session', auth, async (req, res) => {
  const { recipe_id } = req.body;
  const { rows } = await pool.query(
    'INSERT INTO cooking_sessions (user_id, recipe_id) VALUES ($1,$2) RETURNING *',
    [req.user.id, recipe_id]
  );
  res.status(201).json(rows[0]);
});

// Create a timer within a session
router.post('/', auth, async (req, res) => {
  const { session_id, label, duration_seconds, step_number } = req.body;
  if (!session_id || !duration_seconds) {
    return res.status(422).json({ error: 'session_id and duration_seconds required' });
  }

  const starts_at = new Date();
  const ends_at = new Date(starts_at.getTime() + duration_seconds * 1000);

  const { rows } = await pool.query(
    `INSERT INTO cooking_timers (user_id, session_id, label, duration_seconds, step_number, starts_at, ends_at, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'running') RETURNING *`,
    [req.user.id, session_id, label, duration_seconds, step_number, starts_at, ends_at]
  );
  res.status(201).json(rows[0]);
});

// Pause a timer
router.patch('/:id/pause', auth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM cooking_timers WHERE id=$1 AND user_id=$2',
    [req.params.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Timer not found' });

  const timer = rows[0];
  if (timer.status !== 'running') return res.status(409).json({ error: 'Timer is not running' });

  const elapsed = Math.floor((Date.now() - new Date(timer.starts_at)) / 1000);
  const remaining = timer.duration_seconds - elapsed;

  const { rows: updated } = await pool.query(
    `UPDATE cooking_timers SET status='paused', remaining_seconds=$1 WHERE id=$2 RETURNING *`,
    [remaining, req.params.id]
  );
  res.json(updated[0]);
});

// Resume a paused timer
router.patch('/:id/resume', auth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM cooking_timers WHERE id=$1 AND user_id=$2',
    [req.params.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Timer not found' });

  const timer = rows[0];
  if (timer.status !== 'paused') return res.status(409).json({ error: 'Timer is not paused' });

  const starts_at = new Date();
  const ends_at = new Date(starts_at.getTime() + timer.remaining_seconds * 1000);

  const { rows: updated } = await pool.query(
    `UPDATE cooking_timers SET status='running', starts_at=$1, ends_at=$2, remaining_seconds=NULL
     WHERE id=$3 RETURNING *`,
    [starts_at, ends_at, req.params.id]
  );
  res.json(updated[0]);
});

// Cancel / complete a timer
router.patch('/:id/stop', auth, async (req, res) => {
  const { status = 'cancelled' } = req.body;
  if (!['cancelled', 'completed'].includes(status)) {
    return res.status(422).json({ error: 'status must be cancelled or completed' });
  }
  const { rows } = await pool.query(
    `UPDATE cooking_timers SET status=$1 WHERE id=$2 AND user_id=$3 RETURNING *`,
    [status, req.params.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Timer not found' });
  res.json(rows[0]);
});

// Get all timers for a recipe (pre-built from step instructions)
// The iOS app can call this when starting to cook to pre-populate timers
router.get('/recipe/:recipe_id/suggested', auth, async (req, res) => {
  const { rows: steps } = await pool.query(
    `SELECT s.step_number, s.instruction FROM steps s
     JOIN recipes r ON r.id=s.recipe_id
     WHERE s.recipe_id=$1 AND (r.user_id=$2 OR r.is_public=true)
     ORDER BY s.step_number`,
    [req.params.recipe_id, req.user.id]
  );

  // Parse durations from instruction text (e.g., "bake for 30 minutes", "simmer 10 min")
  const timerPattern = /(\d+)\s*[-–]?\s*(\d+)?\s*(minutes?|mins?|hours?|hrs?|seconds?|secs?)/gi;
  const suggested = [];

  for (const step of steps) {
    let match;
    timerPattern.lastIndex = 0;
    while ((match = timerPattern.exec(step.instruction)) !== null) {
      const low = parseInt(match[1]);
      const high = match[2] ? parseInt(match[2]) : null;
      const unit = match[3].toLowerCase();
      let multiplier = unit.startsWith('h') ? 3600 : unit.startsWith('s') ? 1 : 60;
      suggested.push({
        step_number: step.step_number,
        label: `Step ${step.step_number}`,
        duration_seconds: (high ?? low) * multiplier,
        duration_display: high ? `${low}–${high} ${match[3]}` : `${low} ${match[3]}`,
        instruction_excerpt: step.instruction.slice(0, 100),
      });
    }
  }

  res.json(suggested);
});

module.exports = router;
