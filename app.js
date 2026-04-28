const express = require("express");
const bodyParser = require("body-parser");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
 
const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public"))); // serve dashboard.html

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ===================================
// gRPC SETUP
// ===================================
const PROTO_PATH = path.join(__dirname, "finance.proto");
const packageDef = protoLoader.loadSync(PROTO_PATH);
const grpcObj = grpc.loadPackageDefinition(packageDef);
const client = new grpcObj.finance.FinanceService(
  "localhost:50051",
  grpc.credentials.createInsecure()
);
 
// ===================================
// WEBSOCKET SETUP (FEATURE 1)
// WebSocket Bridge: menghubungkan gRPC stream ke browser secara real-time
// ===================================
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});
 
// Simpan referensi history stream agar bisa di-cancel
let activeHistoryStreams = {};
 
// ===================================
// PERSISTENT USER STORAGE
// Simpan dan load user registry dari file JSON
// ===================================
const USERS_FILE = path.join(__dirname, "users.json");

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf-8');
      const usersArray = JSON.parse(data);
      const userMap = new Map();
      usersArray.forEach(u => {
        userMap.set(u.userId, u);
      });
      console.log(`✅ Loaded ${usersArray.length} users from ${USERS_FILE}`);
      return userMap;
    }
  } catch (err) {
    console.error(`⚠️ Error loading users: ${err.message}`);
  }
  return new Map();
}

function saveUsers(userMap) {
  try {
    const usersArray = Array.from(userMap.values());
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersArray, null, 2), 'utf-8');
    console.log(`💾 Saved ${usersArray.length} users to ${USERS_FILE}`);
  } catch (err) {
    console.error(`⚠️ Error saving users: ${err.message}`);
  }
}
 
// ===================================
// In-memory user registry
// Menyimpan daftar user yang sudah terdaftar di sesi ini.
// Key: userId (string), Value: { userId, userName, registeredAt }
// Load dari file jika ada, atau mulai kosong
// ===================================
const userRegistry = loadUsers();
 
