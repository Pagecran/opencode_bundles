---
name: pagecran-m365-files
description: |
  Work with Microsoft 365 cloud files stored in SharePoint or OneDrive through Microsoft Graph.

  Triggers when user mentions:
  - "SharePoint files"
  - "OneDrive file"
  - "document library"
  - "file version"
---

## Preferred tools

Use the comfortable tools first:

- `m365_list_document_libraries`
- `m365_list_drive_items`
- `m365_get_drive_item`
- `m365_list_file_versions`
- `m365_create_share_link`

Only fall back to `m365_graph_request` for edge cases not covered by the high-level tools.

If authentication is missing, use the `pagecran-m365-auth` skill first.

## Common flows

### List document libraries for a site

Call `m365_list_document_libraries` with one of:

- `site_id`
- `site_name`
- `site_url`
- `hostname` + `site_path`

### List files under a folder

Call `m365_list_drive_items` with:

- `drive_id` or `library_name`
- site reference fields when not using `drive_id`
- optional `item_id` or `item_path`
- optional `query` to filter the returned items

### Inspect a single file or folder

Call `m365_get_drive_item` with:

- `drive_id` or `library_name`
- `item_id` or `item_path`

### List versions

Call `m365_list_file_versions` with a file reference.

### Create a share link

Call `m365_create_share_link` with a file reference.

Optional:

- `link_type` (`view`, `edit`, `embed`)
- `scope` (`organization`, `anonymous`, `users`)
- `expiration_datetime`

## Graph fallback paths

### List drives for a site

```text
GET /sites/{site-id}/drives
```

### List root items in a drive

```text
GET /drives/{drive-id}/root/children
```

### Inspect an item

```text
GET /drives/{drive-id}/items/{item-id}
```

### List versions

```text
GET /drives/{drive-id}/items/{item-id}/versions
```

### Create a sharing link

```text
POST /drives/{drive-id}/items/{item-id}/createLink
```

### Upload a small file

```text
PUT /drives/{drive-id}/items/{parent-id}:/{filename}:/content
```

## Guardrails

- Confirm the target site, library or file before mutating content.
- Prefer read flows first when the user is exploring the tenant.
- Surface missing scopes explicitly, especially for write operations.
- Prefer `item_path` when the user knows the folder structure, and `item_id` when the path may change.
