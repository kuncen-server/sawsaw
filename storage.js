// =====================================================
// LCST CLUB - Saweria Leaderboard Storage
// Simpan data sawer di memory + file JSON
// (Railway restart = data hilang, pakai file untuk persist)
// =====================================================

const fs   = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "saweria_data.json");

// Load data dari file kalau ada
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf8");
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn("[Storage] Gagal load data:", e.message);
  }
  return { donors: {}, history: [] };
}

// Simpan data ke file
function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.warn("[Storage] Gagal save data:", e.message);
  }
}

let db = loadData();

const Storage = {
  // Tambah donasi baru
  addDonation(robloxUsername, donatorName, amountRaw, amountFormatted, pesan) {
    const key = robloxUsername.toLowerCase();

    if (!db.donors[key]) {
      db.donors[key] = {
        robloxUsername: robloxUsername,
        donatorName:    donatorName,
        totalRaw:       0,
        totalFormatted: "",
        count:          0,
        lastSawer:      "",
      };
    }

    db.donors[key].totalRaw    += amountRaw;
    db.donors[key].count       += 1;
    db.donors[key].lastSawer    = new Date().toISOString();
    db.donors[key].donatorName  = donatorName; // update nama terbaru
    db.donors[key].totalFormatted = formatIDR(db.donors[key].totalRaw);

    // History (max 200 entri)
    db.history.unshift({
      robloxUsername, donatorName, amountRaw, amountFormatted, pesan,
      time: new Date().toISOString(),
    });
    if (db.history.length > 200) db.history = db.history.slice(0, 200);

    saveData(db);
    return db.donors[key];
  },

  // Ambil top N donor, diurutkan by totalRaw desc
  getTop(n = 50) {
    const list = Object.values(db.donors);
    list.sort((a, b) => b.totalRaw - a.totalRaw);
    return list.slice(0, n).map((d, i) => ({
      rank:           i + 1,
      robloxUsername: d.robloxUsername,
      donatorName:    d.donatorName,
      totalRaw:       d.totalRaw,
      totalFormatted: d.totalFormatted,
      count:          d.count,
      lastSawer:      d.lastSawer,
    }));
  },

  // Ambil history terbaru
  getHistory(n = 20) {
    return db.history.slice(0, n);
  },
};

function formatIDR(n) {
  if (n >= 1000000) return "Rp " + (n / 1000000).toFixed(1) + "jt";
  if (n >= 1000)    return "Rp " + (n / 1000).toFixed(0) + "rb";
  return "Rp " + n.toLocaleString("id-ID");
}

module.exports = Storage;
