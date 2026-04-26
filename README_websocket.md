# Integrasi WebSocket - Finance Chatbot
Pengembangan dari proyek insist-checkbot untuk memenuhi 4 fitur wajib tugas Week 7.

## Perubahan yang Dilakukan

### File yang Dimodifikasi/Ditambah
- `app.js` → dimodifikasi (tambah WebSocket + Socket.IO)
- `public/dashboard.html` → file baru (Web UI event-driven)

## Cara Install & Jalankan

```bash
cd insist/chatbot
npm install socket.io   # tambahan dependency
node app.js             # jalankan server
# Buka browser: http://localhost:3000/public/dashboard.html
```

---

## Penjelasan 4 Fitur Wajib

### 1. Implementasi WebSocket
- Di `app.js`: `http.createServer(app)` + `new Server(server)` membuat WebSocket berjalan di port yang sama (3000).
- gRPC stream (GetHistory, GetSummary, AddTransaction) dihubungkan ke Socket.IO via `socket.emit(...)`.
- Browser menerima data real-time tanpa polling.

### 2. Event-Driven UI (3 Komponen)
Semua 3 komponen berubah dinamis berdasarkan pesan WebSocket:

| Komponen | Event yang Ditangani | Perubahan UI |
|---|---|---|
| Balance Gauge | `balance_update` | Nilai income/expense/net + progress bar berubah |
| Log Aktivitas | `history_item`, `transaction_added`, `alert` | Item baru muncul real-time dengan animasi |
| Status Indikator | `server_ping`, `alert`, `connect/disconnect` | Badge ONLINE/OFFLINE/ERROR berubah otomatis |

### 3. Server-Initiated Events
Server mendorong data ke browser TANPA ada request dari client:
- **`server_ping`**: dikirim setiap 30 detik via `setInterval`, berisi timestamp + jumlah klien aktif.
- **`alert`**: dikirim otomatis oleh server setelah transaksi berhasil/gagal.
- **`transaction_added`**: di-broadcast ke SEMUA klien (`io.emit`) saat ada transaksi baru.

### 4. Command & Control Bridge
Browser mengirim instruksi via WebSocket → server memicu gRPC:

| Socket Event (Browser → Server) | gRPC yang Dipanggil |
|---|---|
| `cmd_get_balance` | `client.GetSummary(...)` |
| `cmd_get_history` | `client.GetHistory(...)` (stream) |
| `cmd_add_transaction` | `client.AddTransaction(...)` |
