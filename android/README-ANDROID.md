# SIWARTA Android (WebView)

Project Android awal untuk membungkus Web App SIWARTA yang sudah ada. Backend tetap Google Apps Script dan database tetap Google Spreadsheet.

## Menyiapkan URL Web App

1. Deploy project Apps Script SIWARTA sebagai **Web app**.
2. Pilih **Execute as: Me**.
3. Atur akses sesuai kebijakan penggunaan. Karena SIWARTA memiliki login internal ADMIN/warga, pengaturan akses publik hanya boleh dipakai setelah pengurus memahami bahwa URL dapat dibuka siapa saja dan seluruh API harus tetap dilindungi pemeriksaan sesi/role.
4. Salin URL yang berakhiran `/exec`.

## Menjalankan APK

1. Pasang Android Studio dan buka folder `android`.
2. Tunggu Gradle Sync selesai.
3. Jalankan aplikasi pada perangkat Android atau emulator.
4. Pada layar awal, masukkan URL Web App SIWARTA yang berakhiran `/exec`.
5. URL disimpan pada perangkat dan aplikasi membuka SIWARTA.

## Membuat APK melalui GitHub Actions

1. Push branch `android-webview`.
2. Buka tab **Actions** di GitHub.
3. Jalankan workflow **Build SIWARTA Android APK** (atau tunggu workflow berjalan setelah perubahan).
4. Unduh artifact `SIWARTA-Android-debug`; di dalamnya ada `app-debug.apk`.

APK debug untuk uji coba, belum ditandatangani sebagai rilis Play Store.

## Catatan

- Perangkat membutuhkan koneksi internet.
- WebView mengaktifkan JavaScript dan DOM storage karena halaman SIWARTA memakai `google.script.run`.
- Login Google di dalam WebView dapat dibatasi oleh kebijakan keamanan Google. Untuk uji awal, gunakan deployment yang memang dirancang untuk login internal SIWARTA dan jangan memasukkan kredensial Google pada halaman yang tidak dipercaya.
- Fitur unggah bukti pembayaran belum tersedia pada antarmuka web saat ini; backend mendukung penerimaan data bukti, tetapi HTML belum menyediakan pemilih file.
- Untuk rilis produksi, perlu pengujian perangkat, pengujian keamanan, serta penandatanganan APK dengan kunci rilis.
