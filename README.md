# MyGeotab vehicle booking add-in

Custom page add-in untuk membuat, melihat, mengubah, dan membatalkan booking kendaraan. Record booking disimpan sebagai `AddInData` di database MyGeotab; tidak ada database eksternal.

## Konfigurasi sebelum digunakan

1. Daftar kendaraan diambil dengan `Get Device` setiap add-in dibuka. Semua kendaraan yang dapat diakses akun saat itu ditampilkan; kendaraan aktif dapat dipilih, sedangkan kendaraan nonaktif ditampilkan tetapi tidak bisa dibooking. Pastikan hak akses MyGeotab pengguna sesuai.
2. `ADDIN_ID` harus tetap sama untuk semua versi add-in ini pada database MyGeotab yang sama. Jangan membuat ID baru setiap sesi. Jika membuat add-in lain di database yang sama, buat ID unik baru menggunakan [Geotab Storage API instructions](https://developers.geotab.com/myGeotab/addIns/addInStorage/).
3. Host `fleet-summary.html`, `booking-domain.js`, dan `booking.css` bersama-sama pada HTTPS. Semua asset dimuat melalui URL relatif, jadi ketiganya harus tetap dalam folder yang sama.
4. Pastikan URL di `configuration.json` menunjuk ke file `fleet-summary.html` yang sudah di-host dan isi `supportEmail`, lalu tambahkan JSON konfigurasi itu di **Administration > System > System Settings > Add-Ins**.
5. Berikan clearance MyGeotab yang mengizinkan pengguna membaca daftar `Device` serta membaca dan menulis `AddInData`. Add-in menampilkan tombol ubah/batal hanya untuk pembuat booking. Pengguna `ViewOnly` tidak dapat membuat atau mengubah booking.

## Perilaku booking

- Waktu diinput dalam zona waktu browser, lalu disimpan sebagai ISO-8601 UTC.
- Booking aktif untuk kendaraan yang sama ditolak jika interval waktu bertumpang tindih. Interval yang bersisian, misalnya booking kedua mulai tepat saat booking pertama selesai, diperbolehkan.
- Pembatalan mengubah status menjadi `cancelled`; record tidak dihapus.
- Pemeriksaan bentrok di klien bukan transaksi atomik. Dua pengguna dapat menyimpan booking bertumpang tindih secara bersamaan. Halaman memeriksa ulang setelah menyimpan dan memberi peringatan jika bentrok terdeteksi; bisnis yang memerlukan jaminan keras perlu backend transaksional.

## Pengembangan dan pengujian

Logika validasi waktu dan bentrok berada di `booking-domain.js`. Jalankan tes dengan:

```sh
node --test tests/booking-domain.test.js
```

Referensi utama: [Geotab Storage API](https://developers.geotab.com/myGeotab/addIns/addInStorage/), [AddInData object](https://developers.geotab.com/myGeotab/apiReference/objects/AddInData/), dan [Developing Add-Ins](https://developers.geotab.com/myGeotab/addIns/developingAddIns/).
