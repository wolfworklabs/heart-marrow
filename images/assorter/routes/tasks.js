const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
  try {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today.setDate(diff));
    monday.setHours(0, 0, 0, 0);

    const weekParam = req.query.week;
    const currentWeek = weekParam ? new Date(weekParam) : monday;
    const weekStr = currentWeek.toISOString().split('T')[0];

    const prevWeek = new Date(currentWeek);
    prevWeek.setDate(prevWeek.getDate() - 7);
    const nextWeek = new Date(currentWeek);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const [weekTasks] = await db.query(`
      SELECT tasks.*, categories.name AS category_name
      FROM tasks
      LEFT JOIN categories ON tasks.category_id = categories.id
      WHERE tasks.is_archived = FALSE
      AND tasks.parent_id IS NULL
      AND tasks.week_of = ?
      ORDER BY tasks.status ASC, tasks.priority DESC
    `, [weekStr]);

    // Fetch subtasks for each week task
    for (const task of weekTasks) {
      const [subtasks] = await db.query(
        `SELECT * FROM tasks WHERE parent_id = ? ORDER BY created_at ASC`,
        [task.id]
      );
      task.subtasks = subtasks;
    }

    const [backlog] = await db.query(`
      SELECT tasks.*, categories.name AS category_name
      FROM tasks
      LEFT JOIN categories ON tasks.category_id = categories.id
      WHERE tasks.is_archived = FALSE
      AND tasks.parent_id IS NULL
      AND tasks.week_of IS NULL
      ORDER BY tasks.priority DESC, tasks.created_at ASC
    `);

    const [categories] = await db.query('SELECT * FROM categories');

    res.render('index', {
      weekTasks,
      backlog,
      categories,
      weekStr,
      prevWeek: prevWeek.toISOString().split('T')[0],
      nextWeek: nextWeek.toISOString().split('T')[0],
      isCurrentWeek: weekStr === monday.toISOString().split('T')[0]
    });
  } catch (err) {
    console.error(err);
    res.send('Something went wrong.');
  }
});

// Show new task form
router.get('/tasks/new', async (req, res) => {
  try {
    const [categories] = await db.query('SELECT * FROM categories');
    res.render('new-task', { categories });
  } catch (err) {
    console.error(err);
    res.send('Something went wrong.');
  }
});

