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

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cleanNIP(nip) {
  const s = normalizeNIP(nip);
  return s ? s.replace(/\D+/g, "") : "";
}

// === FUNGSI TAMBAHAN: PENCARIAN TABEL ===
window.filterTable = (tableId, keyword) => {
  const filter = keyword.toLowerCase();
  const table = document.getElementById(tableId);
  if (!table) return;
  const rows = table.getElementsByTagName("tr");

  for (let i = 0; i < rows.length; i++) {
    // Lewati jika ini adalah baris empty state
    if (rows[i].classList.contains("empty-state")) continue;
    let textContent = rows[i].textContent || rows[i].innerText;
    rows[i].style.display =
      textContent.toLowerCase().indexOf(filter) > -1 ? "" : "none";
  }
};

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

let guruMap = {};

// ================= IDENTITAS (SK & KEPALA SEKOLAH) =================
const IDENTITAS_KEY = "simtugas_identitas_v1";
let identitasCache = {
  nomorSK: "",
  tanggalSK: "",
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
    identitasCache.tanggalSK ? formatTanggalIndo(identitasCache.tanggalSK) : "",
  );
  setText("valTentangSK", identitasCache.tentangSK);
  setText("valNamaKepsek", identitasCache.namaKepsek);
  setText("valGolKepsek", identitasCache.golKepsek);
  setText("valNipKepsek", identitasCache.nipKepsek);

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
  try {
    const raw = localStorage.getItem(IDENTITAS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      identitasCache = { ...identitasCache, ...parsed };
    }
  } catch (e) {
    console.warn("Gagal baca localStorage identitas", e);
  }

  try {
    const snap = await getDoc(doc(db, "identitas", "main"));
    if (snap.exists()) {
      identitasCache = { ...identitasCache, ...snap.data() };
      try {
        localStorage.setItem(IDENTITAS_KEY, JSON.stringify(identitasCache));
      } catch {}
    }
  } catch (e) {
    console.warn("Gagal load identitas dari Firestore", e);
  }

  renderIdentitasToUI();
}

window.simpanIdentitas = async () => {
  if (!auth.currentUser)
    return Swal.fire(
      "Akses Ditolak",
      "Silakan login admin untuk mengubah identitas.",
      "warning",
    );

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

  try {
    localStorage.setItem(IDENTITAS_KEY, JSON.stringify(identitasCache));
  } catch {}

  try {
    await setDoc(doc(db, "identitas", "main"), identitasCache, { merge: true });
    Swal.fire("Tersimpan", "Data identitas berhasil diubah!", "success");
  } catch (e) {
    Swal.fire(
      "Peringatan",
      "Tersimpan lokal, tapi gagal sinkron ke server.",
      "warning",
    );
  }

  renderIdentitasToUI();
  window.toggleEditIdentitas(false);
};

/* ================= NAVIGASI & UI ================= */
window.showPage = (id) => {
  document
    .querySelectorAll(".page-content")
    .forEach((p) => p.classList.add("hidden"));
  const targetPage = document.getElementById(`page-${id}`);
  if (targetPage) targetPage.classList.remove("hidden");

  document.querySelectorAll(".sidebar-item").forEach((item) => {
    item.classList.remove("active");
    const onclickAttr = item.getAttribute("onclick");
    if (onclickAttr && onclickAttr.includes(`'${id}'`))
      item.classList.add("active");
  });

  const pageTitleEl = document.getElementById("pageTitle");
  if (pageTitleEl) {
    const titleMapping = {
      dashboard:
        '<i class="fas fa-home header-icon-title"></i> Dashboard Utama',
      identitas:
        '<i class="fas fa-id-card header-icon-title"></i> Identitas SK & Kepala Sekolah',
      dataGuru:
        '<i class="fas fa-user-tie header-icon-title"></i> Manajemen Data Guru',
      manajemenLampiran:
        '<i class="fas fa-folder-plus header-icon-title"></i> Daftar Lampiran Dokumen',
      daftarTugas:
        '<i class="fas fa-tasks header-icon-title"></i> Rincian Tugas Tambahan',
      rekap:
        '<i class="fas fa-file-alt header-icon-title"></i> Rekapitulasi Akhir Penugasan',
    };
    pageTitleEl.style.opacity = 0;
    setTimeout(() => {
      pageTitleEl.innerHTML = titleMapping[id] || id.toUpperCase();
      pageTitleEl.style.opacity = 1;
    }, 150);
  }
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
      Swal.fire("Error", "Login Gagal! Periksa email dan sandi.", "error"),
    );

const btnLogoutEl = document.getElementById("btnLogout");
if (btnLogoutEl) btnLogoutEl.onclick = () => signOut(auth);

const btnToggleLogin = document.getElementById("btnToggleLogin");
const loginPanel = document.getElementById("loginPanel");
if (btnToggleLogin && loginPanel) {
  btnToggleLogin.onclick = () => loginPanel.classList.toggle("active");
}

