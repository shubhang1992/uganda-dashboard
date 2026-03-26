import { memo } from 'react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboard } from '../../contexts/DashboardContext';
import { DISTRICTS, BRANCHES, getChildEntities, getEntityById } from '../../data/mockData';
import styles from './UgandaMap.module.css';

const EASE = [0.16, 1, 0.3, 1];
const GEO_URL = '/uganda-topo.json';
const NEXT_LEVEL = { country: 'region', region: 'district', district: 'branch', branch: 'agent' };

const ZOOM_CONFIGS = {
  country: { center: [32.3, 1.4], zoom: 4500 },
};

const REGION_ZOOM = {
  'r-central': { center: [32.5, 0.35], zoom: 14000 },
  'r-eastern': { center: [33.7, 1.2], zoom: 10000 },
  'r-northern': { center: [32.0, 2.7], zoom: 8000 },
  'r-western': { center: [30.3, -0.2], zoom: 10000 },
};

function getStatusColor(rate) {
  if (rate >= 75) return 'var(--color-status-good)';
  if (rate >= 50) return 'var(--color-status-warning)';
  return 'var(--color-status-poor)';
}

function MapDot({ coordinates, name, activeRate, size, onClick }) {
  const color = getStatusColor(activeRate);
  return (
    <Marker coordinates={coordinates}>
      <motion.g
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        onClick={onClick}
        style={{ cursor: onClick ? 'pointer' : 'default' }}
      >
        <motion.circle
          r={size * 2.5}
          fill={color}
          opacity={0.15}
          animate={{ r: [size * 2, size * 3, size * 2], opacity: [0.15, 0.08, 0.15] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
        <circle r={size} fill={color} opacity={0.9} />
        <circle r={size * 0.4} fill="white" opacity={0.6} />
      </motion.g>
      <text textAnchor="middle" y={-size - 6} className={styles.dotLabel}>
        {name}
      </text>
    </Marker>
  );
}

function UgandaMap() {
  const { level, selectedIds, drillDown } = useDashboard();
  const nextLevel = NEXT_LEVEL[level];

  // Compute child entities to show as dots
  const parentId = level === 'country' ? 'ug' : selectedIds[level];
  const children = nextLevel ? getChildEntities(level, parentId) : [];

  // Compute map center and zoom
  let mapConfig = ZOOM_CONFIGS.country;
  if (level === 'region' && selectedIds.region) {
    mapConfig = REGION_ZOOM[selectedIds.region] || ZOOM_CONFIGS.country;
  } else if (level === 'district' && selectedIds.district) {
    const district = DISTRICTS[selectedIds.district];
    if (district) mapConfig = { center: district.center, zoom: 20000 };
  } else if (level === 'branch' && selectedIds.branch) {
    const branch = BRANCHES[selectedIds.branch];
    if (branch) mapConfig = { center: branch.center, zoom: 40000 };
  } else if (level === 'agent' && selectedIds.agent) {
    const agent = getEntityById('agent', selectedIds.agent);
    if (agent?.center) mapConfig = { center: agent.center, zoom: 50000 };
  }

  return (
    <div className={styles.mapContainer}>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{
          center: mapConfig.center,
          scale: mapConfig.zoom,
        }}
        className={styles.map}
        width={800}
        height={600}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                className={styles.geography}
                style={{
                  default: { outline: 'none' },
                  hover: { outline: 'none', fill: 'rgba(41, 40, 103, 0.12)' },
                  pressed: { outline: 'none' },
                }}
              />
            ))
          }
        </Geographies>

        <AnimatePresence>
          {children.map((child) => (
            <MapDot
              key={child.id}
              coordinates={child.center}
              name={child.name}
              activeRate={child.metrics?.activeRate || 80}
              size={level === 'country' ? 6 : level === 'region' ? 5 : 4}
              onClick={nextLevel ? () => drillDown(nextLevel, child.id) : undefined}
            />
          ))}
        </AnimatePresence>
      </ComposableMap>
    </div>
  );
}

export default memo(UgandaMap);
