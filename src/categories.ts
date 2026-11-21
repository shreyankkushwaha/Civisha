import { CategoryConfig, CategoryId } from './types';

export const CATEGORIES: Record<CategoryId, CategoryConfig> = {
  garbage: {
    id: "garbage",
    shortName: "Garbage",
    fullName: "Garbage & Sanitation",
    example: "Trash, overflowing bins, dumping"
  },
  roads: {
    id: "roads",
    shortName: "Roads",
    fullName: "Roads & Potholes",
    example: "Potholes, broken roads, damaged dividers"
  },
  infrastructure: {
    id: "infrastructure",
    shortName: "Infrastructure",
    fullName: "Infrastructure",
    example: "Issues with public toilets, parks, government buildings, schools, hospitals"
  },
  street_issues: {
    id: "street_issues",
    shortName: "Street Issues",
    fullName: "Street Issues",
    example: "Broken street lights, clogged drains, damaged footpaths"
  },
  safety: {
    id: "safety",
    shortName: "Safety",
    fullName: "Public Safety",
    example: "Unsafe areas, missing signs, hazard risks"
  }
};

export const CATEGORY_LIST = Object.values(CATEGORIES);