(function setupLoginAutoHide() {
  document.addEventListener("click", (e) => {
    if (!loginPanel?.classList.contains("active")) return;
    const target = e.target;
    const loginForm = document.getElementById("loginForm");
    if (
      btnToggleLogin?.contains(target) ||
      loginPanel?.contains(target) ||
      loginForm?.contains(target)
    )
      return;
    loginPanel.classList.remove("active");
  });
})();

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
  const rows = [];
  snap.forEach((d) => rows.push({ id: d.id, data: d.data() }));

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
      { sensitivity: "base" },
    );
    if (na !== 0) return na;
    return String(a.data.nip || "").localeCompare(
      String(b.data.nip || ""),
      "id",
      { sensitivity: "base" },
    );
  });

  if (rows.length === 0) {
    tGuru.innerHTML = `<tr class="empty-state"><td colspan="3" style="text-align: center; padding: 30px; color: #94a3b8;"><i class="fas fa-users" style="font-size: 2.5rem; margin-bottom: 12px; display: block; color:#cbd5e1;"></i>Belum ada data guru.</td></tr>`;
  } else {
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
  }
  window.isiNip();
}

window.tambahGuru = async () => {
  if (!guruNama.value || !guruNip.value)
    return Swal.fire("Perhatian", "Nama dan NIP wajib diisi!", "warning");
  await addDoc(collection(db, "guru"), {
    nama: guruNama.value,
    nip: guruNip.value,
    sort: Date.now() * 1000,
  });
  guruNama.value = "";
  guruNip.value = "";
  Swal.fire("Berhasil", "Guru berhasil ditambahkan.", "success");
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
  Swal.fire("Tersimpan", "Profil guru berhasil diupdate!", "success");
  refreshData();
};

window.hapusGuru = async (id) => {
  Swal.fire({
    title: "Hapus data guru?",
    text: "Tugas yang bersangkutan mungkin kehilangan referensi nama.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    cancelButtonColor: "#64748b",
    confirmButtonText: "Ya, hapus!",
    cancelButtonText: "Batal",
  }).then(async (result) => {
    if (result.isConfirmed) {
      await deleteDoc(doc(db, "guru", id));
      refreshData();
      Swal.fire("Terhapus!", "Data guru telah dihapus.", "success");
    }
  });
};

/* ================= IMPORT/EXPORT DATA GURU (EXCEL) ================= */
window.downloadTemplateGuru = () => {
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
  input.value = "";
  input.click();
};

window.importGuruExcel = async (file) => {
  if (!auth.currentUser)
    return Swal.fire(
      "Akses Ditolak",
      "Silakan login admin untuk import data.",
      "error",
    );
  if (!file) return;

  await loadGuru();
  const existingNips = new Set(
    Object.values(guruMap)
      .map((g) => cleanNIP(g?.nip || ""))
      .filter(Boolean),
  );

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const data = new Uint8Array(evt.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (!rows.length)
        return Swal.fire(
          "Gagal",
          "File kosong atau format tidak terbaca.",
          "error",
        );

      const headers = Object.keys(rows[0] || {});
      const norm = (s) => String(s).trim().toLowerCase();
      const namaKey =
        headers.find((h) => norm(h) === "nama") ||
        headers.find((h) => norm(h).includes("nama"));
      const nipKey =
        headers.find((h) => norm(h) === "nip") ||
        headers.find((h) => norm(h).includes("nip"));

      if (!namaKey || !nipKey) {
        return Swal.fire(
          "Gagal",
          'Gunakan template dengan kolom "Nama" dan "NIP".',
          "error",
        );
      }

      let added = 0;
      let skipped = 0;
      const baseSort = Date.now() * 1000;
      let batch = writeBatch(db);
      let ops = 0;

      for (let i = 0; i < rows.length; i++) {
        const nama = String(r[namaKey] ?? "").trim();
        const nip = cleanNIP(r[nipKey] ?? "");

        if (!nama || (nip && existingNips.has(nip))) {
          skipped++;
          continue;
        }

        const ref = doc(collection(db, "guru"));
        batch.set(ref, { nama, nip, sort: baseSort + i });
        ops++;
        added++;
        if (nip) existingNips.add(nip);

        if (ops >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          ops = 0;
        }
      }

      if (ops > 0) await batch.commit();
      Swal.fire(
        "Import Selesai",
        `Data Ditambahkan: ${added} \nDilewati (Duplikat): ${skipped}`,
        "success",
      );
      refreshData();
    } catch (e) {
      Swal.fire("Error", "Pastikan file Excel sesuai template.", "error");
    }
  };
  reader.readAsArrayBuffer(file);
};

const importGuruFileEl = document.getElementById("importGuruFile");
if (importGuruFileEl) {
  importGuruFileEl.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    window.importGuruExcel(f);
  });
}

