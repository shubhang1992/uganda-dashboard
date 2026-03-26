import { createContext, useContext, useReducer, useMemo } from 'react';

const DashboardContext = createContext();

const LEVELS = ['country', 'region', 'district', 'branch', 'agent', 'subscriber'];

const initialState = {
  level: 'country',
  selectedIds: {
    region: null,
    district: null,
    branch: null,
    agent: null,
    subscriber: null,
  },
};

function reducer(state, action) {
  switch (action.type) {
    case 'DRILL_DOWN': {
      const { level, id } = action;
      const newIds = { ...state.selectedIds };
      newIds[level] = id;
      // Clear all levels below
      const levelIdx = LEVELS.indexOf(level);
      for (let i = levelIdx + 1; i < LEVELS.length; i++) {
        newIds[LEVELS[i]] = null;
      }
      return { level, selectedIds: newIds };
    }
    case 'DRILL_UP': {
      const targetLevel = action.level;
      const newIds = { ...state.selectedIds };
      // Clear target level and everything below
      const levelIdx = LEVELS.indexOf(targetLevel);
      for (let i = levelIdx; i < LEVELS.length; i++) {
        newIds[LEVELS[i]] = null;
      }
      // Go one level up from target
      const newLevel = levelIdx > 0 ? LEVELS[levelIdx - 1] : 'country';
      return { level: newLevel, selectedIds: newIds };
    }
    case 'GO_TO_LEVEL': {
      const targetLevel = action.level;
      const newIds = { ...state.selectedIds };
      // Clear everything below target level
      const levelIdx = LEVELS.indexOf(targetLevel);
      for (let i = levelIdx + 1; i < LEVELS.length; i++) {
        newIds[LEVELS[i]] = null;
      }
      return { level: targetLevel, selectedIds: newIds };
    }
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

export function DashboardProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const actions = useMemo(() => ({
    drillDown: (level, id) => dispatch({ type: 'DRILL_DOWN', level, id }),
    drillUp: (level) => dispatch({ type: 'DRILL_UP', level }),
    goToLevel: (level) => dispatch({ type: 'GO_TO_LEVEL', level }),
    reset: () => dispatch({ type: 'RESET' }),
  }), []);

  return (
    <DashboardContext value={{ ...state, ...actions }}>
      {children}
    </DashboardContext>
  );
}

export function useDashboard() {
  return useContext(DashboardContext);
}
