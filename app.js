/* Galeria local (IndexedDB) — imagens e vídeos
   Tema escuro + thumbs pequenos + hover preview central
*/

const $ = (sel) => document.querySelector(sel);

const els = {
  grid: $("#grid"),
  crumbs: $("#crumbs"),
  empty: $("#empty"),

  btnAddMedia: $("#btnAddMedia"),
  btnAddFolder: $("#btnAddFolder"),
  btnSearch: $("#btnSearch"),

  filePicker: $("#filePicker"),

  badgePath: $("#badgePath"),
  badgeCount: $("#badgeCount"),
  badgeMode: $("#badgeMode"),

  searchInput: $("#searchInput"),
  searchHint: $("#searchHint"),

  folderModal: $("#folderModal"),
  folderForm: $("#folderForm"),
  folderModalTitle: $("#folderModalTitle"),
  folderName: $("#folderName"),
  folderDate: $("#folderDate"),
  folderCancel: $("#folderCancel"),

  viewerModal: $("#viewerModal"),
  viewerBody: $("#viewerBody"),
  viewerName: $("#viewerName"),
  viewerSub: $("#viewerSub"),
  viewerClose: $("#viewerClose"),
  viewerDelete: $("#viewerDelete"),
  viewerRename: $("#viewerRename"),
  viewerMove: $("#viewerMove"),
  viewerApply: $("#viewerApply"),

  hoverPreview: $("#hoverPreview"),
  hoverCard: $("#hoverCard"),

  toast: $("#toast"),
  toastText: $("#toastText"),
};

const state = {
  currentFolderId: null,
  searchOpen: false,
  searchQuery: "",

  folders: [],
  media: [],

  editingFolderId: null,
  viewingMediaId: null,

  hover: {
    id: null,
    url: null,
    timerIn: null,
    timerOut: null,
  }
};

function uid(){
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "id-" + Math.random().toString(16).slice(2) + "-" + Date.now();
}

function todayISO(){
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0,10);
}

function fmtDate(iso){
  if (!iso) return "—";
  const [y,m,dd] = iso.split("-").map(Number);
  const d = new Date(y, m-1, dd);
  return d.toLocaleDateString("pt-BR", { year:"numeric", month:"2-digit", day:"2-digit" });
}

function fmtBytes(n){
  if (!n) return "0 B";
  const k = 1024;
  const sizes = ["B","KB","MB","GB","TB"];
  const i = Math.floor(Math.log(n)/Math.log(k));
  return (n/Math.pow(k,i)).toFixed(i ? 1 : 0) + " " + sizes[i];
}

function showToast(msg){
  els.toastText.textContent = msg;
  els.toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => els.toast.classList.remove("show"), 1100);
}

/* ---------------- IndexedDB ---------------- */

const DB_NAME = "galeria-minimal";
const DB_VER = 1;