/* ================= CRUD TUGAS & LAMPIRAN ================= */
async function loadLampiran() {
  const sLamp = document.getElementById("lampiranSelect");
  const tLamp = document.getElementById("tabelDaftarLampiran");
  if (!sLamp || !tLamp) return;

  sLamp.innerHTML = "";
  tLamp.innerHTML = "";

  const snap = await getDocs(collection(db, "lampiran"));
  const items = [];
  snap.forEach((d) =>
    items.push({
      id: d.id,
      nama: d.data()?.nama ?? "",
      sort: Number(d.data()?.sort ?? 0),
    }),
  );

  items.sort((a, b) => {
    if (a.sort !== b.sort) return a.sort - b.sort;
    return String(a.nama).localeCompare(String(b.nama));
  });

  // Perhatikan colspan menjadi 5 karena ketambahan kolom drag
  if (items.length === 0) {
    tLamp.innerHTML = `<tr class="empty-state"><td colspan="5" style="text-align: center; padding: 30px; color: #94a3b8;"><i class="fas fa-folder" style="font-size: 2.5rem; margin-bottom: 12px; display: block; color:#cbd5e1;"></i>Belum ada lampiran.</td></tr>`;
  } else {
    let no = 1;
    for (const it of items) {
      sLamp.add(new Option(it.nama, it.id));
      const isAdmin = !!auth.currentUser;

      // Elemen drag handle khusus untuk admin
      const dragCol = isAdmin
        ? `<td class="text-center" style="width: 40px;"><span class="drag-handle"><i class="fas fa-grip-vertical"></i></span></td>`
        : `<td class="text-center" style="width: 40px;">-</td>`;

      const aksi = isAdmin
        ? `<div class="action-buttons">
            <button class="btn-primary" onclick="window.tampilEditLampiran('${it.id}','${escapeHtml(it.nama)}')"><i class="fas fa-edit"></i></button>
            <button class="btn-danger" onclick="window.hapusLampiran('${it.id}')"><i class="fas fa-trash"></i></button>
           </div>`
        : "-";

      // Tambahkan class draggable-row-lampiran dan data-id
      tLamp.innerHTML += `
        <tr class="draggable-row-lampiran" draggable="${isAdmin}" data-id="${it.id}">
            ${dragCol}
            <td>${no}</td>
            <td>Lampiran ${no}</td>
            <td>${escapeHtml(it.nama)}</td>
            <td>${aksi}</td>
        </tr>`;
      no++;
    }
  }

  if (sLamp.value) window.gantiLampiran();

  // Inisialisasi fitur drag and drop jika user adalah admin
  if (auth.currentUser) initDragAndDropLampiran();
}

window.hapusLampiran = async (id) => {
  Swal.fire({
    title: "Hapus Lampiran?",
    text: "Semua data tugas di dalamnya juga harus dihapus secara manual.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    cancelButtonColor: "#64748b",
    confirmButtonText: "Ya, hapus!",
    cancelButtonText: "Batal",
  }).then(async (result) => {
    if (result.isConfirmed) {
      await deleteDoc(doc(db, "lampiran", id));
      loadLampiran();
      Swal.fire("Terhapus!", "Lampiran berhasil dihapus.", "success");
    }
  });
};

window.tambahLampiran = async () => {
  if (!lampNama.value)
    return Swal.fire("Info", "Isi nama lampiran terlebih dahulu", "info");
  await addDoc(collection(db, "lampiran"), { nama: lampNama.value });
  lampNama.value = "";
  Swal.fire("Berhasil", "Lampiran ditambahkan.", "success");
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
  rows.sort((a, b) => a.sort - b.sort);

  if (rows.length === 0) {
    tIsi.innerHTML = `<tr class="empty-state"><td colspan="6" style="text-align: center; padding: 30px; color: #94a3b8;"><i class="fas fa-clipboard-list" style="font-size: 2.5rem; margin-bottom: 12px; display: block; color:#cbd5e1;"></i>Belum ada data tugas pada lampiran ini.</td></tr>`;
  } else {
    let no = 1;
    for (const r of rows) {
      const profilGuru = guruMap[r.guruId] || {
        nama: "Tidak Ditemukan",
        nip: "-",
      };
      const isAdmin = !!auth.currentUser;
      const dragCol = isAdmin
        ? `<td class="text-center" style="width: 40px;"><span class="drag-handle"><i class="fas fa-grip-vertical"></i></span></td>`
        : `<td class="text-center" style="width: 40px;">-</td>`;
      const aksi = isAdmin
        ? `<div class="action-buttons">
              <button class="btn-primary" onclick="window.editIsi('${r.id}','${r.guruId}','${escapeHtml(r.tugas)}')"><i class="fas fa-edit"></i></button> 
              <button class="btn-danger" onclick="window.hapusIsi('${r.id}')"><i class="fas fa-trash"></i></button>
           </div>`
        : "-";

      tIsi.innerHTML += `
        <tr class="draggable-row" draggable="${isAdmin}" data-id="${r.id}">
          ${dragCol}
          <td>${no++}</td> 
          <td>${escapeHtml(profilGuru.nama)}</td>
          <td><span class="nip-badge">${escapeHtml(profilGuru.nip)}</span></td>
          <td>${escapeHtml(r.tugas)}</td>
          <td>${aksi}</td>
        </tr>`;
    }
  }

  if (auth.currentUser) initDragAndDrop();
}

