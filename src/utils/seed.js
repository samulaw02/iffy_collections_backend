require('dotenv').config();
const pool = require('./db');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const seed = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create default admin user
    const passwordHash = await bcrypt.hash('Admin@1234', 12);
    const adminResult = await client.query(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ('CEO Admin', 'admin@iffycollections.com', $1, 'admin')
      ON CONFLICT (email) DO UPDATE SET password_hash = $1
      RETURNING id;
    `, [passwordHash]);
    const adminId = adminResult.rows[0].id;

    // Manager
    const managerHash = await bcrypt.hash('Manager@1234', 12);
    const managerResult = await client.query(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ('Store Manager', 'manager@iffycollections.com', $1, 'manager')
      ON CONFLICT (email) DO UPDATE SET password_hash = $1
      RETURNING id;
    `, [managerHash]);

    // Sales rep
    const salesHash = await bcrypt.hash('Sales@1234', 12);
    await client.query(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ('Sales Rep', 'sales@iffycollections.com', $1, 'sales_rep')
      ON CONFLICT (email) DO UPDATE SET password_hash = $1;
    `, [salesHash]);

    // Get category ids
    const cats = await client.query(`SELECT id, name FROM categories`);
    const catMap = {};
    cats.rows.forEach(c => { catMap[c.name] = c.id; });

    // Sample products
    const products = [
      { name: 'Ankara Flared Dress', sku: 'ADW-001', cat: 'Adult Wear', price: 8500, cost: 4500, qty: 14, low: 5, size: 'M/L', color: 'Multi', gender: 'Female' },
      { name: "Kids Cartoon T-Shirt", sku: 'KDW-001', cat: 'Kiddies Wear', price: 2500, cost: 1200, qty: 3, low: 5, size: '3-4yrs', color: 'Blue', gender: 'Unisex' },
      { name: 'Leather Tote Bag', sku: 'BAG-001', cat: 'Bags', price: 12000, cost: 6500, qty: 0, low: 3, size: 'Medium', color: 'Brown', gender: 'Female' },
      { name: 'Girls Tutu Skirt Set', sku: 'KDW-002', cat: 'Kiddies Wear', price: 4500, cost: 2200, qty: 20, low: 5, size: '5-6yrs', color: 'Pink', gender: 'Female' },
      { name: "Men's Agbada Set", sku: 'ADW-002', cat: 'Adult Wear', price: 22000, cost: 12000, qty: 7, low: 3, size: 'XL/XXL', color: 'White', gender: 'Male' },
      { name: 'Block Heel Sandals', sku: 'SHO-001', cat: 'Shoes', price: 9500, cost: 5000, qty: 2, low: 4, size: '38-42', color: 'Nude', gender: 'Female' },
      { name: 'Mini Crossbody Bag', sku: 'BAG-002', cat: 'Bags', price: 6800, cost: 3500, qty: 11, low: 3, size: 'Small', color: 'Black', gender: 'Female' },
      { name: 'Boys Jogger Set', sku: 'KDW-003', cat: 'Kiddies Wear', price: 3800, cost: 1900, qty: 0, low: 5, size: '7-8yrs', color: 'Grey', gender: 'Male' },
      { name: 'Sneakers (Unisex)', sku: 'SHO-002', cat: 'Shoes', price: 15000, cost: 8000, qty: 18, low: 4, size: '36-45', color: 'White', gender: 'Unisex' },
      { name: "Women's Blazer", sku: 'ADW-003', cat: 'Adult Wear', price: 17500, cost: 9000, qty: 5, low: 4, size: 'S/M/L', color: 'Beige', gender: 'Female' },
    ];

    for (const p of products) {
      await client.query(`
        INSERT INTO products (name, sku, category_id, price, cost_price, quantity, low_stock_threshold, size, color, gender, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (sku) DO NOTHING;
      `, [p.name, p.sku, catMap[p.cat], p.price, p.cost, p.qty, p.low, p.size, p.color, p.gender, adminId]);
    }

    await client.query('COMMIT');
    console.log('✅ Seed complete!');
    console.log('');
    console.log('Default login credentials:');
    console.log('  Admin   → admin@iffycollections.com   / Admin@1234');
    console.log('  Manager → manager@iffycollections.com / Manager@1234');
    console.log('  Sales   → sales@iffycollections.com   / Sales@1234');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    throw err;
  } finally {
    client.release();
    pool.end();
  }
};

seed();
