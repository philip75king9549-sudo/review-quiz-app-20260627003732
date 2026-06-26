const CHINESE_NUMBER = "一二三四五六七八九十百零〇";
const ANSWER_TOKEN =
  "(?:[A-Fa-f]{1,6}|正确|错误|对|错|是|否|√|×|对的|错的|true|false|T|F|V|X)";

const chapterPatterns = [
  new RegExp(`^\\s*(第[0-9${CHINESE_NUMBER}]+(?:章|节|单元|篇|部分))\\s*[：:、.．-]?\\s*(.*)$`, "i"),
  /^\s*(模块|专题|章节|单元)\s*[0-9一二三四五六七八九十]+\s*[：:、.．-]?\s*(.*)$/i,
  /^\s*chapter\s+\d+\s*[：:.\-]?\s*(.*)$/i,
  /^\s*#{1,3}\s+(.+)$/,
  /^\s*(导论|绪论)\s*$/i,
];

const sectionHeadingPattern =
  /^\s*(?:[一二三四五六七八九十]+[、.．:：]\s*)?(单选题?|单项选择题?|选择题?|多选题?|多项选择题?|判断题?|填空题?|材料分析题?|论述题?|简答题?|名词解释题?|主观题?|问答题?|辨析题?)\s*(?:[：:].*|[（(].*[）)]\s*)?$/i;
const questionPattern =
  /^\s*(?:题目\s*[：:]?\s*)?(?:第\s*)?(\d{1,4}|[一二三四五六七八九十]{1,6})\s*(?:题)?[.、．:：\)）]\s*(.*)$/;
const bracketQuestionPattern =
  /^\s*(?:题目\s*[：:]?\s*)?[（(]\s*(\d{1,4}|[一二三四五六七八九十]{1,6})\s*[)）]\s*(.*)$/;
const optionPattern = /^\s*([A-Fa-f])\s*[.、．:：\)）]\s*(.+)$/;
const answerAnyLinePattern =
  /^\s*(?:正确答案|参考答案|标准答案|答案|参考要点|答题要点)\s*[：:；;]?\s*(.*)$/i;
const explanationPattern = /^\s*(?:解析|答案解析|说明)\s*[：:]\s*(.*)$/i;

function normalizeText(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function cleanLine(line) {
  return line.replace(/^[•·▪▫◦]\s*/, "").trim();
}

function isLikelyMaterialLine(line) {
  const trimmed = cleanLine(line);
  if (!trimmed) return false;
  if (chapterTitle(trimmed) || sectionType(trimmed) || matchQuestion(trimmed)) return false;
  if (optionPattern.test(trimmed) || answerAnyLinePattern.test(trimmed) || explanationPattern.test(trimmed)) {
    return false;
  }
  return trimmed.length >= 8;
}

function matchQuestion(line) {
  return line.match(questionPattern) || line.match(bracketQuestionPattern);
}

function splitCombinedQuestionLine(line) {
  const marker = /(\d{1,4})\s*[.、．:：\)）]\s*/g;
  const matches = [...line.matchAll(marker)];
  if (matches.length < 2) return [line];

  const parts = [];
  let start = 0;
  let previousNumber = Number(matches[0][1]);

  for (let index = 1; index < matches.length; index += 1) {
    const match = matches[index];
    const currentNumber = Number(match[1]);
    const candidate = line.slice(start, match.index).trim();
    const optionCount = splitInlineOptions(candidate).options.length;
    const embeddedAnswer = extractEmbeddedAnswer(candidate).answer;
    const looksComplete =
      optionCount >= 2 || embeddedAnswer === "T" || embeddedAnswer === "F";

    if (currentNumber === previousNumber + 1 && looksComplete) {
      parts.push(candidate);
      start = match.index;
      previousNumber = currentNumber;
    }
  }

  if (start === 0) return [line];
  parts.push(line.slice(start).trim());
  return parts.filter(Boolean);
}

function sectionType(line) {
  const match = line.match(sectionHeadingPattern);
  if (!match) return "";
  if (/判断/.test(match[1])) return "judge";
  if (/填空/.test(match[1])) return "fill";
  if (/材料分析|论述|简答|名词解释|主观|问答|辨析/.test(match[1])) return "essay";
  if (/多/.test(match[1])) return "multiple";
  return "single";
}

