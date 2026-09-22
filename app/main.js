"use strict";

const { app, BrowserWindow, dialog, Menu, ipcMain } = require("electron");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const executableName = path.basename(process.execPath).toLowerCase();
const editorMode = executableName.includes("editor") || process.argv.includes("--editor");

let server = null;
let mainWindow = null;
let gamePreviewWindow = null;
let baseUrl = "";
let uiRoot = "";
let subjectRoot = "";
let subjectConfig = null;
let logFile = "";
let currentPort = 0;
let editorDirty = false;
let editorForceClose = false;
let editorSavePending = false;

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-features", "AutoplayIgnoreWebAudio");

function portableRoot() {
    return process.defaultApp ? __dirname : path.dirname(process.execPath);
}

function configurePortableStorageEarly() {
    const folder = editorMode ? "editor_userdata" : "userdata";
    const target = path.join(portableRoot(), folder);
    fs.mkdirSync(target, { recursive: true });
    app.setPath("userData", target);
    logFile = path.join(target, editorMode ? "editor.log" : "desktop.log");
}
configurePortableStorageEarly();

function findUiRoot() {
    const candidates = [path.join(portableRoot(), "content"), path.join(__dirname, "content")];
    return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0];
}

function findSubjectsRoot() {
    const candidates = [path.join(portableRoot(), "subjects"), path.join(__dirname, "subjects")];
    return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0];
}

function parseSubjectArg(argv = process.argv) {
    const args = Array.isArray(argv) ? argv : [];
    for (let index = 0; index < args.length; index += 1) {
        const value = String(args[index] || "");
        if (value.startsWith("--subject=")) return value.slice("--subject=".length);
        if (value === "--subject") return String(args[index + 1] || "");
    }
    return "";
}

function readDefaultSubject() {
    const filename = path.join(portableRoot(), "default-subject.json");
    if (!fs.existsSync(filename)) return "";
    const value = readJson(filename);
    return typeof value.subjectId === "string" ? value.subjectId : "";
}

function resolveSubjectId(argv = process.argv) {
    const explicit = parseSubjectArg(argv);
    if (explicit) return explicit;
    return readDefaultSubject() || "chemistry";
}

function loadSubjectConfig(subjectId) {
    if (!/^[A-Za-z0-9_-]+$/.test(subjectId || "")) throw new Error(`科目编号不合法：${subjectId}`);
    const root = findSubjectsRoot();
    const configPath = path.join(root, subjectId, "subject.json");
    if (!fs.existsSync(configPath)) throw new Error(`未找到科目配置：${subjectId}`);
    const config = readJson(configPath);
    if (config.id !== subjectId) throw new Error(`科目配置 id 与目录不一致：${subjectId}`);
    const requiredLabels = ["splashTitle", "enterButton", "homeTitle", "homeDescription", "chapterSectionTitle", "practiceSectionTitle", "chapterMode", "wrongBookTitle", "favoritesTitle"];
    const missing = requiredLabels.filter(key => !String(config.labels?.[key] || "").trim());
    if (missing.length) throw new Error(`科目配置缺少标签：${missing.join(", ")}`);
    const assetValues = [config.assets?.background, config.assets?.icon, ...Object.values(config.assets?.audio || {})];
    if (assetValues.some(value => typeof value !== "string" || !value || value.startsWith("/") || value.split("/").includes(".."))) {
        throw new Error(`科目配置包含非法资源路径：${subjectId}`);
    }
    return config;
}

function backupsRoot() {
    return path.join(portableRoot(), "backups");
}

function log(message) {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    try { fs.appendFileSync(logFile, line, "utf8"); } catch (_) {}
}

function readJson(filename) {
    return JSON.parse(fs.readFileSync(filename, "utf8"));
}

