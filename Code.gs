/**
 * SIWARTA v2.0 — Google Apps Script backend
 * Database persisten: Google Sheets milik pengurus.
 *
 * INSTALL:
 * 1. Buat Google Spreadsheet baru.
 * 2. Extensions > Apps Script.
 * 3. Buat Code.gs dan Index.html, salin masing-masing file.
 * 4. Jalankan setupSIWARTA() satu kali dan izinkan akses.
 * 5. Deploy > New deployment > Web app; Execute as: Me.
 *
 * Default awal: 200 unit kapasitas perencanaan, iuran Rp50.000/bulan.
 * Login awal ADMIN / 123456 — WAJIB ganti PIN setelah login.
 */
const APP = {
  NAME: 'SIWARTA',
  VERSION: '2.0.0',
  SHEETS: {
    SETTINGS:'Pengaturan', USERS:'Warga', BILLS:'Tagihan',
    PAYMENTS:'Pembayaran', EXPENSES:'Pengeluaran', LOGS:'LogAktivitas'
  }
};

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('SIWARTA — Sistem Iuran Perumahan')
    .addMetaTag('viewport','width=device-width, initial-scale=1');
}

function setupSIWARTA() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Buka Apps Script dari Google Spreadsheet SIWARTA.');
  const defs = [
    [APP.SHEETS.SETTINGS,['Kunci','Nilai']],
    [APP.SHEETS.USERS,['UserID','BlokUnit','Nama','WhatsApp','Email','Role','PINHash','Status','DibuatPada']],
    [APP.SHEETS.BILLS,['TagihanID','UserID','BlokUnit','Periode','JatuhTempo','Nominal','Dibayar','Status','DibuatPada']],
    [APP.SHEETS.PAYMENTS,['PembayaranID','TagihanID','UserID','Tanggal','Nominal','Metode','BuktiURL','Status','DiverifikasiOleh','Catatan']],
    [APP.SHEETS.EXPENSES,['PengeluaranID','Tanggal','Kategori','Keterangan','Nominal','DicatatOleh']],
    [APP.SHEETS.LOGS,['Waktu','User','Aktivitas','Detail']]
  ];
  defs.forEach(([n,h])=>{
    let sh=ss.getSheetByName(n); if(!sh) sh=ss.insertSheet(n);
    if(sh.getLastRow()===0) sh.appendRow(h);
    sh.setFrozenRows(1);
    sh.getRange(1,1,1,h.length).setFontWeight('bold').setBackground('#173b68').setFontColor('#fff');
    sh.autoResizeColumns(1,h.length);
  });
  const defaults = [
    ['NamaPerumahan','Perumahan SIWARTA'],
    ['JumlahUnit','200'],
    ['NominalIuran','50000'],
    ['TanggalJatuhTempo','10'],
    ['MataUang','IDR'],
    ['NamaBank',''],
    ['NomorRekening',''],
    ['AtasNamaRekening',''],
    ['EmailAdmin',Session.getActiveUser().getEmail()||''],
    ['FolderBuktiID','']
  ];
  const settingRows=rows_(APP.SHEETS.SETTINGS);
  defaults.forEach(([k,v])=>{if(!settingRows.some(x=>x.Kunci===k))setSetting_(k,v);});
  if(!getSetting_('FolderBuktiID')){
    const folder=DriveApp.createFolder('SIWARTA — Bukti Pembayaran');
    setSetting_('FolderBuktiID',folder.getId());
  }
  const users=rows_(APP.SHEETS.USERS);
  if(!users.some(u=>u.UserID==='ADMIN')){
    getSheet_(APP.SHEETS.USERS).appendRow([
      'ADMIN','-','Administrator', '', Session.getActiveUser().getEmail()||'',
      'ADMIN',hash_('123456'),'AKTIF',new Date()
    ]);
  }
  SpreadsheetApp.getUi().alert(
    'Setup SIWARTA v2.0 selesai.\nDatabase dan folder bukti pembayaran telah dibuat.\n\nLogin awal: ADMIN\nPIN awal: 123456\nSegera ganti PIN setelah login.'
  );
}

