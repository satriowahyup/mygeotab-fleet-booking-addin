# Desain booking kendaraan untuk MyGeotab Add-In

## Rekomendasi

Untuk kebutuhan awal dengan lima kendaraan, simpan booking menggunakan **MyGeotab Add-In Storage API** (`AddInData`), bukan `localStorage` browser dan bukan tabel/entitas telematika seperti `Device`. Geotab mendokumentasikan Storage API sebagai penyimpanan data JSON umum milik add-in di database customer; record dipisahkan menggunakan `AddInId`. Ini memenuhi preferensi tanpa database eksternal.

Add-in perlu melakukan operasi melalui MyGeotab API dan sesi pengguna yang sedang login. Jangan menyimpan username/password atau API key di HTML/JavaScript. Hak akses pengguna MyGeotab tetap berlaku.

## Model data awal

Simpan satu booking per `AddInData` record. Contoh isi `details`:

```json
{
  "bookingKey": "uuid",
  "deviceId": "geotab-device-id",
  "startUtc": "2026-11-12T08:00:00Z",
  "endUtc": "2026-11-12T10:00:00Z",
  "status": "confirmed",
  "purpose": "",
  "createdBy": "user-id",
  "createdAtUtc": "2026-11-01T04:30:00Z"
}
```

Isi `addInId` dengan ID add-in yang tetap dan gunakan `groups` sesuai cakupan pengguna yang boleh melihat data. Simpan `AddInData.id` hasil API untuk mengubah atau menghapus record. Untuk audit sederhana, perubahan pembatalan dapat mengubah `status` menjadi `cancelled` alih-alih menghapus record.

Satu record per booking lebih mudah dicari, diperbarui, dan dibatalkan dibanding satu record besar berisi seluruh booking. Data `AddInData.details` dibatasi 10.000 karakter per record. Fitur pencariannya tidak mendukung kondisi `AND`/`OR`, sehingga untuk lima kendaraan dan volume awal rendah, ambil record milik add-in lalu lakukan filter booking di klien.

## Aturan booking yang perlu diterapkan

- Simpan waktu sebagai ISO-8601 UTC; tampilkan dan inputkan waktu menurut zona waktu lokasi/customer.
- Validasi `startUtc < endUtc`.
- Anggap bentrok bila booking aktif untuk kendaraan yang sama memenuhi `newStart < existingEnd && newEnd > existingStart`.
- Saat add-in dibuka, muat ulang booking dari API; jangan menjadikan cache browser sebagai sumber kebenaran.
- Periksa ulang bentrok sesaat sebelum membuat booking dan tampilkan error API dengan jelas.
- Tentukan kebijakan siapa yang boleh membuat, membatalkan, atau melihat booking; `ViewOnly` hanya memiliki hak `Get` untuk Storage API menurut dokumentasi, sementara operasi tulis memerlukan clearance yang sesuai.

### Batasan konsistensi

Pengecekan bentrok berbasis `Get`, lalu `Add` bukan transaksi atomik: dua pengguna yang memesan kendaraan dan waktu sama pada saat hampir bersamaan masih dapat lolos pemeriksaan sebelum keduanya menulis record. Dokumentasi Storage API menjelaskan operasi penyimpanan dan clearance, tetapi tidak mendokumentasikan constraint interval/unique atau transaksi untuk mengunci slot booking.

Untuk lima kendaraan dengan risiko bentrok yang dapat ditangani secara operasional, Storage API cukup sebagai MVP, dengan pemeriksaan ulang dan prosedur pembatalan/admin. Jika bisnis mensyaratkan jaminan keras tidak mungkin double-book dalam kondisi multi-user serentak, gunakan backend dengan transaksi/constraint database atau konfirmasikan ke Geotab apakah ada mekanisme locking yang didukung sebelum implementasi. Jangan menjanjikan pencegahan race condition hanya dari UI.

## Implementasi pada repository

Implementasi berada pada `fleet-summary.html`, dengan validasi dan pemeriksaan interval di `booking-domain.js`. Konfigurasi add-in untuk URL hosting ada di `configuration.json`; instruksi setup dan tes ada di `README.md`.

Sebelum digunakan, isi `BOOKABLE_DEVICE_IDS` di `fleet-summary.html` dengan satu sampai lima ID kendaraan berbeda yang disetujui. Satu ID cukup untuk smoke test; tambahkan empat ID lain untuk mencakup seluruh armada. Sesuaikan juga URL hosting dan `supportEmail` pada konfigurasi. Halaman mendukung membuat, mengubah, dan membatalkan booking; pembatalan menyimpan status `cancelled` untuk riwayat. Pengguna hanya dapat mengubah atau membatalkan booking yang dibuat olehnya.

Tes unit domain dijalankan dengan `node --test tests/booking-domain.test.js`. Pengujian di tenant MyGeotab tetap diperlukan untuk memverifikasi izin `AddInData`, konfigurasi Add-In, zona waktu browser, dan skenario dua pengguna bersamaan.

## Referensi resmi

- [Storage API untuk Add-In](https://developers.geotab.com/myGeotab/addIns/addInStorage/) — AddInData, isolasi menggunakan `AddInId`, pencarian, batas 10.000 karakter, operasi, security clearance, dan batasan pencarian.
- [AddInData API object](https://developers.geotab.com/myGeotab/apiReference/objects/AddInData/) — properti `addInId`, `details`, `groups`, dan `id`.
- [MyGeotab API `Add` method](https://developers.geotab.com/myGeotab/apiReference/methods/Add/) — operasi Add membuat entity baru di database.
- [Developing Add-Ins](https://developers.geotab.com/myGeotab/addIns/developingAddIns/) — Add-In sebagai ekstensi MyGeotab, akses API, konfigurasi, dan kebutuhan hosting.
- [Geotab SDK map add-in samples](https://github.com/Geotab/sdk-map-addin-samples) — contoh resmi penggunaan API dan service Add-In.