function writeJson(filename, value) {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function safeRootPath(rootPath, relative) {
    const root = path.resolve(rootPath);
    const target = path.resolve(root, String(relative || ""));
    if (target === root || target.startsWith(`${root}${path.sep}`)) return target;
    throw new Error(`非法文件路径：${relative}`);
}

function safeUiPath(relative) { return safeRootPath(uiRoot, relative); }
function safeSubjectPath(relative) { return safeRootPath(subjectRoot, relative); }

function manifestPath() {
    return path.join(subjectRoot, "data", "manifest.json");
}

function loadAllQuestionData() {
    const raw = readJson(manifestPath());
    const manifest = Array.isArray(raw) ? { version: 1, chapters: raw } : raw;
    if (!manifest || !Array.isArray(manifest.chapters)) throw new Error("manifest.json 格式不正确。");
    const chapters = {};
    for (const item of manifest.chapters) {
        const relative = item.file || `data/chapters/${item.id}/chapter.json`;
        const filename = safeSubjectPath(relative);
        if (!fs.existsSync(filename)) throw new Error(`章节文件不存在：${relative}`);
        chapters[item.id] = readJson(filename);
    }
    return { manifest, chapters };
}

function validateQuestionData(payload) {
    const errors = [];
    const warnings = [];
    const manifest = payload?.manifest;
    const chapters = payload?.chapters;
    if (!manifest || !Array.isArray(manifest.chapters)) return { errors: ["章节目录格式不正确。"], warnings };
    if (!chapters || typeof chapters !== "object") return { errors: ["章节题目数据不存在。"], warnings };

    const chapterIds = new Set();
    manifest.chapters.forEach((item, chapterIndex) => {
        const prefix = `第 ${chapterIndex + 1} 个章节`;
        if (!item.id || !/^[A-Za-z0-9_-]+$/.test(item.id)) errors.push(`${prefix} 的内部编号不合法。`);
        if (chapterIds.has(item.id)) errors.push(`${prefix} 的内部编号重复：${item.id}`);
        chapterIds.add(item.id);
        if (!String(item.title || "").trim()) errors.push(`${prefix} 缺少目录标题。`);
        const chapter = chapters[item.id];
        if (!chapter || !Array.isArray(chapter.questions)) {
            errors.push(`${prefix} 找不到题目数据。`);
            return;
        }
        if (chapter.id !== item.id) errors.push(`${prefix} 的章节编号与题库不一致。`);

        const questionIds = new Set();
        chapter.questions.forEach((question, questionIndex) => {
            const qp = `${item.title || item.id} 第 ${questionIndex + 1} 题`;
            if (!question.id || !/^[A-Za-z0-9_-]+$/.test(question.id)) errors.push(`${qp} 的题目编号不合法。`);
            if (questionIds.has(question.id)) errors.push(`${qp} 的题目编号重复：${question.id}`);
            questionIds.add(question.id);
            const type = ["single", "multiple", "fill"].includes(question.type) ? question.type : "single";
            if (!["single", "multiple", "fill"].includes(question.type)) errors.push(`${qp} 的题型不受支持。`);
            if (!String(question.text || "").trim()) errors.push(`${qp} 缺少题干。`);

            let choiceImages = [];
            if (type === "fill") {
                const answers = Array.isArray(question.answers) ? question.answers.map(value => String(value).trim()).filter(Boolean) : [];
                if (!answers.length) errors.push(`${qp} 没有填写正确答案。`);
            } else {
                if (!Array.isArray(question.options) || question.options.length < 2) {
                    errors.push(`${qp} 至少需要 2 个选项。`);
                    return;
                }
                const optionIds = new Set();
                question.options.forEach((option, optionIndex) => {
                    if (!option.id || optionIds.has(option.id)) errors.push(`${qp} 的选项编号缺失或重复。`);
                    optionIds.add(option.id);
                    if (!String(option.content || "").trim() && !option.image) errors.push(`${qp} 第 ${optionIndex + 1} 个选项为空。`);
                });
                if (type === "single") {
                    if (!optionIds.has(question.answerId)) errors.push(`${qp} 没有有效的正确答案。`);
                } else {
                    const answerIds = Array.isArray(question.answerIds) ? question.answerIds : [];
                    if (!answerIds.length || answerIds.some(id => !optionIds.has(id))) errors.push(`${qp} 没有设置有效的多选答案。`);
                }
                choiceImages = question.options.map(option => option.image);
            }
            if (!String(question.explanation || "").trim()) warnings.push(`${qp} 没有填写解析。`);

            const images = [question.image, ...choiceImages].filter(Boolean);
            images.forEach(image => {
                try {
                    const imageFile = safeSubjectPath(image);
                    if (!fs.existsSync(imageFile)) errors.push(`${qp} 图片不存在：${image}`);
                } catch (error) {
                    errors.push(`${qp} 图片路径非法：${image}`);
                }
            });
        });
    });
    return { errors, warnings };
}

function verifyContent() {
    const required = [
        "index.html", "game.html", "data/manifest.json", "js/data-loader.js",
        "js/app.js", "js/game.js", "js/storage.js", "js/audio.js", "js/effects.js", "js/validator.js",
        "js/config.js"
    ];
    if (editorMode) required.push("editor.html", "editor/editor.js", "editor/editor.css");
    const missing = required.filter(relative => !fs.existsSync(safeUiPath(relative)));
    const subjectRequired = ["subject.json", "data/manifest.json", subjectConfig.assets.background, subjectConfig.assets.icon,
        ...Object.values(subjectConfig.assets.audio || {})];
    const missingSubject = subjectRequired.filter(relative => !fs.existsSync(safeSubjectPath(relative)));
    if (missingSubject.length) throw new Error(`科目内容不完整，缺少：\n${missingSubject.join("\n")}`);
    if (missing.length) throw new Error(`程序内容不完整，缺少：\n${missing.join("\n")}`);

    const payload = loadAllQuestionData();
    const check = validateQuestionData(payload);
    if (check.errors.length) throw new Error(`题库自检失败：\n${check.errors.join("\n")}`);
    const questionCount = Object.values(payload.chapters).reduce((sum, chapter) => sum + (chapter.questions?.length || 0), 0);
    log(`内容自检通过。章节=${payload.manifest.chapters.length}; 题目=${questionCount}; 提醒=${check.warnings.length}`);
}

function backupCurrentData() {
    const sourceData = path.join(subjectRoot, "data");
    if (!fs.existsSync(sourceData)) return "";
    const root = backupsRoot();
    fs.mkdirSync(root, { recursive: true });
    const now = new Date();
    const stamp = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("")
        + "_" + [String(now.getHours()).padStart(2, "0"), String(now.getMinutes()).padStart(2, "0"), String(now.getSeconds()).padStart(2, "0")].join("");
    const target = path.join(root, stamp);
    fs.cpSync(sourceData, path.join(target, "data"), { recursive: true });

    const dirs = fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort().reverse();
    dirs.slice(20).forEach(name => fs.rmSync(path.join(root, name), { recursive: true, force: true }));
    return stamp;
}

function saveAllQuestionData(payload) {
    const check = validateQuestionData(payload);
    if (check.errors.length) throw new Error(`不能发布题库：\n${check.errors.slice(0, 12).join("\n")}`);

    const backup = backupCurrentData();
    const old = loadAllQuestionData();
    const newIds = new Set(payload.manifest.chapters.map(item => item.id));

    payload.manifest.version = 2;
    payload.manifest.chapters.forEach((item, index) => {
        item.order = index + 1;
        item.file = `data/chapters/${item.id}/chapter.json`;
        const chapter = payload.chapters[item.id];
        chapter.id = item.id;
        writeJson(path.join(subjectRoot, item.file), chapter);
    });
    writeJson(manifestPath(), payload.manifest);

    old.manifest.chapters.forEach(item => {
        if (newIds.has(item.id)) return;
        const folder = path.join(subjectRoot, "data", "chapters", item.id);
        if (fs.existsSync(folder)) fs.rmSync(folder, { recursive: true, force: true });
    });

    const questionCount = payload.manifest.chapters.reduce((sum, item) => sum + (payload.chapters[item.id]?.questions?.length || 0), 0);
    log(`编辑器发布题库。章节=${payload.manifest.chapters.length}; 题目=${questionCount}; backup=${backup}`);
    return { backup, chapterCount: payload.manifest.chapters.length, questionCount, warnings: check.warnings };
}

function mimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    return ({
        ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".png": "image/png",
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
        ".ico": "image/x-icon", ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg"
    })[ext] || "application/octet-stream";
}

