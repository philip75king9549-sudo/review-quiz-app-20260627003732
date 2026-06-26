import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import {
  BookCheck,
  BookOpen,
  Check,
  ChevronDown,
  CircleAlert,
  Download,
  FileCheck2,
  FileText,
  FolderOpen,
  Laptop,
  Layers3,
  Menu,
  PencilLine,
  RefreshCcw,
  RotateCcw,
  Smartphone,
  Sparkles,
  Tablet,
  UploadCloud,
  Share2,
  X,
  XCircle,
} from "lucide-react";
import { ACCEPTED_FILE_TYPES, extractTextFromFile } from "./lib/fileReader";
import {
  gradeChapter,
  parseReviewMaterial,
} from "./lib/questionParser";
import "./styles.css";

const STORAGE_KEY = "review-quiz-app-state-v5";
const LEGACY_STORAGE_KEYS = ["review-quiz-app-state-v4", "review-quiz-app-state-v3"];

const SAMPLE_MATERIAL = `第一章 计算机基础
1. 计算机中负责执行指令和运算的核心部件是（ ）
A. 显示器
B. 中央处理器
C. 键盘
D. 硬盘
答案：B
解析：中央处理器（CPU）负责解释和执行指令。

2. RAM 中的数据在断电后仍会永久保留。（错误）

3. 下列属于输入设备的是（ ）
A. 键盘
B. 鼠标
C. 显示器
D. 扫描仪
答案：ABD

第二章 计算机网络
1. HTTP 属于应用层协议。
答案：正确

2. 用于将域名转换成 IP 地址的系统是（ ）
A. DNS
B. FTP
C. SMTP
D. USB
答案：A

3. 互联网与万维网是完全相同的概念。（×）

第三章 信息安全
1. 使用不同且复杂的密码有助于降低账号被盗风险。
答案：对

2. 收到陌生链接时，最稳妥的做法是（ ）
A. 立即点击查看
B. 转发给朋友
C. 先核实来源与网址
D. 输入账号密码验证
答案：C`;

function createLibraryItem(material, overrides = {}) {
  const compactMaterial = {
    ...material,
    sourceText: "",
  };

  return {
    id: compactMaterial.id || `material-${Date.now()}`,
    material: compactMaterial,
    answers: {},
    results: {},
    questionResults: {},
    annotations: {},
    showOnlyAnswers: false,
    selectedChapterIds: compactMaterial.chapters?.[0]?.id ? [compactMaterial.chapters[0].id] : [],
    randomOrder: false,
    randomSeed: 1,
    practiceMode: "normal",
    activeChapterId: compactMaterial.chapters?.[0]?.id || "",
    wrongbookRemovedIds: [],
    wrongbookCorrectCounts: {},
    wrongbookMasteryTarget: 2,
    ...overrides,
  };
}

function normalizeMasteryTarget(value) {
  const numeric = Number(value || 2);
  if (numeric <= 1) return 1;
  if (numeric >= 3) return 3;
  return 2;
}

function normalizeStoredState(rawState = {}) {
  if (Array.isArray(rawState.library)) {
    const library = rawState.library
      .filter((item) => item?.material?.questions?.length)
      .map((item) => ({
        ...createLibraryItem(item.material),
        ...item,
        id: item.id || item.material.id,
        material: { ...item.material, sourceText: "" },
        annotations: item.annotations || {},
        showOnlyAnswers: Boolean(item.showOnlyAnswers),
        selectedChapterIds: item.selectedChapterIds?.length
          ? item.selectedChapterIds
          : [item.activeChapterId || item.material.chapters?.[0]?.id].filter(Boolean),
        randomOrder: Boolean(item.randomOrder),
        randomSeed: Number(item.randomSeed || 1),
        practiceMode: item.practiceMode || "normal",
        activeChapterId: item.activeChapterId || item.material.chapters?.[0]?.id || "",
        wrongbookRemovedIds: Array.isArray(item.wrongbookRemovedIds)
          ? item.wrongbookRemovedIds
          : [],
        wrongbookCorrectCounts: item.wrongbookCorrectCounts || {},
        wrongbookMasteryTarget: normalizeMasteryTarget(item.wrongbookMasteryTarget),
      }));
    return {
      library,
      currentMaterialId:
        rawState.currentMaterialId || library[0]?.id || "",
      gradingMode: rawState.gradingMode || "chapter",
      lastSavedAt: rawState.lastSavedAt || "",
    };
  }

  if (rawState.material?.questions?.length) {
    const item = createLibraryItem(rawState.material, {
      answers: rawState.answers || {},
      results: rawState.results || {},
      questionResults: rawState.questionResults || {},
      annotations: rawState.annotations || {},
      showOnlyAnswers: Boolean(rawState.showOnlyAnswers),
      selectedChapterIds: [rawState.activeChapterId || rawState.material.chapters?.[0]?.id].filter(Boolean),
      randomOrder: false,
      randomSeed: 1,
      practiceMode: "normal",
      activeChapterId: rawState.activeChapterId || rawState.material.chapters?.[0]?.id || "",
      wrongbookRemovedIds: [],
      wrongbookCorrectCounts: {},
      wrongbookMasteryTarget: 2,
    });
    return {
      library: [item],
      currentMaterialId: item.id,
      gradingMode: rawState.gradingMode || "chapter",
      lastSavedAt: "",
    };
  }

  return {
    library: [],
    currentMaterialId: "",
    gradingMode: "chapter",
    lastSavedAt: "",
  };
}

function readStoredState() {
  try {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    if (Object.keys(current).length > 0) return normalizeStoredState(current);

    for (const key of LEGACY_STORAGE_KEYS) {
      const legacy = JSON.parse(localStorage.getItem(key)) || {};
      if (Object.keys(legacy).length > 0) return normalizeStoredState(legacy);
    }
  } catch {
    // Ignore broken storage and start fresh.
  }

  return normalizeStoredState();
}

function formatFileName(name = "复习资料") {
  return name.replace(/\.[^.]+$/, "");
}

function resolveStateUpdate(update, currentValue) {
  return typeof update === "function" ? update(currentValue) : update;
}

function isReviewOnlyQuestion(question) {
  return question.type === "essay" || question.type === "note";
}

function isAnswerRequired(question) {
  return ["choice", "judge", "fill"].includes(question.type);
}

function hasAnswer(question, answers) {
  if (!isAnswerRequired(question)) return true;
  return Boolean(String(answers[question.id] || "").trim());
}

function isProgressQuestion(question) {
  return isAnswerRequired(question);
}

function hasProgressAnswer(question, answers) {
  if (isReviewOnlyQuestion(question)) return true;
  return hasAnswer(question, answers);
}

function questionTypeLabel(question) {
  if (question.type === "judge") return "判断题";
  if (question.type === "fill") return "填空题";
  if (question.type === "essay") return "资料";
  if (question.type === "note") return "资料";
  if (question.multiple) return "多选题";
  return "单选题";
}

function getLibraryProgress(item) {
  const material = item.material;
  const completedChapters = Object.keys(item.results || {}).filter((key) => {
    const chapter = material.chapters.find((candidate) => candidate.id === key);
    if (!chapter) return false;
    const chapterQuestions = material.questions.filter((question) => question.chapterId === chapter.id);
    return chapterQuestions.some((question) => isProgressQuestion(question));
  }).length;
  const progressChapters = material.chapters.filter((chapter) => {
    const chapterQuestions = material.questions.filter((question) => question.chapterId === chapter.id);
    return chapterQuestions.some((question) => isProgressQuestion(question));
  });
  const requiredQuestions = material.questions.filter((question) =>
    isProgressQuestion(question),
  );
  const answered = requiredQuestions.filter((question) =>
    hasProgressAnswer(question, item.answers || {}),
  ).length;
  return {
    completedChapters,
    chapterCount: progressChapters.length,
    answered,
    requiredTotal: requiredQuestions.length,
    percent: progressChapters.length
      ? Math.round((completedChapters / progressChapters.length) * 100)
      : 0,
  };
}

