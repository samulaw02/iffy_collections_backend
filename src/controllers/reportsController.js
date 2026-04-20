const pool = require('../utils/db');

const getCashSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate || new Date(new Date().setDate(new Date().getDate() - 29)).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

    const [dailyRows, methodRows, cashierRows] = await Promise.all([
      pool.query(`
        SELECT
          DATE(created_at) as date,
          COUNT(*) as transactions,
          COALESCE(SUM(total), 0) as revenue,
          COALESCE(SUM(CASE WHEN payment_method='cash' THEN total ELSE 0 END), 0) as cash,
          COALESCE(SUM(CASE WHEN payment_method='transfer' THEN total ELSE 0 END), 0) as transfer,
          COALESCE(SUM(CASE WHEN payment_method='card' THEN total ELSE 0 END), 0) as card,
          COALESCE(SUM(discount), 0) as discounts
        FROM sales
        WHERE created_at >= $1 AND created_at <= $2::date + INTERVAL '1 day'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `, [start, end]),
      pool.query(`
        SELECT
          payment_method,
          COUNT(*) as transactions,
          COALESCE(SUM(total), 0) as revenue
        FROM sales
        WHERE created_at >= $1 AND created_at <= $2::date + INTERVAL '1 day'
        GROUP BY payment_method
        ORDER BY revenue DESC
      `, [start, end]),
      pool.query(`
        SELECT
          u.name as cashier,
          COUNT(*) as transactions,
          COALESCE(SUM(s.total), 0) as revenue
        FROM sales s
        LEFT JOIN users u ON s.processed_by = u.id
        WHERE s.created_at >= $1 AND s.created_at <= $2::date + INTERVAL '1 day'
        GROUP BY u.name
        ORDER BY revenue DESC
      `, [start, end]),
    ]);

    const totals = dailyRows.rows.reduce((acc, r) => ({
      revenue: acc.revenue + parseFloat(r.revenue),
      transactions: acc.transactions + parseInt(r.transactions),
      discounts: acc.discounts + parseFloat(r.discounts),
    }), { revenue: 0, transactions: 0, discounts: 0 });

    res.json({
      daily: dailyRows.rows,
      byMethod: methodRows.rows,
      byCashier: cashierRows.rows,
      totals,
      period: { start, end },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getProfitReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate || new Date(new Date().setDate(new Date().getDate() - 29)).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

    const [itemRows, summaryRow] = await Promise.all([
      pool.query(`
        SELECT
          si.product_name,
          SUM(si.quantity) as units_sold,
          SUM(si.subtotal) as revenue,
          COALESCE(SUM(p.cost_price * si.quantity), 0) as cost,
          COALESCE(SUM(si.subtotal) - SUM(p.cost_price * si.quantity), 0) as profit
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        LEFT JOIN products p ON si.product_id = p.id
        WHERE s.created_at >= $1 AND s.created_at <= $2::date + INTERVAL '1 day'
        GROUP BY si.product_name
        ORDER BY profit DESC
        LIMIT 50
      `, [start, end]),
      pool.query(`
        SELECT
          COALESCE(SUM(si.subtotal), 0) as total_revenue,
          COALESCE(SUM(p.cost_price * si.quantity), 0) as total_cost,
          COALESCE(SUM(si.subtotal) - SUM(p.cost_price * si.quantity), 0) as total_profit,
          COALESCE(SUM(s.discount), 0) as total_discounts
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        LEFT JOIN products p ON si.product_id = p.id
        WHERE s.created_at >= $1 AND s.created_at <= $2::date + INTERVAL '1 day'
      `, [start, end]),
    ]);

    res.json({
      items: itemRows.rows,
      summary: summaryRow.rows[0],
      period: { start, end },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getCashSummary, getProfitReport };