function resolveRequestPath(requestPath) {
    let decoded;
    try { decoded = decodeURIComponent(requestPath); } catch (_) { return null; }
    const pathname = decoded === "/" ? "/index.html" : decoded;
    try {
        if (pathname === "/subject.json") return safeSubjectPath("subject.json");
        if (pathname.startsWith("/data/")) return safeSubjectPath(pathname.slice("/".length));
        if (pathname.startsWith("/static/")) return safeSubjectPath(pathname.slice("/".length));
        return safeUiPath(pathname.replace(/^\/+/, ""));
    } catch (_) { return null; }
}

function sendWholeFile(req, res, filePath, stat) {
    res.writeHead(200, {
        "Content-Type": mimeType(filePath), "Content-Length": stat.size, "Accept-Ranges": "bytes",
        "Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache", "X-Content-Type-Options": "nosniff"
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(filePath).pipe(res);
}

function sendRange(req, res, filePath, stat, rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader || "");
    if (!match) { res.writeHead(416, { "Content-Range": `bytes */${stat.size}` }); return res.end(); }
    let start = match[1] ? Number(match[1]) : 0;
    let end = match[2] ? Number(match[2]) : stat.size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= stat.size) {
        res.writeHead(416, { "Content-Range": `bytes */${stat.size}` }); return res.end();
    }
    end = Math.min(end, stat.size - 1);
    res.writeHead(206, {
        "Content-Type": mimeType(filePath), "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Accept-Ranges": "bytes",
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(filePath, { start, end }).pipe(res);
}

function startStaticServer() {
    return new Promise((resolve, reject) => {
        const instance = http.createServer((req, res) => {
            const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
            if (requestUrl.pathname === "/__health") {
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                res.end(JSON.stringify({ ok: true, mode: editorMode ? "editor" : "game" }));
                return;
            }
            const filePath = resolveRequestPath(requestUrl.pathname);
            if (!filePath) { res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" }); res.end("禁止访问"); return; }
            fs.stat(filePath, (error, stat) => {
                if (error || !stat.isFile()) {
                    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
                    res.end(`文件不存在：${requestUrl.pathname}`);
                    log(`404 ${requestUrl.pathname} -> ${filePath}`);
                    return;
                }
                if (req.headers.range) sendRange(req, res, filePath, stat, req.headers.range);
                else sendWholeFile(req, res, filePath, stat);
            });
        });
        instance.on("clientError", error => log(`HTTP客户端错误：${error.message}`));
        instance.on("error", reject);
        instance.listen(0, "127.0.0.1", () => resolve({ instance, port: instance.address().port }));
    });
}

function hardenWindow(win) {
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (event, targetUrl) => {
        if (!targetUrl.startsWith(`${baseUrl}/`)) { event.preventDefault(); log(`阻止外部跳转：${targetUrl}`); }
    });
    win.webContents.on("did-fail-load", (_event, code, description, url) => log(`页面加载失败 ${code} ${description}: ${url}`));
    win.webContents.on("render-process-gone", (_event, details) => log(`渲染进程退出：${JSON.stringify(details)}`));
    win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
        if (level >= 2) log(`页面控制台[${level}] ${message} (${sourceId}:${line})`);
    });
}

