import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { DEFAULT_CENTER, REQUEST_TYPES, SAFE_ZONE_TYPES, STATUS_COLORS } from '../constants'
import { hasLoc, timeAgo } from '../utils'

/*
  Map used on every screen.

  Design notes
  - Uses CircleMarker and divIcon only. Leaflet's default image marker breaks under Vite
    (missing marker-icon.png), so we never touch it.
  - Frames itself: fits all points once when data (or your position) first appears,
    then leaves the view alone so panning is never fought.
  - Watches its own size (ResizeObserver), which fixes the grey/half-loaded tiles you get when
    the map is created inside a layout that is still settling.

  Props
    requests      [{id, lat, lng, type, status, source, createdAt}]
    safeZones     [{id, lat, lng, name, type}]
    me            [lat, lng] or null      the viewer's own position
    draft         [lat, lng] or null      a point being placed (new safe zone)
    onMapClick    (latlng) => void        when set, the map is in "pick a point" mode
    hint          string shown as a banner over the map
    flyTo         {lat, lng, k, zoom?}    change it to make the map fly there
    legend        false hides the colour key (default true)
    selectedId    request id to emphasise
    onSelectRequest (id) => void
    height        number (px)
*/

const zoneIconCache = {}
function zoneIcon(type) {
  if (!zoneIconCache[type]) {
    const glyph = (SAFE_ZONE_TYPES[type] || SAFE_ZONE_TYPES.shelter).glyph
    zoneIconCache[type] = L.divIcon({
      className: '',
      html: `<div class="pin pin-zone">${glyph}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16],
    })
  }
  return zoneIconCache[type]
}

const meIcon = L.divIcon({
  className: '',
  html: '<div class="pin-me"><span></span></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
})

function AutoView({ points, fitKey }) {
  const map = useMap()
  const latest = useRef(points)
  latest.current = points
  useEffect(() => {
    const pts = latest.current
    if (!pts.length) return
    if (pts.length === 1) map.setView(pts[0], 14)
    else map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 })
  }, [fitKey, map])
  return null
}

function SizeWatcher() {
  const map = useMap()
  useEffect(() => {
    const first = setTimeout(() => map.invalidateSize(), 150)
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(map.getContainer())
    return () => {
      clearTimeout(first)
      ro.disconnect()
    }
  }, [map])
  return null
}

function FlyTo({ target }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], target.zoom || Math.max(map.getZoom(), 15), { duration: 0.6 })
  }, [target, map])
  return null
}

function ClickHandler({ onClick }) {
  useMapEvents({
    click: (e) => onClick && onClick([e.latlng.lat, e.latlng.lng]),
  })
  return null
}

export default function MapView({
  requests = [],
  safeZones = [],
  me = null,
  draft = null,
  onMapClick,
  hint,
  flyTo,
  selectedId,
  onSelectRequest,
  legend = true,
  height = 380,
}) {
  const located = useMemo(() => requests.filter(hasLoc), [requests])
  const zones = useMemo(() => safeZones.filter(hasLoc), [safeZones])

  const points = useMemo(() => {
    const p = []
    if (me) p.push(me)
    located.forEach((r) => p.push([r.lat, r.lng]))
    zones.forEach((z) => p.push([z.lat, z.lng]))
    return p
  }, [me, located, zones])

  // Re-frame only when "me" first appears or data first appears
  const fitKey = `${me ? 1 : 0}-${points.length > 0 ? 1 : 0}`

  return (
    <div className={`map-wrap ${onMapClick ? 'picking' : ''}`} style={{ height }}>
      <MapContainer center={DEFAULT_CENTER} zoom={5} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />
        <SizeWatcher />
        <AutoView points={points} fitKey={fitKey} />
        <FlyTo target={flyTo} />
        {onMapClick && <ClickHandler onClick={onMapClick} />}

        {zones.map((z) => (
          <Marker key={z.id} position={[z.lat, z.lng]} icon={zoneIcon(z.type)}>
            <Popup>
              <strong>{z.name}</strong>
              <br />
              {(SAFE_ZONE_TYPES[z.type] || SAFE_ZONE_TYPES.shelter).label}
            </Popup>
          </Marker>
        ))}

        {located.map((r) => {
          const selected = r.id === selectedId
          const fromDevice = r.source === 'mesh'
          return (
            <CircleMarker
              key={r.id}
              center={[r.lat, r.lng]}
              radius={selected ? 15 : 10}
              pathOptions={{
                color: fromDevice ? '#0F2A4A' : '#ffffff',
                weight: selected ? 4 : 3,
                fillColor: STATUS_COLORS[r.status] || '#868e96',
                fillOpacity: 0.95,
              }}
              eventHandlers={{ click: () => onSelectRequest && onSelectRequest(r.id) }}
            >
              <Popup>
                <strong>{(REQUEST_TYPES[r.type] || { label: r.type }).label}</strong>
                <br />
                {r.status}, {fromDevice ? `field device ${r.deviceId || ''}` : 'public SOS'}
                <br />
                {timeAgo(r.createdAt)}
              </Popup>
            </CircleMarker>
          )
        })}

        {draft && (
          <CircleMarker
            center={draft}
            radius={14}
            pathOptions={{ color: '#1971c2', weight: 3, dashArray: '4 6', fillColor: '#1971c2', fillOpacity: 0.2 }}
          />
        )}

        {me && <Marker position={me} icon={meIcon} interactive={false} zIndexOffset={1000} />}
      </MapContainer>

      {hint && <div className="map-hint">{hint}</div>}

      {legend && (
      <div className="legend">
        <span><i className="dot" style={{ background: STATUS_COLORS.pending }} />Pending</span>
        <span><i className="dot" style={{ background: STATUS_COLORS.accepted }} />Accepted</span>
        <span><i className="dot" style={{ background: STATUS_COLORS.resolved }} />Resolved</span>
        <span><i className="dot ring" />Field device</span>
        <span><i className="sq" />Safe place</span>
      </div>
      )}
    </div>
  )
}