window.tambahIsi = async () => {
  const tugasTxtEl = document.getElementById("tugasText");
  const lampiranSelEl = document.getElementById("lampiranSelect");
  const guruSelEl = document.getElementById("guruSelect");

  if (!tugasTxtEl.value)
    return Swal.fire("Info", "Tugas tidak boleh kosong!", "warning");
  await addDoc(collection(db, "tugas_tambahan"), {
    lampiranId: lampiranSelEl.value,
    guruId: guruSelEl.value,
    tugas: tugasTxtEl.value,
    sort: -Date.now(),
  });
  tugasTxtEl.value = "";
  window.toggleFormTugas(false);
  Swal.fire("Tersimpan", "Tugas tambahan berhasil disematkan.", "success");
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
  Object.keys(guruMap).forEach((gid) => {
    let o = new Option(guruMap[gid].nama, gid);
    if (gid === currentGuruId) o.selected = true;
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
  Swal.fire("Tersimpan", "Rincian tugas berhasil diupdate!", "success");
  window.gantiLampiran();
  loadRekap();
};

window.hapusIsi = async (id) => {
  Swal.fire({
    title: "Hapus Rincian Tugas?",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    cancelButtonColor: "#64748b",
    confirmButtonText: "Ya, hapus!",
  }).then(async (result) => {
    if (result.isConfirmed) {
      await deleteDoc(doc(db, "tugas_tambahan", id));
      window.gantiLampiran();
      loadRekap();
      Swal.fire("Terhapus!", "Rincian tugas dihapus.", "success");
    }
  });
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

  if (Object.keys(guruMap).length === 0) {
    tRekap.innerHTML = `<tr class="empty-state"><td colspan="4" style="text-align: center; padding: 30px; color: #94a3b8;"><i class="fas fa-file-alt" style="font-size: 2.5rem; margin-bottom: 12px; display: block; color:#cbd5e1;"></i>Belum ada data rekapitulasi.</td></tr>`;
    return;
  }

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

    // --- TAMBAHAN KODE: Kunci tugas baris pertama (Kepala Sekolah) ---
    if (no === 1) {
      listTugas = "Kepala Sekolah";
    }

    tRekap.innerHTML += `<tr><td style="text-align: center;">${no++}</td><td>${p.nama}</td><td>${p.nip}</td><td>${listTugas}</td></tr>`;
  });
}

/* ================= FITUR EXCEL/PDF PRINT (DIPERTAHANKAN 100%) ================= */
window.downloadExcel = (tableId, fileName) => {
  const table = document.getElementById(tableId);
  if (!table) return Swal.fire("Error", "Tabel tidak ditemukan", "error");
  const wb = XLSX.utils.table_to_book(table, { sheet: "Sheet1", raw: true });
  XLSX.writeFile(wb, `${fileName}.xlsx`);
};

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
    return Swal.fire(
      "Ditolak",
      "Silakan login admin untuk import lampiran.",
      "error",
    );

  try {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    const names = rows
      .map((r) => String(r["Nama Lampiran"] ?? r["Nama"] ?? "").trim())
      .filter((v) => v);

    if (names.length === 0)
      return Swal.fire("Error", "File tidak berisi kolom Nama.", "error");

    const snap = await getDocs(collection(db, "lampiran"));
    let maxSort = 0;
    snap.forEach((d) => {
      const s = Number(d.data()?.sort ?? 0);
      if (s > maxSort) maxSort = s;
    });

    let added = 0;
    for (let i = 0; i < names.length; i++) {
      await addDoc(collection(db, "lampiran"), {
        nama: names[i],
        sort: maxSort + i + 1,
      });
      added++;
    }
    await loadLampiran();
    Swal.fire(
      "Berhasil",
      `Import lampiran selesai: ${added} data ditambahkan.`,
      "success",
    );
  } catch (e) {
    Swal.fire("Error", `Gagal import: ${e?.message || e}`, "error");
  }
};

