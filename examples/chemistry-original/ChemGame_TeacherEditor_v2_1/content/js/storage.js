(function () {
    "use strict";

    const STORAGE_KEY = "chem_game_state_v3";
    const OLD_STORAGE_KEYS = ["chem_game_state_v2"];
    const VERSION = 3;
    let memoryState = null;

    function createDefaultState() {
        return {
            version: VERSION,
            settings: {
                audioEnabled: true,
                removeWrongOnCorrect: true
            },
            wrongBook: [],
            favorites: [],
            chapters: {}
        };
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function normalizeState(raw) {
        const base = createDefaultState();
        if (!raw || typeof raw !== "object") return base;

        base.settings.audioEnabled = raw.settings?.audioEnabled !== false;
        base.settings.removeWrongOnCorrect = raw.settings?.removeWrongOnCorrect !== false;
        base.wrongBook = Array.isArray(raw.wrongBook) ? raw.wrongBook : [];
        base.favorites = Array.isArray(raw.favorites) ? raw.favorites : [];
        base.chapters = raw.chapters && typeof raw.chapters === "object" ? raw.chapters : {};
        return base;
    }

    function readRawState() {
        const current = localStorage.getItem(STORAGE_KEY);
        if (current) return JSON.parse(current);

        for (const oldKey of OLD_STORAGE_KEYS) {
            const oldText = localStorage.getItem(oldKey);
            if (oldText) return JSON.parse(oldText);
        }
        return null;
    }

    function readState() {
        try {
            const raw = readRawState();
            if (raw) {
                memoryState = normalizeState(raw);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryState));
                return clone(memoryState);
            }

            // 兼容最早版本的音乐设置。
            const oldMusic = localStorage.getItem("chem_music_playing");
            const firstState = createDefaultState();
            if (oldMusic === "false") firstState.settings.audioEnabled = false;
            writeState(firstState);
            return clone(firstState);
        } catch (error) {
            console.warn("读取本地存档失败，临时改用内存存档。", error);
            memoryState = memoryState || createDefaultState();
            return clone(memoryState);
        }
    }

    function writeState(state) {
        const safeState = normalizeState(state);
        memoryState = safeState;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(safeState));
        } catch (error) {
            console.warn("写入本地存档失败，本次运行仍可继续。", error);
        }
        return clone(safeState);
    }

    function makeRef(chapterId, questionId) {
        return { chapterId, questionId };
    }

    function hasRef(list, chapterId, questionId) {
        return list.some(item => item.chapterId === chapterId && item.questionId === questionId);
    }

    function addRef(listName, chapterId, questionId) {
        const state = readState();
        if (!hasRef(state[listName], chapterId, questionId)) {
            state[listName].push(makeRef(chapterId, questionId));
            writeState(state);
        }
    }

    function removeRef(listName, chapterId, questionId) {
        const state = readState();
        state[listName] = state[listName].filter(
            item => !(item.chapterId === chapterId && item.questionId === questionId)
        );
        writeState(state);
    }

    function setAudioEnabled(enabled) {
        const state = readState();
        state.settings.audioEnabled = Boolean(enabled);
        writeState(state);
    }

    function setRemoveWrongOnCorrect(enabled) {
        const state = readState();
        state.settings.removeWrongOnCorrect = Boolean(enabled);
        writeState(state);
    }

    function saveChapterResult(chapterId, result) {
        const state = readState();
        const previous = state.chapters[chapterId] || {
            attempts: 0,
            bestScore: 0,
            completed: false
        };

        state.chapters[chapterId] = {
            attempts: previous.attempts + 1,
            bestScore: Math.max(previous.bestScore || 0, result.score || 0),
            lastScore: result.score || 0,
            correctCount: result.correctCount || 0,
            total: result.total || 0,
            completed: true,
            lastPlayedAt: new Date().toISOString()
        };
        writeState(state);
    }

    function exportState() {
        const state = readState();
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const stamp = new Date().toISOString().slice(0, 10);
        link.href = url;
        link.download = `ChemGame学习记录_${stamp}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function importState(file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject(new Error("没有选择存档文件。"));
                return;
            }

            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const parsed = JSON.parse(reader.result);
                    writeState(parsed);
                    resolve(readState());
                } catch (error) {
                    reject(new Error("存档文件格式不正确。"));
                }
            };
            reader.onerror = () => reject(new Error("读取存档文件失败。"));
            reader.readAsText(file, "utf-8");
        });
    }

    window.ChemStorage = {
        getState: readState,
        reset() {
            return writeState(createDefaultState());
        },
        isAudioEnabled() {
            return readState().settings.audioEnabled;
        },
        setAudioEnabled,
        isRemoveWrongOnCorrect() {
            return readState().settings.removeWrongOnCorrect;
        },
        setRemoveWrongOnCorrect,
        toggleRemoveWrongOnCorrect() {
            const next = !readState().settings.removeWrongOnCorrect;
            setRemoveWrongOnCorrect(next);
            return next;
        },
        getWrongBook() {
            return readState().wrongBook;
        },
        addWrong(chapterId, questionId) {
            addRef("wrongBook", chapterId, questionId);
        },
        removeWrong(chapterId, questionId) {
            removeRef("wrongBook", chapterId, questionId);
        },
        isWrong(chapterId, questionId) {
            return hasRef(readState().wrongBook, chapterId, questionId);
        },
        getFavorites() {
            return readState().favorites;
        },
        addFavorite(chapterId, questionId) {
            addRef("favorites", chapterId, questionId);
        },
        removeFavorite(chapterId, questionId) {
            removeRef("favorites", chapterId, questionId);
        },
        isFavorite(chapterId, questionId) {
            return hasRef(readState().favorites, chapterId, questionId);
        },
        saveChapterResult,
        getChapterRecord(chapterId) {
            return readState().chapters[chapterId] || null;
        },
        exportState,
        importState
    };
})();
