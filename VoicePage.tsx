import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  AudioLines,
  Check,
  CircleHelp,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Square,
  X,
} from 'lucide-react'
import type { ToastKind } from './types'
import { formatTime } from './data'
import { Waveform } from './components'

export function getSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/aac',
  ]
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type
    }
  }
  return undefined
}

export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'stopped'

export interface VoicePageProps {
  onFinish: (duration: number, audioUrl: string | null, audioBlob?: Blob | null) => void
  onToast: (message: string, kind?: ToastKind) => void
  onBack: () => void
}

export const VoicePage = React.memo(function VoicePage({
  onFinish,
  onToast,
  onBack,
}: VoicePageProps) {
  const [status, setStatus] = useState<RecordingStatus>('idle')
  const [seconds, setSeconds] = useState(0)
  const [playbackSeconds, setPlaybackSeconds] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioBlobRef = useRef<Blob | null>(null)
  const timerRef = useRef<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)
  const mimeTypeRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    audioUrlRef.current = audioUrl
  }, [audioUrl])

  const cleanupRecording = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.onstop = null
        mediaRecorderRef.current.stop()
      } catch {
        // Ignore stop errors if already stopped
      }
      mediaRecorderRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
    }
    chunksRef.current = []
    audioBlobRef.current = null
    setIsPlaying(false)
    setPlaybackSeconds(0)
  }, [])

  useEffect(() => {
    return () => {
      cleanupRecording()
    }
  }, [cleanupRecording])

  const startRecording = async () => {
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onToast('Voice recording is not supported in this browser.', 'info')
      return
    }

    cleanupRecording()
    setAudioUrl(null)
    setSeconds(0)
    setPlaybackSeconds(0)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const preferredMime = getSupportedMimeType()
      mimeTypeRef.current = preferredMime
      const options: MediaRecorderOptions = preferredMime ? { mimeType: preferredMime } : {}
      const recorder = new MediaRecorder(stream, options)
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onerror = () => {
        onToast('A recording error occurred. Please try again.', 'info')
        cleanupRecording()
        setStatus('idle')
      }

      recorder.onstop = () => {
        const mime = mimeTypeRef.current || recorder.mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: mime })
        if (blob.size === 0) {
          onToast('No audio captured. Please try recording again.', 'info')
          setStatus('idle')
          return
        }
        audioBlobRef.current = blob
        const url = URL.createObjectURL(blob)
        setAudioUrl(url)
        setStatus('stopped')
        onToast('Recording finished. Preview your audio before saving.', 'success')
      }

      recorder.start(250)
      setStatus('recording')

      timerRef.current = window.setInterval(() => {
        setSeconds((prev) => prev + 1)
      }, 1000)

      onToast('Recording started with your microphone.', 'info')
    } catch (err: unknown) {
      const error = err as Error
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        onToast('Microphone permission was denied. Please allow microphone access in your browser.', 'info')
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        onToast('No microphone found on this device.', 'info')
      } else {
        onToast(`Could not start recording: ${error.message || 'Unknown error'}`, 'info')
      }
      cleanupRecording()
      setStatus('idle')
    }
  }

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.pause()
        if (timerRef.current) {
          window.clearInterval(timerRef.current)
          timerRef.current = null
        }
        setStatus('paused')
        onToast('Recording paused.', 'info')
      } catch {
        onToast('Could not pause recording.', 'info')
      }
    }
  }

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      try {
        mediaRecorderRef.current.resume()
        timerRef.current = window.setInterval(() => {
          setSeconds((prev) => prev + 1)
        }, 1000)
        setStatus('recording')
        onToast('Recording resumed.', 'info')
      } catch {
        onToast('Could not resume recording.', 'info')
      }
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
      try {
        mediaRecorderRef.current.stop()
      } catch {
        // Handled in onstop
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
    }
  }

  const cancelRecording = () => {
    cleanupRecording()
    setAudioUrl(null)
    setSeconds(0)
    setStatus('idle')
    onToast('Recording discarded. No audio was saved.', 'info')
  }

  const togglePlayback = () => {
    if (!audioRef.current || !audioUrl) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play().catch((err) => {
        console.warn('Playback error:', err)
        setIsPlaying(false)
      })
    }
  }

  const finishAndUse = () => {
    if (!audioUrl) return
    if (audioRef.current) {
      audioRef.current.pause()
    }
    // Prevent unmount from revoking URL as ownership transfers to editor
    audioUrlRef.current = null
    onFinish(seconds, audioUrl, audioBlobRef.current)
  }

  return (
    <div className="page-content voice-page">
      <audio
        ref={audioRef}
        src={audioUrl ?? undefined}
        onTimeUpdate={() => {
          if (audioRef.current) {
            setPlaybackSeconds(Math.floor(audioRef.current.currentTime))
          }
        }}
        onEnded={() => {
          setIsPlaying(false)
          setPlaybackSeconds(0)
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
      <div className="voice-toolbar">
        <button
          className="back-link"
          type="button"
          onClick={() => {
            cleanupRecording()
            onBack()
          }}
        >
          <ArrowLeft size={16} />
          <span>Your notes</span>
        </button>
        <span className="voice-saved-badge"><span /> PRIVATE BY DESIGN</span>
      </div>
      <section className="voice-stage reveal">
        <div className="voice-orbit voice-orbit-a" /><div className="voice-orbit voice-orbit-b" />
        <div className="voice-heading">
          <span className="voice-overline"><AudioLines size={15} /> VOICE MEMO</span>
          <h1>Let it come<br /><em>as it comes.</em></h1>
          <p>A thought, an errand, a half-remembered dream.<br />No need to find the right words first.</p>
        </div>
        <div className="recording-card">
          <div className="recording-card-top">
            <span className={status === 'recording' ? 'recording-indicator is-live' : 'recording-indicator'}>
              <i style={status === 'paused' ? { background: '#d8a34d' } : status === 'stopped' ? { background: '#59b88c' } : undefined} />
              {status === 'recording'
                ? 'RECORDING'
                : status === 'paused'
                ? 'RECORDING PAUSED'
                : status === 'stopped'
                ? 'PREVIEW READY'
                : 'READY WHEN YOU ARE'}
            </span>
            <span className="recording-format">
              {status === 'recording'
                ? 'MIC LIVE'
                : status === 'paused'
                ? 'PAUSED'
                : status === 'stopped'
                ? 'AUDIO READY'
                : 'VOICE NOTE · LOCAL'}
            </span>
          </div>
          <div className="waveform-wrap">
            <span className="wave-time">
              {formatTime(status === 'stopped' ? playbackSeconds : seconds)}
            </span>
            <Waveform active={status === 'recording' || isPlaying} />
            <span className="wave-duration">
              {status === 'recording'
                ? 'LIVE'
                : status === 'paused'
                ? 'PAUSED'
                : status === 'stopped'
                ? formatTime(seconds)
                : '00:00'}
            </span>
          </div>
          <div className="recording-controls">
            {status === 'idle' ? (
              <>
                <span style={{ width: 36 }} />
                <button
                  className="record-button"
                  type="button"
                  onClick={startRecording}
                  aria-label="Start recording"
                  title="Start recording"
                >
                  <Mic size={23} strokeWidth={1.7} />
                </button>
                <span className="recording-duration">00:00</span>
              </>
            ) : status === 'recording' ? (
              <>
                <button
                  className="discard-recording"
                  type="button"
                  onClick={cancelRecording}
                  aria-label="Cancel recording"
                  title="Cancel recording"
                >
                  <X size={18} />
                </button>
                <button
                  className="record-button record-button-active"
                  type="button"
                  onClick={pauseRecording}
                  aria-label="Pause recording"
                  title="Pause recording"
                >
                  <Pause size={20} />
                </button>
                <button
                  className="finish-recording"
                  type="button"
                  onClick={stopRecording}
                  aria-label="Stop recording"
                  title="Stop recording"
                >
                  <Square size={13} fill="currentColor" /> Stop
                </button>
              </>
            ) : status === 'paused' ? (
              <>
                <button
                  className="discard-recording"
                  type="button"
                  onClick={cancelRecording}
                  aria-label="Cancel recording"
                  title="Cancel recording"
                >
                  <X size={18} />
                </button>
                <button
                  className="record-button"
                  type="button"
                  onClick={resumeRecording}
                  aria-label="Resume recording"
                  title="Resume recording"
                >
                  <Mic size={22} />
                </button>
                <button
                  className="finish-recording"
                  type="button"
                  onClick={stopRecording}
                  aria-label="Stop recording"
                  title="Stop recording"
                >
                  <Square size={13} fill="currentColor" /> Stop
                </button>
              </>
            ) : (
              <>
                <button
                  className="discard-recording"
                  type="button"
                  onClick={cancelRecording}
                  aria-label="Discard and re-record"
                  title="Discard and re-record"
                >
                  <RotateCcw size={16} />
                </button>
                <button
                  className="record-button"
                  type="button"
                  onClick={togglePlayback}
                  aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
                  title={isPlaying ? 'Pause preview' : 'Play preview'}
                >
                  {isPlaying ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: 2 }} />}
                </button>
                <button
                  className="finish-recording"
                  type="button"
                  onClick={finishAndUse}
                  aria-label="Create note with this audio"
                  title="Create note with this audio"
                >
                  <Check size={15} /> Create note
                </button>
              </>
            )}
          </div>
          <p className="recording-disclaimer">
            <CircleHelp size={13} />{' '}
            {status === 'recording'
              ? 'Recording live audio from your microphone. Click pause to pause, or stop when done.'
              : status === 'paused'
              ? 'Recording paused. Click the mic to resume, or stop to finish.'
              : status === 'stopped'
              ? 'Preview your recording above before creating a note. Audio stays in this browser session.'
              : 'Microphone permission is requested only when you start recording.'}
          </p>
        </div>
        <div className="voice-footnote"><span className="footnote-rule" /><span>Take a breath. There’s no rush.</span><span className="footnote-rule" /></div>
      </section>
    </div>
  )
})
