const pool = require('../utils/db');

const getDashboard = async (req, res) => {
  try {
    const [
      totalProducts,
      totalStock,
      lowStock,
      outOfStock,
      todaySales,
      weekSales,
      monthSales,
      topProducts,
      recentSales,
      categorySummary
    ] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM products WHERE is_active=true"),
      pool.query("SELECT COALESCE(SUM(quantity * price),0) as value FROM products WHERE is_active=true"),
      pool.query("SELECT COUNT(*) FROM products WHERE is_active=true AND quantity > 0 AND quantity <= low_stock_threshold"),
      pool.query("SELECT COUNT(*) FROM products WHERE is_active=true AND quantity = 0"),
      pool.query("SELECT COALESCE(SUM(total),0) as revenue, COUNT(*) as count FROM sales WHERE created_at >= CURRENT_DATE"),
      pool.query("SELECT COALESCE(SUM(total),0) as revenue, COUNT(*) as count FROM sales WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'"),
      pool.query("SELECT COALESCE(SUM(total),0) as revenue, COUNT(*) as count FROM sales WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)"),
      pool.query(`
        SELECT si.product_name, SUM(si.quantity) as units_sold, SUM(si.subtotal) as revenue
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE s.created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY si.product_name ORDER BY units_sold DESC LIMIT 5
      `),
      pool.query(`
        SELECT s.receipt_number, s.customer_name, s.total, s.payment_method, s.created_at, u.name as cashier
        FROM sales s LEFT JOIN users u ON s.processed_by = u.id
        ORDER BY s.created_at DESC LIMIT 10
      `),
      pool.query(`
        SELECT c.name as category, COUNT(p.id) as products, SUM(p.quantity) as total_qty,
          SUM(p.quantity * p.price) as stock_value
        FROM categories c LEFT JOIN products p ON p.category_id = c.id AND p.is_active=true
        GROUP BY c.name ORDER BY c.name
      `)
    ]);

    res.json({
      summary: {
        totalProducts: parseInt(totalProducts.rows[0].count),
        stockValue: parseFloat(totalStock.rows[0].value),
        lowStock: parseInt(lowStock.rows[0].count),
        outOfStock: parseInt(outOfStock.rows[0].count),
      },
      sales: {
        today: { revenue: parseFloat(todaySales.rows[0].revenue), count: parseInt(todaySales.rows[0].count) },
        week: { revenue: parseFloat(weekSales.rows[0].revenue), count: parseInt(weekSales.rows[0].count) },
        month: { revenue: parseFloat(monthSales.rows[0].revenue), count: parseInt(monthSales.rows[0].count) },
      },
      topProducts: topProducts.rows,
      recentSales: recentSales.rows,
      categorySummary: categorySummary.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getDashboard };