io.on("connection", (socket) => {
  console.log(`🔌 Browser terhubung via WebSocket: ${socket.id}`);
 
  // Kirim daftar user yang sudah ada ke browser yang baru connect
  socket.emit("user_list", Array.from(userRegistry.values()));
 
  // ===================================
  // FEATURE 4: Command & Control Bridge
  // Browser mengirim perintah via WebSocket → memicu pemanggilan gRPC
  // ===================================
  socket.on("cmd_get_balance", (data) => {
    const userId = data.userId || "user0";
    console.log(`📡 [WS CMD] GetSummary untuk userId=${userId}`);
 
    client.GetSummary({ userId: String(userId) }, (err, response) => {
      if (err) {
        // Deteksi user not found dari gRPC
        if (
          err.code === grpc.status.NOT_FOUND ||
          (err.details && err.details.toLowerCase().includes("not found"))
        ) {
          socket.emit("user_error", {
            userId,
            message: `User "${userId}" tidak ditemukan. Silakan register terlebih dahulu.`
          });
        } else {
          socket.emit("alert", {
            type: "error",
            message: "❌ Gagal mengambil saldo: " + (err.details || err.message)
          });
        }
        return;
      }
 
      const totalIncome = response.totalIncome || 0;
      const totalExpense = response.totalExpense || 0;
      const currentBalance = totalIncome - totalExpense;
 
      // FEATURE 3: Server-Initiated Event → kirim data tanpa diminta ulang
      socket.emit("balance_update", {
        totalIncome,
        totalExpense,
        currentBalance
      });
    });
  });
 
  socket.on("cmd_get_history", (data) => {
    const userId = data.userId || "user0";
    console.log(`📡 [WS CMD] GetHistory stream untuk userId=${userId}`);
 
    // Batalkan stream sebelumnya jika ada
    if (activeHistoryStreams[socket.id]) {
      activeHistoryStreams[socket.id].cancel();
    }
 
    const stream = client.GetHistory({ userId: String(userId) });
    activeHistoryStreams[socket.id] = stream;
 
    let transactions = [];
 
    // FEATURE 1: gRPC stream data mengalir ke WebSocket secara real-time
    stream.on("data", (tx) => {
      transactions.push(tx);
      // FEATURE 2: Event-Driven UI - setiap data stream langsung dikirim ke browser
      socket.emit("history_item", tx);
    });
 
    stream.on("end", () => {
      socket.emit("history_end", { count: transactions.length });
      delete activeHistoryStreams[socket.id];
    });
 
    stream.on("error", (err) => {
      let msg = "❌ Gagal membaca riwayat.";
      if (err.code === grpc.status.NOT_FOUND)
        msg = `User "${userId}" tidak ditemukan. Silakan register terlebih dahulu.`;
      else if (err.code === grpc.status.UNAVAILABLE)
        msg = "❌ Server backend tidak bisa dihubungi.";
 
      // FEATURE 3: Server push alert ke browser tanpa request dari client
      socket.emit("alert", { type: "error", message: msg });
      delete activeHistoryStreams[socket.id];
    });
  });
 
  socket.on("cmd_add_transaction", (data) => {
    const { userId, type, amount, category } = data;
    console.log(`📡 [WS CMD] AddTransaction: ${type} ${amount} (${category})`);
 
    client.AddTransaction(
      {
        userId: String(userId || "user0"),
        type: String(type),
        amount: Number(amount),
        category: String(category)
      },
      (err, response) => {
        if (err) {
          socket.emit("alert", {
            type: "error",
            message: "❌ Gagal mencatat transaksi."
          });
          return;
        }
 
        // FEATURE 3: Server-Initiated Event - kirim notifikasi otomatis ke semua browser
        io.emit("alert", {
          type: "success",
          message: `✅ Transaksi berhasil: ${type === "income" ? "+" : "-"}Rp ${Number(amount).toLocaleString("id-ID")} (${category})`
        });
 
        // Broadcast ke semua client agar balance semua user ter-update
        io.emit("transaction_added", { userId, type, amount, category });
      }
    );
  });
 
  // ===================================
  // USER MANAGEMENT — cmd_register_user
  // Browser mengirim request register user baru via WebSocket.
  // Flow: cek duplikat → coba GetSummary (validasi ke gRPC) → simpan registry
  //       → emit user_registered (sukses) atau user_error (gagal)
  // ===================================
  socket.on("cmd_register_user", (data) => {
    const userId   = String(data.userId   || "").trim();
    const userName = String(data.userName || userId).trim();
 
    if (!userId) {
      socket.emit("user_error", { message: "User ID tidak boleh kosong." });
      return;
    }
 
    console.log(`👤 [WS CMD] Register user: ${userId} (${userName})`);
 
    // Cek apakah user sudah ada di registry lokal
    if (userRegistry.has(userId)) {
      // User sudah ada — konfirmasi saja ke browser (tidak error)
      socket.emit("user_registered", {
        userId,
        userName: userRegistry.get(userId).userName,
        alreadyExists: true
      });
      return;
    }
 
    // Daftarkan langsung ke registry — Python backend sekarang auto-create user
    // via _ensure_user(), jadi tidak perlu validasi GetSummary dulu.
    const entry = { userId, userName, registeredAt: new Date().toISOString() };
    userRegistry.set(userId, entry);
 
    console.log(`User "${userId}" berhasil didaftarkan ke registry.`);
 
    // Simpan ke file
    saveUsers(userRegistry);
 
    // Broadcast ke SEMUA browser agar list mereka ter-update juga
    io.emit("user_registered", { userId, userName });
 
    // Kirim list terbaru ke browser yang melakukan register
    socket.emit("user_list", Array.from(userRegistry.values()));
    });

  // ===================================
  // USER MANAGEMENT — cmd_delete_user
  // Browser mengirim request delete user via WebSocket.
  // Flow: hapus dari registry → broadcast ke semua client
  // ===================================
  socket.on("cmd_delete_user", (data) => {
    const userId = String(data.userId || "").trim();

    if (!userId) {
      socket.emit("user_error", { message: "User ID tidak boleh kosong." });
      return;
    }

    // Cegah delete user0 (default user)
    if (userId === "user0") {
      socket.emit("user_error", { message: "User 0 tidak bisa dihapus (default user)." });
      return;
    }

    console.log(`👤 [WS CMD] Delete user: ${userId}`);

    if (!userRegistry.has(userId)) {
      socket.emit("user_error", { message: `User "${userId}" tidak ditemukan.` });
      return;
    }

    userRegistry.delete(userId);
    console.log(`User "${userId}" berhasil dihapus.`);

    // Simpan ke file
    saveUsers(userRegistry);

    // Broadcast ke SEMUA browser agar list mereka ter-update
    io.emit("user_deleted", { userId });
    io.emit("user_list", Array.from(userRegistry.values()));
  });

  socket.on("disconnect", () => {
    // Bersihkan stream yang aktif
    if (activeHistoryStreams[socket.id]) {
      activeHistoryStreams[socket.id].cancel();
      delete activeHistoryStreams[socket.id];
    }
    console.log(`🔌 Browser disconnect: ${socket.id}`);
  });
});
 
