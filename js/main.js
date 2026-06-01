/**
 * CutThat Pro — Panel Logic
 * CSInterface bridge, API calls, tab management
 */
(function () {
  "use strict";

  /* ============================================================
     STATE
     ============================================================ */
  var state = {
    csInterface: null,
    backendUrl: "http://127.0.0.1:3456",
    hostLoaded: false,
    suggestedCutRanges: [],
    analyzedSequenceName: "",
    currentCutPlan: null,
    lastReviewStatus: "SAFE",
    transcriptData: null,
    detectedLanguage: null,
    zoomMoments: [],
    brollResults: [],
    selectedBrollIndices: [],
    settings: {
      autoDuplicate: true,
      keepMarkers: false,
      tempDir: "",
      pexelsApiKey: "",
      openaiApiKey: ""
    }
  };

  /* ============================================================
     DOM REFERENCES
     ============================================================ */
  var dom = {};

  function cacheDom() {
    // Header
    dom.connectionStatus = document.getElementById("connection-status");

    // Tabs
    dom.tabBtns = document.querySelectorAll(".tab-btn");
    dom.tabPanels = document.querySelectorAll(".tab-panel");

    // Auto Cut
    dom.btnTestConnection = document.getElementById("btn-test-connection");
    dom.btnDuplicateSeq = document.getElementById("btn-duplicate-seq");
    dom.sequenceInfo = document.getElementById("sequence-info");
    dom.detectionEngine = document.getElementById("detection-engine");
    dom.cutStyle = document.getElementById("cut-style");
    dom.vadSettingsSection = document.getElementById("vad-settings-section");
    dom.ffmpegSettingsSection = document.getElementById("ffmpeg-settings-section");
    dom.vadMinPause = document.getElementById("vad-min-pause");
    dom.vadPaddingBefore = document.getElementById("vad-padding-before");
    dom.vadPaddingAfter = document.getElementById("vad-padding-after");
    dom.vadMaxCutDuration = document.getElementById("vad-max-cut-duration");
    dom.noiseThreshold = document.getElementById("noise-threshold");
    dom.minSilence = document.getElementById("min-silence");
    dom.videoTrackMode = document.getElementById("video-track-mode");
    dom.audioTrackMode = document.getElementById("audio-track-mode");
    dom.btnExportAudio = document.getElementById("btn-export-audio");
    dom.btnDetectLanguage = document.getElementById("btn-detect-language");
    dom.languageResult = document.getElementById("language-result");
    dom.btnAnalyzeSilence = document.getElementById("btn-analyze-silence");
    dom.analyzeProgress = document.getElementById("analyze-progress");
    dom.analyzeProgressBar = document.getElementById("analyze-progress-bar");
    dom.cutResults = document.getElementById("cut-results");
    dom.btnAddMarkers = document.getElementById("btn-add-markers");
    dom.btnAddRazorCuts = document.getElementById("btn-add-razor-cuts");
    dom.btnApplyCleanCut = document.getElementById("btn-apply-clean-cut");
    dom.status = document.getElementById("status");
    dom.result = document.getElementById("result");

    // Captions
    dom.captionLanguage = document.getElementById("caption-language");
    dom.whisperModel = document.getElementById("whisper-model");
    dom.btnTranscribe = document.getElementById("btn-transcribe");
    dom.transcribeProgress = document.getElementById("transcribe-progress");
    dom.transcribeProgressBar = document.getElementById("transcribe-progress-bar");
    dom.transcriptOutput = document.getElementById("transcript-output");
    dom.btnExportSrt = document.getElementById("btn-export-srt");
    dom.btnAddCaptionTrack = document.getElementById("btn-add-caption-track");
    dom.captionStatus = document.getElementById("caption-status");

    // Zoom
    dom.zoomKeywords = document.getElementById("zoom-keywords");
    dom.zoomScale = document.getElementById("zoom-scale");
    dom.zoomDuration = document.getElementById("zoom-duration");
    dom.zoomEase = document.getElementById("zoom-ease");
    dom.btnFindZoomMoments = document.getElementById("btn-find-zoom-moments");
    dom.btnApplyZoom = document.getElementById("btn-apply-zoom");
    dom.zoomResults = document.getElementById("zoom-results");
    dom.zoomStatus = document.getElementById("zoom-status");

    // B-Roll
    dom.pexelsApiKey = document.getElementById("pexels-api-key");
    dom.brollMaxKeywords = document.getElementById("broll-max-keywords");
    dom.brollOrientation = document.getElementById("broll-orientation");
    dom.btnExtractKeywords = document.getElementById("btn-extract-keywords");
    dom.btnSearchBroll = document.getElementById("btn-search-broll");
    dom.brollKeywords = document.getElementById("broll-keywords");
    dom.brollResults = document.getElementById("broll-results");
    dom.btnInsertBroll = document.getElementById("btn-insert-broll");
    dom.brollStatus = document.getElementById("broll-status");

    // Settings
    dom.backendUrl = document.getElementById("backend-url");
    dom.btnCheckBackend = document.getElementById("btn-check-backend");
    dom.backendHealth = document.getElementById("backend-health");
    dom.settingsPexelsKey = document.getElementById("settings-pexels-key");
    dom.settingsOpenaiKey = document.getElementById("settings-openai-key");
    dom.settingsTempDir = document.getElementById("settings-temp-dir");
    dom.btnBrowseTemp = document.getElementById("btn-browse-temp");
    dom.settingsAutoDuplicate = document.getElementById("settings-auto-duplicate");
    dom.settingsKeepMarkers = document.getElementById("settings-keep-markers");
    dom.settingsStatus = document.getElementById("settings-status");
  }

  /* ============================================================
     CSINTERFACE HELPERS
     ============================================================ */
  function getCSInterface() {
    if (state.csInterface) {
      return state.csInterface;
    }
    if (typeof CSInterface === "undefined") {
      return null;
    }
    state.csInterface = new CSInterface();
    return state.csInterface;
  }

  function runScript(script, callback) {
    var cs = getCSInterface();
    if (!cs) {
      if (callback) callback(null, "CSInterface not available");
      return;
    }
    cs.evalScript(script, function (response) {
      if (!response || response === "EvalScript error.") {
        if (callback) callback(null, "EvalScript error: " + script);
        return;
      }
      if (callback) callback(response, null);
    });
  }

  function runScriptPromise(script) {
    return new Promise(function (resolve, reject) {
      runScript(script, function (response, error) {
        if (error) {
          reject(new Error(error));
        } else {
          resolve(response);
        }
      });
    });
  }

  function parseJsonResponse(response) {
    try {
      return JSON.parse(response);
    } catch (e) {
      return null;
    }
  }

  /* ============================================================
     BACKEND API HELPERS
     ============================================================ */
  function backendFetch(endpoint, options) {
    var url = state.backendUrl + endpoint;
    var defaults = {
      headers: { "Content-Type": "application/json" }
    };
    var merged = Object.assign({}, defaults, options || {});

    return fetch(url, merged)
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (body) {
            throw new Error(body.error || "HTTP " + res.status);
          }).catch(function (parseErr) {
            if (parseErr.message && parseErr.message.indexOf("HTTP") === 0) throw parseErr;
            throw new Error("HTTP " + res.status);
          });
        }
        return res.json();
      });
  }

  function backendPost(endpoint, body) {
    return backendFetch(endpoint, {
      method: "POST",
      body: JSON.stringify(body)
    });
  }

  function backendGet(endpoint) {
    return backendFetch(endpoint, { method: "GET" });
  }

  /* ============================================================
     STATUS HELPERS
     ============================================================ */
  function setStatus(el, text) {
    if (typeof el === "string") {
      text = el;
      el = dom.status;
    }
    if (el) el.textContent = text;
  }

  function setResult(el, text) {
    if (typeof el === "string") {
      text = el;
      el = dom.result;
    }
    if (el) el.textContent = text;
  }

  function setConnectionStatus(connected) {
    if (!dom.connectionStatus) return;
    dom.connectionStatus.textContent = connected ? "Connected" : "Disconnected";
    dom.connectionStatus.className = "status-badge " + (connected ? "connected" : "disconnected");
  }

  function showProgress(bar, container) {
    if (container) container.style.display = "block";
    if (bar) {
      bar.style.width = "0%";
      bar.classList.add("indeterminate");
    }
  }

  function hideProgress(bar, container) {
    if (bar) bar.classList.remove("indeterminate");
    if (container) container.style.display = "none";
  }

  function parseNumber(value, fallback) {
    var n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  /* ============================================================
     TAB MANAGEMENT
     ============================================================ */
  function switchTab(tabId) {
    dom.tabBtns.forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tabId);
    });
    dom.tabPanels.forEach(function (panel) {
      panel.classList.toggle("active", panel.id === "tab-" + tabId);
    });
  }

  /* ============================================================
     CUT STYLE PRESETS
     ============================================================ */
  var CUT_STYLE_PRESETS = {
    soft:       { minPause: 1.2,  padBefore: 0.35, padAfter: 0.35, maxCut: 2.5 },
    natural:    { minPause: 0.9,  padBefore: 0.25, padAfter: 0.25, maxCut: 3.0 },
    tight:      { minPause: 0.65, padBefore: 0.18, padAfter: 0.18, maxCut: 3.0 },
    aggressive: { minPause: 0.45, padBefore: 0.12, padAfter: 0.12, maxCut: 4.0 }
  };

  function applyCutStylePreset(style) {
    var preset = CUT_STYLE_PRESETS[style] || CUT_STYLE_PRESETS.natural;
    if (dom.vadMinPause) dom.vadMinPause.value = String(preset.minPause);
    if (dom.vadPaddingBefore) dom.vadPaddingBefore.value = String(preset.padBefore);
    if (dom.vadPaddingAfter) dom.vadPaddingAfter.value = String(preset.padAfter);
    if (dom.vadMaxCutDuration) dom.vadMaxCutDuration.value = String(preset.maxCut);
  }

  /* ============================================================
     ENGINE VISIBILITY
     ============================================================ */
  function updateEngineVisibility() {
    var engine = dom.detectionEngine ? dom.detectionEngine.value : "silero_vad";
    var isFFmpeg = engine === "ffmpeg_silence";
    if (dom.vadSettingsSection) dom.vadSettingsSection.style.display = isFFmpeg ? "none" : "block";
    if (dom.ffmpegSettingsSection) dom.ffmpegSettingsSection.style.display = isFFmpeg ? "block" : "none";
  }

  /* ============================================================
     ACTION BUTTONS STATE
     ============================================================ */
  function updateActionButtons() {
    var hasRanges = state.suggestedCutRanges.length > 0;
    var hasCutPlan = !!(state.currentCutPlan && Array.isArray(state.currentCutPlan.autoApplyCuts));
    var autoApplyCount = hasCutPlan ? state.currentCutPlan.autoApplyCuts.length : 0;
    var canApply = state.lastReviewStatus === "SAFE" || state.lastReviewStatus === "WARNING";

    if (dom.btnAddMarkers) dom.btnAddMarkers.disabled = !hasRanges;
    if (dom.btnAddRazorCuts) dom.btnAddRazorCuts.disabled = !hasRanges;
    if (dom.btnApplyCleanCut) dom.btnApplyCleanCut.disabled = !(hasCutPlan && autoApplyCount > 0 && canApply);
  }

  /* ============================================================
     READ SETTINGS FROM UI
     ============================================================ */
  function readAutoCutSettings() {
    return {
      engine: dom.detectionEngine ? dom.detectionEngine.value : "silero_vad",
      cutStyle: dom.cutStyle ? dom.cutStyle.value : "natural",
      vadMinPause: parseNumber(dom.vadMinPause && dom.vadMinPause.value, 0.9),
      vadPaddingBefore: parseNumber(dom.vadPaddingBefore && dom.vadPaddingBefore.value, 0.25),
      vadPaddingAfter: parseNumber(dom.vadPaddingAfter && dom.vadPaddingAfter.value, 0.25),
      vadMaxCutDuration: parseNumber(dom.vadMaxCutDuration && dom.vadMaxCutDuration.value, 3.0),
      noiseThreshold: parseNumber(dom.noiseThreshold && dom.noiseThreshold.value, -35),
      minSilenceDuration: parseNumber(dom.minSilence && dom.minSilence.value, 0.5),
      videoTrackMode: dom.videoTrackMode ? dom.videoTrackMode.value : "v1",
      audioTrackMode: dom.audioTrackMode ? dom.audioTrackMode.value : "a1"
    };
  }

  /* ============================================================
     LOAD HOST JSX
     ============================================================ */
  function loadJSX() {
    var cs = getCSInterface();
    if (!cs) {
      setStatus("CSInterface not available");
      setResult("ERROR: CSInterface.js not loaded. Check js/CSInterface.js");
      return;
    }

    // First: check if host.jsx is ALREADY loaded (from manifest ScriptPath auto-load)
    cs.evalScript("typeof testPremiereConnection", function (typeResponse) {
      if (typeResponse === "function") {
        // Auto-load worked! Functions already available
        state.hostLoaded = true;
        setStatus("Host auto-loaded from manifest");
        setConnectionStatus(true);
        autoTestConnection();
        return;
      }

      // Auto-load didn't work, try manual $.evalFile
      var extensionRoot = cs.getSystemPath(SystemPath.EXTENSION);
      var jsxPath = extensionRoot + "/jsx/host.jsx";
      var escapedPath = jsxPath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

      var script =
        'try {' +
        '$.evalFile(File("' + escapedPath + '"));' +
        '"HOST_LOAD_OK";' +
        '} catch (e) {' +
        '"HOST_LOAD_ERROR: " + e.toString();' +
        '}';

      cs.evalScript(script, function (loadResponse) {
        if (!loadResponse || loadResponse === "EvalScript error.") {
          setStatus("Host JSX load failed");
          setResult("Could not load host.jsx.\nPath: " + jsxPath + "\nRestart Premiere Pro (Cmd+Q → reopen).");
          return;
        }

        if (String(loadResponse).indexOf("HOST_LOAD_ERROR:") === 0) {
          setStatus("Host JSX load error");
          setResult(loadResponse + "\nPath: " + jsxPath);
          return;
        }

        // Verify with ping
        cs.evalScript("cutThatHostPing()", function (pingResponse) {
          if (!pingResponse || pingResponse === "EvalScript error.") {
            setStatus("Host loaded but ping failed");
            setResult(loadResponse + "\nPing failed. Functions may not be available.");
            return;
          }
          state.hostLoaded = true;
          setStatus("Host JSX loaded (manual)");
          setResult(loadResponse + " | " + pingResponse + "\nPath: " + jsxPath);
          setConnectionStatus(true);
          autoTestConnection();
        });
      });
    });
  }

  /* ============================================================
     AUTO TEST CONNECTION (called after loadJSX succeeds)
     ============================================================ */
  function autoTestConnection() {
    runScript("testPremiereConnection()", function (response, error) {
      if (error) {
        setConnectionStatus(false);
        setResult("Auto-test failed: " + error);
        return;
      }
      var data = parseJsonResponse(response);
      if (data && data.success) {
        setConnectionStatus(true);
        setResult("Connected to: " + data.projectName + " | Sequence: " + data.sequenceName);
      } else {
        setConnectionStatus(false);
        setResult("Connection test: " + (data ? data.error : response));
      }
    });
  }

  /* ============================================================
     AUTO CUT — TEST CONNECTION
     ============================================================ */
  function testConnection() {
    dom.btnTestConnection.disabled = true;
    setStatus("Testing connection + diagnostics...");
    setResult("Running...");

    runScript("testPremiereConnection()", function (response, error) {
      if (error) {
        setStatus("Connection failed");
        setResult(error);
        setConnectionStatus(false);
        dom.btnTestConnection.disabled = false;
        return;
      }
      setConnectionStatus(true);

      // Run full diagnostic
      setResult(response + "\n\nRunning clip diagnostic...");
      runScript("diagnosticListClips()", function (clipResponse) {
        var output = response + "\n\n=== CLIPS ===\n" + clipResponse;

        // Run razor test
        runScript("testRazorCut()", function (razorResponse) {
          output += "\n\n=== RAZOR ===\n" + razorResponse;
          setResult(output);
          setStatus("Diagnostics complete — check result box");
          dom.btnTestConnection.disabled = false;
        });
      });
    });
  }

  /* ============================================================
     AUTO CUT — DUPLICATE SEQUENCE
     ============================================================ */
  function duplicateSequence() {
    dom.btnDuplicateSeq.disabled = true;
    setStatus("Duplicating active sequence...");
    setResult("");

    runScriptPromise("duplicateActiveSequenceForCutThat()")
      .then(function (output) {
        var data = parseJsonResponse(output);
        if (data && data.success) {
          setStatus("Sequence duplicated: " + (data.newSequenceName || ""));
          setResult(output);
        } else {
          setStatus("Duplicate failed");
          setResult(data ? data.error : output);
        }
      })
      .catch(function (err) {
        setStatus("Duplicate failed");
        setResult(String(err.message || err));
      })
      .finally(function () {
        dom.btnDuplicateSeq.disabled = false;
      });
  }

  /* ============================================================
     AUTO CUT — EXPORT AUDIO
     ============================================================ */
  function exportAudio() {
    // New approach: Just get the source file path — no Media Encoder
    dom.btnExportAudio.disabled = true;
    setStatus("Getting media path from timeline...");
    setResult("");

    runScriptPromise("getAudioExportInfo()")
      .then(function (response) {
        var data = parseJsonResponse(response);
        if (data && data.success) {
          setStatus("Media found: " + (data.filePath || data.audioPath));
          setResult("Sequence: " + data.sequenceName + "\nFile: " + (data.filePath || data.audioPath));
        } else {
          setStatus("No media found");
          setResult(data ? data.error : response);
        }
      })
      .catch(function (err) {
        setStatus("Failed to get media path");
        setResult(String(err.message || err));
      })
      .finally(function () {
        dom.btnExportAudio.disabled = false;
      });
  }

  /* ============================================================
     AUTO CUT — DETECT LANGUAGE
     ============================================================ */
  function detectLanguage() {
    dom.btnDetectLanguage.disabled = true;
    setStatus("Detecting language...");
    dom.languageResult.textContent = "Analyzing audio...";

    // Step 1: Get media path from Premiere
    runScriptPromise("getAudioExportInfo()")
      .then(function (response) {
        var info = parseJsonResponse(response);
        if (!info || info.success === false) {
          throw new Error(info ? info.error : "Could not get media path. Add clips to timeline.");
        }
        if (!info.audioPath) {
          throw new Error("No media path returned.");
        }

        // Step 2: Send to backend for language detection
        return backendPost("/detect-language", {
          filePath: info.audioPath,
          modelSize: "base"
        });
      })
      .then(function (result) {
        if (!result.success) {
          throw new Error(result.error || "Language detection failed");
        }

        var lang = result.language || "unknown";
        var langName = result.languageName || lang;
        var prob = result.probability ? (result.probability * 100).toFixed(1) : "?";

        // Display result
        var output = "Language: " + langName + " (" + lang + ")\n";
        output += "Confidence: " + prob + "%\n";
        if (result.duration) output += "Analyzed: " + result.duration.toFixed(1) + "s of audio\n";
        if (result.sampleSegments && result.sampleSegments.length > 0) {
          output += "\nSample text:\n";
          result.sampleSegments.forEach(function (seg) {
            output += "  " + seg.text + "\n";
          });
        }

        dom.languageResult.textContent = output;
        setStatus("Language detected: " + langName);

        // Auto-update the caption language dropdown if available
        if (dom.captionLanguage) {
          var options = dom.captionLanguage.options;
          for (var i = 0; i < options.length; i++) {
            if (options[i].value === lang) {
              dom.captionLanguage.selectedIndex = i;
              break;
            }
          }
        }

        // Also store in state for later use
        state.detectedLanguage = {
          code: lang,
          name: langName,
          probability: result.probability
        };
      })
      .catch(function (err) {
        dom.languageResult.textContent = "";
        setStatus("Language detection failed: " + String(err.message || err));
      })
      .finally(function () {
        dom.btnDetectLanguage.disabled = false;
      });
  }

  /* ============================================================
     AUTO CUT — ANALYZE SILENCE
     ============================================================ */
  function analyzeSilence() {
    var settings = readAutoCutSettings();
    dom.btnAnalyzeSilence.disabled = true;
    showProgress(dom.analyzeProgressBar, dom.analyzeProgress);
    setStatus("Analyzing silence...");
    setResult("");
    dom.cutResults.textContent = "";

    // Step 1: Get audio path from Premiere
    runScriptPromise("getAudioExportInfo()")
      .then(function (response) {
        var info = parseJsonResponse(response);
        if (!info || info.success === false) {
          throw new Error(info ? info.error : "Could not get audio path. Export audio first.");
        }
        if (!info.audioPath) {
          throw new Error("No audio path returned. Export audio first.");
        }

        // Step 2: Send to backend for analysis
        var endpoint = "";
        var payload = {};

        if (settings.engine === "silero_vad") {
          endpoint = "/analyze-vad";
          payload = {
            filePath: info.audioPath,
            minPauseDuration: settings.vadMinPause,
            paddingBefore: settings.vadPaddingBefore,
            paddingAfter: settings.vadPaddingAfter,
            maxCutDuration: settings.vadMaxCutDuration,
            allowLongCuts: false
          };
        } else if (settings.engine === "whisper") {
          endpoint = "/analyze-whisper-vad";
          payload = {
            filePath: info.audioPath,
            language: state.detectedLanguage ? state.detectedLanguage.code : "auto",
            removePauses: true,
            removeRepeatedWords: true,
            removeRepeatedPhrases: true,
            removeFillers: false,
            minPauseDuration: settings.vadMinPause,
            paddingBefore: settings.vadPaddingBefore,
            paddingAfter: settings.vadPaddingAfter,
            maxCutDuration: settings.vadMaxCutDuration,
            minEffectiveCutDuration: 0.35
          };
        } else {
          endpoint = "/analyze-silence";
          payload = {
            filePath: info.audioPath,
            noiseThreshold: settings.noiseThreshold + "dB",
            minSilenceDuration: settings.minSilenceDuration
          };
        }

        return backendPost(endpoint, payload);
      })
      .then(function (result) {
        hideProgress(dom.analyzeProgressBar, dom.analyzeProgress);

        if (!result.success) {
          throw new Error(result.error || "Analysis failed");
        }

        var cuts = result.cutCandidates || result.gapCandidates || result.silences || [];
        state.suggestedCutRanges = cuts;
        state.analyzedSequenceName = "";

        // Build cut plan
        state.currentCutPlan = {
          autoApplyCuts: cuts.filter(function (c) { return c.category === "SAFE_CUT" || !c.category; }),
          reviewOnlyCuts: cuts.filter(function (c) { return c.category !== "SAFE_CUT" && c.category; }),
          sequenceName: state.analyzedSequenceName
        };

        state.lastReviewStatus = state.currentCutPlan.autoApplyCuts.length > 0 ? "SAFE" : "NO_CUTS_FOUND";

        // Display results
        var summary = "Analysis Complete\n";
        summary += "Engine: " + settings.engine + "\n";
        summary += "Total segments: " + cuts.length + "\n";
        summary += "Auto-apply cuts: " + state.currentCutPlan.autoApplyCuts.length + "\n";
        summary += "Review-only: " + state.currentCutPlan.reviewOnlyCuts.length + "\n";
        if (result.language) summary += "Language: " + result.language + "\n";
        if (result.duration) summary += "Duration: " + result.duration.toFixed(1) + "s\n";
        if (result.totalCutDuration) summary += "Total cut: " + result.totalCutDuration.toFixed(1) + "s\n";
        if (result.reductionPercent) summary += "Reduction: " + result.reductionPercent.toFixed(1) + "%\n";

        dom.cutResults.textContent = summary;
        setStatus("Analysis complete: " + cuts.length + " segments found");
        updateActionButtons();
      })
      .catch(function (err) {
        hideProgress(dom.analyzeProgressBar, dom.analyzeProgress);
        setStatus("Analysis failed");
        setResult(String(err.message || err));
      })
      .finally(function () {
        dom.btnAnalyzeSilence.disabled = false;
      });
  }

  /* ============================================================
     AUTO CUT — ADD MARKERS
     ============================================================ */
  function addMarkers() {
    if (state.suggestedCutRanges.length === 0) return;

    dom.btnAddMarkers.disabled = true;
    setStatus("Adding markers to timeline...");

    var encoded = encodeURIComponent(JSON.stringify(state.suggestedCutRanges));

    runScriptPromise('addSilenceMarkersToTimeline("' + encoded + '")')
      .then(function (response) {
        setStatus("Markers added");
        setResult(response);
      })
      .catch(function (err) {
        setStatus("Marker add failed");
        setResult(String(err.message || err));
      })
      .finally(function () {
        updateActionButtons();
      });
  }

  /* ============================================================
     AUTO CUT — ADD RAZOR CUTS
     ============================================================ */
  function addRazorCuts() {
    if (state.suggestedCutRanges.length === 0) return;

    dom.btnAddRazorCuts.disabled = true;
    setStatus("Adding razor cuts to timeline...");

    var encoded = encodeURIComponent(JSON.stringify(state.suggestedCutRanges));

    runScriptPromise('addRazorCutsToTimeline("' + encoded + '")')
      .then(function (response) {
        var data = parseJsonResponse(response);
        if (data && data.success) {
          setStatus("Razor cuts added: " + (data.cutsAdded || 0));
        } else {
          setStatus("Razor cuts: " + (data ? data.error : "unknown error"));
        }
        setResult(response);
      })
      .catch(function (err) {
        setStatus("Razor cuts failed");
        setResult(String(err.message || err));
      })
      .finally(function () {
        updateActionButtons();
      });
  }

  /* ============================================================
     AUTO CUT — APPLY CLEAN CUT (razor + ripple delete)
     ============================================================ */
  function applyCleanCut() {
    if (!state.currentCutPlan || !state.currentCutPlan.autoApplyCuts.length) return;

    dom.btnApplyCleanCut.disabled = true;
    setStatus("Applying clean cut...");
    setResult("Applying razor cuts & removing silences...");

    // Use same encoding as addRazorCuts (encodeURIComponent)
    var cutsForRazor = state.currentCutPlan.autoApplyCuts.map(function(c) {
      return { start: c.start, end: c.end };
    });
    var encoded = encodeURIComponent(JSON.stringify(cutsForRazor));
    runScriptPromise('applyCleanCutDirect("' + encoded + '")')
      .then(function (cutResponse) {
        var cutData = parseJsonResponse(cutResponse);
        if (cutData && cutData.success) {
          setStatus("Clean cut applied!");
          setResult("Razor: " + (cutData.razorCount || 0) + " cuts | Removed: " + (cutData.clipsRemoved || 0) + " clips\nDebug: " + (cutData.debug || "none"));
        } else {
          setStatus("Cut issue");
          setResult(cutResponse);
        }
      })
      .catch(function (err) {
        setStatus("Clean cut failed");
        setResult(String(err.message || err));
      })
      .finally(function () {
        dom.btnApplyCleanCut.disabled = false;
        updateActionButtons();
      });
  }

  /* ============================================================
     CAPTIONS — TRANSCRIBE
     ============================================================ */
  function transcribeAudio() {
    dom.btnTranscribe.disabled = true;
    showProgress(dom.transcribeProgressBar, dom.transcribeProgress);
    setStatus(dom.captionStatus, "Transcribing...");
    dom.transcriptOutput.textContent = "";

    // Step 1: Get audio path
    runScriptPromise("getAudioExportInfo()")
      .then(function (response) {
        var info = parseJsonResponse(response);
        if (!info || !info.audioPath) {
          throw new Error("No audio path. Export audio first via Auto Cut tab.");
        }

        // Step 2: Send to backend for transcription
        return backendPost("/transcribe", {
          filePath: info.audioPath,
          language: dom.captionLanguage ? dom.captionLanguage.value : "en",
          model: dom.whisperModel ? dom.whisperModel.value : "small"
        });
      })
      .then(function (result) {
        hideProgress(dom.transcribeProgressBar, dom.transcribeProgress);

        if (!result.success) {
          throw new Error(result.error || "Transcription failed");
        }

        state.transcriptData = result;

        // Display transcript
        var output = "";
        if (result.segments && result.segments.length) {
          result.segments.forEach(function (seg, i) {
            var start = formatTime(seg.start);
            var end = formatTime(seg.end);
            output += "[" + start + " --> " + end + "] " + seg.text.trim() + "\n";
          });
        } else if (result.text) {
          output = result.text;
        }

        dom.transcriptOutput.textContent = output || "No transcript data";
        setStatus(dom.captionStatus, "Transcription complete: " + (result.segments ? result.segments.length : 0) + " segments");
        dom.btnExportSrt.disabled = false;
        dom.btnAddCaptionTrack.disabled = false;
      })
      .catch(function (err) {
        hideProgress(dom.transcribeProgressBar, dom.transcribeProgress);
        setStatus(dom.captionStatus, "Transcription failed");
        dom.transcriptOutput.textContent = String(err.message || err);
      })
      .finally(function () {
        dom.btnTranscribe.disabled = false;
      });
  }

  function formatTime(seconds) {
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = Math.floor(seconds % 60);
    var ms = Math.round((seconds % 1) * 1000);
    return pad2(h) + ":" + pad2(m) + ":" + pad2(s) + "," + pad3(ms);
  }

  function pad2(n) { return n < 10 ? "0" + n : String(n); }
  function pad3(n) { return n < 10 ? "00" + n : (n < 100 ? "0" + n : String(n)); }

  /* ============================================================
     CAPTIONS — EXPORT SRT
     ============================================================ */
  function exportSrt() {
    if (!state.transcriptData || !state.transcriptData.segments) return;

    setStatus(dom.captionStatus, "Exporting SRT...");

    backendPost("/export-srt", {
      segments: state.transcriptData.segments,
      outputPath: "" // Let server choose
    })
      .then(function (result) {
        if (result.success) {
          setStatus(dom.captionStatus, "SRT exported: " + result.outputPath);
        } else {
          setStatus(dom.captionStatus, "SRT export failed: " + (result.error || "unknown"));
        }
      })
      .catch(function (err) {
        setStatus(dom.captionStatus, "SRT export failed: " + String(err.message || err));
      });
  }

  /* ============================================================
     CAPTIONS — ADD CAPTION TRACK
     ============================================================ */
  function addCaptionTrack() {
    if (!state.transcriptData || !state.transcriptData.segments) return;

    dom.btnAddCaptionTrack.disabled = true;
    setStatus(dom.captionStatus, "Adding captions to timeline...");

    // Convert segments to SRT text before sending to host.jsx
    var srtText = "";
    state.transcriptData.segments.forEach(function (seg, i) {
      var start = formatTime(seg.start);
      var end = formatTime(seg.end);
      var text = (seg.text || "").trim();
      srtText += (i + 1) + "\n" + start + " --> " + end + "\n" + text + "\n\n";
    });

    var encoded = encodeURIComponent(srtText);

    runScriptPromise('addCaptionTrackToTimeline("' + encoded + '")')
      .then(function (response) {
        setStatus(dom.captionStatus, "Captions added to timeline");
        dom.transcriptOutput.textContent += "\n\n--- Captions added to Premiere timeline ---";
      })
      .catch(function (err) {
        setStatus(dom.captionStatus, "Caption add failed: " + String(err.message || err));
      })
      .finally(function () {
        dom.btnAddCaptionTrack.disabled = false;
      });
  }

  /* ============================================================
     ZOOM — FIND MOMENTS
     ============================================================ */
  function findZoomMoments() {
    var keywordsStr = dom.zoomKeywords ? dom.zoomKeywords.value : "";
    if (!keywordsStr.trim()) {
      setStatus(dom.zoomStatus, "Enter keywords first");
      return;
    }

    var keywords = keywordsStr.split(",").map(function (k) { return k.trim(); }).filter(Boolean);
    if (keywords.length === 0) {
      setStatus(dom.zoomStatus, "Enter at least one keyword");
      return;
    }

    dom.btnFindZoomMoments.disabled = true;
    setStatus(dom.zoomStatus, "Finding zoom moments...");

    // We need transcript data first
    if (!state.transcriptData || !state.transcriptData.segments) {
      setStatus(dom.zoomStatus, "Run transcription first (Captions tab)");
      dom.btnFindZoomMoments.disabled = false;
      return;
    }

    // Search transcript for keywords
    var moments = [];
    state.transcriptData.segments.forEach(function (seg) {
      var text = seg.text.toLowerCase();
      keywords.forEach(function (kw) {
        if (text.indexOf(kw.toLowerCase()) !== -1) {
          moments.push({
            keyword: kw,
            time: seg.start,
            end: seg.end,
            text: seg.text.trim()
          });
        }
      });
    });

    state.zoomMoments = moments;

    // Display results
    var output = "Found " + moments.length + " zoom moments:\n\n";
    moments.forEach(function (m, i) {
      output += (i + 1) + ". [" + formatTime(m.time) + "] \"" + m.keyword + "\" — " + m.text + "\n";
    });

    dom.zoomResults.textContent = output;
    setStatus(dom.zoomStatus, moments.length + " zoom moments found");
    dom.btnApplyZoom.disabled = moments.length === 0;
    dom.btnFindZoomMoments.disabled = false;
  }

  /* ============================================================
     ZOOM — APPLY KEYFRAMES
     ============================================================ */
  function applyZoomKeyframes() {
    if (state.zoomMoments.length === 0) return;

    dom.btnApplyZoom.disabled = true;
    setStatus(dom.zoomStatus, "Applying zoom keyframes...");

    var settings = {
      scale: parseNumber(dom.zoomScale && dom.zoomScale.value, 120),
      duration: parseNumber(dom.zoomDuration && dom.zoomDuration.value, 1.5),
      ease: dom.zoomEase ? dom.zoomEase.value : "ease"
    };

    var encoded = encodeURIComponent(JSON.stringify({
      moments: state.zoomMoments,
      settings: settings
    }));

    runScriptPromise('applyZoomKeyframes("' + encoded + '")')
      .then(function (response) {
        var data = parseJsonResponse(response);
        if (data && data.success) {
          setStatus(dom.zoomStatus, "Zoom keyframes applied: " + (data.keyframesAdded || 0));
        } else {
          setStatus(dom.zoomStatus, data ? data.error : "Zoom apply failed");
        }
        dom.zoomResults.textContent += "\n\n" + response;
      })
      .catch(function (err) {
        setStatus(dom.zoomStatus, "Zoom apply failed: " + String(err.message || err));
      })
      .finally(function () {
        dom.btnApplyZoom.disabled = false;
      });
  }

  /* ============================================================
     B-ROLL — EXTRACT KEYWORDS
     ============================================================ */
  function extractBrollKeywords() {
    if (!state.transcriptData || !state.transcriptData.segments) {
      setStatus(dom.brollStatus, "Run transcription first (Captions tab)");
      return;
    }

    dom.btnExtractKeywords.disabled = true;
    setStatus(dom.brollStatus, "Extracting keywords...");

    var fullText = state.transcriptData.segments.map(function (s) { return s.text; }).join(" ");

    backendPost("/extract-keywords", {
      text: fullText,
      maxKeywords: parseNumber(dom.brollMaxKeywords && dom.brollMaxKeywords.value, 5),
      apiKey: dom.settingsOpenaiKey ? dom.settingsOpenaiKey.value : ""
    })
      .then(function (result) {
        if (!result.success) {
          throw new Error(result.error || "Keyword extraction failed");
        }

        var keywords = result.keywords || [];
        dom.brollKeywords.textContent = "Keywords: " + keywords.join(", ");
        setStatus(dom.brollStatus, keywords.length + " keywords extracted");
        dom.btnSearchBroll.disabled = keywords.length === 0;
      })
      .catch(function (err) {
        setStatus(dom.brollStatus, "Keyword extraction failed: " + String(err.message || err));
      })
      .finally(function () {
        dom.btnExtractKeywords.disabled = false;
      });
  }

  /* ============================================================
     B-ROLL — SEARCH PEXELS
     ============================================================ */
  function searchBroll() {
    var keywordsText = dom.brollKeywords ? dom.brollKeywords.textContent : "";
    var keywordsStr = keywordsText.replace("Keywords: ", "").trim();
    if (!keywordsStr) {
      setStatus(dom.brollStatus, "Extract keywords first");
      return;
    }

    dom.btnSearchBroll.disabled = true;
    setStatus(dom.brollStatus, "Searching Pexels...");

    var apiKey = (dom.pexelsApiKey ? dom.pexelsApiKey.value : "") ||
                 (dom.settingsPexelsKey ? dom.settingsPexelsKey.value : "");

    backendPost("/search-broll", {
      keywords: keywordsStr.split(",").map(function (k) { return k.trim(); }),
      apiKey: apiKey,
      orientation: dom.brollOrientation ? dom.brollOrientation.value : "landscape",
      maxResults: 8
    })
      .then(function (result) {
        if (!result.success) {
          throw new Error(result.error || "B-Roll search failed");
        }

        state.brollResults = result.videos || [];
        state.selectedBrollIndices = [];

        // Render grid
        dom.brollResults.innerHTML = "";
        state.brollResults.forEach(function (video, i) {
          var card = document.createElement("div");
          card.className = "broll-card";
          card.setAttribute("data-index", String(i));

          var img = document.createElement("img");
          img.src = video.thumbnail || video.image || "";
          img.alt = video.description || "B-Roll " + (i + 1);

          var label = document.createElement("div");
          label.className = "broll-label";
          label.textContent = video.description || ("Video " + (i + 1));

          card.appendChild(img);
          card.appendChild(label);

          card.addEventListener("click", function () {
            card.classList.toggle("selected");
            var idx = parseInt(card.getAttribute("data-index"), 10);
            var selIdx = state.selectedBrollIndices.indexOf(idx);
            if (selIdx === -1) {
              state.selectedBrollIndices.push(idx);
            } else {
              state.selectedBrollIndices.splice(selIdx, 1);
            }
            dom.btnInsertBroll.disabled = state.selectedBrollIndices.length === 0;
          });

          dom.brollResults.appendChild(card);
        });

        setStatus(dom.brollStatus, state.brollResults.length + " videos found");
      })
      .catch(function (err) {
        setStatus(dom.brollStatus, "B-Roll search failed: " + String(err.message || err));
      })
      .finally(function () {
        dom.btnSearchBroll.disabled = false;
      });
  }

  /* ============================================================
     B-ROLL — INSERT SELECTED
     ============================================================ */
  function insertBroll() {
    if (state.selectedBrollIndices.length === 0) return;

    dom.btnInsertBroll.disabled = true;
    setStatus(dom.brollStatus, "Downloading and inserting B-Roll...");

    var selectedVideos = state.selectedBrollIndices.map(function (i) {
      return state.brollResults[i];
    });

    backendPost("/download-broll", {
      videos: selectedVideos
    })
      .then(function (result) {
        if (!result.success) {
          throw new Error(result.error || "Download failed");
        }

        var filePaths = result.filePaths || [];
        if (filePaths.length === 0) {
          throw new Error("No files downloaded");
        }

        // Insert into Premiere timeline
        var encoded = encodeURIComponent(JSON.stringify(filePaths));
        return runScriptPromise('insertBrollClips("' + encoded + '")');
      })
      .then(function (response) {
        setStatus(dom.brollStatus, "B-Roll inserted into timeline");
        dom.brollResults.innerHTML += '<p style="color:var(--accent-green);margin-top:8px;">Inserted into timeline</p>';
      })
      .catch(function (err) {
        setStatus(dom.brollStatus, "B-Roll insert failed: " + String(err.message || err));
      })
      .finally(function () {
        dom.btnInsertBroll.disabled = false;
      });
  }

  /* ============================================================
     SETTINGS — CHECK BACKEND
     ============================================================ */
  function checkBackendHealth() {
    state.backendUrl = dom.backendUrl ? dom.backendUrl.value : state.backendUrl;
    dom.btnCheckBackend.disabled = true;
    setStatus(dom.settingsStatus, "Checking backend...");
    dom.backendHealth.textContent = "";

    backendGet("/health")
      .then(function (result) {
        dom.backendHealth.textContent = "Backend OK: " + JSON.stringify(result);
        setStatus(dom.settingsStatus, "Backend is running");
      })
      .catch(function (err) {
        dom.backendHealth.textContent = "Backend not reachable: " + String(err.message || err);
        setStatus(dom.settingsStatus, "Backend check failed. Start server: node backend/server.js");
      })
      .finally(function () {
        dom.btnCheckBackend.disabled = false;
      });
  }

  /* ============================================================
     INITIALIZATION
     ============================================================ */
  function bindEvents() {
    // Tab switching
    dom.tabBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        switchTab(btn.getAttribute("data-tab"));
      });
    });

    // Auto Cut
    dom.btnTestConnection.addEventListener("click", testConnection);
    dom.btnDuplicateSeq.addEventListener("click", duplicateSequence);
    dom.btnExportAudio.addEventListener("click", exportAudio);
    dom.btnDetectLanguage.addEventListener("click", detectLanguage);
    dom.btnAnalyzeSilence.addEventListener("click", analyzeSilence);
    dom.btnAddMarkers.addEventListener("click", addMarkers);
    dom.btnAddRazorCuts.addEventListener("click", addRazorCuts);
    dom.btnApplyCleanCut.addEventListener("click", applyCleanCut);

    dom.detectionEngine.addEventListener("change", updateEngineVisibility);
    dom.cutStyle.addEventListener("change", function () {
      applyCutStylePreset(dom.cutStyle.value);
    });

    // Captions
    dom.btnTranscribe.addEventListener("click", transcribeAudio);
    dom.btnExportSrt.addEventListener("click", exportSrt);
    dom.btnAddCaptionTrack.addEventListener("click", addCaptionTrack);

    // Zoom
    dom.btnFindZoomMoments.addEventListener("click", findZoomMoments);
    dom.btnApplyZoom.addEventListener("click", applyZoomKeyframes);

    // B-Roll
    dom.btnExtractKeywords.addEventListener("click", extractBrollKeywords);
    dom.btnSearchBroll.addEventListener("click", searchBroll);
    dom.btnInsertBroll.addEventListener("click", insertBroll);

    // Settings
    dom.btnCheckBackend.addEventListener("click", checkBackendHealth);
  }

  function init() {
    cacheDom();
    bindEvents();
    updateEngineVisibility();
    updateActionButtons();
    loadJSX();

    // Apply default cut style
    applyCutStylePreset("natural");

    setStatus("CutThat Pro loaded. Click 'Test Connection' to verify Premiere link.");
  }

  // Start when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
