"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { RECORD_RATE } from "@/lib/voice";
import { encodeWav, resampleToInt16 } from "@/lib/wav";

export type RecorderState = "idle" | "starting" | "recording" | "denied" | "failed";

const WORKLET = `class Capture extends AudioWorkletProcessor { process(inputs) { const c = inputs[0] && inputs[0][0]; if (c) this.port.postMessage(c.slice(0)); return true; } } registerProcessor('capture', Capture);`;
const LEVELS = 56;

const canRecord = () => typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof AudioContext !== "undefined" && typeof AudioWorkletNode !== "undefined";

/**
 * Records the microphone as 16 kHz mono WAV, which ElevenLabs Scribe reads directly (no conversion on
 * our side). The microphone is only asked for when start() is called. `levels` is a rolling list of
 * loudness values for the live waveform.
 */
export function useRecorder(maxSeconds: number, onLimit?: () => void) {
  const supported = useSyncExternalStore(() => () => undefined, canRecord, () => false);
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(LEVELS).fill(0.04));
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const chunks = useRef<Float32Array[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const started = useRef(0);
  const limitRef = useRef(onLimit);
  useEffect(() => {
    limitRef.current = onLimit;
  });

  const release = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void ctx.current?.close().catch(() => undefined);
  }, []);
  useEffect(() => release, [release]);

  const start = useCallback(async () => {
    if (!canRecord()) return setState("failed");
    setState("starting");
    chunks.current = [];
    setSeconds(0);
    setLevels(Array(LEVELS).fill(0.04));
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      stream.current = media;
      const audio = new AudioContext();
      ctx.current = audio;
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
      await audio.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const source = audio.createMediaStreamSource(media);
      const node = new AudioWorkletNode(audio, "capture");
      let window = 0;
      let count = 0;
      node.port.onmessage = (e: MessageEvent<Float32Array>) => {
        chunks.current.push(e.data);
        let sum = 0;
        for (const v of e.data) sum += v * v;
        window += Math.sqrt(sum / e.data.length);
        // About every 80 ms, one bar.
        if (++count * e.data.length >= audio.sampleRate * 0.08) {
          const level = Math.min(1, (window / count) * 5);
          setLevels((l) => [...l.slice(1), Math.max(0.04, level)]);
          window = 0;
          count = 0;
        }
      };
      source.connect(node);
      // The worklet must be connected to run; it outputs silence.
      const mute = audio.createGain();
      mute.gain.value = 0;
      node.connect(mute).connect(audio.destination);
      started.current = Date.now();
      setState("recording");
      timer.current = setInterval(() => {
        const s = (Date.now() - started.current) / 1000;
        setSeconds(Math.min(maxSeconds, s));
        if (s >= maxSeconds) {
          if (timer.current) clearInterval(timer.current);
          limitRef.current?.();
        }
      }, 200);
    } catch (e) {
      release();
      setState((e as DOMException)?.name === "NotAllowedError" || (e as DOMException)?.name === "SecurityError" ? "denied" : "failed");
    }
  }, [maxSeconds, release]);

  /** Stop and return the recording as a WAV, or null if nothing was recorded. */
  const stop = useCallback(async (): Promise<Blob | null> => {
    const rate = ctx.current?.sampleRate ?? 48000;
    const taken = chunks.current;
    chunks.current = [];
    release();
    setState("idle");
    if (!taken.length) return null;
    const wav = encodeWav(resampleToInt16(taken, rate, RECORD_RATE), RECORD_RATE);
    return new Blob([wav as BlobPart], { type: "audio/wav" });
  }, [release]);

  const cancel = useCallback(() => {
    chunks.current = [];
    release();
    setState("idle");
  }, [release]);

  return { supported, state, seconds, levels, start, stop, cancel };
}
