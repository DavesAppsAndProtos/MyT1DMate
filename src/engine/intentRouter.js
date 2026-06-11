/**
 * My T1D Mate — Intent Router (Session 3)
 *
 * Changes from Session 2:
 * - Preamble stripping before intent classification (Bug 1 fix)
 * - Short noun phrase → FOOD intent (Bug 2 fix)
 * - UNKNOWN intent: two flavours
 *     · General: leads with "I'm not sure about that one"
 *     · Earlier-conversation reference: warm stateless explanation
 */

import { lookupFood, carbsForPortion } from './carbLookup';
import { buildDoseResponse } from './insulinCalc';
import {
  buildProfileReadResponse,
  updateProfileField,
  detectFieldFromText,
} from './profileEngine';
import { getProfile, setProfileField } from '../database/db';

// ── Preamble stripping ────────────────────────────────────
// Strip conversational filler before intent detection.
// If nothing meaningful remains, return null.

const PREAMBLE_WORDS = [
  'not right now',
  'ignore that',
  'forget it',
  'nevermind',
  'never mind',
  'actually',
  'cheers',
  'thanks',
  'thank you',
  'also',
  'and',
  'ok',
  'okay',
];

const stripPreamble = (text) => {
  let t = text.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const word of PREAMBLE_WORDS) {
      const re = new RegExp(`^${word}[,\\.!\\s]*`, 'i');
      const stripped = t.replace(re, '').trim();
      if (stripped !== t) {
        t = stripped;
        changed = true;
      }
    }
  }
  return t.length > 0 ? t : null;
};

// ── Intent classifiers ────────────────────────────────────

const FOOD_PATTERNS = [
  /\bcarbs?\s*in\b/i,
  /\bhow many carbs\b/i,
  /\bwhat are the carbs\b/i,
  /\bwhat'?s\s*in\b/i,
  /\blook up\b/i,
  /\bsearch for\b/i,
  /\bfood\b.*\bcarbs?\b/i,
  /\bnutrition(al)?\b/i,
  /\bhow many carbs does\b/i,
  /\bhow many carbs for\b/i,
];

const DOSE_PATTERNS = [
  /\bhow much insulin\b/i,
  /\bwhat'?s my dose\b/i,
  /\bguide.*dose\b/i,
  /\bdose for\b/i,
  /\bbolus\b/i,
  /\binsulin for\b/i,
  /\bi'?m having\b/i,
  /\b\d+\s*g(rams?)?\s*(of\b|carbs?\b)/i,
  /\bstarting point\b/i,
];

const PROFILE_READ_PATTERNS = [
  /\bwhat do you (already\s+)?know about me\b/i,
  /\btell me about me\b/i,
  /\bshow (me )?my (profile|details|info|settings|ratios?)\b/i,
  /\bdo you (know|remember|have) my\b/i,
  /\bwhat'?s my (ratio|correction|target|insulin|cgm|range|name|basal|pump|delivery)\b/i,
  /\bmy (ratio|correction factor|ic ratio|target|cgm|insulin type|basal)\b/i,
  /\bam i on a pump\b/i,
  /\bwhat (cgm|insulin) do i use\b/i,
];

const PROFILE_UPDATE_PATTERNS = [
  /\bmy (ratio|correction|insulin|cgm|target|range|name|basal) (has changed|changed|is now|is)\b/i,
  /\bupdate my\b/i,
  /\bi'?ve? (switched|changed|updated)\b/i,
  /\bchange my\b/i,
  /\bset my\b/i,
  /\bnew (ratio|correction|insulin|cgm|target|basal)\b/i,
];

// Patterns that suggest the user is referring to an earlier conversation
const EARLIER_CONVO_PATTERNS = [
  /\bearlier\b/i,
  /\blike before\b/i,
  /\bsame as last time\b/i,
  /\bthe (red|blue|green|other|first|last|same) one i (asked|mentioned|said)\b/i,
  /\bi asked about\b/i,
  /\byou said\b/i,
  /\byou told me\b/i,
  /\bfrom (before|earlier|last time|our last)\b/i,
  /\blast time\b/i,
];

const matchesAny = (text, patterns) => patterns.some((p) => p.test(text));

