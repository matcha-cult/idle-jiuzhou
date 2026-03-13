import { toNumber } from './db.js';
import type {
  SectBuildingRequirement,
  SectBuildingRow,
  SectBuildingView,
} from './types.js';

const FULLY_UPGRADED_MESSAGE = '建筑已满级';
const UPGRADE_CLOSED_MESSAGE = '暂未开放';
const BUILDING_MAX_LEVEL = 50;

const HALL_BUILDING_TYPE = 'hall';

export const calcHallUpgradeCost = (
  currentLevel: number,
): { funds: number; buildPoints: number } => {
  const nextLevel = currentLevel + 1;
  return {
    funds: Math.floor(1000 * 1.2 * nextLevel * nextLevel),
    buildPoints: Math.floor(10 * nextLevel),
  };
};

export const getBuildingUpgradeRequirement = (
  buildingType: string,
  currentLevel: number,
): SectBuildingRequirement => {
  if (buildingType !== HALL_BUILDING_TYPE) {
    return {
      upgradable: false,
      maxLevel: BUILDING_MAX_LEVEL,
      nextLevel: null,
      funds: null,
      buildPoints: null,
      reason: UPGRADE_CLOSED_MESSAGE,
    };
  }

  if (currentLevel >= BUILDING_MAX_LEVEL) {
    return {
      upgradable: false,
      maxLevel: BUILDING_MAX_LEVEL,
      nextLevel: null,
      funds: null,
      buildPoints: null,
      reason: FULLY_UPGRADED_MESSAGE,
    };
  }

  const cost = calcHallUpgradeCost(currentLevel);
  return {
    upgradable: true,
    maxLevel: BUILDING_MAX_LEVEL,
    nextLevel: currentLevel + 1,
    funds: cost.funds,
    buildPoints: cost.buildPoints,
    reason: null,
  };
};

export const withBuildingRequirement = (
  building: SectBuildingRow,
): SectBuildingView => {
  const level = toNumber(building.level);
  return {
    ...building,
    level,
    requirement: getBuildingUpgradeRequirement(building.building_type, level),
  };
};

export const buildingUpgradeConstants = {
  BUILDING_MAX_LEVEL,
  FULLY_UPGRADED_MESSAGE,
  HALL_BUILDING_TYPE,
  UPGRADE_CLOSED_MESSAGE,
};
