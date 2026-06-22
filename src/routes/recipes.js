const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const auth = require('../middleware/auth');

const validate = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return res.status(422).json({ errors: e.array() });
  next();
};

// List recipes (own + public)
router.get('/', auth, async (req, res) => {
  const { cuisine, tags, search, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  let conditions = ['(r.user_id=$1 OR r.is_public=true)'];
  const params = [req.user.id];

  if (cuisine) { params.push(cuisine); conditions.push(`r.cuisine=$${params.length}`); }
  if (tags) { params.push(tags.split(',')); conditions.push(`r.tags && $${params.length}`); }
  if (search) { params.push(`%${search}%`); conditions.push(`r.title ILIKE $${params.length}`); }

  params.push(limit, offset);
  const { rows } = await pool.query(
    `SELECT r.*, u.name AS author FROM recipes r JOIN users u ON u.id=r.user_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY r.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json(rows);
});

// Get single recipe with ingredients + steps
router.get('/:id', auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT r.*, u.name AS author FROM recipes r JOIN users u ON u.id=r.user_id
     WHERE r.id=$1 AND (r.user_id=$2 OR r.is_public=true)`,
    [req.params.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Recipe not found' });

  const [{ rows: ingredients }, { rows: steps }] = await Promise.all([
    pool.query('SELECT * FROM ingredients WHERE recipe_id=$1 ORDER BY sort_order', [req.params.id]),
    pool.query('SELECT * FROM steps WHERE recipe_id=$1 ORDER BY step_number', [req.params.id]),
  ]);

  res.json({ ...rows[0], ingredients, steps });
});

// Create recipe
router.post('/',
  auth,
  [body('title').trim().notEmpty()],
  validate,
  async (req, res) => {
    const {
      title, description, image_url, prep_time_minutes, cook_time_minutes,
      servings, cuisine, tags, is_public, ingredients = [], steps = [],
    } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO recipes (user_id,title,description,image_url,prep_time_minutes,cook_time_minutes,servings,cuisine,tags,is_public)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [req.user.id, title, description, image_url, prep_time_minutes, cook_time_minutes, servings, cuisine, tags, is_public ?? false]
      );
      const recipe = rows[0];

      for (const [i, ing] of ingredients.entries()) {
        await client.query(
          'INSERT INTO ingredients (recipe_id,name,quantity,unit,sort_order) VALUES ($1,$2,$3,$4,$5)',
          [recipe.id, ing.name, ing.quantity, ing.unit, i]
        );
      }
      for (const [i, step] of steps.entries()) {
        await client.query(
          'INSERT INTO steps (recipe_id,step_number,instruction) VALUES ($1,$2,$3)',
          [recipe.id, i + 1, step.instruction]
        );
      }

      await client.query('COMMIT');
      res.status(201).json(recipe);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
);

// Update recipe
router.put('/:id', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM recipes WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'Recipe not found' });

  const {
    title, description, image_url, prep_time_minutes, cook_time_minutes,
    servings, cuisine, tags, is_public,
  } = req.body;

  const { rows: updated } = await pool.query(
    `UPDATE recipes SET title=COALESCE($1,title), description=COALESCE($2,description),
     image_url=COALESCE($3,image_url), prep_time_minutes=COALESCE($4,prep_time_minutes),
     cook_time_minutes=COALESCE($5,cook_time_minutes), servings=COALESCE($6,servings),
     cuisine=COALESCE($7,cuisine), tags=COALESCE($8,tags), is_public=COALESCE($9,is_public),
     updated_at=NOW() WHERE id=$10 RETURNING *`,
    [title, description, image_url, prep_time_minutes, cook_time_minutes, servings, cuisine, tags, is_public, req.params.id]
  );
  res.json(updated[0]);
});

// Delete recipe
router.delete('/:id', auth, async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM recipes WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  if (!rowCount) return res.status(404).json({ error: 'Recipe not found' });
  res.status(204).end();
});

// Save / unsave a public recipe
router.post('/:id/save', auth, async (req, res) => {
  await pool.query(
    'INSERT INTO saved_recipes (user_id,recipe_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
    [req.user.id, req.params.id]
  );
  res.status(201).json({ saved: true });
});

router.delete('/:id/save', auth, async (req, res) => {
  await pool.query('DELETE FROM saved_recipes WHERE user_id=$1 AND recipe_id=$2', [req.user.id, req.params.id]);
  res.status(204).end();
});

module.exports = router;
