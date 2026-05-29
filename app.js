const thresholds = {
  normalMax: 27,
  attentionMax: 30,
};

const WIRE_COUNT = 5;
const SENSOR_COUNT = 5;
const AERATION_SILO_COUNT = null;
const AERATION_MOTOR_COUNT = 2;
const AERATION_BASE_TEMP = 23.2;
const SAMPLE_COLLECTION_POINTS = 36;
const SAMPLE_TABLE_POINTS = 6;
const LOCAL_DB_KEY = 'coicamar-local-db-v3';
const WEATHER_TRENDS = ['Ensolarado', 'Nublado', 'Chovendo'];
const ACTION_COORDINATORS = ['Osmar Valderrama', 'Mateus Coaresma', 'Ulysses Coco', 'Elvis Faustino'];

const baseLaunches = [
  { date: '07/06/2026 - 08:30', responsible: 'João Silva', status: 'Padrão' },
  { date: '06/06/2026 - 14:20', responsible: 'João Silva', status: 'Atenção' },
  { date: '05/06/2026 - 09:10', responsible: 'Maria Santos', status: 'Crítico' },
  { date: '04/06/2026 - 16:45', responsible: 'João Silva', status: 'Padrão' },
  { date: '03/06/2026 - 07:55', responsible: 'Maria Santos', status: 'Atenção' },
];

const unitConfigs = {
  lobato: {
    name: 'Lobato',
    silos: [
      { name: 'Silo 01', status: 'Padrão', avg: 26.4, unit: 'lobato' },
      { name: 'Silo 02', status: 'Atenção', avg: 27.8, unit: 'lobato' },
    ]
  },
  sabaudia: {
    name: 'Sabaudia',
    silos: [
      { name: 'Silo 01', status: 'Crítico', avg: 29.6, unit: 'sabaudia' },
      { name: 'Silo 02', status: 'Atenção', avg: 27.2, unit: 'sabaudia' },
      { name: 'Silo 03', status: 'Padrão', avg: 25.1, unit: 'sabaudia' },
      { name: 'Silo 04', status: 'Padrão', avg: 24.8, unit: 'sabaudia' },
      { name: 'Silo 05', status: 'Atenção', avg: 28.1, unit: 'sabaudia' },
      { name: 'Silo 06', status: 'Padrão', avg: 26.2, unit: 'sabaudia' },
    ]
  },
  astorga: {
    name: 'Astorga',
    silos: [
      { name: 'Silo 01', status: 'Padrão', avg: 25.5, unit: 'astorga' },
      { name: 'Silo 02', status: 'Atenção', avg: 27.9, unit: 'astorga' },
      { name: 'Silo 03', status: 'Padrão', avg: 26.1, unit: 'astorga' },
    ]
  }
};

const siloConfigs = unitConfigs.lobato.silos;

const trendLabels = {
  increase: 'Aumentar',
  decrease: 'Diminuir',
};

const localDb = loadLocalDb();

let selectedTrend = 'increase';
let selectedLaunchIndex = 0;
let selectedHistorySilo = siloConfigs[0].name;
let selectedHistoryChartSilo = siloConfigs[0].name;
let selectedHistoryChartCable = 'all';
let selectedHistoryChartSensor = 'all';
let selectedHistoryChartStartDate = '';
let selectedHistoryChartEndDate = '';
let launchesBySilo = localDb.launchesBySilo;
let currentHistoryMatrix = getLatestLaunch(selectedHistorySilo).matrix;
let currentPage = 'dashboard';
let currentUnit = 'lobato';
let aerationData = localDb.aerationData;
let aerationHistory = localDb.aerationHistory;
let lastAerationUpdate = localDb.lastAerationUpdate;
let aerationFilters = {
  silo: 'all',
  period: getLatestAerationPeriod(localDb.aerationHistory),
};
let sampleLaunchesBySilo = localDb.sampleLaunchesBySilo;
let selectedSampleSilo = siloConfigs[0].name;
let selectedSampleLaunchIndex = 0;
let sampleFilters = {
  silo: 'all',
  period: getLatestSamplePeriod(localDb.sampleLaunchesBySilo),
};
let supervisorActions = localDb.supervisorActions;
let selectedAttentionForAction = null;
let completedAiRecommendations = new Set(localDb.completedAiRecommendations || []);
let pageUnitFilters = {
  termometria: 'lobato',
  aeracao: 'lobato',
  samples: 'lobato',
  history: 'lobato',
};
let dashboardFilters = {
  units: ['all'],
  startDate: '',
  endDate: '',
};


function unitSiloStorageKey(unitKey, siloName) {
  return `${unitKey}::${siloName}`;
}

function getCurrentUnitKey() {
  return currentUnit || 'lobato';
}

function getSiloDisplayName(siloKeyOrName) {
  return String(siloKeyOrName || '').includes('::')
    ? String(siloKeyOrName).split('::').pop()
    : siloKeyOrName;
}

function statusClassByValue(value) {
  if (!Number.isFinite(value)) return 'offline';
  if (value > thresholds.attentionMax) return 'critical';
  if (value >= thresholds.normalMax) return 'attention';
  return 'normal';
}

function statusClassByName(status) {
  if (status === 'Crítico') return 'critical';
  if (status === 'Atenção') return 'attention';
  return 'normal';
}

function badgeClass(status) {
  if (status === 'Crítico') return 'badge-critical';
  if (status === 'Atenção') return 'badge-attention';
  return 'badge-normal';
}

function randomFromSeed(row, col, seed = 1) {
  const x = Math.sin((row + 1) * 12.9898 + (col + 1) * 78.233 + seed * 17.31) * 43758.5453;
  return x - Math.floor(x);
}

function formatDateTime(date = new Date()) {
  return date.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).replace(',', ' -');
}


function formatDateOnlyBR(value) {
  if (!value) return '--';
  const match = String(value).match(/^(\d{2}\/\d{2}\/\d{4})/);
  return match ? match[1] : value;
}


function formatDateOnlyFromLaunchLabel(value) {
  if (!value) return '--';
  const match = String(value).match(/^(\d{2}\/\d{2}\/\d{4})/);
  return match ? match[1] : value;
}

function historyStatusSeverity(status) {
  if (status === 'Crítico') return 3;
  if (status === 'Atenção') return 2;
  return 1;
}

function getMonthInputValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getDateInputValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function generateMatrix(status = 'Padrão', seed = 1) {
  const matrix = [];
  for (let row = 0; row < SENSOR_COUNT; row += 1) {
    const line = [];
    for (let col = 0; col < WIRE_COUNT; col += 1) {
      const noise = randomFromSeed(row, col, seed) * 0.7;
      let value;
      if (status === 'Padrão') value = 24.5 + row * 0.34 + col * 0.04 + noise;
      if (status === 'Atenção') value = 25.0 + row * 0.62 + col * 0.05 + noise;
      if (status === 'Crítico') value = 25.2 + row * 0.88 + col * 0.08 + noise;
      line.push(Number(value.toFixed(1)));
    }
    matrix.push(line);
  }
  return matrix;
}

function average(matrix) {
  const values = matrix.flat().filter(Number.isFinite);
  if (!values.length) return 0;
  return Number((values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(1));
}

function extrema(matrix, type) {
  let best = type === 'max' ? -Infinity : Infinity;
  let location = { row: 0, col: 0 };
  let hasValue = false;

  matrix.forEach((line, row) => {
    line.forEach((value, col) => {
      if (!Number.isFinite(value)) return;
      hasValue = true;

      if ((type === 'max' && value > best) || (type === 'min' && value < best)) {
        best = value;
        location = { row, col };
      }
    });
  });

  if (!hasValue) return { value: '--', location: 'Sem leitura' };
  return { value: best.toFixed(1), location: `Sensor ${location.row + 1} - Cabo ${location.col + 1}` };
}

function statusFromTemperature(value) {
  if (value > thresholds.attentionMax) return 'Crítico';
  if (value >= thresholds.normalMax) return 'Atenção';
  return 'Padrão';
}

function normalizeOfflineSensors(sensors = []) {
  const unique = new Map();

  sensors.forEach(sensor => {
    const row = Number(sensor?.row);
    const col = Number(sensor?.col);
    if (!Number.isInteger(row) || !Number.isInteger(col)) return;
    if (row < 0 || row >= SENSOR_COUNT || col < 0 || col >= WIRE_COUNT) return;
    unique.set(`${row}:${col}`, { row, col });
  });

  return [...unique.values()].sort((a, b) => (a.col - b.col) || (a.row - b.row));
}

function applyOfflineSensors(matrix, offlineSensors = []) {
  const offlineSet = new Set(normalizeOfflineSensors(offlineSensors).map(sensor => `${sensor.row}:${sensor.col}`));
  return matrix.map((line, row) => line.map((value, col) => (offlineSet.has(`${row}:${col}`) ? null : value)));
}

function offlineSensorCount(launch) {
  return normalizeOfflineSensors(launch?.offlineSensors).length;
}

function affectedWireCount(launch) {
  return new Set(normalizeOfflineSensors(launch?.offlineSensors).map(sensor => sensor.col)).size;
}

function offlineSummary(launch) {
  const sensors = offlineSensorCount(launch);
  if (!sensors) return 'Sem sensores off';

  const wires = affectedWireCount(launch);
  if (sensors === 1) return '1 sensor sem leitura';
  return `${sensors} sensores sem leitura em ${wires} ${wires === 1 ? 'cabo' : 'cabos'}`;
}

function statusFromMatrix(matrix, offlineSensors = []) {
  const max = extrema(matrix, 'max');
  const maxValue = Number(max.value);
  const tempStatus = Number.isFinite(maxValue) ? statusFromTemperature(maxValue) : 'Padrão';
  if (offlineSensorCount({ offlineSensors }) > 0 && tempStatus === 'Padrão') return 'Atenção';
  return tempStatus;
}

function formatSensorValue(value) {
  if (!Number.isFinite(value)) return 'OFF';
  return `${value.toFixed(1)}°C`;
}

function formatExtremaTemperature(extreme) {
  if (extreme.value === '--') return '--';
  return `${extreme.value}°C`;
}

function buildInitialLaunches() {
  const store = {};

  siloConfigs.forEach((silo, siloIndex) => {
    store[silo.name] = baseLaunches.map((launch, launchIndex) => {
      const status = launchIndex === 0 ? silo.status : launch.status;

      const baseDate = new Date();
      baseDate.setDate(28 + launchIndex);
      baseDate.setHours(8 + launchIndex, 30, 0, 0);

      return {
        ...launch,
        date: formatDateTime(baseDate),
        silo: silo.name,
        status,
        offlineSensors: normalizeOfflineSensors(launch.offlineSensors),
        matrix: applyOfflineSensors(generateMatrix(status, (siloIndex + 1) * 100 + launchIndex + 1), launch.offlineSensors),
      };
    });
  });

  return store;
}

function buildInitialAerationData() {
  const statuses = ['Ligada', 'Desligada', 'Ligada', 'Desligada'];
  const hours = [124, 98, 156, 87];

  return siloConfigs.map((silo, index) => ({
    name: silo.name,
    status: statuses[index],
    monthlyHours: hours[index],
    lastStart: formatDateTime(new Date(Date.now() - (index + 1) * 42 * 60 * 1000)),
    motorCount: AERATION_MOTOR_COUNT,
    temperature: AERATION_BASE_TEMP,
  }));
}

function createAerationSnapshot(date, items) {
  return {
    id: `aeration-${date.getTime()}`,
    timestamp: date.toISOString(),
    date: formatDateTime(date),
    items: items.map(item => ({ ...item })),
  };
}

function generateSamplePoints(seed = Date.now(), hasAttention = false) {
  return Array.from({ length: SAMPLE_TABLE_POINTS }, (_, index) => {
    const humidity = 12.2 + randomFromSeed(index, 2, seed) * 1.2 + (hasAttention ? 0.7 : 0);
    const impurity = 0.6 + randomFromSeed(index, 5, seed) * 0.6 + (hasAttention ? 0.4 : 0);
    const damaged = 0.4 + randomFromSeed(index, 7, seed) * 0.5 + (hasAttention ? 0.3 : 0);

    return {
      point: `Ponto ${index + 1}`,
      humidity: Number(humidity.toFixed(1)),
      temperature: hasAttention
        ? Math.round(26 + randomFromSeed(index, 3, seed) * 7)
        : Math.round(22 + randomFromSeed(index, 3, seed) * 5),
      liveInsects: randomFromSeed(index, 9, seed) > 0.76 ? 1 : 0,
      deadInsects: randomFromSeed(index, 11, seed) > 0.86 ? 1 : 0,
      pulverized: randomFromSeed(index, 13, seed) > 0.9 ? 'SIM' : 'NÃO',
      purge: randomFromSeed(index, 15, seed) > 0.92 ? 'SIM' : 'NÃO',
      impurity: Number(impurity.toFixed(1)),
      damaged: Number(damaged.toFixed(1)),
    };
  });
}

function createSampleLaunch(siloName, date = new Date(), seed = Date.now()) {
  const hasAttention = randomFromSeed(3, 8, seed) > 0.62;

  return {
    id: `sample-${siloName.replace(/\s+/g, '-')}-${date.getTime()}-${Math.round(seed)}`,
    silo: siloName,
    timestamp: date.toISOString(),
    date: formatDateTime(date),
    pointCount: SAMPLE_COLLECTION_POINTS,
    status: randomFromSeed(2, 4, seed) > 0.36 ? 'Ligado' : 'Desligado',
    responsible: 'Carlos Eduardo',
    role: 'Operador de Armazém',
    points: generateSamplePoints(seed, hasAttention),
  };
}

function buildInitialSampleLaunches() {
  const store = {};

  siloConfigs.forEach((silo, siloIndex) => {
    store[silo.name] = Array.from({ length: 4 }, (_, launchIndex) => {
      const minutesAgo = launchIndex * 24 * 60 + siloIndex * 57 + 30;
      const date = new Date(Date.now() - minutesAgo * 60 * 1000);
      return createSampleLaunch(silo.name, date, (siloIndex + 1) * 900 + launchIndex * 17);
    });
  });

  return store;
}

function normalizeLaunchStore(store) {
  const initial = buildInitialLaunches();

  return siloConfigs.reduce((acc, silo) => {
    const launches = Array.isArray(store?.[silo.name]) && store[silo.name].length
      ? store[silo.name]
      : initial[silo.name];

    acc[silo.name] = launches.map(launch => ({
      ...launch,
      silo: silo.name,
      offlineSensors: normalizeOfflineSensors(launch.offlineSensors),
      matrix: Array.isArray(launch.matrix) ? launch.matrix : generateMatrix(launch.status || 'Padrão'),
    }));
    return acc;
  }, {});
}

function normalizeAerationItems(items) {
  const initial = buildInitialAerationData();
  const sourceByName = new Map(Array.isArray(items) ? items.map(item => [item.name, item]) : []);

  return siloConfigs.map((silo, index) => {
    const base = initial[index];
    const source = sourceByName.get(silo.name) || {};
    const monthlyHours = Number(source.monthlyHours);
    const temperature = Number(source.temperature);

    return {
      ...base,
      ...source,
      name: silo.name,
      status: ['Ligada', 'Desligada', 'Falha'].includes(source.status) ? source.status : base.status,
      monthlyHours: Number.isFinite(monthlyHours) ? Math.max(0, Math.min(744, Math.round(monthlyHours))) : base.monthlyHours,
      motorCount: AERATION_MOTOR_COUNT,
      temperature: Number.isFinite(temperature) ? temperature : base.temperature,
    };
  });
}

function normalizeAerationHistory(history, fallbackItems) {
  const normalized = Array.isArray(history)
    ? history.map(snapshot => {
      const date = snapshot?.timestamp ? new Date(snapshot.timestamp) : new Date();
      return {
        id: snapshot?.id || `aeration-${date.getTime()}`,
        timestamp: Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(),
        date: snapshot?.date || formatDateTime(Number.isNaN(date.getTime()) ? new Date() : date),
        items: normalizeAerationItems(snapshot?.items),
      };
    }).filter(snapshot => snapshot.items.length)
    : [];

  return normalized.length ? normalized.slice(0, 300) : [createAerationSnapshot(new Date(), fallbackItems)];
}

function normalizeSamplePoint(point, index) {
  return {
    point: point?.point || `Ponto ${index + 1}`,
    humidity: Number.isFinite(Number(point?.humidity)) ? Number(point.humidity) : 12.8,
    temperature: Number.isFinite(Number(point?.temperature)) ? Number(point.temperature) : 23,
    liveInsects: Number.isFinite(Number(point?.liveInsects)) ? Number(point.liveInsects) : 0,
    deadInsects: Number.isFinite(Number(point?.deadInsects)) ? Number(point.deadInsects) : 0,
    pulverized: point?.pulverized || 'NÃO',
    purge: point?.purge || 'NÃO',
    impurity: Number.isFinite(Number(point?.impurity)) ? Number(point.impurity) : 0.9,
    damaged: Number.isFinite(Number(point?.damaged)) ? Number(point.damaged) : 0.6,
  };
}

function normalizeSampleLaunch(launch, siloName, index = 0) {
  const date = launch?.timestamp ? new Date(launch.timestamp) : new Date(Date.now() - index * 24 * 60 * 60 * 1000);
  const seed = Date.now() + index;

  return {
    ...createSampleLaunch(siloName, date, seed),
    ...launch,
    silo: siloName,
    timestamp: Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(),
    date: launch?.date || formatDateTime(Number.isNaN(date.getTime()) ? new Date() : date),
    pointCount: Number.isFinite(Number(launch?.pointCount)) ? Number(launch.pointCount) : SAMPLE_COLLECTION_POINTS,
    status: ['Ligado', 'Desligado'].includes(launch?.status) ? launch.status : 'Ligado',
    responsible: launch?.responsible || 'Carlos Eduardo',
    role: launch?.role || 'Operador de Armazém',
    points: Array.isArray(launch?.points) && launch.points.length
      ? launch.points.slice(0, SAMPLE_TABLE_POINTS).map(normalizeSamplePoint)
      : generateSamplePoints(seed),
  };
}

function normalizeSampleStore(store) {
  const initial = buildInitialSampleLaunches();

  return siloConfigs.reduce((acc, silo) => {
    const launches = Array.isArray(store?.[silo.name]) && store[silo.name].length
      ? store[silo.name]
      : initial[silo.name];

    acc[silo.name] = launches.map((launch, index) => normalizeSampleLaunch(launch, silo.name, index));
    return acc;
  }, {});
}

function normalizeSupervisorActions(actions = []) {
  return Array.isArray(actions)
    ? actions.map((action, index) => {
      const unitKey = action?.unitKey && unitConfigs[action.unitKey] ? action.unitKey : null;
      return {
        id: action?.id || `AC-${String(index + 1).padStart(3, '0')}`,
        origin: action?.origin || 'Termometria',
        silo: action?.silo || 'Silo 01',
        attention: action?.attention || 'Atenção operacional',
        description: action?.description || action?.attention || 'Verificar ocorrência operacional',
        responsible: action?.responsible || action?.coordinator || 'Osmar Valderrama',
        coordinator: action?.coordinator || action?.responsible || 'Osmar Valderrama',
        unitKey,
        unitName: unitKey ? getUnitNameByKey(unitKey) : (action?.unitName || ''),
        dueDate: action?.dueDate || getDateInputValue(new Date()),
        status: action?.status || 'Pendente',
        createdAt: action?.createdAt || new Date().toISOString(),
        sourceAttentionId: action?.sourceAttentionId || null,
      };
    })
    : [];
}

function createInitialLocalDb() {
  const now = new Date();
  const aerationItems = buildInitialAerationData();

  return {
    version: 1,
    launchesBySilo: buildInitialLaunches(),
    aerationData: aerationItems,
    aerationHistory: [createAerationSnapshot(now, aerationItems)],
    lastAerationUpdate: formatDateTime(now),
    sampleLaunchesBySilo: buildInitialSampleLaunches(),
    supervisorActions: [],
    completedAiRecommendations: [],
  };
}

function getLocalStorage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch (error) {
    return null;
  }
}