// ===================================
// FEATURE 3: Server-Initiated Events - Periodic Server Push
// Server secara proaktif push status setiap 30 detik ke semua browser
// ===================================
setInterval(() => {
  io.emit("server_ping", {
    timestamp: new Date().toLocaleTimeString("id-ID"),
    message: "Server masih aktif",
    connectedClients: io.engine.clientsCount
  });
}, 30000);
 
// ===================================
// REST ROUTES (tetap dipertahankan untuk backward compatibility)
// ===================================
 
function extractAmount(message) {
  const match = message.match(/\d+(?:,\d{3})*|\d+/);
  if (match) return parseInt(match[0].replace(/,/g, ""), 10);
  return null;
}
 
function detectCategory(message) {
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes("eat") || lowerMessage.includes("makan") || lowerMessage.includes("food") || lowerMessage.includes("dinner") || lowerMessage.includes("lunch") || lowerMessage.includes("breakfast")) return "food";
  if (lowerMessage.includes("belanja") || lowerMessage.includes("shopping") || lowerMessage.includes("buy") || lowerMessage.includes("beli")) return "shopping";
  if (lowerMessage.includes("transport") || lowerMessage.includes("transportasi") || lowerMessage.includes("travel") || lowerMessage.includes("bus") || lowerMessage.includes("taxi") || lowerMessage.includes("ojek")) return "transport";
  if (lowerMessage.includes("tabung") || lowerMessage.includes("menabung") || lowerMessage.includes("saving") || lowerMessage.includes("save")) return "savings";
  return "others";
}
 
function detectType(message) {
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes("income") || lowerMessage.includes("gaji") || lowerMessage.includes("earning") || lowerMessage.includes("earn") || lowerMessage.includes("dapat") || lowerMessage.includes("terima") || lowerMessage.includes("bonus")) return "income";
  return "expense";
}
 
function formatResponse(type, amount, category) {
  const categoryEmojis = { food: "🍔 Makan", shopping: "🛍️ Belanja", transport: "🚗 Transport", savings: "💰 Tabungan", others: "💸 Lainnya" };
  const formattedAmount = `Rp ${amount.toLocaleString("id-ID")}`;
  const catStr = categoryEmojis[category] || "💸 Lainnya";
  if (type === "income") {
    return `✅ *TRANSAKSI BERHASIL*\n───────────────────────\n🗂️ *Kategori:* 🟢 Pemasukan\n💵 *Jumlah:*   +${formattedAmount}`;
  }
  return `✅ *TRANSAKSI BERHASIL*\n───────────────────────\n🗂️ *Kategori:* 🔴 ${catStr}\n💴 *Jumlah:*   -${formattedAmount}`;
}
 