function createGameWindow(port, preview = false) {
    const iconPath = safeSubjectPath(subjectConfig.assets.icon);
    const options = {
        width: 1280, height: 820, minWidth: 960, minHeight: 620, show: false, autoHideMenuBar: true,
        backgroundColor: "#071a2d", title: preview ? `${subjectConfig.app.gameTitle} - 编辑器预览` : subjectConfig.app.gameTitle,
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, devTools: false, backgroundThrottling: false }
    };
    if (fs.existsSync(iconPath)) options.icon = iconPath;
    const win = new BrowserWindow(options);
    hardenWindow(win);
    win.once("ready-to-show", () => win.show());
    win.loadURL(`http://127.0.0.1:${port}/index.html?desktop=1`).catch(error => log(`游戏首页打开失败：${error.message}`));
    return win;
}

function createEditorWindow(port) {
    editorDirty = false;
    editorForceClose = false;
    editorSavePending = false;
    const win = new BrowserWindow({
        width: 1500, height: 900, minWidth: 1100, minHeight: 680, show: false, autoHideMenuBar: true,
        backgroundColor: "#f4f6f8", title: subjectConfig.app.editorTitle,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"), nodeIntegration: false, contextIsolation: true,
            sandbox: false, webSecurity: true, devTools: false, backgroundThrottling: false
        }
    });
    hardenWindow(win);
    win.once("ready-to-show", () => win.show());
    win.on("close", event => {
        if (editorForceClose || !editorDirty) return;
        event.preventDefault();
        const choice = dialog.showMessageBoxSync(win, {
            type: "question",
            buttons: ["保存", "不保存", "取消"],
            defaultId: 0,
            cancelId: 2,
            noLink: true,
            title: "未保存的修改",
            message: "当前有未保存的修改。",
            detail: "关闭编辑器前是否保存这些修改？"
        });
        if (choice === 0) {
            if (!editorSavePending) {
                editorSavePending = true;
                win.webContents.send("save-before-close");
            }
        } else if (choice === 1) {
            editorDirty = false;
            editorForceClose = true;
            setImmediate(() => win.close());
        }
    });
    win.loadURL(`http://127.0.0.1:${port}/editor.html`).catch(error => log(`编辑器打开失败：${error.message}`));
    return win;
}

