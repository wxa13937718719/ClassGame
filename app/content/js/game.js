(function () {
    "use strict";

    const state = {
        mode: "chapter",
        chapterId: "",
        questions: [],
        currentIndex: 0,
        score: 0,
        correctCount: 0,
        answered: false,
        displayedOptions: [],
        selectedOptionIds: new Set(),
        fillInputElement: null,
        autoRemoveWrong: true
    };

    const el = {};

    function cacheElements() {
        [
            "chapter-title", "mode-label", "score", "progress-fill", "progress-text",
            "game-card", "question-text", "question-img", "options-container", "submit-answer-btn",
            "answer-summary", "explanation", "next-btn", "favorite-btn", "auto-remove-btn",
            "empty-state", "empty-title", "empty-text", "result-modal", "result-title",
            "result-score", "result-detail"
        ].forEach(id => { el[id] = document.getElementById(id); });
    }

    function isEmbedded() {
        return new URLSearchParams(window.location.search).get("embedded") === "1"
            && window.parent
            && window.parent !== window;
    }

    function getParams() {
        const params = new URLSearchParams(window.location.search);
        state.mode = params.get("mode") || "chapter";
        state.chapterId = params.get("chapter") || "";
        if (!new Set(["chapter", "wrong", "favorite"]).has(state.mode)) state.mode = "chapter";
    }

    function questionType(question) {
        return ["single", "multiple", "fill"].includes(question?.type) ? question.type : "single";
    }

    async function loadRequiredChapters() {
        const manifest = await ClassGameData.loadManifest();
        let items = [];

        if (state.mode === "chapter") {
            const item = manifest.find(entry => entry.id === state.chapterId && entry.enabled);
            if (!item) throw new Error("没有找到这个关卡，或者该关卡尚未启用。 ");
            items = [item];
        } else {
            items = manifest.filter(entry => entry.enabled);
        }

        await Promise.all(items.map(item => ClassGameData.loadChapter(item.id)));

        items.forEach(item => {
            const chapter = window.CLASSGAME_CHAPTERS[item.id];
            const validation = ClassGameValidator.reportChapter(chapter);
            if (!validation.valid) {
                throw new Error(`题库 ${item.title} 存在格式错误，请查看程序日志。`);
            }
        });
        return items;
    }

    function questionWithChapter(chapter, question) {
        return { ...question, chapterId: chapter.id, chapterTitle: chapter.title };
    }

    function resolveRefs(refs) {
        const output = [];
        refs.forEach(ref => {
            const chapter = window.CLASSGAME_CHAPTERS[ref.chapterId];
            const question = chapter?.questions?.find(item => item.id === ref.questionId);
            if (chapter && question) output.push(questionWithChapter(chapter, question));
        });
        return output;
    }

    function prepareQuestions() {
        if (state.mode === "chapter") {
            const chapter = window.CLASSGAME_CHAPTERS[state.chapterId];
            state.questions = chapter.questions.map(question => questionWithChapter(chapter, question));
        } else if (state.mode === "wrong") {
            state.questions = resolveRefs(ClassGameStorage.getWrongBook());
        } else {
            state.questions = resolveRefs(ClassGameStorage.getFavorites());
        }
        state.questions = ClassGameEffects.shuffle(state.questions);
    }

    function updateAutoRemoveControl() {
        if (!el["auto-remove-btn"]) return;
        const visible = state.mode === "wrong";
        el["auto-remove-btn"].hidden = !visible;
        if (!visible) return;
        el["auto-remove-btn"].classList.toggle("is-on", state.autoRemoveWrong);
        const labels = window.ClassGameConfig?.labels || {};
        el["auto-remove-btn"].textContent = state.autoRemoveWrong
            ? (labels.autoRemoveOn || "答对移除：开")
            : (labels.autoRemoveOff || "答对移除：关");
        el["auto-remove-btn"].setAttribute("aria-pressed", String(state.autoRemoveWrong));
        el["auto-remove-btn"].title = state.autoRemoveWrong
            ? "当前开启：答对后从错题本移除"
            : "当前关闭：答对后仍保留在错题本";
    }

    function setAutoRemoveWrong(enabled, notifyParent = false) {
        state.autoRemoveWrong = Boolean(enabled);
        ClassGameStorage.setRemoveWrongOnCorrect(state.autoRemoveWrong);
        updateAutoRemoveControl();
        if (notifyParent && isEmbedded()) {
            window.parent.postMessage({ type: "classgame:set-auto-remove", enabled: state.autoRemoveWrong }, "*");
        }
    }

    function toggleAutoRemoveWrong() {
        setAutoRemoveWrong(!state.autoRemoveWrong, true);
    }

    function setPageTitle() {
        if (state.mode === "chapter") {
            const chapter = window.CLASSGAME_CHAPTERS[state.chapterId];
            el["chapter-title"].textContent = chapter.title;
            el["mode-label"].textContent = window.ClassGameConfig?.labels?.chapterMode || "章节闯关";
            document.title = `${chapter.title} - 趣味化学闯关`;
        } else if (state.mode === "wrong") {
            el["chapter-title"].textContent = window.ClassGameConfig?.labels?.wrongBookTitle || "我的错题本";
            el["mode-label"].textContent = "错题专项练习";
            document.title = "错题本 - 趣味化学闯关";
        } else {
            el["chapter-title"].textContent = window.ClassGameConfig?.labels?.favoritesTitle || "我的收藏夹";
            el["mode-label"].textContent = "收藏专项练习";
            document.title = "收藏夹 - 趣味化学闯关";
        }
        updateAutoRemoveControl();
    }

    function updateProgress() {
        const total = state.questions.length;
        const completed = Math.min(state.currentIndex, total);
        const percent = total ? (completed / total) * 100 : 0;
        el["progress-fill"].style.width = `${percent}%`;
        el["progress-text"].textContent = total ? `${Math.min(state.currentIndex + 1, total)} / ${total}` : "0 / 0";
    }

    function updateFavoriteButton(question) {
        const favorite = ClassGameStorage.isFavorite(question.chapterId, question.id);
        el["favorite-btn"].classList.toggle("is-favorite", favorite);
        el["favorite-btn"].textContent = favorite ? "★ 已收藏" : "☆ 收藏本题";
        el["favorite-btn"].title = favorite ? "点击取消收藏" : "点击加入收藏夹";
    }

    function toggleFavorite() {
        const question = state.questions[state.currentIndex];
        if (!question) return;
        if (ClassGameStorage.isFavorite(question.chapterId, question.id)) {
            ClassGameStorage.removeFavorite(question.chapterId, question.id);
        } else {
            ClassGameStorage.addFavorite(question.chapterId, question.id);
        }
        updateFavoriteButton(question);
    }

    function renderQuestionImage(question) {
        const image = el["question-img"];
        if (!question.image) {
            image.style.display = "none";
            image.removeAttribute("src");
            return;
        }
        image.src = question.image;
        image.style.display = "block";
        image.onerror = () => {
            image.style.display = "none";
            console.warn(`题目图片加载失败：${question.image}`);
        };
    }

    function createOptionButton(option, displayIndex, question) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "option-btn";
        button.dataset.optionId = option.id;
        button.dataset.displayLetter = String.fromCharCode(65 + displayIndex);

        const topRow = document.createElement("span");
        topRow.className = "option-main";
        const label = document.createElement("span");
        label.className = "option-label";
        label.textContent = button.dataset.displayLetter;
        const content = document.createElement("span");
        content.className = "option-content";
        content.textContent = option.content || "";
        topRow.append(label, content);
        button.appendChild(topRow);

        if (option.image) {
            const image = document.createElement("img");
            image.className = "option-image";
            image.src = option.image;
            image.alt = option.content || "选项图片";
            image.onerror = () => {
                image.style.display = "none";
                console.warn(`选项图片加载失败：${option.image}`);
            };
            button.appendChild(image);
        }

        if (questionType(question) === "multiple") {
            button.addEventListener("click", () => toggleMultipleSelection(button, option.id));
        } else {
            button.addEventListener("click", () => finalizeChoiceAnswer(question, new Set([option.id])));
        }
        return button;
    }

    function toggleMultipleSelection(button, optionId) {
        if (state.answered) return;
        if (state.selectedOptionIds.has(optionId)) {
            state.selectedOptionIds.delete(optionId);
            button.classList.remove("selected");
        } else {
            state.selectedOptionIds.add(optionId);
            button.classList.add("selected");
        }
        el["submit-answer-btn"].disabled = state.selectedOptionIds.size === 0;
    }

    function renderFillAnswer(question) {
        const container = el["options-container"];
        const wrap = document.createElement("div");
        wrap.className = "fill-answer-wrap";
        const input = document.createElement("input");
        input.type = "text";
        input.className = "fill-answer-input";
        input.placeholder = "请输入答案";
        input.autocomplete = "off";
        input.addEventListener("input", () => {
            el["submit-answer-btn"].disabled = !input.value.trim();
        });
        input.addEventListener("keydown", event => {
            if (event.key === "Enter" && input.value.trim() && !state.answered) {
                event.preventDefault();
                submitCurrentAnswer();
            }
        });
        wrap.appendChild(input);
        container.appendChild(wrap);
        state.fillInputElement = input;
        el["submit-answer-btn"].hidden = false;
        el["submit-answer-btn"].disabled = true;
        el["submit-answer-btn"].textContent = "提交答案";
        setTimeout(() => input.focus(), 0);
    }

    function showQuestion() {
        const question = state.questions[state.currentIndex];
        if (!question) return;

        state.answered = false;
        state.selectedOptionIds = new Set();
        state.fillInputElement = null;
        const type = questionType(question);
        state.displayedOptions = type === "fill" ? [] : ClassGameEffects.shuffle(question.options || []);
        updateProgress();
        updateFavoriteButton(question);

        el["question-text"].textContent = `Q${state.currentIndex + 1}. ${question.text}`;
        renderQuestionImage(question);
        el["answer-summary"].hidden = true;
        el["answer-summary"].textContent = "";
        el.explanation.hidden = true;
        el.explanation.textContent = "";
        el["next-btn"].hidden = true;
        el["next-btn"].textContent = state.currentIndex === state.questions.length - 1 ? "查看成绩 ➜" : "继续挑战 ➜";
        el["submit-answer-btn"].hidden = true;
        el["submit-answer-btn"].disabled = false;

        const container = el["options-container"];
        container.classList.remove("answered");
        container.innerHTML = "";

        if (type === "fill") {
            renderFillAnswer(question);
        } else {
            state.displayedOptions.forEach((option, index) => {
                container.appendChild(createOptionButton(option, index, question));
            });
            if (type === "multiple") {
                el["submit-answer-btn"].hidden = false;
                el["submit-answer-btn"].disabled = true;
                el["submit-answer-btn"].textContent = "提交多选答案";
            }
        }

        ClassGameEffects.restartAnimation(el["game-card"], "slideIn 0.4s ease-out");
    }

    function displayedAnswerItems(question) {
        const type = questionType(question);
        const correctIds = type === "multiple" ? new Set(question.answerIds || []) : new Set([question.answerId]);
        return state.displayedOptions
            .map((option, index) => ({ option, index, letter: String.fromCharCode(65 + index) }))
            .filter(item => correctIds.has(item.option.id));
    }

    function getDisplayedAnswerText(question) {
        const items = displayedAnswerItems(question);
        if (questionType(question) === "multiple") {
            return `本次正确选项：${items.map(item => `${item.letter}. ${item.option.content || ""}`).join("；")}`;
        }
        const item = items[0];
        return `本次正确选项：${item?.letter || "?"}. ${item?.option?.content || ""}`;
    }

    function getFillAnswerText(question) {
        const answers = (question.answers || []).map(value => String(value).trim()).filter(Boolean);
        return `正确答案：${answers.join(" / ")}`;
    }

    function formatExplanation(question) {
        let text = String(question.explanation || "").trim();
        if (questionType(question) !== "fill") {
            const trailingAnswer = /(?:\r?\n|\s)*(?:故\s*选|故\s*答案\s*为|故\s*答案\s*是)\s*[：:]?\s*[A-D](?:\s*[、,，/和及]?\s*[A-D])*\s*[。．.]?\s*$/i;
            text = text.replace(trailingAnswer, "").trim();
        }
        return `💡 答案解析\n${text}`;
    }

    function setsEqual(a, b) {
        if (a.size !== b.size) return false;
        for (const value of a) if (!b.has(value)) return false;
        return true;
    }

    function recordResult(correct, question) {
        if (correct) {
            const oldScore = state.score;
            state.score += 10;
            state.correctCount += 1;
            ClassGameEffects.animateScore(el.score, oldScore, state.score);
            ClassGameEffects.fireConfetti(70);
            ClassGameAudio.playCorrect();
            if (state.mode === "wrong" && state.autoRemoveWrong) {
                ClassGameStorage.removeWrong(question.chapterId, question.id);
            }
        } else {
            ClassGameEffects.shake(el["game-card"]);
            ClassGameAudio.playWrong();
            ClassGameStorage.addWrong(question.chapterId, question.id);
        }
    }

    function showAfterAnswer(question, answerText) {
        setTimeout(() => {
            el["answer-summary"].textContent = answerText;
            el["answer-summary"].hidden = false;
            el.explanation.textContent = formatExplanation(question);
            el.explanation.hidden = false;
            el["next-btn"].hidden = false;
        }, 300);
    }

    function finalizeChoiceAnswer(question, selectedIds) {
        if (state.answered) return;
        state.answered = true;
        el["submit-answer-btn"].hidden = true;

        const type = questionType(question);
        const correctIds = type === "multiple" ? new Set(question.answerIds || []) : new Set([question.answerId]);
        const correct = setsEqual(selectedIds, correctIds);
        const buttons = Array.from(document.querySelectorAll(".option-btn"));
        el["options-container"].classList.add("answered");

        buttons.forEach(button => {
            const id = button.dataset.optionId;
            button.disabled = true;
            button.classList.remove("selected");
            button.classList.add("disabled");
            if (correctIds.has(id)) {
                button.classList.remove("disabled");
                button.classList.add("correct");
            } else if (selectedIds.has(id)) {
                button.classList.remove("disabled");
                button.classList.add("wrong");
            }
        });

        recordResult(correct, question);
        showAfterAnswer(question, getDisplayedAnswerText(question));
    }

    function finalizeFillAnswer(question) {
        if (state.answered || !state.fillInputElement) return;
        const input = state.fillInputElement;
        const answer = input.value.trim();
        if (!answer) return;
        state.answered = true;
        el["submit-answer-btn"].hidden = true;
        input.disabled = true;
        const answers = (question.answers || []).map(value => String(value).trim()).filter(Boolean);
        const correct = answers.includes(answer);
        input.classList.add(correct ? "correct" : "wrong");
        recordResult(correct, question);
        showAfterAnswer(question, getFillAnswerText(question));
    }

    function submitCurrentAnswer() {
        const question = state.questions[state.currentIndex];
        if (!question || state.answered) return;
        const type = questionType(question);
        if (type === "multiple") {
            if (!state.selectedOptionIds.size) return;
            finalizeChoiceAnswer(question, new Set(state.selectedOptionIds));
        } else if (type === "fill") {
            finalizeFillAnswer(question);
        }
    }

    function nextQuestion() {
        if (!state.answered) return;
        state.currentIndex += 1;
        if (state.currentIndex < state.questions.length) showQuestion();
        else finishGame();
    }

    function finishGame() {
        el["progress-fill"].style.width = "100%";
        el["progress-text"].textContent = `${state.questions.length} / ${state.questions.length}`;

        if (state.mode === "chapter") {
            ClassGameStorage.saveChapterResult(state.chapterId, {
                score: state.score,
                correctCount: state.correctCount,
                total: state.questions.length
            });
        }

        const maxScore = state.questions.length * 10;
        const accuracy = state.questions.length ? Math.round((state.correctCount / state.questions.length) * 100) : 0;
        el["result-title"].textContent = state.mode === "chapter" ? "🎉 闯关完成！" : "🎉 专项练习完成！";
        el["result-score"].textContent = `${state.score} / ${maxScore} 分`;
        el["result-detail"].textContent = `答对 ${state.correctCount} 题，共 ${state.questions.length} 题，正确率 ${accuracy}%`;
        el["result-modal"].classList.add("show");
        ClassGameEffects.fireConfetti(120);
    }

    function retryGame() {
        if (state.mode === "wrong") {
            state.questions = resolveRefs(ClassGameStorage.getWrongBook());
        } else if (state.mode === "favorite") {
            state.questions = resolveRefs(ClassGameStorage.getFavorites());
        }

        state.questions = ClassGameEffects.shuffle(state.questions);
        state.currentIndex = 0;
        state.score = 0;
        state.correctCount = 0;
        state.answered = false;
        state.selectedOptionIds = new Set();
        state.fillInputElement = null;
        el.score.textContent = "0";
        el["result-modal"].classList.remove("show");

        if (!state.questions.length) {
            if (state.mode === "wrong") showEmpty("错题已经全部消灭", "当前错题本中已经没有题目。 ");
            else if (state.mode === "favorite") showEmpty("收藏夹是空的", "当前没有已收藏的题目。 ");
            return;
        }

        el["empty-state"].hidden = true;
        el["game-card"].hidden = false;
        showQuestion();
    }

    function showEmpty(title, text) {
        el["game-card"].hidden = true;
        el["empty-title"].textContent = title;
        el["empty-text"].textContent = text;
        el["empty-state"].hidden = false;
        el["progress-text"].textContent = "0 / 0";
    }

    function showFatalError(error) {
        console.error(error);
        showEmpty("加载失败", error.message || String(error));
    }

    function backToDirectory() {
        if (isEmbedded()) window.parent.postMessage({ type: "classgame:back-menu" }, "*");
        else window.location.href = "index.html?view=menu";
    }

    function bindParentSettingBridge() {
        if (!isEmbedded()) return;
        window.addEventListener("message", event => {
            const data = event.data || {};
            if (data.type === "classgame:auto-remove-state") setAutoRemoveWrong(data.enabled !== false, false);
        });
        window.parent.postMessage({ type: "classgame:request-auto-remove-state" }, "*");
    }

    async function init() {
        await window.ClassGameConfigReady;
        cacheElements();
        getParams();
        state.autoRemoveWrong = ClassGameStorage.isRemoveWrongOnCorrect();

        ClassGameAudio.init({
            bgmId: "bgm",
            correctId: "correct-sound",
            wrongId: "wrong-sound",
            buttonId: "music-btn",
            bgmVolume: 0.6,
            correctVolume: 1,
            wrongVolume: 1
        });
        bindParentSettingBridge();

        el["favorite-btn"].addEventListener("click", toggleFavorite);
        el["auto-remove-btn"].addEventListener("click", toggleAutoRemoveWrong);
        el["submit-answer-btn"].addEventListener("click", submitCurrentAnswer);
        el["next-btn"].addEventListener("click", nextQuestion);
        document.getElementById("retry-btn").addEventListener("click", retryGame);
        document.getElementById("back-menu-btn").addEventListener("click", backToDirectory);
        document.getElementById("back-home-btn").addEventListener("click", backToDirectory);
        document.getElementById("empty-home-btn").addEventListener("click", backToDirectory);

        try {
            await loadRequiredChapters();
            prepareQuestions();
            setPageTitle();

            if (!state.questions.length) {
                if (state.mode === "wrong") showEmpty("错题本是空的", "普通关卡中答错的题会自动出现在这里。 ");
                else if (state.mode === "favorite") showEmpty("收藏夹是空的", "答题时点击“收藏本题”，即可加入收藏夹。 ");
                else showEmpty("本关没有题目", "请在教师编辑器中添加题目并保存发布。 ");
                return;
            }
            showQuestion();
        } catch (error) {
            showFatalError(error);
        }
    }

    document.addEventListener("DOMContentLoaded", init);
})();