function seededShuffle(items, seed) {
  const shuffled = [...items];
  let value = Number(seed) || 1;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    value = (value * 1664525 + 1013904223) % 4294967296;
    const swapIndex = value % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function practiceResultKey(mode, chapterIds) {
  if (mode === "wrong") return "wrongbook";
  if (chapterIds.length === 1) return chapterIds[0];
  return `scope:${[...chapterIds].sort().join("|")}`;
}

function getWrongQuestions(
  material,
  results,
  questionResults,
  wrongbookRemovedIds = [],
  wrongbookCorrectCounts = {},
  wrongbookMasteryTarget = 2,
) {
  const wrongIds = new Set();
  const removedIds = new Set(wrongbookRemovedIds);
  const target = normalizeMasteryTarget(wrongbookMasteryTarget);
  Object.entries(results || {}).forEach(([key, result]) => {
    if (key === "wrongbook") return;
    result?.details?.forEach((detail) => {
      if (detail.correct === false) wrongIds.add(detail.id);
    });
  });
  Object.values(questionResults || {}).forEach((detail) => {
    if (detail?.correct === false) wrongIds.add(detail.id);
  });
  return material.questions.filter(
    (question) =>
      wrongIds.has(question.id) &&
      isAnswerRequired(question) &&
      !removedIds.has(question.id) &&
      Number(wrongbookCorrectCounts[question.id] || 0) < target,
  );
}

function useInstallApp() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [installed, setInstalled] = useState(
    () =>
      Capacitor.isNativePlatform() ||
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone === true,
  );
  const userAgent = window.navigator.userAgent || "";
  const platform = /iPad|iPhone|iPod/i.test(userAgent)
    ? "ios"
    : /Android/i.test(userAgent)
      ? "android"
      : "desktop";

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const handlePrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setGuideOpen(false);
    };
    const handleDisplayMode = (event) => {
      if (event.matches) setInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    displayMode.addEventListener?.("change", handleDisplayMode);

    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      displayMode.removeEventListener?.("change", handleDisplayMode);
    };
  }, []);

  const requestInstall = async () => {
    if (!deferredPrompt) {
      setGuideOpen(true);
      return;
    }

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (choice.outcome === "accepted") setInstalled(true);
  };

  return {
    guideOpen,
    installed,
    platform,
    requestInstall,
    closeGuide: () => setGuideOpen(false),
  };
}

