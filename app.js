/* Galeria local (IndexedDB) — imagens e vídeos
   - Pastas com nome e data editáveis
   - Upload local (blobs no IndexedDB)
   - Busca por pasta + arquivo (nome)
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

  searchbar: $("#searchbar"),
  searchInput: $("#searchInput"),

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

  toast: $("#toast"),
};

const state = {
  currentFolderId: null,     // null = raiz
  searchOpen: false,
  searchQuery: "",

  folders: [],
  media: [],                 // metadados
  openMenuEl: null,

  editingFolderId: null,
  viewingMediaId: null,
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
  // iso: YYYY-MM-DD
  if (!iso) return "—";
  const [y,m,dd] = iso.split("-").map(Number);
  const d = new Date(y, m-1, dd);
  return d.toLocaleDateString("pt-BR", { year:"numeric", month:"2-digit", day:"2-digit" });
}

function fmtBytes(n){
  if (n === 0) return "0 B";
  const k = 1024;
  const sizes = ["B","KB","MB","GB","TB"];
  const i = Math.floor(Math.log(n)/Math.log(k));
  return (n/Math.pow(k,i)).toFixed(i ? 1 : 0) + " " + sizes[i];
}

function toast(msg){
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (els.toast.hidden = true), 2200);
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

      // blobs: original + thumb
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
  // apaga pasta + move media pra raiz? aqui: apaga pasta e TAMBÉM apaga mídia dela (mais “limpo”).
  return tx(["folders","media","blobs"], "readwrite", async (folders, media, blobs) => {
    // buscar mídias da pasta
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

/* ---------------- Thumbs ---------------- */

