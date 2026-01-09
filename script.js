// === PATCH: normalisasi NIP agar '-', '—', 'N/A', 'NULL' dianggap kosong ===
function normalizeNIP(nip) {
  if (!nip) return "";
  const v = String(nip).trim().toLowerCase();
  if (v === "-" || v === "—" || v === "n/a" || v === "na" || v === "null")
    return "";
  return String(nip).trim();
}

function normalizeNamaKey(nama) {
  return String(nama || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// === Helper: escape HTML untuk mencegah error render & XSS sederhana ===
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Bersihkan NIP menjadi hanya digit (jika ada), agar tidak gagal karena spasi
function cleanNIP(nip) {
  const s = normalizeNIP(nip);
  return s ? s.replace(/\D+/g, "") : "";
}

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  doc,
  updateDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- KONFIGURASI FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyBFe0ZP8vbKehOe8UFdoFuOKzrO-09eZ6o",
  authDomain: "surattugas-6817f.firebaseapp.com",
  projectId: "surattugas-6817f",
  storageBucket: "surattugas-6817f.firebasestorage.app",
  messagingSenderId: "349623507802",
  appId: "1:349623507802:web:52c4296054e44f9c91b163",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Cache Data
let guruMap = {};

// ================= IDENTITAS (SK & KEPALA SEKOLAH) =================
// Disimpan ke Firestore: collection "identitas", doc "main"
// Ada fallback LocalStorage jika belum pernah diset / gagal akses.
const IDENTITAS_KEY = "simtugas_identitas_v1";
let identitasCache = {
  nomorSK: "",
  tanggalSK: "", // format YYYY-MM-DD
  tentangSK: "",
  namaKepsek: "",
  golKepsek: "",
  nipKepsek: "",
};

function formatTanggalIndo(tanggalISO) {
  if (!tanggalISO) return "-";
  try {
    const d = new Date(tanggalISO);
    return d.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return tanggalISO;
  }
}

function getTanggalTTD() {
  // default: tanggal SK, kalau kosong -> hari ini
  const iso = identitasCache.tanggalSK || new Date().toISOString().slice(0, 10);
  return formatTanggalIndo(iso);
}

function renderIdentitasToUI() {
  const setText = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.innerText = v && String(v).trim() ? String(v).trim() : "-";
  };

  setText("valNomorSK", identitasCache.nomorSK);
  setText(
    "valTanggalSK",
    identitasCache.tanggalSK ? formatTanggalIndo(identitasCache.tanggalSK) : ""
  );
  setText("valTentangSK", identitasCache.tentangSK);
  setText("valNamaKepsek", identitasCache.namaKepsek);
  setText("valGolKepsek", identitasCache.golKepsek);
  setText("valNipKepsek", identitasCache.nipKepsek);

  // TTD di halaman rekap
  setText("ttdTanggal", getTanggalTTD());
  setText("ttdNama", identitasCache.namaKepsek);
  setText("ttdGol", identitasCache.golKepsek);
  setText("ttdNip", identitasCache.nipKepsek);
}

function fillFormIdentitas() {
  const setVal = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = v || "";
  };
  setVal("inNomorSK", identitasCache.nomorSK);
  setVal("inTanggalSK", identitasCache.tanggalSK);
  setVal("inTentangSK", identitasCache.tentangSK);
  setVal("inNamaKepsek", identitasCache.namaKepsek);
  setVal("inGolKepsek", identitasCache.golKepsek);
  setVal("inNipKepsek", identitasCache.nipKepsek);
}

window.toggleEditIdentitas = (show) => {
  const view = document.getElementById("viewIdentitas");
  const form = document.getElementById("formIdentitas");
  if (!view || !form) return;
  if (show) {
    fillFormIdentitas();
    view.classList.add("hidden");
    form.classList.remove("hidden");
  } else {
    form.classList.add("hidden");
    view.classList.remove("hidden");
  }
};

async function loadIdentitas() {
  // 1) LocalStorage (cepat) sebagai default
  try {
    const raw = localStorage.getItem(IDENTITAS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      identitasCache = { ...identitasCache, ...parsed };
    }
  } catch (e) {
    console.warn("Gagal baca localStorage identitas", e);
  }

  // 2) Firestore (jika bisa), override LocalStorage
  try {
    const snap = await getDoc(doc(db, "identitas", "main"));
    if (snap.exists()) {
      identitasCache = { ...identitasCache, ...snap.data() };
      try {
        localStorage.setItem(IDENTITAS_KEY, JSON.stringify(identitasCache));
      } catch {}
    }
  } catch (e) {
    // boleh gagal (misal rules), tetap lanjut
    console.warn(
      "Gagal load identitas dari Firestore (fallback localStorage).",
      e
    );
  }

  renderIdentitasToUI();
}

window.simpanIdentitas = async () => {
  if (!auth.currentUser)
    return alert("Silakan login admin untuk mengubah identitas.");

  const getVal = (id) => (document.getElementById(id)?.value || "").trim();

  const next = {
    nomorSK: getVal("inNomorSK"),
    tanggalSK: getVal("inTanggalSK"),
    tentangSK: getVal("inTentangSK"),
    namaKepsek: getVal("inNamaKepsek"),
    golKepsek: getVal("inGolKepsek"),
    nipKepsek: getVal("inNipKepsek"),
  };

  identitasCache = { ...identitasCache, ...next };

  // simpan ke localStorage dulu
  try {
    localStorage.setItem(IDENTITAS_KEY, JSON.stringify(identitasCache));
  } catch {}

  // simpan ke Firestore
  try {
    await setDoc(doc(db, "identitas", "main"), identitasCache, { merge: true });
  } catch (e) {
    console.warn(
      "Gagal simpan identitas ke Firestore (tetap tersimpan di perangkat).",
      e
    );
    alert(
      "Identitas tersimpan di perangkat, tapi gagal sinkron ke server. Periksa aturan Firestore / koneksi."
    );
  }

  renderIdentitasToUI();
  window.toggleEditIdentitas(false);
};