function loadLocalDb() {
  const initial = createInitialLocalDb();
  const storage = getLocalStorage();
  if (!storage) return initial;

  try {
    const raw = storage.getItem(LOCAL_DB_KEY);
    if (!raw) return initial;

    const parsed = JSON.parse(raw);
    const aerationData = normalizeAerationItems(parsed.aerationData || initial.aerationData);

    return {
      version: 1,
      launchesBySilo: normalizeLaunchStore(parsed.launchesBySilo || initial.launchesBySilo),
      aerationData,
      aerationHistory: normalizeAerationHistory(parsed.aerationHistory, aerationData),
      lastAerationUpdate: parsed.lastAerationUpdate || initial.lastAerationUpdate,
      sampleLaunchesBySilo: normalizeSampleStore(parsed.sampleLaunchesBySilo || initial.sampleLaunchesBySilo),
      supervisorActions: normalizeSupervisorActions(parsed.supervisorActions),
      completedAiRecommendations: Array.isArray(parsed.completedAiRecommendations) ? parsed.completedAiRecommendations : [],
    };
  } catch (error) {
    return initial;
  }
}

function saveLocalDb() {
  const storage = getLocalStorage();
  if (!storage) return;

  storage.setItem(LOCAL_DB_KEY, JSON.stringify({
    version: 1,
    savedAt: new Date().toISOString(),
    launchesBySilo,
    aerationData,
    aerationHistory,
    lastAerationUpdate,
    sampleLaunchesBySilo,
    supervisorActions,
    completedAiRecommendations: [...completedAiRecommendations],
  }));
}

function getLatestAerationPeriod(history = []) {
  const latest = [...history].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
  return latest?.timestamp ? getMonthInputValue(new Date(latest.timestamp)) : getMonthInputValue(new Date());
}

function getLatestSamplePeriod(store = {}) {
  const latest = Object.values(store)
    .flat()
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
  return latest?.timestamp ? getMonthInputValue(new Date(latest.timestamp)) : getMonthInputValue(new Date());
}

