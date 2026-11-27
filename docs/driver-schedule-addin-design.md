# Desain Geotab Drive Add-In (Driver Schedule) & Notifikasi Assignment

## Ringkasan arsitektur

**Driver Schedule** adalah Geotab Drive Add-In pendamping (*companion mobile add-in*) yang berada dalam **satu repository dan satu static HTTPS hosting** dengan Web Add-In **Vehicle Booking**, namun menggunakan **file konfigurasi JSON terpisah** (`configuration-drive.json`).

Tujuan pemisahan manifest JSON dalam satu repository:
- Tetap berbagi sumber data tunggal (`AddInData` dengan `ADDIN_ID` yang sama: `ai5fRp8iC8N8GSxWdIg7PTw`) serta modul domain, API service, dan formatter tanpa duplikasi.
- Memungkinkan kontrol akses granular melalui `"enableViewSecurityId": true` secara independen antara Web Add-In dan Drive Add-In.
- Memungkinkan aktivasi/nonaktif, pembaruan versi, atau *rollback* Drive Add-In tanpa mengganggu operasional Web Add-In.

## Alur data & notifikasi

```text
[MyGeotab Web Add-In]
  ├── Admin Approve (Assign Vehicle + Driver)
  │     ├── 1. Set AddInData (status: approved, driverId, driverLogin, ...)
  │     └── 2. Add TextMessage (best-effort -> recipient: driverId)
  │
  └── Admin / Requester Cancel (booking yang sudah approved)
        ├── 1. Set AddInData (status: cancelled, cancelledBy, cancellationReason)
        └── 2. Add TextMessage (best-effort -> recipient: driverId)
                                                  │
                                                  ▼
[Geotab Drive App]
  ├── Messages / Notification  ◄── Menerima TextMessage assignment / pembatalan
  └── Driver Schedule Add-In (driver-schedule.html)
        └── Get AddInData (read-only) -> Filter milik driver yang sedang login
```

## Identifikasi driver & isolasi data (*read-only*)

- Add-in ini sepenuhnya ***read-only*** terhadap `AddInData` (tidak melakukan `Add`/`Set`/`Remove`).
- Saat halaman dibuka di Geotab Drive, add-in membaca sesi lewat `api.getSession()` lalu menjalankan `resolveDriverIdentity(api, session.userName)` secara *fail-safe*:
  - Jika akun driver diizinkan memanggil `Get User` untuk dirinya sendiri, add-in mencocokkan `details.driverId === user.id` **atau** fallback `details.driverLogin === session.userName` (*case-insensitive*).
  - Jika izin `Get User` dibatasi pada *clearance* driver, add-in tetap berfungsi normal menggunakan pencocokan `details.driverLogin === session.userName`.
- Hanya booking yang di-assign ke driver tersebut dengan status `approved`, `confirmed` (legacy), atau `cancelled` yang ditampilkan. Booking berstatus `pending`, `rejected`, atau milik driver lain tidak pernah ditampilkan maupun disimpan ke cache offline.

## Filter jadwal & tampilan mobile

Halaman `driver-schedule.html` dirancang *mobile-first* dengan kartu vertikal dan target sentuh minimal 44px:

- **Filter rentang waktu (*Time range*):**
  - **`Upcoming`** *(default)*: menampilkan seluruh jadwal yang belum berakhir (`endEpoch > now`), mencakup jadwal **Sedang Berlangsung (`Ongoing`)** dan **Akan Datang (`Upcoming`)**.
  - **`Today`**: jadwal yang beririsan dengan hari ini (00:00–24:00 waktu lokal), termasuk yang sudah selesai atau dibatalkan hari ini.
  - **`This week`**: jadwal pada minggu berjalan (Senin–Minggu waktu lokal).
  - **`Custom date`**: membuka input tanggal bebas `From` dan `To` (validasi `To >= From`); menampilkan seluruh jadwal yang beririsan dengan rentang tanggal terpilih.
  - **`All`**: seluruh histori jadwal yang pernah di-assign ke driver.
- **Filter status:**
  - **`All`** *(default)*: menampilkan jadwal `Approved` (termasuk `Confirmed` legacy) dan `Cancelled`.
  - **`Approved`**: hanya jadwal aktif (`approved` / `confirmed`).
  - **`Cancelled`**: hanya jadwal yang dibatalkan beserta informasi `Cancelled by` dan `Cancellation reason`.
- **Klasifikasi state visual & urutan (*sorting*):**
  - Kartu ditandai dengan state **`Ongoing`** (`start <= now < end`), **`Upcoming`** (`start > now`), **`Completed`** (`end <= now`), atau **`Cancelled`**.
  - Kartu **`Ongoing`** selalu diprioritaskan di paling atas. Pada `Upcoming`, `Today`, `This week`, dan `Custom date`, jadwal lain diurutkan menaik (*ascending* — paling dekat dulu). Pada `All`, diurutkan menurun (*descending* — terbaru dulu).
