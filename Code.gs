/** SIWARTA Google Apps Script backend. */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('SIWARTA — Sistem Iuran Warga')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function setupSIWARTA() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Buka Apps Script dari Google Spreadsheet SIWARTA.');
  const sheetNames = ['Pengaturan', 'Warga', 'Tagihan', 'Pembayaran', 'Pengeluaran', 'LogAktivitas'];
  sheetNames.forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
  });
  SpreadsheetApp.getUi().alert('Kerangka database SIWARTA berhasil dibuat. Header dan akun admin perlu dikonfigurasi sebelum digunakan.');
}
