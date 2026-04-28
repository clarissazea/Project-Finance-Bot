# Project Finance Bot

Project Finance Bot adalah aplikasi chatbot berbasis keuangan yang mengintegrasikan backend Python dengan frontend berbasis Node.js. Aplikasi ini dirancang untuk memberikan interaksi real-time terkait informasi finansial menggunakan teknologi seperti WebSocket dan gRPC.

## Anggota Tim

| No  | Nama                | NRP        |
|-----|---------------------|------------|
| 1   | Kanafira Vanesha P. | 5027241010 |
| 2   | Clarissa Aydin R.   | 5027241014 |
| 3   | Mutiara Diva J.     | 5027241083 |

<img width="1408" height="768" alt="Gemini_Generated_Image_3xc98o3xc98o3xc9" src="https://github.com/user-attachments/assets/2e57eaaa-db76-4a3c-94a9-e2b3f54e6694" />

---

3 Komponen Utama Finance Bot:

1. Client-Side: Yaitu Browser sebagai UI yang bersifat event-driven.
2. Middleware atau Bridge: Menggunakan Node.js. Saya memilih Node.js karena kemampuannya menangani koneksi WebSocket secara non-blocking.
3. Backend & Storage: Menggunakan Python gRPC Server yang terhubung dengan users.json sebagai penyimpanan persisten.
---

## Cara Menjalankan Project

### Install python dependency

```
pip install -r requirements.txt
```

### Run Back-end

```
python server.py
```

### Run Front-end

```
npm start
```

---

## 🌟 Keunggulan Project

Project Finance Bot memiliki beberapa keunggulan utama yang membuatnya lebih dari sekadar aplikasi chatbot biasa:

### ⚡ 1. Real-time Communication
Menggunakan WebSocket sehingga komunikasi antara frontend dan backend berlangsung secara real-time tanpa perlu refresh halaman.

### 🔗 2. Arsitektur Modern (gRPC + API)
Menggunakan gRPC untuk komunikasi antar service yang lebih cepat, efisien, dan scalable dibandingkan REST biasa.

### 🧠 3. Siap Integrasi AI
Struktur backend dirancang agar mudah dikembangkan dengan fitur AI seperti:
- Analisis finansial
- Rekomendasi pengeluaran
- Prediksi keuangan

### 🧩 4. Modular & Scalable
Kode dipisahkan antara frontend dan backend sehingga:
- Mudah dikembangkan oleh tim
- Mudah ditambahkan fitur baru
- Cocok untuk project skala besar

### 🌐 5. Kombinasi Multi-Technology
Menggabungkan beberapa teknologi sekaligus:
- Python (processing & logic)
- Node.js (interface)
- WebSocket (real-time)
- gRPC (high-performance communication)

Hal ini menunjukkan kemampuan integrasi sistem yang kuat.

### 🛠️ 6. Mudah Dikembangkan & Di-deploy
Struktur project sudah siap untuk:
- Deployment ke cloud (Docker, VPS)
- Pengembangan lanjutan
- Integrasi dengan API eksternal

### 🎯 7. Relevan dengan Kebutuhan Nyata
Aplikasi berfokus pada bidang finansial yang:
- Sangat dibutuhkan di kehidupan sehari-hari
- Memiliki potensi dikembangkan menjadi produk nyata
