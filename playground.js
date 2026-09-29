(() => {
  "use strict";

  const STORAGE = {
    source: "poppop.playground.source.v2",
    theme: "poppop.playground.theme",
    fontSize: "poppop.playground.fontSize",
    lessonIndex: "poppop.playground.lessonIndex.v1",
    lessonProgress: "poppop.playground.lessonProgress.v2",
    tutorWelcomed: "poppop.playground.tutorWelcomed.v2",
    tutorProfile: "poppop.playground.tutorProfile.v1",
    tutorLearning: "poppop.playground.tutorLearning.v1",
    sidebarCollapsed: "poppop.playground.sidebarCollapsed.v1",
    resultCollapsed: "poppop.playground.resultCollapsed.v1",
    sidebarWidth: "poppop.playground.sidebarWidth.v1",
    resultWidth: "poppop.playground.resultWidth.v1",
    mobileResultHeight: "poppop.playground.mobileResultHeight.v1",
  };
  const FALLBACK_SOURCE = `[1, 2, 3, 4] >> Map(value):
    value * 2.
.. >> doubled.

doubled >> Display.`;
  const {
    parseSpecification,
    friendlySpecificationExamples,
    encodeSource,
    decodeSource,
  } = window.PopPopSpecification;
  const LESSON_FEATURES = {
    map: "Map",
    filter: "Filter",
    reduce: "Reduce",
    update: "Update",
    check: "Check",
    function: "new",
    loop: "Loop",
  };

  const elements = Object.fromEntries(
    [
      "runtimeStatus", "appStatus", "runButton", "stopButton",
      "runFeedback",
      "formatButton", "copyCodeButton", "downloadButton", "fileInput",
      "loadFileButton", "shareButton", "decreaseFontButton", "increaseFontButton",
      "themeButton", "toggleSidebarButton", "toggleResultButton", "moreTools",
      "sidebarResizer", "resultResizer", "resultDrawerHandle",
      "closeResultDrawerButton",
      "examplesTab", "referenceTab", "lessonTab", "lessonTabProgress",
      "examplesPanel", "referencePanel", "lessonPanel",
      "exampleSearch", "referenceSearch", "exampleList", "referenceList",
      "lessonProgressText", "lessonProgressBar", "previousLessonButton",
      "lessonTitleButton", "nextLessonButton", "lessonBadge", "lessonTitle",
      "lessonGoal", "lessonChat", "robotAvatar", "tutorStatus",
      "tutorWelcome", "tutorSession", "welcomeIntro", "welcomeTutorButton",
      "tutorProfileForm", "tutorGoal", "tutorAge", "tutorGender", "tutorLocation",
      "tutorOccupation", "tutorThinking", "lessonTuning", "resetLessonButton",
      "checkLessonButton",
      "hintButton", "showAnswerButton", "lessonQuestionForm", "lessonQuestion",
      "aiLessonButton", "advanceLessonButton",
      "editor", "editorFallback", "saveStatus", "cursorStatus",
      "characterStatus", "outputPanel", "diagnosticsPanel", "astPanel",
      "diagnosticCount", "copyResultButton", "resultBody", "terminalInputForm",
      "terminalPrompt", "terminalInput", "runState", "runTime", "toast",
    ].map((id) => [id, document.getElementById(id)]),
  );

  let editor = null;
  let worker = null;
  let runtimeReady = false;
  let running = false;
  let sourceChanged = false;
  let saveTimer = null;
  let analysisTimer = null;
  let analysisSequence = 0;
  let latestAnalysis = 0;
  let currentAst = null;
  let currentInputId = null;
  let outputEndsWithNewline = true;
  let toastTimer = null;
  let examples = [];
  let galleryLoaded = false;
  let referenceRows = [];
  let runtimeNames = [];
  let currentResultTab = "output";
  let currentSidePanel = "examples";
  let mobilePane = "code";
  let sidebarCollapsed = localStorage.getItem(STORAGE.sidebarCollapsed) === "yes";
  let resultCollapsed = localStorage.getItem(STORAGE.resultCollapsed) === "yes";
  let sidebarWidth = Number(localStorage.getItem(STORAGE.sidebarWidth)) || 290;
  let resultWidth = Number(localStorage.getItem(STORAGE.resultWidth)) || 350;
  let mobileResultHeight =
    Number(localStorage.getItem(STORAGE.mobileResultHeight)) || 280;
  let mobileResultOpen = false;
  let mobileResultExpanded = false;
  let runFeedbackTimer = null;
  const compactViewport = window.matchMedia("(max-width: 900px)");
  let lessons = [];
  let lessonIndex = Number(localStorage.getItem(STORAGE.lessonIndex)) || 0;
  let activeLessonId = null;
  let hintIndex = 0;
  let completedLessons = new Set();
  let robotMoodTimer = null;
  let aiLesson = null;
  let tunedLessons = new Map();
  let tuningRequests = new Map();
  let tutorWelcomed = localStorage.getItem(STORAGE.tutorWelcomed) === "yes";
  let tutorProfile = {
    level: "はじめて",
    goal: "",
    age: "",
    gender: "",
    location: "",
    occupation: "",
  };
  let tutorLearning = { lessons: {}, recent: [], conversation: [], aiCompleted: 0 };
  let tutorProfileRevision = 0;
  let tutorRequestSequence = 0;
  const sandbox = window.PopPopSandbox.create("playground-worker.js");
  let currentChatSection = null;
  const gemini = window.PopPopGemini.createClient();
  const { extractPartialJsonString, parseJsonText } = window.PopPopGemini;

  try {
    completedLessons = new Set(
      JSON.parse(localStorage.getItem(STORAGE.lessonProgress) || "[]"),
    );
  } catch {
    completedLessons = new Set();
  }
  try {
    tutorProfile = {
      ...tutorProfile,
      ...JSON.parse(localStorage.getItem(STORAGE.tutorProfile) || "{}"),
    };
  } catch {
    tutorProfile = {
      level: "はじめて",
      goal: "",
      age: "",
      gender: "",
      location: "",
      occupation: "",
    };
  }
  try {
    tutorLearning = {
      lessons: {},
      recent: [],
      conversation: [],
      aiCompleted: 0,
      ...JSON.parse(localStorage.getItem(STORAGE.tutorLearning) || "{}"),
    };
  } catch {
    tutorLearning = { lessons: {}, recent: [], conversation: [], aiCompleted: 0 };
  }
  if (!Array.isArray(tutorLearning.conversation)) tutorLearning.conversation = [];

  function getSharedSource() {
    if (!location.hash.startsWith("#code=")) return null;
    return decodeSource(location.hash.slice(6));
  }

  function initialSource() {
    return getSharedSource() ?? localStorage.getItem(STORAGE.source) ?? FALLBACK_SOURCE;
  }

  function defineAceMode() {
    if (!window.ace) return;
    ace.define("ace/mode/poppop_highlight_rules", [
      "require", "exports", "module", "ace/lib/oop", "ace/mode/text_highlight_rules",
    ], (require, exports) => {
      const oop = require("ace/lib/oop");
      const TextHighlightRules = require("ace/mode/text_highlight_rules").TextHighlightRules;
      const PopPopHighlightRules = function PopPopHighlightRules() {
        this.$rules = {
          start: [
            { token: "comment", regex: "\\/\\/.*$" },
            { token: "string", regex: '"(?:\\\\.|[^"\\\\])*"|\\\'(?:\\\\.|[^\\\'\\\\])*\\\'' },
            {
              token: ["keyword.operator", "text", "variable.assignment.final"],
              regex: "(>>)(\\s*)(\\(\\s*[a-z_][a-zA-Z0-9_]*\\s*(?:,\\s*[a-z_][a-zA-Z0-9_]*\\s*)+\\))(?=\\s*\\.\\s*(?://.*)?$)",
            },
            {
              token: ["keyword.operator", "text", "variable.assignment.final"],
              regex: "(>>)(\\s*)([a-z_][a-zA-Z0-9_]*)(?=\\s*(?:\\[[^\\]\\r\\n]*\\]\\s*)*\\.\\s*(?://.*)?$)",
            },
            { token: "constant.language", regex: "\\b(?:true|false|null)\\b" },
            { token: "keyword.control", regex: "\\b(?:new|is|else|and|or|not)\\b" },
            { token: "support.function", regex: "\\b[A-Z][A-Za-z0-9_]*\\b" },
            { token: "variable.language", regex: "@" },
            { token: "constant.numeric", regex: "\\b\\d+(?:\\.\\d+)?\\b" },
            { token: "keyword.operator", regex: ">>|::|==|!=|>=|<=|[+\\-*\\/%><]" },
            { token: "punctuation.operator", regex: "\\.\\.|[.():,\\[\\]{}]" },
          ],
        };
        this.normalizeRules();
      };
      oop.inherits(PopPopHighlightRules, TextHighlightRules);
      exports.PopPopHighlightRules = PopPopHighlightRules;
    });
    ace.define("ace/mode/poppop", [
      "require", "exports", "module", "ace/lib/oop", "ace/mode/text",
      "ace/mode/poppop_highlight_rules",
    ], (require, exports) => {
      const oop = require("ace/lib/oop");
      const TextMode = require("ace/mode/text").Mode;
      const Rules = require("ace/mode/poppop_highlight_rules").PopPopHighlightRules;
      const Mode = function Mode() { this.HighlightRules = Rules; };
      oop.inherits(Mode, TextMode);
      Mode.prototype.lineCommentStart = "//";
      Mode.prototype.$id = "ace/mode/poppop";
      exports.Mode = Mode;
    });
  }

  function setupEditor() {
    const source = initialSource();
    if (!window.ace) {
      elements.editor.hidden = true;
      elements.editorFallback.style.display = "block";
      elements.editorFallback.value = source;
      elements.editorFallback.addEventListener("input", onSourceChanged);
      elements.editorFallback.addEventListener("keyup", updateEditorStatus);
      elements.editorFallback.addEventListener("click", updateEditorStatus);
      return;
    }

    defineAceMode();
    ace.config.set("basePath", "https://cdn.jsdelivr.net/npm/ace-builds@1.36.5/src-min-noconflict");
    editor = ace.edit("editor");
    editor.session.setMode("ace/mode/poppop");
    editor.session.setUseSoftTabs(true);
    editor.session.setTabSize(4);
    editor.session.setUseWrapMode(true);
    editor.setShowPrintMargin(false);
    editor.setOptions({
      fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
      fontSize: Number(localStorage.getItem(STORAGE.fontSize)) || 14,
      enableBasicAutocompletion: true,
      enableLiveAutocompletion: true,
      scrollPastEnd: 0.25,
    });
    editor.setValue(source, -1);
    editor.session.on("change", onSourceChanged);
    editor.selection.on("changeCursor", updateEditorStatus);
    updateAceTheme();
  }

  function getSource() {
    return editor ? editor.getValue() : elements.editorFallback.value;
  }

  function setSource(source, options = {}) {
    const config = typeof options === "boolean"
      ? { markChanged: options }
      : options;
    const markChanged = config.markChanged ?? true;
    const focus = config.focus ?? true;
    if (editor) {
      editor.setValue(source, -1);
      if (focus) editor.focus();
    } else {
      elements.editorFallback.value = source;
      if (focus) elements.editorFallback.focus();
      onSourceChanged();
    }
    if (!markChanged) sourceChanged = false;
  }

  function announce(message) {
    if (!elements.appStatus) return;
    elements.appStatus.textContent = "";
    requestAnimationFrame(() => {
      elements.appStatus.textContent = message;
    });
  }

  function resizeEditor() {
    requestAnimationFrame(() => editor?.resize());
  }

  function clampNumber(value, minimum, maximum) {
    return Math.min(Math.max(Number(value) || minimum, minimum), maximum);
  }

  function applyWorkspaceSizes({ persist = false } = {}) {
    const availableForShelves = Math.max(510, window.innerWidth - 460);
    sidebarWidth = clampNumber(sidebarWidth, 230, 420);
    resultWidth = clampNumber(resultWidth, 280, 500);
    if (sidebarWidth + resultWidth > availableForShelves) {
      resultWidth = Math.max(280, availableForShelves - sidebarWidth);
    }
    if (sidebarWidth + resultWidth > availableForShelves) {
      sidebarWidth = Math.max(230, availableForShelves - resultWidth);
    }
    document.documentElement.style.setProperty("--workspace-sidebar-width", `${sidebarWidth}px`);
    document.documentElement.style.setProperty("--workspace-result-width", `${resultWidth}px`);
    elements.sidebarResizer?.setAttribute("aria-valuenow", String(Math.round(sidebarWidth)));
    elements.resultResizer?.setAttribute("aria-valuenow", String(Math.round(resultWidth)));
    if (persist) {
      localStorage.setItem(STORAGE.sidebarWidth, String(Math.round(sidebarWidth)));
      localStorage.setItem(STORAGE.resultWidth, String(Math.round(resultWidth)));
    }
    resizeEditor();
  }

  function syncLayoutPresetButtons(activePreset = "") {
    document.querySelectorAll("[data-layout-preset]").forEach((button) => {
      const active = button.dataset.layoutPreset === activePreset;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function applyLayoutPreset(preset) {
    if (compactViewport.matches) {
      if (preset === "learn") {
        closeMobileResultDrawer();
        switchSidePanel("lesson");
        setMobilePane("learn");
      } else if (preset === "try") {
        setMobilePane("code");
        openMobileResultDrawer({ expanded: true });
      } else {
        closeMobileResultDrawer();
        setMobilePane("code", { focus: true });
      }
      closeToolMenu();
      return;
    }

    if (preset === "focus") {
      setSidebarCollapsed(true);
      setResultCollapsed(true);
    } else if (preset === "try") {
      resultWidth = 390;
      applyWorkspaceSizes({ persist: true });
      setSidebarCollapsed(true);
      setResultCollapsed(false);
    } else if (preset === "learn") {
      sidebarWidth = 360;
      applyWorkspaceSizes({ persist: true });
      switchSidePanel("lesson");
      setSidebarCollapsed(false);
      setResultCollapsed(true);
    } else {
      return;
    }
    syncLayoutPresetButtons(preset);
    announce(`「${preset === "focus" ? "集中" : preset === "try" ? "試す" : "学ぶ"}」レイアウトにしました`);
    closeToolMenu();
  }

  function setRunFeedback(kind = "", text = "", timeout = 0) {
    clearTimeout(runFeedbackTimer);
    document.body.dataset.runFeedback = kind;
    elements.runFeedback.textContent = text;
    elements.runFeedback.classList.toggle("visible", Boolean(text));
    if (timeout > 0) {
      runFeedbackTimer = setTimeout(() => {
        document.body.dataset.runFeedback = "";
        elements.runFeedback.classList.remove("visible");
        elements.runFeedback.textContent = "";
      }, timeout);
    }
  }

  function setSidebarCollapsed(collapsed, persist = true) {
    sidebarCollapsed = Boolean(collapsed);
    document.body.classList.toggle("sidebar-collapsed", sidebarCollapsed);
    elements.toggleSidebarButton.setAttribute("aria-pressed", String(sidebarCollapsed));
    elements.toggleSidebarButton.setAttribute(
      "aria-label",
      sidebarCollapsed ? "サンプル棚を開く" : "サンプル棚を閉じる",
    );
    if (persist) {
      localStorage.setItem(
        STORAGE.sidebarCollapsed,
        sidebarCollapsed ? "yes" : "no",
      );
    }
    syncLayoutPresetButtons();
    resizeEditor();
  }

  function setResultCollapsed(collapsed, persist = true) {
    resultCollapsed = Boolean(collapsed);
    document.body.classList.toggle("result-collapsed", resultCollapsed);
    elements.toggleResultButton.setAttribute("aria-pressed", String(resultCollapsed));
    elements.toggleResultButton.setAttribute(
      "aria-label",
      resultCollapsed ? "結果棚を開く" : "結果棚を閉じる",
    );
    if (persist) {
      localStorage.setItem(
        STORAGE.resultCollapsed,
        resultCollapsed ? "yes" : "no",
      );
    }
    if (resultCollapsed && compactViewport.matches) closeMobileResultDrawer();
    syncLayoutPresetButtons();
    resizeEditor();
  }

  function updateMobileResultHeight(height, persist = false) {
    const maximum = Math.max(240, window.innerHeight - 178);
    mobileResultHeight = clampNumber(height, 150, maximum);
    document.documentElement.style.setProperty(
      "--mobile-result-height",
      `${Math.round(mobileResultHeight)}px`,
    );
    if (persist) {
      localStorage.setItem(STORAGE.mobileResultHeight, String(Math.round(mobileResultHeight)));
    }
  }

  function openMobileResultDrawer({ expanded = false } = {}) {
    if (!compactViewport.matches) return;
    mobileResultOpen = true;
    mobileResultExpanded = Boolean(expanded);
    const targetHeight = expanded
      ? Math.min(window.innerHeight * 0.68, window.innerHeight - 178)
      : mobileResultHeight;
    updateMobileResultHeight(targetHeight);
    document.body.classList.add("mobile-result-open");
    document.body.classList.toggle("mobile-result-expanded", mobileResultExpanded);
    elements.resultDrawerHandle?.setAttribute("aria-expanded", String(mobileResultExpanded));
    elements.resultDrawerHandle?.setAttribute(
      "aria-label",
      mobileResultExpanded ? "結果棚を小さくする" : "結果棚を広げる",
    );
    applyMobilePaneState();
  }

  function closeMobileResultDrawer({ focusCode = false } = {}) {
    mobileResultOpen = false;
    mobileResultExpanded = false;
    document.body.classList.remove("mobile-result-open", "mobile-result-expanded");
    elements.resultDrawerHandle?.setAttribute("aria-expanded", "false");
    elements.resultDrawerHandle?.setAttribute("aria-label", "結果棚を広げる");
    applyMobilePaneState({ focus: focusCode });
  }

  function revealResult({ input = false } = {}) {
    setResultCollapsed(false, false);
    if (compactViewport.matches) {
      if (mobilePane === "result") mobilePane = "code";
      openMobileResultDrawer({ expanded: input });
    } else {
      setMobilePane("result");
    }
  }

  function applyMobilePaneState({ focus = false } = {}) {
    document.body.dataset.mobilePane = mobilePane;
    document.querySelectorAll(".mobile-pane-button").forEach((button) => {
      const pane = button.dataset.mobilePane;
      const selected = pane === "result"
        ? mobileResultOpen || mobilePane === "result"
        : pane === mobilePane && !mobileResultOpen;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });

    const compact = compactViewport.matches;
    const panes = {
      learn: document.querySelector(".sidebar"),
      code: document.querySelector(".editor-column"),
      result: document.querySelector(".result-column"),
    };
    Object.entries(panes).forEach(([name, pane]) => {
      if (!pane) return;
      const drawerPane = compact && mobileResultOpen && name === "result";
      const inactive = compact && name !== mobilePane && !drawerPane;
      pane.inert = inactive;
      if (compact) pane.setAttribute("aria-hidden", String(inactive));
      else pane.removeAttribute("aria-hidden");
    });
    if (mobilePane === "code") {
      resizeEditor();
      if (focus && compact) requestAnimationFrame(() => editor?.focus());
    }
  }

  function setMobilePane(pane, options = {}) {
    if (!["learn", "code", "result"].includes(pane)) return;
    if (pane !== "result") closeMobileResultDrawer();
    mobilePane = pane;
    applyMobilePaneState(options);
  }

  function bindWorkspaceResizer(handle, side) {
    if (!handle) return;
    let startX = 0;
    let startSize = 0;
    let activePointerId = null;

    const updateSize = (nextSize, persist = false) => {
      if (side === "sidebar") sidebarWidth = nextSize;
      else resultWidth = nextSize;
      syncLayoutPresetButtons();
      applyWorkspaceSizes({ persist });
    };

    handle.addEventListener("pointerdown", (event) => {
      if (window.innerWidth <= 1080) return;
      startX = event.clientX;
      startSize = side === "sidebar" ? sidebarWidth : resultWidth;
      activePointerId = event.pointerId;
      handle.setPointerCapture?.(event.pointerId);
      document.body.classList.add("is-resizing-workspace");
    });
    handle.addEventListener("pointermove", (event) => {
      if (activePointerId !== event.pointerId) return;
      const delta = event.clientX - startX;
      updateSize(startSize + (side === "sidebar" ? delta : -delta));
    });
    const finishResize = (event) => {
      if (activePointerId !== event.pointerId) return;
      if (handle.hasPointerCapture?.(event.pointerId)) {
        handle.releasePointerCapture?.(event.pointerId);
      }
      activePointerId = null;
      document.body.classList.remove("is-resizing-workspace");
      applyWorkspaceSizes({ persist: true });
    };
    handle.addEventListener("pointerup", finishResize);
    handle.addEventListener("pointercancel", finishResize);
    handle.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
      event.preventDefault();
      const defaultSize = side === "sidebar" ? 290 : 350;
      const direction = side === "sidebar" ? 1 : -1;
      const step = event.shiftKey ? 48 : 16;
      const current = side === "sidebar" ? sidebarWidth : resultWidth;
      const next = event.key === "Home"
        ? defaultSize
        : current + (event.key === "ArrowRight" ? step : -step) * direction;
      updateSize(next, true);
    });
  }

  function bindMobileResultDrawer() {
    if (!elements.resultDrawerHandle) return;
    let startY = 0;
    let startHeight = 0;
    let latestRawHeight = 0;
    let moved = false;
    let suppressClick = false;
    let activePointerId = null;

    elements.resultDrawerHandle.addEventListener("pointerdown", (event) => {
      if (!compactViewport.matches || !mobileResultOpen) return;
      startY = event.clientY;
      startHeight = mobileResultHeight;
      latestRawHeight = startHeight;
      moved = false;
      activePointerId = event.pointerId;
      elements.resultDrawerHandle.setPointerCapture?.(event.pointerId);
      document.body.classList.add("is-resizing-result");
    });
    elements.resultDrawerHandle.addEventListener("pointermove", (event) => {
      if (activePointerId !== event.pointerId) return;
      latestRawHeight = startHeight + startY - event.clientY;
      if (Math.abs(event.clientY - startY) > 4) moved = true;
      updateMobileResultHeight(latestRawHeight);
    });
    const finishDrawerResize = (event) => {
      if (activePointerId !== event.pointerId) return;
      if (elements.resultDrawerHandle.hasPointerCapture?.(event.pointerId)) {
        elements.resultDrawerHandle.releasePointerCapture?.(event.pointerId);
      }
      activePointerId = null;
      document.body.classList.remove("is-resizing-result");
      if (moved) {
        suppressClick = true;
        if (latestRawHeight < 120) {
          closeMobileResultDrawer({ focusCode: true });
          return;
        }
        mobileResultExpanded = mobileResultHeight > window.innerHeight * 0.54;
        document.body.classList.toggle("mobile-result-expanded", mobileResultExpanded);
        elements.resultDrawerHandle.setAttribute(
          "aria-expanded",
          String(mobileResultExpanded),
        );
        localStorage.setItem(
          STORAGE.mobileResultHeight,
          String(Math.round(mobileResultHeight)),
        );
      }
    };
    elements.resultDrawerHandle.addEventListener("pointerup", finishDrawerResize);
    elements.resultDrawerHandle.addEventListener("pointercancel", finishDrawerResize);
    elements.resultDrawerHandle.addEventListener("click", () => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      openMobileResultDrawer({ expanded: !mobileResultExpanded });
    });
    elements.closeResultDrawerButton?.addEventListener("click", () =>
      closeMobileResultDrawer({ focusCode: true }));
  }

  function closeToolMenu() {
    if (elements.moreTools) elements.moreTools.open = false;
  }

  function updateEditorStatus() {
    const source = getSource();
    let row = 0;
    let column = 0;
    if (editor) {
      ({ row, column } = editor.getCursorPosition());
    } else {
      const before = source.slice(0, elements.editorFallback.selectionStart);
      const lines = before.split("\n");
      row = lines.length - 1;
      column = lines.at(-1).length;
    }
    elements.cursorStatus.textContent = `行 ${row + 1}, 列 ${column + 1}`;
    elements.characterStatus.textContent = `${source.length} 文字`;
  }

  function onSourceChanged() {
    sourceChanged = true;
    elements.saveStatus.textContent = "保存中…";
    updateEditorStatus();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      localStorage.setItem(STORAGE.source, getSource());
      elements.saveStatus.textContent = "自動保存済み";
    }, 350);
    scheduleAnalysis();
  }

  function scheduleAnalysis() {
    clearTimeout(analysisTimer);
    if (!runtimeReady || running) return;
    analysisTimer = setTimeout(() => {
      const requestId = ++analysisSequence;
      latestAnalysis = requestId;
      worker.postMessage({ type: "analyze", source: getSource(), requestId });
    }, 550);
  }

  function setRuntimeStatus(kind, text) {
    elements.runtimeStatus.dataset.runtimeState = kind;
    elements.runtimeStatus.title = text;
    if (kind !== "loading") announce(text);
  }

  function createWorker() {
    runtimeReady = false;
    elements.runButton.disabled = true;
    elements.checkLessonButton.disabled = true;
    setRuntimeStatus("loading", "実行環境を準備しています");
    worker = new Worker("playground-worker.js");
    worker.addEventListener("message", handleWorkerMessage);
    worker.addEventListener("error", (event) => {
      finishRun();
      setRuntimeStatus("error", "実行環境を開始できません");
      showDiagnostics([event.message || "Web Worker の起動に失敗しました"]);
    });
  }

  function handleWorkerMessage(event) {
    const message = event.data ?? {};
    if (message.type === "ready") {
      runtimeReady = true;
      elements.runButton.disabled = false;
      setRuntimeStatus("ready", "現行 Python 実装に接続済み");
      setRunFeedback("ready", "準備完了", 1200);
      runtimeNames = [...new Set([
        ...(message.builtins ?? []),
        ...(message.specialForms ?? []),
        ...(message.keywords ?? []),
      ])];
      lessons = message.lessons ?? [];
      if (message.gallery?.length) {
        galleryLoaded = true;
        examples = message.gallery;
        renderExamples();
      }
      lessonIndex = Math.min(Math.max(0, lessonIndex), Math.max(0, lessons.length - 1));
      completedLessons = new Set(
        [...completedLessons].filter((id) => lessons.some((lesson) => lesson.id === id)),
      );
      installCompleter(runtimeNames);
      renderReferences();
      renderLesson();
      scheduleAnalysis();
      return;
    }
    if (message.type === "boot-error") {
      setRuntimeStatus("error", "実行環境の読み込みに失敗");
      setRunFeedback("error", "準備できませんでした", 2600);
      showDiagnostics([message.message]);
      return;
    }
    if (message.type === "stream") {
      appendOutput(message.text, message.channel === "stderr");
      return;
    }
    if (message.type === "input") {
      currentInputId = message.id;
      elements.terminalPrompt.textContent = message.prompt || "入力";
      elements.terminalInputForm.hidden = false;
      elements.resultBody.classList.add("input-active");
      setRunFeedback("waiting", "入力待ち");
      revealResult({ input: true });
      selectResultTab("output");
      requestAnimationFrame(() => elements.terminalInput.focus());
      return;
    }
    if (message.type === "analysis" && message.requestId === latestAnalysis) {
      currentAst = message.ast;
      showDiagnostics(message.diagnostics ?? []);
      renderAst(currentAst);
      return;
    }
    if (message.type === "result") {
      currentAst = message.ast;
      renderAst(currentAst);
      showDiagnostics(message.ok ? [] : [message.error]);
      if (message.ok) {
        elements.runState.textContent = "完了";
        setRunFeedback("success", "できました", 1800);
        if (message.lesson) handleLessonResult(message.lesson);
        else if (
          currentLesson()?.dynamic &&
          activeLessonId === currentLesson()?.id &&
          currentSidePanel === "lesson"
        ) {
          evaluateAiLesson(message.result);
        }
      } else {
        appendOutput(localizeError(message.error), true);
        elements.runState.textContent = "エラー";
        setRunFeedback("error", "確認が必要です", 2600);
        selectResultTab("diagnostics");
        if (activeLessonId && currentSidePanel === "lesson") {
          recordLearning("failure", activeLessonId, localizeError(message.error));
          askRobot("runtime_error", {
            extra: `実行エラー:\n${localizeError(message.error)}`,
            fallback: explainLessonError(message.error),
          });
        }
      }
      elements.runTime.textContent = `${message.elapsedMs ?? 0} ms`;
      announce(message.ok ? "実行が完了しました" : "実行でエラーが見つかりました");
      finishRun();
    }
  }

  function installCompleter(names) {
    if (!editor || !window.ace) return;
    try {
      ace.require("ace/ext/language_tools");
      editor.completers = [{
        getCompletions(_editor, _session, _position, _prefix, callback) {
          callback(null, names.map((name) => ({
            caption: name,
            value: name,
            meta: /^[A-Z]/.test(name) ? "PopPop 処理" : "予約語",
            score: 1000,
          })));
        },
      }];
    } catch {
      // Completion is optional; editing and execution remain available.
    }
  }

  function startRun() {
    if (!runtimeReady || running) return;
    running = true;
    document.body.classList.add("is-running");
    sourceChanged = false;
    clearTimeout(analysisTimer);
    elements.runButton.disabled = true;
    elements.stopButton.disabled = false;
    clearOutput();
    elements.runState.textContent = "実行中";
    elements.runTime.textContent = "計測中…";
    setRunFeedback("running", "実行中…");
    if (activeLessonId && currentSidePanel === "lesson") {
      setRobotMood("thinking");
    }
    revealResult();
    selectResultTab("output");
    announce("実行を開始しました");
    elements.checkLessonButton.disabled = true;
    worker.postMessage({
      type: "run",
      source: getSource(),
      lessonId:
        currentSidePanel === "lesson" && !currentLesson()?.dynamic
          ? activeLessonId
          : null,
    });
  }

  function stopRun() {
    if (!worker) return;
    worker.terminate();
    worker = null;
    elements.terminalInputForm.hidden = true;
    elements.resultBody.classList.remove("input-active");
    currentInputId = null;
    appendOutput("実行を停止しました。", true);
    elements.runState.textContent = "停止";
    elements.runTime.textContent = "— ms";
    setRunFeedback("stopped", "停止しました", 1800);
    setRobotMood("encourage", 1800);
    finishRun();
    createWorker();
  }

  function finishRun() {
    running = false;
    document.body.classList.remove("is-running");
    elements.stopButton.disabled = true;
    elements.runButton.disabled = !runtimeReady;
    elements.checkLessonButton.disabled =
      !runtimeReady || !activeLessonId || currentSidePanel !== "lesson";
    elements.terminalInputForm.hidden = true;
    currentInputId = null;
    if (sourceChanged) scheduleAnalysis();
  }

  function valueText(value) {
    if (value === null) return "null";
    if (value === true) return "true";
    if (value === false) return "false";
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "object") {
      const compact = compactValueText(value);
      return compact.length <= 100 ? compact : JSON.stringify(value, null, 2);
    }
    return String(value);
  }

  function compactValueText(value) {
    if (Array.isArray(value)) {
      return `[${value.map(compactValueText).join(", ")}]`;
    }
    if (value !== null && typeof value === "object") {
      return `{${Object.entries(value).map(([key, item]) =>
        `${JSON.stringify(key)}: ${compactValueText(item)}`).join(", ")}}`;
    }
    if (value === null) return "null";
    if (value === true) return "true";
    if (value === false) return "false";
    return typeof value === "string" ? JSON.stringify(value) : String(value);
  }

  function clearOutput() {
    elements.outputPanel.replaceChildren();
    outputEndsWithNewline = true;
  }

  // Appends a chunk instead of rewriting textContent, so long outputs stay
  // fast and only stderr chunks are coloured as errors.
  function appendOutput(text, isError = false) {
    const value = String(text ?? "");
    const chunk = document.createElement("span");
    chunk.className = isError ? "output-chunk is-error" : "output-chunk";
    chunk.textContent = `${outputEndsWithNewline ? "" : "\n"}${value}`;
    elements.outputPanel.append(chunk);
    outputEndsWithNewline = value.endsWith("\n");
    elements.outputPanel.scrollTop = elements.outputPanel.scrollHeight;
  }

  function goToSourceLine(line) {
    const targetLine = Math.max(1, Number(line) || 1);
    if (compactViewport.matches) {
      closeMobileResultDrawer();
      setMobilePane("code");
    }
    requestAnimationFrame(() => {
      if (editor) {
        editor.gotoLine(targetLine, 0, true);
        editor.focus();
        return;
      }
      const lines = elements.editorFallback.value.split("\n");
      const offset = lines.slice(0, targetLine - 1)
        .reduce((total, value) => total + value.length + 1, 0);
      elements.editorFallback.focus();
      elements.editorFallback.setSelectionRange(offset, offset);
    });
  }

  function showDiagnostics(diagnostics) {
    const items = (diagnostics ?? []).filter(Boolean);
    const localizedItems = items.map(localizeError);
    elements.diagnosticCount.textContent = String(items.length);
    elements.diagnosticsPanel.replaceChildren();
    if (!items.length) {
      elements.diagnosticsPanel.textContent = "構文上の問題はありません。";
    } else {
      items.forEach((item, index) => {
        const line = Math.max(
          1,
          Number(window.PopPopLocalization?.errorLine(item) ?? 1),
        );
        const button = document.createElement("button");
        button.type = "button";
        button.className = "diagnostic-item";
        button.setAttribute("aria-label", `${line}行目へ移動: ${localizedItems[index]}`);
        const location = document.createElement("span");
        location.className = "diagnostic-location";
        location.textContent = `${line}行目`;
        const description = document.createElement("span");
        description.className = "diagnostic-message";
        description.textContent = localizedItems[index];
        button.append(location, description);
        button.addEventListener("click", () => goToSourceLine(line));
        elements.diagnosticsPanel.append(button);
      });
    }
    elements.diagnosticsPanel.classList.toggle("error", items.length > 0);
    if (editor) {
      editor.session.setAnnotations(items.map((item, index) => {
        const line = window.PopPopLocalization?.errorLine(item);
        return {
          row: Math.max(0, Number(line ?? 1) - 1),
          column: 0,
          text: localizedItems[index],
          type: "error",
        };
      }));
    }
  }

  function localizeError(error) {
    return window.PopPopLocalization?.localizeError(error)
      ?? String(error ?? "不明なエラーが発生しました。");
  }

  function renderAst(ast) {
    elements.astPanel.textContent = ast
      ? JSON.stringify(ast, null, 2)
      : "有効な構文木はありません。";
  }

  function selectResultTab(name) {
    currentResultTab = name;
    document.querySelectorAll(".result-tab").forEach((button) => {
      const selected = button.dataset.resultTab === name;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    elements.outputPanel.hidden = name !== "output";
    elements.diagnosticsPanel.hidden = name !== "diagnostics";
    elements.astPanel.hidden = name !== "ast";
  }

  async function loadSpecification() {
    try {
      // "no-cache" revalidates with the server every time, so edits show up
      // immediately while unchanged files are answered with a cheap 304.
      const url = new URL("poppop_specification.md", location.href);
      const response = await fetch(url, { cache: "no-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = parseSpecification(await response.text());
      referenceRows = parsed.references;
      if (!galleryLoaded) {
        examples = friendlySpecificationExamples(parsed.examples);
        renderExamples();
      }
      renderReferences();
    } catch (error) {
      if (!galleryLoaded) {
        examples = [{
          id: "fallback",
          category: "はじめの一歩",
          title: "はじめの一歩｜リストを2倍にしよう",
          description: "Mapを使う短い例です。",
          interactive: false,
          code: FALLBACK_SOURCE,
        }];
        renderExamples();
      }
      elements.referenceList.innerHTML =
        `<p class="muted">仕様書を読み込めませんでした: ${escapeHtml(error.message)}</p>`;
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function renderExamples() {
    const query = elements.exampleSearch.value.trim().toLowerCase();
    const visible = examples.filter((item) =>
      `${item.category} ${item.title} ${item.description} ${item.code}`
        .toLowerCase().includes(query));
    elements.exampleList.innerHTML = visible.length ? visible.map((item, index) => `
      <button class="example-card" type="button" data-example-index="${examples.indexOf(item)}">
        <span class="example-meta">
          <span class="example-category">${escapeHtml(item.category ?? "例")}</span>
          ${item.interactive ? '<span class="example-interactive">⌨ 入力あり</span>' : ""}
        </span>
        <strong>${escapeHtml(item.title.split("｜").at(-1))}</strong>
        <p>${escapeHtml(item.description ?? "すぐに実行できる例です。")}</p>
      </button>
    `).join("") : '<p class="muted">一致するコード例がありません。</p>';
    elements.exampleList.querySelectorAll("[data-example-index]").forEach((button) => {
      button.addEventListener("click", () => {
        const item = examples[Number(button.dataset.exampleIndex)];
        setMobilePane("code");
        setSource(item.code);
        showToast(item.interactive
          ? `「${item.title}」を読み込みました。実行すると入力欄が開きます`
          : `「${item.title}」を読み込みました`);
      });
    });
  }

  function renderReferences() {
    if (!runtimeNames.length || !referenceRows.length) return;
    const implemented = new Set(runtimeNames);
    const query = elements.referenceSearch.value.trim().toLowerCase();
    const visible = referenceRows.filter((item) =>
      implemented.has(item.name) &&
      `${item.category} ${item.name} ${item.input} ${item.description}`.toLowerCase().includes(query));
    elements.referenceList.innerHTML = visible.length ? visible.map((item) => `
      <article class="reference-card">
        <span class="category">${escapeHtml(item.category)}</span>
        <strong>${escapeHtml(item.name)}</strong>
        <p>入力: ${escapeHtml(item.input)}</p>
        <p>${escapeHtml(item.description)}</p>
      </article>
    `).join("") : '<p class="muted">一致する標準関数がありません。</p>';
  }

  function switchSidePanel(panel) {
    currentSidePanel = panel;
    const panels = {
      examples: [elements.examplesTab, elements.examplesPanel],
      reference: [elements.referenceTab, elements.referencePanel],
      lesson: [elements.lessonTab, elements.lessonPanel],
    };
    Object.entries(panels).forEach(([name, [tab, content]]) => {
      const selected = name === panel;
      tab.classList.toggle("active", selected);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      content.hidden = !selected;
    });
    document.body.classList.toggle("lesson-open", panel === "lesson");
    elements.checkLessonButton.disabled =
      !runtimeReady || !activeLessonId || panel !== "lesson";
    if (panel === "lesson") {
      renderTutorShell();
      if (tutorWelcomed && lessons.length && !activeLessonId) {
        openCurrentLesson({ introduction: true });
      }
    }
  }

  function currentLesson() {
    const baseLesson = lessons[lessonIndex] ?? null;
    return aiLesson ?? (baseLesson ? tunedLessons.get(baseLesson.id) : null) ?? baseLesson;
  }

  function renderLessonProgress() {
    const complete = completedLessons.size;
    const total = lessons.length;
    const percent = total ? (complete / total) * 100 : 0;
    const aiComplete = tutorLearning.aiCompleted || 0;
    const suffix = aiComplete ? ` + AI ${aiComplete}` : "";
    elements.lessonProgressText.textContent = `${complete} / ${total}${suffix}`;
    elements.lessonTabProgress.textContent =
      complete >= total && aiComplete ? `AI ${aiComplete}` : `${complete}/${total}`;
    elements.lessonProgressBar.style.width = `${percent}%`;
    const progress = elements.lessonProgressBar.parentElement;
    progress?.setAttribute("aria-valuemax", String(total || 0));
    progress?.setAttribute("aria-valuenow", String(complete));
  }

  function renderTutorShell() {
    elements.lessonPanel.classList.toggle("welcome-mode", !tutorWelcomed);
    if (tutorWelcomed) elements.lessonPanel.classList.remove("profile-mode");
    elements.tutorWelcome.hidden = tutorWelcomed;
    elements.tutorSession.hidden = !tutorWelcomed;
  }

  function renderLesson() {
    const lesson = currentLesson();
    renderTutorShell();
    renderLessonProgress();
    if (!lesson) {
      elements.lessonTitle.textContent = "準備中…";
      elements.lessonGoal.textContent = "実行環境からレッスンを読み込んでいます。";
      return;
    }
    elements.lessonBadge.textContent =
      completedLessons.has(lesson.id) || lesson.passed ? "✓" : lesson.badge;
    elements.lessonTitle.textContent = lesson.title;
    elements.lessonGoal.textContent = lesson.goal;
    elements.previousLessonButton.disabled = aiLesson ? false : lessonIndex === 0;
    elements.nextLessonButton.disabled = Boolean(aiLesson) || lessonIndex === lessons.length - 1;
    elements.hintButton.disabled = activeLessonId !== lesson.id;
    elements.showAnswerButton.disabled = activeLessonId !== lesson.id;
    const canAdvance = completedLessons.has(lesson.id) || lesson.passed;
    elements.checkLessonButton.disabled =
      !canAdvance &&
      (!runtimeReady || activeLessonId !== lesson.id || currentSidePanel !== "lesson");
    elements.checkLessonButton.dataset.action = canAdvance ? "advance" : "check";
    elements.checkLessonButton.textContent =
      canAdvance ? "次へ進む →" : "✓ 答え合わせ";
    elements.advanceLessonButton.hidden = true;
  }

  function clearLessonChat() {
    elements.lessonChat.textContent = "";
    currentChatSection = null;
  }

  function recentTutorConversation() {
    return (tutorLearning.conversation || [])
      .slice(-10)
      .map((entry) => {
        const role = entry.sender === "user" ? "学習者" : "ロボット君";
        const lesson = entry.lessonTitle ? `（${entry.lessonTitle}）` : "";
        return `${role}${lesson}: ${entry.text}`;
      })
      .join("\n");
  }

  function drawChatMessage(entry, target = elements.lessonChat) {
    const message = document.createElement("div");
    message.className = `chat-message ${entry.sender} ${entry.style || ""}`.trim();
    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    const current = currentLesson();
    if (
      entry.lessonTitle &&
      entry.lessonId &&
      current?.id &&
      entry.lessonId !== current.id
    ) {
      const context = document.createElement("span");
      context.className = "chat-context";
      context.textContent = `前の問題 · ${entry.lessonTitle}`;
      bubble.appendChild(context);
    }
    bubble.append(document.createTextNode(entry.text));
    message.appendChild(bubble);
    target.appendChild(message);
    return message;
  }

  function scrollChatToCurrent(behavior = "smooth") {
    if (!currentChatSection) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        elements.lessonChat.scrollTo({
          top: currentChatSection.offsetTop,
          behavior,
        });
      });
    });
  }

  function renderTutorConversation() {
    clearLessonChat();
    const entries = (tutorLearning.conversation || []).slice(-40);
    const lesson = currentLesson();
    let currentStart = entries.length;
    while (
      currentStart > 0 &&
      entries[currentStart - 1].lessonId === lesson?.id
    ) {
      currentStart -= 1;
    }

    entries.slice(0, currentStart).forEach((entry) => drawChatMessage(entry));

    currentChatSection = document.createElement("section");
    currentChatSection.className = "chat-current-section";
    if (currentStart > 0) {
      const marker = document.createElement("div");
      marker.className = "chat-current-marker";
      marker.textContent = `ここから「${lesson?.title || "この問題"}」`;
      currentChatSection.appendChild(marker);
    }
    entries
      .slice(currentStart)
      .forEach((entry) => drawChatMessage(entry, currentChatSection));
    elements.lessonChat.appendChild(currentChatSection);
    scrollChatToCurrent();
  }

  function addChatMessage(text, sender = "robot", style = "", persist = true) {
    const lesson = currentLesson();
    const entry = {
      sender,
      style,
      text: String(text),
      lessonId: lesson?.id || "",
      lessonTitle: lesson?.title || "",
      at: Date.now(),
    };
    if (persist) {
      tutorLearning.conversation = [
        ...(tutorLearning.conversation || []),
        entry,
      ].slice(-40);
      saveTutorLearning();
    }
    if (!currentChatSection) {
      renderTutorConversation();
      return;
    }
    const message = drawChatMessage(entry, currentChatSection);
    requestAnimationFrame(() => {
      message.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  function beginStreamingRobotMessage() {
    if (!currentChatSection) renderTutorConversation();
    const lesson = currentLesson();
    const entry = {
      sender: "robot",
      style: "streaming",
      text: "…",
      lessonId: lesson?.id || "",
      lessonTitle: lesson?.title || "",
      at: Date.now(),
    };
    const element = drawChatMessage(entry, currentChatSection);
    const bubble = element.querySelector(".chat-bubble");
    element.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return { element, bubble, entry };
  }

  function updateStreamingRobotMessage(streamMessage, text) {
    const value = String(text || "").trimStart();
    if (!value || !streamMessage?.bubble) return;
    streamMessage.bubble.textContent = value;
    streamMessage.element.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function finishStreamingRobotMessage(
    streamMessage,
    text,
    success = false,
    persist = true,
  ) {
    if (!streamMessage?.element) return;
    const value = String(text || "").trim();
    streamMessage.bubble.textContent = value;
    streamMessage.element.classList.remove("streaming");
    streamMessage.element.classList.toggle("success", success);
    if (!persist) return;
    streamMessage.entry.text = value;
    streamMessage.entry.style = success ? "success" : "";
    tutorLearning.conversation = [
      ...(tutorLearning.conversation || []),
      streamMessage.entry,
    ].slice(-40);
    saveTutorLearning();
  }

  function discardStreamingRobotMessage(streamMessage) {
    streamMessage?.element?.remove();
  }

  function robotSpeak(text, success = false) {
    addChatMessage(text, "robot", success ? "success" : "");
  }

  function setRobotMood(mood = "neutral", duration = 0) {
    clearTimeout(robotMoodTimer);
    elements.robotAvatar.classList.remove(
      "happy", "thinking", "encourage", "sad", "surprised",
    );
    if (mood !== "neutral") elements.robotAvatar.classList.add(mood);
    if (duration) {
      robotMoodTimer = setTimeout(() => {
        elements.robotAvatar.classList.remove(
          "happy", "thinking", "encourage", "sad", "surprised",
        );
      }, duration);
    }
  }

  function setTutorBusy(busy) {
    elements.tutorStatus.classList.toggle("busy", busy);
    elements.tutorStatus.lastChild.textContent = busy ? " 考えています…" : " Gemini先生";
    elements.tutorThinking.hidden = !busy;
  }

  function setLessonTuning(busy) {
    elements.lessonTuning.hidden = !busy;
    elements.tutorSession.setAttribute("aria-busy", String(busy));
  }

  function learnerProfileSummary() {
    const optional = [
      ["年齢", tutorProfile.age],
      ["性別", tutorProfile.gender],
      ["場所", tutorProfile.location],
      ["職業", tutorProfile.occupation],
    ]
      .filter(([, value]) => value)
      .map(([label, value]) => `${label}: ${value}`)
      .join("、");
    return [
      `学習者の経験: ${tutorProfile.level}`,
      `学習者が作りたいもの: ${tutorProfile.goal || "まだ決めていない"}`,
      optional ? `学習者が任意で共有したプロフィール: ${optional}` : "",
      optional
        ? "任意プロフィールは題材・語彙・説明量の調整にだけ使い、決めつけや固定観念に使わないでください。"
        : "",
    ].filter(Boolean).join("\n");
  }

  function selectLesson(nextIndex) {
    if (!lessons.length) return;
    aiLesson = null;
    lessonIndex = Math.min(Math.max(0, nextIndex), lessons.length - 1);
    activeLessonId = null;
    hintIndex = 0;
    localStorage.setItem(STORAGE.lessonIndex, String(lessonIndex));
    renderLesson();
    openCurrentLesson({ introduction: true });
  }

  function showTutorProfile() {
    elements.welcomeIntro.hidden = true;
    elements.tutorProfileForm.hidden = false;
    elements.lessonPanel.classList.add("profile-mode");
    elements.tutorGoal.value = tutorProfile.goal;
    elements.tutorAge.value = tutorProfile.age || "";
    elements.tutorGender.value = tutorProfile.gender || "";
    elements.tutorLocation.value = tutorProfile.location || "";
    elements.tutorOccupation.value = tutorProfile.occupation || "";
    const optionalProfile = elements.tutorProfileForm.querySelector(".profile-optional");
    if (optionalProfile) {
      optionalProfile.open = Boolean(
        tutorProfile.age ||
        tutorProfile.gender ||
        tutorProfile.location ||
        tutorProfile.occupation
      );
    }
    document.querySelectorAll('input[name="tutorLevel"]').forEach((input) => {
      input.checked = input.value === tutorProfile.level;
    });
    elements.tutorGoal.focus();
  }

  function welcomeTutor(event) {
    event.preventDefault();
    const selectedLevel = document.querySelector('input[name="tutorLevel"]:checked');
    tutorProfile = {
      level: selectedLevel?.value || "はじめて",
      goal: elements.tutorGoal.value.trim(),
      age: elements.tutorAge.value,
      gender: elements.tutorGender.value,
      location: elements.tutorLocation.value,
      occupation: elements.tutorOccupation.value,
    };
    localStorage.setItem(STORAGE.tutorProfile, JSON.stringify(tutorProfile));
    tutorProfileRevision += 1;
    tunedLessons.clear();
    tuningRequests.clear();
    tutorLearning = { lessons: {}, recent: [], conversation: [], aiCompleted: 0 };
    saveTutorLearning();
    tutorWelcomed = true;
    localStorage.setItem(STORAGE.tutorWelcomed, "yes");
    lessonIndex = 0;
    localStorage.setItem(STORAGE.lessonIndex, "0");
    renderTutorShell();
    openCurrentLesson({ introduction: true, firstMeeting: true });
  }

  function resetLessons() {
    if (!confirm("レッスン進捗と、経験レベル・作りたいものなどのAI設定をすべて消しますか？")) return;
    completedLessons.clear();
    tunedLessons.clear();
    tuningRequests.clear();
    aiLesson = null;
    activeLessonId = null;
    hintIndex = 0;
    lessonIndex = 0;
    tutorProfile = {
      level: "はじめて",
      goal: "",
      age: "",
      gender: "",
      location: "",
      occupation: "",
    };
    tutorLearning = { lessons: {}, recent: [], conversation: [], aiCompleted: 0 };
    tutorProfileRevision += 1;
    tutorWelcomed = false;
    tutorRequestSequence += 1;
    localStorage.removeItem(STORAGE.lessonProgress);
    localStorage.removeItem(STORAGE.lessonIndex);
    localStorage.removeItem(STORAGE.tutorProfile);
    localStorage.removeItem(STORAGE.tutorWelcomed);
    localStorage.removeItem(STORAGE.tutorLearning);
    elements.tutorProfileForm.reset();
    elements.tutorProfileForm.hidden = true;
    elements.welcomeIntro.hidden = false;
    elements.lessonPanel.classList.remove("profile-mode");
    clearLessonChat();
    setTutorBusy(false);
    setRobotMood("neutral");
    if (lessons[0]) setSource(lessons[0].starter, { focus: false });
    renderLesson();
    showToast("進捗とAI設定をリセットしました");
  }

  function openCurrentLesson({ introduction = false, firstMeeting = false } = {}) {
    const lesson = currentLesson();
    if (!lesson) return;
    activeLessonId = lesson.id;
    hintIndex = 0;
    setRobotMood("neutral");
    setSource(lesson.starter, { focus: false });
    renderLesson();
    renderTutorConversation();
    if (introduction) {
      const baseLesson = lessons[lessonIndex];
      const cachedTuning = baseLesson ? tunedLessons.get(baseLesson.id) : null;
      if (!aiLesson && lessonIndex > 0 && !cachedTuning) {
        void tuneLessonForProfile(baseLesson).then(prefetchFollowingLesson);
      } else if (cachedTuning) {
        setRobotMood(cachedTuning.mood || "neutral", 2800);
        robotSpeak(cachedTuning.intro);
      } else {
        void askRobot(firstMeeting ? "first_meeting" : "lesson_start", {
          fallback: firstMeeting
            ? `はじめまして！ ロボット君です。\n最初の目標は「${lesson.goal}」。一緒にやってみよう！`
            : `${lesson.intro}\n目標は「${lesson.goal}」。できたら答え合わせしてね。`,
        }).finally(() => {
          if (lessonIndex === 0) prefetchFollowingLesson();
        });
      }
    }
  }

  function prefetchFollowingLesson() {
    if (!tutorWelcomed || aiLesson) return;
    const nextLesson = lessons[lessonIndex + 1];
    if (!nextLesson || tunedLessons.has(nextLesson.id)) return;
    void tuneLessonForProfile(nextLesson, { background: true });
  }

  async function tuneLessonForProfile(baseLesson, { background = false } = {}) {
    if (!baseLesson || baseLesson.id === lessons[0]?.id) return null;
    const cached = tunedLessons.get(baseLesson.id);
    if (cached) return cached;
    const profileRevision = tutorProfileRevision;
    let request = tuningRequests.get(baseLesson.id);
    if (!request) {
      request = generateTunedLesson(baseLesson)
        .then((tuned) => {
          if (profileRevision !== tutorProfileRevision) return null;
          tunedLessons.set(baseLesson.id, tuned);
          return tuned;
        })
        .finally(() => {
          if (tuningRequests.get(baseLesson.id) === request) {
            tuningRequests.delete(baseLesson.id);
          }
        });
      tuningRequests.set(baseLesson.id, request);
    }
    if (background) {
      try {
        return await request;
      } catch {
        return null;
      }
    }

    setRobotMood("thinking");
    setTutorBusy(true);
    setLessonTuning(true);
    try {
      const tuned = await request;
      if (tuned && activeLessonId === baseLesson.id && !aiLesson) {
        setSource(tuned.starter, { focus: false });
        renderLesson();
        setRobotMood(tuned.mood, 2800);
        robotSpeak(tuned.intro);
      }
      return tuned;
    } catch {
      if (activeLessonId === baseLesson.id && !aiLesson) {
        setRobotMood("encourage", 2200);
        robotSpeak(baseLesson.intro);
      }
      return null;
    } finally {
      setLessonTuning(false);
      setTutorBusy(false);
    }
  }

  async function generateTunedLesson(baseLesson) {
    const requiredFeature = LESSON_FEATURES[baseLesson.id];
    const text = await gemini.call(
      [
          "あなたはPopPop言語の教材編集者です。",
          "次の既存レッスンを参考に、学習者一人のための新しい問題を一問だけ作ってください。",
          `今回必ず学ぶ機能は ${requiredFeature} です。starterとsolutionの両方で使ってください。`,
          "元のコードのパイプ、文末、ブロック構造は一切増減させないでください。",
          "変更してよいのは、文字列・数値・小文字の変数名と、既存ブロック内の短い式だけです。",
          "存在しない関数呼び出し形式を作ってはいけません。Range(1, 6)、Sum()、Check(x) のようには書けません。",
          "標準関数は `1 >> Range >> values.` や `values >> Sum >> total.` のようにパイプの段階として書きます。",
          "Mapなどの置換名だけは、元の例と同じ `Map(name): ... ..` の形を保ちます。",
          "starterは実行可能だが目標をまだ満たさず、solutionは目標を満たす完成コードにします。",
          "starterとsolutionの最後の文は、必ず `値または変数 >> Display.` にしてください。",
          "改行には構文上の意味がありません。通常の文は `.`、ブロック全体は `..` で閉じます。",
          "小学高学年でも一度で読める、自然で優しい日本語にしてください。",
          "題名は「何を作るか」が分かる18文字以内の表現にし、できれば「〜しよう」で終えてください。",
          "「全員を変換」「非破壊更新」「道を選ぶ」のような直訳調・仕様書調の題名は禁止です。",
          "List、Dict、Boolean、accumulatorなどの専門語は避け、リスト、辞書、true、これまでの結果と書いてください。",
          "introとgoalは、生成したstarterとsolutionで実際に使う値や処理だけを正確に説明してください。",
          "コードで使っていないデータ構造や機能を、intro・goal・hintsに書いてはいけません。",
          "一文には一つの行動だけを書き、introは80文字以内、goalは60文字以内、hintsは2個にしてください。",
          "JSONだけを返してください。",
          '形式: {"title":"題名","intro":"導入","goal":"目標","starter":"未完成コード","solution":"完成コード","hints":["ヒント1","ヒント2"],"mood":"neutral"}',
          "moodは neutral, happy, thinking, encourage, surprised のいずれかです。",
          learnerProfileSummary(),
          `これまでの学習記録: ${learningSummary()}`,
          `これまでの会話:\n${recentTutorConversation() || "なし"}`,
          `今回の難易度方針: ${nextDifficultyGuidance()}`,
          `元の題名: ${baseLesson.title}`,
          `元の導入: ${baseLesson.intro}`,
          `元の目標: ${baseLesson.goal}`,
          `元のヒント: ${(baseLesson.hints || []).join(" / ")}`,
          `安全な未完成コード例:\n${baseLesson.starter}`,
          `安全な完成コード例:\n${baseLesson.solution}`,
      ].join("\n\n"),
      true,
      "lesson",
    );
    const data = parseJsonText(text);
    if (
      !data?.title || !data?.intro || !data?.goal ||
      !data?.starter || !data?.solution || !Array.isArray(data?.hints)
    ) {
      throw new Error("生成した問題を読み取れませんでした");
    }
    if (
      data.hints.length < 2 ||
      !hasFinalDisplay(data.starter) || !hasFinalDisplay(data.solution) ||
      !String(data.starter).includes(requiredFeature) ||
      !String(data.solution).includes(requiredFeature) ||
      String(data.starter).trim() === String(data.solution).trim()
    ) {
      throw new Error("生成した問題がレッスン条件を満たしませんでした");
    }
    const [starterValidation, solutionValidation] = await Promise.all([
      sandbox.validate(data.starter),
      sandbox.validate(data.solution),
    ]);
    if (!starterValidation.ok || !solutionValidation.ok) {
      throw new Error(
        `生成コードに未定義の文法があります: ${
          starterValidation.error || solutionValidation.error || "構文エラー"
        }`,
      );
    }
    const moods = ["neutral", "happy", "thinking", "encourage", "surprised"];
    return {
      ...baseLesson,
      dynamic: true,
      title: String(data.title).slice(0, 40),
      intro: String(data.intro).slice(0, 160),
      goal: String(data.goal).slice(0, 120),
      starter: String(data.starter).trim(),
      solution: String(data.solution).trim(),
      hints: data.hints.slice(0, 2).map((hint) => String(hint).slice(0, 180)),
      mood: moods.includes(data.mood) ? data.mood : "neutral",
    };
  }

  async function showLessonHint() {
    const lesson = currentLesson();
    if (!lesson || activeLessonId !== lesson.id) return;
    const hints = lesson.hints ?? [];
    if (!hints.length) return;
    const hint = hints[hintIndex];
    hintIndex = Math.min(hintIndex + 1, hints.length - 1);
    recordLearning("hint", lesson.id, hint);
    await askRobot("hint", {
      extra: `教材のヒント: ${hint}`,
      fallback: `ここに注目してみよう：${hint}`,
    });
  }

  async function showLessonAnswer() {
    const lesson = currentLesson();
    if (!lesson || activeLessonId !== lesson.id) return;
    recordLearning("answer", lesson.id, "完成例を表示");
    setMobilePane("code");
    setSource(lesson.solution);
    await askRobot("answer_revealed", {
      fallback: "答えを表示したよ。実行して、値の流れを一緒に確かめよう。",
    });
  }

  async function handleLessonResult(validation) {
    const lesson = currentLesson();
    if (!lesson || activeLessonId !== lesson.id) return;
    setMobilePane("learn");
    if (validation.passed) {
      recordLearning("success", lesson.id, validation.message);
      completedLessons.add(lesson.id);
      localStorage.setItem(
        STORAGE.lessonProgress,
        JSON.stringify([...completedLessons]),
      );
      renderLesson();
      prefetchFollowingLesson();
      await askRobot(
        lessonIndex < lessons.length - 1 ? "correct" : "course_complete",
        {
          extra: `実行環境の判定: ${validation.message}`,
          fallback: lessonIndex < lessons.length - 1
            ? `正解！ ${validation.message} 次もきっとできるよ。`
            : `全レッスン完走！ ${validation.message} 本当におめでとう！`,
          success: true,
        },
      );
    } else {
      recordLearning("failure", lesson.id, validation.message);
      await askRobot("incorrect", {
        extra: `実行環境の判定: ${validation.message}`,
        fallback: `${validation.message}\nあと少し。コードの流れを一緒に見直そう。`,
      });
    }
  }

  function hasFinalDisplay(source) {
    return />>\s*Display\.\s*$/.test(String(source || ""));
  }

  async function askRobot(event, {
    extra = "",
    fallback = "いっしょに考えてみよう。",
    success = false,
  } = {}) {
    const lesson = currentLesson();
    const requestId = ++tutorRequestSequence;
    setRobotMood("thinking");
    setTutorBusy(true);
    const streamMessage = beginStreamingRobotMessage();
    try {
      const text = await gemini.stream(
        [
          "あなたはPopPop Playgroundに住む、親しみやすいロボット先生です。",
          "幼すぎない、短く自然な日本語で話します。1回の発言は原則80文字以内です。",
          "ユーザーの答えを奪わず、次の一歩が分かる言葉を選びます。",
          "正誤は与えられた実行環境の判定に必ず従い、自分で覆しません。",
          "与えられていない原因を推測して断定してはいけません。混雑や障害は、追加情報に明記された場合だけ説明します。",
          "状況に合う表情をあなた自身で選んでください。",
          "moodは neutral, happy, thinking, encourage, sad, surprised のいずれかです。",
          "JSONだけを返してください。",
          '形式: {"message":"画面に表示する発言","mood":"表情"}',
          `出来事: ${event}`,
          learnerProfileSummary(),
          `これまでの学習記録: ${learningSummary()}`,
          `レッスン: ${lesson?.title || "なし"}`,
          `目標: ${lesson?.goal || "なし"}`,
          `現在のコード:\n${getSource()}`,
          `直前の会話:\n${recentTutorConversation() || "なし"}`,
          extra,
        ].filter(Boolean).join("\n\n"),
        true,
        "chat",
        (partialText) => {
          if (requestId !== tutorRequestSequence) return;
          updateStreamingRobotMessage(
            streamMessage,
            extractPartialJsonString(partialText, "message").slice(0, 240),
          );
        },
      );
      if (requestId !== tutorRequestSequence) {
        discardStreamingRobotMessage(streamMessage);
        return;
      }
      const data = parseJsonText(text);
      const moods = new Set(["neutral", "happy", "thinking", "encourage", "sad", "surprised"]);
      const mood = moods.has(data?.mood) ? data.mood : success ? "happy" : "neutral";
      const message = String(data?.message || fallback).trim().slice(0, 240);
      setRobotMood(mood, mood === "thinking" ? 1800 : 3200);
      finishStreamingRobotMessage(
        streamMessage,
        message,
        success || mood === "happy",
      );
    } catch {
      if (requestId !== tutorRequestSequence) {
        discardStreamingRobotMessage(streamMessage);
        return;
      }
      setRobotMood(success ? "happy" : "encourage", 2400);
      finishStreamingRobotMessage(streamMessage, fallback, success);
    } finally {
      if (requestId === tutorRequestSequence) setTutorBusy(false);
    }
  }

  async function evaluateAiLesson(result) {
    const lesson = currentLesson();
    if (!lesson?.dynamic) return;
    setMobilePane("learn");
    const requestId = ++tutorRequestSequence;
    setRobotMood("thinking");
    setTutorBusy(true);
    const streamMessage = beginStreamingRobotMessage();
    try {
      const text = await gemini.stream(
        [
          "あなたはPopPop言語の練習問題を採点する先生です。",
          "完成例との文字列一致ではなく、目標を達成しているかで判定してください。",
          "JSONだけを返してください。",
          '形式: {"passed":true,"message":"80文字以内の講評","mood":"happy"}',
          "moodは happy, encourage, thinking, surprised のいずれかです。",
          `目標: ${lesson.goal}`,
          `完成例:\n${lesson.solution}`,
          `ユーザーのコード:\n${getSource()}`,
          `実行結果: ${JSON.stringify(result)}`,
        ].join("\n\n"),
        true,
        "chat",
        (partialText) => {
          if (requestId !== tutorRequestSequence) return;
          updateStreamingRobotMessage(
            streamMessage,
            extractPartialJsonString(partialText, "message").slice(0, 320),
          );
        },
      );
      if (requestId !== tutorRequestSequence) {
        discardStreamingRobotMessage(streamMessage);
        return;
      }
      const data = parseJsonText(text);
      const passed = data?.passed === true;
      if (passed) {
        recordLearning("success", lesson.id, data?.message || "目標達成");
        if (lessons.some((baseLesson) => baseLesson.id === lesson.id)) {
          completedLessons.add(lesson.id);
          localStorage.setItem(
            STORAGE.lessonProgress,
            JSON.stringify([...completedLessons]),
          );
          prefetchFollowingLesson();
        } else if (!lesson.passed) {
          lesson.passed = true;
          tutorLearning.aiCompleted = (tutorLearning.aiCompleted || 0) + 1;
          saveTutorLearning();
        }
        renderLesson();
      } else if (!passed) {
        recordLearning("failure", lesson.id, data?.message || "目標未達成");
      }
      const mood = ["happy", "encourage", "thinking", "surprised"].includes(data?.mood)
        ? data.mood
        : passed ? "happy" : "encourage";
      setRobotMood(mood, 3200);
      finishStreamingRobotMessage(
        streamMessage,
        String(data?.message || (passed ? "目標達成！ よくできました。" : "あと少し。出力を見直してみよう。")).slice(0, 240),
        passed,
      );
    } catch {
      if (requestId !== tutorRequestSequence) {
        discardStreamingRobotMessage(streamMessage);
        return;
      }
      setRobotMood("encourage", 2400);
      finishStreamingRobotMessage(
        streamMessage,
        "実行できたね。出力と目標が同じになっているか、見比べてみよう。",
      );
    } finally {
      if (requestId === tutorRequestSequence) setTutorBusy(false);
    }
  }

  async function generateOpenEndedLesson(repairNote = "", onCode = () => {}) {
    const text = await gemini.stream(
        [
          "あなたはPopPop言語のやさしい先生です。",
          "基礎8問を終えた学習者向けの、少し発展的な練習問題を1つ作ってください。",
          "PopPopは `>>` で値を流し、通常の文は `.`、ブロック全体は `..` で閉じます。",
          "使えるもの: Display, Map(name):, Filter(name):, Reduce(name):, Check(name): is ... else:, Update(name):, Fork(name):, Range, Sum, Length, Random, Get。",
          "標準関数を `Range(1, 6)` や `Sum()` のような括弧付き関数呼び出しにしてはいけません。",
          "標準関数は `1 >> Range >> values.` や `values >> Sum >> total.` のように、パイプの段階として書いてください。",
          "ブロックは提示した `Map(name): ... ..` などの形を崩さないでください。",
          "最終結果は必ず `>> Display.` で表示してください。",
          "starterには、学習者が必ず修正しなければ目標を達成できない誤りを一つだけ残してください。",
          "starterとsolutionは、変数名や空白だけでなく、演算子・条件・値・処理段階のいずれかが意味的に異なる必要があります。",
          "starterをそのまま実行して正解になる問題は絶対に作らないでください。",
          "solutionは必ず、その誤りを直した実行可能な完成形にしてください。",
          "InputとRandomは使わず、同じ入力なら常に同じ結果になる問題にしてください。",
          "学習者が作りたいものを単に題名へ入れるのではなく、その用途で本当に使うデータと計算に反映してください。",
          "買い物の集計、ゲームの得点判定、予定や記録の整理など、結果の使い道が分かる実利的な題材にしてください。",
          "可能なら Filter の後に Sum を使うなど、既習機能を2段階以上組み合わせてください。",
          "次の検査済みの形を参考に、値・名前・式を題材に合わせて変更してください。",
          "Mapの形:\n[1, 2, 3] >> Map(value):\n    value * 2.\n.. >> result.\nresult >> Display.",
          "Filterの形:\n[1, 2, 3, 4] >> Filter(value):\n    value % 2 == 0.\n.. >> result.\nresult >> Display.",
          "Reduceの形:\n[1, 2, 3] >> Reduce(values):\n    values[0] + values[1].\n.. >> result.\nresult >> Display.",
          "二段階集計の形:\n[120, 80, 250] >> Filter(price):\n    price >= 100.\n.. >> selected.\nselected >> Sum >> total.\ntotal >> Display.",
          learnerProfileSummary(),
          `これまでの学習記録: ${learningSummary()}`,
          `これまでの会話:\n${recentTutorConversation() || "なし"}`,
          `今回の難易度方針: ${nextDifficultyGuidance()}`,
          `基礎8問の後に解いたAI問題数: ${tutorLearning.aiCompleted || 0}`,
          repairNote
            ? `前回の案は検査に失敗しました: ${repairNote}\n同じ誤りを直し、完全なJSONを返してください。`
            : "",
          "JSONだけを返してください。",
          '形式: {"title":"短いタイトル","goal":"目標","starter":"未完成コード","solution":"完成コード","hints":["ヒント1","ヒント2"]}',
        ].filter(Boolean).join("\n"),
        true,
        "lesson",
        (partialText) => {
          const starter = extractPartialJsonString(partialText, "starter");
          if (starter) onCode(starter);
        },
      );
    const data = parseJsonText(text);
    if (!data?.starter || !data?.solution || !data?.goal) {
      throw new Error("AIの問題形式を読み取れませんでした");
    }
    if (!hasFinalDisplay(data.starter) || !hasFinalDisplay(data.solution)) {
      throw new Error("最後に Display を使う問題を作れませんでした");
    }
    if (
      String(data.starter).replace(/\s+/g, "") ===
      String(data.solution).replace(/\s+/g, "")
    ) {
      throw new Error("開始コードが完成コードと同じです");
    }
    if (/\b(?:Input|Random)\b/.test(`${data.starter}\n${data.solution}`)) {
      throw new Error("事前実行できない Input または Random が含まれています");
    }
    const [starterValidation, solutionValidation] = await Promise.all([
      sandbox.validate(data.starter),
      sandbox.validate(data.solution),
    ]);
    if (!solutionValidation.ok) {
      throw new Error(
        `完成コードに未定義の文法があります: ${
          solutionValidation.error || "構文エラー"
        }`,
      );
    }
    const solutionRun = await sandbox.preflight(data.solution);
    if (!solutionRun.ok) {
      throw new Error(`完成コードを実行できません: ${solutionRun.error || "実行エラー"}`);
    }
    if (starterValidation.ok) {
      const starterRun = await sandbox.preflight(data.starter);
      if (
        starterRun.ok &&
        JSON.stringify([starterRun.result, starterRun.output]) ===
          JSON.stringify([solutionRun.result, solutionRun.output])
      ) {
        throw new Error("開始コードがすでに正解と同じ結果を出します");
      }
    }
    return {
      data,
      starterIssue: starterValidation.ok
        ? ""
        : String(starterValidation.error || "開始コードの実行エラー"),
    };
  }

  function aiLessonFailureMessage(error) {
    const message = String(error?.message || "");
    if (error?.status === 429) {
      return "Geminiの利用上限に達したようです。少し待ってから、もう一度試してね。";
    }
    if (/文法|構文|Display|形式|読み取れ|実行|時間切れ|開始コード|Input|Random/.test(message)) {
      return "問題案は届いたけれど、PopPopの検査を通過できなかったよ。もう一度押すと別の案で試せるよ。";
    }
    return "Geminiとの通信に失敗したよ。接続を確認して、もう一度試してね。";
  }

  async function createAiLesson() {
    const sourceBeforeGeneration = getSource();
    const editorWasReadOnly = editor?.getReadOnly?.() || false;
    elements.advanceLessonButton.hidden = true;
    elements.runButton.disabled = true;
    if (editor) editor.setReadOnly(true);
    else elements.editorFallback.readOnly = true;
    setRobotMood("thinking");
    setTutorBusy(true);
    try {
      let data = null;
      let lastError = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const generated = await generateOpenEndedLesson(
            attempt > 0 ? String(lastError?.message || "") : "",
            (partialStarter) => {
              setSource(partialStarter, { markChanged: false, focus: false });
            },
          );
          data = generated.data;
          data.starterIssue = generated.starterIssue;
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!data) throw lastError || new Error("問題を生成できませんでした");
      aiLesson = {
        id: `ai-${Date.now()}`,
        dynamic: true,
        badge: `AI ${Number(tutorLearning.aiCompleted || 0) + 1}`,
        passed: false,
        title: data.title || "AI問題",
        goal: data.goal,
        intro: "Geminiが作ったその場限りの問題です。",
        starter: data.starter,
        solution: data.solution,
        hints: Array.isArray(data.hints) ? data.hints : [],
        starterIssue: data.starterIssue || "",
      };
      activeLessonId = aiLesson.id;
      hintIndex = 0;
      setSource(aiLesson.starter, { focus: false });
      renderLesson();
      renderTutorConversation();
      await askRobot("ai_lesson_created", {
        extra: [
          `あなたが作った新しい問題の目標: ${aiLesson.goal}`,
          aiLesson.starterIssue
            ? `開始コードの事前検査で見つかった問題: ${aiLesson.starterIssue}\nこれは学習者が直す課題です。答えを直接言わず、最初に見る場所を伝えてください。`
            : "開始コードは事前検査を通過しました。",
        ].join("\n"),
        fallback: `${aiLesson.title}\n${aiLesson.goal}\nできたら答え合わせしてね。`,
      });
    } catch (error) {
      console.warn("AI lesson generation failed", error);
      setSource(sourceBeforeGeneration, { markChanged: false, focus: false });
      setRobotMood("encourage", 1800);
      robotSpeak(aiLessonFailureMessage(error));
      renderLesson();
    } finally {
      if (editor) editor.setReadOnly(editorWasReadOnly);
      else elements.editorFallback.readOnly = false;
      elements.runButton.disabled = !runtimeReady || running;
      setTutorBusy(false);
    }
  }

  function explainLessonError(error) {
    const text = String(error ?? "");
    const localized = localizeError(error);
    if (text.includes("SyntaxError")) {
      setRobotMood("encourage", 1800);
      return `文法を読み取れなかったよ。\n${localized}\n\`. \` や \`..\`、括弧の閉じ忘れを確認してみよう。`;
    }
    if (text.includes("Undefined") || text.includes("not defined")) {
      return `まだ名前が作られていないようです。\n${localized}\n名前を付けるパイプが先に実行されているか見てみよう。`;
    }
    return `実行中に問題を見つけました。\n${localized}\n慌てなくて大丈夫。ヒントも使えます。`;
  }

  function saveTutorLearning() {
    localStorage.setItem(STORAGE.tutorLearning, JSON.stringify(tutorLearning));
  }

  function recordLearning(kind, lessonId, detail = "") {
    if (!lessonId) return;
    const stats = tutorLearning.lessons[lessonId] || {
      attempts: 0,
      failures: 0,
      hints: 0,
      answers: 0,
      successes: 0,
      lastIssue: "",
    };
    if (kind === "success") {
      stats.attempts += 1;
      stats.successes += 1;
    } else if (kind === "failure") {
      stats.attempts += 1;
      stats.failures += 1;
      stats.lastIssue = String(detail).slice(0, 180);
    } else if (kind === "hint") {
      stats.hints += 1;
    } else if (kind === "answer") {
      stats.answers = (stats.answers || 0) + 1;
    }
    tutorLearning.lessons[lessonId] = stats;
    tutorLearning.recent = [
      ...(tutorLearning.recent || []),
      {
        kind,
        lessonId,
        detail: String(detail).slice(0, 180),
      },
    ].slice(-8);
    saveTutorLearning();
  }

  function learningSummary() {
    const entries = Object.entries(tutorLearning.lessons || {});
    if (!entries.length) return "まだ記録はありません";
    return entries.map(([id, stats]) =>
      `${id}: 挑戦${stats.attempts || 0}回、失敗${stats.failures || 0}回、` +
      `ヒント${stats.hints || 0}回、答え表示${stats.answers || 0}回、正解${stats.successes || 0}回` +
      (stats.lastIssue ? `、直近の課題「${stats.lastIssue}」` : "")
    ).join(" / ");
  }

  function nextDifficultyGuidance() {
    const stats = Object.values(tutorLearning.lessons || {});
    const failures = stats.reduce((sum, item) => sum + (item.failures || 0), 0);
    const hints = stats.reduce((sum, item) => sum + (item.hints || 0), 0);
    const answers = stats.reduce((sum, item) => sum + (item.answers || 0), 0);
    const successes = stats.reduce((sum, item) => sum + (item.successes || 0), 0);
    if (failures >= successes + 2 || hints + answers >= successes + 2) {
      return "一度に直す場所を一つにし、具体例を含むやさしい説明にする";
    }
    if (successes >= 3 && failures === 0 && hints === 0) {
      return "構文の骨格は変えず、値や題材を少し考えさせる内容にする";
    }
    return "一度に一つの概念を扱い、現在の標準的な難しさを保つ";
  }

  async function answerLessonQuestion(question) {
    const lesson = currentLesson();
    if (!lesson) {
      robotSpeak("レッスンを準備しています。少し待ってね。");
      return;
    }
    const requestId = ++tutorRequestSequence;
    setRobotMood("thinking");
    setTutorBusy(true);
    const streamMessage = beginStreamingRobotMessage();
    try {
      const text = await gemini.stream(
        [
          "あなたはPopPop Playgroundに住むロボット先生です。",
          "短く自然な日本語で、質問に直接答えてください。",
          "完成コードを丸ごと渡さず、理解できる次の一手を示してください。",
          "PopPopでは改行に構文上の意味はなく、通常の文は .、ブロック全体は .. で閉じます。",
          ">> は左の値を右へ流します。すべての標準関数は元の値を破壊しません。",
          "不確かな仕様を作らず、分からない場合は仕様書を確認するよう伝えてください。",
          "JSONだけを返してください。",
          '形式: {"message":"回答","mood":"neutral"}',
          "moodは neutral, happy, thinking, encourage, sad, surprised のいずれかです。",
          learnerProfileSummary(),
          `現在の目標: ${lesson.goal}`,
          `現在のコード:\n${getSource()}`,
          `診断:\n${elements.diagnosticsPanel.textContent}`,
          `直前の会話:\n${recentTutorConversation() || "なし"}`,
          `質問: ${question}`,
        ].join("\n\n"),
        true,
        "chat",
        (partialText) => {
          if (requestId !== tutorRequestSequence) return;
          updateStreamingRobotMessage(
            streamMessage,
            extractPartialJsonString(partialText, "message").slice(0, 320),
          );
        },
      );
      if (requestId !== tutorRequestSequence) {
        discardStreamingRobotMessage(streamMessage);
        return;
      }
      const data = parseJsonText(text);
      const moods = ["neutral", "happy", "thinking", "encourage", "sad", "surprised"];
      const mood = moods.includes(data?.mood) ? data.mood : "neutral";
      setRobotMood(mood, 3000);
      finishStreamingRobotMessage(
        streamMessage,
        String(data?.message || "もう少し詳しく教えてくれる？").slice(0, 320),
      );
    } catch {
      if (requestId !== tutorRequestSequence) {
        discardStreamingRobotMessage(streamMessage);
        return;
      }
      setRobotMood("sad", 2400);
      finishStreamingRobotMessage(
        streamMessage,
        "うまく考えを届けられなかったよ。少し待って、もう一度聞いてみてね。",
      );
    } finally {
      if (requestId === tutorRequestSequence) setTutorBusy(false);
    }
  }

  function showLessonOverview() {
    if (!lessons.length) return;
    const overview = lessons.map((lesson, index) => {
      const mark = completedLessons.has(lesson.id) ? "✓" : index === lessonIndex ? "→" : "・";
      return `${mark} ${lesson.badge} ${lesson.title}`;
    }).join("\n");
    askRobot("course_overview", {
      extra: `コース一覧:\n${overview}`,
      fallback: `基礎コース一覧\n${overview}`,
    });
  }

  function advanceLesson() {
    if (aiLesson || lessonIndex >= lessons.length - 1) {
      void createAiLesson();
      return;
    }
    selectLesson(lessonIndex + 1);
  }

  function checkOrAdvanceLesson() {
    const lesson = currentLesson();
    const canAdvance = lesson &&
      (completedLessons.has(lesson.id) || lesson.passed);
    if (canAdvance) {
      elements.checkLessonButton.disabled = true;
      advanceLesson();
      return;
    }
    startRun();
  }

  function previousLesson() {
    if (aiLesson) {
      aiLesson = null;
      activeLessonId = null;
      renderLesson();
      openCurrentLesson({ introduction: true });
      return;
    }
    selectLesson(lessonIndex - 1);
  }

  function formatSource() {
    const formatter = window.PopPopFormatter;
    if (!formatter) {
      showToast("整形機能を読み込めませんでした");
      return;
    }
    const formatted = formatter.formatDocument(getSource(), 4);
    setSource(formatted);
    showToast("VS Codeと同じ規則でコードを整えました ✦");
  }

  async function copyText(text, message) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(message);
    } catch {
      showToast("クリップボードへコピーできませんでした");
    }
  }

  function downloadSource() {
    const blob = new Blob([getSource()], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "main.pop";
    link.click();
    // Revoking in the same tick can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    showToast("main.pop を保存しました");
  }

  async function loadFile(file) {
    if (!file) return;
    setSource(await file.text());
    showToast(`${file.name} を読み込みました`);
  }

  async function shareSource() {
    const url = new URL(location.href);
    url.hash = `code=${encodeSource(getSource())}`;
    history.replaceState(null, "", url);
    await copyText(url.href, "共有 URL をコピーしました");
  }

  function changeFont(delta) {
    const current = editor
      ? Number(editor.getOption("fontSize"))
      : Number.parseFloat(getComputedStyle(elements.editorFallback).fontSize);
    const next = Math.min(24, Math.max(11, current + delta));
    if (editor) editor.setOption("fontSize", next);
    else elements.editorFallback.style.fontSize = `${next}px`;
    localStorage.setItem(STORAGE.fontSize, String(next));
    showToast(`文字サイズ: ${next}px`);
  }

  function updateAceTheme() {
    if (!editor) return;
    const light = document.documentElement.dataset.theme === "light";
    editor.setTheme(light ? "ace/theme/github" : "ace/theme/monokai");
  }

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(STORAGE.theme, next);
    elements.themeButton.setAttribute("aria-pressed", String(next === "light"));
    updateAceTheme();
    closeToolMenu();
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("visible");
    toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 2300);
  }

  function bindTabKeyboard(tablist, selector, activate) {
    if (!tablist) return;
    tablist.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const tabs = [...tablist.querySelectorAll(selector)];
      if (!tabs.length) return;
      const current = Math.max(0, tabs.indexOf(document.activeElement));
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault();
      tabs[nextIndex].focus();
      activate(tabs[nextIndex]);
    });
  }

  function bindEvents() {
    elements.runButton.addEventListener("click", startRun);
    elements.stopButton.addEventListener("click", stopRun);
    elements.formatButton.addEventListener("click", formatSource);
    elements.copyCodeButton.addEventListener("click", () =>
      copyText(getSource(), "コードをコピーしました"));
    elements.downloadButton.addEventListener("click", downloadSource);
    elements.loadFileButton.addEventListener("click", () => elements.fileInput.click());
    elements.fileInput.addEventListener("change", () => loadFile(elements.fileInput.files[0]));
    elements.shareButton.addEventListener("click", shareSource);
    elements.decreaseFontButton.addEventListener("click", () => changeFont(-1));
    elements.increaseFontButton.addEventListener("click", () => changeFont(1));
    elements.themeButton.addEventListener("click", toggleTheme);
    elements.toggleSidebarButton.addEventListener("click", () =>
      setSidebarCollapsed(!sidebarCollapsed));
    elements.toggleResultButton.addEventListener("click", () =>
      setResultCollapsed(!resultCollapsed));
    document.querySelectorAll("[data-layout-preset]").forEach((button) => {
      button.addEventListener("click", () =>
        applyLayoutPreset(button.dataset.layoutPreset));
    });
    document.querySelectorAll(".mobile-pane-button").forEach((button) => {
      button.addEventListener("click", () => {
        const pane = button.dataset.mobilePane;
        if (pane === "result") {
          if (mobileResultOpen) closeMobileResultDrawer({ focusCode: true });
          else revealResult();
          return;
        }
        setMobilePane(pane, { focus: pane === "code" });
      });
    });
    compactViewport.addEventListener("change", () => {
      if (compactViewport.matches && mobilePane === "result") {
        mobilePane = "code";
        openMobileResultDrawer();
      } else if (!compactViewport.matches) {
        closeMobileResultDrawer();
      }
      updateMobileResultHeight(mobileResultHeight);
      applyWorkspaceSizes();
      applyMobilePaneState();
    });
    window.addEventListener("resize", () => {
      applyWorkspaceSizes();
      updateMobileResultHeight(mobileResultHeight);
    });
    bindWorkspaceResizer(elements.sidebarResizer, "sidebar");
    bindWorkspaceResizer(elements.resultResizer, "result");
    bindMobileResultDrawer();
    elements.moreTools.querySelectorAll("button").forEach((button) => {
      if (button === elements.themeButton || button === elements.loadFileButton) return;
      button.addEventListener("click", closeToolMenu);
    });
    document.addEventListener("pointerdown", (event) => {
      if (
        elements.moreTools.open &&
        !elements.moreTools.contains(event.target)
      ) {
        closeToolMenu();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.shiftKey && event.altKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        formatSource();
      }
    });
    elements.examplesTab.addEventListener("click", () => switchSidePanel("examples"));
    elements.referenceTab.addEventListener("click", () => switchSidePanel("reference"));
    elements.lessonTab.addEventListener("click", () => switchSidePanel("lesson"));
    elements.previousLessonButton.addEventListener("click", previousLesson);
    elements.nextLessonButton.addEventListener("click", () =>
      selectLesson(lessonIndex + 1));
    elements.lessonTitleButton.addEventListener("click", showLessonOverview);
    elements.welcomeTutorButton.addEventListener("click", showTutorProfile);
    elements.tutorProfileForm.addEventListener("submit", welcomeTutor);
    elements.resetLessonButton.addEventListener("click", resetLessons);
    elements.checkLessonButton.addEventListener("click", checkOrAdvanceLesson);
    elements.hintButton.addEventListener("click", showLessonHint);
    elements.showAnswerButton.addEventListener("click", showLessonAnswer);
    elements.aiLessonButton.addEventListener("click", createAiLesson);
    elements.advanceLessonButton.addEventListener("click", advanceLesson);
    elements.lessonQuestionForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const question = elements.lessonQuestion.value.trim();
      if (!question) return;
      addChatMessage(question, "user");
      elements.lessonQuestion.value = "";
      answerLessonQuestion(question);
    });
    elements.exampleSearch.addEventListener("input", renderExamples);
    elements.referenceSearch.addEventListener("input", renderReferences);
    document.querySelectorAll(".result-tab").forEach((button) => {
      button.addEventListener("click", () => selectResultTab(button.dataset.resultTab));
    });
    elements.copyResultButton.addEventListener("click", () => {
      const panels = {
        output: elements.outputPanel,
        diagnostics: elements.diagnosticsPanel,
        ast: elements.astPanel,
      };
      copyText(panels[currentResultTab].textContent, "表示内容をコピーしました");
    });
    elements.terminalInputForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (currentInputId === null) return;
      const value = elements.terminalInput.value;
      appendOutput(`${elements.terminalPrompt.textContent}${value}`);
      worker.postMessage({ type: "input-result", id: currentInputId, value });
      setRunFeedback("running", "実行中…");
      currentInputId = null;
      elements.terminalInput.value = "";
      elements.terminalInputForm.hidden = true;
      elements.resultBody.classList.remove("input-active");
    });
    bindTabKeyboard(
      document.querySelector(".side-tabs"),
      ".side-tab",
      (tab) => {
        if (tab === elements.examplesTab) switchSidePanel("examples");
        if (tab === elements.referenceTab) switchSidePanel("reference");
        if (tab === elements.lessonTab) switchSidePanel("lesson");
      },
    );
    bindTabKeyboard(
      document.querySelector(".result-tab-list"),
      ".result-tab",
      (tab) => selectResultTab(tab.dataset.resultTab),
    );
    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        startRun();
      }
      if (event.key === "Escape" && running) stopRun();
      else if (event.key === "Escape" && mobileResultOpen) {
        closeMobileResultDrawer({ focusCode: true });
      }
      else if (event.key === "Escape" && elements.moreTools.open) {
        elements.moreTools.open = false;
        elements.moreTools.querySelector("summary")?.focus();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        downloadSource();
      }
    });
  }

  const storedTheme = localStorage.getItem(STORAGE.theme);
  document.documentElement.dataset.theme = storedTheme === "light" || storedTheme === "dark"
    ? storedTheme
    : window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  setupEditor();
  bindEvents();
  applyWorkspaceSizes();
  updateMobileResultHeight(mobileResultHeight);
  elements.themeButton.setAttribute(
    "aria-pressed",
    String(document.documentElement.dataset.theme === "light"),
  );
  setSidebarCollapsed(sidebarCollapsed, false);
  setResultCollapsed(resultCollapsed, false);
  setMobilePane("code");
  updateEditorStatus();
  loadSpecification();
  createWorker();
})();
