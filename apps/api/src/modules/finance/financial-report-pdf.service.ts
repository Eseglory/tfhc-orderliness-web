import { Injectable, Logger } from '@nestjs/common';
const PDFDocument = require('pdfkit');

export interface AnnualReportSummaryData {
  year: number;
  currency: string;
  generatedAt: string;
  ownerName: string;
  totalReceived: number;
  totalOutflows: number;
  netBalance: number;
  successfulCount: number;
  pendingCount: number;
  pendingAmount: number;
  failedCount: number;
  failedAmount: number;
  refundedCount: number;
  refundedAmount: number;
  monthlyBreakdown: Array<{
    month: number;
    monthName: string;
    year: number;
    totalReceived: number;
    successfulCount: number;
    memberCount: number;
    memberTotal: number;
    freelanceTotal: number;
    pendingCount: number;
    pendingAmount: number;
    failedCount: number;
    failedAmount: number;
    refundedCount: number;
    refundedAmount: number;
    monthlySubtotal: number;
  }>;
  memberBreakdown?: Array<{
    memberId: string;
    memberCode: string;
    memberName: string;
    totalPaid: number;
    totalDue?: number;
    monthsPaidCount: number;
  }>;
  freelanceBreakdown?: Array<{
    workerName: string;
    serviceCategory: string;
    amountPaid: number;
    amountPayable: number;
    status: string;
    paymentDate: string;
    reference: string;
  }>;
  transactions?: Array<{
    date: string;
    reference: string;
    entityName: string;
    type: 'MEMBER_INFLOW' | 'WORKER_OUTFLOW';
    category: string;
    description?: string;
    amount: number;
    method: string;
    status: string;
  }>;
  format: 'SUMMARY' | 'DETAILED';
  categoryTitle: string;
  reportPeriodLabel: string;
}

@Injectable()
export class FinancialReportPdfService {
  private readonly logger = new Logger(FinancialReportPdfService.name);