function randomBetween(min, max, decimals = 0) {
  const value = min + Math.random() * (max - min);
  return Number(value.toFixed(decimals));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickAerationStatus() {
  const roll = Math.random();
  if (roll < 0.58) return 'Ligada';
  if (roll < 0.88) return 'Desligada';
  return 'Falha';
}

function generateAerationTemperature(status) {
  const roll = Math.random();
  if (status === 'Falha') return randomBetween(31.2, 36.8, 1);
  if (roll > 0.78) return randomBetween(27.1, 30.8, 1);
  return randomBetween(21.6, 26.8, 1);
}

function refreshAerationData() {
  if (currentPage === 'aeracao' && pageUnitFilters.aeracao && currentUnit !== pageUnitFilters.aeracao) {
    changeUnit(pageUnitFilters.aeracao);
  }

  const now = new Date();
  const sharedTemperature = generateAerationTemperature(pickAerationStatus());

  aerationData = normalizeAerationItems(aerationData).map(item => {
    const status = pickAerationStatus();
    const monthlyDelta = randomInt(-18, 18) || (Math.random() > 0.5 ? 1 : -1);

    return {
      ...item,
      status,
      monthlyHours: Math.max(0, Math.min(744, item.monthlyHours + monthlyDelta)),
      lastStart: status === 'Desligada'
        ? formatDateTime(new Date(now.getTime() - randomInt(35, 480) * 60 * 1000))
        : formatDateTime(new Date(now.getTime() - randomInt(0, 90) * 60 * 1000)),
      motorCount: AERATION_MOTOR_COUNT,
      temperature: sharedTemperature,
    };
  });

  lastAerationUpdate = formatDateTime(now);
  aerationHistory = [createAerationSnapshot(now, aerationData), ...aerationHistory].slice(0, 300);
  aerationFilters.period = getMonthInputValue(now);
  const periodInput = document.getElementById('aeration-period-filter');
  if (periodInput) periodInput.value = aerationFilters.period;

  saveLocalDb();
  updateScreenUnitControls();
  renderAeration();
  renderDashboard();
}

function aerationStatusClass(status) {
  if (status === 'Falha') return 'failure';
  if (status === 'Desligada') return 'off';
  return 'on';
}

function aerationTemperatureClass(value) {
  if (value > thresholds.attentionMax) return 'critical';
  if (value >= thresholds.normalMax) return 'attention';
  return 'normal';
}

function formatAerationTemperature(value) {
  return `${value.toFixed(1).replace('.', ',')}°C`;
}

function aerationStatusLabel(item) {
  if (item.status === 'Falha') return 'Falha';
  return item.status;
}

function getAerationSnapshotsForPeriod(period) {
  return [...aerationHistory]
    .filter(snapshot => !period || snapshot.timestamp?.startsWith(period))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function getFilteredAerationItems() {
  const latestBySilo = new Map();

  getAerationSnapshotsForPeriod(aerationFilters.period).forEach(snapshot => {
    normalizeAerationItems(snapshot.items).forEach(item => {
      if (!latestBySilo.has(item.name)) latestBySilo.set(item.name, item);
    });
  });

  return siloConfigs
    .map(silo => latestBySilo.get(silo.name))
    .filter(Boolean)
    .filter(item => aerationFilters.silo === 'all' || item.name === aerationFilters.silo);
}

function formatPercent(value) {
  return `${Number(value).toFixed(1).replace('.', ',')}%`;
}

function averageSampleValue(points, key) {
  if (!points?.length) return 0;
  return Number((points.reduce((sum, point) => sum + Number(point[key] || 0), 0) / points.length).toFixed(1));
}

function sampleMetricClass(key, value) {
  if (key === 'humidity') return value >= 13.5 ? 'attention' : 'normal';
  if (key === 'impurity') return value >= 1.2 ? 'attention' : 'normal';
  if (key === 'damaged') return value >= 1 ? 'attention' : 'normal';
  return 'normal';
}

function getSampleLaunches(siloName) {
  return sampleLaunchesBySilo[siloName] || [];
}

function getSampleLaunchesForPeriod(siloName, period) {
  return getSampleLaunches(siloName)
    .filter(launch => !period || launch.timestamp?.startsWith(period))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function getFilteredSampleCards() {
  return siloConfigs
    .map(silo => getSampleLaunchesForPeriod(silo.name, sampleFilters.period)[0])
    .filter(Boolean)
    .filter(launch => sampleFilters.silo === 'all' || launch.silo === sampleFilters.silo);
}

function getLatestSampleLaunch() {
  return Object.values(sampleLaunchesBySilo)
    .flat()
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
}

function refreshSampleData() {
  if (currentPage === 'samples' && pageUnitFilters.samples && currentUnit !== pageUnitFilters.samples) {
    changeUnit(pageUnitFilters.samples);
  }

  const now = new Date();

  siloConfigs.forEach((silo, index) => {
    const launchDate = new Date(now.getTime() - index * 7 * 60 * 1000);
    const launch = createSampleLaunch(silo.name, launchDate, Date.now() + index * 31);
    sampleLaunchesBySilo[silo.name] = [launch, ...getSampleLaunches(silo.name)].slice(0, 120);
  });

  sampleFilters.period = getMonthInputValue(now);
  const periodInput = document.getElementById('sample-period-filter');
  if (periodInput) periodInput.value = sampleFilters.period;

  saveLocalDb();
  updateScreenUnitControls();
  renderSamples();
  renderDashboard();
}

function openSampleHistory(siloName) {
  selectedSampleSilo = siloName;
  selectedSampleLaunchIndex = 0;
  renderSampleModal();
  document.getElementById('sample-modal-backdrop').hidden = false;
}

function closeSampleModal() {
  document.getElementById('sample-modal-backdrop').hidden = true;
}

function renderSampleLaunchList() {
  const list = document.getElementById('sample-launch-list');
  const launches = getSampleLaunchesForPeriod(selectedSampleSilo, sampleFilters.period);
  list.innerHTML = '';

  launches.forEach((launch, index) => {
    const item = document.createElement('button');
    item.className = `sample-launch-item ${index === selectedSampleLaunchIndex ? 'active' : ''}`;
    item.innerHTML = `<strong>${formatDateOnlyBR(launch.date)}</strong><span>${launch.pointCount} pontos coletados</span>`;
    item.addEventListener('click', () => {
      selectedSampleLaunchIndex = index;
      renderSampleModal();
    });
    list.appendChild(item);
  });
}

function renderSamplePointsTable(launch) {
  const table = document.getElementById('sample-points-table');
  const rows = launch.points.map(point => {
    const tempStatus = statusClassByValue(point.temperature);
    const tempLabel = tempStatus === 'critical'
      ? 'Crítico'
      : tempStatus === 'attention'
        ? 'Atenção'
        : 'Padrão';

    return `
      <tr>
        <th>${point.point}</th>
        <td>${point.humidity.toFixed(1).replace('.', ',')}</td>
        <td>
          <span class="sample-temp-pill ${tempStatus}">
            ${point.temperature}°C - ${tempLabel}
          </span>
        </td>
        <td>${point.liveInsects}</td>
        <td>${point.deadInsects}</td>
        <td>${point.pulverized}</td>
        <td>${point.purge}</td>
        <td>${point.impurity.toFixed(1).replace('.', ',')}</td>
        <td>${point.damaged.toFixed(1).replace('.', ',')}</td>
      </tr>
    `;
  }).join('');

  table.innerHTML = `
    <thead>
      <tr>
        <th>Ponto</th>
        <th>Umidade (%)</th>
        <th>Temp. (°C)</th>
        <th>Ins. vivos</th>
        <th>Ins. mortos</th>
        <th>Pulverizado</th>
        <th>Expurgo</th>
        <th>Impureza (%)</th>
        <th>Avariado (%)</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  `;
}

function renderSampleModal() {
  const launches = getSampleLaunchesForPeriod(selectedSampleSilo, sampleFilters.period);
  const launch = launches[selectedSampleLaunchIndex] || launches[0] || getSampleLaunches(selectedSampleSilo)[0];
  if (!launch) return;

  selectedSampleLaunchIndex = Math.max(0, launches.indexOf(launch));
  document.getElementById('sample-modal-title').textContent = `Histórico de amostras - ${selectedSampleSilo}`;
  document.getElementById('sample-selected-launch-chip').textContent = `Lançamento: ${formatDateOnlyBR(launch.date)}`;

  const humidity = averageSampleValue(launch.points, 'humidity');
  const impurity = averageSampleValue(launch.points, 'impurity');
  const damaged = averageSampleValue(launch.points, 'damaged');

  document.getElementById('sample-modal-humidity').textContent = formatPercent(humidity);
  document.getElementById('sample-modal-impurity').textContent = formatPercent(impurity);
  document.getElementById('sample-modal-damaged').textContent = formatPercent(damaged);
  document.getElementById('sample-modal-responsible').textContent = launch.responsible;
  document.getElementById('sample-modal-role').textContent = launch.role;

  renderSampleLaunchList();
  renderSamplePointsTable(launch);
}

function buildTermometriaAttentions() {
  return siloConfigs.map(silo => {
    const launch = getLatestLaunch(silo.name);
    const max = extrema(launch.matrix, 'max');
    const status = statusFromMatrix(launch.matrix, launch.offlineSensors);
    const offCount = offlineSensorCount(launch);
    if (status === 'Padrão') return null;

    return {
      id: `termometria-${silo.name}`,
      origin: 'Termometria',
      silo: silo.name,
      severity: status,
      attention: offCount ? offlineSummary(launch) : `Temperatura máxima em ${formatExtremaTemperature(max)}`,
      dateTime: launch.date,
    };
  }).filter(Boolean);
}

function buildAerationAttentions() {
  return getFilteredAerationItems().map(item => {
    if (item.status !== 'Falha') return null;

    return {
      id: `aeration-${item.name}`,
      origin: 'Aeração',
      silo: item.name,
      severity: 'Crítico',
      attention: 'Falha no sistema de aeração',
      dateTime: item.lastStart,
    };
  }).filter(Boolean);
}

function getSampleMetricAttention(launch) {
  const checks = [
    { key: 'humidity', label: 'Umidade', value: averageSampleValue(launch.points, 'humidity'), attention: 13.5, critical: 14.2 },
    { key: 'impurity', label: 'Impureza', value: averageSampleValue(launch.points, 'impurity'), attention: 1.2, critical: 1.6 },
    { key: 'damaged', label: 'Avariado', value: averageSampleValue(launch.points, 'damaged'), attention: 1, critical: 1.3 },
  ];

  const critical = checks.find(item => item.value >= item.critical);
  if (critical) return { severity: 'Crítico', attention: `${critical.label} acima do limite: ${formatPercent(critical.value)}` };

  const attention = checks.find(item => item.value >= item.attention);
  if (attention) return { severity: 'Atenção', attention: `${attention.label} em atenção: ${formatPercent(attention.value)}` };

  return null;
}

function buildSampleAttentions() {
  return siloConfigs.map(silo => {
    const launch = getSampleLaunches(silo.name)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    if (!launch) return null;

    const metric = getSampleMetricAttention(launch);
    if (!metric) return null;

    return {
      id: `sample-${silo.name}`,
      origin: 'Mapa de Amostra',
      silo: silo.name,
      severity: metric.severity,
      attention: metric.attention,
      dateTime: launch.date,
    };
  }).filter(Boolean);
}



function getDefaultDashboardActionUnit() {
  const selectedUnits = getSelectedUnitKeys();
  if (selectedUnits.length === 1) return selectedUnits[0];
  if (currentUnit && unitConfigs[currentUnit]) return currentUnit;
  return selectedUnits[0] || 'lobato';
}

function populateActionSiloOptions(unitKey) {
  const select = document.getElementById('action-silo');
  if (!select) return;

  const silos = unitConfigs[unitKey]?.silos || unitConfigs.lobato.silos;
  select.innerHTML = silos.map(silo => `<option value="${silo.name}">${silo.name}</option>`).join('');
}

function getSelectedUnitKeys() {
  const selected = Array.isArray(dashboardFilters.units) ? dashboardFilters.units : ['all'];
  if (selected.includes('all') || !selected.length) return Object.keys(unitConfigs);
  return [...new Set(selected)].filter(unitKey => unitConfigs[unitKey]);
}

function isDateInsideDashboardPeriod(dateTimeLabel) {
  const dateOnly = formatDateOnlyFromLaunchLabel(dateTimeLabel);
  if (!dateOnly || dateOnly === '--') return true;

  const [day, month, year] = dateOnly.split('/').map(Number);
  if (!day || !month || !year) return true;

  const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (dashboardFilters.startDate && value < dashboardFilters.startDate) return false;
  if (dashboardFilters.endDate && value > dashboardFilters.endDate) return false;
  return true;
}

function getUnitNameByKey(unitKey) {
  return unitConfigs[unitKey]?.name || unitKey;
}

function withTemporarySiloContext(unitKey, callback) {
  const previousUnit = currentUnit;
  const previousSilos = [...siloConfigs];

  currentUnit = unitKey;
  siloConfigs.length = 0;
  siloConfigs.push(...unitConfigs[unitKey].silos);

  try {
    return callback();
  } finally {
    currentUnit = previousUnit;
    siloConfigs.length = 0;
    siloConfigs.push(...previousSilos);
  }
}

function buildOperationalAttentionsForUnits() {
  const selectedUnits = getSelectedUnitKeys();

  return selectedUnits.flatMap(unitKey => {
    const unit = unitConfigs[unitKey];
    if (!unit) return [];

    return unit.silos.flatMap((silo, index) => {
      const severity = silo.status === 'Crítico' ? 'Crítico' : silo.status === 'Atenção' ? 'Atenção' : null;
      const rows = [];

      if (severity) {
        rows.push({
          id: `termometria-${unitKey}-${silo.name}`,
          origin: 'Termometria',
          unitKey,
          unitName: unit.name,
          silo: silo.name,
          severity,
          attention: severity === 'Crítico'
            ? 'Temperatura acima de 30°C na base'
            : 'Tendência de aquecimento no cabo principal',
          dateTime: baseLaunches[index % baseLaunches.length]?.date || formatDateTime(new Date()),
        });
      }

      // Aeração desligada com temperatura alta e motor com muitas horas
      // foram tratados como condição operacional normal, não como atenção.
      // Por isso, a Dashboard não gera alerta automático para esses casos.

      if (index % 3 === 0) {
        rows.push({
          id: `amostra-${unitKey}-${silo.name}`,
          origin: 'Mapa de Amostra',
          unitKey,
          unitName: unit.name,
          silo: silo.name,
          severity: 'Atenção',
          attention: index % 2 === 0 ? 'Impureza acima do limite' : 'Avariado acima de 1,0%',
          dateTime: baseLaunches[(index + 2) % baseLaunches.length]?.date || formatDateTime(new Date()),
        });
      }

      return rows;
    });
  })
    .filter(attention => isDateInsideDashboardPeriod(attention.dateTime))
    .sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'Crítico' ? -1 : 1;
      if (a.unitName !== b.unitName) return a.unitName.localeCompare(b.unitName);
      return a.origin.localeCompare(b.origin);
    });
}

function getFilteredSupervisorActions() {
  const selectedUnits = getSelectedUnitKeys();
  const isAllUnits = dashboardFilters.units.includes('all');

  return supervisorActions.filter(action => {
    if (!isAllUnits) {
      if (!action.unitKey || !selectedUnits.includes(action.unitKey)) return false;
    }

    const createdAt = action.createdAt ? action.createdAt.slice(0, 10) : '';
    if (dashboardFilters.startDate && createdAt && createdAt < dashboardFilters.startDate) return false;
    if (dashboardFilters.endDate && createdAt && createdAt > dashboardFilters.endDate) return false;

    return true;
  });
}

function getUnitActionSummary() {
  const selectedUnits = getSelectedUnitKeys();
  const actions = getFilteredSupervisorActions();

  return selectedUnits.map(unitKey => {
    const unitName = getUnitNameByKey(unitKey);
    const unitActions = actions.filter(action => action.unitKey === unitKey);

    const total = unitActions.length;
    const open = unitActions.filter(action => getActionRuntimeStatus(action) !== 'Entregue').length;
    const finished = unitActions.filter(action => getActionRuntimeStatus(action) === 'Entregue').length;
    const late = unitActions.filter(action => getActionRuntimeStatus(action) === 'Atrasada').length;

    return { unitKey, unitName, total, open, finished, late };
  });
}

function formatDueDateBR(value) {
  if (!value) return '--';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function weatherIconByTrend(trend) {
  if (trend === 'Chovendo') return '🌧️';
  if (trend === 'Ensolarado') return '☀️';
  return '☁️';
}

function getActionRuntimeStatus(action) {
  if (action.status === 'Entregue') return 'Entregue';
  if (action.dueDate && action.dueDate < getDateInputValue(new Date())) return 'Atrasada';
  return 'Pendente';
}

function actionBadgeClass(status) {
  if (status === 'Atrasada') return 'badge-critical';
  if (status === 'Entregue') return 'badge-normal';
  return 'badge-attention';
}

function getDashboardWeather(unitKey = currentUnit) {
  const now = new Date();
  const unitOffset = Object.keys(unitConfigs).indexOf(unitKey);
  const safeOffset = unitOffset >= 0 ? unitOffset : 0;
  const seed = now.getFullYear() + now.getMonth() * 31 + now.getDate() + safeOffset * 97;
  const trendIndex = Math.floor(randomFromSeed(4, 6, seed) * WEATHER_TRENDS.length);
  const temp = Math.round(21 + randomFromSeed(7, 8, seed) * 9);
  return {
    unitKey,
    unitName: getUnitNameByKey(unitKey),
    temp,
    trend: WEATHER_TRENDS[trendIndex],
  };
}

function getSelectedUnitWeatherList() {
  return getSelectedUnitKeys().map(unitKey => getDashboardWeather(unitKey));
}

function renderDashboardWeatherCards() {
  const container = document.getElementById('dashboard-weather-list');
  if (!container) return;

  const weatherItems = getSelectedUnitWeatherList();

  container.innerHTML = weatherItems.map(weather => `
    <article class="dashboard-weather">
      <div class="dashboard-weather-main">
        <span class="dashboard-weather-icon" aria-hidden="true">${weatherIconByTrend(weather.trend)}</span>
        <div>
          <small>Previsão do tempo • ${weather.unitName}</small>
          <strong>${weather.temp}°C</strong>
        </div>
      </div>

      <div class="dashboard-weather-status">
        <small>Condição local</small>
        <strong>${weather.trend}</strong>
      </div>
    </article>
  `).join('');
}





function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getAiRecommendationKey(item) {
  return `${item.unitName || ''}|${item.silo || ''}|${item.title || ''}|${item.origin || ''}`;
}

function getIntegratedSiloSnapshot(unitKey, silo, index = 0) {
  const unit = unitConfigs[unitKey];
  const seed = (index + 1) * 137 + unitKey.length * 19;
  const latest = getLatestLaunch(silo.name);
  const matrix = latest?.matrix || generateMatrix(silo.status || 'Padrão', seed);
  const max = extrema(matrix, 'max');
  const maxTemp = Number(max.value);
  const tempStatus = statusFromTemperature(maxTemp);

  const unitWeather = getDashboardWeather(unitKey);
  const ambientTemp = unitWeather.temp;
  const aerationStatus = (tempStatus === 'Crítico' && index % 2 === 0)
    ? 'Desligada'
    : (randomFromSeed(index, 29, seed) > 0.42 ? 'Ligada' : 'Desligada');

  const sampleLaunch = getSampleLaunches(silo.name)[0];
  const sampleHumidity = sampleLaunch ? averageSampleValue(sampleLaunch.points, 'humidity') : Number((12.4 + randomFromSeed(index, 17, seed) * 1.5).toFixed(1));
  const sampleImpurity = sampleLaunch ? averageSampleValue(sampleLaunch.points, 'impurity') : Number((0.7 + randomFromSeed(index, 23, seed) * 1.1).toFixed(1));
  const sampleDamaged = sampleLaunch ? averageSampleValue(sampleLaunch.points, 'damaged') : Number((0.4 + randomFromSeed(index, 31, seed) * 1.0).toFixed(1));

  return {
    unitKey,
    unitName: unit?.name || unitKey,
    silo: silo.name,
    maxTemp,
    maxLocation: max.location,
    tempStatus,
    ambientTemp,
    aerationStatus,
    sampleHumidity,
    sampleImpurity,
    sampleDamaged,
  };
}

function buildIntegratedSiloSnapshots() {
  return getSelectedUnitKeys().flatMap(unitKey => {
    const unit = unitConfigs[unitKey];
    if (!unit) return [];
    return unit.silos.map((silo, index) => getIntegratedSiloSnapshot(unitKey, silo, index));
  });
}

function buildAiRecommendations(attentions) {
  const selectedUnits = getSelectedUnitKeys();
  const weatherByUnit = Object.fromEntries(getSelectedUnitWeatherList().map(item => [item.unitKey, item]));
  const recommendations = [];
  const seen = new Set();

  function pushRecommendation({ priority, origin, unitName, silo, title, reason, action, data }) {
    const key = `${unitName}-${silo}-${title}`;
    if (seen.has(key)) return;
    seen.add(key);

    recommendations.push({
      priority,
      origin,
      unitName,
      silo,
      title,
      reason,
      action,
      data,
    });
  }

  buildIntegratedSiloSnapshots().forEach(snapshot => {
    const tempText = `${snapshot.maxTemp.toFixed(1)}°C`;
    const ambientText = `${snapshot.ambientTemp.toFixed(1)}°C`;
    const aerationOff = snapshot.aerationStatus === 'Desligada';

    if (snapshot.maxTemp > thresholds.attentionMax && aerationOff && snapshot.ambientTemp < snapshot.maxTemp) {
      pushRecommendation({
        priority: 'Crítico',
        origin: 'IA integrada',
        unitName: snapshot.unitName,
        silo: snapshot.silo,
        title: 'Temperatura crítica com aeração desligada',
        data: `Termometria ${tempText} em ${snapshot.maxLocation} • Ambiente ${ambientText} • Aeração ${snapshot.aerationStatus}`,
        reason: `O silo apresenta leitura crítica de ${tempText}, enquanto a temperatura ambiente está menor (${ambientText}) e a aeração está desligada. Essa combinação indica oportunidade imediata de retirada de calor da massa de grãos.`,
        action: `Ligar de imediato a aeração do ${snapshot.silo}, acompanhar a leitura do sensor ${snapshot.maxLocation} até estabilizar abaixo de 27°C e registrar nova leitura após o ciclo de aeração.`,
      });
      return;
    }

    if (snapshot.maxTemp > thresholds.attentionMax && !aerationOff) {
      pushRecommendation({
        priority: 'Crítico',
        origin: 'IA integrada',
        unitName: snapshot.unitName,
        silo: snapshot.silo,
        title: 'Temperatura crítica mesmo com aeração ligada',
        data: `Termometria ${tempText} em ${snapshot.maxLocation} • Ambiente ${ambientText} • Aeração ${snapshot.aerationStatus}`,
        reason: `A temperatura segue crítica mesmo com aeração em operação, o que pode indicar ponto localizado, distribuição irregular de ar ou necessidade de inspeção física.`,
        action: `Manter monitoramento contínuo, verificar funcionamento dos motores, conferir obstrução/compactação/impurezas e avaliar remanejamento ou expedição prioritária do lote.`,
      });
      return;
    }

    if (snapshot.maxTemp >= thresholds.normalMax && aerationOff && snapshot.ambientTemp <= 26.5) {
      pushRecommendation({
        priority: 'Atenção',
        origin: 'IA integrada',
        unitName: snapshot.unitName,
        silo: snapshot.silo,
        title: 'Aquecimento com janela favorável de aeração',
        data: `Termometria ${tempText} em ${snapshot.maxLocation} • Ambiente ${ambientText} • Aeração ${snapshot.aerationStatus}`,
        reason: `A leitura está em atenção e a temperatura ambiente está favorável para reduzir gradualmente o calor da massa.`,
        action: `Programar aeração no período mais frio do dia e acompanhar se a leitura retorna para abaixo de 27°C nos próximos lançamentos.`,
      });
    }

    if (snapshot.sampleImpurity >= 1.2 && snapshot.maxTemp >= thresholds.normalMax) {
      pushRecommendation({
        priority: 'Atenção',
        origin: 'IA integrada',
        unitName: snapshot.unitName,
        silo: snapshot.silo,
        title: 'Impureza elevada associada a aquecimento',
        data: `Impureza ${snapshot.sampleImpurity.toFixed(1)}% • Termometria ${tempText} • Aeração ${snapshot.aerationStatus}`,
        reason: `Impurezas reduzem a passagem de ar e podem formar bolsões com maior aquecimento, principalmente quando já existe elevação de temperatura.`,
        action: `Reavaliar pontos de amostragem, verificar limpeza/beneficiamento do lote e priorizar acompanhamento térmico após a aeração.`,
      });
    }

    if (snapshot.sampleDamaged >= 1.0 && snapshot.maxTemp >= thresholds.normalMax) {
      pushRecommendation({
        priority: 'Atenção',
        origin: 'IA integrada',
        unitName: snapshot.unitName,
        silo: snapshot.silo,
        title: 'Avariado elevado com risco de deterioração',
        data: `Avariado ${snapshot.sampleDamaged.toFixed(1)}% • Termometria ${tempText} • Umidade ${snapshot.sampleHumidity.toFixed(1)}%`,
        reason: `Grãos avariados apresentam maior risco de deterioração e podem intensificar aquecimento em regiões específicas do silo.`,
        action: `Solicitar nova coleta, comparar com histórico de qualidade e avaliar segregação, expedição ou uso prioritário do lote.`,
      });
    }
  });

  selectedUnits.forEach(unitKey => {
    const weather = weatherByUnit[unitKey];
    if (weather?.trend === 'Chovendo') {
      pushRecommendation({
        priority: 'Atenção',
        origin: 'Clima',
        unitName: getUnitNameByKey(unitKey),
        silo: 'Unidade',
        title: 'Chuva exige cautela na aeração',
        data: `Condição local: ${weather.trend} • Temperatura ambiente ${weather.temp}°C`,
        reason: 'Em condição de chuva, a umidade relativa tende a aumentar, podendo inserir ar úmido na massa de grãos.',
        action: 'Evitar aeração com ar úmido; priorizar janelas com menor umidade relativa e acompanhar temperatura ambiente antes de ligar motores.',
      });
    }
  });

  if (!recommendations.length) {
    return [{
      priority: 'Padrão',
      origin: 'IA integrada',
      unitName: selectedUnits.map(getUnitNameByKey).join(', '),
      silo: 'Geral',
      title: 'Condição operacional estável',
      data: 'Termometria, aeração e mapa de amostra sem combinação crítica no período.',
      reason: 'Não foram identificadas combinações de risco entre temperatura da massa, temperatura ambiente, condição da aeração e qualidade da amostra.',
      action: 'Manter rotina de monitoramento, lançamentos periódicos e conferência preventiva dos sensores e amostras.',
    }];
  }

  const priorityOrder = { 'Crítico': 0, 'Atenção': 1, 'Padrão': 2 };
  return recommendations
    .filter(item => !completedAiRecommendations.has(getAiRecommendationKey(item)))
    .sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9))
    .slice(0, 4);
}

