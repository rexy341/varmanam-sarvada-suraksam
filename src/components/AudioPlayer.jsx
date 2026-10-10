import { useEffect, useRef, useState } from 'react'
import { PlayerIcon } from './Icon'

const fmt = (s) => `0:${String(Math.max(0, Math.round(s || 0))).padStart(2, '0')}`

// Native <audio controls> renders differently (and dated) on every browser. This wraps a hidden
// <audio> element with one button and a slim bar — voice notes here never run past 60s, so a
// simple elapsed/total display is enough; no need for a full transport UI.
export default function AudioPlayer({ src, label }) {
  const ref = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onTime = () => setCurrent(el.currentTime)
    const onMeta = () => setDuration(el.duration || 0)
    const onEnd = () => { setPlaying(false); setCurrent(0) }
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('ended', onEnd)
    return () => {
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('ended', onEnd)
    }
  }, [src])

  function toggle() {
    const el = ref.current
    if (!el) return
    if (playing) el.pause()
    else el.play().catch(() => {})
    setPlaying(!playing)
  }

  function seek(e) {
    const el = ref.current
    if (!el || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    el.currentTime = ratio * duration
    setCurrent(el.currentTime)
  }

  const pct = duration ? (current / duration) * 100 : 0

  return (
    <div className="aplayer" role="group" aria-label={label}>
      <audio ref={ref} src={src} preload="metadata" className="visually-hidden" />
      <button type="button" className="aplayer-btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
        <PlayerIcon type={playing ? 'pause' : 'play'} />
      </button>
      <div className="aplayer-track" onClick={seek}>
        <div className="aplayer-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="aplayer-time">{fmt(current)} / {fmt(duration)}</span>
    </div>
  )
}
