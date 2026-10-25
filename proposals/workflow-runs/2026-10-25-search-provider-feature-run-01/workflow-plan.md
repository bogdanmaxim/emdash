# Workflow run: 2026-10-25-search-provider-feature-run-01

## Scope
Search provider redesign completion tracking.

## Updated completion rule
If work is not completed or the full feature is not complete as defined, EVAL restarts the full workflow from **GOALS**.

## Main workflow
GOALS -> ANALYSIS -> DESIGN -> TEST PLAN -> IMPLEMENTATION -> TESTING -> RESULT REVIEW -> EVAL

## Sub-step workflow (for each main step)
goals -> goals review -> plan -> plan review -> work validation definition -> work validation review -> work -> work validation -> work validation result review -> step result review

## Limits
- Max failed main iterations: 5
- Max failures per main step (total): 3
- Max successful main iterations: 8
- Max failed sub-step iterations: 3
- Max successful sub-step iterations: 5

## EVAL policy
- Restart from GOALS if any required feature objective is incomplete.
- Restart from GOALS if any error exists.
- Mark complete only when all feature goals are fully satisfied and validated.
