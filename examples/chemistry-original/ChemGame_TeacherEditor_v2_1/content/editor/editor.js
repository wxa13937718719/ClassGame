(function () {
    "use strict";

    const state = {
        manifest: { version: 2, chapters: [] },
        chapters: {},
        selectedChapterId: "",
        selectedQuestionId: "",
        dirty: false,
        drag: { type: "", id: "" }
    };

    const el = {};

    function cacheElements() {
        [
            "save-status", "reload-btn", "open-game-btn", "save-btn", "chapter-count", "chapter-list",
            "add-chapter-btn", "question-count", "question-list", "add-question-btn", "empty-editor",
            "chapter-editor", "question-editor", "chapter-title-input", "chapter-icon-input",
            "chapter-subtitle-input", "chapter-enabled-input", "chapter-up-btn", "chapter-down-btn",
            "delete-chapter-btn", "question-type-input", "question-text-input", "question-image-path",
            "choose-question-image-btn", "clear-question-image-btn", "question-image-preview", "choice-editor-block",
            "fill-editor-block", "fill-answers-input", "options-editor", "add-option-btn", "answer-mode-tip",
            "question-explanation-input", "letter-warning", "question-up-btn", "question-down-btn",
            "duplicate-question-btn", "delete-question-btn", "preview-question", "preview-options", "message",
            "chapter-dialog", "chapter-dialog-form", "new-chapter-title", "new-chapter-subtitle",
            "new-chapter-icon", "new-chapter-enabled", "cancel-chapter-dialog", "question-dialog",
            "question-dialog-form", "new-question-type", "cancel-question-dialog"
        ].forEach(id => { el[id] = document.getElementById(id); });
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function showMessage(text, type = "info") {
        el.message.textContent = text;
        el.message.className = `toast ${type}`;
        el.message.hidden = false;
        clearTimeout(showMessage.timer);
        showMessage.timer = setTimeout(() => { el.message.hidden = true; }, 4200);
    }

    function setMainDirty(value) {
        if (window.chemEditor?.setDirty) window.chemEditor.setDirty(Boolean(value));
    }

    function markDirty() {
        state.dirty = true;
        el["save-status"].textContent = "有未保存修改";
        el["save-status"].className = "status dirty";
        setMainDirty(true);
    }

    function markSaved() {
        state.dirty = false;
        el["save-status"].textContent = "已保存";
        el["save-status"].className = "status saved";
        setMainDirty(false);
    }

    function currentManifestItem() {
        return state.manifest.chapters.find(item => item.id === state.selectedChapterId) || null;
    }

    function currentChapter() {
        return state.chapters[state.selectedChapterId] || null;
    }

    function currentQuestion() {
        const chapter = currentChapter();
        return chapter?.questions?.find(q => q.id === state.selectedQuestionId) || null;
    }

    function normalizeOrders() {
        state.manifest.chapters.forEach((item, index) => { item.order = index + 1; });
    }

    function nextChapterId() {
        const used = new Set(state.manifest.chapters.map(item => item.id));
        let n = 1;
        while (used.has(`chapter_${String(n).padStart(3, "0")}`)) n += 1;
        return `chapter_${String(n).padStart(3, "0")}`;
    }

    function nextQuestionId(chapter) {
        const used = new Set((chapter.questions || []).map(q => q.id));
        let n = 1;
        while (used.has(`q_${String(n).padStart(3, "0")}`)) n += 1;
        return `q_${String(n).padStart(3, "0")}`;
    }

    function nextOptionId(question) {
        const used = new Set((question.options || []).map(o => o.id));
        let n = 1;
        while (used.has(`opt_${n}`)) n += 1;
        return `opt_${n}`;
    }

    function typeLabel(type) {
        return ({ single: "单选", multiple: "多选", fill: "填空" })[type] || "单选";
    }

    function ensureChoiceOptions(question) {
        question.options = Array.isArray(question.options) ? question.options : [];
        const minimum = question.options.length === 0 ? 4 : 2;
        while (question.options.length < minimum) {
            question.options.push({ id: nextOptionId(question), content: "", image: "" });
        }
    }

    function ensureQuestionShape(question) {
        question.type = ["single", "multiple", "fill"].includes(question.type) ? question.type : "single";
        question.image = question.image || "";
        question.explanation = question.explanation || "";

        if (question.type === "single") {
            ensureChoiceOptions(question);
            if (!question.options.some(o => o.id === question.answerId)) question.answerId = "";
        } else if (question.type === "multiple") {
            ensureChoiceOptions(question);
            question.answerIds = Array.isArray(question.answerIds)
                ? question.answerIds.filter(id => question.options.some(o => o.id === id))
                : (question.answerId && question.options.some(o => o.id === question.answerId) ? [question.answerId] : []);
        } else {
            question.answers = Array.isArray(question.answers) ? question.answers : [];
        }
    }

    function makeDragGrip() {
        const grip = document.createElement("span");
        grip.className = "drag-grip";
        grip.textContent = "☰";
        grip.title = "按住拖动调整顺序";
        return grip;
    }

    function clearDragStyles() {
        document.querySelectorAll(".dragging, .drag-over").forEach(node => node.classList.remove("dragging", "drag-over"));
        state.drag = { type: "", id: "" };
    }

    function reorderById(array, sourceId, targetId, after) {
        const sourceIndex = array.findIndex(item => item.id === sourceId);
        if (sourceIndex < 0) return false;
        const [source] = array.splice(sourceIndex, 1);
        let targetIndex = array.findIndex(item => item.id === targetId);
        if (targetIndex < 0) {
            array.push(source);
            return true;
        }
        if (after) targetIndex += 1;
        array.splice(targetIndex, 0, source);
        return true;
    }

    function bindListDrag(button, type, id, arrayProvider, afterDrop) {
        button.draggable = true;
        button.addEventListener("dragstart", event => {
            state.drag = { type, id };
            button.classList.add("dragging");
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", id);
        });
        button.addEventListener("dragover", event => {
            if (state.drag.type !== type || state.drag.id === id) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            button.classList.add("drag-over");
        });
        button.addEventListener("dragleave", () => button.classList.remove("drag-over"));
        button.addEventListener("drop", event => {
            if (state.drag.type !== type || state.drag.id === id) return;
            event.preventDefault();
            const rect = button.getBoundingClientRect();
            const after = event.clientY > rect.top + rect.height / 2;
            const array = arrayProvider();
            if (reorderById(array, state.drag.id, id, after)) {
                if (type === "chapter") normalizeOrders();
                markDirty();
                afterDrop();
            }
            clearDragStyles();
        });
        button.addEventListener("dragend", clearDragStyles);
    }

    function renderChapterList() {
        const list = state.manifest.chapters;
        el["chapter-count"].textContent = `${list.length} 个章节`;
        el["chapter-list"].innerHTML = "";

        list.forEach(item => {
            const chapter = state.chapters[item.id];
            const button = document.createElement("button");
            button.type = "button";
            button.className = `list-item ${item.id === state.selectedChapterId ? "active" : ""}`;
            button.appendChild(makeDragGrip());

            const title = document.createElement("span");
            title.className = "title";
            title.textContent = `${item.icon || "🧪"} ${item.title || "未命名章节"}`;
            if (!item.enabled) {
                const tag = document.createElement("span");
                tag.className = "disabled-tag";
                tag.textContent = "未启用";
                title.appendChild(tag);
            }

            const meta = document.createElement("span");
            meta.className = "meta";
            meta.textContent = `${chapter?.questions?.length || 0} 道题${item.subtitle ? ` · ${item.subtitle}` : ""}`;
            button.append(title, meta);
            button.addEventListener("click", () => selectChapter(item.id));
            bindListDrag(button, "chapter", item.id, () => state.manifest.chapters, renderAll);
            el["chapter-list"].appendChild(button);
        });
    }

    function renderQuestionList() {
        const chapter = currentChapter();
        el["question-list"].innerHTML = "";
        el["add-question-btn"].disabled = !chapter;
        if (!chapter) {
            el["question-count"].textContent = "请选择章节";
            return;
        }
        const questions = chapter.questions || [];
        el["question-count"].textContent = `${questions.length} 道题`;
        questions.forEach((question, index) => {
            ensureQuestionShape(question);
            const button = document.createElement("button");
            button.type = "button";
            button.className = `list-item ${question.id === state.selectedQuestionId ? "active" : ""}`;
            button.appendChild(makeDragGrip());
            const title = document.createElement("span");
            title.className = "title";
            const text = (question.text || "未填写题干").replace(/\s+/g, " ").trim();
            title.textContent = `${index + 1}. ${text.slice(0, 35)}${text.length > 35 ? "…" : ""}`;
            const meta = document.createElement("span");
            meta.className = "meta";
            meta.textContent = question.type === "fill"
                ? "填空题"
                : `${typeLabel(question.type)} · ${(question.options || []).length} 个选项`;
            button.append(title, meta);
            button.addEventListener("click", () => selectQuestion(question.id));
            bindListDrag(button, "question", question.id, () => chapter.questions, renderAll);
            el["question-list"].appendChild(button);
        });
    }

    function selectChapter(chapterId) {
        state.selectedChapterId = chapterId;
        state.selectedQuestionId = "";
        renderAll();
    }

    function selectQuestion(questionId) {
        state.selectedQuestionId = questionId;
        renderAll();
    }

    function renderChapterEditor() {
        const item = currentManifestItem();
        const chapter = currentChapter();
        const question = currentQuestion();
        const show = Boolean(item && chapter && !question);
        el["chapter-editor"].hidden = !show;
        if (!show) return;

        el["chapter-title-input"].value = item.title || "";
        el["chapter-icon-input"].value = item.icon || "🧪";
        el["chapter-subtitle-input"].value = item.subtitle || "";
        el["chapter-enabled-input"].checked = Boolean(item.enabled);
        const index = state.manifest.chapters.indexOf(item);
        el["chapter-up-btn"].disabled = index <= 0;
        el["chapter-down-btn"].disabled = index < 0 || index >= state.manifest.chapters.length - 1;
    }

    function renderQuestionEditor() {
        const question = currentQuestion();
        el["question-editor"].hidden = !question;
        if (!question) return;
        ensureQuestionShape(question);

        el["question-type-input"].value = question.type;
        el["question-text-input"].value = question.text || "";
        el["question-explanation-input"].value = question.explanation || "";
        renderQuestionImage(question);
        renderTypeEditor(question);
        renderPreview(question);
        updateLetterWarning(question.explanation || "", question.type);

        const questions = currentChapter().questions;
        const index = questions.indexOf(question);
        el["question-up-btn"].disabled = index <= 0;
        el["question-down-btn"].disabled = index < 0 || index >= questions.length - 1;
    }

    function updateEmptyState() {
        const hasSelection = Boolean(currentChapter());
        el["empty-editor"].hidden = hasSelection;
    }

    function renderQuestionImage(question) {
        el["question-image-path"].textContent = question.image ? "已选择图片" : "无";
        if (question.image) {
            el["question-image-preview"].src = `/${question.image}?v=${Date.now()}`;
            el["question-image-preview"].hidden = false;
        } else {
            el["question-image-preview"].removeAttribute("src");
            el["question-image-preview"].hidden = true;
        }
    }

    function isCorrectOption(question, optionId) {
        if (question.type === "multiple") return (question.answerIds || []).includes(optionId);
        return question.answerId === optionId;
    }

    function toggleOptionAnswer(question, optionId, checked) {
        if (question.type === "multiple") {
            const set = new Set(question.answerIds || []);
            if (checked) set.add(optionId); else set.delete(optionId);
            question.answerIds = Array.from(set);
        } else {
            question.answerId = checked ? optionId : "";
        }
        markDirty();
        renderOptions(question);
    }

    function bindOptionDrag(handle, row, question, option) {
        handle.draggable = true;
        handle.addEventListener("dragstart", event => {
            state.drag = { type: "option", id: option.id };
            row.classList.add("dragging");
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", option.id);
        });
        row.addEventListener("dragover", event => {
            if (state.drag.type !== "option" || state.drag.id === option.id) return;
            event.preventDefault();
            row.classList.add("drag-over");
        });
        row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
        row.addEventListener("drop", event => {
            if (state.drag.type !== "option" || state.drag.id === option.id) return;
            event.preventDefault();
            const rect = row.getBoundingClientRect();
            const after = event.clientY > rect.top + rect.height / 2;
            if (reorderById(question.options, state.drag.id, option.id, after)) {
                markDirty(); renderOptions(question); renderPreview(question);
            }
            clearDragStyles();
        });
        handle.addEventListener("dragend", clearDragStyles);
    }

    function renderOptions(question) {
        const container = el["options-editor"];
        container.innerHTML = "";
        (question.options || []).forEach((option, index) => {
            const row = document.createElement("div");
            row.className = `option-row ${isCorrectOption(question, option.id) ? "correct" : ""}`;

            const handle = document.createElement("span");
            handle.className = "option-drag-handle";
            handle.textContent = "☰";
            handle.title = "按住拖动选项";
            bindOptionDrag(handle, row, question, option);

            const answerControl = document.createElement("input");
            answerControl.type = question.type === "multiple" ? "checkbox" : "radio";
            answerControl.name = question.type === "multiple" ? `correct-${question.id}-${option.id}` : "correct-answer";
            answerControl.className = "option-answer-control";
            answerControl.checked = isCorrectOption(question, option.id);
            answerControl.title = question.type === "multiple" ? "勾选为正确答案" : "设为正确答案";
            answerControl.addEventListener("change", () => toggleOptionAnswer(question, option.id, answerControl.checked));

            const fields = document.createElement("div");
            fields.className = "option-fields";
            const input = document.createElement("input");
            input.type = "text";
            input.placeholder = `选项 ${index + 1}`;
            input.value = option.content || "";
            input.addEventListener("input", () => {
                option.content = input.value;
                markDirty();
                renderPreview(question);
            });
            fields.appendChild(input);

            if (option.image) {
                const img = document.createElement("img");
                img.className = "option-image-mini";
                img.src = `/${option.image}?v=${Date.now()}`;
                img.alt = "选项图片";
                fields.appendChild(img);
            }

            const actions = document.createElement("div");
            actions.className = "option-actions";
            actions.append(
                makeSmallButton("图片", () => chooseOptionImage(question, option)),
                makeSmallButton("清图", () => { option.image = ""; markDirty(); renderOptions(question); renderPreview(question); }),
                makeSmallButton("↑", () => moveOption(question, index, -1), index === 0),
                makeSmallButton("↓", () => moveOption(question, index, 1), index === question.options.length - 1),
                makeSmallButton("删除", () => deleteOption(question, option), question.options.length <= 2, true)
            );

            row.append(handle, answerControl, fields, actions);
            container.appendChild(row);
        });
    }

    function renderTypeEditor(question) {
        const choice = question.type !== "fill";
        el["choice-editor-block"].hidden = !choice;
        el["fill-editor-block"].hidden = choice;
        if (choice) {
            el["answer-mode-tip"].textContent = question.type === "multiple"
                ? "勾选所有正确选项；学生作答时需要全部选对才得分。"
                : "点击选项左侧圆点设置唯一正确答案。";
            renderOptions(question);
        } else {
            el["fill-answers-input"].value = (question.answers || []).join("\n");
        }
    }

    function makeSmallButton(text, handler, disabled = false, danger = false) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `${danger ? "danger" : "ghost"} small`;
        button.textContent = text;
        button.disabled = disabled;
        button.addEventListener("click", handler);
        return button;
    }

    function renderPreview(question) {
        if (!question) return;
        el["preview-question"].textContent = question.text || "（尚未填写题干）";
        el["preview-options"].innerHTML = "";
        if (question.type === "fill") {
            const input = document.createElement("div");
            input.className = "preview-fill";
            input.textContent = "学生在这里输入答案……";
            el["preview-options"].appendChild(input);
            return;
        }
        (question.options || []).forEach(option => {
            const box = document.createElement("div");
            box.className = "preview-option";
            const text = document.createElement("span");
            text.textContent = `${question.type === "multiple" ? "□" : "○"} ${option.content || "（空选项）"}`;
            box.appendChild(text);
            if (option.image) {
                const img = document.createElement("img");
                img.src = `/${option.image}`;
                img.alt = option.content || "选项图片";
                box.appendChild(img);
            }
            el["preview-options"].appendChild(box);
        });
    }

    function renderAll() {
        renderChapterList();
        renderQuestionList();
        updateEmptyState();
        renderChapterEditor();
        renderQuestionEditor();
    }

    function bindChapterFields() {
        el["chapter-title-input"].addEventListener("input", () => {
            const item = currentManifestItem();
            const chapter = currentChapter();
            if (!item || !chapter) return;
            item.title = el["chapter-title-input"].value;
            chapter.title = item.title.replace(/^第.+?关[：:]?\s*/, "") || item.title;
            markDirty();
            renderChapterList();
        });
        el["chapter-icon-input"].addEventListener("input", () => {
            const item = currentManifestItem(); if (!item) return;
            item.icon = el["chapter-icon-input"].value;
            markDirty(); renderChapterList();
        });
        el["chapter-subtitle-input"].addEventListener("input", () => {
            const item = currentManifestItem(); if (!item) return;
            item.subtitle = el["chapter-subtitle-input"].value;
            markDirty(); renderChapterList();
        });
        el["chapter-enabled-input"].addEventListener("change", () => {
            const item = currentManifestItem(); if (!item) return;
            item.enabled = el["chapter-enabled-input"].checked;
            markDirty(); renderChapterList();
        });
    }

    function changeQuestionType() {
        const q = currentQuestion(); if (!q) return;
        const nextType = el["question-type-input"].value;
        if (q.type === nextType) return;
        q.type = nextType;
        ensureQuestionShape(q);
        markDirty();
        renderQuestionList();
        renderTypeEditor(q);
        renderPreview(q);
        updateLetterWarning(q.explanation || "", q.type);
    }

    function bindQuestionFields() {
        el["question-type-input"].addEventListener("change", changeQuestionType);
        el["question-text-input"].addEventListener("input", () => {
            const q = currentQuestion(); if (!q) return;
            q.text = el["question-text-input"].value;
            markDirty(); renderQuestionList(); renderPreview(q);
        });
        el["fill-answers-input"].addEventListener("input", () => {
            const q = currentQuestion(); if (!q || q.type !== "fill") return;
            q.answers = el["fill-answers-input"].value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
            markDirty();
        });
        el["question-explanation-input"].addEventListener("input", () => {
            const q = currentQuestion(); if (!q) return;
            q.explanation = el["question-explanation-input"].value;
            markDirty(); updateLetterWarning(q.explanation, q.type);
        });
    }

    function updateLetterWarning(text, type) {
        if (type === "fill") {
            el["letter-warning"].hidden = true;
            return;
        }
        const pattern = /(故\s*(选|答案(?:为|是)?)[：:\s]*[A-D](?:\s*[、,，/和及]?\s*[A-D])*)|(正确答案[：:\s]*[A-D](?:\s*[、,，/和及]?\s*[A-D])*)|(答案[：:\s]*[A-D](?:\s*[、,，/和及]?\s*[A-D])*)/i;
        el["letter-warning"].hidden = !pattern.test(text || "");
    }

    function moveInArray(array, index, delta) {
        const target = index + delta;
        if (index < 0 || target < 0 || target >= array.length) return false;
        [array[index], array[target]] = [array[target], array[index]];
        return true;
    }

    function moveSelectedChapter(delta) {
        const item = currentManifestItem();
        const index = state.manifest.chapters.indexOf(item);
        if (!item || !moveInArray(state.manifest.chapters, index, delta)) return;
        normalizeOrders(); markDirty(); renderAll();
    }

    function moveSelectedQuestion(delta) {
        const chapter = currentChapter(); const q = currentQuestion();
        if (!chapter || !q) return;
        const index = chapter.questions.indexOf(q);
        if (!moveInArray(chapter.questions, index, delta)) return;
        markDirty(); renderAll();
    }

    function moveOption(question, index, delta) {
        if (moveInArray(question.options, index, delta)) {
            markDirty(); renderOptions(question); renderPreview(question);
        }
    }

    function makeNewQuestion(chapter, type) {
        const id = nextQuestionId(chapter);
        const base = { id, type, text: "", image: "", explanation: "" };
        if (type === "fill") {
            return { ...base, answers: [] };
        }
        const options = [1, 2, 3, 4].map(n => ({ id: `opt_${n}`, content: "", image: "" }));
        return type === "multiple"
            ? { ...base, options, answerIds: [] }
            : { ...base, options, answerId: "" };
    }

    function openAddQuestionDialog() {
        if (!currentChapter()) return;
        el["new-question-type"].value = "single";
        el["question-dialog"].showModal();
    }

    function createQuestionFromDialog(event) {
        event.preventDefault();
        const chapter = currentChapter();
        if (!chapter) return;
        const q = makeNewQuestion(chapter, el["new-question-type"].value);
        chapter.questions.push(q);
        state.selectedQuestionId = q.id;
        el["question-dialog"].close();
        markDirty(); renderAll();
        setTimeout(() => el["question-text-input"].focus(), 0);
    }

    function duplicateQuestion() {
        const chapter = currentChapter(); const q = currentQuestion();
        if (!chapter || !q) return;
        const copy = clone(q);
        copy.id = nextQuestionId(chapter);
        copy.text = `${copy.text || ""}（副本）`;
        chapter.questions.splice(chapter.questions.indexOf(q) + 1, 0, copy);
        state.selectedQuestionId = copy.id;
        markDirty(); renderAll();
    }

    function deleteQuestion() {
        const chapter = currentChapter(); const q = currentQuestion();
        if (!chapter || !q) return;
        if (!confirm(`确定删除这道题吗？\n\n${(q.text || "未填写题干").slice(0, 80)}`)) return;
        const index = chapter.questions.indexOf(q);
        chapter.questions.splice(index, 1);
        state.selectedQuestionId = chapter.questions[index]?.id || chapter.questions[index - 1]?.id || "";
        markDirty(); renderAll();
    }

    function addOption() {
        const q = currentQuestion(); if (!q || q.type === "fill") return;
        q.options = q.options || [];
        q.options.push({ id: nextOptionId(q), content: "", image: "" });
        markDirty(); renderOptions(q); renderPreview(q);
    }

    function deleteOption(question, option) {
        if (question.options.length <= 2) return;
        const index = question.options.indexOf(option);
        question.options.splice(index, 1);
        if (question.type === "multiple") {
            question.answerIds = (question.answerIds || []).filter(id => id !== option.id);
        } else if (question.answerId === option.id) {
            question.answerId = "";
        }
        markDirty(); renderOptions(question); renderPreview(question);
    }

    async function chooseQuestionImage() {
        const q = currentQuestion(); if (!q) return;
        const result = await window.chemEditor.chooseImage({ chapterId: state.selectedChapterId, questionId: q.id, kind: "question" });
        if (!result?.path) return;
        q.image = result.path;
        markDirty(); renderQuestionImage(q); renderPreview(q);
    }

    async function chooseOptionImage(question, option) {
        const result = await window.chemEditor.chooseImage({
            chapterId: state.selectedChapterId, questionId: question.id, optionId: option.id, kind: "option"
        });
        if (!result?.path) return;
        option.image = result.path;
        markDirty(); renderOptions(question); renderPreview(question);
    }

    function clearQuestionImage() {
        const q = currentQuestion(); if (!q) return;
        q.image = "";
        markDirty(); renderQuestionImage(q); renderPreview(q);
    }

    function deleteChapter() {
        const item = currentManifestItem();
        if (!item) return;
        const chapter = currentChapter();
        if (!confirm(`确定删除章节“${item.title}”吗？\n该章节共 ${chapter?.questions?.length || 0} 道题。保存时会先自动备份。`)) return;
        const index = state.manifest.chapters.indexOf(item);
        state.manifest.chapters.splice(index, 1);
        delete state.chapters[item.id];
        normalizeOrders();
        state.selectedChapterId = state.manifest.chapters[index]?.id || state.manifest.chapters[index - 1]?.id || "";
        state.selectedQuestionId = "";
        markDirty(); renderAll();
    }

    function openAddChapterDialog() {
        el["new-chapter-title"].value = `第${state.manifest.chapters.length + 1}关：`;
        el["new-chapter-subtitle"].value = "";
        el["new-chapter-icon"].value = "🧪";
        el["new-chapter-enabled"].checked = true;
        el["chapter-dialog"].showModal();
        setTimeout(() => el["new-chapter-title"].focus(), 0);
    }

    function createChapterFromDialog(event) {
        event.preventDefault();
        const title = el["new-chapter-title"].value.trim();
        if (!title) return;
        const id = nextChapterId();
        const item = {
            id,
            order: state.manifest.chapters.length + 1,
            icon: el["new-chapter-icon"].value.trim() || "🧪",
            title,
            subtitle: el["new-chapter-subtitle"].value.trim(),
            enabled: el["new-chapter-enabled"].checked,
            file: `data/chapters/${id}/chapter.json`
        };
        state.manifest.chapters.push(item);
        state.chapters[id] = { id, title: title.replace(/^第.+?关[：:]?\s*/, "") || title, source: "老师通过编辑器创建", questions: [] };
        state.selectedChapterId = id;
        state.selectedQuestionId = "";
        el["chapter-dialog"].close();
        markDirty(); renderAll();
    }

    function validateClient() {
        const errors = [];
        const warnings = [];
        const ids = new Set();
        state.manifest.chapters.forEach((item, chapterIndex) => {
            const prefix = `第 ${chapterIndex + 1} 个章节`;
            if (!item.id) errors.push(`${prefix} 缺少内部编号。`);
            if (ids.has(item.id)) errors.push(`${prefix} 的内部编号重复。`);
            ids.add(item.id);
            if (!String(item.title || "").trim()) errors.push(`${prefix} 没有目录标题。`);
            const chapter = state.chapters[item.id];
            if (!chapter) { errors.push(`${prefix} 找不到章节数据。`); return; }
            const qIds = new Set();
            (chapter.questions || []).forEach((q, qi) => {
                ensureQuestionShape(q);
                const qp = `${item.title} · 第 ${qi + 1} 题`;
                if (!String(q.text || "").trim()) errors.push(`${qp} 没有题干。`);
                if (qIds.has(q.id)) errors.push(`${qp} 题目编号重复。`);
                qIds.add(q.id);
                if (!["single", "multiple", "fill"].includes(q.type)) errors.push(`${qp} 题型不受支持。`);

                if (q.type === "fill") {
                    const answers = (q.answers || []).map(v => String(v).trim()).filter(Boolean);
                    if (!answers.length) errors.push(`${qp} 没有填写正确答案。`);
                } else {
                    if (!Array.isArray(q.options) || q.options.length < 2) errors.push(`${qp} 至少需要 2 个选项。`);
                    const optIds = new Set();
                    (q.options || []).forEach((o, oi) => {
                        if (!o.id || optIds.has(o.id)) errors.push(`${qp} 的选项编号缺失或重复。`);
                        optIds.add(o.id);
                        if (!String(o.content || "").trim() && !o.image) errors.push(`${qp} 的第 ${oi + 1} 个选项为空。`);
                    });
                    if (q.type === "single") {
                        if (!optIds.has(q.answerId)) errors.push(`${qp} 没有设置正确答案。`);
                    } else {
                        const answerIds = Array.isArray(q.answerIds) ? q.answerIds : [];
                        if (!answerIds.length || answerIds.some(id => !optIds.has(id))) errors.push(`${qp} 没有设置有效的多选答案。`);
                    }
                }
                if (!String(q.explanation || "").trim()) warnings.push(`${qp} 没有填写解析。`);
            });
        });
        return { errors, warnings };
    }

    async function saveAll(options = {}) {
        const check = validateClient();
        if (check.errors.length) {
            showMessage(`不能发布，发现 ${check.errors.length} 个问题：\n${check.errors.slice(0, 6).join("\n")}${check.errors.length > 6 ? "\n……" : ""}`, "error");
            return false;
        }
        if (check.warnings.length && !options.skipWarningPrompt) {
            if (!confirm(`发现 ${check.warnings.length} 个提醒，例如：\n${check.warnings.slice(0, 4).join("\n")}\n\n仍然保存并发布吗？`)) return false;
        }

        el["save-btn"].disabled = true;
        try {
            normalizeOrders();
            state.manifest.version = 2;
            const result = await window.chemEditor.saveData({ manifest: state.manifest, chapters: state.chapters });
            markSaved();
            if (!options.quiet) {
                showMessage(`保存成功。\n共 ${result.chapterCount} 个章节、${result.questionCount} 道题。`, "success");
            }
            return true;
        } catch (error) {
            showMessage(error.message || String(error), "error");
            return false;
        } finally {
            el["save-btn"].disabled = false;
        }
    }

    async function loadData(askIfDirty = false) {
        if (askIfDirty && state.dirty && !confirm("当前有未保存的修改。确定放弃并重新载入吗？")) return;
        try {
            const payload = await window.chemEditor.loadData();
            state.manifest = payload.manifest || { version: 2, chapters: [] };
            state.manifest.chapters = Array.isArray(state.manifest.chapters) ? state.manifest.chapters : [];
            state.chapters = payload.chapters || {};
            Object.values(state.chapters).forEach(chapter => (chapter.questions || []).forEach(ensureQuestionShape));
            state.selectedChapterId = "";
            state.selectedQuestionId = "";
            markSaved();
            renderAll();
        } catch (error) {
            showMessage(`读取题库失败：${error.message || error}`, "error");
        }
    }

    function bindActions() {
        el["reload-btn"].addEventListener("click", () => loadData(true));
        el["save-btn"].addEventListener("click", () => saveAll());
        el["open-game-btn"].addEventListener("click", async () => {
            if (state.dirty && !confirm("当前有未保存修改。游戏测试只能读取已发布内容。仍然打开吗？")) return;
            await window.chemEditor.openGame();
        });
        el["add-chapter-btn"].addEventListener("click", openAddChapterDialog);
        el["cancel-chapter-dialog"].addEventListener("click", () => el["chapter-dialog"].close());
        el["chapter-dialog-form"].addEventListener("submit", createChapterFromDialog);
        el["add-question-btn"].addEventListener("click", openAddQuestionDialog);
        el["cancel-question-dialog"].addEventListener("click", () => el["question-dialog"].close());
        el["question-dialog-form"].addEventListener("submit", createQuestionFromDialog);
        el["chapter-up-btn"].addEventListener("click", () => moveSelectedChapter(-1));
        el["chapter-down-btn"].addEventListener("click", () => moveSelectedChapter(1));
        el["delete-chapter-btn"].addEventListener("click", deleteChapter);
        el["question-up-btn"].addEventListener("click", () => moveSelectedQuestion(-1));
        el["question-down-btn"].addEventListener("click", () => moveSelectedQuestion(1));
        el["duplicate-question-btn"].addEventListener("click", duplicateQuestion);
        el["delete-question-btn"].addEventListener("click", deleteQuestion);
        el["add-option-btn"].addEventListener("click", addOption);
        el["choose-question-image-btn"].addEventListener("click", chooseQuestionImage);
        el["clear-question-image-btn"].addEventListener("click", clearQuestionImage);
        bindChapterFields();
        bindQuestionFields();

        if (window.chemEditor?.onSaveBeforeClose) {
            window.chemEditor.onSaveBeforeClose(async () => {
                const success = await saveAll({ quiet: true });
                await window.chemEditor.closeAfterSave(success);
            });
        }
    }

    document.addEventListener("DOMContentLoaded", async () => {
        cacheElements();
        if (!window.chemEditor) {
            alert("编辑器需要从 ChemGameEditor.exe 启动，不能直接双击 editor.html。");
            return;
        }
        bindActions();
        await loadData(false);
    });
})();
