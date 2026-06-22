const router = require('express').Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM shopping_list_items WHERE user_id=$1 ORDER BY is_checked, created_at',
    [req.user.id]
  );
  res.json(rows);
});

router.post('/', auth, async (req, res) => {
  const { name, quantity, unit } = req.body;
  if (!name) return res.status(422).json({ error: 'name required' });

  const { rows } = await pool.query(
    'INSERT INTO shopping_list_items (user_id,name,quantity,unit) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.user.id, name, quantity, unit]
  );
  res.status(201).json(rows[0]);
});

router.patch('/:id', auth, async (req, res) => {
  const { is_checked, name, quantity, unit } = req.body;
  const { rows } = await pool.query(
    `UPDATE shopping_list_items SET
     is_checked=COALESCE($1,is_checked), name=COALESCE($2,name),
     quantity=COALESCE($3,quantity), unit=COALESCE($4,unit)
     WHERE id=$5 AND user_id=$6 RETURNING *`,
    [is_checked, name, quantity, unit, req.params.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Item not found' });
  res.json(rows[0]);
});

router.delete('/:id', auth, async (req, res) => {
  const { rowCount } = await pool.query(
    'DELETE FROM shopping_list_items WHERE id=$1 AND user_id=$2',
    [req.params.id, req.user.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Item not found' });
  res.status(204).end();
});

// Clear all checked items
router.delete('/checked', auth, async (req, res) => {
  await pool.query('DELETE FROM shopping_list_items WHERE user_id=$1 AND is_checked=true', [req.user.id]);
  res.status(204).end();
});

module.exports = router;
