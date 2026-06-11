/**
 * My T1D Mate — Insulin Calculation Engine (Session 2)
 * Time-based IC ratio: breakfast / lunch / evening / overnight
 * Language: "guide you on your dose" not "calculate your dose"
 * Always shows working. Always "You make the call."
 */

/**
 * Determine which IC ratio to use based on current device time.
 * Returns { field, label }
 */
export const getRatioFieldForNow = () => {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 11) return { field: 'ic_ratio_breakfast', label: 'breakfast' };
  if (hour >= 11 && hour < 17) return { field: 'ic_ratio_lunch', label: 'lunch' };
  if (hour >= 17 && hour < 22) return { field: 'ic_ratio_evening', label: 'evening meal' };
  return { field: 'ic_ratio_overnight', label: 'overnight' };
};

/**
 * Parse IC ratio from a string like "1:10", "1:8", "8", "10"
 * Returns numeric ratio (the denominator) or null.
 */
export const parseICRatio = (str) => {
  if (!str) return null;
  const colonMatch = str.match(/1:(\d+(\.\d+)?)/);
  if (colonMatch) return parseFloat(colonMatch[1]);
  const bareMatch = str.match(/^(\d+(\.\d+)?)$/);
  if (bareMatch) return parseFloat(bareMatch[1]);
  return null;
};

/**
 * Parse correction factor. e.g. "3", "1 unit drops me 3 mmol", "2.5"
 */
export const parseCorrectionFactor = (str) => {
  if (!str) return null;
  const match = str.match(/(\d+(\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
};

/**
 * Parse target glucose. e.g. "5-8 mmol/L" → midpoint 6.5, or "6" → 6
 */
export const parseTargetGlucose = (str) => {
  if (!str) return null;
  const rangeMatch = str.match(/(\d+(\.\d+)?)\s*[-–to]+\s*(\d+(\.\d+)?)/i);
  if (rangeMatch) {
    return (parseFloat(rangeMatch[1]) + parseFloat(rangeMatch[3])) / 2;
  }
  const single = str.match(/(\d+(\.\d+)?)/);
  return single ? parseFloat(single[1]) : null;
};

/**
 * Full dose response builder.
 * Uses correct ratio for time of day automatically.
 */
export const buildDoseResponse = ({ carbsG, foodName, currentGlucose, profile }) => {
  const { correction_factor, target_range } = profile;

  const { field: ratioField, label: mealLabel } = getRatioFieldForNow();
  const ratioStr = profile[ratioField];
  const ratio = parseICRatio(ratioStr);

  if (!ratio) {
    return `I don't have your ${mealLabel} ratio stored yet. What is it? I'll remember it for next time.`;
  }

  const lines = [];
  const carbsRounded = Math.round(carbsG * 10) / 10;
  const bolusUnits = Math.round((carbsRounded / ratio) * 10) / 10;

  lines.push(`Here's a starting point for your dose${foodName ? ` (${foodName})` : ''}:`);
  lines.push('');
  lines.push(`• Meal: ${bolusUnits} units`);
  lines.push(`  Using your ${mealLabel} ratio (1:${ratio})`);
  lines.push(`  Working: ${carbsRounded}g ÷ ${ratio} = ${bolusUnits} units`);

  let total = bolusUnits;

  if (currentGlucose) {
    const cf = parseCorrectionFactor(correction_factor);
    const target = parseTargetGlucose(target_range) || 6;

    if (!cf) {
      lines.push('');
      lines.push("I don't have your correction factor stored. What is it? I'll add it now.");
    } else {
      const diff = currentGlucose - target;
      if (diff > 0) {
        const correctionUnits = Math.round((diff / cf) * 10) / 10;
        total = Math.round((total + correctionUnits) * 10) / 10;
        lines.push('');
        lines.push(`• Correction: ${correctionUnits} units`);
        lines.push(`  Working: (${currentGlucose} - ${target}) ÷ ${cf} = ${correctionUnits} units`);
        lines.push('');
        lines.push(`Total starting point: ${total} units`);
      } else {
        lines.push('');
        lines.push(`You're already at or below target (${target} mmol/L) — no correction needed.`);
        lines.push(`Total starting point: ${total} units`);
      }
    }
  } else {
    lines.push('');
    lines.push(`Total starting point: ${total} units`);
  }

  if (total > 10) {
    lines.push('');
    lines.push("⚠️ That's a bigger dose — worth double-checking your carb count before you go ahead.");
  }

  lines.push('');
  lines.push('You make the call. 💉');

  return lines.join('\n');
};
