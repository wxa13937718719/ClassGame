"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("chemEditor", {
    loadData: () => ipcRenderer.invoke("editor:load-data"),
    saveData: data => ipcRenderer.invoke("editor:save-data", data),
    chooseImage: meta => ipcRenderer.invoke("editor:choose-image", meta),
    openGame: () => ipcRenderer.invoke("editor:open-game"),
    setDirty: value => ipcRenderer.send("editor:set-dirty", Boolean(value)),
    onSaveBeforeClose: callback => {
        ipcRenderer.removeAllListeners("editor:save-before-close");
        ipcRenderer.on("editor:save-before-close", () => callback());
    },
    closeAfterSave: success => ipcRenderer.invoke("editor:close-after-save", Boolean(success))
});
