require('dotenv').config();
const pool = require('./db');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Roles enum
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE user_role AS ENUM ('admin', 'manager', 'sales_rep');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role user_role NOT NULL DEFAULT 'sales_rep',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Categories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Products table
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(200) NOT NULL,
        sku VARCHAR(100) UNIQUE,
        category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
        description TEXT,
        price NUMERIC(12,2) NOT NULL DEFAULT 0,
        cost_price NUMERIC(12,2) DEFAULT 0,
        quantity INTEGER NOT NULL DEFAULT 0,
        low_stock_threshold INTEGER DEFAULT 5,
        size VARCHAR(100),
        color VARCHAR(100),
        gender VARCHAR(50),
        image_url TEXT,
        is_active BOOLEAN DEFAULT true,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Stock adjustments log
    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_adjustments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID REFERENCES products(id) ON DELETE CASCADE,
        adjusted_by UUID REFERENCES users(id),
        previous_qty INTEGER NOT NULL,
        new_qty INTEGER NOT NULL,
        adjustment INTEGER NOT NULL,
        reason TEXT,
        type VARCHAR(50) DEFAULT 'manual',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Sales / Orders table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        receipt_number VARCHAR(50) UNIQUE NOT NULL,
        customer_name VARCHAR(150),
        customer_phone VARCHAR(30),
        processed_by UUID REFERENCES users(id),
        subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
        discount NUMERIC(12,2) DEFAULT 0,
        tax NUMERIC(12,2) DEFAULT 0,
        total NUMERIC(12,2) NOT NULL DEFAULT 0,
        amount_paid NUMERIC(12,2) DEFAULT 0,
        change_given NUMERIC(12,2) DEFAULT 0,
        payment_method VARCHAR(50) DEFAULT 'cash',
        status VARCHAR(50) DEFAULT 'completed',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Sale items (line items)
    await client.query(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
        product_id UUID REFERENCES products(id) ON DELETE SET NULL,
        product_name VARCHAR(200) NOT NULL,
        product_sku VARCHAR(100),
        category_name VARCHAR(100),
        quantity INTEGER NOT NULL,
        unit_price NUMERIC(12,2) NOT NULL,
        subtotal NUMERIC(12,2) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Insert default categories
    await client.query(`
      INSERT INTO categories (name, description) VALUES
        ('Kiddies Wear', 'Clothing for children'),
        ('Adult Wear', 'Clothing for adults'),
        ('Bags', 'Handbags, tote bags, backpacks'),
        ('Shoes', 'Footwear for all ages')
      ON CONFLICT (name) DO NOTHING;
    `);

    await client.query('COMMIT');
    console.log('✅ Migration complete — all tables created');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    pool.end();
  }
};

migrate();