window.downloadTemplateTugasAktif = () => {
  const select = document.getElementById("lampiranSelect");
  if (!select || !select.value)
    return Swal.fire(
      "Pilih Lampiran",
      "Pilih lampiran terlebih dahulu!",
      "warning",
    );
  const namaLampiran = select.options[select.selectedIndex].text;
  const headers = [["Nama Guru", "NIP (opsional)", "Tugas"]];
  const contoh = [["Contoh Nama Guru", "", `Tugas untuk ${namaLampiran}`]];
  const ws = XLSX.utils.aoa_to_sheet([...headers, ...contoh]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tugas");
  XLSX.writeFile(
    wb,
    `Template_Import_Tugas_${namaLampiran.replace(/\s+/g, "_")}.xlsx`,
  );
};

window.importTugasAktifExcel = async (event) => {
  const file = event?.target?.files?.[0];
  if (event?.target) event.target.value = "";
  if (!file) return;
  const select = document.getElementById("lampiranSelect");
  if (!select || !select.value)
    return Swal.fire("Info", "Pilih lampiran dulu.", "warning");
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
      return Swal.fire("Gagal", "Format kolom Excel tidak sesuai.", "error");

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
    Swal.fire(
      "Import Selesai",
      `Data Ditambahkan: ${added} \nDilewati (Guru Tidak Ketemu): ${skipped}`,
      "success",
    );
  } catch (e) {
    Swal.fire("Error", "Pastikan file Excel sesuai template.", "error");
  }
};

window.downloadPDF = async (tableId, fileName) => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "mm", "a4");

  const namaKS = (identitasCache?.namaKepsek || "-").trim() || "-";
  const golKS = (identitasCache?.golKepsek || "-").trim() || "-";
  const nipKS = (identitasCache?.nipKepsek || "-").trim() || "-";
  const ttdTanggal =
    typeof getTanggalTTD === "function" ? getTanggalTTD() : "-";

  let __logoProv = null;
  let __logoSekolah = null;
  try {
    __logoProv = await getImageData("logo1.png");
    __logoSekolah = await getImageData("logo2.png");
  } catch (e) {}

  try {
    doc.autoTable({
      html: `#${tableId}`,
      startY: 95,
      theme: "grid",
      showHead: "firstPage",
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
      margin: { left: 28, right: 22 },
      didDrawPage: function (data) {
        if (data.pageNumber !== 1) return;

        // 1. LOGO DIPERLEBAR AGAR "GEMUK" (Lebar: 30, Tinggi: 31)
        if (__logoProv) doc.addImage(__logoProv.data, "PNG", 18, 14, 30, 31);
        if (__logoSekolah)
          doc.addImage(__logoSekolah.data, "PNG", 162, 14, 30, 31);

        // Baris 1: Pemerintah Provinsi
        doc.setFont("times", "normal");
        doc.setFontSize(11);
        doc.text("PEMERINTAH PROVINSI JAWA TENGAH", 105, 18, {
          align: "center",
        });

        // Baris 2, 3, 4: Dinas & Nama Sekolah (Bold & Lebih Besar)
        doc.setFont("times", "bold");
        doc.setFontSize(14);
        doc.text("DINAS PENDIDIKAN", 105, 24, { align: "center" });
        doc.text("SEKOLAH MENENGAH ATAS", 105, 30, { align: "center" });
        doc.text("NEGERI 6 SURAKARTA", 105, 36, { align: "center" });

        // Baris 5, 6, 7: Alamat & Kontak (Normal, Lebih Kecil)
        doc.setFont("times", "normal");
        doc.setFontSize(9.5);
        doc.text(
          "Jalan Mr. Sartono Nomor 30, Banjarsari, Surakarta, Jawa Tengah, Kode Pos 57135",
          105,
          41,
          { align: "center" },
        );
        doc.text("Telepon 0271-853209, Faksimile 0271-853209", 105, 45, {
          align: "center",
        });
        doc.text(
          "Laman https://sman6surakarta.sch.id, Pos-el info@smanegeri6surakarta.sch.id",
          105,
          49,
          { align: "center" },
        );

        // Garis Kop Surat (Garis atas sangat tebal, bawah tipis)
        doc.setLineWidth(1.5);
        doc.line(18, 53, 192, 53);
        doc.setLineWidth(0.3);
        doc.line(18, 54.5, 192, 54.5);

        // Judul Laporan
        doc.setFont("times", "bold");
        doc.setFontSize(11);
        const judulY = 64;
        doc.text(
          "REKAPITULASI PENUGASAN GURU DALAM PROSES BELAJAR MENGAJAR,",
          105,
          judulY,
          { align: "center" },
        );
        doc.text(
          "PRAKTEK BIMBINGAN DAN PENYULUHAN, TUGAS TAMBAHAN DAN",
          105,
          judulY + 5,
          { align: "center" },
        );
        doc.text("TUGAS – TUGAS LAIN SEMESTER GASAL", 105, judulY + 10, {
          align: "center",
        });
        doc.text("TAHUN AJARAN 2026/2027", 105, judulY + 15, {
          align: "center",
        });
      },
    });

    let yTTD = (doc.lastAutoTable?.finalY || 240) + 14;
    if (yTTD > 260) {
      doc.addPage();
      yTTD = 40;
    }
    const xTTD = 125;
    doc.setFont("times", "normal");
    doc.setFontSize(11);
    doc.text(`Surakarta, ${ttdTanggal}`, xTTD, yTTD);
    doc.text("Kepala Sekolah", xTTD, yTTD + 8);
    const yNama = yTTD + 8 + 28;
    doc.setFont("times", "bold");
    doc.text(namaKS, xTTD, yNama);
    const wNama = doc.getTextWidth(namaKS);
    doc.setLineWidth(0.2);
    doc.line(xTTD, yNama + 1.2, xTTD + wNama, yNama + 1.2);
    doc.setFont("times", "normal");
    doc.text(golKS, xTTD, yNama + 7);
    doc.text(`NIP. ${nipKS}`, xTTD, yNama + 14);

    doc.save(`${fileName}.pdf`);
  } catch (error) {
    Swal.fire("Error", "Gagal membuat PDF. Coba lagi.", "error");
  }
};

