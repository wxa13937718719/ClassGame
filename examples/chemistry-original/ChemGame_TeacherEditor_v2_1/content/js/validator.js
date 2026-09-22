(function () {
    "use strict";

    function validateChapter(chapter) {
        const errors = [];
        const warnings = [];

        if (!chapter || typeof chapter !== "object") {
            return { valid: false, errors: ["章节数据不存在。"], warnings };
        }
        if (!chapter.id) errors.push("章节缺少 id。 ");
        if (!chapter.title) errors.push(`章节 ${chapter.id || "未知"} 缺少标题。`);
        if (!Array.isArray(chapter.questions)) errors.push(`章节 ${chapter.id || "未知"} 的 questions 不是数组。`);

        const questionIds = new Set();
        (chapter.questions || []).forEach((question, index) => {
            const position = `第 ${index + 1} 题`;
            if (!question.id) errors.push(`${position} 缺少题目 id。`);
            if (questionIds.has(question.id)) errors.push(`${position} 的 id 重复：${question.id}`);
            questionIds.add(question.id);

            if (!question.text) errors.push(`${position} 缺少题干。`);
            const type = ["single", "multiple", "fill"].includes(question.type) ? question.type : "single";
            if (!["single", "multiple", "fill"].includes(question.type)) errors.push(`${position} 的题型不受支持。`);

            if (type === "fill") {
                const answers = Array.isArray(question.answers)
                    ? question.answers.map(value => String(value).trim()).filter(Boolean)
                    : [];
                if (!answers.length) errors.push(`${position} 没有填写正确答案。`);
            } else {
                if (!Array.isArray(question.options) || question.options.length < 2) {
                    errors.push(`${position} 至少需要两个选项。`);
                    return;
                }

                const optionIds = new Set();
                question.options.forEach(option => {
                    if (!option.id) errors.push(`${position} 存在没有 id 的选项。`);
                    if (optionIds.has(option.id)) errors.push(`${position} 的选项 id 重复：${option.id}`);
                    optionIds.add(option.id);
                    if (!option.content && !option.image) errors.push(`${position} 存在没有文字和图片的空选项。`);
                });

                if (type === "single") {
                    if (!optionIds.has(question.answerId)) {
                        errors.push(`${position} 的正确答案 ${question.answerId || "未设置"} 不在选项中。`);
                    }
                } else {
                    const answerIds = Array.isArray(question.answerIds) ? question.answerIds : [];
                    if (!answerIds.length || answerIds.some(id => !optionIds.has(id))) {
                        errors.push(`${position} 没有设置有效的多选答案。`);
                    }
                }
            }

            if (!question.explanation) warnings.push(`${position} 没有解析。`);
        });

        return { valid: errors.length === 0, errors, warnings };
    }

    function reportChapter(chapter) {
        const result = validateChapter(chapter);
        if (result.errors.length) console.error(`题库 ${chapter?.id || "未知"} 校验失败：`, result.errors);
        if (result.warnings.length) console.warn(`题库 ${chapter?.id || "未知"} 提示：`, result.warnings);
        return result;
    }

    window.ChemValidator = {
        validateChapter,
        reportChapter
    };
})();