/* ================= NAVIGASI & UI ================= */
/* Update bagian NAVIGASI & UI */
window.showPage = (id) => {
  // Sembunyikan semua halaman
  document.querySelectorAll(".page-content").forEach((p) => {
    p.classList.add("hidden");
  });

  // Tampilkan halaman target
  const targetPage = document.getElementById(`page-${id}`);
  if (targetPage) {
    targetPage.classList.remove("hidden");
  }

  // Update status aktif sidebar
  document.querySelectorAll(".sidebar-item").forEach((item) => {
    item.classList.remove("active");

    const onclickAttr = item.getAttribute("onclick");
    if (onclickAttr && onclickAttr.includes(`'${id}'`)) {
      item.classList.add("active");
    }
  });
};

const mobileBtn = document.getElementById("mobileMenuBtn");
const sidebarEl = document.getElementById("sidebar");
const overlayEl = document.getElementById("sidebarOverlay");

if (mobileBtn)
  mobileBtn.onclick = () => {
    sidebarEl.classList.toggle("active");
    overlayEl.classList.toggle("active");
  };

if (overlayEl)
  overlayEl.onclick = () => {
    sidebarEl.classList.remove("active");
    overlayEl.classList.remove("active");
  };

window.toggleFormTugas = (show) => {
  const form = document.getElementById("formIsi");
  const btnWrapper = document.getElementById("wrapperAksiTugas");
  if (show) {
    form.classList.remove("hidden");
    btnWrapper.classList.add("hidden");
  } else {
    form.classList.add("hidden");
    btnWrapper.classList.remove("hidden");
  }
};

/* ================= AUTHENTICATION ================= */
onAuthStateChanged(auth, (user) => {
  const isLogin = !!user;
  document.getElementById("loginForm").classList.toggle("hidden", isLogin);
  document.getElementById("userProfile").classList.toggle("hidden", !isLogin);
  if (isLogin) {
    const infoEl = document.getElementById("loginInfo");
    if (infoEl) infoEl.innerText = user.email;
  }
  const adminEls = [
    document.getElementById("formGuru"),
    document.getElementById("formLampiran"),
    document.getElementById("importLampiranControls"),
    document.getElementById("wrapperAksiTugas"),
    document.getElementById("btnImportTugas"),
    document.getElementById("btnEditIdentitas"),
  ];
  adminEls.forEach((el) => {
    if (el) el.classList.toggle("hidden", !isLogin);
  });

  window.toggleFormTugas(false);
  refreshData();
});

const btnLoginEl = document.getElementById("btnLogin");
if (btnLoginEl)
  btnLoginEl.onclick = () =>
    signInWithEmailAndPassword(auth, email.value, password.value).catch(() =>
      alert("Login Gagal!")
    );
const btnLogoutEl = document.getElementById("btnLogout");
if (btnLogoutEl) btnLogoutEl.onclick = () => signOut(auth);

async function refreshData() {
  await loadGuru();
  loadLampiran();
  loadRekap();
}

/* ================= CRUD GURU ================= */
async function loadGuru() {
  const tGuru = document.getElementById("tabelGuru");
  const sGuru = document.getElementById("guruSelect");
  if (!tGuru || !sGuru) return;

  tGuru.innerHTML = "";
  sGuru.innerHTML = "";
  guruMap = {};

  const snap = await getDocs(collection(db, "guru"));

  // Kumpulkan dulu agar bisa diurutkan stabil
  const rows = [];
  snap.forEach((d) => {
    rows.push({ id: d.id, data: d.data() });
  });

  // Urutkan:
  // 1) jika punya field 'sort', gunakan itu (agar urutan import Excel persis)
  // 2) yang belum punya 'sort' diletakkan di bawah
  // 3) tie-breaker: nama
  rows.sort((a, b) => {
    const sa = Number.isFinite(+a.data.sort)
      ? +a.data.sort
      : Number.POSITIVE_INFINITY;
    const sb = Number.isFinite(+b.data.sort)
      ? +b.data.sort
      : Number.POSITIVE_INFINITY;
    if (sa !== sb) return sa - sb;

    const na = String(a.data.nama || "").localeCompare(
      String(b.data.nama || ""),
      "id",
      { sensitivity: "base" }
    );
    if (na !== 0) return na;
    return String(a.data.nip || "").localeCompare(
      String(b.data.nip || ""),
      "id",
      { sensitivity: "base" }
    );
  });

  rows.forEach(({ id, data }) => {
    guruMap[id] = data;

    const aksi = auth.currentUser
      ? `<div class="action-buttons">
          <button class="btn-primary" onclick="window.tampilEditGuru('${id}','${data.nama}','${data.nip}')"><i class="fas fa-edit"></i></button> 
          <button class="btn-danger" onclick="window.hapusGuru('${id}')"><i class="fas fa-trash"></i></button>
         </div>`
      : "-";

    tGuru.innerHTML += `<tr><td>${data.nama}</td><td>${data.nip}</td><td>${aksi}</td></tr>`;

    const o = new Option(data.nama, id);
    o.dataset.nip = data.nip;
    sGuru.add(o);
  });

  window.isiNip();
}

window.tambahGuru = async () => {
  if (!guruNama.value || !guruNip.value) return alert("Lengkapi data!");
  await addDoc(collection(db, "guru"), {
    nama: guruNama.value,
    nip: guruNip.value,
    // agar urutan input manual berada di bawah (dan stabil)
    sort: Date.now() * 1000,
  });
  guruNama.value = "";
  guruNip.value = "";
  refreshData();
};

window.tampilEditGuru = (id, n, p) => {
  document.getElementById("overlay").classList.remove("hidden");
  document.getElementById("formEditGuru").classList.remove("hidden");
  document.getElementById("editGuruId").value = id;
  document.getElementById("editGuruNama").value = n;
  document.getElementById("editGuruNip").value = p;
};

window.batalEditGuru = () => {
  document.getElementById("overlay").classList.add("hidden");
  document.getElementById("formEditGuru").classList.add("hidden");
};

window.simpanEditGuru = async () => {
  await updateDoc(doc(db, "guru", editGuruId.value), {
    nama: editGuruNama.value,
    nip: editGuruNip.value,
  });
  window.batalEditGuru();
  refreshData();
};

window.hapusGuru = async (id) => {
  if (
    confirm(
      "Hapus guru ini? Tugas terkait akan tetap ada namun nama mungkin hilang."
    )
  ) {
    await deleteDoc(doc(db, "guru", id));
    refreshData();
  }
};