// Save new task
router.post('/tasks', async (req, res) => {
  const { title, notes, priority, category_id, due_date, week_of, recurrence } = req.body;
  try {
    await db.query(
      `INSERT INTO tasks (title, notes, priority, category_id, due_date, week_of, recurrence)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [title, notes, priority, category_id || null, due_date || null, week_of || null, recurrence || 'none']
    );
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.send('Something went wrong.');
  }
});

// Show task detail page
router.get('/tasks/:id', async (req, res) => {
  try {
    const [tasks] = await db.query(
      `SELECT tasks.*, categories.name AS category_name
       FROM tasks
       LEFT JOIN categories ON tasks.category_id = categories.id
       WHERE tasks.id = ?`,
      [req.params.id]
    );

    if (tasks.length === 0) return res.send('Task not found.');

    const task = tasks[0];

    const [subtasks] = await db.query(
      `SELECT * FROM tasks WHERE parent_id = ? ORDER BY created_at ASC`,
      [req.params.id]
    );

    const [categories] = await db.query('SELECT * FROM categories');

    res.render('task-detail', { task, subtasks, categories });
  } catch (err) {
    console.error(err);
    res.send('Something went wrong.');
  }
});

// Add a subtask
router.post('/tasks/:id/subtasks', async (req, res) => {
  const { title } = req.body;
  try {
    await db.query(
      `INSERT INTO tasks (title, parent_id) VALUES (?, ?)`,
      [title, req.params.id]
    );
    res.redirect(`/tasks/${req.params.id}`);
  } catch (err) {
    console.error(err);
    res.send('Something went wrong.');
  }
});

// Mark task done
router.post('/tasks/:id/done', async (req, res) => {
  try {
    await db.query(
      `UPDATE tasks 
       SET status = 'done', completed_at = NOW() 
       WHERE id = ?`,
      [req.params.id]
    );
    const referer = req.headers.referer || '/';
    res.redirect(referer);
  } catch (err) {
    console.error(err);
    res.send('Something went wrong.');
  }
});

// Undo done
router.post('/tasks/:id/undo', async (req, res) => {
  try {
    await db.query(
      `UPDATE tasks 
       SET status = 'todo', completed_at = NULL 
       WHERE id = ?`,
      [req.params.id]
    );
    const referer = req.headers.referer || '/';
    res.redirect(referer);
  } catch (err) {
    console.error(err);
    res.send('Something went wrong.');
  }
});

// Show edit form
router.get('/', async (req, res) => {
  try {
    // Figure out which week to show
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today.setDate(diff));
    monday.setHours(0, 0, 0, 0);

    // Allow navigation to other weeks via ?week= query param
    const weekParam = req.query.week;
    const currentWeek = weekParam ? new Date(weekParam) : monday;
    const weekStr = currentWeek.toISOString().split('T')[0];

    // Previous and next week dates for navigation
    const prevWeek = new Date(currentWeek);
    prevWeek.setDate(prevWeek.getDate() - 7);
    const nextWeek = new Date(currentWeek);
    nextWeek.setDate(nextWeek.getDate() + 7);

    // This week's tasks
    const [weekTasks] = await db.query(`
      SELECT tasks.*, categories.name AS category_name
      FROM tasks
      LEFT JOIN categories ON tasks.category_id = categories.id
      WHERE tasks.is_archived = FALSE
      AND tasks.parent_id IS NULL
      AND tasks.week_of = ?
      ORDER BY tasks.status ASC, tasks.priority DESC
    `, [weekStr]);

    // Backlog tasks
    const [backlog] = await db.query(`
      SELECT tasks.*, categories.name AS category_name
      FROM tasks
      LEFT JOIN categories ON tasks.category_id = categories.id
      WHERE tasks.is_archived = FALSE
      AND tasks.parent_id IS NULL
      AND tasks.week_of IS NULL
      ORDER BY tasks.priority DESC, tasks.created_at ASC
    `);

    const [categories] = await db.query('SELECT * FROM categories');

    res.render('index', {
      weekTasks,
      backlog,
      categories,
      weekStr,
      prevWeek: prevWeek.toISOString().split('T')[0],
      nextWeek: nextWeek.toISOString().split('T')[0],
      isCurrentWeek: weekStr === monday.toISOString().split('T')[0]
    });
  } catch (err) {
    console.error(err);
    res.send('Something went wrong.');
  }
});

// Save edits
router.post('/tasks/:id/edit', async (req, res) => {
  const { title, notes, priority, category_id, due_date, week_of, recurrence } = req.body;
  try {
    await db.query(
      `UPDATE tasks 
       SET title = ?, notes = ?, priority = ?, category_id = ?, 
           due_date = ?, week_of = ?, recurrence = ?
      WHERE id = ?`,
      [title, notes, priority, category_id || null, due_date || null, week_of || null,
       recurrence || 'none', req.params.id]
    );
    res.redirect(`/tasks/${req.params.id}`);
  } catch (err) {
    console.error(err);
    res.send('Something went wrong.');
  }
});

// Delete subtask
router.post('/tasks/:id/delete', async (req, res) => {
  try {
    const [task] = await db.query('SELECT parent_id FROM tasks WHERE id = ?', [req.params.id]);
    const parentId = task[0].parent_id;
    await db.query('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    if (parentId) {
      res.redirect(`/tasks/${parentId}`);
    } else {
      res.redirect('/');
    }
  } catch (err) {
    console.error(err);
    res.send('Something went wrong.');
  }
});

// Assign task to current week
router.post('/tasks/:id/assign-week', async (req, res) => {
  const { week_of } = req.body;
  try {
    await db.query(
      'UPDATE tasks SET week_of = ? WHERE id = ?',
      [week_of, req.params.id]
    );
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.send('Something went wrong.');
  }
});

module.exports = router;