function renderAiRecommendations(attentions) {
  const container = document.getElementById('dashboard-ai-insights');
  if (!container) return;

  const recommendations = buildAiRecommendations(attentions);

  if (!recommendations.length) {
    container.innerHTML = `
      <article class="ai-recommendation normal ai-recommendation-empty">
        <div class="ai-rec-top">
          <span class="badge badge-normal">Realizado</span>
          <small>IA operacional</small>
        </div>
        <h3>Todas as recomendações foram realizadas</h3>
        <p><strong>Status:</strong> Não há recomendações pendentes para os filtros atuais.</p>
        <p><strong>Próximo passo:</strong> Continue acompanhando os lançamentos e o comportamento dos silos.</p>
      </article>
    `;
    return;
  }

  container.innerHTML = recommendations.map(item => {
    const key = getAiRecommendationKey(item);
    return `
      <article class="ai-recommendation ${statusClassByName(item.priority)}" data-ai-key="${escapeHtml(key)}">
        <div class="ai-rec-top">
          <span class="badge ${badgeClass(item.priority)}">${item.priority}</span>
          <small>${item.unitName} • ${item.silo}</small>
        </div>
        <h3>${item.title}</h3>
        ${item.data ? `<div class="ai-data-line">${item.data}</div>` : ''}
        <p><strong>Diagnóstico:</strong> ${item.reason}</p>
        <p><strong>Recomendação:</strong> ${item.action}</p>
        <div class="ai-rec-footer">
          <em>${item.origin}</em>
          <button class="ai-done-btn" type="button" data-ai-done="${escapeHtml(key)}">Realizada</button>
        </div>
      </article>
    `;
  }).join('');

  container.querySelectorAll('[data-ai-done]').forEach(button => {
    button.addEventListener('click', () => {
      completedAiRecommendations.add(button.dataset.aiDone);
      saveLocalDb();
      renderDashboard();
    });
  });
}

function renderDashboardAttentions(attentions) {
  const table = document.getElementById('dashboard-attentions-table');
  if (!table) return;

  if (!attentions.length) {
    table.innerHTML = '<tbody><tr><td class="empty-table" colspan="7">Nenhum ponto de atenção ou crítico no momento.</td></tr></tbody>';
    return;
  }

  const originClass = {
    'Termometria': 'origin-termometria',
    'Aeração': 'origin-aeracao',
    'Mapa de Amostra': 'origin-amostra',
  };

  const originIcon = {
    'Termometria': '♨',
    'Aeração': '✣',
    'Mapa de Amostra': '◎',
  };

  const rows = attentions.map((item, index) => `
    <tr class="${originClass[item.origin] || ''}">
      <td><strong>${item.unitName || getUnitNameByKey(currentUnit)}</strong></td>
      <td><span class="source-pill ${originClass[item.origin] || ''}">${originIcon[item.origin] || '•'} ${item.origin}</span></td>
      <td><strong>${item.silo}</strong></td>
      <td>${item.attention}</td>
      <td><span class="badge ${badgeClass(item.severity)}">${item.severity}</span></td>
      <td><span class="open-status"><i></i>Aberta</span></td>
      <td><button class="action-link" type="button" data-attention-index="${index}">Lançar ação</button></td>
    </tr>
  `).join('');

  table.innerHTML = `
    <thead>
      <tr>
        <th>Unidade</th>
        <th>Origem</th>
        <th>Silo</th>
        <th>Atenção</th>
        <th>Prioridade</th>
        <th>Status</th>
        <th>Ação</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  `;

  table.querySelectorAll('[data-attention-index]').forEach(button => {
    button.addEventListener('click', () => openActionModal(attentions[Number(button.dataset.attentionIndex)]));
  });
}

function renderDashboardActions() {
  const table = document.getElementById('dashboard-actions-table');
  if (!table) return;

  const actions = getFilteredSupervisorActions();

  if (!actions.length) {
    table.innerHTML = '<tbody><tr><td class="empty-table" colspan="9">Nenhuma ação lançada para supervisão nesse filtro.</td></tr></tbody>';
    return;
  }

  const rows = actions.slice(0, 8).map(action => {
    const status = getActionRuntimeStatus(action);
    return `
      <tr>
        <td><strong>${action.id}</strong></td>
        <td>${action.unitName || getUnitNameByKey(action.unitKey || currentUnit)}</td>
        <td>${action.origin}</td>
        <td>${action.silo}</td>
        <td>${action.description}</td>
        <td>${action.coordinator || action.responsible || 'Osmar Valderrama'}</td>
        <td>${action.responsible || action.coordinator || 'Supervisor'}</td>
        <td>${formatDueDateBR(action.dueDate)}</td>
        <td><span class="badge ${actionBadgeClass(status)}">${status}</span></td>
      </tr>
    `;
  }).join('');

  table.innerHTML = `
    <thead>
      <tr>
        <th>ID</th>
        <th>Unidade</th>
        <th>Origem</th>
        <th>Silo</th>
        <th>Descrição da ação</th>
        <th>Coordenador</th>
        <th>Responsável</th>
        <th>Data limite</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  `;
}

function renderDashboardUnitsTable() {
  const table = document.getElementById('dashboard-units-table');
  if (!table) return;

  const summary = getUnitActionSummary();

  if (!summary.length) {
    table.innerHTML = '<tbody><tr><td class="empty-table" colspan="5">Nenhuma unidade selecionada.</td></tr></tbody>';
    return;
  }

  table.innerHTML = `
    <thead>
      <tr>
        <th>Unidade</th>
        <th>Total de ações</th>
        <th>Ações em aberto</th>
        <th>Ações finalizadas</th>
        <th>Ações atrasadas</th>
      </tr>
    </thead>
    <tbody>
      ${summary.map(item => `
        <tr>
          <td><strong>${item.unitName}</strong></td>
          <td>${item.total}</td>
          <td><span class="badge badge-attention">${item.open}</span></td>
          <td><span class="badge badge-normal">${item.finished}</span></td>
          <td><span class="badge badge-critical">${item.late}</span></td>
        </tr>
      `).join('')}
    </tbody>
  `;
}

