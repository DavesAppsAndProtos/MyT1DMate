/**
 * My T1D Mate — Profile Engine (Session 2)
 * Handles new fields: basal_insulin, ic_ratio_breakfast/lunch/evening/overnight
 * Warm profile readback. Not a form. A mate who remembers you.
 */

import { getProfile, setProfileField } from '../database/db';

const FIELD_LABELS = {
  name: 'your name',
  years_since_dx: 'how long you have had T1D',
  confidence_level: 'your confidence level',
  insulin_type: 'your bolus insulin',
  basal_insulin: 'your basal insulin',
  delivery_method: 'how you deliver insulin',
  cgm: 'your CGM',
  ic_ratio_breakfast: 'your breakfast ratio',
  ic_ratio_lunch: 'your lunch ratio',
  ic_ratio_evening: 'your evening meal ratio',
  ic_ratio_overnight: 'your overnight ratio',
  correction_factor: 'your correction factor',
  target_range: 'your target glucose range',
};

const DISPLAY_LABELS = {
  name: 'Name',
  years_since_dx: 'Time with T1D',
  confidence_level: 'Confidence',
  insulin_type: 'Bolus insulin',
  basal_insulin: 'Basal insulin',
  delivery_method: 'Delivery method',
  cgm: 'CGM',
  ic_ratio_breakfast: 'Breakfast ratio',
  ic_ratio_lunch: 'Lunch ratio',
  ic_ratio_evening: 'Evening meal ratio',
  ic_ratio_overnight: 'Overnight ratio',
  correction_factor: 'Correction factor',
  target_range: 'Target range',
};

export const buildProfileReadResponse = async (requestedField = null) => {
  const profile = await getProfile();

  if (Object.keys(profile).length === 0) {
    return "I don't have anything stored yet. Have we done your setup? It only takes a minute.";
  }

  if (requestedField) {
    const value = profile[requestedField];
    const label = FIELD_LABELS[requestedField] || requestedField;
    if (!value) {
      return `I don't have ${label} stored yet. Want to tell me? I'll remember it.`;
    }
    return `I have ${label} stored as: ${value}`;
  }

  const lines = [`Here's what I know about you, ${profile.name || 'you'}:`];
  for (const [field, label] of Object.entries(DISPLAY_LABELS)) {
    const value = profile[field];
    if (value && field !== 'disclaimer_accepted') {
      lines.push(`• ${label}: ${value}`);
    }
  }
  lines.push('');
  lines.push('Want to update anything?');
  return lines.join('\n');
};

export const updateProfileField = async (field, newValue) => {
  await setProfileField(field, newValue);
  const label = FIELD_LABELS[field] || field.replace(/_/g, ' ');
  return `Got it — I have updated ${label} to: ${newValue}`;
};

export const detectFieldFromText = (text) => {
  const lower = text.toLowerCase();
  if (/breakfast ratio|morning ratio/.test(lower)) return 'ic_ratio_breakfast';
  if (/lunch ratio/.test(lower)) return 'ic_ratio_lunch';
  if (/evening ratio|dinner ratio/.test(lower)) return 'ic_ratio_evening';
  if (/overnight ratio|night ratio/.test(lower)) return 'ic_ratio_overnight';
  if (/ratio|ic ratio|carb ratio/.test(lower)) return 'ic_ratio_breakfast'; // default to breakfast
  if (/correction factor|sensitivity|cf/.test(lower)) return 'correction_factor';
  if (/target|range|glucose range/.test(lower)) return 'target_range';
  if (/basal/.test(lower)) return 'basal_insulin';
  if (/bolus|rapid|insulin type|novorapid|humalog|fiasp|lyumjev/.test(lower)) return 'insulin_type';
  if (/pump|injections|delivery/.test(lower)) return 'delivery_method';
  if (/cgm|libre|dexcom|sensor/.test(lower)) return 'cgm';
  if (/name/.test(lower)) return 'name';
  if (/diagnosed|diagnosis|years|how long/.test(lower)) return 'years_since_dx';
  if (/confident|confidence/.test(lower)) return 'confidence_level';
  return null;
};