/* ================= IMPORT/EXPORT DATA GURU (EXCEL) ================= */
window.downloadTemplateGuru = () => {
  // Template kolom harus sesuai untuk import: Nama, NIP
  const ws = XLSX.utils.aoa_to_sheet([
    ["Nama", "NIP"],
    ["Contoh Guru", "197611062007011010"],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Guru");
  XLSX.writeFile(wb, "Template_Data_Guru.xlsx");
};

window.openImportGuru = () => {
  const input = document.getElementById("importGuruFile");
  if (!input) return;
  input.value = ""; // reset supaya bisa pilih file yang sama lagi
  input.click();
};

window.importGuruExcel = async (file) => {
  if (!auth.currentUser) return alert("Silakan login admin untuk import data.");
  if (!file) return;

  // Pastikan cache guru terbaru untuk cek duplikasi NIP
  await loadGuru();
  const existingNips = new Set(
    Object.values(guruMap)
      .map((g) => cleanNIP(g?.nip || ""))
      .filter(Boolean)
  );

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const data = new Uint8Array(evt.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (!rows.length) return alert("File kosong atau format tidak terbaca.");

      // Cari key kolom (header) yang cocok
      const headers = Object.keys(rows[0] || {});
      const norm = (s) => String(s).trim().toLowerCase();

      const namaKey =
        headers.find((h) => norm(h) === "nama") ||
        headers.find((h) => norm(h).includes("nama"));
      const nipKey =
        headers.find((h) => norm(h) === "nip") ||
        headers.find((h) => norm(h).includes("nip"));

      if (!namaKey || !nipKey) {
        return alert(
          'Header tidak sesuai. Gunakan template dengan kolom "Nama" dan "NIP".'
        );
      }

      let added = 0;
      let skipped = 0;

      // agar urutan hasil import mengikuti urutan file Excel
      const baseSort = Date.now() * 1000;
      let batch = writeBatch(db);
      let ops = 0;

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const nama = String(r[namaKey] ?? "").trim();
        const nip = cleanNIP(r[nipKey] ?? "");

        // Nama wajib, NIP boleh kosong
        if (!nama) {
          skipped++;
          continue;
        }

        // Cegah duplikat NIP hanya jika NIP ada
        if (nip && existingNips.has(nip)) {
          skipped++;
          continue;
        }

        const ref = doc(collection(db, "guru"));
        batch.set(ref, { nama, nip, sort: baseSort + i });
        ops++;
        added++;
        if (nip) existingNips.add(nip);

        // commit bertahap agar aman (batas Firestore 500 ops/batch)
        if (ops >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          ops = 0;
        }
      }

      if (ops > 0) await batch.commit();

      alert(`Import selesai. Ditambahkan: ${added}. Dilewati: ${skipped}.`);
      refreshData();
    } catch (e) {
      console.error(e);
      alert("Gagal import. Pastikan file Excel sesuai template.");
    }
  };

  reader.readAsArrayBuffer(file);
};

// Pasang listener input file (sekali)
const importGuruFileEl = document.getElementById("importGuruFile");
if (importGuruFileEl) {
  importGuruFileEl.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    window.importGuruExcel(f);
  });
}

/* ================= CRUD TUGAS ================= */

async function loadLampiran() {
  const sLamp = document.getElementById("lampiranSelect");
  const tLamp = document.getElementById("tabelDaftarLampiran");
  if (!sLamp || !tLamp) return;

  sLamp.innerHTML = "";
  tLamp.innerHTML = "";

  const snap = await getDocs(collection(db, "lampiran"));

  const items = [];
  snap.forEach((d) => {
    const data = d.data();
    items.push({
      id: d.id,
      nama: data?.nama ?? "",
      sort: Number(data?.sort ?? 0),
    });
  });

  items.sort((a, b) => {
    const as = a.sort || 0;
    const bs = b.sort || 0;
    if (as !== bs) return as - bs;
    return String(a.nama).localeCompare(String(b.nama));
  });

  let no = 1;
  for (const it of items) {
    sLamp.add(new Option(it.nama, it.id));

    const aksi = auth.currentUser
      ? `<div class="action-buttons">
          <button class="btn-primary" onclick="window.tampilEditLampiran('${
            it.id
          }','${escapeHtml(it.nama)}')"><i class="fas fa-edit"></i></button>
          <button class="btn-danger" onclick="window.hapusLampiran('${
            it.id
          }')"><i class="fas fa-trash"></i></button>
         </div>`
      : "-";

    tLamp.innerHTML += `
      <tr>
        <td>${no}</td>
        <td>Lampiran ${no}</td>
        <td>${escapeHtml(it.nama)}</td>
        <td>${aksi}</td>
      </tr>`;
    no++;
  }

  if (sLamp.value) window.gantiLampiran();
}

// Tambahkan Fungsi Hapus Lampiran
window.hapusLampiran = async (id) => {
  if (
    confirm(
      "Hapus lampiran ini? Semua data tugas di dalamnya juga harus dihapus secara manual."
    )
  ) {
    await deleteDoc(doc(db, "lampiran", id));
    loadLampiran();
  }
};

window.tambahLampiran = async () => {
  if (!lampNama.value) return;
  await addDoc(collection(db, "lampiran"), { nama: lampNama.value });
  lampNama.value = "";
  loadLampiran();
};

window.gantiLampiran = () =>
  loadIsi(document.getElementById("lampiranSelect").value);

async function loadIsi(lampId) {
  const tIsi = document.getElementById("tabelIsi");
  if (!tIsi) return;

  tIsi.innerHTML = "";
  const snap = await getDocs(collection(db, "tugas_tambahan"));

  const rows = [];
  snap.forEach((d) => {
    const data = d.data();
    if (data.lampiranId === lampId) {
      rows.push({
        id: d.id,
        guruId: data.guruId,
        tugas: data.tugas,
        sort: Number(data.sort ?? 0),
      });
    }
  });

  rows.sort((a, b) => {
    const as = a.sort || 0;
    const bs = b.sort || 0;
    if (as !== bs) return as - bs;
    return String(a.tugas).localeCompare(String(b.tugas));
  });

  let no = 1;
  for (const r of rows) {
    const profilGuru = guruMap[r.guruId] || {
      nama: "Tidak Ditemukan",
      nip: "-",
    };

    const aksi = auth.currentUser
      ? `<div class="action-buttons">
            <button class="btn-primary" onclick="window.editIsi('${r.id}','${
          r.guruId
        }','${escapeHtml(r.tugas)}')"><i class="fas fa-edit"></i></button> 
            <button class="btn-danger" onclick="window.hapusIsi('${
              r.id
            }')"><i class="fas fa-trash"></i></button>
           </div>`
      : "-";

    tIsi.innerHTML += `<tr>
        <td>${no++}</td> 
        <td>${escapeHtml(profilGuru.nama)}</td>
        <td><span class="nip-badge">${escapeHtml(profilGuru.nip)}</span></td>
        <td>${escapeHtml(r.tugas)}</td>
        <td>${aksi}</td>
      </tr>`;
  }
}

