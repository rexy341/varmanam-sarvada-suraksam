export const DEFAULT_CENTER = [20.5937, 78.9629] // centre of India, used only when nothing else is known

export const HAZARD_LEVELS = {
  safe:    { label: 'Safe',    color: '#2f9e44', text: 'No active flood alert for your area.' },
  watch:   { label: 'Watch',   color: '#f08c00', text: 'Heavy rain expected. Get ready: cash, water, charged phone, documents.' },
  warning: { label: 'Warning', color: '#e8590c', text: 'Flooding likely. Move valuables up and know your route to a safe place.' },
  danger:  { label: 'Danger',  color: '#c92a2a', text: 'Flooding now. Stay out of water. Move to high ground or a safe place.' },
}

// Wording for levels that come from a forecast analysis (nothing is flooding yet)
export const HAZARD_FORECAST_TEXT = {
  safe:    'No flooding is expected in the next few days.',
  watch:   'Heavy rain is forecast. Get ready: cash, water, charged phone, documents.',
  warning: 'Flooding is likely in the next few days. Move valuables up and know your route to a safe place.',
  danger:  'Severe flooding is forecast. Move to high ground or a safe place early, and stay out of water.',
}

// needs = the capability a responding unit must have to be a match
export const REQUEST_TYPES = {
  trapped:    { label: 'Trapped / structural', needs: 'extraction' },
  medical:    { label: 'Medical emergency',    needs: 'medical' },
  evacuation: { label: 'Needs evacuation',     needs: 'transport' },
  food:       { label: 'Food / water shortage', needs: 'food_water' },
  shelter:    { label: 'Shelter needed',       needs: 'shelter' },
  missing:    { label: 'Missing person',       needs: 'search' },
}

export const PUBLIC_SOS_TYPES = ['trapped', 'medical', 'evacuation', 'food']

export const CAPABILITIES = [
  { id: 'medical',    label: 'Medical' },
  { id: 'food_water', label: 'Food / water' },
  { id: 'shelter',    label: 'Shelter' },
  { id: 'extraction', label: 'Extraction / boats' },
  { id: 'transport',  label: 'Transport' },
  { id: 'search',     label: 'Search' },
]

export const RESCUER_TYPES = [
  { id: 'police',      label: 'Police', idLabel: 'Service ID number' },
  { id: 'medic',       label: 'Doctor / medic', idLabel: 'NMC or state medical council registration no.' },
  { id: 'firefighter', label: 'Fire and emergency services', idLabel: 'Department ID' },
  { id: 'ndrf',        label: 'NDRF / SDRF', idLabel: 'Battalion / unit ID' },
  { id: 'ngo',         label: 'NGO volunteer', idLabel: 'NGO Darpan ID or organisation ID' },
  { id: 'other',       label: 'Other', idLabel: 'ID number' },
]

export const SAFE_ZONE_TYPES = {
  shelter: { label: 'Shelter',        glyph: '🏠' },
  camp:    { label: 'Relief camp',    glyph: '⛺' },
  high:    { label: 'High ground',    glyph: '⛰️' },
  medical: { label: 'Medical aid point', glyph: '➕' },
}

export const STATUS_COLORS = { pending: '#e8590c', accepted: '#f08c00', resolved: '#2f9e44' }

export const TIPS = {
  before: [
    'Keep some cash at home. UPI and cards stop working when the network is down.',
    'Store drinking water and dry food for at least three days.',
    'Charge phones and power banks. Keep a torch and spare batteries.',
    'Put documents and medicines in a waterproof bag.',
    'Find your nearest safe place on the map and learn the route to it.',
  ],
  during: [
    'Do not walk or drive through moving water. Even 15 cm can knock an adult off their feet.',
    'If you must cross water, keep to road dividers or raised edges, walk in a straight line and test each step with a stick.',
    'Do not travel alone. Move in a group and hold on to each other.',
    'Stay away from electric poles, fallen wires and open manholes.',
    'Go to a higher floor or high ground. Do not shelter in a basement.',
    'Switch off the mains power if water enters your home.',
  ],
  after: [
    'Wait for the official all-clear before going back.',
    'Drink only boiled or purified water until the supply is declared safe.',
    'Watch for snakes and damaged wiring in flooded homes.',
    'Photograph damage for relief and insurance claims.',
    'Report missing family members at the nearest relief camp.',
  ],
}
