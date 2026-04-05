"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AudioPlayerProps {
  src: string;
}

const SPEEDS = [0.5, 1, 1.5, 2] as const;

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function AudioPlayer({ src }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;

    const onLoadedMetadata = () => setDuration(audio.duration);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
      audio.pause();
      audio.src = "";
    };
  }, [src]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const audio = audioRef.current;
      if (!audio) return;
      const value = parseFloat(e.target.value);
      audio.currentTime = value;
      setCurrentTime(value);
    },
    []
  );

  const cycleSpeed = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const idx = SPEEDS.indexOf(speed);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    audio.playbackRate = next;
    setSpeed(next);
  }, [speed]);

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
      <Button
        variant="outline"
        size="sm"
        onClick={togglePlay}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="h-8 w-8 shrink-0 p-0"
      >
        {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
      </Button>

      <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
        {formatTime(currentTime)}
      </span>

      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={currentTime}
        onChange={handleSeek}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary"
      />

      <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
        {formatTime(duration)}
      </span>

      <button
        type="button"
        onClick={cycleSpeed}
        className="shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums hover:bg-muted"
      >
        {speed}x
      </button>
    </div>
  );
}