window.tambahIsi = async () => {
  if (!tugasText.value) return alert("Tugas kosong!");
  await addDoc(collection(db, "tugas_tambahan"), {
    lampiranId: document.getElementById("lampiranSelect").value,
    guruId: document.getElementById("guruSelect").value,
    tugas: tugasText.value,
  });
  tugasText.value = "";
  window.toggleFormTugas(false);
  window.gantiLampiran();
  loadRekap();
};

window.editIsi = async (id, currentGuruId, tugasLama) => {
  document.getElementById("overlay").classList.remove("hidden");
  document.getElementById("formEditIsi").classList.remove("hidden");
  document.getElementById("editIsiId").value = id;
  document.getElementById("editIsiTugasText").value = tugasLama;

  const sEditGuru = document.getElementById("editIsiGuruSelect");
  sEditGuru.innerHTML = "";
  Object.keys(guruMap).forEach((id) => {
    let o = new Option(guruMap[id].nama, id);
    if (id === currentGuruId) o.selected = true;
    sEditGuru.add(o);
  });
};

window.batalEditIsi = () => {
  document.getElementById("overlay").classList.add("hidden");
  document.getElementById("formEditIsi").classList.add("hidden");
};

window.simpanEditIsi = async () => {
  await updateDoc(doc(db, "tugas_tambahan", editIsiId.value), {
    guruId: editIsiGuruSelect.value,
    tugas: editIsiTugasText.value,
  });
  window.batalEditIsi();
  window.gantiLampiran();
  loadRekap();
};

window.hapusIsi = async (id) => {
  if (confirm("Hapus rincian tugas ini?")) {
    await deleteDoc(doc(db, "tugas_tambahan", id));
    window.gantiLampiran();
    loadRekap();
  }
};

window.isiNip = () => {
  const sel = document.getElementById("guruSelect");
  document.getElementById("nipAuto").value =
    sel.selectedOptions[0]?.dataset.nip || "";
};

/* ================= REKAP ================= */
async function loadRekap() {
  const tRekap = document.getElementById("tabelRekap");
  if (!tRekap) return;
  tRekap.innerHTML = "";

  const snapTugas = await getDocs(collection(db, "tugas_tambahan"));
  const mapRekap = {};

  snapTugas.forEach((t) => {
    const d = t.data();
    if (!mapRekap[d.guruId]) mapRekap[d.guruId] = [];
    mapRekap[d.guruId].push(d.tugas);
  });

  let no = 1;
  Object.keys(guruMap).forEach((id) => {
    const p = guruMap[id];
    const rawTugas = mapRekap[id] || [];
    let listTugas =
      rawTugas.length === 0
        ? "-"
        : rawTugas.length === 1
        ? rawTugas[0]
        : rawTugas.map((txt, i) => `${i + 1}. ${txt}`).join("<br>");

    tRekap.innerHTML += `<tr><td>${no++}</td><td>${p.nama}</td><td>${
      p.nip
    }</td><td>${listTugas}</td></tr>`;
  });
}

/* ================= FITUR DOWNLOAD ================= */

// --- EXCEL (Umum) ---
window.downloadExcel = (tableId, fileName) => {
  const table = document.getElementById(tableId);
  if (!table) return alert("Tabel tidak ditemukan");
  const wb = XLSX.utils.table_to_book(table, { sheet: "Sheet1" });
  XLSX.writeFile(wb, `${fileName}.xlsx`);
};

// --- PDF (Umum) ---
// --- FUNGSI PDF REKAP DENGAN KOP RESMI ---
// Fungsi pembantu agar gambar proporsional
const getImageData = (url) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      // Mengirimkan dataBase64 beserta dimensi asli
      resolve({
        data: canvas.toDataURL("image/png"),
        width: img.width,
        height: img.height,
      });
    };
    img.onerror = reject;
    img.src = url;
  });
};

/* ================= IMPORT/EXPORT EXCEL (TEMPLATE & IMPORT) ================= */