function useOfflineReady() {
  const [offlineReady, setOfflineReady] = useState(
    () => Capacitor.isNativePlatform() || !("serviceWorker" in navigator),
  );

  useEffect(() => {
    if (Capacitor.isNativePlatform() || !("serviceWorker" in navigator)) {
      setOfflineReady(true);
      return undefined;
    }

    let active = true;
    navigator.serviceWorker.ready
      .then(() => {
        if (active) setOfflineReady(true);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  return offlineReady;
}

function OfflineBadge({ ready }) {
  return (
    <span className={`offline-badge ${ready ? "ready" : ""}`}>
      {ready ? <Check size={15} /> : <RefreshCcw className="spin" size={14} />}
      <span>{ready ? "离线准备完成" : "正在准备离线使用"}</span>
    </span>
  );
}

function InstallButton({ installed, onInstall, header = false }) {
  if (installed) return null;

  return (
    <button
      className={header ? "header-button install-app-button" : "install-app-button"}
      type="button"
      onClick={onInstall}
    >
      <Download size={header ? 17 : 16} />
      <span>安装应用</span>
    </button>
  );
}

function InstallGuide({ open, platform, offlineReady, onClose }) {
  if (!open) return null;

  const isIos = platform === "ios";
  return (
    <div className="install-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="install-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="install-dialog-close" type="button" onClick={onClose} aria-label="关闭">
          <X size={20} />
        </button>
        <span className="install-dialog-icon">
          {isIos ? <Share2 size={29} /> : <Download size={29} />}
        </span>
        <h2 id="install-dialog-title">
          {isIos ? "添加到 iPhone 或 iPad 主屏幕" : "安装复习搭子"}
        </h2>
        {isIos ? (
          <ol>
            <li>等待页面显示“离线准备完成”。</li>
            <li>在 Safari 中点击工具栏的“分享”按钮。</li>
            <li>向下滑动，选择“添加到主屏幕”，然后点击“添加”。</li>
          </ol>
        ) : (
          <ol>
            <li>请使用 Chrome 或 Edge 打开本页面。</li>
            <li>点击浏览器右上角菜单。</li>
            <li>选择“安装应用”或“添加到主屏幕”。</li>
          </ol>
        )}
        <div className={`install-ready-panel ${offlineReady ? "ready" : ""}`}>
          {offlineReady ? <Check size={18} /> : <RefreshCcw className="spin" size={17} />}
          <span>
            {offlineReady
              ? "应用文件已经缓存，可以添加到主屏幕并离线使用。"
              : "正在下载离线文件，请保持此页面打开。"}
          </span>
        </div>
        <button className="primary-button" type="button" onClick={onClose}>
          我知道了
        </button>
      </section>
    </div>
  );
}

function gradeSingleQuestion(question, selected) {
  return gradeChapter([question], { [question.id]: selected }).details[0];
}

function UploadScreen({
  onImport,
  busy,
  error,
  install,
  offlineReady,
  library = [],
  currentMaterialId = "",
  onSelectMaterial,
  onDeleteMaterial,
}) {
  const [dragging, setDragging] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pastedText, setPastedText] = useState("");

  const handleFileList = (files) => {
    const file = files?.[0];
    if (file) onImport({ file });
  };

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <a className="brand" href="#" aria-label="复习搭子首页">
          <span className="brand-mark">
            <BookCheck size={21} strokeWidth={2.3} />
          </span>
          <span>复习搭子</span>
        </a>
        <div className="landing-nav-actions">
          <OfflineBadge ready={offlineReady} />
          <InstallButton {...install} />
        </div>
      </header>

      <main className="landing-main">
        <section className="hero-copy">
          <div className="eyebrow">
            <Sparkles size={15} />
            把答案藏起来，把知识练出来
          </div>
          <h1>
            复习资料，一键变成
            <span>可反复练习的小测验</span>
          </h1>
          <p className="hero-description">
            自动识别章节、选择题和判断题，生成不带答案的练习副本。每章单独答题、自动批改，错了就再来一轮。
          </p>

          <div className="device-row" aria-label="多端适配">
            <span>
              <Smartphone size={17} /> 手机
            </span>
            <span>
              <Tablet size={17} /> 平板
            </span>
            <span>
              <Laptop size={18} /> 电脑
            </span>
          </div>
        </section>

        <section className="upload-panel">
          <div className="paper-tab" aria-hidden="true" />
          <div
            className={`dropzone ${dragging ? "is-dragging" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              event.preventDefault();
              if (event.currentTarget === event.target) setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              handleFileList(event.dataTransfer.files);
            }}
          >
            <span className="upload-icon">
              {busy ? <RefreshCcw className="spin" size={31} /> : <UploadCloud size={31} />}
            </span>
            <h2>{busy ? "正在识别题目…" : "上传带答案的复习资料"}</h2>
            <p>拖到这里，或从设备中选择文件</p>
            <label
              className={`primary-button large native-file-label ${busy ? "is-disabled" : ""}`}
            >
              <input
                className="native-file-input"
                type="file"
                accept={ACCEPTED_FILE_TYPES}
                disabled={busy}
                onChange={(event) => {
                  handleFileList(event.target.files);
                  event.target.value = "";
                }}
              />
              <FolderOpen size={18} />
              选择文件
            </label>
            <div className="file-types">
              <span>TXT</span>
              <span>MD</span>
              <span>DOCX</span>
              <span>PDF</span>
            </div>
          </div>

          {error && (
            <div className="inline-error" role="alert">
              <CircleAlert size={18} />
              <span>{error}</span>
            </div>
          )}

          <div className="upload-divider">
            <span>或者</span>
          </div>

          <div className="alternative-actions">
            <button className="text-action" type="button" onClick={() => setShowPaste(!showPaste)}>
              <PencilLine size={16} />
              直接粘贴文字
              <ChevronDown className={showPaste ? "rotate" : ""} size={16} />
            </button>
            <button
              className="text-action accent"
              type="button"
              disabled={busy}
              onClick={() => onImport({ text: SAMPLE_MATERIAL, filename: "示例复习资料.txt" })}
            >
              <Sparkles size={16} />
              试试示例资料
            </button>
          </div>

          {showPaste && (
            <div className="paste-box">
              <textarea
                value={pastedText}
                onChange={(event) => setPastedText(event.target.value)}
                placeholder={"例如：\n第一章 基础知识\n1. 题目内容\nA. 选项一\nB. 选项二\n答案：A"}
                autoFocus
              />
              <button
                className="primary-button"
                type="button"
                disabled={!pastedText.trim() || busy}
                onClick={() => onImport({ text: pastedText, filename: "粘贴的复习资料.txt" })}
              >
                开始识别
              </button>
            </div>
          )}
        </section>

        {library.length > 0 && (
          <section className="library-home-card" aria-label="已保存资料书库">
            <div className="library-home-heading">
              <div>
                <span className="sidebar-kicker">我的书库</span>
                <h2>已保存 {library.length} 份资料</h2>
              </div>
              <small>自动保存 · 可离线继续</small>
            </div>
            <div className="library-home-list">
              {library.map((item) => {
                const progress = getLibraryProgress(item);
                const active = item.id === currentMaterialId;
                return (
                  <article className={`library-card ${active ? "active" : ""}`} key={item.id}>
                    <button type="button" onClick={() => onSelectMaterial(item.id)}>
                      <span className="library-book-icon">
                        <BookOpen size={18} />
                      </span>
                      <span className="library-card-copy">
                        <strong>{formatFileName(item.material.filename)}</strong>
                        <small>
                          {item.material.stats.questionCount} 题 · {progress.completedChapters}/
                          {progress.chapterCount} 章完成 · {progress.answered}/{progress.requiredTotal} 已作答
                        </small>
                      </span>
                    </button>
                    <button
                      className="library-delete"
                      type="button"
                      onClick={() => onDeleteMaterial(item.id)}
                      aria-label={`删除 ${item.material.filename}`}
                    >
                      <XCircle size={16} />
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <section className="feature-strip">
          <article>
            <span className="feature-number">01</span>
            <div>
              <h3>自动分章</h3>
              <p>识别“第一章、单元、专题”等标题，每章独立一轮。</p>
            </div>
          </article>
          <article>
            <span className="feature-number">02</span>
            <div>
              <h3>自动去答案</h3>
              <p>原题与选项保持不变，练习时不会提前看到答案。</p>
            </div>
          </article>
          <article>
            <span className="feature-number">03</span>
            <div>
              <h3>自动批改</h3>
              <p>交卷立即出分，显示错题和正确答案，随时重置再练。</p>
            </div>
          </article>
        </section>
      </main>

      <footer className="landing-footer">
        识别结果会保存在当前浏览器中，刷新页面也能继续答题。
      </footer>
    </div>
  );
}

function ChapterSidebar({
  material,
  activeChapterId,
  answers,
  results,
  onSelect,
  onResetAll,
  open,
  onClose,
}) {
  return (
    <>
      {open && <button className="sidebar-backdrop" aria-label="关闭章节目录" onClick={onClose} />}
      <aside className={`chapter-sidebar ${open ? "is-open" : ""}`}>
        <div className="sidebar-heading">
          <div>
            <span className="sidebar-kicker">复习目录</span>
            <h2>{formatFileName(material.filename)}</h2>
          </div>
          <button className="icon-button sidebar-close" onClick={onClose} aria-label="关闭">
            <X size={19} />
          </button>
        </div>

        <div className="chapter-list">
          {material.chapters.map((chapter, index) => {
            const chapterQuestions = material.questions.filter(
              (question) => question.chapterId === chapter.id,
            );
            const requiredQuestions = chapterQuestions.filter((question) =>
              isProgressQuestion(question),
            );
            const answered = requiredQuestions.filter((question) =>
              hasProgressAnswer(question, answers),
            ).length;
            const result = results[chapter.id];
            const complete = Boolean(result);

            return (
              <button
                type="button"
                key={chapter.id}
                className={`chapter-item ${activeChapterId === chapter.id ? "active" : ""}`}
                onClick={() => {
                  onSelect(chapter.id);
                  onClose();
                }}
              >
                <span className={`chapter-index ${complete ? "complete" : ""}`}>
                  {complete ? <Check size={16} /> : String(index + 1).padStart(2, "0")}
                </span>
                <span className="chapter-copy">
                  <strong>{chapter.title}</strong>
                  <small>
                    {result
                      ? `${result.score} 分 · ${result.correct}/${result.total} 正确`
                      : `${answered}/${requiredQuestions.length} 已作答 · 主观 ${chapter.essayCount ?? 0} 题`}
                  </small>
                </span>
                <span
                  className="mini-progress"
                  style={{
                    "--progress": `${
                      result
                        ? 100
                        : requiredQuestions.length
                          ? Math.round((answered / requiredQuestions.length) * 100)
                          : 0
                    }%`,
                  }}
                />
              </button>
            );
          })}
        </div>

        <div className="sidebar-tip">
          <Sparkles size={17} />
          <p>
            <strong>复习小贴士</strong>
            每次只攻下一章，比一次塞进脑子更牢。
          </p>
        </div>
        <button className="sidebar-reset" type="button" onClick={onResetAll}>
          <RotateCcw size={14} />
          重置全部答题进度
        </button>
      </aside>
    </>
  );
}

function LibraryDrawer({
  open,
  library,
  currentMaterialId,
  lastSavedAt,
  onSelect,
  onDelete,
  onImportNew,
  onSave,
  onClose,
}) {
  if (!open) return null;

  return (
    <>
      <button className="library-backdrop" aria-label="关闭书库" type="button" onClick={onClose} />
      <aside className="library-drawer" aria-label="资料书库">
        <div className="library-drawer-header">
          <div>
            <span className="sidebar-kicker">我的书库</span>
            <h2>保存的复习资料</h2>
            <p>
              共 {library.length} 份资料
              {lastSavedAt ? ` · 上次保存 ${new Date(lastSavedAt).toLocaleTimeString()}` : ""}
            </p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭书库">
            <X size={19} />
          </button>
        </div>

        <div className="library-drawer-actions">
          <button className="primary-button" type="button" onClick={onImportNew}>
            <UploadCloud size={17} />
            导入新资料
          </button>
          <button className="ghost-button library-save-button" type="button" onClick={onSave}>
            <FileCheck2 size={16} />
            保存进度
          </button>
        </div>

        <div className="library-drawer-list">
          {library.map((item) => {
            const progress = getLibraryProgress(item);
            const active = item.id === currentMaterialId;
            return (
              <article className={`library-drawer-item ${active ? "active" : ""}`} key={item.id}>
                <button
                  className="library-select-button"
                  type="button"
                  onClick={() => {
                    onSelect(item.id);
                    onClose();
                  }}
                >
                  <span className="library-book-icon">
                    <BookOpen size={18} />
                  </span>
                  <span>
                    <strong>{formatFileName(item.material.filename)}</strong>
                    <small>
                      {item.material.stats.questionCount} 题 · {progress.completedChapters}/
                      {progress.chapterCount} 章完成 · 进度 {progress.percent}%
                    </small>
                  </span>
                </button>
                <button
                  className="library-delete"
                  type="button"
                  onClick={() => onDelete(item.id)}
                  aria-label={`删除 ${item.material.filename}`}
                >
                  <XCircle size={16} />
                </button>
              </article>
            );
          })}
        </div>

        <p className="library-drawer-tip">
          资料、答题进度和论述题标记都保存在本机；换资料不会丢掉前一份的复习进度。
        </p>
      </aside>
    </>
  );
}

function DrawingLayer({ paths = [], onChange }) {
  const svgRef = useRef(null);
  const [currentPath, setCurrentPath] = useState(null);

  const getPoint = (event) => {
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1000, ((event.clientX - rect.left) / rect.width) * 1000)),
      y: Math.max(0, Math.min(1000, ((event.clientY - rect.top) / rect.height) * 1000)),
    };
  };

  const pathToD = (points) =>
    points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

  const finishPath = () => {
    if (currentPath?.length > 1) onChange([...paths, currentPath]);
    setCurrentPath(null);
  };

  return (
    <svg
      ref={svgRef}
      className="annotation-layer"
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setCurrentPath([getPoint(event)]);
      }}
      onPointerMove={(event) => {
        if (!currentPath) return;
        setCurrentPath((path) => [...path, getPoint(event)]);
      }}
      onPointerUp={finishPath}
      onPointerCancel={finishPath}
      onPointerLeave={finishPath}
      aria-label="论述题画笔标记区"
    >
      {[...paths, currentPath].filter(Boolean).map((path, index) => (
        <path key={index} d={pathToD(path)} />
      ))}
    </svg>
  );
}

function QuestionCard({
  question,
  index,
  selected,
  result,
  gradingMode,
  questionResult,
  showOnlyAnswers,
  annotations,
  wrongbookMode = false,
  masteryCount = 0,
  masteryTarget = 2,
  onAnswer,
  onGradeQuestion,
  onAnnotationsChange,
  onRemoveFromWrongbook,
}) {
  const isReviewOnly = isReviewOnlyQuestion(question);
  const isFill = question.type === "fill";
  const isChoiceLike = question.type === "choice" || question.type === "judge";
  const answeredResult =
    isReviewOnly
      ? { id: question.id, selected: "已查看", correct: true }
      : showOnlyAnswers
      ? { id: question.id, selected: question.answer, correct: true }
      : result?.details.find((item) => item.id === question.id) ||
        (gradingMode === "instant" ? questionResult : null);
  const isSubmitted = Boolean(result);
  const isInstantGraded = gradingMode === "instant" && Boolean(questionResult);
  const isLocked = isReviewOnly || showOnlyAnswers || isSubmitted || isInstantGraded;
  const hasResult = Boolean(answeredResult);
  const displayedSelection = showOnlyAnswers ? question.answer : selected;

  const choose = (key) => {
    if (isLocked || !isChoiceLike) return;
    if (!question.multiple) {
      onAnswer(key);
      return;
    }

    const choices = new Set((selected || "").split("").filter(Boolean));
    if (choices.has(key)) choices.delete(key);
    else choices.add(key);
    onAnswer([...choices].sort().join(""));
  };

  return (
    <article
      id={`question-${question.id}`}
      className={`question-card ${isReviewOnly ? "is-essay" : ""} ${
        hasResult ? (answeredResult?.correct ? "is-correct" : "is-wrong") : ""
      }`}
    >
      <div className="question-topline">
        <span className="question-number">Q{String(index + 1).padStart(2, "0")}</span>
        <span className={`type-badge ${question.type}`}>
          {questionTypeLabel(question)}
        </span>
        {isReviewOnly ? (
          <span className="grade-chip correct">
            <PencilLine size={14} />
            {question.type === "note" ? "资料阅读" : "参考答案"}
          </span>
        ) : showOnlyAnswers ? (
          <span className="grade-chip correct">
            <Check size={14} />
            正确答案
          </span>
        ) : hasResult && (
          <span className={`grade-chip ${answeredResult?.correct ? "correct" : "wrong"}`}>
            {answeredResult?.correct ? <Check size={14} /> : <X size={14} />}
            {answeredResult?.correct ? "回答正确" : "回答错误"}
          </span>
        )}
        {wrongbookMode && !isReviewOnly && (
          <div className="wrongbook-card-tools">
            <span>掌握 {masteryCount}/{masteryTarget}</span>
            <button type="button" onClick={onRemoveFromWrongbook}>
              <XCircle size={14} />
              删除
            </button>
          </div>
        )}
      </div>

      <h3>{question.stem}</h3>
      {question.multiple && !isLocked && (
        <p className="multiple-hint">
          {gradingMode === "instant" ? "可选择多个答案，选好后批改本题" : "可选择多个答案"}
        </p>
      )}

      {isChoiceLike && (
        <div className={`option-grid ${question.type === "judge" ? "judge-grid" : ""}`}>
          {question.options.map((option) => {
            const isSelected = (displayedSelection || "").includes(option.key);
            const isCorrectOption = hasResult && question.answer.includes(option.key);
            const isWrongSelection = hasResult && isSelected && !isCorrectOption;

            return (
              <button
                type="button"
                key={option.key}
                disabled={isLocked}
                className={`option-button ${isSelected ? "selected" : ""} ${
                  isCorrectOption ? "correct-option" : ""
                } ${isWrongSelection ? "wrong-option" : ""}`}
                onClick={() => choose(option.key)}
              >
                <span className="option-key">
                  {isCorrectOption ? (
                    <Check size={16} />
                  ) : isWrongSelection ? (
                    <X size={16} />
                  ) : (
                    option.key
                  )}
                </span>
                <span>{option.text}</span>
              </button>
            );
          })}
        </div>
      )}

      {isFill && (
        <label className="fill-answer-box">
          <span>{showOnlyAnswers ? "正确答案" : "你的答案"}</span>
          <textarea
            value={showOnlyAnswers ? question.answer : selected}
            disabled={isLocked}
            onChange={(event) => onAnswer(event.target.value)}
            placeholder="在这里填写答案；也可以先留空，回头再补。"
          />
        </label>
      )}

      {isReviewOnly && (
        <div className="essay-answer-card">
          <div className="essay-answer-toolbar">
            <span>{question.type === "note" ? "资料原文 / 可用画笔标重点" : "主观题资料 / 可用画笔标重点"}</span>
            <button
              type="button"
              onClick={() => onAnnotationsChange([])}
              disabled={!annotations?.length}
            >
              <RotateCcw size={14} />
              清空标记
            </button>
          </div>
          <div className="essay-answer-surface">
            <pre>{question.answer || question.explanation || "未识别到内容，可回到原文件核对。"}</pre>
            <DrawingLayer paths={annotations || []} onChange={onAnnotationsChange} />
          </div>
        </div>
      )}

      {gradingMode === "instant" &&
        (question.multiple || isFill) &&
        !isLocked &&
        String(selected || "").trim() && (
        <div className="question-actions">
          <button className="small-grade-button" type="button" onClick={onGradeQuestion}>
            <BookCheck size={15} />
            批改本题
          </button>
        </div>
      )}

      {!isReviewOnly && showOnlyAnswers && (
        <div className="answer-feedback answer-only">
          <span className="answer-label">正确答案</span>
          <strong>{question.answerLabel}</strong>
          {question.explanation && <p>{question.explanation}</p>}
        </div>
      )}
      {!isReviewOnly && !showOnlyAnswers && hasResult && !answeredResult?.correct && (
        <div className="answer-feedback">
          <span className="answer-label">正确答案</span>
          <strong>{question.answerLabel}</strong>
          {question.explanation && <p>{question.explanation}</p>}
        </div>
      )}
      {!isReviewOnly && !showOnlyAnswers && hasResult && answeredResult?.correct && question.explanation && (
        <div className="answer-feedback subtle">
          <span className="answer-label">解析</span>
          <p>{question.explanation}</p>
        </div>
      )}
    </article>
  );
}

function ResultsBanner({ result, onReset, onNext, hasNext }) {
  const message =
    result.total === 0
      ? "本范围主要是资料/主观题，已按复习内容处理。"
      : result.score === 100
      ? "满分通关，这一章已经拿下！"
      : result.score >= 80
        ? "掌握得很不错，再看一眼错题就更稳了。"
        : result.score >= 60
          ? "基础已经有了，重练一轮会更扎实。"
          : "别急，错题正是在告诉你下一步学哪里。";

  return (
    <section className="result-banner">
      <div className="score-orbit">
        <strong>{result.score}</strong>
        <span>分</span>
      </div>
      <div className="result-copy">
        <span className="result-kicker">本章批改完成</span>
        <h2>{message}</h2>
        <p>
          {result.total === 0
            ? `共 ${result.reviewTotal || 0} 条复习内容，不计入分数。`
            : `共 ${result.total} 题，答对 ${result.correct} 题，答错 ${result.wrong} 题。`}
        </p>
      </div>
      <div className="result-actions">
        <button className="secondary-button" type="button" onClick={onReset}>
          <RotateCcw size={17} />
          重练本章
        </button>
        {hasNext && (
          <button className="primary-button" type="button" onClick={onNext}>
            下一章
          </button>
        )}
      </div>
    </section>
  );
}

function StudyScreen({
  material,
  answers,
  setAnswers,
  results,
  setResults,
  questionResults,
  setQuestionResults,
  annotations,
  setAnnotations,
  gradingMode,
  setGradingMode,
  showOnlyAnswers,
  setShowOnlyAnswers,
  activeChapterId,
  setActiveChapterId,
  selectedChapterIds,
  setSelectedChapterIds,
  randomOrder,
  setRandomOrder,
  randomSeed,
  setRandomSeed,
  practiceMode,
  setPracticeMode,
  wrongbookRemovedIds,
  setWrongbookRemovedIds,
  wrongbookCorrectCounts,
  setWrongbookCorrectCounts,
  wrongbookMasteryTarget,
  setWrongbookMasteryTarget,
  onNewMaterial,
  onOpenLibrary,
  onSaveNow,
  install,
  offlineReady,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [scopeCollapsed, setScopeCollapsed] = useState(false);
  const [wrongSessionQuestionIds, setWrongSessionQuestionIds] = useState([]);
  const [wrongSessionAnswers, setWrongSessionAnswers] = useState({});
  const [wrongSessionResults, setWrongSessionResults] = useState({});
  const [notice, setNotice] = useState("");
  const activeIndex = material.chapters.findIndex((chapter) => chapter.id === activeChapterId);
  const fallbackChapter = material.chapters[activeIndex] || material.chapters[0];
  const normalizedSelectedChapterIds =
    selectedChapterIds?.filter((id) => material.chapters.some((chapter) => chapter.id === id)) || [];
  const scopeChapterIds =
    normalizedSelectedChapterIds.length > 0
      ? normalizedSelectedChapterIds
      : [fallbackChapter.id].filter(Boolean);
  const scopeChapters = material.chapters.filter((chapter) => scopeChapterIds.includes(chapter.id));
  const masteryTarget = normalizeMasteryTarget(wrongbookMasteryTarget);
  const removedWrongIds = new Set(wrongbookRemovedIds || []);
  const isWrongbookVisibleQuestion = (question) =>
    isAnswerRequired(question) &&
    !removedWrongIds.has(question.id) &&
    Number(wrongbookCorrectCounts?.[question.id] || 0) < masteryTarget;
  const latestWrongQuestions = getWrongQuestions(
    material,
    results,
    questionResults,
    wrongbookRemovedIds,
    wrongbookCorrectCounts,
    masteryTarget,
  );
  const activeWrongQuestionIds =
    practiceMode === "wrong" && wrongSessionQuestionIds.length > 0
      ? wrongSessionQuestionIds
      : latestWrongQuestions.map((question) => question.id);
  const wrongQuestions =
    practiceMode === "wrong"
      ? material.questions.filter(
          (question) => activeWrongQuestionIds.includes(question.id) && isWrongbookVisibleQuestion(question),
        )
      : latestWrongQuestions;
  const baseQuestions =
    practiceMode === "wrong"
      ? wrongQuestions
      : material.questions.filter((question) => scopeChapterIds.includes(question.chapterId));
  const questions = randomOrder
    ? seededShuffle(baseQuestions, `${randomSeed}${practiceMode}${scopeChapterIds.join("-")}`.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0))
    : baseQuestions;
  const resultKey = practiceResultKey(practiceMode, scopeChapterIds);
  const result = results[resultKey];
  const activeAnswers = practiceMode === "wrong" ? wrongSessionAnswers : answers;
  const getVisibleQuestionResult = (questionId) => {
    if (practiceMode !== "wrong") return questionResults[questionId];
    return wrongSessionResults[questionId] || null;
  };
  const requiredQuestions = questions.filter((question) =>
    isProgressQuestion(question),
  );
  const answeredCount = requiredQuestions.filter((question) =>
    hasProgressAnswer(question, activeAnswers),
  ).length;
  const allAnswered = answeredCount === requiredQuestions.length;
  const isInstantMode = gradingMode === "instant";
  const instantGradedCount = questions.filter(
    (question) => isReviewOnlyQuestion(question) || getVisibleQuestionResult(question.id),
  ).length;
  const instantChapterReady =
    isInstantMode &&
    !result &&
    questions.length > 0 &&
    questions.every((question) => isReviewOnlyQuestion(question) || getVisibleQuestionResult(question.id));
  const questionIds = questions.map((question) => question.id).join("|");
  const isMultiScope = practiceMode === "normal" && scopeChapterIds.length > 1;
  const chapter = practiceMode === "wrong"
    ? { id: "wrongbook", title: "错题本" }
    : isMultiScope
      ? { id: resultKey, title: `${scopeChapters.length} 章混合练习` }
      : fallbackChapter;

  const clearWrongbookSessionQuestion = (questionId) => {
    setWrongSessionQuestionIds((current) => current.filter((id) => id !== questionId));
    setWrongSessionAnswers((current) => {
      if (!current[questionId]) return current;
      const next = { ...current };
      delete next[questionId];
      return next;
    });
    setWrongSessionResults((current) => {
      if (!current[questionId]) return current;
      const next = { ...current };
      delete next[questionId];
      return next;
    });
  };

  const removeWrongbookQuestion = (questionId) => {
    setWrongbookRemovedIds((current) => [...new Set([...(current || []), questionId])]);
    clearWrongbookSessionQuestion(questionId);
    setResults((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => key !== "wrongbook")),
    );
    setNotice("已从错题本删除这道题。");
  };

  const recordWrongbookGrades = (details = []) => {
    if (practiceMode !== "wrong") return false;
    const correctDetails = details.filter((detail) => detail.correct && !detail.unscored);
    if (correctDetails.length === 0) return false;

    const updatedCounts = { ...(wrongbookCorrectCounts || {}) };
    const masteredIds = [];
    correctDetails.forEach((detail) => {
      const nextCount = Number(updatedCounts[detail.id] || 0) + 1;
      updatedCounts[detail.id] = nextCount;
      if (nextCount >= masteryTarget) masteredIds.push(detail.id);
    });
    setWrongbookCorrectCounts(updatedCounts);

    if (masteredIds.length > 0) {
      masteredIds.forEach(clearWrongbookSessionQuestion);
      setResults((current) =>
        Object.fromEntries(Object.entries(current).filter(([key]) => key !== "wrongbook")),
      );
      setNotice(
        masteredIds.length === 1
          ? `已累计答对 ${masteryTarget} 次，自动移出错题本。`
          : `${masteredIds.length} 道题已累计答对 ${masteryTarget} 次，自动移出错题本。`,
      );
      return true;
    }
    return false;
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setNotice("");
  }, [resultKey, practiceMode]);

  useEffect(() => {
    if (practiceMode === "wrong") {
      setWrongSessionQuestionIds((current) =>
        current.length > 0 ? current : latestWrongQuestions.map((question) => question.id),
      );
      setWrongSessionAnswers({});
      setWrongSessionResults({});
    }
  }, [practiceMode, material.id]);

  useEffect(() => {
    if (!instantChapterReady) return;

    const details = gradeChapter(questions, activeAnswers).details.map(
      (detail) => getVisibleQuestionResult(detail.id) || detail,
    );
    const scoredDetails = details.filter((item) => !item.unscored);
    const correct = scoredDetails.filter((item) => item.correct).length;
    const total = scoredDetails.length;
    setResults((current) => {
      if (current[resultKey]) return current;
      return {
        ...current,
        [resultKey]: {
          total,
          reviewTotal: questions.length,
          correct,
          wrong: total - correct,
          score: total ? Math.round((correct / total) * 100) : 100,
          details,
          completedAt: new Date().toISOString(),
        },
      };
    });
    setNotice(practiceMode === "wrong" ? "错题本已即时批改完成。" : "当前范围全部题目已即时批改完成。");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [resultKey, practiceMode, instantChapterReady, questionIds, questionResults, questions, activeAnswers, setResults]);

  const changeGradingMode = (nextMode) => {
    setGradingMode(nextMode);
    if (nextMode === "instant" && !result) {
      const buildAutoGrades = (current) => {
        const updated = { ...current };
        questions.forEach((question) => {
          const autoGrade =
            (question.type === "choice" || question.type === "judge") && !question.multiple;
          if (autoGrade && activeAnswers[question.id] && !updated[question.id]) {
            updated[question.id] = gradeSingleQuestion(question, activeAnswers[question.id]);
          }
        });
        return updated;
      };
      if (practiceMode === "wrong") setWrongSessionResults(buildAutoGrades);
      else setQuestionResults(buildAutoGrades);
      setNotice("已切换为做一题改一题：单选/判断会立即显示对错，多选和填空题选好/填好后点“批改本题”。");
    } else {
      setNotice("已切换为整章交卷：答完本章后再统一批改。");
    }
  };

  const submitChapter = () => {
    const firstUnanswered = requiredQuestions.find((question) => !hasAnswer(question, activeAnswers));
    if (firstUnanswered) {
      setNotice(`还有 ${requiredQuestions.length - answeredCount} 题没有作答`);
      document
        .getElementById(`question-${firstUnanswered.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const grade = gradeChapter(questions, activeAnswers);
    setResults((current) => ({
      ...current,
      [resultKey]: { ...grade, completedAt: new Date().toISOString() },
    }));
    const mastered = recordWrongbookGrades(grade.details);
    if (!mastered) setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetChapter = () => {
    const questionIds = new Set(questions.map((question) => question.id));
    setResults((current) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => id !== resultKey)),
    );
    if (practiceMode === "wrong") {
      setWrongSessionAnswers({});
      setWrongSessionResults({});
    } else {
      setAnswers((current) =>
        Object.fromEntries(Object.entries(current).filter(([id]) => !questionIds.has(id))),
      );
      setQuestionResults((current) =>
        Object.fromEntries(Object.entries(current).filter(([id]) => !questionIds.has(id))),
      );
    }
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetAll = () => {
    setAnswers({});
    setResults({});
    setQuestionResults({});
    setWrongSessionQuestionIds([]);
    setWrongSessionAnswers({});
    setWrongSessionResults({});
    setWrongbookRemovedIds([]);
    setWrongbookCorrectCounts({});
    setNotice("全部章节已重置，可以从头再练一轮。");
  };

  const goNext = () => {
    if (practiceMode === "wrong" || isMultiScope) return;
    const next = material.chapters[activeIndex + 1];
    if (next) {
      setActiveChapterId(next.id);
      setSelectedChapterIds([next.id]);
    }
  };

  const progressChapters = material.chapters.filter((item) => {
    const chapterQuestions = material.questions.filter((question) => question.chapterId === item.id);
    return chapterQuestions.some((question) => isProgressQuestion(question));
  });
  const completedChapters = Object.keys(results).filter((key) =>
    progressChapters.some((item) => item.id === key),
  ).length;
  const overallProgress = progressChapters.length
    ? Math.round((completedChapters / progressChapters.length) * 100)
    : 0;
  const chapterChoiceCount =
    chapter.choiceCount ?? questions.filter((item) => item.type === "choice").length;
  const chapterJudgeCount =
    chapter.judgeCount ?? questions.filter((item) => item.type === "judge").length;
  const chapterFillCount =
    chapter.fillCount ?? questions.filter((item) => item.type === "fill").length;
  const chapterEssayCount =
    chapter.essayCount ?? questions.filter((item) => item.type === "essay").length;
  const chapterNoteCount =
    chapter.noteCount ?? questions.filter((item) => item.type === "note").length;
  const chapterTypeSummary = `选择题 ${chapterChoiceCount} 道，判断题 ${chapterJudgeCount} 道，填空题 ${chapterFillCount} 道，主观资料 ${chapterEssayCount} 条，资料 ${chapterNoteCount} 条。`;
  const chapterPrompt = result
    ? "当前范围已经批改完成，可查看解析或重练。"
    : showOnlyAnswers
      ? `当前为只看答案模式：本章共 ${questions.length} 道题，已直接显示正确答案。`
    : isInstantMode
      ? `当前范围共 ${questions.length} 道题，当前为即时批改模式。${chapterTypeSummary}`
      : `请完成当前范围需要作答/复习的 ${requiredQuestions.length} 道题，再统一交卷批改。${chapterTypeSummary}`;
  const dockReady = isInstantMode ? instantGradedCount === questions.length : allAnswered;

  return (
    <div className="study-app">
      <header className="app-header">
        <div className="header-left">
          <button
            className="icon-button mobile-menu"
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="打开章节目录"
          >
            <Menu size={21} />
          </button>
          <a className="brand compact" href="#" onClick={(event) => event.preventDefault()}>
            <span className="brand-mark">
              <BookCheck size={19} />
            </span>
            <span>复习搭子</span>
          </a>
          <span className="header-separator" />
          <div className="document-name">
            <FileText size={17} />
            <span>{material.filename}</span>
          </div>
        </div>

        <div className="header-actions">
          <OfflineBadge ready={offlineReady} />
          <InstallButton {...install} header />
          <button className="header-button" type="button" onClick={onOpenLibrary}>
            <BookOpen size={17} />
            <span>书库</span>
          </button>
          <button
            className="header-button"
            type="button"
            onClick={() => {
              onSaveNow();
              setNotice("已保存到本机书库。");
            }}
          >
            <FileCheck2 size={17} />
            <span>保存</span>
          </button>
          <button
            className={`header-button ${showOnlyAnswers ? "active-answer" : ""}`}
            type="button"
            onClick={() => setShowOnlyAnswers((current) => !current)}
            aria-pressed={showOnlyAnswers}
          >
            <FileCheck2 size={17} />
            <span>{showOnlyAnswers ? "继续答题" : "只看答案"}</span>
          </button>
          <button className="header-button" type="button" onClick={onNewMaterial}>
            <UploadCloud size={17} />
            <span>导入资料</span>
          </button>
        </div>
      </header>

      <div className="study-layout">
        <ChapterSidebar
          material={material}
          activeChapterId={practiceMode === "normal" && !isMultiScope ? chapter.id : ""}
          answers={answers}
          results={results}
          onSelect={(chapterId) => {
            setPracticeMode("normal");
            setActiveChapterId(chapterId);
            setSelectedChapterIds([chapterId]);
          }}
          onResetAll={resetAll}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <main className="quiz-main">
          <section className="overview-card">
            <div className="overview-icon">
              <Layers3 size={23} />
            </div>
            <div className="overview-copy">
              <span>资料识别完成</span>
              <h1>{material.stats.questionCount} 道题，已按 {material.stats.chapterCount} 章整理</h1>
              <p>
                选择题 {material.stats.choiceCount} 道 · 判断题 {material.stats.judgeCount} 道
                · 填空题 {material.stats.fillCount || 0} 道 · 主观资料 {material.stats.essayCount || 0} 条
                · 资料 {material.stats.noteCount || 0} 条
                {material.stats.skippedEstimate > 0 &&
                  ` · ${material.stats.skippedEstimate} 道格式不完整未导入`}
              </p>
            </div>
            <div className="overall-progress">
              <div
                className="progress-ring"
                style={{ "--value": `${overallProgress * 3.6}deg` }}
              >
                <span>{overallProgress}%</span>
              </div>
              <small>总进度</small>
            </div>
          </section>

          <section className="practice-scope-panel" aria-label="练习范围">
            <div className="practice-scope-heading">
              <div>
                <span>练习范围</span>
                <strong>
                  {practiceMode === "wrong"
                    ? `错题本 · ${wrongQuestions.length} 题`
                    : isMultiScope
                      ? `${scopeChapters.length} 章混合练习`
                      : fallbackChapter.title}
                </strong>
              </div>
              <div className="scope-actions">
                <button
                  type="button"
                  className={practiceMode === "wrong" ? "active" : ""}
                  onClick={() => {
                    const enteringWrongBook = practiceMode !== "wrong";
                    if (enteringWrongBook) {
                      setResults((current) =>
                        Object.fromEntries(Object.entries(current).filter(([key]) => key !== "wrongbook")),
                      );
                      setWrongSessionQuestionIds(latestWrongQuestions.map((question) => question.id));
                      setWrongSessionAnswers({});
                      setWrongSessionResults({});
                    }
                    setPracticeMode(enteringWrongBook ? "wrong" : "normal");
                    setNotice("");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  错题本 {wrongQuestions.length > 0 ? `(${wrongQuestions.length})` : ""}
                </button>
                <button
                  type="button"
                  className={randomOrder ? "active" : ""}
                  onClick={() => setRandomOrder((current) => !current)}
                >
                  随机顺序
                </button>
                <button type="button" onClick={() => setRandomSeed((seed) => Number(seed || 1) + 1)}>
                  重洗
                </button>
                <button
                  type="button"
                  className="scope-collapse-button"
                  onClick={() => setScopeCollapsed((current) => !current)}
                  aria-expanded={!scopeCollapsed}
                >
                  {scopeCollapsed ? "展开" : "收起"}
                  <ChevronDown className={scopeCollapsed ? "" : "rotate"} size={14} />
                </button>
              </div>
            </div>

            {!scopeCollapsed && (
              <>
                {practiceMode === "normal" && (
                  <div className="chapter-checkbox-grid">
                    {material.chapters.map((item, index) => {
                      const selected = scopeChapterIds.includes(item.id);
                      return (
                        <label className={selected ? "selected" : ""} key={item.id}>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(event) => {
                              setSelectedChapterIds((current) => {
                                const base = current?.length ? current : [fallbackChapter.id];
                                if (event.target.checked) return [...new Set([...base, item.id])];
                                const next = base.filter((id) => id !== item.id);
                                return next.length ? next : [item.id];
                              });
                              setPracticeMode("normal");
                            }}
                          />
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          <strong>{item.title}</strong>
                        </label>
                      );
                    })}
                  </div>
                )}

                {practiceMode === "wrong" ? (
                  <div className="wrongbook-settings">
                    <label>
                      <span>掌握规则</span>
                      <select
                        value={masteryTarget}
                        onChange={(event) =>
                          setWrongbookMasteryTarget(normalizeMasteryTarget(event.target.value))
                        }
                      >
                        <option value={1}>累计答对 1 次移除</option>
                        <option value={2}>累计答对 2 次移除</option>
                        <option value={3}>累计答对 3 次移除</option>
                      </select>
                    </label>
                    <span className="scope-note">
                      删除题目或累计答对达到设置次数后，会从错题本移除；原章节记录不受影响。
                    </span>
                  </div>
                ) : (
                  <div className="scope-footer-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setPracticeMode("normal");
                        setSelectedChapterIds(material.chapters.map((item) => item.id));
                      }}
                    >
                      全选章节
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPracticeMode("normal");
                        setSelectedChapterIds([fallbackChapter.id]);
                      }}
                    >
                      只练当前章
                    </button>
                    <span className="scope-note">主观题和资料仅用于阅读复习，不计入分数或进度。</span>
                  </div>
                )}
              </>
            )}
          </section>

          <section className="grading-mode-panel" aria-label="批改模式">
            <div>
              <span>批改模式</span>
              <strong>{isInstantMode ? "做一题改一题" : "做完整章再改"}</strong>
              <p>
                {isInstantMode
                  ? "单选和判断点选后立即显示对错；多选题选好后单独批改。"
                  : "答题过程中不显示答案，完成本章后一次性交卷批改。"}
              </p>
            </div>
            <div className="mode-toggle" role="group" aria-label="选择批改模式">
              <button
                type="button"
                className={isInstantMode ? "active" : ""}
                aria-pressed={isInstantMode}
                onClick={() => changeGradingMode("instant")}
              >
                一题一改
              </button>
              <button
                type="button"
                className={!isInstantMode ? "active" : ""}
                aria-pressed={!isInstantMode}
                onClick={() => changeGradingMode("chapter")}
              >
                整章批改
              </button>
            </div>
          </section>

          {result && (
            <ResultsBanner
              result={result}
              onReset={resetChapter}
              onNext={goNext}
              hasNext={practiceMode === "normal" && !isMultiScope && activeIndex < material.chapters.length - 1}
            />
          )}

          <section className="chapter-header">
            <div>
              <span className="chapter-label">
                {practiceMode === "wrong"
                  ? "错题复练"
                  : isMultiScope
                    ? `混合 ${scopeChapters.length} 章`
                    : `第 ${activeIndex + 1} 轮 · 共 ${material.chapters.length} 轮`}
              </span>
              <h2>{chapter.title}</h2>
              <p>{chapterPrompt}</p>
            </div>
            <div className="chapter-progress-copy">
              <strong>
                {result ? questions.length : isInstantMode ? instantGradedCount : answeredCount}
                <span> / {questions.length}</span>
              </strong>
              <small>{result ? "已完成" : isInstantMode ? "已批改" : "已作答"}</small>
            </div>
          </section>

          {questions.length === 0 ? (
            <section className="empty-practice-card">
              <BookCheck size={26} />
              <h3>{practiceMode === "wrong" ? "错题本暂时是空的" : "当前范围没有可练习的题目"}</h3>
              <p>
                {practiceMode === "wrong"
                  ? "做完章节并批改后，答错的选择题、判断题和填空题会自动出现在这里。"
                  : "可以重新选择章节，或导入另一份资料。"}
              </p>
            </section>
          ) : (
          <div className="question-list">
            {questions.map((question, index) => (
              <QuestionCard
                key={question.id}
                question={question}
                index={index}
                selected={activeAnswers[question.id] || ""}
                result={result}
                gradingMode={gradingMode}
                questionResult={getVisibleQuestionResult(question.id)}
                showOnlyAnswers={showOnlyAnswers}
                annotations={annotations[question.id] || []}
                wrongbookMode={practiceMode === "wrong"}
                masteryCount={Number(wrongbookCorrectCounts?.[question.id] || 0)}
                masteryTarget={masteryTarget}
                onRemoveFromWrongbook={() => removeWrongbookQuestion(question.id)}
                onAnswer={(value) => {
                  if (practiceMode === "wrong") {
                    setWrongSessionAnswers((current) => ({ ...current, [question.id]: value }));
                  } else {
                    setAnswers((current) => ({ ...current, [question.id]: value }));
                  }
                  const autoGrade =
                    isInstantMode &&
                    (question.type === "choice" || question.type === "judge") &&
                    !question.multiple;
                  if (autoGrade) {
                    const graded = gradeSingleQuestion(question, value);
                    if (practiceMode === "wrong") {
                      setWrongSessionResults((current) => ({
                        ...current,
                        [question.id]: graded,
                      }));
                      const mastered = recordWrongbookGrades([graded]);
                      if (!mastered) setNotice("");
                    } else {
                      setQuestionResults((current) => ({
                        ...current,
                        [question.id]: graded,
                      }));
                      setNotice("");
                    }
                  } else {
                    if (practiceMode === "wrong") {
                      setWrongSessionResults((current) => {
                        if (!current[question.id]) return current;
                        const next = { ...current };
                        delete next[question.id];
                        return next;
                      });
                    } else {
                      setQuestionResults((current) => {
                        if (!current[question.id]) return current;
                        const next = { ...current };
                        delete next[question.id];
                        return next;
                      });
                    }
                    setNotice("");
                  }
                }}
                onGradeQuestion={() => {
                  const selected = activeAnswers[question.id];
                  if (!String(selected || "").trim()) {
                    setNotice(question.type === "fill" ? "请先填写本题答案。" : "请先选择本题答案。");
                    return;
                  }
                  const graded = gradeSingleQuestion(question, selected);
                  if (practiceMode === "wrong") {
                    setWrongSessionResults((current) => ({
                      ...current,
                      [question.id]: graded,
                    }));
                    const mastered = recordWrongbookGrades([graded]);
                    if (!mastered) setNotice("");
                  } else {
                    setQuestionResults((current) => ({
                      ...current,
                      [question.id]: graded,
                    }));
                    setNotice("");
                  }
                }}
                onAnnotationsChange={(paths) => {
                  setAnnotations((current) => ({
                    ...current,
                    [question.id]: paths,
                  }));
                }}
              />
            ))}
          </div>
          )}

          <div className="submit-dock">
            <div className="submit-status">
              {result ? (
                <>
                  <FileCheck2 size={19} />
                  本章已批改，得分 {result.score}
                </>
              ) : (
                <>
                  <span className={`status-dot ${dockReady ? "ready" : ""}`} />
                  {questions.length === 0
                    ? "当前没有题目"
                    : isInstantMode
                    ? `已即时批改 ${instantGradedCount}/${questions.length} 题`
                    : allAnswered
                      ? "已完成全部题目，可以交卷"
                      : `还剩 ${requiredQuestions.length - answeredCount} 题`}
                </>
              )}
              {notice && <span className="submit-notice">{notice}</span>}
            </div>
            <div className="dock-actions">
              <button className="ghost-button" type="button" onClick={resetChapter}>
                <RotateCcw size={16} />
                {result ? "重练本章" : "重置本章"}
              </button>
              {!result && !isInstantMode && questions.length > 0 && (
                <button className="primary-button submit-button" type="button" onClick={submitChapter}>
                  <BookCheck size={18} />
                  交卷并自动批改
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function App() {
  const stored = useMemo(readStoredState, []);
  const installApp = useInstallApp();
  const offlineReady = useOfflineReady();
  const [library, setLibrary] = useState(stored.library || []);
  const [currentMaterialId, setCurrentMaterialId] = useState(stored.currentMaterialId || "");
  const [gradingMode, setGradingMode] = useState(stored.gradingMode || "chapter");
  const [lastSavedAt, setLastSavedAt] = useState(stored.lastSavedAt || "");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const activeItem = useMemo(
    () => library.find((item) => item.id === currentMaterialId) || null,
    [library, currentMaterialId],
  );
  const material = activeItem?.material || null;
  const answers = activeItem?.answers || {};
  const results = activeItem?.results || {};
  const questionResults = activeItem?.questionResults || {};
  const annotations = activeItem?.annotations || {};
  const showOnlyAnswers = Boolean(activeItem?.showOnlyAnswers);
  const activeChapterId = activeItem?.activeChapterId || material?.chapters?.[0]?.id || "";
  const selectedChapterIds = activeItem?.selectedChapterIds || [activeChapterId].filter(Boolean);
  const randomOrder = Boolean(activeItem?.randomOrder);
  const randomSeed = Number(activeItem?.randomSeed || 1);
  const practiceMode = activeItem?.practiceMode || "normal";
  const wrongbookRemovedIds = activeItem?.wrongbookRemovedIds || [];
  const wrongbookCorrectCounts = activeItem?.wrongbookCorrectCounts || {};
  const wrongbookMasteryTarget = normalizeMasteryTarget(activeItem?.wrongbookMasteryTarget);

  const persistState = (savedAt = lastSavedAt) => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        library,
        currentMaterialId,
        gradingMode,
        lastSavedAt: savedAt,
      }),
    );
  };

  useEffect(() => {
    try {
      persistState();
    } catch {
      // Storage can be unavailable in private mode or full for very large materials.
    }
  }, [library, currentMaterialId, gradingMode, lastSavedAt]);

  useEffect(() => {
    if ("serviceWorker" in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  }, []);

  useEffect(() => {
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  const updateCurrentItem = (updater) => {
    setLibrary((currentLibrary) =>
      currentLibrary.map((item) => {
        if (item.id !== currentMaterialId) return item;
        const patch = typeof updater === "function" ? updater(item) : updater;
        return { ...item, ...patch };
      }),
    );
  };

  const setAnswers = (update) => {
    updateCurrentItem((item) => ({
      answers: resolveStateUpdate(update, item.answers || {}),
    }));
  };

  const setResults = (update) => {
    updateCurrentItem((item) => ({
      results: resolveStateUpdate(update, item.results || {}),
    }));
  };

  const setQuestionResults = (update) => {
    updateCurrentItem((item) => ({
      questionResults: resolveStateUpdate(update, item.questionResults || {}),
    }));
  };

  const setAnnotations = (update) => {
    updateCurrentItem((item) => ({
      annotations: resolveStateUpdate(update, item.annotations || {}),
    }));
  };

  const setShowOnlyAnswers = (update) => {
    updateCurrentItem((item) => ({
      showOnlyAnswers: resolveStateUpdate(update, Boolean(item.showOnlyAnswers)),
    }));
  };

  const setActiveChapterId = (update) => {
    updateCurrentItem((item) => ({
      activeChapterId: resolveStateUpdate(
        update,
        item.activeChapterId || item.material.chapters?.[0]?.id || "",
      ),
    }));
  };

  const setSelectedChapterIds = (update) => {
    updateCurrentItem((item) => ({
      selectedChapterIds: resolveStateUpdate(
        update,
        item.selectedChapterIds || [item.activeChapterId || item.material.chapters?.[0]?.id].filter(Boolean),
      ),
    }));
  };

  const setRandomOrder = (update) => {
    updateCurrentItem((item) => ({
      randomOrder: resolveStateUpdate(update, Boolean(item.randomOrder)),
    }));
  };

  const setRandomSeed = (update) => {
    updateCurrentItem((item) => ({
      randomSeed: resolveStateUpdate(update, Number(item.randomSeed || 1)),
    }));
  };

  const setPracticeMode = (update) => {
    updateCurrentItem((item) => ({
      practiceMode: resolveStateUpdate(update, item.practiceMode || "normal"),
    }));
  };

  const setWrongbookRemovedIds = (update) => {
    updateCurrentItem((item) => ({
      wrongbookRemovedIds: resolveStateUpdate(update, item.wrongbookRemovedIds || []),
    }));
  };

  const setWrongbookCorrectCounts = (update) => {
    updateCurrentItem((item) => ({
      wrongbookCorrectCounts: resolveStateUpdate(update, item.wrongbookCorrectCounts || {}),
    }));
  };

  const setWrongbookMasteryTarget = (update) => {
    updateCurrentItem((item) => ({
      wrongbookMasteryTarget: normalizeMasteryTarget(
        resolveStateUpdate(update, item.wrongbookMasteryTarget || 2),
      ),
    }));
  };

  const selectMaterial = (id) => {
    setCurrentMaterialId(id);
    setError("");
    window.scrollTo({ top: 0 });
  };

  const openImporter = () => {
    setCurrentMaterialId("");
    setLibraryOpen(false);
    setError("");
    window.scrollTo({ top: 0 });
  };

  const deleteMaterial = (id) => {
    const target = library.find((item) => item.id === id);
    if (!target) return;
    if (!window.confirm(`确定从书库删除《${formatFileName(target.material.filename)}》吗？`)) return;
    const nextLibrary = library.filter((item) => item.id !== id);
    setLibrary(nextLibrary);
    if (currentMaterialId === id) setCurrentMaterialId(nextLibrary[0]?.id || "");
  };

  const saveNow = () => {
    try {
      const savedAt = new Date().toISOString();
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          library,
          currentMaterialId,
          gradingMode,
          lastSavedAt: savedAt,
        }),
      );
      setLastSavedAt(savedAt);
    } catch {
      setError("保存失败：本机存储空间可能已满，请先删除一些旧资料后再试。");
    }
  };

  const importMaterial = async ({ file, text, filename }) => {
    setBusy(true);
    setError("");
    try {
      const sourceText = text ?? (await extractTextFromFile(file));
      const parsed = parseReviewMaterial(sourceText, filename || file.name);
      const item = createLibraryItem(parsed);
      setLibrary((currentLibrary) => [
        item,
        ...currentLibrary.filter((existing) => existing.id !== item.id),
      ]);
      setCurrentMaterialId(item.id);
      setLastSavedAt(new Date().toISOString());
    } catch (caught) {
      setError(caught?.message || "识别失败，请检查文件内容后重试。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {!material ? (
        <UploadScreen
          onImport={importMaterial}
          busy={busy}
          error={error}
          library={library}
          currentMaterialId={currentMaterialId}
          onSelectMaterial={selectMaterial}
          onDeleteMaterial={deleteMaterial}
          install={{
            installed: installApp.installed,
            onInstall: installApp.requestInstall,
          }}
          offlineReady={offlineReady}
        />
      ) : (
        <StudyScreen
          material={material}
          answers={answers}
          setAnswers={setAnswers}
          results={results}
          setResults={setResults}
          questionResults={questionResults}
          setQuestionResults={setQuestionResults}
          annotations={annotations}
          setAnnotations={setAnnotations}
          gradingMode={gradingMode}
          setGradingMode={setGradingMode}
          showOnlyAnswers={showOnlyAnswers}
          setShowOnlyAnswers={setShowOnlyAnswers}
          activeChapterId={activeChapterId}
          setActiveChapterId={setActiveChapterId}
          selectedChapterIds={selectedChapterIds}
          setSelectedChapterIds={setSelectedChapterIds}
          randomOrder={randomOrder}
          setRandomOrder={setRandomOrder}
          randomSeed={randomSeed}
          setRandomSeed={setRandomSeed}
          practiceMode={practiceMode}
          setPracticeMode={setPracticeMode}
          wrongbookRemovedIds={wrongbookRemovedIds}
          setWrongbookRemovedIds={setWrongbookRemovedIds}
          wrongbookCorrectCounts={wrongbookCorrectCounts}
          setWrongbookCorrectCounts={setWrongbookCorrectCounts}
          wrongbookMasteryTarget={wrongbookMasteryTarget}
          setWrongbookMasteryTarget={setWrongbookMasteryTarget}
          onNewMaterial={openImporter}
          onOpenLibrary={() => setLibraryOpen(true)}
          onSaveNow={saveNow}
          install={{
            installed: installApp.installed,
            onInstall: installApp.requestInstall,
          }}
          offlineReady={offlineReady}
        />
      )}
      <LibraryDrawer
        open={libraryOpen}
        library={library}
        currentMaterialId={currentMaterialId}
        lastSavedAt={lastSavedAt}
        onSelect={selectMaterial}
        onDelete={deleteMaterial}
        onImportNew={openImporter}
        onSave={saveNow}
        onClose={() => setLibraryOpen(false)}
      />
      <InstallGuide
        open={installApp.guideOpen}
        platform={installApp.platform}
        offlineReady={offlineReady}
        onClose={installApp.closeGuide}
      />
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
