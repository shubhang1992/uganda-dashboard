import { memo, useState } from 'react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboard } from '../../contexts/DashboardContext';
import { DISTRICTS, BRANCHES, getChildEntities, getEntityById } from '../../data/mockData';
import styles from './UgandaMap.module.css';

const EASE = [0.16, 1, 0.3, 1];
const GEO_URL = '/uganda-topo.json';
const NEXT_LEVEL = { country: 'region', region: 'district', district: 'branch', branch: 'agent' };

// Subtle, muted region fills — like the reference dashboard
const REGION_FILLS = {
  Central: '#c8d4c8',
  Eastern: '#d9d4b8',
  Northern: '#c4c8d8',
  Western: '#d4c4c8',
};

const REGION_FILLS_HOVER = {
  Central: '#b0c4b0',
  Eastern: '#c8c4a0',
  Northern: '#b0b4c8',
  Western: '#c4b0b8',
};

const ZOOM_CONFIGS = {
  country: { center: [32.3, 1.4], zoom: 3800 },
};

const REGION_ZOOM = {
  'r-central': { center: [32.2, 0.2], zoom: 12000 },
  'r-eastern': { center: [33.8, 1.2], zoom: 9000 },
  'r-northern': { center: [32.3, 3.0], zoom: 6500 },
  'r-western': { center: [30.3, -0.2], zoom: 9000 },
};

function getStatusColor(rate) {
  if (rate >= 75) return '#2E8B57';
  if (rate >= 50) return '#E6A817';
  return '#DC3545';
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
        {/* Outer glow */}
        <motion.circle
          r={size * 3}
          fill={color}
          opacity={0.12}
          animate={{ r: [size * 2.5, size * 3.5, size * 2.5], opacity: [0.12, 0.06, 0.12] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Mid glow */}
        <circle r={size * 1.8} fill={color} opacity={0.2} />
        {/* Core */}
        <circle r={size} fill={color} opacity={0.85} />
        {/* Bright center */}
        <circle r={size * 0.35} fill="white" opacity={0.7} />
      </motion.g>
      <text textAnchor="middle" y={-size - 8} className={styles.dotLabel}>
        {name}
      </text>
    </Marker>
  );
}

function MapTooltip({ x, y, name, region }) {
  return (
    <div
      className={styles.tooltip}
      style={{ left: x, top: y }}
    >
      <span className={styles.tooltipName}>{name}</span>
      <span className={styles.tooltipRegion}>{region}</span>
    </div>
  );
}

function UgandaMap() {
  const { level, selectedIds, drillDown } = useDashboard();
  const [tooltip, setTooltip] = useState(null);
  const nextLevel = NEXT_LEVEL[level];

  const parentId = level === 'country' ? 'ug' : selectedIds[level];
  const children = nextLevel ? getChildEntities(level, parentId) : [];

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
        height={700}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const region = geo.properties?.region;
              const districtName = geo.properties?.name;
              const fillColor = REGION_FILLS[region] || '#ccd0dc';
              const hoverColor = REGION_FILLS_HOVER[region] || '#b8bcc8';

              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  className={styles.geography}
                  fill={fillColor}
                  style={{
                    default: { outline: 'none', fill: fillColor },
                    hover: { outline: 'none', fill: hoverColor, strokeWidth: 1 },
                    pressed: { outline: 'none', fill: hoverColor },
                  }}
                  onMouseEnter={(e) => {
                    setTooltip({
                      x: e.clientX,
                      y: e.clientY,
                      name: districtName,
                      region: region,
                    });
                  }}
                  onMouseMove={(e) => {
                    setTooltip((prev) =>
                      prev ? { ...prev, x: e.clientX, y: e.clientY } : null
                    );
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            })
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

      {/* Floating tooltip */}
      {tooltip && (
        <MapTooltip
          x={tooltip.x}
          y={tooltip.y}
          name={tooltip.name}
          region={tooltip.region}
        />
      )}
    </div>
  );
}

export default memo(UgandaMap);