- **Offline fallback:**
  - Setiap sinkronisasi online menyimpan snapshot *read-only* jadwal milik driver tsb ke `localStorage` perangkat (diberi kunci per `database` + `userName`).
  - Saat perangkat offline (`driveState.online === false` / `navigator.onLine === false`) atau panggilan API gagal, add-in menampilkan data terakhir dengan banner peringatan *offline mode* dan timestamp sinkronisasi terakhir.

## Mekanisme notifikasi Geotab Drive (`TextMessage`)

Notifikasi dikirim melalui MyGeotab API `Add` dengan entity `TextMessage` menggunakan `notifyDriverBestEffort` di `js/services/geotab-api.js`:

```json
{
  "typeName": "TextMessage",
  "entity": {
    "recipient": { "id": "<driverId>" },
    "user": { "id": "<senderUserId>" },
    "isDirectionToVehicle": true,
    "activeFrom": "2026-11-27T09:00:00.000Z",
    "messageContent": {
      "contentType": "Normal",
      "message": "[New Schedule] ..."
    }
  }
}
```

Catatan penting:
- **Target `recipient` (User), bukan `device`:** saat jadwal baru di-approve untuk waktu mendatang, driver sering kali belum login/assign ke kendaraan tersebut. Menargetkan `recipient` memastikan pesan masuk langsung ke akun Geotab Drive milik driver.
- ***Best-effort* & non-blocking:** kegagalan pengiriman `TextMessage` (misalnya izin messaging belum aktif pada akun pengirim/penerima) **tidak menggagalkan** penyimpanan approval atau pembatalan booking; UI Web menampilkan catatan bahwa notifikasi Drive gagal dikirim agar dapat ditindaklanjuti manual.
- **Pemicu notifikasi:**
  1. **Approve** oleh Administrator di halaman **Approval**.
  2. **Cancel** oleh Administrator pada booking `Approved`/`Confirmed`.
  3. **Cancel** oleh Pemohon pada booking `Approved`/`Confirmed` yang sudah memiliki `driverId`.

## Prasyarat konfigurasi MyGeotab & Security Clearance

1. **Instalasi konfigurasi:**
   - Ganti `YOUR_HTTPS_HOST` dan `supportEmail` di `configuration-drive.json`.
   - Pasang `configuration-drive.json` di **Administration > System > System Settings > Add-Ins** sebagai entri terpisah dari `configuration.json`.
   - Pastikan folder `assets/`, `css/`, `js/`, serta `driver-schedule.html` ikut ter-deploy pada host HTTPS yang sama dengan struktur direktori utuh.
2. **Akses Driver (`This user is a driver = Yes`):**
   - Secara bawaan Geotab, hanya user dengan setting **Driver = `Yes`** (`isDriver: true`) yang dapat login ke aplikasi Geotab Drive.
   - Untuk membatasi agar hanya driver pool tertentu yang melihat menu **Driver Schedule**, buat *sub-clearance* di bawah **`Drive App user`** dan aktifkan:
     - **View "Driver Schedule" add-in** *(dihasilkan oleh `"enableViewSecurityId": true`)*.
     - **View Add-In data** *(cukup View/Read, tidak perlu Manage/Write Add-In data)*.
     - Izin **Messaging** untuk menerima/membaca `TextMessage`.
   - Pastikan **Data Access Group** driver mencakup grup yang tersimpan pada record `AddInData` hasil booking Web.
3. **Akses Pengirim Notifikasi:**
   - Akun **Administrator** (dan **Requester** bila diinginkan notifikasi saat requester cancel) memerlukan izin mengirim `TextMessage`.

## Checklist pengujian di tenant & perangkat mobile

1. Login ke **Geotab Drive App** dengan akun driver (`isDriver = Yes`, memiliki `View Add-In data` dan `View "Driver Schedule" add-in`) dan pastikan ikon **Driver Schedule** muncul di dashboard/menu.
2. Approve sebuah booking di Web Add-In untuk driver tersebut → verifikasi `TextMessage` masuk di Geotab Drive App dan kartu jadwal tampil pada filter default `Upcoming`.
3. Uji seluruh filter: `Today`, `This week`, `Custom date` (termasuk rentang tanggal terbalik), `All`, serta filter status `All`, `Approved`, dan `Cancelled`.
4. Uji pembatalan booking yang sudah `Approved` (dari Admin maupun Requester) → verifikasi `TextMessage` pembatalan terkirim dan kartu jadwal berubah menjadi badge **Cancelled** beserta alasan pembatalan.
5. Aktifkan mode offline/Airplane Mode setelah data termuat lalu buka kembali **Driver Schedule** → verifikasi fallback cache tetap menampilkan jadwal terakhir dengan banner offline.

## Referensi resmi

- [Developing Geotab Drive Add-Ins](https://developers.geotab.com/myGeotab/addIns/developingDriveAddIns/) — konfigurasi `DriveAppLink/`, lifecycle, offline caching, dan `enableViewSecurityId`.
- [TextMessage API object](https://developers.geotab.com/myGeotab/apiReference/objects/TextMessage/) — properti `recipient`, `user`, `device`, `isDirectionToVehicle`, dan `messageContent`.
- [Storage API untuk Add-In](https://developers.geotab.com/myGeotab/addIns/addInStorage/) — izin `View Add-In data` dan scope `groups`.