// Template Excel: Lampiran
window.downloadTemplateLampiran = () => {
  const headers = [["Nama Lampiran"]];
  const contoh = [
    ["Pembina OSIS dan MPK"],
    ["Wakil Kepala Sekolah"],
    ["Koordinator BK"],
  ];
  const ws = XLSX.utils.aoa_to_sheet([...headers, ...contoh]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Lampiran");
  XLSX.writeFile(wb, "Template_Import_Lampiran.xlsx");
};

window.importLampiranExcel = async (event) => {
  const file = event?.target?.files?.[0];
  if (event?.target) event.target.value = "";
  if (!file) return;

  if (!auth.currentUser)
    return alert("Silakan login admin untuk import lampiran.");

  try {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

    const names = rows
      .map((r) => String(r["Nama Lampiran"] ?? r["Nama"] ?? "").trim())
      .filter((v) => v);

    if (names.length === 0)
      return alert("File tidak berisi kolom 'Nama Lampiran' / 'Nama'.");

    const snap = await getDocs(collection(db, "lampiran"));
    let maxSort = 0;
    snap.forEach((d) => {
      const s = Number(d.data()?.sort ?? 0);
      if (s > maxSort) maxSort = s;
    });

    let added = 0;
    for (let i = 0; i < names.length; i++) {
      const nama = names[i];
      await addDoc(collection(db, "lampiran"), { nama, sort: maxSort + i + 1 });
      added++;
    }

    await loadLampiran();
    alert(`Import lampiran selesai: ${added} data ditambahkan.`);
  } catch (e) {
    console.error(e);
    alert(`Gagal import lampiran: ${e?.message || e}`);
  }
};

// Template Excel: Tugas Aktif (berdasarkan lampiran yang dipilih)
window.downloadTemplateTugasAktif = () => {
  const select = document.getElementById("lampiranSelect");
  if (!select || !select.value) return alert("Pilih lampiran terlebih dahulu!");

  const namaLampiran = select.options[select.selectedIndex].text;
  const headers = [["Nama Guru", "NIP (opsional)", "Tugas"]];
  const contoh = [
    ["Contoh Nama Guru", "", `Tugas untuk ${namaLampiran}`],
    ["Nama Guru Lain", "1976xxxxxxxxxxxxxx", "Contoh rincian tugas lainnya"],
  ];

  const ws = XLSX.utils.aoa_to_sheet([...headers, ...contoh]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tugas");
  XLSX.writeFile(
    wb,
    `Template_Import_Tugas_${namaLampiran.replace(/\s+/g, "_")}.xlsx`
  );
};

window.importTugasAktifExcel = async (event) => {
  const file = event?.target?.files?.[0];
  if (event?.target) event.target.value = "";
  if (!file) return;

  const select = document.getElementById("lampiranSelect");
  if (!select || !select.value) return alert("Pilih lampiran terlebih dahulu!");

  const lampiranId = select.value;

  try {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

    const nipToGuruId = {};
    const nameToGuruId = {};
    Object.keys(guruMap).forEach((gid) => {
      const nip = normalizeNIP(guruMap[gid]?.nip ?? "");
      if (nip) nipToGuruId[nip] = gid;

      const nama = String(guruMap[gid]?.nama ?? "").trim();
      if (nama) nameToGuruId[normalizeNamaKey(nama)] = gid;
    });

    const items = rows
      .map((r) => ({
        nama: String(r["Nama Guru"] ?? r["Nama"] ?? r["nama"] ?? "").trim(),
        nip: normalizeNIP(r["NIP"] ?? r["NIP (opsional)"] ?? r["nip"] ?? ""),
        tugas: String(r["Tugas"] ?? r["tugas"] ?? "").trim(),
      }))
      .filter((x) => (x.nama || x.nip) && x.tugas);

    if (items.length === 0)
      return alert("File tidak berisi kolom 'Nama Guru'/'NIP' dan 'Tugas'.");

    const snap = await getDocs(collection(db, "tugas_tambahan"));
    let maxSort = 0;
    snap.forEach((d) => {
      const td = d.data();
      if (td.lampiranId === lampiranId) {
        const s = Number(td.sort ?? 0);
        if (s > maxSort) maxSort = s;
      }
    });

    let added = 0;
    let skipped = 0;

    for (let i = 0; i < items.length; i++) {
      const { nama, nip, tugas } = items[i];

      let guruId = null;
      if (nama) guruId = nameToGuruId[normalizeNamaKey(nama)] ?? null;
      if (!guruId && nip) guruId = nipToGuruId[nip] ?? null;

      if (!guruId) {
        skipped++;
        continue;
      }
      await addDoc(collection(db, "tugas_tambahan"), {
        lampiranId,
        guruId,
        tugas,
        sort: maxSort + i + 1,
      });
      added++;
    }

    window.gantiLampiran();
    loadRekap();

    alert(
      `Import tugas selesai. Ditambahkan: ${added}. Dilewati (guru tidak ditemukan): ${skipped}.`
    );
  } catch (e) {
    console.error(e);
    alert("Gagal import tugas. Pastikan file Excel sesuai template.");
  }
};

window.downloadPDF = async (tableId, fileName) => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "mm", "a4");

  // ===== Mode B: TTD mandiri dari identitasCache =====
  const namaKS = (identitasCache?.namaKepsek || "-").trim() || "-";
  const golKS = (identitasCache?.golKepsek || "-").trim() || "-";
  const nipKS = (identitasCache?.nipKepsek || "-").trim() || "-";
  const ttdTanggal =
    typeof getTanggalTTD === "function" ? getTanggalTTD() : "-";

  // ===== Preload logo (PENTING: didDrawPage harus sync) =====
  let __logoProv = null;
  let __logoSekolah = null;
  try {
    __logoProv = await getImageData("logo1.png");
    __logoSekolah = await getImageData("logo2.png");
  } catch (e) {
    console.warn("Logo gagal dimuat untuk PDF rekap", e);
  }

  try {
    doc.autoTable({
      html: `#${tableId}`,
      startY: 95, // jarak aman dari kop + judul
      theme: "grid", // ✅ border
      showHead: "firstPage", // ✅ header tabel hanya halaman 1

      headStyles: {
        fillColor: false,
        textColor: [0, 0, 0],
        halign: "center",
        lineWidth: 0.2,
        lineColor: [0, 0, 0],
      },
      styles: {
        font: "times",
        fontSize: 10,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.2,
        cellPadding: 2,
      },

      // margin kiri/kanan sesuai kebutuhan jilid
      margin: { left: 28, right: 22 },

      didDrawPage: function (data) {
        // ✅ kop & judul hanya halaman pertama
        if (data.pageNumber !== 1) return;

        // === LOGO kiri & kanan ===
        if (__logoProv) doc.addImage(__logoProv.data, "PNG", 22, 18, 22, 22);
        if (__logoSekolah)
          doc.addImage(__logoSekolah.data, "PNG", 166, 18, 22, 22);

        // === Teks Kop ===
        doc.setFont("times", "bold");
        doc.setFontSize(11);
        doc.text("PEMERINTAH PROVINSI JAWA TENGAH", 105, 22, {
          align: "center",
        });
        doc.text("DINAS PENDIDIKAN DAN KEBUDAYAAN", 105, 27, {
          align: "center",
        });

        doc.setFontSize(16);
        doc.text("SEKOLAH MENENGAH ATAS NEGERI 6", 105, 36, {
          align: "center",
        });
        doc.text("SURAKARTA", 105, 43, { align: "center" });

        doc.setFont("times", "normal");
        doc.setFontSize(9);
        doc.text(
          "Jalan Mr. Sartono No. 30 Banjarsari, Kota Surakarta Kode Pos 57135",
          105,
          49,
          { align: "center" }
        );
        doc.text(
          "Telp. (0271) 853209 | Email: info@sman6surakarta.sch.id",
          105,
          53,
          { align: "center" }
        );
        doc.text("Laman: https://www.sman6surakarta.sch.id", 105, 57, {
          align: "center",
        });

        // === Garis Kop ===
        doc.setLineWidth(0.8);
        doc.line(22, 61, 188, 61);
        doc.setLineWidth(0.2);
        doc.line(22, 62.2, 188, 62.2);

        // === Judul Laporan ===
        doc.setFont("times", "bold");
        doc.setFontSize(11);
        const judulY = 72;
        doc.text(
          "REKAPITULASI PENUGASAN GURU DALAM PROSES BELAJAR MENGAJAR,",
          105,
          judulY,
          { align: "center" }
        );
        doc.text(
          "PRAKTEK BIMBINGAN DAN PENYULUHAN, TUGAS TAMBAHAN DAN",
          105,
          judulY + 5,
          { align: "center" }
        );
        doc.text("TUGAS – TUGAS LAIN SEMESTER GASAL", 105, judulY + 10, {
          align: "center",
        });
        doc.text("TAHUN AJARAN 2025/2026", 105, judulY + 15, {
          align: "center",
        });
      },
    });

    // ================= TTD KEPALA SEKOLAH (Mode B) =================
    // letakkan di bawah tabel terakhir
    let yTTD = (doc.lastAutoTable?.finalY || 240) + 14;

    // jika terlalu bawah, pindah halaman
    if (yTTD > 260) {
      doc.addPage();
      yTTD = 40;
    }

    const xTTD = 125;

    doc.setFont("times", "normal");
    doc.setFontSize(11);
    doc.text(`Surakarta, ${ttdTanggal}`, xTTD, yTTD);
    doc.text("Kepala Sekolah", xTTD, yTTD + 8);

    // ruang tanda tangan
    const yNama = yTTD + 8 + 28;

    doc.setFont("times", "bold");
    doc.text(namaKS, xTTD, yNama);

    // garis bawah nama
    const wNama = doc.getTextWidth(namaKS);
    doc.setLineWidth(0.2);
    doc.line(xTTD, yNama + 1.2, xTTD + wNama, yNama + 1.2);

    doc.setFont("times", "normal");
    doc.text(golKS, xTTD, yNama + 7);
    doc.text(`NIP. ${nipKS}`, xTTD, yNama + 14);

    // ================= SAVE =================
    doc.save(`${fileName}.pdf`);
  } catch (error) {
    console.error(error);
    alert("Gagal membuat PDF. Silakan coba lagi.");
  }
};

