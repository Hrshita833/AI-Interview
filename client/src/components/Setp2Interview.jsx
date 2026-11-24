import React, { useState, useRef, useEffect, useCallback } from 'react';
import Timer from './Timer';
import DebugOverlay from './DebugOverlay';
import { motion } from "motion/react";
import { FaMicrophone, FaMicrophoneSlash, FaKeyboard, FaVolumeUp } from "react-icons/fa";
import axios from "axios";
import { ServerUrl } from '../App';
import { BsArrowRight } from 'react-icons/bs';
import personas from '../config/personas';
import { unlockAudio, getAudioContext } from '../utils/audioUnlock';
import { logDebugEvent, validateWavHeader } from '../utils/debugLogger';

function Step2Interview({ interviewData, onFinish }) {
  const { interviewId, questions, userName, gender = "female" } = interviewData;

  const safeGender = gender === "male" ? "male" : "female";
  const currentPersona = personas[safeGender] || personas.female;
  const personaName = interviewData.personaName || currentPersona.name;

  const [isIntroPhase, setIsIntroPhase] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [interimText, setInterimText] = useState("");
  const [feedback, setFeedback] = useState("");
  const [timeLeft, setTimeLeft] = useState(questions[0]?.timeLimit || 60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [subtitle, setSubtitle] = useState("");

  // Answer Mode: "voice" | "text"
  const hasSpeechRecognition =
    typeof window !== "undefined" &&
    ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);

  const [answerMode, setAnswerMode] = useState(() => {
    const saved = localStorage.getItem("interviewAnswerMode");
    if (saved === "voice" || saved === "text") return saved;
    return hasSpeechRecognition ? "voice" : "text";
  });

  const [isListening, setIsListening] = useState(false);
  const [micError, setMicError] = useState("");

  // Audio / TTS state
  const [isAIPlaying, setIsAIPlaying] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState(""); // Specific reason code
  const [showRetryVoice, setShowRetryVoice] = useState(false);
  const [audioContextState, setAudioContextState] = useState(() => {
    const ctx = getAudioContext();
    return ctx ? ctx.state : "unsupported";
  });

  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const recognitionRef = useRef(null);
  const restartCountRef = useRef(0);
  const restartTimerRef = useRef(null);
  const shouldListenRef = useRef(false);
  const prefetchCache = useRef({});

  const currentQuestion = questions[currentIndex];
  const videoSource = currentPersona.videoSrc;

  // Track AudioContext state changes
  useEffect(() => {
    const updateCtxState = () => {
      const ctx = getAudioContext();
      if (ctx) {
        setAudioContextState(ctx.state);
        logDebugEvent("context", "AudioContext state check", ctx.state);
      }
    };
    updateCtxState();
    const interval = setInterval(updateCtxState, 5000);
    return () => clearInterval(interval);
  }, []);

  // Log answer mode at mount
  useEffect(() => {
    logDebugEvent("mode", "active answer mode initialized", answerMode);
  }, []);

  /* ============================================================
   *  Audio Cleanup & Pipeline Management (Single Pipeline)
   * ============================================================ */
  const stopAllAudio = useCallback(() => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.onplay = null;
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
        audioRef.current.src = "";
      } catch (e) {}
    }
    if (window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }
    setIsAIPlaying(false);
    if (videoRef.current) {
      videoRef.current.pause();
      try {
        videoRef.current.currentTime = 0;
      } catch (e) {}
    }
  }, []);

  /* ============================================================
   *  Browser SpeechSynthesis Fallback (Clean, Single Utterance)
   * ============================================================ */
  const speakWithBrowserVoice = useCallback((text) => {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) {
        logDebugEvent("audio", "speechSynthesis unsupported", "No browser speech engine");
        resolve();
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) {
          const matched = voices.find((v) =>
            safeGender === "female"
              ? /female|zira|samantha|karen|victoria|en-in/i.test(v.name)
              : /male|david|mark|george|alex|en-in/i.test(v.name)
          );
          if (matched) utterance.voice = matched;
        }

        utterance.rate = 0.94;
        utterance.pitch = safeGender === "female" ? 1.05 : 0.95;

        utterance.onstart = () => {
          logDebugEvent("audio", "browser speech started", `Persona: ${personaName}`);
          setIsAIPlaying(true);
          videoRef.current?.play().catch(() => {});
        };

        utterance.onend = () => {
          logDebugEvent("audio", "browser speech ended", "Finished utterance");
          videoRef.current?.pause();
          if (videoRef.current) videoRef.current.currentTime = 0;
          setIsAIPlaying(false);
          setTimeout(resolve, 200);
        };

        utterance.onerror = (e) => {
          logDebugEvent("audio", "browser speech error", e.error || "unknown");
          setIsAIPlaying(false);
          resolve();
        };

        window.speechSynthesis.speak(utterance);
      } catch (e) {
        setIsAIPlaying(false);
        resolve();
      }
    });
  }, [safeGender, personaName]);

  /* ============================================================
   *  TTS Fetch with 15s Timeout, Header Validation & Caching
   * ============================================================ */
  const fetchTtsAudio = useCallback(async (text) => {
    const cacheKey = `${safeGender}:${text}`;
    if (prefetchCache.current[cacheKey]) {
      logDebugEvent("tts", "cache hit", `Loaded from client memory cache (${cacheKey.slice(0, 30)}...)`);
      return prefetchCache.current[cacheKey];
    }

    logDebugEvent("tts", "request started", {
      textLength: text.length,
      snippet: text.slice(0, 50) + "...",
      gender: safeGender,
      persona: personaName,
    });

    const response = await axios.post(
      ServerUrl + "/api/mock-interview/tts",
      { text, gender: safeGender },
      {
        withCredentials: true,
        responseType: "arraybuffer", // Retrieve raw arraybuffer for immediate header verification
        timeout: 15000,
      }
    );

    const arrayBuffer = response.data;
    const contentType = response.headers["content-type"] || "audio/wav";
    const byteSize = arrayBuffer.byteLength;

    logDebugEvent("tts", "response received", {
      status: response.status,
      contentType,
      byteSize: `${byteSize} bytes`,
    });

    // Validate WAV header
    const headerResult = validateWavHeader(arrayBuffer);
    logDebugEvent("wav", "header check", headerResult.reason, {
      sampleRate: headerResult.sampleRate,
      channels: headerResult.numChannels,
      bits: headerResult.bitsPerSample,
      dataSize: headerResult.dataSize,
      actualTotal: headerResult.actualTotalSize,
      valid: headerResult.valid,
    });

    const blob = new Blob([arrayBuffer], { type: "audio/wav" });
    const blobUrl = URL.createObjectURL(blob);
    prefetchCache.current[cacheKey] = blobUrl;
    return blobUrl;
  }, [safeGender, personaName]);

  // Prefetch NEXT question's TTS audio silently while candidate answers
  useEffect(() => {
    if (isIntroPhase) return;
    const nextIdx = currentIndex + 1;
    if (nextIdx < questions.length) {
      const nextQ = questions[nextIdx].question;
      fetchTtsAudio(nextQ).catch(() => {});
    }
  }, [currentIndex, isIntroPhase, questions, fetchTtsAudio]);

  /* ============================================================
   *  Main Speak Function (Gemini TTS -> Browser Voice Fallback)
   * ============================================================ */
  const speakText = useCallback((text) => {
    return new Promise(async (resolve) => {
      stopAllAudio();
      stopListening();
      // Allow previous audio engine cycle to clear before loading new buffer
      await new Promise((r) => setTimeout(r, 40));

      setTtsLoading(true);
      setShowRetryVoice(false);
      setSubtitle(text);

      let playSucceeded = false;

      try {
        const audioUrl = await fetchTtsAudio(text);

        if (!audioRef.current) {
          audioRef.current = new Audio();
        }
        const audio = audioRef.current;
        audio.src = audioUrl;

        audio.onloadedmetadata = () => {
          logDebugEvent("audio", "loadedmetadata", {
            duration: Number(audio.duration?.toFixed(2)) || "unknown",
          });
        };

        audio.oncanplay = () => {
          logDebugEvent("audio", "canplay", "Audio ready for playback");
        };

        audio.onplay = () => {
          logDebugEvent("audio", "play event", "Gemini TTS playback active");
          setIsAIPlaying(true);
          setTtsLoading(false);
          setVoiceNotice("");
          videoRef.current?.play().catch(() => {});
        };

        audio.onended = () => {
          logDebugEvent("audio", "ended", "Gemini TTS playback finished");
          videoRef.current?.pause();
          if (videoRef.current) videoRef.current.currentTime = 0;
          setIsAIPlaying(false);
          setTimeout(() => {
            setSubtitle("");
            resolve();
          }, 250);
        };

        audio.onerror = async () => {
          const mediaError = audio.error;
          logDebugEvent("audio", "HTML5 Audio error", {
            code: mediaError?.code,
            message: mediaError?.message || "Media playback error",
          });

          setTtsLoading(false);
          setShowRetryVoice(true);
          setVoiceNotice(`Voice unavailable (decode error ${mediaError?.code || "unknown"})`);
          await speakWithBrowserVoice(text);
          setSubtitle("");
          resolve();
        };

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          await playPromise;
          logDebugEvent("audio", "play resolved", "Native audio.play() succeeded");
          playSucceeded = true;
        }
      } catch (err) {
        logDebugEvent("audio", "play rejected / TTS failed", {
          name: err?.name || "Error",
          message: err?.message,
          status: err?.response?.status,
        });

        setTtsLoading(false);
        setShowRetryVoice(true);

        const status = err?.response?.status;
        if (status === 429) {
          setVoiceNotice("Voice unavailable (429 quota limit reached - using browser voice)");
        } else if (err?.name === "NotAllowedError") {
          setVoiceNotice("Voice unavailable (autoplay blocked, tap screen to enable)");
        } else if (err?.code === "ECONNABORTED" || /timeout/i.test(err?.message || "")) {
          setVoiceNotice("Voice unavailable (network timeout - using browser voice)");
        } else if (status === 404) {
          setVoiceNotice("Voice unavailable (404 model not found - using browser voice)");
        } else if (status) {
          setVoiceNotice(`Voice unavailable (server HTTP ${status} - using browser voice)`);
        } else {
          setVoiceNotice("Voice unavailable (using fallback voice)");
        }

        // Clean fallback to browser voice so the interview keeps going
        await speakWithBrowserVoice(text);
        setSubtitle("");
        resolve();
      }
    });
  }, [fetchTtsAudio, speakWithBrowserVoice, stopAllAudio]);

  /* ============================================================
   *  Speech Recognition (Voice Answer Mode)
   * ============================================================ */
  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    setIsListening(false);
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        logDebugEvent("mic", "SpeechRecognition stopped", "Manual or programmatic stop");
      } catch (e) {}
    }
  }, []);

  const startListening = useCallback(() => {
    if (!hasSpeechRecognition || isAIPlaying) return;
    setMicError("");
    unlockAudio();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
    }

    const SpeechRecognitionClass =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionClass();

    // Use continuous: false with controlled restart loop for Android Chrome stability
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsListening(true);
      setMicError("");
      logDebugEvent("mic", "SpeechRecognition started", "Listening for candidate speech");
    };

    recognition.onresult = (event) => {
      let interim = "";
      let finalChunk = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalChunk += event.results[i][0].transcript + " ";
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      if (finalChunk) {
        logDebugEvent("mic", "SpeechRecognition final chunk", finalChunk.trim());
        setAnswer((prev) => (prev ? prev.trim() + " " : "") + finalChunk.trim());
      }
      setInterimText(interim);
    };

    recognition.onerror = (event) => {
      logDebugEvent("mic", "SpeechRecognition error", { error: event.error, message: event.message });
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setMicError("Microphone permission denied. Allow mic access in browser settings or switch to Text answer mode.");
        shouldListenRef.current = false;
        setIsListening(false);
      } else if (event.error === "no-speech") {
        // Soft error, let restart loop handle
      } else if (event.error === "network") {
        setMicError("Speech recognition network error. You can switch to Text answer mode.");
      }
    };

    recognition.onend = () => {
      setInterimText("");
      logDebugEvent("mic", "SpeechRecognition turn ended", `Restart count: ${restartCountRef.current}`);

      // Controlled auto-restart with a 350ms delay to avoid Android beep loops
      if (shouldListenRef.current && !isAIPlaying && restartCountRef.current < 25) {
        restartCountRef.current += 1;
        restartTimerRef.current = setTimeout(() => {
          if (shouldListenRef.current && !isAIPlaying) {
            try {
              recognition.start();
            } catch (e) {
              setIsListening(false);
            }
          }
        }, 350);
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    shouldListenRef.current = true;
    restartCountRef.current = 0;

    try {
      recognition.start();
    } catch (e) {
      logDebugEvent("mic", "recognition.start() threw", e.message);
      setIsListening(false);
    }
  }, [hasSpeechRecognition, isAIPlaying]);

  const toggleMicListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleModeChange = (mode) => {
    setAnswerMode(mode);
    localStorage.setItem("interviewAnswerMode", mode);
    logDebugEvent("mode", "Answer mode switched", mode);
    if (mode === "text") {
      stopListening();
    }
  };

  /* ============================================================
   *  Intro + Question Progression Flow
   * ============================================================ */
  useEffect(() => {
    let isCancelled = false;

    const runIntro = async () => {
      if (isIntroPhase) {
        await speakText(
          `Hi ${userName}, I am ${personaName}. It's great to meet you today, and I hope you're feeling confident. I'll ask you a few questions, so take your time and let's begin.`
        );
        if (isCancelled) return;

        setIsIntroPhase(false);
      } else if (currentQuestion) {
        await new Promise((r) => setTimeout(r, 600));
        if (isCancelled) return;

        if (currentIndex === questions.length - 1) {
          await speakText("Alright, this final question might be a bit more challenging.");
          if (isCancelled) return;
        }

        await speakText(currentQuestion.question);
        if (isCancelled) return;

        // Auto-start listening if in voice mode and not playing
        if (answerMode === "voice" && hasSpeechRecognition) {
          startListening();
        }
      }
    };

    runIntro();

    return () => {
      isCancelled = true;
    };
  }, [isIntroPhase, currentIndex]);

  /* ============================================================
   *  Timer
   * ============================================================ */
  useEffect(() => {
    if (isIntroPhase || !currentQuestion) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isIntroPhase, currentIndex, currentQuestion]);

  useEffect(() => {
    if (!isIntroPhase && currentQuestion) {
      setTimeLeft(currentQuestion.timeLimit || 60);
    }
  }, [currentIndex]);

  /* ============================================================
   *  Submit Answer / Next / Finish
   * ============================================================ */
  const submitAnswer = async () => {
    if (isSubmitting) return;
    stopListening();
    stopAllAudio();
    setIsSubmitting(true);

    const finalAnswer = (answer + " " + interimText).trim();

    try {
      const result = await axios.post(
        ServerUrl + "/api/interview/submit-answer",
        {
          interviewId,
          questionIndex: currentIndex,
          answer: finalAnswer,
          timeTaken: currentQuestion.timeLimit - timeLeft,
        },
        { withCredentials: true }
      );

      setFeedback(result.data.feedback);
      speakText(result.data.feedback);
      setIsSubmitting(false);
    } catch (error) {
      console.error("Submit error:", error);
      setIsSubmitting(false);
    }
  };

  const handleNext = async () => {
    stopListening();
    stopAllAudio();
    setAnswer("");
    setInterimText("");
    setFeedback("");
    setMicError("");

    if (currentIndex + 1 >= questions.length) {
      finishInterview();
      return;
    }

    await speakText("Alright, let's move to the next question.");
    setCurrentIndex((prev) => prev + 1);
  };

  const finishInterview = async () => {
    stopListening();
    stopAllAudio();
    try {
      const result = await axios.post(
        ServerUrl + "/api/interview/finish",
        { interviewId },
        { withCredentials: true }
      );
      onFinish(result.data);
    } catch (error) {
      console.error("Finish error:", error);
    }
  };

  const retryVoice = () => {
    unlockAudio();
    if (currentQuestion) {
      // Clear cached audio for current question to force re-fetch
      const cacheKey = `${safeGender}:${currentQuestion.question}`;
      delete prefetchCache.current[cacheKey];
      logDebugEvent("tts", "manual retry triggered", `Question ${currentIndex + 1}`);
      speakText(currentQuestion.question);
    }
  };

  // Auto-submit on timer end
  useEffect(() => {
    if (isIntroPhase || !currentQuestion) return;
    if (timeLeft === 0 && !isSubmitting && !feedback) {
      submitAnswer();
    }
  }, [timeLeft]);

  // Overall cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
      stopAllAudio();
      Object.values(prefetchCache.current).forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {}
      });
    };
  }, [stopListening, stopAllAudio]);

  return (
    <div
      onClick={unlockAudio}
      className='min-h-screen bg-linear-to-br from-emerald-50 via-white to-teal-100 flex items-center justify-center p-4 sm:p-6'
    >
      {/* Diagnostic Overlay visible only when ?debug=1 is in URL */}
      <DebugOverlay currentMode={answerMode} audioContextState={audioContextState} />

      <div className='w-full max-w-350 min-h-[80vh] bg-white rounded-3xl shadow-2xl border border-gray-200 flex flex-col lg:flex-row overflow-hidden'>
        {/* Left pane: Video Avatar + Timer + Status */}
        <div className='w-full lg:w-[35%] bg-white flex flex-col items-center p-6 space-y-6 border-r border-gray-200'>
          <div className='w-full max-w-md rounded-2xl overflow-hidden shadow-xl bg-gray-900 aspect-video flex items-center justify-center'>
            <video
              src={videoSource}
              key={videoSource}
              ref={videoRef}
              muted
              playsInline
              preload='auto'
              className='w-full h-full object-cover'
            />
          </div>

          {/* Subtitle / captions */}
          {(subtitle || ttsLoading) && (
            <div className='w-full max-w-md bg-gray-50 border border-gray-200 rounded-xl p-4 shadow-sm'>
              {ttsLoading && !subtitle && (
                <p className='text-gray-400 text-sm text-center animate-pulse'>
                  {personaName} is thinking...
                </p>
              )}
              {subtitle && (
                <p className='text-gray-700 text-sm sm:text-base font-medium text-center leading-relaxed'>
                  {subtitle}
                </p>
              )}
            </div>
          )}

          {/* Voice notice / Fallback notification with explicit reason */}
          {voiceNotice && (
            <div className='w-full max-w-md bg-amber-50 border border-amber-200 rounded-xl p-3 shadow-sm flex items-center justify-between text-xs text-amber-800'>
              <span className='font-medium'>{voiceNotice}</span>
              {showRetryVoice && (
                <button
                  onClick={retryVoice}
                  className='font-semibold text-emerald-700 hover:underline ml-2 flex items-center gap-1 shrink-0'
                >
                  <FaVolumeUp size={12} /> Retry voice
                </button>
              )}
            </div>
          )}

          {/* Timer Area */}
          <div className='w-full max-w-md bg-white border border-gray-200 rounded-2xl shadow-md p-6 space-y-5'>
            <div className='flex justify-between items-center'>
              <span className='text-sm text-gray-500'>Interview Status</span>
              {(isAIPlaying || ttsLoading) && (
                <span className='text-sm font-semibold text-emerald-600'>
                  {ttsLoading ? "Thinking..." : `${personaName} Speaking`}
                </span>
              )}
              {!isAIPlaying && !ttsLoading && !isIntroPhase && (
                <span className='text-sm font-semibold text-teal-600'>Your Turn</span>
              )}
            </div>

            <div className='h-px bg-gray-200'></div>

            <div className='flex justify-center'>
              <Timer timeLeft={timeLeft} totalTime={currentQuestion?.timeLimit} />
            </div>

            <div className='h-px bg-gray-200'></div>

            <div className='grid grid-cols-2 gap-6 text-center'>
              <div>
                <span className='text-2xl font-bold text-emerald-600'>
                  {currentIndex + 1}
                </span>
                <span className='text-xs text-gray-400 block'>Current Question</span>
              </div>
              <div>
                <span className='text-2xl font-bold text-emerald-600'>
                  {questions.length}
                </span>
                <span className='text-xs text-gray-400 block'>Total Questions</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right pane: Question + Answer Workspace */}
        <div className='flex-1 flex flex-col p-4 sm:p-6 md:p-8 relative'>
          {/* Header with Persona Name & Mode Toggle */}
          <div className='flex flex-wrap items-center justify-between gap-3 mb-6'>
            <h2 className='text-xl sm:text-2xl font-bold text-emerald-600'>
              AI Smart Interview with {personaName}
            </h2>

            {/* Answer Mode Toggle: Voice vs Text */}
            <div className='flex items-center bg-gray-100 p-1 rounded-xl border border-gray-200'>
              <button
                type='button'
                onClick={() => handleModeChange("voice")}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition ${
                  answerMode === "voice"
                    ? "bg-white text-emerald-700 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <FaMicrophone size={13} /> Voice answer
              </button>
              <button
                type='button'
                onClick={() => handleModeChange("text")}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition ${
                  answerMode === "text"
                    ? "bg-white text-emerald-700 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <FaKeyboard size={13} /> Text answer
              </button>
            </div>
          </div>

          {!isIntroPhase && (
            <div className='relative mb-4 bg-gray-50 p-4 sm:p-6 rounded-2xl border border-gray-200 shadow-sm'>
              <p className='text-xs sm:text-sm text-gray-400 mb-1'>
                Question {currentIndex + 1} of {questions.length}
              </p>
              <div className='text-base sm:text-lg font-semibold text-gray-800 leading-relaxed'>
                {currentQuestion?.question}
              </div>
            </div>
          )}

          {/* Answer Textarea */}
          <div className='flex-1 flex flex-col relative'>
            <textarea
              placeholder={
                answerMode === "voice"
                  ? isListening
                    ? "Listening... Speak your answer now..."
                    : "Tap the mic below to speak, or type your answer here..."
                  : "Type your answer here..."
              }
              onChange={(e) => setAnswer(e.target.value)}
              value={answer + (interimText ? ` (${interimText})` : "")}
              disabled={isAIPlaying || ttsLoading}
              className='flex-1 min-h-[160px] bg-gray-100 p-4 sm:p-6 rounded-2xl resize-none outline-none border border-gray-200 focus:ring-2 focus:ring-emerald-500 transition text-gray-800 disabled:opacity-60'
            />

            {/* Voice Mode Status / Error notices */}
            {answerMode === "voice" && (
              <div className='mt-2 min-h-[22px] flex items-center justify-between text-xs'>
                {isListening ? (
                  <span className='text-emerald-600 font-medium flex items-center gap-1.5 animate-pulse'>
                    <span className='w-2 h-2 rounded-full bg-emerald-500'></span> Listening to your voice...
                  </span>
                ) : (
                  <span className='text-gray-400'>
                    Tap mic to start voice answering. You can also edit text manually.
                  </span>
                )}
                {micError && (
                  <span className='text-red-600 font-medium ml-2'>{micError}</span>
                )}
              </div>
            )}
          </div>

          {/* Action buttons */}
          {!feedback ? (
            <div className='flex items-center gap-4 mt-4'>
              {answerMode === "voice" && (
                <motion.button
                  type='button'
                  onClick={toggleMicListening}
                  disabled={isAIPlaying || ttsLoading}
                  whileTap={{ scale: 0.9 }}
                  className={`w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded-full shadow-lg transition disabled:opacity-50 ${
                    isListening
                      ? "bg-red-500 text-white animate-pulse"
                      : "bg-black text-white hover:bg-gray-800"
                  }`}
                  title={isListening ? "Stop listening" : "Start voice answer"}
                >
                  {isListening ? <FaMicrophoneSlash size={20} /> : <FaMicrophone size={20} />}
                </motion.button>
              )}

              <motion.button
                onClick={submitAnswer}
                disabled={isSubmitting || isAIPlaying || ttsLoading || (!answer.trim() && !interimText.trim())}
                whileTap={{ scale: 0.95 }}
                className='flex-1 bg-gradient-to-r from-emerald-600 to-teal-500 text-white py-3 sm:py-4 rounded-2xl shadow-lg hover:opacity-90 transition font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed'
              >
                {isSubmitting ? "Submitting..." : "Submit Answer"}
              </motion.button>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className='mt-4 bg-emerald-50 border border-emerald-200 p-5 rounded-2xl shadow-sm'
            >
              <p className='text-emerald-700 font-medium mb-3'>{feedback}</p>
              <button
                onClick={handleNext}
                className='w-full bg-gradient-to-r from-emerald-600 to-teal-500 text-white py-3 rounded-xl shadow-md hover:opacity-90 transition flex items-center justify-center gap-2 font-semibold'
              >
                Next Question <BsArrowRight size={18} />
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Step2Interview;