function idbOpen(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;

      const folders = db.createObjectStore("folders", { keyPath: "id" });
      folders.createIndex("nameLower", "nameLower", { unique: false });
      folders.createIndex("createdISO", "createdISO", { unique: false });

      const media = db.createObjectStore("media", { keyPath: "id" });
      media.createIndex("folderId", "folderId", { unique: false });
      media.createIndex("nameLower", "nameLower", { unique: false });
      media.createIndex("createdAt", "createdAt", { unique: false });

      db.createObjectStore("blobs", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(storeNames, mode, fn){
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeNames, mode);
    const stores = storeNames.map((n) => t.objectStore(n));
    let out;
    Promise.resolve(fn(...stores))
      .then((r) => { out = r; })
      .catch(reject);
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

async function dbGetAllFolders(){
  return tx(["folders"], "readonly", (folders) =>
    new Promise((res, rej) => {
      const req = folders.getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    })
  );
}

async function dbGetAllMediaMeta(){
  return tx(["media"], "readonly", (media) =>
    new Promise((res, rej) => {
      const req = media.getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    })
  );
}

async function dbPutFolder(folder){
  return tx(["folders"], "readwrite", (folders) => folders.put(folder));
}

async function dbDeleteFolder(folderId){
  return tx(["folders","media","blobs"], "readwrite", async (folders, media, blobs) => {
    const mids = await new Promise((res, rej) => {
      const idx = media.index("folderId");
      const req = idx.getAll(folderId);
      req.onsuccess = () => res((req.result || []).map(x => x.id));
      req.onerror = () => rej(req.error);
    });

    for (const id of mids){
      media.delete(id);
      blobs.delete(id);
    }
    folders.delete(folderId);
  });
}

async function dbPutMedia(meta, blob, thumb){
  return tx(["media","blobs"], "readwrite", (media, blobs) => {
    media.put(meta);
    blobs.put({ id: meta.id, blob, thumb });
  });
}

async function dbGetBlobs(mediaId){
  return tx(["blobs"], "readonly", (blobs) =>
    new Promise((res, rej) => {
      const req = blobs.get(mediaId);
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => rej(req.error);
    })
  );
}

async function dbDeleteMedia(mediaId){
  return tx(["media","blobs"], "readwrite", (media, blobs) => {
    media.delete(mediaId);
    blobs.delete(mediaId);
  });
}

async function dbUpdateMediaMeta(mediaId, patch){
  return tx(["media"], "readwrite", (media) =>
    new Promise((res, rej) => {
      const g = media.get(mediaId);
      g.onsuccess = () => {
        const cur = g.result;
        if (!cur) return res(null);
        const next = { ...cur, ...patch };
        next.nameLower = (next.name || "").toLowerCase();
        const p = media.put(next);
        p.onsuccess = () => res(next);
        p.onerror = () => rej(p.error);
      };
      g.onerror = () => rej(g.error);
    })
  );
}

/* ---------------- thumbs ---------------- */

async function imgToThumbBlob(fileBlob){
  const img = new Image();
  const url = URL.createObjectURL(fileBlob);
  try{
    await new Promise((res, rej) => {
      img.onload = () => res();
      img.onerror = rej;
      img.src = url;
    });

    const maxW = 360;
    const ratio = img.width / img.height || 1;
    const w = Math.min(maxW, img.width);
    const h = Math.round(w / ratio);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.78));
    return blob || fileBlob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function videoToThumbBlob(fileBlob){
  const url = URL.createObjectURL(fileBlob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = url;

  try{
    await new Promise((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = rej;
    });

    const t = Math.min(0.25, (video.duration || 1) / 4);
    await new Promise((res) => {
      const handler = () => {
        video.removeEventListener("seeked", handler);
        res();
      };
      video.addEventListener("seeked", handler);
      video.currentTime = t;
    });

    const w = 360;
    const ratio = (video.videoWidth || 16) / (video.videoHeight || 10);
    const h = Math.round(w / ratio);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, w, h);

    const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
    return blob;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ---------------- hover preview ---------------- */

function canHover(){
  return window.matchMedia && window.matchMedia("(hover: hover)").matches;
}

function clearHoverURL(){
  if (state.hover.url){
    URL.revokeObjectURL(state.hover.url);
    state.hover.url = null;
  }
}

function hideHoverPreview(){
  clearTimeout(state.hover.timerIn);
  clearTimeout(state.hover.timerOut);
  state.hover.timerOut = setTimeout(() => {
    state.hover.id = null;
    els.hoverCard.innerHTML = "";
    els.hoverPreview.classList.remove("show");
    clearHoverURL();
  }, 60);
}

async function showHoverPreview(mediaId){
  if (!canHover()) return;

  clearTimeout(state.hover.timerOut);
  clearTimeout(state.hover.timerIn);

  state.hover.timerIn = setTimeout(async () => {
    // se mudou de item no meio, ignora
    state.hover.id = mediaId;

    const meta = state.media.find(m => m.id === mediaId);
    if (!meta) return;

    const rec = await dbGetBlobs(mediaId);
    if (!rec?.blob) return;

    // troca url
    clearHoverURL();
    state.hover.url = URL.createObjectURL(rec.blob);

    els.hoverCard.innerHTML = "";

    if (meta.type === "video"){
      const v = document.createElement("video");
      v.src = state.hover.url;
      v.muted = true;
      v.autoplay = true;
      v.loop = true;
      v.playsInline = true;
      els.hoverCard.appendChild(v);
    } else {
      const img = document.createElement("img");
      img.src = state.hover.url;
      img.alt = meta.name || "preview";
      els.hoverCard.appendChild(img);
    }

    els.hoverPreview.classList.add("show");
  }, 120);
}

/* ---------------- render ---------------- */

function setBadges(){
  const folder = state.currentFolderId
    ? state.folders.find(f => f.id === state.currentFolderId)
    : null;

  els.badgePath.textContent = folder ? `Pasta: ${folder.name}` : "Raiz";

  const q = state.searchQuery.trim();
  els.badgeMode.textContent = q ? "modo: busca" : "modo: normal";

  const count = computeVisibleCount();
  els.badgeCount.textContent = `${count} itens`;
}

function computeVisibleCount(){
  const q = state.searchQuery.trim().toLowerCase();
  if (q){
    const folderHits = state.folders.filter(f => f.nameLower.includes(q) || (f.createdISO || "").includes(q));
    const mediaHits = state.media.filter(m => (m.nameLower || "").includes(q) || (m.type || "").includes(q) || (m.mime || "").includes(q));
    return folderHits.length + mediaHits.length;
  }

  if (!state.currentFolderId){
    const folders = state.folders.length;
    const loose = state.media.filter(m => !m.folderId).length;
    return folders + loose;
  }

  return state.media.filter(m => m.folderId === state.currentFolderId).length;
}

function setCrumbs(){
  const wrap = document.createElement("div");

  const root = document.createElement("a");
  root.href = "#";
  root.className = "badge";
  root.textContent = "Raiz";
  root.onclick = (e) => {
    e.preventDefault();
    state.currentFolderId = null;
    render();
  };
  wrap.appendChild(root);

  if (state.currentFolderId){
    const f = state.folders.find(x => x.id === state.currentFolderId);
    const cur = document.createElement("span");
    cur.className = "badge subtle";
    cur.textContent = `› ${f?.name || "Pasta"}`;
    wrap.appendChild(cur);
  }

  els.crumbs.innerHTML = "";
  els.crumbs.appendChild(wrap);
}

function isEmptyAll(){
  return state.folders.length === 0 && state.media.length === 0;
}

async function render(){
  setCrumbs();
  els.grid.innerHTML = "";
  els.empty.hidden = !isEmptyAll();

  const q = state.searchQuery.trim().toLowerCase();
  setBadges();

  if (q){
    const folderHits = state.folders
      .filter(f => f.nameLower.includes(q) || (f.createdISO || "").includes(q))
      .sort((a,b) => (b.createdISO||"").localeCompare(a.createdISO||""));

    const mediaHits = state.media
      .filter(m => (m.nameLower || "").includes(q) || (m.type || "").includes(q) || (m.mime || "").includes(q))
      .sort((a,b) => (b.createdAt||0) - (a.createdAt||0));

    for (const f of folderHits) els.grid.appendChild(folderCube(f));
    for (const m of mediaHits) els.grid.appendChild(await mediaCube(m));

    if (!folderHits.length && !mediaHits.length){
      const empty = document.createElement("div");
      empty.className = "emptyCard";
      empty.innerHTML = `<div class="emptyTitle">Sem resultados</div>
        <div class="emptyText">Tente outro termo (pasta, nome do arquivo, “video”, “image”…).</div>`;
      els.grid.appendChild(empty);
    }
    return;
  }

  if (!state.currentFolderId){
    const folders = [...state.folders].sort((a,b) => (b.createdISO||"").localeCompare(a.createdISO||""));
    for (const f of folders) els.grid.appendChild(folderCube(f));

    const loose = state.media
      .filter(m => !m.folderId)
      .sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
    for (const m of loose) els.grid.appendChild(await mediaCube(m));
    return;
  }

  const inside = state.media
    .filter(m => m.folderId === state.currentFolderId)
    .sort((a,b) => (b.createdAt||0) - (a.createdAt||0));

  for (const m of inside) els.grid.appendChild(await mediaCube(m));
}

/* ---------------- cubes ---------------- */

function folderCube(folder){
  const cube = document.createElement("section");
  cube.className = "cube";
  cube.tabIndex = 0;

  const bg = document.createElement("div");
  bg.className = "folderBg";
  cube.appendChild(bg);

  const ic = document.createElement("div");
  ic.className = "folderIcon";
  ic.textContent = "📁";
  cube.appendChild(ic);

  const meta = document.createElement("div");
  meta.className = "meta";

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = folder.name;

  const mini = document.createElement("div");
  mini.className = "mini";
  mini.textContent = fmtDate(folder.createdISO);

  meta.appendChild(name);
  meta.appendChild(mini);
  cube.appendChild(meta);

  cube.onclick = () => {
    state.currentFolderId = folder.id;
    render();
  };

  cube.oncontextmenu = async (e) => {
    e.preventDefault();
    const okEdit = confirm("Editar esta pasta?\n\nOK = editar\nCancelar = não");
    if (okEdit) openFolderModal(folder.id);
    else {
      const okDel = confirm("Excluir esta pasta e tudo dentro dela?");
      if (!okDel) return;
      await dbDeleteFolder(folder.id);
      await refreshFromDB();
      if (state.currentFolderId === folder.id) state.currentFolderId = null;
      showToast("Pasta excluída.");
      render();
    }
  };

  return cube;
}

async function mediaCube(meta){
  const cube = document.createElement("section");
  cube.className = "cube";
  cube.tabIndex = 0;

  const rec = await dbGetBlobs(meta.id);
  if (rec?.thumb){
    const url = URL.createObjectURL(rec.thumb);
    const img = document.createElement("img");
    img.src = url;
    img.alt = meta.name || "thumb";
    img.onload = () => URL.revokeObjectURL(url);
    cube.appendChild(img);
  } else {
    const ph = document.createElement("div");
    ph.style.position = "absolute";
    ph.style.inset = "0";
    ph.style.display = "grid";
    ph.style.placeItems = "center";
    ph.style.color = "rgba(233,233,238,.55)";
    ph.style.fontWeight = "900";
    ph.textContent = meta.type === "video" ? "VÍDEO" : "IMAGEM";
    cube.appendChild(ph);
  }

  const metaBar = document.createElement("div");
  metaBar.className = "meta";

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = meta.name || "(sem nome)";

  const mini = document.createElement("div");
  mini.className = "mini";
  mini.textContent = meta.type === "video" ? "Vídeo" : "Imagem";

  metaBar.appendChild(name);
  metaBar.appendChild(mini);
  cube.appendChild(metaBar);

  // hover preview
  cube.addEventListener("pointerenter", () => showHoverPreview(meta.id));
  cube.addEventListener("pointerleave", hideHoverPreview);

  cube.onclick = () => openViewer(meta.id);

  cube.oncontextmenu = async (e) => {
    e.preventDefault();
    const ok = confirm("Excluir este arquivo?");
    if (!ok) return;
    await dbDeleteMedia(meta.id);
    await refreshFromDB();
    showToast("Arquivo excluído.");
    render();
  };

  return cube;
}

/* ---------------- Folder modal ---------------- */

function openFolderModal(folderId = null){
  state.editingFolderId = folderId;

  const editing = folderId ? state.folders.find(f => f.id === folderId) : null;
  els.folderModalTitle.textContent = editing ? "Editar pasta" : "Nova pasta";
  els.folderName.value = editing?.name || "";
  els.folderDate.value = editing?.createdISO || todayISO();

  els.folderModal.showModal();
  els.folderName.focus();
}

els.folderCancel.addEventListener("click", () => els.folderModal.close());

els.folderForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = els.folderName.value.trim();
  const createdISO = els.folderDate.value;
  if (!name) return;

  const now = Date.now();
  const folder = state.editingFolderId
    ? { ...state.folders.find(f => f.id === state.editingFolderId) }
    : { id: uid(), createdAt: now };

  folder.name = name;
  folder.nameLower = name.toLowerCase();
  folder.createdISO = createdISO;

  await dbPutFolder(folder);
  await refreshFromDB();

  els.folderModal.close();
  showToast(state.editingFolderId ? "Pasta atualizada." : "Pasta criada.");
  state.editingFolderId = null;
  render();
});

/* ---------------- Viewer ---------------- */

function fillMoveSelect(currentFolderId){
  els.viewerMove.innerHTML = "";
  const optRoot = document.createElement("option");
  optRoot.value = "";
  optRoot.textContent = "Raiz";
  els.viewerMove.appendChild(optRoot);

  const folders = [...state.folders].sort((a,b) => a.nameLower.localeCompare(b.nameLower));
  for (const f of folders){
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = f.name;
    els.viewerMove.appendChild(opt);
  }

  els.viewerMove.value = currentFolderId || "";
}

async function openViewer(mediaId){
  state.viewingMediaId = mediaId;
  const meta = state.media.find(m => m.id === mediaId);
  if (!meta) return;

  const folderName = meta.folderId
    ? (state.folders.find(f => f.id === meta.folderId)?.name || "Pasta")
    : "Raiz";

  els.viewerName.textContent = meta.name || "(sem nome)";
  els.viewerSub.textContent = `${meta.type === "video" ? "Vídeo" : "Imagem"} · ${folderName} · ${fmtBytes(meta.size || 0)}`;

  els.viewerRename.value = meta.name || "";
  fillMoveSelect(meta.folderId || "");

  els.viewerBody.innerHTML = "";
  const rec = await dbGetBlobs(mediaId);
  if (!rec?.blob){
    els.viewerBody.textContent = "Arquivo não encontrado.";
  } else {
    const url = URL.createObjectURL(rec.blob);

    if (meta.type === "video"){
      const v = document.createElement("video");
      v.controls = true;
      v.src = url;
      els.viewerBody.appendChild(v);
    } else {
      const img = document.createElement("img");
      img.src = url;
      img.alt = meta.name || "imagem";
      els.viewerBody.appendChild(img);
    }

    els.viewerModal.addEventListener("close", () => URL.revokeObjectURL(url), { once:true });
  }

  els.viewerModal.showModal();
}

els.viewerClose.addEventListener("click", () => els.viewerModal.close());

els.viewerDelete.addEventListener("click", async () => {
  const id = state.viewingMediaId;
  if (!id) return;
  const ok = confirm("Excluir este arquivo?");
  if (!ok) return;
  await dbDeleteMedia(id);
  await refreshFromDB();
  els.viewerModal.close();
  showToast("Arquivo excluído.");
  render();
});

els.viewerApply.addEventListener("click", async () => {
  const id = state.viewingMediaId;
  if (!id) return;

  const newName = els.viewerRename.value.trim() || "(sem nome)";
  const newFolder = els.viewerMove.value || null;

  await dbUpdateMediaMeta(id, { name: newName, folderId: newFolder });
  await refreshFromDB();

  showToast("Alterações aplicadas.");
  els.viewerModal.close();
  render();
});

/* ---------------- Search / keys ---------------- */

function setSearchOpen(open){
  state.searchOpen = open;
  els.searchInput.hidden = !open;
  els.searchHint.hidden = !open;

  if (open){
    els.searchInput.focus();
    els.searchInput.select();
  } else {
    els.searchInput.value = "";
    state.searchQuery = "";
  }
  render();
}

els.btnSearch.addEventListener("click", () => setSearchOpen(!state.searchOpen));

els.searchInput.addEventListener("input", () => {
  state.searchQuery = els.searchInput.value;
  render();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape"){
    hideHoverPreview();
    if (els.viewerModal.open) els.viewerModal.close();
    if (els.folderModal.open) els.folderModal.close();
    if (state.searchOpen) setSearchOpen(false);
    e.preventDefault();
  }

  if (e.key === "Enter" && state.searchOpen){
    const first = els.grid.querySelector(".cube");
    if (first){
      first.click();
      e.preventDefault();
    }
  }
});

/* ---------------- Add media / folder ---------------- */

els.btnAddMedia.addEventListener("click", () => {
  els.filePicker.value = "";
  els.filePicker.click();
});

els.filePicker.addEventListener("change", async () => {
  const files = [...(els.filePicker.files || [])];
  if (!files.length) return;

  showToast("Processando...");
  for (const f of files){
    const mime = f.type || "";
    const isImg = mime.startsWith("image/");
    const isVid = mime.startsWith("video/");
    if (!isImg && !isVid) continue;

    const id = uid();
    const type = isVid ? "video" : "image";
    const name = f.name || (type === "video" ? "video" : "imagem");
    const createdAt = Date.now();

    let thumb = null;
    if (type === "image") thumb = await imgToThumbBlob(f);
    else thumb = await videoToThumbBlob(f);

    const meta = {
      id,
      folderId: state.currentFolderId,
      name,
      nameLower: name.toLowerCase(),
      type,
      mime,
      size: f.size || 0,
      createdAt,
    };

    await dbPutMedia(meta, f, thumb);
  }

  await refreshFromDB();
  showToast("Adicionado.");
  render();
});

els.btnAddFolder.addEventListener("click", () => openFolderModal(null));

/* ---------------- Boot ---------------- */

async function refreshFromDB(){
  state.folders = await dbGetAllFolders();
  state.media = await dbGetAllMediaMeta();
}

(async function init(){
  await refreshFromDB();
  render();
})();