// --- DOWNLOAD TUGAS AKTIF (Spesifik Tabel Isi) ---
// --- DOWNLOAD TUGAS AKTIF (Spesifik Tabel Isi dengan Header Bersih) ---
// --- DOWNLOAD TUGAS AKTIF (Dengan Kolom Nomor & Header Bersih) ---

// --- DOWNLOAD TUGAS AKTIF (Lampiran: Excel / PDF) ---
// PDF mengikuti format contoh: logo + tabel identitas lampiran + judul lampiran (uppercase) + tabel isi + TTD KS
window.downloadTugasAktif = async (type) => {
  const select = document.getElementById("lampiranSelect");
  if (!select || !select.value) return alert("Pilih lampiran terlebih dahulu!");

  const namaLampiran = select.options[select.selectedIndex]?.text || "Lampiran";
  const nomorLampiran = `Lampiran ${select.selectedIndex + 1}`;
  const fileName = namaLampiran.replace(/\s+/g, "_");

  if (type === "excel") {
    // Untuk Excel, kita ambil tabel apa adanya dari DOM (user minta khusus header & ttd hanya untuk cetak/pdf)
    const table = document.getElementById("tabelIsiMain");
    const wb = XLSX.utils.table_to_book(table, { sheet: "Sheet1" });
    XLSX.writeFile(wb, `${fileName}.xlsx`);
    return;
  }

  // ===== PDF =====
  const { jsPDF } = window.jspdf;
  const docPdf = new jsPDF("p", "mm", "a4");

  // helper: ambil data tabel dari DOM tanpa kolom terakhir (Aksi)
  const extractTable = (tableId) => {
    const table = document.getElementById(tableId);
    if (!table) return { head: [], body: [] };

    const headRow = Array.from(table.querySelectorAll("thead tr th"))
      .slice(0, -1) // buang "Aksi"
      .map((th) => th.innerText.trim());

    const bodyRows = Array.from(table.querySelectorAll("tbody tr")).map(
      (tr) => {
        const tds = Array.from(tr.querySelectorAll("td")).slice(0, -1);
        return tds.map((td) => td.innerText.trim());
      }
    );

    return { head: [headRow], body: bodyRows };
  };

  const nomorSK =
    identitasCache.nomorSK ||
    document.getElementById("valNomorSK")?.innerText ||
    "-";
  const tanggalSK = identitasCache.tanggalSK
    ? formatTanggalIndo(identitasCache.tanggalSK)
    : document.getElementById("valTanggalSK")?.innerText || "-";
  const tentangSK =
    identitasCache.tentangSK ||
    document.getElementById("valTentangSK")?.innerText ||
    "-";

  try {
    // === Tabel Identitas Lampiran ===
    docPdf.autoTable({
      startY: 20,
      theme: "grid",
      margin: { left: 24, right: 18 },
      styles: {
        font: "times",
        fontSize: 10,
        lineColor: [0, 0, 0],
        lineWidth: 0,
        cellPadding: 1.2,
      },
      body: [
        [
          {
            content: `{${nomorLampiran}}`,
            styles: { textColor: [0, 0, 0], fontStyle: "normal" },
          },
          ":",
          "Keputusan Kepala SMA Negeri 6 Surakarta",
        ],
        ["Nomor", ":", nomorSK || "-"],
        ["Tanggal", ":", tanggalSK || "-"],
        ["Tentang", ":", tentangSK || "-"],
      ],
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 5, halign: "center" },
        2: { cellWidth: "auto" },
      },
      didParseCell: (data) => {
        // kecilkan padding di kolom ":" agar rapat
        if (data.column.index === 1) data.cell.styles.cellPadding = 1.2;
      },
    });

    // === Judul Lampiran (UPPERCASE, BOLD) ===
    const yAfterMeta = docPdf.lastAutoTable.finalY + 10;
    docPdf.setFont("times", "bold");
    docPdf.setFontSize(12);
    docPdf.text(String(namaLampiran).toUpperCase(), 105, yAfterMeta, {
      align: "center",
    });

    // === Tabel Isi ===
    const { head, body } = extractTable("tabelIsiMain");

    docPdf.autoTable({
      startY: yAfterMeta + 6,
      head,
      body,
      theme: "grid",
      margin: { left: 18, right: 18 },
      headStyles: {
        fillColor: false,
        textColor: [0, 0, 0],
        halign: "center",
        lineColor: [0, 0, 0],
        lineWidth: 0.2,
        fontStyle: "bold",
      },
      styles: {
        font: "times",
        fontSize: 10,
        lineColor: [0, 0, 0],
        lineWidth: 0.2,
        valign: "middle",
      },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" }, // No
        1: { cellWidth: 55 }, // Nama
        2: { cellWidth: 40 }, // NIP
        3: { cellWidth: "auto" }, // Tugas (auto)
      },
    });

    // === TTD KS (HANYA DI AKHIR DOKUMEN) ===
    // === TTD KS (HANYA DI AKHIR DOKUMEN) ===
    const namaKS =
      identitasCache.namaKepsek ||
      document.getElementById("ttdNama")?.innerText ||
      "-";
    const golKS =
      identitasCache.golKepsek ||
      document.getElementById("ttdGol")?.innerText ||
      "-";
    const nipKS =
      identitasCache.nipKepsek ||
      document.getElementById("ttdNip")?.innerText ||
      "-";
    const ttdTanggal = getTanggalTTD();

    let yTTD = (docPdf.lastAutoTable?.finalY || 250) + 18;
    if (yTTD > 270) {
      docPdf.addPage();
      yTTD = 40;
    }

    const xTTD = 125;
    docPdf.setFont("times", "normal");
    docPdf.setFontSize(11);
    docPdf.text(`Surakarta, ${ttdTanggal}`, xTTD, yTTD);
    docPdf.text("Kepala Sekolah", xTTD, yTTD + 8);

    // ruang tanda tangan
    const yNama = yTTD + 8 + 28;
    docPdf.setFont("times", "bold");
    docPdf.text(namaKS, xTTD, yNama);

    // underline nama
    const textW = docPdf.getTextWidth(namaKS);
    docPdf.setLineWidth(0.2);
    docPdf.line(xTTD, yNama + 1.2, xTTD + textW, yNama + 1.2);

    docPdf.setFont("times", "normal");
    docPdf.text(golKS, xTTD, yNama + 7);
    docPdf.text(`NIP. ${nipKS}`, xTTD, yNama + 14);

    docPdf.save(`${fileName}.pdf`);
  } catch (error) {
    console.error(error);
    alert("Gagal membuat PDF. Silakan coba lagi.");
  }
};