function registerEditorIpc() {
    ipcMain.handle("load-data", () => loadAllQuestionData());
    ipcMain.handle("save-data", (_event, payload) => saveAllQuestionData(payload));
    ipcMain.handle("choose-image", async (_event, meta) => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: "选择题目图片", properties: ["openFile"],
            filters: [{ name: "图片文件", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }]
        });
        if (result.canceled || !result.filePaths[0]) return null;
        const source = result.filePaths[0];
        const ext = path.extname(source).toLowerCase() || ".png";
        const safe = value => String(value || "item").replace(/[^A-Za-z0-9_-]/g, "_");
        const chapterId = safe(meta?.chapterId);
        const questionId = safe(meta?.questionId);
        const suffix = meta?.kind === "option" ? `option_${safe(meta.optionId)}` : "question";
        const name = `${questionId}_${suffix}_${Date.now()}${ext}`;
        const relative = `data/chapters/${chapterId}/images/${name}`;
        const destination = safeSubjectPath(relative);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(source, destination);
        log(`复制题目图片：${source} -> ${relative}`);
        return { path: relative, filename: name };
    });
    ipcMain.handle("open-game", () => {
        if (gamePreviewWindow && !gamePreviewWindow.isDestroyed()) {
            gamePreviewWindow.show(); gamePreviewWindow.focus(); return true;
        }
        gamePreviewWindow = createGameWindow(currentPort, true);
        gamePreviewWindow.on("closed", () => { gamePreviewWindow = null; });
        return true;
    });
    ipcMain.on("editor-dirty", (_event, value) => {
        editorDirty = Boolean(value);
    });
    ipcMain.on("close-after-save", (_event, success) => {
        editorSavePending = false;
        if (success && mainWindow && !mainWindow.isDestroyed()) {
            editorDirty = false;
            editorForceClose = true;
            setImmediate(() => mainWindow.close());
        }
    });
}

const gotLock = app.requestSingleInstanceLock({ mode: editorMode ? "editor" : "game" });
if (!gotLock) {
    app.quit();
} else {
    app.on("second-instance", () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show(); mainWindow.focus();
        }
    });

    app.whenReady().then(async () => {
        try {
            Menu.setApplicationMenu(null);
            uiRoot = findUiRoot();
            const subjectId = resolveSubjectId(process.argv);
            subjectConfig = loadSubjectConfig(subjectId);
            subjectRoot = path.join(findSubjectsRoot(), subjectId);
            app.setAppUserModelId(subjectConfig.app.appUserModelId);
            log(`启动 ${editorMode ? "编辑器" : "游戏"}。exe=${process.execPath}; ui=${uiRoot}; subject=${subjectId}`);
            verifyContent();
            const result = await startStaticServer();
            server = result.instance;
            currentPort = result.port;
            baseUrl = `http://127.0.0.1:${currentPort}`;
            log(`本地内容服务启动：${baseUrl}`);
            if (editorMode) registerEditorIpc();
            mainWindow = editorMode ? createEditorWindow(currentPort) : createGameWindow(currentPort, false);
            mainWindow.on("closed", () => { mainWindow = null; });
        } catch (error) {
            log(`启动失败：${error.stack || error.message}`);
            dialog.showErrorBox(editorMode ? "ClassGame 编辑器启动失败" : "ClassGame 启动失败", `${error.message}\n\n日志文件：${logFile}`);
            app.quit();
        }
    });
}

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && server && currentPort) {
        mainWindow = editorMode ? createEditorWindow(currentPort) : createGameWindow(currentPort, false);
    }
});

app.on("window-all-closed", () => {
    if (server) { server.close(); server = null; }
    app.quit();
});
