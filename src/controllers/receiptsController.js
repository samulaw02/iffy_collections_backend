const PDFDocument = require('pdfkit');
const pool = require('../utils/db');

const generateReceiptPDF = async (req, res) => {
  try {
    const { id } = req.params;

    const saleResult = await pool.query(`
      SELECT s.*, u.name as processed_by_name
      FROM sales s LEFT JOIN users u ON s.processed_by = u.id
      WHERE s.receipt_number = $1 OR s.id::text = $1
    `, [id]);
    if (!saleResult.rows.length) return res.status(404).json({ error: 'Sale not found' });

    const sale = saleResult.rows[0];
    const itemsResult = await pool.query('SELECT * FROM sale_items WHERE sale_id=$1', [sale.id]);
    const items = itemsResult.rows;

    const doc = new PDFDocument({ size: [226, 600], margin: 15 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="receipt-${sale.receipt_number}.pdf"`);
    doc.pipe(res);

    const fmt = (n) => `N${parseFloat(n).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
    const centerX = 113;
    const pageWidth = 196;

    // Header
    doc.fontSize(14).font('Helvetica-Bold').text('IFFY COLLECTIONS', { align: 'center' });
    doc.fontSize(8).font('Helvetica').text('Bodija, Ibadan, Nigeria', { align: 'center' });
    doc.text('Tel: 08135359072', { align: 'center' });
    doc.moveDown(0.5);

    // Divider
    doc.moveTo(15, doc.y).lineTo(211, doc.y).stroke();
    doc.moveDown(0.3);

    doc.fontSize(9).font('Helvetica-Bold').text('SALES RECEIPT', { align: 'center' });
    doc.moveDown(0.3);

    doc.fontSize(7.5).font('Helvetica');
    doc.text(`Receipt #: ${sale.receipt_number}`);
    doc.text(`Date: ${new Date(sale.created_at).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}`);
    doc.text(`Customer: ${sale.customer_name || 'Walk-in Customer'}`);
    if (sale.customer_phone) doc.text(`Phone: ${sale.customer_phone}`);
    doc.text(`Cashier: ${sale.processed_by_name}`);
    doc.text(`Payment: ${sale.payment_method.toUpperCase()}`);
    doc.moveDown(0.3);

    // Items header
    doc.moveTo(15, doc.y).lineTo(211, doc.y).stroke();
    doc.moveDown(0.2);
    doc.fontSize(7.5).font('Helvetica-Bold');
    const y = doc.y;
    doc.text('ITEM', 15, y, { width: 90 });
    doc.text('QTY', 105, y, { width: 25, align: 'center' });
    doc.text('PRICE', 130, y, { width: 40, align: 'right' });
    doc.text('TOTAL', 170, y, { width: 40, align: 'right' });
    doc.moveDown(0.2);
    doc.moveTo(15, doc.y).lineTo(211, doc.y).stroke();
    doc.moveDown(0.2);

    // Items
    doc.font('Helvetica').fontSize(7.5);
    for (const item of items) {
      const iy = doc.y;
      doc.text(item.product_name, 15, iy, { width: 85 });
      const lineHeight = doc.currentLineHeight();
      doc.text(String(item.quantity), 105, iy, { width: 25, align: 'center' });
      doc.text(fmt(item.unit_price), 130, iy, { width: 40, align: 'right' });
      doc.text(fmt(item.subtotal), 170, iy, { width: 40, align: 'right' });
      doc.moveDown(0.2);
    }

    // Totals
    doc.moveDown(0.2);
    doc.moveTo(15, doc.y).lineTo(211, doc.y).stroke();
    doc.moveDown(0.3);

    const totals = [
      ['Subtotal', fmt(sale.subtotal)],
      ...(parseFloat(sale.discount) > 0 ? [['Discount', `-${fmt(sale.discount)}`]] : []),
      ...(parseFloat(sale.tax) > 0 ? [['Tax', fmt(sale.tax)]] : []),
    ];

    doc.fontSize(7.5);
    for (const [label, val] of totals) {
      const ty = doc.y;
      doc.text(label, 15, ty, { width: 120 });
      doc.text(val, 135, ty, { width: 75, align: 'right' });
      doc.moveDown(0.2);
    }

    doc.moveDown(0.1);
    doc.moveTo(15, doc.y).lineTo(211, doc.y).stroke();
    doc.moveDown(0.2);
    doc.font('Helvetica-Bold').fontSize(9);
    const totalY = doc.y;
    doc.text('TOTAL', 15, totalY, { width: 120 });
    doc.text(fmt(sale.total), 135, totalY, { width: 75, align: 'right' });
    doc.moveDown(0.3);

    doc.font('Helvetica').fontSize(7.5);
    const cashY = doc.y;
    doc.text('Amount Paid', 15, cashY, { width: 120 });
    doc.text(fmt(sale.amount_paid), 135, cashY, { width: 75, align: 'right' });
    doc.moveDown(0.2);
    const changeY = doc.y;
    doc.text('Change', 15, changeY, { width: 120 });
    doc.text(fmt(sale.change_given), 135, changeY, { width: 75, align: 'right' });
    doc.moveDown(0.5);

    doc.moveTo(15, doc.y).lineTo(211, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(8).font('Helvetica').text('Thank you for shopping with us!', 15, doc.y, { width: 196, align: 'center' });

    doc.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to generate receipt' });
  }
};

module.exports = { generateReceiptPDF };
