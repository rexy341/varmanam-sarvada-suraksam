import { useEffect, useRef, useState } from 'react'
import { useLang } from '../i18n'
import Icon from './Icon'
import AudioPlayer from './AudioPlayer'

/*
  Deliberate, user-started evidence for an SOS: a short voice note and/or a photo.

  What this can and can't do, on purpose:
  - Both only run while this tab is open and the person is actively looking at it. No browser can
    keep recording once the screen locks or the app is backgrounded — that's an OS permission
    boundary on every phone, not something this component works around.
  - The voice note is capped at 60 seconds and kept at a low bitrate so it fits as a plain field on
    the Firestore request document (no paid Storage). The photo is resized and compressed client-side
    for the same reason. Actual size is measured after recording/capture, not just requested — some
    browsers ignore the requested bitrate — so an oversized result is caught and rejected with a
    reason rather than silently sent.

  Props: audio ({data, seconds} | null), onAudioChange(next|null), photo (data url | null),
  onPhotoChange(next|null). The parent (PublicHome) just holds these two values and puts them on the
  request document when the SOS is sent.
*/

const MAX_SECONDS = 60
const MAX_AUDIO_BYTES = 600_000   // base64 string length, comfortably inside Firestore's 1 MiB document cap
const MAX_PHOTO_BYTES = 350_000
const AUDIO_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']

function pickAudioMime() {
  if (typeof MediaRecorder === 'undefined') return null
  return AUDIO_MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported?.(m)) || ''
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

// Resize + compress a captured photo on a <canvas> until it's small enough to fit as a Firestore field
function compressPhoto(file, maxBytes) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const maxDim = 900
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      let quality = 0.7
      const tryExport = () => {
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        if (dataUrl.length <= maxBytes || quality <= 0.25) resolve(dataUrl.length <= maxBytes ? dataUrl : null)
        else { quality -= 0.15; tryExport() }
      }
      tryExport()
    }
    img.onerror = reject
    img.src = url
  })
}

export default function EvidenceCapture({ audio, onAudioChange, photo, onPhotoChange }) {
  const { t } = useLang()
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const stopTimeoutRef = useRef(null)
  const fileInputRef = useRef(null)
  const elapsedRef = useRef(0)

  useEffect(() => () => {
    // Release the mic and timers if the person navigates away mid-recording
    clearInterval(timerRef.current)
    clearTimeout(stopTimeoutRef.current)
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
  }, [])

  async function startRecording() {
    setError('')
    const mime = pickAudioMime()
    if (mime === null) return setError(t('ev_notSupported'))
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 16000 } : { audioBitsPerSecond: 16000 })
      recorderRef.current = rec
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = async () => {
        clearInterval(timerRef.current)
        clearTimeout(stopTimeoutRef.current)
        stream.getTracks().forEach((tr) => tr.stop())
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        const dataUrl = await blobToDataUrl(blob)
        setRecording(false)
        if (dataUrl.length > MAX_AUDIO_BYTES) {
          setError(t('ev_tooLarge'))
          onAudioChange(null)
        } else {
          onAudioChange({ data: dataUrl, seconds: elapsedRef.current })
        }
      }
      rec.start()
      setRecording(true)
      setElapsed(0)
      elapsedRef.current = 0
      timerRef.current = setInterval(() => { elapsedRef.current += 1; setElapsed(elapsedRef.current) }, 1000)
      stopTimeoutRef.current = setTimeout(() => rec.state === 'recording' && rec.stop(), MAX_SECONDS * 1000)
    } catch {
      setError(t('ev_permissionDenied'))
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }

  async function onPhotoSelected(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same shot after Retake
    if (!file) return
    setError('')
    try {
      const dataUrl = await compressPhoto(file, MAX_PHOTO_BYTES)
      if (!dataUrl) setError(t('ev_photoTooLarge'))
      else onPhotoChange(dataUrl)
    } catch {
      setError(t('ev_photoTooLarge'))
    }
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

  return (
    <div className="evidence">
      <p className="field-label">{t('ev_heading')}</p>
      <p className="fine evidence-sub">{t('ev_sub')}</p>

      <div className="evidence-row">
        {!audio && !recording && (
          <button type="button" className="btn outline sm evidence-btn" onClick={startRecording}>
            <Icon type="mic" size={18} /> {t('ev_recordStart')}
          </button>
        )}
        {recording && (
          <button type="button" className="btn danger sm evidence-recording evidence-btn" onClick={stopRecording}>
            <span className="rec-dot" /> {t('ev_recordStop')} · {mm}:{ss}
          </button>
        )}
        {audio && !recording && (
          <div className="evidence-clip">
            <AudioPlayer src={audio.data} label={t('ev_recordStart')} />
            <div className="row">
              <span className="fine">{t('ev_attached')} · {audio.seconds}s</span>
              <button type="button" className="linklike" onClick={startRecording}>{t('ev_recordAgain')}</button>
              <button type="button" className="linklike danger" onClick={() => onAudioChange(null)}>{t('ev_remove')}</button>
            </div>
          </div>
        )}
        {!recording && <span className="fine">{t('ev_maxLength')}</span>}
      </div>

      <div className="evidence-row">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onPhotoSelected}
          className="visually-hidden"
        />
        {!photo ? (
          <button type="button" className="btn outline sm evidence-btn" onClick={() => fileInputRef.current?.click()}>
            <Icon type="camera" size={18} /> {t('ev_takePhoto')}
          </button>
        ) : (
          <div className="evidence-clip">
            <img src={photo} alt="" className="evidence-photo" />
            <div className="row">
              <button type="button" className="linklike" onClick={() => fileInputRef.current?.click()}>{t('ev_retakePhoto')}</button>
              <button type="button" className="linklike danger" onClick={() => onPhotoChange(null)}>{t('ev_remove')}</button>
            </div>
          </div>
        )}
      </div>

      {error && <div className="notice error">{error}</div>}
    </div>
  )
}