/* ================= INIT ================= */
document.getElementById("currentDate").innerText =
  new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

showPage("dashboard");

// Load identitas (untuk header lampiran & TTD)
loadIdentitas();

/* ================= FITUR PRINT ================= */
/* ================= FITUR PRINT PREVIEW (Sesuai Layout PDF) ================= */

/* ================= FITUR PRINT PREVIEW (Sesuai Layout PDF) ================= */
window.printTable = (tableId, type) => {
  const table = document.getElementById(tableId)?.cloneNode(true);
  if (!table) return alert("Tabel tidak ditemukan.");

  // Hapus kolom 'Aksi' jika ada agar bersih saat dicetak
  const actionHeader = table.querySelector("th:last-child");
  if (actionHeader && actionHeader.innerText.toLowerCase().includes("aksi")) {
    table.querySelectorAll("tr").forEach((tr) => tr.deleteCell(-1));
  }

  let headerContent = "";
  let titleContent = "";
  let footerContent = "";

  if (type === "rekap") {
    // Layout Kop Surat sesuai spesifikasi downloadPDF
    headerContent = `
      <div class="kop-surat">
        <div class="kop-logos">
          <img class="logo-left" src="logo1.png" alt="Logo Provinsi">
          <img class="logo-right" src="logo2.png" alt="Logo Sekolah">
        </div>
                <div class="kop-text">
          <div class="line1">PEMERINTAH PROVINSI JAWA TENGAH</div>
          <div class="line1">DINAS PENDIDIKAN DAN KEBUDAYAAN</div>
          <div class="line2">SEKOLAH MENENGAH ATAS NEGERI 6</div>
          <div class="line2">SURAKARTA</div>
          <div class="line3">Jalan Mr. Sartono No. 30 Banjarsari, Kota Surakarta Kode Pos 57135</div>
          <div class="line3">Telp. (0271) 853209 | Email: info@sman6surakarta.sch.id</div>
          <div class="line3">Laman: https://www.sman6surakarta.sch.id</div>
        </div>
        <div class="double-line"></div>
      </div>`;

    titleContent = `
      <div class="judul">
        REKAPITULASI PENUGASAN GURU DALAM PROSES BELAJAR MENGAJAR,<br>
        PRAKTEK BIMBINGAN DAN PENYULUHAN, TUGAS TAMBAHAN DAN<br>
        TUGAS – TUGAS LAIN SEMESTER GASAL<br>
        TAHUN AJARAN 2025/2026
      </div>`;

    // footer: TTD ikut yang ada di halaman (agar sama)
    footerContent = document.querySelector(".ttd-kepsek")?.outerHTML || "";
  } else {
    // ===== LAMPIRAN / TUGAS TAMBAHAN =====
    const select = document.getElementById("lampiranSelect");
    const namaLampiran =
      select?.options?.[select.selectedIndex]?.text || "Lampiran";
    const nomorLampiran = `Lampiran ${select?.selectedIndex + 1}`;

    const nomorSK =
      identitasCache.nomorSK ||
      document.getElementById("valNomorSK")?.innerText ||
      "-";
    const tanggalSK = identitasCache.tanggalSK
      ? formatTanggalIndo(identitasCache.tanggalSK)
      : document.getElementById("valTanggalSK")?.innerText || "-";
    const tentangSK =
      identitasCache.tentangSK ||
      document.getElementById("valTentangSK")?.innerText ||
      "-";

    headerContent = `
      <div class="lampiran-header">

        <table class="lampiran-meta">
          <tr>
            <td style="width: 160px;"><strong>{${nomorLampiran}}</strong></td>
            <td style="width: 16px; text-align:center;">:</td>
            <td>Keputusan Kepala SMA Negeri 6 Surakarta</td>
          </tr>
          <tr>
            <td>Nomor</td><td style="text-align:center;">:</td><td>${escapeHtml(
              nomorSK
            )}</td>
          </tr>
          <tr>
            <td>Tanggal</td><td style="text-align:center;">:</td><td>${escapeHtml(
              tanggalSK
            )}</td>
          </tr>
          <tr>
            <td>Tentang</td><td style="text-align:center;">:</td><td>${escapeHtml(
              tentangSK
            )}</td>
          </tr>
        </table>
      </div>
    `;

    titleContent = `<div class="lampiran-title">${escapeHtml(
      String(namaLampiran).toUpperCase()
    )}</div>`;

    // footer: TTD KS
    const namaKS =
      identitasCache.namaKepsek ||
      document.getElementById("ttdNama")?.innerText ||
      "-";
    const golKS =
      identitasCache.golKepsek ||
      document.getElementById("ttdGol")?.innerText ||
      "-";
    const nipKS =
      identitasCache.nipKepsek ||
      document.getElementById("ttdNip")?.innerText ||
      "-";
    const ttdTanggal = getTanggalTTD();

    footerContent = `
      <div class="ttd-kepsek">
        <div>Surakarta, <span>${escapeHtml(ttdTanggal)}</span></div>
        <div style="margin-top: 10px;">Kepala Sekolah</div>
        <div class="nama">${escapeHtml(namaKS)}</div>
        <div>${escapeHtml(golKS)}</div>
        <div>NIP. ${escapeHtml(nipKS)}</div>
      </div>
    `;
  }

  const win = window.open("", "", "height=800,width=1000");
  win.document.write(`
    <html>
      <head>
        <title>Print Preview</title>
        <style>
          body { font-family: "Times New Roman", Times, serif; padding: 30px; color: black; line-height: 1.3; }
          @page { margin: 20mm 18mm 20mm 32mm; }
          .lampiran-meta { width: 100%; border-collapse: collapse; margin: 0 0 6px 0; font-size: 10.5pt; line-height: 1.15; }
          .lampiran-meta td { border: none !important; padding: 1px 4px; vertical-align: top; }

          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11pt; }
          th, td { border: 1px solid black; padding: 8px; }
          th { background: none; text-align: center; font-weight: bold; }

          /* KOP REKAP */
          .kop-surat { position: relative; text-align: center; margin-bottom: 10px; }
          
          .kop-logos { position: absolute; left: 0; right: 0; top: 0; height: 70px; }
          .logo-left { position: absolute; left: 0; top: 0; height: 65px; }
          .logo-right { position: absolute; right: 0; top: 0; height: 65px; }
.kop-text { margin: 0 90px; }
          .line1 { font-size: 14pt; font-weight: bold; }
          .line2 { font-size: 18pt; font-weight: bold; }
          .line3 { font-size: 10pt; }
          .double-line { border-top: 3px solid black; border-bottom: 1px solid black; height: 3px; margin-top: 10px; }
          .judul { text-align: center; font-weight: bold; font-size: 12pt; margin: 20px 0; line-height: 1.6; }

          /* HEADER LAMPIRAN */
          .lampiran-header { margin-top: 10px; }
          .lampiran-logos { position: relative; height: 70px; margin-bottom: 10px; }
          .logo-lampiran { position: absolute; top: 0; height: 65px; }
          .lampiran-meta { width: 100%; border-collapse: collapse; margin-top: 0; font-size: 11pt; }
          .lampiran-meta td { border: 1px solid black; padding: 6px 8px; vertical-align: top; }
          .lampiran-title { margin: 22px 0 6px; text-align: center; font-weight: bold; font-size: 12pt; letter-spacing: 0.3px; }

          /* TTD */
          .ttd-kepsek { width: 300px; margin-left: auto; margin-top: 40px; text-align: left; font-size: 11pt; line-height: 1.5; }
          .ttd-kepsek .nama { margin-top: 70px; font-weight: bold; text-decoration: underline; }

          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        ${headerContent}
        ${titleContent}
        ${table.outerHTML}
        ${footerContent}
      </body>
    </html>
  `);

  win.document.close();
  win.focus();
  win.print();
};

