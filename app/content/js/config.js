(function () {
    "use strict";

    const REQUIRED_LABELS = [
        "splashTitle", "enterButton", "homeTitle", "homeDescription",
        "chapterSectionTitle", "practiceSectionTitle", "chapterMode",
        "wrongBookTitle", "favoritesTitle"
    ];
    const COLOR_KEYS = ["primary", "secondary", "ink", "surface", "accent"];
    const FALLBACK_LABELS = {
        splashTitle: "📘 ClassGame",
        enterButton: "点击进入系统",
        homeTitle: "学习大厅",
        homeDescription: "选择章节开始挑战",
        chapterSectionTitle: "章节目录",
        practiceSectionTitle: "专项练习",
        chapterMode: "章节闯关",
        wrongBookTitle: "我的错题本",
        favoritesTitle: "我的收藏夹"
    };

    function assertRelativeAsset(value, field) {
        if (typeof value !== "string" || !value.trim() || value.startsWith("/")
            || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) || value.split("/").includes("..")) {
            throw new Error(`科目配置 ${field} 的资源路径不合法。`);
        }
        return value;
    }

    function validateConfig(config) {
        if (!config || typeof config !== "object") throw new Error("科目配置为空。 ");
        if (!/^[A-Za-z0-9_-]+$/.test(config.id || "")) throw new Error("科目配置 id 不合法。 ");
        if (!config.app || typeof config.app !== "object") throw new Error("科目配置缺少 app。 ");
        if (!config.labels || typeof config.labels !== "object") throw new Error("科目配置缺少 labels。 ");
        const missing = REQUIRED_LABELS.filter(key => typeof config.labels[key] !== "string" || !config.labels[key].trim());
        if (missing.length) throw new Error(`科目配置缺少标签：${missing.join(", ")}`);
        if (!config.theme || COLOR_KEYS.some(key => !/^#[0-9A-Fa-f]{6}$/.test(config.theme[key] || ""))) {
            throw new Error("科目配置 theme 必须包含五个六位颜色。 ");
        }
        if (!config.assets || typeof config.assets !== "object") throw new Error("科目配置缺少 assets。 ");
        assertRelativeAsset(config.assets.background, "assets.background");
        assertRelativeAsset(config.assets.icon, "assets.icon");
        Object.entries(config.assets.audio || {}).forEach(([key, value]) => assertRelativeAsset(value, `assets.audio.${key}`));
        if (!/^classgame:[A-Za-z0-9_-]+$/.test(config.storageKey || "")) throw new Error("科目配置 storageKey 不合法。 ");
        return config;
    }

    function deepFreeze(value) {
        Object.values(value || {}).forEach(child => {
            if (child && typeof child === "object" && !Object.isFrozen(child)) deepFreeze(child);
        });
        return Object.freeze(value);
    }

    function assetUrl(relativePath) {
        const value = assertRelativeAsset(relativePath, "asset");
        const withoutPrefix = value.replace(/^static\//, "");
        return `/static/${withoutPrefix.split("/").map(encodeURIComponent).join("/")}`;
    }

    function applyTheme(config) {
        const root = document.documentElement;
        root.style.setProperty("--subject-primary", config.theme.primary);
        root.style.setProperty("--subject-secondary", config.theme.secondary);
        root.style.setProperty("--subject-ink", config.theme.ink);
        root.style.setProperty("--subject-surface", config.theme.surface);
        root.style.setProperty("--subject-accent", config.theme.accent);
        root.style.setProperty("--subject-background-image", `url("${assetUrl(config.assets.background)}")`);
    }

    function applyLabels(config) {
        document.querySelectorAll("[data-config-key]").forEach(element => {
            const key = element.dataset.configKey;
            const value = config.labels[key] ?? config.app?.[key] ?? FALLBACK_LABELS[key] ?? "";
            if (value) {
                element.textContent = value;
                if (element.hasAttribute("title")) element.title = value;
            }
        });
        if (config.app?.gameTitle) document.title = config.app.gameTitle;
    }

    function applyAssets(config) {
        document.querySelectorAll("link[rel='icon']").forEach(link => { link.href = assetUrl(config.assets.icon); });
        const audioMap = config.assets.audio || {};
        [["bgm", audioMap.bgm], ["hover-sound", audioMap.hover], ["correct-sound", audioMap.correct], ["wrong-sound", audioMap.wrong]]
            .forEach(([id, value]) => {
                const element = document.getElementById(id);
                if (element && value) element.src = assetUrl(value);
            });
    }

    async function loadConfig() {
        const response = await fetch("/subject.json", { cache: "no-store" });
        if (!response.ok) throw new Error(`无法读取科目配置（HTTP ${response.status}）。`);
        const config = validateConfig(await response.json());
        const frozen = deepFreeze(JSON.parse(JSON.stringify(config)));
        window.ClassGameConfig = frozen;
        applyTheme(frozen);
        applyLabels(frozen);
        applyAssets(frozen);
        return frozen;
    }

    window.loadConfig = loadConfig;
    window.applyTheme = applyTheme;
    window.applyLabels = applyLabels;
    window.assetUrl = assetUrl;
    window.ClassGameConfigReady = loadConfig();
})();