window.downloadTugasAktif = async (type) => {
  const select = document.getElementById("lampiranSelect");
  if (!select || !select.value)
    return Swal.fire("Info", "Pilih lampiran!", "warning");
  const namaLampiran = select.options[select.selectedIndex]?.text || "Lampiran";
  const nomorLampiran = `Lampiran ${select.selectedIndex + 1}`;
  const fileName = namaLampiran.replace(/\s+/g, "_");

  if (type === "excel") {
    const table = document.getElementById("tabelIsiMain");
    const wb = XLSX.utils.table_to_book(table, { sheet: "Sheet1", raw: true });
    XLSX.writeFile(wb, `${fileName}.xlsx`);
    return;
  }

  const { jsPDF } = window.jspdf;
  const docPdf = new jsPDF("p", "mm", "a4");
  const extractTable = (tableId) => {
    const table = document.getElementById(tableId);
    if (!table) return { head: [], body: [] };

    // UBAH DISINI: Gunakan slice(1, -1) untuk membuang kolom Drag (kiri) & Aksi (kanan)
    const headRow = Array.from(table.querySelectorAll("thead tr th"))
      .slice(1, -1)
      .map((th) => th.innerText.trim());

    const bodyRows = Array.from(
      table.querySelectorAll("tbody tr:not(.empty-state)"),
    ).map((tr) => {
      // UBAH DISINI JUGA: slice(1, -1)
      const tds = Array.from(tr.querySelectorAll("td")).slice(1, -1);
      return tds.map((td) => td.innerText.trim());
    });

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
            content: `${nomorLampiran}`,
            styles: { textColor: [0, 0, 0], fontStyle: "normal" },
          },
          ":",
          "Keputusan Kepala SMA Negeri 6 Surakarta",
        ],
        ["Nomor", ":", nomorSK || "-"],
        ["Tanggal", ":", tanggalSK || "-"],
        ["Tentang", ":", namaLampiran || "-"],
      ],
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 5, halign: "center" },
        2: { cellWidth: "auto" },
      },
      didParseCell: (data) => {
        if (data.column.index === 1) data.cell.styles.cellPadding = 1.2;
      },
    });

    const yAfterMeta = docPdf.lastAutoTable.finalY + 10;
    docPdf.setFont("times", "bold");
    docPdf.setFontSize(12);
    docPdf.text(String(namaLampiran).toUpperCase(), 105, yAfterMeta, {
      align: "center",
    });

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
        0: { cellWidth: 10, halign: "center" },
        1: { cellWidth: 55 },
        2: { cellWidth: 40 },
        3: { cellWidth: "auto" },
      },
    });

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
    const yNama = yTTD + 8 + 28;
    docPdf.setFont("times", "bold");
    docPdf.text(namaKS, xTTD, yNama);
    const textW = docPdf.getTextWidth(namaKS);
    docPdf.setLineWidth(0.2);
    docPdf.line(xTTD, yNama + 1.2, xTTD + textW, yNama + 1.2);
    docPdf.setFont("times", "normal");
    docPdf.text(golKS, xTTD, yNama + 7);
    docPdf.text(`NIP. ${nipKS}`, xTTD, yNama + 14);

    docPdf.save(`${fileName}.pdf`);
  } catch (error) {
    Swal.fire("Error", "Gagal membuat PDF. Coba lagi.", "error");
  }
};

function initDragAndDrop() {
  const tbody = document.getElementById("tabelIsi");
  const rows = tbody.querySelectorAll(".draggable-row");
  let dragSrcEl = null;

  rows.forEach((row) => {
    row.addEventListener("dragstart", function (e) {
      dragSrcEl = this;
      this.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragover", function (e) {
      if (e.preventDefault) {
        e.preventDefault();
      }
      this.classList.add("drag-over");
      return false;
    });
    row.addEventListener("dragleave", function () {
      this.classList.remove("drag-over");
    });
    row.addEventListener("drop", async function (e) {
      if (e.stopPropagation) {
        e.stopPropagation();
      }
      this.classList.remove("drag-over");
      if (dragSrcEl !== this) {
        const allRows = Array.from(tbody.querySelectorAll(".draggable-row"));
        const srcIndex = allRows.indexOf(dragSrcEl);
        const targetIndex = allRows.indexOf(this);
        if (srcIndex < targetIndex) {
          this.parentNode.insertBefore(dragSrcEl, this.nextSibling);
        } else {
          this.parentNode.insertBefore(dragSrcEl, this);
        }
        await simpanUrutanBaru();
      }
      return false;
    });
    row.addEventListener("dragend", function () {
      rows.forEach((r) => {
        r.classList.remove("dragging");
        r.classList.remove("drag-over");
      });
      updateNomorTabel();
    });
  });
}