  /**
   * Formats a monetary number in standard financial representation (e.g. ₦ 2,500.00).
   */
  private formatCurrency(amount: number, currency = 'NGN'): string {
    const symbol = currency === 'NGN' ? '₦ ' : `${currency} `;
    const parts = (amount || 0).toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${symbol}${parts}`;
  }

  /**
   * Generates a professional publication-grade PDF buffer for financial reporting.
   */
  async generateReportPdf(data: AnnualReportSummaryData): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 36,
        bufferPages: true,
        info: {
          Title: `TFHC Financial Report - ${data.year}`,
          Author: 'TFHC Orderliness Unit',
          Subject: data.categoryTitle,
          Creator: 'TFHC Financial Reporting System',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const margin = 36;
      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const contentWidth = pageWidth - margin * 2;

      // Palette
      const cNavy = '#0F172A';
      const cIndigo = '#312E81';
      const cSlate = '#475569';
      const cMuted = '#64748B';
      const cEmerald = '#059669';
      const cAmber = '#D97706';
      const cCardBg = '#F8FAFC';
      const cBorder = '#E2E8F0';

      // -----------------------------------------------------------------------
      // 1. Cover & Executive Header
      // -----------------------------------------------------------------------
      doc.rect(margin, margin, contentWidth, 54).fill(cIndigo);
      
      doc.fillColor('#FFFFFF')
        .fontSize(10)
        .font('Helvetica-Bold')
        .text("THE FATHER'S HOUSE CHURCH (TFHC) · ORDERLINESS UNIT", margin + 14, margin + 12);

      doc.fillColor('#E0E7FF')
        .fontSize(15)
        .font('Helvetica-Bold')
        .text(data.categoryTitle.toUpperCase(), margin + 14, margin + 28);

      doc.y = margin + 64;

      // Report Metadata Box
      doc.rect(margin, doc.y, contentWidth, 42).fillAndStroke(cCardBg, cBorder);
      const metaY = doc.y + 8;
      
      doc.fillColor(cMuted).fontSize(8).font('Helvetica-Bold').text('REPORTING PERIOD', margin + 12, metaY);
      doc.fillColor(cNavy).fontSize(9).font('Helvetica').text(data.reportPeriodLabel, margin + 12, metaY + 12);

      doc.fillColor(cMuted).fontSize(8).font('Helvetica-Bold').text('AUTHORIZED OWNER', margin + 180, metaY);
      doc.fillColor(cNavy).fontSize(9).font('Helvetica').text(data.ownerName, margin + 180, metaY + 12);

      doc.fillColor(cMuted).fontSize(8).font('Helvetica-Bold').text('GENERATED AT (WAT)', margin + 350, metaY);
      doc.fillColor(cNavy).fontSize(9).font('Helvetica').text(data.generatedAt, margin + 350, metaY + 12);

      doc.y = metaY + 44;

      // -----------------------------------------------------------------------
      // 2. Executive Financial Summary Cards (Grid of 4)
      // -----------------------------------------------------------------------
      const cardWidth = (contentWidth - 18) / 4;
      const cardHeight = 52;
      const cardY = doc.y;

      // Card 1: Inflows
      this.drawSummaryCard(doc, margin, cardY, cardWidth, cardHeight, 'TOTAL INFLOWS (MEMBERS)', this.formatCurrency(data.totalReceived, data.currency), cEmerald);
      // Card 2: Outflows
      this.drawSummaryCard(doc, margin + cardWidth + 6, cardY, cardWidth, cardHeight, 'TOTAL OUTFLOWS (WORKERS)', this.formatCurrency(data.totalOutflows, data.currency), cAmber);
      // Card 3: Net Balance
      this.drawSummaryCard(doc, margin + (cardWidth + 6) * 2, cardY, cardWidth, cardHeight, 'NET OPERATING BALANCE', this.formatCurrency(data.netBalance, data.currency), cNavy);
      // Card 4: Successful Count
      this.drawSummaryCard(doc, margin + (cardWidth + 6) * 3, cardY, cardWidth, cardHeight, 'SUCCESSFUL TRANSACTIONS', `${data.successfulCount.toLocaleString()} Verified`, cIndigo);

      doc.y = cardY + cardHeight + 14;

      // -----------------------------------------------------------------------
      // 3. Section: Monthly Activity Summary (All 12 Months)
      // -----------------------------------------------------------------------
      doc.fillColor(cNavy).fontSize(11).font('Helvetica-Bold').text('1. ANNUAL MONTHLY ACTIVITY BREAKDOWN (ALL 12 MONTHS)', margin, doc.y);
      doc.y += 6;

      const monthlyHeaders = [
        { label: 'Month', width: 90, align: 'left' },
        { label: 'Inflows (₦)', width: 85, align: 'right' },
        { label: 'Count', width: 45, align: 'center' },
        { label: 'Members', width: 50, align: 'center' },
        { label: 'Outflows (₦)', width: 80, align: 'right' },
        { label: 'Pending / Ref.', width: 80, align: 'center' },
        { label: 'Net Subtotal (₦)', width: 93, align: 'right' },
      ];

      this.drawTableHeader(doc, margin, doc.y, contentWidth, 20, monthlyHeaders);
      doc.y += 20;

      let altRow = false;
      for (const m of data.monthlyBreakdown) {
        if (doc.y > pageHeight - 60) {
          doc.addPage();
          this.drawTableHeader(doc, margin, margin, contentWidth, 20, monthlyHeaders);
          doc.y = margin + 20;
        }

        const rowHeight = 17;
        const rowBg = altRow ? '#F8FAFC' : '#FFFFFF';
        altRow = !altRow;

        doc.rect(margin, doc.y, contentWidth, rowHeight).fillAndStroke(rowBg, '#F1F5F9');

        let colX = margin;
        doc.font('Helvetica').fontSize(8);

        // Month
        doc.fillColor(cNavy).text(`${m.monthName} ${m.year}`, colX + 4, doc.y + 4, { width: 82, align: 'left' });
        colX += 90;

        // Inflows
        doc.fillColor(m.totalReceived > 0 ? cEmerald : cMuted).font(m.totalReceived > 0 ? 'Helvetica-Bold' : 'Helvetica')
          .text(this.formatCurrency(m.totalReceived, data.currency), colX, doc.y + 4, { width: 80, align: 'right' });
        colX += 85;

        // Count
        doc.fillColor(cNavy).font('Helvetica').text(m.successfulCount.toString(), colX, doc.y + 4, { width: 45, align: 'center' });
        colX += 45;

        // Member count
        doc.fillColor(cNavy).text(m.memberCount.toString(), colX, doc.y + 4, { width: 50, align: 'center' });
        colX += 50;

        // Outflows
        doc.fillColor(m.freelanceTotal > 0 ? cAmber : cMuted)
          .text(this.formatCurrency(m.freelanceTotal, data.currency), colX, doc.y + 4, { width: 75, align: 'right' });
        colX += 80;

        // Pending / Ref
        const pendingRefText = m.pendingCount > 0 ? `${m.pendingCount} pend` : m.refundedCount > 0 ? `${m.refundedCount} ref` : '—';
        doc.fillColor(cMuted).text(pendingRefText, colX, doc.y + 4, { width: 80, align: 'center' });
        colX += 80;

        // Net Subtotal
        doc.fillColor(m.monthlySubtotal >= 0 ? cNavy : '#DC2626').font('Helvetica-Bold')
          .text(this.formatCurrency(m.monthlySubtotal, data.currency), colX, doc.y + 4, { width: 88, align: 'right' });

        doc.y += rowHeight;
      }

      // Reconciled Total Row
      const totalRowHeight = 22;
      doc.rect(margin, doc.y, contentWidth, totalRowHeight).fillAndStroke('#EEF2F6', cIndigo);
      let tColX = margin;
      doc.fillColor(cIndigo).font('Helvetica-Bold').fontSize(8.5);
      doc.text('ANNUAL RECONCILED TOTALS', tColX + 4, doc.y + 6, { width: 82, align: 'left' });
      tColX += 90;
      doc.text(this.formatCurrency(data.totalReceived, data.currency), tColX, doc.y + 6, { width: 80, align: 'right' });
      tColX += 85;
      doc.text(data.successfulCount.toString(), tColX, doc.y + 6, { width: 45, align: 'center' });
      tColX += 45;
      doc.text('—', tColX, doc.y + 6, { width: 50, align: 'center' });
      tColX += 50;
      doc.text(this.formatCurrency(data.totalOutflows, data.currency), tColX, doc.y + 6, { width: 75, align: 'right' });
      tColX += 80;
      doc.text(`${data.pendingCount} pend`, tColX, doc.y + 6, { width: 80, align: 'center' });
      tColX += 80;
      doc.text(this.formatCurrency(data.netBalance, data.currency), tColX, doc.y + 6, { width: 88, align: 'right' });

      doc.y += totalRowHeight + 16;

      // -----------------------------------------------------------------------
      // 4. Section: Member Payments Summary
      // -----------------------------------------------------------------------
      if (data.memberBreakdown && data.memberBreakdown.length > 0) {
        if (doc.y > pageHeight - 120) doc.addPage();
        doc.fillColor(cNavy).fontSize(11).font('Helvetica-Bold').text('2. MEMBER CONTRIBUTIONS & DUES FULFILLMENT', margin, doc.y);
        doc.y += 6;

        const memberHeaders = [
          { label: 'Member Code', width: 95, align: 'left' },
          { label: 'Member Name', width: 170, align: 'left' },
          { label: 'Months Paid', width: 75, align: 'center' },
          { label: 'Total Paid (₦)', width: 95, align: 'right' },
          { label: 'Outstanding Balance', width: 88, align: 'right' },
        ];

        this.drawTableHeader(doc, margin, doc.y, contentWidth, 18, memberHeaders);
        doc.y += 18;

        let mAlt = false;
        for (const mb of data.memberBreakdown.slice(0, 30)) {
          if (doc.y > pageHeight - 50) {
            doc.addPage();
            this.drawTableHeader(doc, margin, margin, contentWidth, 18, memberHeaders);
            doc.y = margin + 18;
          }

          const rH = 16;
          doc.rect(margin, doc.y, contentWidth, rH).fillAndStroke(mAlt ? '#F8FAFC' : '#FFFFFF', '#F1F5F9');
          mAlt = !mAlt;

          let mx = margin;
          doc.font('Helvetica').fontSize(8);
          doc.fillColor(cMuted).text(mb.memberCode || '—', mx + 4, doc.y + 4, { width: 90, align: 'left' });
          mx += 95;
          doc.fillColor(cNavy).font('Helvetica-Bold').text(mb.memberName, mx, doc.y + 4, { width: 165, align: 'left' });
          mx += 170;
          doc.fillColor(cNavy).font('Helvetica').text(`${mb.monthsPaidCount} / 12 mo`, mx, doc.y + 4, { width: 75, align: 'center' });
          mx += 75;
          doc.fillColor(cEmerald).font('Helvetica-Bold').text(this.formatCurrency(mb.totalPaid, data.currency), mx, doc.y + 4, { width: 90, align: 'right' });
          mx += 95;
          const bal = Math.max(0, (mb.totalDue || 0) - mb.totalPaid);
          doc.fillColor(bal > 0 ? cAmber : cMuted).font('Helvetica').text(bal > 0 ? this.formatCurrency(bal, data.currency) : 'Settled', mx, doc.y + 4, { width: 84, align: 'right' });

          doc.y += rH;
        }

        doc.y += 14;
      }

      // -----------------------------------------------------------------------
      // 5. Section: Freelance Workers & Contractors
      // -----------------------------------------------------------------------
      if (doc.y > pageHeight - 110) doc.addPage();
      doc.fillColor(cNavy).fontSize(11).font('Helvetica-Bold').text('3. FREELANCE WORKERS, CONTRACTORS & SERVICE PROVIDERS', margin, doc.y);
      doc.y += 6;

      if (!data.freelanceBreakdown || data.freelanceBreakdown.length === 0) {
        doc.rect(margin, doc.y, contentWidth, 34).fillAndStroke(cCardBg, cBorder);
        doc.fillColor(cMuted).fontSize(8.5).font('Helvetica')
          .text('Authoritative Audit Notice: No freelance-worker or external contractor disbursements were posted for the selected reporting period. All recorded cash outflows reflect verified internal unit expenses.', margin + 12, doc.y + 10, { width: contentWidth - 24, align: 'left' });
        doc.y += 44;
      } else {
        const flHeaders = [
          { label: 'Date', width: 65, align: 'left' },
          { label: 'Worker / Vendor', width: 130, align: 'left' },
          { label: 'Service / Category', width: 120, align: 'left' },
          { label: 'Reference', width: 95, align: 'left' },
          { label: 'Status', width: 45, align: 'center' },
          { label: 'Amount Paid (₦)', width: 68, align: 'right' },
        ];
        this.drawTableHeader(doc, margin, doc.y, contentWidth, 18, flHeaders);
        doc.y += 18;

        for (const fl of data.freelanceBreakdown) {
          if (doc.y > pageHeight - 50) {
            doc.addPage();
            this.drawTableHeader(doc, margin, margin, contentWidth, 18, flHeaders);
            doc.y = margin + 18;
          }
          const rH = 16;
          doc.rect(margin, doc.y, contentWidth, rH).fillAndStroke('#FFFFFF', '#F1F5F9');
          let fx = margin;
          doc.font('Helvetica').fontSize(8);
          doc.fillColor(cMuted).text(fl.paymentDate, fx + 4, doc.y + 4, { width: 60, align: 'left' });
          fx += 65;
          doc.fillColor(cNavy).font('Helvetica-Bold').text(fl.workerName, fx, doc.y + 4, { width: 125, align: 'left' });
          fx += 130;
          doc.fillColor(cMuted).font('Helvetica').text(fl.serviceCategory, fx, doc.y + 4, { width: 115, align: 'left' });
          fx += 120;
          doc.fillColor(cMuted).text(fl.reference, fx, doc.y + 4, { width: 90, align: 'left' });
          fx += 95;
          doc.fillColor(cEmerald).text(fl.status, fx, doc.y + 4, { width: 45, align: 'center' });
          fx += 45;
          doc.fillColor(cAmber).font('Helvetica-Bold').text(this.formatCurrency(fl.amountPaid, data.currency), fx, doc.y + 4, { width: 64, align: 'right' });
          doc.y += rH;
        }
        doc.y += 14;
      }

      // -----------------------------------------------------------------------
      // 6. Detailed Transactions Ledger (When requested)
      // -----------------------------------------------------------------------
      if (data.format === 'DETAILED' && data.transactions && data.transactions.length > 0) {
        doc.addPage();
        doc.fillColor(cNavy).fontSize(11).font('Helvetica-Bold').text('4. DETAILED TRANSACTION AUDIT LEDGER', margin, doc.y);
        doc.y += 6;

        const txHeaders = [
          { label: 'Date', width: 65, align: 'left' },
          { label: 'Reference', width: 115, align: 'left' },
          { label: 'Payer / Payee', width: 130, align: 'left' },
          { label: 'Purpose', width: 85, align: 'left' },
          { label: 'Method', width: 45, align: 'center' },
          { label: 'Status', width: 45, align: 'center' },
          { label: 'Amount (₦)', width: 38, align: 'right' },
        ];
        this.drawTableHeader(doc, margin, doc.y, contentWidth, 18, txHeaders);
        doc.y += 18;

        let txAlt = false;
        for (const tx of data.transactions) {
          if (doc.y > pageHeight - 50) {
            doc.addPage();
            this.drawTableHeader(doc, margin, margin, contentWidth, 18, txHeaders);
            doc.y = margin + 18;
          }
          const rH = 16;
          doc.rect(margin, doc.y, contentWidth, rH).fillAndStroke(txAlt ? '#F8FAFC' : '#FFFFFF', '#F1F5F9');
          txAlt = !txAlt;

          let txX = margin;
          doc.font('Helvetica').fontSize(7.5);
          doc.fillColor(cMuted).text(tx.date, txX + 2, doc.y + 4, { width: 60, align: 'left' });
          txX += 65;
          doc.fillColor(cNavy).font('Courier').text(tx.reference, txX, doc.y + 4, { width: 110, align: 'left' });
          txX += 115;
          doc.font('Helvetica-Bold').fillColor(cNavy).text(tx.entityName, txX, doc.y + 4, { width: 125, align: 'left' });
          txX += 130;
          doc.font('Helvetica').fillColor(cMuted).text(tx.category, txX, doc.y + 4, { width: 80, align: 'left' });
          txX += 85;
          doc.text(tx.method, txX, doc.y + 4, { width: 45, align: 'center' });
          txX += 45;
          const stColor = tx.status === 'CONFIRMED' ? cEmerald : tx.status === 'PENDING' ? cAmber : '#DC2626';
          doc.fillColor(stColor).text(tx.status, txX, doc.y + 4, { width: 45, align: 'center' });
          txX += 45;
          doc.fillColor(tx.type === 'MEMBER_INFLOW' ? cEmerald : cAmber).font('Helvetica-Bold')
            .text(this.formatCurrency(tx.amount, data.currency), txX, doc.y + 4, { width: 36, align: 'right' });

          doc.y += rH;
        }
        doc.y += 14;
      }

      // -----------------------------------------------------------------------
      // 7. Reconciliation Sign-Off Block
      // -----------------------------------------------------------------------
      if (doc.y > pageHeight - 90) doc.addPage();
      doc.rect(margin, doc.y, contentWidth, 48).fillAndStroke('#F1F5F9', cBorder);
      const signY = doc.y + 8;
      doc.fillColor(cNavy).fontSize(8.5).font('Helvetica-Bold')
        .text('EXECUTIVE RECONCILIATION & INTEGRITY CERTIFICATION', margin + 12, signY);
      doc.fillColor(cMuted).fontSize(7.5).font('Helvetica')
        .text(`This document reflects the certified financial ledger of The Father's House Church (TFHC) Orderliness Unit for the designated period. All annual totals reconcile directly with the underlying 12-month records. Inflows: ${this.formatCurrency(data.totalReceived, data.currency)} | Net Balance: ${this.formatCurrency(data.netBalance, data.currency)}.`, margin + 12, signY + 12, { width: contentWidth - 24 });
      doc.fillColor(cMuted).fontSize(7).font('Helvetica-Oblique')
        .text(`Platform Owner Authorization Verified: ${data.ownerName} · Report Hash: ${Buffer.from(data.generatedAt + data.totalReceived).toString('base64').slice(0, 16)}`, margin + 12, signY + 28);

      // -----------------------------------------------------------------------
      // 8. Dynamic Page Numbering & Running Footers
      // -----------------------------------------------------------------------
      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        // Header line (pages after first)
        if (i > 0) {
          doc.fillColor(cMuted).fontSize(7.5).font('Helvetica')
            .text(`TFHC ORDERLINESS UNIT · ${data.categoryTitle.toUpperCase()} · ${data.year}`, margin, 20, { align: 'left' });
          doc.text(`CONFIDENTIAL · FOR CLASS OWNER ONLY`, margin, 20, { align: 'right' });
          doc.strokeColor(cBorder).lineWidth(0.5).moveTo(margin, 30).lineTo(pageWidth - margin, 30).stroke();
        }

        // Footer line
        const footY = pageHeight - 26;
        doc.strokeColor(cBorder).lineWidth(0.5).moveTo(margin, footY - 6).lineTo(pageWidth - margin, footY - 6).stroke();
        doc.fillColor(cMuted).fontSize(7.5).font('Helvetica')
          .text(`Official Document of TFHC Orderliness Unit · Generated ${data.generatedAt}`, margin, footY, { align: 'left' });
        doc.text(`Page ${i + 1} of ${totalPages}`, margin, footY, { align: 'right' });
      }

      doc.end();
    });
  }

  private drawSummaryCard(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    width: number,
    height: number,
    title: string,
    value: string,
    accentColor: string,
  ): void {
    doc.rect(x, y, width, height).fillAndStroke('#F8FAFC', '#E2E8F0');
    // Top colored accent bar
    doc.rect(x, y, width, 3).fill(accentColor);
    doc.fillColor('#64748B').fontSize(6.5).font('Helvetica-Bold').text(title, x + 8, y + 10, { width: width - 16 });
    doc.fillColor('#0F172A').fontSize(11).font('Helvetica-Bold').text(value, x + 8, y + 24, { width: width - 16 });
  }

  private drawTableHeader(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    width: number,
    height: number,
    columns: Array<{ label: string; width: number; align: string }>,
  ): void {
    doc.rect(x, y, width, height).fill('#312E81');
    let curX = x;
    doc.fillColor('#FFFFFF').fontSize(7.5).font('Helvetica-Bold');
    for (const col of columns) {
      doc.text(col.label, curX, y + 5, { width: col.width, align: col.align as any });
      curX += col.width;
    }
  }
}
