from opencode_unreal_bundle.editor import editor_window_screenshot_result


def main(args):
    return editor_window_screenshot_result(
        max_size=args.get("max_size"),
        window_title_contains=args.get("window_title_contains"),
        include_hidden=args.get("include_hidden"),
    )