async function imgToThumbBlob(fileBlob){
  // reduz para ~360px largura (qualidade ok) pra ficar leve
  const img = new Image();
  const url = URL.createObjectURL(fileBlob);
  try{
    await new Promise((res, rej) => {
      img.onload = () => res();
      img.onerror = rej;
      img.src = url;
    });

    const maxW = 420;
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

    // tenta ir um tiquinho pra frente pra evitar frame preto
    const t = Math.min(0.25, (video.duration || 1) / 4);
    await new Promise((res) => {
      const handler = () => {
        video.removeEventListener("seeked", handler);
        res();
      };
      video.addEventListener("seeked", handler);
      video.currentTime = t;
    });

    const w = 420;
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
    // fallback: thumb null
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ---------------- UI / Render ---------------- */

function closeMenu(){
  if (state.openMenuEl){
    state.openMenuEl.remove();
    state.openMenuEl = null;
    document.removeEventListener("click", closeMenu, true);
  }
}

function openMenuAt(x, y, items){
  closeMenu();
  const menu = document.createElement("div");
  menu.className = "menu";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  for (const it of items){
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = it.label;
    if (it.danger) b.classList.add("danger");
    b.addEventListener("click", () => { closeMenu(); it.onClick(); });
    menu.appendChild(b);
  }

  document.body.appendChild(menu);
  state.openMenuEl = menu;

  // evita sair da tela
  const r = menu.getBoundingClientRect();
  const pad = 8;
  let nx = x, ny = y;
  if (r.right > innerWidth - pad) nx = Math.max(pad, innerWidth - r.width - pad);
  if (r.bottom > innerHeight - pad) ny = Math.max(pad, innerHeight - r.height - pad);
  menu.style.left = `${nx}px`;
  menu.style.top = `${ny}px`;

  setTimeout(() => document.addEventListener("click", closeMenu, true), 0);
}

function setCrumbs(){
  const root = document.createElement("div");
  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.alignItems = "center";
  wrap.style.gap = "10px";

  const aRoot = document.createElement("a");
  aRoot.href = "#";
  aRoot.textContent = "Raiz";
  aRoot.onclick = (e) => {
    e.preventDefault();
    state.currentFolderId = null;
    state.searchQuery = "";
    render();
  };

  wrap.appendChild(aRoot);

  if (state.currentFolderId){
    const folder = state.folders.find(f => f.id === state.currentFolderId);
    const sep = document.createElement("span");
    sep.textContent = "›";
    const name = document.createElement("span");
    name.textContent = folder?.name || "Pasta";
    wrap.appendChild(sep);
    wrap.appendChild(name);
  }

  els.crumbs.innerHTML = "";
  els.crumbs.appendChild(wrap);
}

function isEmptyView(){
  const hasFolders = state.folders.length > 0;
  const hasMedia = state.media.length > 0;
  return !hasFolders && !hasMedia;
}

async function render(){
  setCrumbs();
  els.grid.innerHTML = "";
  els.empty.hidden = !isEmptyView();

  const q = state.searchQuery.trim().toLowerCase();

  // VIEW: busca
  if (q){
    const folderHits = state.folders.filter(f =>
      f.nameLower.includes(q) || (f.createdISO || "").includes(q)
    );

    const mediaHits = state.media.filter(m =>
      (m.nameLower || "").includes(q) ||
      (m.type || "").includes(q) ||
      (m.mime || "").includes(q)
    );

    // pastas primeiro
    for (const f of folderHits){
      els.grid.appendChild(folderCard(f, { highlight: q }));
    }
    for (const m of mediaHits){
      els.grid.appendChild(await mediaCard(m, { highlight: q }));
    }

    if (!folderHits.length && !mediaHits.length){
      const ghost = document.createElement("div");
      ghost.className = "emptyCard";
      ghost.innerHTML = `<div class="emptyTitle">Sem resultados</div>
        <div class="emptyText">Tente outra palavra (pasta, nome de arquivo, “video”, “image”, etc.).</div>`;
      els.grid.appendChild(ghost);
    }
    return;
  }

  // VIEW: raiz
  if (!state.currentFolderId){
    // pastas
    const folders = [...state.folders].sort((a,b) => (b.createdISO||"").localeCompare(a.createdISO||""));
    for (const f of folders){
      els.grid.appendChild(folderCard(f));
    }

    // mídia solta (folderId null)
    const loose = state.media.filter(m => !m.folderId)
      .sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
    for (const m of loose){
      els.grid.appendChild(await mediaCard(m));
    }
    return;
  }

  // VIEW: dentro da pasta
  const inside = state.media
    .filter(m => m.folderId === state.currentFolderId)
    .sort((a,b) => (b.createdAt||0) - (a.createdAt||0));

  for (const m of inside){
    els.grid.appendChild(await mediaCard(m));
  }
}

function folderCard(folder, opts = {}){
  const card = document.createElement("article");
  card.className = "card";
  card.tabIndex = 0;

  const head = document.createElement("div");
  head.className = "cardHead";

  const title = document.createElement("div");
  title.className = "cardTitle";
  title.textContent = folder.name;

  const kebab = document.createElement("button");
  kebab.className = "kebab";
  kebab.type = "button";
  kebab.textContent = "⋯";
  kebab.title = "Opções";

  kebab.onclick = (e) => {
    e.stopPropagation();
    const r = kebab.getBoundingClientRect();
    openMenuAt(r.left, r.bottom + 6, [
      { label: "Editar pasta", onClick: () => openFolderModal(folder.id) },
      { label: "Excluir pasta", danger: true, onClick: async () => {
          const ok = confirm("Excluir esta pasta e todos os arquivos dentro dela?");
          if (!ok) return;
          await dbDeleteFolder(folder.id);
          await refreshFromDB();
          if (state.currentFolderId === folder.id) state.currentFolderId = null;
          toast("Pasta excluída.");
          render();
        }
      },
    ]);
  };

  head.appendChild(title);
  head.appendChild(kebab);

  const sub = document.createElement("div");
  sub.className = "cardSub";
  sub.textContent = `Criada em ${fmtDate(folder.createdISO)}`;

  const thumb = document.createElement("div");
  thumb.className = "thumb";
  const badge = document.createElement("div");
  badge.className = "badge";
  badge.textContent = "Pasta";
  thumb.appendChild(badge);

  card.appendChild(head);
  card.appendChild(sub);
  card.appendChild(thumb);

  card.onclick = () => {
    state.currentFolderId = folder.id;
    render();
  };

  // duplo clique = editar (sem botão extra)
  card.ondblclick = (e) => {
    e.preventDefault();
    openFolderModal(folder.id);
  };

  // highlight simples (busca)
  if (opts.highlight){
    const q = opts.highlight;
    if (folder.nameLower.includes(q)){
      card.style.outline = "2px solid rgba(165,180,252,.55)";
      card.style.outlineOffset = "2px";
    }
  }

  return card;
}

async function mediaCard(meta, opts = {}){
  const card = document.createElement("article");
  card.className = "card";
  card.tabIndex = 0;

  const head = document.createElement("div");
  head.className = "cardHead";

  const title = document.createElement("div");
  title.className = "cardTitle";
  title.textContent = meta.name || "(sem nome)";

  const kebab = document.createElement("button");
  kebab.className = "kebab";
  kebab.type = "button";
  kebab.textContent = "⋯";
  kebab.title = "Opções";

  kebab.onclick = (e) => {
    e.stopPropagation();
    const r = kebab.getBoundingClientRect();
    openMenuAt(r.left, r.bottom + 6, [
      { label: "Abrir", onClick: () => openViewer(meta.id) },
      { label: "Excluir", danger: true, onClick: async () => {
          const ok = confirm("Excluir este arquivo?");
          if (!ok) return;
          await dbDeleteMedia(meta.id);
          await refreshFromDB();
          toast("Arquivo excluído.");
          render();
        }
      },
    ]);
  };

  head.appendChild(title);
  head.appendChild(kebab);

  const folderName = meta.folderId
    ? (state.folders.find(f => f.id === meta.folderId)?.name || "Pasta")
    : "Raiz";

  const sub = document.createElement("div");
  sub.className = "cardSub";
  sub.textContent = `${meta.type === "video" ? "Vídeo" : "Imagem"} · ${folderName}`;

  const thumb = document.createElement("div");
  thumb.className = "thumb";
  const badge = document.createElement("div");
  badge.className = "badge";
  badge.textContent = meta.type === "video" ? "Vídeo" : "Imagem";
  thumb.appendChild(badge);

  // thumb real
  const rec = await dbGetBlobs(meta.id);
  if (rec?.thumb){
    const url = URL.createObjectURL(rec.thumb);
    const img = document.createElement("img");
    img.src = url;
    img.alt = meta.name || "thumb";
    img.onload = () => URL.revokeObjectURL(url);
    thumb.appendChild(img);
  } else {
    // fallback visual
    const ph = document.createElement("div");
    ph.style.color = "rgba(17,24,39,.45)";
    ph.style.fontSize = "13px";
    ph.textContent = meta.type === "video" ? "Sem miniatura" : "—";
    thumb.appendChild(ph);
  }

  card.appendChild(head);
  card.appendChild(sub);
  card.appendChild(thumb);

  card.onclick = () => openViewer(meta.id);

  if (opts.highlight){
    const q = opts.highlight;
    if ((meta.nameLower || "").includes(q)){
      card.style.outline = "2px solid rgba(165,180,252,.55)";
      card.style.outlineOffset = "2px";
    }
  }

  return card;
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
  toast(state.editingFolderId ? "Pasta atualizada." : "Pasta criada.");
  state.editingFolderId = null;
  render();
});

/* ---------------- Viewer ---------------- */

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
      v.onloadeddata = () => {};
      v.onended = () => {};
      v.onpause = () => {};
      v.onplay = () => {};
      v.onloadedmetadata = () => {};
      v.onemptied = () => {};
      v.onstalled = () => {};
      v.onwaiting = () => {};
      v.oncanplay = () => {};
      v.oncanplaythrough = () => {};
      v.onabort = () => {};
      v.onerror = () => {};
      v.onclose = () => {};
      v.onloadeddata = () => {};
      els.viewerBody.appendChild(v);
    } else {
      const img = document.createElement("img");
      img.src = url;
      img.alt = meta.name || "imagem";
      els.viewerBody.appendChild(img);
    }

    // limpa url ao fechar
    els.viewerModal.addEventListener("close", () => URL.revokeObjectURL(url), { once:true });
  }

  els.viewerModal.showModal();
}

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

