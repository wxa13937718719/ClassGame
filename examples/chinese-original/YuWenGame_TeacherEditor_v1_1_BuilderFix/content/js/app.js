(function () {
    "use strict";

    const elements = {};

    function cacheElements() {
        elements.splash = document.getElementById("splash-screen");
        elements.menu = document.getElementById("main-menu");
        elements.enter = document.getElementById("enter-game-btn");
        elements.chapterList = document.getElementById("chapter-list");
        elements.utilityList = document.getElementById("utility-list");
        elements.importInput = document.getElementById("import-file");
        elements.message = document.getElementById("message-box");
        elements.gameShell = document.getElementById("game-shell");
        elements.gameFrame = document.getElementById("game-frame");
        elements.autoRemoveButton = document.getElementById("auto-remove-btn");
        elements.musicButton = document.getElementById("music-btn");
    }

    function showMessage(text, type = "info") {
        if (!elements.message) return;
        elements.message.textContent = text;
        elements.message.className = `message-box ${type}`;
        elements.message.hidden = false;
        clearTimeout(showMessage.timer);
        showMessage.timer = setTimeout(() => {
            elements.message.hidden = true;
        }, 3200);
    }

    function formatRecord(record, questionCount) {
        if (!record) return `共 ${questionCount} 题 · 尚未练习`;
        return `共 ${questionCount} 题 · 最高 ${record.bestScore || 0} 分 · 已练习 ${record.attempts || 0} 次`;
    }

    function createChapterCard(item) {
        const record = YuWenStorage.getChapterRecord(item.id);
        const chapter = window.YUWEN_CHAPTERS[item.id];
        const questionCount = chapter?.questions?.length || "待加载";

        if (!item.enabled) {
            const locked = document.createElement("div");
            locked.className = "level-card locked-card";
            locked.innerHTML = `
                <div class="level-icon">${item.icon || "🔒"}</div>
                <div class="level-info">
                    <h3>${item.title}</h3>
                    <p>${item.subtitle}（尚未配置题目）</p>
                </div>
            `;
            return locked;
        }

        const link = document.createElement("a");
        link.href = `game.html?chapter=${encodeURIComponent(item.id)}`;
        link.dataset.gameUrl = link.href;
        link.className = "level-card active-card hover-target game-launch";
        link.innerHTML = `
            <div class="level-icon">${item.icon || "📖"}</div>
            <div class="level-info">
                <h3>${item.title}</h3>
                <p>${item.subtitle}</p>
                <small>${formatRecord(record, questionCount)}</small>
            </div>
            <span class="go-arrow">➜</span>
        `;
        return link;
    }

    function createUtilityCard({ href, icon, title, description, count, className }) {
        const link = document.createElement("a");
        link.href = href;
        link.dataset.gameUrl = href;
        link.className = `level-card utility-card hover-target game-launch ${className || ""}`;
        link.innerHTML = `
            <div class="level-icon">${icon}</div>
            <div class="level-info">
                <h3>${title}</h3>
                <p>${description}</p>
            </div>
            <span class="count-badge">${count}</span>
        `;
        return link;
    }

    function updateAutoRemoveButton() {
        const enabled = YuWenStorage.isRemoveWrongOnCorrect();
        if (!elements.autoRemoveButton) return;
        elements.autoRemoveButton.classList.toggle("is-on", enabled);
        elements.autoRemoveButton.textContent = `错题答对自动移出：${enabled ? "开" : "关"}`;
        elements.autoRemoveButton.setAttribute("aria-pressed", String(enabled));
        elements.autoRemoveButton.title = enabled
            ? "当前开启：在错题笺答对后会移出该题"
            : "当前关闭：在错题笺答对后仍保留该题";
    }

    function bindGameLaunches() {
        document.querySelectorAll(".game-launch").forEach(link => {
            if (link.dataset.launchBound === "true") return;
            link.dataset.launchBound = "true";
            link.addEventListener("click", event => {
                event.preventDefault();
                openGame(link.dataset.gameUrl || link.getAttribute("href"));
            });
        });
    }

    function renderMenu() {
        elements.chapterList.innerHTML = "";
        elements.utilityList.innerHTML = "";

        const manifest = (window.YUWEN_CHAPTER_MANIFEST || []).slice().sort((a, b) => a.order - b.order);
        manifest.forEach(item => elements.chapterList.appendChild(createChapterCard(item)));

        const autoRemoveEnabled = YuWenStorage.isRemoveWrongOnCorrect();
        elements.utilityList.appendChild(createUtilityCard({
            href: "game.html?mode=wrong",
            icon: "📖",
            title: "错题笺",
            description: autoRemoveEnabled
                ? "答对后自动移出（可在上方关闭）"
                : "答对后继续保留（可在上方开启自动移除）",
            count: YuWenStorage.getWrongBook().length,
            className: "wrong-book-card"
        }));

        elements.utilityList.appendChild(createUtilityCard({
            href: "game.html?mode=favorite",
            icon: "⭐",
            title: "佳题收藏",
            description: "收藏佳题，随时温习",
            count: YuWenStorage.getFavorites().length,
            className: "favorite-card"
        }));

        updateAutoRemoveButton();
        bindGameLaunches();
        YuWenAudio.attachHover(".hover-target");
    }

    function showDirectory() {
        elements.splash.style.display = "none";
        elements.splash.style.opacity = "0";
        elements.menu.style.display = "flex";
        elements.musicButton.style.display = "flex";
    }

    function enterSystem() {
        // 这一次用户点击用于取得浏览器播放声音的许可。
        // 后续关卡放在同一页面的 iframe 中，因此 BGM 音频元素不会被销毁或重新开始。
        YuWenAudio.startBgm();
        elements.splash.style.opacity = "0";
        setTimeout(showDirectory, 450);
    }

    function buildEmbeddedUrl(rawUrl) {
        const url = new URL(rawUrl, window.location.href);
        url.searchParams.set("embedded", "1");
        return url.href;
    }

    function sendAudioStateToGame() {
        if (!elements.gameFrame?.contentWindow) return;
        elements.gameFrame.contentWindow.postMessage({
            type: "yuwengame:audio-state",
            enabled: YuWenAudio.isEnabled()
        }, "*");
    }

    function sendAutoRemoveStateToGame() {
        if (!elements.gameFrame?.contentWindow) return;
        elements.gameFrame.contentWindow.postMessage({
            type: "yuwengame:auto-remove-state",
            enabled: YuWenStorage.isRemoveWrongOnCorrect()
        }, "*");
    }

    function openGame(rawUrl) {
        if (!rawUrl) return;
        elements.gameShell.hidden = false;
        document.body.classList.add("game-open");
        elements.gameFrame.src = buildEmbeddedUrl(rawUrl);
        elements.gameFrame.focus();
    }

    function closeGame() {
        elements.gameShell.hidden = true;
        document.body.classList.remove("game-open");
        elements.gameFrame.src = "about:blank";
        showDirectory();
        renderMenu();
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function bindFrameBridge() {
        elements.gameFrame.addEventListener("load", () => {
            sendAudioStateToGame();
            sendAutoRemoveStateToGame();
        });

        window.addEventListener("message", event => {
            const data = event.data || {};

            if (data.type === "yuwengame:back-menu") {
                closeGame();
                return;
            }

            if (data.type === "yuwengame:request-audio-state") {
                sendAudioStateToGame();
                return;
            }

            if (data.type === "yuwengame:toggle-audio") {
                YuWenAudio.toggle();
                sendAudioStateToGame();
                return;
            }

            if (data.type === "yuwengame:set-audio") {
                YuWenAudio.setEnabled(data.enabled !== false);
                sendAudioStateToGame();
                return;
            }

            if (data.type === "yuwengame:request-auto-remove-state") {
                sendAutoRemoveStateToGame();
                return;
            }

            if (data.type === "yuwengame:set-auto-remove") {
                YuWenStorage.setRemoveWrongOnCorrect(data.enabled !== false);
                updateAutoRemoveButton();
                sendAutoRemoveStateToGame();
            }
        });
    }

    function bindToolbar() {
        document.getElementById("export-btn").addEventListener("click", () => {
            YuWenStorage.exportState();
            showMessage("学习记录已导出。", "success");
        });

        document.getElementById("import-btn").addEventListener("click", () => {
            elements.importInput.value = "";
            elements.importInput.click();
        });

        elements.importInput.addEventListener("change", async event => {
            try {
                await YuWenStorage.importState(event.target.files[0]);
                // 导入后同步本次运行中的声音开关状态。
                YuWenAudio.applyExternalState(YuWenStorage.isAudioEnabled());
                renderMenu();
                showMessage("学习记录导入成功。", "success");
            } catch (error) {
                showMessage(error.message, "error");
            }
        });

        elements.autoRemoveButton.addEventListener("click", () => {
            const enabled = YuWenStorage.toggleRemoveWrongOnCorrect();
            renderMenu();
            showMessage(
                enabled ? "已开启：错题本中答对后自动移出。" : "已关闭：错题笺中答对后继续保留。",
                "success"
            );
        });

        document.getElementById("reset-btn").addEventListener("click", () => {
            const confirmed = window.confirm("确定要清空练习记录、错题笺和收藏内容吗？此操作不能撤销。 ");
            if (!confirmed) return;
            YuWenStorage.reset();
            YuWenAudio.applyExternalState(true);
            renderMenu();
            showMessage("全部学习记录已清空。", "success");
        });
    }

    async function loadCatalog() {
        await YuWenData.loadEnabledChapters();
    }

    document.addEventListener("DOMContentLoaded", async () => {
        cacheElements();

        // 每次重新打开程序时，默认将声音设为开启
        YuWenStorage.setAudioEnabled(true);

        YuWenAudio.init({
            bgmId: "bgm",
            hoverId: "hover-sound",
            buttonId: "music-btn",

            // 首页音量设置
            bgmVolume: 0.6,
            hoverVolume: 0.4
        });

        // Electron 桌面窗口允许无手势自动播放；普通浏览器若拦截，点击封面后仍会重试。
        YuWenAudio.startBgm();

        elements.enter.addEventListener("click", enterSystem);
        bindToolbar();
        bindFrameBridge();

        try {
            await loadCatalog();
            renderMenu();
        } catch (error) {
            showMessage(error.message || String(error), "error");
            console.error(error);
        }

        // 仅供 game.html 被单独打开后的“返回目录”备用。
        const params = new URLSearchParams(window.location.search);
        if (params.get("view") === "menu") {
            showDirectory();
            YuWenAudio.startBgm();
        }
    });
})();