/* AUTH & ROLE */
function apiLogin(username,pin){
  username=String(username||'').trim().toUpperCase(); pin=String(pin||'');
  if(!username||!pin)throw new Error('Masukkan ID/unit dan PIN.');
  const u=rows_(APP.SHEETS.USERS).find(x=>
    String(x.UserID).toUpperCase()===username ||
    String(x.BlokUnit).toUpperCase()===username
  );
  if(!u||u.Status!=='AKTIF'||u.PINHash!==hash_(pin))throw new Error('ID pengguna atau PIN tidak valid.');
  const token=Utilities.getUuid();
  const sess={userId:u.UserID,name:u.Nama,role:u.Role,unit:u.BlokUnit};
  CacheService.getScriptCache().put('sess_'+token,JSON.stringify(sess),21600);
  log_(u.Nama,'LOGIN','Login berhasil');
  return {token,user:sess,config:publicConfig_()};
}
function apiLogout(token){const s=session_(token);CacheService.getScriptCache().remove('sess_'+token);if(s)log_(s.name,'LOGOUT','Keluar aplikasi');return true;}
function apiChangePin(token,oldPin,newPin){
  const s=requireSession_(token); if(String(newPin||'').length<6)throw new Error('PIN baru minimal 6 karakter.');
  const sh=getSheet_(APP.SHEETS.USERS),v=sh.getDataRange().getValues(),h=v[0];
  const i=v.findIndex((r,n)=>n>0&&r[h.indexOf('UserID')]===s.userId);
  if(i<1||v[i][h.indexOf('PINHash')]!==hash_(oldPin))throw new Error('PIN lama salah.');
  sh.getRange(i+1,h.indexOf('PINHash')+1).setValue(hash_(newPin));log_(s.name,'GANTI_PIN','PIN diperbarui');return true;
}

/* DASHBOARD */
function apiGetDashboard(token){
  const s=requireSession_(token),bills=rows_(APP.SHEETS.BILLS),payments=rows_(APP.SHEETS.PAYMENTS);
  const users=rows_(APP.SHEETS.USERS).filter(u=>u.Role==='WARGA'&&u.Status==='AKTIF');
  const expenses=rows_(APP.SHEETS.EXPENSES);
  const mineBills=s.role==='WARGA'?bills.filter(b=>b.UserID===s.userId):bills;
  const minePayments=s.role==='WARGA'?payments.filter(p=>p.UserID===s.userId):payments;
  const stats=s.role==='WARGA'?{
    bills:sum_(mineBills,'Nominal'),
    collected:sum_(minePayments.filter(p=>p.Status==='DISETUJUI'),'Nominal'),
    outstanding:mineBills.reduce((a,b)=>a+Math.max(0,num_(b.Nominal)-num_(b.Dibayar)),0)
  }:{
    residents:users.length,unitCapacity:num_(getSetting_('JumlahUnit')||200),
    billed:sum_(bills,'Nominal'),
    collected:sum_(payments.filter(p=>p.Status==='DISETUJUI'),'Nominal'),
    pending:sum_(payments.filter(p=>p.Status==='MENUNGGU'),'Nominal'),
    outstanding:bills.reduce((a,b)=>a+Math.max(0,num_(b.Nominal)-num_(b.Dibayar)),0),
    expenses:sum_(expenses,'Nominal')
  };
  return {user:s,stats,bills:mineBills.slice(-250).reverse(),payments:minePayments.slice(-250).reverse(),config:publicConfig_()};
}

