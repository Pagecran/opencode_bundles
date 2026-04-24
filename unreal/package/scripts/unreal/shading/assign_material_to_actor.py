from opencode_unreal_bundle.materials import assign_material_to_actor


def main(args):
    return assign_material_to_actor(
        actor_name=args.get("actor_name", ""),
        material_path=args.get("material_path", ""),
        slot_name=args.get("slot_name"),
    )