// Short noun phrase heuristic: 1–4 words, no question words, no verbs
// → treat as FOOD search (e.g. "Mars bar", "banana", "tin of beans")
const isShortFoodNoun = (text) => {
  const words = text.trim().split(/\s+/);
  if (words.length < 1 || words.length > 4) return false;
  const questionWords = /^(what|how|when|where|why|who|is|are|do|does|can|could|should|will|would)$/i;
  if (questionWords.test(words[0])) return false;
  // Must not contain a verb-like word mid-phrase
  const verbWords = /^(have|had|need|want|tell|show|give|find|search|look|check)$/i;
  if (words.some((w) => verbWords.test(w))) return false;
  return true;
};

export const classifyIntent = (text) => {
  if (matchesAny(text, PROFILE_UPDATE_PATTERNS)) return 'PROFILE_UPDATE';
  if (matchesAny(text, PROFILE_READ_PATTERNS)) return 'PROFILE_READ';
  if (matchesAny(text, DOSE_PATTERNS)) return 'DOSE';
  if (matchesAny(text, FOOD_PATTERNS)) return 'FOOD';
  if (isShortFoodNoun(text)) return 'FOOD';  // Bug 2 fix: "Mars bar" → FOOD
  return 'UNKNOWN';
};

// ── Food query cleaner ────────────────────────────────────

const FOOD_STRIP_PATTERNS = [
  /^how many carbs (does\s+)?/i,
  /^how many carbs (are\s+)?in\s+(a\s+)?/i,
  /^what are the carbs in\s+(a\s+)?/i,
  /^what'?s in\s+(a\s+)?/i,
  /^carbs in\s+(a\s+)?/i,
  /^look up\s+/i,
  /^search for\s+/i,
  /^how many carbs for\s+/i,
  /\?$/,
];

const stripFoodQuery = (text) => {
  let q = text.trim();
  for (const p of FOOD_STRIP_PATTERNS) {
    q = q.replace(p, '');
  }
  return q.trim();
};

// ── Helpers ───────────────────────────────────────────────

const parseGrams = (text) => {
  const match = text.match(/(\d+(\.\d+)?)\s*g(rams?)?/i);
  return match ? parseFloat(match[1]) : null;
};

