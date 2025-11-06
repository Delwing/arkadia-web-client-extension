import { findClosestColor } from '@modules/core/Colors';

/**
 * Central color constants for Arkadia Web Client
 * All commonly used colors should be defined here to avoid duplication
 */

// ===== CURRENCY / COIN COLORS =====
export const MITHRIL_COLOR = findClosestColor('#afeeee');
export const GOLD_COLOR = findClosestColor('#ffd700');
export const SILVER_COLOR = findClosestColor('#dadada');
export const COPPER_COLOR = findClosestColor('#875f00');

// ===== MAGIC / SPELL COLORS =====
export const MAGICS_COLOR = findClosestColor('#d75f5f');
export const MAGIC_KEYS_COLOR = findClosestColor('#00ff87');

// ===== COMBAT COLORS =====
export const OWN_HIT_COLOR = findClosestColor('#2db92d');
export const DAMAGE_COLOR = findClosestColor('#ff9933');

// ===== ITEM EVALUATION COLORS =====
export const LABEL_COLOR = findClosestColor('#446fb1');
export const WEAPON_COLOR = findClosestColor('#ffff00');

// ===== UI HEADER COLORS =====
export const HEADER_COLOR = findClosestColor('#7cfc00'); // Lawn green - used for headers in various features

// ===== COMMON UI COLORS =====
export const HIGHLIGHT_COLOR = findClosestColor('#ffe066');
export const TYPE_COLOR = findClosestColor('#cfb530');
export const BAG_COLOR = findClosestColor('#87ceeb');
export const ORANGE_COLOR = findClosestColor('#ffa500');
export const YELLOW_COLOR = findClosestColor('#ffff00');
export const RED_COLOR = findClosestColor('#ff0000');
export const GREEN_COLOR = findClosestColor('#00ff00');
export const BLUE_COLOR = findClosestColor('#0000ff');

// ===== KNOWLEDGE / LEARNING COLORS =====
export const KNOWLEDGE_ENTRY_HIGHLIGHT_COLOR = findClosestColor('#ffe066');

// ===== BANK / DEPOSITS COLORS =====
export const BANK_NAME_COLOR = findClosestColor('#00ff00');
export const ITEM_NAME_COLOR = findClosestColor('#4cb2ff');

// ===== ESCAPE COLORS =====
export const ESCAPE_GREEN_COLOR = findClosestColor('#00ff00');
export const ESCAPE_RED_COLOR = findClosestColor('#ff0000');
export const ESCAPE_DARK_CYAN_COLOR = findClosestColor('#008b8b');
export const ESCAPE_LIGHT_CYAN_COLOR = findClosestColor('#e0ffff');

// ===== SKILL COLORS =====
export const SKILL_RED_COLOR = findClosestColor('#ff0000');
export const SKILL_YELLOW_COLOR = findClosestColor('#ffff00');
export const SKILL_BLUE_COLOR = findClosestColor('#0000ff');

// ===== KILL TRACKER COLORS =====
export const KILL_TRACKER_HEADER_COLOR = findClosestColor('#7cfc00');
export const KILL_TRACKER_LABEL_COLOR = findClosestColor('#87ceeb');
export const KILL_TRACKER_VALUE_COLOR = findClosestColor('#ffd700');

// ===== BAG MANAGER COLORS =====
export const BAG_MANAGER_HEADER_COLOR = findClosestColor('#7cfc00');
export const BAG_MANAGER_TYPE_COLOR = findClosestColor('#cfb530');
export const BAG_MANAGER_BAG_COLOR = findClosestColor('#87ceeb');