els.viewerClose.addEventListener("click", () => els.viewerModal.close());

els.viewerDelete.addEventListener("click", async () => {
  const id = state.viewingMediaId;
  if (!id) return;
  const ok = confirm("Excluir este arquivo?");
  if (!ok) return;
  await dbDeleteMedia(id);
  await refreshFromDB();
  els.viewerModal.close();
  toast("Arquivo excluído.");
  render();
});

els.viewerApply.addEventListener("click", async () => {
  const id = state.viewingMediaId;
  if (!id) return;

  const newName = els.viewerRename.value.trim() || "(sem nome)";
  const newFolder = els.viewerMove.value || null;

  const updated = await dbUpdateMediaMeta(id, {
    name: newName,
    folderId: newFolder,
  });

  await refreshFromDB();
  if (updated){
    toast("Alterações aplicadas.");
    els.viewerModal.close();
    // se moveu pra outra pasta e você estava dentro, atualiza a navegação “silenciosamente”
    render();
  }
});

/* ---------------- Search ---------------- */

function setSearchOpen(open){
  state.searchOpen = open;
  els.searchbar.hidden = !open;
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
    if (state.searchOpen){
      setSearchOpen(false);
      e.preventDefault();
    }
    closeMenu();
    if (els.viewerModal.open) els.viewerModal.close();
    if (els.folderModal.open) els.folderModal.close();
  }

  if (e.key === "Enter" && state.searchOpen){
    const first = els.grid.querySelector(".card");
    if (first){
      first.click();
      e.preventDefault();
    }
  }
});

/* ---------------- Add media ---------------- */

els.btnAddMedia.addEventListener("click", () => {
  els.filePicker.value = "";
  els.filePicker.click();
});

els.filePicker.addEventListener("change", async () => {
  const files = [...(els.filePicker.files || [])];
  if (!files.length) return;

  toast("Processando arquivos...");
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
    if (type === "image"){
      thumb = await imgToThumbBlob(f);
    } else {
      thumb = await videoToThumbBlob(f);
    }

    const meta = {
      id,
      folderId: state.currentFolderId,   // adiciona na pasta atual; se estiver na raiz, fica solto
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
  toast("Adicionado.");
  render();
});

/* ---------------- Add folder ---------------- */

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
