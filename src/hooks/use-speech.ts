"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Dictation and read-back through the browser's own speech engines.
 *
 * Nothing is uploaded and no key is needed — recognition and synthesis both run
 * in the browser. The trade is support: Chrome and Edge implement recognition,
 * Firefox does not, so `canListen` gates the microphone rather than offering a
 * button that silently does nothing.
 */
export function useSpeech(options: { onTranscript: (text: string) => void }) {
  const { onTranscript } = options;

  const [canListen, setCanListen] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // Kept in a ref so the recognition callbacks always see the current handler
  // without having to tear down and rebuild the instance on every render.
  const transcriptRef = useRef(onTranscript);
  transcriptRef.current = onTranscript;

  useEffect(() => {
    if (typeof window === "undefined") return;

    setCanSpeak("speechSynthesis" in window);

    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let text = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        text += event.results[i]?.[0]?.transcript ?? "";
      }
      transcriptRef.current(text);
    };

    recognition.onerror = (event) => {
      // "aborted" and "no-speech" are ordinary outcomes of stopping or pausing.
      if (event.error !== "aborted" && event.error !== "no-speech") {
        console.warn("[speech] Recognition error:", event.error);
      }
      setListening(false);
    };

    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    setCanListen(true);

    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
      recognitionRef.current = null;
    };
  }, []);

  // A page that keeps talking after you navigate away is the worst failure mode
  // of speech synthesis, so cancel anything queued on unmount.
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const startListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    // Listening while the assistant talks would transcribe its own voice.
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    }

    try {
      recognition.start();
      setListening(true);
    } catch {
      // start() throws if it is already running; treat that as already on.
      setListening(true);
    }
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();

    // Bullet markers and dashes are read out literally, so strip the ones the
    // assistant uses for formatting.
    const spoken = text.replace(/[•*]/g, " ").replace(/\s+—\s+/g, ", ").trim();
    if (!spoken) return;

    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.lang = "en-US";
    utterance.rate = 1.02;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  return { canListen, canSpeak, listening, speaking, startListening, stopListening, speak, stopSpeaking };
}