/* USER MANAGEMENT — ADMIN only for staff accounts, admin/chair for resident records */
function apiListResidents(token){
  requireRole_(token,['ADMIN','KETUA']);
  return rows_(APP.SHEETS.USERS).filter(u=>u.Role==='WARGA').map(u=>({
    id:u.UserID,unit:u.BlokUnit,name:u.Nama,phone:u.WhatsApp,email:u.Email,status:u.Status,role:u.Role
  }));
}
function apiSaveResident(token,d){
  const s=requireRole_(token,['ADMIN','KETUA']);d=d||{};
  const unit=String(d.unit||'').trim().toUpperCase(),name=String(d.name||'').trim();
  if(!unit||!name)throw new Error('Blok/unit dan nama wajib diisi.');
  const sh=getSheet_(APP.SHEETS.USERS),v=sh.getDataRange().getValues(),h=v[0],uc=h.indexOf('BlokUnit');
  const i=v.findIndex((r,n)=>n>0&&String(r[uc]).toUpperCase()===unit);
  const pin=String(d.pin||'');
  if(i>0){
    const row=i+1;
    ['Nama','WhatsApp','Email','Status'].forEach(k=>sh.getRange(row,h.indexOf(k)+1).setValue(
      k==='Nama'?name:k==='WhatsApp'?(d.phone||''):k==='Email'?(d.email||''):(d.status||'AKTIF')
    ));
    if(pin){if(pin.length<6)throw new Error('PIN minimal 6 karakter.');sh.getRange(row,h.indexOf('PINHash')+1).setValue(hash_(pin));}
  }else{
    if(!pin||pin.length<6)throw new Error('PIN warga baru minimal 6 karakter.');
    const id='W'+Utilities.getUuid().slice(0,8).toUpperCase();
    sh.appendRow([id,unit,name,d.phone||'',d.email||'','WARGA',hash_(pin),d.status||'AKTIF',new Date()]);
  }
  log_(s.name,'SIMPAN_WARGA',unit+' - '+name);return true;
}
function apiListStaff(token){
  requireRole_(token,['ADMIN']);
  return rows_(APP.SHEETS.USERS).filter(u=>['ADMIN','KETUA','BENDAHARA'].includes(u.Role))
    .map(u=>({id:u.UserID,name:u.Nama,role:u.Role,email:u.Email,status:u.Status}));
}
function apiSaveStaff(token,d){
  const s=requireRole_(token,['ADMIN']);d=d||{};
  const id=String(d.id||'').trim().toUpperCase(),name=String(d.name||'').trim();
  const role=String(d.role||'').toUpperCase(),pin=String(d.pin||'');
  if(!name||!['KETUA','BENDAHARA','ADMIN'].includes(role))throw new Error('Nama dan role staf wajib benar.');
  if(id==='ADMIN')throw new Error('ID ADMIN utama tidak dapat ditimpa melalui menu ini.');
  if(!id && pin.length<6)throw new Error('PIN staf baru minimal 6 karakter.');
  const sh=getSheet_(APP.SHEETS.USERS),v=sh.getDataRange().getValues(),h=v[0];
  const i=id?v.findIndex((r,n)=>n>0&&String(r[h.indexOf('UserID')]).toUpperCase()===id):-1;
  if(i>0){
    const row=i+1;
    sh.getRange(row,h.indexOf('Nama')+1).setValue(name);
    sh.getRange(row,h.indexOf('Role')+1).setValue(role);
    sh.getRange(row,h.indexOf('Email')+1).setValue(d.email||'');
    sh.getRange(row,h.indexOf('Status')+1).setValue(d.status||'AKTIF');
    if(pin){if(pin.length<6)throw new Error('PIN minimal 6 karakter.');sh.getRange(row,h.indexOf('PINHash')+1).setValue(hash_(pin));}
  }else{
    const newId='STF-'+Utilities.getUuid().slice(0,7).toUpperCase();
    sh.appendRow([newId,'-',name,'',d.email||'',role,hash_(pin),'AKTIF',new Date()]);
  }
  log_(s.name,'KELOLA_STAF',(id||'staf baru')+'; '+role);return true;
}

