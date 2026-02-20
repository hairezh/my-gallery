/* Galeria local (IndexedDB) — imagens e vídeos
   - Pastas (nome + data)
   - Upload (blobs) + thumbs
   - Busca por pastas + arquivos
   - Hover preview (centro + fundo escuro)
   - Fundo configurável: URL/arquivo + blur + claridade
*/

const $ = (sel) => document.querySelector(sel);

const els = {
  grid: $("#grid"),
  crumbs: $("#crumbs"),
  empty: $("#empty"),

  btnAddMedia: $("#btnAddMedia"),
  btnAddFolder: $("#btnAddFolder"),
  btnSearch: $("#btnSearch"),
  btnBg: $("#btnBg"),

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

  bgModal: $("#bgModal"),
  bgForm: $("#bgForm"),
  bgUrl: $("#bgUrl"),
  bgFile: $("#bgFile"),
  bgBlur: $("#bgBlur"),
  bgLight: $("#bgLight"),
  bgBlurVal: $("#bgBlurVal"),
  bgLightVal: $("#bgLightVal"),
  bgCancel: $("#bgCancel"),
  bgReset: $("#bgReset"),

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

  hover: { id: null, url: null, tIn: null, tOut: null },
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
const DB_VER = 2;

function idbOpen(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains("folders")){
        const folders = db.createObjectStore("folders", { keyPath: "id" });
        folders.createIndex("nameLower", "nameLower", { unique: false });
        folders.createIndex("createdISO", "createdISO", { unique: false });
      }

      if (!db.objectStoreNames.contains("media")){
        const media = db.createObjectStore("media", { keyPath: "id" });
        media.createIndex("folderId", "folderId", { unique: false });
        media.createIndex("nameLower", "nameLower", { unique: false });
        media.createIndex("createdAt", "createdAt", { unique: false });
      }

      if (!db.objectStoreNames.contains("blobs")){
        db.createObjectStore("blobs", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("settings")){
        db.createObjectStore("settings", { keyPath: "key" });
      }
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

/* folders */
async function dbGetAllFolders(){
  return tx(["folders"], "readonly", (folders) =>
    new Promise((res, rej) => {
      const req = folders.getAll();
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

/* media */
async function dbGetAllMediaMeta(){
  return tx(["media"], "readonly", (media) =>
    new Promise((res, rej) => {
      const req = media.getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    })
  );
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

/* settings */
async function dbGetSetting(key){
  return tx(["settings"], "readonly", (s) =>
    new Promise((res, rej) => {
      const req = s.get(key);
      req.onsuccess = () => res(req.result?.value ?? null);
      req.onerror = () => rej(req.error);
    })
  );
}

async function dbPutSetting(key, value){
  return tx(["settings"], "readwrite", (s) => s.put({ key, value }));
}

/* ---------------- Thumbs ---------------- */

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

/* ---------------- Hover preview ---------------- */

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
  clearTimeout(state.hover.tIn);
  clearTimeout(state.hover.tOut);
  state.hover.tOut = setTimeout(() => {
    state.hover.id = null;
    els.hoverCard.innerHTML = "";
    els.hoverPreview.classList.remove("show");
    clearHoverURL();
  }, 120);
}

async function showHoverPreview(mediaId){
  if (!canHover()) return;

  clearTimeout(state.hover.tOut);
  clearTimeout(state.hover.tIn);

  state.hover.tIn = setTimeout(async () => {
    state.hover.id = mediaId;

    const meta = state.media.find(m => m.id === mediaId);
    if (!meta) return;

    const rec = await dbGetBlobs(mediaId);
    if (!rec?.blob) return;

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
  }, 80);
}

/* ---------------- Fundo (URL/arquivo + blur + claridade) ---------------- */

const BG_DEFAULT = {
  mode: "url", // "url" | "blob"
  url: "https://i.pinimg.com/originals/f5/93/a4/f593a4f4932080fb7b43c6ae96d1a73d.gif",
  blob: null,  // Blob (se mode="blob")
  blur: 0.6,
  light: 50,   // 0..100
};

const bgState = {
  cfg: { ...BG_DEFAULT },
  objUrl: null,      // objectURL do blob ativo
  draftPrev: null,   // snapshot ao abrir modal
  chosenBlob: null,  // arquivo selecionado no input
};

function applyBgVars(cfg){
  const blur = Number(cfg.blur ?? 0);
  const light = Math.max(0, Math.min(100, Number(cfg.light ?? 50))) / 100;

  // claridade => dim (mais claro = menos overlay escuro)
  const dim = 1.25 - (0.80 * light); // 0%:1.25 (escuro) / 100%:0.45 (claro)

  document.documentElement.style.setProperty("--bg-blur", `${blur.toFixed(1)}px`);
  document.documentElement.style.setProperty("--bg-dim", String(dim));

  if (cfg.mode === "blob" && cfg.blob instanceof Blob){
    if (bgState.objUrl) URL.revokeObjectURL(bgState.objUrl);
    bgState.objUrl = URL.createObjectURL(cfg.blob);
    document.documentElement.style.setProperty("--bg-image", `url("${bgState.objUrl}")`);
    return;
  }

  // url mode
  if (bgState.objUrl){ URL.revokeObjectURL(bgState.objUrl); bgState.objUrl = null; }
  const url = (cfg.url || BG_DEFAULT.url).trim();
  document.documentElement.style.setProperty("--bg-image", `url("${url}")`);
}

async function loadBgSettings(){
  const saved = await dbGetSetting("ui.background");
  const cfg = saved ? { ...BG_DEFAULT, ...saved } : { ...BG_DEFAULT };

  // garante consistência: se blob não existir, cai pra url
  if (cfg.mode === "blob" && !(cfg.blob instanceof Blob)){
    cfg.mode = "url";
    cfg.blob = null;
  }

  bgState.cfg = cfg;
  applyBgVars(cfg);
}

async function saveBgSettings(cfg){
  // salva o blob se for modo blob; o IndexedDB aceita Blob por clone estruturado
  await dbPutSetting("ui.background", cfg);
}

function syncBgModalUIFromCfg(cfg){
  els.bgUrl.value = cfg.mode === "url" ? (cfg.url || "") : "";
  els.bgFile.value = "";
  els.bgBlur.value = String(cfg.blur ?? 0.6);
  els.bgLight.value = String(cfg.light ?? 50);
  els.bgBlurVal.textContent = `${Number(els.bgBlur.value).toFixed(1)}px`;
  els.bgLightVal.textContent = `${els.bgLight.value}%`;
}

function cfgFromBgControls(baseCfg, chosenBlob){
  const blur = Number(els.bgBlur.value);
  const light = Number(els.bgLight.value);

  if (chosenBlob instanceof Blob){
    return { ...baseCfg, mode: "blob", blob: chosenBlob, blur, light };
  }

  const url = (els.bgUrl.value || "").trim();
  if (url){
    return { ...baseCfg, mode: "url", url, blob: null, blur, light };
  }

  // sem url e sem blob novo: mantém o atual
  return { ...baseCfg, blur, light };
}

/* ---------------- Render ---------------- */

function setBadges(){
  const folder = state.currentFolderId
    ? state.folders.find(f => f.id === state.currentFolderId)
    : null;

  els.badgePath.textContent = folder ? `Pasta: ${folder.name}` : "Raiz";

  const q = state.searchQuery.trim();
  els.badgeMode.textContent = q ? "modo: busca" : "modo: normal";

  els.badgeCount.textContent = `${computeVisibleCount()} itens`;
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

/* ---------------- Cubes ---------------- */

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

  cube.ondblclick = () => openFolderModal(folder.id);

  cube.oncontextmenu = async (e) => {
    e.preventDefault();
    const choice = prompt("Pasta:\n1 = editar\n2 = excluir\n(Enter cancela)");
    if (choice === "1") openFolderModal(folder.id);
    if (choice === "2"){
      const ok = confirm("Excluir esta pasta e tudo dentro dela?");
      if (!ok) return;
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
  hideHoverPreview();
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

/* ---------------- Search ---------------- */

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
  const tag = (document.activeElement?.tagName || "").toLowerCase();
  const isTyping = tag === "input" || tag === "textarea" || document.activeElement?.isContentEditable;

  if (e.key === "Escape"){
    hideHoverPreview();
    if (els.viewerModal.open) els.viewerModal.close();
    if (els.folderModal.open) els.folderModal.close();
    if (els.bgModal.open) els.bgModal.close();
    if (state.searchOpen) setSearchOpen(false);
    e.preventDefault();
  }

  if (!isTyping && e.key === "Enter" && state.searchOpen){
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

/* ---------------- Fundo UI ---------------- */

els.btnBg.addEventListener("click", () => {
  bgState.draftPrev = { ...bgState.cfg }; // snapshot superficial (blob é referência ok)
  bgState.chosenBlob = null;
  syncBgModalUIFromCfg(bgState.cfg);
  els.bgModal.showModal();
});

els.bgFile.addEventListener("change", () => {
  const f = els.bgFile.files?.[0] || null;
  bgState.chosenBlob = f;

  const draft = cfgFromBgControls(bgState.cfg, bgState.chosenBlob);
  applyBgVars(draft);
});

els.bgUrl.addEventListener("input", () => {
  if (bgState.chosenBlob) return; // arquivo tem prioridade
  const draft = cfgFromBgControls(bgState.cfg, null);
  applyBgVars(draft);
});

els.bgBlur.addEventListener("input", () => {
  els.bgBlurVal.textContent = `${Number(els.bgBlur.value).toFixed(1)}px`;
  const draft = cfgFromBgControls(bgState.cfg, bgState.chosenBlob);
  applyBgVars(draft);
});

els.bgLight.addEventListener("input", () => {
  els.bgLightVal.textContent = `${els.bgLight.value}%`;
  const draft = cfgFromBgControls(bgState.cfg, bgState.chosenBlob);
  applyBgVars(draft);
});

els.bgCancel.addEventListener("click", () => {
  // reverte snapshot
  if (bgState.draftPrev){
    bgState.cfg = { ...bgState.draftPrev };
    applyBgVars(bgState.cfg);
  }
  bgState.chosenBlob = null;
  els.bgModal.close();
});

els.bgReset.addEventListener("click", async () => {
  bgState.cfg = { ...BG_DEFAULT };
  bgState.chosenBlob = null;
  syncBgModalUIFromCfg(bgState.cfg);
  applyBgVars(bgState.cfg);
  await saveBgSettings(bgState.cfg);
  showToast("Fundo padrão.");
});

els.bgForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  bgState.cfg = cfgFromBgControls(bgState.cfg, bgState.chosenBlob);
  applyBgVars(bgState.cfg);
  await saveBgSettings(bgState.cfg);
  bgState.chosenBlob = null;
  els.bgModal.close();
  showToast("Fundo salvo.");
});

/* ---------------- Boot ---------------- */

async function refreshFromDB(){
  state.folders = await dbGetAllFolders();
  state.media = await dbGetAllMediaMeta();
}

(async function init(){
  await refreshFromDB();
  await loadBgSettings();
  render();
})();