window.tampilEditLampiran = (id, nama) => {
  document.getElementById("overlay").classList.remove("hidden");
  document.getElementById("formEditLampiran").classList.remove("hidden");
  document.getElementById("editLampId").value = id;
  document.getElementById("editLampNama").value = nama;
};

window.batalEditLampiran = () => {
  document.getElementById("overlay").classList.add("hidden");
  document.getElementById("formEditLampiran").classList.add("hidden");
};

window.simpanEditLampiran = async () => {
  const id = document.getElementById("editLampId").value;
  const namaBaru = document.getElementById("editLampNama").value;

  if (!namaBaru) return alert("Nama tidak boleh kosong!");

  await updateDoc(doc(db, "lampiran", id), { nama: namaBaru });
  window.batalEditLampiran();
  loadLampiran(); // Refresh data
};

// ================= FINAL SCRIPT.JS =================
// Import Tugas Tambahan menggunakan NAMA sebagai kunci utama
// Versi stabil – sesuai diskusi terakhir

// ================= HELPER =================
function normalizeName(str = "") {
  return String(str).trim().toLowerCase();
}

function toProperCase(str = "") {
  return String(str)
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ================= IMPORT TUGAS TAMBAHAN =================
async function importTugasByNama(file, lampiranId) {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  if (!rows.length) {
    alert("File Excel kosong.");
    return;
  }

  const guruSnap = await getDocs(collection(db, "guru"));
  const guruList = [];
  guruSnap.forEach((d) => {
    guruList.push({ id: d.id, ...d.data() });
  });

  let sukses = 0;
  let gagal = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const namaExcel = normalizeName(row["Nama Guru"]);
    const tugas = row["Tugas"];

    if (!namaExcel || !tugas) {
      gagal++;
      continue;
    }

    const guru = guruList.find((g) => normalizeName(g.nama) === namaExcel);

    if (!guru) {
      gagal++;
      continue;
    }

    await addDoc(collection(db, "tugas_tambahan"), {
      guruId: guru.id,
      lampiranId: lampiranId,
      tugas: tugas,
      sort: i,
    });

    sukses++;
  }

  alert(`Import selesai.\nBerhasil: ${sukses} baris\nDilewati: ${gagal} baris`);

  gantiLampiran();
  loadRekap();
}

// ================= TEMPLATE TUGAS =================
function downloadTemplateTugas() {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Nama Guru", "NIP (opsional)", "Tugas"],
    ["Contoh Nama Guru", "", "Contoh Tugas Tambahan"],
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template");
  XLSX.writeFile(wb, "Template_Import_Tugas.xlsx");
}
