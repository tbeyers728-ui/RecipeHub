const router = require('express').Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');

// Get meal plan for a date range
router.get('/', auth, async (req, res) => {
  const { start, end } = req.query;
  let query = 'SELECT mp.*, r.title AS recipe_title, r.image_url FROM meal_plans mp LEFT JOIN recipes r ON r.id=mp.recipe_id WHERE mp.user_id=$1';
  const params = [req.user.id];

  if (start) { params.push(start); query += ` AND mp.planned_date >= $${params.length}`; }
  if (end)   { params.push(end);   query += ` AND mp.planned_date <= $${params.length}`; }
  query += ' ORDER BY mp.planned_date, mp.meal_type';

  const { rows } = await pool.query(query, params);
  res.json(rows);
});

// Add a meal plan entry
router.post('/', auth, async (req, res) => {
  const { recipe_id, planned_date, meal_type, servings = 1, notes } = req.body;
  if (!planned_date || !meal_type) return res.status(422).json({ error: 'planned_date and meal_type required' });

  const { rows } = await pool.query(
    'INSERT INTO meal_plans (user_id,recipe_id,planned_date,meal_type,servings,notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [req.user.id, recipe_id, planned_date, meal_type, servings, notes]
  );
  res.status(201).json(rows[0]);
});

// Update a meal plan entry
router.put('/:id', auth, async (req, res) => {
  const { recipe_id, planned_date, meal_type, servings, notes } = req.body;
  const { rows } = await pool.query(
    `UPDATE meal_plans SET recipe_id=COALESCE($1,recipe_id), planned_date=COALESCE($2,planned_date),
     meal_type=COALESCE($3,meal_type), servings=COALESCE($4,servings), notes=COALESCE($5,notes)
     WHERE id=$6 AND user_id=$7 RETURNING *`,
    [recipe_id, planned_date, meal_type, servings, notes, req.params.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Entry not found' });
  res.json(rows[0]);
});

// Delete a meal plan entry
router.delete('/:id', auth, async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM meal_plans WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  if (!rowCount) return res.status(404).json({ error: 'Entry not found' });
  res.status(204).end();
});

// Auto-generate shopping list from a date range
router.post('/generate-shopping-list', auth, async (req, res) => {
  const { start, end } = req.body;
  if (!start || !end) return res.status(422).json({ error: 'start and end dates required' });

  const { rows: items } = await pool.query(
    `SELECT i.name, SUM(i.quantity * mp.servings / r.servings) AS quantity, i.unit
     FROM meal_plans mp
     JOIN recipes r ON r.id = mp.recipe_id
     JOIN ingredients i ON i.recipe_id = r.id
     WHERE mp.user_id=$1 AND mp.planned_date BETWEEN $2 AND $3
     GROUP BY i.name, i.unit`,
    [req.user.id, start, end]
  );

  const inserted = [];
  for (const item of items) {
    const { rows } = await pool.query(
      'INSERT INTO shopping_list_items (user_id,name,quantity,unit) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.user.id, item.name, item.quantity, item.unit]
    );
    inserted.push(rows[0]);
  }
  res.status(201).json(inserted);
});

module.exports = router;
