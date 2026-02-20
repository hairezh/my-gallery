// ========= IndexedDB =========
const DB_NAME = "galeriaDB";
const DB_VERSION = 2; // bump: adiciona campos favoritos/tags/thumb
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
        st.createIndex("fav", "fav", { unique: false });
      } else {
        // store já existe, upgrade leve (não precisa criar índices se já existem)
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let DB = null;

function tx(mode = "readonly") {
  return DB.transaction(STORE, mode).objectStore(STORE);
}

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function guessType(mime) {
  if (!mime) return "other";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "other";
}

function humanBytes(bytes) {
  const units = ["B","KB","MB","GB","TB"];
  let i = 0, b = bytes ?? 0;
  while (b >= 1024 && i < units.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(b >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch { return iso; }
}

function toast(title, msg, ms = 2200) {
  const host = document.querySelector("#toastHost");
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<div class="toastTitle">${escapeHTML(title)}</div><div class="toastMsg">${escapeHTML(msg)}</div>`;
  host.appendChild(el);
  setTimeout(() => { el.remove(); }, ms);
}

function escapeHTML(s){
  return (s ?? "").toString()
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// ========= DB ops =========
function getAllItems() {
  return new Promise((resolve, reject) => {
    const req = tx("readonly").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function putItem(item) {
  return new Promise((resolve, reject) => {
    const req = tx("readwrite").put(item);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

function getItem(id) {
  return new Promise((resolve, reject) => {
    const req = tx("readonly").get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

function deleteItem(id) {
  return new Promise((resolve, reject) => {
    const req = tx("readwrite").delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

function clearAll() {
  return new Promise((resolve, reject) => {
    const req = tx("readwrite").clear();
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

// ========= Thumbnail / Preview =========
// cache de objectURLs (evita recriar toda hora)
const objectURLCache = new Map(); // id -> url
function getObjectURL(item) {
  if (objectURLCache.has(item.id)) return objectURLCache.get(item.id);
  const blob = item.data instanceof Blob ? item.data : new Blob([item.data], { type: item.mime });
  const url = URL.createObjectURL(blob);
  objectURLCache.set(item.id, url);
  return url;
}
function revokeObjectURL(id){
  const url = objectURLCache.get(id);
  if (url) URL.revokeObjectURL(url);
  objectURLCache.delete(id);
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// gera thumbnail de imagem (reencode leve, opcional)
async function makeImageThumb(blob, maxW = 640) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });

    const scale = Math.min(1, maxW / img.width);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));

    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { alpha: false });
    ctx.drawImage(img, 0, 0, w, h);

    const out = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.82));
    return out; // Blob jpeg
  } finally {
    URL.revokeObjectURL(url);
  }
}

// thumbnail de vídeo (captura frame + duração)
async function makeVideoThumb(videoBlob, maxW = 640) {
  const url = URL.createObjectURL(videoBlob);
  try {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.src = url;

    await new Promise((res, rej) => {
      v.onloadedmetadata = res;
      v.onerror = () => rej(new Error("Falha ao ler metadata do vídeo"));
    });

    const duration = isFinite(v.duration) ? v.duration : null;

    // tenta capturar um frame (1s ou 10% do vídeo)
    const t = duration ? Math.min(1, duration * 0.1) : 0.1;
    v.currentTime = t;

    await new Promise((res, rej) => {
      v.onseeked = res;
      v.onerror = () => rej(new Error("Falha ao buscar frame do vídeo"));
    });

    const vw = v.videoWidth || 1280;
    const vh = v.videoHeight || 720;
    const scale = Math.min(1, maxW / vw);
    const w = Math.max(1, Math.round(vw * scale));
    const h = Math.max(1, Math.round(vh * scale));

    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { alpha: false });
    ctx.drawImage(v, 0, 0, w, h);

    const thumb = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.8));
    return { thumb, duration };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fmtDuration(sec){
  if (!isFinite(sec) || sec == null) return "";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(r).padStart(2,"0")}`;
  return `${m}:${String(r).padStart(2,"0")}`;
}

// ========= UI refs =========
const folderList = document.querySelector("#folderList");
const folderCount = document.querySelector("#folderCount");
const folderInput = document.querySelector("#folderInput");
const tagsInput = document.querySelector("#tagsInput");
const fileInput = document.querySelector("#fileInput");
const pickBtn = document.querySelector("#pickBtn");
const addBtn = document.querySelector("#addBtn");
const dropzone = document.querySelector("#dropzone");
const statusEl = document.querySelector("#status");

const search = document.querySelector("#search");
const typeSelect = document.querySelector("#typeSelect");
const sortSelect = document.querySelector("#sortSelect");
const refreshBtn = document.querySelector("#refresh");
const grid = document.querySelector("#grid");
const tpl = document.querySelector("#cardTpl");

const activeFolderLabel = document.querySelector("#activeFolderLabel");
const resultsLabel = document.querySelector("#resultsLabel");
const toggleDense = document.querySelector("#toggleDense");

const exportBtn = document.querySelector("#exportBtn");
const importInput = document.querySelector("#importInput");
const clearBtn = document.querySelector("#clearBtn");
const newFolderBtn = document.querySelector("#newFolderBtn");
const storageHint = document.querySelector("#storageHint");

// Viewer
const viewer = document.querySelector("#viewer");
const viewerTitle = document.querySelector("#viewerTitle");
const viewerMeta = document.querySelector("#viewerMeta");
const viewerBody = document.querySelector("#viewerBody");
const closeViewer = document.querySelector("#closeViewer");
const favBtn = document.querySelector("#favBtn");
const renameBtn = document.querySelector("#renameBtn");
const moveBtn = document.querySelector("#moveBtn");
const downloadBtn = document.querySelector("#downloadBtn");
const deleteBtn = document.querySelector("#deleteBtn");

let STATE = {
  folder: "Todos",
  dense: false,
  items: [],
  filtered: [],
  currentViewId: null,
};

function setStatus(msg) { statusEl.textContent = msg || ""; }

// ========= Filtros / render =========
function computeFolders(items){
  const map = new Map();
  for (const it of items) {
    const f = it.folder || "Sem pasta";
    map.set(f, (map.get(f) || 0) + 1);
  }
  const list = [...map.entries()].sort((a,b) => a[0].localeCompare(b[0]));
  const total = items.length;
  return { list, total };
}

function renderFolders(items){
  const { list, total } = computeFolders(items);
  folderList.innerHTML = "";
  folderCount.textContent = String(list.length);

  const make = (name, count, active) => {
    const el = document.createElement("div");
    el.className = `folderItem ${active ? "active" : ""}`;
    el.innerHTML = `
      <div class="folderName"><span class="folderDot"></span><span>${escapeHTML(name)}</span></div>
      <div class="folderCount">${count}</div>
    `;
    el.addEventListener("click", () => {
      STATE.folder = name;
      activeFolderLabel.textContent = name;
      // “pasta alvo” pra upload segue a seleção
      folderInput.value = name === "Todos" ? "" : name;
      refresh();
    });
    return el;
  };

  folderList.appendChild(make("Todos", total, STATE.folder === "Todos"));
  for (const [name, count] of list) {
    folderList.appendChild(make(name, count, STATE.folder === name));
  }
}

function matches(it){
  const q = search.value.trim().toLowerCase();
  const t = typeSelect.value;

  if (STATE.folder !== "Todos" && (it.folder || "Sem pasta") !== STATE.folder) return false;
  if (t !== "all" && it.type !== t) return false;

  if (q) {
    const hay = `${it.name ?? ""} ${(it.tags || []).join(" ")}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function sortItems(list){
  const mode = sortSelect.value;
  const coll = new Intl.Collator("pt-BR", { sensitivity:"base", numeric:true });
  const copy = [...list];

  if (mode === "new") copy.sort((a,b) => (b.createdAt||"").localeCompare(a.createdAt||""));
  else if (mode === "old") copy.sort((a,b) => (a.createdAt||"").localeCompare(b.createdAt||""));
  else if (mode === "name") copy.sort((a,b) => coll.compare(a.name||"", b.name||""));
  else if (mode === "size") copy.sort((a,b) => (b.size||0) - (a.size||0));
  return copy;
}

function renderGrid(){
  grid.classList.toggle("dense", STATE.dense);
  grid.innerHTML = "";

  const list = sortItems(STATE.items.filter(matches));
  STATE.filtered = list;

  resultsLabel.textContent = `${list.length} item(ns)`;

  if (list.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "Nada aqui ainda. Adicione arquivos acima 🙂";
    grid.appendChild(empty);
    return;
  }

  for (const it of list) {
    const node = tpl.content.cloneNode(true);
    const card = node.querySelector(".card");
    const img = node.querySelector(".thumbImg");
    const title = node.querySelector(".title");
    const folder = node.querySelector(".folder");
    const size = node.querySelector(".size");
    const tags = node.querySelector(".tags");
    const star = node.querySelector(".star");
    const typeBadge = node.querySelector(".typeBadge");
    const durBadge = node.querySelector(".durBadge");

    title.textContent = it.name || "(sem nome)";
    folder.textContent = it.folder || "Sem pasta";
    size.textContent = humanBytes(it.size || 0);

    // badges
    typeBadge.textContent = it.type === "video" ? "VÍDEO" : it.type === "image" ? "IMG" : "ARQ";
    durBadge.textContent = it.type === "video" && it.duration ? fmtDuration(it.duration) : "";

    // tags
    tags.innerHTML = "";
    for (const tag of (it.tags || []).slice(0, 6)) {
      const t = document.createElement("span");
      t.className = "tag";
      t.textContent = tag;
      tags.appendChild(t);
    }

    // estrela
    star.classList.toggle("fav", !!it.fav);
    star.textContent = it.fav ? "★" : "☆";
    star.addEventListener("click", async (e) => {
      e.stopPropagation();
      it.fav = !it.fav;
      await putItem(it);
      toast("Favoritos", it.fav ? "Marcado como favorito." : "Removido dos favoritos.");
      await reload();
    });

    // thumbnail: usa thumb se existir, senão fallback para objectURL (pode ser pesado)
    if (it.thumb) {
      const thumbBlob = it.thumb instanceof Blob ? it.thumb : new Blob([it.thumb], { type: "image/jpeg" });
      img.src = await blobToDataURL(thumbBlob);
    } else {
      // fallback rápido
      img.src = getObjectURL(it);
    }
    img.alt = it.name || "";

    card.addEventListener("click", () => openViewer(it.id));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openViewer(it.id); }
    });

    grid.appendChild(node);
  }
}

async function reload(){
  // limpa URLs para não vazar memória em atualizações
  for (const it of STATE.items) revokeObjectURL(it.id);
  STATE.items = await getAllItems();
  renderFolders(STATE.items);
  renderGrid();
  updateStorageHint();
}

function refresh(){
  renderFolders(STATE.items);
  renderGrid();
}

async function updateStorageHint(){
  if (!navigator.storage?.estimate) return;
  try{
    const est = await navigator.storage.estimate();
    const used = humanBytes(est.usage || 0);
    const total = est.quota ? humanBytes(est.quota) : "—";
    storageHint.textContent = `Armazenamento do navegador: ${used} / ${total}`;
  }catch{}
}

// ========= Viewer =========
async function openViewer(id){
  const it = await getItem(id);
  if (!it) return;

  STATE.currentViewId = id;

  viewerTitle.textContent = it.name || "(sem nome)";
  viewerMeta.textContent = `${it.folder || "Sem pasta"} • ${humanBytes(it.size||0)} • ${fmtDate(it.createdAt)} ${it.type==="video" && it.duration ? `• ${fmtDuration(it.duration)}` : ""}`;

  favBtn.textContent = it.fav ? "★" : "☆";

  viewerBody.innerHTML = "";
  const url = getObjectURL(it);

  if (it.type === "image") {
    const img = document.createElement("img");
    img.src = url;
    img.alt = it.name || "";
    viewerBody.appendChild(img);
  } else if (it.type === "video") {
    const v = document.createElement("video");
    v.src = url;
    v.controls = true;
    v.autoplay = true;
    v.preload = "metadata";
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

// ações do viewer
favBtn.addEventListener("click", async () => {
  const it = await getItem(STATE.currentViewId);
  if (!it) return;
  it.fav = !it.fav;
  await putItem(it);
  favBtn.textContent = it.fav ? "★" : "☆";
  toast("Favoritos", it.fav ? "Marcado como favorito." : "Removido dos favoritos.");
  await reload();
});

renameBtn.addEventListener("click", async () => {
  const it = await getItem(STATE.currentViewId);
  if (!it) return;
  const name = prompt("Novo nome:", it.name || "");
  if (!name) return;
  it.name = name.trim();
  await putItem(it);
  toast("Renomeado", it.name);
  await openViewer(it.id);
  await reload();
});

moveBtn.addEventListener("click", async () => {
  const it = await getItem(STATE.currentViewId);
  if (!it) return;
  const folder = prompt("Mover para qual pasta?", it.folder || "Sem pasta");
  if (!folder) return;
  it.folder = folder.trim() || "Sem pasta";
  await putItem(it);
  toast("Movido", `Agora em: ${it.folder}`);
  await openViewer(it.id);
  await reload();
});

downloadBtn.addEventListener("click", async () => {
  const it = await getItem(STATE.currentViewId);
  if (!it) return;
  const blob = it.data instanceof Blob ? it.data : new Blob([it.data], { type: it.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = it.name || "arquivo";
  a.click();
  URL.revokeObjectURL(url);
});

deleteBtn.addEventListener("click", async () => {
  const it = await getItem(STATE.currentViewId);
  if (!it) return;
  if (!confirm(`Excluir "${it.name}"?`)) return;

  await deleteItem(it.id);
  revokeObjectURL(it.id);
  viewer.close();
  toast("Excluído", it.name || "item");
  await reload();
});

// fecha ao clicar fora
viewer.addEventListener("click", (e) => {
  const rect = viewer.getBoundingClientRect();
  const inside = rect.left <= e.clientX && e.clientX <= rect.right && rect.top <= e.clientY && e.clientY <= rect.bottom;
  if (!inside) viewer.close();
});

// ========= Upload =========
pickBtn.addEventListener("click", () => fileInput.click());

async function addFiles(files){
  if (!files || files.length === 0) return;

  const folder = (folderInput.value || (STATE.folder !== "Todos" ? STATE.folder : "") || "Sem pasta").trim() || "Sem pasta";
  const tags = (tagsInput.value || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 20);

  addBtn.disabled = true;
  setStatus(`Salvando ${files.length} arquivo(s)…`);

  let ok = 0;
  for (const f of files) {
    try{
      const mime = f.type || "application/octet-stream";
      const type = guessType(mime);

      const item = {
        id: uid(),
        name: f.name,
        folder,
        tags,
        mime,
        type,
        size: f.size,
        createdAt: new Date().toISOString(),
        fav: false,
        duration: null,
        thumb: null,
        data: f // Blob
      };

      // thumbs
      if (type === "image") {
        const t = await makeImageThumb(f);
        item.thumb = t;
      } else if (type === "video") {
        const { thumb, duration } = await makeVideoThumb(f);
        item.thumb = thumb;
        item.duration = duration;
      }

      await putItem(item);
      ok++;
    }catch(e){
      console.error(e);
      toast("Falha ao adicionar", `Arquivo: ${f?.name || "?"}`);
    }
  }

  fileInput.value = "";
  addBtn.disabled = false;
  setStatus(ok ? `Adicionado: ${ok}` : "Nada foi adicionado.");
  if (ok) toast("Upload", `Adicionado ${ok} item(ns) em "${folder}".`);
  setTimeout(() => setStatus(""), 1200);
  await reload();
}

addBtn.addEventListener("click", async () => {
  await addFiles(fileInput.files);
});

// Drag & drop
dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.style.borderColor = "rgba(58,116,255,.55)";
});
dropzone.addEventListener("dragleave", () => {
  dropzone.style.borderColor = "rgba(233,238,245,.22)";
});
dropzone.addEventListener("drop", async (e) => {
  e.preventDefault();
  dropzone.style.borderColor = "rgba(233,238,245,.22)";
  const files = e.dataTransfer?.files;
  await addFiles(files);
});

// ========= Pastas =========
newFolderBtn.addEventListener("click", () => {
  const name = prompt("Nome da nova pasta:");
  if (!name) return;
  STATE.folder = name.trim();
  activeFolderLabel.textContent = STATE.folder;
  folderInput.value = STATE.folder;
  toast("Pasta", `Selecionada: ${STATE.folder}`);
  refresh();
});

// ========= Backup =========
exportBtn.addEventListener("click", async () => {
  const items = await getAllItems();
  setStatus("Exportando backup…");

  const packed = [];
  for (const it of items) {
    const dataBuf = await it.data.arrayBuffer();
    const dataB64 = btoa(String.fromCharCode(...new Uint8Array(dataBuf)));

    let thumbB64 = null;
    if (it.thumb) {
      const tb = it.thumb instanceof Blob ? it.thumb : new Blob([it.thumb], { type: "image/jpeg" });
      const tbuf = await tb.arrayBuffer();
      thumbB64 = btoa(String.fromCharCode(...new Uint8Array(tbuf)));
    }

    packed.push({
      ...it,
      data: dataB64,
      thumb: thumbB64
    });
  }

  const payload = { version: 2, exportedAt: new Date().toISOString(), items: packed };
  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "galeria-backup.json";
  a.click();
  URL.revokeObjectURL(url);

  setStatus("");
  toast("Backup", "Exportado como galeria-backup.json");
});

importInput.addEventListener("change", async () => {
  const file = importInput.files?.[0];
  if (!file) return;

  setStatus("Importando…");
  try{
    const payload = JSON.parse(await file.text());
    if (!payload?.items) throw new Error("Formato inválido");

    let count = 0;
    for (const it of payload.items) {
      const dataBin = Uint8Array.from(atob(it.data), c => c.charCodeAt(0));
      const dataBlob = new Blob([dataBin], { type: it.mime || "application/octet-stream" });

      let thumbBlob = null;
      if (it.thumb) {
        const tb = Uint8Array.from(atob(it.thumb), c => c.charCodeAt(0));
        thumbBlob = new Blob([tb], { type: "image/jpeg" });
      }

      await putItem({
        id: it.id || uid(),
        name: it.name || "arquivo",
        folder: it.folder || "Sem pasta",
        tags: Array.isArray(it.tags) ? it.tags : [],
        mime: it.mime || "application/octet-stream",
        type: it.type || guessType(it.mime),
        size: it.size || dataBlob.size,
        createdAt: it.createdAt || new Date().toISOString(),
        fav: !!it.fav,
        duration: isFinite(it.duration) ? it.duration : null,
        thumb: thumbBlob,
        data: dataBlob
      });
      count++;
    }

    toast("Import", `Importado ${count} item(ns).`);
    await reload();
  }catch(e){
    console.error(e);
    toast("Falha", "Não consegui importar esse backup.");
  }finally{
    setStatus("");
    importInput.value = "";
  }
});

clearBtn.addEventListener("click", async () => {
  if (!confirm("Isso apaga tudo salvo neste navegador. Continuar?")) return;
  await clearAll();
  for (const id of objectURLCache.keys()) revokeObjectURL(id);
  toast("Limpo", "Tudo foi apagado neste navegador.");
  await reload();
});

// ========= Atalhos =========
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    search.focus();
  }
});

// ========= Controles =========
toggleDense.addEventListener("click", () => {
  STATE.dense = !STATE.dense;
  toggleDense.textContent = STATE.dense ? "Modo confortável" : "Modo compacto";
  renderGrid();
});

search.addEventListener("input", () => {
  clearTimeout(window.__t);
  window.__t = setTimeout(refresh, 120);
});
typeSelect.addEventListener("change", refresh);
sortSelect.addEventListener("change", refresh);
refreshBtn.addEventListener("click", reload);

// ========= Boot =========
(async function boot(){
  DB = await openDB();
  STATE.items = await getAllItems();
  renderFolders(STATE.items);
  activeFolderLabel.textContent = STATE.folder;
  renderGrid();
  updateStorageHint();

  toast("Pronto", "Sua galeria está viva. Arraste arquivos pra começar.");
})();