function renderDashboardUnitChart() {
  const chart = document.getElementById('dashboard-unit-chart');
  if (!chart) return;

  const summary = getUnitActionSummary();
  const maxValue = Math.max(1, ...summary.flatMap(item => [item.open, item.finished, item.late]));

  chart.innerHTML = summary.map(item => `
    <article class="unit-chart-card">
      <header>
        <strong>${item.unitName}</strong>
        <small>${item.total} ações</small>
      </header>

      <div class="unit-chart-bars">
        <div class="unit-chart-row">
          <span>Aberto</span>
          <div class="unit-chart-track"><i class="attention" style="width:${Math.max(6, (item.open / maxValue) * 100)}%"></i></div>
          <strong>${item.open}</strong>
        </div>
        <div class="unit-chart-row">
          <span>Finalizado</span>
          <div class="unit-chart-track"><i class="normal" style="width:${Math.max(6, (item.finished / maxValue) * 100)}%"></i></div>
          <strong>${item.finished}</strong>
        </div>
        <div class="unit-chart-row">
          <span>Atrasado</span>
          <div class="unit-chart-track"><i class="critical" style="width:${Math.max(6, (item.late / maxValue) * 100)}%"></i></div>
          <strong>${item.late}</strong>
        </div>
      </div>
    </article>
  `).join('');
}

function renderDashboard() {
  const attentions = buildOperationalAttentionsForUnits();
  const actions = getFilteredSupervisorActions();
  const pending = actions.filter(action => getActionRuntimeStatus(action) === 'Pendente').length;
  const late = actions.filter(action => getActionRuntimeStatus(action) === 'Atrasada').length;
  const selectedSiloTotal = getSelectedUnitKeys().reduce((sum, unitKey) => sum + unitConfigs[unitKey].silos.length, 0);

  document.getElementById('dashboard-silos-total').textContent = selectedSiloTotal;
  document.getElementById('dashboard-attentions-total').textContent = attentions.length;
  document.getElementById('dashboard-actions-pending').textContent = pending;
  document.getElementById('dashboard-actions-late').textContent = late;

  renderDashboardWeatherCards();
  renderDashboardAttentions(attentions);
  renderAiRecommendations(attentions);
  renderDashboardActions();
  renderDashboardUnitsTable();
  renderDashboardUnitChart();
}

function changeUnit(unitKey) {
  currentUnit = unitKey;
  const newSilos = unitConfigs[unitKey].silos;

  newSilos.forEach((silo, siloIndex) => {
    if (!launchesBySilo[silo.name]) {
      launchesBySilo[silo.name] = baseLaunches.map((launch, launchIndex) => {
        const status = launchIndex === 0 ? silo.status : launch.status;

        return {
          ...launch,
          silo: silo.name,
          status,
          offlineSensors: [],
          matrix: generateMatrix(status, (siloIndex + 1) * 100 + launchIndex + 1),
        };
      });
    }

    if (!sampleLaunchesBySilo[silo.name]) {
      sampleLaunchesBySilo[silo.name] = Array.from({ length: 4 }, (_, launchIndex) => {
        const minutesAgo = launchIndex * 24 * 60 + siloIndex * 57 + 30;
        const date = new Date(Date.now() - minutesAgo * 60 * 1000);
        return createSampleLaunch(silo.name, date, (siloIndex + 1) * 900 + launchIndex * 17);
      });
    }
  });

  siloConfigs.length = 0;
  siloConfigs.push(...newSilos);

  aerationData = normalizeAerationItems(aerationData);
  aerationHistory = normalizeAerationHistory(aerationHistory, aerationData);
  aerationFilters.silo = 'all';
  sampleFilters.silo = 'all';

  selectedHistorySilo = siloConfigs[0].name;
  selectedHistoryChartSilo = siloConfigs[0].name;
  selectedHistoryChartCable = 'all';
  selectedHistoryChartSensor = 'all';
  selectedHistoryChartStartDate = '';
  selectedHistoryChartEndDate = '';
  selectedSampleSilo = siloConfigs[0].name;
  currentHistoryMatrix = getLatestLaunch(selectedHistorySilo)?.matrix || generateMatrix('Padrão');

  saveLocalDb();
  updateScreenUnitControls();
  renderTermometria();
  renderAeration();
  renderSamples();
  renderHistory();
  renderDashboard();
  renderNotifications();
}

function openActionModal(attention = null) {
  selectedAttentionForAction = attention;
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const unitKey = attention?.unitKey || getDefaultDashboardActionUnit();
  const unitName = getUnitNameByKey(unitKey);
  const origin = attention?.origin || 'Termometria';
  const silo = attention?.silo || unitConfigs[unitKey]?.silos?.[0]?.name || 'Silo 01';
  const detail = attention?.attention || '';

  document.getElementById('action-unit').value = unitKey;
  populateActionSiloOptions(unitKey);
  document.getElementById('action-origin').value = origin;
  document.getElementById('action-silo').value = silo;
  document.getElementById('action-coordinator').value = ACTION_COORDINATORS[0];
  document.getElementById('action-attention').value = detail;
  document.getElementById('action-due-date').value = getDateInputValue(tomorrow);
  document.getElementById('action-description').value = detail ? `Verificar e corrigir: ${detail}` : '';
  document.getElementById('action-context-origin').textContent = `${unitName} - ${origin} - ${silo}`;
  document.getElementById('action-context-detail').textContent = detail || 'Ação manual sem atenção selecionada.';
  document.getElementById('action-modal-backdrop').hidden = false;
}

function closeActionModal() {
  document.getElementById('action-modal-backdrop').hidden = true;
}

function createSupervisorAction() {
  const nextId = `AC-${String(supervisorActions.length + 1).padStart(3, '0')}`;
  const attention = document.getElementById('action-attention').value.trim() || 'Ação operacional';
  const description = document.getElementById('action-description').value.trim() || attention;
  const unitKey = document.getElementById('action-unit').value;
  const coordinator = document.getElementById('action-coordinator').value;

  supervisorActions = [{
    id: nextId,
    origin: document.getElementById('action-origin').value,
    silo: document.getElementById('action-silo').value,
    attention,
    description,
    responsible: coordinator,
    coordinator,
    unitKey,
    unitName: getUnitNameByKey(unitKey),
    dueDate: document.getElementById('action-due-date').value || getDateInputValue(new Date()),
    status: 'Pendente',
    createdAt: new Date().toISOString(),
    sourceAttentionId: selectedAttentionForAction?.id || null,
  }, ...supervisorActions].slice(0, 200);

  saveLocalDb();
  closeActionModal();
  renderDashboard();
}

function getSiloLaunches(siloName = selectedHistorySilo) {
  return launchesBySilo[siloName] || [];
}

function getLatestLaunch(siloName) {
  return getSiloLaunches(siloName)[0];
}

function setCurrentHistoryLaunch(index = 0) {
  const siloLaunches = getSiloLaunches(selectedHistorySilo);
  selectedLaunchIndex = Math.max(0, Math.min(index, siloLaunches.length - 1));
  const selectedLaunch = siloLaunches[selectedLaunchIndex];

  if (selectedLaunch) currentHistoryMatrix = selectedLaunch.matrix;
  return selectedLaunch;
}

function clampTemperature(value) {
  return Number(Math.min(34.5, Math.max(22, value)).toFixed(1));
}

function latestUsableValue(matrix, row, col, fallbackMatrix) {
  const directValue = matrix?.[row]?.[col];
  if (Number.isFinite(directValue)) return directValue;

  for (let previousRow = row - 1; previousRow >= 0; previousRow -= 1) {
    const previousValue = matrix?.[previousRow]?.[col];
    if (Number.isFinite(previousValue)) return previousValue;
  }

  for (let nextRow = row + 1; nextRow < SENSOR_COUNT; nextRow += 1) {
    const nextValue = matrix?.[nextRow]?.[col];
    if (Number.isFinite(nextValue)) return nextValue;
  }

  return fallbackMatrix[row][col];
}

function generateAutomaticOfflineSensors(seed = Date.now()) {
  const fullWireRoll = randomFromSeed(2, 7, seed);

  if (fullWireRoll > 0.86) {
    const col = Math.floor(randomFromSeed(3, 11, seed) * WIRE_COUNT);
    return Array.from({ length: SENSOR_COUNT }, (_, row) => ({ row, col }));
  }

  const count = 1 + Math.floor(randomFromSeed(5, 13, seed) * 3);
  const sensors = [];
  let cursor = 0;

  while (sensors.length < count && cursor < 60) {
    const row = Math.floor(randomFromSeed(cursor + 1, cursor + 9, seed) * SENSOR_COUNT);
    const col = Math.floor(randomFromSeed(cursor + 4, cursor + 15, seed) * WIRE_COUNT);
    const key = `${row}:${col}`;

    if (!sensors.some(sensor => `${sensor.row}:${sensor.col}` === key)) {
      sensors.push({ row, col });
    }

    cursor += 1;
  }

  return normalizeOfflineSensors(sensors);
}

function generatePersistentOfflineSensors(previousOfflineSensors = [], seed = Date.now()) {
  const previous = normalizeOfflineSensors(previousOfflineSensors);

  if (!previous.length) {
    return randomFromSeed(1, 19, seed) > 0.74 ? generateAutomaticOfflineSensors(seed) : [];
  }

  const fullWireColumn = Array.from({ length: WIRE_COUNT }, (_, col) => col)
    .find(col => previous.filter(sensor => sensor.col === col).length === SENSOR_COUNT);

  if (Number.isInteger(fullWireColumn) && randomFromSeed(8, fullWireColumn + 25, seed) > 0.18) {
    const fullWire = Array.from({ length: SENSOR_COUNT }, (_, row) => ({ row, col: fullWireColumn }));
    const partialSensors = previous
      .filter(sensor => sensor.col !== fullWireColumn)
      .filter((sensor, index) => randomFromSeed(index + 12, sensor.col + 27, seed) > 0.14);
    return normalizeOfflineSensors([...fullWire, ...partialSensors]);
  }

  const kept = previous.filter((sensor, index) => randomFromSeed(index + 2, sensor.col + 21, seed) > 0.14);
  const shouldAddFailure = randomFromSeed(4, 23, seed) > 0.9;
  const next = kept.length ? kept : previous.slice(0, Math.max(1, Math.ceil(previous.length * 0.55)));

  if (shouldAddFailure) {
    next.push(...generateAutomaticOfflineSensors(seed + 17).slice(0, 1));
  }

  return normalizeOfflineSensors(next);
}

function generateTrendMatrix(siloName, trend, offlineSensors = [], seed = Date.now()) {
  const latestLaunch = getLatestLaunch(siloName);
  const sourceMatrix = latestLaunch?.matrix || generateMatrix('Padrão');
  const fallbackMatrix = generateMatrix(latestLaunch?.status || 'Padrão', seed % 997);
  const direction = trend === 'decrease' ? -1 : 1;
  const baseDelta = trend === 'decrease' ? 1.4 : 1.5;

  const matrix = sourceMatrix.map((line, row) => line.map((value, col) => {
    const sourceValue = latestUsableValue(sourceMatrix, row, col, fallbackMatrix);
    const layerFactor = row * 0.08;
    const cableFactor = col * 0.03;
    const variation = randomFromSeed(row, col, seed) * 0.18;
    return clampTemperature(sourceValue + direction * (baseDelta + layerFactor + cableFactor + variation));
  }));

  return applyOfflineSensors(matrix, offlineSensors);
}

function createTrendLaunch(siloName, trend, date) {
  const seed = Date.now();
  const offlineSensors = generateAutomaticOfflineSensors(seed);
  const matrix = generateTrendMatrix(siloName, trend, offlineSensors, seed);

  return {
    date,
    responsible: 'João Silva',
    status: statusFromMatrix(matrix, offlineSensors),
    trend: trendLabels[trend],
    silo: siloName,
    offlineSensors,
    matrix,
  };
}

function createAutomaticTermometriaLaunch(siloName, date, seed = Date.now()) {
  const latestLaunch = getLatestLaunch(siloName);
  const trend = randomFromSeed(6, 17, seed) > 0.5 ? 'increase' : 'decrease';
  const offlineSensors = generatePersistentOfflineSensors(latestLaunch?.offlineSensors, seed);
  const matrix = generateTrendMatrix(siloName, trend, offlineSensors, seed);

  return {
    date,
    responsible: 'Sistema automático',
    status: statusFromMatrix(matrix, offlineSensors),
    trend: trendLabels[trend],
    silo: siloName,
    offlineSensors,
    matrix,
  };
}


function getTermometriaSimulationKey() {
  return `termometriaSimulationDay_${currentUnit || 'default'}`;
}

function getNextTermometriaSimulationDate() {
  const storage = getLocalStorage();
  const key = getTermometriaSimulationKey();
  const fallback = new Date();

  if (!storage) return fallback;

  const currentValue = Number(storage.getItem(key) || 0);
  const nextValue = currentValue + 1;
  storage.setItem(key, String(nextValue));

  const base = new Date();
  base.setDate(base.getDate() + nextValue - 1);
  base.setHours(8, 30, 0, 0);
  return base;
}


function getLaunchDateInputValue(dateLabel) {
  const parsed = parseLaunchDateTime(dateLabel);
  if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) return '';
  return getDateInputValue(parsed);
}

function isLaunchInsideHistoryChartPeriod(launch) {
  const value = getLaunchDateInputValue(launch.date);
  if (!value) return true;
  if (selectedHistoryChartStartDate && value < selectedHistoryChartStartDate) return false;
  if (selectedHistoryChartEndDate && value > selectedHistoryChartEndDate) return false;
  return true;
}

