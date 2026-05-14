---
name: pagecran-resolve-fusion
description: Work with DaVinci Resolve Studio projects and active or timeline-item Fusion compositions through the Pagecran Resolve bundle.
---

# Skill: pagecran-resolve-fusion

## When To Use

Use this skill when the user mentions DaVinci Resolve, Resolve Studio, Fusion Studio, Fusion node graphs, timelines, projects, or simple comp graph edits.

## Host Setup

The bundle talks to Blackmagic's external scripting API.

1. Start with `resolve_host_status` to check Python compatibility and installed host libraries.
2. Use `resolve_ping` to confirm which live host is reachable.
3. Use `host="resolve"` for Resolve project/timeline methods.
4. Use `host="auto"` or `host="fusion"` for active Fusion composition methods.
5. When you need a Fusion comp attached to a Resolve timeline item, pass `timeline_item_id`, `clip_id`, or `timeline_item={track_type, track_index, item_index}`; that path requires Resolve.

Treat `Fusion Render Node` as a distinct host class. It can matter for future render-node workflows, but it does not provide the interactive comp context needed by current Fusion graph methods.

On Windows, prefer Python 3.10 when the Blackmagic DLLs are unstable with newer Python builds.

## Preferred Flow

1. Call `resolve_host_status`.
2. Call `resolve_ping`.
3. For Resolve reads, use `resolve_get_project_info` and `resolve_list_timelines` before editing anything.
4. For Fusion graph work, inspect the current comp and tools before writes.
5. When the user means a Fusion comp on a specific clip in Resolve, use timeline-item scope instead of relying on the active Fusion page comp.
6. Prefer `resolve_probe_fusion_tool` before `resolve_set_fusion_inputs` when the input names are not obvious.

## Tools

- `resolve_host_status`
- `resolve_ping`
- `resolve_get_current_page`
- `resolve_list_projects`
- `resolve_get_project_info`
- `resolve_list_timelines`
- `resolve_get_fusion_comp`
- `resolve_list_fusion_tools`
- `resolve_probe_fusion_tool`
- `resolve_add_fusion_tool`
- `resolve_set_fusion_inputs`

## Guardrails

- Resolve project methods require Resolve Studio to be running.
- Fusion graph methods can target the active comp or a Resolve timeline-item Fusion comp.
- Prefer read methods before write methods.
- For writes, keep edits explicit and scoped to named tools.