function updateNomorTabel() {
  const rows = document.querySelectorAll("#tabelIsi .draggable-row");
  rows.forEach((row, index) => {
    row.cells[1].innerText = index + 1;
  });
}

async function simpanUrutanBaru() {
  const rows = document.querySelectorAll("#tabelIsi .draggable-row");
  let batch = writeBatch(db);
  rows.forEach((row, index) => {
    const docId = row.dataset.id;
    const docRef = doc(db, "tugas_tambahan", docId);
    batch.update(docRef, { sort: index });
  });
  try {
    await batch.commit();
    loadRekap();
  } catch (err) {
    console.error("Gagal perbarui urutan: ", err);
  }
}
/* ================= DRAG AND DROP DAFTAR LAMPIRAN ================= */
function initDragAndDropLampiran() {
  const tbody = document.getElementById("tabelDaftarLampiran");
  if (!tbody) return;
  const rows = tbody.querySelectorAll(".draggable-row-lampiran");
  let dragSrcEl = null;

  rows.forEach((row) => {
    row.addEventListener("dragstart", function (e) {
      dragSrcEl = this;
      this.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragover", function (e) {
      if (e.preventDefault) {
        e.preventDefault();
      }
      this.classList.add("drag-over");
      return false;
    });
    row.addEventListener("dragleave", function () {
      this.classList.remove("drag-over");
    });
    row.addEventListener("drop", async function (e) {
      if (e.stopPropagation) {
        e.stopPropagation();
      }
      this.classList.remove("drag-over");

      if (dragSrcEl !== this) {
        const allRows = Array.from(
          tbody.querySelectorAll(".draggable-row-lampiran"),
        );
        const srcIndex = allRows.indexOf(dragSrcEl);
        const targetIndex = allRows.indexOf(this);

        if (srcIndex < targetIndex) {
          this.parentNode.insertBefore(dragSrcEl, this.nextSibling);
        } else {
          this.parentNode.insertBefore(dragSrcEl, this);
        }

        await simpanUrutanLampiranBaru();
      }
      return false;
    });
    row.addEventListener("dragend", function () {
      rows.forEach((r) => {
        r.classList.remove("dragging");
        r.classList.remove("drag-over");
      });
      updateNomorTabelLampiran();
    });
  });
}

function updateNomorTabelLampiran() {
  const rows = document.querySelectorAll(
    "#tabelDaftarLampiran .draggable-row-lampiran",
  );
  rows.forEach((row, index) => {
    row.cells[1].innerText = index + 1; // Update kolom No
    row.cells[2].innerText = `Lampiran ${index + 1}`; // Update kolom Nomor Lampiran
  });
}

async function simpanUrutanLampiranBaru() {
  const rows = document.querySelectorAll(
    "#tabelDaftarLampiran .draggable-row-lampiran",
  );
  let batch = writeBatch(db);

  rows.forEach((row, index) => {
    const docId = row.dataset.id;
    const docRef = doc(db, "lampiran", docId);
    batch.update(docRef, { sort: index });
  });

  try {
    await batch.commit();
    // Reload lampiran agar Dropdown "Pilih Lampiran" di menu Tugas ikut terupdate
    loadLampiran();
  } catch (err) {
    console.error("Gagal perbarui urutan lampiran: ", err);
  }
}
document.getElementById("currentDate").innerText =
  new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
showPage("dashboard");
loadIdentitas();