function sortLaunchesOldestToNewest(launches = []) {
  return [...launches].sort((a, b) => {
    const aDate = parseLaunchDateTime(a.date);
    const bDate = parseLaunchDateTime(b.date);
    return aDate - bDate;
  });
}

function parseLaunchDateTime(value) {
  const match = String(value || '').match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s*-\s*(\d{2}):(\d{2}))?/);
  if (!match) return new Date(0);
  const [, day, month, year, hour = '0', minute = '0'] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
}


function refreshTermometriaData() {
  if (currentPage === 'termometria' && pageUnitFilters.termometria && currentUnit !== pageUnitFilters.termometria) {
    changeUnit(pageUnitFilters.termometria);
  }

  const simulatedDate = getNextTermometriaSimulationDate();
  const nowLabel = formatDateTime(simulatedDate);

  siloConfigs.forEach((silo, index) => {
    const launch = createAutomaticTermometriaLaunch(silo.name, nowLabel, simulatedDate.getTime() + index * 37);
    launchesBySilo[silo.name] = [launch, ...getSiloLaunches(silo.name)].slice(0, 120);
    syncSiloConfigFromLatest(silo.name);
  });

  selectedLaunchIndex = 0;
  if (!selectedHistorySilo || !siloConfigs.some(silo => silo.name === selectedHistorySilo)) {
    selectedHistorySilo = siloConfigs[0]?.name;
  }
  currentHistoryMatrix = getLatestLaunch(selectedHistorySilo)?.matrix || generateMatrix('Padrão');
  const lastUpdate = document.getElementById('last-update-termometria');
  if (lastUpdate) lastUpdate.textContent = nowLabel;

  saveLocalDb();
  updateScreenUnitControls();
  renderTermometria();
  renderHistory();
  renderNotifications();
  renderDashboard();
}

function syncSiloConfigFromLatest(siloName) {
  const silo = siloConfigs.find(item => item.name === siloName);
  const latestLaunch = getLatestLaunch(siloName);
  if (!silo || !latestLaunch) return;

  const avg = average(latestLaunch.matrix);
  silo.avg = avg;
  silo.status = statusFromMatrix(latestLaunch.matrix, latestLaunch.offlineSensors);
}

function openSiloHistory(siloName) {
  if (!launchesBySilo[siloName]) return;

  selectedHistorySilo = siloName;
  setCurrentHistoryLaunch(0);
  document.getElementById('history-silo-select').value = siloName;
  renderHistory();
  setPage('history');
}