app.post("/webhook", (req, res) => {
  const message = req.body.message || "";
  const userId = req.body.user_id || "user1";
 
  console.log(`📨 Message from ${userId}: "${message}"`);
 
  if (message.toLowerCase().includes("balance") || message.toLowerCase().includes("saldo") || message.toLowerCase().includes("check balance")) {
    client.GetSummary({ userId: String(userId) }, (err, response) => {
      if (err) {
        return res.json({ reply: "❌ Gagal mendapatkan saldo: " + (err.details || "Terjadi kesalahan internal") });
      }
      const totalIncome = response.totalIncome || 0;
      const totalExpense = response.totalExpense || 0;
      const currentBalance = totalIncome - totalExpense;
      const balanceSign = currentBalance < 0 ? "-" : "";
      const status = currentBalance < 0 ? "⚠️ (Defisit)" : "✅ (Balance)";
      const reply = `💼 *LAPORAN KEUANGAN* 💼\n────────────────────────\n🟢 *Pemasukan*   : Rp ${totalIncome.toLocaleString("id-ID")}\n🔴 *Pengeluaran* : Rp ${totalExpense.toLocaleString("id-ID")}\n────────────────────────\n💳 *SISA SALDO*  : ${balanceSign}Rp ${Math.abs(currentBalance).toLocaleString("id-ID")} ${status}`;
 
      // FEATURE 3: Push ke semua browser yang connect saat balance dicek via REST
      io.emit("balance_update", { totalIncome, totalExpense, currentBalance });
 
      if (req.headers["user-agent"] && req.headers["user-agent"].includes("curl")) return res.send(reply + "\n");
      res.json({ reply });
    });
    return;
  }
 
  if (message.toLowerCase().includes("history") || message.toLowerCase().includes("riwayat") || message.toLowerCase().includes("transaksi")) {
    const callStream = client.GetHistory({ userId: String(userId) });
    let historyReply = "📜 *BUKU RIWAYAT TRANSAKSI* 📜\n───────────────────────────\n";
    let transactionCount = 0;
    const catMap = { food: "🍔 Makan", shopping: "🛍️ Belanja", transport: "🚗 Transport", savings: "💰 Tabungan", others: "💸 Lainnya" };
 
    callStream.on("data", (tx) => {
      transactionCount++;
      const isIncome = tx.type === "income";
      const icon = isIncome ? "🟢 Pemasukan" : "🔴 Pengeluaran";
      const sign = isIncome ? "+" : "-";
      const cat = isIncome ? "" : `- ${catMap[tx.category] || tx.category}`;
      historyReply += `${transactionCount}. ${icon} ${cat}\n   ${sign}Rp ${tx.amount.toLocaleString("id-ID")}\n\n`;
 
      // FEATURE 2: Push tiap item ke browser real-time
      io.emit("history_item", tx);
    });
 
    callStream.on("end", () => {
      historyReply += `───────────────────────────\n📋 *Total Catatan:* ${transactionCount} transaksi`;
      if (req.headers["user-agent"] && req.headers["user-agent"].includes("curl")) return res.send(historyReply + "\n");
      res.json({ reply: historyReply });
    });
 
    callStream.on("error", (err) => {
      let errMessage = "❌ Terjadi masalah saat membaca riwayat.";
      if (err.code === grpc.status.NOT_FOUND) errMessage = "📝 Anda belum memiliki catatan transaksi apa pun.";
      else if (err.code === grpc.status.UNAVAILABLE) errMessage = "❌ Server Backend (Python) sedang mati.";
      if (req.headers["user-agent"] && req.headers["user-agent"].includes("curl")) return res.send(errMessage + "\n");
      return res.json({ reply: errMessage });
    });
 
    return;
  }
 
  const amount = extractAmount(message);
  if (!amount) return res.json({ reply: "❌ Please provide an amount (e.g., 'income 100000' or 'eat 20000')" });
 
  const type = detectType(message);
  const category = detectCategory(message);
 
  client.AddTransaction(
    { userId: String(userId), type: String(type), amount: Number(amount), category: String(category) },
    (err, response) => {
      if (err) return res.json({ reply: "❌ Error recording transaction. Please try again." });
      const reply = formatResponse(type, amount, category);
 
      // FEATURE 3: Push notifikasi ke semua browser setelah transaksi via REST
      io.emit("alert", {
        type: "success",
        message: `✅ Transaksi baru: ${type === "income" ? "+" : "-"}Rp ${amount.toLocaleString("id-ID")} (${category})`
      });
      io.emit("transaction_added", { userId, type, amount, category });
 
      if (req.headers["user-agent"] && req.headers["user-agent"].includes("curl")) return res.send(reply + "\n");
      res.json({ reply });
    }
  );
});
 
app.get("/health", (req, res) => res.send("OK"));
 
// ===================================
// START SERVER (gunakan http server, bukan app.listen)
// ===================================
server.listen(3000, () => {
  console.log("🚀 Finance Chatbot + WebSocket Server running on port 3000");
  console.log("📍 Webhook endpoint: POST /webhook");
  console.log("📍 Dashboard UI   : GET /dashboard.html");
  console.log("📍 Health check   : GET /health");
  console.log("🔌 WebSocket      : ws://localhost:3000");
});
 