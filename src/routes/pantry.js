const router = require('express').Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');

// Get all pantry items
router.get('/', auth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM pantry_items WHERE user_id=$1 ORDER BY category, name',
    [req.user.id]
  );
  res.json(rows);
});

// Add or update a pantry item (upsert by name)
router.post('/', auth, async (req, res) => {
  const { name, quantity, unit, category, expires_at } = req.body;
  if (!name) return res.status(422).json({ error: 'name required' });

  const { rows } = await pool.query(
    `INSERT INTO pantry_items (user_id, name, quantity, unit, category, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id, name) DO UPDATE SET
       quantity=EXCLUDED.quantity, unit=EXCLUDED.unit,
       category=EXCLUDED.category, expires_at=EXCLUDED.expires_at,
       updated_at=NOW()
     RETURNING *`,
    [req.user.id, name.toLowerCase().trim(), quantity, unit, category, expires_at]
  );
  res.status(201).json(rows[0]);
});

// Bulk upsert (e.g., after shopping)
router.post('/bulk', auth, async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || !items.length) return res.status(422).json({ error: 'items array required' });

  const inserted = [];
  for (const item of items) {
    const { name, quantity, unit, category, expires_at } = item;
    if (!name) continue;
    const { rows } = await pool.query(
      `INSERT INTO pantry_items (user_id, name, quantity, unit, category, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id, name) DO UPDATE SET
         quantity=EXCLUDED.quantity, unit=EXCLUDED.unit,
         category=EXCLUDED.category, expires_at=EXCLUDED.expires_at,
         updated_at=NOW()
       RETURNING *`,
      [req.user.id, name.toLowerCase().trim(), quantity, unit, category, expires_at]
    );
    inserted.push(rows[0]);
  }
  res.status(201).json(inserted);
});

// Update a pantry item
router.patch('/:id', auth, async (req, res) => {
  const { quantity, unit, category, expires_at } = req.body;
  const { rows } = await pool.query(
    `UPDATE pantry_items SET
       quantity=COALESCE($1,quantity), unit=COALESCE($2,unit),
       category=COALESCE($3,category), expires_at=COALESCE($4,expires_at),
       updated_at=NOW()
     WHERE id=$5 AND user_id=$6 RETURNING *`,
    [quantity, unit, category, expires_at, req.params.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Item not found' });
  res.json(rows[0]);
});

// Delete a pantry item
router.delete('/:id', auth, async (req, res) => {
  const { rowCount } = await pool.query(
    'DELETE FROM pantry_items WHERE id=$1 AND user_id=$2',
    [req.params.id, req.user.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Item not found' });
  res.status(204).end();
});

// "What can I cook?" — match recipes against pantry
router.get('/can-cook', auth, async (req, res) => {
  const { min_match_pct = 70 } = req.query;

  // Get user's pantry ingredient names
  const { rows: pantry } = await pool.query(
    'SELECT name FROM pantry_items WHERE user_id=$1',
    [req.user.id]
  );
  const pantryNames = pantry.map((p) => p.name);

  if (!pantryNames.length) return res.json([]);

  // For each accessible recipe, score how many ingredients are in the pantry
  const { rows: recipes } = await pool.query(
    `SELECT r.id, r.title, r.image_url, r.prep_time_minutes, r.cook_time_minutes,
            r.servings, r.cuisine, r.tags,
            array_agg(i.name) AS ingredient_names,
            COUNT(i.id) AS total_ingredients
     FROM recipes r
     JOIN ingredients i ON i.recipe_id = r.id
     WHERE (r.user_id=$1 OR r.is_public=true)
     GROUP BY r.id`,
    [req.user.id]
  );

  const results = recipes
    .map((recipe) => {
      const matched = recipe.ingredient_names.filter((ing) =>
        pantryNames.some((p) => ing.toLowerCase().includes(p) || p.includes(ing.toLowerCase()))
      );
      const pct = Math.round((matched.length / recipe.total_ingredients) * 100);
      const missing = recipe.ingredient_names.filter(
        (ing) => !pantryNames.some((p) => ing.toLowerCase().includes(p) || p.includes(ing.toLowerCase()))
      );
      return { ...recipe, matched_count: matched.length, match_pct: pct, missing_ingredients: missing };
    })
    .filter((r) => r.match_pct >= Number(min_match_pct))
    .sort((a, b) => b.match_pct - a.match_pct);

  res.json(results);
});

module.exports = router;
