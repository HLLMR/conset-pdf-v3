/**
 * CSI MasterFormat divisions dataset
 * 
 * Explicit dataset for MasterFormat 2018 divisions 00-49.
 * Can be expanded later as needed.
 */

export const MASTERFORMAT_META = {
  version: '2018', // label only
  lastVerified: '2026-01-17',
} as const;

export const MASTERFORMAT_DIVISIONS: Record<string, { title: string }> = {
  "00": { title: "Procurement and Contracting Requirements" },
  "01": { title: "General Requirements" },
  "02": { title: "Existing Conditions" },
  "03": { title: "Concrete" },
  "04": { title: "Masonry" },
  "05": { title: "Metals" },
  "06": { title: "Wood, Plastics, and Composites" },
  "07": { title: "Thermal and Moisture Protection" },
  "08": { title: "Openings" },
  "09": { title: "Finishes" },
  "10": { title: "Specialties" },
  "11": { title: "Equipment" },
  "12": { title: "Furnishings" },
  "13": { title: "Special Construction" },
  "14": { title: "Conveying Equipment" },
  "21": { title: "Fire Suppression" },
  "22": { title: "Plumbing" },
  "23": { title: "Heating, Ventilating, and Air Conditioning (HVAC)" },
  "25": { title: "Integrated Automation" },
  "26": { title: "Electrical" },
  "27": { title: "Communications" },
  "28": { title: "Electronic Safety and Security" },
  "31": { title: "Earthwork" },
  "32": { title: "Exterior Improvements" },
  "33": { title: "Utilities" },
  "34": { title: "Transportation" },
  "35": { title: "Waterway and Marine Construction" },
  "40": { title: "Process Integration" },
  "41": { title: "Material Processing and Handling Equipment" },
  "42": { title: "Process Heating, Cooling, and Drying Equipment" },
  "43": { title: "Process Gas and Liquid Handling, Purification and Storage Equipment" },
  "44": { title: "Pollution and Waste Control Equipment" },
  "45": { title: "Industry-Specific Manufacturing Equipment" },
  "46": { title: "Water and Wastewater Equipment" },
  "48": { title: "Electrical Power Generation" },
  "49": { title: "Water and Wastewater Treatment Equipment" },
};