const parseGlucose = (text) => {
  const match = text.match(
    /(?:glucose|bg|blood sugar|current|i'?m at|reading)\s*(?:is\s*)?(\d+(\.\d+)?)/i
  );
  return match ? parseFloat(match[1]) : null;
};

const extractFoodFromDoseText = (text) => {
  const match = text.match(/\d+\s*g(?:rams?)?\s*(?:of\s+)?(.+)/i);
  return match ? match[1].trim() : null;
};

const extractUpdateValue = (text) => {
  const patterns = [
    /(?:is now|is|changed to|updated to|switched to|set to)\s+(.+)/i,
  ];
  for (const p of patterns) {
    const match = text.match(p);
    if (match) {
      const val = match[1].trim();
      if (val.length > 0 && !/^(my|the|a|an)$/i.test(val)) return val;
    }
  }
  return null;
};

// ── Unknown intent responses ──────────────────────────────

const UNKNOWN_GENERAL =
  "I'm not sure about that one — I'm just a calculator with a good memory.\n\nI can look up carbs, guide you on your dose, or tell you what I know about you.\n\nWhat do you need?";

const UNKNOWN_EARLIER_CONVO =
  "I don't have memory of our earlier chat — each conversation starts fresh for me.\n\nWhat was it? Tell me and I'll look it up now! 🔍";

// ── Main router ───────────────────────────────────────────

export const routeMessage = async (text, state = {}) => {
  // Bug 1 fix: strip preamble before routing
  const stripped = stripPreamble(text.trim());

  // Nothing meaningful left after stripping (e.g. "not right now" alone)
  if (!stripped) {
    return { response: 'No problem!', newState: state };
  }

  const trimmed = stripped;

  // State: awaiting portion size
  if (state.awaitingPortionFor) {
    const grams = parseGrams(trimmed);
    if (grams) {
      const { name, carbsPer100g } = state.awaitingPortionFor;
      const carbs = carbsForPortion(carbsPer100g, grams);
      return {
        response: `${grams}g of ${name} is about ${carbs}g of carbs.\n\nWant me to suggest a starting point for your dose? (Say yes, or tell me your current glucose too if you want a correction included.)`,
        newState: { awaitingDoseFor: { carbsG: carbs, foodName: name } },
      };
    }
    return {
      response: `Sorry, I didn't catch a number of grams there. How much ${state.awaitingPortionFor.name} are you having? (e.g. "60g")`,
      newState: state,
    };
  }

  // State: awaiting dose confirmation
  if (state.awaitingDoseFor) {
    const { carbsG, foodName } = state.awaitingDoseFor;
    const yesish = /\byes\b|\bsure\b|\byep\b|\byeah\b|\bgo\b|\bdose\b|\bguide\b|\bstarting point\b/i.test(trimmed);
    const glucose = parseGlucose(trimmed);
    if (yesish || glucose) {
      const profile = await getProfile();
      return {
        response: buildDoseResponse({ carbsG, foodName, currentGlucose: glucose, profile }),
        newState: {},
      };
    }
    return routeMessage(text, {});
  }

  // State: awaiting field update value
  if (state.awaitingFieldUpdate) {
    const { field, label } = state.awaitingFieldUpdate;
    await setProfileField(field, trimmed);
    return {
      response: `Got it — I have updated ${label} to: ${trimmed}`,
      newState: {},
    };
  }

  // ── Fresh classification ──────────────────────────────

  const intent = classifyIntent(trimmed);

  if (intent === 'FOOD') {
    const query = stripFoodQuery(trimmed);
    try {
      const result = await lookupFood(query);
      if (!result) {
        return {
          response: `I couldn't find "${query}" in the food database. Try a simpler name, or a brand name if it's a packaged product.`,
          newState: {},
        };
      }
      const { name, carbsPer100g, servingSize, servingCarbs } = result;
      let response = `${name} has about ${carbsPer100g}g of carbs per 100g.`;
      if (servingSize && servingCarbs) {
        response += `\nTypical serving (${servingSize}): ~${servingCarbs}g carbs.`;
      }
      response += `\n\nHow much are you having? (Tell me in grams and I'll work out the carbs.)`;
      return {
        response,
        newState: { awaitingPortionFor: { name, carbsPer100g } },
      };
    } catch {
      return {
        response: "I couldn't reach the food database right now. Check your connection and try again.",
        newState: {},
      };
    }
  }

  if (intent === 'DOSE') {
    const grams = parseGrams(trimmed);
    const glucose = parseGlucose(trimmed);
    const foodName = extractFoodFromDoseText(trimmed);
    if (grams) {
      const profile = await getProfile();
      return {
        response: buildDoseResponse({ carbsG: grams, foodName, currentGlucose: glucose, profile }),
        newState: {},
      };
    }
    return {
      response: 'How many grams of carbs are you having? I need a number in grams to guide you on your dose.',
      newState: {},
    };
  }

  if (intent === 'PROFILE_READ') {
    const field = detectFieldFromText(trimmed);
    return {
      response: await buildProfileReadResponse(field),
      newState: {},
    };
  }

  if (intent === 'PROFILE_UPDATE') {
    const field = detectFieldFromText(trimmed);
    if (!field) {
      return {
        response: 'What would you like to update? You can change your ratios, correction factor, insulin type, CGM, target range, and more.',
        newState: {},
      };
    }
    const inlineValue = extractUpdateValue(trimmed);
    if (inlineValue) {
      await setProfileField(field, inlineValue);
      const label = field.replace(/_/g, ' ');
      return {
        response: `Got it — I have updated ${label} to: ${inlineValue}`,
        newState: {},
      };
    }
    const label = field.replace(/_/g, ' ');
    return {
      response: `What's your new ${label}?`,
      newState: { awaitingFieldUpdate: { field, label } },
    };
  }

  // UNKNOWN — two flavours
  if (matchesAny(trimmed, EARLIER_CONVO_PATTERNS)) {
    return { response: UNKNOWN_EARLIER_CONVO, newState: {} };
  }
  return { response: UNKNOWN_GENERAL, newState: {} };
};