window.printTable = (tableId, type) => {
  const table = document.getElementById(tableId)?.cloneNode(true);
  if (!table) return Swal.fire("Error", "Tabel tidak ditemukan.", "error");

  // 1. Hapus kolom 'Aksi' (paling kanan)
  const actionHeader = table.querySelector("th:last-child");
  if (actionHeader && actionHeader.innerText.toLowerCase().includes("aksi")) {
    table.querySelectorAll("tr").forEach((tr) => tr.deleteCell(-1));
  }

  // --- TAMBAHAN KODE: 2. Hapus kolom 'Drag' (paling kiri) khusus tabel Tugas ---
  if (type === "tugas") {
    table.querySelectorAll("tr").forEach((tr) => {
      if (tr.cells.length > 0) {
        tr.deleteCell(0);
      }
    });
  }

  let headerContent = "";
  let titleContent = "";
  let footerContent = "";

  if (type === "rekap") {
    headerContent = `
      <div class="kop-surat">
        <div class="kop-logos">
          <img class="logo-left" src="logo1.png" alt="Logo Provinsi">
          <img class="logo-right" src="logo2.png" alt="Logo Sekolah">
        </div>
        <div class="kop-text">
          <div class="teks-provinsi">PEMERINTAH PROVINSI JAWA TENGAH</div>
          <div class="teks-dinas">DINAS PENDIDIKAN</div>
          <div class="teks-sekolah">SEKOLAH MENENGAH ATAS</div>
          <div class="teks-sekolah">NEGERI 6 SURAKARTA</div>
          <div class="teks-alamat">Jalan Mr. Sartono Nomor 30, Banjarsari, Surakarta, Jawa Tengah, Kode Pos 57135</div>
          <div class="teks-alamat">Telepon 0271-853209, Faksimile 0271-853209</div>
          <div class="teks-alamat">Laman https://sman6surakarta.sch.id, Pos-el info@smanegeri6surakarta.sch.id</div>
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
    footerContent = document.querySelector(".ttd-kepsek")?.outerHTML || "";
  } else {
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
          <tr><td style="width: 160px;">${nomorLampiran}</td><td style="width: 16px; text-align:center;">:</td><td>Keputusan Kepala SMA Negeri 6 Surakarta</td></tr>
          <tr><td>Nomor</td><td style="text-align:center;">:</td><td>${escapeHtml(nomorSK)}</td></tr>
          <tr><td>Tanggal</td><td style="text-align:center;">:</td><td>${escapeHtml(tanggalSK)}</td></tr>
          <tr><td>Tentang</td><td style="text-align:center;">:</td><td>${escapeHtml(namaLampiran)}</td></tr>
        </table>
      </div>`;
    titleContent = `<div class="lampiran-title">${escapeHtml(String(namaLampiran).toUpperCase())}</div>`;
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
      </div>`;
  }

  const win = window.open("", "", "height=800,width=1000");
  win.document.write(`
    <html>
      <head>
        <title>Print Preview</title>
        <style>
          /* Pengaturan Halaman Dasar */
          body { font-family: "Times New Roman", Times, serif; padding: 30px; color: black; line-height: 1.3; }
          @page { margin: 20mm 18mm 20mm 32mm; }
          
          /* Pengaturan Tabel & Kolom */
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11pt; }
          th, td { border: 1px solid black; padding: 8px; }
          th { background: none; text-align: center; font-weight: bold; }
          /* Kunci lebar kolom pertama (Nomor) agar presisi dan tidak melebar */
          th:first-child, td:first-child { width: 40px; text-align: center; }

          /* KOP SURAT (Untuk Rekapitulasi) */
          .kop-surat { position: relative; text-align: center; margin-bottom: 10px; }
          .kop-logos { position: absolute; left: 0; right: 0; top: -5px; height: 95px; }
          
          /* Ukuran logo dilebarkan agar proporsional / gemuk */
          .logo-left { position: absolute; left: 0; top: 0; width: 95px; height: 98px; }
          .logo-right { position: absolute; right: 0; top: 0; width: 95px; height: 98px; }
          
          /* Susunan teks kop surat */
          .kop-text { margin: 0 100px; }
          .teks-provinsi { font-size: 13pt; font-weight: normal; margin-bottom: 2px; }
          .teks-dinas { font-size: 16pt; font-weight: bold; margin-bottom: 2px; }
          .teks-sekolah { font-size: 16pt; font-weight: bold; line-height: 1.1; }
          .teks-alamat { font-size: 9.5pt; font-weight: normal; line-height: 1.4; margin-top: 1px; }
          
          /* Garis bawah ganda Kop Surat */
          .double-line { border-top: 5px solid black; border-bottom: 1px solid black; height: 2px; margin-top: 12px; }
          
          /* Judul Laporan */
          .judul { text-align: center; font-weight: bold; font-size: 12pt; margin: 20px 0; line-height: 1.6; }

          /* HEADER IDENTITAS (Untuk Lampiran/Tugas Tambahan) */
          .lampiran-header { margin-top: 10px; }
          .lampiran-meta { width: 100%; border-collapse: collapse; margin: 0 0 6px 0; font-size: 10.5pt; line-height: 1.15; }
          .lampiran-meta td { border: none !important; padding: 1px 4px; vertical-align: top; }
          .lampiran-title { margin: 22px 0 6px; text-align: center; font-weight: bold; font-size: 12pt; letter-spacing: 0.3px; }

          /* TANDA TANGAN KEPALA SEKOLAH */
          .ttd-kepsek { width: 300px; margin-left: auto; margin-top: 40px; text-align: left; font-size: 11pt; line-height: 1.5; }
          .ttd-kepsek .nama { margin-top: 70px; font-weight: bold; text-decoration: underline; }
          
          /* Optimasi Margin saat Dialog Print Aktif */
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
  if (!namaBaru)
    return Swal.fire("Info", "Nama tidak boleh kosong!", "warning");
  await updateDoc(doc(db, "lampiran", id), { nama: namaBaru });
  window.batalEditLampiran();
  Swal.fire("Tersimpan", "Nama lampiran berhasil diupdate.", "success");
  loadLampiran();
};