/* BILLING */
function apiCreateMonthlyBills(token,period){
  const s=requireRole_(token,['ADMIN','BENDAHARA']);
  period=String(period||Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM'));
  if(!/^\d{4}-\d{2}$/.test(period))throw new Error('Periode harus YYYY-MM.');
  const amount=num_(getSetting_('NominalIuran')||50000);
  if(amount<=0)throw new Error('Nominal iuran harus lebih dari nol.');
  const residents=rows_(APP.SHEETS.USERS).filter(u=>u.Role==='WARGA'&&u.Status==='AKTIF');
  const bills=rows_(APP.SHEETS.BILLS),dueDay=Math.min(28,Math.max(1,num_(getSetting_('TanggalJatuhTempo')||10)));
  const [y,m]=period.split('-').map(Number),due=new Date(y,m-1,dueDay),sh=getSheet_(APP.SHEETS.BILLS);
  let created=0;
  residents.forEach(u=>{
    if(!bills.some(b=>b.UserID===u.UserID&&b.Periode===period)){
      sh.appendRow(['TGH-'+Utilities.getUuid().slice(0,10).toUpperCase(),u.UserID,u.BlokUnit,period,due,amount,0,'BELUM BAYAR',new Date()]);created++;
    }
  });
  log_(s.name,'BUAT_TAGIHAN',period+'; dibuat '+created);return {created,period,amount};
}
function apiSubmitPayment(token,d){
  const s=requireSession_(token);d=d||{};
  const billId=String(d.billId||''),amount=num_(d.amount),method=String(d.method||'TRANSFER').toUpperCase();
  if(amount<=0)throw new Error('Nominal pembayaran harus lebih dari nol.');
  if(!['TRANSFER','TUNAI'].includes(method))throw new Error('Metode harus TRANSFER atau TUNAI.');
  const bill=rows_(APP.SHEETS.BILLS).find(b=>b.TagihanID===billId);
  if(!bill||(s.role==='WARGA'&&bill.UserID!==s.userId))throw new Error('Tagihan tidak ditemukan.');
  const remaining=Math.max(0,num_(bill.Nominal)-num_(bill.Dibayar));
  const waiting=rows_(APP.SHEETS.PAYMENTS).filter(p=>p.TagihanID===billId&&p.Status==='MENUNGGU').reduce((a,p)=>a+num_(p.Nominal),0);
  if(amount>remaining-waiting)throw new Error('Nominal melebihi sisa tagihan yang belum diajukan.');
  const proof=d.proofBase64?saveProof_(d.proofBase64,d.proofName||'bukti.jpg'):'';
  const auto=s.role==='ADMIN'||s.role==='BENDAHARA';
  getSheet_(APP.SHEETS.PAYMENTS).appendRow([
    'BYR-'+Utilities.getUuid().slice(0,10).toUpperCase(),billId,bill.UserID,new Date(),amount,method,proof,
    auto?'DISETUJUI':'MENUNGGU',auto?s.name:'',String(d.note||'')
  ]);
  if(auto)updateBillPaid_(billId,amount);
  log_(s.name,'CATAT_PEMBAYARAN',billId+'; '+amount+'; '+(auto?'DISETUJUI':'MENUNGGU'));
  return {status:auto?'DISETUJUI':'MENUNGGU'};
}
function apiVerifyPayment(token,paymentId,decision,note){
  const s=requireRole_(token,['ADMIN','BENDAHARA']);
  const sh=getSheet_(APP.SHEETS.PAYMENTS),v=sh.getDataRange().getValues(),h=v[0];
  const i=v.findIndex((r,n)=>n>0&&r[h.indexOf('PembayaranID')]===paymentId);
  if(i<1)throw new Error('Pembayaran tidak ditemukan.');
  const status=decision==='APPROVE'?'DISETUJUI':'DITOLAK';
  if(v[i][h.indexOf('Status')]==='DISETUJUI')throw new Error('Pembayaran sudah disetujui.');
  sh.getRange(i+1,h.indexOf('Status')+1).setValue(status);
  sh.getRange(i+1,h.indexOf('DiverifikasiOleh')+1).setValue(s.name);
  sh.getRange(i+1,h.indexOf('Catatan')+1).setValue(note||'');
  if(status==='DISETUJUI')updateBillPaid_(v[i][h.indexOf('TagihanID')],num_(v[i][h.indexOf('Nominal')]));
  log_(s.name,'VERIFIKASI_PEMBAYARAN',paymentId+'; '+status);return true;
}
function apiGetPendingPayments(token){
  requireRole_(token,['ADMIN','BENDAHARA']);
  return rows_(APP.SHEETS.PAYMENTS).filter(p=>p.Status==='MENUNGGU').reverse();
}

/* EXPENSES & REPORTS */
function apiSaveExpense(token,d){
  const s=requireRole_(token,['ADMIN','BENDAHARA']);d=d||{};
  const amount=num_(d.amount);
  if(amount<=0||!d.description)throw new Error('Keterangan dan nominal wajib diisi.');
  getSheet_(APP.SHEETS.EXPENSES).appendRow([
    'OUT-'+Utilities.getUuid().slice(0,10).toUpperCase(),new Date(),
    d.category||'Operasional',d.description,amount,s.name
  ]);
  log_(s.name,'CATAT_PENGELUARAN',d.description+'; '+amount);return true;
}
function apiGetReport(token,period){
  requireRole_(token,['ADMIN','KETUA','BENDAHARA']);
  const bills=rows_(APP.SHEETS.BILLS).filter(b=>!period||String(b.Periode)===String(period));
  const payments=rows_(APP.SHEETS.PAYMENTS).filter(p=>p.Status==='DISETUJUI'&&(!period||month_(p.Tanggal)===period));
  const expenses=rows_(APP.SHEETS.EXPENSES).filter(e=>!period||month_(e.Tanggal)===period);
  return {period:period||'Semua periode',billed:sum_(bills,'Nominal'),paid:sum_(payments,'Nominal'),
    expenses:sum_(expenses,'Nominal'),
    outstanding:bills.reduce((a,b)=>a+Math.max(0,num_(b.Nominal)-num_(b.Dibayar)),0),
    bills,payments,expenses};
}

/* SETTINGS */
function apiSaveSettings(token,d){
  const s=requireRole_(token,['ADMIN']);d=d||{};
  const allowed=['NamaPerumahan','JumlahUnit','NominalIuran','TanggalJatuhTempo','NamaBank','NomorRekening','AtasNamaRekening'];
  allowed.forEach(k=>{if(Object.prototype.hasOwnProperty.call(d,k))setSetting_(k,d[k]);});
  if(num_(getSetting_('NominalIuran'))<=0)throw new Error('Nominal iuran harus lebih dari nol.');
  log_(s.name,'UBAH_PENGATURAN','Pengaturan aplikasi diperbarui');return publicConfig_();
}

/* HELPERS */
function getSheet_(n){const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(n);if(!sh)throw new Error('Sheet '+n+' belum ada. Jalankan setupSIWARTA().');return sh;}
function rows_(n){
  const v=getSheet_(n).getDataRange().getValues();if(v.length<2)return [];
  const h=v[0];return v.slice(1).filter(r=>r.some(x=>x!==''&&x!==null)).map(r=>{
    const o={};h.forEach((k,i)=>o[k]=r[i] instanceof Date?r[i].toISOString():r[i]);return o;
  });
}
function session_(t){if(!t)return null;const x=CacheService.getScriptCache().get('sess_'+t);return x?JSON.parse(x):null;}
function requireSession_(t){const s=session_(t);if(!s)throw new Error('Sesi berakhir. Silakan login kembali.');return s;}
function requireRole_(t,roles){const s=requireSession_(t);if(!roles.includes(s.role))throw new Error('Akses tidak diizinkan untuk peran '+s.role+'.');return s;}
function hash_(v){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(v),Utilities.Charset.UTF_8).map(b=>(b<0?b+256:b).toString(16).padStart(2,'0')).join('');}
function num_(v){const n=Number(String(v||0).replace(/[^\d.-]/g,''));return isFinite(n)?n:0;}
function sum_(a,k){return a.reduce((s,x)=>s+num_(x[k]),0);}
function getSetting_(k){const r=rows_(APP.SHEETS.SETTINGS).find(x=>x.Kunci===k);return r?r.Nilai:'';}
function setSetting_(k,v){const sh=getSheet_(APP.SHEETS.SETTINGS),a=sh.getDataRange().getValues(),i=a.findIndex((r,n)=>n>0&&r[0]===k);if(i>0)sh.getRange(i+1,2).setValue(v);else sh.appendRow([k,v]);}
function publicConfig_(){return {name:getSetting_('NamaPerumahan')||'Perumahan SIWARTA',units:num_(getSetting_('JumlahUnit')||200),amount:num_(getSetting_('NominalIuran')||50000),dueDay:getSetting_('TanggalJatuhTempo')||10,bank:getSetting_('NamaBank')||'',account:getSetting_('NomorRekening')||'',accountName:getSetting_('AtasNamaRekening')||''};}
function updateBillPaid_(id,amount){
  const sh=getSheet_(APP.SHEETS.BILLS),v=sh.getDataRange().getValues(),h=v[0],i=v.findIndex((r,n)=>n>0&&r[h.indexOf('TagihanID')]===id);if(i<1)return;
  const pc=h.indexOf('Dibayar')+1,bc=h.indexOf('Nominal')+1,sc=h.indexOf('Status')+1;
  const paid=num_(v[i][pc-1])+amount,total=num_(v[i][bc-1]);
  sh.getRange(i+1,pc).setValue(paid);sh.getRange(i+1,sc).setValue(paid>=total?'LUNAS':'CICILAN');
}
function saveProof_(dataUrl,name){
  const m=String(dataUrl).match(/^data:(image\/(?:png|jpeg|jpg|webp)|application\/pdf);base64,(.+)$/);
  if(!m)throw new Error('Bukti harus JPG, PNG, WEBP, atau PDF.');
  const folder=DriveApp.getFolderById(getSetting_('FolderBuktiID'));
  const blob=Utilities.newBlob(Utilities.base64Decode(m[2]),m[1],String(name||'bukti').replace(/[^\w.-]/g,'_'));
  return folder.createFile(blob).getUrl();
}
function month_(d){return Utilities.formatDate(new Date(d),Session.getScriptTimeZone(),'yyyy-MM');}
function log_(u,a,d){try{getSheet_(APP.SHEETS.LOGS).appendRow([new Date(),u,a,d]);}catch(e){}}
