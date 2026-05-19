from opencode_unreal_bundle.editor import list_editor_windows_result


def main(args):
    return list_editor_windows_result(
        window_title_contains=args.get("window_title_contains"),
        include_hidden=args.get("include_hidden"),
    )
