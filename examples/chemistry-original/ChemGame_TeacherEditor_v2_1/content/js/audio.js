(function () {
    "use strict";

    let config = {};
    let enabled = true;
    let bgmStarted = false;
    let embeddedMode = false;

    function getElement(id) {
        return id ? document.getElementById(id) : null;
    }

    function getBgm() {
        return getElement(config.bgmId);
    }

    // 设置某个音频的音量，范围为 0～1
    function setVolume(id, volume) {
        const audio = getElement(id);
        if (!audio) return;

        const number = Number(volume);

        // 防止填写小于0或大于1的数值
        audio.volume = Math.max(0, Math.min(1, number));
    }

    // 根据初始化参数设置所有音频的音量
    function applyVolumes() {
        setVolume(config.bgmId, config.bgmVolume ?? 0.6);
        setVolume(config.correctId, config.correctVolume ?? 1);
        setVolume(config.wrongId, config.wrongVolume ?? 1);
        setVolume(config.hoverId, config.hoverVolume ?? 0.4);
    }

    function isEmbeddedGame() {
        return embeddedMode && window.parent && window.parent !== window;
    }

    function updateButton() {
        const button = getElement(config.buttonId);
        if (!button) return;
        const bgm = getBgm();
        const isPlaying = isEmbeddedGame()
            ? enabled
            : Boolean(bgm && !bgm.paused && enabled);

        button.classList.toggle("muted", !enabled);
        button.classList.toggle("spinning", isPlaying);
        button.setAttribute("aria-label", enabled ? "关闭音乐和音效" : "开启音乐和音效");
        button.title = enabled ? "点击关闭音乐和音效" : "点击开启音乐和音效";
    }

    function safePlay(element, restart) {
        if (!enabled || !element) return Promise.resolve(false);
        if (restart) element.currentTime = 0;
        const result = element.play();
        if (result && typeof result.then === "function") {
            return result.then(() => true).catch(() => false);
        }
        return Promise.resolve(true);
    }

    function startBgm() {
        if (isEmbeddedGame()) {
            bgmStarted = enabled;
            updateButton();
            return Promise.resolve(enabled);
        }

        const bgm = getBgm();
        if (!enabled || !bgm) {
            updateButton();
            return Promise.resolve(false);
        }
        return safePlay(bgm, false).then(success => {
            bgmStarted = success;
            updateButton();
            return success;
        });
    }

    function stopBgm() {
        if (!isEmbeddedGame()) {
            const bgm = getBgm();
            if (bgm) bgm.pause();
        }
        bgmStarted = false;
        updateButton();
    }

    function applyEnabled(value, persist = true) {
        enabled = Boolean(value);
        if (persist && window.ChemStorage) {
            ChemStorage.setAudioEnabled(enabled);
        }

        if (enabled) {
            startBgm();
        } else {
            stopBgm();
        }
        updateButton();
        document.dispatchEvent(new CustomEvent("chem-audio-change", { detail: { enabled } }));
    }

    function setEnabled(value) {
        if (isEmbeddedGame()) {
            window.parent.postMessage({ type: "chemgame:set-audio", enabled: Boolean(value) }, "*");
            return;
        }
        applyEnabled(value, true);
    }

    function toggle() {
        if (isEmbeddedGame()) {
            window.parent.postMessage({ type: "chemgame:toggle-audio" }, "*");
            return;
        }
        setEnabled(!enabled);
    }

    function playEffect(id, restart = true) {
        return safePlay(getElement(id), restart);
    }

    function attachHover(selector) {
        document.querySelectorAll(selector).forEach(element => {
            if (element.dataset.audioBound === "true") return;
            element.dataset.audioBound = "true";
            element.addEventListener("mouseenter", () => {
                playEffect(config.hoverId, true);
            });
        });
    }

    function armResumeOnGesture() {
        if (isEmbeddedGame()) return;
        const resume = () => {
            if (enabled && !bgmStarted) startBgm();
            document.removeEventListener("pointerdown", resume);
            document.removeEventListener("keydown", resume);
        };
        document.addEventListener("pointerdown", resume);
        document.addEventListener("keydown", resume);
    }

    function bindParentAudioBridge() {
        if (!isEmbeddedGame()) return;

        window.addEventListener("message", event => {
            const data = event.data || {};
            if (data.type !== "chemgame:audio-state") return;
            enabled = data.enabled !== false;
            bgmStarted = enabled;
            updateButton();
        });

        window.parent.postMessage({ type: "chemgame:request-audio-state" }, "*");
    }

    function init(options) {
        config = options || {};

        // 设置背景音乐和各种音效的音量
        applyVolumes();

        embeddedMode = new URLSearchParams(window.location.search).get("embedded") === "1";
        enabled = window.ChemStorage ? ChemStorage.isAudioEnabled() : true;

        const button = getElement(config.buttonId);
        if (button) button.addEventListener("click", toggle);

        bindParentAudioBridge();
        updateButton();
        armResumeOnGesture();
    }

    window.ChemAudio = {
        init,
        startBgm,
        stopBgm,
        toggle,
        setEnabled,
        applyExternalState(value) {
            applyEnabled(value, false);
        },
        attachHover,
        playCorrect() {
            return playEffect(config.correctId, true);
        },
        playWrong() {
            return playEffect(config.wrongId, true);
        },
        playHover() {
            return playEffect(config.hoverId, true);
        },
        isEnabled() {
            return enabled;
        },
        isEmbedded() {
            return isEmbeddedGame();
        }
    };
})();
