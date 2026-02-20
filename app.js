// ===== IndexedDB wrapper (sem libs) =====
const DB_NAME = "galeriaDB";
const DB_VERSION = 1;
const STORE = "items";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const st = db.createObjectStore(STORE, { keyPath: "id" });
        st.createIndex("folder", "folder", { unique: false });
        st.createIndex("name", "name", { unique: false });
        st.createIndex("type", "type", { unique: false });
        st.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode = "readonly") {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function id() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function humanBytes(bytes) {
  const units = ["B","KB","MB","GB","TB"];
  let i = 0, b = bytes;
  while (b >= 1024 && i < units.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(b >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

// ===== UI =====
const grid = document.querySelector("#grid");
const tpl = document.querySelector("#cardTpl");
const search = document.querySelector("#search");
const folderSelect = document.querySelector("#folderSelect");
const typeSelect = document.querySelector("#typeSelect");
const refreshBtn = document.querySelector("#refresh");

const folderInput = document.querySelector("#folderInput");
const fileInput = document.querySelector("#fileInput");
const addBtn = document.querySelector("#addBtn");
const statusEl = document.querySelector("#status");

const exportBtn = document.querySelector("#exportBtn");
const importInput = document.querySelector("#importInput");
const clearBtn = document.querySelector("#clearBtn");

const viewer = document.querySelector("#viewer");
const viewerTitle = document.querySelector("#viewerTitle");
const viewerBody = document.querySelector("#viewerBody");
const closeViewer = document.querySelector("#closeViewer");

let DB = null;
let objectURLCache = new Map(); // id -> objectURL

function setStatus(msg) { statusEl.textContent = msg || ""; }

function makeObjectURL(item) {
  // item.data é Blob (ou ArrayBuffer no import antigo)
  let blob = item.data;
  if (blob && blob instanceof ArrayBuffer) blob = new Blob([blob], { type: item.mime });
  const url = URL.createObjectURL(blob);
  return url;
}

function clearObjectURLCache() {
  for (const url of objectURLCache.values()) URL.revokeObjectURL(url);
  objectURLCache.clear();
}

async function getAllItems() {
  return new Promise((resolve, reject) => {
    const store = tx(DB, "readonly");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function putItem(item) {
  return new Promise((resolve, reject) => {
    const store = tx(DB, "readwrite");
    const req = store.put(item);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function deleteItem(itemId) {
  return new Promise((resolve, reject) => {
    const store = tx(DB, "readwrite");
    const req = store.delete(itemId);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function clearAll() {
  return new Promise((resolve, reject) => {
    const store = tx(DB, "readwrite");
    const req = store.clear();
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

function guessType(mime) {
  if (!mime) return "other";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "other";
}

async function refreshFolders(items) {
  const counts = new Map();
  for (const it of items) {
    counts.set(it.folder, (counts.get(it.folder) || 0) + 1);
  }
  const current = folderSelect.value || "Todos";

  folderSelect.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "Todos";
  optAll.textContent = "Todos";
  folderSelect.appendChild(optAll);

  [...counts.entries()].sort((a,b) => a[0].localeCompare(b[0])).forEach(([folder, count]) => {
    const opt = document.createElement("option");
    opt.value = folder;
    opt.textContent = `${folder} (${count})`;
    folderSelect.appendChild(opt);
  });

  // tenta manter seleção
  const exists = [...folderSelect.options].some(o => o.value === current);
  folderSelect.value = exists ? current : "Todos";
}

function matchesFilters(item) {
  const q = search.value.trim().toLowerCase();
  const folder = folderSelect.value || "Todos";
  const type = typeSelect.value || "all";

  if (folder !== "Todos" && item.folder !== folder) return false;
  if (type !== "all" && item.type !== type) return false;
  if (q) {
    const name = (item.name || "").toLowerCase();
    if (!name.includes(q)) return false;
  }
  return true;
}

function render(items) {
  grid.innerHTML = "";

  const filtered = items.filter(matchesFilters)
    .sort((a,b) => b.createdAt.localeCompare(a.createdAt));

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.style.opacity = "0.8";
    empty.textContent = "Nada aqui ainda. Adicione imagens/vídeos acima 🙂";
    grid.appendChild(empty);
    return;
  }

  for (const item of filtered) {
    const node = tpl.content.cloneNode(true);
    const preview = node.querySelector(".preview");
    const nameEl = node.querySelector(".name");
    const subEl = node.querySelector(".sub");
    const openBtn = node.querySelector(".open");
    const delBtn = node.querySelector(".del");

    nameEl.textContent = item.name;

    const sizeTxt = item.size ? humanBytes(item.size) : "";
    subEl.innerHTML = `<span>${item.folder}</span><span>${sizeTxt}</span>`;

    // preview
    preview.innerHTML = "";
    let url = objectURLCache.get(item.id);
    if (!url) {
      url = makeObjectURL(item);
      objectURLCache.set(item.id, url);
    }

    if (item.type === "image") {
      const img = document.createElement("img");
      img.loading = "lazy";
      img.src = url;
      preview.appendChild(img);
    } else if (item.type === "video") {
      const v = document.createElement("video");
      v.src = url;
      v.controls = false;
      v.muted = true;
      v.preload = "metadata";
      preview.appendChild(v);
    } else {
      preview.textContent = "Arquivo";
    }

    openBtn.addEventListener("click", () => openViewer(item));
    delBtn.addEventListener("click", async () => {
      if (!confirm(`Excluir "${item.name}"?`)) return;
      const oldUrl = objectURLCache.get(item.id);
      if (oldUrl) URL.revokeObjectURL(oldUrl);
      objectURLCache.delete(item.id);
      await deleteItem(item.id);
      await refreshAll();
    });

    grid.appendChild(node);
  }
}

function openViewer(item) {
  viewerTitle.textContent = `${item.folder} — ${item.name}`;
  viewerBody.innerHTML = "";

  let url = objectURLCache.get(item.id);
  if (!url) {
    url = makeObjectURL(item);
    objectURLCache.set(item.id, url);
  }

  if (item.type === "image") {
    const img = document.createElement("img");
    img.src = url;
    viewerBody.appendChild(img);
  } else if (item.type === "video") {
    const v = document.createElement("video");
    v.src = url;
    v.controls = true;
    v.autoplay = true;
    viewerBody.appendChild(v);
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.textContent = "Abrir arquivo";
    viewerBody.appendChild(a);
  }

  viewer.showModal();
}

closeViewer.addEventListener("click", () => viewer.close());
viewer.addEventListener("click", (e) => {
  // clicar fora fecha
  const rect = viewer.getBoundingClientRect();
  const inDialog = rect.top <= e.clientY && e.clientY <= rect.bottom && rect.left <= e.clientX && e.clientX <= rect.right;
  if (!inDialog) viewer.close();
});

async function refreshAll() {
  clearObjectURLCache();
  const items = await getAllItems();
  await refreshFolders(items);
  render(items);
}

// ===== Ações =====
addBtn.addEventListener("click", async () => {
  const folder = (folderInput.value || "Sem pasta").trim() || "Sem pasta";
  const files = fileInput.files;

  if (!files || files.length === 0) return setStatus("Escolha arquivos primeiro.");

  setStatus("Salvando...");
  addBtn.disabled = true;

  try {
    for (const f of files) {
      const item = {
        id: id(),
        name: f.name,
        folder,
        mime: f.type || "application/octet-stream",
        type: guessType(f.type),
        size: f.size,
        createdAt: new Date().toISOString(),
        data: f // Blob
      };
      await putItem(item);
    }
    fileInput.value = "";
    setStatus("Adicionado!");
    await refreshAll();
    setTimeout(() => setStatus(""), 1200);
  } catch (e) {
    console.error(e);
    setStatus("Erro ao salvar (talvez o arquivo seja grande demais pro navegador).");
  } finally {
    addBtn.disabled = false;
  }
});

search.addEventListener("input", () => {
  clearTimeout(window.__t);
  window.__t = setTimeout(refreshAll, 120);
});
folderSelect.addEventListener("change", refreshAll);
typeSelect.addEventListener("change", refreshAll);
refreshBtn.addEventListener("click", refreshAll);

exportBtn.addEventListener("click", async () => {
  const items = await getAllItems();
  // Converter Blob -> ArrayBuffer pra caber num JSON (base64)
  setStatus("Exportando...");
  const packed = [];
  for (const it of items) {
    const buf = await it.data.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    packed.push({
      ...it,
      data: b64
    });
  }
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    items: packed
  };
  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "galeria-backup.json";
  a.click();
  URL.revokeObjectURL(url);

  setStatus("Backup exportado.");
  setTimeout(() => setStatus(""), 1200);
});

importInput.addEventListener("change", async () => {
  const file = importInput.files?.[0];
  if (!file) return;

  setStatus("Importando...");
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    if (!payload?.items) throw new Error("Formato inválido.");

    for (const it of payload.items) {
      // data é base64 -> Blob
      const bin = Uint8Array.from(atob(it.data), c => c.charCodeAt(0));
      const blob = new Blob([bin], { type: it.mime || "application/octet-stream" });

      await putItem({
        id: it.id || id(),
        name: it.name || "arquivo",
        folder: it.folder || "Sem pasta",
        mime: it.mime || "application/octet-stream",
        type: it.type || guessType(it.mime),
        size: it.size || blob.size,
        createdAt: it.createdAt || new Date().toISOString(),
        data: blob
      });
    }

    setStatus("Import concluído!");
    await refreshAll();
    setTimeout(() => setStatus(""), 1200);
  } catch (e) {
    console.error(e);
    setStatus("Falha ao importar backup.");
  } finally {
    importInput.value = "";
  }
});

clearBtn.addEventListener("click", async () => {
  if (!confirm("Isso vai apagar tudo salvo neste navegador. Continuar?")) return;
  await clearAll();
  await refreshAll();
});

// ===== Boot =====
(async function boot() {
  DB = await openDB();
  await refreshAll();
})();
