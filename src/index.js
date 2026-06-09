require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

// ── Safety net ───────────────────────────────────────────────────────────────
// Background jobs (e.g. bulk import) can encounter DB timeouts.
// Log them but never let them crash the server process.
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (server kept alive):', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection (server kept alive):', reason?.message ?? reason);
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/products', require('./routes/products'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/receipts', require('./routes/receipts'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/stock', require('./routes/stock'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/returns', require('./routes/returns'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/audit', require('./routes/audit'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'OK', message: 'Iffy Collections API running' }));

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