function normalizeAnswer(answer = "") {
  const compact = String(answer)
    .trim()
    .replace(/[（(【\[\]】)）]/g, "")
    .replace(/[、,，;；。.．\s]/g, "")
    .toUpperCase();

  if (["正确", "对", "是", "√", "对的", "TRUE", "T", "V"].includes(compact)) return "T";
  if (["错误", "错", "否", "×", "错的", "FALSE", "F", "X"].includes(compact)) return "F";
  if (/^[A-F]+$/.test(compact)) {
    return [...new Set(compact.split(""))].sort().join("");
  }
  return compact;
}

function displayAnswer(answer) {
  if (answer === "T") return "正确";
  if (answer === "F") return "错误";
  return answer;
}

function isReviewOnlyQuestion(question) {
  return question.type === "essay" || question.type === "note";
}

function normalizeTextAnswer(answer = "") {
  return String(answer)
    .trim()
    .replace(/\s+/g, "")
    .replace(/[，,。．.；;：:“”"‘’'、（）()【】\[\]{}]/g, "")
    .toLowerCase();
}

function extractTrailingAnswer(text) {
  const regex = new RegExp(
    `(?:\\s*[（(【\\[]\\s*(?:答案\\s*[：:]?\\s*)?(${ANSWER_TOKEN})\\s*[\\]】)）]\\s*)$`,
    "i",
  );
  const match = text.match(regex);
  if (!match) return { text: text.trim(), answer: "" };

  return {
    text: text.slice(0, match.index).trim(),
    answer: normalizeAnswer(match[1]),
  };
}

function extractInlineAnswer(text) {
  const regex = new RegExp(
    `\\s*(?:正确答案|参考答案|标准答案|答案)\\s*[：:；;]\\s*(${ANSWER_TOKEN})\\s*$`,
    "i",
  );
  const match = text.match(regex);
  if (!match) return extractEmbeddedAnswer(text);

  return {
    text: text.slice(0, match.index).trim(),
    answer: normalizeAnswer(match[1]),
  };
}

function extractInlineAnyAnswer(text) {
  const match = text.match(
    /\s*(?:正确答案|参考答案|标准答案|答案|参考要点|答题要点)\s*[：:；;]\s*(.+)$/i,
  );
  if (!match) return extractInlineAnswer(text);

  return {
    text: text.slice(0, match.index).trim(),
    answer: match[1].trim(),
  };
}

function extractInlineFillAnswer(text) {
  const explicit = extractInlineAnyAnswer(text);
  if (explicit.answer) return explicit;

  const normalized = String(text || "").trim();
  const blankText = normalized.replace(/_{2,}|＿{2,}/g, "____");
  if (blankText !== normalized) return { text: blankText, answer: "" };

  const middleAnswer = normalized.match(/^(.+?)\s{2,}(.{1,40}?)(?:\s{2,}|\s+(?=[，,。．.、的为是]))(.+)$/);
  if (middleAnswer) {
    const [, before, answer, after] = middleAnswer;
    const cleanedAnswer = answer.trim();
    if (cleanedAnswer.length >= 1 && cleanedAnswer.length <= 40) {
      return {
        text: `${before.trim()}____${after.trim()}`.replace(/\s+/g, " "),
        answer: cleanedAnswer,
      };
    }
  }

  const leadingAnswer = normalized.match(/^([《“"‘'（(【]?[^\s，,。．.、；;：:]{1,30}[》”"’'）)】]?)\s{2,}(.+)$/);
  if (leadingAnswer) {
    const [, answer, after] = leadingAnswer;
    return {
      text: `____${after.trim()}`.replace(/\s+/g, " "),
      answer: answer.trim(),
    };
  }

  return explicit;
}

function extractEmbeddedAnswer(text) {
  const bracketRegex = new RegExp(
    `([（(【\\[])\\s*(${ANSWER_TOKEN})\\s*[。.．]?\\s*([\\]】)）])`,
    "i",
  );
  const bracketMatch = text.match(bracketRegex);
  if (bracketMatch) {
    const replacement = `${bracketMatch[1]} ${bracketMatch[3]}`;
    return {
      text: `${text.slice(0, bracketMatch.index)}${replacement}${text.slice(
        bracketMatch.index + bracketMatch[0].length,
      )}`.trim(),
      answer: normalizeAnswer(bracketMatch[2]),
    };
  }

  const colonRegex = new RegExp(`[：:]\\s*([A-Fa-f]{1,6})[.。]?\\s*$`, "i");
  const colonMatch = text.match(colonRegex);
  if (colonMatch) {
    return {
      text: `${text.slice(0, colonMatch.index)}：____`.trim(),
      answer: normalizeAnswer(colonMatch[1]),
    };
  }

  return extractTrailingAnswer(text);
}

function splitInlineOptions(text) {
  const marker = /([A-Fa-f])\s*[.、．:：\)）]\s*/g;
  const matches = [...text.matchAll(marker)];
  if (matches.length < 2) return { stem: text.trim(), options: [] };

  const stem = text.slice(0, matches[0].index).trim();
  const options = matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    return {
      key: match[1].toUpperCase(),
      text: text.slice(start, end).trim(),
    };
  });

  return { stem, options };
}

function chapterTitle(line) {
  const trimmed = line.trim();
  for (const pattern of chapterPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      return [match[1], match[2]].filter(Boolean).join(" ").trim();
    }
  }
  return "";
}

function isLikelyJudge(stem, answer, options) {
  if (answer === "T" || answer === "F") return true;
  if (options.length === 0 && /[（(]\s*[）)]/.test(stem)) return true;
  return /判断题|正确还是错误|对错/.test(stem);
}

function shouldStartQuestionWhileReadingAnswer(line, current) {
  const match = matchQuestion(line);
  if (!match) return false;
  if (current.declaredType !== "essay") return true;
  if (/^\s*[（(]\s*\d{1,3}\s*[)）]/.test(line)) return false;

  const currentNumber = Number(current.number);
  const nextNumber = Number(match[1]);
  const stem = match[2] || "";
  if (!Number.isFinite(currentNumber) || !Number.isFinite(nextNumber)) {
    return Number.isFinite(nextNumber) &&
      (current.answerParts || []).length > 0 &&
      !current.answerStartedByMarker;
  }
  if (nextNumber !== currentNumber + 1) return false;

  if ((current.answerParts || []).length > 0 && !current.answerStartedByMarker) return true;

  return /[？?]|简述|论述|分析|说明|谈谈|为什么|如何|怎样|依据|结合|材料|回答|阐述|概括|评价|意义|原因|措施|关系|认识|理解/.test(
    stem,
  );
}

function shouldStartSyntheticEssayQuestion(line, current) {
  if (!current || current.declaredType !== "essay") return false;
  if ((current.answerParts || []).length === 0) return false;
  const trimmed = cleanLine(line);
  if (!trimmed || matchQuestion(trimmed) || sectionType(trimmed) || chapterTitle(trimmed)) return false;
  if (answerAnyLinePattern.test(trimmed) || explanationPattern.test(trimmed)) return false;
  if (/^(?:材料|问题|设问|要求|参考|答案|解析|说明)\s*[：:]/.test(trimmed)) return false;
  if (/^摘自/.test(trimmed)) return false;
  if (/^材料[一二三四五六七八九十0-9、，,]/.test(trimmed)) return false;
  if (/^[一二三四五六七八九十]+[、.．]/.test(trimmed)) return false;
  if (/[：:]/.test(trimmed)) return false;
  if (/[。！？!?；;：:]$/.test(trimmed)) return false;
  return trimmed.length <= 36;
}

function isMaterialBlockBoundary(line) {
  const trimmed = cleanLine(line);
  if (!trimmed) return false;
  if (/^(?:[一二三四五六七八九十]+[、.．]|[（(]?[0-9一二三四五六七八九十]+[)）])/.test(trimmed)) return true;
  if (/^(?:资料|阅读|知识点|考点|重点|补充|附录|背景|案例|材料)\s*[：:]/.test(trimmed)) return true;
  if (trimmed.length <= 28 && /[：:]$/.test(trimmed)) return true;
  return false;
}

function collectAnswerKeys(lines) {
  const byNumber = new Map();
  let inAnswerSection = false;

  lines.forEach((rawLine) => {
    const line = cleanLine(rawLine);
    if (/^(?:参考答案|标准答案|答案汇总|答案)\s*[：:]?\s*$/i.test(line)) {
      inAnswerSection = true;
      return;
    }

    if (inAnswerSection && (chapterTitle(line) || /^(?:解析|说明)/.test(line))) {
      inAnswerSection = false;
    }

    const shouldScan =
      inAnswerSection ||
      /^(?:参考答案|标准答案|答案)\s*[：:]/i.test(line) ||
      /(?:^|\s)\d{1,4}\s*[.、:：]\s*(?:[A-F]|正确|错误|对|错|√|×)/i.test(line);

    if (!shouldScan) return;

    const keyPattern = new RegExp(
      `(\\d{1,4})\\s*[.、:：\\-]?\\s*(${ANSWER_TOKEN})(?=\\s|$|[，,；;。])`,
      "gi",
    );
    for (const match of line.matchAll(keyPattern)) {
      byNumber.set(String(Number(match[1])), normalizeAnswer(match[2]));
    }
  });

  return byNumber;
}

function removeTypePrefix(stem) {
  return stem
    .replace(/^\s*[（(【\[]\s*(?:单选题|多选题|选择题|判断题|填空题|材料分析题?|论述题?|简答题?|名词解释题?|主观题?|问答题?|辨析题?)\s*[】\]）)]\s*/i, "")
    .replace(/^\s*(?:单选题|多选题|选择题|判断题|填空题|材料分析题?|论述题?|简答题?|名词解释题?|主观题?|问答题?|辨析题?)\s*[：:]\s*/i, "")
    .trim();
}

function finalizeQuestion(question, fallbackAnswers, order) {
  if (!question) return null;

  let stem = removeTypePrefix(question.stemParts.join(" ").replace(/\s+/g, " ").trim());
  const rawAnswer =
    (question.answerParts || []).join("\n").trim() ||
    question.answer ||
    fallbackAnswers.get(String(Number(question.number))) ||
    "";
  const options = question.options.filter((option) => option.text);
  const normalizedAnswer = normalizeAnswer(rawAnswer);
  const judge =
    question.declaredType === "judge" ||
    (!["single", "multiple", "fill", "essay"].includes(question.declaredType) &&
      isLikelyJudge(stem, normalizedAnswer, options));
  const type =
    question.declaredType === "fill"
      ? "fill"
      : question.declaredType === "essay"
        ? "essay"
        : judge
          ? "judge"
          : "choice";
  let answer = type === "fill" || type === "essay" ? rawAnswer.trim() : normalizedAnswer;

  if (type === "essay" && !answer && stem) {
    const looksLikeMaterialOnly =
      stem.length > 80 ||
      /^(?:材料|阅读材料|根据以下材料|根据下列材料|复习资料|资料原文)/.test(stem);
    if (looksLikeMaterialOnly) {
      answer = stem;
      stem = "资料原文";
    }
  }

  if (!stem || (!["essay", "note"].includes(type) && !answer) || (type === "choice" && options.length < 2)) return null;
  if (type === "choice" && !/^[A-F]+$/.test(answer)) return null;

  return {
    id: `${question.chapterId}-${question.number}-${order}`,
    number: question.number,
    chapterId: question.chapterId,
    chapterTitle: question.chapterTitle,
    type,
    multiple:
      type === "choice" &&
      (question.declaredType === "multiple" || answer.length > 1),
    stem,
    options:
      type === "judge"
        ? [
            { key: "T", text: "正确" },
            { key: "F", text: "错误" },
          ]
        : type === "choice"
          ? options
          : [],
    answer,
    answerLabel: displayAnswer(answer),
    explanation: question.explanationParts.join(" ").trim(),
    sourceLine: question.sourceLine,
  };
}

export function parseReviewMaterial(sourceText, filename = "复习资料") {
  const text = normalizeText(sourceText);
  if (!text) {
    throw new Error("文件里没有可识别的文字内容。");
  }

  const lines = text.split("\n").flatMap(splitCombinedQuestionLine);
  const fallbackAnswers = collectAnswerKeys(lines);
  const questions = [];
  const chapters = [];
  let chapterCounter = 0;
  let currentChapter = {
    id: "chapter-0",
    title: "未分章资料",
  };
  let current = null;
  let parsingExplanation = false;
  let parsingAnswer = false;
  let currentSectionType = "";
  let syntheticQuestionNumber = 0;
  let skippedQuestionCount = 0;
  const noteBlocks = [];
  let pendingNoteLines = [];

  const ensureChapter = (chapter) => {
    if (!chapters.some((item) => item.id === chapter.id)) {
      chapters.push({ ...chapter, questionIds: [] });
    }
  };

  const flush = () => {
    const completed = finalizeQuestion(current, fallbackAnswers, questions.length);
    if (completed) {
      ensureChapter(currentChapter);
      questions.push(completed);
      chapters.find((item) => item.id === completed.chapterId).questionIds.push(completed.id);
    } else if (current) {
      skippedQuestionCount += 1;
    }
    current = null;
    parsingExplanation = false;
    parsingAnswer = false;
  };

  const flushNoteBlock = () => {
    const noteText = pendingNoteLines.join("\n").trim();
    if (noteText.length >= 20) noteBlocks.push(noteText);
    pendingNoteLines = [];
  };

  const addNoteLine = (line) => {
    if (pendingNoteLines.length > 0 && isMaterialBlockBoundary(line)) {
      flushNoteBlock();
    }
    pendingNoteLines.push(line);
  };

  const startSyntheticQuestion = (type, stem, lineIndex, answer = "") => {
    flush();
    syntheticQuestionNumber += 1;
    current = {
      number: `${type === "judge" ? "J" : type === "fill" ? "F" : "S"}${syntheticQuestionNumber}`,
      chapterId: currentChapter.id,
      chapterTitle: currentChapter.title,
      stemParts: [stem],
      options: [],
      answer,
      answerParts: [],
      explanationParts: [],
      sourceLine: lineIndex + 1,
      declaredType: type,
      answerStartedByMarker: false,
    };
  };

  lines.forEach((rawLine, lineIndex) => {
    const line = cleanLine(rawLine);
    if (!line) return;

    const detectedChapter = chapterTitle(line);
    if (detectedChapter) {
      flush();
      flushNoteBlock();
      chapterCounter += 1;
      currentChapter = {
        id: `chapter-${chapterCounter}`,
        title: detectedChapter,
      };
      currentSectionType = "";
      syntheticQuestionNumber = 0;
      return;
    }

    const detectedSectionType = sectionType(line);
    if (detectedSectionType) {
      flush();
      flushNoteBlock();
      currentSectionType = detectedSectionType;
      syntheticQuestionNumber = 0;
      return;
    }

    if (parsingAnswer && shouldStartSyntheticEssayQuestion(line, current)) {
      startSyntheticQuestion("essay", line, lineIndex);
      return;
    }

    if (parsingAnswer && current && !shouldStartQuestionWhileReadingAnswer(line, current)) {
      current.answerParts.push(line);
      return;
    }

    if (current?.declaredType === "essay" && /^[一二三四五六七八九十]+[、.．]/.test(line)) {
      current.answerParts.push(line);
      parsingAnswer = true;
      return;
    }

    if (current?.declaredType === "essay" && /^\s*[（(]\s*\d{1,3}\s*[)）]/.test(line)) {
      current.answerParts.push(line);
      parsingAnswer = true;
      return;
    }

    const questionMatch = matchQuestion(line);
    if (questionMatch) {
      flush();
      flushNoteBlock();
      const extracted = currentSectionType === "fill"
        ? extractInlineFillAnswer(questionMatch[2])
        : currentSectionType === "essay"
          ? extractInlineAnyAnswer(questionMatch[2])
          : extractInlineAnswer(questionMatch[2]);
      const inline = splitInlineOptions(extracted.text);
      current = {
        number: questionMatch[1],
        chapterId: currentChapter.id,
        chapterTitle: currentChapter.title,
        stemParts: [inline.stem],
        options: inline.options,
        answer: extracted.answer,
        answerParts: [],
        explanationParts: [],
        sourceLine: lineIndex + 1,
        declaredType: currentSectionType,
        answerStartedByMarker: false,
      };
      return;
    }

    if (currentSectionType === "judge") {
      const extractedJudge = extractEmbeddedAnswer(line);
      if (extractedJudge.answer === "T" || extractedJudge.answer === "F") {
        flush();
        syntheticQuestionNumber += 1;
        current = {
          number: `J${syntheticQuestionNumber}`,
          chapterId: currentChapter.id,
          chapterTitle: currentChapter.title,
          stemParts: [extractedJudge.text],
          options: [],
          answer: extractedJudge.answer,
          answerParts: [],
          explanationParts: [],
          sourceLine: lineIndex + 1,
          declaredType: "judge",
        };
        flush();
        return;
      }
    }

    const answerMatch = line.match(answerAnyLinePattern);
    if (answerMatch) {
      if (current) {
        const answerText = answerMatch[1].trim();
        const freeTextAnswer = ["fill", "essay"].includes(current.declaredType);
        const tokenMatch = answerText.match(new RegExp(`^(${ANSWER_TOKEN})`, "i"));
        current.answer = freeTextAnswer
          ? answerText
          : normalizeAnswer(tokenMatch?.[1] || answerText);
        current.answerParts = freeTextAnswer && answerText ? [answerText] : [];
        parsingAnswer = freeTextAnswer;
        parsingExplanation = false;
        current.answerStartedByMarker = freeTextAnswer;
      }
      return;
    }

    if (currentSectionType === "fill") {
      const extractedFill = extractInlineFillAnswer(line);
      if (extractedFill.answer && (!current || current.answer)) {
        startSyntheticQuestion("fill", extractedFill.text, lineIndex, extractedFill.answer);
        return;
      }
    }

    if (currentSectionType === "judge" && (!current || current.answer)) {
      startSyntheticQuestion("judge", line, lineIndex);
      return;
    }

    if (!current) {
      if (isLikelyMaterialLine(line)) addNoteLine(line);
      return;
    }

    const explanationMatch = line.match(explanationPattern);
    if (explanationMatch) {
      parsingExplanation = true;
      parsingAnswer = false;
      if (explanationMatch[1]) current.explanationParts.push(explanationMatch[1]);
      return;
    }

    const optionMatch = line.match(optionPattern);
    if (optionMatch && !parsingExplanation) {
      const inline = splitInlineOptions(line);
      if (inline.options.length >= 2) {
        current.options.push(...inline.options);
      } else {
        current.options.push({
          key: optionMatch[1].toUpperCase(),
          text: optionMatch[2].trim(),
        });
      }
      return;
    }

    if (["single", "multiple"].includes(currentSectionType) && !parsingExplanation) {
      const inline = splitInlineOptions(line);
      if (inline.options.length >= 2) {
        if (inline.options[0].key === "B" && inline.stem) {
          current.options.push({ key: "A", text: inline.stem });
        } else if (inline.stem) {
          current.stemParts.push(inline.stem);
        }
        current.options.push(...inline.options);
        return;
      }
    }

    if (parsingExplanation) {
      current.explanationParts.push(line);
      return;
    }

    if (current.declaredType === "essay") {
      if (/^(?:材料|问题|设问|要求|阅读材料|结合材料)\s*[：:]/.test(line)) {
        current.stemParts.push(line);
        return;
      }

      current.answerParts.push(line);
      parsingAnswer = true;
      return;
    }

    if (current.answer && isLikelyMaterialLine(line)) {
      flush();
      addNoteLine(line);
      return;
    }

    const extracted = currentSectionType === "fill"
      ? extractInlineFillAnswer(line)
      : currentSectionType === "essay"
        ? extractInlineAnyAnswer(line)
      : extractInlineAnswer(line);
    current.stemParts.push(extracted.text);
    if (extracted.answer) current.answer = extracted.answer;
  });

  flush();
  flushNoteBlock();

  if (noteBlocks.length > 0) {
    const noteChapter = {
      id: "chapter-notes",
      title: "资料阅读",
      questionIds: [],
    };

    noteBlocks.forEach((noteText, index) => {
      const firstLine = noteText.split("\n").find(Boolean) || "";
      const noteQuestion = {
        id: `chapter-notes-note-${index}`,
        number: `N${index + 1}`,
        chapterId: noteChapter.id,
        chapterTitle: noteChapter.title,
        type: "note",
        multiple: false,
        stem: firstLine.length <= 36 ? firstLine : `复习资料原文 ${index + 1}`,
        options: [],
        answer: noteText,
        answerLabel: "资料阅读",
        explanation: "",
        sourceLine: 1,
      };
      noteChapter.questionIds.push(noteQuestion.id);
      questions.push(noteQuestion);
    });
    chapters.push(noteChapter);
  }

  if (questions.length === 0) {
    throw new Error(
      "没有识别到完整题目。请确认题目带有序号、选择题带有 A/B/C/D 选项，并保留“答案：A”这类答案标记。",
    );
  }

  let activeChapters = chapters.filter((chapter) => chapter.questionIds.length > 0);

  const nonNoteChapters = activeChapters.filter((chapter) => chapter.id !== "chapter-notes");
  const chaptersWithEssay = nonNoteChapters.filter((chapter) =>
    chapter.questionIds.some((id) => {
      const question = questions.find((item) => item.id === id);
      return question?.type === "essay";
    }),
  );
  if (
    chaptersWithEssay.length === 1 &&
    chaptersWithEssay[0].id === nonNoteChapters[nonNoteChapters.length - 1]?.id
  ) {
    const lastChapter = chaptersWithEssay[0];
    const essayIds = new Set(
      lastChapter.questionIds.filter((id) => questions.find((item) => item.id === id)?.type === "essay"),
    );
    if (essayIds.size > 0 && activeChapters.length > 1) {
      const globalChapter = {
        id: "chapter-subjective",
        title: "主观资料",
        questionIds: [...essayIds],
      };
      lastChapter.questionIds = lastChapter.questionIds.filter((id) => !essayIds.has(id));
      questions.forEach((question) => {
        if (essayIds.has(question.id)) {
          question.chapterId = globalChapter.id;
          question.chapterTitle = globalChapter.title;
        }
      });
      activeChapters = activeChapters
        .filter((chapter) => chapter.questionIds.length > 0)
        .concat(globalChapter);
    }
  }

  activeChapters.forEach((chapter) => {
    const chapterQuestions = questions.filter((question) => question.chapterId === chapter.id);
    chapter.choiceCount = chapterQuestions.filter((question) => question.type === "choice").length;
    chapter.judgeCount = chapterQuestions.filter((question) => question.type === "judge").length;
    chapter.fillCount = chapterQuestions.filter((question) => question.type === "fill").length;
    chapter.essayCount = chapterQuestions.filter((question) => question.type === "essay").length;
    chapter.noteCount = chapterQuestions.filter((question) => question.type === "note").length;
  });

  return {
    id: `material-${Date.now()}`,
    filename,
    importedAt: new Date().toISOString(),
    sourceLength: text.length,
    sourceText: text,
    questions,
    chapters: activeChapters,
    stats: {
      chapterCount: activeChapters.length,
      questionCount: questions.length,
      choiceCount: questions.filter((item) => item.type === "choice").length,
      judgeCount: questions.filter((item) => item.type === "judge").length,
      fillCount: questions.filter((item) => item.type === "fill").length,
      essayCount: questions.filter((item) => item.type === "essay").length,
      noteCount: questions.filter((item) => item.type === "note").length,
      skippedEstimate: Math.max(
        0,
        skippedQuestionCount,
      ),
    },
  };
}

export function createAnswerFreeCopy(material) {
  return material.chapters
    .map((chapter) => {
      const chapterQuestions = material.questions.filter(
        (question) => question.chapterId === chapter.id,
      );
      const body = chapterQuestions
        .map((question, index) => {
          if (question.type === "note") return `${index + 1}. ${question.stem}\n${question.answer}`;
          if (question.type === "essay") return `${index + 1}. ${question.stem}\n（主观题参考答案已隐藏）`;
          if (question.type === "fill") return `${index + 1}. ${question.stem}\n答：__________`;
          const options = question.options
            .map((option) =>
              question.type === "judge"
                ? ""
                : `${option.key}. ${option.text}`,
            )
            .filter(Boolean)
            .join("\n");
          return `${index + 1}. ${question.stem}${options ? `\n${options}` : "\n（正确 / 错误）"}`;
        })
        .join("\n\n");
      return `${chapter.title}\n\n${body}`;
    })
    .join("\n\n====================\n\n");
}

export function gradeChapter(questions, answers) {
  const details = questions.map((question) => {
    if (isReviewOnlyQuestion(question)) {
      return {
        id: question.id,
        selected: question.type === "note" ? "已阅读" : "已查看",
        correct: true,
        unscored: true,
      };
    }

    const selected =
      question.type === "fill"
        ? String(answers[question.id] || "").trim()
        : normalizeAnswer(answers[question.id] || "");
    const correct =
      question.type === "fill"
        ? normalizeTextAnswer(selected) === normalizeTextAnswer(question.answer)
        : selected === question.answer;

    return {
      id: question.id,
      selected,
      correct,
    };
  });
  const scoredDetails = details.filter((item) => !item.unscored);
  const correct = scoredDetails.filter((item) => item.correct).length;
  const total = scoredDetails.length;

  return {
    total,
    reviewTotal: questions.length,
    correct,
    wrong: total - correct,
    score: total ? Math.round((correct / total) * 100) : 100,
    details,
  };
}
