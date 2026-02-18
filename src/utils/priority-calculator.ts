/**
 * Priority and Level Calculator for Custom Roles
 * 
 * Logic:
 * - Priority: "Safety Ceiling" + 1 Buffer (ensures new role is weaker than both creator and base)
 * - Level: Direct inheritance from base role (job grade stays the same)
 */

/**
 * Calculates defaults for a new custom role based on its parent.
 *
 * @param creator - The user creating the role (to check their authority)
 * @param baseRole - The system role being copied (the template)
 */
export function calculateNewRoleStats(
  creator: { role: { priority: number } }, 
  baseRole: { priority: number; level: number }
) {
  // 1. PRIORITY CALCULATION (Security)
  // Logic: "Safety Ceiling" + 1 Buffer.
  // The new role must be weaker (higher number) than both the Creator and the Base Role.
  const safetyCeiling = Math.max(creator.role.priority, baseRole.priority);
  const newPriority = safetyCeiling + 1;

  // 2. LEVEL CALCULATION (Job Grade)
  // Logic: Direct Inheritance.
  // A custom "Senior Dev" is the same grade as a standard "Senior".
  const newLevel = baseRole.level;

  return {
    priority: newPriority,
    level: newLevel
  };
}
