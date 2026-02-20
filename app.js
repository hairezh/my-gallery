(() => {
  // ===== IndexedDB =====
  const DB_NAME = "galeriaDB";
  const DB_VERSION = 1;
  const STORE = "items";

  let db = null;

  const $ = (q) => document.querySelector(q);

  // UI
  const searchInput = $("#searchInput");
  const folderFilter = $("#folderFilter");
  const typeFilter = $("#typeFilter");
  const sortBy = $("#sortBy");

  const folderInput = $("#folderInput");
  const fileInput = $("#fileInput");
  const pickBtn = $("#pickBtn");
  const addBtn = $("#addBtn");
  const statusEl = $("#status");
  const dropzone = $("#dropzone");

  const exportBtn = $("#exportBtn");
  const importInput = $("#importInput");
  const clearBtn = $("#clearBtn");

  const grid = $("#grid");
  const tpl = $("#cardTpl");

  const countLabel = $("#countLabel");
  const quotaLabel = $("#quotaLabel");

  // Modal
  const modal = $("#modal");
  const modalBackdrop = $("#modalBackdrop");
  const viewerName = $("#viewerName");
  const viewerInfo = $("#viewerInfo");
  const viewerBody = $("#viewerBody");
  const renameBtn = $("#renameBtn");
  const moveBtn = $("#moveBtn");
  const downloadBtn = $("#downloadBtn");
  const deleteBtn = $("#deleteBtn");
  const closeBtn = $("#closeBtn");

  // State
  let itemsCache = [];
  let currentId = null;
  const urlCache = new Map(); // id -> objectURL

  // ===== Helpers =====
  function setStatus(msg) { statusEl.textContent = msg || ""; }

  function uid() { return `${Date.now()}_${Math.random().toString(16).slice(2)}`; }

  function guessType(mime) {
    if (!mime) return "other";
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    return "other";
  }

  function humanBytes(bytes) {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0, b = bytes || 0;
    while (b >= 1024 && i < units.length - 1) { b /= 1024; i++; }
    return `${b.toFixed(b >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function fmtDate(iso) {
    try { return new Date(iso).toLocaleString(); } catch { return iso || ""; }
  }

  function openModal() { modal.classList.remove("hidden"); }
  function closeModal() { modal.classList.add("hidden"); }

  function objectURLFor(item) {
    if (urlCache.has(item.id)) return urlCache.get(item.id);
    const blob = item.data instanceof Blob ? item.data : new Blob([item.data], { type: item.mime });
    const url = URL.createObjectURL(blob);
    urlCache.set(item.id, url);
    return url;
  }

  function revokeURL(id) {
    const u = urlCache.get(id);
    if (u) URL.revokeObjectURL(u);
    urlCache.delete(id);
  }

  // ===== DB =====
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) {
          const st = d.createObjectStore(STORE, { keyPath: "id" });
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

  function store(mode = "readonly") {
    return db.transaction(STORE, mode).objectStore(STORE);
  }

  function getAll() {
    return new Promise((resolve, reject) => {
      const req = store("readonly").getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  function put(item) {
    return new Promise((resolve, reject) => {
      const req = store("readwrite").put(item);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  function get(id) {
    return new Promise((resolve, reject) => {
      const req = store("readonly").get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  function del(id) {
    return new Promise((resolve, reject) => {
      const req = store("readwrite").delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  function clearDB() {
    return new Promise((resolve, reject) => {
      const req = store("readwrite").clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // ===== Rendering =====
  function refreshFolderOptions(items) {
    const counts = new Map();
    for (const it of items) {
      const f = it.folder || "Sem pasta";
      counts.set(f, (counts.get(f) || 0) + 1);
    }

    const current = folderFilter.value || "__ALL__";
    folderFilter.innerHTML = `<option value="__ALL__">Todas as pastas</option>`;

    [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([name, count]) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = `${name} (${count})`;
        folderFilter.appendChild(opt);
      });

    const exists = [...folderFilter.options].some(o => o.value === current);
    folderFilter.value = exists ? current : "__ALL__";
  }

  function filteredAndSorted(items) {
    const q = searchInput.value.trim().toLowerCase();
    const folder = folderFilter.value;
    const type = typeFilter.value;

    let list = items.filter(it => {
      if (folder !== "__ALL__" && (it.folder || "Sem pasta") !== folder) return false;
      if (type !== "all" && it.type !== type) return false;
      if (q && !(it.name || "").toLowerCase().includes(q)) return false;
      return true;
    });

    const mode = sortBy.value;
    const coll = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

    if (mode === "new") list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    if (mode === "name") list.sort((a, b) => coll.compare(a.name || "", b.name || ""));
    if (mode === "size") list.sort((a, b) => (b.size || 0) - (a.size || 0));

    return list;
  }

  function render() {
    const list = filteredAndSorted(itemsCache);
    countLabel.textContent = `${list.length} visível(is) • ${itemsCache.length} total`;

    grid.innerHTML = "";
    if (list.length === 0) {
      const div = document.createElement("div");
      div.className = "muted";
      div.textContent = "Nada encontrado. Tente outra busca ou adicione arquivos.";
      grid.appendChild(div);
      return;
    }

    for (const it of list) {
      const node = tpl.content.cloneNode(true);
      const card = node.querySelector(".card");
      const thumb = node.querySelector(".thumb");
      const name = node.querySelector(".name");
      const folder = node.querySelector(".folder");
      const size = node.querySelector(".size");

      name.textContent = it.name || "(sem nome)";
      folder.textContent = it.folder || "Sem pasta";
      size.textContent = humanBytes(it.size || 0);

      thumb.innerHTML = "";
      if (it.type === "image") {
        const img = document.createElement("img");
        img.loading = "lazy";
        img.alt = it.name || "";
        img.src = objectURLFor(it);
        thumb.appendChild(img);
      } else if (it.type === "video") {
        const b = document.createElement("div");
        b.className = "badge";
        b.textContent = "VÍDEO";
        thumb.appendChild(b);
      } else {
        const b = document.createElement("div");
        b.className = "badge";
        b.textContent = "ARQUIVO";
        thumb.appendChild(b);
      }

      card.addEventListener("click", () => openViewer(it.id));
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openViewer(it.id); }
      });

      grid.appendChild(node);
    }
  }

  async function reload() {
    // limpa URLs antigas pra não vazar memória
    for (const it of itemsCache) revokeURL(it.id);

    itemsCache = await getAll();
    refreshFolderOptions(itemsCache);
    render();
    updateQuota();
  }

  async function updateQuota() {
    if (!navigator.storage?.estimate) { quotaLabel.textContent = ""; return; }
    try {
      const est = await navigator.storage.estimate();
      quotaLabel.textContent = `Uso: ${humanBytes(est.usage || 0)} / ${humanBytes(est.quota || 0)}`;
    } catch {
      quotaLabel.textContent = "";
    }
  }

  // ===== Viewer =====
  async function openViewer(id) {
    const it = await get(id);
    if (!it) return;
    currentId = id;

    viewerName.textContent = it.name || "(sem nome)";
    viewerInfo.textContent = `${it.folder || "Sem pasta"} • ${humanBytes(it.size || 0)} • ${fmtDate(it.createdAt || "")}`;

    viewerBody.innerHTML = "";
    const url = objectURLFor(it);

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

    openModal();
  }

  closeBtn.addEventListener("click", closeModal);
  modalBackdrop.addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
  });

  renameBtn.addEventListener("click", async () => {
    if (!currentId) return;
    const it = await get(currentId);
    if (!it) return;

    const newName = prompt("Novo nome:", it.name || "");
    if (!newName) return;

    it.name = newName.trim();
    await put(it);
    await reload();
    await openViewer(it.id);
  });

  moveBtn.addEventListener("click", async () => {
    if (!currentId) return;
    const it = await get(currentId);
    if (!it) return;

    const newFolder = prompt("Mover para pasta:", it.folder || "Sem pasta");
    if (!newFolder) return;

    it.folder = newFolder.trim() || "Sem pasta";
    await put(it);
    await reload();
    await openViewer(it.id);
  });

  downloadBtn.addEventListener("click", async () => {
    if (!currentId) return;
    const it = await get(currentId);
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
    if (!currentId) return;
    const it = await get(currentId);
    if (!it) return;

    if (!confirm(`Excluir "${it.name}"?`)) return;

    await del(it.id);
    revokeURL(it.id);
    currentId = null;
    closeModal();
    await reload();
  });

  // ===== Upload =====
  pickBtn.addEventListener("click", () => fileInput.click());

  addBtn.addEventListener("click", async () => {
    await addFiles(fileInput.files);
    fileInput.value = "";
  });

  async function addFiles(fileList) {
    const files = [...(fileList || [])];
    if (files.length === 0) { setStatus("Escolha arquivos primeiro."); return; }

    const folder = (folderInput.value || "Sem pasta").trim() || "Sem pasta";

    addBtn.disabled = true;
    pickBtn.disabled = true;
    setStatus(`Salvando ${files.length} arquivo(s)…`);

    let ok = 0;
    for (const f of files) {
      try {
        const item = {
          id: uid(),
          name: f.name,
          folder,
          mime: f.type || "application/octet-stream",
          type: guessType(f.type),
          size: f.size,
          createdAt: new Date().toISOString(),
          data: f
        };
        await put(item);
        ok++;
      } catch (e) {
        console.error(e);
      }
    }

    addBtn.disabled = false;
    pickBtn.disabled = false;

    setStatus(ok ? `Adicionado: ${ok}` : "Nada foi adicionado.");
    setTimeout(() => setStatus(""), 1400);

    await reload();
  }

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.style.borderColor = "rgba(58,116,255,.55)";
  });
  dropzone.addEventListener("dragleave", () => {
    dropzone.style.borderColor = "rgba(233,238,245,.25)";
  });
  dropzone.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropzone.style.borderColor = "rgba(233,238,245,.25)";
    await addFiles(e.dataTransfer?.files);
  });

  // ===== Filters =====
  const rerender = () => {
    clearTimeout(window.__r);
    window.__r = setTimeout(render, 80);
  };
  searchInput.addEventListener("input", rerender);
  folderFilter.addEventListener("change", rerender);
  typeFilter.addEventListener("change", rerender);
  sortBy.addEventListener("change", rerender);

  // ===== Backup =====
  exportBtn.addEventListener("click", async () => {
    setStatus("Exportando…");
    const items = await getAll();

    const packed = [];
    for (const it of items) {
      const buf = await it.data.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      packed.push({ ...it, data: b64 });
    }

    const payload = { version: 1, exportedAt: new Date().toISOString(), items: packed };
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "galeria-backup.json";
    a.click();

    URL.revokeObjectURL(url);
    setStatus("");
  });

  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;

    setStatus("Importando…");
    try {
      const payload = JSON.parse(await file.text());
      if (!payload?.items) throw new Error("Formato inválido");

      let count = 0;
      for (const it of payload.items) {
        const bin = Uint8Array.from(atob(it.data), c => c.charCodeAt(0));
        const blob = new Blob([bin], { type: it.mime || "application/octet-stream" });

        await put({
          id: it.id || uid(),
          name: it.name || "arquivo",
          folder: it.folder || "Sem pasta",
          mime: it.mime || "application/octet-stream",
          type: it.type || guessType(it.mime),
          size: it.size || blob.size,
          createdAt: it.createdAt || new Date().toISOString(),
          data: blob
        });
        count++;
      }

      setStatus(`Importado: ${count}`);
      setTimeout(() => setStatus(""), 1400);
      await reload();
    } catch (e) {
      console.error(e);
      setStatus("Falha ao importar backup.");
    } finally {
      importInput.value = "";
    }
  });

  clearBtn.addEventListener("click", async () => {
    if (!confirm("Isso vai apagar tudo salvo neste navegador. Continuar?")) return;

    await clearDB();
    for (const it of itemsCache) revokeURL(it.id);
    itemsCache = [];
    currentId = null;
    closeModal();
    await reload();
  });

  // ===== Boot =====
  (async function boot() {
    db = await openDB();
    await reload();
  })();
})();
