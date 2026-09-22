"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("classGameEditor", {
    loadData: () => ipcRenderer.invoke("load-data"),
    saveData: data => ipcRenderer.invoke("save-data", data),
    chooseImage: meta => ipcRenderer.invoke("choose-image", meta),
    openGame: () => ipcRenderer.invoke("open-game"),
    setDirty: value => ipcRenderer.send("editor-dirty", Boolean(value)),
    onSaveBeforeClose: callback => {
        ipcRenderer.removeAllListeners("save-before-close");
        ipcRenderer.on("save-before-close", () => callback());
    },
    closeAfterSave: success => ipcRenderer.send("close-after-save", Boolean(success))
});
