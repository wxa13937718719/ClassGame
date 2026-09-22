(function () {
    "use strict";

    let manifestCache = null;
    const chapterCache = new Map();

    async function fetchJson(url) {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`无法读取题库文件：${url}（HTTP ${response.status}）`);
        }
        return response.json();
    }

    async function loadManifest(force = false) {
        if (!force && manifestCache) return manifestCache;
        const raw = await fetchJson("data/manifest.json");
        const chapters = Array.isArray(raw) ? raw : raw.chapters;
        if (!Array.isArray(chapters)) throw new Error("data/manifest.json 格式不正确。");
        manifestCache = chapters.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
        window.CHEM_CHAPTER_MANIFEST = manifestCache;
        window.CHEM_CHAPTERS = window.CHEM_CHAPTERS || {};
        return manifestCache;
    }

    async function loadChapter(chapterId, force = false) {
        if (!force && chapterCache.has(chapterId)) return chapterCache.get(chapterId);
        const manifest = await loadManifest(force);
        const item = manifest.find(entry => entry.id === chapterId);
        if (!item) throw new Error(`章节不存在：${chapterId}`);
        const chapter = await fetchJson(item.file || `data/chapters/${chapterId}/chapter.json`);
        chapterCache.set(chapterId, chapter);
        window.CHEM_CHAPTERS = window.CHEM_CHAPTERS || {};
        window.CHEM_CHAPTERS[chapterId] = chapter;
        return chapter;
    }

    async function loadEnabledChapters(force = false) {
        const manifest = await loadManifest(force);
        const enabled = manifest.filter(item => item.enabled);
        await Promise.all(enabled.map(item => loadChapter(item.id, force)));
        return enabled;
    }

    function clearCache() {
        manifestCache = null;
        chapterCache.clear();
        window.CHEM_CHAPTER_MANIFEST = [];
        window.CHEM_CHAPTERS = {};
    }

    window.ChemData = {
        loadManifest,
        loadChapter,
        loadEnabledChapters,
        clearCache
    };
})();