function renderTermometria() {
  const grid = document.getElementById('silo-grid');
  grid.innerHTML = '';

  siloConfigs.forEach(silo => {
    const latestLaunch = getLatestLaunch(silo.name);
    const matrix = latestLaunch.matrix;
    const max = extrema(matrix, 'max');
    const maxValue = Number(max.value);
    const finalStatus = statusFromMatrix(matrix, latestLaunch.offlineSensors);
    const card = document.createElement('article');
    card.className = 'silo-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Abrir historico do ${silo.name}`);
    card.innerHTML = `
      <header class="silo-card-header">
        <div>
          <h2>${silo.name}</h2>
          <p>${WIRE_COUNT} cabos de termometria</p>
        </div>
        <button class="kebab">⋮</button>
      </header>
      <div class="silo-visual">
        <div class="silo-drawing">
          <div class="silo-roof"></div>
          <div class="levels">
            ${Array.from({ length: SENSOR_COUNT }, (_, i) => `<span>Nível ${i + 1}${i === 0 ? '<small>(Topo)</small>' : i === SENSOR_COUNT - 1 ? '<small>(Base)</small>' : ''}</span>`).join('')}
          </div>
          <div class="cable-labels">${Array.from({ length: WIRE_COUNT }, (_, i) => `<span>${i + 1}</span>`).join('')}</div>
          <div class="sensor-grid">
            ${Array.from({ length: WIRE_COUNT }, (_, col) => `
              <div class="cable-column">
                ${Array.from({ length: SENSOR_COUNT }, (_, row) => {
                  const value = matrix[row][col];
                  const cls = statusClassByValue(value);
                  return `<span class="sensor ${cls}"><i></i>${formatSensorValue(value)}</span>`;
                }).join('')}
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      <footer class="silo-card-footer">
        <article>
          <small>Temperatura mais alta</small>
          <strong class="avg-value ${statusClassByValue(maxValue)}">${formatExtremaTemperature(max)}</strong>
        </article>
        <article>
          <small>Ponto de atenção</small>
          <strong class="badge ${badgeClass(finalStatus)}">${finalStatus}</strong>
        </article>
      </footer>
    `;
    card.addEventListener('click', () => openSiloHistory(silo.name));
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openSiloHistory(silo.name);
      }
    });
    grid.appendChild(card);
  });
}

function renderAeration() {
  const grid = document.getElementById('aeration-grid');
  if (!grid) return;

  const filteredItems = getFilteredAerationItems();
  const runningMotors = filteredItems
    .filter(item => item.status === 'Ligada')
    .reduce((sum, item) => sum + item.motorCount, 0);
  const totalHours = filteredItems.reduce((sum, item) => sum + item.monthlyHours, 0);
  const averageTemperature = filteredItems.length
    ? filteredItems.reduce((sum, item) => sum + item.temperature, 0) / filteredItems.length
    : 0;

  document.getElementById('aeration-silos-total').textContent = filteredItems.length;
  document.getElementById('aeration-motors-running').textContent = runningMotors;
  document.getElementById('aeration-hours-total').textContent = `${totalHours} h`;
  document.getElementById('aeration-temp-average').textContent = filteredItems.length ? formatAerationTemperature(averageTemperature) : '--';
  document.getElementById('last-update-aeration').textContent = lastAerationUpdate;

  if (!filteredItems.length) {
    grid.innerHTML = '<div class="aeration-empty">Nenhum registro salvo para esse filtro.</div>';
    return;
  }

  grid.innerHTML = filteredItems.map(item => {
    const statusClass = aerationStatusClass(item.status);
    const tempClass = aerationTemperatureClass(item.temperature);

    return `
      <article class="aeration-card ${statusClass}">
        <header class="aeration-card-header">
          <span class="aeration-silo-mark" aria-hidden="true">
            <svg viewBox="0 0 48 48">
              <path d="M13 20h22v21H13V20Z"/>
              <path d="M9 20 24 9l15 11v3H9v-3Z"/>
              <path d="M16 27h16M16 33h16M16 39h16"/>
            </svg>
          </span>
          <h2>${item.name}</h2>
          <span class="aeration-status-pill ${statusClass}"><i></i>${aerationStatusLabel(item)}</span>
        </header>

        <dl class="aeration-readings">
          <div><dt>Horas ligadas no mês</dt><dd>${item.monthlyHours} h</dd></div>
          <div><dt>Último ligamento</dt><dd>${item.lastStart}</dd></div>
          <div><dt>Quantidade de motores</dt><dd>${item.motorCount}</dd></div>
          <div><dt>Temperatura ambiente</dt><dd class="${tempClass}">${formatAerationTemperature(item.temperature)}</dd></div>
        </dl>
      </article>
    `;
  }).join('');
}

function renderSamples() {
  const grid = document.getElementById('sample-grid');
  if (!grid) return;

  const launches = getFilteredSampleCards();
  const latest = getLatestSampleLaunch();
  const pointsTotal = launches[0]?.pointCount || latest?.pointCount || SAMPLE_COLLECTION_POINTS;

  document.getElementById('sample-silos-total').textContent = siloConfigs.length;
  document.getElementById('sample-last-launch').textContent = latest ? formatDateOnlyBR(latest.date) : '--';
  document.getElementById('sample-points-total').textContent = pointsTotal;

  if (!launches.length) {
    grid.innerHTML = '<div class="aeration-empty">Nenhum lançamento salvo para esse filtro.</div>';
    return;
  }

  grid.innerHTML = launches.map(launch => {
    const humidity = averageSampleValue(launch.points, 'humidity');
    const impurity = averageSampleValue(launch.points, 'impurity');
    const damaged = averageSampleValue(launch.points, 'damaged');

    return `
      <article class="sample-card" data-silo="${launch.silo}" role="button" tabindex="0" aria-label="Abrir histórico de amostras do ${launch.silo}">
        <header class="sample-card-header">
          <span class="aeration-silo-mark" aria-hidden="true">
            <svg viewBox="0 0 48 48">
              <path d="M13 20h22v21H13V20Z"/>
              <path d="M9 20 24 9l15 11v3H9v-3Z"/>
              <path d="M16 27h16M16 33h16M16 39h16"/>
            </svg>
          </span>
          <h2>${launch.silo}</h2>
        </header>

        <div class="sample-last-date">Último lançamento: <strong>${formatDateOnlyBR(launch.date)}</strong></div>

        <div class="sample-metrics">
          <article>
            <small>Umidade</small>
            <strong class="${sampleMetricClass('humidity', humidity)}">${formatPercent(humidity)}</strong>
          </article>
          <article>
            <small>Impureza</small>
            <strong class="${sampleMetricClass('impurity', impurity)}">${formatPercent(impurity)}</strong>
          </article>
          <article>
            <small>Avariado</small>
            <strong class="${sampleMetricClass('damaged', damaged)}">${formatPercent(damaged)}</strong>
          </article>
        </div>
      </article>
    `;
  }).join('');

  grid.querySelectorAll('.sample-card').forEach(card => {
    card.addEventListener('click', () => openSampleHistory(card.dataset.silo));
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openSampleHistory(card.dataset.silo);
      }
    });
  });
}

function renderLaunchList() {
  const list = document.getElementById('launch-list');
  list.innerHTML = '';
  getSiloLaunches(selectedHistorySilo).forEach((launch, index) => {
    const item = document.createElement('button');
    item.className = `launch-item ${index === selectedLaunchIndex ? 'active' : ''}`;
    const detail = launch.trend
      ? `Tendência: ${launch.trend} - ${offlineSummary(launch)}`
      : `Responsável: ${launch.responsible}`;
    item.innerHTML = `<strong>${launch.date}</strong><span>${detail}</span>`;
    item.addEventListener('click', () => {
      setCurrentHistoryLaunch(index);
      renderHistory();
    });
    list.appendChild(item);
  });
}

function renderHistoryTable(matrix) {
  const table = document.getElementById('history-table');
  const headers = Array.from({ length: WIRE_COUNT }, (_, i) => `<th>Cabo ${i + 1}</th>`).join('');
  const rows = matrix.map((line, row) => `
    <tr>
      <th>Sensor ${row + 1}</th>
      ${line.map(value => `<td><span class="${statusClassByValue(value)}">${formatSensorValue(value)}</span></td>`).join('')}
    </tr>
  `).join('');
  table.innerHTML = `<thead><tr><th></th>${headers}</tr></thead><tbody>${rows}</tbody>`;
}



function getTopHistorySensors(launches, limit = 5) {
  const bestBySensor = new Map();

  launches.forEach(launch => {
    launch.matrix.forEach((line, row) => {
      line.forEach((value, col) => {
        if (!Number.isFinite(value)) return;
        const key = `${row}:${col}`;
        const current = bestBySensor.get(key);

        if (!current || value > current.value) {
          bestBySensor.set(key, {
            row,
            col,
            value,
            label: `Sensor ${row + 1} - Cabo ${col + 1}`,
          });
        }
      });
    });
  });

  return [...bestBySensor.values()]
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function getDailyAverageForSensor(launches, row, col) {
  const grouped = sortLaunchesOldestToNewest(launches).reduce((acc, launch) => {
    const value = launch.matrix?.[row]?.[col];
    if (!Number.isFinite(value)) return acc;

    const day = formatDateOnlyFromLaunchLabel(launch.date);
    if (!acc[day]) acc[day] = { date: day, values: [] };
    acc[day].values.push(value);
    return acc;
  }, {});

  return Object.values(grouped)
    .map(item => {
      const value = Number((item.values.reduce((sum, temp) => sum + temp, 0) / item.values.length).toFixed(1));
      return {
        date: item.date,
        value,
        status: statusFromTemperature(value),
      };
    })
    .sort((a, b) => parseLaunchDateTime(a.date) - parseLaunchDateTime(b.date));
}

function getDailyAverageForCable(launches, cableIndex) {
  const grouped = sortLaunchesOldestToNewest(launches).reduce((acc, launch) => {
    const values = launch.matrix
      .map(line => line[cableIndex])
      .filter(Number.isFinite);

    if (!values.length) return acc;

    const day = formatDateOnlyFromLaunchLabel(launch.date);
    if (!acc[day]) acc[day] = { date: day, values: [], status: 'Padrão' };

    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    const status = statusFromTemperature(Math.max(...values));

    acc[day].values.push(avg);
    if (historyStatusSeverity(status) > historyStatusSeverity(acc[day].status)) {
      acc[day].status = status;
    }

    return acc;
  }, {});

  return Object.values(grouped)
    .map(item => ({
      date: item.date,
      value: Number((item.values.reduce((sum, value) => sum + value, 0) / item.values.length).toFixed(1)),
      status: item.status,
    }))
    .sort((a, b) => parseLaunchDateTime(a.date) - parseLaunchDateTime(b.date));
}

function buildHistoryLineSeries(launches) {
  const selectedCable = selectedHistoryChartCable || 'all';
  const selectedSensor = selectedHistoryChartSensor || 'all';

  // Cabo e sensor específicos: mostra uma única linha desse ponto exato.
  if (selectedCable !== 'all' && selectedSensor !== 'all') {
    const cableIndex = Number(selectedCable);
    const sensorIndex = Number(selectedSensor);

    return [{
      label: `Sensor ${sensorIndex + 1} - Cabo ${cableIndex + 1}`,
      items: getDailyAverageForSensor(launches, sensorIndex, cableIndex),
      className: 'series-cable',
    }];
  }

  // Cabo específico, sem sensor: mostra a média diária do cabo.
  if (selectedCable !== 'all' && selectedSensor === 'all') {
    const cableIndex = Number(selectedCable);

    return [{
      label: `Cabo ${cableIndex + 1}`,
      items: getDailyAverageForCable(launches, cableIndex),
      className: 'series-cable',
    }];
  }

  // Sensor específico, todos os cabos: mostra o sensor escolhido em todos os cabos.
  if (selectedCable === 'all' && selectedSensor !== 'all') {
    const sensorIndex = Number(selectedSensor);

    return Array.from({ length: WIRE_COUNT }, (_, cableIndex) => ({
      label: `Sensor ${sensorIndex + 1} - Cabo ${cableIndex + 1}`,
      items: getDailyAverageForSensor(launches, sensorIndex, cableIndex),
      className: `series-${cableIndex + 1}`,
    }));
  }

  // Sem cabo e sem sensor: mantém Top 5 sensores com maiores temperaturas.
  return getTopHistorySensors(launches, 5).map((sensor, index) => ({
    label: sensor.label,
    items: getDailyAverageForSensor(launches, sensor.row, sensor.col),
    className: `series-${index + 1}`,
  }));
}

function renderHistoryChartSiloSelect() {
  const select = document.getElementById('history-chart-silo-select');
  if (!select) return;

  const currentValue = selectedHistoryChartSilo || selectedHistorySilo || siloConfigs[0]?.name;
  select.innerHTML = siloConfigs.map(silo => `
    <option value="${silo.name}">${silo.name}</option>
  `).join('');

  selectedHistoryChartSilo = siloConfigs.some(silo => silo.name === currentValue)
    ? currentValue
    : siloConfigs[0]?.name;

  select.value = selectedHistoryChartSilo;
}


function getMonthDateRangeFromLaunches(launches = []) {
  const ordered = sortLaunchesOldestToNewest(launches);
  const reference = ordered[0]?.date ? parseLaunchDateTime(ordered[0].date) : new Date();

  const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 0);

  return {
    start: getDateInputValue(start),
    end: getDateInputValue(end),
  };
}

function ensureDefaultHistoryChartPeriod(launches = []) {
  const range = getMonthDateRangeFromLaunches(launches);
  if (!selectedHistoryChartStartDate) selectedHistoryChartStartDate = range.start;
  if (!selectedHistoryChartEndDate) selectedHistoryChartEndDate = range.end;
}



function getHistoryChartSubtitle() {
  const selectedCable = selectedHistoryChartCable || 'all';
  const selectedSensor = selectedHistoryChartSensor || 'all';

  if (selectedCable !== 'all' && selectedSensor !== 'all') {
    return `Sensor ${Number(selectedSensor) + 1} do Cabo ${Number(selectedCable) + 1}`;
  }

  if (selectedCable !== 'all') {
    return `Cabo ${Number(selectedCable) + 1}`;
  }

  if (selectedSensor !== 'all') {
    return `Sensor ${Number(selectedSensor) + 1} em todos os cabos`;
  }

  return 'Top 5 sensores com maiores temperaturas';
}

function renderHistoryEvolutionChart() {
  const chart = document.getElementById('history-evolution-chart');
  if (!chart) return;

  renderHistoryChartSiloSelect();

  const chartSilo = selectedHistoryChartSilo || selectedHistorySilo;
  const allLaunches = getSiloLaunches(chartSilo);
  ensureDefaultHistoryChartPeriod(allLaunches);

  const cableSelect = document.getElementById('history-chart-cable-select');
  const sensorSelect = document.getElementById('history-chart-sensor-select');
  const startInput = document.getElementById('history-chart-start-date');
  const endInput = document.getElementById('history-chart-end-date');

  if (cableSelect) cableSelect.value = selectedHistoryChartCable || 'all';
  if (sensorSelect) sensorSelect.value = selectedHistoryChartSensor || 'all';
  if (startInput) startInput.value = selectedHistoryChartStartDate || '';
  if (endInput) endInput.value = selectedHistoryChartEndDate || '';

  const launches = allLaunches.filter(isLaunchInsideHistoryChartPeriod);

  if (!launches.length) {
    chart.innerHTML = '<div class="history-chart-empty">Nenhum lançamento disponível para o período selecionado.</div>';
    return;
  }

  const series = buildHistoryLineSeries(launches).filter(item => item.items.length);

  if (!series.length) {
    chart.innerHTML = '<div class="history-chart-empty">Nenhum dado disponível para o filtro selecionado.</div>';
    return;
  }

  const allItems = series.flatMap(item => item.items);
  const allDates = [...new Set(allItems.map(item => item.date))]
    .sort((a, b) => parseLaunchDateTime(a) - parseLaunchDateTime(b));

  const width = 920;
  const height = 320;
  const padding = { top: 28, right: 32, bottom: 64, left: 58 };

  // Escala dinâmica: menor valor - 2°C e maior valor + 2°C.
  const rawMin = Math.min(...allItems.map(item => item.value));
  const rawMax = Math.max(...allItems.map(item => item.value));
  const minValue = Math.floor(rawMin - 2);
  const maxValue = Math.ceil(rawMax + 2);
  const range = Math.max(1, maxValue - minValue);

  const x = date => {
    const index = allDates.indexOf(date);
    if (allDates.length === 1) return width / 2;
    return padding.left + (index * (width - padding.left - padding.right)) / (allDates.length - 1);
  };

  const y = value => {
    const clamped = Math.max(minValue, Math.min(maxValue, value));
    return padding.top + ((maxValue - clamped) * (height - padding.top - padding.bottom)) / range;
  };

  const scaleStep = Math.max(1, Math.ceil(range / 4));
  const scaleValues = [];
  for (let value = minValue; value <= maxValue; value += scaleStep) {
    scaleValues.push(value);
  }
  if (!scaleValues.includes(maxValue)) scaleValues.push(maxValue);

  const scaleLines = scaleValues.map(value => {
    const lineY = y(value);
    return `
      <line class="history-scale-line" x1="${padding.left}" y1="${lineY}" x2="${width - padding.right}" y2="${lineY}" />
      <text class="history-scale-label" x="${padding.left - 10}" y="${lineY + 4}">${value}°C</text>
    `;
  }).join('');

  const thresholdValues = [thresholds.normalMax, thresholds.attentionMax]
    .filter(value => value >= minValue && value <= maxValue);

  const gridLines = thresholdValues.map(value => {
    const lineY = y(value);
    const cls = value === thresholds.normalMax ? 'attention-line' : 'critical-line';
    const label = value === thresholds.normalMax ? 'Atenção 27°C' : 'Crítico 30°C';
    return `
      <line class="history-threshold ${cls}" x1="${padding.left}" y1="${lineY}" x2="${width - padding.right}" y2="${lineY}" />
      <text class="history-threshold-label" x="${width - padding.right - 94}" y="${lineY - 6}">${label}</text>
    `;
  }).join('');

  const paths = series.map((serie, index) => {
    const points = serie.items
      .filter(item => allDates.includes(item.date))
      .map(item => ({ ...item, x: x(item.date), y: y(item.value) }));

    const polyline = points.map(point => `${point.x},${point.y}`).join(' ');

    return `
      <polyline class="history-line-path ${serie.className}" points="${polyline}" />
      ${points.map(point => `
        <g class="history-line-point">
          <circle class="${statusClassByName(point.status)}" cx="${point.x}" cy="${point.y}" r="${series.length > 1 ? 5 : 7}" />
          <text class="history-point-value ${series.length > 1 ? 'compact' : ''}" x="${point.x}" y="${point.y - 10}">${point.value.toFixed(1)}°C</text>
        </g>
      `).join('')}
    `;
  }).join('');

  chart.innerHTML = `
    <div class="history-line-chart-title">
      <strong>${chartSilo}</strong>
      <span>${getHistoryChartSubtitle()} | Escala ${minValue}°C a ${maxValue}°C</span>
    </div>

    <div class="history-series-legend">
      ${series.map(serie => `<span class="${serie.className}"><i></i>${serie.label}</span>`).join('')}
    </div>

    <svg class="history-line-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico de linha da evolução diária do silo">
      ${scaleLines}
      <line class="history-axis" x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" />
      <line class="history-axis" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" />
      ${gridLines}
      ${paths}
      ${allDates.map(date => `
        <text class="history-point-date" x="${x(date)}" y="${height - padding.bottom + 24}">${date.slice(0, 5)}</text>
      `).join('')}
    </svg>
  `;
}

function renderHistory() {
  const selectedLaunch = setCurrentHistoryLaunch(selectedLaunchIndex);
  if (!selectedLaunch) return;

  const max = extrema(currentHistoryMatrix, 'max');
  const min = extrema(currentHistoryMatrix, 'min');
  const status = statusFromMatrix(currentHistoryMatrix, selectedLaunch.offlineSensors);
  const offCount = offlineSensorCount(selectedLaunch);

  document.getElementById('history-silo-select').value = selectedHistorySilo;
  document.getElementById('selected-launch-label').textContent = selectedLaunch.date;
  document.getElementById('history-offline-sensors').textContent = offCount;
  document.getElementById('history-last-launch').textContent = selectedLaunch.date;
  document.getElementById('summary-offline-sensors').textContent = offCount;
  document.getElementById('summary-max').textContent = formatExtremaTemperature(max);
  document.getElementById('summary-min').textContent = formatExtremaTemperature(min);
  document.getElementById('summary-max-location').textContent = max.location;
  document.getElementById('summary-min-location').textContent = min.location;
  const statusEl = document.getElementById('summary-status');
  statusEl.textContent = status;
  statusEl.className = `badge ${badgeClass(status)}`;

  renderHistoryTable(currentHistoryMatrix);
  renderLaunchList();
  renderHistoryEvolutionChart();
}

function updatePrimaryAction(page) {
  const button = document.getElementById('open-launch-modal');
  if (!button) return;

  if (page === 'dashboard') {
    button.innerHTML = 'Nova ação <strong>＋</strong>';
    button.setAttribute('aria-label', 'Criar nova ação para supervisor');
    return;
  }

  if (page === 'termometria') {
    button.innerHTML = 'Atualizar <strong>↻</strong>';
    button.setAttribute('aria-label', 'Atualizar termometria');
    return;
  }

  if (page === 'aeracao') {
    button.innerHTML = 'Atualizar <strong>↻</strong>';
    button.setAttribute('aria-label', 'Atualizar dados de aeração');
    return;
  }

  if (page === 'samples') {
    button.innerHTML = 'Atualizar <strong>↻</strong>';
    button.setAttribute('aria-label', 'Atualizar mapa de amostras');
    return;
  }

  button.innerHTML = 'Lançar <strong>＋</strong>';
  button.setAttribute('aria-label', 'Lançar leitura de termometria');
}

function setPage(page) {
  const title = document.getElementById('page-title');
  const navItems = document.querySelectorAll('.nav-item[data-page]');
  const titles = {
    dashboard: 'Dashboard Operacional',
    termometria: 'Termometria de Silos',
    aeracao: 'Aeração de Silos',
    samples: 'Mapa de Amostras',
    history: 'Histórico de Lançamentos',
  };

  currentPage = page;

  if (page !== 'dashboard' && pageUnitFilters[page] && currentUnit !== pageUnitFilters[page]) {
    changeUnit(pageUnitFilters[page]);
  }

  document.querySelectorAll('.page').forEach(section => {
    section.classList.remove('page-active');
  });

  const targetPage = document.getElementById(`${page}-page`);
  if (targetPage) targetPage.classList.add('page-active');

  if (title) title.textContent = titles[page] || titles.dashboard;
  updatePrimaryAction(page);
  updateScreenUnitControls();

  if (page === 'dashboard') renderDashboard();
  if (page === 'termometria') renderTermometria();
  if (page === 'aeracao') renderAeration();
  if (page === 'samples') renderSamples();
  if (page === 'history') renderHistory();

  navItems.forEach(item => item.classList.toggle('active', item.dataset.page === page));
}

function notificationClassByStatus(status) {
  if (status === 'Crítico') return 'notification-critical';
  if (status === 'Atenção') return 'notification-attention';
  return 'notification-info';
}

function notificationIconByStatus(status, hasOfflineSensors) {
  if (hasOfflineSensors) return '!';
  if (status === 'Crítico') return '!';
  if (status === 'Atenção') return '△';
  return 'i';
}

function buildNotifications() {
  return siloConfigs.map(silo => {
    const latestLaunch = getLatestLaunch(silo.name);
    const status = statusFromMatrix(latestLaunch.matrix, latestLaunch.offlineSensors);
    const max = extrema(latestLaunch.matrix, 'max');
    const offCount = offlineSensorCount(latestLaunch);
    const hasOfflineSensors = offCount > 0;

    return {
      silo: silo.name,
      status,
      className: notificationClassByStatus(hasOfflineSensors ? 'Atenção' : status),
      icon: notificationIconByStatus(status, hasOfflineSensors),
      title: hasOfflineSensors ? `${silo.name} - Sensor OFF` : `${silo.name} - ${status}`,
      detail: hasOfflineSensors ? offlineSummary(latestLaunch) : `Maior temperatura: ${formatExtremaTemperature(max)}`,
      time: latestLaunch.date,
      visible: hasOfflineSensors || status !== 'Padrão',
    };
  }).filter(notification => notification.visible);
}

function renderNotifications() {
  const list = document.querySelector('.notification-list');
  const count = document.querySelector('.notification-count');
  if (!list) return;

  const notifications = buildNotifications();
  count.textContent = notifications.length;
  count.classList.toggle('is-hidden', notifications.length === 0);

  if (!notifications.length) {
    list.innerHTML = `
      <div class="notification-empty">
        <strong>Nenhum alerta</strong>
        <small>Todos os silos estão sem ocorrências no momento.</small>
      </div>
    `;
    return;
  }

  list.innerHTML = notifications.map(notification => `
    <button class="notification-item ${notification.className}" data-silo="${notification.silo}">
      <span class="notification-icon">${notification.icon}</span>
      <span class="notification-content">
        <strong>${notification.title}</strong>
        <small>${notification.detail}</small>
      </span>
      <em>${notification.time}</em>
    </button>
  `).join('');
}

function openModal() {
  document.getElementById('modal-backdrop').hidden = false;
}

function closeModal() {
  document.getElementById('modal-backdrop').hidden = true;
}

function setupModal() {
  document.getElementById('open-launch-modal').addEventListener('click', () => {
    if (currentPage === 'termometria') {
      refreshTermometriaData();
      return;
    }

    if (currentPage === 'aeracao') {
      refreshAerationData();
      return;
    }

    if (currentPage === 'samples') {
      refreshSampleData();
      return;
    }

    if (currentPage === 'dashboard') {
      openActionModal();
      return;
    }

    openModal();
  });
  document.getElementById('close-modal').addEventListener('click', closeModal);
  document.getElementById('cancel-launch').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', event => {
    if (event.target.id === 'modal-backdrop') closeModal();
  });

  document.querySelectorAll('.trend-option').forEach(button => {
    button.addEventListener('click', () => {
      selectedTrend = button.dataset.trend;
      document.querySelectorAll('.trend-option').forEach(option => option.classList.remove('selected'));
      button.classList.add('selected');
    });
  });

  document.getElementById('create-launch').addEventListener('click', () => {
    const siloName = document.getElementById('modal-silo').value;
    const nowLabel = formatDateTime(new Date());

    const launch = createTrendLaunch(siloName, selectedTrend, nowLabel);
    launchesBySilo[siloName] = [launch, ...getSiloLaunches(siloName)];
    syncSiloConfigFromLatest(siloName);
    selectedHistorySilo = siloName;
    selectedLaunchIndex = 0;
    currentHistoryMatrix = launch.matrix;

    closeModal();
    saveLocalDb();
    renderTermometria();
    renderNotifications();
    document.getElementById('last-update-termometria').textContent = nowLabel;
    document.getElementById('history-silo-select').value = siloName;
    renderHistory();
    setPage('history');
  });
}

function setupNavigation() {
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', event => {
      event.preventDefault();
      const page = item.dataset.page;
      if (page) setPage(page);
    });
  });
}



function setupHistoryChartSiloSelect() {
  document.addEventListener('change', event => {
    if (event.target?.id === 'history-chart-silo-select') {
      selectedHistoryChartSilo = event.target.value;
      const range = getMonthDateRangeFromLaunches(getSiloLaunches(selectedHistoryChartSilo));
      selectedHistoryChartStartDate = range.start;
      selectedHistoryChartEndDate = range.end;
      renderHistoryEvolutionChart();
    }

    if (event.target?.id === 'history-chart-cable-select') {
      selectedHistoryChartCable = event.target.value;
      renderHistoryEvolutionChart();
    }

    if (event.target?.id === 'history-chart-sensor-select') {
      selectedHistoryChartSensor = event.target.value;
      renderHistoryEvolutionChart();
    }

    if (event.target?.id === 'history-chart-start-date') {
      selectedHistoryChartStartDate = event.target.value;
      renderHistoryEvolutionChart();
    }

    if (event.target?.id === 'history-chart-end-date') {
      selectedHistoryChartEndDate = event.target.value;
      renderHistoryEvolutionChart();
    }
  });
}

function setupHistorySiloSelect() {
  const select = document.getElementById('history-silo-select');
  const periodInput = document.getElementById('history-period-filter');

  populateSiloSelect(select, false);
  if (select) select.value = selectedHistorySilo;

  select?.addEventListener('change', () => {
    selectedHistorySilo = select.value;
    selectedHistoryChartSilo = select.value;
    selectedLaunchIndex = 0;
    openSiloHistory(select.value);
  });

  periodInput?.addEventListener('change', () => {
    renderHistory();
  });
}

function setupAerationFilters() {
  const siloSelect = document.getElementById('aeration-silo-filter');
  const periodInput = document.getElementById('aeration-period-filter');
  const clearButton = document.getElementById('clear-aeration-filter');

  if (siloSelect) siloSelect.value = aerationFilters.silo;
  if (periodInput) periodInput.value = aerationFilters.period;

  siloSelect?.addEventListener('change', () => {
    aerationFilters.silo = siloSelect.value;
    renderAeration();
  });

  periodInput?.addEventListener('change', () => {
    aerationFilters.period = periodInput.value;
    renderAeration();
  });

  clearButton?.addEventListener('click', () => {
    aerationFilters = {
      silo: 'all',
      period: getLatestAerationPeriod(aerationHistory),
    };
    if (siloSelect) siloSelect.value = aerationFilters.silo;
    if (periodInput) periodInput.value = aerationFilters.period;
    renderAeration();
  });
}

function setupSampleFilters() {
  const siloSelect = document.getElementById('sample-silo-filter');
  const periodInput = document.getElementById('sample-period-filter');
  const clearButton = document.getElementById('clear-sample-filter');

  if (siloSelect) siloSelect.value = sampleFilters.silo;
  if (periodInput) periodInput.value = sampleFilters.period;

  siloSelect?.addEventListener('change', () => {
    sampleFilters.silo = siloSelect.value;
    renderSamples();
  });

  periodInput?.addEventListener('change', () => {
    sampleFilters.period = periodInput.value;
    renderSamples();
  });

  clearButton?.addEventListener('click', () => {
    sampleFilters = {
      silo: 'all',
      period: getLatestSamplePeriod(sampleLaunchesBySilo),
    };
    if (siloSelect) siloSelect.value = sampleFilters.silo;
    if (periodInput) periodInput.value = sampleFilters.period;
    renderSamples();
  });
}

function setupSampleModal() {
  const backdrop = document.getElementById('sample-modal-backdrop');
  const closeButton = document.getElementById('close-sample-modal');

  closeButton?.addEventListener('click', closeSampleModal);
  backdrop?.addEventListener('click', event => {
    if (event.target.id === 'sample-modal-backdrop') closeSampleModal();
  });
}



function setupActionModal() {
  const backdrop = document.getElementById('action-modal-backdrop');
  const closeButton = document.getElementById('close-action-modal');
  const cancelButton = document.getElementById('cancel-action');
  const createButton = document.getElementById('create-action');
  const unitSelect = document.getElementById('action-unit');

  closeButton?.addEventListener('click', closeActionModal);
  cancelButton?.addEventListener('click', closeActionModal);
  backdrop?.addEventListener('click', event => {
    if (event.target.id === 'action-modal-backdrop') closeActionModal();
  });

  unitSelect?.addEventListener('change', () => {
    populateActionSiloOptions(unitSelect.value);
  });

  createButton?.addEventListener('click', createSupervisorAction);
}

function setupNotifications() {
  const toggle = document.getElementById('notifications-toggle');
  const panel = document.getElementById('notifications-panel');
  const count = document.querySelector('.notification-count');
  const markRead = document.getElementById('mark-notifications-read');
  const viewAll = document.getElementById('view-all-notifications');
  const list = document.querySelector('.notification-list');

  if (!toggle || !panel) return;

  function closeNotifications() {
    panel.hidden = true;
    toggle.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  function openNotifications() {
    panel.hidden = false;
    toggle.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
  }

  toggle.addEventListener('click', event => {
    event.stopPropagation();
    if (panel.hidden) openNotifications();
    else closeNotifications();
  });

  panel.addEventListener('click', event => event.stopPropagation());

  document.addEventListener('click', closeNotifications);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeNotifications();
  });

  markRead?.addEventListener('click', () => {
    count?.classList.add('is-hidden');
    closeNotifications();
  });

  list?.addEventListener('click', event => {
    const item = event.target.closest('.notification-item');
    if (item) {
      closeNotifications();
      openSiloHistory(item.dataset.silo);
    }
  });

  viewAll?.addEventListener('click', () => {
    closeNotifications();
    setPage('history');
  });
}


function getUnitOptionLabel(unitKey) {
  const unit = unitConfigs[unitKey];
  if (!unit) return unitKey;
  return `${unit.name} (${unit.silos.length} ${unit.silos.length === 1 ? 'silo' : 'silos'})`;
}

function updateUnitFilterLabels() {
  document.querySelectorAll('select.screen-unit-filter, #action-unit').forEach(select => {
    [...select.options].forEach(option => {
      if (unitConfigs[option.value]) option.textContent = getUnitOptionLabel(option.value);
    });
  });

  document.querySelectorAll('#dashboard-unit-filter input[type="checkbox"]').forEach(input => {
    const label = input.closest('label');
    if (!label || input.value === 'all') return;
    const textNode = [...label.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.textContent = ` ${getUnitOptionLabel(input.value)}`;
  });
}

function populateSiloSelect(select, includeAll = false) {
  if (!select) return;

  const currentValue = select.value;
  select.innerHTML = `${includeAll ? '<option value="all">Todos os silos</option>' : ''}${
    siloConfigs.map(silo => `<option value="${silo.name}">${silo.name}</option>`).join('')
  }`;

  const values = [...select.options].map(option => option.value);
  select.value = values.includes(currentValue) ? currentValue : (includeAll ? 'all' : siloConfigs[0]?.name);
}

function updateScreenUnitControls() {
  updateUnitFilterLabels();
  document.querySelectorAll('.screen-unit-filter').forEach(select => {
    const screen = select.dataset.screen;
    if (screen && pageUnitFilters[screen]) select.value = pageUnitFilters[screen];
  });

  const termPeriod = document.getElementById('termometria-period-filter');
  const historyPeriod = document.getElementById('history-period-filter');

  if (termPeriod && !termPeriod.value) termPeriod.value = getMonthInputValue(new Date());
  if (historyPeriod && !historyPeriod.value) historyPeriod.value = getLatestAerationPeriod(aerationHistory);

  populateSiloSelect(document.getElementById('aeration-silo-filter'), true);
  populateSiloSelect(document.getElementById('sample-silo-filter'), true);
  populateSiloSelect(document.getElementById('history-silo-select'), false);
}

function applyUnitForScreen(screen) {
  const unitKey = pageUnitFilters[screen] || currentUnit || 'lobato';
  changeUnit(unitKey);
  updateScreenUnitControls();
}


function setupDashboardFilters() {
  const unitFilter = document.getElementById('dashboard-unit-filter');
  const startInput = document.getElementById('dashboard-period-start');
  const endInput = document.getElementById('dashboard-period-end');
  const clearButton = document.getElementById('dashboard-clear-filters');

  if (!unitFilter) return;

  function syncCheckboxes() {
    const inputs = [...unitFilter.querySelectorAll('input[type="checkbox"]')];
    const allInput = inputs.find(input => input.value === 'all');
    const unitInputs = inputs.filter(input => input.value !== 'all');

    if (dashboardFilters.units.includes('all')) {
      allInput.checked = true;
      unitInputs.forEach(input => { input.checked = false; });
      return;
    }

    allInput.checked = false;
    unitInputs.forEach(input => {
      input.checked = dashboardFilters.units.includes(input.value);
    });
  }

  function updateFromInputs(changedInput = null) {
    const inputs = [...unitFilter.querySelectorAll('input[type="checkbox"]')];
    const allInput = inputs.find(input => input.value === 'all');
    const unitInputs = inputs.filter(input => input.value !== 'all');

    if (changedInput?.value === 'all') {
      dashboardFilters.units = changedInput.checked ? ['all'] : ['all'];
      syncCheckboxes();
      renderDashboard();
      return;
    }

    allInput.checked = false;
    const selected = unitInputs.filter(input => input.checked).map(input => input.value);
    dashboardFilters.units = selected.length ? selected : ['all'];
    syncCheckboxes();
    renderDashboard();
  }

  syncCheckboxes();

  unitFilter.querySelectorAll('input[type="checkbox"]').forEach(input => {
    input.addEventListener('change', () => updateFromInputs(input));
  });

  startInput?.addEventListener('change', () => {
    dashboardFilters.startDate = startInput.value;
    renderDashboard();
  });

  endInput?.addEventListener('change', () => {
    dashboardFilters.endDate = endInput.value;
    renderDashboard();
  });

  clearButton?.addEventListener('click', () => {
    dashboardFilters = { units: ['all'], startDate: '', endDate: '' };
    if (startInput) startInput.value = '';
    if (endInput) endInput.value = '';
    syncCheckboxes();
    renderDashboard();
  });
}

function setupUnitFilter() {
  document.querySelectorAll('.screen-unit-filter').forEach(select => {
    const screen = select.dataset.screen;
    if (screen && pageUnitFilters[screen]) select.value = pageUnitFilters[screen];

    select.addEventListener('change', () => {
      if (!screen) return;
      pageUnitFilters[screen] = select.value;

      if (screen === 'aeracao') aerationFilters.silo = 'all';
      if (screen === 'samples') sampleFilters.silo = 'all';
      if (screen === 'history') {
        selectedHistorySilo = unitConfigs[select.value].silos[0].name;
        selectedHistoryChartSilo = selectedHistorySilo;
        selectedLaunchIndex = 0;
      }

      applyUnitForScreen(screen);
    });
  });
}

function init() {
  saveLocalDb();
  updateUnitFilterLabels();
  updatePrimaryAction(currentPage);
  updateScreenUnitControls();

  setupNavigation();
  setupHistorySiloSelect();
  setupHistoryChartSiloSelect();
  setupUnitFilter();
  setupDashboardFilters();
  setupAerationFilters();
  setupSampleFilters();
  setupModal();
  setupSampleModal();
  setupActionModal();
  setupNotifications();

  renderTermometria();
  renderAeration();
  renderSamples();
  renderHistory();
  renderDashboard();
  renderNotifications();
}

init();
